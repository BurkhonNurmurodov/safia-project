from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager, Attendance, DayApproval, EditRequest
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list

router = APIRouter(prefix="/api", tags=["heatmap"])


@router.get("/heatmap")
def get_heatmap(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    # include_pending=1 (Overview fleet trend): uploaded-but-unclosed days keep
    # their computed metrics, tagged pending, instead of nulling out — so the
    # trend line has no permanent holes. The Zagruzka grid (default) still
    # shows pending days as value-less ⏳ cells.
    include_pending: bool = Query(default=False),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("overview", "zagruzka")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    metrics = build_metrics_list(db, date_from, date_to, shift, manager_id or None,
                                 require_closed=not include_pending)

    # Group by manager, then by date
    data: dict[str, dict[str, dict]] = {}
    for m in metrics:
        data.setdefault(m.manager_name, {})
        data[m.manager_name][m.date] = {
            "baseline_util": m.baseline_util,
            "net_util": m.net_util,
            # Raw components so formula popups can show numbers
            "prod_actual": m.prod_actual,
            "prod_plan": m.prod_plan,
            "official_hc": m.official_hc,
            "avail_min": m.avail_min,
            "effective_hc": m.effective_hc,
            "equip_downtime": m.equip_downtime,
            "avg_early_arrival": m.avg_early_arrival,
        }

    # ── Pending (⏳) cells ────────────────────────────────────────────────
    # Verifix attendance exists but the day can't be shown yet: either the
    # supervisor hasn't closed it ("not_closed"), or it's closed with edit
    # requests still awaiting the admin ("requests"). Draft HR documents also
    # block confirmation but don't get a marker — those cells stay empty.
    mgr_q = db.query(Manager.id, Manager.name).filter(Manager.archived.is_(False))
    if shift:
        mgr_q = mgr_q.filter(Manager.shift == shift)
    if manager_id:
        mgr_q = mgr_q.filter(Manager.id.in_(manager_id))
    mgr_name = {mid: name for mid, name in mgr_q.all()}

    if mgr_name:
        att_pairs = set(
            db.query(Attendance.manager_id, Attendance.date).filter(
                Attendance.manager_id.in_(list(mgr_name)),
                Attendance.date >= date_from,
                Attendance.date <= date_to,
            ).distinct().all()
        )
        closed = set(
            db.query(DayApproval.manager_id, DayApproval.date).filter(
                DayApproval.date >= date_from,
                DayApproval.date <= date_to,
            ).all()
        )
        pending_req = set(
            db.query(EditRequest.manager_id, EditRequest.date).filter(
                EditRequest.status == "pending",
                EditRequest.date >= date_from,
                EditRequest.date <= date_to,
            ).distinct().all()
        )
        for mid, d in att_pairs:
            if (mid, d) in closed and (mid, d) not in pending_req:
                continue  # confirmed (or held only by draft docs) → no marker
            reason = "requests" if (mid, d) in closed else "not_closed"
            data.setdefault(mgr_name[mid], {})[d.strftime("%d.%m.%Y")] = {
                "baseline_util": None,
                "net_util": None,
                "pending": reason,
            }

    # Build sorted date list
    cur = date_from
    dates = []
    while cur <= date_to:
        dates.append(cur.strftime("%d.%m.%Y"))
        cur += timedelta(days=1)

    managers = sorted(data.keys())
    return {
        "dates": dates,
        "managers": managers,
        "data": {
            name: {
                d: data[name].get(d, {"baseline_util": None, "net_util": None})
                for d in dates
            }
            for name in managers
        },
    }
