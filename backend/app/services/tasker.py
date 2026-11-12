"""THE Tasker client — the Service Desk «Задачник (фабрика)» integration API, read-only.

Tasker scores the factory departments' inspection checklists every day; its API
hands those scores out per department and per checklist (docs/tasker.md). This
module is phase 1: the token, the HTTP client and a CONNECTION TEST that says,
in counts, what the API hands back and which of its departments name one of our
cells. Nothing here writes to Tasker and nothing here moves a number on the
platform — task 4 stays a screenshot until the data can answer it.

**The token is stored SEALED in ``app_settings``** (``web_auth.seal_password``)
and SHOWN to the admins on the card (the operator, 2026-11-12: a masked token
cannot be checked against the one Tasker issued). Never logged, never in the
action register. It travels in the ``X-Integration-Token`` header only — never
in a URL.

**The address is an allow-list**, because it decides where the token is sent:
Tasker's production origin, or ``localhost`` / ``127.0.0.1`` with a port for
its local test setup. The API path is fixed and redirects are not followed.
"""
from __future__ import annotations

import json
import logging
import re
import time
import unicodedata
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx
from sqlalchemy.orm import Session

from app.services.verifix import TZ, _get, _put

log = logging.getLogger(__name__)

PROD_HOST = "api.dashboard.service.safiabakery.uz"
PROD_BASE = f"https://{PROD_HOST}"
API_PATH = "/tasker/api/v1/integration/factory"
_LOCAL_HOSTS = {"localhost", "127.0.0.1"}

K_BASE = "tasker_base"
K_TOKEN = "tasker_token"            # SEALED — web_auth.seal_password
K_LAST_TEST = "tasker_last_test"    # JSON: counts and department names only

# What a copy from a chat, a doc or a code block brings along that is no part of
# any token: zero-width characters and soft hyphens, a typographic dash where
# the token has "-", a space or line break where a viewer wrapped it (seen
# 2026-11-12: «…FIjdu DDOwmx…»), and the quotes or backticks around it.
_INVISIBLE = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff\u00ad"))
_DASHES = dict.fromkeys(map(ord, "\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d"), "-")
_WRAP = "`'\"«»“”‘’"
_SENDABLE = re.compile(r"[\x21-\x7e]{8,300}")

# Inside Cloudflare's 100 s, the Verifix test's arithmetic.
BUDGET_S = 70.0
CALL_TIMEOUT_S = 25.0

# Failures after which every further call would fail the same way.
_FATAL = {"unauthorized", "redirect", "not_found", "network", "timeout"}


class TaskerError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None,
                 retry_after: Optional[str] = None):
        super().__init__(message or code)
        self.code, self.message, self.status, self.retry_after = code, message, status, retry_after


# ── the stored connection ─────────────────────────────────────────────────────

def norm_base(raw: Optional[str]) -> str:
    """The origin the token may be sent to; blank → production. Raises
    ValueError for anything off the allow-list. A typed path must be the API's
    own (pasting the doc's full address is fine)."""
    s = (raw or "").strip().rstrip("/")
    if not s:
        return PROD_BASE
    if "://" not in s:
        s = ("http://" if s.split(":", 1)[0].lower() in _LOCAL_HOSTS else "https://") + s
    try:
        u = urlsplit(s)
        port = u.port
    except ValueError:
        raise ValueError("not an address")
    host = (u.hostname or "").lower()
    if u.username or u.password or u.query or u.fragment or u.path.rstrip("/") not in ("", API_PATH):
        raise ValueError("the address must be Tasker's own")
    if host == PROD_HOST and u.scheme == "https" and port in (None, 443):
        return PROD_BASE
    if host in _LOCAL_HOSTS and u.scheme in ("http", "https") and port:
        return f"{u.scheme}://{host}:{port}"
    raise ValueError(f"the address must be {PROD_BASE} or localhost with a port")


def clean_token(raw: Optional[str]) -> str:
    """The token as pasted, minus what the copy brought along. A token holds no
    whitespace, so every space inside is the copy's, never the token's."""
    s = unicodedata.normalize("NFKC", str(raw or "")).translate(_INVISIBLE).translate(_DASHES)
    return "".join(s.split()).strip(_WRAP)


def valid_token(token: str) -> bool:
    """Sendable in a header: printable ASCII, no spaces. Whether it is the
    RIGHT token is Tasker's to say — the Test button asks it."""
    return bool(_SENDABLE.fullmatch(token or ""))


def token_problem(token: str) -> Optional[str]:
    """Why ``token`` can't be sent, naming the exact character — None when it can."""
    for i, ch in enumerate(token or ""):
        if not "\x21" <= ch <= "\x7e":
            return f"character {i + 1} of the token, «{ch}» (U+{ord(ch):04X}), cannot be sent"
    if not 8 <= len(token or "") <= 300:
        return f"the token is {len(token or '')} characters long — that is not a whole token"
    return None


def config(db: Session) -> dict:
    from app.web_auth import open_password

    sealed = _get(db, K_TOKEN)
    token = open_password(sealed) if sealed else None
    try:
        base = norm_base(_get(db, K_BASE))
    except ValueError:
        base = PROD_BASE
    out = {
        "base": base,
        "token_set": bool(sealed),
        # A sealed value that no longer opens must be re-entered — say so
        # rather than let the test fail as «rejected».
        "token_readable": (token is not None) if sealed else None,
        "token": token,
    }
    return out


def save(db: Session, *, base: Optional[str] = None, token: Optional[str] = None,
         clear_token: bool = False) -> dict:
    """Write what was sent; ``None`` leaves a field alone. Returns what changed, for the action register — the
    token's LENGTH, never the token."""
    from app.web_auth import seal_password

    changed: dict[str, Any] = {}
    if base is not None:
        new = norm_base(base)
        try:
            old = norm_base(_get(db, K_BASE))
        except ValueError:
            old = PROD_BASE
        if new != old:
            _put(db, K_BASE, None if new == PROD_BASE else new)
            changed["base"] = (old, new)
    if clear_token:
        if _get(db, K_TOKEN):
            _put(db, K_TOKEN, None)
            changed["token"] = "cleared"
    elif token:
        token = clean_token(token)
        problem = token_problem(token)
        if problem:
            raise ValueError(problem)
        _put(db, K_TOKEN, seal_password(token))
        changed["token"] = len(token)
    if changed:
        _put(db, K_LAST_TEST, None)
    db.commit()
    return changed


def last_test(db: Session) -> Optional[dict]:
    raw = _get(db, K_LAST_TEST)
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


# ── the HTTP client ───────────────────────────────────────────────────────────

def client(cfg: dict) -> httpx.Client:
    return httpx.Client(
        base_url=cfg["base"] + API_PATH,
        headers={"X-Integration-Token": cfg["token"], "Accept": "application/json"},
        timeout=httpx.Timeout(CALL_TIMEOUT_S, connect=10.0),
        # A redirect would re-send the token to wherever it points.
        follow_redirects=False,
    )


def _message(res: httpx.Response) -> str:
    try:
        body = res.json()
    except ValueError:
        return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", res.text or "")).strip()[:300]
    if isinstance(body, dict) and body.get("detail"):
        v = body["detail"]
        return (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))[:300]
    return json.dumps(body, ensure_ascii=False)[:300]


_STATUS = {401: "unauthorized", 403: "forbidden", 404: "not_found", 422: "bad_request",
           429: "rate_limited", 503: "unavailable"}


def call(c: httpx.Client, path: str, params: Optional[dict] = None,
         timeout: Optional[float] = None) -> Any:
    """One GET; Tasker's error statuses become named codes (the doc's table)."""
    try:
        res = c.get(path, params=params, **({"timeout": timeout} if timeout else {}))
    except httpx.TimeoutException:
        raise TaskerError("timeout", "Tasker did not answer in time")
    except httpx.HTTPError as exc:
        raise TaskerError("network", type(exc).__name__)
    if 300 <= res.status_code < 400:
        raise TaskerError("redirect", res.headers.get("location", "")[:200], res.status_code)
    if res.status_code >= 400:
        raise TaskerError(_STATUS.get(res.status_code, "http"), _message(res), res.status_code,
                          res.headers.get("retry-after"))
    try:
        return res.json()
    except ValueError:
        raise TaskerError("bad_json", _message(res), res.status_code)


# ── reading an answer ─────────────────────────────────────────────────────────

def num(v: Any) -> Optional[float]:
    """Tasker sends a day's value as a STRING («38.0») and an average as a
    number; both read as a float, anything else as None."""
    if v is None or v == "" or isinstance(v, bool):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def clean(s: Any) -> str:
    """Names arrive with trailing spaces («ФАБРИКА КЗ »)."""
    return re.sub(r"\s+", " ", str(s or "")).strip()


def match_cell(name: str, cmap: dict) -> Optional[dict]:
    """The cell a department's name names, by the audit KPI's rule (its leading
    code, else the four digits it ends with) — a SUGGESTION the test lists for
    a person to confirm, never a mapping anything scores by."""
    from app.services.tech_audit import division_key

    k = division_key(name, cmap)
    return cmap[k] if k else None


# ── the connection test ───────────────────────────────────────────────────────

def _items(data: Any) -> list[dict]:
    """A list of objects, or the answer is not what the doc describes."""
    if not isinstance(data, list):
        raise TaskerError("bad_json", "expected a list")
    return [x for x in data if isinstance(x, dict)]


def _fail(e: TaskerError) -> dict:
    out = {"ok": False, "code": e.code, "message": e.message, "status": e.status}
    if e.retry_after:
        out["retry_after"] = e.retry_after
    return out


def run_test(db: Session, actor: str = "") -> dict:
    """Call the three endpoints for YESTERDAY and count what comes back."""
    from app.services import turnover

    started = time.monotonic()
    deadline = started + BUDGET_S
    cfg = config(db)
    day = (datetime.now(TZ).date() - timedelta(days=1)).isoformat()
    result: dict[str, Any] = {"at": datetime.now(TZ).isoformat(timespec="seconds"),
                              "by": actor, "base": cfg["base"], "day": day, "steps": []}
    if not cfg["token_set"] or cfg["token"] is None:
        result.update(ok=False, verdict="no_token" if not cfg["token_set"] else "token_unreadable")
        return _finish(db, result, started)

    cmap = turnover.cell_map(db)
    rows: dict[str, dict] = {}
    steps = result["steps"]
    params = {"start_date": day, "finish_date": day}
    with client(cfg) as c:
        step: dict[str, Any] = {"key": "departments"}
        try:
            for d in _items(call(c, "/departments")):
                name = clean(d.get("branch_name"))
                cell = match_cell(name, cmap)
                rows[str(d.get("branch_id") or "")] = {
                    "id": str(d.get("branch_id") or ""), "name": name,
                    "cell": cell["code"] if cell else None, "cell_id": cell["id"] if cell else None,
                    "value": None, "revisions": None, "checklists": None}
            step.update(ok=True, total=len(rows),
                        matched=sum(1 for r in rows.values() if r["cell"]))
        except TaskerError as e:
            step.update(_fail(e))
        steps.append(step)

        if step.get("ok"):
            step = {"key": "daily"}
            try:
                vals, revisions = [], 0
                for b in _items(call(c, "/daily", params)):
                    v = next((num(x.get("value")) for x in _items(b.get("daily") or [])
                              if x.get("day") == day), None)
                    n = int(num(b.get("total_revisions")) or 0)
                    revisions += n
                    r = rows.get(str(b.get("branch_id") or ""))
                    if r is not None:
                        r["value"], r["revisions"] = v, n
                    if v is not None:
                        vals.append(v)
                step.update(ok=True, with_value=len(vals), revisions=revisions,
                            min=min(vals) if vals else None,
                            avg=round(sum(vals) / len(vals), 2) if vals else None)
            except TaskerError as e:
                step.update(_fail(e))
            steps.append(step)

        if step.get("ok") or step.get("code") not in _FATAL:
            step = {"key": "checklists"}
            try:
                left = max(5.0, deadline - time.monotonic())
                types: Counter = Counter()
                obxod: Counter = Counter()
                total = 0
                for b in _items(call(c, "/checklists/daily", params, timeout=left)):
                    lists = _items(b.get("checklists") or [])
                    total += len(lists)
                    r = rows.get(str(b.get("branch_id") or ""))
                    if r is not None:
                        r["checklists"] = len(lists)
                    for cl in lists:
                        types[clean(cl.get("type_name")) or "—"] += 1
                        name = clean(cl.get("checklist_name"))
                        if "обход" in name.casefold():
                            obxod[name] += 1
                step.update(ok=True, total=total,
                            types=[{"name": k, "count": v} for k, v in types.most_common(20)],
                            obxod=[{"name": k, "count": v} for k, v in obxod.most_common(10)])
            except TaskerError as e:
                step.update(_fail(e))
            steps.append(step)

    result["departments"] = sorted(rows.values(), key=lambda r: r["name"].casefold())
    first = steps[0] if steps else {}
    if first.get("code") == "unauthorized":
        verdict = "unauthorized"
    elif not first.get("ok"):
        verdict = "failed"
    elif not first.get("total"):
        verdict = "no_departments"
    elif any(not s.get("ok") for s in steps):
        verdict = "partial"
    else:
        verdict = "ok"
    result.update(ok=verdict == "ok", verdict=verdict)
    return _finish(db, result, started)


def _finish(db: Session, result: dict, started: float) -> dict:
    result["ms"] = int((time.monotonic() - started) * 1000)
    try:
        _put(db, K_LAST_TEST, json.dumps(result, ensure_ascii=False))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("tasker: could not store the test result")
    log.info("tasker test: %s in %s ms", result.get("verdict"), result["ms"])
    return result
