"""THE Verifix API client — the attendance system's public API, read-only.

Verifix (safia.verifix.com) is where every clock-in and clock-out lands. Today an
admin exports its «Отчёт по посещениям» by hand and uploads it on «Davomat»;
the plan is to read the same data from its public API instead (memory:
verifix-api-integration). This module is step one: the credential, the HTTP
client and a CONNECTION TEST that says, in counts, what the API hands back.
Nothing here writes to Verifix and nothing here moves a number on the platform.

**How it logs in.** The API's documented first method, «Basic auth
(deprecated)»: the login and password of an ordinary Verifix user —
``Authorization: Basic base64("login@company:password")`` plus two headers on
every call, ``project_code: vhr`` and ``filial_id`` (the organization, required
for this method). The OAuth client the docs prefer can only be created from the
«Администрирование» organization, which nobody at Safia can open; a dedicated
user with a read-only role is the route the operator chose (2026-09-30).

**The data a call returns is the data THAT USER may see.** The docs say so in
as many words («сотрудник … должен быть доступен пользователю API»), so an API
user with no employee access gets empty lists, not an error. The test therefore
counts employees separately and names that case instead of reporting success.

**Where the credential lives.** In ``app_settings``: the login, the Фабрика
organization id and the host as plain text, the password SEALED with
``web_auth.seal_password`` (keyed off SECRET_KEY, which is in .env and never in
the database), so a «Backup» file carries ciphertext — the same rule the Gemini
key follows. The password is never returned by any endpoint, never logged and
never written to the action register. Gitea secrets were the first plan; the
operator's account has write access to the repo but not admin, so it cannot
add one.

**The host is pinned to ``*.verifix.com``.** It decides where the Basic header
— the password — is sent, so a free-text host would make the test button a way
to post the sealed password to any server on the internet.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import time
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.orm import Session

from app.models import AppSetting, Cell

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")

DEFAULT_HOST = "app.verifix.com"
API_PATH = "/b/vhr/api/v1/"
PROJECT_CODE = "vhr"

K_LOGIN = "verifix_login"
K_PASSWORD = "verifix_password"        # SEALED — web_auth.seal_password
K_FILIAL = "verifix_filial_id"
K_HOST = "verifix_host"
K_LAST_TEST = "verifix_last_test"      # JSON, counts only — no person data

_HOST_RE = re.compile(r"^(?:[a-z0-9-]+\.)*verifix\.com$")
_LOGIN_RE = re.compile(r"^[^@\s:]+@[^@\s:]+$")

# Page sizes are the documented maxima for each kind of call.
LIMIT_LIST = 500
LIMIT_TIMESHEET = 100
LIMIT_TRACKS = 1000

# The whole test must answer inside Cloudflare's 100 s: a 70 s budget plus one
# call's timeout can never cross it.
BUDGET_S = 70.0
CALL_TIMEOUT_S = 25.0
MAX_PAGES = 60

# How many of the report's divisions the test names, biggest first.
TOP_DIVISIONS = 8

# Failures after which every further call would fail the same way.
_FATAL = {"unauthorized", "redirect", "not_found", "network", "timeout"}


class VerifixError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None):
        super().__init__(message or code)
        self.code = code
        self.message = message
        self.status = status


# ── the stored credential ─────────────────────────────────────────────────────

def _get(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSetting).filter_by(key=key).first()
    return row.value if row else None


def _put(db: Session, key: str, value: Optional[str]) -> None:
    """Upsert, or delete when ``value`` is None. The caller commits."""
    row = db.query(AppSetting).filter_by(key=key).first()
    if value is None:
        if row is not None:
            db.delete(row)
        return
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def norm_host(raw: Optional[str]) -> str:
    """``https://App.Verifix.com/`` → ``app.verifix.com``. Raises ValueError
    for anything that is not a verifix.com host."""
    h = (raw or "").strip().lower()
    h = re.sub(r"^https?://", "", h).split("/", 1)[0].strip()
    if not h:
        return DEFAULT_HOST
    if not _HOST_RE.match(h):
        raise ValueError("host must be a verifix.com address")
    return h


def valid_login(login: str) -> bool:
    return bool(_LOGIN_RE.match(login or ""))


def config(db: Session, *, with_password: bool = False) -> dict:
    """What is stored. The password itself only with ``with_password`` — the
    endpoints never ask for it; only the client does."""
    from app.web_auth import open_password

    sealed = _get(db, K_PASSWORD)
    password = open_password(sealed) if sealed else None
    try:
        host = norm_host(_get(db, K_HOST))
    except ValueError:
        host = DEFAULT_HOST
    out = {
        "login": (_get(db, K_LOGIN) or "").strip(),
        "password_set": bool(sealed),
        # A sealed value that no longer opens (SECRET_KEY rotated, corrupt row)
        # must be re-entered; saying so beats a test that fails as «rejected».
        "password_readable": (password is not None) if sealed else None,
        "filial_id": (_get(db, K_FILIAL) or "").strip(),
        "host": host,
    }
    if with_password:
        out["password"] = password
    return out


def save(db: Session, *, login: Optional[str] = None, password: Optional[str] = None,
         clear_password: bool = False, filial_id: Optional[str] = None,
         host: Optional[str] = None) -> dict:
    """Write what was sent; ``None`` leaves a field alone. A blank password
    keeps the stored one — the form never holds it, so blank means «unchanged»,
    and clearing it is its own explicit flag. Returns what changed, for the
    action register (never the password)."""
    from app.web_auth import seal_password

    changed: dict[str, Any] = {}
    if login is not None:
        login = login.strip()
        if login and not valid_login(login):
            raise ValueError("login must be login@company, as typed on the Verifix sign-in page")
        old = (_get(db, K_LOGIN) or "").strip()
        if login != old:
            _put(db, K_LOGIN, login or None)
            changed["login"] = (old, login)
    if filial_id is not None:
        filial_id = filial_id.strip()
        if filial_id and not filial_id.isdigit():
            raise ValueError("the organization id is a number")
        old = (_get(db, K_FILIAL) or "").strip()
        if filial_id != old:
            _put(db, K_FILIAL, filial_id or None)
            changed["filial_id"] = (old, filial_id)
    if host is not None:
        new = norm_host(host)
        try:
            old = norm_host(_get(db, K_HOST))
        except ValueError:
            old = DEFAULT_HOST
        if new != old:
            _put(db, K_HOST, None if new == DEFAULT_HOST else new)
            changed["host"] = (old, new)
    if clear_password:
        if _get(db, K_PASSWORD):
            _put(db, K_PASSWORD, None)
            changed["password"] = "cleared"
    elif password:
        _put(db, K_PASSWORD, seal_password(password))
        changed["password"] = len(password)
    # A credential that changed makes the last result describe somebody else.
    if changed:
        _put(db, K_LAST_TEST, None)
    db.commit()
    return changed


def last_test(db: Session) -> Optional[dict]:
    raw = _get(db, K_LAST_TEST)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return None


# ── the HTTP client ───────────────────────────────────────────────────────────

def client(cfg: dict) -> httpx.Client:
    token = base64.b64encode(f"{cfg['login']}:{cfg['password']}".encode("utf-8")).decode("ascii")
    headers = {
        "Authorization": f"Basic {token}",
        "project_code": PROJECT_CODE,
        "Accept": "application/json",
    }
    if cfg.get("filial_id"):
        headers["filial_id"] = str(cfg["filial_id"])
    return httpx.Client(
        base_url=f"https://{cfg['host']}{API_PATH}",
        headers=headers,
        timeout=httpx.Timeout(CALL_TIMEOUT_S, connect=10.0),
        # A redirect here is a login page or a wrong host; following it would
        # re-send the Basic header to wherever it points.
        follow_redirects=False,
    )


def _message(res: httpx.Response) -> str:
    try:
        body = res.json()
    except ValueError:
        text = re.sub(r"<[^>]+>", " ", res.text or "")
        return re.sub(r"\s+", " ", text).strip()[:300]
    if isinstance(body, dict):
        for k in ("message", "error_description", "error", "errors", "detail"):
            if body.get(k):
                v = body[k]
                return (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))[:300]
    return json.dumps(body, ensure_ascii=False)[:300]


def call(c: httpx.Client, path: str, body: Optional[dict] = None, *,
         limit: Optional[int] = None, cursor: Optional[str] = None) -> tuple[Any, Optional[str]]:
    """One POST. Returns ``(data, next_cursor)``; ``next_cursor`` is None on the
    last page (the API sends -1). A report endpoint answers a plain list."""
    headers = {}
    if limit is not None:
        headers["limit"] = str(limit)
    if cursor not in (None, ""):
        headers["cursor"] = str(cursor)
    try:
        res = c.post(path, json=body or {}, headers=headers)
    except httpx.TimeoutException:
        raise VerifixError("timeout", "Verifix did not answer in time")
    except httpx.HTTPError as exc:
        raise VerifixError("network", type(exc).__name__)
    if 300 <= res.status_code < 400:
        raise VerifixError("redirect", res.headers.get("location", "")[:200], res.status_code)
    if res.status_code == 401:
        raise VerifixError("unauthorized", _message(res), 401)
    if res.status_code == 403:
        raise VerifixError("forbidden", _message(res), 403)
    if res.status_code == 404:
        raise VerifixError("not_found", _message(res), 404)
    if res.status_code >= 400:
        raise VerifixError("http", _message(res), res.status_code)
    try:
        payload = res.json()
    except ValueError:
        raise VerifixError("bad_json", _message(res), res.status_code)
    if isinstance(payload, dict) and "data" in payload:
        nxt = (payload.get("meta") or {}).get("next_cursor")
        nxt = None if nxt in (None, "", -1, "-1") else str(nxt)
        return payload.get("data") or [], nxt
    return payload, None


def each_page(c: httpx.Client, path: str, body: dict, *, limit: int,
              deadline: float) -> Any:
    """Yield pages until the API says there are no more. Stops at the deadline
    or the page cap and raises ``VerifixError("slow")`` so the caller can say
    the count is partial rather than print it as the whole."""
    cursor = None
    for _ in range(MAX_PAGES):
        if time.monotonic() > deadline:
            raise VerifixError("slow", "stopped at the time limit")
        data, nxt = call(c, path, body, limit=limit, cursor=cursor)
        yield data
        if not nxt or nxt == cursor:
            return
        cursor = nxt
    raise VerifixError("slow", "stopped at the page limit")


# ── the connection test ───────────────────────────────────────────────────────

def _code_key(code: Any) -> str:
    """'0028' and '28' are one cell — the rule `cell_lookup.by_verifix` keys by."""
    s = str(code or "").strip()
    return (s.lstrip("0") or "0") if s.isdigit() else s.upper()


def _dmy(d) -> str:
    return d.strftime("%d.%m.%Y")


def run_test(db: Session, actor: str = "") -> dict:
    """Log in with the stored credential and count what each form hands back.

    Counts only: no name, passport or phone number leaves this function, and
    the pages are dropped as soon as they are counted. Division NAMES do leave
    it (the biggest ones the report names): they are org structure, not people.
    Stored as the last result so the card can show it on the next visit.

    Every row is placed in our cells two ways, both counted, because Verifix
    keeps an employee at two levels — a division («департамент») and an org
    unit («отдел») — and the report prints only the first. The first run
    (2026-10-01) placed 0 of 2,942 rows by the division while all 159 cell
    codes were in the division list, so the codes must sit on the org units;
    `placed.unit` reads each employee's CURRENT org unit off employee$list.
    """
    cfg = config(db, with_password=True)
    started = time.monotonic()
    now = datetime.now(TZ)
    result: dict[str, Any] = {
        "at": now.isoformat(timespec="seconds"),
        "by": actor,
        "host": cfg["host"],
        "login": cfg["login"],
        "filial_id": cfg["filial_id"],
        "steps": [],
    }

    missing = [k for k in ("login", "password", "filial_id") if not cfg.get(k)]
    if cfg["password_set"] and not cfg["password_readable"]:
        result.update(ok=False, verdict="password_unreadable")
        return _finish(db, result, started)
    if missing:
        result.update(ok=False, verdict="not_configured", missing=missing)
        return _finish(db, result, started)

    deadline = started + BUDGET_S
    stopped: Optional[VerifixError] = None
    ours = {_code_key(c) for (c,) in db.query(Cell.verifix_code).all() if c}
    division_codes: dict[str, str] = {}     # division id → code key (coded only)
    division_raw: dict[str, str] = {}       # division id → the code as stored
    division_names: dict[str, str] = {}     # division id → name (every division)
    # employee id → (division id, org unit id) as Verifix holds them NOW.
    emp_place: dict[str, tuple[str, str]] = {}

    def is_ours(div_id: Any) -> bool:
        """Is this division (or org unit) one of our cells, by its code?"""
        return division_codes.get(str(div_id or "")) in ours

    def placed_by_unit(emp_id: Any) -> bool:
        place = emp_place.get(str(emp_id or ""))
        return bool(place) and is_ours(place[1])

    def step(key: str, fn: Callable[[httpx.Client], dict]) -> Optional[dict]:
        nonlocal stopped
        if stopped is not None:
            return None
        t0 = time.monotonic()
        row: dict[str, Any] = {"key": key}
        try:
            row.update(fn(c))
            row["ok"] = True
        except VerifixError as exc:
            row.update(ok=False, code=exc.code, status=exc.status, message=exc.message)
            if exc.code in _FATAL:
                stopped = exc
        except Exception as exc:                       # pragma: no cover — logged
            log.exception("verifix test: step %s failed", key)
            row.update(ok=False, code="error", message=type(exc).__name__)
        row["ms"] = int((time.monotonic() - t0) * 1000)
        result["steps"].append(row)
        return row

    def divisions(cl):
        total = active = with_code = 0
        for page in each_page(cl, "core/division$list", {"division_ids": []},
                              limit=LIMIT_LIST, deadline=deadline):
            for d in page:
                total += 1
                did = str(d.get("division_id") or "")
                division_names[did] = str(d.get("name") or "")
                if (d.get("state") or "A") == "A":
                    active += 1
                code = str(d.get("code") or "").strip()
                if code:
                    with_code += 1
                    division_codes[did] = _code_key(code)
                    division_raw[did] = code
        theirs = set(division_codes.values())
        missing_ours = sorted(c.zfill(4) if c.isdigit() else c for c in ours - theirs)
        return {
            "total": total, "active": active, "with_code": with_code,
            "cells": len(ours), "cells_found": len(ours & theirs),
            "cells_missing": missing_ours[:12], "cells_missing_n": len(missing_ours),
        }

    def employees(cl):
        # Only ids are kept: the division and the org unit («отдел») each
        # employee sits in now, which is what places a report row in a cell.
        total = working = with_unit = unit_known = by_div = by_unit = 0
        body = {"employee_ids": [], "statuses": [], "npins": []}
        for page in each_page(cl, "core/employee$list", body,
                              limit=LIMIT_LIST, deadline=deadline):
            for e in page:
                total += 1
                div = str(e.get("division_id") or "")
                unit = str(e.get("org_unit_id") or "")
                eid = str(e.get("employee_id") or "")
                if eid:
                    emp_place[eid] = (div, unit)
                if (e.get("status") or "") != "W":
                    continue
                working += 1
                if unit:
                    with_unit += 1
                    unit_known += unit in division_names
                by_div += is_ours(div)
                by_unit += is_ours(unit)
        out = {"total": total, "working": working,
               "with_unit": with_unit, "unit_known": unit_known}
        # Without the division list nothing can be placed — say nothing
        # rather than print a 0 that reads as «nobody is in a cell».
        if division_names:
            out["placed"] = {"div": by_div, "unit": by_unit}
        return out

    def simple(path: str, body: dict):
        def run(cl):
            n = 0
            for page in each_page(cl, path, body, limit=LIMIT_LIST, deadline=deadline):
                n += len(page)
            return {"total": n}
        return run

    def time_kinds(cl):
        kinds = []
        for page in each_page(cl, "core/time_kind$list", {"time_kind_ids": []},
                              limit=LIMIT_LIST, deadline=deadline):
            for k in page:
                kinds.append({"id": str(k.get("time_kind_id") or ""),
                              "name": k.get("name") or "",
                              "letter": k.get("letter_code") or ""})
        return {"total": len(kinds), "kinds": kinds[:60]}

    day = (now - timedelta(days=1)).date()

    def timesheet(cl):
        # A row is placed in a cell two ways, both counted: by the division the
        # report prints on it, and by the org unit («отдел») its employee sits
        # in now. Verifix keeps both levels; which one carries our cell codes is
        # exactly what this has to find out (the first run placed 0 rows by the
        # division alone while every cell code was in the division list).
        rows = came = no_div = by_div = by_unit = came_unit = 0
        per_div: Counter[str] = Counter()
        body = {"period_begin_date": _dmy(day), "period_end_date": _dmy(day),
                "division_ids": [], "employee_ids": []}

        def summary(partial: bool = False) -> dict:
            out: dict[str, Any] = {"date": _dmy(day), "rows": rows, "came": came,
                                   "in_cells": by_div, "no_div": no_div}
            if division_names:
                out["placed"] = {"div": by_div,
                                 "unit": by_unit if emp_place else None,
                                 "came_unit": came_unit if emp_place else None}
                # The biggest divisions the report names — org structure,
                # never a person.
                out["top"] = [
                    {"id": did, "name": division_names.get(did, ""),
                     "code": division_raw.get(did, ""), "cell": is_ours(did), "n": n}
                    for did, n in per_div.most_common(TOP_DIVISIONS) if did
                ]
            if partial:
                out["partial"] = True
            return out

        try:
            for page in each_page(cl, "core/timesheet$export", body,
                                  limit=LIMIT_TIMESHEET, deadline=deadline):
                for r in page:
                    rows += 1
                    in_ = any(d.get("input_time") for d in (r.get("days") or []))
                    came += in_
                    div = str(r.get("division_id") or "")
                    if div:
                        per_div[div] += 1
                    else:
                        no_div += 1
                    by_div += is_ours(div)
                    if placed_by_unit(r.get("employee_id")):
                        by_unit += 1
                        came_unit += in_
        except VerifixError as exc:
            if exc.code != "slow" or not rows:
                raise
            return summary(partial=True)
        return summary()

    def tracks(cl):
        body = {"begin_datetime": now.strftime("%d.%m.%Y 00:00:00"),
                "end_datetime": now.strftime("%d.%m.%Y %H:%M:%S")}
        data, nxt = call(cl, "core/track$list", body, limit=LIMIT_TRACKS)
        data = data or []
        out: dict[str, Any] = {"first_page": len(data), "more": bool(nxt)}
        if division_names:
            out["placed"] = {
                "div": sum(is_ours(t.get("division_id")) for t in data),
                "unit": (sum(placed_by_unit(t.get("employee_id")) for t in data)
                         if emp_place else None),
            }
        return out

    with client(cfg) as c:
        step("divisions", divisions)
        step("employees", employees)
        step("jobs", simple("core/job$list", {"job_ids": []}))
        step("schedules", simple("core/schedule$list", {"schedule_ids": []}))
        step("time_kinds", time_kinds)
        step("locations", simple("core/location$list", {"location_ids": []}))
        step("timesheet", timesheet)
        step("tracks", tracks)

    steps = {s["key"]: s for s in result["steps"]}
    emp = steps.get("employees") or {}
    if stopped is not None:
        verdict = stopped.code
    elif emp.get("ok") and not emp.get("total"):
        verdict = "no_employees"
    elif any(not s.get("ok") for s in result["steps"]):
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
        log.exception("verifix: could not store the test result")
    log.info("verifix test: %s in %s ms", result.get("verdict"), result["ms"])
    return result
