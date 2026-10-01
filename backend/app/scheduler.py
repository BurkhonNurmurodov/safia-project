"""Process-wide job scheduler (APScheduler).

ONE BackgroundScheduler per process, started from BOTH startup entrypoints
(app/main.py lifespan and passenger_wsgi.py) like every other startup step.

Deliberately a MEMORY jobstore. Every scheduled job's durable state already
lives in the app's own tables — a scheduled broadcast is a `broadcasts` row
carrying its own `scheduled_at` — and each feature re-registers its pending
jobs at boot. A persistent APScheduler jobstore would be a SECOND source of
truth holding pickled callables: it drifts from the row it mirrors, and
renaming a function silently breaks a job nobody can see. The row is the
truth; this module is only a timer over it.

An IN-PROCESS scheduler is safe here because ONE process fires the jobs. Each
copy runs uvicorn `--workers 1`, and from v4.196.0 a deploy may run TWO copies
side by side for a few seconds (blue-green, deploy/deploy.sh): the new copy is
started and health-checked before the old one stops. So the timers are gated
on a Postgres advisory lock (`_JOBS_LOCK_KEY`): the copy holding it runs its
scheduler, any other copy starts its scheduler PAUSED — every job registered,
none fired — and resumes it the moment the lock frees, i.e. when the old copy
exits and its connection closes. A missed fire time inside the misfire grace
still runs on resume. With one copy (every deploy before the blue-green setup)
the lock is taken at once and nothing differs from before. Anything that cannot
claim the lock — no Postgres, a dead connection — fails OPEN and runs the jobs,
which is the old behaviour, never silence.

Times are handled as timezone-aware UTC throughout. SCHEDULER_TZ exists only
to interpret a human wall-clock ("send at 08:00") and is PINNED to the plant's
zone rather than inherited from the host: APScheduler otherwise resolves the
server's local zone via tzlocal, and on a UTC VPS every job would fire five
hours off with nothing in the logs to say why.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

SCHEDULER_TZ = ZoneInfo("Asia/Tashkent")

# A job whose fire time slipped by less than this still runs when the scheduler
# reaches it (slow boot, GC pause, a long-running sibling job). Past it
# APScheduler drops the job, which is harmless: each feature's boot sweep
# re-fires overdue work from its own table anyway.
_MISFIRE_GRACE = 300

_scheduler: BackgroundScheduler | None = None
_lock = threading.Lock()

# Arbitrary, distinct from every other advisory key in the app
# (leader_ai._DRAIN_LOCK_KEY is 8_140_573_112_004_331).
_JOBS_LOCK_KEY = 8_140_573_112_009_001
# The connection that HOLDS the lock. An advisory lock lives as long as the
# session that took it, so this is checked out of the pool for the life of the
# process and never returned; the process exiting is what releases it.
_jobs_conn = None
_LEADER_POLL_S = 2


def _claim_jobs_lock() -> bool | None:
    """True = this copy runs the jobs, False = another copy holds them,
    None = the question cannot be asked here (fail open: run them)."""
    global _jobs_conn
    try:
        from app.database import engine
        if engine.dialect.name != "postgresql":
            return None
        if _jobs_conn is None:
            _jobs_conn = engine.connect()
        got = _jobs_conn.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _JOBS_LOCK_KEY}
        ).scalar()
        _jobs_conn.commit()
        return bool(got)
    except Exception:
        logger.exception("Scheduler: could not ask for the jobs lock — running jobs here")
        _drop_jobs_conn()
        return None


def _drop_jobs_conn() -> None:
    """Close the lock's connection FOR REAL. `close()` would hand it back to
    the pool still holding the session-level lock; `invalidate()` discards the
    DBAPI connection, and Postgres releases the lock with it."""
    global _jobs_conn
    conn, _jobs_conn = _jobs_conn, None
    if conn is not None:
        try:
            conn.invalidate()
        except Exception:
            pass


def _await_jobs_lock() -> None:
    """Poll until the other copy lets go, then un-pause this scheduler."""
    import time
    while True:
        time.sleep(_LEADER_POLL_S)
        sched = _scheduler
        if sched is None or not sched.running:
            return
        if _claim_jobs_lock() is not False:
            try:
                sched.resume()
                logger.info("Scheduler resumed — this copy now runs the jobs")
            except Exception:
                logger.exception("Scheduler resume failed")
            return


def runs_jobs() -> bool:
    """Whether this copy's timers are live (False while another copy holds them)."""
    sched = _scheduler
    if sched is None or not sched.running:
        return False
    try:
        from apscheduler.schedulers.base import STATE_PAUSED
        return sched.state != STATE_PAUSED
    except Exception:
        return True


def get_scheduler() -> BackgroundScheduler:
    """The process's scheduler, created (not started) on first use."""
    global _scheduler
    with _lock:
        if _scheduler is None:
            _scheduler = BackgroundScheduler(
                timezone=SCHEDULER_TZ,
                job_defaults={
                    "misfire_grace_time": _MISFIRE_GRACE,
                    # Jobs here are DB-guarded (a scheduled broadcast flips
                    # status atomically), but coalescing keeps a backlog from
                    # replaying the same job several times after a stall.
                    "coalesce": True,
                    "max_instances": 1,
                },
            )
        return _scheduler


def start_scheduler() -> None:
    """Idempotent: both entrypoints call it, and only one start takes."""
    sched = get_scheduler()
    if sched.running:
        return
    leader = _claim_jobs_lock() is not False
    try:
        sched.start(paused=not leader)
        if leader:
            logger.info("Scheduler started (tz=%s)", SCHEDULER_TZ)
        else:
            logger.info("Scheduler started PAUSED — another copy runs the jobs; "
                        "taking over when it exits")
            threading.Thread(target=_await_jobs_lock, daemon=True,
                             name="scheduler-leader-wait").start()
    except Exception:
        logger.exception("Scheduler failed to start")


def schedule_at(job_id: str, run_at: datetime, func, args: tuple = ()) -> bool:
    """Run `func(*args)` once at `run_at` (naive input is read as UTC).

    `replace_existing` makes re-registration safe: the boot sweep re-arms every
    pending job on a process that may already hold it.
    """
    if run_at.tzinfo is None:
        run_at = run_at.replace(tzinfo=timezone.utc)
    try:
        get_scheduler().add_job(
            func, trigger=DateTrigger(run_date=run_at), args=args,
            id=job_id, replace_existing=True,
        )
        return True
    except Exception:
        logger.exception("Could not schedule job %s for %s", job_id, run_at)
        return False


def schedule_interval(job_id: str, func, *, minutes: int, args: tuple = ()) -> None:
    """A recurring safety-net sweep. First run is one interval from now."""
    try:
        get_scheduler().add_job(
            func, trigger=IntervalTrigger(minutes=minutes), args=args,
            id=job_id, replace_existing=True,
        )
    except Exception:
        logger.exception("Could not schedule interval job %s", job_id)


def next_run(job_id: str) -> datetime | None:
    """When a registered job fires next, or None if it is not registered.

    For pages that have to say "this retries by itself in N minutes". Guessing
    that from an interval constant is how a strip ends up promising a sweep the
    process never scheduled — after a restart, or when the feature declined to
    register at boot (`leader-ai-drain` skips registration with no API key).
    """
    try:
        job = get_scheduler().get_job(job_id)
        return getattr(job, "next_run_time", None) if job else None
    except Exception:
        return None


def unschedule(job_id: str) -> None:
    """Drop a pending job. A job that already fired or never existed is not an
    error — the caller's DB row is what actually decides whether work happens."""
    try:
        get_scheduler().remove_job(job_id)
    except Exception:
        pass


def shutdown_scheduler() -> None:
    """Stop accepting new fire times on the way down. Running jobs are daemon
    threads elsewhere (the broadcast fan-out), so nothing is waited on."""
    global _scheduler
    with _lock:
        if _scheduler is not None and _scheduler.running:
            try:
                _scheduler.shutdown(wait=False)
            except Exception:
                logger.exception("Scheduler shutdown failed")
        _scheduler = None
        # Let the next copy take the jobs now, not when this process finally
        # exits after draining its last requests.
        _drop_jobs_conn()
