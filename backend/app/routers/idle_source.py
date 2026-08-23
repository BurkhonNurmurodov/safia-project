"""
Ojidaniya source — the «Kutish manbasi» admin register.

One row per supervisor unit saying whether its waiting minutes for the fleet
загрузка (and every surface that prints them) come from the «Смена отчёт»
sheet row or from the unit's own cells' interval model, and FROM WHICH DAY.
The rule itself lives in ``app.services.idle_source``; this module is only the
door — the list the tab renders and the one writer.

Every route, the READ included, is gated on ``admin.idle_source.manage``, the
same shape as the cell-hours register: a switch this consequential (it changes
a brigadir's KPI from the next day on) has no reason to be readable by a page
that cannot change it.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.capabilities import CAP_IDLE_SOURCE_MANAGE, require_cap
from app.capability_alerts import alert_grant_use, unit_name
from app.database import get_db
from app.models import IdleSourceSetting, Manager
from app.services import action_log, idle_source
from app.services.factory_scope import list_factories, serialize

router = APIRouter(prefix="/api/admin/idle-source", tags=["idle-source"])

log = logging.getLogger(__name__)

_manage = require_cap(CAP_IDLE_SOURCE_MANAGE)


class SourceIn(BaseModel):
    """``cells`` needs a from-date — "from forever" would rewrite the unit's
    whole history the moment the row is saved. ``sheet`` may carry one or not;
    it is kept so a unit switched back keeps the date it had, ready to be
    switched on again."""
    source: str
    from_date: Optional[str] = None


def _factory_name(f) -> Optional[str]:
    """Russian first, the same ru-first fallback every DB-held name uses."""
    if not f:
        return None
    return f.name_ru or f.name_uz or f.name_en or f.name_uz_cyrl or f.code


def _row(m: Manager, s: Optional[IdleSourceSetting], fac) -> dict:
    return {
        "manager_id": m.id,
        "name": m.name,
        "shift": m.shift,
        "factory_id": m.factory_id,
        "factory_name": _factory_name(fac),
        "source": (s.source if s and s.source in idle_source.SOURCES
                   else idle_source.SOURCE_SHEET),
        "from_date": (s.from_date or None) if s else None,
    }


@router.get("")
def list_units(db: Session = Depends(get_db), _: dict = Depends(_manage)):
    """Every active supervisor with its current source. Two queries and a dict
    join; an absent settings row IS the sheet rule, so nothing is inserted on
    read."""
    managers = (db.query(Manager).filter(Manager.archived.is_(False))
                .order_by(Manager.shift, Manager.name).all())
    settings = {s.manager_id: s for s in db.query(IdleSourceSetting).all()}
    facs = {f.id: f for f in list_factories(db, include_archived=True)}
    return {
        "units": [_row(m, settings.get(m.id), facs.get(m.factory_id))
                  for m in managers],
        "factories": [serialize(f) for f in list_factories(db)],
    }


@router.put("/{manager_id}")
def put_unit(manager_id: int, body: SourceIn, db: Session = Depends(get_db),
             caller: dict = Depends(_manage)):
    """Get-or-create the unit's row — ONE writer, the `set_unit_settings`
    shape: the row is the unit's, and two parallel inserts of it would race
    the primary key while the page reported success."""
    source = (body.source or "").strip().lower()
    if source not in idle_source.SOURCES:
        raise HTTPException(status_code=400, detail="source must be sheet or cells")
    from_raw = (body.from_date or "").strip() or None
    from_d = idle_source.parse_iso(from_raw)
    if from_raw and from_d is None:
        raise HTTPException(status_code=400, detail="from_date must be YYYY-MM-DD")
    if source == idle_source.SOURCE_CELLS and from_d is None:
        raise HTTPException(status_code=400, detail="from_date required for cells")

    m = db.query(Manager).filter_by(id=manager_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Unit not found")

    row = db.query(IdleSourceSetting).filter_by(manager_id=manager_id).first()
    before = (row.source, row.from_date) if row else (idle_source.SOURCE_SHEET, None)
    if not row:
        row = IdleSourceSetting(manager_id=manager_id)
        db.add(row)
    row.source = source
    row.from_date = from_d.isoformat() if from_d else None
    db.commit()
    after = (row.source, row.from_date)

    log.info("IDLE-SOURCE set | unit=%s %s -> %s | by=%s",
             manager_id, before, after, (caller or {}).get("sub"))
    if before != after:
        fmt = lambda p: f"{p[0]}" + (f" · {p[1]}" if p[1] else "")
        alert_grant_use(
            db, caller, CAP_IDLE_SOURCE_MANAGE, "idle_source.set",
            details=[("unit", unit_name(db, manager_id))],
            changes=[("source", fmt(before), fmt(after))],
        )
    diff = []
    if before[0] != after[0]:
        diff.append(("source", before[0], after[0]))
    if before[1] != after[1]:
        diff.append(("from_date", before[1] or "—", after[1] or "—"))
    action_log.enrich(
        target_kind="unit", target_id=manager_id, target_name=m.name,
        unit_id=manager_id, unit_name=m.name,
        details=[("source", after[0]), ("from_date", after[1] or "—")],
        changes=diff,
    )
    facs = {f.id: f for f in list_factories(db, include_archived=True)}
    return {"ok": True, "unit": _row(m, row, facs.get(m.factory_id))}
