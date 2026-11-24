"""«SKU tarixi» (/sku-history) — the «Zagruzka fayli» catalog's SKUs over
time: new, removed, restored, re-coded, moved (`services/sku_history.py`)."""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager
from app.permissions import require_page
from app.services import pp_catalog, sku_history
from app.services.factory_scope import scoped_manager_ids

router = APIRouter(prefix="/api", tags=["sku-history"])


@router.get("/sku-history")
def get_sku_history(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("sku-history")),
):
    """The page, whole. The unit scope is resolved here as on /plan: the plant
    lock (`scoped_manager_ids` — `?factory=` cannot widen a locked viewer),
    then the shift and the brigadir pick. `scope_units` is every catalog unit
    of the plant before those picks, so the brigadir list never shortens
    itself. The period is clamped to `sku_history.TRACK_FROM` (`clamped`)."""
    today = pp_catalog.now_local().date()
    d1 = min(date_to or today, today)
    d0 = date_from or (d1 - timedelta(days=29))
    clamped = d0 < sku_history.TRACK_FROM
    d0 = max(d0, sku_history.TRACK_FROM)

    units = sku_history.catalog_units(db)
    plant = scoped_manager_ids(db, payload, factory, [])
    base = []
    if units and (plant is None or plant):
        q = db.query(Manager).filter(Manager.id.in_(units))
        if plant is not None:
            q = q.filter(Manager.id.in_(plant))
        base = q.order_by(Manager.name).all()
    picked = set(manager_id)
    scope = {m.id for m in base
             if (shift not in (1, 2) or m.shift == shift) and (not picked or m.id in picked)}

    meta = {"today": today.isoformat(), "floor": sku_history.TRACK_FROM.isoformat(),
            "clamped": clamped, "date_from": d0.isoformat(), "date_to": d1.isoformat(),
            "scope_units": [{"manager_id": m.id, "name": m.name, "shift": m.shift,
                             "factory_id": m.factory_id, "archived": bool(m.archived)}
                            for m in base]}
    if d0 > d1:
        return {**meta, "date_from": None}
    # Every unit is read, not only the scope's: a key leaving for a unit
    # outside the scope is a move there, not a removal.
    segs = sku_history.load(db, units, d0, d1)
    out = sku_history.build(segs, scope, d0, d1)
    out["units"] = sku_history.per_unit(segs, scope, d0, d1)
    return {**meta, **out}
