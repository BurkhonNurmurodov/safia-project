"""panel.safiabakery.uz — the technical audit's «Минусы» report, read with a login.

The panel (Yii2, «Exord Soft») has no API for this report: a person logs in
through a form and the page is server-rendered HTML. So this module logs in the
way the form does (GET /login for the CSRF token, POST the login, one session
cookie) and reads ONE page — the operator's exact address, `REPORT_URL`
(«Технический аудит», October 2026). Every row is one checklist question that
LOST points in one inspection; an inspection scored 100 % has no row. Nothing
is written to the panel. Record: docs/tasker.md «The panel's «Минусы» report».

**The password is stored SEALED** in ``app_settings`` and shown to the admins on
the card (the Tasker ruling, 2026-11-12). Never logged; the action register gets
that it changed and its length. **One attempt per press** — no retry, so a
wrong password is never repeated into a locked account.
"""
from __future__ import annotations

import html
import json
import logging
import re
import time
from datetime import datetime
from typing import Any, Optional
from urllib.parse import urlsplit

import httpx
from sqlalchemy.orm import Session

from app.services.verifix import TZ, _get, _put

log = logging.getLogger(__name__)

BASE = "https://panel.safiabakery.uz"
REPORT_PATH = "/task-factory-reports/cancelled?start=2026-10-01&end=2026-10-31&type=16"
REPORT_URL = BASE + REPORT_PATH

K_USER = "sdpanel_user"
K_PASS = "sdpanel_password"   # SEALED — web_auth.seal_password
K_LAST = "sdpanel_last"       # JSON: the last read, its rows included

# Three calls inside Cloudflare's 100 s.
TIMEOUT = httpx.Timeout(25.0, connect=10.0)
UA = "Mozilla/5.0 (compatible; SafiaIMS)"

# The report's columns, in order; anything else means the page changed and
# values would land in the wrong field.
HEADERS = ["#", "Цех", "Испектор", "Дата", "Общ. Рейтинг", "Рейтинг",
           "Задача", "Подзадача", "Комментарии", "TOP"]

_CSRF = re.compile(r'name="_csrf-backend"\s+value="([^"]+)"')
_FORM_ERR = re.compile(r'class="(?:help-block|invalid-feedback)[^"]*"[^>]*>\s*([^<]*?)\s*<')
_TABLE = re.compile(r'<table[^>]*\breport-table\b[^>]*>(.*?)</table>', re.S)
_TH = re.compile(r'<th[^>]*>(.*?)</th>', re.S)
_ROW = re.compile(r'<tr data-id="(\d+)"[^>]*>(.*?)</tr>', re.S)
_TD = re.compile(r'<td[^>]*>(.*?)</td>', re.S)
_TAG = re.compile(r'<[^>]+>')
_TOP = re.compile(r'TOP\s*\((\d+)\)')


class PanelError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None):
        super().__init__(message or code)
        self.code, self.message, self.status = code, message, status


# ── the stored login ──────────────────────────────────────────────────────────

def config(db: Session) -> dict:
    from app.web_auth import open_password

    sealed = _get(db, K_PASS)
    password = open_password(sealed) if sealed else None
    return {
        "user": _get(db, K_USER) or "",
        "password": password or "",
        "password_set": bool(sealed),
        # A sealed value that no longer opens must be typed again.
        "password_readable": (password is not None) if sealed else None,
    }


def save(db: Session, *, user: Optional[str] = None, password: Optional[str] = None,
         clear_password: bool = False) -> dict:
    """Write what was sent; ``None`` leaves a field alone. The password is kept
    exactly as typed — a real one may hold spaces or dashes. Returns what
    changed, the password as its LENGTH."""
    from app.web_auth import seal_password

    changed: dict[str, Any] = {}
    if user is not None and user.strip() != (_get(db, K_USER) or ""):
        _put(db, K_USER, user.strip() or None)
        changed["user"] = "set" if user.strip() else "cleared"
    if clear_password:
        if _get(db, K_PASS):
            _put(db, K_PASS, None)
            changed["password"] = "cleared"
    elif password:
        _put(db, K_PASS, seal_password(password))
        changed["password"] = len(password)
    db.commit()
    return changed


def last(db: Session) -> Optional[dict]:
    raw = _get(db, K_LAST)
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


# ── reading the page ──────────────────────────────────────────────────────────

def _text(cell: str) -> str:
    return " ".join(html.unescape(_TAG.sub(" ", cell)).split())


def _link_id(cell: str, path: str) -> Optional[int]:
    m = re.search(re.escape(path) + r"\?id=(\d+)", cell)
    return int(m.group(1)) if m else None


def _pct(s: str) -> Optional[float]:
    try:
        return float(s.rstrip("%").replace(",", ".").strip())
    except ValueError:
        return None


def _day(s: str) -> Optional[str]:
    m = re.fullmatch(r"(\d{2})\.(\d{2})\.(\d{2}|\d{4})", s)
    if not m:
        return None
    d, mo, y = m.groups()
    return f"{'20' + y if len(y) == 2 else y}-{mo}-{d}"


def parse(page: str) -> list[dict]:
    """The report's rows. Raises ``PanelError('shape')`` when the page no longer
    looks like the report this was written against."""
    m = _TABLE.search(page)
    if not m:
        raise PanelError("shape", "no report table on the page")
    heads = [_text(h) for h in _TH.findall(m.group(1))]
    if heads != HEADERS:
        raise PanelError("shape", " | ".join(heads)[:300])
    rows = []
    for item, tr in _ROW.findall(m.group(1)):
        td = _TD.findall(tr)
        if len(td) != len(HEADERS):
            raise PanelError("shape", f"a row with {len(td)} cells")
        top = _TOP.search(_text(td[9]))
        rows.append({
            "item": int(item),
            "workshop_id": _link_id(td[1], "/task-factory/list"),
            "workshop": _text(td[1]),
            "inspector": _text(td[2]),
            "day": _day(_text(td[3])),
            "total": _pct(_text(td[4])),
            "rating": _pct(_text(td[5])),
            "task_id": _link_id(td[6], "/task-scheduler/view"),
            "task": _text(td[6]),
            "question": _text(td[7]),
            "comment": _text(td[8]),
            "top": int(top.group(1)) if top else None,
        })
    return rows


def _call(c: httpx.Client, method: str, url: str, **kw) -> httpx.Response:
    try:
        return c.request(method, url, **kw)
    except httpx.TimeoutException:
        raise PanelError("timeout")
    except httpx.HTTPError as exc:
        raise PanelError("network", type(exc).__name__)


def _to_login(res: httpx.Response) -> bool:
    return res.is_redirect and urlsplit(res.headers.get("location", "")).path.rstrip("/") == "/login"


def report_path(start: str, end: str, type_id: int) -> str:
    """The «Минусы» report's address for one period and audit type (16 =
    «Технический аудит», 10 = «КРУ Производство») — the host and the path are
    fixed, only these three values change (services/panel_audits.py)."""
    return f"/task-factory-reports/cancelled?start={start}&end={end}&type={int(type_id)}"


_ANY_TABLE = re.compile(r'<table[^>]*>(.*?)</table>', re.S)
_ANY_TR = re.compile(r'<tr[^>]*>(.*?)</tr>', re.S)
_CELL = re.compile(r'<t[hd][^>]*>(.*?)</t[hd]>', re.S)
_HREF = re.compile(r'href="([^"]+)"')
PEEK_REPORTS = ("index", "days", "tasks", "cancelled-total")


def tables(page: str, cap: int = 800) -> list[dict]:
    """Every table on a page as text, with each row's links — to learn the
    layout of a report this module does not parse yet (`peek`)."""
    out = []
    for t in _ANY_TABLE.findall(page):
        rows = [{"cells": [_text(c) for c in _CELL.findall(tr)],
                 "links": [html.unescape(h) for h in _HREF.findall(tr)]}
                for tr in _ANY_TR.findall(t)]
        out.append({"rows": rows[:cap], "row_count": len(rows)})
    return out


def peek(db: Session, report: str, start: str, end: str, type_id: int) -> dict:
    """One panel report read raw (`tables`) with the stored login — the admin
    door the report door GETs. Only the reports in PEEK_REPORTS, on the fixed host."""
    from app.web_auth import open_password

    if report not in PEEK_REPORTS:
        raise PanelError("report")
    path = f"/task-factory-reports/{report}?start={start}&end={end}&type={int(type_id)}"
    user, sealed = _get(db, K_USER), _get(db, K_PASS)
    password = open_password(sealed) if sealed else None
    db.rollback()  # hand the connection back for the network wait
    if not user or password is None:
        raise PanelError("no_login")
    got = read_reports(user, password, [path], reader=tables)[path]
    if isinstance(got, PanelError):
        raise got
    return {"path": path, "tables": got}


def days_path(start: str, end: str, type_id: int) -> str:
    """The «По дням» report: a workshop × day grid of every audit's rating,
    100 % ones too — the technologists' source for a cell's month average."""
    return f"/task-factory-reports/days?start={start}&end={end}&type={int(type_id)}"


_DAY_HEAD = re.compile(r"(\d{2})\.(\d{2})")
_WS_ID = re.compile(r"/task-factory/list\?id=(\d+)")


def parse_days(page: str, year: int) -> list[dict]:
    """«По дням» as one row per audit: {workshop_id, workshop, day, rating}.
    Columns: # · Цех · one per day («dd.mm», «-» = no audit) · Кол-во · Среднее ·
    Обратная связь. Raises ``PanelError('shape')`` when the page no longer looks
    like that, or a row's «Кол-во» is not its count of rated days."""
    m = _ANY_TABLE.search(page)
    if not m:
        raise PanelError("shape", "no table on the page")
    trs = _ANY_TR.findall(m.group(1))
    heads = [_text(c) for c in _CELL.findall(trs[0])] if trs else []
    days = [_DAY_HEAD.fullmatch(h) for h in heads[2:-3]]
    if heads[:2] != ["#", "Цех"] or heads[-3:-1] != ["Кол-во", "Среднее"] or not days or not all(days):
        raise PanelError("shape", " | ".join(heads)[:300])
    out = []
    for tr in trs[1:]:
        td = _CELL.findall(tr)
        if len(td) <= 1:
            continue                       # a spacer row
        if len(td) != len(heads):
            raise PanelError("shape", f"a row with {len(td)} cells")
        ws = _WS_ID.search(tr)
        name = _text(td[1])
        rated = []
        for d, cell in zip(days, td[2:-3]):
            v = _text(cell)
            if v not in ("", "-"):
                pct = _pct(v)
                if pct is None:
                    raise PanelError("shape", f"«{v}» in {name[:60]}")
                rated.append({"workshop_id": int(ws.group(1)) if ws else None, "workshop": name,
                              "day": f"{year}-{d.group(2)}-{d.group(1)}", "rating": pct})
        n = _text(td[-3])
        if (int(n) if n.isdigit() else 0) != len(rated):
            raise PanelError("shape", f"{name[:60]}: «Кол-во» {n}, {len(rated)} rated days")
        out.extend(rated)
    return out


def read_reports(user: str, password: str, paths: list[str],
                 deadline: Optional[float] = None, reader=None) -> dict[str, Any]:
    """Log in ONCE and read each report path — one attempt, redirects never
    followed (the host is fixed; a bounce to /login is the answer, not a place
    to go). Returns {path: rows | PanelError}; a failed login raises. A path
    left when ``deadline`` (monotonic) passes is answered PanelError('no_time')."""
    out: dict[str, Any] = {}
    with httpx.Client(base_url=BASE, timeout=TIMEOUT, follow_redirects=False,
                      headers={"User-Agent": UA}) as c:
        res = _call(c, "GET", "/login")
        if res.status_code != 200:
            raise PanelError("status", "GET /login", res.status_code)
        token = _CSRF.search(res.text)
        if not token:
            raise PanelError("no_csrf")
        res = _call(c, "POST", "/login", data={
            "_csrf-backend": html.unescape(token.group(1)),
            "LoginForm[username]": user,
            "LoginForm[password]": password,
            "LoginForm[rememberMe]": "0",
        })
        if res.status_code == 200:  # the form came back: refused
            said = "; ".join(e for e in _FORM_ERR.findall(res.text) if e)
            raise PanelError("refused", html.unescape(said)[:300])
        if not res.is_redirect or _to_login(res):
            raise PanelError("status", "POST /login", res.status_code)
        for path in paths:
            if deadline is not None and time.monotonic() > deadline:
                out[path] = PanelError("no_time")
                continue
            try:
                res = _call(c, "GET", path)
                if _to_login(res):
                    raise PanelError("no_access")
                if res.status_code != 200:
                    raise PanelError("status", "GET report", res.status_code)
                # `reader`: one function for every path, or {path: function}
                fn = reader.get(path) if isinstance(reader, dict) else reader
                out[path] = (fn or parse)(res.text)
            except PanelError as e:
                if e.code in ("no_access", "network", "timeout"):
                    raise
                out[path] = e
    return out


def read_report(user: str, password: str) -> list[dict]:
    """The card's one fixed address (REPORT_PATH)."""
    got = read_reports(user, password, [REPORT_PATH])[REPORT_PATH]
    if isinstance(got, PanelError):
        raise got
    return got


def fetch(db: Session, actor: str = "") -> dict:
    """Read the report now and keep the answer. A failed read keeps the rows
    of the last good one (``rows_at`` says when they were read)."""
    from app.web_auth import open_password

    started = time.monotonic()
    now = datetime.now(TZ).isoformat(timespec="seconds")
    user = _get(db, K_USER)
    sealed = _get(db, K_PASS)
    password = open_password(sealed) if sealed else None
    prev = last(db) or {}
    db.rollback()  # hand the connection back for the network wait
    out: dict[str, Any] = {"at": now, "by": actor, "url": REPORT_URL}
    try:
        if not user or not sealed:
            raise PanelError("no_login")
        if password is None:
            raise PanelError("unreadable")
        rows = read_report(user, password)
        out.update(ok=True, rows=rows, rows_at=now)
    except PanelError as e:
        out.update(ok=False, code=e.code, message=e.message, status=e.status,
                   rows=prev.get("rows") or [], rows_at=prev.get("rows_at"))
    out["ms"] = int((time.monotonic() - started) * 1000)
    try:
        _put(db, K_LAST, json.dumps(out, ensure_ascii=False))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("sd_panel: could not store the read")
    log.info("sd_panel: %s — %s rows in %s ms", "ok" if out["ok"] else out["code"],
             len(out["rows"]), out["ms"])
    return out
