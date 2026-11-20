"""«Uskunalar» — the equipment register (/equipment, an app of «Avtomatizatsiya»).

Page key `equipment` on every route (`require_page`): admins always, anybody
else only through a personal grant (no role holds it by default). A plain table the operator edits by
hand — add, change, delete — seeded once from the workbook
(startup.seed_equipment). Every write lands in the action register.

«Mas'ul shaxs» is PICKED from the Verifix directory (2026-11-20): the body
carries `responsible_id`, and the name stored beside it is the directory's,
never the client's. A row typed by hand before keeps its text with no id.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Equipment
from app.permissions import require_page
from app.services import action_log, people

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
    responsible: str = Field("", max_length=120)
    responsible_id: str = Field("", max_length=64)   # Verifix employee_id; "" = none / typed by hand

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


def _person_name(db: Session, eid: str) -> str:
    """The directory's name for a picked person — 422 for an id it does not know."""
    p = people.directory(db)["by_id"].get(eid)
    if not p:
        raise HTTPException(status_code=422, detail="Unknown person")
    return " ".join(str(p["name"] or "").split())[:120]


def _responsible(db: Session, body: EquipmentIn, data: dict, e: Optional[Equipment] = None) -> None:
    """Settle «Mas'ul shaxs» in `data` before it is written.
    - No `responsible_id` in the body (a tab from before the picker): the stored
      person stays while the text is unchanged; new text is a hand-typed name.
    - The id the row already holds: the stored name stays (no directory read,
      so the row stays editable while the directory is being re-read).
    - A new id: the name is the directory's."""
    rid = data["responsible_id"]
    if "responsible_id" not in body.model_fields_set:
        data["responsible_id"] = e.responsible_id if e is not None and data["responsible"] == e.responsible else ""
    elif rid and e is not None and rid == e.responsible_id:
        data["responsible"] = e.responsible
    elif rid:
        data["responsible"] = _person_name(db, rid)


@router.get("")
def list_equipment(db: Session = Depends(get_db), _: dict = Depends(require_page("equipment"))):
    rows = db.query(Equipment).order_by(Equipment.id).all()
    return {"rows": [_out(e) for e in rows]}


@router.get("/people")
def search_people(q: str = Query(default=""), limit: int = Query(default=30, ge=1, le=60),
                  db: Session = Depends(get_db), _: dict = Depends(require_page("equipment"))):
    """The «Mas'ul shaxs» picker: current Verifix workers matching `q` (≥ 2
    letters; fewer answers only the directory's size). Name, job and place —
    what the dropdown prints, nothing more."""
    hits, more = people.search_current(db, q, limit)
    return {
        "rows": [{"employee_id": r["employee_id"], "name": r["name"], "job": r["job"],
                  "unit": r["unit"], "code": r["code"]} for r in hits],
        "more": more,
        "directory": people.directory_state(db),
    }


@router.post("")
def create_equipment(body: EquipmentIn, db: Session = Depends(get_db), admin: dict = Depends(require_page("equipment"))):
    _need_name(body)
    data = body.model_dump()
    _responsible(db, body, data)
    e = Equipment(**data)
    db.add(e)
    db.commit()
    db.refresh(e)
    action_log.record(db, category="config", action="equipment.created", actor=admin,
                      target_kind="equipment", target_id=e.id, target_name=_title(e))
    return _out(e)


@router.put("/{eid}")
def update_equipment(eid: int, body: EquipmentIn, db: Session = Depends(get_db), admin: dict = Depends(require_page("equipment"))):
    _need_name(body)
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    data = body.model_dump()
    _responsible(db, body, data, e)
    changes = []
    for k, v in data.items():
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
def delete_equipment(eid: int, db: Session = Depends(get_db), admin: dict = Depends(require_page("equipment"))):
    e = db.get(Equipment, eid)
    if not e:
        raise HTTPException(status_code=404, detail="Not found")
    name = _title(e)
    db.delete(e)
    db.commit()
    action_log.record(db, category="config", action="equipment.deleted", actor=admin,
                      target_kind="equipment", target_id=eid, target_name=name)
    return {"ok": True}
