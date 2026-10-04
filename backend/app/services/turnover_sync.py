"""The Verifix read behind «Kadrlar qo'nimsizligi» (`services/turnover.py`).

Verifix knows where a person works TODAY and nothing else, so the turnover KPI
keeps its own history by reading the directory every night at 23:40 (plus a
catch-up shortly after boot, and the admin's «Yangilash»):

1. the units (`core/division$list`) and jobs (`core/job$list`) — a unit's code,
   from its `code` field or the digits its name starts with, is the cell;
2. the whole directory, every status (`core/employee$list`) → `turnover_people`,
   replaced in one transaction: the current month's «working now»;
3. every employment it shows ENDED on or after `turnover.START_MONTH` →
   `turnover_leavers`, kept by its cycle id even after Verifix forgets it (a
   re-hire). The same cycle seen working again means the dismissal was undone
   in Verifix — the row is marked cancelled, never counted;
4. the dismissal reasons, from the dismissal journal (`pro/dismissal$list`,
   else `start/dismissal$list`) — only shown, never part of the arithmetic, so
   a role that does not open the journal costs the reasons and nothing else;
5. the list of people working on a month's last day, for every month whose
   last day has reached 23:00 and whose list nobody took yet
   (`turnover.capture_due`) — the denominator, exact from that moment on.

Only catalog READ methods are called (`verifix_catalog`), and only what the
KPI needs is kept: name, status, dates, unit, job. No phone, birthday,
passport, PINFL or pay is read into a table. A daily job at 09:05 closes every
ended month whose closing hour has passed (`turnover.auto_close`).
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import delete

from app.database import SessionLocal
from app.models import TurnoverLeaver, TurnoverPerson, TurnoverRead
from app.services import action_log, turnover, verifix, verifix_catalog as catalog
from app.services import verifix_explore as vx

log = logging.getLogger(__name__)

READ_BUDGET_S = 480.0       # a background read; no Cloudflare in the way
PAGE_CAP = 300
BOOT_DELAY_S = 150
BOOT_IF_OLDER = timedelta(hours=6)
CLOSED = ("forbidden", "missing", "bad_request")

_lock = threading.Lock()


def _guard(path: str) -> None:
    m = catalog.BY_KEY.get(path)
    if m is None or m.blocked:
        raise RuntimeError(f"{path} is not an open catalog read method")


def _rows(cl, path: str, body: dict, limit: int, deadline: float) -> list[dict]:
    _guard(path)
    out: list[dict] = []
    for page in vx._pages(cl, path, body, limit, deadline, cap=PAGE_CAP):
        out.extend(page)
    return out


def _date(raw: Any) -> Optional[date]:
    s = vx._d_iso(raw)
    return date.fromisoformat(s) if s else None


def _dmy(d: date) -> str:
    return d.strftime("%d.%m.%Y")


def configured(db) -> bool:
    try:
        vx.config(db)
        return True
    except vx.NotConfigured:
        return False


def running(db) -> bool:
    last = turnover.last_read(db)
    return bool(last and last.finished_at is None and last.started_at
                and turnover.now_aware() - last.started_at < turnover.READ_STALE)


# ── the directory ─────────────────────────────────────────────────────────────

def _person(e: dict, units: dict, jobs: dict, depts: set) -> Optional[dict]:
    """One directory row, projected. A unit that is somebody's DEPARTMENT
    (`division_id`) is not a cell, whatever code it carries — the rule the
    cells sync settled (0006, 0012, 111, 112, 400 are departments)."""
    eid = vx._s(e.get("employee_id"))
    if not eid:
        return None
    uid = vx._s(e.get("org_unit_id")) or vx._s(e.get("division_id"))
    u = units.get(uid) or {}
    uname = u.get("name") or vx._s(e.get("org_unit_name")) or None
    code = None if uid in depts else turnover.unit_code(u.get("raw_code"), uname)
    return {
        "employee_id": eid,
        "staff_id": vx._s(e.get("staff_id")) or None,
        "name": vx._name(e) or vx._s(e.get("employee_name")) or f"#{eid}",
        "status": vx._s(e.get("status"))[:2] or None,
        "hired": _date(e.get("hiring_date")),
        "dismissed": _date(e.get("dismissal_date")),
        "unit_id": uid or None,
        "unit_name": uname,
        "code": code,
        "job": jobs.get(vx._s(e.get("job_id"))) or vx._s(e.get("job_name")) or None,
    }


def _leavers(db, people: list[dict], at: datetime) -> int:
    """Record every employment that ended from START on; mark undone ones."""
    today = turnover.local(at).date()
    start = turnover.START_MONTH
    existing = {x.key: x for x in db.query(TurnoverLeaver).all()}
    by_staff = {x.staff_id: x for x in existing.values() if x.staff_id}
    by_emp: dict[str, list] = {}
    for x in existing.values():
        if not x.staff_id:
            by_emp.setdefault(x.employee_id, []).append(x)
    seen = 0
    for p in people:
        d = p["dismissed"]
        if d and start <= d <= today:
            k = turnover.event_key(p["staff_id"], p["employee_id"], d)
            x = existing.get(k)
            if x is None:
                x = TurnoverLeaver(key=k, employee_id=p["employee_id"], first_seen=at)
                db.add(x)
                existing[k] = x
            x.staff_id = p["staff_id"]
            x.name = p["name"]
            x.hired = p["hired"]
            x.dismissed = d
            x.unit_id = p["unit_id"]
            x.unit_name = p["unit_name"]
            x.code = p["code"]
            x.job = p["job"]
            x.last_seen = at
            x.cancelled_at = None
            seen += 1
            continue
        # Not (or no longer) an ended employment in range: the SAME cycle that
        # was recorded as dismissed is working again, or its date moved out.
        sid = p["staff_id"]
        if sid and sid in by_staff:
            x = by_staff[sid]
            if x.cancelled_at is None:
                x.cancelled_at = at
        elif not sid:
            for x in by_emp.get(p["employee_id"], []):
                if (x.cancelled_at is None and p["status"] in ("W", "U")
                        and p["hired"] and p["hired"] <= x.dismissed):
                    x.cancelled_at = at
    return seen


def _reasons(db, cl, deadline: float, today: date) -> str:
    """Put the dismissal reason beside each recorded leaver. "ok" · "closed"
    (the API role does not open the journal) · "error"."""
    events = db.query(TurnoverLeaver).filter(TurnoverLeaver.cancelled_at.is_(None)).all()
    if not events:
        return "ok"
    by_staff = {x.staff_id: x for x in events if x.staff_id}
    by_pair = {(x.employee_id, x.dismissed): x for x in events}
    lines: list[tuple] = []
    try:
        body = {"journal_ids": [],
                "journal_begin_date": _dmy(turnover.START_MONTH - timedelta(days=31)),
                "journal_end_date": _dmy(today)}
        for j in _rows(cl, "pro/dismissal$list", body, 100, deadline):
            if vx._s(j.get("journal_posted")) == "N":
                continue          # not posted = not in force
            for x in j.get("dismissals") or []:
                if isinstance(x, dict):
                    lines.append((vx._s(x.get("staff_id")), vx._s(x.get("employee_id")),
                                  _date(x.get("dismissal_date")),
                                  vx._s(x.get("dismissal_reason_name")) or None,
                                  vx._s(x.get("dismissal_note")) or None))
    except verifix.VerifixError as exc:
        if vx._classify(exc) not in CLOSED:
            log.warning("turnover: dismissal journal failed: %s", exc.message or exc.code)
            return "error"
        try:
            for x in _rows(cl, "start/dismissal$list", {"journal_ids": []}, 500, deadline):
                lines.append((vx._s(x.get("staff_id")), vx._s(x.get("employee_id")),
                              _date(x.get("dismissal_date")),
                              vx._s(x.get("dismissal_reason_name")) or None,
                              vx._s(x.get("note")) or None))
        except verifix.VerifixError as exc2:
            return "closed" if vx._classify(exc2) in CLOSED else "error"
    for sid, eid, d, reason, note in lines:
        x = (by_staff.get(sid) if sid else None) or by_pair.get((eid, d))
        if x is not None:
            x.reason = reason
            x.note = note
    return "ok"


def _month_journal(cl, deadline: float, m: date, today: date) -> Optional[list[dict]]:
    """Every dismissal-journal line dated in month `m` — the leavers Verifix's
    directory no longer shows (re-hired since), and everybody's reason. None
    when the API role does not open the journal (the month is then computed
    without the re-hired, and says so)."""
    d = turnover.last_day(m)
    out: list[dict] = []

    def line(x: dict, note_key: str) -> None:
        dd = _date(x.get("dismissal_date"))
        if dd and m <= dd <= d:
            out.append({"staff_id": vx._s(x.get("staff_id")) or None,
                        "employee_id": vx._s(x.get("employee_id")) or None,
                        "name": vx._s(x.get("employee_name")) or None, "date": dd,
                        "reason": vx._s(x.get("dismissal_reason_name")) or None,
                        "note": vx._s(x.get(note_key)) or None})
    try:
        body = {"journal_ids": [], "journal_begin_date": _dmy(m - timedelta(days=31)),
                "journal_end_date": _dmy(min(today, d + timedelta(days=92)))}
        for j in _rows(cl, "pro/dismissal$list", body, 100, deadline):
            if vx._s(j.get("journal_posted")) == "N":
                continue
            for x in j.get("dismissals") or []:
                if isinstance(x, dict):
                    line(x, "dismissal_note")
        return out
    except verifix.VerifixError as exc:
        if vx._classify(exc) not in CLOSED:
            raise
    try:
        for x in _rows(cl, "start/dismissal$list", {"journal_ids": []}, 500, deadline):
            line(x, "note")
        return out
    except verifix.VerifixError as exc:
        if vx._classify(exc) in CLOSED:
            return None
        raise


def run_read(trigger: str, month: Optional[date] = None, by: Optional[str] = None) -> dict:
    """One complete read. Refuses while another read runs (this process or a
    second copy during a deploy). Never raises.

    With `month` (a PAST month, an admin's «Hisoblash» / «Yangilash») the read
    then computes that month and saves it (`turnover.save_past`)."""
    if not _lock.acquire(blocking=False):
        return {"started": False, "reason": "busy"}
    db = SessionLocal()
    rd = None
    try:
        if running(db):
            return {"started": False, "reason": "busy"}
        try:
            c = vx.config(db)
        except vx.NotConfigured:
            return {"started": False, "reason": "not_configured"}
        at = turnover.now_aware()
        rd = TurnoverRead(started_at=at, trigger=trigger[:120])
        db.add(rd)
        db.commit()
        deadline = time.monotonic() + READ_BUDGET_S
        with verifix.client(c) as cl:
            units: dict[str, dict] = {}
            for d in _rows(cl, "core/division$list", {"division_ids": []}, 500, deadline):
                did = vx._s(d.get("division_id"))
                if did:
                    units[did] = {"name": vx._s(d.get("name")) or None, "raw_code": vx._s(d.get("code")) or None}
            jobs = {vx._s(j.get("job_id")): vx._s(j.get("name")) or None
                    for j in _rows(cl, "core/job$list", {"job_ids": []}, 500, deadline)}
            raw = _rows(cl, "core/employee$list", {"employee_ids": [], "statuses": [], "npins": []},
                        verifix.LIMIT_LIST, deadline)
            depts = {vx._s(e.get("division_id")) for e in raw if vx._s(e.get("division_id"))}
            people = [p for p in (_person(e, units, jobs, depts) for e in raw) if p]
            if not people:
                raise verifix.VerifixError("empty", "Verifix returned no employees")
            at = turnover.now_aware()
            db.execute(delete(TurnoverPerson))
            db.bulk_insert_mappings(TurnoverPerson, people)
            n_left = _leavers(db, people, at)
            db.commit()
            # The reasons are a garnish: a failure there keeps the directory.
            rd.reasons = _reasons(db, cl, deadline, turnover.local(at).date())
            db.commit()
            if month is not None:
                journal = _month_journal(cl, deadline, month, turnover.local(at).date())
                saved = turnover.save_past(db, month, journal, by or trigger, at)
                db.commit()
                action_log.record_system("leader_review", "turnover.month_computed", db=None,
                                         target_kind="month", target_id=saved["month"],
                                         target_name=saved["month"],
                                         details=[("by", by or trigger), ("working", saved["working"]),
                                                  ("leavers", saved["leavers"]), ("rehired", saved["rehired"]),
                                                  ("journal", "ok" if journal is not None else "closed")])
        captured = turnover.capture_due(db, at)
        rd.finished_at = turnover.now_aware()
        rd.ok = True
        rd.employees = len(people)
        rd.in_cells = sum(1 for p in people if p["code"])
        rd.leavers = n_left
        rd.captured = ",".join(captured) or None
        db.commit()
        action_log.record_system("sync_export", "sync.turnover_read", db=None, details=[
            ("trigger", trigger), ("employees", len(people)), ("leavers", n_left),
            ("reasons", rd.reasons), ("captured", rd.captured or "—"),
        ])
        return {"started": True, "ok": True, "employees": len(people), "captured": captured}
    except verifix.VerifixError as exc:
        db.rollback()
        _fail(db, rd, f"{exc.code}: {exc.message}" if exc.message else exc.code)
        return {"started": True, "ok": False, "error": exc.code}
    except Exception as exc:  # noqa: BLE001 — a background read must report, never die silently
        db.rollback()
        log.exception("turnover: read failed")
        _fail(db, rd, f"{type(exc).__name__}: {exc}"[:500])
        return {"started": True, "ok": False, "error": "error"}
    finally:
        db.close()
        _lock.release()


def _fail(db, rd: Optional[TurnoverRead], error: str) -> None:
    if rd is None:
        return
    try:
        row = db.get(TurnoverRead, rd.id)
        if row is not None:
            row.finished_at = turnover.now_aware()
            row.ok = False
            row.error = (error or "error")[:500]
            db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("turnover: could not record the failed read")


def start_read(trigger: str, month: Optional[date] = None, by: Optional[str] = None) -> bool:
    """The admin's buttons: a read (and, with `month`, a past month computed
    and saved) on a thread of its own."""
    if _lock.locked():
        return False
    threading.Thread(target=run_read, args=(trigger, month, by), name="turnover-read", daemon=True).start()
    return True


# ── closing ───────────────────────────────────────────────────────────────────

def close_sweep() -> None:
    db = SessionLocal()
    try:
        closed = turnover.auto_close(db)
        db.commit()
        for m in closed:
            action_log.record_system("leader_review", "turnover.month_closed", db=None,
                                     target_kind="month", target_id=m, target_name=m,
                                     details=[("by", "system")])
        if closed:
            log.info("turnover: closed %s", ", ".join(closed))
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("turnover: close sweep failed")
    finally:
        db.close()


def _boot() -> None:
    db = SessionLocal()
    try:
        if not configured(db):
            log.info("turnover: Verifix is not configured — no boot read")
            return
        ok = turnover.last_read(db, ok_only=True)
        due = ok is None or ok.finished_at is None or turnover.now_aware() - ok.finished_at > BOOT_IF_OLDER
    finally:
        db.close()
    if due:
        run_read("boot")
    close_sweep()


def _night() -> None:
    db = SessionLocal()
    try:
        ok = configured(db)
    finally:
        db.close()
    if ok:
        run_read("night")


def register_jobs() -> None:
    """Nightly read 23:40, closing sweep 09:05, and a catch-up read after boot
    when the last complete one is older than six hours — a deploy that lands
    on 23:40 must not cost a month its list. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        h, mi = turnover.NIGHT_READ
        get_scheduler().add_job(_night, trigger=CronTrigger(hour=h, minute=mi, timezone=SCHEDULER_TZ),
                                id="turnover-night-read", replace_existing=True)
        get_scheduler().add_job(close_sweep, trigger=CronTrigger(hour=turnover.CLOSE_HOUR, minute=5,
                                                                 timezone=SCHEDULER_TZ),
                                id="turnover-close", replace_existing=True)
        schedule_at("turnover-boot", datetime.now(timezone.utc) + timedelta(seconds=BOOT_DELAY_S), _boot)
        log.info("turnover: jobs registered (read %02d:%02d, close %02d:05)", h, mi, turnover.CLOSE_HOUR)
    except Exception:  # noqa: BLE001
        log.exception("turnover: could not register the jobs")
