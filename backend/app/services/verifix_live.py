"""The LIVE «Verifix to'g'irlash» — attendance read straight from Verifix.

The READ half of /staff's live days (`live_day.LIVE_FROM` on): who came, who
is inside, who left and who has not come, read from Verifix's API every minute
instead of the next-morning Excel (memory: verifix-api-integration). The other
half — /staff's rows, documents, deletions, cell placements and the day close
laid over this read — is `services/live_staff.py`; the brigadir's close copies
the finished day into `attendance` (`services/live_projection.py`). Built first
for the lab page /staff-live (2026-10-04), retired on 2026-10-06.

Where a person stands is answered the way the agreed live feed will answer it:

* **unit** = the brigadir (on /cells) of the cell their Verifix ORG UNIT
  («отдел») names by its code — the org unit, never the division: the cell
  codes sit on org units (first connection test, 2026-10-01: 0 of 2,942 rows
  by division, 1,606 by org unit). **Only cells counted in the загрузка**
  (`cells.in_load`, from 2026-10-04): a person in any other cell is on no page;
* **a day closes only BY HAND** (from 2026-10-04, the operator); once everybody
  who came has left, the unit's brigadir is told so once (`LiveAllLeftNotice`,
  `_notify_all_left`).

**The last read is STORED** (`live_verifix_reads`, from 2026-10-04): a job reads
Verifix every minute for every workload cell's people (`run_pass`), the page
reads the database, and «Yangilash» reads one unit now (`day_read(force=True)`).
The page reads Verifix itself only for a day nobody stored yet, or when the
stored read of a running day is older than `STALE_S` (a job that stopped).

**The clocks are the report's** (`input_time` / `output_time` — the file's own
clock-in/out, the parity check proved); the raw marks (`track$list`) fill in
only what the report has not answered yet — the first mark as a provisional
arrival, an «O»/«T» mark or, once the shift is over, the last mark as a
provisional departure — and the row says which (`in_src` / `out_src`). An exit
before the shift's end is a break, not a departure; while the shift runs only a
DIRECTED mark after the report's check-out (an «I» = back, an «O» = out again)
moves it — a checkpoint after it is the gate on the way home. `diag` counts
the sources.

**Hours**: «Отработано» is summed from the time kinds the parity check FOUND
(`verifix_last_parity.hours`) when that rule matched the files closely enough,
else the clock span. Someone still inside is counted up to now and marked so.
"""
from __future__ import annotations

import logging
import re
import threading
import time as _time
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models import Cell, LiveAllLeftNotice, LiveDayClose, LiveVerifixRead, Manager
from app.services import cell_hours, live_overview, verifix, verifix_parity

log = logging.getLogger(__name__)

TZ = verifix.TZ

DIR_TTL = 600            # divisions / jobs / employees — the job re-reads the directory, seconds
DIR_FALLBACK_S = 3600    # …and the page reads it itself only when the stored one is older
HOT_S = 60               # a running shift-day is read again this often (the job's tick)
COOL_S = 600             # …a shift-day whose shift is over (Verifix fills check-outs late)
HOT_AFTER_MIN = 120      # a shift stays «running» for the reads this long past its end
STALE_S = 180            # the page reads Verifix itself when a running day's read is older
ERROR_BACKOFF_S = 60     # …but not within this long of a read of the day that FAILED: a
                         # Verifix outage must not turn every viewer's poll into a retry
TRACKS_FULL_S = 900      # the marks are re-read whole this often; only the new ones between
TRACKS_OVERLAP_MIN = 15  # a read of the new marks starts this far before the last one ended
FORCE_MIN_S = 30         # a «Yangilash» this soon after the unit's last read serves that read
WAIT_S = 60              # a request waits this long for another read of its unit-day (+ the
                         # rest of the request stays inside Cloudflare's 100 s)
BUSY_MESSAGE = "Verifix'dan o'qish davom etmoqda — birozdan keyin yangilang."
LOOKAHEAD_H = 4          # a shift's people are read this long before it opens (`_person`'s window)
NOTICE_WINDOW_MIN = 180  # «everybody left» is told only while the last exit is this recent
MISSING_AFTER_MIN = 60   # still inside this long past the shift's end = no check-out
LATE_GRACE_MIN = 5       # minutes a check-in may trail the schedule start
EARLY_GRACE_MIN = 5      # minutes a check-out may precede the schedule end
FORMULA_MIN_SHARE = 0.9  # the parity formula is used when it matched this share
FORMULA_MIN_N = 50

OUT_TYPES = {"O"}
BREAK_TYPES = {"T"}
DIRECTED = {"I", "O"}
# Every mark on the 01.10 dump carries a type: «I» (door in), «O» (door out)
# or «C» — a CHECKPOINT (the gate, 11,361 of 42,963 marks), which says only
# that the person passed it. A C is never an arrival and never a departure on
# its own; it is what sits 8–20 min before every «I» and 7–31 min after every
# «O».
CHECKPOINT = {"C"}
# Marks with no direction: once the shift is over, the last of two marks at
# least this far apart is the departure.
PAIR_MIN = 30

_lock = threading.Lock()
_cache: dict[tuple, tuple[float, datetime, Any]] = {}


def now_local() -> datetime:
    """Tashkent wall clock, naive — Verifix prints its times that way."""
    return datetime.now(TZ).replace(tzinfo=None)


def _cached(key: tuple, ttl: float, fn: Callable[[], Any]) -> tuple[Any, datetime]:
    """A value younger than `ttl` seconds is reused; 0 always reloads."""
    with _lock:
        hit = _cache.get(key)
    if hit and _time.monotonic() - hit[0] < ttl:
        return hit[2], hit[1]
    val = fn()
    stamp = now_local()
    with _lock:
        _cache[key] = (_time.monotonic(), stamp, val)
        if len(_cache) > 200:                      # keep it bounded
            for k in sorted(_cache, key=lambda k: _cache[k][0])[:100]:
                _cache.pop(k, None)
    return val, stamp


def _dt(raw: Any) -> Optional[datetime]:
    s = str(raw or "").strip()
    for fmt in ("%d.%m.%Y %H:%M:%S", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    return None


def _d(raw: Any) -> Optional[date]:
    try:
        return datetime.strptime(str(raw or "").strip()[:10], "%d.%m.%Y").date()
    except ValueError:
        return None


def _hm(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%H:%M") if dt else None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat(timespec="minutes") if dt else None


def _mins(a: datetime, b: datetime) -> float:
    return (b - a).total_seconds() / 60.0


def _minute(dt: datetime) -> datetime:
    """The clock as the page prints it — seconds dropped."""
    return dt.replace(second=0, microsecond=0)


_SCHED_PAIR = re.compile(r"(\d{1,2})[:\-.](\d{2})")
_SCHED_HOURS = re.compile(r"^\s*(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*$")


def _schedule_window(name: str, day: date) -> tuple[Optional[datetime], Optional[datetime]]:
    """«08-00 до 17-00», «08:00-20:00», «9-18» → the day's (begin, end)."""
    s = name or ""
    hits = _SCHED_PAIR.findall(s)
    if len(hits) >= 2:
        (h1, m1), (h2, m2) = hits[0], hits[1]
    else:
        m = _SCHED_HOURS.match(s)
        if not m:
            return None, None
        h1, m1, h2, m2 = m.group(1), "00", m.group(2), "00"
    try:
        b = datetime.combine(day, time(int(h1) % 24, int(m1)))
        e = datetime.combine(day, time(int(h2) % 24, int(m2)))
    except ValueError:
        return None, None
    if e <= b:
        e += timedelta(days=1)
    return b, e


# ── reading Verifix ───────────────────────────────────────────────────────────

def _read_directory(cfg: dict) -> dict:
    """Divisions, jobs and every WORKING employee — the directory."""
    deadline = _time.monotonic() + verifix.BUDGET_S
    divs: dict[str, dict] = {}
    jobs: dict[str, str] = {}
    emps: dict[str, dict] = {}
    with verifix.client(cfg) as cl:
        for page in verifix.each_page(cl, "core/division$list", {"division_ids": []},
                                      limit=verifix.LIMIT_LIST, deadline=deadline):
            for d in page:
                did = str(d.get("division_id") or "")
                code = str(d.get("code") or "").strip()
                divs[did] = {"code": verifix._code_key(code) if code else None,
                             "raw": code, "name": d.get("name") or ""}
        for page in verifix.each_page(cl, "core/job$list", {"job_ids": []},
                                      limit=verifix.LIMIT_LIST, deadline=deadline):
            for j in page:
                jobs[str(j.get("job_id") or "")] = j.get("name") or ""
        body = {"employee_ids": [], "statuses": ["W"], "npins": []}
        try:
            pages = list(verifix.each_page(cl, "core/employee$list", body,
                                           limit=verifix.LIMIT_LIST, deadline=deadline))
        except verifix.VerifixError as exc:
            if exc.code != "http":
                raise
            # A server that will not filter by status: take everyone, keep «W».
            body["statuses"] = []
            pages = list(verifix.each_page(cl, "core/employee$list", body,
                                           limit=verifix.LIMIT_LIST, deadline=deadline))
        for page in pages:
            for e in page:
                eid = str(e.get("employee_id") or "")
                if not eid or (e.get("status") or "W") != "W":
                    continue
                name = " ".join(str(x).strip() for x in (e.get("last_name"), e.get("first_name"),
                                                        e.get("middle_name")) if x).strip()
                emps[eid] = {"name": name, "unit": str(e.get("org_unit_id") or ""),
                             "div": str(e.get("division_id") or ""),
                             "job": jobs.get(str(e.get("job_id") or ""), "")}
    return {"divs": divs, "jobs": jobs, "emps": emps}


# What `_person` and the raw view read of a report day — nothing else is kept.
_DAY_KEYS = ("date", "input_time", "output_time", "begin_time", "end_time", "day_kind", "plan_time")


def _trim_day(d: dict) -> dict:
    out = {k: d.get(k) for k in _DAY_KEYS}
    out["facts"] = [{"time_kind_id": f.get("time_kind_id"), "fact_value": f.get("fact_value")}
                    for f in d.get("facts") or [] if f.get("fact_value")]
    return out


def _read_timesheet(cl, ids: list[int], day: date, deadline: float) -> dict[str, dict]:
    ts: dict[str, dict] = {}
    body = {"period_begin_date": verifix._dmy(day), "period_end_date": verifix._dmy(day),
            "division_ids": [], "employee_ids": ids}
    for page in verifix.each_page(cl, "core/timesheet$export", body,
                                  limit=verifix.LIMIT_TIMESHEET, deadline=deadline):
        for r in page:
            eid = str(r.get("employee_id") or "")
            if not eid:
                continue
            rec = ts.setdefault(eid, {"name": r.get("employee_name") or "",
                                      "job": r.get("job_name") or "",
                                      "schedule": r.get("schedule_name") or "",
                                      "days": []})
            for d in r.get("days") or []:
                if _d(d.get("date")) == day:
                    rec["days"].append(_trim_day(d))
    return ts


def _read_marks(cl, ids: list[int], frm: datetime, to: datetime,
                deadline: float) -> dict[str, list]:
    """Every mark of these people in [frm, to], as ["YYYY-MM-DDTHH:MM:SS", type]."""
    marks: dict[str, list] = defaultdict(list)
    if not ids or to <= frm:
        return marks
    body = {"employee_ids": ids,
            "begin_datetime": frm.strftime("%d.%m.%Y %H:%M:%S"),
            "end_datetime": to.strftime("%d.%m.%Y %H:%M:%S")}
    for page in verifix.each_page(cl, "core/track$list", body,
                                  limit=verifix.LIMIT_TRACKS, deadline=deadline):
        for t in page:
            eid = str(t.get("employee_id") or "")
            at = _dt(t.get("track_datetime"))
            if eid and at:
                marks[eid].append([at.isoformat(timespec="seconds"),
                                   str(t.get("track_type") or "").upper()])
    return marks


def _marks_window(day: date, now: datetime) -> tuple[datetime, datetime]:
    """A night shift runs into the next morning: its marks are read until 14:00."""
    return datetime.combine(day, time(0)), min(datetime.combine(day + timedelta(days=1), time(14)), now)


# ── the stored reads (`live_verifix_reads`) ───────────────────────────────────

def _day_key(day: date) -> str:
    return f"day:{day.isoformat()}"


def _row(db: Session, key: str, lock: bool = False) -> Optional[LiveVerifixRead]:
    q = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == key)
    return (q.with_for_update() if lock else q).first()


def _locked_row(db: Session, key: str) -> LiveVerifixRead:
    """The row, locked for this transaction — created first when missing, so two
    writers (the job and a «Yangilash») can never race on its insert."""
    db.execute(pg_insert(LiveVerifixRead).values(key=key, data={})
               .on_conflict_do_nothing(index_elements=["key"]))
    return _row(db, key, lock=True)


def _local(ts: Optional[datetime]) -> Optional[datetime]:
    """A stored timestamptz → Tashkent wall clock, naive (the page's clock)."""
    if ts is None:
        return None
    return ts.astimezone(TZ).replace(tzinfo=None) if ts.tzinfo else ts


def _note_error(db: Session, key: str, exc: Exception) -> None:
    try:
        db.rollback()
        row = _locked_row(db, key)
        row.error = (f"{getattr(exc, 'code', '')}: {getattr(exc, 'message', '') or exc}")[:300]
        row.error_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:  # noqa: BLE001 — recording a failure must not fail the caller
        db.rollback()
        log.exception("staff-live: could not record the failed read of %s", key)


def _directory(db: Session, cfg: dict, max_age: float) -> tuple[dict, Optional[datetime]]:
    """The stored directory, read from Verifix again when older than `max_age`.
    A failed re-read falls back to the stored one; with none, it raises."""
    row = _row(db, "dir")
    at = _local(row.read_at) if row else None
    if row and row.data and at and (now_local() - at).total_seconds() <= max_age:
        return row.data, at
    t0 = _time.monotonic()
    try:
        data = _read_directory(cfg)
    except verifix.VerifixError as exc:
        _note_error(db, "dir", exc)
        if row and row.data:
            log.warning("staff-live: directory re-read failed (%s), using the stored one", exc.code)
            return row.data, at
        raise
    row = _locked_row(db, "dir")
    row.data, row.read_at = data, datetime.now(timezone.utc)
    row.ms, row.error, row.error_at = int((_time.monotonic() - t0) * 1000), None, None
    db.commit()
    return data, _local(row.read_at)


def _read_day(db: Session, cfg: dict, day: date, ids: list[str],
              unit_id: Optional[int] = None, units_read=(), all_units=(),
              homes: Optional[dict] = None) -> dict:
    """Read `ids` on `day` from Verifix and fold them into the day's stored read.

    `unit_id` None = the job's read: the marks read since the last one only
    (all of them every `TRACKS_FULL_S`; whole for anybody the last passes
    skipped), `all_at` = the job's pacing stamp, and `units[m]` stamped for each
    unit in `units_read` — the job reads only the units whose day it is (v2; in
    a v1 row `all_at` meant every unit, so upgrading one hands that stamp to
    each of `all_units`). A unit's read («Yangilash», or a day nobody stored)
    reads its people whole and stamps `units[unit_id]`. Each person is replaced
    only by a read that STARTED later than the one stored for them, and carries
    that read's start (`at`) — what `_covered_at` reads."""
    key = _day_key(day)
    started = now_local()
    t0 = _time.monotonic()
    row = _row(db, key)
    old = (row.data or {}) if row else {}
    old_emps = old.get("emps") or {}
    lo, hi = _marks_window(day, started)
    m_to = datetime.fromisoformat(old["m_to"]) if old.get("m_to") else None
    m_full = datetime.fromisoformat(old["m_full_at"]) if old.get("m_full_at") else None
    incremental = (unit_id is None and m_to is not None and m_full is not None
                   and (started - m_full).total_seconds() < TRACKS_FULL_S)
    m_from = max(lo, m_to - timedelta(minutes=TRACKS_OVERLAP_MIN)) if incremental else lo
    # Whole for the people the last passes skipped (a unit whose shift-day it
    # was not): their stored marks stop before the incremental window opens.
    fresh = [i for i in ids if i not in old_emps or _read_before(old_emps[i], m_from)] if incremental else []
    db.rollback()                                   # no transaction held across the API calls

    num = [int(i) for i in ids if i.isdigit()]
    deadline = _time.monotonic() + verifix.BUDGET_S
    with verifix.client(cfg) as cl:
        ts = _read_timesheet(cl, num, day, deadline) if num else {}
        marks = _read_marks(cl, num, m_from, hi, deadline)
        whole = _read_marks(cl, [int(i) for i in fresh if i.isdigit()], lo, hi, deadline) if fresh else {}

    at_iso = started.isoformat(timespec="seconds")
    from_iso = m_from.isoformat(timespec="seconds")
    fresh_set = set(fresh)
    row = _locked_row(db, key)
    cur = dict(row.data or {})
    emps = dict(cur.get("emps") or {})
    for eid in ids:
        prev = emps.get(eid)
        if prev and (prev.get("at") or "") > at_iso:
            continue                                # a newer read already stands
        if eid in fresh_set:
            m = whole.get(eid, [])
        elif incremental and prev:
            m = [x for x in prev.get("m") or [] if x[0] < from_iso] + marks.get(eid, [])
        else:
            m = marks.get(eid, [])
        uniq = {(x[0], x[1]): x for x in m}
        emps[eid] = {"at": at_iso, "ts": ts.get(eid), "m": [uniq[k] for k in sorted(uniq)]}
        # The cell the directory put them in AT this read — the day's own
        # placement, which the directory (current only) forgets by tomorrow:
        # the «Ish grafigi» list reads it for a live day (`kelish`).
        home = (homes or {}).get(eid)
        if home:
            emps[eid]["c"] = home[1]
    cur["emps"] = emps
    if unit_id is None:
        units = dict(cur.get("units") or {})
        if int(cur.get("v") or 1) < 2 and cur.get("all_at"):
            for m in all_units:
                units.setdefault(str(m), cur["all_at"])
        for m in units_read:
            units[str(m)] = at_iso
        cur["units"] = units
        cur["v"] = 2
        cur["all_at"] = at_iso
        cur["m_to"] = hi.isoformat(timespec="seconds")
        if not incremental:
            cur["m_full_at"] = at_iso
        row.read_at = datetime.now(timezone.utc)
        row.ms = int((_time.monotonic() - t0) * 1000)
    else:
        cur.setdefault("v", 1)
        units = dict(cur.get("units") or {})
        units[str(unit_id)] = at_iso
        cur["units"] = units
    row.data = cur
    row.error, row.error_at = None, None
    db.commit()
    return cur


def _read_before(emp: dict, t: datetime) -> bool:
    try:
        return datetime.fromisoformat(emp.get("at") or "") < t
    except ValueError:
        return True


def _covered_at(data: dict, unit_id: int, ids=()) -> Optional[datetime]:
    """When this unit's people were last read: the OLDEST read among them —
    each person carries the start of the read that last replaced them, and the
    job reads only the units whose shift-day it is, so a day-wide stamp would
    claim units it skipped. A unit with nobody: its own stamp (v1 rows: the
    job's `all_at`, which then covered every unit). None = nothing read."""
    store = data.get("emps") or {}
    ats = []
    for i in ids:
        try:
            ats.append(datetime.fromisoformat(store[i]["at"]))
        except (KeyError, TypeError, ValueError):
            continue
    if ids:
        return min(ats) if ats else None
    stamps = [x for x in ((data.get("units") or {}).get(str(unit_id)),
                          data.get("all_at") if int(data.get("v") or 1) < 2 else None) if x]
    return datetime.fromisoformat(max(stamps)) if stamps else None


# ── one person's day ──────────────────────────────────────────────────────────

def _formula(db: Session) -> Optional[dict]:
    """The «Отработано» rule the parity check found, if it is good enough."""
    h = (verifix_parity.last_parity(db) or {}).get("hours") or {}
    n, exact = h.get("n") or 0, h.get("exact") or 0
    if n < FORMULA_MIN_N or exact / n < FORMULA_MIN_SHARE or not h.get("kinds"):
        return None
    return {"kinds": [str(k["id"]) for k in h["kinds"]],
            "names": [k.get("name") or k["id"] for k in h["kinds"]],
            "div": 60.0 if h.get("unit") == "min" else 3600.0,
            "share": round(exact / n, 3)}


def _gate_after(marks: list, mark: tuple, first: bool = False):
    """A gate checkpoint after this mark: the person crossed the perimeter
    after it. On the way IN the gate comes before the door's «I» (8–20 min),
    so a checkpoint AFTER an «I» can only be the way out. `first` returns that
    checkpoint instead of yes / no."""
    gate = next((m for m in sorted(marks) if m[1] in CHECKPOINT and m[0] > mark[0]), None)
    return gate if first else gate is not None


def _exit_before(directed: list, entry: tuple) -> Optional[tuple]:
    """The door exit just before an «I» on the way out (production door «O»,
    then a corridor / locker-room «I», then the gate): the directed mark right
    before it, when that is an «O»/«T» no more than PAIR_MIN earlier."""
    prev = [m for m in directed if m[0] < entry[0]]
    if prev and prev[-1][1] in OUT_TYPES | BREAK_TYPES and _mins(prev[-1][0], entry[0]) <= PAIR_MIN:
        return prev[-1]
    return None


def _person(day: date, now: datetime, rec: Optional[dict], marks: list,
            formula: Optional[dict]) -> dict:
    d = (rec or {}).get("days") or []
    d = d[0] if d else None
    schedule = (rec or {}).get("schedule") or ""
    begin = _dt(d.get("begin_time")) if d else None
    end = _dt(d.get("end_time")) if d else None
    if (begin is None or end is None) and schedule:
        b2, e2 = _schedule_window(schedule, day)
        begin, end = begin or b2, end or e2
    scheduled = d is not None and (d.get("day_kind") or "W") == "W"

    lo = (begin - timedelta(hours=4)) if begin else datetime.combine(day, time(0))
    hi = (end + timedelta(hours=6)) if end else datetime.combine(day, time(23, 59, 59))
    mine = sorted(m for m in marks if lo <= m[0] <= hi)

    # THE clocks are the report's own `input_time` / `output_time`: the parity
    # check proved them equal to the file's clock-in/out for 1,157 of 1,158
    # people (27.09). The raw marks are EVERY terminal a person passes — on
    # 01.10 the first mark of the day sat 8–20 min (up to 2 h) BEFORE the
    # report's check-in for 70 of 71 people and the last mark 7–31 min AFTER
    # its check-out for 68 of 71: the gate before the door, the door before the
    # gate. Taking the earliest and the latest mark (what this did until
    # 2026-10-02) printed every arrival early and every departure late. A mark
    # decides a clock only where the report has not answered yet, and says so
    # (`in_src` / `out_src` other than "report" — dotted on the page).
    t_in_rep = _dt(d.get("input_time")) if d else None
    t_out_rep = _dt(d.get("output_time")) if d else None
    t_in = in_src = None
    if t_in_rep:
        t_in, in_src = t_in_rep, "report"
    else:
        # Only a directed «I» is an arrival. On 01.10 sixteen people with no
        # report row had NOTHING but checkpoint marks (five taps at the gate
        # at 14:16, nobody ever inside) and the first mark made them «inside»
        # / «no check-out» all day on a day the file reads «did not come».
        first_in = next((m for m in mine if m[1] not in CHECKPOINT | OUT_TYPES), None)
        if first_in is not None:
            t_in, in_src = first_in[0], "mark"
    # A mark BEFORE the report's check-in is not this shift's — the previous
    # night's exit was read as today's arrival until 2026-10-02 (the laptop
    # fix, v4.207.1) — so the marks start at the arrival.
    if t_in:
        mine = [m for m in mine if m[0] >= t_in - timedelta(minutes=1)]

    shift_over = now >= end if end else now >= datetime.combine(day + timedelta(days=1), time(6))
    # Without a report check-out (Verifix fills them in late — last night's
    # shift had none by noon, 2026-10-01): any mark at least PAIR_MIN after
    # the arrival, up to 12 h past the shift's end, whatever its type — once
    # the shift is over the latest of them is where the person left.
    far = (end + timedelta(hours=12)) if end else datetime.combine(day + timedelta(days=1), time(14))
    late_marks = sorted(m for m in marks
                        if t_in and m[0] <= far and _mins(t_in, m[0]) >= PAIR_MIN) if t_in else []
    t_out = out_src = held = None
    if t_in is None:
        if not scheduled:
            status = "off"
        elif begin and now < begin:
            status = "not_yet"
        else:
            status = "absent"
    else:
        directed = [m for m in mine if m[1] in DIRECTED | BREAK_TYPES]
        last_dir = directed[-1] if directed else None
        if t_out_rep and t_out_rep >= t_in:
            t_out, out_src = t_out_rep, "report"
            # The report's check-out is the person's LAST exit so far, and it
            # moves only when they go out again — a return in between shows in
            # the marks first. So while the shift runs the DIRECTED marks after
            # it may move it: a later «O»/«T» = out again, at that mark; an «I»
            # = back inside, but only while nothing follows it — a GATE
            # checkpoint after the entry means the person then crossed the
            # perimeter, i.e. the «I» was a door on the way out (a corridor,
            # the locker room), not a return. Until 2026-10-04 any «I» after
            # the check-out — and before that any mark 30+ min after it —
            # read as a return, and the people Verifix showed out since 18:04 /
            # 18:17 (all of cell 6712) read «inside» all evening. ONLY while
            # the shift still runs: once it is over the report's check-out is
            # final — on 01.10 sixteen finished days read «no check-out»
            # because the NEXT day's «I» (02.10 09:52, inside the 12 h the
            # fallback looks at) was taken as a return.
            after = [m for m in directed if m[0] > t_out_rep + timedelta(minutes=1)]
            if not shift_over and after:
                if after[-1][1] in OUT_TYPES | BREAK_TYPES:
                    t_out, out_src = after[-1][0], "mark"
                elif _gate_after(mine, after[-1]):
                    exit_ = _exit_before(after, after[-1])
                    if exit_ is not None:
                        t_out, out_src = exit_[0], "mark"
                else:
                    t_out = out_src = None
                    held = "back"
        elif last_dir is not None:
            # The last DIRECTED mark decides: an «O»/«T» is the departure; an
            # «I» means inside — unless a gate checkpoint follows it, which is
            # the person crossing the perimeter after it (the same reading as
            # above). A checkpoint after an «O» is the gate on the way out and
            # moves nothing.
            if last_dir[1] in OUT_TYPES | BREAK_TYPES:
                t_out, out_src = last_dir[0], "mark"
            elif _gate_after(mine, last_dir):
                # Left at the door exit just before that «I» when there is one,
                # else at the gate itself — never at the «I», which may be the
                # morning's arrival.
                exit_ = _exit_before(directed, last_dir) or _gate_after(mine, last_dir, first=True)
                t_out, out_src = exit_[0], "gate"
            else:
                held = "no_report_out"
        elif shift_over and late_marks:
            t_out, out_src = late_marks[-1][0], "last_mark"
        # An exit before the shift's end is not a departure yet but a BREAK
        # (12 people read «Ketgan» at 09:30 on 02.10, over a breakfast); it
        # becomes one, with its early-leave minutes, once the shift is over.
        if t_out is None:
            status = "inside"
        elif shift_over:
            status = "left"
        else:
            status = "break"

    # Still «inside» an hour after the shift's end with no exit anywhere: the
    # person arrived and never checked out. Not inside any more — its own
    # status, the missing check-out the brigadir has to sort out. (Verifix
    # counts a day only by in→out intervals and reads such a day «Не пришла»;
    # the operator wants the arrival KEPT and the missing exit shown instead.)
    if status in ("inside", "break") and end is not None \
            and now > end + timedelta(minutes=MISSING_AFTER_MIN):
        status = "no_out"

    facts = {}
    for f in (d or {}).get("facts") or []:
        k = str(f.get("time_kind_id") or "")
        try:
            v = float(f.get("fact_value") or 0)
        except (TypeError, ValueError):
            v = 0.0
        if k and v:
            facts[k] = facts.get(k, 0.0) + v

    so_far = False
    hours: Optional[float] = None
    if status == "left" and t_in and t_out:
        if formula and facts:
            hours = sum(facts.get(k, 0.0) for k in formula["kinds"]) / formula["div"]
        else:
            hours = max(0.0, _mins(t_in, t_out) / 60.0)
    elif status == "break" and t_in and t_out:
        hours, so_far = max(0.0, _mins(t_in, t_out) / 60.0), True
    elif status == "inside" and t_in:
        hours, so_far = max(0.0, _mins(t_in, min(now, hi)) / 60.0), True

    # Counted on the clocks AS PRINTED (whole minutes, Verifix's own way —
    # «Опоздал на 3 мин» at 12:03): off the seconds, a check-in at 07:50:40
    # read «07:50 · 9 min early» against an 08:00 start.
    late = early_in = early_out = None
    if begin and t_in and status != "no_out":
        delta = _mins(_minute(begin), _minute(t_in))
        if delta > LATE_GRACE_MIN:
            late = round(delta)
        elif delta < 0:
            early_in = round(-delta)
    if end and t_out and status == "left":
        delta = _mins(_minute(t_out), _minute(end))
        if delta > EARLY_GRACE_MIN:
            early_out = round(delta)
    missing = status == "no_out"

    return {
        "status": status, "in": t_in, "out": t_out, "begin": begin, "end": end,
        "schedule": schedule, "hours": hours, "so_far": so_far, "late": late,
        "early_in": early_in, "early_out": early_out, "missing": missing,
        "marks": len(mine), "in_src": in_src, "out_src": out_src,
        "held": held if status == "inside" else None,
        "raw": {
            "report": {k: (d or {}).get(k) for k in ("input_time", "output_time", "begin_time",
                                                     "end_time", "day_kind", "plan_time")},
            "facts": facts,
            "window": [_iso(lo), _iso(hi)],
            "marks": [[m[0].strftime("%d.%m %H:%M"), m[1], lo <= m[0] <= hi]
                      for m in sorted(marks)[-60:]],
            "marks_total": len(marks),
        },
    }


# ── who belongs where ─────────────────────────────────────────────────────────

def _registry(db: Session) -> tuple[dict, dict]:
    """code key → {id, code, manager_id} for the cells COUNTED IN THE ЗАГРУЗКА
    (`cells.in_load` — the operator, 2026-10-04: this page takes no other
    cell); manager id → {name, shift} for every live unit."""
    cells = {}
    for cid, code, mid in (db.query(Cell.id, Cell.verifix_code, Cell.manager_id)
                           .filter(Cell.in_load.is_(True)).all()):
        if code:
            cells[verifix._code_key(code)] = {"id": cid, "code": code, "manager_id": mid}
    units = {m.id: {"name": m.name, "shift": m.shift}
             for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    return cells, units


def unit_cells(db: Session, manager_id: int) -> set[str]:
    """The unit's workload cells, by their stored code — what a move or a
    placement on this page may name."""
    return {c["code"] for c in _registry(db)[0].values() if c["manager_id"] == manager_id}


def _homes(directory: dict, cells: dict) -> dict[str, tuple[int, str]]:
    """employee id → (unit, cell code key) for everybody whose org unit is a
    workload cell with a brigadir."""
    divs = directory.get("divs") or {}
    out: dict[str, tuple[int, str]] = {}
    for eid, e in (directory.get("emps") or {}).items():
        code = (divs.get(e.get("unit")) or {}).get("code")
        cell = cells.get(code) if code else None
        if cell and cell["manager_id"]:
            out[eid] = (cell["manager_id"], code)
    return out


def day_frame(db: Session, shift: Optional[int], now: Optional[datetime] = None) -> dict:
    """The shift frame on the clock for a unit of this shift (`/live`'s rule):
    which shift-day it is, and when the next one opens (`next_start_at`)."""
    now = now or datetime.now(TZ)
    win = cell_hours.defaults(db).get(shift or 1) or ("08:00", "20:00")
    return live_overview.shift_frame(now, shift or 1, win)


def shift_day(db: Session, shift: Optional[int], now: Optional[datetime] = None) -> date:
    """The shift-day on the clock for a unit of this shift."""
    return date.fromisoformat(day_frame(db, shift, now)["day"])


def event_at(db: Session, day: date, shift: Optional[int], hhmm: str) -> datetime:
    """«14:30» on a shift-day → the wall-clock moment. A night shift's small
    hours belong to the morning AFTER the date the night is named for."""
    h, m = (int(x) for x in hhmm.split(":"))
    at = datetime.combine(day, time(h, m))
    win = cell_hours.defaults(db).get(shift or 1) or ("08:00", "20:00")
    s, e = (cell_hours._to_min(win[0]) or 0), (cell_hours._to_min(win[1]) or 0)
    if e <= s and h * 60 + m < s:
        at += timedelta(days=1)
    return at


def _configured(cfg: dict) -> bool:
    return bool(cfg["login"] and cfg.get("password") and cfg["filial_id"])


def _doc_ids(db: Session, day: date) -> set[str]:
    """Everybody a live document of the day names — read with the day even if
    Verifix has since moved them out of the workload cells."""
    from app.models import LiveDocument
    out: set[str] = set()
    for (pl,) in db.query(LiveDocument.payload).filter(
            LiveDocument.day == day, LiveDocument.status.in_(("draft", "approved"))):
        for e in (pl or {}).get("employees") or []:
            if e.get("employee_id"):
                out.add(str(e["employee_id"]))
    return out


_unit_locks: dict[tuple, threading.Lock] = {}
_unit_locks_guard = threading.Lock()


def _unit_lock(key: tuple) -> threading.Lock:
    """One lock per (unit, day): two viewers of a stale unit, or the parallel
    queries of one page load, must not start the same Verifix read twice."""
    with _unit_locks_guard:
        lk = _unit_locks.get(key)
        if lk is None:
            if len(_unit_locks) > 1000:            # forget the idle ones
                for k in [k for k, v in _unit_locks.items() if not v.locked()]:
                    _unit_locks.pop(k, None)
            lk = _unit_locks[key] = threading.Lock()
        return lk


def day_read(db: Session, manager_id: int, day: Optional[date], force: bool = False,
             stored_only: bool = False) -> dict:
    """The stored read behind one unit's day (`services/live_staff` builds the
    rows), read from Verifix first only when it has to be: «Yangilash»
    (`force`), a day nobody stored yet, somebody of this unit missing from it,
    or a running day's read older than `STALE_S` — the job that keeps it fresh
    has stopped. An error comes back as {"error": code[, "message"]}; with a
    stored read in hand a failed re-read keeps it and says so (`read_error`).

    `stored_only` never calls Verifix and never commits or rolls back: it is
    what a WRITE request's checks read (an approval's «does the move still
    hold»). A read in the middle of a write would roll the caller's pending
    changes back — `_read_day` and `_note_error` own the session's transaction
    — and the request would then report a save that never happened."""
    cfg = verifix.config(db, with_password=True)
    if not _configured(cfg):
        return {"error": "not_configured"}
    cells, units = _registry(db)
    unit = units.get(manager_id)
    if not unit:
        return {"error": "no_unit"}
    if not any(c["manager_id"] == manager_id for c in cells.values()):
        return {"error": "no_cells"}
    today = shift_day(db, unit["shift"])
    day = day or today
    # A date that has not come yet has nothing in Verifix: reading it would
    # only store an empty day, which every unit's calendar then shows «open».
    if day > now_local().date():
        return {"error": "future"}
    if stored_only:
        drow = _row(db, "dir")
        if not drow or not drow.data:
            return {"error": "no_read"}
        directory, dir_at = drow.data, _local(drow.read_at)
    else:
        try:
            # «Yangilash» keeps the directory the job refreshes every DIR_TTL:
            # re-reading the whole plant's employees first doubled the press.
            directory, dir_at = _directory(db, cfg, DIR_TTL if force else DIR_FALLBACK_S)
        except verifix.VerifixError as exc:
            return {"error": exc.code, "message": exc.message}
    homes = _homes(directory, cells)
    ids = sorted({eid for eid, (mid, _) in homes.items() if mid == manager_id} | _doc_ids(db, day))

    key = _day_key(day)
    row = _row(db, key)
    data = (row.data or {}) if row else {}
    store = data.get("emps") or {}
    covered = _covered_at(data, manager_id, ids)
    now = now_local()
    if stored_only:
        if covered is None:
            return {"error": "no_read"}
        return {"day": day, "today": today, "unit": unit, "directory": directory,
                "dir_at": dir_at, "store": store, "covered": covered, "now": now,
                "read_error": None}
    stale = (covered is None or any(i not in store for i in ids)
             or (day == today and (now - covered).total_seconds() > STALE_S))
    # A press this soon after the last read serves that read.
    if force and covered is not None and (now - covered).total_seconds() < FORCE_MIN_S:
        force = False
    # A read of this day failed moments ago (Verifix down, the proxy refusing):
    # serve what is stored and say so, rather than every poll trying again.
    failed_at = (_local(row.error_at) if row and row.error and row.error_at
                 and (row.read_at is None or row.error_at > row.read_at) else None)
    backoff = (not force and failed_at is not None
               and (now - failed_at).total_seconds() < ERROR_BACKOFF_S)
    if backoff and stale and covered is None:
        code, _, msg = (row.error or "").partition(": ")
        return {"error": code or "unreachable", "message": msg or row.error}
    read_error = None
    if (force or stale) and not backoff:
        lk = _unit_lock((manager_id, day))
        if lk.acquire(blocking=False):
            try:
                data = _read_day(db, cfg, day, ids, unit_id=manager_id, homes=homes)
            except verifix.VerifixError as exc:
                _note_error(db, key, exc)
                if covered is None:
                    return {"error": exc.code, "message": exc.message}
                read_error = {"message": exc.message or exc.code, "at": _iso(now_local())}
            finally:
                lk.release()
        elif covered is None or any(i not in store for i in ids):
            # Another read of this unit-day is fetching people the stored read
            # lacks: wait for it — holding no connection — and serve what it
            # stored. Never a second Verifix read on top of it (a wait plus a
            # read of our own would outlast Cloudflare's 100 s).
            asked = datetime.now(timezone.utc)
            db.rollback()
            if lk.acquire(timeout=WAIT_S):
                lk.release()
            row = _row(db, key)
            data = (row.data or {}) if row else {}
            failed = (row.error if row and row.error and row.error_at and row.error_at >= asked else None)
            busy = failed or BUSY_MESSAGE
            if _covered_at(data, manager_id, ids) is None:
                return {"error": "busy", "message": busy}
            if any(i not in (data.get("emps") or {}) for i in ids):
                read_error = {"message": busy, "at": _iso(now_local())}
        # else: another read is running and the stored one already holds
        # everybody (it is only old, or «Yangilash» was pressed) — serve it.
        store = data.get("emps") or {}
        covered = _covered_at(data, manager_id, ids)
        now = now_local()
    elif row and row.error and row.error_at and (row.read_at is None or row.error_at > row.read_at):
        read_error = {"message": row.error, "at": _iso(_local(row.error_at))}
    return {"day": day, "today": today, "unit": unit, "directory": directory,
            "dir_at": dir_at, "store": store, "covered": covered, "now": now,
            "read_error": read_error}


# ── the minute job ────────────────────────────────────────────────────────────

_pass_lock = threading.Lock()


def _due_days(db: Session, shifts: set, now_tz: datetime) -> dict[date, float]:
    """The shift-days the job keeps read, and how often: each shift's CURRENT
    day every minute while the shift runs and `HOT_AFTER_MIN` past its end (the
    late check-outs, the «no check-out» turn, the notice), every `COOL_S` after
    that until the next shift-day starts."""
    out: dict[date, float] = {}
    defaults = cell_hours.defaults(db)
    for shift in shifts:
        win = defaults.get(shift) or ("08:00", "20:00")
        fr = live_overview.shift_frame(now_tz, shift, win)
        day = date.fromisoformat(fr["day"])
        ends = datetime.fromisoformat(fr["ends_at"])
        hot = fr["state"] == "running" or now_tz < ends + timedelta(minutes=HOT_AFTER_MIN)
        every = HOT_S if hot else COOL_S
        out[day] = min(out.get(day, every), every)
    return out


def _claim(db: Session, kind: str, manager_id: int, day: date) -> bool:
    """Write the once-only marker of a live-day notice; False = already sent.
    Committed BEFORE the message goes, so two passes can never send it twice."""
    from sqlalchemy.exc import IntegrityError
    from app.models import LiveDayNotice
    db.add(LiveDayNotice(kind=kind, manager_id=manager_id, day=day))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def _notify_all_left(db: Session, manager_id: int, day: date, counts: dict, close: dict,
                     last_out: datetime, ud: Optional[dict] = None) -> bool:
    """Tell the unit's brigadir, ONCE, that everybody who came has left. The row
    is committed first: it is what keeps a second pass from sending it again.
    On /staff's live days (`live_day.LIVE_FROM`) the message names who has no
    check-out and says when nobody typed «Bugungi fakt» (rulings 18 and 20)."""
    from sqlalchemy.exc import IntegrityError
    from app.services import live_day
    db.add(LiveAllLeftNotice(manager_id=manager_id, day=day, came=counts["came"],
                             missing=counts["missing"], pending=close["pending"], last_out=last_out))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    try:
        from app.routers.staff import _notify_supervisor_all
        params = {
            "date": day.strftime("%d.%m.%Y"), "came": counts["came"], "last_out": _hm(last_out),
            # A line whose one value is blank is dropped (`_render_body`).
            "missing": counts["missing"] or "", "pending": close["pending"] or "",
        }
        nkey = "live_all_left"
        if live_day.is_live(day):
            nkey = "live_all_left_staff"
            names = [r["worker_name"] for r in (ud or {}).get("workers") or []
                     if r.get("missing") and r.get("split_of") is None]
            if names:
                tail = f" +{len(names) - 5}" if len(names) > 5 else ""
                params["missing"] = f"{len(names)} — {', '.join(names[:5])}{tail}"
            from app.services import zagruzka_source
            typed = zagruzka_source.typed_people(db, [manager_id], day, day)
            params["no_people"] = "" if typed else day.strftime("%d.%m.%Y")
        _notify_supervisor_all(db, manager_id, nkey, params, "info",
                               subject=("live_day", f"{manager_id}:{day.isoformat()}"))
        db.commit()
    except Exception:  # noqa: BLE001 — a DM that fails must not stop the pass
        db.rollback()
        log.exception("staff-live: the «everybody left» notice to unit %s failed", manager_id)
    return True


def _notices(db: Session, day: date, unit_days: dict, directory: dict) -> int:
    """After a read of `day`: re-copy the closed live units whose current day it
    is (ruling 13 — the copy follows Verifix until the next shift-day opens),
    tell a brigadir «your list is live» at the day's first clock-in, and tell
    every unit whose people have all left — while the last exit is recent
    (`NOTICE_WINDOW_MIN`), so a deploy in the afternoon never tells last
    night's brigadirs."""
    from app.services import live_day, live_projection, live_staff
    row = _row(db, _day_key(day))
    store = ((row.data or {}).get("emps") or {}) if row else {}
    if not store:
        return 0
    ctx = live_staff.load(db, day, directory, store)
    current = [m for m, d in unit_days.items() if d == day]
    if live_day.is_live(day) and current:
        live_projection.refresh(db, ctx, current)
    # Only a live day (`live_day.LIVE_FROM` on) is told, and only to a brigadir
    # who can open /staff, where the notice links.
    if not live_day.is_live(day):
        return 0
    from app import identity
    from app.permissions import get_page_access
    access = get_page_access(db)
    done = {m for (m,) in db.query(LiveAllLeftNotice.manager_id).filter(LiveAllLeftNotice.day == day)}
    closed = {m for (m,) in db.query(LiveDayClose.manager_id).filter(LiveDayClose.day == day)}
    from app.models import LiveDayNotice
    told_in = {m for (m,) in db.query(LiveDayNotice.manager_id).filter(
        LiveDayNotice.kind == "first_in", LiveDayNotice.day == day)}
    now = ctx.now
    sent = 0
    for mid in current:
        if mid in closed and mid in done:
            continue
        if not live_staff.can_open(db, identity.profile_key("supervisor", mid), access):
            continue
        ud = live_staff.unit_day(ctx, mid)
        if not ud["workers"] and not ud["extras"]:
            continue
        cl = (None if mid in closed else
              live_staff.close_state(ud, day, None, None, live_staff.pending_count(db, mid, day)))
        # «Your list is live» — once, at the day's first clock-in (ruling 18).
        # A day whose people have ALL left by the first pass that sees it (the
        # floor reaching a day already worked, a job that was down) is told only
        # «everybody left — close the day»: the marker is still written, so a
        # worker coming back later does not raise a «your list is live» after it.
        if (live_day.is_live(day) and mid not in told_in and mid not in closed
                and mid not in done and ud["counts"]["came"] and _claim(db, "first_in", mid, day)
                and cl["state"] != "all_left"):
            try:
                from app.routers.staff import _notify_supervisor_all
                _notify_supervisor_all(db, mid, "live_list_open", {
                    "date": day.strftime("%d.%m.%Y"), "came": ud["counts"]["came"]}, "info",
                    subject=("live_day", f"{mid}:{day.isoformat()}"))
                db.commit()
            except Exception:  # noqa: BLE001
                db.rollback()
                log.exception("staff-live: the «list is live» notice to unit %s failed", mid)
        if mid in done or mid in closed:
            continue
        if cl["state"] != "all_left" or not cl.get("last_out"):
            continue
        last_out = datetime.fromisoformat(cl["last_out"])
        if (now - last_out).total_seconds() > NOTICE_WINDOW_MIN * 60:
            continue
        if _notify_all_left(db, mid, day, ud["counts"], cl, last_out, ud):
            sent += 1
            log.info("staff-live: unit %s told everybody left on %s (last %s, came %s)",
                     mid, day, _hm(last_out), ud["counts"]["came"])
    return sent


REMIND_WINDOW_MIN = 180   # the next-shift reminder goes out within this long of the shift's opening


def _reminders(db: Session, units: dict, with_cells: set, by_shift: dict,
               directory: dict, now_tz: datetime) -> int:
    """When a shift opens and a unit's PREVIOUS live day of that shift is still
    open with people on it: remind the brigadir and the shift manager, once
    (ruling 18), and send the admins ONE line for the shift — how many units
    closed it and which did not (their per-unit «day closed» DMs are folded
    into it)."""
    from app.services import live_day, live_staff
    from app.models import LiveDayNotice
    defaults = cell_hours.defaults(db)
    told = 0
    for s, cur in by_shift.items():
        prev = cur - timedelta(days=1)
        if not live_day.is_live(prev):
            continue
        fr = live_overview.shift_frame(now_tz, s, defaults.get(s) or ("08:00", "20:00"))
        since = (now_tz - datetime.fromisoformat(fr["started_at"])).total_seconds() / 60.0
        if since < 0 or since > REMIND_WINDOW_MIN:
            continue
        summary = f"shift_summary:{s}"
        if db.query(LiveDayNotice.id).filter(LiveDayNotice.kind == summary, LiveDayNotice.manager_id == 0,
                                             LiveDayNotice.day == prev).first():
            continue
        row = _row(db, _day_key(prev))
        store = ((row.data or {}).get("emps") or {}) if row else {}
        if not store:
            continue
        ctx = live_staff.load(db, prev, directory, store)
        closed = {m for (m,) in db.query(LiveDayClose.manager_id).filter(LiveDayClose.day == prev)}
        mids = sorted((m for m in with_cells if (units[m]["shift"] or 1) == s),
                      key=lambda m: units[m]["name"] or "")
        total, open_units = 0, []
        from app.routers import staff_live
        for m in mids:
            ud = live_staff.unit_day(ctx, m)
            if m not in closed and not (ud["counts"]["came"] or ud["counts"].get("extra_came")):
                continue
            total += 1
            if m in closed:
                continue
            open_units.append(m)
            if _claim(db, "still_open", m, prev):
                staff_live._notify(db, "live_day_still_open",
                                   {"date": prev.strftime("%d.%m.%Y"), "unit": units[m]["name"] or f"#{m}"},
                                   units=(m,), supervisors=(m,), admins=False, ntype="warning",
                                   subject=("live_day", f"{m}:{prev.isoformat()}"))
                told += 1
        if total and _claim(db, summary, 0, prev):
            names = [units[m]["name"] or f"#{m}" for m in open_units]
            tail = f" +{len(names) - 12}" if len(names) > 12 else ""
            staff_live._notify(db, "live_shift_summary", {
                "shift": s, "date": prev.strftime("%d.%m.%Y"), "closed": total - len(open_units),
                "total": total, "open_units": (", ".join(names[:12]) + tail) if names else ""},
                admins=True, ntype="info", subject=None)
    return told


def _pass(db: Session) -> None:
    cfg = verifix.config(db, with_password=True)
    if not _configured(cfg):
        return
    cells, units = _registry(db)
    with_cells = {c["manager_id"] for c in cells.values() if c["manager_id"] in units}
    if not with_cells:
        return
    try:
        directory, _ = _directory(db, cfg, DIR_TTL)
    except verifix.VerifixError as exc:
        log.warning("staff-live: no directory (%s: %s)", exc.code, exc.message)
        return
    homes = {eid: h for eid, h in _homes(directory, cells).items() if h[0] in with_cells}
    now_tz = datetime.now(TZ)
    shifts = {units[m]["shift"] or 1 for m in with_cells}
    by_shift = {s: shift_day(db, s, now_tz) for s in shifts}
    unit_days = {m: by_shift[units[m]["shift"] or 1] for m in with_cells}
    defaults = cell_hours.defaults(db)

    def reads(m: int, day: date) -> bool:
        """This unit's people belong in the read of `day`: it is the unit's
        current shift-day, or the unit's shift opens on it within LOOKAHEAD_H
        (early arrivals). Reading every shift's people for every due day read
        a night that had not started every minute, and a finished day shift
        every ten minutes."""
        if unit_days[m] == day:
            return True
        win = defaults.get(units[m]["shift"] or 1) or ("08:00", "20:00")
        start = datetime.combine(day, time(0)) + timedelta(minutes=cell_hours._to_min(win[0]) or 0)
        now = now_local()
        return now < start <= now + timedelta(hours=LOOKAHEAD_H)

    sent = 0
    for day, every in sorted(_due_days(db, shifts, now_tz).items(), key=lambda kv: kv[1]):
        key = _day_key(day)
        row = _row(db, key)
        last = datetime.fromisoformat(row.data["all_at"]) if row and (row.data or {}).get("all_at") else None
        if last is not None and (now_local() - last).total_seconds() < every - 15:
            continue
        read_units = {m for m in with_cells if reads(m, day)}
        ids = sorted({eid for eid, (m, _) in homes.items() if m in read_units} | _doc_ids(db, day))
        t0 = _time.monotonic()
        try:
            _read_day(db, cfg, day, ids, units_read=read_units, all_units=with_cells, homes=homes)
        except verifix.VerifixError as exc:
            _note_error(db, key, exc)
            log.warning("staff-live: reading %s failed (%s: %s)", day, exc.code, exc.message)
            continue
        log.info("staff-live: read %s — %d people in %.1f s", day, len(ids), _time.monotonic() - t0)
        try:
            sent += _notices(db, day, unit_days, directory)
        except Exception:  # noqa: BLE001 — the next pass tries again
            db.rollback()
            log.exception("staff-live: the notices after reading %s failed", day)
    try:
        _reminders(db, units, with_cells, by_shift, directory, now_tz)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("staff-live: the next-shift reminders failed")
    if sent:
        from app.services import action_log
        action_log.record_system("attendance", "lab.live_all_left_notified", db,
                                 details=[("units", sent)])


def run_pass() -> None:
    """The minute job: read Verifix for every workload cell's people on the
    shift-days in play, store it, tell brigadirs whose people have all left.
    Never two at once (one process; the scheduler runs jobs in one copy)."""
    if not _pass_lock.acquire(blocking=False):
        return
    try:
        from app.database import SessionLocal
        with SessionLocal() as db:
            _pass(db)
    except Exception:  # noqa: BLE001 — the next minute tries again
        log.exception("staff-live: the minute read failed")
    finally:
        _pass_lock.release()


def register_jobs() -> None:
    """Every minute (mirrored in passenger_wsgi.py). A box with no Verifix login
    runs a pass that returns on its first query."""
    from app.scheduler import schedule_interval
    schedule_interval("staff-live-read", run_pass, minutes=1)
