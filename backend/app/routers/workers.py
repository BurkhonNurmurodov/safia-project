from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_, tuple_

from app.database import get_db
from app.permissions import require_page
from app.models import Attendance, HeadcountData, HrDocument, Manager
from app.services.day_state import confirmed_pairs
from app.services.name_map import sheet_alias_map

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
        .filter(Manager.archived.is_(False))
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

    # Per-day verifix HC (distinct workers present per confirmed day) — the number
    # official_hc is actually comparable to. `total` above counts unique workers
    # across the whole period, which grows with range length and would flag every
    # multi-day selection as a mismatch.
    daily_q = (
        db.query(
            Attendance.manager_id,
            Attendance.date,
            func.count(func.distinct(Attendance.worker_name)).label("hc"),
        )
        .join(Manager, Manager.id == Attendance.manager_id)
        .filter(Attendance.date >= date_from, Attendance.date <= date_to)
        .filter(Attendance.worker_name.notin_(["nan", "NaN", ""]))
        .filter(CALC_ROWS_FILTER)
        .filter(tuple_(Attendance.manager_id, Attendance.date).in_(list(confirmed)))
        .filter(Manager.archived.is_(False))
    )
    if shift:
        daily_q = daily_q.filter(Manager.shift == shift)
    if manager_id:
        daily_q = daily_q.filter(Attendance.manager_id.in_(manager_id))
    daily_hc: dict[int, dict[date, int]] = {}
    for mgr_id, d, hc in daily_q.group_by(Attendance.manager_id, Attendance.date).all():
        daily_hc.setdefault(mgr_id, {})[d] = hc

    # Official HC per (manager name, day) — HeadcountData spells brigadirs in
    # either alphabet, so accept every known spelling and resolve rows back to
    # the canonical Manager.name (same convention as brigadirs.py).
    alias = sheet_alias_map(db, (m["name"] for m in agg.values()))
    sheet_names = set(alias.keys())
    date_strs = {d.strftime("%d.%m.%Y"): d for days in daily_hc.values() for d in days}
    official: dict[str, dict[date, float]] = {}
    if sheet_names and date_strs:
        for r in db.query(HeadcountData).filter(
            HeadcountData.manager_name.in_(sheet_names),
            HeadcountData.date.in_(list(date_strs)),
        ).all():
            val = float(r.official_hc or 0)
            if val > 0:
                canon = alias.get(r.manager_name, r.manager_name)
                official.setdefault(canon, {})[date_strs[r.date]] = val

    # Same per-day mismatch rule as kpi_calculator.hc_suspicious: |official − verifix| > 2.
    # Days without official data are skipped rather than treated as official=0.
    for m in agg.values():
        days = daily_hc.get(m["manager_id"], {})
        off  = official.get(m["name"], {})
        both = [(days[d], off[d]) for d in days if d in off]
        m["days"] = len(days)
        m["avg_daily_hc"] = round(sum(days.values()) / len(days), 1) if days else 0
        # Per-day present count feeds the supervisor×day attendance heatmap on
        # the frontend. Only confirmed days appear; the grid greys the rest.
        m["daily"] = [{"date": d.strftime("%d.%m.%Y"), "hc": hc}
                      for d, hc in sorted(days.items())]
        if both:
            avg_vfx = sum(v for v, _ in both) / len(both)
            avg_off = sum(o for _, o in both) / len(both)
            m["official_hc"]      = round(avg_off, 1)
            m["official_hc_diff"] = round(abs(avg_off - avg_vfx), 1)
        else:
            m["official_hc"] = m["official_hc_diff"] = None
        m["mismatch_days"] = sum(1 for v, o in both if abs(o - v) > 2)

    return sorted(agg.values(), key=lambda x: (x["shift"] or 0, x["name"] or ""))


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
        .filter(Manager.archived.is_(False))
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


@router.get("/workers/requests-analysis")
def get_requests_analysis(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("workers")),
):
    """Aggregated view of Verifix-edit requests (HrDocuments): who files them and
    on which days, where exchanged workers go (units vs tasks), and which roles
    workers are changed to. No day-close gate — requests exist regardless of
    whether the unit's day was confirmed."""
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    q = (
        db.query(HrDocument, Manager.name, Manager.shift)
        .join(Manager, Manager.id == HrDocument.manager_id)
        .filter(HrDocument.date >= date_from, HrDocument.date <= date_to)
        .filter(HrDocument.doc_type.in_(["people_exchange", "role_change"]))
        .filter(Manager.archived.is_(False))
    )
    if shift:
        q = q.filter(Manager.shift == shift)
    if manager_id:
        q = q.filter(HrDocument.manager_id.in_(manager_id))
    rows = q.all()

    kpi = {"total": 0, "posted": 0, "pending": 0,
           "exchanges": 0, "role_changes": 0,
           "workers_moved": 0, "workers_reassigned": 0}
    sup: dict[int, dict] = {}
    days: dict[date, dict] = {}
    targets: dict[tuple, dict] = {}
    roles: dict[str, dict] = {}
    transitions: dict[tuple, int] = {}

    for doc, mgr_name, mgr_shift in rows:
        payload   = doc.payload or {}
        employees = payload.get("employees") or []
        n_emp     = len(employees)
        posted    = doc.status == "approved"

        kpi["total"] += 1
        kpi["posted" if posted else "pending"] += 1

        s = sup.setdefault(doc.manager_id, {
            "manager_id": doc.manager_id,
            "name":  doc.supervisor_name or mgr_name,
            "shift": mgr_shift,
            "total": 0, "posted": 0,
            "exchanges": 0, "exchange_workers": 0,
            "role_changes": 0, "role_change_workers": 0,
            "_targets": {}, "_roles": {},
        })
        s["total"] += 1
        if posted:
            s["posted"] += 1

        day = days.setdefault(doc.date, {
            "date": doc.date.strftime("%d.%m.%Y"),
            "exchanges": 0, "role_changes": 0, "workers": 0,
        })
        day["workers"] += n_emp

        if doc.doc_type == "people_exchange":
            kpi["exchanges"]     += 1
            kpi["workers_moved"] += n_emp
            s["exchanges"]        += 1
            s["exchange_workers"] += n_emp
            day["exchanges"]      += 1
            ttype = payload.get("target_type") or "task"
            label = (payload.get("target_manager_name") if ttype == "supervisor"
                     else payload.get("task_name")) or "—"
            tgt = targets.setdefault((ttype, label),
                                     {"label": label, "type": ttype, "docs": 0, "workers": 0})
            tgt["docs"]    += 1
            tgt["workers"] += n_emp
            s["_targets"][label] = s["_targets"].get(label, 0) + n_emp
        else:  # role_change
            kpi["role_changes"]       += 1
            kpi["workers_reassigned"] += n_emp
            s["role_changes"]        += 1
            s["role_change_workers"] += n_emp
            day["role_changes"]      += 1
            new_role = payload.get("new_role") or "—"
            r = roles.setdefault(new_role, {"role": new_role, "docs": 0, "workers": 0})
            r["docs"]    += 1
            r["workers"] += n_emp
            s["_roles"][new_role] = s["_roles"].get(new_role, 0) + n_emp
            for e in employees:
                old = ((e or {}).get("old_role") or "—").strip() or "—"
                transitions[(old, new_role)] = transitions.get((old, new_role), 0) + 1

    by_supervisor = []
    for s in sup.values():
        s["top_target"] = max(s["_targets"], key=s["_targets"].get) if s["_targets"] else None
        s["top_role"]   = max(s["_roles"],   key=s["_roles"].get)   if s["_roles"]   else None
        del s["_targets"], s["_roles"]
        by_supervisor.append(s)
    by_supervisor.sort(key=lambda x: (-x["total"], x["name"] or ""))

    day_keys = sorted(days.keys())
    by_day = {
        "dates":        [days[d]["date"]         for d in day_keys],
        "exchanges":    [days[d]["exchanges"]    for d in day_keys],
        "role_changes": [days[d]["role_changes"] for d in day_keys],
        "workers":      [days[d]["workers"]      for d in day_keys],
    }

    return {
        "kpi":           kpi,
        "by_supervisor": by_supervisor,
        "by_day":        by_day,
        "targets":       sorted(targets.values(), key=lambda x: (-x["workers"], x["label"])),
        "roles":         sorted(roles.values(),   key=lambda x: (-x["workers"], x["role"])),
        "transitions":   sorted(
            [{"from": k[0], "to": k[1], "workers": v} for k, v in transitions.items()],
            key=lambda x: (-x["workers"], x["from"], x["to"]),
        )[:20],
    }
