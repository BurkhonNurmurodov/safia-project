from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.models import Manager, Attendance, ProductionData, HeadcountData, DowntimeData, DayApproval
from app.services.day_state import confirmed_pairs
from app.services.kpi_calculator import compute_metrics
from app.services.name_map import sheet_alias_map

router = APIRouter(prefix="/api", tags=["brigadirs"])


def _closed_pairs(db: Session, date_from: date, date_to: date, manager_ids: list[int]) -> set:
    """(manager_id, date) pairs where the supervisor has closed the day (DayApproval exists).
    Unlike confirmed_pairs, this includes days that still have pending requests — appropriate
    for aggregate metric averages where the exact headcount fluctuation is negligible."""
    q = db.query(DayApproval.manager_id, DayApproval.date).filter(
        DayApproval.date >= date_from,
        DayApproval.date <= date_to,
    )
    if manager_ids:
        q = q.filter(DayApproval.manager_id.in_(manager_ids))
    return set(q.all())


def build_metrics_list(
    db: Session,
    date_from: date,
    date_to: date,
    shift: Optional[int],
    manager_ids: Optional[list[int]],
    use_confirmed_only: bool = False,
    require_closed: bool = True,
):
    managers = db.query(Manager).filter(Manager.archived.is_(False))
    if shift:
        managers = managers.filter(Manager.shift == shift)
    if manager_ids:
        managers = managers.filter(Manager.id.in_(manager_ids))
    managers = managers.all()
    # Sheet data (production/headcount/downtime) spells brigadirs in either
    # alphabet; accept every known spelling (canonical + Cyrillic overrides) and
    # resolve each sheet row back to the canonical Manager.name.
    alias = sheet_alias_map(db, (m.name for m in managers))
    manager_names = set(alias.keys())

    all_dates = []
    cur = date_from
    while cur <= date_to:
        all_dates.append(cur.strftime("%d.%m.%Y"))
        cur += timedelta(days=1)

    # Production data from DB
    prod_rows = db.query(ProductionData).filter(
        ProductionData.manager_name.in_(manager_names),
        ProductionData.date.in_(all_dates),
    ).all()
    plan_data: dict[str, dict[str, float]] = {}
    actual_data: dict[str, dict[str, float]] = {}
    for r in prod_rows:
        canon = alias.get(r.manager_name, r.manager_name)
        plan_data.setdefault(canon, {})[r.date] = float(r.prod_plan or 0)
        actual_data.setdefault(canon, {})[r.date] = float(r.prod_actual or 0)

    # Headcount data from DB
    hc_rows = db.query(HeadcountData).filter(
        HeadcountData.manager_name.in_(manager_names),
        HeadcountData.date.in_(all_dates),
    ).all()
    hc_data: dict[str, dict[str, float]] = {}
    for r in hc_rows:
        canon = alias.get(r.manager_name, r.manager_name)
        hc_data.setdefault(canon, {})[r.date] = float(r.official_hc or 0)

    # Downtime data from DB
    dt_rows = db.query(DowntimeData).filter(
        DowntimeData.manager_name.in_(manager_names),
        DowntimeData.date.in_(all_dates),
    ).all()
    dt_total: dict[str, dict[str, float]] = {}
    dt_by_cat: dict[str, dict[str, dict]] = {}
    for r in dt_rows:
        canon = alias.get(r.manager_name, r.manager_name)
        dt_total.setdefault(canon, {})[r.date] = float(r.total_minutes or 0)
        dt_by_cat.setdefault(canon, {})[r.date] = r.by_category or {}

    # Gate: only include days the supervisor has closed. When use_confirmed_only=True
    # (used for individual profile pages) we additionally require all requests to
    # be processed; for aggregate averages we only require the day to be closed.
    # require_closed=False drops the closure gate entirely (attendance-only) —
    # used by the fleet-trend heatmap fetch so uploaded-but-unclosed days still
    # plot as (unconfirmed) points instead of holes.
    mgr_ids = [m.id for m in managers]
    if use_confirmed_only:
        allowed = confirmed_pairs(db, date_from, date_to, mgr_ids)
    elif require_closed:
        allowed = _closed_pairs(db, date_from, date_to, mgr_ids)
    else:
        allowed = None

    results = []
    for mgr in managers:
        for d_str in all_dates:
            d_obj = datetime.strptime(d_str, "%d.%m.%Y").date()
            if allowed is not None and (mgr.id, d_obj) not in allowed:
                continue
            att_rows = db.query(Attendance).filter(
                Attendance.manager_id == mgr.id,
                Attendance.date == d_obj,
            ).all()
            if not att_rows:
                continue

            m = compute_metrics(
                manager_id=mgr.id,
                manager_name=mgr.name,
                shift=mgr.shift,
                date=d_str,
                attendance_rows=att_rows,
                prod_plan=plan_data.get(mgr.name, {}).get(d_str, 0.0),
                prod_actual=actual_data.get(mgr.name, {}).get(d_str, 0.0),
                official_hc=hc_data.get(mgr.name, {}).get(d_str, 0.0),
                equip_downtime=dt_total.get(mgr.name, {}).get(d_str, 0.0),
                downtime_by_cat=dt_by_cat.get(mgr.name, {}).get(d_str, {}),
            )
            results.append(m)

    return results


@router.get("/managers/all")
def list_all_managers(db: Session = Depends(get_db)):
    """Returns active managers as {manager_id, name, shift} for filter
    dropdowns. Archived units are hidden everywhere (their data stays stored).
    The old public /managers registration picker is gone — registration lists
    now come from the initData-gated /api/profiles/registration-options."""
    rows = (
        db.query(Manager.id, Manager.name, Manager.shift)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    return [{"manager_id": r.id, "name": r.name, "shift": r.shift} for r in rows]


@router.get("/brigadirs")
def list_brigadirs(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("overview", "zagruzka", "leaderboard")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=1)

    metrics = build_metrics_list(db, date_from, date_to, shift, manager_id or None)

    agg: dict = {}
    for m in metrics:
        if m.manager_id not in agg:
            agg[m.manager_id] = {
                "manager_id": m.manager_id,
                "name": m.manager_name,
                "shift": m.shift,
                "net_utils": [],
                "baseline_utils": [],
                "adjusted_utils": [],
                "after_idle_utils": [],
                "after_early_utils": [],
                "diff_hrs": [],
                "official_hcs": [],
                "verifix_hcs": [],
                "early_totals": [],
                "idle_totals": [],
                # Raw components — averaged so the formula popups can show numbers
                "prod_actuals": [],
                "prod_plans": [],
                "verifix_labors": [],
                "effective_hcs": [],
                "avail_mins": [],
                "early_arrivals": [],
            }
        a = agg[m.manager_id]
        if m.net_util is not None:
            a["net_utils"].append(m.net_util)
        if m.baseline_util is not None:
            a["baseline_utils"].append(m.baseline_util)
        if m.adjusted_util is not None:
            a["adjusted_utils"].append(m.adjusted_util)
        if m.after_idle_util is not None:
            a["after_idle_utils"].append(m.after_idle_util)
        if m.after_early_util is not None:
            a["after_early_utils"].append(m.after_early_util)
        if m.difference_hrs is not None:
            a["diff_hrs"].append(m.difference_hrs)
        a["official_hcs"].append(m.official_hc)
        a["verifix_hcs"].append(m.verifix_hc)
        a["early_totals"].append(m.avg_early_arrival * max(m.official_hc, 1))
        a["idle_totals"].append(m.equip_downtime)
        a["prod_actuals"].append(m.prod_actual)
        a["prod_plans"].append(m.prod_plan)
        a["verifix_labors"].append(m.verifix_labor)
        if m.effective_hc is not None:
            a["effective_hcs"].append(m.effective_hc)
        if m.avail_min is not None:
            a["avail_mins"].append(m.avail_min)
        a["early_arrivals"].append(m.avg_early_arrival)

    def avg(lst):
        return round(sum(lst) / len(lst), 4) if lst else None

    out = []
    for a in sorted(agg.values(), key=lambda x: avg(x["net_utils"]) or 0, reverse=True):
        net = avg(a["net_utils"])
        baseline = avg(a["baseline_utils"])
        off_hc = round(avg(a["official_hcs"]) or 0)
        ver_hc = round(avg(a["verifix_hcs"]) or 0)

        status = "No Data"
        if net is not None:
            if net >= 1.05:
                status = "Over Capacity"
            elif net >= 0.95:
                status = "On Track"
            elif net >= 0.90:
                status = "Monitor"
            else:
                status = "Needs Attention"

        out.append({
            "manager_id": a["manager_id"],
            "name": a["name"],
            "shift": a["shift"],
            "net_util": net,
            "baseline_util": baseline,
            "adjusted_util": avg(a["adjusted_utils"]),
            "after_idle_util": avg(a["after_idle_utils"]),
            "after_early_util": avg(a["after_early_utils"]),
            "diff_hrs": avg(a["diff_hrs"]),
            "official_hc": off_hc,
            "verifix_hc": ver_hc,
            "hc_mismatch": abs(off_hc - ver_hc) > 2,
            "early_flagged": any(e > 110 for e in a["early_totals"]),
            "equip_downtime": round(avg(a["idle_totals"]) or 0, 2),
            "idle_flagged": any(i > 50 for i in a["idle_totals"]),
            "status": status,
            # Averaged raw components for the "how it's calculated" popups
            "prod_actual": avg(a["prod_actuals"]),
            "prod_plan": avg(a["prod_plans"]),
            "verifix_labor": avg(a["verifix_labors"]),
            "effective_hc": avg(a["effective_hcs"]),
            "avail_min": avg(a["avail_mins"]),
            "avg_early_arrival": avg(a["early_arrivals"]),
        })

    return out


@router.get("/summary")
def get_summary(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("overview")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=1)

    metrics = build_metrics_list(db, date_from, date_to, shift, manager_id or None)

    # Collect all net_util values per manager, then average per manager
    per_mgr: dict[int, list[float]] = {}
    for m in metrics:
        if m.net_util is not None:
            per_mgr.setdefault(m.manager_id, []).append(m.net_util)

    vals = [round(sum(v) / len(v), 4) for v in per_mgr.values()]
    return {
        "total_brigadirs": len(per_mgr),
        "avg_final_workload": round(sum(vals) / len(vals), 4) if vals else None,
        "count_over_100": sum(1 for v in vals if v >= 1.0),
        "count_under_90": sum(1 for v in vals if v < 0.90),
        # Total equipment downtime (minutes) over every supervisor/day in the period —
        # same basis as the dedicated Idle-time page's fleet total.
        "total_idle": round(sum(m.equip_downtime or 0 for m in metrics), 2),
    }


@router.get("/brigadir/{manager_id}")
def get_brigadir_profile(
    manager_id: int,
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: Session = Depends(get_db),
    # Backs the BrigadirProfile page (overview/zagruzka) AND the Daily page's
    # performance block — supervisors only have "daily", so it must count here.
    _: dict = Depends(require_page("overview", "zagruzka", "daily")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=14)

    mgr = db.query(Manager).filter(Manager.id == manager_id).first()
    if not mgr:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Manager not found")

    metrics = build_metrics_list(db, date_from, date_to, None, [manager_id], use_confirmed_only=True)
    metrics.sort(key=lambda m: datetime.strptime(m.date, "%d.%m.%Y"))

    daily = []
    for m in metrics:
        daily.append({
            "date": m.date,
            "prod_plan": m.prod_plan,
            "prod_actual": m.prod_actual,
            "verifix_labor": m.verifix_labor,
            "labor_surplus": m.labor_surplus,
            "official_hc": m.official_hc,
            "verifix_hc": m.verifix_hc,
            "avg_early_arrival": m.avg_early_arrival,
            "equip_downtime": m.equip_downtime,
            "downtime_by_cat": m.downtime_by_cat,
            "baseline_util": m.baseline_util,
            "adjusted_util": m.adjusted_util,
            "after_idle_util": m.after_idle_util,
            "after_early_util": m.after_early_util,
            "net_util": m.net_util,
            "difference_hrs": m.difference_hrs,
            "status": m.status,
            "hc_mismatch": m.hc_mismatch,
            "early_flagged": m.early_flagged,
            "idle_flagged": m.idle_flagged,
            "diff_in_range": m.diff_in_range,
        })

    latest = metrics[-1] if metrics else None
    return {
        "manager_id": mgr.id,
        "name": mgr.name,
        "shift": mgr.shift,
        "daily": daily,
        "latest": {
            "prod_plan": latest.prod_plan if latest else None,
            "prod_actual": latest.prod_actual if latest else None,
            "verifix_labor": latest.verifix_labor if latest else None,
            "difference_hrs": latest.difference_hrs if latest else None,
            "official_hc": latest.official_hc if latest else None,
            "verifix_hc": latest.verifix_hc if latest else None,
            "labor_surplus": latest.labor_surplus if latest else None,
            "effective_hc": latest.effective_hc if latest else None,
            "avg_early_arrival": latest.avg_early_arrival if latest else 0,
            "equip_downtime": latest.equip_downtime if latest else 0,
            "baseline_util": latest.baseline_util if latest else None,
            "adjusted_util": latest.adjusted_util if latest else None,
            "after_idle_util": latest.after_idle_util if latest else None,
            "after_early_util": latest.after_early_util if latest else None,
            "net_util": latest.net_util if latest else None,
            "status": latest.status if latest else "No Data",
            "hc_mismatch": latest.hc_mismatch if latest else False,
            "early_flagged": latest.early_flagged if latest else False,
            "idle_flagged": latest.idle_flagged if latest else False,
            "diff_in_range": latest.diff_in_range if latest else True,
        } if latest else None,
    }
