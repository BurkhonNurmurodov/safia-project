from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, or_, and_

from app.database import get_db
from app.models import Attendance, Manager

# Rows included in display & calculations:
# matching job title (or empty) AND hours_worked > 0 (actually came to work)
_KNOWN_TITLES = or_(
    Attendance.job_title.like("Кондитер%"),
    Attendance.job_title == "Фасовщик",
    Attendance.job_title == "Заготовитель продуктов и сырья",
    Attendance.job_title.is_(None),
    Attendance.job_title == "",
    Attendance.job_title.in_(["nan", "NaN"]),
)
_CALC_FILTER = and_(_KNOWN_TITLES, Attendance.hours_worked > 0)

router = APIRouter(prefix="/api", tags=["attendance"])


@router.get("/attendance/range")
def get_attendance_range(db: Session = Depends(get_db)):
    """Return the min and max dates available in the attendance table."""
    result = db.query(func.min(Attendance.date), func.max(Attendance.date)).first()
    min_date, max_date = result
    return {
        "date_from": min_date.strftime("%Y-%m-%d") if min_date else None,
        "date_to": max_date.strftime("%Y-%m-%d") if max_date else None,
    }


@router.get("/attendance/dates")
def get_attendance_dates(
    manager_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return all distinct dates that have attendance data for a manager, newest first."""
    rows = (
        db.query(distinct(Attendance.date))
        .filter(Attendance.manager_id == manager_id)
        .order_by(Attendance.date.desc())
        .all()
    )
    return [r[0].strftime("%d.%m.%Y") for r in rows]


@router.get("/attendance")
def get_attendance(
    manager_id: Optional[int] = Query(default=None),
    date_val: Optional[date] = Query(default=None, alias="date"),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
):
    q = db.query(Attendance).join(Manager).filter(_CALC_FILTER)
    if manager_id:
        q = q.filter(Attendance.manager_id == manager_id)

    # Single-date mode (existing behaviour)
    if date_val:
        q = q.filter(Attendance.date == date_val)
        rows = q.order_by(Attendance.date, Attendance.worker_name).all()
        return [
            {
                "id": r.id,
                "manager_id": r.manager_id,
                "date": r.date.isoformat() if r.date else None,
                "worker_name": r.worker_name,
                "job_title": r.job_title,
                "schedule": r.schedule,
                "clock_in_out": r.clock_in_out,
                "hours_worked": float(r.hours_worked) if r.hours_worked is not None else None,
                "early_arrival_min": float(r.early_arrival_min) if r.early_arrival_min is not None else None,
                "effective_hours": float(r.effective_hours) if r.effective_hours is not None else None,
            }
            for r in rows
        ]

    # Date-range mode: return one entry per unique worker (most-recent day's data)
    # plus a count of how many days they appeared in the range.
    if date_from:
        q = q.filter(Attendance.date >= date_from)
    if date_to:
        q = q.filter(Attendance.date <= date_to)

    rows = q.order_by(Attendance.worker_name, Attendance.date.desc()).all()

    # Deduplicate: keep the most-recent row per worker_name, count appearances.
    seen: dict[str, dict] = {}
    for r in rows:
        name = r.worker_name or ""
        if name not in seen:
            seen[name] = {
                "worker_name": name,
                "job_title": r.job_title,
                "days_present": 1,
            }
        else:
            seen[name]["days_present"] += 1

    return sorted(seen.values(), key=lambda x: x["worker_name"] or "")
