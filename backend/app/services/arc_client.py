"""
HTTP client for IT's **internal** factory API (page /arc).

This replaced the old ARC login API wholesale on 2026-08-25. What changed, and
why the module is a third of its former size:

  * **one key, no session.** ``X-Internal-Key`` on every request. There is no
    login, no JWT, no expiry and therefore no token cache, no re-login on 401
    and no «what does our token claim» panel. A 401 means the key is wrong,
    missing, or unset on THEIR server — never «log in again».
  * **GET only.** The API exposes no write route at all; a non-GET is a 405.
  * **the parameters are documented**, so the filter-probing machinery
    (services/arc_discovery.py) is gone with it: every documented parameter
    NARROWS the answer, so sending none is already the widest possible walk.
  * **the list is thin.** ``/arc/factory/requests`` carries the ticket, its
    author, division, category and brigade — but NOT the description, the deny
    reason, the files or the status timeline. Those live on
    ``/arc/factory/requests/{id}``, one call each; see services/arc_sync.py for
    how the mirror fills them in without hammering the host.

Pagination is the same fastapi-pagination envelope as before —
``{items,total,page,size,pages}``, ``page`` 1-based, ``size`` capped at 100.

NEVER put the key into an exception message, a log line or the sync meta: the
router copies ``str(exc)`` straight onto the page.
"""
from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import httpx

from app.config import settings

log = logging.getLogger(__name__)

_PREFIX = "/api/internal"
_REQUESTS_PATH = "/arc/factory/requests"

# Generous read timeout: a 100-row page is a slow answer from that host.
# Connect is capped separately so an unreachable API fails fast instead of
# holding the sync thread for a minute.
_TIMEOUT = httpx.Timeout(60.0, connect=15.0)

# Page size we ask for. The API's declared ceiling is 100; a 422 on it drops
# the walk to 50 for the rest of the pass (see :func:`iter_requests`).
PAGE_SIZE = 100

# The walk can never loop forever on a broken ``pages`` figure.
MAX_PAGES = 5000

# The documented status codes of «АРС Фабрика». The API ships an integer and
# nothing else — no label, no colour — so the vocabulary lives in the client
# (here), the KPI semantics in the router and the words in the four locales.
ST_NEW = 0          # Создана
ST_IN_PROGRESS = 1  # В работе — started_at is stamped
ST_DONE = 3         # Завершена — the author is asked to rate it
ST_DENIED = 4       # Отклонена — deny_reason carries why, finished_at stamped
ST_HANDLED = 6      # Обработана, ждёт подтверждения автора, finished_at stamped

OPEN_STATUSES = (ST_NEW, ST_IN_PROGRESS)
DONE_STATUSES = (ST_DONE, ST_HANDLED)
CANCELLED_STATUSES = (ST_DENIED,)
KNOWN_STATUSES = (ST_NEW, ST_IN_PROGRESS, ST_DONE, ST_DENIED, ST_HANDLED)


class ArcError(Exception):
    """Any failure talking to the API. Message is key-free by construction."""


class ArcAuthError(ArcError):
    """401 — the internal key is missing, empty or not the one they hold."""


class ArcNotFound(ArcError):
    """404 — no such ticket, or it belongs to another section of their
    platform. The API deliberately cannot tell those two apart."""


class ArcTransientError(ArcError):
    """Timeouts, 5xx and 429 — worth another pass later, not a config problem."""


def configured() -> bool:
    return bool((settings.internal_api_key or "").strip())


def _base() -> str:
    return (settings.internal_api_url or "").rstrip("/") + _PREFIX


def file_url(path: Optional[str]) -> Optional[str]:
    """A ticket attachment's relative path («files/AgAC….jpg») as an absolute
    URL on their host. Returns None for a blank path and passes an already
    absolute one through untouched."""
    p = (path or "").strip()
    if not p:
        return None
    if p.startswith("http://") or p.startswith("https://"):
        return p
    return (settings.internal_api_url or "").rstrip("/") + "/" + p.lstrip("/")


# ── diagnostics ─────────────────────────────────────────────────────────────
# The platform has no shell, so «why does it say not connected?» has to be
# answerable from the page. Names and presence only — never a value.

_KEY_NAME = "INTERNAL_API_KEY"
_KEY_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")


def _scan_env_file(path: str) -> dict:
    """Which KEY NAMES one dotenv file defines, whether the internal key is
    among them with a non-empty value, and the line numbers no parser would
    accept. Never a value."""
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
        if key.upper() == _KEY_NAME:
            val = raw.split(" #", 1)[0].strip().strip("'\"") if raw else ""
            out["cred"][_KEY_NAME] = bool(val)
        # Appending a key onto a file whose last line had no trailing newline
        # glues it onto the previous VALUE (`NOTION_TOKEN=abcINTERNAL_API_KEY=x`)
        # — visible in an editor, invisible to every parser. Report the host
        # key, never the value.
        elif f"{_KEY_NAME}=" in raw.upper():
            out["glued"].append({"key": key, "name": _KEY_NAME})
    out["keys"] = sorted(set(keys))
    return out


def diagnostics() -> dict:
    """Why is the integration «not connected»? The file the process reads,
    whether it defines the key (never its value), sibling .env files that may
    have received the line by mistake, and what pydantic finally resolved."""
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
        "process_env": {_KEY_NAME: bool((os.environ.get(_KEY_NAME) or "").strip())},
        "resolved": {"key": configured(), "api_url": _base()},
        "configured": configured(),
    }


# ── requests ────────────────────────────────────────────────────────────────

def _classify(res: httpx.Response, path: str) -> ArcError:
    """A non-2xx answer as the exception the caller should see. Body text is
    the API's own ``detail`` (never ours) — it carries no key."""
    text = ""
    try:
        text = res.text or ""
    except Exception:
        pass
    msg = f"ARC {res.status_code} on {path}: {text[:300]}"
    if res.status_code == 401:
        return ArcAuthError("ARC rejected the internal key (401)")
    if res.status_code == 404:
        return ArcNotFound(msg)
    if res.status_code == 429 or res.status_code >= 500:
        return ArcTransientError(msg)
    return ArcError(msg)


def get_json(client: httpx.Client, path: str, params: Optional[dict] = None) -> Any:
    """GET ``path`` under the internal key. Returns the decoded JSON body,
    raises the typed ArcError family. No retry lives here: there is no session
    to renew, so every failure is either the caller's to retry (transient) or
    a configuration answer."""
    if not configured():
        raise ArcAuthError("No internal API key configured")
    url = _base() + path
    log.debug("ARC GET %s params=%s", url, params or {})
    try:
        res = client.get(url, params=params or None, timeout=_TIMEOUT,
                         headers={"X-Internal-Key": settings.internal_api_key})
    except httpx.TimeoutException as exc:
        raise ArcTransientError(f"ARC timed out on {path}: {type(exc).__name__}") from None
    except httpx.HTTPError as exc:
        raise ArcTransientError(f"ARC transport error on {path}: {type(exc).__name__}") from None

    if not (200 <= res.status_code < 300):
        raise _classify(res, path)
    try:
        return res.json()
    except Exception:
        raise ArcError(f"ARC {res.status_code} on {path}: body is not JSON")


def ping(client: httpx.Client) -> dict:
    """One cheap call (``size=1``) that says whether the key works and how many
    tickets the API is holding. Never raises — a failure is the answer."""
    try:
        body = get_json(client, _REQUESTS_PATH, {"page": 1, "size": 1})
    except ArcError as exc:
        return {"ok": False, "error": str(exc)[:300], "total": None}
    return {"ok": True, "total": int(body.get("total") or 0),
            "pages": int(body.get("pages") or 0),
            "sample": (body.get("items") or [None])[0]}


def iter_requests(client: httpx.Client, size: int = PAGE_SIZE,
                  ) -> Iterator[tuple[list[dict], int, int, int]]:
    """Walk «АРС Фабрика» page by page, newest first (the API's own order),
    yielding ``(items, page, pages, total)``.

    No filter parameters are sent, and that is deliberate: every documented
    parameter NARROWS the result, so the bare walk is already the widest one
    the key can perform. A 422 on ``size`` (their cap moved below ours) retries
    the SAME page at 50 and keeps 50 for the rest of the walk."""
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


def get_request(client: httpx.Client, request_id: Any) -> Optional[dict]:
    """One ticket's full card — the description, deny reason, files and status
    timeline the list does not carry. ``None`` when the API answers 404 (no
    such ticket, or one belonging to a section this key cannot see); every
    other failure raises, because «gone» and «broken» must not look alike."""
    try:
        body = get_json(client, f"{_REQUESTS_PATH}/{request_id}")
    except ArcNotFound:
        return None
    return body if isinstance(body, dict) else None


# ── normalisation ───────────────────────────────────────────────────────────

def parse_dt(value: Any) -> Optional[datetime]:
    """ISO timestamp → tz-aware datetime. This API writes a real offset
    («+05:00»), sometimes with a space instead of the T; a naive string is read
    as UTC. Anything unparseable → None."""
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


def _obj(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _person(v: Any) -> dict:
    """A user block → name + phone. ``full_name`` is what the API fills in;
    ``username`` and ``email`` are null on every row we have seen."""
    u = _obj(v)
    return {"id": _i(u.get("id")),
            "name": _s(u.get("full_name")) or _s(u.get("username")),
            "phone": _s(u.get("phone_number"))}


def _name_of(v: Any) -> Optional[str]:
    """A field that is a NAME on every row we have seen but is typed as an
    object in their schema (``user_manager``). Reading it with `str()` would
    put a whole dict repr into a table cell the day it arrives as one."""
    if isinstance(v, dict):
        return _s(v.get("full_name") or v.get("name") or v.get("username"))
    return _s(v)


def _files(item: dict) -> list[dict]:
    """The attachment list, absolute-URLed. The card ships them under ``file``
    (and a sibling ``files`` in the schema), each ``{id, url}`` with a path
    relative to their host."""
    raw = item.get("file")
    if not isinstance(raw, list) or not raw:
        raw = item.get("files") if isinstance(item.get("files"), list) else []
    out = []
    for f in raw or []:
        if isinstance(f, dict):
            url = _s(f.get("url"))
            if url:
                out.append({"id": _i(f.get("id")), "url": url, "href": file_url(url)})
        elif isinstance(f, str) and f.strip():
            out.append({"id": None, "url": f.strip(), "href": file_url(f)})
    return out


def normalize_item(item: dict) -> dict:
    """One LIST item → the ArcRequest column dict. ``raw`` keeps the whole item
    so a field they add later is not lost before someone adds a column for it.

    The ticket's ``id`` is its number AND its identity — the old uuid is gone,
    and «заявка №491» is what everybody upstream calls it."""
    cat = _obj(item.get("category"))
    div = _obj(item.get("division"))
    mgr = _obj(div.get("manager"))
    brig = _obj(item.get("brigada"))
    author = _person(item.get("user"))
    # An EMPTY comment list reads as «nothing to say about this», not as «the
    # thread is empty upstream»: the list endpoint ships `[]` for tickets whose
    # card carries a thread, and the upsert coalesces None so the card's copy
    # survives. A non-empty list is the newer answer and does overwrite.
    raw_comments = item.get("comments")
    comments = raw_comments if isinstance(raw_comments, list) and raw_comments else None
    brig_name = _s(brig.get("name"))
    brigada_mapping = {
        "АРС Бригада №1": "Elektrik",
        "АРС Бригада №2": "Universal",
        "АРС Бригада №3": "Svarka",
        "АРС Бригада №4": "Mexanik/Santexnik",
        "АРС Бригада №5": "Universal (Keles)",
    }
    mapped_brig_name = brigada_mapping.get(brig_name, brig_name)

    return {
        "remote_id": _s(item.get("id")),
        "request_num": _i(item.get("id")),
        "status": _i(item.get("status")),
        "user_id": author["id"] if author["id"] is not None else _i(item.get("user_id")),
        "user_name": author["name"],
        "user_phone": author["phone"] or _s(item.get("phone_number")),
        "user_manager": _name_of(item.get("user_manager")),
        "division_id": _s(item.get("division_id")) or _s(div.get("id")),
        "division_name": _s(div.get("name")),
        "manager_name": _s(mgr.get("name")),
        "brigada_id": _i(brig.get("id")),
        "brigada_name": mapped_brig_name,
        "category_id": _i(cat.get("id")),
        "category_name": _s(cat.get("name")),
        "category_urgent": _b(cat.get("urgent")),
        "category_ftime": _f(cat.get("ftime")),
        "department": _i(cat.get("department")),
        "sphere_status": _i(cat.get("sphere_status")),
        "is_bot": _b(item.get("is_bot")),
        "created_at": parse_dt(item.get("created_at")),
        "started_at": parse_dt(item.get("started_at")),
        "finished_at": parse_dt(item.get("finished_at")),
        "comments": comments,
        "comment_count": len(comments) if comments is not None else None,
        "raw": item,
    }


def normalize_detail(item: dict) -> dict:
    """One CARD → the columns only the single-ticket endpoint carries. Fields
    the card omits are written as None on purpose: the card is the fuller
    answer, so «absent there» means the ticket does not have it."""
    comments = item.get("comments") if isinstance(item.get("comments"), list) else None
    out = {
        "description": _s(item.get("description")),
        "deny_reason": _s(item.get("deny_reason")),
        "files": _files(item),
        "update_time": item.get("update_time") if isinstance(item.get("update_time"), dict) else None,
        "detail_raw": item,
    }
    if comments is not None:
        out["comments"] = comments
        out["comment_count"] = len(comments)
    phone = _s(item.get("phone_number"))
    if phone:
        out["user_phone"] = phone
    return out
