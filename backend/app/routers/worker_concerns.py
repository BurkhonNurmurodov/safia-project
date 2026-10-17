"""
Worker-concerns («Ishchi havotirlari») analytics API — the leaders' KPI over
the concerns workers file to their cell leader.

THE SOURCE IS THE PLATFORM (from 2026-10-03, the operator's directive). Every
figure here is read from the ``leader_concerns`` rows a WORKER filed on
/cell-concerns — ``worker_name IS NOT NULL``, the one marker of a floor filing
(models.LeaderConcern) — and from nothing else. Until that date the page read
the ~180 per-cell Google sheets the «Liderlar Havotirlar» registry links,
crawled nightly into ``worker_concerns``. The floor moved to /cell-concerns on
2026-09-06, the sheets were never switched off, and this page went on reporting
them. The crawl was removed the same day (the operator: «get rid of that
sheet»); the three tables it filled — ``worker_concerns``,
``worker_concern_sync``, ``worker_concern_sheet_state`` — were left in the
database, unread by anything.

Every filing is LISTED here at whatever level it now sits — /cell-concerns
drops a concern the moment it is uplifted, this page does not. But only what
stayed with the LEADER is held against them (the operator, 2026-10-04: «if
they have uplifted the concern to their supervisor, it shouldn't affect their
rating»). So the page's statuses are read off two columns:

  uplifted — handed up the chain (brigadir or above), whatever became of it
             after: still open there, or resolved there — the sheets'
             «O'tqazish», on the platform the escalate. Out of every %.
  done     — resolved at the leader step
  doing    — in work at the leader step
  todo     — still waiting at the leader step

``BUCKET`` is that rule as SQL and its only spelling: the filter, every
aggregate, the register and the export read the same expression, so
«resolved» can never mean two things on one page. Every percentage is
done ÷ rated, rated = total − uplifted (``_rated``), computed here; «open» is
what still waits on the leader (doing + todo).

A concern counts for the CELL'S OWNER — the «Egasi», ``cells.owner_id``, the
leader Verifix seats in the cell — ON THE PERIOD'S LAST DAY (the operator,
2026-10-14: «owner on the last day» gets the whole period), read through
`turnover.cell_map` + `turnover.owned`: the very reading «Kadrlar
qo'nimsizligi» credits a month by, so for one period the two pages name the
same owners and the same cells. ``_owner`` is that rule as SQL and its only
spelling: the leader filter, every aggregate, the register and the export
read it. The UNIT is still the one a concern was filed under
(``brigadir_manager_id``).

The ranking is one row PER CELL (the operator, 2026-10-14: «rank per cell (one
row for the cell) but do not include the ones without owner»): every cell
that has an owner on the period's last day and stands on it, in the view,
concerns or not (``_scope_cells``), named by its owner. Every owner is ranked
— the «Lider o'rnida» rule is gone (same day: «every owner is ranked») — once
ONE rated concern stands behind the cell (the operator, 2026-10-17: «there's
no limit for low data» — it took 5 until then); a cell whose every concern was
escalated has no % and is listed apart. A leader who owns no cell is on no row. Concerns that land in no
row — a cell with no owner, or one outside the view — surface as one explicit
«unassigned» bucket: counted, never ranked.

Scoping (the page opens to supervisor + leader by default), narrowed the way
/concerns narrows these same rows:

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

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
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
from app.services.worker_concerns_export import build_worker_concerns_workbook, whole_pct
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/worker-concerns", tags=["worker-concerns"])

PAGE_KEY = "worker-concerns"

# KPI traffic-light bands (admin-editable on the page; AppSetting-backed).
BANDS_SETTING = "worker_concern_bands"
DEFAULT_BANDS = {"green": 80, "yellow": 50}

# Rated concerns a row needs to be ranked. No minimum since 2026-10-17 (the
# operator: «there's no limit for low data» — it was 5): a row is ranked once
# it has a %, i.e. one concern the leader kept. A row whose every concern was
# escalated has none and is listed apart, unranked.
MIN_RANKED = 1
# A period shorter than this many days grades nobody: its newest concerns have
# not had the time to be resolved, so every leader would read red on the first
# days of a month. /meta serves it to the page; the workbook applies it too.
SHORT_PERIOD_DAYS = 7

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


def get_bands(db: Session) -> dict:
    row = db.query(AppSetting).filter_by(key=BANDS_SETTING).first()
    if row:
        try:
            v = json.loads(row.value)
            g, y = int(v.get("green")), int(v.get("yellow"))
            if 0 < y < g <= 100:
                return {"green": g, "yellow": y}
        except (ValueError, TypeError):
            pass
    return dict(DEFAULT_BANDS)


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


def _scope_cells(db: Session, payload: dict, *, end: date_cls, factory: Optional[int] = None,
                 manager_id: Optional[list[int]] = None, leader_id: Optional[list[int]] = None,
                 cell: Optional[list[str]] = None, lock=None, units=_COMPUTE) -> list[dict]:
    """The ranking's rows before any figure: every OWNED cell on `end`
    (`turnover.owned`) in the view, concerns or not. The cell's brigadir ON
    `end` is what the viewer lock and the plant / brigadir pick narrow (a cell
    with no brigadir only under «All factories», as on «Kadrlar
    qo'nimsizligi»); a leader viewer reads the cells they own or run; the
    Lider pick narrows the owners, the Yacheyka pick the codes."""
    lock_units, lock_leaders = lock if lock is not None else _viewer_lock(db, payload)
    picked = scoped_manager_ids(db, payload, factory, manager_id or []) if units is _COMPUTE else units
    mine = set(lock_leaders or [])
    want_l = set(leader_id or [])
    want_c = {c.strip() for c in cell or []}
    out = []
    for code, c in _cells_on(db, end).items():
        if not owned(c):
            continue
        mid = c.get("manager_id")
        if lock_units is not None and mid not in lock_units:
            continue
        if lock_leaders is not None and not (mine & {c.get("owner_id"), c.get("leader_id")}):
            continue
        if picked is not None and mid not in picked:
            continue
        if want_l and c["owner_id"] not in want_l:
            continue
        if want_c and code not in want_c:
            continue
        out.append(c)
    return out


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
        # Per cell code, the period's counts — what the ranking rows read
        # (`_cell_rows`); per owner, the same rows folded by person.
        "cells": cells,
        "leaders": by_leader,
    }


def _cell_key(v: str):
    return (len(v), v)


def _cell_rows(cells: list[dict], agg_cells: dict) -> tuple[list[dict], Optional[dict]]:
    """THE ranking: one row per OWNED cell in the view (`_scope_cells`), its
    figures the concerns filed in it over the period, named by its owner on
    the period's last day — concerns or not. A cell is ``ranked`` once
    MIN_RANKED (one) rated concern stands behind it; every owner is ranked (no
    Verifix-kind rule since 2026-10-14). Concerns that land in no row — a cell
    with no owner, or one outside the view — are the «unassigned» bucket, so
    the rows and it add up to the headline. → (rows, unassigned or None)."""
    rows = []
    for c in cells:
        v = agg_cells.get(c["code"]) or {}
        counts = {s: v.get(s, 0) for s in STATUSES}
        f = _figures(counts)
        brig = c.get("brigadir")
        rows.append({
            "key": c["code"], "cell": c["code"], "cell_id": c.get("id"),
            "leader_id": c["owner_id"], "leader": c.get("owner") or "—",
            "manager_id": c.get("manager_id"), "brigadir": brig,
            # The shape a tab still open on an older bundle reads (one leader
            # row per cell, ranked like any leader).
            "cells": [c["code"]], "brigadirs": [brig] if brig else [],
            "kind": "leader", "owner": True,
            "total": sum(counts.values()), **counts, **f,
            "ranked": f["rated"] >= MIN_RANKED,
        })
    seen = {r["cell"] for r in rows}
    ua = _zero()
    for code, v in agg_cells.items():
        if code not in seen:
            for s in STATUSES:
                ua[s] += v.get(s, 0)
    total = sum(ua.values())
    return rows, ({**ua, "total": total, **_figures(ua)} if total else None)


def _counts(rows: list[dict]) -> dict:
    """«N ta egasi · M ta yacheyka» — the ranking's size, the pair «Kadrlar
    qo'nimsizligi» prints for the same period."""
    return {"owners": len({r["leader_id"] for r in rows}), "cells": len(rows)}


def _ranking_order(rows: list[dict]) -> list[dict]:
    """The ranking's DEFAULT order — ranked cells by their exact share
    resolved (best first, more concerns first on a tie), then the cells with
    no % (every concern escalated), then the cells with none — the page's groups.
    The file follows the order the page SENDS (`_in_order`); this is only for
    a request that sent none, or for a row the page did not list."""
    def key(r):
        t, rated = r["total"], r.get("rated") or 0
        code = (len(r["cell"]), r["cell"])
        if t and r["ranked"]:
            return (0, -(r["done"] / rated), -rated, code)
        if t:
            return (1, 0, -t, code)
        return (2, 0, 0, code)
    return sorted(rows, key=key)


def _row_key(r: dict) -> str:
    """A ranking row's key on the wire — its cell code. The page sends the
    same key (`rankKey`) for its on-screen order."""
    return str(r.get("key") or r.get("cell") or "")


def _in_order(rows: list[dict], order: list[str]) -> list[dict]:
    """The leaders in the order the reader's screen lists them. Names tie-break
    by the viewer's own alphabet and collation in the browser, which no server
    sort can reproduce — so the page sends its order and the file follows it;
    a row the page did not list goes after, in the default order."""
    if not order:
        return _ranking_order(rows)
    pos = {k: i for i, k in enumerate(order)}
    known = sorted((r for r in rows if _row_key(r) in pos), key=lambda r: pos[_row_key(r)])
    return known + _ranking_order([r for r in rows if _row_key(r) not in pos])


def _cell_ids(db: Session, codes) -> dict[str, int]:
    """cell code → cells.id, for the page's links onto /cells/:id. A code the
    register has never heard of has no id and is printed as plain text."""
    codes = sorted({c for c in codes if c})
    if not codes:
        return {}
    return {code: cid for cid, code in
            db.query(Cell.id, Cell.verifix_code).filter(Cell.verifix_code.in_(codes))}


def _first_filing(db: Session, payload: dict, lock=None) -> Optional[date_cls]:
    """The first day anything was filed in this viewer's scope — before it
    nothing was being recorded. ONE floor for the page's «records start on …»
    notice (/meta) and for whether the comparison window had anything to say
    (_previous)."""
    return (_viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock, _today())
            .with_entities(func.min(LeaderConcern.entry_date)).scalar())


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """Filter options + KPI bands — one boot call for the page. The options
    are what THIS viewer can read (their locks applied, no filter): the units
    and owners of their concerns plus every owned cell in view, because a cell
    or a name the ranking shows must be one the filters can pick. Owners are
    read on TODAY (`_owner`, `_scope_cells`) — /meta knows no period; the
    Lider filter then picks by the owner on the period's last day."""
    sees_all = page_scope_is_all(db, payload, PAGE_KEY)
    lock = _viewer_lock(db, payload, sees_all)
    today = _today()
    base = _viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock, today)
    # ONE pass over the viewer's filings, grouped by everything the options
    # need — the units, the leaders, the cells, the count and the first day
    # are all read off these groups (a few hundred rows, not the filings). The
    # owner is an expression, so it is grouped on through a subquery.
    sub = base.with_entities(
        LeaderConcern.id.label("id"), LeaderConcern.entry_date.label("d"),
        LeaderConcern.cell_code.label("code"), _owner(db, today).label("lid"),
        LeaderConcern.leader_profile_id.label("fid"), LeaderConcern.leader_name.label("fname"),
        LeaderConcern.brigadir_manager_id.label("mid")).subquery()
    groups = (db.query(sub.c.code, sub.c.lid, sub.c.fid, sub.c.fname, sub.c.mid,
                       func.count(sub.c.id), func.min(sub.c.d))
              .group_by(sub.c.code, sub.c.lid, sub.c.fid, sub.c.fname, sub.c.mid)
              .all())
    total = sum(g[5] for g in groups)
    first = _first_filing(db, payload, lock)
    unit_ids = {g[4] for g in groups if g[4]}
    lnames = _leader_names(db, (g[1] for g in groups))
    leader_opts: dict[int, str] = {}
    # A leader's units: the ones the concerns that counted for them name, plus
    # the units of the cells they own (else of their profile) — what the Lider
    # list is narrowed by under a brigadir pick.
    leader_units: dict[int, set] = {}
    for code, lid, fid, fname, mid, _n, _d in groups:
        if not lid:
            continue
        name = lnames.get(lid) or (fname if fid == lid else None)
        if name:
            leader_opts.setdefault(lid, name)
        if mid:
            leader_units.setdefault(lid, set()).add(mid)
    owned_cells = _scope_cells(db, payload, end=today, lock=lock, units=None)
    for c in owned_cells:
        lid, mid = c["owner_id"], c.get("manager_id")
        leader_opts.setdefault(lid, c.get("owner") or "—")
        if mid:
            leader_units.setdefault(lid, set()).add(mid)
            unit_ids.add(mid)
    # A cell's units and leaders, from the filings that name it — the same
    # rows a cell pick narrows, so the Yacheyka list cascades under a
    # brigadir or leader pick without offering a cell that would empty the page
    # — and from who owns it now, so every cell the table names is pickable.
    cell_of: dict[str, dict] = {}

    def note(code, lid, mid):
        c = cell_of.setdefault(code, {"units": set(), "leaders": set(), "pairs": set()})
        if mid:
            c["units"].add(mid)
        if lid:
            c["leaders"].add(lid)
        # Both together: a leader who moved units keeps their old filings under
        # the old unit, so «this leader» and «this unit» separately would offer
        # a cell their combination never touched.
        c["pairs"].add((lid or 0, mid or 0))

    for code, lid, mid in {(g[0], g[1], g[4]) for g in groups}:
        if code:
            note(code, lid, mid)
    for c in owned_cells:
        note(c["code"], c["owner_id"], c.get("manager_id"))
    cells = sorted(cell_of, key=_cell_key)
    units = _units(db, unit_ids)

    role = payload.get("role")
    leaders = sorted(({"id": k, "name": v, "units": sorted(leader_units.get(k, ()))}
                      for k, v in leader_opts.items()),
                     key=lambda r: r["name"].lower())
    return {
        "source": "cell-concerns",
        "total": total,
        "bands": get_bands(db),
        "min_ranked": MIN_RANKED,
        "short_days": SHORT_PERIOD_DAYS,
        "is_admin": role == "admin",
        "lock_own_unit": role == "supervisor" and not sees_all,
        "lock_own_leader": role == "leader" and not sees_all,
        "locked_factory_id": viewer_factory_id(db, payload),
        "supervisors": sorted(
            ({"id": m.id, "name": m.name, "shift": m.shift, "factory_id": m.factory_id}
             for m in units.values()),
            key=lambda m: m["name"] or "",
        ),
        "leader_opts": leaders,
        "cells": [{"code": c, "units": sorted(cell_of[c]["units"]),
                   "leaders": sorted(cell_of[c]["leaders"]),
                   "pairs": sorted([list(p) for p in cell_of[c]["pairs"]])} for c in cells],
        # The first day anything was filed in this viewer's scope — what an
        # empty period earlier than it is told («records start on …»).
        "first_date": first.isoformat() if first else None,
        # What a tab still open on the sheet-era bundle reads to decide it has
        # data at all; it names the leaders and nothing else as strings.
        "leaders": [r["name"] for r in leaders],
        "can_refresh": False,
        "sync": {"last_synced": None, "ok": True, "message": None, "row_count": total,
                 "invalid_dates": 0, "failed_sheets": 0, "failures": [], "running": False,
                 "progress_done": 0, "progress_total": 0,
                 "sweep": {"ok": True, "code": None, "detail": "", "url": None, "skipped": 0}},
    }


@router.get("/stats")
def get_stats(
    chart_from: Optional[date_cls] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """KPI cards + daily trend + per-brigadir and per-cell breakdowns.

    ``chart_from`` (≤ date_from) widens ONLY the daily series so the trend
    chart honors the platform's 7-day minimum window while the KPI numbers
    keep the exact range the user picked (utils/chartRange.js contract)."""
    lock = _viewer_lock(db, payload)
    units = scoped_manager_ids(db, payload, flt["factory"], flt["manager_id"])
    wide = dict(flt)
    if chart_from and (not wide["date_from"] or chart_from < wide["date_from"]):
        wide["date_from"] = chart_from
    end = _end(flt["date_to"])
    rows = (_apply_scope_and_filters(db, payload, **wide, lock=lock, units=units)
            .with_entities(*_agg_cols(db, end)).all())
    agg = _aggregate(db, rows, flt["date_from"], flt["date_to"], end)
    return {
        # `undated_in_scope` is the sheet era's unreadable date; a filing
        # always carries its day, so it is 0 — kept for an older bundle.
        "kpi": {**agg["kpi"], "undated_in_scope": 0},
        "prev": _previous(db, payload, flt, lock, units),
        "daily": [{"d": d.isoformat(), **v} for d, v in sorted(agg["daily"].items())],
        "by_brigadir": agg["by_brigadir"],
        "top_cells": agg["top_cells"][:12],
    }


def _previous(db: Session, payload: dict, flt: dict, lock=None,
              units=_COMPUTE) -> Optional[dict]:
    """The same scope over the period of the same length that ends the day
    before this one starts — what the headline's change is measured against.

    It is read AS IT STOOD at the same distance past its own end as the current
    period is past its end today: a concern of the earlier window counts as
    resolved only if it was resolved by then. Read as it stands today instead,
    the earlier window has had a month longer to be resolved, and every period
    would compare worse than the one before it. «By then» is the server's own
    stamp (`done_at`, on the plant's clock) — `completion_date` is typed by
    whoever closes the concern and only stands in where no stamp exists.

    None — no comparison at all — wherever one would mislead:
      * no closed period (an open range has no «before»);
      * a status filter, which judges rows by TODAY's status, so it cannot
        describe the earlier window as it stood;
      * an earlier window starting before the first filing in the VIEWER's
        scope (`_first_filing`, the day the page's «records start on …» names)
        — nothing was being recorded then, so «nothing was filed» is not what
        it would mean. Measured with no brigadir / leader / cell pick: a cell
        whose first concern came later really had none before it, and the
        line says so;
      * dates outside what a date can hold."""
    lo, hi = flt["date_from"], flt["date_to"]
    if not lo or not hi or hi < lo or flt.get("status"):
        return None
    today = _today()
    hi = min(hi, today)              # a range reaching into the future ends today
    if hi < lo:
        return None
    try:
        days = (hi - lo).days + 1
        p_hi = lo - timedelta(days=1)
        p_lo = p_hi - timedelta(days=days - 1)
        as_of = p_hi + timedelta(days=(today - hi).days)
    except OverflowError:
        return None
    first = _first_filing(db, payload, lock)
    if first is None or p_lo < first:
        return None
    # A resolved concern that carries no date of its own resolution cannot be
    # shown to have been resolved BY THEN, so it is not counted as such (the
    # filing day would credit it with a resolution on the day it was raised).
    # Rated the way the period itself is (BUCKET): what was handed up is out
    # of both halves, read off where each concern sits today.
    resolved_on = func.coalesce(func.date(func.timezone(PLANT_TZ, LeaderConcern.done_at)),
                                LeaderConcern.completion_date)
    rated = BUCKET != UPLIFTED
    done_then = rated & (LeaderConcern.status == "done") & (resolved_on <= as_of)
    total, done = (
        _apply_scope_and_filters(db, payload, **{**flt, "date_from": p_lo, "date_to": p_hi},
                                 lock=lock, units=units)
        .with_entities(func.count(case((rated, LeaderConcern.id))),
                       func.count(case((done_then, LeaderConcern.id))))
        .one()
    )
    return {"from": p_lo.isoformat(), "to": p_hi.isoformat(), "as_of": as_of.isoformat(),
            "total": total, "done": done, "pct": _pct(done, total),
            "pct0": whole_pct(done, total)}


@router.get("/leaders")
def get_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """The KPI table: one row per OWNED cell in the view, named by its owner
    on the period's last day — concerns or not (`_cell_rows`). Concerns that
    land in no row fold into one explicit «unassigned» summary — counted,
    displayed, never ranked. `counts` is the ranking's size, «N ta egasi · M
    ta yacheyka», the pair «Kadrlar qo'nimsizligi» prints for the period."""
    lock = _viewer_lock(db, payload)
    units = scoped_manager_ids(db, payload, flt["factory"], flt["manager_id"])
    end = _end(flt["date_to"])
    rows = (_apply_scope_and_filters(db, payload, **flt, lock=lock, units=units)
            .with_entities(*_agg_cols(db, end)).all())
    agg = _aggregate(db, rows, flt["date_from"], flt["date_to"], end)
    cells = _scope_cells(db, payload, end=end, factory=flt["factory"],
                         manager_id=flt["manager_id"], leader_id=flt["leader_id"],
                         cell=flt["cell"], lock=lock, units=units)
    out, unassigned = _cell_rows(cells, agg["cells"])
    return {
        "rows": out,
        "counts": _counts(out),
        "end": end.isoformat(),
        # The cells the rows name → their register ids, for the page's links.
        "cell_ids": {r["cell"]: r["cell_id"] for r in out if r.get("cell_id")},
        "bands": get_bands(db),
        "min_ranked": MIN_RANKED,
        "unassigned": unassigned,
        "undated": 0,
    }


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


class WcExportFilters(BaseModel):
    """The EFFECTIVE filter set — the scope modal's «filtered / whole period»
    choice is already resolved client-side into plain filters, so the export
    never needs a second copy of that decision."""
    date_from: Optional[date_cls] = None
    date_to: Optional[date_cls] = None
    factory: Optional[int] = None
    manager_id: list[int] = []
    leader_id: list[int] = []
    cell: list[str] = []
    status: list[str] = []
    q: Optional[str] = None
    sort: str = "date_desc"


def _scope_line(f: "WcExportFilters") -> str:
    """The narrowings that produced the file, as one sentence — only the ones
    actually applied, so «who pulled what data» reads at a glance."""
    parts = []
    for key in ("date_from", "date_to", "factory", "q"):
        v = getattr(f, key, None)
        if v:
            parts.append(f"{key}={v}")
    for key in ("manager_id", "leader_id", "cell", "status"):
        vals = getattr(f, key, None) or []
        if vals:
            parts.append(f"{key}={','.join(str(v) for v in vals)}")
    parts.append(f"sort={f.sort}")
    return " · ".join(parts)[:1000]


class WcExportBody(BaseModel):
    """Presentation comes from the page (labels, sheet names, meta lines —
    already in the viewer's language); the data is re-queried HERE, because the
    register is server-paginated and the file must carry ALL matching rows."""
    filename: Optional[str] = None
    title: str = "Worker concerns"
    subtitle: Optional[str] = None
    caption: Optional[str] = None
    filters: WcExportFilters = Field(default_factory=WcExportFilters)
    sheets: dict[str, str] = {}
    labels: dict[str, Any] = {}
    status_labels: dict[str, str] = {}
    # The scope strip of the overview and ranking sheets — the KPI's scope,
    # which the status pick and the search do not narrow …
    meta: list[dict[str, Any]] = []
    # … and the register sheet's, which they do. Absent (an older tab), the
    # register prints `meta`.
    register_meta: list[dict[str, Any]] = []
    # The leaders as the screen orders them (`_row_key` per row); empty → the
    # default ranking order.
    leader_order: list[str] = []


@router.post("/export.xlsx")
def export_excel(
    request: Request,
    body: WcExportBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """Multi-sheet Excel report of the page (Obzor · Liderlar KPI · Reyestr).

    Everything is re-queried through the same ``_apply_scope_and_filters`` the
    page's own endpoints use, so viewer locks hold no matter what the body
    claims, and all three sheets agree about what «the current scope» means. A
    browser session downloads the file; inside Telegram it lands in the
    caller's private chat (app/xlsx_delivery.py)."""
    f = body.filters
    _check_range(f.date_from, f.date_to)
    flt = {"date_from": f.date_from, "date_to": f.date_to, "factory": f.factory,
           "manager_id": f.manager_id, "leader_id": f.leader_id, "cell": f.cell,
           "status": f.status}
    lock = _viewer_lock(db, payload)
    units = scoped_manager_ids(db, payload, f.factory, f.manager_id)
    # The overview and the ranking are the KPI, which a status pick would
    # redefine (pick «done» and every leader reads 100%) — the page offers the
    # status filter on its register only, and so does the file.
    kpi_flt = {**flt, "status": []}
    scope = dict(factory=f.factory, manager_id=f.manager_id, leader_id=f.leader_id,
                 cell=f.cell, lock=lock, units=units)
    end = _end(f.date_to)
    rows = (_apply_scope_and_filters(db, payload, **kpi_flt, lock=lock, units=units)
            .with_entities(*_agg_cols(db, end)).all())
    agg = _aggregate(db, rows, f.date_from, f.date_to, end)
    cell_rows, unassigned = _cell_rows(_scope_cells(db, payload, end=end, **scope), agg["cells"])

    top_cells = [c for c in agg["top_cells"] if c["open"] > 0][:12]

    # Full day axis — a day with zero concerns is data — over the part of the
    # range where anything COULD have been filed: from the later of its start
    # and the first filing in this viewer's scope, to the earlier of its end
    # and today. «Barcha vaqt» starts in 2015 and a crafted body in year 1;
    # neither may become thousands of empty styled rows on the one worker.
    daily = agg["daily"]
    first = _first_filing(db, payload, lock)
    today = _today()
    start = max(f.date_from or first, first) if first else None
    end = min(f.date_to or today, today)
    day_list = []
    if start and end and start <= end:
        cur = start
        while cur <= end:
            day_list.append(cur.isoformat())
            cur += timedelta(days=1)

    # The register: same scope + the text search, ALL rows in on-screen order.
    reg = _register_rows(db, (
        _apply_scope_and_filters(db, payload, **flt, q=f.q, lock=lock, units=units)
        .with_entities(LeaderConcern, BUCKET, _owner(db, end))
        .order_by(*(_ORDER.get(f.sort) or _ORDER["date_desc"])).all()
    ))

    bio = build_worker_concerns_workbook({
        "title": body.title,
        "subtitle": body.subtitle or "",
        "sheets": body.sheets,
        "labels": body.labels,
        "status_labels": body.status_labels,
        "meta": body.meta,
        "register_meta": body.register_meta,
        "status_counts": agg["kpi"],
        "kpi": {**agg["kpi"], "undated": 0},
        "daily": {"days": day_list,
                  "rows": {d.isoformat(): v for d, v in daily.items()}},
        "brigadirs": agg["by_brigadir"],
        "top_cells": top_cells,
        "leaders": {
            # The page's «too short to judge» rule, so the file grades exactly
            # what the screen grades.
            "plain": bool(f.date_from and f.date_to
                          and 0 < (f.date_to - f.date_from).days + 1 < SHORT_PERIOD_DAYS),
            "rows": _in_order(cell_rows, body.leader_order),
            "counts": _counts(cell_rows),
            "unassigned": unassigned,
            "undated": 0,
            "bands": get_bands(db),
        },
        "register": reg,
    })

    fname = (body.filename or "worker-concerns").strip() or "worker-concerns"
    if not fname.endswith(".xlsx"):
        fname += ".xlsx"
    caption = body.caption or f"📊 {body.title}"
    try:
        data = bio.read()
        resp = deliver_xlsx(request, payload, fname, data, caption)
        action_log.enrich(
            target_kind="report", target_id=fname, target_name=body.title,
            details=[("file", fname), ("rows", len(reg)), ("size", len(data)),
                     ("workers", agg["kpi"]["workers"]), ("scope", _scope_line(f))],
        )
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")


class BandsBody(BaseModel):
    green: int
    yellow: int


@router.put("/thresholds")
def set_thresholds(
    body: BandsBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """KPI color bands — ADMIN-ONLY (narrower than the page): the bands define
    what counts as good performance on a real evaluation, which is a policy
    decision, not a viewer preference."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not (0 < body.yellow < body.green <= 100):
        raise HTTPException(status_code=422,
                            detail="Expected 0 < yellow < green ≤ 100")
    row = db.query(AppSetting).filter_by(key=BANDS_SETTING).first()
    value = json.dumps({"green": body.green, "yellow": body.yellow})
    was = row.value if row else None
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=BANDS_SETTING, value=value))
    db.commit()
    action_log.enrich(
        target_kind="threshold", target_id=BANDS_SETTING,
        details=[("key", BANDS_SETTING)],
        changes=[("threshold", was, value)],
    )
    return {"green": body.green, "yellow": body.yellow}
