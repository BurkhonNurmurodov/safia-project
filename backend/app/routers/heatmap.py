from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager, Attendance, DayApproval, EditRequest
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services.factory_scope import empty_scope, scoped_manager_ids

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
    # Which plant. Omitted / null = «All factories»; supervisors and leaders are
    # pinned to their own by the server (services/factory_scope).
    factory: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview", "zagruzka")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    scoped = scoped_manager_ids(db, payload, factory, manager_id)
    metrics = [] if empty_scope(scoped) else build_metrics_list(
        db, date_from, date_to, shift, scoped, require_closed=not include_pending)

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
            # The two components effective_hc is built from, so the comment
            # popup can spell out where it came from instead of asserting it.
            "labor_surplus": m.labor_surplus,
            "verifix_labor": m.verifix_labor,
            "equip_downtime": m.equip_downtime,
            "avg_early_arrival": m.avg_early_arrival,
        }

    # ── Pending (⏳ / 👥) cells ───────────────────────────────────────────
    # Verifix attendance exists but the day can't be shown yet: either the
    # supervisor hasn't closed it ("not_closed"), or it's closed with edit
    # requests still awaiting the admin ("requests"), or it's fully confirmed
    # but the source sheet's «Odam soni» headcount hasn't been loaded yet
    # ("no_headcount"). Draft HR documents also block confirmation but don't
    # get a marker — those cells stay empty.
    # Same scope as the metrics above — `scoped`, not the raw manager_id filter,
    # or a factory tab would grow pending markers for units it doesn't contain.
    mgr_q = db.query(Manager.id, Manager.name).filter(Manager.archived.is_(False))
    if shift:
        mgr_q = mgr_q.filter(Manager.shift == shift)
    if scoped is not None:
        mgr_q = mgr_q.filter(Manager.id.in_(scoped))
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
            key = d.strftime("%d.%m.%Y")
            cell = data.get(mgr_name[mid], {}).get(key)
            confirmed = (mid, d) in closed and (mid, d) not in pending_req
            # «Odam soni» (official headcount) is the precondition for every
            # metric — without it nothing may be calculated, so the cell never
            # shows numbers, only a waiting marker. Ojidaniya (downtime) is
            # deliberately NOT required: a day whose downtime sheet isn't
            # loaded just computes with 0 downtime minutes.
            no_hc = cell is None or not (cell.get("official_hc") or 0)
            if confirmed and not no_hc:
                continue  # confirmed (or held only by draft docs) → no marker
            if not confirmed:
                reason = "requests" if (mid, d) in closed else "not_closed"
            else:
                reason = "no_headcount"
            if include_pending and cell is not None and not no_hc:
                cell["pending"] = reason   # keep the unconfirmed numbers
            else:
                data.setdefault(mgr_name[mid], {})[key] = {
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
