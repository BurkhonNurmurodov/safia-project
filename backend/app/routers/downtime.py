from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.models import Manager, DowntimeData
from app.services.day_state import confirmed_pairs
from app.services.name_map import sheet_alias_map

router = APIRouter(prefix="/api", tags=["downtime"])


@router.get("/downtime")
def get_downtime(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("downtime", "daily")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    managers = db.query(Manager).filter(Manager.archived.is_(False))
    if shift:
        managers = managers.filter(Manager.shift == shift)
    if manager_id:
        managers = managers.filter(Manager.id.in_(manager_id))
    managers = managers.all()
    # DowntimeData spells brigadirs in either alphabet; accept every known
    # spelling and resolve each row back to the canonical Manager.name.
    alias = sheet_alias_map(db, (m.name for m in managers))
    manager_names = set(alias.keys())

    cur = date_from
    dates = []
    while cur <= date_to:
        dates.append(cur.strftime("%d.%m.%Y"))
        cur += timedelta(days=1)

    dt_rows = db.query(DowntimeData).filter(
        DowntimeData.manager_name.in_(manager_names),
        DowntimeData.date.in_(dates),
    ).all()

    dt_total: dict[str, dict[str, float]] = {}
    dt_by_cat: dict[str, dict[str, dict]] = {}
    cat_names_set: set[str] = set()
    for r in dt_rows:
        canon = alias.get(r.manager_name, r.manager_name)
        dt_total.setdefault(canon, {})[r.date] = float(r.total_minutes or 0)
        dt_by_cat.setdefault(canon, {})[r.date] = r.by_category or {}
        cat_names_set.update((r.by_category or {}).keys())

    cat_names = sorted(cat_names_set)

    # Day-close state — here it decides only whether an unreported day counts as
    # a reported zero (see the loop below), not whether reported data is shown.
    confirmed = confirmed_pairs(db, date_from, date_to, [m.id for m in managers])

    rows = []
    for mgr in sorted(managers, key=lambda m: m.name or ""):
        for d_str in dates:
            d_obj = datetime.strptime(d_str, "%d.%m.%Y").date()
            # The shift report is a source of its own: the brigadir submits it
            # once at end of shift and it carries no attendance, so a submitted
            # report shows as soon as it syncs — open day or not. The day-close
            # gate still governs the silent case: only on a confirmed day does
            # "no report" mean a real zero rather than "not reported yet".
            reported = d_str in dt_total.get(mgr.name, {})
            if not reported and (mgr.id, d_obj) not in confirmed:
                continue
            total = dt_total.get(mgr.name, {}).get(d_str, 0.0)
            cats = dt_by_cat.get(mgr.name, {}).get(d_str, {c: 0.0 for c in cat_names})
            rows.append({
                "manager_name": mgr.name,
                "shift": mgr.shift,
                "date": d_str,
                "total": total,
                "flagged": total > 50,
                "by_category": cats,
            })

    summary: dict[str, dict] = {}
    for r in rows:
        n = r["manager_name"]
        if n not in summary:
            summary[n] = {"manager_name": n, "shift": r["shift"], "total": 0.0, "flagged_days": 0}
        summary[n]["total"] += r["total"]
        if r["flagged"]:
            summary[n]["flagged_days"] += 1

    return {
        "dates": dates,
        "cat_names": cat_names,
        "rows": rows,
        "summary": sorted(summary.values(), key=lambda x: x["total"], reverse=True),
    }
