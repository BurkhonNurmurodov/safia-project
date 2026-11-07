"""«Kutish yechimlari» — which waiting causes hurt most, who answers for each,
and what they intend to do about it (`/idle-solutions`, beside /downtime).

Nothing is measured here. The minutes are `routers/downtime._downtime`'s own
answer (the page's one computation, headcount-weighted mean per brigadir-day,
stopped half), summed per category over the period; the owner of a category is
`services/idle_scope` (the «Kutish mas'uli» register); this module adds ONE new
fact — the solutions the owners write — in `idle_category_solutions`.

**Who may write.** The person assigned to the category, and admins. Reading
follows `/downtime` (page key `downtime`), including a «Kutish mas'uli»'s own
category lock, applied through the same `idle_scope` calls.

A solution is a small log entry (open → doing → done), never a rewrite of the
previous one, so the history of what was promised stays readable.
"""
import math
from datetime import date, datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import IdleCategorySolution
from app.permissions import _oauth2, require_page
from app.services import action_log, idle_scope

router = APIRouter(prefix="/api/idle-solutions", tags=["idle-solutions"])

TZ = timezone(timedelta(hours=5))   # Tashkent, the platform's wall clock

# «Is the problem solved, or repeating?» — judged by OCCURRENCES (working days on
# which the cause shows up), the BEFORE_DAYS before the solution against every
# day since. These are choices, not rulings — one constant each to move.
BEFORE_DAYS = 28        # history read before the solution (its usual rhythm)
EARLY_DAYS = 3          # fewer calendar days since = a fix cannot be in force yet
MIN_QUIET = 7           # working days without it before «solved» (the floor)
MAX_QUIET = 28          # ... and the ceiling, however rare the cause used to be
QUIET_X = 3             # solved needs QUIET_X × the cause's usual gap quiet
REDUCED_DROP = 50.0     # % fall in occurrences per working day that counts as reduced
PERIOD_MIN = 28         # the Tahlil tab never looks at fewer days: repeating is a question of weeks
UNIT_NOTES = 4          # stop notes served per brigadir under a cause
REPEAT_DAYS = 3         # a cause with no solution on this many days is flagged

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
    """The page's read gate: the /downtime page key, plus top-managers, who hold
    no /downtime access but may read this analysis (read-only, whole plant)."""
    import jwt
    from jwt import PyJWTError as JWTError
    from app.config import settings
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") == "top-manager":
        return payload
    return _downtime_page(token, db)


def _admin_only(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


def _reader_only(payload: dict) -> None:
    """Reading: admins and shift-managers (writes stay admin / the category owner)."""
    if payload.get("role") not in ("admin", "shift-manager", "top-manager"):
        raise HTTPException(status_code=403, detail="Admin only")


def _fmt_dt(v):
    return v.isoformat() if v else None


def _item(r: IdleCategorySolution) -> dict:
    return {
        "id": r.id, "category": r.category, "manager_id": r.manager_id, "event_id": r.event_id, "text": r.text, "status": r.status,
        "author_key": r.author_key, "author_name": r.author_name,
        "created_at": _fmt_dt(r.created_at), "updated_at": _fmt_dt(r.updated_at),
    }


def _may_write(db: Session, payload: dict, category: str) -> bool:
    if payload.get("role") == "admin":
        return True
    viewer = identity.viewer_profile_key(db, payload)
    owner = idle_scope.owners(db).get(category)
    return bool(viewer and owner and viewer == owner)


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
    # Lazy: the downtime router is a sibling router, not a service.
    from app.routers.downtime import _downtime

    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from is after date_to")
    if (date_to - date_from).days + 1 > MAX_DAYS:
        raise HTTPException(status_code=400, detail=f"Period longer than {MAX_DAYS} days")

    out = _downtime(db, payload, date_from, date_to, shift, manager_id, False, factory)
    lock = idle_scope.viewer_categories(db, payload)
    out = idle_scope.narrow_downtime(out, idle_scope.resolve_cats(db, payload, []), lock=lock)

    cat_min: dict[str, float] = {}
    cat_days: dict[str, set] = {}
    cat_units: dict[str, dict[int, float]] = {}
    unit_cat: dict[int, dict[str, float]] = {}
    unit_name: dict[int, dict] = {}
    for r in out.get("rows") or []:
        mid = r.get("manager_id")
        unit_name[mid] = {"manager_id": mid, "manager_name": r.get("manager_name"),
                          "shift": r.get("shift")}
        for c, v in (r.get("by_category") or {}).items():
            v = float(v or 0)
            if v <= 0 or c in EXCLUDED:
                continue
            cat_min[c] = cat_min.get(c, 0.0) + v
            cat_days.setdefault(c, set()).add(r.get("date"))
            cat_units.setdefault(c, {})
            cat_units[c][mid] = cat_units[c].get(mid, 0.0) + v
            unit_cat.setdefault(mid, {})
            unit_cat[mid][c] = unit_cat[mid].get(c, 0.0) + v

    # The brigadirs' own words: the note on every filed stop (/idle-cell),
    # per (category, unit). Read through the bar modal's own reader so the
    # comment shown here is the very row /downtime lists.
    from app.routers.downtime import _cell_detail
    notes: dict[tuple, list] = {}
    for mid in list(unit_name):
        try:
            det = _cell_detail(db, mid, date_from, date_to, True, False, [])
        except Exception:
            continue
        for d, cells_ in (det.get("days") or {}).items():
            for cell in cells_:
                for iv in cell.get("intervals") or []:
                    note = (iv.get("note") or "").strip()
                    notes.setdefault((iv["category"], mid), []).append({
                        "id": iv.get("id"),
                        "date": d, "cell": cell.get("code"), "leader": cell.get("leader"),
                        "start": iv.get("start"), "end": iv.get("end"),
                        "minutes": iv.get("minutes"), "note": note,
                    })
    for lst in notes.values():
        lst.sort(key=lambda n: (n["date"], n["start"] or ""), reverse=True)

    labels = idle_scope.owner_labels(db)
    viewer = identity.viewer_profile_key(db, payload)
    is_admin = payload.get("role") == "admin"
    owner_keys = idle_scope.owners(db)

    sols: dict[str, list] = {}
    for r in (db.query(IdleCategorySolution)
              .order_by(IdleCategorySolution.created_at.desc(),
                        IdleCategorySolution.id.desc()).all()):
        sols.setdefault(r.category, []).append(r)

    total = sum(cat_min.values())
    cats = [c for c in idle_scope.CATEGORIES
            if c not in EXCLUDED and (lock is None or c in set(lock))]
    rows = []
    for c in cats:
        items = sols.get(c, [])
        ranked = sorted(cat_units.get(c, {}).items(), key=lambda kv: -kv[1])
        top = ranked[:TOP_UNITS]
        general = [i for i in items if i.manager_id is None]
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
                events.append({**n, "solutions": [_item(i) for i in es],
                               "state": _state(es)})
            solved = sum(1 for e in events if e["solutions"])
            all_sl = [i for e in events for i in per_event.get(e["id"], [])] + sl
            problems.append({
                **unit_name[m], "minutes": round(v, 1),
                "share": round(100 * v / cat_total, 1) if cat_total else 0.0,
                "days": len({n["date"] for n in nt}) if nt else None,
                "events": events, "events_n": len(nt), "solved_n": solved,
                "notes": [e for e in events if e["note"]][:MAX_NOTES],
                "notes_n": sum(1 for e in events if e["note"]),
                "solutions": [_item(i) for i in sl],
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
            "can_write": is_admin or bool(viewer and owner_keys.get(c) == viewer),
            "problems": problems,
            "problems_n": sum(max(p["events_n"], 1) for p in problems),
            "solved_n": sum(p["solved_n"] for p in problems),
            "solutions": [_item(i) for i in general[:SHOW_LAST]],
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
        "cat_locked": lock,
        "is_admin": is_admin,
    }


def _sol_date(r) -> date:
    return (r.created_at.astimezone(TZ) if r.created_at else datetime.now(TZ)).date()


ORDER = ("repeating", "new", "unanswered", "early", "nodata", "reduced", "solved", "none", "once")


def _days(a: date, b: date):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


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
    """Is each waiting cause SOLVED or REPEATING after its written solution?

    The unit of evidence is an OCCURRENCE — a working day on which the cause
    shows up at all — never its minutes (one long stop must not hide five small
    repeats, nor one big stop hide that it stopped). Minutes ride along as the
    secondary figure. Nothing new is measured: the minutes are `_downtime`'s own
    rows, the stops are `analysis()`'s events.

    Per cause (and per brigadir when a solution is written for one) the newest
    solution is judged by `judge()`:
      * solved    — no occurrence since, for as long as the cause's own rhythm
                    needs (3× its usual gap before, 7–28 working days);
      * repeating — it came back; `relapse` marks a return after a long quiet;
      * reduced   — it still comes back, but at most half as often as before;
      * early     — not enough working days since to say (also: fewer than
                    EARLY_DAYS calendar days, when a fix cannot be in force yet);
      * new       — it never happened before the solution and does now;
      * nodata    — fewer than 5 working days of history before the solution.
    A cause nobody wrote a solution for is `unanswered`. Quiet is counted in the
    WORKING days of the scope (days it has a row), so a weekend is not a cure.
    """
    _reader_only(payload)
    from app.routers.downtime import _downtime

    # A picked day (or any span under PERIOD_MIN) is widened backwards from its end.
    end = date_to or datetime.now(TZ).date()
    start = date_from or end - timedelta(days=13)
    widened = start <= end and (end - start).days + 1 < PERIOD_MIN
    if widened:
        start = end - timedelta(days=PERIOD_MIN - 1)
    base = analysis(date_from=start, date_to=end, shift=shift, factory=factory,
                    manager_id=manager_id, db=db, payload=payload)
    d_from = date.fromisoformat(base["date_from"])
    d_to = date.fromisoformat(base["date_to"])
    # Judged AS OF the end of the period (never later than today): a past period
    # shows the picture at that time, and a solution written after it is unknown.
    asof = min(datetime.now(TZ).date(), d_to)

    sols = (db.query(IdleCategorySolution)
            .order_by(IdleCategorySolution.created_at.desc(), IdleCategorySolution.id.desc())
            .limit(400).all())
    sols = [r for r in sols if r.category not in EXCLUDED and _sol_date(r) <= d_to
            and (not manager_id or r.manager_id is None or r.manager_id in manager_id)]
    wide_from = d_from
    for r in sols:
        wide_from = min(wide_from, _sol_date(r) - timedelta(days=BEFORE_DAYS))
    wide_to = d_to
    wide_from = max(wide_from, wide_to - timedelta(days=MAX_DAYS - 1))
    out = _downtime(db, payload, wide_from, wide_to, shift, manager_id, False, factory)
    lock = idle_scope.viewer_categories(db, payload)
    out = idle_scope.narrow_downtime(out, idle_scope.resolve_cats(db, payload, []), lock=lock)

    # (category, manager, iso day) -> minutes, (category, iso day) -> minutes,
    # and the working days (a row exists) of everybody / of each brigadir
    cm: dict[tuple, float] = {}
    cc: dict[tuple, float] = {}
    wd_all: set = set()
    wd_m: dict = {}
    for r in out.get("rows") or []:
        # `_downtime` spells a row's day «dd.mm.yyyy»; everything here keys on ISO
        raw = str(r.get("date"))[:10]
        try:
            dstr = datetime.strptime(raw, "%d.%m.%Y").date().isoformat()
        except ValueError:
            dstr = raw
        wd_all.add(dstr)
        wd_m.setdefault(r.get("manager_id"), set()).add(dstr)
        for c, v in (r.get("by_category") or {}).items():
            v = float(v or 0)
            if v <= 0 or c in EXCLUDED:
                continue
            cm[(c, r.get("manager_id"), dstr)] = cm.get((c, r.get("manager_id"), dstr), 0.0) + v
            cc[(c, dstr)] = cc.get((c, dstr), 0.0) + v

    def minutes_on(c, mid, k: str) -> float:
        return cc.get((c, k), 0.0) if mid is None else cm.get((c, mid, k), 0.0)

    def span(c, mid, a: date, b: date) -> float:
        return sum(minutes_on(c, mid, d.isoformat()) for d in _days(a, b))

    def occ_days(c, mid, a: date, b: date) -> list:
        return [k for k in (d.isoformat() for d in _days(a, b)) if minutes_on(c, mid, k) > 0]

    def wdays(mid, a: date, b: date) -> int:
        s = wd_all if mid is None else wd_m.get(mid, set())
        return sum(1 for d in _days(a, b) if d.isoformat() in s)

    def judge(c, mid, sol) -> dict:
        sd = _sol_date(sol)
        b0, b1 = max(sd - timedelta(days=BEFORE_DAYS), wide_from), sd - timedelta(days=1)
        a0, a1 = max(sd + timedelta(days=1), wide_from), asof
        ob, oa = occ_days(c, mid, b0, b1), occ_days(c, mid, a0, a1)
        wb = max(wdays(mid, b0, b1), len(ob))
        wa = max(wdays(mid, a0, a1), len(oa))
        rate_b = len(ob) / wb if wb else 0.0
        rate_a = len(oa) / wa if wa else 0.0
        need = MIN_QUIET
        if ob and wb:
            need = min(MAX_QUIET, max(MIN_QUIET, math.ceil(QUIET_X * wb / len(ob))))
        last = oa[-1] if oa else None
        quiet = wdays(mid, (date.fromisoformat(last) + timedelta(days=1)) if last else sd + timedelta(days=1), a1)
        first_gap = (wdays(mid, sd + timedelta(days=1), date.fromisoformat(oa[0]) - timedelta(days=1))
                     if oa else None)
        cal_after = max(0, (a1 - sd).days)
        if wb < 5:
            verdict = "nodata"
        elif cal_after < EARLY_DAYS:
            verdict = "early"
        elif not ob:
            verdict = "new" if oa else "none"
        elif not oa:
            verdict = "solved" if quiet >= need else "early"
        elif wa >= MIN_QUIET and rate_a <= rate_b * (1 - REDUCED_DROP / 100.0):
            verdict = "reduced"
        else:
            verdict = "repeating"
        daily = [round(minutes_on(c, mid, d.isoformat()), 1) for d in _days(b0, a1)]
        return {
            "verdict": verdict, "date": sd.isoformat(), "before_n": len(ob), "before_wd": wb,
            "after_n": len(oa), "after_wd": wa, "after_days": cal_after,
            "rate_before": round(rate_b, 3), "rate_after": round(rate_a, 3),
            "quiet_needed": need, "quiet": quiet, "last_seen": last,
            "relapse": bool(oa) and bool(ob) and first_gap is not None and first_gap >= need,
            "min_before": round(span(c, mid, b0, b1), 1), "min_after": round(span(c, mid, a0, a1), 1),
            "daily": daily, "daily_from": b0.isoformat(), "marker": (sd - b0).days,
        }

    cat_rows = {r["category"]: r for r in base["categories"]}
    # Shown: a cause that happened in the period (under every filter), or one whose
    # solution was written in the period AND that shows up at all under the filters —
    # a filter that leaves a cause no data must hide it, never print it «solved».
    cats = [r["category"] for r in base["categories"] if (r["minutes"] or 0) > 0]
    seen_cats = {k[0] for k in cc}
    for r in sols:
        if r.category not in cats and d_from <= _sol_date(r) <= d_to and r.category in seen_cats:
            cats.append(r.category)

    causes = []
    for c in cats:
        row = cat_rows.get(c) or {}
        problems = [p for p in (row.get("problems") or []) if (p.get("minutes") or 0) > 0]
        scope_sol: dict = {}
        for r in sols:
            if r.category == c:
                scope_sol.setdefault(r.manager_id, r)
        judged: dict = {}
        if None in scope_sol:
            judged[None] = (scope_sol[None], judge(c, None, scope_sol[None]))
        else:
            for mid_, s_ in scope_sol.items():
                judged[mid_] = (s_, judge(c, mid_, s_))
        verdicts = [j["verdict"] for _, j in judged.values()]
        # a brigadir with the same waiting on enough days and no solution of their own
        orphans = [p for p in problems if None not in scope_sol and p["manager_id"] not in scope_sol
                   and len(occ_days(c, p["manager_id"], d_from, d_to)) >= REPEAT_DAYS]
        if orphans and judged:
            verdicts.append("unanswered")
        if judged:
            sol, j = min(judged.values(), key=lambda sj: ORDER.index(sj[1]["verdict"]))
            status = min(verdicts, key=ORDER.index)
        else:
            pd = occ_days(c, None, d_from, d_to)
            # no solution: a cause seen on fewer than REPEAT_DAYS days is not a problem yet
            sol, status = None, ("unanswered" if len(pd) >= REPEAT_DAYS else "once")
            j = {"verdict": "unanswered", "after_n": len(pd), "after_wd": wdays(None, d_from, d_to),
                 "last_seen": pd[-1] if pd else None, "quiet": None, "relapse": False,
                 "daily": [round(minutes_on(c, None, d.isoformat()), 1) for d in _days(d_from, d_to)],
                 "daily_from": d_from.isoformat(), "marker": None}
        units = []
        for p in problems:
            mid = p["manager_id"]
            sol_u = scope_sol.get(mid) or scope_sol.get(None)
            since = _sol_date(sol_u) if sol_u else None
            a0 = since + timedelta(days=1) if since else d_from
            od = occ_days(c, mid, a0, asof if since else d_to)
            cells: dict[str, set] = {}
            recent = []   # the brigadir's own words on their latest stops (newest first)
            sd_u = _sol_date(sol_u).isoformat() if sol_u else None
            for e in p.get("events") or []:
                dd = str(e.get("date"))[:10]
                if dd >= a0.isoformat():
                    cells.setdefault(e.get("cell") or "—", set()).add(dd)
                # what became of THIS stop: answered by its own solution, else by the
                # scope's — a stop after that solution is a repeat (red), one before it
                # is solved (done) or in process (open / doing); nothing written = none
                evs = e.get("solutions") or []
                if evs:
                    mark = "solved" if all(x["status"] == "done" for x in evs) else "doing"
                elif sol_u is None:
                    mark = "none"
                elif dd > sd_u:
                    mark = "repeat"
                else:
                    mark = "solved" if sol_u.status == "done" else "doing"
                recent.append({"date": dd, "cell": e.get("cell"), "minutes": e.get("minutes"),
                               "note": e.get("note") or "", "mark": mark})
            tc = max(cells.items(), key=lambda kv: len(kv[1]), default=(None, set()))
            own = judged.get(mid) if None not in scope_sol else None
            units.append({
                "manager_id": mid, "manager_name": p["manager_name"], "minutes": p["minutes"],
                "days": len(od), "last_seen": od[-1] if od else None,
                "cell": tc[0], "cell_days": len(tc[1]),
                "verdict": own[1]["verdict"] if own else None,
                "covered": sol_u is not None, "since": since.isoformat() if since else None,
                "notes": recent[:UNIT_NOTES],
            })
        units.sort(key=lambda u: (-u["days"], -u["minutes"]))
        sol_out = None
        if sol is not None:
            sol_out = {
                "id": sol.id, "text": sol.text, "status": sol.status, "author_name": sol.author_name,
                "date": _sol_date(sol).isoformat(), "manager_id": sol.manager_id,
                "manager_name": next((p["manager_name"] for p in problems if p["manager_id"] == sol.manager_id), None),
            }
        causes.append({
            "category": c, "minutes": round(float(row.get("minutes") or 0), 1), "status": status,
            "owner": row.get("owner"),
            "j": j, "solution": sol_out, "solutions_n": len([r for r in sols if r.category == c]),
            "units": units, "orphans_n": len(orphans),
            "rethink": bool(sol_out) and sol_out["status"] in ("doing", "done") and j["verdict"] in ("repeating", "new"),
        })
    causes.sort(key=lambda x: (ORDER.index(x["status"]), -(x["j"].get("after_n") or 0), -x["minutes"]))
    counts = {k: sum(1 for x in causes if x["status"] == k) for k in ORDER}
    return {
        "date_from": d_from.isoformat(), "date_to": d_to.isoformat(),
        "before_days": BEFORE_DAYS, "early_days": EARLY_DAYS, "min_quiet": MIN_QUIET,
        "max_quiet": MAX_QUIET, "quiet_x": QUIET_X, "reduced_drop": REDUCED_DROP,
        "repeat_days": REPEAT_DAYS, "widened": widened, "period_min": PERIOD_MIN,
        "causes": causes, "counts": counts,
        "rethink_n": sum(1 for x in causes if x["rethink"]),
    }


class SolutionBody(BaseModel):
    category: str
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


@router.post("")
def add_solution(
    body: SolutionBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime")),
):
    _admin_only(payload)
    if body.category not in idle_scope.CATEGORIES or body.category in EXCLUDED:
        raise HTTPException(status_code=400, detail="unknown_category")
    if not _may_write(db, payload, body.category):
        raise HTTPException(status_code=403, detail="not_category_owner")
    text = _clean_text(body.text)
    status = _clean_status(body.status or "open")
    key = identity.viewer_profile_key(db, payload)
    name = (idle_scope._profile_names(db, [key]).get(key) or {}).get("name") if key else None
    row = IdleCategorySolution(
        category=body.category, manager_id=body.manager_id, event_id=body.event_id, text=text, status=status,
        author_key=key,
        author_name=name or payload.get("full_name") or payload.get("name"))
    db.add(row)
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=body.category,
                      details=[("category", body.category), ("manager_id", body.manager_id), ("event_id", body.event_id),
                               ("status", status)])
    return _item(row)


@router.put("/{solution_id}")
def edit_solution(
    solution_id: int,
    body: SolutionEdit,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime")),
):
    _admin_only(payload)
    row = db.query(IdleCategorySolution).filter(IdleCategorySolution.id == solution_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    if not _may_write(db, payload, row.category):
        raise HTTPException(status_code=403, detail="not_category_owner")
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
    db.commit()
    action_log.enrich(target_kind="idle_category", target_id=row.category,
                      details=[("category", row.category)], changes=changes)
    return _item(row)
