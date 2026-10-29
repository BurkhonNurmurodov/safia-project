"""GET /api/shift-report — «Smena hisoboti», the first block of Overview.

A shift manager's status board: one row per brigadir of their own shift, six
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

«Davomat» is the one column read off Verifix rather than off a page: the stored
live read the minute job keeps (`live_staff.attendance`), never a call to
Verifix from here.
"""
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderConcern, Manager, QualityComplaint
from app.permissions import require_page
from app.routers import production
from app.routers.workers import _py_on_leave
from app.services import (cell_hours, leader_register, live_overview, live_staff,
                          shared_build, shift_report, shift_scope, verifix_live,
                          zagruzka_source)
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.name_map import register_rows, supervisor_match

router = APIRouter(prefix="/api/shift-report", tags=["shift-report"])
log = logging.getLogger(__name__)

# The board runs the «Zagruzka fayli» engine twice per configured unit — ~2 s
# and ~850 queries on production-sized data (measured 2026-10-03), ~4 s on
# production once «Davomat» joined — so every answer is KEPT, keyed by
# everything it depends on (see the key below). The FIGURES are the engine's,
# untouched. An answer is served as it stands for `_CACHE_TTL_S` (the
# staleness the page's own query, `staleTime` 60 s, already accepts); older
# but younger than `_CACHE_STALE_S` it is served AT ONCE while a new one is
# built behind it (`_refresh_later`), so the next refetch has it — unless the
# viewer changed something since it was built (`leader_register.last_write`:
# a brigadir's ПЛАН, a shift manager's concern), who waits for a build that
# started after their write. Older than that, the request builds, sharing one
# build with whoever asks the same at the same time (`shared_build`). Before
# this (the 13 Oct «Server was slow» DM) a 60 s expiry made somebody wait
# ~4 s for the board every minute it was open: /api/shift-report ×13, median
# 3.9 s. Viewers with one scope share an entry (every admin and top-manager on
# «all plants» does). Bounded, in-process, per copy.
_CACHE_TTL_S = 60
_CACHE_STALE_S = 600
_CACHE_MAX = 64
_cache: dict = {}                    # key → (monotonic() the build STARTED, answer)
_cache_lock = threading.Lock()
_flight = shared_build.SharedBuild()
_refresh_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="shift-report")
_refreshing: set = set()


def _cache_get(key):
    with _cache_lock:
        return _cache.get(key)


_forgot = 0.0                        # monotonic() of the last `forget()`


def forget() -> None:
    """Drop every kept answer — a cell's positions moved (services/catalog_follow).
    A build that STARTED before this read the old catalog, so `_cache_put`
    refuses its answer rather than keep it as fresh."""
    global _forgot
    with _cache_lock:
        _forgot = time.monotonic()
        _cache.clear()


def _cache_put(key, started: float, value) -> None:
    now = time.monotonic()
    with _cache_lock:
        if started < _forgot:
            return                   # built over a catalog a move has changed since
        old = _cache.get(key)
        if old is not None and old[0] > started:
            return                   # a build that started later is already kept
        if key not in _cache and len(_cache) >= _CACHE_MAX:
            for k in [k for k, (t, _v) in list(_cache.items()) if now - t > _CACHE_STALE_S]:
                _cache.pop(k, None)
            while len(_cache) >= _CACHE_MAX:
                _cache.pop(next(iter(_cache)), None)
        _cache[key] = (started, value)


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


def _units(db: Session, ids: Optional[list[int]], shift: Optional[int]) -> list:
    # A unit whose загрузка is switched OFF (`managers.zagruzka_on`) is not on
    # the production board and not in the start-load cards.
    q = db.query(Manager).filter(Manager.archived.is_(False), Manager.zagruzka_on.is_(True))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    return q.order_by(Manager.name, Manager.id).all()


def _key(units: list, note, month: str, now, windows) -> tuple:
    """Everything the answer depends on: the units in reach (the scope AND the
    shift filter), the quality month, and each shift's report days — so a new
    shift-day or a new month is a new entry, never a stale one."""
    return (
        tuple(m.id for m in units), note, month,
        tuple((s, *map(str, shift_report.report_days(now, s, windows))) for s in (1, 2, None)),
    )


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
    month, _m_from, _m_to = shift_report.quality_window(now.date())
    if empty_scope(ids):
        return _empty(now, note, month)
    units = _units(db, ids, shift)
    if not units:
        return _empty(now, note, month)
    windows = cell_hours.defaults(db)
    key = _key(units, note, month, now, windows)
    hit = _cache_get(key)
    if hit is not None:
        started, value = hit
        age = time.monotonic() - started
        if age < _CACHE_TTL_S:
            return value
        if age < _CACHE_STALE_S and started > leader_register.last_write(payload):
            _refresh_later(ids, note, shift)
            return value

    def build():
        t0 = time.monotonic()
        value = _compute(db, units, note, now, windows)
        _cache_put(key, t0, value)
        return value

    return _flight.run(key, build, before_wait=db.rollback)


def _empty(now, note, month: str) -> dict:
    return {
        "generated_at": now.isoformat(timespec="seconds"),
        "note": note,
        "quality_month": month,
        "shifts": [],
    }


def _refresh_later(ids: Optional[list[int]], note, shift: Optional[int]) -> None:
    """Build this scope's board again off the request, in a session of its own,
    and keep it under the key its OWN clock gives (a shift-day that turned
    meanwhile is a new entry). One rebuild per scope at a time."""
    rk = (tuple(ids) if ids is not None else None, note, shift)
    with _cache_lock:
        if rk in _refreshing:
            return
        _refreshing.add(rk)

    def go():
        from app.database import SessionLocal
        try:
            with SessionLocal() as s:
                now = live_overview.now_local()
                units = _units(s, ids, shift)
                if not units:
                    return
                windows = cell_hours.defaults(s)
                month = shift_report.quality_window(now.date())[0]
                key = _key(units, note, month, now, windows)
                t0 = time.monotonic()
                _cache_put(key, t0, _compute(s, units, note, now, windows))
        except Exception:  # noqa: BLE001 — the next request builds inline
            log.exception("shift-report: background rebuild failed")
        finally:
            with _cache_lock:
                _refreshing.discard(rk)

    try:
        _refresh_pool.submit(go)
    except RuntimeError:            # shutting down
        with _cache_lock:
            _refreshing.discard(rk)


def _compute(db: Session, units: list, note, now, windows) -> dict:
    """The board for `units` at `now` — every figure from the page that owns it."""
    month, m_from, m_to = shift_report.quality_window(now.date())
    out = _empty(now, note, month)
    unit_ids = [m.id for m in units]

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
    counts = register_rows(
        db.query(QualityComplaint.brigadir, QualityComplaint.place, QualityComplaint.status,
                 func.count(QualityComplaint.id))
        .filter(QualityComplaint.brigadir.isnot(None),
                QualityComplaint.date >= m_from, QualityComplaint.date < m_to,
                or_(QualityComplaint.category.is_(None),
                    QualityComplaint.category != shift_report.SKIP_CATEGORY))
        .group_by(QualityComplaint.brigadir, QualityComplaint.place, QualityComplaint.status)
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
    order = sorted(groups, key=lambda k: (k is None, k or 0))
    days = {s: shift_report.report_days(now, s, windows) for s in order}

    # ── Davomat — each unit's attendance on its shift-day so far: /workers'
    # «Davomat issiqlik xaritasi» figure, counted off the STORED live Verifix
    # read the minute job keeps (`live_staff.attendance` says who is on the
    # list and who came) — never a Verifix call from here. «Today» is the
    # board's own (`report_days`), the shift frame /staff opens a unit on. In a
    # savepoint, and a failure costs the column («—»), never the board.
    att: dict = {}
    with_cells: Optional[set] = None
    try:
        with db.begin_nested():
            cells, _live_units = verifix_live._registry(db)
            with_cells = {c["manager_id"] for c in cells.values() if c["manager_id"]}
            drow = verifix_live._row(db, "dir")
            directory = (drow.data or None) if drow else None
            reads: dict = {}
            for s in order if directory else ():
                day = days[s][0]
                if day not in reads:
                    row = verifix_live._row(db, verifix_live._day_key(day))
                    store = ((row.data or {}).get("emps") or {}) if row else {}
                    reads[day] = live_staff.load(db, day, directory, store) if store else None
                if reads[day] is not None:
                    att.update(live_staff.attendance(
                        reads[day], [m.id for m in groups[s]], _py_on_leave))
    except Exception:  # noqa: BLE001 — the column, never the board
        log.exception("shift-report: the Davomat column could not be read")
        att = {}

    for s in order:
        today, yesterday = days[s]
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
                    shift_report.att_cell(att.get(m.id),
                                          with_cells is None or m.id in with_cells),
                )
                for m in groups[s]
            ],
        })
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
    # A unit whose загрузка is switched OFF (`managers.zagruzka_on`) is not on
    # the production board and not in the start-load cards.
    q = db.query(Manager).filter(Manager.archived.is_(False), Manager.zagruzka_on.is_(True))
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
