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
from app.models import Manager, SetupTime
from app.permissions import require_page

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

    def resolved(r: SetupTime):
        m = managers.get(r.manager_id)
        return {
            "id": r.id,
            "manager_id": r.manager_id,
            "supervisor": m.name if m else r.supervisor,
            "shift": m.shift if m else None,
            "cell": r.cell,
            "minutes": float(r.minutes) if r.minutes is not None else None,
            "reason": r.reason,
            "sku": r.sku,
        }

    return {
        "can_edit": payload.get("role") == "admin",
        "supervisors": sorted(
            ({"id": m.id, "name": m.name, "shift": m.shift} for m in managers.values()),
            key=lambda m: m["name"],
        ),
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
