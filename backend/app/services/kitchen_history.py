"""«Oshxona» history — a year of the factory's attendance, as counts.

The kitchen's forecast knows the shift at work from its schedule, but not how
many of the NEXT shift's people will come (the operator, 2026-11-12: «for the
other shifts we need to use the historical data … get the reports of the
workers' coming and leaving hours for 12 months from the verifix and analyze
it»). Verifix is reachable from the server only, so the year is collected
here, into `kitchen_history`: per past day and shift window — how many were
scheduled, how many came, and when they clocked in and out (10-minute counts).
COUNTS only: no person, name or department is kept.

A job reads «Отчёт по посещениям» (`core/timesheet$export`, nobody filtered =
the whole factory) a week at a time, newest first, until the last `DAYS` days
are stored, then adds each new day once it is `LAG_DAYS` old (a night shift
ends the next morning, and Verifix fills check-outs in late). A week is one
transaction: its days are replaced whole, so a re-read never doubles a count.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import KitchenHistory
from app.services import verifix, verifix_live

log = logging.getLogger(__name__)

DAYS = 365               # how far back the history goes
LAG_DAYS = 2             # a day is read once it is this old
CHUNK_DAYS = 7           # one read: a week of the whole plant (~30 pages of 100 people)
BIN_MIN = 10             # clock-ins / clock-outs are counted per this many minutes
READ_S = 180.0           # one week's read may take this long (a job, not a request)
RUN_S = 240.0            # …and one run stops starting weeks after this long
EVERY_MIN = 10           # the job's tick
BACKOFF_S = 3600         # after a failed read the job waits this long

_run_lock = threading.Lock()
_failed_at = 0.0


def _hm(dt: datetime) -> str:
    return dt.strftime("%H:%M")


def _bin(day: date, at: datetime) -> str:
    minutes = (at - datetime.combine(day, datetime.min.time())).total_seconds() // 60
    return str(int(minutes // BIN_MIN * BIN_MIN))


def fold(acc: dict, rows: Iterable[dict], first: date, last: date) -> dict:
    """Add report rows (one per employee, with their `days`) to `acc`:
    (day, starts, ends) → {planned, came, no_out, arr, dep}. Read exactly as
    the live day reads a row (`verifix_live._person`): the day's own begin /
    end, else the schedule's name; the report's own clocks."""
    def slot(day: date, starts: str, ends: str) -> dict:
        return acc.setdefault((day, starts, ends), {"planned": 0, "came": 0, "no_out": 0,
                                                    "arr": Counter(), "dep": Counter()})
    for r in rows:
        schedule = r.get("schedule_name") or ""
        for d in r.get("days") or []:
            day = verifix_live._d(d.get("date"))
            if day is None or not (first <= day <= last):
                continue
            begin, end = verifix_live._dt(d.get("begin_time")), verifix_live._dt(d.get("end_time"))
            if (begin is None or end is None) and schedule:
                b2, e2 = verifix_live._schedule_window(schedule, day)
                begin, end = begin or b2, end or e2
            scheduled = (d.get("day_kind") or "W") == "W"
            t_in = verifix_live._dt(d.get("input_time"))
            t_out = verifix_live._dt(d.get("output_time"))
            if not scheduled and not t_in:
                continue                                  # a day off, spent off
            s = slot(day, _hm(begin), _hm(end)) if scheduled and begin and end else slot(day, "", "")
            if scheduled:
                s["planned"] += 1
            if t_in:
                s["came"] += 1
                s["arr"][_bin(day, t_in)] += 1
                if t_out and t_out >= t_in:
                    s["dep"][_bin(day, t_out)] += 1
                else:
                    s["no_out"] += 1
    return acc


def _read(cfg: dict, first: date, last: date) -> dict:
    """The whole factory's report for [first, last], folded."""
    deadline = time.monotonic() + READ_S
    body = {"period_begin_date": verifix._dmy(first), "period_end_date": verifix._dmy(last),
            "division_ids": [], "employee_ids": []}          # no filter = everybody
    acc: dict = {}
    cursor = None
    with verifix.client(cfg) as cl:
        while True:                                          # no page cap: `each_page` stops at 6,000 people
            if time.monotonic() > deadline:
                raise verifix.VerifixError("slow", "stopped at the time limit")
            data, nxt = verifix.call(cl, "core/timesheet$export", body,
                                     limit=verifix.LIMIT_TIMESHEET, cursor=cursor)
            fold(acc, data, first, last)
            if not nxt or nxt == cursor:
                break
            cursor = nxt
    d = first
    while d <= last:                                         # every day read has its row
        acc.setdefault((d, "", ""), {"planned": 0, "came": 0, "no_out": 0, "arr": Counter(), "dep": Counter()})
        d += timedelta(days=1)
    return acc


def missing(have: set, today: date) -> Optional[tuple[date, date]]:
    """The newest run of days not stored yet, at most a week of them."""
    day = today - timedelta(days=LAG_DAYS)
    oldest = today - timedelta(days=LAG_DAYS + DAYS - 1)
    while day >= oldest and day in have:
        day -= timedelta(days=1)
    if day < oldest:
        return None
    first = day
    while first - timedelta(days=1) >= oldest and first - timedelta(days=1) not in have \
            and (day - first).days + 1 < CHUNK_DAYS:
        first -= timedelta(days=1)
    return first, day


def _store(db: Session, acc: dict, first: date, last: date) -> None:
    db.query(KitchenHistory).filter(KitchenHistory.day >= first, KitchenHistory.day <= last) \
        .delete(synchronize_session=False)
    db.add_all(KitchenHistory(day=day, starts=starts, ends=ends, planned=s["planned"], came=s["came"],
                              no_out=s["no_out"], arr=dict(s["arr"]), dep=dict(s["dep"]))
               for (day, starts, ends), s in acc.items())
    db.commit()


def run() -> None:
    """The job: read the weeks still missing, newest first, for up to RUN_S."""
    global _failed_at
    if time.monotonic() - _failed_at < BACKOFF_S and _failed_at:
        return
    if not _run_lock.acquire(blocking=False):
        return
    try:
        from app.database import SessionLocal
        started = time.monotonic()
        with SessionLocal() as db:
            cfg = verifix.config(db, with_password=True)
            if not verifix_live._configured(cfg):
                return
            while time.monotonic() - started < RUN_S:
                have = {d for (d,) in db.query(KitchenHistory.day).distinct()}
                span = missing(have, verifix_live.now_local().date())
                db.rollback()                                # no transaction held across the Verifix read
                if span is None:
                    return
                t0 = time.monotonic()
                try:
                    acc = _read(cfg, *span)
                except verifix.VerifixError as exc:
                    _failed_at = time.monotonic()
                    log.warning("kitchen-history: reading %s – %s failed (%s: %s)", *span, exc.code, exc.message)
                    return
                _store(db, acc, *span)
                log.info("kitchen-history: stored %s – %s (%d rows, %.0f s)", *span, len(acc),
                         time.monotonic() - t0)
    except Exception:  # noqa: BLE001 — the next tick tries again
        log.exception("kitchen-history: the run failed")
    finally:
        _run_lock.release()


def register_jobs() -> None:
    """Every EVERY_MIN minutes (mirrored in passenger_wsgi.py). With the year
    stored, a tick is one query; a box with no Verifix login reads nothing."""
    from app.scheduler import schedule_interval
    schedule_interval("kitchen-history", run, minutes=EVERY_MIN)
