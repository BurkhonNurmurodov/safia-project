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

# «Is a solution working?» — the same problem's waiting, per day, in the WINDOW
# days before the solution was written against the days since (at most WINDOW).
# These are choices, not rulings — one constant each to move.
WINDOW = 14
MIN_AFTER_DAYS = 7      # fewer days since the solution = too early to say
WORKS_DROP = 30.0       # % fall in minutes per day that counts as working
WORSE_RISE = 15.0       # % rise that counts as worse
REPEAT_DAYS = 3         # a reason seen on this many separate days is repeating

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


def _verdict(before: float, after: float, after_days: int) -> tuple:
    """(verdict, change%) — minutes PER DAY before against after."""
    if after_days < MIN_AFTER_DAYS:
        return "early", None
    if before <= 0:
        return ("none" if after <= 0 else "new"), None
    ch = round(100.0 * (after - before) / before, 1)
    if ch <= -WORKS_DROP:
        return "works", ch
    if ch >= WORSE_RISE:
        return "worse", ch
    return "weak", ch


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
    """Is the waiting repeating, and did the written solutions change it?

    Nothing new is measured: the minutes are `_downtime`'s own rows (the page's
    computation), the stops are `analysis()`'s events. Three answers:
    `repeats` — a (cause, brigadir) seen on several separate days / the same cell
    again and again; `weekly` — each cause's minutes per Monday-week; `effect` —
    per written solution, minutes per day before against after it (see `_verdict`).
    """
    _reader_only(payload)
    from app.routers.downtime import _downtime

    base = analysis(date_from=date_from, date_to=date_to, shift=shift, factory=factory,
                    manager_id=manager_id, db=db, payload=payload)
    d_from = date.fromisoformat(base["date_from"])
    d_to = date.fromisoformat(base["date_to"])
    today = datetime.now(TZ).date()

    sols = (db.query(IdleCategorySolution)
            .order_by(IdleCategorySolution.created_at.desc(), IdleCategorySolution.id.desc())
            .limit(400).all())
    sols = [r for r in sols if r.category not in EXCLUDED
            and (not manager_id or r.manager_id is None or r.manager_id in manager_id)]
    wide_from = d_from
    for r in sols:
        wide_from = min(wide_from, _sol_date(r) - timedelta(days=WINDOW))
    wide_to = max(d_to, today)
    wide_from = max(wide_from, wide_to - timedelta(days=MAX_DAYS - 1))
    out = _downtime(db, payload, wide_from, wide_to, shift, manager_id, False, factory)
    lock = idle_scope.viewer_categories(db, payload)
    out = idle_scope.narrow_downtime(out, idle_scope.resolve_cats(db, payload, []), lock=lock)

    # (category, manager, iso day) -> minutes, and (category, iso day) -> minutes
    cm: dict[tuple, float] = {}
    cc: dict[tuple, float] = {}
    for r in out.get("rows") or []:
        dstr = str(r.get("date"))[:10]
        for c, v in (r.get("by_category") or {}).items():
            v = float(v or 0)
            if v <= 0 or c in EXCLUDED:
                continue
            cm[(c, r.get("manager_id"), dstr)] = cm.get((c, r.get("manager_id"), dstr), 0.0) + v
            cc[(c, dstr)] = cc.get((c, dstr), 0.0) + v

    def span(c, mid, a: date, b: date) -> float:
        tot, d = 0.0, a
        while d <= b:
            k = d.isoformat()
            tot += cc.get((c, k), 0.0) if mid is None else cm.get((c, mid, k), 0.0)
            d += timedelta(days=1)
        return tot

    # weekly minutes per cause over the page's period
    weeks: list[str] = []
    d = d_from - timedelta(days=d_from.weekday())
    while d <= d_to:
        weeks.append(d.isoformat())
        d += timedelta(days=7)
    weekly = []
    for row in base["categories"]:
        c = row["category"]
        if row["minutes"] <= 0:
            continue
        vals = []
        for w in weeks:
            w0 = max(date.fromisoformat(w), d_from)
            w1 = min(date.fromisoformat(w) + timedelta(days=6), d_to)
            vals.append(round(span(c, None, w0, w1), 1))
        half = len(vals) // 2
        first, last = sum(vals[:half]), sum(vals[half:])
        trend = "flat"
        if half >= 1 and first > 0:
            ch = 100.0 * (last - first) / first
            trend = "down" if ch <= -WORKS_DROP else ("up" if ch >= WORSE_RISE else "flat")
        # who caused it: the cause's minutes per brigadir, week by week
        by_unit = []
        for p_ in row["problems"]:
            if (p_.get("minutes") or 0) <= 0:
                continue
            mid = p_["manager_id"]
            uvals = []
            for w in weeks:
                w0 = max(date.fromisoformat(w), d_from)
                w1 = min(date.fromisoformat(w) + timedelta(days=6), d_to)
                uvals.append(round(span(c, mid, w0, w1), 1))
            cells: dict[str, float] = {}
            for e in (p_.get("events") or []):
                cells[e.get("cell") or "—"] = cells.get(e.get("cell") or "—", 0) + 1
            top = max(cells.items(), key=lambda kv: kv[1], default=(None, 0))
            by_unit.append({"manager_id": mid, "manager_name": p_["manager_name"], "minutes": p_["minutes"],
                            "values": uvals, "cell": top[0], "stops": len(p_.get("events") or [])})
        by_unit.sort(key=lambda u: -u["minutes"])
        weekly.append({"category": c, "minutes": row["minutes"], "values": vals, "trend": trend,
                       "solutions_n": row["solutions_n"], "by_unit": by_unit})

    # repeating reasons: a (cause, brigadir) on many separate days / one cell again
    repeats = []
    for row in base["categories"]:
        for p in row["problems"]:
            ev = p.get("events") or []
            days = {e["date"] for e in ev}
            by_cell: dict[str, set] = {}
            for e in ev:
                by_cell.setdefault(e.get("cell") or "—", set()).add(e["date"])
            top_cell = max(by_cell.items(), key=lambda kv: len(kv[1]), default=None)
            if len(days) < REPEAT_DAYS and not (top_cell and len(top_cell[1]) >= REPEAT_DAYS):
                continue
            repeats.append({
                "category": row["category"], "manager_id": p["manager_id"],
                "manager_name": p["manager_name"], "minutes": p["minutes"],
                "stops": len(ev), "days": len(days),
                "cell": top_cell[0] if top_cell else None,
                "cell_days": len(top_cell[1]) if top_cell else 0,
                "solved": p["solved_n"], "state": p["state"],
            })
    repeats.sort(key=lambda r: (-r["days"], -r["minutes"]))

    # did each written solution change the waiting?
    effect = []
    for r in sols:
        sd = _sol_date(r)
        b0, b1 = sd - timedelta(days=WINDOW), sd - timedelta(days=1)
        a0, a1 = sd + timedelta(days=1), min(today, sd + timedelta(days=WINDOW))
        a_days = max(0, (a1 - a0).days + 1)
        before = span(r.category, r.manager_id, b0, b1) / WINDOW
        after = (span(r.category, r.manager_id, a0, a1) / a_days) if a_days else 0.0
        verdict, ch = _verdict(before, after, a_days)
        # daily minutes around the solution day, for the "did it repeat" chart
        s0 = b0
        daily = [round(span(r.category, r.manager_id, s0 + timedelta(days=i), s0 + timedelta(days=i)), 1)
                 for i in range((a1 - s0).days + 1)]
        effect.append({
            "daily": daily, "daily_from": s0.isoformat(), "marker": (sd - s0).days,
            "id": r.id, "category": r.category, "manager_id": r.manager_id,
            "manager_name": next((p["manager_name"] for row in base["categories"]
                                  if row["category"] == r.category for p in row["problems"]
                                  if p["manager_id"] == r.manager_id), None),
            "event_id": r.event_id, "text": r.text, "status": r.status,
            "author_name": r.author_name, "date": sd.isoformat(),
            "before": round(before, 1), "after": round(after, 1), "after_days": a_days,
            "change": ch, "verdict": verdict,
            # a solution that is marked done (or in progress) yet changed nothing
            "rethink": verdict in ("weak", "worse") and r.status in ("doing", "done"),
        })
    counts = {k: sum(1 for e in effect if e["verdict"] == k)
              for k in ("works", "weak", "worse", "early", "none", "new")}
    return {
        "date_from": d_from.isoformat(), "date_to": d_to.isoformat(),
        "window": WINDOW, "min_after_days": MIN_AFTER_DAYS,
        "works_drop": WORKS_DROP, "worse_rise": WORSE_RISE, "repeat_days": REPEAT_DAYS,
        "weeks": weeks, "weekly": weekly, "repeats": repeats,
        "effect": effect, "counts": counts,
        "rethink_n": sum(1 for e in effect if e["rethink"]),
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
