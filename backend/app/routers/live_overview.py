"""
`GET /api/live-overview` — the one door behind the `/live` wall screen.

This module FETCHES; `services/live_overview.py` computes. The split is the
same one `ojidaniya_deck` and `ojidaniya_matrix` keep: the router gathers what
the page's own readers already store and hands plain structures to a pure
`build()`, so nothing in `services/` imports a router and every figure can be
traced to the table it came from.

Scope, in this order:

  * a SHIFT-MANAGER is locked to their own shift ∩ plant (`shift_scope`), a
    supervisor or a leader to their own unit — whatever `?shift=` says;
  * everyone else (admin, top-manager) picks a shift, defaulting to the one
    running now, and the plant follows the global switcher through
    `factory_scope.scoped_manager_ids`, which also applies the viewer lock;
  * `?date=` replays a finished day — admins and top-managers only — for
    looking at the screen when no shift is running. It is never live.

Page key ``live``: admin-only by default (`permissions.DEFAULT_PAGE_ACCESS`),
opened from the Access tab when the operator decides. Read-only, no action-log
route: it writes nothing.
"""
from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Attendance, Cell, CellOjidaniyaInterval, Manager, PPDaily, PPLineDaily,
    PPProduct, RoleProfile,
)
from app.permissions import require_page
from app.services import cell_hours, idle_source, live_overview, shift_scope
from app.services.cell_lookup import by_sap, resolve_sap
from app.services.day_state import day_state
from app.services.factory_scope import (
    empty_scope, resolve_factory, scoped_manager_ids, viewer_factory_id,
)
# The one headcount predicate the загрузка weighs cells by. Imported rather than
# re-spelled: a second reading of "who counts as a person in this cell" is how
# this screen and /downtime would start disagreeing about the same morning.
from app.services.idle_source import _counted_hc
from app.services.pp_calc import daily_key, line_keys, line_minutes

router = APIRouter(prefix="/api/live-overview", tags=["live-overview"])

PAGE = "live"
_SEC_PER_MIN = 60.0


def _own_scope(db: Session, payload: dict):
    """(unit ids the caller is locked to or None, the shift that lock implies or None)."""
    role = payload.get("role")
    rid = payload.get("role_id")
    if role == "shift-manager":
        return shift_scope.unit_ids(db, rid), shift_scope.shift_of(db, rid)
    if role in ("supervisor", "leader"):
        # A supervisor's role_id IS the unit; a leader's role_id is their UNIT too
        # (identity.py) — both read their own brigadir's board and nothing else.
        try:
            mid = int(rid) if rid is not None else None
        except (TypeError, ValueError):
            mid = None
        if not mid:
            return [], None
        m = db.query(Manager.shift).filter(Manager.id == mid).first()
        return [mid], (m.shift if m else None)
    return None, None


def _plan_inputs(db: Session, unit_ids: list, day: date):
    """ПЛАН / ФАКТ minutes per unit and per work centre, read exactly as the
    Positions table and /zagruzka-cell read them (`pp_calc.line_minutes`)."""
    plan_by_unit: dict = {}
    wc_plan: dict = {}
    if not unit_ids:
        return plan_by_unit, wc_plan
    prods = db.query(PPProduct).filter(PPProduct.manager_id.in_(unit_ids)).all()
    dailies = db.query(PPDaily).filter(
        PPDaily.manager_id.in_(unit_ids), PPDaily.date == day).all()
    lines = db.query(PPLineDaily).filter(
        PPLineDaily.manager_id.in_(unit_ids), PPLineDaily.date == day).all()
    by_prod: dict = defaultdict(list)
    for p in prods:
        by_prod[int(p.manager_id)].append(p)
    by_daily: dict = defaultdict(list)
    for d in dailies:
        by_daily[int(d.manager_id)].append(d)
    by_line: dict = defaultdict(list)
    for lo in lines:
        by_line[int(lo.manager_id)].append(lo)

    for uid in unit_ids:
        ups = by_prod.get(uid, [])
        # The line identity is read off EVERY line of the unit, active or not —
        # pp_calc.line_keys' own rule, or a stored per-line value re-points the
        # moment a line above it is unticked.
        keys = line_keys(ups)
        lines_by_key: dict = defaultdict(list)
        for p in ups:
            if not p.active or p.labor_time is None:
                continue
            lines_by_key[(p.work_center, daily_key(p.sap_code, p.name))].append(
                (keys.get(p.id, ""), float(p.labor_time)))
        shared: dict = {}
        updated = None
        for d in by_daily.get(uid, []):
            shared[(d.work_center, d.sap_code, d.date)] = (
                float((d.plan_override if d.plan_override is not None else d.plan_qty) or 0),
                float((d.actual_override if d.actual_override is not None else d.actual_qty) or 0),
            )
            if d.updated_at is not None and (updated is None or d.updated_at > updated):
                updated = d.updated_at
        per_line: dict = {}
        for lo in by_line.get(uid, []):
            per_line[(lo.work_center, lo.qty_key, lo.date, lo.line_key)] = (
                (float(lo.plan_override) if lo.plan_override is not None else None),
                (float(lo.actual_override) if lo.actual_override is not None else None),
            )
            if lo.updated_at is not None and (updated is None or lo.updated_at > updated):
                updated = lo.updated_at
        pm, am = line_minutes(lines_by_key, shared, per_line, _SEC_PER_MIN)
        for (wc, d), v in pm.items():
            wc_plan[(uid, wc)] = (float(v), float(am.get((wc, d), 0.0)))
        plan_by_unit[uid] = {
            "plan_min": float(sum(pm.values())),
            "actual_min": float(sum(am.values())),
            "updated_at": updated,
            "configured": bool(ups) or bool(by_daily.get(uid)),
        }
    return plan_by_unit, wc_plan


@router.get("")
def get_live_overview(
    shift: Optional[int] = Query(None),
    factory: Optional[int] = Query(None),
    date_str: Optional[str] = Query(None, alias="date"),
    payload: dict = Depends(require_page(PAGE)),
    db: Session = Depends(get_db),
):
    now = live_overview.now_local()
    defs = cell_hours.defaults(db)
    frames = {s: live_overview.shift_frame(now, s, defs[s]) for s in (1, 2)}

    own, locked_shift = _own_scope(db, payload)
    if locked_shift in (1, 2):
        shift_n = locked_shift
    elif shift in (1, 2):
        shift_n = shift
    else:
        shift_n = live_overview.pick_shift(frames)
    frame = frames[shift_n]

    replay = None
    if date_str and payload.get("role") in ("admin", "top-manager"):
        try:
            d = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date")
        if d.isoformat() != frame["day"]:
            if d > date.fromisoformat(frame["day"]):
                raise HTTPException(status_code=400, detail="That day has not started yet")
            frame = live_overview.replay_frame(d, shift_n, defs[shift_n])
            replay = d.isoformat()
    day = date.fromisoformat(frame["day"])

    ids = scoped_manager_ids(db, payload, factory, own)
    q = db.query(Manager).filter(Manager.archived.is_(False), Manager.shift == shift_n)
    if own is not None and not own:
        managers = []
    elif empty_scope(ids):
        managers = []
    elif ids is not None:
        managers = q.filter(Manager.id.in_(ids)).all()
    else:
        managers = q.all()
    managers.sort(key=lambda m: (m.name or "").lower())
    unit_ids = [int(m.id) for m in managers]
    unit_set = set(unit_ids)

    # ── Cells + leaders ──────────────────────────────────────────────────
    cells_rows = db.query(Cell).filter(Cell.manager_id.in_(unit_ids)).all() if unit_ids else []
    lids = {c.leader_id for c in cells_rows if c.leader_id}
    leaders = {}
    if lids:
        leaders = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
                   .filter(RoleProfile.id.in_(list(lids))).all()}
    cells = [{"id": c.id, "code": c.verifix_code, "unit_id": int(c.manager_id),
              "leader": leaders.get(c.leader_id)} for c in cells_rows]
    cell_ids = [c.id for c in cells_rows]
    cell_id_set = set(cell_ids)
    codes = [c.verifix_code for c in cells_rows if c.verifix_code]
    code_to_cell = {c.verifix_code: c.id for c in cells_rows if c.verifix_code}
    iso = frame["day"]

    # ── Filed waiting: the same rows /idle-cell writes and idle_source reads ─
    intervals_by_cell: dict = defaultdict(list)
    if cell_ids:
        for iv in db.query(CellOjidaniyaInterval).filter(
            CellOjidaniyaInterval.cell_id.in_(cell_ids),
            CellOjidaniyaInterval.date == iso,
            CellOjidaniyaInterval.status == "approved",
        ).all():
            intervals_by_cell[iv.cell_id].append({
                "category": iv.category, "start": iv.start, "end": iv.end,
                "stopped": bool(iv.stopped), "note": iv.note,
            })

    # ── Who is standing where today ──────────────────────────────────────
    unit_people: dict = defaultdict(float)
    cell_people: dict = defaultdict(float)
    att_uploaded: dict = {}
    if unit_ids:
        conds = [Attendance.manager_id.in_(unit_ids)]
        if codes:
            conds.append(Attendance.verifix_code.in_(codes))
        rows = db.query(
            Attendance.manager_id, Attendance.verifix_code, Attendance.job_title,
            Attendance.hours_worked, Attendance.is_supervisor,
            Attendance.worker_name, Attendance.hc_weight,
        ).filter(Attendance.date == day, or_(*conds)).all()
        for r in rows:
            mid = int(r.manager_id) if r.manager_id is not None else None
            if mid in unit_set:
                att_uploaded[mid] = True
            if r.is_supervisor or not _counted_hc(r):
                continue
            w = 1.0 if r.hc_weight is None else float(r.hc_weight)
            if mid in unit_set:
                unit_people[mid] += w
            cid = code_to_cell.get(r.verifix_code)
            if cid is not None:
                cell_people[cid] += w

    # The platform's own unit figure (headcount-weighted mean of its cells).
    idle_unit = idle_source.unit_downtime(db, unit_ids, day, day) if unit_ids else {}

    # ── ПЛАН / ФАКТ ──────────────────────────────────────────────────────
    plan_by_unit, wc_plan = _plan_inputs(db, unit_ids, day)
    wc_cell: dict = {}
    if wc_plan:
        sap_tbl = by_sap(db)
        for (_uid, wc) in wc_plan:
            if wc in wc_cell:
                continue
            cd = resolve_sap(sap_tbl, wc)
            if cd and cd["id"] in cell_id_set:
                wc_cell[wc] = cd["id"]

    day_closed = {uid: day_state(db, uid, day)[0] != "open" for uid in unit_ids}

    data = live_overview.build(
        frame=frame, now=now,
        units=[{"id": int(m.id), "name": m.name, "shift": m.shift,
                "factory_id": m.factory_id} for m in managers],
        cells=cells,
        intervals_by_cell=intervals_by_cell,
        unit_people=unit_people, cell_people=cell_people,
        idle_unit=idle_unit,
        plan_by_unit=plan_by_unit, wc_plan=wc_plan, wc_cell=wc_cell,
        day_closed=day_closed, att_uploaded=att_uploaded,
    )
    data["shifts"] = {
        s: {k: f[k] for k in ("start", "end", "state", "day", "progress")}
        for s, f in frames.items()
    }
    data["scope"] = {
        "shift": shift_n,
        "shift_locked": locked_shift in (1, 2),
        "factory": resolve_factory(db, payload, factory),
        "factory_locked": viewer_factory_id(db, payload) is not None,
        "units": len(unit_ids),
        "replay": replay,
        "can_replay": payload.get("role") in ("admin", "top-manager"),
    }
    return data
