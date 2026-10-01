"""The LIVE «Verifix to'g'irlash» — attendance read straight from Verifix (lab).

A lab copy of /staff (`/staff-live`, admin-only, from 2026-10-01): who came, who
is inside, who left and who has not come, read from Verifix's API on demand
instead of the next-morning Excel (memory: verifix-api-integration). Everything
a person DOES there — moving a worker, changing a role, placing someone in a
cell, closing a day by hand — is written to the lab's own tables
(`live_staff_events`, `live_day_closes`) and nothing else on the platform reads
them: real attendance, documents, day closes and the загрузка are untouched.

Where a person stands is answered the way the agreed live feed will answer it:

* **unit** = the brigadir (on /cells) of the cell their Verifix ORG UNIT
  («отдел») names by its code — the org unit, never the division: the cell
  codes sit on org units (first connection test, 2026-10-01: 0 of 2,942 rows
  by division, 1,606 by org unit);
* an APPROVED move / role change / cell change counts from the time it states,
  never from its approval (decision 4); a pending one is shown and holds the
  day's close; a move is approved together with the receiving cell, so nobody
  arrives cell-less (decision 6);
* the day closes by itself an hour after the unit's last check-out (decision
  1) unless somebody is still inside long after their shift (a missing
  check-out — decision 5) or a change is pending; then a person closes it.

**Inside / left come from the raw marks** (`track$list`): the last mark of the
day decides — an «O» is a departure, anything else a presence. A plant whose
terminals mark no direction at all (no «I»/«O» anywhere) falls back to the
report's own first-in / last-out. `diag` says which happened.

**Hours**: «Отработано» is summed from the time kinds the parity check FOUND
(`verifix_last_parity.hours`) when that rule matched the files closely enough,
else the clock span. Someone still inside is counted up to now and marked so.
A row split by a move or a role change is shared out by the clock, the rule
`staff._split_hours` uses: the halves always add up to the whole.
"""
from __future__ import annotations

import logging
import re
import threading
import time as _time
from collections import Counter, defaultdict
from datetime import date, datetime, time, timedelta
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app.models import Cell, LiveDayClose, LiveStaffEvent, Manager
from app.services import cell_hours, live_overview, verifix, verifix_parity

log = logging.getLogger(__name__)

TZ = verifix.TZ

DIR_TTL = 600            # divisions / jobs / employees — the directory, seconds
PULL_TTL = 60            # one unit-day's timesheet + marks, seconds
CLOSE_AFTER_MIN = 60     # decision 1: an hour after the unit's last check-out
MISSING_AFTER_MIN = 60   # still inside this long past the shift's end = no check-out
LATE_GRACE_MIN = 5       # minutes a check-in may trail the schedule start
EARLY_GRACE_MIN = 5      # minutes a check-out may precede the schedule end
FORMULA_MIN_SHARE = 0.9  # the parity formula is used when it matched this share
FORMULA_MIN_N = 50

OUT_TYPES = {"O"}
BREAK_TYPES = {"T"}
DIRECTED = {"I", "O"}
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
        if len(_cache) > 200:                      # a lab page; keep it bounded
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


# ── the directory: divisions, jobs, working employees ─────────────────────────

def _directory(cfg: dict, ttl: float = DIR_TTL) -> tuple[dict, datetime]:
    key = ("dir", cfg["host"], cfg["filial_id"])

    def load() -> dict:
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

    return _cached(key, ttl, load)


def _pull(cfg: dict, ids: list[str], day: date, ttl: float = PULL_TTL) -> tuple[dict, datetime]:
    """The day's report rows and raw marks for these employees only."""
    key = ("pull", cfg["host"], cfg["filial_id"], day.isoformat(), tuple(sorted(ids)))

    def load() -> dict:
        ts: dict[str, dict] = {}
        tracks: dict[str, list] = defaultdict(list)
        if not ids:
            return {"ts": ts, "tracks": tracks}
        num_ids = [int(i) for i in ids if i.isdigit()]
        deadline = _time.monotonic() + verifix.BUDGET_S
        with verifix.client(cfg) as cl:
            body = {"period_begin_date": verifix._dmy(day), "period_end_date": verifix._dmy(day),
                    "division_ids": [], "employee_ids": num_ids}
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
                            rec["days"].append(d)
            # A night shift runs into the next morning: read its marks too.
            begin = datetime.combine(day, time(0))
            end = min(datetime.combine(day + timedelta(days=1), time(14, 0)), now_local())
            if end > begin:
                tbody = {"employee_ids": num_ids,
                         "begin_datetime": begin.strftime("%d.%m.%Y %H:%M:%S"),
                         "end_datetime": end.strftime("%d.%m.%Y %H:%M:%S")}
                for page in verifix.each_page(cl, "core/track$list", tbody,
                                              limit=verifix.LIMIT_TRACKS, deadline=deadline):
                    for t in page:
                        eid = str(t.get("employee_id") or "")
                        at = _dt(t.get("track_datetime"))
                        if eid and at:
                            tracks[eid].append((at, str(t.get("track_type") or "").upper()))
        return {"ts": ts, "tracks": dict(tracks)}

    return _cached(key, ttl, load)


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

    t_in = _dt(d.get("input_time")) if d else None
    t_out = _dt(d.get("output_time")) if d else None
    if mine:
        t_in = min(t_in, mine[0][0]) if t_in else mine[0][0]

    # Where the departure comes from, in order of trust: the report's own
    # check-out (Verifix fills it in late — last night's shift had none by
    # noon, 2026-10-01); a mark the terminal typed as an exit; and, for marks
    # that carry no direction at all, the last mark once the shift is over.
    last = mine[-1] if mine else None
    shift_over = now >= end if end else now >= datetime.combine(day + timedelta(days=1), time(6))
    # Any mark at least PAIR_MIN after the arrival, up to 12 h past the shift's
    # end, whatever its type: once the shift is over the latest of them is
    # where the person left.
    far = (end + timedelta(hours=12)) if end else datetime.combine(day + timedelta(days=1), time(14))
    late_marks = sorted(m for m in marks
                        if t_in and m[0] <= far and _mins(t_in, m[0]) >= PAIR_MIN) if t_in else []
    out_src = None
    if t_in is None:
        if not scheduled:
            status = "off"
        elif begin and now < begin:
            status = "not_yet"
        else:
            status = "absent"
    elif t_out and (last is None or t_out >= last[0] - timedelta(minutes=1)):
        status, out_src = "left", "report"
    elif any(m[1] in DIRECTED for m in mine) and last[1] in DIRECTED | BREAK_TYPES:
        if last[1] in OUT_TYPES:
            status, t_out, out_src = "left", last[0], "mark"
        elif last[1] in BREAK_TYPES:
            status, t_out = "break", None
        else:
            status, t_out = "inside", None
    elif shift_over and late_marks:
        status, t_out, out_src = "left", late_marks[-1][0], "last_mark"
    else:
        status, t_out = "inside", None

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
    elif status in ("inside", "break") and t_in:
        hours, so_far = max(0.0, _mins(t_in, min(now, hi)) / 60.0), True

    late = early_in = early_out = None
    if begin and t_in:
        delta = _mins(begin, t_in)
        if delta > LATE_GRACE_MIN:
            late = round(delta)
        elif delta < 0:
            early_in = round(-delta)
    if end and t_out and status == "left":
        delta = _mins(t_out, end)
        if delta > EARLY_GRACE_MIN:
            early_out = round(delta)
    missing = status in ("inside", "break") and end is not None and now > end + timedelta(minutes=MISSING_AFTER_MIN)

    return {
        "status": status, "in": t_in, "out": t_out, "begin": begin, "end": end,
        "schedule": schedule, "hours": hours, "so_far": so_far, "late": late,
        "early_in": early_in, "early_out": early_out, "missing": missing,
        "marks": len(mine), "out_src": out_src,
        "raw": {
            "report": {k: (d or {}).get(k) for k in ("input_time", "output_time", "begin_time",
                                                     "end_time", "day_kind", "plan_time")},
            "facts": facts,
            "window": [_iso(lo), _iso(hi)],
            "marks": [[m[0].strftime("%d.%m %H:%M"), m[1], lo <= m[0] <= hi]
                      for m in sorted(marks)[:40]],
            "marks_total": len(marks),
        },
    }


# ── who belongs where ─────────────────────────────────────────────────────────

def _registry(db: Session) -> tuple[dict, dict]:
    """code key → {id, code, manager_id}; manager id → {name, shift}."""
    cells = {}
    for cid, code, mid in db.query(Cell.id, Cell.verifix_code, Cell.manager_id).all():
        if code:
            cells[verifix._code_key(code)] = {"id": cid, "code": code, "manager_id": mid}
    units = {m.id: {"name": m.name, "shift": m.shift}
             for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    return cells, units


def shift_day(db: Session, shift: Optional[int], now: Optional[datetime] = None) -> date:
    """The shift-day on the clock for a unit of this shift (`/live`'s rule)."""
    now = now or datetime.now(TZ)
    win = cell_hours.defaults(db).get(shift or 1) or ("08:00", "20:00")
    return date.fromisoformat(live_overview.shift_frame(now, shift or 1, win)["day"])


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


def _timeline(home_unit: Optional[int], home_cell: Optional[str], home_role: str,
              events: list) -> list[tuple[Optional[datetime], Optional[int], Optional[str], str]]:
    """[(from, unit, cell, role)] — what was in force from each moment on."""
    out = [(None, home_unit, home_cell, home_role)]
    for ev in events:
        _, unit, cell, role = out[-1]
        if ev.kind == "move":
            unit, cell = ev.to_manager_id, ev.to_cell or None
        elif ev.kind == "cell":
            cell = ev.to_cell or cell
        elif ev.kind == "role":
            role = ev.to_role or role
        out.append((ev.at, unit, cell, role))
    return out


def _at(tl: list, moment: datetime) -> tuple:
    cur = tl[0]
    for step in tl[1:]:
        if step[0] <= moment:
            cur = step
    return cur


def _overlap_in_unit(tl: list, unit: int, a: datetime, b: datetime) -> tuple[float, Optional[datetime], Optional[datetime]]:
    """Minutes of [a, b] spent in `unit`, and where that stretch starts / ends."""
    total, first, last = 0.0, None, None
    for i, (frm, u, _, _) in enumerate(tl):
        seg_a = max(a, frm) if frm else a
        nxt = tl[i + 1][0] if i + 1 < len(tl) else None
        seg_b = min(b, nxt) if nxt else b
        if u == unit and seg_b > seg_a:
            total += _mins(seg_a, seg_b)
            first = first or seg_a
            last = seg_b
    return total, first, last


# ── the unit's day ────────────────────────────────────────────────────────────

def unit_view(db: Session, manager_id: int, day: Optional[date], force: bool = False) -> dict:
    cfg = verifix.config(db, with_password=True)
    if not (cfg["login"] and cfg.get("password") and cfg["filial_id"]):
        return {"error": "not_configured"}
    cells, units = _registry(db)
    unit = units.get(manager_id)
    if not unit:
        return {"error": "no_unit"}
    today = shift_day(db, unit["shift"])
    day = day or today
    now = now_local()

    try:
        directory, dir_at = _directory(cfg, ttl=120 if force else DIR_TTL)
    except verifix.VerifixError as exc:
        return {"error": exc.code, "message": exc.message}
    divs, emps = directory["divs"], directory["emps"]

    def home_of(eid: str) -> tuple[Optional[int], Optional[str]]:
        e = emps.get(eid)
        code = divs.get(e["unit"], {}).get("code") if e else None
        cell = cells.get(code) if code else None
        return (cell["manager_id"], code) if cell else (None, None)

    events = (db.query(LiveStaffEvent).filter(LiveStaffEvent.day == day)
              .order_by(LiveStaffEvent.at, LiveStaffEvent.id).all())
    approved: dict[str, list] = defaultdict(list)
    pending: dict[str, list] = defaultdict(list)
    for ev in events:
        if ev.status == "approved":
            approved[ev.employee_id].append(ev)
        elif ev.status == "pending":
            pending[ev.employee_id].append(ev)

    ids = {eid for eid in emps if home_of(eid)[0] == manager_id}
    for ev in events:
        if ev.status in ("approved", "pending") and manager_id in (ev.from_manager_id, ev.to_manager_id):
            ids.add(ev.employee_id)
    ids = sorted(ids)

    try:
        pulled, pulled_at = _pull(cfg, ids, day, ttl=0 if force else PULL_TTL)
    except verifix.VerifixError as exc:
        return {"error": exc.code, "message": exc.message}
    ts, tracks = pulled["ts"], pulled["tracks"]

    type_counts = Counter(t for marks in tracks.values() for _, t in marks)
    directed = any(t in DIRECTED for t in type_counts)
    formula = _formula(db)
    close_rec = (db.query(LiveDayClose)
                 .filter(LiveDayClose.manager_id == manager_id, LiveDayClose.day == day).first())

    rows = []
    for eid in ids:
        rec = ts.get(eid)
        person = _person(day, now, rec, tracks.get(eid, []), formula)
        home_unit, home_cell = home_of(eid)
        role0 = (rec or {}).get("job") or (emps.get(eid) or {}).get("job") or ""
        tl = _timeline(home_unit, home_cell, role0, approved.get(eid, []))
        t_in, t_out = person["in"], person["out"]
        moment = min(now, person["end"]) if person["end"] and person["end"] < now else now
        unit_now = _at(tl, now)[1]
        if t_in:
            stop = t_out or min(now, (person["end"] + timedelta(hours=6)) if person["end"] else now)
            span = max(_mins(t_in, stop), 0.0)
            mins_u, seg_a, seg_b = _overlap_in_unit(tl, manager_id, t_in, stop)
            share = (mins_u / span) if span > 0 else (1.0 if _at(tl, t_in)[1] == manager_id else 0.0)
            in_unit = mins_u > 0 or share > 0
        else:
            ref = person["begin"] or moment
            in_unit, share, seg_a, seg_b = _at(tl, ref)[1] == manager_id, 0.0, None, None
        touches = any(manager_id in (ev.from_manager_id, ev.to_manager_id)
                      for ev in approved.get(eid, []) + pending.get(eid, []))
        if not in_unit and not touches:
            continue

        # Status as THIS unit sees it.
        status = person["status"]
        moved = None
        moves = [ev for ev in approved.get(eid, []) if ev.kind == "move"]
        if moves:
            last_mv = moves[-1]
            if unit_now != manager_id and last_mv.from_manager_id == manager_id:
                moved = {"dir": "out", "unit": (units.get(last_mv.to_manager_id) or {}).get("name"),
                         "at": _hm(last_mv.at)}
                status = "moved_out"
            elif unit_now == manager_id and last_mv.to_manager_id == manager_id:
                moved = {"dir": "in", "unit": (units.get(last_mv.from_manager_id) or {}).get("name"),
                         "at": _hm(last_mv.at)}

        end_state = next((st for st in reversed(tl) if st[1] == manager_id), tl[0])
        roles = [(s[0], s[3]) for s in tl]
        role_changes = [{"at": _hm(frm), "role": r} for frm, r in roles[1:] if r != roles[0][1]]
        cell_changes = [{"at": _hm(s[0]), "cell": s[2]} for s in tl[1:] if s[2] != tl[0][2]]
        hours = person["hours"]
        hours_u = round(hours * share, 2) if hours is not None and t_in else None
        cell_key = end_state[2]
        cell = cells.get(cell_key) if cell_key else None
        arrived_here = t_in is not None and seg_a is not None and abs(_mins(seg_a, t_in)) < 1
        left_here = t_out is not None and seg_b is not None and abs(_mins(seg_b, t_out)) < 1
        rows.append({
            "employee_id": eid,
            "name": (rec or {}).get("name") or (emps.get(eid) or {}).get("name") or f"#{eid}",
            "role": end_state[3] or role0,
            "role0": role0,
            "role_changes": role_changes,
            "cell": cell["code"] if cell else (cell_key.zfill(4) if cell_key and cell_key.isdigit() else cell_key),
            "cell_id": cell["id"] if cell else None,
            "cell_changes": cell_changes,
            "schedule": person["schedule"],
            "begin": _hm(person["begin"]), "end": _hm(person["end"]),
            "in": _hm(t_in), "out": _hm(t_out),
            "in_at": _iso(t_in), "out_at": _iso(t_out), "out_src": person["out_src"],
            "status": status,
            "hours": hours_u, "hours_total": round(hours, 2) if hours is not None else None,
            "share": round(share, 3) if t_in else None,
            "so_far": person["so_far"],
            "from": _hm(seg_a) if seg_a and t_in and not arrived_here else None,
            "until": (_hm(seg_b) if seg_b and (t_out or seg_b < now) and not left_here
                      and status not in ("moved_out", "inside", "break") else None),
            "late": person["late"] if arrived_here else None,
            "early_in": person["early_in"] if arrived_here else None,
            "early_out": person["early_out"] if left_here else None,
            "missing": person["missing"] and unit_now == manager_id,
            "moved": moved,
            "pending": [_event_out(ev, units) for ev in pending.get(eid, [])],
            "marks": person["marks"],
            "raw": person["raw"],
        })

    counts = Counter(r["status"] for r in rows)
    came = sum(1 for r in rows if r["in"])
    inside = counts["inside"] + counts["break"]
    missing = sum(1 for r in rows if r["missing"])
    late = sum(1 for r in rows if r["late"])
    early_out = sum(1 for r in rows if r["early_out"])
    pend = sum(1 for ev in events if ev.status == "pending"
               and manager_id in (ev.from_manager_id, ev.to_manager_id))
    outs = [datetime.fromisoformat(r["out_at"]) for r in rows if r["status"] == "left" and r["out_at"]]
    outs += [ev.at for eid in ids for ev in approved.get(eid, [])
             if ev.kind == "move" and ev.from_manager_id == manager_id and ev.at <= now]
    last_out = max(outs) if outs else None

    if close_rec:
        close = {"state": "closed_manual", "at": _iso(close_rec.closed_at.astimezone(TZ).replace(tzinfo=None)
                                                       if close_rec.closed_at else None),
                 "by": close_rec.closed_by_name}
    elif not came:
        close = {"state": "waiting"}
    elif missing:
        close = {"state": "held_missing", "n": missing}
    elif pend:
        close = {"state": "held_pending", "n": pend}
    elif inside:
        close = {"state": "open", "n": inside}
    else:
        at = last_out + timedelta(minutes=CLOSE_AFTER_MIN) if last_out else now
        close = {"state": "closed_auto" if now >= at else "closing", "at": _iso(at),
                 "last_out": _iso(last_out)}

    return {
        "day": day.isoformat(), "today": today.isoformat(), "is_today": day == today,
        "unit": {"id": manager_id, "name": unit["name"], "shift": unit["shift"]},
        "now": _iso(now), "pulled_at": _iso(pulled_at), "directory_at": _iso(dir_at),
        "rows": rows,
        "counts": {"total": len(rows), "came": came, "inside": inside, "left": counts["left"],
                   "absent": counts["absent"], "not_yet": counts["not_yet"], "off": counts["off"],
                   "moved_out": counts["moved_out"], "late": late, "early_out": early_out,
                   "missing": missing,
                   "hours": round(sum(r["hours"] or 0 for r in rows), 1)},
        "close": close,
        "cells": sorted(({"code": c["code"], "id": c["id"]} for c in cells.values()
                         if c["manager_id"] == manager_id), key=lambda c: c["code"]),
        "formula": ({"names": formula["names"], "share": formula["share"]} if formula else None),
        "rules": {"close_after": CLOSE_AFTER_MIN, "missing_after": MISSING_AFTER_MIN,
                  "late_grace": LATE_GRACE_MIN, "early_grace": EARLY_GRACE_MIN},
        "diag": {"employees": len(ids), "report_rows": len(ts),
                 "marks": sum(type_counts.values()), "mark_types": dict(type_counts),
                 "directed": directed,
                 "out_sources": dict(Counter(r["out_src"] for r in rows if r["out_src"]))},
    }


def _event_out(ev: LiveStaffEvent, units: dict) -> dict:
    return {
        "id": ev.id, "day": ev.day.isoformat(), "employee_id": ev.employee_id,
        "worker_name": ev.worker_name, "kind": ev.kind, "at": _hm(ev.at), "at_iso": _iso(ev.at),
        "from_manager_id": ev.from_manager_id, "to_manager_id": ev.to_manager_id,
        "from_unit": (units.get(ev.from_manager_id) or {}).get("name"),
        "to_unit": (units.get(ev.to_manager_id) or {}).get("name"),
        "from_cell": ev.from_cell, "to_cell": ev.to_cell,
        "from_role": ev.from_role, "to_role": ev.to_role,
        "note": ev.note, "status": ev.status,
        "created_by": ev.created_by_name,
        "created_at": ev.created_at.astimezone(TZ).isoformat(timespec="minutes") if ev.created_at else None,
        "decided_by": ev.decided_by_name,
        "decided_at": ev.decided_at.astimezone(TZ).isoformat(timespec="minutes") if ev.decided_at else None,
    }


def events_for(db: Session, day: date, manager_id: Optional[int] = None) -> list[dict]:
    _, units = _registry(db)
    q = db.query(LiveStaffEvent).filter(LiveStaffEvent.day == day)
    if manager_id:
        q = q.filter((LiveStaffEvent.from_manager_id == manager_id)
                     | (LiveStaffEvent.to_manager_id == manager_id))
    return [_event_out(ev, units) for ev in q.order_by(LiveStaffEvent.at, LiveStaffEvent.id).all()]


def meta(db: Session) -> dict:
    """Units with their cells (move targets) and the job titles (role changes)."""
    cells, units = _registry(db)
    by_unit = defaultdict(list)
    for c in cells.values():
        if c["manager_id"]:
            by_unit[c["manager_id"]].append(c["code"])
    jobs: list[str] = []
    cfg = verifix.config(db, with_password=True)
    if cfg["login"] and cfg.get("password") and cfg["filial_id"]:
        try:
            directory, _ = _directory(cfg)
            jobs = sorted({j for j in directory["jobs"].values() if j})
        except verifix.VerifixError:
            jobs = []
    return {
        "units": sorted(({"id": mid, "name": u["name"], "shift": u["shift"],
                          "cells": sorted(by_unit.get(mid, []))} for mid, u in units.items()),
                        key=lambda u: (u["shift"] or 9, u["name"] or "")),
        "jobs": jobs,
    }
