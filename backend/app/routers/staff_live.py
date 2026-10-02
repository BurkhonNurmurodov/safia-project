"""The LIVE «Verifix to'g'irlash» (lab) — `/staff-live`, admin-only.

The doors over ``app.services.verifix_live``: a unit's day as Verifix tells it
right now, the changes made on it (move · role · cell), their approval, and a
day closed by hand. Every write lands in the lab's own tables
(`live_staff_events`, `live_day_closes`); nothing on the real /staff, the
attendance, the documents or the загрузка reads them.

ADMIN-ONLY, checked on every endpoint: the page reads every unit's people
through the Verifix login on the «Verifix» admin card.
"""
import logging
import re
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LiveDayClose, LiveStaffEvent, Manager
from app.routers.admin import verify_admin
from app.services import action_log, verifix_live
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/staff-live", tags=["staff-live"])

log = logging.getLogger(__name__)

_HHMM = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
KINDS = ("move", "role", "cell")


def _who(admin: dict) -> str:
    return (admin.get("full_name") or admin.get("username")
            or str(admin.get("telegram_id") or "admin"))


def _unit(db: Session, manager_id: Optional[int]) -> Manager:
    m = db.query(Manager).filter(Manager.id == manager_id).first() if manager_id else None
    if not m or m.archived:
        raise HTTPException(status_code=400, detail="unknown unit")
    return m


@router.get("/meta")
def live_meta(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return verifix_live.meta(db)


@router.get("/view")
def live_view(manager_id: int, day: Optional[date] = None, force: bool = False,
              db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return verifix_live.unit_view(db, manager_id, day, force=force)


@router.get("/events")
def live_events(day: date, manager_id: Optional[int] = None,
                db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return verifix_live.events_for(db, day, manager_id)


class EventIn(BaseModel):
    day: date
    employee_id: str = Field(max_length=40)
    worker_name: Optional[str] = Field(default=None, max_length=200)
    kind: str
    at: str = Field(max_length=5)                       # "HH:MM" on the shift-day
    from_manager_id: int
    to_manager_id: Optional[int] = None
    from_cell: Optional[str] = Field(default=None, max_length=20)
    to_cell: Optional[str] = Field(default=None, max_length=20)
    from_role: Optional[str] = Field(default=None, max_length=200)
    to_role: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = Field(default=None, max_length=500)


def _unit_cells(db: Session, manager_id: int) -> set[str]:
    from app.models import Cell
    return {c for (c,) in db.query(Cell.verifix_code).filter(Cell.manager_id == manager_id).all() if c}


@router.post("/events")
def create_event(body: EventIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    if body.kind not in KINDS:
        raise HTTPException(status_code=400, detail="kind must be move, role or cell")
    if not _HHMM.match(body.at or ""):
        raise HTTPException(status_code=400, detail="time must be HH:MM")
    src = _unit(db, body.from_manager_id)
    ev = LiveStaffEvent(
        day=body.day, employee_id=body.employee_id.strip(), worker_name=body.worker_name,
        kind=body.kind, at=verifix_live.event_at(db, body.day, src.shift, body.at),
        from_manager_id=src.id, from_cell=body.from_cell, from_role=body.from_role,
        note=(body.note or "").strip() or None, created_by_name=_who(admin),
    )
    if body.kind == "move":
        dst = _unit(db, body.to_manager_id)
        if dst.id == src.id:
            raise HTTPException(status_code=400, detail="the worker is already in this unit")
        if body.to_cell and body.to_cell not in _unit_cells(db, dst.id):
            raise HTTPException(status_code=400, detail="that cell is not the receiving unit's")
        ev.to_manager_id, ev.to_cell, ev.status = dst.id, body.to_cell or None, "pending"
    elif body.kind == "role":
        if not (body.to_role or "").strip():
            raise HTTPException(status_code=400, detail="the new role is required")
        ev.to_manager_id, ev.to_role, ev.status = src.id, body.to_role.strip(), "pending"
    else:
        # A placement inside the unit is the unit's own business — no approval,
        # as on the real «Yacheykalar» tab.
        if not body.to_cell or body.to_cell not in _unit_cells(db, src.id):
            raise HTTPException(status_code=400, detail="pick one of this unit's cells")
        ev.to_manager_id, ev.to_cell, ev.status = src.id, body.to_cell, "approved"
        ev.decided_by_name, ev.decided_at = _who(admin), datetime.now(timezone.utc)
    db.add(ev)
    db.commit()
    action_log.enrich(target_kind="live_event", target_id=str(ev.id), target_name=body.worker_name,
                      day=body.day,
                      details=[("kind", body.kind), ("at", body.at), ("status", ev.status)])
    return {"ok": True, "id": ev.id, "status": ev.status}


class DecideIn(BaseModel):
    action: str
    to_cell: Optional[str] = Field(default=None, max_length=20)


@router.post("/events/{event_id}/decide")
def decide_event(event_id: int, body: DecideIn, db: Session = Depends(get_db),
                 admin: dict = Depends(verify_admin)):
    ev = db.query(LiveStaffEvent).filter(LiveStaffEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="not found")
    if ev.status != "pending":
        raise HTTPException(status_code=409, detail="already decided")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")
    if body.action == "approve" and ev.kind == "move":
        # Decision 6: the receiving side names the cell, so nobody arrives cell-less.
        cell = body.to_cell or ev.to_cell
        if not cell or cell not in _unit_cells(db, ev.to_manager_id):
            raise HTTPException(status_code=400, detail="pick the receiving cell")
        ev.to_cell = cell
    ev.status = "approved" if body.action == "approve" else "rejected"
    ev.decided_by_name, ev.decided_at = _who(admin), datetime.now(timezone.utc)
    db.commit()
    action_log.enrich(target_kind="live_event", target_id=str(ev.id), target_name=ev.worker_name,
                      day=ev.day, details=[("kind", ev.kind), ("decision", ev.status)])
    return {"ok": True, "status": ev.status}


@router.delete("/events/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    ev = db.query(LiveStaffEvent).filter(LiveStaffEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="not found")
    action_log.enrich(target_kind="live_event", target_id=str(ev.id), target_name=ev.worker_name,
                      day=ev.day, details=[("kind", ev.kind), ("status", ev.status)])
    db.delete(ev)
    db.commit()
    return {"ok": True}


class CloseIn(BaseModel):
    manager_id: int
    day: date


@router.post("/close")
def close_day(body: CloseIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    unit = _unit(db, body.manager_id)
    row = (db.query(LiveDayClose)
           .filter(LiveDayClose.manager_id == unit.id, LiveDayClose.day == body.day).first())
    if not row:
        db.add(LiveDayClose(manager_id=unit.id, day=body.day, closed_by_name=_who(admin)))
        db.commit()
    action_log.enrich(target_kind="unit", target_id=str(unit.id), target_name=unit.name,
                      unit_id=unit.id, unit_name=unit.name, day=body.day)
    return {"ok": True}


@router.delete("/close")
def reopen_day(manager_id: int, day: date, db: Session = Depends(get_db),
               _: dict = Depends(verify_admin)):
    unit = _unit(db, manager_id)
    db.query(LiveDayClose).filter(LiveDayClose.manager_id == unit.id,
                                  LiveDayClose.day == day).delete()
    db.commit()
    action_log.enrich(target_kind="unit", target_id=str(unit.id), target_name=unit.name,
                      unit_id=unit.id, unit_name=unit.name, day=day)
    return {"ok": True}


# ── Excel ────────────────────────────────────────────────────────────────────
class ExportIn(BaseModel):
    """The table as it stands on screen — filter, search and order applied, in
    the viewer's language and alphabet. A lab page: the rows are the page's own
    payload rendered to text, so the file is exactly what the reader pressed
    Export on."""
    title: str = Field("", max_length=300)
    subtitle: str = Field("", max_length=600)
    headers: list[str] = Field(..., max_length=30)
    numeric: list[int] = Field(default_factory=list, max_length=30)
    rows: list[list[Optional[str | float | int]]] = Field(..., max_length=5000)
    filename: str = Field("verifix_live.xlsx", max_length=120)


@router.post("/export.xlsx")
def export_xlsx(body: ExportIn, request: Request, admin: dict = Depends(verify_admin)):
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Xodimlar"
    ws.sheet_view.showGridLines = False
    ncol = max(len(body.headers), 1)
    ws.cell(row=1, column=1, value=body.title).font = Font(bold=True, size=14)
    ws.cell(row=2, column=1, value=body.subtitle).font = Font(size=10, color="64748B")
    hrow = 4
    fill = PatternFill("solid", fgColor="C8973F")
    for i, h in enumerate(body.headers, 1):
        c = ws.cell(row=hrow, column=i, value=h)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = fill
        c.alignment = Alignment(vertical="center", wrap_text=True)
    zebra = PatternFill("solid", fgColor="F8FAFC")
    numeric = set(body.numeric)
    widths = [len(h or "") for h in body.headers]
    for r_i, row in enumerate(body.rows, hrow + 1):
        for c_i, v in enumerate(row[:ncol], 1):
            if (c_i - 1) in numeric and isinstance(v, str):
                try:
                    v = float(v.replace(",", "."))
                except ValueError:
                    pass
            cell = ws.cell(row=r_i, column=c_i, value=v if v != "" else None)
            if isinstance(v, float):
                cell.number_format = "0.0"
            if (r_i - hrow) % 2 == 0:
                cell.fill = zebra
            widths[c_i - 1] = max(widths[c_i - 1], len(str(v)) if v is not None else 0)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = min(max(w + 2, 8), 60)
    ws.freeze_panes = ws.cell(row=hrow + 1, column=2)
    if body.rows:
        ws.auto_filter.ref = f"A{hrow}:{get_column_letter(ncol)}{hrow + len(body.rows)}"
    ws.page_setup.orientation = "landscape"
    ws.page_setup.fitToWidth = 1
    ws.sheet_properties.pageSetUpPr.fitToPage = True

    bio = BytesIO()
    wb.save(bio)
    blob = bio.getvalue()
    fname = re.sub(r"[\\/:*?\"<>|]+", "_", body.filename) or "verifix_live.xlsx"
    if not fname.lower().endswith(".xlsx"):
        fname += ".xlsx"
    resp = deliver_xlsx(request, admin, fname, blob, f"📊 {body.title}")
    action_log.enrich(target_kind="report", target_id=fname,
                      details=[("file", fname), ("rows", len(body.rows)), ("size", len(blob))])
    return resp
