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
    shift-manager       every unit, every plant (from 2026-11-04)
    supervisor, leader  their own unit (reachable only through a page grant)

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
from app.models import Attendance, LeaderConcern, Manager
from app.permissions import page_allowed, require_page
from app.routers import production
from app.routers.workers import _py_on_leave
from app.services import (cell_hours, leader_register, live_overview, live_staff,
                          quality_attribution, quality_baseline, shared_build,
                          shift_report,
                          verifix_live, zagruzka_source)
from app.services.factory_scope import empty_scope, scoped_manager_ids

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
    if role in ("supervisor", "leader"):
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


def _key(units: list, note, month: str, now, windows, picked=None) -> tuple:
    """Everything the answer depends on: the units in reach (the scope AND the
    shift filter), the quality month, and each shift's report days — so a new
    shift-day or a new month is a new entry, never a stale one."""
    return (
        tuple(m.id for m in units), note, month, picked,
        tuple((s, *map(str, shift_report.report_days(now, s, windows))) for s in (1, 2, None)),
    )


@router.get("")
def get_shift_report(
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    day: Optional[date] = Query(default=None, alias="date"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview", "shift-daily")),
):
    now = live_overview.now_local()
    # A picked shift-day (the page's day stepper) replaces «today» for every
    # shift; «yesterday» is the day before it. Never later than the plant's date.
    picked = min(day, now.date()) if day else None
    ids, note = _scope(db, payload, factory, manager_id)
    # The quality window rides on the payload from the first line, so an empty
    # board still states the span its (absent) closure rates would have been
    # counted over, and the header never has to guess it off the browser clock.
    # ALL TIME up to the plant's date (`quality_window` says why) — the picked
    # shift-day does not move it.
    month, _m_from, _m_to = shift_report.quality_window(now.date())
    if empty_scope(ids):
        return _empty(now, note, month, picked)
    units = _units(db, ids, shift)
    if not units:
        return _empty(now, note, month, picked)
    windows = cell_hours.defaults(db)
    key = _key(units, note, month, now, windows, picked)
    hit = _cache_get(key)
    if hit is not None:
        started, value = hit
        age = time.monotonic() - started
        if age < _CACHE_TTL_S:
            return value
        if age < _CACHE_STALE_S and started > leader_register.last_write(payload):
            _refresh_later(ids, note, shift, picked)
            return value

    def build():
        t0 = time.monotonic()
        value = _compute(db, units, note, now, windows, picked)
        _cache_put(key, t0, value)
        return value

    return _flight.run(key, build, before_wait=db.rollback)


def _empty(now, note, month: str, picked=None) -> dict:
    return {
        "picked": picked is not None,
        "generated_at": now.isoformat(timespec="seconds"),
        "note": note,
        # "" from 2026-11-13: the column counts all time, and an older bundle
        # captions it with this — no month beats a month nothing was cut by.
        "quality_month": month,
        # the span the quality column WAS counted over, both days inclusive
        "quality_from": shift_report.QUALITY_FROM,
        "quality_to": now.date().isoformat(),
        # the filing day the hover box's «solved x/y» counts from
        "quality_since_from": shift_report.QUALITY_SINCE,
        "shifts": [],
    }


def _refresh_later(ids: Optional[list[int]], note, shift: Optional[int],
                   picked=None) -> None:
    """Build this scope's board again off the request, in a session of its own,
    and keep it under the key its OWN clock gives (a shift-day that turned
    meanwhile is a new entry). One rebuild per scope at a time."""
    rk = (tuple(ids) if ids is not None else None, note, shift, picked)
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
                key = _key(units, note, month, now, windows, picked)
                t0 = time.monotonic()
                _cache_put(key, t0, _compute(s, units, note, now, windows, picked))
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


def _compute(db: Session, units: list, note, now, windows, picked=None) -> dict:
    """The board for `units` at `now` — every figure from the page that owns it."""
    month, m_from, m_to = shift_report.quality_window(now.date())
    out = _empty(now, note, month, picked)
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

    # ── Hal qilingan % — the quality register over ALL TIME
    # (`shift_report.quality_window`, which is also what says why), attributed
    # exactly as the Quality page attributes it: `quality_attribution` — the
    # record's cell on its date, else «Отв. бригадир» resolved against EVERY
    # live unit. Folded twice — every record (hair too, the figure the cell
    # prints) and hair aside (`SKIP_CATEGORY`, for its hover box) — from ONE
    # read and one resolver (`unit_rows_both`).
    q_every, q_kept = quality_attribution.unit_rows_both(
        db, m_from, m_to, shift_report.SKIP_CATEGORY)
    quality = shift_report.fold_quality(q_kept)
    quality_hair = shift_report.fold_quality(q_every)

    # ── «31/55» in the quality cell's hover box — of the records FILED since
    # `shift_report.QUALITY_SINCE` (1 October), hair included, how many are
    # solved. `q_every` already carries each group's date, so it is a second
    # fold of the same read.
    q_since = shift_report.fold_quality(
        r for r in q_every if (r[2] or "") >= shift_report.QUALITY_SINCE)
    # …and without the hair category, for the column's «sochsiz» lane
    q_since_kept = shift_report.fold_quality(
        r for r in q_kept if (r[2] or "") >= shift_report.QUALITY_SINCE)
    # The month's starting list of open records is still TAKEN, though the box
    # no longer prints its count (2026-11-13): a list not taken on its day can
    # never be taken afterwards. Its failure costs nothing here.
    try:
        quality_baseline.keep(now.date())
    except Exception:  # noqa: BLE001
        log.exception("shift-report: quality baseline not taken")

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
    if picked:
        days = {s: (picked, picked - timedelta(days=1)) for s in order}

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

    # ── the day before's actual clock, Verifix's own times as the close stored
    # them. A failure costs the clock line of the tooltip, never the board.
    clocks: dict = {}
    try:
        with db.begin_nested():
            ydays = {days[s][1] for s in order}
            rows = (db.query(Attendance.manager_id, Attendance.date,
                             Attendance.clock_in_out, Attendance.hours_worked)
                    .filter(Attendance.manager_id.in_(unit_ids),
                            Attendance.date.in_(ydays),
                            Attendance.is_supervisor.is_(False))
                    .all())
            by: dict = {}
            for mid, d, raw, h in rows:
                by.setdefault((mid, d), []).append((raw, h))
            for m in units:
                for s in order:
                    if m in groups[s]:
                        clocks[m.id] = shift_report.fold_clock(
                            by.get((m.id, days[s][1]), ()), s)
    except Exception:  # noqa: BLE001
        log.exception("shift-report: the actual clock could not be read")
        clocks = {}

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
                    shift_report.compl_cell(totals(m.id, yesterday), clocks.get(m.id)),
                    shift_report.quality_cell(quality.get(m.id)),
                    concerns.get(m.id, 0),
                    shift_report.att_cell(att.get(m.id),
                                          with_cells is None or m.id in with_cells),
                    shift_report.quality_cell(quality_hair.get(m.id)),
                    shift_report.since_cell(q_since.get(m.id)),
                    shift_report.work_cell(quality_hair.get(m.id), q_since.get(m.id)),
                    shift_report.work_cell(quality.get(m.id), q_since_kept.get(m.id)),
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
    payload: dict = Depends(require_page("overview", "shift-daily")),
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


@router.get("/containers")
def get_containers(
    day: date = Query(...),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview", "shift-daily", "containers")),
):
    """The whole plant's (scope's) container totals for one day — the «Smena
    kunligi» card (2026-10-30, the operator: «total number of each container
    type as a whole, not by supervisor or cells»). Σ over every catalog line
    of every unit in scope of `pp_containers.count(plan, uom, capacity)` — the
    very count the «Pozitsiyalar» table's «soni» columns print, the plan read
    through `zagruzka_source.line_facts` (the Positions table's own resolution,
    the catalog the day had). Every non-archived unit, its загрузка switch
    regardless: a unit outside the загрузка still fills containers. Scoped as
    the board is (`_scope`); `shift` narrows to that shift's units.

    `by_unit` (2026-11-13, the «Konteynerlar» page): the same counts per
    brigadir unit — `[{id, name, shift, totals}]`, units with no count left
    out. Their sum per container IS `totals`."""
    from app.services import pp_containers, zagruzka_source
    keys = pp_containers.keys()
    empty = {"day": day.isoformat(), "totals": {k: None for k in keys},
             "lines": {k: 0 for k in keys}, "units": 0, "by_unit": []}
    ids, _note = _scope(db, payload, factory, manager_id)
    if empty_scope(ids):
        return empty
    q = db.query(Manager.id).filter(Manager.archived.is_(False))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    unit_ids = [r[0] for r in q.all()]
    if not unit_ids:
        return empty
    totals = {k: None for k in keys}
    lines = {k: 0 for k in keys}
    units: set = set()
    per_unit: dict = {}

    def emit(mid, line, wc, qkey, lk, d, qp, qa, pv, av):
        if line is None or not qp:
            return
        for col, k in zip(pp_containers.CONTAINERS, keys):
            n = pp_containers.count(qp, getattr(line, "uom", None), getattr(line, col, None))
            if n is None:
                continue
            totals[k] = (totals[k] or 0) + n
            lines[k] += 1
            units.add(mid)
            u = per_unit.setdefault(mid, {})
            u[k] = u.get(k, 0) + n

    zagruzka_source.line_facts(db, unit_ids, day, day, emit)
    by_unit = []
    if per_unit:
        for m in db.query(Manager).filter(Manager.id.in_(list(per_unit))).all():
            by_unit.append({"id": m.id, "name": m.name, "shift": m.shift,
                            "totals": per_unit[m.id]})
        by_unit.sort(key=lambda u: (-sum(u["totals"].values()), u["name"] or ""))
    return {"day": day.isoformat(), "totals": totals, "lines": lines,
            "units": len(units), "by_unit": by_unit}


# «Konteynerlar — jami» hour by hour (2026-11-12, the operator): admins and
# shift managers only while it is tried out — the same audience as «Soatlik»
# on «Zagruzka fayli» (`HOURLY_ROLES` in Production.jsx).
HOURLY_ROLES = ("admin", "shift-manager")


@router.get("/containers-hourly")
def get_containers_hourly(
    day: date = Query(...),
    shift: Optional[int] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("overview", "shift-daily", "containers")),
):
    """The scope's containers per clock HOUR for one day: Σ over every
    configured unit of `hourly_containers.unit_hours` off the unit's own
    «Zagruzka fayli» dashboard — so each team's hours are exactly what its
    «Soatlik» view shows. Same scope and shift narrowing as `/containers`.
    Kept like the board (`_cache_*`, 60 s): it runs the engine once per unit.

    `by_unit` (2026-11-13, «Konteynerlar»): the same hours per brigadir unit
    — `[{id, name, shift, hours: [{h, counts}], untimed}]`, units with nothing
    left out — so the page can say WHO needs the next hour's containers and
    which units the hours leave out (a unit with no «Zagruzka fayli» set up
    has no timeline and is not here). Summed per hour they ARE `hours`."""
    # Whoever may open «Konteynerlar» (/containers) reads the hours too — the
    # page IS the hours; everyone else stays behind the trial's role gate.
    if payload.get("role") not in HOURLY_ROLES and not page_allowed(db, payload, "containers"):
        raise HTTPException(status_code=403, detail="admins and shift managers only")
    from app.services import hourly_containers
    keys = hourly_containers.KEYS
    # The two shifts' clocks (the platform defaults, `cell_hours`), so the
    # table can show ONE production day split at the shift change.
    shifts = [{"shift": n, "start": a, "end": b}
              for n, (a, b) in sorted(cell_hours.defaults(db).items())]
    empty = {"day": day.isoformat(), "hours": [], "untimed": {}, "keys": keys, "units": 0,
             "shifts": shifts, "by_unit": []}
    ids, _note = _scope(db, payload, factory, manager_id)
    if empty_scope(ids):
        return empty
    q = db.query(Manager.id).filter(Manager.archived.is_(False))
    if ids is not None:
        q = q.filter(Manager.id.in_(ids))
    if shift in (1, 2):
        q = q.filter(Manager.shift == shift)
    configured = production._configured_manager_ids(db)
    unit_ids = sorted(r[0] for r in q.all() if r[0] in configured)
    if not unit_ids:
        return empty
    key = ("containers-hourly", day.isoformat(), tuple(unit_ids))
    got = _cache_get(key)
    if got is not None and time.monotonic() - got[0] < _CACHE_TTL_S:
        return got[1]
    started = time.monotonic()
    hours: dict = {}
    untimed: dict = {}
    units = 0
    per_unit: dict = {}
    for mid in unit_ids:
        try:
            h_map, u_map = hourly_containers.unit_hours(production._build_dashboard(db, mid, day))
        except HTTPException:
            continue
        if h_map or u_map:
            units += 1
            per_unit[mid] = (h_map, u_map)
        for h, e in h_map.items():
            o = hours.setdefault(h, {})
            for k, n in e.items():
                o[k] = o.get(k, 0) + n
        for k, n in u_map.items():
            untimed[k] = untimed.get(k, 0) + n
    by_unit = []
    if per_unit:
        for m in db.query(Manager).filter(Manager.id.in_(list(per_unit))).all():
            h_map, u_map = per_unit[m.id]
            by_unit.append({"id": m.id, "name": m.name, "shift": m.shift,
                            "hours": [{"h": h, "counts": dict(h_map[h])} for h in sorted(h_map)],
                            "untimed": dict(u_map)})
        by_unit.sort(key=lambda u: u["name"] or "")
    out = {"day": day.isoformat(), "keys": keys, "units": units, "untimed": untimed,
           "shifts": shifts, "by_unit": by_unit,
           "hours": [{"h": h, "counts": hours[h]} for h in sorted(hours)]}
    _cache_put(key, started, out)
    return out
