"""«Kutish yechimlari» — which waiting causes hurt most, what everybody did about
each filed stop, and whether that worked (`/idle-solutions`, beside /downtime).

Nothing is measured here. The minutes are `routers/downtime._downtime`'s own
answer (the page's one computation, headcount-weighted mean per brigadir-day,
stopped half), summed per category over the period; the stops are the bar
modal's own rows (`_cell_detail`); the owner of a category is
`services/idle_scope` (the «Kutish mas'uli» register). This module adds ONE new
fact — the solutions people write — in `idle_category_solutions`.

**Who may write (2026-11-13).** Everybody who reads the page writes their OWN
solution to a stop they can see — the unit's brigadir, the cause's owner, a
shift- or top-manager, an admin: «what did you do about it». A row belongs to
its author: only they (and an admin) edit it. A cause- or brigadir-wide solution
(no stop) stays the cause owner's and an admin's. Reading follows `/downtime`
(page key `downtime`), including a «Kutish mas'uli»'s own category lock and a
brigadir's own unit.

A solution is a small log entry (open → doing → done), never a rewrite of the
previous one, so the history of what was promised stays readable.
"""
import statistics
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import Cell, CellOjidaniyaInterval, IdleCategorySolution
from app.permissions import _oauth2, require_page
from app.services import action_log, idle_intervals, idle_scope
from app.services.factory_scope import empty_scope, scoped_manager_ids

router = APIRouter(prefix="/api/idle-solutions", tags=["idle-solutions"])

TZ = timezone(timedelta(hours=5))   # Tashkent, the platform's wall clock

# The Tahlil tab's rules — choices, not rulings, one constant each to move.
# «The same problem» is ONE cell waiting on ONE cause again.
HOLD_DAYS = 14          # a done solution «worked» once the problem stayed away this long
REPEAT_DAYS = 3         # one cell, one cause, on this many days = a repeating problem
AFTER_DAYS = 60         # stops read past the period's end, to judge its solutions
MIN_CHART_DAYS = 7      # the daily strip never shows fewer days (utils/chartRange.js)
PEAK_HOURS = 2          # the «when» card names the busiest window of this many hours
TOP_CELLS = 8
TOP_REPEATS = 20

STATUSES = ("open", "doing", "done")
MAX_DAYS = 124
MAX_TEXT = 2000
SHOW_LAST = 30          # solutions served per category, newest first
TOP_UNITS = 5
MAX_NOTES = 8           # brigadir comments served per problem, newest first
# Cleaning (Cat H, «Tozalash») is part of the work, not a waiting cause anybody
# answers for with a solution — left off this page entirely (the operator,
# 2026-11-05). It stays on /downtime and in every figure there.
EXCLUDED = ("Cat H",)
MAX_EVENTS = 100        # filed stops served per (category, brigadir), newest first

# Who opens the page — and, from 2026-11-13, who writes on it.
READER_ROLES = ("admin", idle_scope.OWNER_ROLE, "shift-manager", "top-manager", "supervisor")
# Whose own answer every stop they see waits for: the brigadir of the unit it
# happened in and the owner of its cause. The manager tiers and admins may
# write too; nothing counts their silence.
EXPECTED_ROLES = ("supervisor", idle_scope.OWNER_ROLE)


def _state(rows) -> str:
    """none → no solution yet; else the least finished one wins (open, doing, done)."""
    if not rows:
        return "none"
    st = {r.status for r in rows}
    for s in ("open", "doing"):
        if s in st:
            return s
    return "done"


_downtime_page = require_page("downtime")


def _reader(token: str = Depends(_oauth2), db: Session = Depends(get_db)) -> dict:
    """The page's gate, reading and writing alike: the /downtime page key, plus
    top-managers and supervisors (brigadirs), who hold no /downtime access but
    use this page; a viewer's plant lock still applies through `_downtime`."""
    import jwt
    from jwt import PyJWTError as JWTError
    from app.config import settings
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") in ("top-manager", "supervisor"):
        return payload
    return _downtime_page(token, db)


def _reader_only(payload: dict) -> None:
    """The page's five roles: admins, category owners (their own categories,
    locked by `idle_scope`), shift-managers, top-managers and supervisors (own
    unit). Each of them reads AND writes."""
    if payload.get("role") not in READER_ROLES:
        raise HTTPException(status_code=403, detail="Admin only")


def _fmt_dt(v):
    return v.isoformat() if v else None


def _item(r: IdleCategorySolution, viewer: Optional[str] = None, is_admin: bool = False) -> dict:
    """One solution as the page prints it. `mine` / `can_edit` are the server's
    whole answer to «is this row the reader's» — a row belongs to the authoring
    PROFILE, and one account may hold several."""
    mine = bool(viewer and r.author_key and r.author_key == viewer)
    return {
        "id": r.id, "category": r.category, "manager_id": r.manager_id, "event_id": r.event_id, "text": r.text, "status": r.status,
        "author_key": r.author_key, "author_name": r.author_name,
        "author_role": identity.parse_profile_key(r.author_key)[0],
        "created_at": _fmt_dt(r.created_at), "updated_at": _fmt_dt(r.updated_at),
        "done_at": _fmt_dt(r.done_at),
        "mine": mine, "can_edit": is_admin or mine,
    }


def _may_write(db: Session, payload: dict, category: str) -> bool:
    """A cause- or brigadir-wide solution: the cause's owner, and admins."""
    if payload.get("role") == "admin":
        return True
    viewer = identity.viewer_profile_key(db, payload)
    owner = idle_scope.owners(db).get(category)
    return bool(viewer and owner and viewer == owner)


def _own_unit(payload: dict, manager_id: List[int]) -> List[int]:
    """A supervisor (brigadir) reads ONLY their own unit's problems — whatever
    brigadirs they pick; a supervisor with no unit reads nothing."""
    if payload.get("role") == "supervisor":
        mine = payload.get("role_id")
        return [mine] if mine is not None else [-1]
    return manager_id


def _period(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    if not date_to:
        date_to = datetime.now(TZ).date()
    if not date_from:
        date_from = date_to - timedelta(days=13)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from is after date_to")
    if (date_to - date_from).days + 1 > MAX_DAYS:
        raise HTTPException(status_code=400, detail=f"Period longer than {MAX_DAYS} days")
    return date_from, date_to


def _minute_rows(db: Session, payload: dict, a: date, b: date, shift: Optional[int],
                 manager_id: List[int], factory: Optional[int]) -> tuple[list, Optional[list]]:
    """`_downtime`'s rows over a..b under the viewer's category lock — the
    page's ONE source of minutes. Each row gains `day`, its date as a `date`
    (`_downtime` spells it «dd.mm.yyyy»). Returns (rows, lock)."""
    # Lazy: the downtime router is a sibling router, not a service.
    from app.routers.downtime import _downtime
    out = _downtime(db, payload, a, b, shift, manager_id, False, factory)
    lock = idle_scope.viewer_categories(db, payload)
    out = idle_scope.narrow_downtime(out, idle_scope.resolve_cats(db, payload, []), lock=lock)
    rows = []
    for r in out.get("rows") or []:
        raw = str(r.get("date"))[:10]
        try:
            day = datetime.strptime(raw, "%d.%m.%Y").date()
        except ValueError:
            try:
                day = date.fromisoformat(raw)
            except ValueError:
                continue
        rows.append({**r, "day": day})
    return rows, lock


def _aggregate(rows: list) -> dict:
    """The minute rows folded every way the page reads them."""
    cat_min: dict[str, float] = {}
    cat_days: dict[str, set] = {}
    cat_units: dict[str, dict[int, float]] = {}
    unit_cat: dict[int, dict[str, float]] = {}
    unit_name: dict[int, dict] = {}
    day_min: dict[date, float] = {}
    for r in rows:
        mid = r.get("manager_id")
        unit_name[mid] = {"manager_id": mid, "manager_name": r.get("manager_name"),
                          "shift": r.get("shift")}
        for c, v in (r.get("by_category") or {}).items():
            v = float(v or 0)
            if v <= 0 or c in EXCLUDED:
                continue
            cat_min[c] = cat_min.get(c, 0.0) + v
            cat_days.setdefault(c, set()).add(r["day"])
            cat_units.setdefault(c, {})
            cat_units[c][mid] = cat_units[c].get(mid, 0.0) + v
            unit_cat.setdefault(mid, {})
            unit_cat[mid][c] = unit_cat[mid].get(c, 0.0) + v
            day_min[r["day"]] = day_min.get(r["day"], 0.0) + v
    return {"cat_min": cat_min, "cat_days": cat_days, "cat_units": cat_units,
            "unit_cat": unit_cat, "unit_name": unit_name, "day_min": day_min,
            "total": sum(cat_min.values())}


def _stops(db: Session, unit_ids, a: date, b: date) -> dict[tuple, list]:
    """Every filed stop of the units over a..b, keyed (category, unit), newest
    first. The brigadirs' own words: the note on every filed stop (/idle-cell),
    read through the bar modal's own reader so the comment shown here is the
    very row /downtime lists."""
    from app.routers.downtime import _cell_detail
    out: dict[tuple, list] = {}
    for mid in unit_ids:
        try:
            det = _cell_detail(db, mid, a, b, True, False, [], with_hc=False)
        except Exception:
            continue
        for d, cells_ in (det.get("days") or {}).items():
            for cell in cells_:
                for iv in cell.get("intervals") or []:
                    out.setdefault((iv["category"], mid), []).append({
                        "id": iv.get("id"),
                        "date": d, "cell": cell.get("code"), "cell_id": cell.get("cell_id"),
                        "leader": cell.get("leader"),
                        "start": iv.get("start"), "end": iv.get("end"),
                        "minutes": iv.get("minutes"), "note": (iv.get("note") or "").strip(),
                    })
    for lst in out.values():
        lst.sort(key=lambda n: (n["date"], n["start"] or ""), reverse=True)
    return out


def _solutions(db: Session, event_ids) -> list:
    """The solutions the page can show: every one answering a listed stop, plus
    the older brigadir- and cause-wide rows (no stop) — newest first. The ids go
    as ONE array parameter: with everybody writing, the table grows by the stop."""
    from app.services.leader_bot import _in_ids
    ids = [i for i in event_ids if i is not None]
    cond = IdleCategorySolution.event_id.is_(None)
    if ids:
        cond = or_(cond, _in_ids(IdleCategorySolution.event_id, ids))
    return (db.query(IdleCategorySolution).filter(cond)
            .order_by(IdleCategorySolution.created_at.desc(),
                      IdleCategorySolution.id.desc()).all())


@router.get("/analysis")
def analysis(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(_reader),
):
    _reader_only(payload)
    manager_id = _own_unit(payload, manager_id)
    date_from, date_to = _period(date_from, date_to)

    mrows, lock = _minute_rows(db, payload, date_from, date_to, shift, manager_id, factory)
    agg = _aggregate(mrows)
    cat_min, cat_days, cat_units = agg["cat_min"], agg["cat_days"], agg["cat_units"]
    unit_cat, unit_name, total = agg["unit_cat"], agg["unit_name"], agg["total"]
    notes = _stops(db, list(unit_name), date_from, date_to)

    labels = idle_scope.owner_labels(db)
    viewer = identity.viewer_profile_key(db, payload)
    is_admin = payload.get("role") == "admin"
    owner_keys = idle_scope.owners(db)

    sols: dict[str, list] = {}
    for r in _solutions(db, [n["id"] for lst in notes.values() for n in lst]):
        sols.setdefault(r.category, []).append(r)

    def item(r):
        return _item(r, viewer, is_admin)

    cats = [c for c in idle_scope.CATEGORIES
            if c not in EXCLUDED and (lock is None or c in set(lock))]
    rows = []
    for c in cats:
        items = sols.get(c, [])
        ranked = sorted(cat_units.get(c, {}).items(), key=lambda kv: -kv[1])
        top = ranked[:TOP_UNITS]
        general = [i for i in items if i.manager_id is None and i.event_id is None]
        per_unit: dict[int, list] = {}
        per_event: dict[int, list] = {}
        for i in items:
            if i.event_id is not None:
                per_event.setdefault(i.event_id, []).append(i)
            elif i.manager_id is not None:
                per_unit.setdefault(i.manager_id, []).append(i)
        cat_total = cat_min.get(c, 0.0)
        problems = []
        for m, v in ranked:
            sl = per_unit.get(m, [])
            nt = notes.get((c, m), [])
            events = []
            for n in nt[:MAX_EVENTS]:
                es = per_event.get(n["id"], [])
                events.append({**n, "solutions": [item(i) for i in es],
                               "state": _state(es),
                               # has THIS reader written their own answer to it
                               "mine": any(viewer and i.author_key == viewer for i in es)})
            solved = sum(1 for n in nt if per_event.get(n["id"]))
            mine_n = sum(1 for n in nt
                         if any(viewer and i.author_key == viewer
                                for i in per_event.get(n["id"], [])))
            all_sl = [i for n in nt for i in per_event.get(n["id"], [])] + sl
            problems.append({
                **unit_name[m], "minutes": round(v, 1),
                "share": round(100 * v / cat_total, 1) if cat_total else 0.0,
                "days": len({n["date"] for n in nt}) if nt else None,
                "events": events, "events_n": len(nt), "solved_n": solved, "mine_n": mine_n,
                "notes": [e for e in events if e["note"]][:MAX_NOTES],
                "notes_n": sum(1 for e in events if e["note"]),
                "solutions": [item(i) for i in sl],
                "state": _state(all_sl),
            })
        mins = round(cat_min.get(c, 0.0), 1)
        rows.append({
            "category": c,
            "minutes": mins,
            "share": round(100 * cat_min.get(c, 0.0) / total, 1) if total else 0.0,
            "days": len(cat_days.get(c, ())),
            "units_n": len(cat_units.get(c, {})),
            "top_units": [{**unit_name[m], "minutes": round(v, 1)} for m, v in top],
            "owner": labels.get(c),
            "owner_key": owner_keys.get(c),
            # The cause-wide door (the owner's and an admin's), as it always
            # was; a STOP is answered by everybody — the payload's `can_write`.
            "can_write": is_admin or bool(viewer and owner_keys.get(c) == viewer),
            "problems": problems,
            "problems_n": sum(max(p["events_n"], 1) for p in problems),
            "stops_n": sum(p["events_n"] for p in problems),
            "solved_n": sum(p["solved_n"] for p in problems),
            "mine_n": sum(p["mine_n"] for p in problems),
            "solutions": [item(i) for i in general[:SHOW_LAST]],
            "solutions_n": len(items),
            "state": (items[0].status if items else "none"),
            "open_n": sum(1 for i in items if i.status != "done"),
        })
    rows.sort(key=lambda r: (-r["minutes"], r["category"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i if r["minutes"] > 0 else None

    units = []
    for mid, cs in unit_cat.items():
        t = sum(cs.values())
        units.append({
            **unit_name[mid], "total": round(t, 1),
            "top": [{"category": c, "minutes": round(v, 1)}
                    for c, v in sorted(cs.items(), key=lambda kv: -kv[1])[:3]],
        })
    units.sort(key=lambda u: -u["total"])

    return {
        "date_from": date_from.isoformat(), "date_to": date_to.isoformat(),
        "total": round(total, 1),
        "categories": rows, "units": units,
        "no_owner_n": sum(1 for r in rows if r["minutes"] > 0 and not r["owner"]),
        "no_solution_n": sum(r["problems_n"] - r["solved_n"] for r in rows),
        "problems_n": sum(r["problems_n"] for r in rows),
        "stops_n": sum(r["stops_n"] for r in rows),
        "mine_n": sum(r["mine_n"] for r in rows),
        "cat_locked": lock,
        "is_admin": is_admin,
        # Everybody who reads a stop may answer it; `expects_me` marks the two
        # roles whose own answer each stop on their page waits for.
        "can_write": True,
        "expects_me": payload.get("role") in EXPECTED_ROLES,
    }


# ── Tahlil ────────────────────────────────────────────────────────────────────

def _days(a: date, b: date):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


def _local_day(v) -> Optional[date]:
    return v.astimezone(TZ).date() if v else None


def _done_day(s: IdleCategorySolution) -> Optional[date]:
    """The day a solution became «done» — None while it is open / doing."""
    if s.status != "done":
        return None
    return _local_day(s.done_at or s.updated_at or s.created_at)


def outcome(stop_day: date, sols: list, later: list, asof: date) -> dict:
    """What became of ONE filed stop — the Tahlil tab's five plain answers.

      * unanswered — nobody wrote anything;
      * promised   — written, none of it marked done yet;
      * back       — after it was done, the same cell waited on the same cause
                     again within HOLD_DAYS (`back` = that day);
      * held       — HOLD_DAYS passed without it;
      * watch      — done, HOLD_DAYS not over yet (`left` = days to go).

    `later` are the days the same (cell, cause) was filed again, ascending. The
    clock starts the day the first solution was marked done (never before the
    stop itself), and a repeat on that very day is not held against it — the
    day says nothing about which came first.
    """
    if not sols:
        return {"state": "unanswered"}
    done = [d for d in (_done_day(s) for s in sols) if d]
    if not done:
        return {"state": "promised"}
    since = max(min(done), stop_day)
    until = since + timedelta(days=HOLD_DAYS)
    back = next((d for d in later if since < d <= until), None)
    if back:
        return {"state": "back", "since": since, "back": back}
    if asof >= until:
        return {"state": "held", "since": since}
    return {"state": "watch", "since": since,
            "left": max(1, min(HOLD_DAYS, (until - asof).days))}


def stop_hours(stops: list) -> list:
    """Minutes of stop time falling in each hour of the day (24 buckets). An
    `end` at or before `start` crossed midnight — the platform's clock rule."""
    out = [0.0] * 24
    for s in stops:
        a, b = idle_intervals.to_min(s.get("start")), idle_intervals.to_min(s.get("end"))
        if a is None or b is None:
            continue
        if b <= a:
            b += 1440
        t = a
        while t < b:
            nxt = min(b, (t // 60 + 1) * 60)
            out[(t // 60) % 24] += nxt - t
            t = nxt
    return [round(v, 1) for v in out]


def peak_window(hours: list, span: int = PEAK_HOURS) -> Optional[dict]:
    """The busiest `span` consecutive hours (wrapping past midnight) and their
    share of all stop time — None when nothing was filed."""
    total = sum(hours)
    if total <= 0:
        return None
    best = max(range(24), key=lambda h: (sum(hours[(h + i) % 24] for i in range(span)), -h))
    got = sum(hours[(best + i) % 24] for i in range(span))
    return {"from": best, "to": (best + span) % 24, "share": round(100 * got / total)}


_WORST = ("back", "unanswered", "promised", "watch", "held")


@router.get("/analytics")
def analytics(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(_reader),
):
    """The Tahlil tab: five plain questions about the period on screen.

      1. Is the waiting going down?  — its minutes against the same number of
         days right before it, and the day-by-day strip.
      2. Where does it come from?    — by cause, by brigadir, by cell.
      3. When?                       — the hours of the day and the weekdays the
         stops fall on.
      4. Are the stops answered?     — every stop is in ONE of five states
         (`outcome`), who wrote their own answer, how fast.
      5. Did the solutions work?     — of the answers marked done: the problem
         stayed away for HOLD_DAYS, or the same cell waited on the same cause
         again; and the (cell, cause) pairs that keep repeating.

    Nothing new is measured: minutes are `_downtime`'s rows, stops the bar
    modal's. Two kinds of minutes are never mixed — a cause's and a brigadir's
    are the page's waiting minutes; a cell's and an hour's are the filed stops'
    own lengths, and the payload names them `stop_minutes`.
    """
    _reader_only(payload)
    if payload.get("role") == "supervisor":
        raise HTTPException(status_code=403, detail="Analytics are not open to supervisors")

    d_from, d_to = _period(date_from, date_to)
    n_days = (d_to - d_from).days + 1
    today = datetime.now(TZ).date()
    q_to = d_from - timedelta(days=1)
    q_from = q_to - timedelta(days=n_days - 1)
    strip_from = min(d_from, d_to - timedelta(days=MIN_CHART_DAYS - 1))

    mrows, lock = _minute_rows(db, payload, min(q_from, strip_from), d_to,
                               shift, manager_id, factory)
    cur = _aggregate([r for r in mrows if d_from <= r["day"] <= d_to])
    prev = _aggregate([r for r in mrows if q_from <= r["day"] <= q_to])
    strip_min: dict[date, float] = {}
    for r in mrows:
        if r["day"] >= strip_from:
            for c, v in (r.get("by_category") or {}).items():
                if c not in EXCLUDED and float(v or 0) > 0:
                    strip_min[r["day"]] = strip_min.get(r["day"], 0.0) + float(v)

    # The period's stops, and every later one of the same units — what tells
    # whether a problem came back. Judged as of today, never past AFTER_DAYS.
    stops_to = min(max(today, d_to), d_to + timedelta(days=AFTER_DAYS))
    asof = min(today, stops_to)
    filed = _stops(db, list(cur["unit_name"]), d_from, stops_to)
    in_view = set(c for c in idle_scope.CATEGORIES
                  if c not in EXCLUDED and (lock is None or c in set(lock)))

    again: dict[tuple, list] = {}       # (cell, cause) -> the days it was filed, ascending
    stops: list = []                    # the period's stops, exactly the Muammolar tab's
    for (c, m), lst in filed.items():
        if c not in in_view:
            continue
        for s in lst:
            day = date.fromisoformat(s["date"])
            again.setdefault((s["cell_id"], c), []).append(day)
            if day <= d_to and m in cur["cat_units"].get(c, {}):
                stops.append({**s, "day": day, "category": c, "manager_id": m})
    for lst in again.values():
        lst.sort()

    by_event: dict[int, list] = {}
    for r in _solutions(db, [s["id"] for s in stops]):
        if r.event_id is not None:
            by_event.setdefault(r.event_id, []).append(r)

    labels = idle_scope.owner_labels(db)
    owner_keys = idle_scope.owners(db)
    waits: list = []                    # days from a stop to its first answer
    for s in stops:
        sols = by_event.get(s["id"], [])
        later = [d for d in again.get((s["cell_id"], s["category"]), []) if d > s["day"]]
        s["sols"] = sols
        s["out"] = outcome(s["day"], sols, later, asof)
        s["authors"] = {x.author_key for x in sols if x.author_key}
        if sols:
            first = min(_local_day(x.created_at) or s["day"] for x in sols)
            waits.append(max(0, (first - s["day"]).days))

    def count(rows, state=None):
        return sum(1 for s in rows if state is None or s["out"]["state"] == state)

    funnel = {k: count(stops, k) for k in _WORST}
    funnel["stops"] = len(stops)

    def delta_rows(now: dict, before: dict):
        return sorted(((k, v, before.get(k, 0.0)) for k, v in now.items()), key=lambda x: -x[1])

    total, prev_total = cur["total"], prev["total"]

    by_cause = []
    for c, v, pv in delta_rows(cur["cat_min"], prev["cat_min"]):
        mine = [s for s in stops if s["category"] == c]
        by_cause.append({
            "category": c, "minutes": round(v, 1), "prev_minutes": round(pv, 1),
            "share": round(100 * v / total, 1) if total else 0.0,
            "stops": len(mine), "answered": sum(1 for s in mine if s["sols"]),
            "owner": labels.get(c),
        })

    by_unit = []
    unit_now = {m: sum(cs.values()) for m, cs in cur["unit_cat"].items()}
    unit_before = {m: sum(cs.values()) for m, cs in prev["unit_cat"].items()}
    for m, v, pv in delta_rows(unit_now, unit_before):
        mine = [s for s in stops if s["manager_id"] == m]
        top = max(cur["unit_cat"][m].items(), key=lambda kv: kv[1])[0]
        by_unit.append({
            **cur["unit_name"][m], "minutes": round(v, 1), "prev_minutes": round(pv, 1),
            "share": round(100 * v / total, 1) if total else 0.0,
            "stops": len(mine), "answered": sum(1 for s in mine if s["sols"]),
            # the brigadir's OWN answers — everybody writes their own
            "own": sum(1 for s in mine if f"supervisor:{m}" in s["authors"]),
            "top_category": top,
        })

    cells: dict = {}
    for s in stops:
        k = s["cell_id"]
        a = cells.setdefault(k, {"cell_id": k, "cell": s["cell"], "manager_id": s["manager_id"],
                                 "stops": 0, "days": set(), "stop_minutes": 0.0, "cats": {}})
        a["stops"] += 1
        a["days"].add(s["day"])
        a["stop_minutes"] += float(s["minutes"] or 0)
        a["cats"][s["category"]] = a["cats"].get(s["category"], 0.0) + float(s["minutes"] or 0)
    by_cell = sorted(cells.values(), key=lambda a: (-a["stop_minutes"], -a["stops"]))[:TOP_CELLS]
    by_cell = [{
        "cell_id": a["cell_id"], "cell": a["cell"], "manager_id": a["manager_id"],
        "manager_name": cur["unit_name"].get(a["manager_id"], {}).get("manager_name"),
        "stops": a["stops"], "days": len(a["days"]), "stop_minutes": round(a["stop_minutes"], 1),
        "top_category": max(a["cats"].items(), key=lambda kv: kv[1])[0],
    } for a in by_cell]

    hours = stop_hours(stops)
    weekdays = [{"stop_minutes": 0.0, "stops": 0, "days": 0} for _ in range(7)]
    for d in _days(d_from, d_to):
        weekdays[d.weekday()]["days"] += 1
    for s in stops:
        w = weekdays[s["day"].weekday()]
        w["stop_minutes"] = round(w["stop_minutes"] + float(s["minutes"] or 0), 1)
        w["stops"] += 1

    # Who answers for what: each cause's owner, their stops and their OWN answers.
    owners: dict = {}
    for s in stops:
        key = owner_keys.get(s["category"])
        who = labels.get(s["category"])
        if not key or not who:
            continue
        o = owners.setdefault(key, {"profile_key": key, "name": who.get("name"),
                                    "categories": set(), "stops": 0, "own": 0})
        o["categories"].add(s["category"])
        o["stops"] += 1
        o["own"] += 1 if key in s["authors"] else 0
    order = {c: i for i, c in enumerate(idle_scope.CATEGORIES)}
    owners_out = sorted(({**o, "categories": sorted(o["categories"], key=lambda c: order.get(c, 99))}
                         for o in owners.values()), key=lambda o: (o["own"] - o["stops"], -o["stops"]))

    # One cell waiting on one cause again and again — the place to act. Listed
    # when it was filed on REPEAT_DAYS days, or came back after a done solution.
    pairs: dict = {}
    for s in stops:
        k = (s["cell_id"], s["category"])
        p = pairs.setdefault(k, {"rows": [], "days": set()})
        p["rows"].append(s)
        p["days"].add(s["day"])
    repeats = []
    for (cell_id, c), p in pairs.items():
        rows_ = sorted(p["rows"], key=lambda s: (s["day"], s["start"] or ""))
        back_n = count(rows_, "back")
        if len(p["days"]) < REPEAT_DAYS and not back_n:
            continue
        states = {s["out"]["state"] for s in rows_}
        state = next(k for k in _WORST if k in states)
        last_sol = max((x for s in rows_ for x in s["sols"]),
                       key=lambda x: (x.created_at, x.id), default=None)
        newest = rows_[-1]
        repeats.append({
            "cell_id": cell_id, "cell": newest["cell"], "category": c,
            "manager_id": newest["manager_id"],
            "manager_name": cur["unit_name"].get(newest["manager_id"], {}).get("manager_name"),
            "days": len(p["days"]), "stops": len(rows_),
            "stop_minutes": round(sum(float(s["minutes"] or 0) for s in rows_), 1),
            "answered": sum(1 for s in rows_ if s["sols"]), "back_n": back_n,
            "state": state, "last_date": newest["day"].isoformat(),
            "note": next((s["note"] for s in reversed(rows_) if s["note"]), ""),
            "solution": None if last_sol is None else {
                "text": last_sol.text, "status": last_sol.status,
                "author_name": last_sol.author_name,
                "author_role": identity.parse_profile_key(last_sol.author_key)[0],
                "date": (_local_day(last_sol.created_at) or newest["day"]).isoformat(),
            },
        })
    repeats.sort(key=lambda r: (_WORST.index(r["state"]), -r["back_n"], -r["days"], -r["stop_minutes"]))

    stops_by_day: dict[date, int] = {}
    for s in stops:
        stops_by_day[s["day"]] = stops_by_day.get(s["day"], 0) + 1

    return {
        "date_from": d_from.isoformat(), "date_to": d_to.isoformat(), "days": n_days,
        "prev_from": q_from.isoformat(), "prev_to": q_to.isoformat(),
        "asof": asof.isoformat(), "hold_days": HOLD_DAYS, "repeat_days": REPEAT_DAYS,
        "total": {
            "minutes": round(total, 1), "prev_minutes": round(prev_total, 1),
            "stops": len(stops), "causes": len(by_cause), "units": len(by_unit),
        },
        "daily": [{"day": d.isoformat(), "minutes": round(strip_min.get(d, 0.0), 1),
                   "stops": stops_by_day.get(d, 0) if d >= d_from else None,
                   "in_period": d >= d_from}
                  for d in _days(strip_from, d_to)],
        "by_cause": by_cause, "by_unit": by_unit, "by_cell": by_cell,
        "hours": hours, "peak": peak_window(hours), "weekdays": weekdays,
        "funnel": funnel,
        "speed": {
            "answered": len(waits),
            "median_days": int(statistics.median_low(waits)) if waits else None,
            "same_day": sum(1 for w in waits if w == 0),
        },
        "owners": owners_out,
        "repeats": repeats[:TOP_REPEATS], "repeats_n": len(repeats),
        "cat_locked": lock,
    }


# ── writing ───────────────────────────────────────────────────────────────────

class SolutionBody(BaseModel):
    category: Optional[str] = None
    text: str
    status: Optional[str] = "open"
    manager_id: Optional[int] = None
    event_id: Optional[int] = None


class SolutionEdit(BaseModel):
    text: Optional[str] = None
    status: Optional[str] = None


def _clean_text(text: Optional[str]) -> str:
    t = (text or "").strip()
    if not t:
        raise HTTPException(status_code=400, detail="text_required")
    if len(t) > MAX_TEXT:
        raise HTTPException(status_code=400, detail="text_too_long")
    return t


def _clean_status(s: Optional[str]) -> str:
    if s not in STATUSES:
        raise HTTPException(status_code=400, detail="bad_status")
    return s


def _stop_in_reach(db: Session, payload: dict, body: SolutionBody) -> tuple[str, int]:
    """The (cause, unit) of the filed stop a solution answers — after checking
    this viewer READS that stop on the page. Everybody answers the stops they
    can see and nobody one they cannot: the check asks the page's own reader
    (`_cell_detail`), so «listed» has one meaning for reading and writing — an
    approved stop of the stopped half, in the unit it stood in that day."""
    from app.routers.downtime import _cell_detail
    ev = db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.id == body.event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="stop_not_found")
    if ev.category not in idle_scope.CATEGORIES or ev.category in EXCLUDED:
        raise HTTPException(status_code=400, detail="unknown_category")
    if body.category and body.category != ev.category:
        raise HTTPException(status_code=400, detail="category_mismatch")
    try:
        day = date.fromisoformat(str(ev.date)[:10])
    except ValueError:
        raise HTTPException(status_code=404, detail="stop_not_found")
    unit = body.manager_id
    if unit is None:
        cell = db.query(Cell.manager_id).filter(Cell.id == ev.cell_id).first()
        unit = cell.manager_id if cell else None
    if unit is None:
        raise HTTPException(status_code=404, detail="stop_not_found")

    role = payload.get("role")
    if role == "supervisor" and payload.get("role_id") != unit:
        raise HTTPException(status_code=403, detail="out_of_scope")
    if role == idle_scope.OWNER_ROLE and ev.category not in (
            idle_scope.viewer_categories(db, payload) or []):
        raise HTTPException(status_code=403, detail="not_category_owner")
    scoped = scoped_manager_ids(db, payload, None, [unit])
    if empty_scope(scoped) or (scoped is not None and unit not in scoped):
        raise HTTPException(status_code=403, detail="out_of_scope")

    det = _cell_detail(db, unit, day, day, True, False, [ev.category], with_hc=False)
    listed = any(iv.get("id") == ev.id
                 for cells_ in (det.get("days") or {}).values()
                 for cell in cells_ for iv in cell.get("intervals") or [])
    if not listed:
        raise HTTPException(status_code=404, detail="stop_not_found")
    return ev.category, unit


@router.post("")
def add_solution(
    body: SolutionBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(_reader),
):
    _reader_only(payload)
    if body.event_id is not None:
        category, manager_id = _stop_in_reach(db, payload, body)
    else:
        category, manager_id = body.category, body.manager_id
        if category not in idle_scope.CATEGORIES or category in EXCLUDED:
            raise HTTPException(status_code=400, detail="unknown_category")
        if not _may_write(db, payload, category):
            raise HTTPException(status_code=403, detail="not_category_owner")
    text = _clean_text(body.text)
    status = _clean_status(body.status or "open")
    key = identity.viewer_profile_key(db, payload)
    name = (idle_scope._profile_names(db, [key]).get(key) or {}).get("name") if key else None
    row = IdleCategorySolution(
        category=category, manager_id=manager_id, event_id=body.event_id, text=text, status=status,
        author_key=key,
        author_name=name or payload.get("full_name") or payload.get("name"),
        done_at=datetime.now(timezone.utc) if status == "done" else None)
    db.add(row)
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=category,
                      details=[("category", category), ("manager_id", manager_id), ("event_id", body.event_id),
                               ("status", status)])
    return _item(row, key, payload.get("role") == "admin")


@router.put("/{solution_id}")
def edit_solution(
    solution_id: int,
    body: SolutionEdit,
    db: Session = Depends(get_db),
    payload: dict = Depends(_reader),
):
    _reader_only(payload)
    row = db.query(IdleCategorySolution).filter(IdleCategorySolution.id == solution_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    # A solution is its author's own: they edit it, and an admin.
    key = identity.viewer_profile_key(db, payload)
    is_admin = payload.get("role") == "admin"
    if not (is_admin or (key and row.author_key == key)):
        raise HTTPException(status_code=403, detail="not_author")
    changes = []
    if body.text is not None:
        t = _clean_text(body.text)
        if t != row.text:
            changes.append(("text", "…", "…"))
            row.text = t
    if body.status is not None:
        s = _clean_status(body.status)
        if s != row.status:
            changes.append(("status", row.status, s))
            row.status = s
            # the «did it come back» clock starts when it is done, and starts
            # over if a done row is reopened and done again
            row.done_at = datetime.now(timezone.utc) if s == "done" else None
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=row.category,
                      details=[("category", row.category)], changes=changes)
    return _item(row, key, is_admin)
