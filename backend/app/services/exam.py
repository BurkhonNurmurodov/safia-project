"""The exam's lifecycle — assign · start · work · submit/expire · cancel — and
its two daily jobs. routers/exam.py is the HTTP face of this module.

* One open attempt per (person, kind): an exam is ``assigned`` by an admin,
  ``running`` once the leader presses start, then ``submitted`` (scored) or
  ``expired`` (the admin's deadline passed — scored as it stands) or
  ``cancelled`` (the admin withdrew it). Practice is created ``running`` and
  only ever restarted.
* The task set is snapshotted at start (the bank minus what the admin switched
  off), each task marked open or unavailable for THIS leader.
* Score = passed ÷ available × 100, rounded; the pass mark is read at
  submit time and stored on the attempt, so moving the setting later never
  re-grades anybody.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (AppSetting, ExamAssignment, ExamAttempt, ExamEvent, ExamSandboxRow,
                        ExamTaskResult, Manager, RoleProfile)
from app.services import exam_bank, exam_check, exam_sandbox as sb

log = logging.getLogger(__name__)

SETTING_PASS_MARK = "exam_pass_mark"
SETTING_BADGE = "exam_badge"
SETTING_DISABLED = "exam_disabled_tasks"
DEFAULT_PASS_MARK = 80
OPEN_STATUSES = ("assigned", "running")
KEEP_SANDBOX_DAYS = 90      # an exam's sandbox stays readable to the admin this long
PRACTICE_IDLE_DAYS = 30     # an untouched practice is dropped after this


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── settings ──────────────────────────────────────────────────────────────────

def _setting(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSetting).filter_by(key=key).first()
    return row.value if row else None


def pass_mark(db: Session) -> int:
    try:
        v = int(float(_setting(db, SETTING_PASS_MARK) or DEFAULT_PASS_MARK))
    except ValueError:
        v = DEFAULT_PASS_MARK
    return max(0, min(100, v))


def badge_on(db: Session) -> bool:
    return str(_setting(db, SETTING_BADGE) or "").lower() in ("1", "true", "on", "yes")


def disabled_tasks(db: Session) -> set[str]:
    raw = _setting(db, SETTING_DISABLED)
    if not raw:
        return set()
    try:
        return {str(k) for k in json.loads(raw)}
    except (ValueError, TypeError):
        return set()


def set_disabled_tasks(db: Session, keys: set[str]) -> None:
    row = db.query(AppSetting).filter_by(key=SETTING_DISABLED).first()
    value = json.dumps(sorted(k for k in keys if k in exam_bank.BY_KEY))
    if row is None:
        db.add(AppSetting(key=SETTING_DISABLED, value=value))
    else:
        row.value = value


# ── lookups ───────────────────────────────────────────────────────────────────

def open_attempt(db: Session, profile_key: str, kind: str) -> Optional[ExamAttempt]:
    q = db.query(ExamAttempt).filter(ExamAttempt.profile_key == profile_key, ExamAttempt.kind == kind)
    if kind == "exam":
        q = q.filter(ExamAttempt.status.in_(OPEN_STATUSES))
    else:
        q = q.filter(ExamAttempt.status == "running")
    return q.order_by(ExamAttempt.id.desc()).first()


def latest_exam(db: Session, profile_key: str) -> Optional[ExamAttempt]:
    return (db.query(ExamAttempt)
            .filter(ExamAttempt.profile_key == profile_key, ExamAttempt.kind == "exam",
                    ExamAttempt.status != "cancelled")
            .order_by(ExamAttempt.id.desc()).first())


def results(db: Session, attempt_id: int) -> list[ExamTaskResult]:
    return (db.query(ExamTaskResult).filter(ExamTaskResult.attempt_id == attempt_id)
            .order_by(ExamTaskResult.id).all())


def result_map(db: Session, attempt_id: int) -> dict[str, ExamTaskResult]:
    return {r.task_key: r for r in results(db, attempt_id)}


def task_order(res: list[ExamTaskResult]) -> list[str]:
    keys = {r.task_key for r in res}
    return [t["key"] for t in exam_bank.TASKS if t["key"] in keys]


def counts(res: list[ExamTaskResult]) -> dict:
    c = {"total": len(res), "available": 0, "passed": 0, "skipped": 0, "open": 0, "unavailable": 0}
    for r in res:
        if r.status == "unavailable":
            c["unavailable"] += 1
            continue
        c["available"] += 1
        c[r.status if r.status in ("passed", "skipped") else "open"] += 1
    return c


# ── start ─────────────────────────────────────────────────────────────────────

def start(db: Session, attempt: ExamAttempt, payload: dict, app_version: str = "") -> None:
    """Seed the sandbox and snapshot the task set. Idempotent for a running
    attempt that was already seeded (a second «Boshlash» changes nothing)."""
    if attempt.seeded_at is not None and attempt.status == "running":
        return
    ctx = sb.ctx_for(db, attempt, payload.get("full_name") or "")
    sb.wipe(db, attempt.id)
    db.query(ExamTaskResult).filter(ExamTaskResult.attempt_id == attempt.id).delete()
    db.query(ExamEvent).filter(ExamEvent.attempt_id == attempt.id).delete()
    sb.seed(db, ctx)
    off = disabled_tasks(db)
    first = None
    n = 0
    for task in exam_bank.enabled_tasks(off):
        status, reason = exam_check.availability(db, payload, attempt, task, app_version)
        db.add(ExamTaskResult(attempt_id=attempt.id, task_key=task["key"], status=status, reason=reason))
        n += 1
        if first is None and status == "open":
            first = task["key"]
    attempt.status = "running"
    attempt.started_at = attempt.started_at or _now()
    attempt.seeded_at = _now()
    attempt.task_count = n
    attempt.last_active_at = _now()
    db.flush()
    set_current(db, attempt, first)


def restart_practice(db: Session, attempt: ExamAttempt, payload: dict, app_version: str = "") -> None:
    attempt.seeded_at = None
    attempt.status = "running"
    attempt.started_at = None
    attempt.current_task = None
    attempt.current_since = None
    start(db, attempt, payload, app_version)


# ── the current task and the time record ──────────────────────────────────────

def _bank_time(db: Session, attempt: ExamAttempt) -> None:
    """Add the time spent on the current task to its row."""
    if not attempt.current_task or attempt.current_since is None:
        return
    r = db.query(ExamTaskResult).filter_by(attempt_id=attempt.id, task_key=attempt.current_task).first()
    if r is not None:
        secs = int((_now() - attempt.current_since).total_seconds())
        # A tab left open overnight is not two hours on one task.
        r.seconds = (r.seconds or 0) + max(0, min(secs, 20 * 60))
    attempt.current_since = _now()


def set_current(db: Session, attempt: ExamAttempt, key: Optional[str]) -> None:
    _bank_time(db, attempt)
    attempt.current_task = key
    attempt.current_since = _now() if key else None
    attempt.last_active_at = _now()
    if key:
        r = db.query(ExamTaskResult).filter_by(attempt_id=attempt.id, task_key=key).first()
        if r is not None and r.opened_at is None:
            r.opened_at = _now()


def touch(db: Session, attempt: ExamAttempt) -> None:
    """Called on every interaction: banks the elapsed time without moving."""
    _bank_time(db, attempt)
    attempt.last_active_at = _now()


def next_open(res: list[ExamTaskResult], after: Optional[str]) -> Optional[str]:
    order = task_order(res)
    by = {r.task_key: r for r in res}
    if not order:
        return None
    start_i = order.index(after) + 1 if after in order else 0
    for i in list(range(start_i, len(order))) + list(range(0, start_i)):
        k = order[i]
        if k != after and by[k].status == "open":
            return k
    return None


def skip(db: Session, attempt: ExamAttempt, key: str) -> Optional[str]:
    r = db.query(ExamTaskResult).filter_by(attempt_id=attempt.id, task_key=key).first()
    if r is not None and r.status == "open":
        r.status = "skipped"
    res = results(db, attempt.id)
    nxt = next_open(res, key)
    set_current(db, attempt, nxt)
    return nxt


def reopen(db: Session, attempt: ExamAttempt, key: str) -> None:
    """A skipped task the leader comes back to (ruling 10: skip and return)."""
    r = db.query(ExamTaskResult).filter_by(attempt_id=attempt.id, task_key=key).first()
    if r is not None and r.status == "skipped":
        r.status = "open"


def check(db: Session, attempt: ExamAttempt, key: str, payload: dict, answer=None,
          app_version: str = "", lang: str = "uz") -> dict:
    task = exam_bank.BY_KEY.get(key)
    r = db.query(ExamTaskResult).filter_by(attempt_id=attempt.id, task_key=key).first()
    if task is None or r is None:
        return {"passed": False, "status": None}
    touch(db, attempt)
    if r.status == "passed":
        return {"passed": True, "status": "passed"}
    if r.status == "unavailable":
        return {"passed": False, "status": "unavailable", "reason": r.reason}
    if r.opened_at is None:
        r.opened_at = _now()
    if answer is not None:
        try:
            r.answer = json.dumps(answer, ensure_ascii=False) if not isinstance(answer, str) else answer
        except (TypeError, ValueError):
            r.answer = str(answer)
    try:
        ok, note = exam_check.evaluate(db, attempt, task, r, answer=answer,
                                       app_version=app_version, lang=lang)
    except exam_check.NoData as e:
        r.status = "unavailable"
        r.reason = "no_data"
        log.info("exam: task %s became unavailable for attempt %s (%s)", key, attempt.id, e)
        return {"passed": False, "status": "unavailable", "reason": "no_data"}
    r.checks = (r.checks or 0) + 1
    if ok:
        r.status = "passed"
        r.passed_at = _now()
    return {"passed": ok, "status": r.status}


# ── scoring and closing ───────────────────────────────────────────────────────

def finish(db: Session, attempt: ExamAttempt, status: str = "submitted") -> None:
    """Score and close. ``status`` = submitted | expired."""
    if attempt.status not in OPEN_STATUSES:
        return
    _bank_time(db, attempt)
    res = results(db, attempt.id)
    c = counts(res)
    mark = pass_mark(db)
    score = int(round(c["passed"] * 100 / c["available"])) if c["available"] else 0
    attempt.status = status
    attempt.submitted_at = _now()
    attempt.pass_mark_pct = mark
    attempt.score_pct = score
    attempt.passed = score >= mark
    attempt.current_task = None
    attempt.current_since = None
    db.flush()
    if attempt.kind == "exam":
        _notify_result(db, attempt)


def cancel(db: Session, attempt: ExamAttempt, by: Optional[str]) -> None:
    attempt.status = "cancelled"
    attempt.cancelled_by = by
    attempt.current_task = None
    attempt.current_since = None


# ── assignment ────────────────────────────────────────────────────────────────

def assign(db: Session, created_by: Optional[str], profile_keys: list[str], deadline: date,
           note: Optional[str]) -> tuple[ExamAssignment, list[ExamAttempt], list[str]]:
    """One attempt per leader; leaders with an open attempt are skipped and
    named, never doubled."""
    asg = ExamAssignment(created_by=created_by, deadline=deadline, note=(note or "").strip() or None)
    db.add(asg)
    db.flush()
    made, skipped = [], []
    for key in dict.fromkeys(profile_keys):
        if open_attempt(db, key, "exam") is not None:
            skipped.append(key)
            continue
        at = ExamAttempt(assignment_id=asg.id, profile_key=key, kind="exam", status="assigned",
                         deadline=deadline, note=asg.note)
        db.add(at)
        made.append(at)
    db.flush()
    for at in made:
        _notify(db, at.profile_key, "exam_assigned",
                {"deadline": deadline.strftime("%d.%m.%Y"), "note": asg.note or ""})
    return asg, made, skipped


# ── notifications ─────────────────────────────────────────────────────────────

def _notify(db: Session, profile_key: str, nkey: str, params: dict, type: str = "info") -> None:
    try:
        from app.routers.staff import notify_profile
        notify_profile(db, profile_key, nkey, params, type=type)
    except Exception:  # noqa: BLE001 — a DM that fails must not fail the act
        log.exception("exam: notification %s to %s failed", nkey, profile_key)


def _notify_result(db: Session, attempt: ExamAttempt) -> None:
    role, _, ref = (attempt.profile_key or "").partition(":")
    prof = db.query(RoleProfile).filter_by(id=int(ref)).first() if ref.isdigit() else None
    params = {"score": attempt.score_pct, "pass_mark": attempt.pass_mark_pct,
              "leader_name": prof.name if prof else ""}
    _notify(db, attempt.profile_key, "exam_result", params,
            type="success" if attempt.passed else "warning")
    if prof is not None and prof.manager_id:
        _notify(db, f"supervisor:{prof.manager_id}", "exam_unit_result", params,
                type="success" if attempt.passed else "warning")


# ── the daily jobs ────────────────────────────────────────────────────────────

def expire_overdue(db: Session, today: Optional[date] = None) -> int:
    today = today or date.today()
    n = 0
    for at in (db.query(ExamAttempt)
               .filter(ExamAttempt.kind == "exam", ExamAttempt.status.in_(OPEN_STATUSES),
                       ExamAttempt.deadline.isnot(None), ExamAttempt.deadline < today).all()):
        if at.status == "assigned":
            # Never started: nothing to score, the deadline simply passed.
            at.status = "expired"
            at.submitted_at = _now()
            at.pass_mark_pct = pass_mark(db)
            at.score_pct = 0
            at.passed = False
            db.flush()
            _notify_result(db, at)
        else:
            finish(db, at, "expired")
        n += 1
    return n


def notify_due_soon(db: Session, today: Optional[date] = None) -> int:
    today = today or date.today()
    n = 0
    for at in (db.query(ExamAttempt)
               .filter(ExamAttempt.kind == "exam", ExamAttempt.status.in_(OPEN_STATUSES),
                       ExamAttempt.deadline == today + timedelta(days=1),
                       ExamAttempt.due_notified_at.is_(None)).all()):
        c = counts(results(db, at.id)) if at.status == "running" else None
        _notify(db, at.profile_key, "exam_due_soon", {
            "deadline": at.deadline.strftime("%d.%m.%Y"),
            "left": (c["open"] + c["skipped"]) if c else "",
        }, type="warning")
        at.due_notified_at = _now()
        n += 1
    return n


def purge_old(db: Session) -> int:
    cutoff = _now() - timedelta(days=KEEP_SANDBOX_DAYS)
    n = 0
    for at in (db.query(ExamAttempt)
               .filter(ExamAttempt.kind == "exam", ExamAttempt.purged_at.is_(None),
                       ExamAttempt.status.in_(("submitted", "expired", "cancelled")),
                       ExamAttempt.submitted_at.isnot(None), ExamAttempt.submitted_at < cutoff).all()):
        sb.wipe(db, at.id)
        db.query(ExamEvent).filter(ExamEvent.attempt_id == at.id).delete()
        at.purged_at = _now()
        n += 1
    idle = _now() - timedelta(days=PRACTICE_IDLE_DAYS)
    for at in (db.query(ExamAttempt)
               .filter(ExamAttempt.kind == "practice",
                       (ExamAttempt.last_active_at.is_(None)) | (ExamAttempt.last_active_at < idle),
                       ExamAttempt.created_at < idle).all()):
        db.delete(at)   # cascades rows, results, events
        n += 1
    return n


def _daily() -> None:
    db = SessionLocal()
    try:
        from app.services.ojidaniya_matrix import today_local
        today = today_local()
        e = expire_overdue(db, today)
        p = purge_old(db)
        db.commit()
        log.info("exam: daily pass — %s expired, %s purged", e, p)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("exam: daily pass failed")
    finally:
        db.close()


def _due_soon() -> None:
    db = SessionLocal()
    try:
        from app.services.ojidaniya_matrix import today_local
        n = notify_due_soon(db, today_local())
        db.commit()
        if n:
            log.info("exam: %s due-soon notices sent", n)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("exam: due-soon pass failed")
    finally:
        db.close()


def register_jobs() -> None:
    """Two cron jobs, re-armed at every boot (memory jobstore). Mirrored in
    passenger_wsgi.py like every other boot job."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler
        get_scheduler().add_job(_daily, trigger=CronTrigger(hour=0, minute=5, timezone=SCHEDULER_TZ),
                                id="exam-daily", replace_existing=True)
        get_scheduler().add_job(_due_soon, trigger=CronTrigger(hour=9, minute=0, timezone=SCHEDULER_TZ),
                                id="exam-due-soon", replace_existing=True)
        log.info("exam: jobs registered (00:05 expire/purge, 09:00 due-soon)")
    except Exception:  # noqa: BLE001
        log.exception("exam: could not register the jobs")


# ── serialisation for the leader page ─────────────────────────────────────────

def attempt_json(db: Session, attempt: ExamAttempt) -> dict:
    res = results(db, attempt.id)
    c = counts(res)
    tasks = []
    for k in task_order(res):
        r = next(x for x in res if x.task_key == k)
        t = exam_bank.public(exam_bank.BY_KEY[k])
        t.update({"status": r.status, "reason": r.reason})
        tasks.append(t)
    return {
        "id": attempt.id, "kind": attempt.kind, "status": attempt.status,
        "deadline": attempt.deadline.isoformat() if attempt.deadline else None,
        "note": attempt.note,
        "started_at": attempt.started_at.isoformat() if attempt.started_at else None,
        "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
        "score_pct": attempt.score_pct, "passed": attempt.passed,
        "pass_mark_pct": attempt.pass_mark_pct, "current_task": attempt.current_task,
        "counts": c, "tasks": tasks,
    }


def profile_name(db: Session, profile_key: str) -> str:
    role, _, ref = (profile_key or "").partition(":")
    if role == "leader" and ref.isdigit():
        p = db.query(RoleProfile).filter_by(id=int(ref)).first()
        if p is not None:
            return p.name
    return profile_key


def leader_unit(db: Session, profile_key: str) -> Optional[Manager]:
    role, _, ref = (profile_key or "").partition(":")
    if role == "leader" and ref.isdigit():
        p = db.query(RoleProfile).filter_by(id=int(ref)).first()
        if p is not None and p.manager_id:
            return db.query(Manager).filter_by(id=p.manager_id).first()
    return None


def seconds_total(res: list[ExamTaskResult]) -> int:
    return sum(int(r.seconds or 0) for r in res)
