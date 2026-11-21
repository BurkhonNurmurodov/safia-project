"""«Auditlar» — the KRU and technical audits, read from panel.safiabakery.uz
(docs/audits.md).

The source is the panel's «Минусы» report, the one the «Panel: audit minuslari»
card (`/panel/sdpanel`, services/sd_panel.py) signs in to: the same stored
login, the same parser, any period, either audit type — `type` 10 is «КРУ
Производство», 16 «Технический аудит». **A row is ONE checklist question that
lost points in one inspection**; an inspection scored 100 % has no row, so
every figure here is over the inspections that lost points, and the page says
so once.

Rows are KEPT (`panel_audit_rows`): a month of one kind is read and replaced
whole — by «Yangilash» on the page, and every two hours by day for the current
month (the previous one too in a month's first five days). Nothing is written
to the panel. **A refused login is never repeated by the clock**: the job stops
until the stored password changes, so a wrong password cannot lock the account.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import mean
from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import PanelAuditRow
from app.services import sd_panel
from app.services.verifix import TZ, _get, _put

log = logging.getLogger(__name__)

KINDS = {"kru": 10, "tech": 16}
K_STATE = "panel_audits_state"   # JSON: {"months": {kind: {YYYY-MM: {...}}}, "refused": fp}
MAX_MONTHS = 6                   # one press reads at most this many months
BUDGET_S = 70.0                  # inside Cloudflare's 100 s
BANDS = (90.0, 80.0, 70.0)       # the technologists' audit bands (tech_audit): >90 · >80 · >70 · else
SORTS = {"day", "workshop", "inspector", "total", "rating", "task", "question", "top"}

_lock = threading.Lock()


# ── months and state ──────────────────────────────────────────────────────────

def first_of(d: date) -> date:
    return d.replace(day=1)


def next_month(m: date) -> date:
    return (m.replace(day=28) + timedelta(days=4)).replace(day=1)


def months_between(d1: date, d2: date) -> list[date]:
    out, m = [], first_of(d1)
    while m <= d2:
        out.append(m)
        m = next_month(m)
    return out


def _mkey(m: date) -> str:
    return m.strftime("%Y-%m")


def state(db: Session) -> dict:
    raw = _get(db, K_STATE)
    try:
        st = json.loads(raw) if raw else {}
    except ValueError:
        st = {}
    st.setdefault("months", {})
    return st


def _fingerprint(sealed: Optional[str]) -> Optional[str]:
    return hashlib.sha256(sealed.encode()).hexdigest()[:16] if sealed else None


def configured(db: Session) -> dict:
    from app.web_auth import open_password

    user = _get(db, sd_panel.K_USER)
    sealed = _get(db, sd_panel.K_PASS)
    st = state(db)
    return {"configured": bool(user and sealed),
            "readable": (open_password(sealed) is not None) if sealed else None,
            "refused": bool(sealed) and st.get("refused") == _fingerprint(sealed)}


# ── reading the panel ─────────────────────────────────────────────────────────

def refresh(db: Session, kinds: list[str], months: list[date], actor: str = "",
            auto: bool = False) -> dict:
    """Read each (kind, month) report with ONE login and replace those months'
    rows. Never raises; the answer says what was read and what was not."""
    from app.web_auth import open_password

    kinds = [k for k in kinds if k in KINDS]
    months = sorted(set(months))[-MAX_MONTHS:]
    if not kinds or not months:
        return {"ok": False, "code": "nothing"}
    if not _lock.acquire(blocking=False):
        return {"ok": False, "code": "busy"}
    try:
        started = time.monotonic()
        user = _get(db, sd_panel.K_USER)
        sealed = _get(db, sd_panel.K_PASS)
        password = open_password(sealed) if sealed else None
        st = state(db)
        fp = _fingerprint(sealed)
        if not user or not sealed:
            return {"ok": False, "code": "no_login"}
        if password is None:
            return {"ok": False, "code": "unreadable"}
        if auto and st.get("refused") == fp:
            return {"ok": False, "code": "refused_before"}
        plan = {(k, m): sd_panel.report_path(m.isoformat(), (next_month(m) - timedelta(days=1)).isoformat(),
                                             KINDS[k])
                for k in kinds for m in months}
        db.rollback()  # hand the connection back for the network wait
        now = datetime.now(TZ)
        results: list[dict] = []
        try:
            got = sd_panel.read_reports(user, password, list(plan.values()),
                                        deadline=started + BUDGET_S - 25)
        except sd_panel.PanelError as e:
            if e.code == "refused":
                st["refused"] = fp
                _save_state(db, st)
            log.info("panel audits: login failed — %s", e.code)
            return {"ok": False, "code": e.code, "message": e.message, "status": e.status}
        st.pop("refused", None)
        for (kind, m), path in plan.items():
            res = got.get(path)
            slot = st["months"].setdefault(kind, {})
            if isinstance(res, list):
                _replace(db, kind, m, res, now)
                slot[_mkey(m)] = {"at": now.isoformat(timespec="seconds"), "rows": len(res), "ok": True,
                                  "by": actor or ("auto" if auto else "")}
                results.append({"kind": kind, "month": _mkey(m), "ok": True, "rows": len(res)})
            else:
                e = res if isinstance(res, sd_panel.PanelError) else sd_panel.PanelError("missing")
                prev = slot.get(_mkey(m)) or {}
                slot[_mkey(m)] = {**prev, "error": e.code, "error_at": now.isoformat(timespec="seconds")}
                results.append({"kind": kind, "month": _mkey(m), "ok": False, "code": e.code,
                                "message": e.message})
        _save_state(db, st)
        ms = int((time.monotonic() - started) * 1000)
        log.info("panel audits: %s read in %s ms (%s)", len(results), ms, actor or "auto")
        return {"ok": all(r["ok"] for r in results), "results": results, "ms": ms}
    finally:
        _lock.release()


def _replace(db: Session, kind: str, m: date, rows: list[dict], now: datetime) -> None:
    db.query(PanelAuditRow).filter(PanelAuditRow.kind == kind, PanelAuditRow.month == m).delete(
        synchronize_session=False)
    db.bulk_save_objects([PanelAuditRow(
        kind=kind, month=m, day=date.fromisoformat(r["day"]) if r.get("day") else None,
        workshop_id=r.get("workshop_id"), workshop=(r.get("workshop") or "")[:300] or None,
        inspector=(r.get("inspector") or "")[:200] or None, total=r.get("total"), rating=r.get("rating"),
        task_id=r.get("task_id"), task=(r.get("task") or "")[:500] or None, question_id=r.get("item"),
        question=r.get("question") or None, comment=r.get("comment") or None, top=r.get("top"),
        read_at=now) for r in rows])
    db.commit()


def _save_state(db: Session, st: dict) -> None:
    try:
        _put(db, K_STATE, json.dumps(st, ensure_ascii=False))
        db.commit()
    except Exception:
        db.rollback()
        log.exception("panel audits: could not store the state")


# ── the clock ─────────────────────────────────────────────────────────────────

def _scheduled() -> None:
    from app.database import SessionLocal

    today = datetime.now(TZ).date()
    months = [first_of(today)] + ([first_of(first_of(today) - timedelta(days=1))] if today.day <= 5 else [])
    db = SessionLocal()
    try:
        if not configured(db)["configured"]:
            return
        refresh(db, list(KINDS), months, actor="auto", auto=True)
    except Exception:  # noqa: BLE001
        log.exception("panel audits: the scheduled read failed")
    finally:
        db.close()


def _boot() -> None:
    """Read the current month once after a boot when it was never read."""
    from app.database import SessionLocal

    db = SessionLocal()
    try:
        m = _mkey(first_of(datetime.now(TZ).date()))
        st = state(db)["months"]
        due = any(m not in (st.get(k) or {}) for k in KINDS)
    finally:
        db.close()
    if due:
        _scheduled()


def register_jobs() -> None:
    """Every two hours from 07:20 to 21:20 Tashkent, plus a catch-up three
    minutes after boot. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        get_scheduler().add_job(
            _scheduled, trigger=CronTrigger(hour="7-21/2", minute=20, timezone=SCHEDULER_TZ),
            id="panel-audits-read", replace_existing=True)
        schedule_at("panel-audits-boot", datetime.now(TZ) + timedelta(minutes=3), _boot)
        log.info("panel audits: jobs registered (every 2 h by day)")
    except Exception:  # noqa: BLE001
        log.exception("panel audits: could not register the jobs")


# ── the page's questions ──────────────────────────────────────────────────────

def _scoped(db: Session, kind: str, d1: date, d2: date, f: dict):
    q = db.query(PanelAuditRow).filter(PanelAuditRow.kind == kind, PanelAuditRow.day >= d1,
                                       PanelAuditRow.day <= d2)
    if f.get("workshop"):
        q = q.filter(PanelAuditRow.workshop.in_(f["workshop"]))
    if f.get("inspector"):
        q = q.filter(PanelAuditRow.inspector.in_(f["inspector"]))
    if f.get("task"):
        q = q.filter(PanelAuditRow.task.in_(f["task"]))
    if f.get("question"):
        q = q.filter(PanelAuditRow.question == f["question"])
    if f.get("top"):
        q = q.filter(PanelAuditRow.top.isnot(None))
    return q


def facets(db: Session, kind: str, d1: date, d2: date) -> dict:
    base = db.query(PanelAuditRow).filter(PanelAuditRow.kind == kind, PanelAuditRow.day >= d1,
                                          PanelAuditRow.day <= d2)

    def counts(col):
        return [{"value": v, "count": n} for v, n in
                base.with_entities(col, func.count()).filter(col.isnot(None)).group_by(col)
                .order_by(func.count().desc()).all()]

    return {"workshop": counts(PanelAuditRow.workshop), "inspector": counts(PanelAuditRow.inspector),
            "task": counts(PanelAuditRow.task)}


def _row(r: PanelAuditRow) -> dict:
    return {"id": r.id, "day": r.day.isoformat() if r.day else None, "workshop": r.workshop,
            "workshop_id": r.workshop_id, "inspector": r.inspector, "total": r.total, "rating": r.rating,
            "task": r.task, "task_id": r.task_id, "question": r.question, "comment": r.comment, "top": r.top}


def rows(db: Session, kind: str, d1: date, d2: date, f: dict, q: str = "", sort: str = "day",
         desc: bool = True, page: int = 1, size: int = 50) -> dict:
    query = _scoped(db, kind, d1, d2, f)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(PanelAuditRow.workshop.ilike(like), PanelAuditRow.inspector.ilike(like),
                                 PanelAuditRow.task.ilike(like), PanelAuditRow.question.ilike(like),
                                 PanelAuditRow.comment.ilike(like)))
    total = query.count()
    col = getattr(PanelAuditRow, sort if sort in SORTS else "day")
    order = [col.desc().nullslast() if desc else col.asc().nullsfirst(), PanelAuditRow.id.desc()]
    page = max(1, page)
    items = query.order_by(*order).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size, "rows": [_row(r) for r in items]}


def band_of(total: Optional[float]) -> Optional[str]:
    if total is None:
        return None
    return "a90" if total > BANDS[0] else "a80" if total > BANDS[1] else "a70" if total > BANDS[2] else "low"


def _inspections(items: list[PanelAuditRow]) -> dict:
    """One inspection = one workshop, inspector, day and overall % — the
    report repeats them on every question that lost points."""
    out: dict[tuple, dict] = {}
    for r in items:
        k = (r.workshop_id or r.workshop, r.inspector, r.day, r.total)
        i = out.get(k)
        if i is None:
            i = out[k] = {"workshop": r.workshop, "inspector": r.inspector, "day": r.day,
                          "total": r.total, "minuses": 0, "top": 0}
        i["minuses"] += 1
        i["top"] += 1 if r.top is not None else 0
    return out


def _avg(xs) -> Optional[float]:
    xs = [x for x in xs if x is not None]
    return round(mean(xs), 1) if xs else None


def analysis(db: Session, kind: str, d1: date, d2: date, f: dict) -> dict:
    items = _scoped(db, kind, d1, d2, f).all()
    insp = list(_inspections(items).values())
    bands = {"a90": 0, "a80": 0, "a70": 0, "low": 0}
    for i in insp:
        b = band_of(i["total"])
        if b:
            bands[b] += 1

    shops: dict[str, dict] = defaultdict(lambda: {"inspections": 0, "totals": [], "minuses": 0})
    for i in insp:
        s = shops[i["workshop"] or "—"]
        s["inspections"] += 1
        s["totals"].append(i["total"])
        s["minuses"] += i["minuses"]
    shop_list = sorted(({"name": k, "inspections": v["inspections"], "avg": _avg(v["totals"]),
                         "minuses": v["minuses"]} for k, v in shops.items()),
                       key=lambda s: (s["avg"] if s["avg"] is not None else 999, -s["minuses"]))

    qs: dict[str, dict] = defaultdict(lambda: {"minuses": 0, "shops": set(), "top": 0})
    tasks: dict[str, int] = defaultdict(int)
    for r in items:
        qq = qs[r.question or "—"]
        qq["minuses"] += 1
        qq["shops"].add(r.workshop)
        qq["top"] += 1 if r.top is not None else 0
        tasks[r.task or "—"] += 1
    q_list = sorted(({"name": k, "minuses": v["minuses"], "workshops": len(v["shops"]), "top": v["top"]}
                     for k, v in qs.items()), key=lambda x: -x["minuses"])
    t_sorted = sorted(tasks.items(), key=lambda kv: -kv[1])
    # A whole in at most seven parts: the six biggest and «other» — or all
    # seven when a fold would hold one section.
    keep = 7 if len(t_sorted) <= 7 else 6
    t_list = [{"name": k, "minuses": n} for k, n in t_sorted[:keep]]
    if len(t_sorted) > keep:
        t_list.append({"name": None, "minuses": sum(n for _, n in t_sorted[keep:]), "other": len(t_sorted) - keep})

    days: dict[date, list] = defaultdict(list)
    for i in insp:
        if i["day"]:
            days[i["day"]].append(i["total"])
    trend = [{"day": d.isoformat(), "inspections": len(v), "avg": _avg(v)} for d, v in sorted(days.items())]

    insps: dict[str, list] = defaultdict(list)
    for i in insp:
        insps[i["inspector"] or "—"].append(i["total"])
    inspectors = sorted(({"name": k, "inspections": len(v), "avg": _avg(v)} for k, v in insps.items()),
                        key=lambda x: -x["inspections"])

    # The same span just before, for the change in the average.
    span = (d2 - d1).days + 1
    p2 = d1 - timedelta(days=1)
    prev = list(_inspections(_scoped(db, kind, p2 - timedelta(days=span - 1), p2, f).all()).values())

    return {
        "inspections": len(insp), "minuses": len(items), "top": sum(1 for r in items if r.top is not None),
        "workshops": len(shops), "avg": _avg(i["total"] for i in insp),
        "prev_avg": _avg(i["total"] for i in prev), "prev_inspections": len(prev),
        "bands": bands, "trend": trend, "weakest": shop_list[:10], "questions": q_list[:10],
        "tasks": t_list, "inspectors": inspectors[:8],
        "per_inspection": round(len(items) / len(insp), 1) if insp else None,
    }


def coverage(db: Session, kind: str, d1: date, d2: date) -> dict:
    """Which months of the period were read, and when — the page's one
    freshness line and its «not read yet» state."""
    st = state(db)["months"].get(kind) or {}
    months = months_between(d1, d2)
    read = {_mkey(m): st[_mkey(m)] for m in months if _mkey(m) in st and st[_mkey(m)].get("ok")}
    missing = [_mkey(m) for m in months if _mkey(m) not in read]
    ats = [v["at"] for v in read.values() if v.get("at")]
    errors = {_mkey(m): st[_mkey(m)]["error"] for m in months if (st.get(_mkey(m)) or {}).get("error")}
    return {"months": [_mkey(m) for m in months], "missing": missing, "read_at": max(ats) if ats else None,
            "oldest_at": min(ats) if ats else None, "errors": errors}


def first_day(db: Session, kind: str) -> Optional[str]:
    d = db.query(func.min(PanelAuditRow.day)).filter(PanelAuditRow.kind == kind).scalar()
    return d.isoformat() if d else None


def summary(db: Session) -> dict:
    """The connection card's answer (`/panel/sdpanel`): per audit kind, when it
    was last read, how many months are kept, this month's minuses, and the
    last failure when it is newer than the last good read."""
    st = state(db)
    sealed = _get(db, sd_panel.K_PASS)
    month = first_of(datetime.now(TZ).date())
    counts = dict(db.query(PanelAuditRow.kind, func.count()).filter(PanelAuditRow.month == month)
                  .group_by(PanelAuditRow.kind).all())
    kinds = {}
    for k in KINDS:
        slots = st["months"].get(k) or {}
        ok_at = [v["at"] for v in slots.values() if v.get("ok") and v.get("at")]
        errs = sorted(((v.get("error_at"), v.get("error")) for v in slots.values() if v.get("error")),
                      key=lambda x: x[0] or "")
        read_at = max(ok_at) if ok_at else None
        err_at, err = errs[-1] if errs else (None, None)
        if err_at and read_at and err_at <= read_at:
            err_at, err = None, None
        kinds[k] = {"read_at": read_at, "months": len(ok_at), "this_month": counts.get(k, 0),
                    "error": err, "error_at": err_at}
    return {"refused": bool(sealed) and st.get("refused") == _fingerprint(sealed), "kinds": kinds,
            "month": _mkey(month)}


def check(db: Session, actor: str = "") -> dict:
    """«Tekshirish» on the card: read the current month of both kinds now."""
    return refresh(db, list(KINDS), [first_of(datetime.now(TZ).date())], actor=actor)
