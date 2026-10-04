"""
`/api/kelish` — the «Kelish ro'yxati» page (`/kelish`): the T11 staff list,
one list per cell per shift-day, each worker marked coming or not (a tap
cycles empty → yes → no → empty). The page reads a calendar WEEK of those
lists at once (`GET /week`, from 2026-09-29) — seven days starting from the
cell's TODAY (from 2026-10-04); `GET /list` — one day — stays for a tab still
open on an older bundle.

`services/kelish.py` computes; this module decides who may see and change what.

Page key ``kelish`` — ADMIN-ONLY until the operator opens it
(`permissions.DEFAULT_PAGE_ACCESS`). The reach below is already written for the
roles it will be opened to, so opening it is a tick on the Access tab and
nothing more (the operator's rulings, 2026-09-28):

  * a LEADER reads and fills the cells they own (`cells.leader_id`) — marks
    only: «+» / «−» (who is ON the list) is not theirs (the operator,
    2026-10-04; `can_roster`);
  * a SUPERVISOR reads and fills every cell of their own unit — they fill in
    for an absent leader, and the list then says who marked the worker — and
    is the one who adds and removes workers;
  * a SHIFT-MANAGER reads their shift ∩ plant; a TOP-MANAGER reads everything;
    neither fills;
  * an ADMIN reads and fills everything, so the page can be tried before it is
    opened. `page.view.kelish` at "all" widens reading, never filling.

Checklist task #11 is NOT touched: nothing here scores anything.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all, profile_unit_ids
from app.database import get_db
from app.models import Cell, Manager, RoleProfile
from app.permissions import require_page
from app.services import action_log, cell_hours, kelish, live_overview
from app.services.factory_scope import empty_scope, resolve_factory, scoped_manager_ids

router = APIRouter(prefix="/api/kelish", tags=["kelish"])

PAGE = "kelish"
_REMOVE_MAX = 200


# ── who may do what ───────────────────────────────────────────────────────────

def _viewer(db: Session, payload: dict) -> dict:
    """The caller's reach, resolved ONCE per request."""
    role = payload.get("role")
    ctx = {"role": role, "read_all": False, "edit_all": False,
           "units": set(), "edit_units": set(), "leaders": set()}
    if role == "admin":
        ctx["read_all"] = ctx["edit_all"] = True
        return ctx
    if role == "top-manager" or page_scope_is_all(db, payload, PAGE):
        ctx["read_all"] = True
    if role == "leader":
        ctx["leaders"] = set(identity.viewer_leader_profile_ids(db, payload))
    elif role in ("supervisor", "shift-manager"):
        units = profile_unit_ids(db, identity.viewer_profile_key(db, payload)) or []
        ctx["units"] = set(units)
        if role == "supervisor":
            ctx["edit_units"] = set(units)
    return ctx


def _can_read(ctx: dict, mid: Optional[int], lid: Optional[int]) -> bool:
    return (ctx["read_all"] or ctx["edit_all"]
            or (lid is not None and lid in ctx["leaders"])
            or (mid is not None and mid in ctx["units"]))


def _can_edit(ctx: dict, mid: Optional[int], lid: Optional[int]) -> bool:
    return (ctx["edit_all"]
            or (lid is not None and lid in ctx["leaders"])
            or (mid is not None and mid in ctx["edit_units"]))


def _can_roster(ctx: dict, mid: Optional[int]) -> bool:
    """«+» / «−» — who goes ON the list is the unit's own business (the
    operator, 2026-10-04): admin and the cell's own brigadir. A leader marks
    the list and never changes who is on it."""
    return ctx["edit_all"] or (mid is not None and mid in ctx["edit_units"])


def _refuse(status: int, code: str, **extra):
    """A refusal the page can read by CODE (`detail_raw.code`) and word itself."""
    raise HTTPException(status_code=status, detail={"code": code, **extra})


def _day(value: Optional[str], default: date) -> date:
    if not value:
        return default
    try:
        return date.fromisoformat(value)
    except ValueError:
        _refuse(400, "bad_date")


def _actor(db: Session, payload: dict) -> tuple[Optional[str], Optional[str]]:
    return identity.viewer_profile_key(db, payload), payload.get("full_name")


def _cell(db: Session, payload: dict, cell_id: int) -> dict:
    """One cell the caller may READ, with its unit's shift-day frame."""
    ctx = _viewer(db, payload)
    c = (db.query(Cell.id, Cell.verifix_code, Cell.manager_id, Cell.leader_id)
         .filter(Cell.id == cell_id).first())
    if c is None or not _can_read(ctx, c.manager_id, c.leader_id):
        _refuse(404, "no_cell")
    mgr = (db.query(Manager.id, Manager.name, Manager.shift)
           .filter(Manager.id == c.manager_id).first()) if c.manager_id else None
    leader = (db.query(RoleProfile.name).filter(RoleProfile.id == c.leader_id).scalar()
              if c.leader_id else None)
    now = live_overview.now_local()
    today, tomorrow, frame = kelish.shift_days(
        cell_hours.defaults(db), mgr.shift if mgr else None, now)
    return {"ctx": ctx, "c": c, "mgr": mgr, "leader": leader, "now": now,
            "today": today, "tomorrow": tomorrow, "frame": frame,
            "can_edit": _can_edit(ctx, c.manager_id, c.leader_id),
            "can_roster": _can_roster(ctx, c.manager_id)}


def _editable(db: Session, payload: dict, cell_id: int) -> dict:
    x = _cell(db, payload, cell_id)
    if not x["can_edit"]:
        _refuse(403, "read_only")
    return x


def _roster_editable(db: Session, payload: dict, cell_id: int) -> dict:
    x = _editable(db, payload, cell_id)
    if not x["can_roster"]:
        _refuse(403, "read_only")
    return x


def _lists(db: Session, x: dict, events: list) -> tuple[list, list]:
    """Today's and tomorrow's lists for one cell, unmarked — what a «+» or a
    «−» is checked against."""
    code = x["c"].verifix_code
    files = kelish.file_workers_days(db, [x["today"], x["tomorrow"]])
    out = []
    for d in (x["today"], x["tomorrow"]):
        fw, last = files[d]
        out.append(kelish.roster(code, d, fw, last, events, {}))
    return out[0], out[1]


# ── reads ─────────────────────────────────────────────────────────────────────

@router.get("/cells")
def list_cells(
    day: Optional[str] = Query(None, alias="date"),
    factory: Optional[int] = None,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every cell the caller may open, with its unit, leader, shift-day frame
    and how far its list for `date` is filled — what the page's pickers read.

    A cell whose «tomorrow» comes before `date` (a night unit at 15:00, when a
    day unit's tomorrow is already the next calendar day) has no progress for
    it: that day is not offered for that cell."""
    ctx = _viewer(db, payload)
    now = live_overview.now_local()
    # The week the page opens on — the plant's calendar week, never the
    # browser's, so a night unit at 02:00 on a Monday still opens on Monday's.
    this_week = kelish.week_of(now.date())[0].isoformat()
    q = db.query(Cell.id, Cell.verifix_code, Cell.manager_id, Cell.leader_id)
    fac = None
    if ctx["read_all"] or ctx["edit_all"]:
        fac = resolve_factory(db, payload, factory)
        mids = scoped_manager_ids(db, payload, factory, None)
        if empty_scope(mids):
            return {"scope": {"kind": "all", "factory": fac}, "units": [], "cells": [],
                    "this_week": this_week}
        if mids is not None:
            q = q.filter(Cell.manager_id.in_(mids))
        kind = "all"
    else:
        conds = []
        if ctx["leaders"]:
            conds.append(Cell.leader_id.in_(ctx["leaders"]))
        if ctx["units"]:
            conds.append(Cell.manager_id.in_(ctx["units"]))
        if not conds:
            return {"scope": {"kind": ctx["role"]}, "units": [], "cells": [],
                    "this_week": this_week}
        q = q.filter(or_(*conds))
        kind = "leader" if ctx["role"] == "leader" else "unit"
    cells = q.all()

    mids = {c.manager_id for c in cells if c.manager_id}
    mgrs = {m.id: m for m in db.query(Manager.id, Manager.name, Manager.shift,
                                      Manager.factory_id)
            .filter(Manager.id.in_(mids)).all()} if mids else {}
    lids = {c.leader_id for c in cells if c.leader_id}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name)
                   .filter(RoleProfile.id.in_(lids)).all()) if lids else {}

    want = _day(day, None) if day else None
    windows = cell_hours.defaults(db)
    events = kelish.load_events(db, [c.id for c in cells])

    rows, by_day = [], {}
    for c in cells:
        m = mgrs.get(c.manager_id)
        today, tomorrow, _ = kelish.shift_days(windows, m.shift if m else None, now)
        d = (want if want <= tomorrow else None) if want else tomorrow
        rows.append({
            "id": c.id, "code": c.verifix_code,
            "manager_id": c.manager_id, "leader_id": c.leader_id,
            "leader": leaders.get(c.leader_id),
            "shift": m.shift if m else None,
            "today": today.isoformat(), "tomorrow": tomorrow.isoformat(),
            "can_edit": _can_edit(ctx, c.manager_id, c.leader_id),
            "progress": None, "_day": d,
        })
        if d is not None:
            by_day.setdefault(d, []).append(rows[-1])

    files = kelish.file_workers_days(db, by_day.keys())
    marks = kelish.load_marks_days(
        db, [r["id"] for items in by_day.values() for r in items], by_day.keys())
    for d, items in by_day.items():
        fw, last = files[d]
        bucket = kelish.by_code(fw)
        for r in items:
            lst = kelish.roster(r["code"], d, fw, last, events.get(r["id"], []),
                                marks.get(r["id"], {}).get(d, {}), bucket)
            r["progress"] = {"day": d.isoformat(), **kelish.counts(lst)}
    for r in rows:
        r.pop("_day", None)

    units = [{"id": m.id, "name": m.name, "shift": m.shift, "factory_id": m.factory_id}
             for m in mgrs.values()]
    return {
        "scope": {"kind": kind, "factory": fac},
        "units": sorted(units, key=lambda u: (u["name"] or "").casefold()),
        "cells": sorted(rows, key=lambda r: r["code"] or ""),
        "this_week": this_week,
    }


@router.get("/week")
def get_week(
    cell_id: int,
    start: Optional[str] = None,
    day: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """One cell's lists for SEVEN days from `start`, one row per worker — and
    with no `start`, from the cell's own TODAY (the operator's call,
    2026-10-04: the first column is always today, so today and tomorrow — the
    two open lists — are always the first two columns). A `start` after the
    cell's today is answered from today, never refused: the page steps by
    seven days and a stale step must not blank it.

    `date` (no `start`) is the calendar week it falls in, Monday → Sunday —
    what a tab still open on a 4.216 bundle asks for.

    Each day is exactly the list `GET /list` would build for it. A day after
    the cell's tomorrow has no list yet (`state: "future"`). Only today and
    tomorrow are `editable`, and only for a viewer who may fill this cell."""
    x = _cell(db, payload, cell_id)
    c, today, tomorrow, now = x["c"], x["today"], x["tomorrow"], x["now"]
    if start or not day:
        days = kelish.days_from(min(_day(start, today), today))
    else:
        days = kelish.week_of(_day(day, now.date()))
        if days[0] > tomorrow:
            days = kelish.week_of(tomorrow)
    listed = [d for d in days if d <= tomorrow]

    files = kelish.file_workers_days(db, listed)
    events = kelish.load_events(db, [c.id]).get(c.id, [])
    marks = kelish.load_marks_days(db, [c.id], listed).get(c.id, {})
    rows, per_day = kelish.week(c.verifix_code, days, files, events, marks,
                                identity.profile_key("leader", c.leader_id))

    out_days = []
    for d, cnt in zip(days, per_day):
        state = ("future" if d > tomorrow else "tomorrow" if d == tomorrow
                 else "today" if d == today else "past")
        live = state in ("today", "tomorrow")
        out_days.append({
            "date": d.isoformat(), "state": state,
            "editable": x["can_edit"] and live,
            "when": kelish.when(d, today, x["frame"], now) if live else None,
            "counts": cnt,
        })
    open_any = any(d["editable"] for d in out_days)
    src = listed[-1]
    lo, hi = kelish.window(src)
    last = files[src][1]
    return {
        "cell": {"id": c.id, "code": c.verifix_code, "leader_id": c.leader_id,
                 "leader": x["leader"],
                 "manager_id": c.manager_id,
                 "supervisor": x["mgr"].name if x["mgr"] else None,
                 "shift": x["mgr"].shift if x["mgr"] else None},
        "from": days[0].isoformat(),
        "to": days[-1].isoformat(),
        "this_week": kelish.week_of(now.date())[0].isoformat(),
        "today": today.isoformat(),
        "tomorrow": tomorrow.isoformat(),
        "can_edit": x["can_edit"],
        "can_roster": x["can_roster"],
        "days": out_days,
        "rows": rows,
        "removed": kelish.removed(events) if open_any and x["can_roster"] else [],
        "source": {"from": lo.isoformat(), "to": hi.isoformat(),
                   "last_upload": last.isoformat() if last else None},
        "quiet_days": kelish.QUIET_DAYS,
        "window_days": kelish.WINDOW_DAYS,
    }


@router.get("/list")
def get_list(
    cell_id: int,
    day: Optional[str] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """One cell's list for one day (default: the cell's tomorrow)."""
    x = _cell(db, payload, cell_id)
    c, today, tomorrow = x["c"], x["today"], x["tomorrow"]
    d = _day(day, tomorrow)
    if d > tomorrow:
        _refuse(400, "future", tomorrow=tomorrow.isoformat())

    fw, last = kelish.file_workers(db, d)
    events = kelish.load_events(db, [c.id]).get(c.id, [])
    marks = kelish.load_marks(db, [c.id], d).get(c.id, {})
    rows = kelish.roster(c.verifix_code, d, fw, last, events, marks)
    leader_key = identity.profile_key("leader", c.leader_id)
    for r in rows:
        r["by_other"] = bool(r["by_key"]) and r["by_key"] != leader_key
        r.pop("by_key", None)

    editable = x["can_edit"] and d in (today, tomorrow)
    lo, hi = kelish.window(d)
    return {
        "cell": {"id": c.id, "code": c.verifix_code, "leader_id": c.leader_id,
                 "leader": x["leader"],
                 "manager_id": c.manager_id,
                 "supervisor": x["mgr"].name if x["mgr"] else None,
                 "shift": x["mgr"].shift if x["mgr"] else None},
        "date": d.isoformat(),
        "today": today.isoformat(),
        "tomorrow": tomorrow.isoformat(),
        "when": kelish.when(d, today, x["frame"], x["now"]),
        "can_edit": x["can_edit"],
        "can_roster": x["can_roster"],
        "editable": editable,
        "rows": rows,
        "counts": kelish.counts(rows),
        "removed": kelish.removed(events) if editable and x["can_roster"] else [],
        "source": {"from": lo.isoformat(), "to": hi.isoformat(),
                   "last_upload": last.isoformat() if last else None},
        "quiet_days": kelish.QUIET_DAYS,
    }


# ── writes ────────────────────────────────────────────────────────────────────

class MarkIn(BaseModel):
    cell_id: int
    date: str
    key: str
    # "yes" | "no" | null — null (or "") CLEARS the mark: the third tap of the
    # empty → yes → no → empty cycle. A tab on 4.173.0 only ever sends a word.
    status: Optional[str] = None


@router.put("/mark")
def put_mark(body: MarkIn, db: Session = Depends(get_db),
             payload: dict = Depends(require_page(PAGE))):
    """Mark one worker coming (`yes`), not (`no`), or clear the mark (null) —
    today or tomorrow only."""
    x = _editable(db, payload, body.cell_id)
    d = _day(body.date, x["tomorrow"])
    if d not in (x["today"], x["tomorrow"]):
        _refuse(409, "day_locked", today=x["today"].isoformat(),
                tomorrow=x["tomorrow"].isoformat())
    status = body.status or None
    if status is not None and status not in kelish.STATUSES:
        _refuse(400, "bad_status")

    c = x["c"]
    fw, last = kelish.file_workers(db, d)
    events = kelish.load_events(db, [c.id]).get(c.id, [])
    marks = kelish.load_marks(db, [c.id], d).get(c.id, {})
    rows = kelish.roster(c.verifix_code, d, fw, last, events, marks)
    row = kelish.find(rows, body.key)
    if row is None:
        _refuse(404, "not_on_list")

    before = row["mark"]
    enrich = dict(
        target_kind="cell", target_id=c.id, target_name=c.verifix_code,
        unit_id=c.manager_id, day=d,
        details=[("cell", c.verifix_code), ("worker", row["name"])],
        changes=[("status", before or "—", status or "—")],
    )
    if status is None:
        kelish.clear_mark(db, c.id, d, row)
        action_log.enrich(**enrich)
        return {"key": row["key"], "mark": None, "by": None, "by_other": False, "at": None}

    by_key, by_name = _actor(db, payload)
    m = kelish.set_mark(db, c.id, d, row, status, by_key, by_name)
    action_log.enrich(**enrich)
    return {"key": row["key"], "mark": m.status, "by": m.set_by_name,
            "by_other": bool(m.set_by_key)
                        and m.set_by_key != identity.profile_key("leader", c.leader_id),
            "at": m.set_at.isoformat() if m.set_at else None}


class AddIn(BaseModel):
    cell_id: int
    name: str


@router.post("/workers")
def add_worker(body: AddIn, db: Session = Depends(get_db),
               payload: dict = Depends(require_page(PAGE))):
    """«+» — put a name on the cell's list from today on, until «−» takes it
    off. A name that is somebody «−» took off brings THAT worker back rather
    than adding a second row for them."""
    x = _roster_editable(db, payload, body.cell_id)
    c, today = x["c"], x["today"]
    name = kelish.clean_name(body.name)
    if len(name) < 3:
        _refuse(400, "name_required")
    key = kelish.worker_key(name)

    events = kelish.load_events(db, [c.id]).get(c.id, [])
    now_rows, next_rows = _lists(db, x, events)
    dup = next((r for r in next_rows + now_rows if kelish.same_person(r["key"], key)), None)
    if dup is not None:
        _refuse(409, "exists", name=dup["name"])

    gone = next((g for g in kelish.removed(events) if kelish.same_person(g["key"], key)), None)
    job, restored = "", False
    if gone is not None:
        key, name, job, restored = gone["key"], gone["name"], gone["job"], True

    by_key, by_name = _actor(db, payload)
    kelish.add_event(db, c.id, key, name, job, "add", today, by_key, by_name)
    db.commit()
    action_log.enrich(
        target_kind="cell", target_id=c.id, target_name=c.verifix_code,
        unit_id=c.manager_id, day=today,
        details=[("cell", c.verifix_code), ("worker", name),
                 ("mode", "restored" if restored else "added")],
    )
    return {"ok": True, "key": key, "name": name, "restored": restored}


class RemoveIn(BaseModel):
    cell_id: int
    keys: list[str]


@router.post("/workers/remove")
def remove_workers(body: RemoveIn, db: Session = Depends(get_db),
                   payload: dict = Depends(require_page(PAGE))):
    """«−» — take workers off the cell's list from today on. Their answers for
    today and tomorrow go with them; earlier days keep theirs."""
    x = _roster_editable(db, payload, body.cell_id)
    c, today = x["c"], x["today"]
    keys = list(dict.fromkeys(k for k in (body.keys or []) if k))[:_REMOVE_MAX]
    if not keys:
        _refuse(400, "nothing_selected")

    events = kelish.load_events(db, [c.id]).get(c.id, [])
    now_rows, next_rows = _lists(db, x, events)
    marked = kelish.load_marks(db, [c.id], x["tomorrow"]).get(c.id, {})
    marked_today = kelish.load_marks(db, [c.id], today).get(c.id, {})

    by_key, by_name = _actor(db, payload)
    names, dropped, seen = [], [], set()
    for k in keys:
        row = kelish.find(next_rows, k) or kelish.find(now_rows, k)
        if row is None:
            # A worker kept on a list only by a mark set earlier.
            m = marked.get(k) or marked_today.get(k)
            row = ({"key": k, "aliases": [], "name": m.worker_name, "job": ""}
                   if m else None)
        if row is None or row["key"] in seen:
            continue
        seen.add(row["key"])
        for kk in [row["key"], *row["aliases"]]:
            kelish.add_event(db, c.id, kk, row["name"], row["job"], "remove",
                             today, by_key, by_name)
            dropped.append(kk)
        names.append(row["name"])
    if not names:
        _refuse(404, "not_on_list")

    kelish.drop_marks(db, c.id, dropped, today)
    db.commit()
    action_log.enrich(
        target_kind="cell", target_id=c.id, target_name=c.verifix_code,
        unit_id=c.manager_id, day=today,
        details=[("cell", c.verifix_code), ("workers", len(names)),
                 ("worker", ", ".join(names[:25]) + ("…" if len(names) > 25 else ""))],
    )
    return {"removed": len(names), "names": names}
