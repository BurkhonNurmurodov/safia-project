"""Manual per-cell idle-time (ojidaniya) entry — a TEST input toward computing
загрузка per cell. Separate from and additive to the sheets-import
``downtime_data`` table; it does NOT replace it.

One row per (cell, date, category): To'xtaganda (stopped) + To'xtamaganda
(not-stopped) minutes and a REQUIRED per-category note. Each category saves on
its own. The shift is a property of the cell (its supervisor's shift), so the UI
filters supervisors by shift and never stores it here.

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
from app.models import Cell, CellOjidaniya, Manager
from app.capabilities import page_cap, page_scope_is_all, profile_unit_ids
from app.capability_alerts import alert_grant_use, page_grant_used
from app.permissions import require_page
from app import identity

router = APIRouter(prefix="/api/idle-cell", tags=["idle-cell"])

PAGE = "idle-cell"

# Canonical Ojidaniya categories — mirrors backend/app/services/sheets_reader.py
# SHIFT_CATEGORIES. Cat H has no not-stopped half (its 2nd source column is a
# people-count), so To'xtamaganda is forced to 0 for it.
IDLE_CATEGORIES = ["Cat A", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
                   "Cat E", "Cat F", "Cat G", "Cat H", "Cat I"]
_VALID = set(IDLE_CATEGORIES)
_NO_NS = {"Cat H"}


def _scoped_cells(db: Session, payload: dict) -> list[Cell]:
    """Every cell the caller may see/enter, admins = all. Built generically so a
    future ``page.view.idle-cell`` grant to a supervisor/leader Just Works."""
    role = payload.get("role")
    q = db.query(Cell)
    if role in ("admin", "top-manager") or page_scope_is_all(db, payload, PAGE):
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


def _entry_json(e: CellOjidaniya) -> dict:
    return {
        "id": e.id,
        "category": e.category,
        "stopped": float(e.stopped or 0),
        "not_stopped": float(e.not_stopped or 0),
        "note": e.note or "",
        "entered_by": e.entered_by_profile,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _cell_json(c: Cell, entries: list) -> dict:
    return {
        "cell_id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        "name_uz": c.name_workshop_uz,
        "name_uz_cyrl": c.name_workshop_uz_cyrl,
        "name_ru": c.name_workshop_ru,
        "name_en": c.name_workshop_en,
        "entries": entries,
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
    cell's saved entries for the date — the accordions."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    cells = [c for c in _scoped_cells(db, payload) if c.manager_id == supervisor_id]
    if not cells:
        return {"cells": []}
    ids = [c.id for c in cells]
    by_cell: dict = defaultdict(list)
    for e in db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id.in_(ids),
        CellOjidaniya.date == date,
    ).all():
        by_cell[e.cell_id].append(_entry_json(e))
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    return {"cells": [_cell_json(c, by_cell.get(c.id, [])) for c in cells]}


class IdleIn(BaseModel):
    cell_id: int
    date: str
    category: str
    stopped: Optional[float] = 0
    not_stopped: Optional[float] = 0
    note: str


@router.post("")
def save_idle(
    body: IdleIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Create or update (upsert by cell+date+category) one category's idle-time.
    The note is required and the row must carry at least one minute value."""
    if not _valid_date(body.date):
        raise HTTPException(status_code=400, detail="Invalid date")
    if body.category not in _VALID:
        raise HTTPException(status_code=400, detail="Invalid category")
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A note is required")
    allowed = {c.id for c in _scoped_cells(db, payload)}
    if body.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")

    stopped = max(0.0, float(body.stopped or 0))
    not_stopped = 0.0 if body.category in _NO_NS else max(0.0, float(body.not_stopped or 0))
    if stopped <= 0 and not_stopped <= 0:
        raise HTTPException(status_code=400, detail="Enter at least one minute value")

    who = identity.viewer_profile_key(db, payload)
    e = db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id == body.cell_id,
        CellOjidaniya.date == body.date,
        CellOjidaniya.category == body.category,
    ).first()
    if e is None:
        e = CellOjidaniya(cell_id=body.cell_id, date=body.date, category=body.category)
        db.add(e)
    e.stopped = stopped
    e.not_stopped = not_stopped
    e.note = note
    e.entered_by_profile = who
    db.commit()
    db.refresh(e)
    return _entry_json(e)


@router.delete("/{entry_id}", status_code=204)
def delete_idle(
    entry_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Clear one category's idle-time entry (scope-checked)."""
    e = db.query(CellOjidaniya).filter(CellOjidaniya.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    allowed = {c.id for c in _scoped_cells(db, payload)}
    if e.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    db.delete(e)
    db.commit()
