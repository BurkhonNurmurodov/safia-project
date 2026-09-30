from datetime import date, timedelta, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services import plan_fulfillment, pp_catalog
from app.services.factory_scope import scoped_manager_ids

router = APIRouter(prefix="/api", tags=["plan"])


@router.get("/plan-fulfillment/analysis")
def get_plan_analysis(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    # Which plant. Omitted = «All factories»; a locked viewer is pinned to
    # their own whatever this says (services/factory_scope.py).
    factory: Optional[int] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    leader_id: List[int] = Query(default=[]),
    cell_id: List[int] = Query(default=[]),
    # SKUs — `pp_daily.sap_code`, i.e. `pp_calc.daily_key` (the SAP code, or
    # «~name» for a code-less line).
    product: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("plan")),
):
    """The /plan page, whole — every figure out of
    `services/plan_fulfillment.build` (see its docstring for the rules).

    The unit scope is resolved HERE and nowhere else: the plant lock
    (`scoped_manager_ids` — `?factory=` cannot widen a locked viewer), the
    shift, the brigadir pick. A leader or cell pick becomes a set of cells,
    read by the share rule; the units whose lines are read then narrow to the
    units those cells stand in.

    The REGISTRY the option lists are drawn from — `scope_units` and `cells` —
    is the whole plant, both shifts, before any pick: the page narrows the
    brigadir, leader and cell lists by the shift and the brigadir pick itself,
    at once, so a pick never shortens the list it was made from and a child
    pick the new parent no longer offers is dropped before a request goes out
    for it."""
    today = pp_catalog.now_local().date()
    date_to = date_to or today
    date_from = date_from or (date_to - timedelta(days=13))

    plant = scoped_manager_ids(db, payload, factory, [])
    base: list = []
    if plant is None or plant:
        q = db.query(Manager).filter(Manager.archived.is_(False))
        if plant is not None:
            q = q.filter(Manager.id.in_(plant))
        base = q.order_by(Manager.name).all()
    cells, leader_names = plan_fulfillment.registry(db, [m.id for m in base])

    picked_units = set(manager_id)
    units = [m for m in base
             if (shift not in (1, 2) or m.shift == shift)
             and (not picked_units or m.id in picked_units)]
    pick = None
    if leader_id or cell_id:
        lset, cset = set(leader_id), set(cell_id)
        in_units = {m.id for m in units}
        pick = {c.id for c in cells
                if c.manager_id in in_units
                and (not lset or c.leader_id in lset)
                and (not cset or c.id in cset)}
        standing = {c.manager_id for c in cells if c.id in pick}
        units = [m for m in units if m.id in standing]

    out = plan_fulfillment.build(
        db, units, date_from, date_to, cells=cells, leader_names=leader_names,
        cell_ids=pick, skus=set(product) if product else None)
    out["today"] = today.isoformat()
    out["scope_units"] = [{"manager_id": m.id, "name": m.name, "shift": m.shift,
                           "factory_id": m.factory_id} for m in base]
    return out


# ── The page as it was until 2026-09-30 ─────────────────────────────────────
# One number per brigadir per day out of `build_metrics_list`. Nothing in the
# current bundle calls it; it stays so a tab still open on an older bundle keeps
# working (a removed endpoint an open tab calls is the one thing a MINOR must
# not do). Delete it once no such tab can be left.
@router.get("/plan-fulfillment")
def get_plan_fulfillment(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("plan")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    mgr_ids = manager_id or None
    metrics = build_metrics_list(db, date_from, date_to, shift, mgr_ids)
    metrics.sort(key=lambda m: (m.manager_name, datetime.strptime(m.date, "%d.%m.%Y")))

    rows = []
    for m in metrics:
        fulfillment = None
        if m.prod_plan and m.prod_plan > 0:
            fulfillment = round(m.prod_actual / m.prod_plan, 4)
        rows.append({
            "manager_id": m.manager_id,
            "manager_name": m.manager_name,
            "shift": m.shift,
            "date": m.date,
            "prod_plan": m.prod_plan,
            "prod_actual": m.prod_actual,
            "fulfillment": fulfillment,
            "status": m.status,
        })

    # Summary per manager
    summary: dict[int, dict] = {}
    for r in rows:
        mid = r["manager_id"]
        if mid not in summary:
            summary[mid] = {
                "manager_id": mid,
                "name": r["manager_name"],
                "shift": r["shift"],
                "plan_total": 0.0,
                "actual_total": 0.0,
            }
        summary[mid]["plan_total"] += r["prod_plan"] or 0
        summary[mid]["actual_total"] += r["prod_actual"] or 0

    for s in summary.values():
        s["fulfillment"] = round(s["actual_total"] / s["plan_total"], 4) if s["plan_total"] else None

    # Fleet KPIs
    fulfillments = [s["fulfillment"] for s in summary.values() if s["fulfillment"] is not None]
    fleet_avg = round(sum(fulfillments) / len(fulfillments), 4) if fulfillments else None

    return {
        "rows": rows,
        "summary": sorted(summary.values(), key=lambda x: x["fulfillment"] or 0, reverse=True),
        "fleet_avg_fulfillment": fleet_avg,
        "count_above_100": sum(1 for f in fulfillments if f >= 1.0),
        "count_below_85": sum(1 for f in fulfillments if f < 0.85),
    }
