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

A filing counts here at WHATEVER LEVEL it now sits. /cell-concerns shows a
concern only while it is still the leader's and drops it the moment it is
uplifted; this page measures what became of every concern a worker raised, and
an uplift does not un-file one (the rule sheet_concerns_report already states).
So the page's statuses are read off two columns:

  done     — resolved, by whoever held it then
  uplifted — handed up the chain (brigadir or above) and not resolved yet —
             the sheets' «O'tqazish», on the platform the escalate
  doing    — in work at the leader step
  todo     — still waiting at the leader step

``BUCKET`` is that rule as SQL and its only spelling: the filter, every
aggregate, the register and the export read the same expression, so
«resolved» can never mean two things on one page. Every percentage is
done ÷ total, computed here.

Attribution is the ROW's own, never a registry lookup: the LEADER the worker
filed to (``leader_profile_id`` — the cell's owner at filing time, the person
who had to answer it, printed under their CURRENT profile name), the UNIT it
was filed under (``brigadir_manager_id``) and the CELL it names. A cell handed
to another leader later does not take its history with it. A row with no leader
surfaces as an explicit «unassigned» bucket — counted, never ranked.

Leaders with fewer than MIN_RANKED concerns in the window are reported but
flagged unranked — a leader with one concern must not out-rank one with a
hundred at 93%.

Scoping (the page opens to supervisor + leader by default), narrowed the way
/concerns narrows these same rows:

  * admin, top-manager, or a page grant at "all" → everything;
  * shift-manager → the units of their shift ∩ plant (shift_scope);
  * supervisor → their own unit's rows;
  * leader → the rows filed to THEM (every profile record that is this person);
  * any other role → nothing.
"""
from __future__ import annotations

import json
from datetime import date as date_cls, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import case, false, func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_leader_profile_ids
from app.models import AppSetting, Cell, LeaderConcern, Manager, RoleProfile
from app.permissions import require_page
from app.capabilities import page_scope_is_all
from app.routers.concerns import _cell_leaders, _no, _shift_unit_ids
from app.services import action_log
from app.services.factory_scope import scoped_manager_ids, viewer_factory_id
from app.services.worker_concerns_export import build_worker_concerns_workbook, whole_pct
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/worker-concerns", tags=["worker-concerns"])

PAGE_KEY = "worker-concerns"

# KPI traffic-light bands (admin-editable on the page; AppSetting-backed).
BANDS_SETTING = "worker_concern_bands"
DEFAULT_BANDS = {"green": 80, "yellow": 50}

# Leaders with fewer concerns than this in the selected window are shown but
# not color-ranked: 1/1 = 100% is noise, not performance.
MIN_RANKED = 5
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
# THE status rule (module docstring). Order matters: a resolved concern is
# «done» wherever it was resolved, and only an OPEN one is told apart by where
# it sits. An unknown stored status reads as «todo», /cell-concerns' own rule.
BUCKET = case(
    (LeaderConcern.status == "done", "done"),
    (_LEVEL != "leader", UPLIFTED),
    (LeaderConcern.status == "doing", "doing"),
    else_="todo",
)

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


def _filed_to(leader_ids: list[int]):
    """The rows filed to these leader profiles — a leader's own lock."""
    return LeaderConcern.leader_profile_id.in_(leader_ids) if leader_ids else false()


def leader_filings(db: Session, leader_ids: list[int],
                   date_from: Optional[date_cls], date_to: Optional[date_cls]):
    """What a LEADER's own page reads over a period, for a caller that holds
    the profile rather than a session: the exam's expected answers (tasks 40
    and 41, services/exam_check) are computed from exactly this, so the number
    a leader reads off the page and the one they are marked against agree."""
    query = _filed(db.query(LeaderConcern)).filter(_filed_to(leader_ids))
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


def _viewer_scope(db: Session, payload: dict, query, lock=None):
    """The viewer lock on the concern rows, before any filter: a query
    parameter must never widen it."""
    units, leaders = lock if lock is not None else _viewer_lock(db, payload)
    if units is not None:
        query = query.filter(_within(LeaderConcern.brigadir_manager_id, units))
    if leaders is not None:
        query = query.filter(_filed_to(leaders))
    return query


def _roster(db: Session, payload: dict, *, factory: Optional[int] = None,
            manager_id: Optional[list[int]] = None, leader_id: Optional[list[int]] = None,
            cell: Optional[list[str]] = None, lock=None,
            units=_COMPUTE) -> list[tuple[int, str, int]]:
    """Every leader the KPI table names whether or not anybody filed to them —
    the /leaders roster rule (a leader profile standing in a unit that is not
    archived), under the same viewer lock as the rows and the page's scope
    filters: plant, brigadir, leader, and the owners of the picked cells.
    → [(profile id, name, unit id)]."""
    q = (db.query(RoleProfile.id, RoleProfile.name, RoleProfile.manager_id)
         .join(Manager, Manager.id == RoleProfile.manager_id)
         .filter(RoleProfile.role == "leader", Manager.archived.is_(False)))
    # The lock's own axes get names of their own: `units` is the caller's
    # resolved plant/brigadir pick, and reusing the name dropped the pick.
    lock_units, lock_leaders = lock if lock is not None else _viewer_lock(db, payload)
    if lock_units is not None:
        q = q.filter(_within(RoleProfile.manager_id, lock_units))
    if lock_leaders is not None:
        q = q.filter(_within(RoleProfile.id, lock_leaders))
    picked = scoped_manager_ids(db, payload, factory, manager_id or []) if units is _COMPUTE else units
    if picked is not None:
        q = q.filter(_within(RoleProfile.manager_id, picked))
    if leader_id:
        q = q.filter(RoleProfile.id.in_(leader_id))
    if cell:
        q = q.filter(RoleProfile.id.in_(
            select(Cell.leader_id).where(Cell.verifix_code.in_([c.strip() for c in cell]))))
    return [tuple(r) for r in q.order_by(RoleProfile.name).all()]


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
    query = _viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock)

    # The plant and the brigadir pick compose (factory_scope); a row filed
    # under no unit is reachable only from «All factories», never padded onto
    # a plant it may not belong to.
    if units is _COMPUTE:
        units = scoped_manager_ids(db, payload, factory, manager_id)
    if units is not None:
        query = query.filter(_within(LeaderConcern.brigadir_manager_id, units))
    if leader_id:
        query = query.filter(LeaderConcern.leader_profile_id.in_(leader_id))
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
            LeaderConcern.leader_name.ilike(like),
            LeaderConcern.cell_code.ilike(like),
            # The leader's CURRENT name too — the register prints that one.
            LeaderConcern.leader_profile_id.in_(
                select(RoleProfile.id).where(RoleProfile.name.ilike(like))),
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

_AGG_COLS = (LeaderConcern.entry_date, BUCKET, LeaderConcern.worker_name,
             LeaderConcern.brigadir_manager_id, LeaderConcern.brigadir_name,
             LeaderConcern.cell_code, LeaderConcern.leader_profile_id,
             LeaderConcern.leader_name)


def _zero() -> dict:
    return {s: 0 for s in STATUSES}


def _pct(done: int, total: int) -> Optional[float]:
    return round(done * 100 / total, 1) if total else None


def _aggregate(db: Session, rows, lo: Optional[date_cls], hi: Optional[date_cls]) -> dict:
    """KPI · daily · per brigadir · per cell · per leader, from one row walk.

    ``rows`` may reach further back than ``lo`` (the trend chart's 7-day
    widening): only the daily series reads the widened part, every other
    figure keeps the exact range the reader picked."""
    kpi, daily = _zero(), {}
    workers: set[str] = set()
    brig: dict = {}
    cells: dict = {}
    leaders: dict = {}
    unassigned = _zero()
    unit_ids, leader_ids = set(), set()
    snap_unit, snap_leader = {}, {}

    unit_leaders: dict = {}
    for d, st, worker, mid, bname, code, lid, lname in rows:
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
            snap_leader.setdefault(lid, lname)
            g = leaders.setdefault(lid, {**_zero(), "units": set(), "cells": set()})
            g[st] += 1
            if mid:
                g["units"].add(mid)
            if code:
                g["cells"].add(code)
        else:
            unassigned[st] += 1

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
        by_brigadir.append({
            "name": unit_name(mid) or "—", "manager_id": mid,
            "shift": m.shift if m else None, "factory_id": m.factory_id if m else None,
            "total": t, **v, "pct": _pct(v["done"], t), "pct0": whole_pct(v["done"], t),
            "leaders": len(unit_leaders.get(mid, ())), "ranked": t >= MIN_RANKED,
        })
    by_brigadir.sort(key=lambda r: -r["total"])

    # A cell is named by its CURRENT leader — «go fix this first» needs the
    # person who answers for it now — and falls back to who it was filed to.
    live = _cell_leaders(db)
    top_cells = []
    for code, v in cells.items():
        t = sum(v[s] for s in STATUSES)
        cid, live_leader, _ = live.get(code) or (None, None, None)
        # A cell nobody owns now is named after the leader most of its concerns
        # were filed to (then the lowest id) — the same name on every request.
        top = min(v["by_leader"].items(), key=lambda kv: (-kv[1], kv[0]))[0] if v["by_leader"] else None
        leader = live_leader or (_named(lnames, top, snap_leader.get(top)) if top else "")
        top_cells.append({"code": code or "—", "cell_id": cid, "leader": leader,
                          "total": t, "open": t - v["done"],
                          **{s: v[s] for s in STATUSES}})
    top_cells.sort(key=lambda r: (-r["open"], -r["total"], r["code"]))

    by_leader = []
    for lid, g in leaders.items():
        t = sum(g[s] for s in STATUSES)
        by_leader.append({
            "leader_id": lid,
            "leader": _named(lnames, lid, snap_leader.get(lid)) or "—",
            "brigadirs": sorted(n for n in (unit_name(m) for m in g["units"]) if n),
            "cells": sorted(g["cells"], key=lambda v: (len(v), v)),
            "total": t, **{s: g[s] for s in STATUSES},
            "open": t - g["done"], "pct": _pct(g["done"], t), "pct0": whole_pct(g["done"], t),
            "ranked": t >= MIN_RANKED,
        })
    by_leader.sort(key=lambda r: -r["total"])
    ua_total = sum(unassigned.values())

    return {
        "kpi": {**kpi, "total": total, "open": total - kpi["done"],
                "pct": _pct(kpi["done"], total), "pct0": whole_pct(kpi["done"], total),
                "workers": len(workers)},
        "daily": daily,
        "by_brigadir": by_brigadir,
        "top_cells": top_cells,
        "leaders": by_leader,
        "unassigned": {**unassigned, "total": ua_total} if ua_total else None,
    }


def _cell_key(v: str):
    return (len(v), v)


def _with_roster(db: Session, by_leader: list[dict], roster, cell: list[str]) -> list[dict]:
    """The KPI table: the leaders the view's concerns were filed to PLUS every
    roster leader nobody filed to, at zero (the operator, 2026-10-03: «show all
    leaders, even those with no concerns»). A leader with no filings is shown,
    never dropped — an empty row says something a missing one cannot. Every row
    also names the cells its leader owns now (narrowed to a cell pick), so a
    leader with nothing filed still says where they work."""
    ids = {r[0] for r in roster} | {r["leader_id"] for r in by_leader}
    owned: dict[int, set] = {}
    if ids:
        picked = {c.strip() for c in cell}
        for lid, code in (db.query(Cell.leader_id, Cell.verifix_code)
                          .filter(Cell.leader_id.in_(ids))):
            if code and (not picked or code in picked):
                owned.setdefault(lid, set()).add(code)
    seen = set()
    out = []
    for r in by_leader:
        seen.add(r["leader_id"])
        cells = set(r["cells"]) | owned.get(r["leader_id"], set())
        out.append({**r, "cells": sorted(cells, key=_cell_key)})
    units = _units(db, (mid for _, _, mid in roster))
    for lid, name, mid in roster:
        if lid in seen:
            continue
        m = units.get(mid)
        out.append({
            "leader_id": lid, "leader": name or "—",
            "brigadirs": [m.name] if m and m.name else [],
            "cells": sorted(owned.get(lid, set()), key=_cell_key),
            "total": 0, **_zero(), "open": 0, "pct": None, "pct0": None, "ranked": False,
        })
    out.sort(key=lambda r: -r["total"])     # stable: the zeros keep name order
    return out


def _ranking_order(rows: list[dict]) -> list[dict]:
    """The ranking's DEFAULT order — ranked leaders by their exact share
    resolved (best first, more concerns first on a tie), then the ones with
    too few concerns to rank, then the ones nobody filed to. The file follows
    the order the page SENDS (`_in_order`); this is only for a request that
    sent none, or for a leader the page did not list."""
    def name(r):
        return (r.get("leader") or "").casefold()

    def key(r):
        t = r["total"]
        if t and r["ranked"]:
            return (0, -(r["done"] / t), -t, name(r))
        if t:
            return (1, 0, -t, name(r))
        return (2, 0, 0, name(r))
    return sorted(rows, key=key)


def _row_key(r: dict) -> str:
    """A leader row's key on the wire — its profile id, else its name. The
    page sends the same key (`rankKey`) for its on-screen order."""
    return str(r["leader_id"]) if r.get("leader_id") is not None else (r.get("leader") or "")


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
    return (_viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock)
            .with_entities(func.min(LeaderConcern.entry_date)).scalar())


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """Filter options + KPI bands — one boot call for the page. The options
    are what THIS viewer can read (their locks applied, no filter): the units
    and leaders of their concerns plus the leader ROSTER, because the KPI
    table lists every leader in scope — a name the table shows must be one the
    Lider filter can pick. Cells are the ones concerns name."""
    sees_all = page_scope_is_all(db, payload, PAGE_KEY)
    lock = _viewer_lock(db, payload, sees_all)
    base = _viewer_scope(db, payload, _filed(db.query(LeaderConcern)), lock)
    # ONE pass over the viewer's filings, grouped by everything the options
    # need — the units, the leaders, the cells, the count and the first day
    # are all read off these groups (a few hundred rows, not the filings).
    groups = (base.with_entities(LeaderConcern.cell_code, LeaderConcern.leader_profile_id,
                                 LeaderConcern.leader_name, LeaderConcern.brigadir_manager_id,
                                 func.count(LeaderConcern.id), func.min(LeaderConcern.entry_date))
              .group_by(LeaderConcern.cell_code, LeaderConcern.leader_profile_id,
                        LeaderConcern.leader_name, LeaderConcern.brigadir_manager_id)
              .all())
    total = sum(g[4] for g in groups)
    first = _first_filing(db, payload, lock)
    unit_ids = {g[3] for g in groups if g[3]}
    leader_rows = sorted({(g[1], g[2], g[3]) for g in groups},
                         key=lambda r: (r[0] or 0, r[1] or "", r[2] or 0))
    lnames = _leader_names(db, (lid for lid, _, _ in leader_rows))
    leader_opts: dict[int, str] = {}
    # A leader's units: the ones their filings name, plus the unit their
    # profile stands in — what the Lider list is narrowed by under a pick.
    leader_units: dict[int, set] = {}
    for lid, snap, mid in leader_rows:
        if not lid:
            continue
        leader_opts.setdefault(lid, _named(lnames, lid, snap))
        if mid:
            leader_units.setdefault(lid, set()).add(mid)
    for lid, name, mid in _roster(db, payload, lock=lock):
        leader_opts.setdefault(lid, name or "—")
        leader_units.setdefault(lid, set()).add(mid)
        unit_ids.add(mid)
    # A cell's units and leaders, from the filings that name it — the same
    # rows a cell pick narrows, so the Yacheyka list cascades under a
    # brigadir or leader pick without offering a cell that would empty the page.
    cell_of: dict[str, dict] = {}
    for code, lid, mid in {(g[0], g[1], g[3]) for g in groups}:
        if not code:
            continue
        c = cell_of.setdefault(code, {"units": set(), "leaders": set(), "pairs": set()})
        if mid:
            c["units"].add(mid)
        if lid:
            c["leaders"].add(lid)
        # Both together: a leader who moved units keeps their old filings under
        # the old unit, so «this leader» and «this unit» separately would offer
        # a cell their combination never touched.
        c["pairs"].add((lid or 0, mid or 0))
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
    rows = (_apply_scope_and_filters(db, payload, **wide, lock=lock, units=units)
            .with_entities(*_AGG_COLS).all())
    agg = _aggregate(db, rows, flt["date_from"], flt["date_to"])
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
    resolved_on = func.coalesce(func.date(func.timezone(PLANT_TZ, LeaderConcern.done_at)),
                                LeaderConcern.completion_date)
    done_then = (LeaderConcern.status == "done") & (resolved_on <= as_of)
    total, done = (
        _apply_scope_and_filters(db, payload, **{**flt, "date_from": p_lo, "date_to": p_hi},
                                 lock=lock, units=units)
        .with_entities(func.count(LeaderConcern.id),
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
    """The KPI table: one row per leader in scope — every leader the view's
    concerns were filed to, and every roster leader nobody filed to, at zero.
    Concerns with no leader fold into one explicit «unassigned» summary —
    counted, displayed, never ranked."""
    lock = _viewer_lock(db, payload)
    units = scoped_manager_ids(db, payload, flt["factory"], flt["manager_id"])
    rows = (_apply_scope_and_filters(db, payload, **flt, lock=lock, units=units)
            .with_entities(*_AGG_COLS).all())
    agg = _aggregate(db, rows, flt["date_from"], flt["date_to"])
    roster = _roster(db, payload, factory=flt["factory"], manager_id=flt["manager_id"],
                     leader_id=flt["leader_id"], cell=flt["cell"], lock=lock, units=units)
    out = _with_roster(db, agg["leaders"], roster, flt["cell"])
    return {
        "rows": out,
        # The cells the rows name → their register ids, for the page's links.
        "cell_ids": _cell_ids(db, (c for r in out for c in r["cells"])),
        "bands": get_bands(db),
        "min_ranked": MIN_RANKED,
        "unassigned": agg["unassigned"],
        "undated": 0,
    }


def _register_rows(db: Session, items) -> list[dict]:
    """The register's wire shape — one row per filing, with what the detail
    view needs to say where an uplifted concern sits now."""
    lnames = _leader_names(db, (c.leader_profile_id for c, _ in items))
    units = _units(db, (c.brigadir_manager_id for c, _ in items))
    cids = _cell_ids(db, (c.cell_code for c, _ in items))
    out = []
    for c, st in items:
        m = units.get(c.brigadir_manager_id)
        out.append({
            "id": c.id, "no": _no(c),
            "d": c.entry_date.isoformat() if c.entry_date else None,
            "cell": c.cell_code, "cell_id": cids.get(c.cell_code),
            "leader": _named(lnames, c.leader_profile_id, c.leader_name),
            "leader_id": c.leader_profile_id,
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
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """The paginated register. The full concern text rides along — 50 rows a
    page keeps the payload phone-friendly without a second per-row fetch."""
    query = _apply_scope_and_filters(db, payload, **flt, q=q)
    total = query.count()
    items = (query.with_entities(LeaderConcern, BUCKET)
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
    rows = (_apply_scope_and_filters(db, payload, **kpi_flt, lock=lock, units=units)
            .with_entities(*_AGG_COLS).all())
    agg = _aggregate(db, rows, f.date_from, f.date_to)

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
        .with_entities(LeaderConcern, BUCKET)
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
            "rows": _in_order(_with_roster(db, agg["leaders"], _roster(
                db, payload, factory=f.factory, manager_id=f.manager_id,
                leader_id=f.leader_id, cell=f.cell, lock=lock, units=units), f.cell),
                body.leader_order),
            "unassigned": agg["unassigned"],
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
