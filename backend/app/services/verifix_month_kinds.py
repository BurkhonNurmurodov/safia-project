"""Verifix's time kinds per month and brigade (2026-11-02).

The operator, shown a one-time read of them: «Overtime should be taken from
Сверхурочно», and the time kinds — Явка, Отсутствие, Свободное время,
Сверхурочные, Отгул, Ранний уход, Опоздание — belonged in «Hisobotlar»'
Personnel section. From 2026-11-04 the report keeps overtime alone and the
other six are on «Odam soni · Davomat» (`REPORT_KINDS` / `ATTENDANCE_KINDS`). They are Verifix's own figures, so they are READ from Verifix
(`core/timesheet$export` for the whole month) and STORED here, because one
month for every production worker is a read of minutes, never something a page
request can wait for.

  WHO   every employee whose CURRENT org unit is a cell with a brigadir
        (`cells.verifix_code` → `cells.manager_id`), hired by the month's last
        day and not dismissed before its first. Verifix keeps only today's
        placement, so someone who moved brigade is counted in the new one.
  WHAT  Σ fact_value (minutes) per (unit, time kind) over the month's days,
        and the person-days that carried the kind.
  WHEN  the current month every 3 hours, the month before until the 7th of the
        next month (late corrections), and any month the report asks for that
        was never read (`want`, a background read — the page shows «—» until
        it lands). A read cut short keeps the last complete one.

  SPLIT every kind by the worker's JOB (2026-11-02, the operator: «Overtime
        should be two — direct workers, counted in Zagruzka, and indirect»):
        `kpi_calculator.is_direct_role` on the Verifix job (Кондитер…,
        Фасовщик, Заготовитель, a blank job → direct; anything else →
        indirect), the job read off the stored org (`verifix_org`). A row's
        `kind_id` is «<kind>:d» or «<kind>:i»; `totals` also hands out the
        plain «<kind>» sum.

Rows: `models.VerifixMonthKind`; per-month meta in app setting
`vfx_month_kinds2:<ym>` (read time, people, partial, error) — «2» since the
split, so every month stored before it is read again.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from app.database import SessionLocal
from app.models import AppSetting, Cell, VerifixMonthKind

log = logging.getLogger(__name__)

# The kinds each page prints, in its order: (kind key, row key) — a kind key
# is a Verifix time_kind_id, or «<id>:d» / «<id>:i» for its direct / indirect
# workers' share. From 2026-11-04 (the operator: «we don't need these figures
# apart from Overtime … put them in Attendance screen») «Hisobotlar» prints
# overtime (34) alone, as its two halves, and «Odam soni · Davomat»
# (`GET /api/workers/verifix-kinds`) prints the other six.
REPORT_KINDS = [("34:d", "overtimeDirect"), ("34:i", "overtimeIndirect")]
ATTENDANCE_KINDS = [("23", "vkPresence"), ("26", "vkAbsence"), ("27", "vkFree"),
                    ("31", "vkDayOff"), ("25", "vkEarlyLeave"), ("24", "vkLate")]
TRACKED = REPORT_KINDS + ATTENDANCE_KINDS

BUDGET_S = 900.0
FRESH_CURRENT = timedelta(hours=3)
FRESH_PREVIOUS = timedelta(hours=12)
PREVIOUS_UNTIL_DAY = 7
RETRY_MISSING = timedelta(hours=1)
BOOT_DELAY_S = 240

_lock = threading.Lock()
_tried: dict[str, float] = {}      # ym → monotonic time of the last on-demand try


def _meta_key(ym: str) -> str:
    return f"vfx_month_kinds2:{ym}"


def _bounds(ym: str) -> tuple[date, date]:
    y, m = (int(x) for x in ym.split("-"))
    first = date(y, m, 1)
    nxt = date(y + (m == 12), m % 12 + 1, 1)
    return first, nxt - timedelta(days=1)


def _ym(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def meta(db, ym: str) -> Optional[dict]:
    row = db.query(AppSetting).filter_by(key=_meta_key(ym)).first()
    if not row or not row.value:
        return None
    try:
        return json.loads(row.value)
    except ValueError:
        return None


def _set_meta(db, ym: str, value: dict) -> None:
    row = db.query(AppSetting).filter_by(key=_meta_key(ym)).first()
    if row is None:
        db.add(AppSetting(key=_meta_key(ym), value=json.dumps(value)))
    else:
        row.value = json.dumps(value)


def _read_at(m: Optional[dict]) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(m["read_at"]) if m and m.get("read_at") else None
    except (ValueError, TypeError):
        return None


def stored(db, yms: Iterable[str]) -> set[str]:
    """The months a COMPLETE-or-partial read has landed for."""
    return {ym for ym in yms if _read_at(meta(db, ym)) is not None}


def totals(db, yms: list[str], ids: Iterable[int]) -> dict[str, dict[str, float]]:
    """{ym: {kind key: minutes}} over the units `ids` — «<id>:d», «<id>:i»
    and their sum «<id>» — only for the months a read has landed for, so a
    month never read is ABSENT (the report prints «—»), never a row of zeros."""
    ids = list(ids)
    have = stored(db, yms)
    out: dict[str, dict[str, float]] = {ym: {} for ym in yms if ym in have}
    if not ids or not out:
        return out
    rows = (db.query(VerifixMonthKind.ym, VerifixMonthKind.kind_id, VerifixMonthKind.minutes)
            .filter(VerifixMonthKind.ym.in_(list(out)),
                    VerifixMonthKind.manager_id.in_(ids))
            .all())
    for ym, kid, minutes in rows:
        v = float(minutes or 0)
        out[ym][kid] = out[ym].get(kid, 0.0) + v
        base = kid.split(":")[0]
        if base != kid:
            out[ym][base] = out[ym].get(base, 0.0) + v
    return out


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def read_month(ym: str, trigger: str) -> dict:
    """Read one month from Verifix and replace its rows. One read at a time in
    a process; a second caller returns «busy» at once."""
    if not _lock.acquire(blocking=False):
        return {"ok": False, "error": "busy"}
    try:
        return _read_month(ym, trigger)
    finally:
        _lock.release()


def _read_month(ym: str, trigger: str) -> dict:
    from app.services import action_log, verifix, verifix_org
    from app.services.kpi_calculator import is_direct_role
    from app.services.verifix_attendance import ID_CHUNK, _day, _directory

    first, last = _bounds(ym)
    started = time.monotonic()
    deadline = started + BUDGET_S
    db = SessionLocal()
    try:
        cfg = verifix.config(db, with_password=True)
        if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
            return {"ok": False, "error": "not_configured"}
        code_unit = {verifix._code_key(code): mid
                     for code, mid in db.query(Cell.verifix_code, Cell.manager_id).all()
                     if mid is not None}
        # The job decides direct / indirect — off the stored org, read again
        # only when it is older than a day.
        org, _at, _fresh = verifix_org.refresh(db, max_age=24 * 3600)
        if not org or not org.get("jobs"):
            return {"ok": False, "error": "no_org"}
        org_emps = org.get("emps") or {}

        def group(eid: str) -> str:
            job = verifix_org.job_name(org, (org_emps.get(eid) or {}).get("job"))
            return "d" if is_direct_role(job, 1) else "i"
        db.rollback()   # hold no transaction across the Verifix read

        kinds: dict[str, str] = {}
        with verifix.client(cfg) as cl:
            for page in verifix.each_page(cl, "core/time_kind$list", {"time_kind_ids": []},
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for k in page:
                    kid = str(k.get("time_kind_id") or "")
                    if kid:
                        kinds[kid] = k.get("name") or kid

        directory = _directory(cfg, deadline)
        org_code, emps = directory["units"], directory["emps"]
        who: dict[int, int] = {}
        grp: dict[int, str] = {}
        for eid, (unit, hired, dismissed, *_r) in emps.items():
            mid = code_unit.get(org_code.get(unit, ""))
            if mid is None or not eid.isdigit():
                continue
            if (hired and hired > last) or (dismissed and dismissed < first):
                continue
            who[int(eid)] = mid
            grp[int(eid)] = group(eid)

        minutes: dict[tuple[int, str], float] = defaultdict(float)
        pdays: dict[tuple[int, str], int] = defaultdict(int)
        partial = False
        chunks = [sorted(who)[i:i + ID_CHUNK] for i in range(0, len(who), ID_CHUNK)]
        try:
            with verifix.client(cfg) as cl:
                for chunk in chunks:
                    body = {"period_begin_date": verifix._dmy(first),
                            "period_end_date": verifix._dmy(last),
                            "division_ids": [], "employee_ids": chunk}
                    for page in verifix.each_page(cl, "core/timesheet$export", body,
                                                  limit=verifix.LIMIT_TIMESHEET,
                                                  deadline=deadline):
                        for rec in page:
                            eid = str(rec.get("employee_id") or "")
                            mid = who.get(int(eid)) if eid.isdigit() else None
                            if mid is None:
                                continue
                            g = grp[int(eid)]
                            for d in rec.get("days") or []:
                                day = _day(d.get("date"))
                                if day is None or not (first <= day <= last):
                                    continue
                                seen = set()
                                for f in d.get("facts") or []:
                                    k = str(f.get("time_kind_id") or "")
                                    v = _num(f.get("fact_value"))
                                    if k and v:
                                        minutes[(mid, f"{k}:{g}")] += v
                                        seen.add(f"{k}:{g}")
                                for k in seen:
                                    pdays[(mid, k)] += 1
        except verifix.VerifixError as exc:
            if exc.code != "slow" or not minutes:
                raise
            partial = True

        prev = meta(db, ym)
        if partial and prev and not prev.get("partial"):
            log.warning("verifix month kinds %s: read cut short — the last complete one stays", ym)
            return {"ok": False, "error": "partial"}

        now = datetime.now(timezone.utc)
        db.query(VerifixMonthKind).filter(VerifixMonthKind.ym == ym).delete(synchronize_session=False)
        for (mid, k), v in minutes.items():
            db.add(VerifixMonthKind(ym=ym, manager_id=mid, kind_id=k,
                                    kind_name=(kinds.get(k.split(":")[0]) or k)[:160],
                                    minutes=round(v, 2),
                                    person_days=pdays.get((mid, k), 0), read_at=now))
        _set_meta(db, ym, {"read_at": now.isoformat(), "people": len(who),
                           "direct": sum(1 for g in grp.values() if g == "d"),
                           "partial": partial, "trigger": trigger,
                           "seconds": round(time.monotonic() - started, 1)})
        db.commit()
        action_log.record_system("sync_export", "sync.verifix_month_kinds", db=None, details=[
            ("month", ym), ("trigger", trigger), ("people", len(who)),
            ("units", len({mid for mid, _k in minutes})), ("partial", partial),
        ])
        log.info("verifix month kinds %s: %s people, %s rows%s", ym, len(who),
                 len(minutes), " (partial)" if partial else "")
        try:
            from app.routers import reports as reports_router
            reports_router._KEPT.forget()
        except Exception:  # noqa: BLE001 — a stale kept answer expires by itself
            pass
        return {"ok": True, "people": len(who), "partial": partial}
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        log.exception("verifix month kinds %s failed", ym)
        return {"ok": False, "error": str(exc)[:200]}
    finally:
        db.close()


def due(db, today: date) -> list[str]:
    """The months the scheduled read should refresh now."""
    now = datetime.now(timezone.utc)
    cur = _ym(today)
    prev = _ym(today.replace(day=1) - timedelta(days=1))
    out = []
    at = _read_at(meta(db, prev))
    if at is None or (today.day <= PREVIOUS_UNTIL_DAY and now - at > FRESH_PREVIOUS):
        out.append(prev)
    at = _read_at(meta(db, cur))
    if at is None or now - at > FRESH_CURRENT:
        out.append(cur)
    return out


def run_job(trigger: str = "schedule") -> None:
    from app.services import turnover
    db = SessionLocal()
    try:
        today = turnover.local(turnover.now_aware()).date()
        months = due(db, today)
    finally:
        db.close()
    for ym in months:
        read_month(ym, trigger)


def want(yms: Iterable[str]) -> None:
    """Start a background read of any month a page asked for that was never
    read — at most one try an hour per month, never blocking the request."""
    db = SessionLocal()
    try:
        missing = [ym for ym in yms if ym not in stored(db, [ym])]
    finally:
        db.close()
    now = time.monotonic()
    missing = [ym for ym in missing
               if now - _tried.get(ym, -1e9) > RETRY_MISSING.total_seconds()]
    if not missing or _lock.locked():
        return
    for ym in missing:
        _tried[ym] = now

    def go():
        for ym in missing:
            read_month(ym, "report")

    threading.Thread(target=go, name="verifix-month-kinds", daemon=True).start()


def register_jobs() -> None:
    """Every hour at :50 (the read decides whether anything is due), and a
    catch-up after boot. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        get_scheduler().add_job(
            run_job, trigger=CronTrigger(minute=50, timezone=SCHEDULER_TZ),
            id="verifix-month-kinds", replace_existing=True)
        schedule_at("verifix-month-kinds-boot",
                    datetime.now(timezone.utc) + timedelta(seconds=BOOT_DELAY_S),
                    run_job, args=("boot",))
        log.info("verifix month kinds: jobs registered (hourly at :50)")
    except Exception:  # noqa: BLE001
        log.exception("verifix month kinds: could not register the jobs")
