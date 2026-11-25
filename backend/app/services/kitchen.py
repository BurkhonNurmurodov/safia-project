"""«Oshxona» (/kitchen) — how many people are in the factory right now.

The kitchen cooks for whoever came to work, so the page answers one question:
how many people of the factory (the Verifix organization the platform is
connected to, `verifix_filial_id`) are at work now. COUNTS and department
names only — never a person, so the page is safe to open to a kitchen role.

One plant-wide read of «Отчёт по посещениям» (`core/timesheet$export`, no
employee filter = everybody), kept in memory for `TTL_S` and shared by every
viewer; an older one still answers at once (`refreshing`) while a new read runs
in the background. The minute job's stored read (`verifix_live` — the production cells'
people, fresher and with their door marks) is laid over it, so those people
read exactly as /staff reads them. Everybody else is judged by the report's
own clocks: the whole plant's marks cost ~25 s a call (`verifix_explore`).

Who is where is `verifix_live._person`'s answer, not a second rule: «inside»
and «break» (out of the door before the shift's end) are AT WORK NOW; «left»
and «no_out» are gone.

The hours AHEAD are `kitchen_forecast`'s: today's schedules, with how many of
each shift usually come and when they come and go, learned from the stored
history (`kitchen_history`, two years) with its holidays, and corrected by how
today's started shifts turned out.
"""
from __future__ import annotations

import logging
import threading
import time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import LiveVerifixRead
from app.services import kitchen_forecast, verifix, verifix_live

log = logging.getLogger(__name__)

TTL_S = 120              # a snapshot serves every viewer this long
ERROR_BACKOFF_S = 60     # …and a failed read is not tried again sooner than this
ON_SITE = {"inside", "break"}
GONE = {"left", "no_out"}

_lock = threading.Lock()
_snap: Optional[tuple[float, dict]] = None
_failed: Optional[tuple[float, Exception]] = None


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
                                         "div": str(r.get("division_id") or ""),   # for who left the directory
                                         "days": [verifix_live._trim_day(d)]}
    return out


def _group(day: date, p: dict) -> tuple[date, str, str]:
    """The person's shift window as `kitchen_history` files it: a scheduled day
    with both clocks, else ("", "") — no window, or a day off they came on."""
    if p["begin"] and p["end"] and (p["raw"]["report"].get("day_kind") or "W") == "W":
        return day, f"{p['begin']:%H:%M}", f"{p['end']:%H:%M}"
    return day, "", ""


def tally(now: datetime, days: list[date], report: dict, stored: dict, directory: dict,
          model: dict = kitchen_forecast.DEFAULT) -> dict:
    """The counts of the day `days` ends with — today, a past day (every hour from
    the clocks) or tomorrow (every hour forecast, nobody «inside»); `stored[day]`
    is the minute job's `emps` of that day (wins over the report's row — it
    carries the marks)."""
    emps, divs = directory.get("emps") or {}, directory.get("divs") or {}
    today = days[-1]
    ahead_day = today > now.date()
    tot: Counter = Counter()
    by_div: dict[str, Counter] = defaultdict(Counter)
    spans: list[tuple[datetime, datetime]] = []      # who was in the building, from – to
    groups: dict = defaultdict(lambda: [0, 0, 0])    # (day, window) → [planned, arrived, in now]
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
            if p["status"] != "off":
                g = groups[_group(d, p)]
                g[0] += 1
                g[1] += bool(p["in"])
                g[2] += here and not on_site
            on_site = on_site or here
            if p["in"]:
                # A missing check-out counts up to the shift's end, never past it.
                spans.append((p["in"], now if here else (p["out"] or p["end"] or p["in"])))
        hit = []                                     # `p` is today's reading now
        if on_site and not ahead_day:
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
        div = (emps.get(eid) or {}).get("div") or next(
            (r["div"] for r in (report.get(eid) or {}).values() if r.get("div")), None)
        name = (divs.get(div) or {}).get("name") or ""
        for k in hit:
            tot[k] += 1
            by_div[name][k] += 1

    keys = ("inside", "night", "came", "left", "not_yet", "absent")
    groups.setdefault((today, "", ""), [0, 0, 0])    # the people with no window come on any day
    ahead = kitchen_forecast.expect(now, groups, model, today) if today >= now.date() else {}
    hours = []
    t = datetime.combine(today, datetime.min.time())
    while t < midnight:
        hours.append({"t": t.strftime("%H:%M"), "plan": t.hour in ahead,
                      "n": round(ahead[t.hour]) if t.hour in ahead else sum(1 for a, b in spans if a <= t < b)})
        t += timedelta(hours=1)
    return {
        **{k: tot[k] for k in keys},
        "hours": hours,
        "departments": sorted(
            ({"name": name, **{k: c[k] for k in keys}} for name, c in by_div.items()),
            key=lambda r: (-r["inside"], -r["came"], r["name"])),
    }


def _slice(report: dict, days: list[date]) -> dict:
    """The report as a read of `days` alone would have returned it."""
    return {e: r for e, rows in report.items() if (r := {d: rows[d] for d in days if d in rows})}


def _build_days(db: Session, cfg: dict, targets: list[date]) -> tuple[dict[date, dict], int]:
    """The snapshots of `targets` from ONE report read, and how long it took (ms).
    The report pages by EMPLOYEE (~30 pages of 100), not by day, so a week costs
    about what two days do."""
    now = verifix_live.now_local()
    today = now.date()
    # A night shift is filed under the day it STARTED, so the day before's rows
    # are always read too: its people are in this morning's hours and, until
    # they leave, in the count. For tomorrow that is today — tonight's shift.
    first, last = min(targets) - timedelta(days=1), max(targets)
    span = [first + timedelta(days=i) for i in range((last - first).days + 1)]
    directory, _ = verifix_live._directory(db, cfg, verifix_live.DIR_FALLBACK_S)
    stored = {}
    for d in span:
        if d < today - timedelta(days=1):
            continue                                 # a settled day: the report has its late check-outs
        row = verifix_live._row(db, verifix_live._day_key(d))
        stored[d] = ((row.data or {}).get("emps") or {}) if row else {}
    # Only today and tomorrow forecast; a past day skips learning two years of history.
    model = kitchen_forecast.load(db, today) if last >= today else kitchen_forecast.DEFAULT
    db.rollback()                                    # no transaction held across the Verifix read
    t0 = time.monotonic()
    report = _read_report(cfg, span)
    ms = int((time.monotonic() - t0) * 1000)
    out = {}
    for t in targets:
        days = [t - timedelta(days=1), t]
        out[t] = {"configured": True, "read_at": verifix_live._iso(now),
                  **tally(now, days, _slice(report, days), stored, directory, model)}
    log.info("kitchen: read %d people of %s – %s in %.1f s — %d day(s)", len(report), span[0], last,
             ms / 1000, len(targets))
    return out, ms


def _build(db: Session, cfg: dict) -> dict:
    """Today's snapshot (the live one). The same read also yields yesterday's —
    one more day costs no more pages — so the first ‹ on the page answers at once."""
    today = verifix_live.now_local().date()
    yday = today - timedelta(days=1)
    snaps, _ = _build_days(db, cfg, [yday, today])
    _days[yday] = (time.monotonic(), snaps[yday])      # one dict write: no lock against `other_day`
    return snaps[today]


def _out(hit: tuple[float, dict]) -> dict:
    """The snapshot plus how old it is — the page says so when Verifix is silent."""
    return {**hit[1], "age_s": int(time.monotonic() - hit[0])}


def _renew(cfg: dict) -> None:
    """Read a new snapshot on a thread of its own; the caller holds `_lock`."""
    global _snap, _failed
    db = SessionLocal()
    try:
        _snap, _failed = (time.monotonic(), _build(db, cfg)), None
    except Exception as exc:                         # noqa: BLE001 — the old snapshot stays
        _failed = (time.monotonic(), exc)
        log.warning("kitchen: the background read failed (%s)", exc)
    finally:
        db.close()
        _lock.release()


_days: dict[date, tuple[float, dict]] = {}       # another day's snapshot, by day
_day_lock = threading.Lock()                       # one other-day read at a time, never the live one's
DAY_KEEP = 60                                      # snapshots of other days kept in memory
DAY_WAIT_S = 45                                    # a request waits this long for another day's read, then «busy»
SETTLED_D = 2       # a day this old is final and kept in the database — `kitchen_history`'s rule
WEEK_D = 7          # a read of a day also fills the settled days of the week before it not kept yet
FORMAT = 1          # bump when a snapshot's shape changes: a kept one of another format is not served


def _key(day: date) -> str:
    return f"kitchen:{day.isoformat()}"


def _keep(day: date, hit: tuple[float, dict]) -> tuple[float, dict]:
    _days.pop(day, None)
    _days[day] = hit
    while len(_days) > DAY_KEEP:
        _days.pop(list(_days)[0], None)                        # the longest kept goes first (a copy: the live read writes too)
    return hit


def _kept(db: Session, days: list[date], today: date) -> dict[date, tuple[float, dict]]:
    """The snapshots of `days` still good: in memory (10 minutes for yesterday and
    tomorrow, which still move, 6 hours for an older day), else a settled day's
    kept in the database — it survives deploys."""
    out, ask = {}, []
    for d in days:
        hit = _days.get(d)
        if hit and time.monotonic() - hit[0] < (600 if abs((d - today).days) <= 1 else 6 * 3600):
            out[d] = hit
        elif (today - d).days >= SETTLED_D:
            ask.append(_key(d))
    if ask:
        for key, data, at in (db.query(LiveVerifixRead.key, LiveVerifixRead.data, LiveVerifixRead.read_at)
                              .filter(LiveVerifixRead.key.in_(ask))):
            if (data or {}).get("v") == FORMAT:
                age = (datetime.now(timezone.utc) - at).total_seconds() if at else 0
                d = date.fromisoformat(key.split(":", 1)[1])
                out[d] = _keep(d, (time.monotonic() - age, {k: v for k, v in data.items() if k != "v"}))
    return out


def _store(db: Session, snaps: dict[date, dict], today: date, ms: int) -> None:
    """Keep the settled days' snapshots in the database; a failed write only
    means the next open reads Verifix again."""
    try:
        for d, snap in snaps.items():
            if (today - d).days >= SETTLED_D:
                row = verifix_live._locked_row(db, _key(d))
                row.data, row.read_at, row.ms = {"v": FORMAT, **snap}, datetime.now(timezone.utc), ms
                row.error = row.error_at = None
        db.commit()
    except Exception:  # noqa: BLE001 — the answer stands without it
        db.rollback()
        log.exception("kitchen: the snapshots were not stored")


def other_day(db: Session, day: date) -> dict:
    """A past day (every hour from the clocks) or tomorrow (every hour forecast),
    read on demand and kept (`_kept`). The read also fills the settled days of
    the week before it, so stepping back a day costs nothing."""
    today = verifix_live.now_local().date()
    hit = _kept(db, [day], today).get(day)
    if hit:
        return _out(hit)
    stale = _days.get(day)                                     # a kept one past its time answers a failure
    cfg = verifix.config(db, with_password=True)
    if not verifix_live._configured(cfg):
        return {"configured": False}
    db.rollback()                                              # no connection held while waiting
    if not _day_lock.acquire(timeout=DAY_WAIT_S):
        if stale:
            return _out(stale)
        raise TimeoutError("another day is being read")
    try:
        hit = _kept(db, [day], today).get(day)                # read while we waited
        if hit:
            return _out(hit)
        week = [day - timedelta(days=i) for i in range(1, WEEK_D)]
        settled = [d for d in week if (today - d).days >= SETTLED_D]
        have = _kept(db, settled, today)
        targets = [day] + [d for d in settled if d not in have]
        try:
            snaps, ms = _build_days(db, cfg, targets)
        except verifix.VerifixError as exc:
            log.warning("kitchen: the read of %s failed (%s: %s)", day, exc.code, exc.message)
            if stale:
                return _out(stale)
            raise
        now = time.monotonic()
        for d, snap in snaps.items():
            _keep(d, (now, snap))
        _store(db, snaps, today, ms)
        return _out(_days[day])
    finally:
        _day_lock.release()


def headcount(db: Session) -> dict:
    """The snapshot. Younger than `TTL_S` it simply answers; older, it still
    answers at once (`refreshing`) while ONE new read runs on a thread, so
    opening the page never waits on Verifix — only the very first read does."""
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
    if hit:
        if _lock.acquire(blocking=False):
            threading.Thread(target=_renew, args=(cfg,), name="kitchen-read", daemon=True).start()
        return {**_out(hit), "refreshing": True}
    _lock.acquire()
    try:
        if _snap and time.monotonic() - _snap[0] < TTL_S:    # read while we waited
            return _out(_snap)
        try:
            data = _build(db, cfg)
        except verifix.VerifixError as exc:
            _failed = (time.monotonic(), exc)
            log.warning("kitchen: the read failed (%s: %s)", exc.code, exc.message)
            raise
        _snap, _failed = (time.monotonic(), data), None
        return _out(_snap)
    finally:
        _lock.release()
