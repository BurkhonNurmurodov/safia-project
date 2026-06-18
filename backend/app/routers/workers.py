from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, tuple_

from app.database import get_db
from app.permissions import require_page
from app.models import Attendance, Manager
from app.services.day_state import confirmed_pairs

router = APIRouter(prefix="/api", tags=["workers"])

KONDITER_PREFIX = "Кондитер"
FASOVSHIK = "Фасовщик"
ZAGATOVITEL = "Заготовитель продуктов и сырья"

# SQL filter: rows that count towards calculations
# Must have hours_worked > 0 (came to work) AND matching job title (or empty title)
_KNOWN_TITLES = or_(
    Attendance.job_title.like("Кондитер%"),
    Attendance.job_title == FASOVSHIK,
    Attendance.job_title == ZAGATOVITEL,
    Attendance.job_title.is_(None),
    Attendance.job_title == "",
    Attendance.job_title.in_(["nan", "NaN"]),
)
CALC_ROWS_FILTER = and_(_KNOWN_TITLES, Attendance.hours_worked > 0)


def normalize_role(job_title: str) -> str:
    if not job_title or job_title in ("nan", "NaN", ""):
        return "Other"
    if job_title.startswith(KONDITER_PREFIX):
        return "Konditer"
    if job_title == FASOVSHIK:
        return "Fasovshik"
    if job_title == ZAGATOVITEL:
        return "Zagatovitel"
    return "Other"


@router.get("/workers/headcount")
def get_headcount(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("workers")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    # Day-close gate: only confirmed (manager, date) days count anywhere.
    confirmed = confirmed_pairs(db, date_from, date_to, manager_id or None)
    if not confirmed:
        return []

    q = (
        db.query(
            Manager.id,
            Manager.name,
            Manager.shift,
            Attendance.job_title,
            func.count(func.distinct(Attendance.worker_name)).label("count"),
        )
        .join(Attendance, Attendance.manager_id == Manager.id)
        .filter(Attendance.date >= date_from, Attendance.date <= date_to)
        .filter(Attendance.worker_name.notin_(["nan", "NaN", ""]))
        .filter(CALC_ROWS_FILTER)
        .filter(tuple_(Attendance.manager_id, Attendance.date).in_(list(confirmed)))
    )
    if shift:
        q = q.filter(Manager.shift == shift)
    if manager_id:
        q = q.filter(Manager.id.in_(manager_id))

    q = q.group_by(Manager.id, Manager.name, Manager.shift, Attendance.job_title)
    rows = q.all()

    agg: dict[int, dict] = {}
    for mgr_id, name, sft, job_title, cnt in rows:
        if mgr_id not in agg:
            agg[mgr_id] = {"manager_id": mgr_id, "name": name, "shift": sft,
                           "total": 0, "by_role": {"Konditer": 0, "Fasovshik": 0, "Zagatovitel": 0, "Other": 0}}
        role = normalize_role(job_title or "")
        agg[mgr_id]["by_role"][role] = agg[mgr_id]["by_role"].get(role, 0) + cnt
        agg[mgr_id]["total"] += cnt

    return list(agg.values())


@router.get("/workers/trend")
def get_role_trend(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("workers")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    # Day-close gate: only confirmed (manager, date) days count anywhere.
    confirmed = confirmed_pairs(db, date_from, date_to, manager_id or None)
    if not confirmed:
        return {"dates": [], "series": {role: [] for role in ["Konditer", "Fasovshik", "Zagatovitel", "Other"]}}

    q = (
        db.query(
            Attendance.date,
            Attendance.job_title,
            func.count(func.distinct(Attendance.worker_name)).label("count"),
        )
        .join(Manager, Manager.id == Attendance.manager_id)
        .filter(Attendance.date >= date_from, Attendance.date <= date_to)
        .filter(Attendance.worker_name.notin_(["nan", "NaN", ""]))
        .filter(CALC_ROWS_FILTER)
        .filter(tuple_(Attendance.manager_id, Attendance.date).in_(list(confirmed)))
    )
    if shift:
        q = q.filter(Manager.shift == shift)
    if manager_id:
        q = q.filter(Attendance.manager_id.in_(manager_id))

    q = q.group_by(Attendance.date, Attendance.job_title).order_by(Attendance.date)
    rows = q.all()

    trend: dict[str, dict[str, int]] = {}
    for d, job_title, cnt in rows:
        d_str = d.strftime("%d.%m.%Y")
        role = normalize_role(job_title or "")
        trend.setdefault(d_str, {"Konditer": 0, "Fasovshik": 0, "Zagatovitel": 0, "Other": 0})
        trend[d_str][role] = trend[d_str].get(role, 0) + cnt

    from datetime import datetime as dt
    dates = sorted(trend.keys(), key=lambda s: dt.strptime(s, "%d.%m.%Y"))
    return {
        "dates": dates,
        "series": {
            role: [trend.get(d, {}).get(role, 0) for d in dates]
            for role in ["Konditer", "Fasovshik", "Zagatovitel", "Other"]
        },
    }
