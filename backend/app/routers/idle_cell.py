"""Manual per-cell idle-time (ojidaniya) entry — a TEST input toward computing
загрузка per cell. Separate from and additive to the sheets-import
``downtime_data`` table; it does NOT replace it.

**An ojidaniya is an EVENT with a start and an end** (from 2026-08-20). Several
per (cell, date, category): a cell may wait on the same cause twice in a day,
and each stint carries its own required reason and its own To'xtaganda /
To'xtamaganda answer — whether the cell actually stopped working for THAT one.

The change exists to fix an arithmetic error, not to add a field. Entries used
to be minutes only, which makes overlapping causes unrepresentable: two
categories waiting on the same wall-clock stretch were added together, so one
30-minute stop filed under two reasons was reported as 60. With endpoints on
record the total is the UNION of the ranges, and ``services/idle_intervals.py``
is the ONE place that arithmetic lives — every figure this router returns comes
from ``summarize()``, including the over-count the old method would have
produced, so the correction is visible rather than merely applied.

Rows filed before the change survive in ``cell_ojidaniya`` and are served as
``legacy_entries``: readable and deletable, never editable, and never added into
the union — they carry no times, so nothing can de-duplicate them.

The daily-actual «Perenaladka» entry that used to be this page's second tab
lives on the Setup-times page now (routers/setup_times.py «Fakt» endpoints);
this router is Ojidaniya-only.

Gated by the ``idle-cell`` page (admin-only by default, grantable later).
Reads/writes are scoped to the caller's cells — admins/top-managers see all, a
``page.view.idle-cell`` "all" grant sees all, supervisors/shift-managers their
unit's cells, leaders their own."""
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, CellOjidaniya, CellOjidaniyaInterval, Manager, RoleProfile
from app.capabilities import page_cap, page_scope_is_all, profile_unit_ids
from app.capability_alerts import alert_grant_use, page_grant_used
from app.permissions import require_page
from app.services import idle_intervals
from app import identity

router = APIRouter(prefix="/api/idle-cell", tags=["idle-cell"])

PAGE = "idle-cell"

# Canonical Ojidaniya categories — mirrors backend/app/services/sheets_reader.py
# SHIFT_CATEGORY_ORDER. Cat H never had a To'xtamaganda half (its 2nd source
# column is a people-count), so an ojidaniya on it is always a real stop.
IDLE_CATEGORIES = ["Cat A", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
                   "Cat E", "Cat F", "Cat G", "Cat H", "Cat I"]
_VALID = set(IDLE_CATEGORIES)
_ALWAYS_STOPPED = {"Cat H"}


def _scoped_cells(db: Session, payload: dict, *pages: str) -> list[Cell]:
    """Every cell the caller may see/enter, admins = all. Built generically so a
    future ``page.view.idle-cell`` grant to a supervisor/leader Just Works.
    `pages` = which pages' "all"-scope grants widen the view, ANY of them. The
    changeover («Perenaladka») data is reachable from two pages, so its call
    sites pass both — a viewer granted "all" on either door sees every cell
    through it, otherwise a grant on one page would be silently narrowed by the
    other's absence."""
    role = payload.get("role")
    page_list = pages or (PAGE,)
    q = db.query(Cell)
    if role in ("admin", "top-manager") or any(page_scope_is_all(db, payload, p) for p in page_list):
        return q.all()
    if role == "leader":
        lpid = identity.viewer_leader_profile_id(db, payload)
        return q.filter(Cell.leader_id == lpid).all() if lpid else []
    units = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
    if units is None:      # unrestricted-by-unit fallback (safety)
        return q.all()
    if not units:
        return []
    return q.filter(Cell.manager_id.in_(units)).all()


def _valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def _interval_json(e: CellOjidaniyaInterval) -> dict:
    """One ojidaniya event. ``minutes`` and ``next_day`` are DERIVED here rather
    than on the client so the midnight rule (end <= start ⇒ next day) has one
    definition; a range the client measured differently would show a duration
    that disagrees with the total printed beside it."""
    return {
        "id": e.id,
        "category": e.category,
        "start": e.start,
        "end": e.end,
        "stopped": bool(e.stopped),
        "note": e.note or "",
        "minutes": idle_intervals.duration(e.start, e.end),
        "next_day": idle_intervals.to_min(e.end) <= idle_intervals.to_min(e.start),
        "entered_by": e.entered_by_profile,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _legacy_json(e: CellOjidaniya) -> dict:
    """A pre-2026-08-20 minutes-only row. Read-only, and deliberately NOT folded
    into the union: with no start or end there is no way to know which of its
    minutes another entry already counted."""
    return {
        "id": e.id,
        "category": e.category,
        "stopped": float(e.stopped or 0),
        "not_stopped": float(e.not_stopped or 0),
        "note": e.note or "",
        "entered_by": e.entered_by_profile,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _cell_json(c: Cell, intervals: list, legacy: list, leader: Optional[str] = None) -> dict:
    return {
        "cell_id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        "name_uz": c.name_workshop_uz,
        "name_uz_cyrl": c.name_workshop_uz_cyrl,
        "name_ru": c.name_workshop_ru,
        "name_en": c.name_workshop_en,
        # The cell's owning leader (role_profiles) — canonical uz-Latin name, the
        # UI transliterates it. Nearly 1:1 with cells, so the page shows it per
        # row and filters by it rather than grouping. NULL = unassigned.
        "leader_id": c.leader_id,
        "leader": leader,
        "intervals": intervals,
        "legacy_entries": legacy,
        # The whole ledger for this cell-day, computed in ONE place.
        "summary": idle_intervals.summarize(intervals),
    }


@router.get("/supervisors")
def list_supervisors(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Supervisors (units) that own cells in the caller's scope, with their shift
    — the toolbar's supervisor picker (the All/1/2 shift tabs filter it)."""
    cells = _scoped_cells(db, payload)
    ids = {c.manager_id for c in cells if c.manager_id}
    if not ids:
        return []
    mgrs = db.query(Manager).filter(Manager.id.in_(ids), Manager.archived == False).all()  # noqa: E712
    mgrs.sort(key=lambda m: (m.shift or 0, (m.name or "").lower()))
    return [{"id": m.id, "name": m.name, "shift": m.shift} for m in mgrs]


@router.get("/cells")
def list_cells(
    supervisor_id: int = Query(...),
    date: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Cells under one supervisor (must be in the caller's scope) plus each
    cell's ojidaniya events for the date, its read-only legacy rows, and the
    computed summary."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    cells = [c for c in _scoped_cells(db, payload) if c.manager_id == supervisor_id]
    if not cells:
        return {"cells": []}
    ids = [c.id for c in cells]

    by_cell: dict = defaultdict(list)
    for e in db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.cell_id.in_(ids),
        CellOjidaniyaInterval.date == date,
    ).all():
        by_cell[e.cell_id].append(_interval_json(e))
    # Chronological — an event log read in any other order stops being a log.
    for rows in by_cell.values():
        rows.sort(key=lambda r: (idle_intervals.to_min(r["start"]), r["end"]))

    legacy_by_cell: dict = defaultdict(list)
    for e in db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id.in_(ids),
        CellOjidaniya.date == date,
    ).all():
        legacy_by_cell[e.cell_id].append(_legacy_json(e))

    lids = {c.leader_id for c in cells if c.leader_id}
    leaders = {p.id: p.name for p in db.query(RoleProfile).filter(
        RoleProfile.id.in_(lids),
    ).all()} if lids else {}
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    return {"cells": [
        _cell_json(c, by_cell.get(c.id, []), legacy_by_cell.get(c.id, []),
                   leaders.get(c.leader_id))
        for c in cells
    ]}


class IntervalIn(BaseModel):
    cell_id: int
    date: str
    category: str
    start: str
    end: str
    stopped: bool = True
    note: str


def _validate(body: IntervalIn, db: Session, payload: dict) -> tuple[str, bool, int]:
    """Everything an ojidaniya must satisfy, in one place — both writers call it.
    The UI makes each of these unpickable rather than merely rejected, but the
    endpoint is reachable without the UI, so it re-decides all of them."""
    if not _valid_date(body.date):
        raise HTTPException(status_code=400, detail="Invalid date")
    if body.category not in _VALID:
        raise HTTPException(status_code=400, detail="Invalid category")
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reason is required")
    s, e = idle_intervals.to_min(body.start), idle_intervals.to_min(body.end)
    if s is None or e is None:
        raise HTTPException(status_code=400, detail="Invalid time")
    # end == start would otherwise be carried past midnight into a silent
    # 24-hour stop — the one range no operator ever means to file.
    if s == e:
        raise HTTPException(status_code=400, detail="The end must differ from the start")
    if body.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    # Cat H has no not-stopped half; forcing it here keeps the one category that
    # cannot answer the question from carrying a meaningless answer.
    stopped = True if body.category in _ALWAYS_STOPPED else bool(body.stopped)
    return note, stopped, idle_intervals.duration(body.start, body.end)


def _alert(db: Session, payload: dict, cell_id: int, date: str, key: str, changes: list):
    """This page opens for non-admins only through role×page ticks or a personal
    page grant — the latter is a delegated power, so its use warns the admins."""
    if not page_grant_used(db, payload, PAGE):
        return
    cell = db.query(Cell).filter_by(id=cell_id).first()
    alert_grant_use(
        db, payload, page_cap(PAGE), key,
        details=[("cell", cell.verifix_code if cell else f"#{cell_id}"), ("date", date)],
        changes=changes, native=False,
    )


@router.post("/intervals")
def create_interval(
    body: IntervalIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Log one ojidaniya. Overlapping an existing one is ALLOWED and expected —
    a cell can genuinely be waiting on two causes at once, and the union is what
    keeps the shared minutes from being counted twice."""
    note, stopped, _ = _validate(body, db, payload)
    e = CellOjidaniyaInterval(
        cell_id=body.cell_id, date=body.date, category=body.category,
        start=body.start, end=body.end, stopped=stopped, note=note,
        entered_by_profile=identity.viewer_profile_key(db, payload),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    _alert(db, payload, e.cell_id, e.date, "idle_cell.interval_added",
           [("category", None, e.category), ("time", None, f"{e.start}–{e.end}"),
            ("note", None, e.note)])
    return _interval_json(e)


@router.put("/intervals/{interval_id}")
def update_interval(
    interval_id: int,
    body: IntervalIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Correct one ojidaniya in place. The cell it belongs to is checked twice —
    the row's own cell and the body's — so an edit can never walk an entry into
    a cell the caller may write to from one the caller may not read."""
    e = db.query(CellOjidaniyaInterval).filter(CellOjidaniyaInterval.id == interval_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    note, stopped, _ = _validate(body, db, payload)
    old = (e.category, f"{e.start}–{e.end}", bool(e.stopped), e.note or "")
    e.category, e.start, e.end = body.category, body.start, body.end
    e.stopped, e.note = stopped, note
    e.entered_by_profile = identity.viewer_profile_key(db, payload)
    db.commit()
    db.refresh(e)
    new = (e.category, f"{e.start}–{e.end}", bool(e.stopped), e.note or "")
    diff = [(k, o, n) for k, o, n in
            zip(("category", "time", "stopped", "note"), old, new) if o != n]
    if diff:
        _alert(db, payload, e.cell_id, e.date, "idle_cell.interval_edited", diff)
    return _interval_json(e)


@router.delete("/intervals/{interval_id}", status_code=204)
def delete_interval(
    interval_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Remove one ojidaniya (scope-checked)."""
    e = db.query(CellOjidaniyaInterval).filter(CellOjidaniyaInterval.id == interval_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    # Snapshot before the delete — the row is unreadable after commit.
    cell_id, date = e.cell_id, e.date
    changes = [("category", e.category, None), ("time", f"{e.start}–{e.end}", None),
               ("note", e.note or "", None)]
    db.delete(e)
    db.commit()
    _alert(db, payload, cell_id, date, "idle_cell.interval_deleted", changes)


@router.delete("/{entry_id}", status_code=204)
def delete_legacy(
    entry_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Retire one pre-2026-08-20 minutes-only row (scope-checked). There is no
    writer for that table any more: a row with no start and no end cannot be
    de-duplicated against anything, so the only honest operations left on it are
    reading it and replacing it with real ranges."""
    e = db.query(CellOjidaniya).filter(CellOjidaniya.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    cell_id, date = e.cell_id, str(e.date)
    changes = [("stopped", float(e.stopped or 0), None),
               ("not_stopped", float(e.not_stopped or 0), None),
               ("note", e.note or "", None)]
    db.delete(e)
    db.commit()
    _alert(db, payload, cell_id, date, "idle_cell.deleted", changes)
