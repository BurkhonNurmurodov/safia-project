"""Manual per-cell idle-time (ojidaniya) entry — a TEST input toward computing
загрузка per cell. Separate from and additive to the sheets-import
``downtime_data`` table; it does NOT replace it.

Gated by the ``idle-cell`` page (admin-only by default, grantable to
leaders/supervisors later). Reads/writes are scoped to the caller's cells —
admins/top-managers see all, a ``page.view.idle-cell`` "all" grant sees all,
supervisors/shift-managers their unit's cells, leaders their own — so opening
the page to those roles later needs no code change here."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, CellOjidaniya
from app.capabilities import page_scope_is_all, profile_unit_ids
from app.permissions import require_page
from app import identity

router = APIRouter(prefix="/api/idle-cell", tags=["idle-cell"])

PAGE = "idle-cell"

# Canonical Ojidaniya categories — mirrors backend/app/services/sheets_reader.py
# SHIFT_CATEGORIES. Each has a stopped + a not-stopped half EXCEPT Cat H, whose
# real 2nd source column is a people-count, so it carries no not-stopped value.
IDLE_CATEGORIES = ["Cat A", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
                   "Cat E", "Cat F", "Cat G", "Cat H", "Cat I"]
NS_CATEGORIES = [c for c in IDLE_CATEGORIES if c != "Cat H"]
_STOPPED_SET = set(IDLE_CATEGORIES)
_NS_SET = set(NS_CATEGORIES)


def _scoped_cells(db: Session, payload: dict) -> list[Cell]:
    """Every cell the caller may see/enter, admins = all. Built generically so a
    future ``page.view.idle-cell`` grant to a supervisor/leader Just Works: the
    same filter that admits an admin today admits a granted supervisor tomorrow."""
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


def _clean_minutes(raw: dict, allowed: set) -> dict:
    """Keep only known category keys with a positive numeric minute value."""
    out = {}
    for k, v in (raw or {}).items():
        if k not in allowed:
            continue
        try:
            n = float(v)
        except (TypeError, ValueError):
            continue
        if n > 0:
            out[k] = n
    return out


def _entry_json(e: CellOjidaniya) -> dict:
    return {
        "id": e.id,
        "by_category": e.by_category or {},
        "by_category_ns": e.by_category_ns or {},
        "total_minutes": float(e.total_minutes or 0),
        "total_minutes_ns": float(e.total_minutes_ns or 0),
        "note": e.note or "",
        "entered_by": e.entered_by_profile,
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
    }


def _cell_json(c: Cell, entry: Optional[CellOjidaniya]) -> dict:
    return {
        "cell_id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        "name_uz": c.name_workshop_uz,
        "name_uz_cyrl": c.name_workshop_uz_cyrl,
        "name_ru": c.name_workshop_ru,
        "name_en": c.name_workshop_en,
        "entry": _entry_json(entry) if entry else None,
    }


@router.get("")
def list_idle(
    date: str = Query(...),
    shift: int = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every in-scope cell plus its idle-time entry (or null) for date+shift."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    if shift not in (1, 2):
        raise HTTPException(status_code=400, detail="Invalid shift")
    cells = _scoped_cells(db, payload)
    by_cell: dict = {}
    ids = [c.id for c in cells]
    if ids:
        for e in db.query(CellOjidaniya).filter(
            CellOjidaniya.cell_id.in_(ids),
            CellOjidaniya.date == date,
            CellOjidaniya.shift == shift,
        ).all():
            by_cell[e.cell_id] = e
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    return {
        "categories": IDLE_CATEGORIES,
        "ns_categories": NS_CATEGORIES,
        "cells": [_cell_json(c, by_cell.get(c.id)) for c in cells],
    }


class IdleIn(BaseModel):
    cell_id: int
    date: str
    shift: int
    by_category: dict = Field(default_factory=dict)
    by_category_ns: dict = Field(default_factory=dict)
    note: str


@router.post("")
def save_idle(
    body: IdleIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Create or update (upsert by cell+date+shift) one idle-time entry. The note
    is required; the target cell must be in the caller's scope."""
    if not _valid_date(body.date):
        raise HTTPException(status_code=400, detail="Invalid date")
    if body.shift not in (1, 2):
        raise HTTPException(status_code=400, detail="Invalid shift")
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A note is required")

    allowed = {c.id for c in _scoped_cells(db, payload)}
    if body.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")

    stopped = _clean_minutes(body.by_category, _STOPPED_SET)
    not_stopped = _clean_minutes(body.by_category_ns, _NS_SET)
    who = identity.viewer_profile_key(db, payload)

    e = db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id == body.cell_id,
        CellOjidaniya.date == body.date,
        CellOjidaniya.shift == body.shift,
    ).first()
    if e is None:
        e = CellOjidaniya(cell_id=body.cell_id, date=body.date, shift=body.shift)
        db.add(e)
    e.by_category = stopped
    e.by_category_ns = not_stopped
    e.total_minutes = sum(stopped.values())
    e.total_minutes_ns = sum(not_stopped.values())
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
    """Clear one idle-time entry (scope-checked)."""
    e = db.query(CellOjidaniya).filter(CellOjidaniya.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    allowed = {c.id for c in _scoped_cells(db, payload)}
    if e.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    db.delete(e)
    db.commit()
