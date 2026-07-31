"""Per-CELL attendance viewer — the read side of the «Отчёт по посещениям
сотрудников» export ingested by the admin «Attendance by cell» upload tab.

Mirrors the Staff (verifix) page's Workers tab, but keyed by CELL instead of by
supervisor, and read-only: no HR documents, no requests, no approvals. The data
lives in the isolated TEST table ``cell_attendance`` and feeds the future
per-cell zagruzka; it does NOT touch the per-manager ``attendance`` flow.

Scoping mirrors idle_cell.py: admins/top-managers and a ``page.view.cell-attendance``
"all" grant see every cell, supervisors/shift-managers their unit's cells,
leaders their own. Rows whose «Код подразделения» matched no cell (cell_id NULL)
are only visible to the all-scope viewers — nobody else can be shown to own them.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, CellAttendance, Manager, RoleProfile
from app.capabilities import page_scope_is_all, profile_unit_ids
from app.permissions import require_page
from app import identity

router = APIRouter(prefix="/api/cell-attendance", tags=["cell-attendance"])

PAGE = "cell-attendance"

# Newest N dates offered by the day picker — the register grows one row per
# worker per day, so an unbounded DISTINCT would only ever get longer.
DATE_LIMIT = 180


def _scope(db: Session, payload: dict) -> tuple[list[Cell], bool]:
    """(cells the caller may see, sees_everything). The flag is what decides
    whether unmatched-code rows are included — they belong to no cell."""
    role = payload.get("role")
    q = db.query(Cell)
    if role in ("admin", "top-manager") or page_scope_is_all(db, payload, PAGE):
        return q.all(), True
    if role == "leader":
        lpid = identity.viewer_leader_profile_id(db, payload)
        return (q.filter(Cell.leader_id == lpid).all() if lpid else []), False
    units = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
    if units is None:            # unrestricted-by-unit fallback (safety)
        return q.all(), True
    if not units:
        return [], False
    return q.filter(Cell.manager_id.in_(units)).all(), False


def _valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def _num(v):
    return float(v) if v is not None else None


@router.get("/dates")
def list_dates(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Days that actually have rows in the caller's scope, newest first — the
    date picker only offers days the viewer can open."""
    cells, sees_all = _scope(db, payload)
    ids = [c.id for c in cells]
    if not ids and not sees_all:
        return []
    q = db.query(CellAttendance.date, func.count(CellAttendance.id))
    if not sees_all:
        q = q.filter(CellAttendance.cell_id.in_(ids))
    rows = q.group_by(CellAttendance.date).order_by(CellAttendance.date.desc()).limit(DATE_LIMIT).all()
    return [{"date": d.isoformat(), "rows": n} for d, n in rows]


@router.get("")
def day_attendance(
    date: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every attendance row for one day in the caller's scope, plus the cell
    catalog (verifix code, 4-lang workshop name, supervisor) the page groups and
    filters by. One payload per day — the whole factory is ≈1k rows."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")

    cells, sees_all = _scope(db, payload)
    ids = [c.id for c in cells]
    if not ids and not sees_all:
        return {"date": date, "cells": [], "rows": []}

    q = db.query(CellAttendance).filter(CellAttendance.date == date)
    if not sees_all:
        q = q.filter(CellAttendance.cell_id.in_(ids))
    rows = q.all()

    # Owner names — canonical spellings; the page transliterates them per the
    # viewer's language, exactly like the cell registry does.
    mgr_names = {}
    mgr_ids = {c.manager_id for c in cells if c.manager_id}
    if mgr_ids:
        mgr_names = {
            m.id: m.name
            for m in db.query(Manager).filter(Manager.id.in_(mgr_ids)).all()
        }
    leader_names = {}
    leader_ids = {c.leader_id for c in cells if c.leader_id}
    if leader_ids:
        leader_names = {
            p.id: p.name
            for p in db.query(RoleProfile).filter(RoleProfile.id.in_(leader_ids)).all()
        }

    # Only the cells that carry rows today — an empty cell would just be noise
    # in the picker. Unmatched codes ride along as code-only pseudo-cells so the
    # rows they own stay reachable (and visibly flagged) instead of vanishing.
    present = {r.cell_id for r in rows if r.cell_id is not None}
    cell_json = [
        {
            "cell_id":      c.id,
            "verifix_code": c.verifix_code,
            "sap_code":     c.sap_code,
            "name_uz":      c.name_workshop_uz,
            "name_uz_cyrl": c.name_workshop_uz_cyrl,
            "name_ru":      c.name_workshop_ru,
            "name_en":      c.name_workshop_en,
            "manager_id":   c.manager_id,
            "manager_name": mgr_names.get(c.manager_id),
            "leader_id":    c.leader_id,
            "leader_name":  leader_names.get(c.leader_id),
            "in_load":      bool(c.in_load),
            "unmatched":    False,
        }
        for c in cells if c.id in present
    ]
    if sees_all:
        # No cell record ⇒ nobody could have ticked it ⇒ never in the load.
        for code in sorted({r.verifix_code or "" for r in rows if r.cell_id is None}):
            cell_json.append({
                "cell_id": None, "verifix_code": code or None, "sap_code": None,
                "name_uz": None, "name_uz_cyrl": None, "name_ru": None, "name_en": None,
                "manager_id": None, "manager_name": None,
                "leader_id": None, "leader_name": None,
                "in_load": False, "unmatched": True,
            })
    cell_json.sort(key=lambda c: (c["unmatched"], (c["verifix_code"] or "zzz").lower()))

    return {
        "date": date,
        "cells": cell_json,
        "rows": [
            {
                "id":                r.id,
                "cell_id":           r.cell_id,
                "verifix_code":      r.verifix_code,
                "worker_name":       r.worker_name,
                "job_title":         r.job_title,
                "schedule":          r.schedule,
                "day_raw":           r.day_raw,
                "clock_in":          r.clock_in,
                "clock_out":         r.clock_out,
                "hours_worked":      _num(r.hours_worked),
                "early_arrival_min": _num(r.early_arrival_min),
                "effective_hours":   _num(r.effective_hours),
                "status":            r.status,
            }
            for r in rows
        ],
    }
