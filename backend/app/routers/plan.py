from datetime import date, timedelta, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list

router = APIRouter(prefix="/api", tags=["plan"])


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
