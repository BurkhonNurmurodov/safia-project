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

An IN-PROCESS scheduler is safe here solely because the prod unit runs uvicorn
with `--workers 1` (deploy/safia-production.service). At `--workers N` every
job fires N times — if that flag ever changes, jobs must move behind a DB
claim the way the broadcast fan-out already is.

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
    try:
        sched.start()
        logger.info("Scheduler started (tz=%s)", SCHEDULER_TZ)
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
