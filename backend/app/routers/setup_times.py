"""
Setup-times register API (среднее время переналадки по ячейкам).

A small hand-maintained reference table: one row per production cell with the
supervisor who reported it, the average changeover time in minutes, the reason
for longer setups, and the SKU (filled in from the UI — the source workbook
has no SKU column). Rows seeded once at startup (see startup.seed_setup_times);
admins edit them from the page afterwards.
"""
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, Manager, SetupTime
from app.permissions import require_page
from app.services.cell_lookup import by_verifix, resolve_verifix

router = APIRouter(prefix="/api/setup-times", tags=["setup-times"])


class SetupTimeIn(BaseModel):
    """Create/update payload. On PATCH only the provided fields change."""
    manager_id: int | None = None
    supervisor: str | None = None
    cell: str | None = None
    minutes: float | None = None
    reason: str | None = None
    sku: str | None = None


def _require_admin(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can edit setup times")


def _parse_minutes(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        d = Decimal(str(v))
    except InvalidOperation:
        raise HTTPException(status_code=422, detail="minutes must be a number")
    if d < 0 or d > 9999:
        raise HTTPException(status_code=422, detail="minutes out of range")
    return d


@router.get("")
def list_setup_times(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    """The whole register + the supervisor list for filters and the edit form.
    A row linked to a manager unit speaks that unit's live name/shift; unlinked
    rows keep their stored free-text supervisor name."""
    managers = {m.id: m for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    rows = db.query(SetupTime).order_by(SetupTime.id).all()

    # The free-text `cell` column holds Verifix cell codes; resolve each against
    # the canonical registry so the page can label the row with the workshop name
    # and flag codes that aren't a known cell (unseeded / suffixed sub-cells).
    cells_tbl = by_verifix(db, with_leader=True)

    def resolved(r: SetupTime):
        m = managers.get(r.manager_id)
        cell = resolve_verifix(cells_tbl, r.cell)
        return {
            "id": r.id,
            "manager_id": r.manager_id,
            "supervisor": m.name if m else r.supervisor,
            "shift": m.shift if m else None,
            "cell": r.cell,
            "cell_id": (cell["id"] if cell else None),
            "cell_name": {k: cell[k] for k in ("uz", "uz_cyrl", "ru", "en")} if cell else None,
            "cell_known": cell is not None,
            "minutes": float(r.minutes) if r.minutes is not None else None,
            "reason": r.reason,
            "sku": r.sku,
        }

    # Full cell registry for the edit-form picker: verifix code + per-language
    # workshop name + owning leader, in code order. Admin-only page, so serving
    # the whole (~100-row) catalog is cheap and keeps the picker offline-fast.
    cell_opts = [
        {
            "code": c.verifix_code,
            "uz": c.name_workshop_uz, "uz_cyrl": c.name_workshop_uz_cyrl,
            "ru": c.name_workshop_ru, "en": c.name_workshop_en,
        }
        for c in db.query(Cell).order_by(Cell.verifix_code).all()
    ]

    return {
        "can_edit": payload.get("role") == "admin",
        "supervisors": sorted(
            ({"id": m.id, "name": m.name, "shift": m.shift} for m in managers.values()),
            key=lambda m: m["name"],
        ),
        "cells": cell_opts,
        "rows": [resolved(r) for r in rows],
    }


@router.post("")
def create_setup_time(
    body: SetupTimeIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    if not (body.cell or "").strip():
        raise HTTPException(status_code=422, detail="cell is required")
    if body.manager_id is not None and not db.query(Manager).filter_by(id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Manager not found")
    r = SetupTime(
        manager_id=body.manager_id,
        supervisor=(body.supervisor or "").strip(),
        cell=body.cell.strip(),
        minutes=_parse_minutes(body.minutes),
        reason=(body.reason or "").strip(),
        sku=(body.sku or "").strip(),
    )
    db.add(r)
    db.commit()
    return {"status": "ok", "id": r.id}


@router.patch("/{row_id}")
def update_setup_time(
    row_id: int,
    body: SetupTimeIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    r = db.query(SetupTime).filter_by(id=row_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Row not found")
    fields = body.model_dump(exclude_unset=True)
    if "manager_id" in fields:
        mid = fields["manager_id"]
        if mid is not None and not db.query(Manager).filter_by(id=mid).first():
            raise HTTPException(status_code=404, detail="Manager not found")
        r.manager_id = mid
    if "supervisor" in fields:
        r.supervisor = (fields["supervisor"] or "").strip()
    if "cell" in fields:
        cell = (fields["cell"] or "").strip()
        if not cell:
            raise HTTPException(status_code=422, detail="cell is required")
        r.cell = cell
    if "minutes" in fields:
        r.minutes = _parse_minutes(fields["minutes"])
    if "reason" in fields:
        r.reason = (fields["reason"] or "").strip()
    if "sku" in fields:
        r.sku = (fields["sku"] or "").strip()
    db.commit()
    return {"status": "ok"}


@router.delete("/{row_id}")
def delete_setup_time(
    row_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    r = db.query(SetupTime).filter_by(id=row_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Row not found")
    db.delete(r)
    db.commit()
    return {"status": "ok"}
