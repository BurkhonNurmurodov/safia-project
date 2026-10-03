"""GET /api/shift-report — «Smena hisoboti», the first block of Overview.

A shift manager's status board: one row per brigadir of their own shift, five
columns, every figure computed by the page that owns it
(`services/shift_report.py` names each one). This router FETCHES and SCOPES;
the service folds.

Scope. The rows are the units the rest of Overview lists
(`factory_scope.scoped_manager_ids` — the plant lock plus the toolbar's
supervisor pick), narrowed to the reach each role already has everywhere else
on the platform — the tiers `routers/concerns.py` `_scope_query` applies:

    admin, top-manager  every unit; both shifts, as two groups
    shift-manager       their shift ∩ their plant (`shift_scope.unit_ids`)
    supervisor, leader  their own unit (reachable only through a page grant)

A shift manager whose profile names no shift reads an EMPTY board with
`note = "no_shift"`, never the whole plant: an empty scope is a real answer.

The period picker beside the table does not reach it. Each column has a fixed
window — today, yesterday, this month, whole time — and its header prints it.
"""
import time
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderConcern, Manager, QualityComplaint
from app.permissions import require_page
from app.routers import production
from app.services import (cell_hours, live_overview, shift_report, shift_scope,
                          zagruzka_source)
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.name_map import supervisor_match

router = APIRouter(prefix="/api/shift-report", tags=["shift-report"])

# The board runs the «Zagruzka fayli» engine twice per configured unit — ~2 s
# and ~850 queries on production-sized data (measured 2026-10-03) — so every
# open of the page waited for all of it and the board painted last. The answer
# is cached for 60 s, keyed by everything it depends on (see the key below).
# The FIGURES are the engine's, untouched: a viewer may read a board up to 60 s
# old, the staleness the page's own query (`staleTime` 60 s) already accepts.
# Viewers with one scope share an entry (every admin and top-manager on «all
# plants» does). Bounded, in-process, per copy.
_CACHE_TTL_S = 60
_CACHE_MAX = 64
_cache: dict = {}


def _cache_get(key):
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    return None


def _cache_put(key, value) -> None:
    now = time.monotonic()
    if len(_cache) >= _CACHE_MAX:
        for k in [k for k, (exp, _v) in list(_cache.items()) if exp <= now]:
            _cache.pop(k, None)
        while len(_cache) >= _CACHE_MAX:
            _cache.pop(next(iter(_cache)), None)
    _cache[key] = (now + _CACHE_TTL_S, value)


def _scope(db: Session, payload: dict, factory: Optional[int],
           manager_id: list) -> tuple[Optional[list[int]], Optional[str]]:
    """(the unit ids in reach — None for «no narrowing» — and a note naming why
    an empty scope is empty, when the reader has to be told)."""
    ids = scoped_manager_ids(db, payload, factory, manager_id)
    role = payload.get("role")
    rid = payload.get("role_id")
    if role == "shift-manager":
        if shift_scope.shift_of(db, rid) is None:
            return [], "no_shift"
        own = set(shift_scope.unit_ids(db, rid))
    elif role in ("supervisor", "leader"):
        own = {int(rid)} if rid else set()
    else:
        return ids, None
    return [m for m in (ids if ids is not None else own) if m in own], None


@router.get("")
def get_shift_report(
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview")),
):
    now = live_overview.now_local()
    ids, note = _scope(db, payload, factory, manager_id)
    # The quality window rides on the payload from the first line, so an empty
    # board still states which month its (absent) closure rates would have been
    # counted over, and the header never has to guess it off the browser clock.
    month, m_from, m_to = shift_report.quality_window(now.date())
    out = {
        "generated_at": now.isoformat(timespec="seconds"),
        "note": note,
        "quality_month": month,
        "shifts": [],
    }
    if empty_scope(ids):
        return out

    q = db.query(Manager).filter(Manager.archived.is_(False))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    units = q.order_by(Manager.name, Manager.id).all()
    if not units:
        return out
    unit_ids = [m.id for m in units]

    # Everything the answer depends on is in the key: the units in reach (the
    # scope AND the shift filter), the quality month, and each shift's report
    # days — so a new shift-day or a new month is a new entry, never a stale one.
    windows = cell_hours.defaults(db)
    key = (
        tuple(unit_ids), note, month,
        tuple((s, *map(str, shift_report.report_days(now, s, windows))) for s in (1, 2, None)),
    )
    cached = _cache_get(key)
    if cached is not None:
        return cached

    # ── O'rt. zagruzka / Bajarilish % — the «Zagruzka fayli» page's own engine,
    # the very call GET /api/production/dashboard makes, so the two figures are
    # its KPI cards' figures by construction. A unit with no production set up
    # has no dashboard to read.
    configured = production._configured_manager_ids(db)

    def totals(mid: int, day) -> Optional[dict]:
        if mid not in configured:
            return None
        return production._build_dashboard(db, mid, day)["totals"]

    # ── Hal qilingan % — the quality register for the CURRENT MONTH
    # (`shift_report.quality_window`, which is also what says why), WITHOUT the
    # hair category (`SKIP_CATEGORY`, ditto), attributed exactly as the Quality
    # page attributes it: «Отв. бригадир» resolved against EVERY live unit (a
    # subset would let the fuzzy matcher hand a row to the wrong unit), over
    # every spelling the register holds.
    #
    # The category test keeps a row whose category is NULL: in SQL `category !=
    # 'hair'` is NULL there, i.e. false, so an uncategorised record would be
    # dropped as though it were hair.
    counts = (
        db.query(QualityComplaint.brigadir, QualityComplaint.status,
                 func.count(QualityComplaint.id))
        .filter(QualityComplaint.brigadir.isnot(None),
                QualityComplaint.date >= m_from, QualityComplaint.date < m_to,
                or_(QualityComplaint.category.is_(None),
                    QualityComplaint.category != shift_report.SKIP_CATEGORY))
        .group_by(QualityComplaint.brigadir, QualityComplaint.status)
        .all()
    )
    live = db.query(Manager).filter(Manager.archived.is_(False)).all()
    match = supervisor_match(live, {b for b, _st, _n in counts if b})
    quality = shift_report.fold_quality(counts, match)

    # ── Ochiq xavotirlar — open, and sitting at the brigadir's own level.
    concerns = dict(
        db.query(LeaderConcern.brigadir_manager_id, func.count(LeaderConcern.id))
        .filter(
            LeaderConcern.brigadir_manager_id.in_(unit_ids),
            LeaderConcern.status.in_(shift_report.OPEN_CONCERN),
            or_(LeaderConcern.level == shift_report.SUPERVISOR_LEVEL,
                LeaderConcern.level.is_(None), LeaderConcern.level == ""),
        )
        .group_by(LeaderConcern.brigadir_manager_id)
        .all()
    )

    groups: dict = {}
    for m in units:
        groups.setdefault(m.shift if m.shift in (1, 2) else None, []).append(m)
    for s in sorted(groups, key=lambda k: (k is None, k or 0)):
        today, yesterday = shift_report.report_days(now, s, windows)
        out["shifts"].append({
            "shift": s,
            "today": today.isoformat(),
            "yesterday": yesterday.isoformat(),
            "rows": [
                shift_report.row(
                    m,
                    shift_report.load_cell(totals(m.id, today)),
                    shift_report.compl_cell(totals(m.id, yesterday)),
                    shift_report.quality_cell(quality.get(m.id)),
                    concerns.get(m.id, 0),
                )
                for m in groups[s]
            ],
        })
    _cache_put(key, out)
    return out


_START_LOAD_MAX_DAYS = 62


@router.get("/start-load")
def get_start_load(
    date_from: date = Query(...),
    date_to: date = Query(...),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview")),
):
    """«Smena boshi Zagruzka» per unit per day — the figure the board's first
    column prints, for the shift dashboard's KPI cards (their day stepper and
    their 7-day trend).

    Read off `zagruzka_source` — the plan minutes (`unit_labor`) and the typed
    «Bugungi fakt» (`unit_people`) the «Zagruzka fayli» page's `avg_load` is
    built from — over `pp_shift_min`, the page's own shift length. NOT gated on
    the day-close and NOT on attendance, exactly as the board is not: the
    figure exists from the moment the plan and the people are typed, which is
    the whole point of «smena boshi». Days before `ZAGRUZKA_FROM` have no such
    figure (the typed pins are not the headcount there) and are absent.
    Scoped as the board is (`_scope`)."""
    if date_to < date_from:
        date_from, date_to = date_to, date_from
    if (date_to - date_from).days + 1 > _START_LOAD_MAX_DAYS:
        raise HTTPException(status_code=400,
                            detail=f"period is capped at {_START_LOAD_MAX_DAYS} days")
    dates = [(date_from + timedelta(days=i)).isoformat()
             for i in range((date_to - date_from).days + 1)]
    out = {"dates": dates, "units": [], "data": {}}

    ids, _note = _scope(db, payload, factory, manager_id)
    if empty_scope(ids):
        return out
    q = db.query(Manager).filter(Manager.archived.is_(False))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    units = q.order_by(Manager.name, Manager.id).all()
    out["units"] = [{"manager_id": m.id, "name": m.name, "shift": m.shift}
                    for m in units]
    lo = zagruzka_source.range_start(date_from, date_to)
    if not units or lo is None:
        return out

    unit_ids = [m.id for m in units]
    labor = zagruzka_source.unit_labor(db, unit_ids, lo, date_to)
    people = zagruzka_source.unit_people(
        zagruzka_source.typed_people(db, unit_ids, lo, date_to))
    shift_min, _pm = production._constants(db)
    for m in units:
        row = {}
        for iso in dates:
            if iso < lo.isoformat():
                continue
            plan, _actual = labor.get((m.id, iso), (0.0, 0.0))
            v = shift_report.start_load(plan, people.get((m.id, iso)), shift_min)
            if v is not None:
                row[iso] = v
        out["data"][str(m.id)] = row
    return out
