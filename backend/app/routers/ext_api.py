"""The external read API (`/api/ext/v1`, 2026-11-11) — another system asks for
the cells, a day's plan and SKUs per cell, and a day's clock-in/out per cell.

Read-only, three GETs, no session: the caller presents a personal TOKEN
(``Authorization: Bearer`` or ``X-Api-Key``) its owner made on the «API» page
(services/api_tokens.py) — kept as a digest, named, expiring, and dead the
moment its owner loses the page.

Every figure is the platform's own: the cells of the day are `cell_lookup`'s,
a cell's SKUs are the «Zagruzka fayli» rows of its unit cut to the cell as a
leader's page cuts them (`wc_group.in_scope`), its minutes are
`zagruzka_source.cell_labor`. See docs/ext-api.md.
"""
from __future__ import annotations

import hmac
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ApiToken, Attendance, Manager
from app.routers.ovens import _ip, _refuse
from app.services import (api_tokens, cell_lookup, live_day, live_staff, ops_door, verifix_live,
                          wc_group, zagruzka_source)
from app.services.cell_lookup import norm_code

log = logging.getLogger(__name__)

# The first key, from before tokens existed (v4.460.0): digest → name. Honoured
# only while NOBODY has made a token — the first one made retires it.
KEYS = {
    "53eb2fe1fd283b8e1624ca4700e2bda5b25026cb16f53587f52baca34e4abbcb": "ext-1",
}


def _client(request: Request, db: Session = Depends(get_db)) -> str:
    """Who is calling, or 401 / 429: a personal token (services/api_tokens.py)
    in ``Authorization: Bearer`` or ``X-Api-Key``. Wrong ones share the report
    door's per-address throttle."""
    ip = _ip(request)
    if ops_door.throttled(ip):
        raise _refuse("throttled", "Too many wrong tokens from this address — wait ten minutes.", 429)
    scheme, _, token = (request.headers.get("authorization") or "").partition(" ")
    v = token.strip() if scheme.lower() == "bearer" else ""
    v = v or (request.headers.get("x-api-key") or "").strip()
    if v:
        row = api_tokens.use(db, v)
        if row is not None:
            who = f"{row.owner_name or row.owner_tid} · {row.name}"
            log.info("[EXT] %s by %s", request.url.path, who)
            return who
        if db.query(ApiToken.id).first() is None:
            for known, name in KEYS.items():
                if hmac.compare_digest(api_tokens.digest_of(v), known):
                    return name
        ops_door.note_bad(ip)
    log.warning("[EXT] token refused from %s", ip)
    raise _refuse("bad_token", "Missing, wrong, expired or revoked token.", 401)


router = APIRouter(prefix="/api/ext/v1", tags=["ext"], dependencies=[Depends(_client)])


def _day(s: Optional[str]) -> date:
    """`date=YYYY-MM-DD`; blank = today on the Tashkent clock."""
    if not s:
        return verifix_live.now_local().date()
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise _refuse("bad_date", "date must be YYYY-MM-DD.", 400)


def _cells(db: Session, day: date, code: Optional[str]) -> list[tuple]:
    """[(cell, unit id, leader name)] — the cells standing on `day` that carry
    a SAP code, with the unit, leader and letter OF THAT DAY."""
    cells, units_on, leaders_on, leaders = cell_lookup._cells_on(db, True, None, day)
    out = []
    for c in cells:
        mid = units_on.get(c.id, c.manager_id)
        if mid is None or (code and c.verifix_code != code):
            continue
        out.append((c, int(mid), leaders.get(leaders_on.get(c.id, c.leader_id))))
    return out


def _r(v) -> Optional[float]:
    return None if v is None else round(float(v), 2)


@router.get("/cells")
def cells(date: Optional[str] = Query(None), db: Session = Depends(get_db)):  # noqa: A002
    day = _day(date)
    units = {m.id: m for m in db.query(Manager).all()}
    return {"date": day.isoformat(), "cells": [{
        "code": c.verifix_code, "sap_code": c.sap_code,
        "group": getattr(c, "wc_group", None) or None,
        "leader": leader,
        "brigadir": units[mid].name if mid in units else None,
        "shift": units[mid].shift if mid in units else None,
    } for c, mid, leader in _cells(db, day, None)]}


@router.get("/production")
def production(date: Optional[str] = Query(None), cell: Optional[str] = Query(None),  # noqa: A002
               db: Session = Depends(get_db)):
    """Per cell: its plan/fact minutes and the SKUs with a plan or a fact that
    day. A line no letter claims belongs to every cell of its work centre and
    is listed under each with its WHOLE quantity (`shared: true`); the cell's
    minutes carry an even share of it, so they are not the sum of its SKUs."""
    from app.routers.production import _build_dashboard
    day = _day(date)
    picked = _cells(db, day, cell)
    # `cell_labor` splits a work centre between ALL its cells — never hand it
    # the picked one alone.
    every = picked if not cell else _cells(db, day, None)
    mids = sorted({mid for _c, mid, _l in picked})
    labor = zagruzka_source.cell_labor(
        [c for c, mid, _l in every if mid in mids],
        zagruzka_source.wc_group_labor(db, mids, day, day)) if mids else {}
    rows_of = {mid: _build_dashboard(db, mid, day).get("rows") or [] for mid in mids}
    iso = day.isoformat()
    out = []
    for c, mid, _leader in picked:
        code = norm_code(c.sap_code)
        grp = getattr(c, "wc_group", None) or None
        pa = labor.get((c.id, iso))
        out.append({
            "code": c.verifix_code, "sap_code": c.sap_code, "group": grp,
            "plan_minutes": _r(pa[0]) if pa else None,
            "fact_minutes": _r(pa[1]) if pa else None,
            "skus": [{
                "sap_code": r.get("sap_code"), "name": r.get("name"), "unit": r.get("uom"),
                "plan": _r(r.get("plan_qty")), "fact": _r(r.get("actual_qty")),
                "plan_minutes": _r(r.get("total_labor")),
                "shared": bool(grp) and not r.get("wc_group"),
            } for r in rows_of[mid]
                if norm_code(r.get("work_center")) == code
                and wc_group.in_scope({(code, grp)}, code, r.get("wc_group"))
                and (r.get("plan_qty") or r.get("actual_qty"))],
        })
    return {"date": iso, "cells": out}


_CLOCK = re.compile(r"^\s*(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?")


def _ts(dt: Optional[datetime]) -> Optional[str]:
    """Tashkent wall clock with its offset (the platform's clocks are naive)."""
    return dt.replace(tzinfo=None).isoformat(timespec="minutes") + "+05:00" if dt else None


def _stored_clock(day: date, text: Optional[str]) -> tuple:
    """A closed day's «07:59 - 16:59 (8.47)» → (in, out); «X» / blank → (None,
    None). An out at or before the in is the next morning's (a night shift)."""
    m = _CLOCK.match(text or "")
    if not m:
        return None, None
    t_in = datetime(day.year, day.month, day.day, int(m[1]) % 24, int(m[2]))
    if m[3] is None:
        return t_in, None
    t_out = datetime(day.year, day.month, day.day, int(m[3]) % 24, int(m[4]))
    return t_in, t_out + timedelta(days=1) if t_out <= t_in else t_out


@router.get("/attendance")
def attendance(date: Optional[str] = Query(None), cell: Optional[str] = Query(None),  # noqa: A002
               db: Session = Depends(get_db)):
    """Per cell: its workers and their clock-in/out. A unit whose day is closed
    answers from the closed copy (`attendance`, exchanges applied, no employee
    id); a unit still open answers from the live Verifix read, everybody under
    their HOME cell. `clock_in: null` = did not come (yet)."""
    day = _day(date)
    by_cell: dict = defaultdict(list)
    closed = set()
    for r in (db.query(Attendance).filter(Attendance.date == day,
                                          Attendance.verifix_code.isnot(None)).all()):
        closed.add(r.manager_id)
        if not r.worker_name:
            continue                    # an exchange's nameless additional hours
        t_in, t_out = _stored_clock(day, r.clock_in_out)
        by_cell[r.verifix_code].append({
            "employee_id": None, "name": r.worker_name, "job": r.job_title,
            "clock_in": _ts(t_in), "clock_out": _ts(t_out)})
    live_at = None
    if live_day.is_live(day):
        drow = verifix_live._row(db, "dir")
        directory = (drow.data or None) if drow else None
        row = verifix_live._row(db, verifix_live._day_key(day)) if directory else None
        store = ((row.data or {}).get("emps") or {}) if row else {}
        if store:
            ctx = live_staff.load(db, day, directory, store)
            for eid, (mid, key) in ctx.homes.items():
                if mid in closed or (mid, eid) in ctx.deleted or eid not in ctx.store:
                    continue
                w = live_staff.person(ctx, eid)
                by_cell[live_staff._cell_of(ctx, key)].append({
                    "employee_id": eid, "name": w.name, "job": w.role,
                    "clock_in": _ts(w.p.get("in")), "clock_out": _ts(w.p.get("out"))})
                at = ctx.store[eid].get("at")
                if at and (live_at is None or at < live_at):
                    live_at = at
    return {
        "date": day.isoformat(),
        # the oldest live read among the people answered live; null = every
        # unit answered from its closed day (or nothing is read yet)
        "live_read_at": live_at,
        "cells": [{"code": code, "workers": sorted(ws, key=lambda w: w["name"] or "")}
                  for code, ws in sorted(by_cell.items(), key=lambda kv: str(kv[0]))
                  if not cell or code == cell],
    }
