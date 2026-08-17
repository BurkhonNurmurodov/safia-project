"""
HTTP client for the ARC service-ticket API (page /arc).

The API sits behind a username + password login that hands back a JWT; there
is no refresh endpoint anywhere, so an expired token simply means logging in
again. This module owns that whole story — token cache, expiry, the one
re-login on a 401 — so nothing above it ever sees a credential or a token.

Facts baked in from probing the API (not from documentation, there is none):

  * ``POST /base/api/v1/v2/login`` answers **404** «Invalid Credentials» to a
    wrong password (not 401), and 422 to a missing/short field;
  * ``GET /arc/api/v1/requests/factory`` is fastapi-pagination shaped
    ``{items,total,page,size,pages}``, ``page`` 1-based; a too-large ``size``
    is a 422, so the walk retries the same page with 50 and keeps it;
  * missing bearer → 401 «Not authenticated», bad bearer → 401 «Could not
    validate credentials» — both are "log in again", nothing else.

NEVER put the username, the password, a token or the Authorization header
into an exception message, a log line or the sync meta: the router copies
``str(exc)`` straight onto the page.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_LOGIN_PATH = "/base/api/v1/v2/login"
_REQUESTS_PATH = "/arc/api/v1/requests/factory"
_OPENAPI_PATH = "/arc/openapi.json"

# Generous read timeout: a 100-row page of tickets with photo URLs is a slow
# answer from that host. Connect is capped separately so an unreachable API
# fails fast instead of holding the sync thread for a minute.
_TIMEOUT = httpx.Timeout(60.0, connect=15.0)

# A token whose exp is unreadable is trusted for this long, then re-fetched.
_DEFAULT_TOKEN_TTL_S = 20 * 60
# Re-login this many seconds BEFORE the JWT's exp so a request never rides a
# token that dies in flight.
_EXP_MARGIN_S = 60

# The walk can never loop forever on a broken ``pages`` figure.
MAX_PAGES = 5000


class ArcError(Exception):
    """Any failure talking to ARC. Message is credential-free by construction."""


class ArcAuthError(ArcError):
    """The login itself was rejected (wrong or malformed credentials)."""


class ArcTransientError(ArcError):
    """Timeouts, 5xx and 429 — worth another pass later, not a config problem."""


def configured() -> bool:
    return bool(settings.arc_username and settings.arc_password)


# The four env names the credential can travel under (canonical first).
_CRED_NAMES = ("ARC_USERNAME", "ARC_PASSWORD", "USERNAME", "PASSWORD")
_KEY_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


def _scan_env_file(path: str) -> dict:
    """Read one dotenv file the way the diagnostic needs it: which KEY NAMES it
    defines, which of the credential names carry a non-empty value, and the
    line numbers of statements no parser would accept. Never a value."""
    out = {"path": path, "exists": os.path.isfile(path), "keys": [],
           "cred": {}, "bad_lines": [], "glued": [], "error": None}
    if not out["exists"]:
        return out
    try:
        with open(path, encoding="utf-8-sig", errors="replace") as fh:
            lines = fh.read().splitlines()
    except OSError as exc:
        out["error"] = type(exc).__name__
        return out
    keys: list[str] = []
    for no, line in enumerate(lines, 1):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        m = _KEY_RE.match(line)
        if not m:
            out["bad_lines"].append(no)
            continue
        key, raw = m.group(1), m.group(2).strip()
        keys.append(key)
        if key.upper() in _CRED_NAMES:
            val = raw.split(" #", 1)[0].strip().strip("'\"") if raw else ""
            out["cred"][key.upper()] = bool(val)
        # `echo "USERNAME=x" >> .env` onto a file whose last line had no
        # trailing newline glues the new key onto the previous VALUE
        # (`NOTION_TOKEN=abcUSERNAME=x`) — visible in an editor, invisible to
        # every parser. Report the host key, never the value.
        for name in _CRED_NAMES:
            if key.upper() != name and f"{name}=" in raw.upper():
                out["glued"].append({"key": key, "name": name})
    out["keys"] = sorted(set(keys))
    return out


def diagnostics() -> dict:
    """Why is the integration «not connected»? Everything the operator would
    otherwise need a shell for — the file the process reads, the credential
    NAMES it does or does not find (never values), sibling .env files that may
    have received the lines by mistake, and what pydantic finally resolved."""
    from app.config import _ENV_FILE
    env_file = os.path.abspath(_ENV_FILE)
    backend_dir = os.path.dirname(env_file)
    root = os.path.dirname(backend_dir)
    siblings = [
        os.path.join(root, ".env"),
        os.path.join(backend_dir, "app", ".env"),
        os.path.join(root, "bot", ".env"),
        os.path.join(root, "frontend", ".env"),
        os.path.join(root, "deploy", ".env"),
    ]
    other = []
    for p in siblings:
        if os.path.isfile(p):
            scan = _scan_env_file(p)
            other.append({"path": p, "cred": scan["cred"], "keys_count": len(scan["keys"])})
    return {
        "env_file": _scan_env_file(env_file),
        "other_env_files": other,
        "process_env": {n: bool((os.environ.get(n) or "").strip()) for n in _CRED_NAMES},
        "resolved": {"username": bool(settings.arc_username), "password": bool(settings.arc_password),
                     "api_url": _base()},
        "configured": configured(),
    }


def _base() -> str:
    return (settings.arc_api_url or "").rstrip("/")


# ── token cache ─────────────────────────────────────────────────────────────
# One cache per process: the sync thread is the only caller, but the lock keeps
# a hand-pressed Refresh and the interval job from logging in twice at once.
_token: dict[str, Any] = {"value": None, "expires": 0.0}
_token_lock = threading.Lock()


def _jwt_exp(token: str) -> Optional[float]:
    """The ``exp`` claim of a JWT, decoded WITHOUT verification — we only
    need to know when to log in again, and the API is the one verifying it."""
    try:
        parts = token.split(".")
        if len(parts) < 2:
            return None
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        data = json.loads(base64.urlsafe_b64decode(payload.encode()).decode())
        exp = data.get("exp")
        return float(exp) if exp else None
    except Exception:
        return None


def _login(client: httpx.Client) -> str:
    """POST the credentials, cache the token, return it. Raises ArcAuthError
    on a rejected login and ArcTransientError / ArcError otherwise."""
    url = _base() + _LOGIN_PATH
    log.debug("ARC login → %s", url)
    try:
        res = client.post(url, json={"username": settings.arc_username,
                                     "password": settings.arc_password},
                          timeout=_TIMEOUT)
    except httpx.TimeoutException as exc:
        raise ArcTransientError(f"ARC login timed out: {type(exc).__name__}") from None
    except httpx.HTTPError as exc:
        raise ArcTransientError(f"ARC login transport error: {type(exc).__name__}") from None

    if res.status_code in (404, 422):
        # 404 is what this API says to a wrong password; 422 to a malformed one.
        raise ArcAuthError("ARC login rejected the credentials")
    if res.status_code == 429 or res.status_code >= 500:
        raise ArcTransientError(f"ARC login answered {res.status_code}")
    if res.status_code != 200:
        raise ArcError(f"ARC login answered {res.status_code}")
    try:
        token = res.json().get("access_token")
    except Exception:
        token = None
    if not token:
        raise ArcError("ARC login answered 200 without an access_token")

    exp = _jwt_exp(token)
    expires = (exp - _EXP_MARGIN_S) if exp else (time.time() + _DEFAULT_TOKEN_TTL_S)
    with _token_lock:
        _token["value"] = token
        _token["expires"] = expires
    return token


def _get_token(client: httpx.Client, force: bool = False) -> str:
    with _token_lock:
        cached, expires = _token["value"], _token["expires"]
    if not force and cached and time.time() < expires:
        return cached
    return _login(client)


def _forget_token() -> None:
    with _token_lock:
        _token["value"] = None
        _token["expires"] = 0.0


# ── requests ────────────────────────────────────────────────────────────────

def _classify(res: httpx.Response, path: str) -> ArcError:
    """A non-2xx answer as the exception the caller should see. Body text is
    the API's own detail (never ours) — it carries no credential."""
    text = ""
    try:
        text = res.text or ""
    except Exception:
        pass
    msg = f"ARC {res.status_code} on {path}: {text[:300]}"
    if res.status_code == 429 or res.status_code >= 500:
        return ArcTransientError(msg)
    return ArcError(msg)


def get_json(client: httpx.Client, path: str, params: Optional[dict] = None,
             _retried: bool = False) -> Any:
    """GET ``path`` with the bearer token; on 401 log in again ONCE and retry.
    Returns the decoded JSON body. Raises the typed ArcError family."""
    token = _get_token(client)
    url = _base() + path
    log.debug("ARC GET %s params=%s", url, params or {})
    try:
        res = client.get(url, params=params or None, timeout=_TIMEOUT,
                         headers={"Authorization": f"Bearer {token}"})
    except httpx.TimeoutException as exc:
        raise ArcTransientError(f"ARC timed out on {path}: {type(exc).__name__}") from None
    except httpx.HTTPError as exc:
        raise ArcTransientError(f"ARC transport error on {path}: {type(exc).__name__}") from None

    if res.status_code == 401 and not _retried:
        # Expired or revoked server-side (exp said otherwise): forget it and
        # log in once more. A second 401 is reported as such, not looped.
        _forget_token()
        _get_token(client, force=True)
        return get_json(client, path, params, _retried=True)
    if not (200 <= res.status_code < 300):
        raise _classify(res, path)
    try:
        return res.json()
    except Exception:
        raise ArcError(f"ARC {res.status_code} on {path}: body is not JSON")


def iter_requests(client: httpx.Client, size: int = 100
                  ) -> Iterator[tuple[list[dict], int, int, int]]:
    """Walk the factory requests page by page, yielding
    ``(items, page, pages, total)``. A 422 on the size parameter (the API's
    cap is below what we asked) retries the SAME page with 50 and keeps 50
    for the rest of the walk. Stops when the last page is reached, the API
    returns nothing, or MAX_PAGES is hit."""
    page = 1
    while page <= MAX_PAGES:
        try:
            body = get_json(client, _REQUESTS_PATH, {"page": page, "size": size})
        except ArcError as exc:
            if size > 50 and " 422 " in str(exc):
                size = 50
                continue
            raise
        items = body.get("items") or []
        pages = int(body.get("pages") or 0)
        total = int(body.get("total") or 0)
        yield items, page, pages, total
        if not items or page >= pages:
            return
        page += 1


def fetch_openapi(client: httpx.Client) -> Optional[dict]:
    """The API's own openapi document — reference material for the admin
    /spec endpoint. Best-effort: any failure is a None, never an exception."""
    try:
        doc = get_json(client, _OPENAPI_PATH)
        return doc if isinstance(doc, dict) else None
    except Exception as exc:
        log.info("ARC openapi fetch skipped: %s", str(exc)[:200])
        return None


# ── normalisation ───────────────────────────────────────────────────────────

def parse_dt(value: Any) -> Optional[datetime]:
    """ISO timestamp → tz-aware datetime. The API writes a trailing ``Z``
    (UTC); a naive string is read as UTC too. Anything unparseable → None."""
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def _s(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _i(v: Any) -> Optional[int]:
    try:
        return int(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _f(v: Any) -> Optional[float]:
    try:
        return float(v) if v is not None and v != "" else None
    except (TypeError, ValueError):
        return None


def _b(v: Any) -> Optional[bool]:
    if v is None:
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ("1", "true", "yes"):
        return True
    if s in ("0", "false", "no", ""):
        return False
    return None


def normalize_item(item: dict) -> dict:
    """One API item → the ArcRequest column dict (``raw`` keeps the whole
    item). ``category`` is a nested object; ``is_urgent`` arrives as 0/1."""
    cat = item.get("category") or {}
    if not isinstance(cat, dict):
        cat = {}
    return {
        "remote_id": _s(item.get("id")),
        "request_num": _i(item.get("request_num")),
        "branch_id": _s(item.get("branch_id")),
        "branch_name": _s(item.get("branch_name")),
        "country_id": _s(item.get("country_id")),
        "description": _s(item.get("description")),
        "category_id": _s(cat.get("id")),
        "category_name": _s(cat.get("name")),
        "category_is_urgent": _b(cat.get("is_urgent")),
        "category_deadline_hours": _i(cat.get("deadline_hours")),
        "deadline": parse_dt(item.get("deadline")),
        "deadline_time": parse_dt(item.get("deadline_time")),
        "master_id": _s(item.get("master_id")),
        "master_name": _s(item.get("master_name")),
        "status": _i(item.get("status")),
        "normalized_status": _s(item.get("normalized_status")),
        "status_color": _s(item.get("status_color")),
        "is_overdue": _b(item.get("is_overdue")),
        "created_at": parse_dt(item.get("created_at")),
        "cancelled_at": parse_dt(item.get("cancelled_at")),
        "finished_at": parse_dt(item.get("finished_at")),
        "completed_at": parse_dt(item.get("completed_at")),
        "extra_phone": _s(item.get("extra_phone")),
        "latitude": _f(item.get("latitude")),
        "longitude": _f(item.get("longitude")),
        "deny_reason": _s(item.get("deny_reason")),
        "sended_to_sap": _b(item.get("sended_to_sap")),
        "photo_report": _s(item.get("photo_report")),
        "comment_report": _s(item.get("comment_report")),
        "document_url": _s(item.get("document_url")),
        "has_other_active": _b(item.get("has_other_active_branch_requests")),
        "other_active_count": _i(item.get("other_active_branch_requests_count")),
        "client_name": _s(item.get("client_name")),
        "raw": item,
    }
