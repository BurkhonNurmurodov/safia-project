"""
Worker concerns («Ishchi havotirlari») — the rows behind the leaders' concerns
KPI: the concerns workers file to their cell leader on /cell-concerns.

From 2026-10-19 the page `/worker-concerns` is a TAB of «Liderlar KPI»
(`/leaders-kpi`; the old route redirects). The KPI's per-cell figures ride the
board (`services/leaders_kpi`, which calls this module's own filter and
aggregation — `_apply_scope_and_filters`, `_aggregate`, `_figures` — so the
board and /cell-concerns can never count one filing two ways); what stays here
is the paged REGISTER (`/list`) the tab and its cell dialog read, and
`leader_filings`, which the exam's expected answers are computed from.

THE SOURCE IS THE PLATFORM (from 2026-10-03, the operator's directive). Every
figure here is read from the ``leader_concerns`` rows a WORKER filed on
/cell-concerns — ``worker_name IS NOT NULL``, the one marker of a floor filing
(models.LeaderConcern) — and from nothing else. Until that date the page read
the ~180 per-cell Google sheets the «Liderlar Havotirlar» registry links,
crawled nightly into ``worker_concerns``; the crawl was removed the same day
and the three tables it filled are left in the database, unread by anything.

Every filing is LISTED at whatever level it now sits — /cell-concerns drops a
concern the moment it is uplifted, this register does not. But only what
stayed with the LEADER is held against them (the operator, 2026-10-04: «if
they have uplifted the concern to their supervisor, it shouldn't affect their
rating»). So the statuses are read off two columns:

  uplifted — handed up the chain (brigadir or above), whatever became of it
             after: still open there, or resolved there — the sheets'
             «O'tqazish», on the platform the escalate. Out of every %.
  done     — resolved at the leader step
  doing    — in work at the leader step
  todo     — still waiting at the leader step

``BUCKET`` is that rule as SQL and its only spelling: the filter, every
aggregate, the register and the board read the same expression, so «resolved»
can never mean two things. Every percentage is done ÷ rated, rated = total −
uplifted (``_rated``), computed here as the WHOLE percent printed
(``whole_pct``); «open» is what still waits on the leader (doing + todo). The
concerns KPI's 1–5 score over that % is `services/leaders_kpi.concerns_score`
(HR's bands, the operator's 2026-10-19 ruling).

A concern counts for the CELL'S OWNER — the «Egasi», ``cells.owner_id``, the
leader Verifix seats in the cell — ON THE PERIOD'S LAST DAY (the operator,
2026-10-14: «owner on the last day» gets the whole period), read through
`turnover.cell_map` + `turnover.owned`: the very reading «Kadrlar
qo'nimsizligi» credits a month by. ``_owner`` is that rule as SQL and its only
spelling. The UNIT is still the one a concern was filed under
(``brigadir_manager_id``).

Scoping (the merged page is admin-only until the operator opens it), narrowed
the way /concerns narrows these same rows:

  * admin, top-manager, or a page grant at "all" → everything;
  * shift-manager → the units of their shift ∩ plant (shift_scope);
  * supervisor → their own unit's rows;
  * leader → the concerns of the cells they OWN or RUN («Boshqaruvchi») on the
    period's last day (every profile record that is this person);
  * any other role → nothing.
"""
from __future__ import annotations

import json
from datetime import date as date_cls, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import (Integer, String, case, cast, column, false, func, null, or_,
                        select, values)
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_leader_profile_ids
from app.models import AppSetting, Cell, LeaderConcern, Manager, RoleProfile
from app.permissions import require_page
from app.capabilities import page_scope_is_all
from app.routers.concerns import _no, _shift_unit_ids
from app.services import action_log
from app.services.turnover import cell_map as dated_cells, owned
from app.services.factory_scope import scoped_manager_ids, viewer_factory_id

router = APIRouter(prefix="/api/worker-concerns", tags=["worker-concerns"])

# The page key of «Liderlar KPI» — the concerns tab of the merged page (2026-10-19).
PAGE_KEY = "leaders-kpi"

# Rated concerns a brigadir row needs to be «ranked». No minimum since
# 2026-10-17 (the operator: «there's no limit for low data» — it was 5): a row
# is ranked once it has a %, i.e. one concern the leader kept.
MIN_RANKED = 1

UPLIFTED = "uplifted"

# The plant's wall clock — what «resolved by then» is read on, and what
# «today» is: ONE zone for the SQL day and the Python day (_today).
PLANT_TZ = "Asia/Tashkent"
STATUSES = ("done", "doing", "todo", UPLIFTED)

# «Resolve the plant / brigadir narrowing here» — the default of the
# `units=` argument below. A request that runs several queries over one scope
# resolves it once and hands the answer down (None is itself an answer: no
# narrowing), the way `lock=` is handed down.
_COMPUTE = object()


def _today() -> date_cls:
    """The plant's calendar day, on the same zone the SQL reads `done_at` in."""
    return datetime.now(ZoneInfo(PLANT_TZ)).date()

_LEVEL = func.coalesce(LeaderConcern.level, "supervisor")
# THE status rule (module docstring). Order matters: a concern handed up the
# chain is «uplifted» whatever its status — resolved above or not, it is no
# longer the leader's — and only what stayed at the leader step is told apart
# by its status. A concern sent back down is the leader's again (level moves
# with every escalate and return, never with a status change). An unknown
# stored status reads as «todo», /cell-concerns' own rule.
BUCKET = case(
    (_LEVEL != "leader", UPLIFTED),
    (LeaderConcern.status == "done", "done"),
    (LeaderConcern.status == "doing", "doing"),
    else_="todo",
)
# ── who a concern counts for: its cell's owner on the period's last day ──────
_CELLS_KEY = "worker_concerns.cells"
_OWNER_KEY = "worker_concerns.owner"


def _end(date_to: Optional[date_cls]) -> date_cls:
    """The period's LAST day — the day owners are read on. An open period
    («Barcha vaqt» or no end) ends today."""
    return date_to or _today()


def _cells_on(db: Session, end: date_cls) -> dict[str, dict]:
    """cell code → the cell as `turnover.cell_map` reads it on `end` (unit,
    «Boshqaruvchi», «Egasi», standing or not) — the one reading both leader
    KPI pages list owners by. Read once per day per request."""
    cache = db.info.setdefault(_CELLS_KEY, {})
    got = cache.get(end)
    if got is None:
        got = {c["code"]: c for c in dated_cells(db, end).values() if c.get("code")}
        cache[end] = got
    return got


def _owner(db: Session, end: date_cls):
    """THE attribution (module docstring): the profile id that owns the
    concern's cell on `end` (`turnover.owned` — a cell standing that day), as
    one SQL expression — a scalar subquery over this request's owners, so it
    composes into any filter, aggregate or count without a join to forget."""
    key = (_OWNER_KEY, end)
    got = db.info.get(key)
    if got is not None:
        return got
    rows = [(code, c["owner_id"]) for code, c in _cells_on(db, end).items() if owned(c)]
    if not rows:
        expr = cast(null(), Integer)
    else:
        own = values(column("code", String), column("owner", Integer),
                     name="wc_own").data(rows)
        expr = (select(own.c.owner).where(own.c.code == LeaderConcern.cell_code)
                .limit(1).scalar_subquery())
    db.info[key] = expr
    return expr


# The register's order: newest filing first, the register number breaking a
# day's ties — the order /cell-concerns lists the same rows in.
_ORDER = {
    "date_asc": (LeaderConcern.entry_date.asc(), LeaderConcern.seq.asc().nullsfirst(),
                 LeaderConcern.id.asc()),
    "date_desc": (LeaderConcern.entry_date.desc(), LeaderConcern.seq.desc().nullslast(),
                  LeaderConcern.id.desc()),
}


# ── scoping ──────────────────────────────────────────────────────────────────

def _filed(query):
    """A concern a WORKER filed — at any level (module docstring)."""
    return query.filter(LeaderConcern.worker_name.isnot(None))


def _owned_by(db: Session, leader_ids: list[int], end: date_cls):
    """The rows that count for these leader profiles — the concerns of the
    cells they own on `end` (`_owner`). The Lider filter reads it."""
    return _owner(db, end).in_(leader_ids) if leader_ids else false()


def _led_by(db: Session, leader_ids: list[int], end: date_cls):
    """A LEADER's own rows: the concerns of every cell they OWN or RUN
    («Boshqaruvchi») on `end`, standing that day (the operator, 2026-10-14:
    «they can see the results of the cells they own and they manage»)."""
    ids = set(leader_ids or [])
    codes = [code for code, c in _cells_on(db, end).items()
             if not c.get("archived") and ids & {c.get("owner_id"), c.get("leader_id")}]
    return LeaderConcern.cell_code.in_(codes) if codes else false()


def leader_filings(db: Session, leader_ids: list[int],
                   date_from: Optional[date_cls], date_to: Optional[date_cls]):
    """What a LEADER's own page reads over a period, for a caller that holds
    the profile rather than a session: the exam's expected answers (tasks 40
    and 41, services/exam_check) are computed from exactly this, so the number
    a leader reads off the page and the one they are marked against agree."""
    query = _filed(db.query(LeaderConcern)).filter(_led_by(db, leader_ids, _end(date_to)))
    if date_from:
        query = query.filter(LeaderConcern.entry_date >= date_from)
    if date_to:
        query = query.filter(LeaderConcern.entry_date <= date_to)
    return query


def _viewer_lock(db: Session, payload: dict, sees_all: Optional[bool] = None
                 ) -> tuple[Optional[list], Optional[list]]:
    """THE viewer lock, as data: (units, leaders). None = not narrowed on that
    axis; a list = narrowed to it, and an EMPTY list is a real answer — nothing
    matches. The concern rows and the leader roster both apply it, so «which
    leaders may this viewer see» has one spelling for the two. Resolved ONCE
    per request and handed to every query that needs it (`lock=`): a leader's
    lock costs several lookups, and /stats asks twice (period + comparison)."""
    role = payload.get("role")
    if role in ("admin", "top-manager"):
        return None, None
    if sees_all is None:
        sees_all = page_scope_is_all(db, payload, PAGE_KEY)
    if sees_all:
        return None, None
    if role == "supervisor":
        return [payload.get("role_id")], None
    if role == "shift-manager":
        return _shift_unit_ids(db, payload.get("role_id")), None
    if role == "leader":
        # Every profile RECORD that is this person, through THE resolver — the
        # token's own (unit, name) names nobody once it outlives a rename.
        return None, viewer_leader_profile_ids(db, payload)
    return [], None


def _within(column, ids: Optional[list]):
    """``column IN ids``, with an empty list matching nothing."""
    return column.in_(ids) if ids else false()


def _viewer_scope(db: Session, payload: dict, query, lock=None,
                  end: Optional[date_cls] = None):
    """The viewer lock on the concern rows, before any filter: a query
    parameter must never widen it. A leader's cells are the ones they own or
    run on `end`, the period's last day."""
    units, leaders = lock if lock is not None else _viewer_lock(db, payload)
    if units is not None:
        query = query.filter(_within(LeaderConcern.brigadir_manager_id, units))
    if leaders is not None:
        query = query.filter(_led_by(db, leaders, end or _today()))
    return query


def _apply_scope_and_filters(
    db: Session, payload: dict, *,
    date_from: Optional[date_cls], date_to: Optional[date_cls],
    factory: Optional[int], manager_id: list[int],
    leader_id: list[int], cell: list[str], status: list[str],
    q: Optional[str] = None, lock=None, units=_COMPUTE,
):
    """One filter builder for every read endpoint, so the KPI table, the
    charts, the register and the export can never disagree about what «the
    current scope» means."""
    end = _end(date_to)
    query = _viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock, end)

    # The plant and the brigadir pick compose (factory_scope); a row filed
    # under no unit is reachable only from «All factories», never padded onto
    # a plant it may not belong to.
    if units is _COMPUTE:
        units = scoped_manager_ids(db, payload, factory, manager_id)
    if units is not None:
        query = query.filter(_within(LeaderConcern.brigadir_manager_id, units))
    if leader_id:
        query = query.filter(_owned_by(db, leader_id, end))
    if cell:
        query = query.filter(LeaderConcern.cell_code.in_([c.strip() for c in cell]))
    # «deferred» is the sheet era's key for the same act (their «O'tqazish»):
    # a filter saved under it, or sent by an older bundle, still means it.
    wanted = [s for s in (UPLIFTED if s == "deferred" else s for s in status)
              if s in STATUSES]
    if status:
        query = query.filter(BUCKET.in_(wanted) if wanted else false())
    if date_from:
        query = query.filter(LeaderConcern.entry_date >= date_from)
    if date_to:
        query = query.filter(LeaderConcern.entry_date <= date_to)
    needle = (q or "").strip()
    if needle:
        like = f"%{needle}%"
        conds = [
            LeaderConcern.concern_text.ilike(like),
            LeaderConcern.worker_name.ilike(like),
            LeaderConcern.cell_code.ilike(like),
            # The cell owner's name — the one the register prints.
            _owner(db, end).in_(select(RoleProfile.id).where(RoleProfile.name.ilike(like))),
        ]
        digits = needle.lstrip("№#").strip()
        if digits.isdigit() and len(digits) <= 9:
            conds.append(LeaderConcern.seq == int(digits))     # the «№» column
        query = query.filter(or_(*conds))
    return query


def _filter_params(
    date_from: Optional[date_cls] = Query(None),
    date_to: Optional[date_cls] = Query(None),
    factory: Optional[int] = Query(None),
    manager_id: list[int] = Query(default=[]),
    leader_id: list[int] = Query(default=[]),
    cell: list[str] = Query(default=[]),
    status: list[str] = Query(default=[]),
) -> dict:
    _check_range(date_from, date_to)
    return {"date_from": date_from, "date_to": date_to, "factory": factory,
            "manager_id": manager_id, "leader_id": leader_id, "cell": cell,
            "status": status}


def _check_range(date_from: Optional[date_cls], date_to: Optional[date_cls]) -> None:
    """A period that ends before it starts is a mistake, not an empty period —
    answered as one, in words the page can show."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail={
            "code": "range_reversed", "message": "date_from must be on or before date_to"})


# ── names ────────────────────────────────────────────────────────────────────

def _leader_names(db: Session, ids) -> dict[int, str]:
    """profile id → the leader's CURRENT name (renames stay live); the row's
    own snapshot is the caller's fallback for a profile since deleted."""
    ids = sorted({i for i in ids if i})
    if not ids:
        return {}
    return {pid: name for pid, name in
            db.query(RoleProfile.id, RoleProfile.name).filter(RoleProfile.id.in_(ids))}


def _units(db: Session, ids) -> dict[int, Manager]:
    ids = sorted({i for i in ids if i})
    if not ids:
        return {}
    return {m.id: m for m in db.query(Manager).filter(Manager.id.in_(ids))}


def _named(names: dict, key, snapshot: Optional[str]) -> str:
    return names.get(key) or (snapshot or "")


# ── aggregation (ONE pass, shared by /stats, /leaders and the export) ────────

def _agg_cols(db: Session, end: date_cls) -> tuple:
    """The columns one aggregation pass reads — the leader is the cell's OWNER
    on the period's last day (`_owner`); whom it was filed to rides along only
    for the name snapshot of an owner whose profile is gone."""
    return (LeaderConcern.entry_date, BUCKET, LeaderConcern.worker_name,
            LeaderConcern.brigadir_manager_id, LeaderConcern.brigadir_name,
            LeaderConcern.cell_code, _owner(db, end), LeaderConcern.leader_profile_id,
            LeaderConcern.leader_name)


def whole_pct(done: int, total: int) -> Optional[int]:
    """THE whole percent of ``done`` out of ``total`` — rounded half UP from the
    raw counts, exactly once. The page prints this integer (``pct0`` on every
    payload) and the concerns KPI is scored by it: Python's ``round`` rounds
    halves to EVEN (5 of 8 read 62% here and 63% on screen), and rounding the
    one-decimal figure a second time made 17 of 19 read 90%."""
    return (200 * done + total) // (2 * total) if total else None


def _zero() -> dict:
    return {s: 0 for s in STATUSES}


def _pct(done: int, total: int) -> Optional[float]:
    return round(done * 100 / total, 1) if total else None


def _rated(v: dict) -> int:
    """What a % is taken over: every concern that stayed at the leader step —
    the total less what was handed up (module docstring)."""
    return sum(v.get(s) or 0 for s in STATUSES) - (v.get(UPLIFTED) or 0)


def _open(v: dict) -> int:
    """What still waits on the LEADER — an uplifted concern is not theirs."""
    return (v.get("doing") or 0) + (v.get("todo") or 0)


def _figures(v: dict) -> dict:
    """The derived counts every aggregate row carries, from ONE rule."""
    r = _rated(v)
    return {"rated": r, "open": _open(v), "pct": _pct(v.get("done") or 0, r),
            "pct0": whole_pct(v.get("done") or 0, r)}


def _aggregate(db: Session, rows, lo: Optional[date_cls], hi: Optional[date_cls],
               end: date_cls) -> dict:
    """KPI · daily · per brigadir · per cell · per leader, from one row walk.

    ``rows`` may reach further back than ``lo`` (the trend chart's 7-day
    widening): only the daily series reads the widened part, every other
    figure keeps the exact range the reader picked."""
    kpi, daily = _zero(), {}
    workers: set[str] = set()
    brig: dict = {}
    cells: dict = {}
    leaders: dict = {}
    unit_ids, leader_ids = set(), set()
    snap_unit, snap_leader = {}, {}

    unit_leaders: dict = {}
    for d, st, worker, mid, bname, code, lid, fid, fname in rows:
        # The filing's own name snapshot names the owner only where the owner
        # is whom it was filed to.
        lname = fname if lid and lid == fid else None
        daily.setdefault(d, _zero())[st] += 1
        if (lo and d < lo) or (hi and d > hi):
            continue
        kpi[st] += 1
        if worker:
            # The name is free text (cell_concerns): folded only for case and
            # spacing, never into a guess about who is who.
            workers.add(" ".join(worker.lower().split()))
        brig.setdefault(mid, _zero())[st] += 1
        if lid:
            unit_leaders.setdefault(mid, set()).add(lid)
        if mid:
            unit_ids.add(mid)
            snap_unit.setdefault(mid, bname)
        cell = cells.setdefault(code or "", {**_zero(), "by_leader": {}})
        cell[st] += 1
        if lid:
            cell["by_leader"][lid] = cell["by_leader"].get(lid, 0) + 1
        if lid:
            leader_ids.add(lid)
            if lname:
                snap_leader.setdefault(lid, lname)
            g = leaders.setdefault(lid, {**_zero(), "units": set(), "cells": set()})
            g[st] += 1
            if mid:
                g["units"].add(mid)
            if code:
                g["cells"].add(code)

    units = _units(db, unit_ids)
    lnames = _leader_names(db, leader_ids)

    def unit_name(mid) -> str:
        m = units.get(mid)
        return (m.name if m else None) or snap_unit.get(mid) or ""

    total = sum(kpi.values())
    by_brigadir = []
    for mid, v in brig.items():
        m = units.get(mid)
        t = sum(v.values())
        f = _figures(v)
        by_brigadir.append({
            "name": unit_name(mid) or "—", "manager_id": mid,
            "shift": m.shift if m else None, "factory_id": m.factory_id if m else None,
            "total": t, **v, **f,
            "leaders": len(unit_leaders.get(mid, ())), "ranked": f["rated"] >= MIN_RANKED,
        })
    by_brigadir.sort(key=lambda r: -r["total"])

    # A cell is named by its owner on the period's last day — the person its
    # concerns count for — and falls back to whom most of them counted for.
    on_end = _cells_on(db, end)
    top_cells = []
    for code, v in cells.items():
        t = sum(v[s] for s in STATUSES)
        c = on_end.get(code) or {}
        cid, live_leader = c.get("id"), (c.get("owner") if owned(c) else None)
        # A cell nobody owns now is named after the owner most of its concerns
        # counted for (then the lowest id) — the same name on every request.
        top = min(v["by_leader"].items(), key=lambda kv: (-kv[1], kv[0]))[0] if v["by_leader"] else None
        leader = live_leader or (_named(lnames, top, snap_leader.get(top)) if top else "")
        top_cells.append({"code": code or "—", "cell_id": cid, "leader": leader,
                          "total": t, "open": _open(v),
                          **{s: v[s] for s in STATUSES}})
    top_cells.sort(key=lambda r: (-r["open"], -r["total"], r["code"]))

    by_leader = []
    for lid, g in leaders.items():
        t = sum(g[s] for s in STATUSES)
        counts = {s: g[s] for s in STATUSES}
        by_leader.append({
            "leader_id": lid,
            "leader": _named(lnames, lid, snap_leader.get(lid)) or "—",
            "brigadirs": sorted(n for n in (unit_name(m) for m in g["units"]) if n),
            "cells": sorted(g["cells"], key=lambda v: (len(v), v)),
            "total": t, **counts, **_figures(counts),
        })
    by_leader.sort(key=lambda r: -r["total"])

    return {
        "kpi": {**kpi, "total": total, **_figures(kpi), "workers": len(workers)},
        "daily": daily,
        "by_brigadir": by_brigadir,
        "top_cells": top_cells,
        # Per cell code, the period's counts — what the board's concerns KPI
        # reads (services/leaders_kpi); per owner, the same rows folded by person.
        "cells": cells,
        "leaders": by_leader,
    }


def _cell_ids(db: Session, codes) -> dict[str, int]:
    """cell code → cells.id, for the page's links onto /cells/:id. A code the
    register has never heard of has no id and is printed as plain text."""
    codes = sorted({c for c in codes if c})
    if not codes:
        return {}
    return {code: cid for cid, code in
            db.query(Cell.id, Cell.verifix_code).filter(Cell.verifix_code.in_(codes))}


def _register_rows(db: Session, items) -> list[dict]:
    """The register's wire shape — one row per filing, with what the detail
    view needs to say where an uplifted concern sits now. `items` are
    (concern, bucket, cell owner on the period's last day): the page names a
    concern by its cell's OWNER alone (the operator, 2026-10-14, «owner
    only») — `leader` IS the owner, `cell_owner` repeats it for a tab still
    open on an older bundle. `owner` is the WORKER who wrote it."""
    items = list(items)
    lnames = _leader_names(db, [c.leader_profile_id for c, _, _ in items]
                           + [o for _, _, o in items])
    units = _units(db, (c.brigadir_manager_id for c, _, _ in items))
    cids = _cell_ids(db, (c.cell_code for c, _, _ in items))
    out = []
    for c, st, oid in items:
        m = units.get(c.brigadir_manager_id)
        owner = (_named(lnames, oid, c.leader_name if oid == c.leader_profile_id else None)
                 if oid else None)
        out.append({
            "id": c.id, "no": _no(c),
            "d": c.entry_date.isoformat() if c.entry_date else None,
            "cell": c.cell_code, "cell_id": cids.get(c.cell_code),
            "leader": owner,
            "leader_id": oid,
            "cell_owner": owner,
            "cell_owner_id": oid,
            "owner": c.worker_name, "text": c.concern_text,
            "st": st, "status": c.status, "level": c.level or "supervisor",
            "category": c.category,
            "brigadir": (m.name if m else None) or c.brigadir_name,
            "done_on": c.completion_date.isoformat() if c.completion_date else None,
        })
    return out


@router.get("/list")
def get_list(
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    sort: str = Query("date_desc"),
    open_only: bool = Query(False),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """The paginated register. The full concern text rides along — 50 rows a
    page keeps the payload phone-friendly without a second per-row fetch.
    ``open_only`` keeps what nobody has resolved yet — a leader's own «with the
    brigadir» list, where «uplifted» alone would list what was resolved above."""
    end = _end(flt["date_to"])
    query = _apply_scope_and_filters(db, payload, **flt, q=q)
    if open_only:
        query = query.filter(func.coalesce(LeaderConcern.status, "") != "done")
    total = query.count()
    items = (query.with_entities(LeaderConcern, BUCKET, _owner(db, end))
             .order_by(*(_ORDER.get(sort) or _ORDER["date_desc"]))
             .offset((page - 1) * page_size).limit(page_size).all())
    return {"total": total, "page": page, "page_size": page_size,
            "rows": _register_rows(db, items)}
