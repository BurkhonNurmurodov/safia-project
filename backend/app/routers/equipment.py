"""«Uskunalar» — the equipment register (/equipment, an app of «Avtomatizatsiya»).

ADMIN-ONLY on every route (`verify_admin`), never grantable: the page is an
`adminOnly` link behind `RequireAdmin`. A plain table the operator edits by
hand — add, change, delete — seeded once from the workbook
(startup.seed_equipment). Every write lands in the action register.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Equipment
from app.routers.admin import verify_admin
from app.services import action_log

router = APIRouter(prefix="/api/admin/equipment", tags=["equipment"])

STATUSES = ("", "a", "b", "c")


class EquipmentIn(BaseModel):
    name_real: str = Field("", max_length=200)
    name_doc: str = Field("", max_length=200)
    serial: str = Field("", max_length=100)
    status: str = Field("", max_length=1)
    inv_code: str = Field("", max_length=50)
    department: str = Field("", max_length=120)
    brigadir: str = Field("", max_length=120)
    leader: str = Field("", max_length=120)
    cell_code: str = Field("", max_length=40)

    @field_validator("*", mode="before")
    @classmethod
    def _clean(cls, v):
        return " ".join(str(v).split()) if v is not None else ""

    @field_validator("status")
    @classmethod
    def _status(cls, v: str) -> str:
        v = v.lower()
        if v not in STATUSES:
            raise ValueError("status must be a, b or c")
        return v


FIELDS = tuple(EquipmentIn.model_fields)


def _out(e: Equipment) -> dict:
    d = {k: getattr(e, k) for k in FIELDS}
    d["id"] = e.id
    return d


def _need_name(b: EquipmentIn) -> None:
    if not (b.name_real or b.name_doc):
        raise HTTPException(status_code=422, detail="Name is required")


def _title(e: Equipment) -> str:
    return e.name_real or e.name_doc or f"#{e.id}"


@router.get("")
def list_equipment(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    rows = db.query(Equipment).order_by(Equipment.id).all()
    return {"rows": [_out(e) for e in rows]}


@router.post("")
def create_equipment(body: EquipmentIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    _need_name(body)
    e = Equipment(**body.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    action_log.record(db, category="config", action="equipment.created", actor=admin,
                      target_kind="equipment", target_id=e.id, target_name=_title(e))
    return _out(e)


@router.put("/{eid}")
def update_equipment(eid: int, body: EquipmentIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    _need_name(body)
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    changes = []
    for k, v in body.model_dump().items():
        old = getattr(e, k)
        if old != v:
            changes.append((k, old, v))
            setattr(e, k, v)
    db.commit()
    db.refresh(e)
    if changes:
        action_log.record(db, category="config", action="equipment.updated", actor=admin,
                          target_kind="equipment", target_id=e.id, target_name=_title(e), changes=changes)
    return _out(e)


@router.delete("/{eid}")
def delete_equipment(eid: int, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    name = _title(e)
    db.delete(e)
    db.commit()
    action_log.record(db, category="config", action="equipment.deleted", actor=admin,
                      target_kind="equipment", target_id=eid, target_name=name)
    return {"ok": True}
