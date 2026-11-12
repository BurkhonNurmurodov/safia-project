"""«Oshxona» (/kitchen) — how many people are in the factory right now.

The kitchen cooks for whoever came to work, so the page answers one question:
how many people of the factory (the Verifix organization the platform is
connected to, `verifix_filial_id`) are at work now. COUNTS and department
names only — never a person, so the page is safe to open to a kitchen role.

One plant-wide read of «Отчёт по посещениям» (`core/timesheet$export`, no
employee filter = everybody), kept in memory for `TTL_S` and shared by every
viewer. The minute job's stored read (`verifix_live` — the production cells'
people, fresher and with their door marks) is laid over it, so those people
read exactly as /staff reads them. Everybody else is judged by the report's
own clocks: the whole plant's marks cost ~25 s a call (`verifix_explore`).

Who is where is `verifix_live._person`'s answer, not a second rule: «inside»
and «break» (out of the door before the shift's end) are AT WORK NOW; «left»
and «no_out» are gone.

The hours AHEAD are a forecast from the same rows' schedules: whoever is here
stays until their shift's planned end, whoever is «not_yet» comes at its
planned start. Nobody who did not come is expected, and nobody leaves early.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.services import verifix, verifix_live

log = logging.getLogger(__name__)

TTL_S = 120              # a snapshot serves every viewer this long
ERROR_BACKOFF_S = 60     # …and a failed read is not tried again sooner than this
ON_SITE = {"inside", "break"}
GONE = {"left", "no_out"}

_lock = threading.Lock()
_snap: Optional[tuple[float, dict]] = None
_failed: Optional[tuple[float, verifix.VerifixError]] = None


def _read_report(cfg: dict, days: list[date]) -> dict[str, dict[date, dict]]:
    """employee id → {day → the report's row of it, in `_person`'s shape}."""
    # shortcut: one list read page by page (~30 pages for the plant); split the
    # employees over `verifix_live._side_by_side` if it nears BUDGET_S.
    deadline = time.monotonic() + verifix.BUDGET_S
    body = {"period_begin_date": verifix._dmy(days[0]), "period_end_date": verifix._dmy(days[-1]),
            "division_ids": [], "employee_ids": []}          # no filter = everybody
    out: dict[str, dict[date, dict]] = defaultdict(dict)
    with verifix.client(cfg) as cl:
        for page in verifix.each_page(cl, "core/timesheet$export", body,
                                      limit=verifix.LIMIT_TIMESHEET, deadline=deadline):
            for r in page:
                eid = str(r.get("employee_id") or "")
                for d in r.get("days") or []:
                    day = verifix_live._d(d.get("date"))
                    if eid and day in days:
                        out[eid][day] = {"schedule": r.get("schedule_name") or "",
                                         "days": [verifix_live._trim_day(d)]}
    return out


def tally(now: datetime, days: list[date], report: dict, stored: dict, directory: dict) -> dict:
    """The counts. `days` ends with today; `stored[day]` is the minute job's
    `emps` of that day (wins over the report's row — it carries the marks)."""
    emps, divs = directory.get("emps") or {}, directory.get("divs") or {}
    today = days[-1]
    tot: Counter = Counter()
    by_div: dict[str, Counter] = defaultdict(Counter)
    spans: list[tuple[datetime, datetime]] = []      # who was in the building, from – to
    plan: list[tuple[datetime, datetime]] = []       # …and who the schedules put there, after now
    # shortcut: no schedule end = here for the rest of today; a handful of
    # people, upgrade when a real unscheduled crowd shows up in the forecast.
    midnight = datetime.combine(today + timedelta(days=1), datetime.min.time())
    for eid in set(report) | {e for d in days for e in stored.get(d) or {}}:
        on_site = False
        p = None
        for d in days:
            entry = (stored.get(d) or {}).get(eid)
            if entry:
                rec = entry.get("ts")
                marks = [(datetime.fromisoformat(x[0]), x[1]) for x in entry.get("m") or []]
            else:
                rec, marks = (report.get(eid) or {}).get(d), []
            p = verifix_live._person(d, now, rec, marks, None)
            here = p["status"] in ON_SITE
            if here and not on_site:
                plan.append((now, p["end"] or midnight))
            elif p["status"] == "not_yet":
                plan.append((p["begin"], p["end"] or midnight))
            on_site = on_site or here
            if p["in"]:
                # A missing check-out counts up to the shift's end, never past it.
                spans.append((p["in"], now if here else (p["out"] or p["end"] or p["in"])))
        hit = []                                     # `p` is today's reading now
        if on_site:
            hit.append("inside")
            if p["status"] not in ON_SITE:
                hit.append("night")                  # still here from yesterday's shift
        if p["in"]:
            hit.append("came")
        if p["status"] in GONE:
            hit.append("left")
        elif p["status"] in ("absent", "not_yet"):
            hit.append(p["status"])
        if not hit:
            continue                                 # a day off: on no line of the page
        name = (divs.get((emps.get(eid) or {}).get("div")) or {}).get("name") or ""
        for k in hit:
            tot[k] += 1
            by_div[name][k] += 1

    keys = ("inside", "night", "came", "left", "not_yet", "absent")
    hours = []
    t = datetime.combine(today, datetime.min.time())
    while t < midnight:
        ahead = t > now
        hours.append({"t": t.strftime("%H:%M"), "plan": ahead,
                      "n": sum(1 for a, b in (plan if ahead else spans) if a <= t < b)})
        t += timedelta(hours=1)
    return {
        **{k: tot[k] for k in keys},
        "hours": hours,
        "departments": sorted(
            ({"name": name, **{k: c[k] for k in keys}} for name, c in by_div.items()),
            key=lambda r: (-r["inside"], -r["came"], r["name"])),
    }


def _build(db: Session, cfg: dict) -> dict:
    now = verifix_live.now_local()
    today = now.date()
    # A night shift is filed under the day it STARTED, so yesterday's rows are
    # always read too: its people are in this morning's hours and, until they
    # leave, in the count.
    days = [today - timedelta(days=1), today]
    directory, _ = verifix_live._directory(db, cfg, verifix_live.DIR_FALLBACK_S)
    stored = {}
    for d in days:
        row = verifix_live._row(db, verifix_live._day_key(d))
        stored[d] = ((row.data or {}).get("emps") or {}) if row else {}
    db.rollback()                                    # no transaction held across the Verifix read
    t0 = time.monotonic()
    report = _read_report(cfg, days)
    out = tally(now, days, report, stored, directory)
    log.info("kitchen: read %d people in %.1f s — %d inside", len(report),
             time.monotonic() - t0, out["inside"])
    return {"configured": True, "read_at": verifix_live._iso(now), **out}


def _out(hit: tuple[float, dict]) -> dict:
    """The snapshot plus how old it is — the page says so when Verifix is silent."""
    return {**hit[1], "age_s": int(time.monotonic() - hit[0])}


def headcount(db: Session) -> dict:
    """The snapshot, at most `TTL_S` old. One read at a time: whoever asks
    while it runs gets the last snapshot, and waits only when there is none."""
    global _snap, _failed
    hit = _snap
    if hit and time.monotonic() - hit[0] < TTL_S:
        return _out(hit)
    cfg = verifix.config(db, with_password=True)
    if not verifix_live._configured(cfg):
        return {"configured": False}
    if _failed and time.monotonic() - _failed[0] < ERROR_BACKOFF_S:
        if hit:
            return _out(hit)
        raise _failed[1]
    if not _lock.acquire(blocking=hit is None):
        return _out(hit)
    try:
        if _snap and time.monotonic() - _snap[0] < TTL_S:    # read while we waited
            return _out(_snap)
        try:
            data = _build(db, cfg)
        except verifix.VerifixError as exc:
            _failed = (time.monotonic(), exc)
            log.warning("kitchen: the read failed (%s: %s)", exc.code, exc.message)
            if hit:
                return _out(hit)
            raise
        _snap, _failed = (time.monotonic(), data), None
        return _out(_snap)
    finally:
        _lock.release()
