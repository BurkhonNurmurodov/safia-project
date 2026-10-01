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

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LiveDayClose, LiveStaffEvent, Manager
from app.routers.admin import verify_admin
from app.services import action_log, verifix_live

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
