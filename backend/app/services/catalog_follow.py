"""A cell's catalog positions FOLLOW it to its new brigadir — THE engine
(2026-10-26, the operator's rulings; docs/plan-catalog-follows-cells.md §1).

The rulings: cells own the catalog, so when a cell changes brigadir its
positions go with it from the cell's OWN move day `h` (rulings 1, 3), and both
brigadirs' figures are recomputed from that day, closed days included (ruling
4). A position identical to one the new unit already keeps at the same work
centre is JOINED — one quantity, split between the cells; the moved copy is
archived, never deleted (ruling 5).

**The move is WRITTEN into the catalog, never read differently.** No reader of
`pp_catalog` changed: this module does the attribution once, when the move is
followed —

1. it freezes the units of the move at ONE shared day `S`
   (`pp_catalog.align`; `S` = h for a move followed on time);
2. when `h` < `S` (a move followed late, or the retroactive one-shot) it
   rewrites both units' VERSION rows for the days [h, S) — the one deliberate
   exception to «a version is never edited», audited on the move record
   (models.PPCatalogMove.versions);
3. it moves the current rows (`pp_products` / `pp_work_centers`) from `S` on;
4. it re-keys the per-day rows the moved positions read (`pp_line_daily`,
   `pp_daily`, the typed pins in `pp_work_center_daily`) from `h` on, and
5. letters the cells the move needs lettered — every letter change dated from
   `h` (`cell_links.letter_on`), so no day before `h` reads it.

Ownership is `catalog_ownership.handed` — `wc_group.share` read line by line —
decided separately for every catalog content in the window and for the current
rows (an import inside [h, S) re-creates ids). Afterwards every catalog id is in
at most ONE unit's catalog on any day, and every day before `h` reads exactly
what it read before, field for field.

**It runs as a SWEEP after the landing, never inside `cell_links.apply_due`**:
the minute job `catalog-follow` (`run_sweep`, and `kick()` right after a
landing) follows every applied `manager_id` event with no final move record,
grouped by (move day, code) so a swap or a team moving together is one
transaction. It never waits on a lock: a unit whose catalog or quantities
another writer holds makes the group `busy`, retried with back-off
(`BACKOFF_MIN`), then given up and DMed. It stays off until the retroactive
one-shot (`catalog_follow_retro`) has finished — its flag reads `done`.
"""
from __future__ import annotations

import inspect
import logging
import threading
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import (AppSetting, Cell, CellLinkEvent, PPCatalogMove, PPCatalogVersion,
                        PPDaily, PPLineDaily, PPManagerSetting, PPProduct, PPWorkCenterDaily)
from app.services import catalog_ownership as own
from app.services import pp_catalog
from app.services.cell_lookup import norm_code
from app.services.pp_calc import LOCAL_PREFIX, _line_base, daily_key, line_keys, takes_sap
from app.services.wc_group import LETTERS, share

log = logging.getLogger(__name__)

FOLLOW_FROM = date(2026, 10, 6)                 # ruling 3: nothing before 6 October moves
SWEEP_LOCK = 8_140_573_112_026_001             # session lock on a dedicated connection
BACKOFF_MIN = (1, 5, 15, 60, 240)              # then gave_up + DM
RETRO_FLAG = "catalog_follow_retro_2026_10_26_v1"
ARCHIVED_BY = "Yacheyka ko'chishi"
REASON = "cell_move"

FINAL = ("moved", "nothing", "named", "gave_up")
RETRY = ("failed", "busy")

# What stops a STRICT follow (the retroactive one-shot) — nothing is written
# and the transfer is recorded `named`. Everything else is a report: a join, a
# twin, a destination with no catalog, two auto-fill switches that differ.
STRICT_STOP = frozenset({
    "to_no_unit", "code_changed", "shared_left", "shared_left_split", "no_free_letter",
    "y_register_break", "letters_after", "pin_conflict", "conservation"})

# What the admins are DMed about after a live follow, beside every `named` and
# `gave_up` transfer: a move that went through and still left something for a
# person to look at.
ATTENTION = STRICT_STOP | {"hidden_typed", "join_spread", "shared_spread", "people_rounded",
                           "rejoin_skipped", "rejoin_failed", "y_snapshot_kept"}

# A named condition met in several contents of the window is said once.
_NAMED_KEY = ("kind", "unit", "cell", "id")

_EPS = 0.01


# ── the shapes ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Transfer:
    """One cell from unit `src` to unit `dst`, counting from `home_from` (its
    move day `h`). `letter_src` = the cell's letter in `src` on h−1."""
    cell_id: int
    event_id: Optional[int]
    src: Optional[int]
    dst: Optional[int]
    home_from: date
    letter_src: Optional[str]


@dataclass
class Plan:
    """What one group decides once, from the database, before anything is
    written (§1.6) — then applied to every catalog content of the window and
    to the current rows by `transform`, unchanged."""
    code: str
    transfers: list
    stayers: dict = field(default_factory=dict)      # src → {cell id: letter on h−1}
    whole: dict = field(default_factory=dict)        # src → dst | None (§1.3 Whole)
    letter_dst: dict = field(default_factory=dict)   # cell id → its letter in dst
    sibling: dict = field(default_factory=dict)      # dst → (lone staying cell, its letter from h)
    named: list = field(default_factory=list)
    staying_dst: dict = field(default_factory=dict)  # dst → {cell id: letter on h−1}
    storage_from: Optional[date] = None              # S, once aligned (a joined copy's archived_from)
    now: Optional[datetime] = None                   # a joined copy's archived_at

    @property
    def home_from(self) -> date:
        return self.transfers[0].home_from


@dataclass
class GroupResult:
    state: str
    S: Optional[date]
    rows: list
    report: dict
    impact: dict


class CatalogUnsettled(Exception):
    """A cell's brigadir change has landed and its positions have not followed
    yet — a reader judging that cell's day (the leader auto-checks) waits."""


# ── small helpers ───────────────────────────────────────────────────────────

def _g(v) -> Optional[str]:
    return v or None


def _order(p) -> tuple:
    return (float(p.get("sort_order") or 0), p.get("id") or 0)


def _active(p) -> bool:
    return p.get("active") is not False


def _iso(v):
    return v.isoformat() if hasattr(v, "isoformat") else v


def _jsonable(d: dict) -> dict:
    return {k: _iso(v) for k, v in d.items()}


def _days(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range((b - a).days + 1)]


def _named(kind: str, **params) -> dict:
    return {"kind": kind, **{k: v for k, v in params.items() if v is not None}}


def _merge_named(items: Iterable[dict]) -> list[dict]:
    """One entry per (kind, unit, cell, id) — the LAST one met wins: a
    condition met in every span of the window and in the current rows is said
    once, with the current rows' figures."""
    out: dict = {}
    for n in items:
        out[tuple(n.get(k) for k in _NAMED_KEY)] = n
    return list(out.values())


def enabled(db: Session) -> bool:
    """The sweep and `unsettled` stay off until the retroactive one-shot has
    applied the moves that landed before this release — its flag reads
    `done:<moved>/<named>`. Following live moves before it would act on
    catalogs the retro still has to rewrite."""
    try:
        v = db.query(AppSetting.value).filter(AppSetting.key == RETRO_FLAG).scalar()
    except Exception:  # noqa: BLE001 — a box before the table: off
        db.rollback()
        return False
    return bool(v) and str(v).startswith("done")


# ── the plan ────────────────────────────────────────────────────────────────

def _taken(db: Session, unit: int, code: str, exclude: set) -> set[str]:
    """Every letter a new arrival in `unit` at `code` must not take (§1.6):
    every cell row of the unit at the code (archived ones included, the
    group's own cells excluded), every line of the unit at the code in ANY
    version or the current rows, and every pin of the unit at the code on ANY
    date. A letter nothing of the unit's past carries is history-neutral: no
    line or pin dated before `h` names it, so a reader that does not date
    letters reads the same figures for those days."""
    out: set[str] = set()
    for cid, g, sap in db.query(Cell.id, Cell.wc_group, Cell.sap_code).filter(
            Cell.manager_id == unit, Cell.wc_group.isnot(None)).all():
        if cid not in exclude and norm_code(sap) == code and g:
            out.add(g)
    for g, wc in db.query(PPProduct.wc_group, PPProduct.work_center).filter(
            PPProduct.manager_id == unit, PPProduct.wc_group.isnot(None)).all():
        if g and norm_code(wc) == code:
            out.add(g)
    for (lines,) in db.query(PPCatalogVersion.lines).filter(PPCatalogVersion.manager_id == unit).all():
        for d in lines or []:
            if d.get("wc_group") and norm_code(d.get("work_center")) == code:
                out.add(d["wc_group"])
    for g, wc in db.query(PPWorkCenterDaily.wc_group, PPWorkCenterDaily.work_center).filter(
            PPWorkCenterDaily.manager_id == unit,
            PPWorkCenterDaily.wc_group.isnot(None)).distinct().all():
        if g and norm_code(wc) == code:
            out.add(g)
    return out


def _free(taken: set) -> Optional[str]:
    return next((l for l in LETTERS if l not in taken), None)


def _letters_after(cell_id: int, h: date) -> bool:
    """Has a later move already dated a letter of this cell (§1.8)? Re-lettering
    it from `h` would put two histories on one cell."""
    from app.services import cell_links
    return any(eff > h for eff, _w in
               cell_links.events().get(cell_links.LETTERS, {}).get(cell_id) or [])


def build_plan(db: Session, transfers: list[Transfer]) -> Plan:
    """§1.6's plan for one group — every transfer the same `h`, every cell at
    the same code — from committed state (dated links, letters, archive spans)
    and the session's rows. Writes nothing."""
    if not transfers:
        raise ValueError("catalog_follow.build_plan: no transfer")
    h = transfers[0].home_from
    before = h - timedelta(days=1)
    ids = [t.cell_id for t in transfers]
    cells = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(ids)).all()}
    code = norm_code(cells[transfers[0].cell_id].sap_code) if transfers[0].cell_id in cells else ""
    moving = set(ids)
    plan = Plan(code=code, transfers=list(transfers))

    for x in sorted({t.src for t in transfers if t.src is not None}):
        st = own.cells_standing(db, x, code, before, h, exclude=moving)
        plan.stayers[x] = st
        dests = {t.dst for t in transfers if t.src == x}
        plan.whole[x] = next(iter(dests)) if (not st and len(dests) == 1 and None not in dests) else None

    def vcode(t):
        c = cells.get(t.cell_id)
        return ((c.verifix_code or "") if c is not None else "", t.cell_id)

    for y in sorted({t.dst for t in transfers if t.dst is not None}):
        arrivals = sorted((t for t in transfers if t.dst == y), key=vcode)
        st = own.cells_standing(db, y, code, before, h, exclude=moving)
        plan.staying_dst[y] = st
        if len(st) + len(arrivals) == 1:
            # Alone at the code in the new unit: the cell keeps the letter its
            # column carries, None included — nothing to tell apart.
            t = arrivals[0]
            plan.letter_dst[t.cell_id] = _g(getattr(cells.get(t.cell_id), "wc_group", None))
            continue
        taken = _taken(db, y, code, moving) | {g for g in st.values() if g}
        for t in arrivals:
            c = cells.get(t.cell_id)
            if _letters_after(t.cell_id, h):
                g = _g(getattr(c, "wc_group", None))
                plan.named.append(_named("letters_after", cell=t.cell_id,
                                         code=getattr(c, "verifix_code", None)))
            else:
                g = t.letter_src if (t.letter_src and t.letter_src not in taken) else _free(taken)
                if g is None:
                    plan.named.append(_named("no_free_letter", cell=t.cell_id, unit=y))
            plan.letter_dst[t.cell_id] = g
            if g:
                taken.add(g)
        if len(st) == 1:
            (s_id, s_let), = st.items()
            if s_let:
                # A lone LETTERED stayer: everything of the unit at the code no
                # letter of it claims (no letter, an orphan one) was its alone
                # and would now be split with the arrivals — it takes its own
                # letter from `h`, the rule below with no new letter to find.
                plan.sibling[y] = (s_id, s_let)
            elif _letters_after(s_id, h):
                plan.named.append(_named("letters_after", cell=s_id, unit=y))
            else:
                ls = _free(taken)
                if ls is None:
                    plan.named.append(_named("no_free_letter", cell=s_id, unit=y))
                else:
                    plan.sibling[y] = (s_id, ls)
                    taken.add(ls)
        elif len(st) >= 2 and any(not g for g in st.values()):
            plan.named.append(_named("y_register_break", unit=y,
                                     cells=sorted(st), code=code))
    return plan


# ── the transformation of one catalog content (pure) ────────────────────────

def _empty_report() -> dict:
    return {"moved": {}, "owner": {}, "src": {}, "dst": {}, "joined": {}, "dropped_lines": [],
            "dropped_wc": [], "wc_moved": {}, "wc_reactivated": [], "named": []}


def transform(contents: dict[int, dict], plan: Plan, *, current: bool) -> tuple[dict[int, dict], dict]:
    """Apply `plan` to ONE catalog content of every unit of the group — a
    version sub-interval, or the current rows when `current` is true (then a
    joined copy also gets its archive stamp). `contents` = {unit: {"lines":
    [LINE_FIELDS dict], "work_centers": [WC_FIELDS dict]}}; returns
    (new contents, report). Pure: the input is not touched.

    The report: `moved` {line id: dst}, `owner` {line id: cell | None
    (group-shared)}, `src`, `dst`, `joined` {copy id: partner id},
    `dropped_lines` / `dropped_wc` (dumps, with their `unit`), `wc_moved`
    {wc id: (src, dst)},
    `wc_reactivated` [wc id], `named`."""
    out = {int(u): {"lines": [dict(p) for p in (c or {}).get("lines") or []],
                    "work_centers": [dict(w) for w in (c or {}).get("work_centers") or []]}
           for u, c in contents.items()}
    rep = _empty_report()
    code = plan.code
    if not code:
        return out, rep
    transfers = plan.transfers
    sources = sorted({t.src for t in transfers if t.src is not None and t.src in out})

    # 1. Departures (§1.4): who owns which line, per source.
    leaving: dict[int, list] = {}
    for x in sources:
        deps = [t for t in transfers if t.src == x]
        A = dict(plan.stayers.get(x) or {})
        for t in deps:
            A[t.cell_id] = _g(t.letter_src)
        at_c = own.lines_at(out[x]["lines"], code)
        mine: dict[int, int] = {}
        shared: set[int] = set()
        for t in deps:
            hd = own.handed(at_c, A, t.cell_id)
            for p in hd.mine:
                mine[id(p)] = t.cell_id
            for p in hd.shared:
                shared.add(id(p))
        dest = {t.cell_id: t.dst for t in deps}
        whole = plan.whole.get(x)
        moving, left = [], []
        for p in at_c:
            k = id(p)
            if k in mine:
                if dest[mine[k]] is not None:
                    moving.append((p, dest[mine[k]], mine[k]))
            elif k in shared:
                if whole is not None:
                    moving.append((p, whole, None))
                else:
                    left.append(p)
        if left:
            split = len({t.dst for t in deps}) > 1
            rep["named"].append(_named("shared_left_split" if split else "shared_left", unit=x,
                                       count=len(left),
                                       lines=[p.get("name") for p in left[:10]]))
        leaving[x] = moving

    # 2. Y_remaining: every unit minus what leaves it.
    for x, mv in leaving.items():
        gone = {id(p) for p, _y, _o in mv}
        out[x]["lines"] = [p for p in out[x]["lines"] if id(p) not in gone]

    # 3. The sibling rule: a lone staying cell keeps every line of the unit at
    #    the code no staying cell claims — they take its letter (a new one when
    #    it had none), so the arrivals do not share them.
    for y, (s_id, ls) in plan.sibling.items():
        if y not in out:
            continue
        carried = {g for g in (plan.staying_dst.get(y) or {}).values() if g}
        for p in own.lines_at(out[y]["lines"], code):
            g = _g(p.get("wc_group"))
            if (g is None or g not in carried) and g != ls:
                p["wc_group"] = ls

    # 4. Arrivals — their letter, the join (ruling 5), the archived twin.
    incoming: dict[int, list] = defaultdict(list)
    for x, mv in leaving.items():
        for p, y, owner in mv:
            incoming[y].append((p, owner, x))
    for y in sorted(incoming):
        out.setdefault(y, {"lines": [], "work_centers": []})
        remaining = out[y]["lines"]
        base = max((float(p.get("sort_order") or 0) for p in remaining), default=-1.0)
        rem_at = sorted(own.lines_at(remaining, code), key=_order)
        rem_active, rem_inactive = defaultdict(list), defaultdict(list)
        for m in rem_at:
            (rem_active if _active(m) else rem_inactive)[own.join_ident(m)].append(m)
        arrivals = sorted(incoming[y], key=lambda a: (a[2], _order(a[0])))
        carriers = dict(plan.staying_dst.get(y) or {})
        if y in plan.sibling:
            carriers[plan.sibling[y][0]] = plan.sibling[y][1]
        here = set(carriers) | {t.cell_id for t in transfers if t.dst == y}

        by_ident: dict[tuple, list] = defaultdict(list)
        for p, owner, x in arrivals:
            if _active(p) and takes_sap(p.get("sap_code"), p.get("auto_fill")):
                by_ident[own.join_ident(p)].append(p)
        partner: dict[int, dict] = {}
        for ident, ps in by_ident.items():
            ms = [m for m in rem_active[ident] if takes_sap(m.get("sap_code"), m.get("auto_fill"))]
            for i, p in enumerate(sorted(ps, key=_order)):
                if i < len(ms):
                    partner[id(p)] = ms[i]
                elif ms:
                    rep["named"].append(_named("unpaired_twin", unit=y, id=p.get("id"),
                                               name=p.get("name")))

        group_shared = [p for p, owner, _x in arrivals if owner is None]
        if group_shared and plan.staying_dst.get(y):
            # Lines the team shared arrive unlettered: the cells already standing
            # in the new unit at the code take a share of them too.
            rep["named"].append(_named("shared_spread", unit=y, count=len(group_shared)))
        live, joined, dropped = [], [], set()
        for p, owner, x in arrivals:
            letter = plan.letter_dst.get(owner) if owner is not None else None
            p["wc_group"] = letter
            pid = p.get("id")
            rep["moved"][pid] = y
            rep["owner"][pid] = owner
            rep["src"][pid] = x
            rep["dst"][pid] = y
            m = partner.get(id(p))
            if m is not None:
                p["active"] = False
                if current:
                    p["archived_at"] = plan.now
                    p["archived_by"] = ARCHIVED_BY
                    p["archived_from"] = plan.storage_from
                rep["joined"][pid] = m.get("id")
                g = _g(m.get("wc_group"))
                owner_m = next((cid for cid, let in carriers.items() if let and let == g), None)
                if g is not None and owner_m is not None and g != letter:
                    m["wc_group"] = None
                    if here - {owner_m, owner}:
                        rep["named"].append(_named("join_spread", unit=y, id=m.get("id"),
                                                   cell=owner, name=m.get("name")))
                joined.append((p, x))
                continue
            ident = own.join_ident(p)
            if _active(p) and not takes_sap(p.get("sap_code"), p.get("auto_fill")) \
                    and rem_active.get(ident):
                rep["named"].append(_named("manual_twin", unit=y, id=pid, name=p.get("name")))
            if current and _active(p) and not rem_active.get(ident):
                for q in rem_inactive.get(ident) or []:
                    if id(q) not in dropped:
                        dropped.add(id(q))
                        rep["dropped_lines"].append({**q, "unit": y})
                        # The whole row is kept on the record: it is deleted, and
                        # a person may want the archived line back.
                        rep["named"].append(_named("archived_twin_dropped", unit=y,
                                                   id=q.get("id"), name=q.get("name"),
                                                   line=_jsonable(q)))
            live.append((p, x))
        if dropped:
            out[y]["lines"] = [q for q in out[y]["lines"] if id(q) not in dropped]

        # 5. Sort: after every line of the unit, so none of the unit's own
        #    `line_keys` suffixes moves; the joined copies last.
        k = 0
        for p, _x in live + joined:
            p["sort_order"] = int(base) + 1 + k
            k += 1
            out[y]["lines"].append(p)

    # 6. Work-centre rows — only for a code that left its unit WHOLE, and only
    #    while nothing arrives into that unit at the code (a swap keeps both).
    arriving_into = {t.dst for t in transfers if t.dst is not None}
    for x in sources:
        y = plan.whole.get(x)
        if y is None or x in arriving_into:
            continue
        rows_x = sorted((w for w in out[x]["work_centers"] if norm_code(w.get("code")) == code),
                        key=_order)
        if not rows_x:
            continue
        out.setdefault(y, {"lines": [], "work_centers": []})
        rows_y = [w for w in out[y]["work_centers"] if norm_code(w.get("code")) == code]
        gone = {id(w) for w in rows_x}
        if rows_y:
            for w in rows_x:
                rep["dropped_wc"].append({**w, "unit": x})
            if not any(_active(w) for w in rows_y) and any(_active(w) for w in rows_x):
                first = sorted(rows_y, key=_order)[0]
                first["active"] = True
                rep["wc_reactivated"].append(first.get("id"))
        else:
            first = rows_x[0]
            out[y]["work_centers"].append(first)
            rep["wc_moved"][first.get("id")] = (x, y)
            for w in rows_x[1:]:
                rep["dropped_wc"].append({**w, "unit": x})
        out[x]["work_centers"] = [w for w in out[x]["work_centers"] if id(w) not in gone]
    return out, rep


# ── what a day reads, for the per-day rows ──────────────────────────────────

def identities(db: Session, unit_ids, a: date, b: date) -> dict[tuple[int, date], dict[int, tuple]]:
    """{(unit, day): {line id: (qty_key, work centre, line_key, active)}} over
    [a, b] — every catalog line as the day reads it, through `pp_catalog.spans`
    (versions, then the current rows). The per-day rows a line reads are keyed
    by exactly these, so comparing two calls says which rows must move."""
    out: dict = {}
    if a > b:
        return out
    for u, sp in pp_catalog.spans(db, unit_ids, a, b).items():
        for cat, lo, hi in sp:
            keys = line_keys(cat.lines)
            m = {p.id: (daily_key(p.sap_code, p.name), p.work_center or "", keys.get(p.id, ""),
                        bool(p.active))
                 for p in cat.lines if p.id is not None}
            for d in _days(lo, hi):
                out[(int(u), d)] = m
    return out


def _last_stored(db: Session, units: list[int], h: date) -> date:
    last = h
    for model in (PPLineDaily, PPDaily, PPWorkCenterDaily):
        m = db.query(func.max(model.date)).filter(model.manager_id.in_(units)).scalar()
        if m is not None and m > last:
            last = m
    return last


def _contents(cat_or_rows, lines_extra: bool = False) -> dict:
    lines = []
    for p in cat_or_rows["lines"]:
        d = pp_catalog._dump(p, pp_catalog.LINE_FIELDS)
        if lines_extra:
            d.update(archived_at=p.archived_at, archived_by=p.archived_by,
                     archived_from=p.archived_from)
        lines.append(d)
    return {"lines": lines,
            "work_centers": [pp_catalog._dump(w, pp_catalog.WC_FIELDS)
                             for w in cat_or_rows["work_centers"]]}


def _probe(db: Session, plan: Plan, units: list[int]) -> tuple[bool, list]:
    """Would the plan move anything — a line or a work-centre row — in any
    content from `h` on? Read without a lock: a group owning nothing takes
    none and freezes nothing (an empty destination is never frozen for
    nothing). Returns (moves, named)."""
    h = plan.home_from
    bounds = pp_catalog._current_from_many(db, units)
    s0 = max([h, *bounds.values()])
    sp = pp_catalog.spans(db, units, h, s0)
    starts = sorted({lo for u in units for (_c, lo, _hi) in sp.get(u, [])})
    named: list = []
    moves = False
    for b in starts:
        contents = {}
        for u in units:
            cat = pp_catalog.catalog_for(sp.get(u, []), b)
            contents[u] = _contents({"lines": cat.lines, "work_centers": cat.work_centers}) \
                if cat is not None else {"lines": [], "work_centers": []}
        _out, rep = transform(contents, plan, current=False)
        named += rep["named"]
        if rep["moved"] or rep["wc_moved"] or rep["dropped_wc"]:
            moves = True
    return moves, named


# ── the per-day rows ────────────────────────────────────────────────────────

def _positions(ident: dict) -> dict[date, dict[int, tuple]]:
    """{day: {line id: (unit, qty_key, wc, line_key, active)}} out of
    `identities`."""
    out: dict = defaultdict(dict)
    for (u, d), m in ident.items():
        for pid, (qk, wc, lk, act) in m.items():
            out[d][pid] = (u, qk, wc, lk, act)
    return out


_LINE_COLS = ("plan_override", "actual_override", "container_cap", "updated_at")


def _rekey_line_daily(db: Session, units: list[int], h: date, last: date, pb: dict, pa: dict,
                      joined: set, counts: Counter, named: list) -> dict:
    """Move every per-line row whose line's (unit, qty_key, wc, line_key)
    changed — two phases, so a key a swap hands from one line to another never
    meets `uq_pp_line_daily_key` half-way. A row already sitting at a
    destination key that is not itself moving is an orphan (no line read it):
    dropped and counted, never revived. Returns the rows by key, after."""
    idx: dict = {}
    for r in db.query(PPLineDaily).filter(PPLineDaily.manager_id.in_(units),
                                          PPLineDaily.date >= h, PPLineDaily.date <= last).all():
        idx[(int(r.manager_id), r.date, r.qty_key, r.work_center, r.line_key)] = r
    moves: list = []                # (source key, destination key, line id)
    for d in sorted(set(pb) | set(pa)):
        b, a = pb.get(d, {}), pa.get(d, {})
        for pid, (u0, qk0, wc0, lk0, _act0) in b.items():
            if pid not in a:
                continue
            u1, qk1, wc1, lk1, _act1 = a[pid]
            if (u0, qk0, wc0, lk0) != (u1, qk1, wc1, lk1):
                moves.append(((u0, d, qk0, wc0, lk0), (u1, d, qk1, wc1, lk1), pid))
    if not moves:
        return idx
    srcs = {s for s, _t, _p in moves}
    carry = {}
    for s, t, pid in moves:
        row = idx.get(s)
        if row is None:
            continue
        carry[t] = {c: getattr(row, c) for c in _LINE_COLS}
        if pid in joined and any(getattr(row, c) is not None
                                 for c in ("plan_override", "actual_override", "container_cap")):
            named.append(_named("hidden_typed", id=pid, day=s[1].isoformat(), unit=t[0]))
        db.delete(row)
        idx.pop(s)
    for _s, t, _pid in moves:
        if t in idx and t not in srcs:
            db.delete(idx.pop(t))
            counts["orphans_dropped"] += 1
    db.flush()
    for (u, d, qk, wc, lk), vals in carry.items():
        r = PPLineDaily(manager_id=u, date=d, qty_key=qk, work_center=wc, line_key=lk, **vals)
        db.add(r)
        idx[(u, d, qk, wc, lk)] = r
        counts["pp_line_daily"] += 1
    db.flush()
    return idx


def _line_row(db: Session, idx: dict, key: tuple) -> PPLineDaily:
    r = idx.get(key)
    if r is None:
        u, d, qk, wc, lk = key
        r = PPLineDaily(manager_id=u, date=d, qty_key=qk, work_center=wc, line_key=lk)
        db.add(r)
        idx[key] = r
    return r


def _fill(row, col: str, value) -> bool:
    if value is None or getattr(row, col) is not None:
        return False
    setattr(row, col, value)
    return True


def _num(v) -> float:
    return float(v or 0)


def _rekey_daily(db: Session, units: list[int], h: date, last: date, pb: dict, pa: dict,
                 line_idx: dict, counts: Counter, named: list) -> dict[int, set]:
    """`pp_daily` for every (day, SAP code, work centre) a moved line reads
    (§1.7), the snapshot and the group's hand-typed override each kept with
    the lines that read them:

    * a moved line takes its OLD unit's group override as its own per-line
      value (fill only), so it reads in the new unit what it read in the old;
    * a unit GAINING lines at the pair gets the snapshot (created, or copied
      over a 0/0 row; a different one is kept and named) and its group
      override is exploded onto its own staying lines (fill only) and cleared
      — it would otherwise reach the arrivals too;
    * a unit LOSING lines loses the row once no line of it is left at the pair.

    Returns {destination unit: {(sap, wc)}} — the pairs that arrived there."""
    idx: dict = {}
    for r in db.query(PPDaily).filter(PPDaily.manager_id.in_(units), PPDaily.date >= h,
                                      PPDaily.date <= last).all():
        idx[(int(r.manager_id), r.date, r.sap_code, r.work_center)] = r
    arrived: dict[int, set] = defaultdict(set)
    for d in sorted(set(pb) | set(pa)):
        b, a = pb.get(d, {}), pa.get(d, {})
        pairs: dict = defaultdict(list)
        for pid, (u0, qk, wc, _lk, _act) in b.items():
            if pid in a and a[pid][0] != u0:
                pairs[(qk, wc)].append((pid, u0, a[pid][0]))
        for (qk, wc), moved in pairs.items():
            involved = {u for _p, u0, u1 in moved for u in (u0, u1)}
            snap = {u: idx.get((u, d, qk, wc)) for u in involved}
            before = {u: (None if r is None else
                          (r.plan_qty, r.actual_qty, r.plan_override, r.actual_override, r.updated_at))
                      for u, r in snap.items()}
            # a moved line takes its source's group override
            for pid, u0, u1 in moved:
                src = before.get(u0)
                if src is None or (src[2] is None and src[3] is None) or not a[pid][4]:
                    continue
                row = _line_row(db, line_idx, (u1, d, qk, wc, a[pid][3]))
                if _fill(row, "plan_override", src[2]) | _fill(row, "actual_override", src[3]):
                    counts["overrides_carried"] += 1
            # the units gaining lines
            gaining = sorted({u1 for _p, _u0, u1 in moved})
            for u1 in gaining:
                srcs = sorted({u0 for _p, u0, uu in moved if uu == u1})
                xs = next((before[u0] for u0 in srcs if before.get(u0) is not None), None)
                yrow = snap.get(u1)
                if yrow is None:
                    if xs is not None:
                        yrow = PPDaily(manager_id=u1, date=d, sap_code=qk, work_center=wc,
                                       plan_qty=xs[0], actual_qty=xs[1], updated_at=xs[4])
                        db.add(yrow)
                        idx[(u1, d, qk, wc)] = yrow
                        counts["pp_daily_created"] += 1
                else:
                    if xs is not None and _num(yrow.plan_qty) == 0 and _num(yrow.actual_qty) == 0 \
                            and (_num(xs[0]) or _num(xs[1])):
                        yrow.plan_qty, yrow.actual_qty = xs[0], xs[1]
                        counts["pp_daily_copied"] += 1
                    elif xs is not None and (_num(yrow.plan_qty), _num(yrow.actual_qty)) != \
                            (_num(xs[0]), _num(xs[1])):
                        named.append(_named("y_snapshot_kept", unit=u1, day=d.isoformat(),
                                            sap=qk, wc=wc))
                    yb = before.get(u1)
                    if yb is not None and (yb[2] is not None or yb[3] is not None):
                        staying = [pid for pid, (uu, qk2, wc2, _lk, _ac) in b.items()
                                   if uu == u1 and qk2 == qk and wc2 == wc
                                   and pid in a and a[pid][0] == u1]
                        for pid in staying:
                            row = _line_row(db, line_idx, (u1, d, qk, wc, a[pid][3]))
                            _fill(row, "plan_override", yb[2])
                            _fill(row, "actual_override", yb[3])
                        yrow.plan_override = None
                        yrow.actual_override = None
                        counts["pp_daily_exploded"] += 1
                if not qk.startswith(LOCAL_PREFIX):
                    arrived[u1].add((qk, wc))
            # the units losing lines
            for u0 in sorted({u0 for _p, u0, _u1 in moved}):
                if u0 in gaining:
                    continue
                still = any(uu == u0 and qk2 == qk and wc2 == wc
                            for (uu, qk2, wc2, _lk, _ac) in a.values())
                row = snap.get(u0)
                if not still and row is not None:
                    db.delete(row)
                    idx.pop((u0, d, qk, wc), None)
                    counts["pp_daily_deleted"] += 1
    db.flush()
    return arrived


def _int_people(v: float, named: list, **where) -> int:
    n = int(v + 0.5) if v >= 0 else -int(-v + 0.5)
    if abs(n - v) > 1e-9:
        named.append(_named("people_rounded", value=round(v, 4), **where))
    return n


def _rekey_pins(db: Session, plan: Plan, units: list[int], h: date, last: date,
                counts: Counter, named: list) -> None:
    """The typed «Bugungi fakt» pins at the code, from `h` on (§1.7):
    each departing cell's people written into the new unit under its new
    letter, the old unit's pins leaving with it, the lone staying sibling's
    whole-centre pin turned into its group pin.

    When nobody stays, every pin of the code leaves and each departer takes
    what `wc_group.share` hands it. When cells stay, a departer takes only its
    own letter's pins: a whole-centre or orphan-letter pin stays with the
    stayers (`x_whole_pin_kept`), exactly as a shared line does — the spec
    handed the departer a `share` of it while the pin stayed, which counted
    those people in both units. Typed people are conserved either way.

    A code that left its unit WHOLE into a unit holding nothing there that day
    moves its pin rows as they are (re-lettered), which keeps a whole-centre
    pin whole rather than splitting it into fractions."""
    code = plan.code
    rows = [r for r in db.query(PPWorkCenterDaily).filter(
        PPWorkCenterDaily.manager_id.in_(units), PPWorkCenterDaily.date >= h,
        PPWorkCenterDaily.date <= last).all() if norm_code(r.work_center) == code]
    if not rows:
        return
    by_day: dict = defaultdict(lambda: defaultdict(list))
    for r in rows:
        by_day[r.date][int(r.manager_id)].append(r)
    sources = sorted({t.src for t in plan.transfers if t.src is not None})
    kept_whole: Counter = Counter()

    for d in sorted(by_day):
        pins = by_day[d]
        values: dict[int, Optional[float]] = {}
        leaving: dict[int, list] = {}
        saved: dict[int, list] = {}
        for x in sources:
            deps = [t for t in plan.transfers if t.src == x]
            stay = plan.stayers.get(x) or {}
            xs = pins.get(x) or []
            whole_all = not stay and all(t.dst is not None for t in deps)
            if whole_all:
                # Nobody stays: every pin of the code leaves, handed to the
                # departers by the rule that splits it already (`share`).
                A = [(t.cell_id, _g(t.letter_src)) for t in deps]
                vals: dict = {}
                for r in xs:
                    if r.people is not None:
                        vals[_g(r.wc_group)] = vals.get(_g(r.wc_group), 0.0) + float(r.people)
                for (cid, _l), v in zip(A, share([g for _c, g in A], vals, pins=True)):
                    values[cid] = v
                go = list(xs)
            else:
                # Cells stay: a departer takes the pins ITS letter claims and
                # nothing else. A whole-centre or orphan-letter pin is shared,
                # and like a shared line it stays with the stayers — on these
                # days the dated readers already hand it to them alone (the
                # departer is in the new unit from `h`), so handing the departer
                # a share as well would count those people twice.
                carried = {g for g in stay.values() if g}
                movers = [t for t in deps if t.dst is not None and t.letter_src
                          and t.letter_src not in carried]
                own_letters = {_g(t.letter_src) for t in movers}
                go = [r for r in xs if _g(r.wc_group) in own_letters]
                own_vals: dict = {}
                for r in go:
                    if r.people is not None:
                        own_vals[_g(r.wc_group)] = own_vals.get(_g(r.wc_group), 0.0) + float(r.people)
                per = Counter(_g(t.letter_src) for t in movers)
                for t in movers:
                    g = _g(t.letter_src)
                    if g in own_vals:
                        values[t.cell_id] = own_vals[g] / per[g]
                if stay and any(r.people is not None and _g(r.wc_group) not in own_letters
                                and (r.wc_group is None or _g(r.wc_group) not in carried)
                                for r in xs):
                    kept_whole[x] += 1
            leaving[x] = go
            saved[x] = [{"work_center": r.work_center, "wc_group": _g(r.wc_group),
                         "people": r.people, "shtatka": r.shtatka, "updated_at": r.updated_at}
                        for r in go]
        for x, go in leaving.items():
            for r in go:
                db.delete(r)
                pins[x].remove(r)
                counts["pins_left"] += 1
        db.flush()

        # The lone staying sibling: its unclaimed pins become its group pin
        # (added to the one it already has, when it is lettered and has one).
        for y, (s_id, ls) in plan.sibling.items():
            ys = pins.get(y) or []
            carried = {g for g in (plan.staying_dst.get(y) or {}).values() if g}
            group_pins = [r for r in ys if r.wc_group is not None]
            loose = [r for r in group_pins if r.wc_group not in carried and r.wc_group != ls]
            whole = next((r for r in ys if r.wc_group is None), None)
            if group_pins:
                moved = [r for r in loose if r.people is not None]
                if moved:
                    total = sum(int(r.people) for r in moved)
                    for r in moved:
                        db.delete(r)
                        ys.remove(r)
                    db.flush()
                    own_pin = next((r for r in ys if r.wc_group == ls), None)
                    if own_pin is not None:
                        own_pin.people = int(own_pin.people or 0) + total
                    else:
                        nr = PPWorkCenterDaily(manager_id=y, date=d,
                                               work_center=moved[0].work_center,
                                               wc_group=ls, people=total)
                        db.add(nr)
                        ys.append(nr)
                    counts["pins_sibling"] += 1
            elif whole is not None and whole.people is not None:
                nr = PPWorkCenterDaily(manager_id=y, date=d, work_center=whole.work_center,
                                       wc_group=ls, people=whole.people)
                db.add(nr)
                ys.append(nr)
                if whole.shtatka is None:
                    db.delete(whole)
                    ys.remove(whole)
                else:
                    whole.people = None
                counts["pins_sibling"] += 1
            pins[y] = ys
        db.flush()

        # Writing into the new units.
        done_as_is: set = set()
        for x in sources:
            y = plan.whole.get(x)
            if y is None or plan.staying_dst.get(y) or (pins.get(y) or []) or not saved.get(x) \
                    or x in done_as_is:
                continue
            # As they are: a whole team into a unit holding nothing at the code that day.
            deps = {_g(t.letter_src): t.cell_id for t in plan.transfers
                    if t.src == x and t.letter_src}
            new_letters = {plan.letter_dst.get(t.cell_id) for t in plan.transfers if t.dst == y}
            made: dict = {}
            for s in saved[x]:
                g = s["wc_group"]
                if g is not None:
                    if g in deps:
                        g = plan.letter_dst.get(deps[g])
                    elif g in new_letters:
                        # An orphan would now name an arrival: another orphan letter.
                        g = _free(new_letters | {x2["wc_group"] for x2 in saved[x]
                                                 if x2["wc_group"]})
                key = g
                if key in made:
                    r = made[key]
                    if s["people"] is not None:
                        r.people = (r.people or 0) + int(s["people"])
                    if r.shtatka is None and s["shtatka"] is not None:
                        r.shtatka = s["shtatka"]
                    continue
                r = PPWorkCenterDaily(manager_id=y, date=d, work_center=s["work_center"],
                                      wc_group=g, people=s["people"],
                                      shtatka=s["shtatka"] if g is None else None,
                                      updated_at=s["updated_at"])
                if g is not None and s["shtatka"] is not None:
                    named.append(_named("shtatka_dropped", unit=y, day=d.isoformat()))
                db.add(r)
                made[key] = r
                pins.setdefault(y, []).append(r)
                counts["pins_moved"] += 1
            done_as_is.add(x)
            for t in plan.transfers:
                if t.src == x:
                    values.pop(t.cell_id, None)
        db.flush()

        for t in plan.transfers:
            if t.dst is None or t.cell_id not in values:
                continue
            v = values[t.cell_id]
            if v is None:
                continue
            y = t.dst
            ys = pins.setdefault(y, [])
            L = plan.letter_dst.get(t.cell_id)
            raw = next((s["work_center"] for s in saved.get(t.src) or []), None) \
                or next((r.work_center for r in (by_day[d].get(t.src) or [])), None) or code
            whole = next((r for r in ys if r.wc_group is None), None)
            n = _int_people(v, named, unit=y, day=d.isoformat(), cell=t.cell_id)
            if L is None:
                if whole is not None and whole.people is not None:
                    named.append(_named("pin_conflict", unit=y, day=d.isoformat(), cell=t.cell_id))
                elif whole is not None:
                    whole.people = n
                    counts["pins_written"] += 1
                else:
                    r = PPWorkCenterDaily(manager_id=y, date=d, work_center=raw, people=n)
                    db.add(r)
                    ys.append(r)
                    counts["pins_written"] += 1
                continue
            if any(r.wc_group == L for r in ys):
                named.append(_named("pin_conflict", unit=y, day=d.isoformat(), cell=t.cell_id))
                continue
            if whole is not None and whole.people is not None \
                    and not any(r.wc_group is not None for r in ys):
                whole.people = int(whole.people) + n
                named.append(_named("pin_added_to_whole", unit=y, day=d.isoformat(), cell=t.cell_id))
                counts["pins_written"] += 1
                continue
            r = PPWorkCenterDaily(manager_id=y, date=d, work_center=raw, wc_group=L, people=n)
            db.add(r)
            ys.append(r)
            counts["pins_written"] += 1

        # Штатка of a code that left whole goes onto the new unit's whole row.
        for x in sources:
            if x in done_as_is:
                continue
            stay = plan.stayers.get(x) or {}
            if stay:
                continue
            w = next((s["shtatka"] for s in saved.get(x) or []
                      if s["wc_group"] is None and s["shtatka"] is not None), None)
            if w is None:
                continue
            y = plan.whole.get(x)
            if y is None:
                named.append(_named("shtatka_dropped", unit=x, day=d.isoformat()))
                continue
            ys = pins.setdefault(y, [])
            whole = next((r for r in ys if r.wc_group is None), None)
            if whole is None:
                raw = next((s["work_center"] for s in saved[x] if s["wc_group"] is None), code)
                r = PPWorkCenterDaily(manager_id=y, date=d, work_center=raw, shtatka=w)
                db.add(r)
                ys.append(r)
            elif whole.shtatka is None:
                whole.shtatka = w
            else:
                named.append(_named("shtatka_dropped", unit=y, day=d.isoformat()))
        db.flush()
    for x, n in kept_whole.items():
        named.append(_named("x_whole_pin_kept", unit=x, days=n))


# ── the follow of one group ─────────────────────────────────────────────────

def _labor_by_day(lab: dict) -> dict[str, tuple[float, float]]:
    out: dict = defaultdict(lambda: [0.0, 0.0])
    for (_m, day, _wc), (p, a) in lab.items():
        out[day][0] += p
        out[day][1] += a
    return {k: (v[0], v[1]) for k, v in out.items()}


def _unit_day(lab: dict) -> dict[tuple[int, str], tuple[float, float]]:
    out: dict = defaultdict(lambda: [0.0, 0.0])
    for (m, day, _wc), (p, a) in lab.items():
        out[(m, day)][0] += p
        out[(m, day)][1] += a
    return {k: (v[0], v[1]) for k, v in out.items()}


def _impact(lab0: dict, lab1: dict, ppl0: dict, ppl1: dict) -> dict:
    a, b = _unit_day(lab0), _unit_day(lab1)
    out: dict = {}
    for key in sorted(set(a) | set(b) | set(ppl0) | set(ppl1)):
        m, day = key
        pa, pb = a.get(key, (0.0, 0.0)), b.get(key, (0.0, 0.0))
        n0, n1 = ppl0.get(key), ppl1.get(key)
        if abs(pa[0] - pb[0]) <= _EPS and abs(pa[1] - pb[1]) <= _EPS and n0 == n1:
            continue
        out.setdefault(str(m), {})[day] = {
            "plan": [round(pa[0], 2), round(pb[0], 2)],
            "actual": [round(pa[1], 2), round(pb[1], 2)],
            "people": [n0, n1]}
    return out


def _mark_event(db: Session, cell: Cell, h: date, now: datetime, vfx: dict) -> CellLinkEvent:
    """An inert `manager_id` event (value = prev) that carries a letter's
    history from `h` for a cell that has no landing event on that day — the
    retroactive one-shot's moves made before link events existed (§1.8).
    `cell_links` keeps it out of every unit resolution and history."""
    from app.services.cell_links import TZ
    ev = CellLinkEvent(cell_id=cell.id, field="manager_id", value=cell.manager_id,
                       prev=cell.manager_id, effective_from=h,
                       effective_at=datetime.combine(h, time(0), tzinfo=TZ), applied_at=now,
                       src="catalog_follow", vfx={"catalog_mark": True, **vfx})
    db.add(ev)
    return ev


def _tkey(t: Transfer):
    """A transfer's record key: its landing event — or, for a retroactive
    transfer of a cell that moved before link events existed (no event), the
    cell and its move day."""
    return t.event_id if t.event_id is not None else ("cell", t.cell_id, t.home_from)


def _transfer_rows(db: Session, transfers: list[Transfer]) -> dict:
    """{`_tkey`: the transfer's existing record}. An event-less transfer is
    matched only to a record still waiting for a retry — a final one is an
    audit, never written over."""
    out: dict = {}
    eids = [t.event_id for t in transfers if t.event_id is not None]
    if eids:
        out.update({r.event_id: r for r in db.query(PPCatalogMove).filter(
            PPCatalogMove.event_id.in_(eids)).all()})
    loose = {t.cell_id for t in transfers if t.event_id is None}
    if loose:
        for r in (db.query(PPCatalogMove).filter(
                PPCatalogMove.event_id.is_(None), PPCatalogMove.cell_id.in_(loose),
                PPCatalogMove.state.in_(RETRY)).order_by(PPCatalogMove.id).all()):
            out.setdefault(("cell", r.cell_id, r.home_from), r)
    return out


def _row_for(existing: dict, t: Transfer) -> PPCatalogMove:
    r = existing.get(_tkey(t))
    return r if r is not None else PPCatalogMove(event_id=t.event_id, cell_id=t.cell_id)


def _fill_row(r: PPCatalogMove, t: Transfer, *, kind: str, state: str, code: str,
              S: Optional[date] = None, **kw) -> PPCatalogMove:
    r.kind = kind
    r.state = state
    r.cell_id = t.cell_id
    r.code = (code or "")[:32]
    r.from_unit = t.src
    r.to_unit = t.dst
    r.home_from = t.home_from
    r.storage_from = S
    r.letter_from = _g(t.letter_src)
    r.letter_to = kw.pop("letter_to", None)
    r.whole_code = bool(kw.pop("whole_code", False))
    for k in ("line_ids", "lines", "wc_ids", "wc_dropped", "versions", "named"):
        setattr(r, k, kw.pop(k, None) or [])
    for k in ("letters", "rekey", "impact"):
        setattr(r, k, kw.pop(k, None) or {})
    r.next_try_at = None
    r.error = None
    r.by_name = kw.pop("by_name", None)
    return r


def _diff_audit(before: dict, after: dict, *, unit: int, row: PPCatalogVersion) -> Optional[dict]:
    """One version's rewrite, undoable: the entries removed whole, the ids
    added, every field changed."""
    removed, added, added_wc, changed = [], [], [], []
    for table, key in (("line", "lines"), ("wc", "work_centers")):
        b = {d.get("id"): d for d in before.get(key) or []}
        a = {d.get("id"): d for d in after.get(key) or []}
        for i, d in b.items():
            if i not in a:
                removed.append({**_jsonable(d), "table": table})
            else:
                for f in sorted(set(d) | set(a[i])):
                    if d.get(f) != a[i].get(f):
                        changed.append({"table": table, "id": i, "field": f,
                                        "was": _iso(d.get(f)), "now": _iso(a[i].get(f))})
        for i in a:
            if i not in b:
                (added if table == "line" else added_wc).append(i)
    if not (removed or added or added_wc or changed):
        return None
    return {"version_id": row.id, "unit": unit, "from": _iso(row.valid_from),
            "to": _iso(row.valid_to), "removed": removed, "added": added,
            "added_wc": added_wc, "changed": changed}


def _line_entry(d: dict, src_letter, joined: dict) -> dict:
    return {"id": d.get("id"), "qty_key": daily_key(d.get("sap_code"), d.get("name")),
            "wc": d.get("work_center") or "", "wc_n": norm_code(d.get("work_center")),
            "base": _line_base(d), "group_from": src_letter, "group_to": _g(d.get("wc_group")),
            "active_after": _active(d), "joined_into": joined.get(d.get("id")),
            "takes_sap": takes_sap(d.get("sap_code"), d.get("auto_fill"))}


def follow_group(db: Session, transfers: list[Transfer], *, kind: str, strict: bool = False,
                 dry: bool = False, now: Optional[datetime] = None) -> GroupResult:
    """Follow one group of transfers — one move day `h`, one code — and record
    each (one `PPCatalogMove` per transfer, updated in place for a retried
    event). The caller commits; with `dry` the caller rolls back (the rows
    come back unsaved, state `dry`).

    Order: validate → plan → a group owning nothing takes no lock and writes
    `nothing` → every unit's `NS_CAT` and `NS_QTY` lock, TRIED (busy → state
    `busy`: nothing written, the waiting transfers' rows handed back unsaved —
    the caller keeps the rows of what was settled without a lock, a cell with
    no code or archived, and records the retry of the rest) → the per-day
    identities and minutes before → `align` at `h` (→ S) → the window [h, S)
    rewritten version by version → the current rows → the cells' letters,
    their history dated from `h` → the per-day rows → the conservation check →
    the rows.

    `strict` (the retroactive one-shot): any condition of `STRICT_STOP`, the
    conservation check included, leaves the catalog untouched (a savepoint is
    rolled back) and records the transfers `named`. `kind` live | late | retro;
    a live follow whose `S` came out later than `h` is recorded `late`."""
    from app.services import cell_archive

    now = now or datetime.now(timezone.utc)
    if not transfers:
        return GroupResult("nothing", None, [], {}, {})
    h = transfers[0].home_from
    if any(t.home_from != h for t in transfers):
        raise ValueError("catalog_follow.follow_group: one group, one move day")
    cells = {c.id: c for c in db.query(Cell).filter(
        Cell.id.in_([t.cell_id for t in transfers])).all()}
    eids = [t.event_id for t in transfers if t.event_id is not None]
    events = {e.id: e for e in db.query(CellLinkEvent).filter(CellLinkEvent.id.in_(eids)).all()} \
        if eids else {}
    existing = _transfer_rows(db, transfers)

    # ── validate ──
    settled: list[tuple[Transfer, str, list]] = []
    valid: list[Transfer] = []
    code = None
    for t in transfers:
        c = cells.get(t.cell_id)
        cc = norm_code(c.sap_code) if c is not None else ""
        if c is None:
            settled.append((t, "nothing", [_named("cell_gone", cell=t.cell_id)]))
        elif t.src is None:
            settled.append((t, "nothing", [_named("from_no_unit", cell=t.cell_id)]))
        elif not cc:
            settled.append((t, "nothing", [_named("no_code", cell=t.cell_id)]))
        elif not cell_archive.alive(c, h):
            settled.append((t, "nothing", [_named("archived", cell=t.cell_id)]))
        else:
            if code is None:
                code = cc
            elif cc != code:
                raise ValueError("catalog_follow.follow_group: one group, one code")
            valid.append(t)
    pre_named: list = []
    for t in valid:
        ev = events.get(t.event_id)
        at_req = (ev.vfx or {}).get("sap_code_at_request") if ev is not None else None
        if at_req is not None and norm_code(at_req) != code:
            pre_named.append(_named("code_changed", cell=t.cell_id, was=norm_code(at_req), now=code))
        if t.dst is None:
            pre_named.append(_named("to_no_unit", cell=t.cell_id, unit=t.src))

    def by_name(t):
        ev = events.get(t.event_id)
        return getattr(ev, "by_name", None)

    def record(rows_in: list) -> list:
        """The rows of transfers settled without moving anything — added to
        the session, or (`dry`) handed back unsaved."""
        out = []
        for t, st, nm in rows_in:
            c = cells.get(t.cell_id)
            r = PPCatalogMove(event_id=t.event_id, cell_id=t.cell_id) if dry \
                else _row_for(existing, t)
            _fill_row(r, t, kind=kind, state="dry" if dry else st,
                      code=norm_code(c.sap_code) if c is not None else "",
                      by_name=by_name(t), named=nm or [])
            if not dry:
                db.add(r)
                ev = events.get(t.event_id)
                if ev is not None:
                    ev.vfx = {**(ev.vfx or {}), "catalog_follow": {
                        "state": r.state, "storage_from": None, "lines": 0, "letter_to": None,
                        "at": now.isoformat()}}
            out.append(r)
        return out

    settled_rows = record(settled)
    if not valid:
        return GroupResult("nothing", None, settled_rows,
                           {"named": [n for _t, _s, nm in settled for n in nm]}, {})

    plan = build_plan(db, valid)
    plan.named = pre_named + plan.named
    units = sorted({t.src for t in valid} | {t.dst for t in valid if t.dst is not None})

    def group_named(extra_named=()) -> list:
        return _merge_named([*plan.named, *extra_named])

    def per_transfer(named: list, t: Transfer) -> list:
        return [n for n in named if n.get("cell") in (None, t.cell_id)]

    def owned_nothing(ts) -> list:
        """§1.10: the cell left positions at its code behind and owned none of
        them (an unlettered cell among lettered ones) — said, so a person can
        letter it. A cell whose old unit had nothing at the code is not."""
        out = []
        for t in ts:
            if t.dst is not None and own.lines_at(pp_catalog.current(db, t.src).active_lines,
                                                  code):
                out.append(_named("owned_nothing", cell=t.cell_id))
        return out

    def nothing_rows(named: list, state="nothing") -> GroupResult:
        rows = record([(t, ("named" if t.dst is None else state), per_transfer(named, t))
                       for t in valid])
        return GroupResult("nothing" if state == "nothing" else state, None,
                           settled_rows + rows, {"named": named}, {})

    stop_now = [n for n in plan.named if n["kind"] in STRICT_STOP]
    if strict and stop_now:
        return nothing_rows(group_named(), state="named")

    moves, probe_named = _probe(db, plan, units)
    if not moves:
        named = group_named(n for n in probe_named if n["kind"] in STRICT_STOP)
        named += owned_nothing(valid)
        return nothing_rows(named)
    if strict and any(n["kind"] in STRICT_STOP for n in probe_named):
        return nothing_rows(group_named(probe_named), state="named")

    # ── the locks — tried, never waited on ──
    if not (pp_catalog.lock(db, units, try_=True)
            and pp_catalog.lock(db, units, ns=pp_catalog.NS_QTY, try_=True)):
        # Transient: the caller records the retry itself (these rows are unsaved).
        rows = [_fill_row(PPCatalogMove(event_id=t.event_id, cell_id=t.cell_id), t, kind=kind,
                          state="busy", code=norm_code(cells[t.cell_id].sap_code),
                          by_name=by_name(t))
                for t in valid]
        return GroupResult("busy", None, settled_rows + rows, {"named": []}, {})
    moves, probe_named = _probe(db, plan, units)
    if not moves:
        named = group_named()
        named += owned_nothing(valid)
        return nothing_rows(named)

    sp = db.begin_nested()
    try:
        res = _apply(db, plan, units, cells, events, now=now)
    except Exception:
        sp.rollback()
        raise
    named = group_named(res["named"])
    if strict and any(n["kind"] in STRICT_STOP for n in named):
        sp.rollback()
        return nothing_rows(named, state="named")
    sp.commit()

    S = res["S"]
    eff_kind = "late" if (kind == "live" and S > h) else kind
    report = {"named": named, "S": _iso(S), "versions": res["versions"], "rekey": res["rekey"],
              "letters": res["letters"], "joined": res["joined"], "lines": len(res["line_ids"]),
              "wc": len(res["wc_ids"]), "conservation": res["conservation"]}

    rows = []
    any_moved = False
    for t in valid:
        mine = sorted(i for i, o in res["owner"].items() if o == t.cell_id)
        shared = sorted(i for i, o in res["owner"].items()
                        if o is None and res["src"].get(i) == t.src and t.dst is not None
                        and plan.whole.get(t.src) == t.dst)
        ids = sorted(set(mine) | set(shared))
        wc_ids = sorted(i for i, (x, y) in res["wc_moved"].items()
                        if t.dst is not None and x == t.src and y == t.dst)
        if t.dst is None:
            st = "named"
        elif ids or wc_ids:
            st = "moved"
            any_moved = True
        else:
            st = "nothing"
        nm = per_transfer(named, t)
        if st == "nothing":
            nm = nm + owned_nothing([t])
        r = PPCatalogMove(event_id=t.event_id, cell_id=t.cell_id) if dry else _row_for(existing, t)
        _fill_row(r, t, kind=eff_kind, state=("dry" if dry else st), code=plan.code,
                  S=(S if st == "moved" else None), by_name=by_name(t),
                  letter_to=plan.letter_dst.get(t.cell_id) if t.dst is not None else None,
                  whole_code=plan.whole.get(t.src) is not None,
                  line_ids=ids, lines=[res["entries"][i] for i in ids if i in res["entries"]],
                  wc_ids=wc_ids,
                  wc_dropped=[w for w in res["wc_dropped"] if w.get("unit") == t.src
                              and plan.whole.get(t.src) == t.dst],
                  versions=res["versions"], letters=res["letters"], rekey=res["rekey"],
                  named=nm, impact=res["impact"])
        if not dry:
            db.add(r)
        rows.append(r)
        ev = events.get(t.event_id)
        if ev is not None and not dry:
            ev.vfx = {**(ev.vfx or {}), "catalog_follow": {
                "state": st, "storage_from": _iso(S), "lines": len(ids),
                "letter_to": plan.letter_dst.get(t.cell_id), "at": now.isoformat()}}
    if not dry:
        db.flush()
    state = ("dry" if dry else "moved") if any_moved else ("dry" if dry else "nothing")
    return GroupResult(state, S, settled_rows + rows, report, res["impact"])


def _apply(db: Session, plan: Plan, units: list[int], cells: dict, events: dict, *,
           now: datetime) -> dict:
    """The writes of one follow, under the group's locks, inside the caller's
    savepoint. Returns what the rows record."""
    from app.services import cell_links, zagruzka_source

    h = plan.home_from
    last = _last_stored(db, units, h)
    before_ident = identities(db, units, h, last)
    lab0 = zagruzka_source.wc_labor(db, units, h, last)
    ppl0 = zagruzka_source.unit_people(zagruzka_source.typed_pins(db, units, h, last))
    named: list = [_named("dst_was_empty", unit=y)
                   for y in sorted({t.dst for t in plan.transfers if t.dst is not None})
                   if pp_catalog.is_empty(db, y)]
    S = pp_catalog.align(db, units, h, REASON)
    plan.storage_from, plan.now = S, now

    owner: dict = {}
    src: dict = {}
    joined: dict = {}
    wc_moved: dict = {}
    wc_dropped: dict = {}
    entries: dict = {}
    versions: list = []

    def take(rep: dict, out: dict, ins: dict) -> None:
        named.extend(rep["named"])
        owner.update(rep["owner"])
        src.update(rep["src"])
        joined.update(rep["joined"])
        wc_moved.update(rep["wc_moved"])
        for w in rep["dropped_wc"]:
            wc_dropped[w.get("id")] = {k: _iso(w.get(k)) for k in
                                       ("id", "unit", "code", "shtatka", "capacity", "active")}
        before = {d.get("id"): d for c in ins.values() for d in c.get("lines") or []}
        for u, c in out.items():
            for d in c["lines"]:
                pid = d.get("id")
                if pid in rep["moved"]:
                    b = before.get(pid) or {}
                    entries[pid] = _line_entry(d, _g(b.get("wc_group")), rep["joined"])

    # ── the window [h, S): versions, sub-interval by sub-interval ──
    if h < S:
        bounds = {h}
        for u in units:
            for v in pp_catalog.versions_between(db, u, h, S - timedelta(days=1)):
                if v.valid_from is not None and h < v.valid_from < S:
                    bounds.add(v.valid_from)
        bounds = sorted(bounds)
        for u in units:
            for b in bounds:
                pp_catalog.split_at(db, u, b)
        for i, a in enumerate(bounds):
            z = (bounds[i + 1] if i + 1 < len(bounds) else S) - timedelta(days=1)
            vrows = {}
            for u in units:
                got = pp_catalog.versions_between(db, u, a, a)
                if len(got) != 1 or got[0].valid_from != a or got[0].valid_to != z:
                    raise RuntimeError(f"catalog_follow: unit {u} has no version exactly [{a}, {z}]")
                vrows[u] = got[0]
            ins = {u: {"lines": [dict(d) for d in v.lines or []],
                       "work_centers": [dict(d) for d in v.work_centers or []]}
                   for u, v in vrows.items()}
            out, rep = transform(ins, plan, current=False)
            take(rep, out, ins)
            for u, v in vrows.items():
                audit = _diff_audit(ins[u], out[u], unit=u, row=v)
                if audit is not None:
                    pp_catalog.rewrite_version(db, v, out[u]["lines"], out[u]["work_centers"])
                    versions.append(audit)
        db.flush()

    # ── the current rows ──
    orm_lines, orm_wcs = {}, {}
    ins = {}
    for u in units:
        cat = pp_catalog.current(db, u)
        for p in cat.lines:
            orm_lines[p.id] = p
        for w in cat.work_centers:
            orm_wcs[w.id] = w
        ins[u] = _contents({"lines": cat.lines, "work_centers": cat.work_centers}, lines_extra=True)
    out, rep = transform(ins, plan, current=True)
    take(rep, out, ins)
    unit_in = {d["id"]: u for u, c in ins.items() for d in c["lines"]}
    unit_out = {d["id"]: (u, d) for u, c in out.items() for d in c["lines"]}
    for pid, u0 in unit_in.items():
        row = orm_lines[pid]
        if pid not in unit_out:
            db.delete(row)
            continue
        u1, d = unit_out[pid]
        if u1 != u0:
            row.manager_id = u1
        for f in ("wc_group", "sort_order", "active", "archived_at", "archived_by", "archived_from"):
            if getattr(row, f) != d.get(f):
                setattr(row, f, d.get(f))
    wc_in = {d["id"]: u for u, c in ins.items() for d in c["work_centers"]}
    wc_out = {d["id"]: (u, d) for u, c in out.items() for d in c["work_centers"]}
    for wid, u0 in wc_in.items():
        row = orm_wcs[wid]
        if wid not in wc_out:
            db.delete(row)
            continue
        u1, d = wc_out[wid]
        if u1 != u0:
            row.manager_id = u1
        if bool(row.active) != bool(d.get("active")):
            row.active = bool(d.get("active"))

    # ── the cells' letters, dated from h ──
    letters: dict = {}
    changes: dict = {}
    for t in plan.transfers:
        if t.dst is None or t.cell_id not in plan.letter_dst:
            continue
        c = cells[t.cell_id]
        new = plan.letter_dst[t.cell_id]
        if _g(c.wc_group) != new:
            changes[c.id] = (cell_links.letter_on(c, h - timedelta(days=1)), new)
    sib: dict = {}
    for y, (s_id, ls) in plan.sibling.items():
        s = cells.get(s_id) or db.get(Cell, s_id)
        cells[s_id] = s
        if _g(s.wc_group) != ls:
            sib[s_id] = cell_links.letter_on(s, h - timedelta(days=1))
            changes[s_id] = (sib[s_id], ls)
    marks: dict = {}
    first_ev = None
    for t in sorted(plan.transfers, key=lambda t: (t.event_id is None, t.event_id or 0, t.cell_id)):
        if t.cell_id in changes and t.cell_id not in sib:
            was = changes[t.cell_id][0]
            ev = events.get(t.event_id)
            if ev is not None:
                if "wc_group_was" not in (ev.vfx or {}):
                    ev.vfx = {**(ev.vfx or {}), "wc_group_was": was}
            else:
                marks[t.cell_id] = _mark_event(db, cells[t.cell_id], h, now, {"wc_group_was": was})
        if first_ev is None:
            first_ev = events.get(t.event_id) or marks.get(t.cell_id)
    if sib:
        if first_ev is None:
            t0 = min(plan.transfers, key=lambda t: t.cell_id)
            first_ev = marks[t0.cell_id] = _mark_event(db, cells[t0.cell_id], h, now, {})
        stamp = dict((first_ev.vfx or {}).get("siblings_was") or {})
        for s_id, was in sib.items():
            stamp.setdefault(str(s_id), was)
        first_ev.vfx = {**(first_ev.vfx or {}), "siblings_was": stamp}
    if changes:
        # Dropped, flushed, restored: two cells trading letters inside one unit
        # would otherwise meet on uq_cells_wc_group half-way.
        for cid in changes:
            cells[cid].wc_group = None
        db.flush()
        for cid, (_was, new) in changes.items():
            cells[cid].wc_group = new
        letters = {str(cid): [was, new] for cid, (was, new) in changes.items()}
    db.flush()

    # ── the per-day rows from h ──
    after_ident = identities(db, units, h, last)
    pb, pa = _positions(before_ident), _positions(after_ident)
    counts: Counter = Counter()
    line_idx = _rekey_line_daily(db, units, h, last, pb, pa, set(joined), counts, named)
    arrived = _rekey_daily(db, units, h, last, pb, pa, line_idx, counts, named)
    _rekey_pins(db, plan, units, h, last, counts, named)

    off = {m for (m,) in db.query(PPManagerSetting.manager_id).filter(
        PPManagerSetting.manager_id.in_(units), PPManagerSetting.auto_fill.is_(False)).all()}
    for t in plan.transfers:
        if t.dst is not None and (t.src in off) != (t.dst in off):
            named.append(_named("autofill_differs", cell=t.cell_id, unit=t.dst))
    for y, pairs in arrived.items():
        if y in off or not pairs or not any(t.src in off for t in plan.transfers if t.dst == y):
            continue
        _rejoin(db, y, pairs, h, counts, named)
    db.flush()

    # ── conservation (§1.7) ──
    lab1 = zagruzka_source.wc_labor(db, units, h, last)
    ppl1 = zagruzka_source.unit_people(zagruzka_source.typed_pins(db, units, h, last))
    t0, t1 = _labor_by_day(lab0), _labor_by_day(lab1)
    deltas = {}
    for day in sorted(set(t0) | set(t1)):
        a, b = t0.get(day, (0.0, 0.0)), t1.get(day, (0.0, 0.0))
        dp, da = b[0] - a[0], b[1] - a[1]
        if abs(dp) > _EPS or abs(da) > _EPS:
            deltas[day] = [round(dp, 4), round(da, 4)]
    allowed = bool(joined) or any(n["kind"] == "y_snapshot_kept" for n in named)
    conservation = {"ok": not deltas, "deltas": deltas}
    if deltas:
        within = all(dp <= _EPS and da <= _EPS for dp, da in deltas.values())
        conservation["explained"] = allowed and within
        named.append(_named("conservation" if not (allowed and within) else "conservation_explained",
                            days=sorted(deltas)[:20]))

    return {"S": S, "named": named, "owner": owner, "src": src, "joined": joined,
            "wc_moved": wc_moved, "wc_dropped": list(wc_dropped.values()), "entries": entries,
            "line_ids": sorted(owner), "wc_ids": sorted(wc_moved), "versions": versions,
            "letters": letters, "rekey": dict(counts),
            "impact": _impact(lab0, lab1, ppl0, ppl1), "conservation": conservation}


def _rejoin(db: Session, unit: int, pairs: set, h: date, counts: Counter, named: list) -> None:
    """A position moved from a unit kept by hand into one the SAP file fills:
    fill its snapshot from the stored files from `h` on — never committing,
    the follow is one transaction (`production._rejoin_lines(commit=False)`)."""
    try:
        from app.routers import production
        fn = production._rejoin_lines
        if "commit" not in inspect.signature(fn).parameters:
            named.append(_named("rejoin_skipped", unit=unit))
            return
        got = fn(db, unit, set(pairs), since=h, commit=False)
        counts["rejoined"] += int((got or {}).get("rows") or 0)
    except Exception:  # noqa: BLE001 — a snapshot never holds a move back
        log.exception("catalog follow: rejoin failed for unit %s", unit)
        named.append(_named("rejoin_failed", unit=unit))


# ── the sweep ───────────────────────────────────────────────────────────────

_SWEEP = threading.Lock()


def _bind():
    from app.database import SessionLocal
    return SessionLocal.kw.get("bind")


def _claim():
    """The platform-wide sweep slot, on a connection of its own for the whole
    pass (a Session hands its connection back at every commit — the
    leader-AI drain's lesson). None = another copy holds it; True = no
    advisory locks here (not Postgres)."""
    eng = _bind()
    if eng is None or eng.dialect.name != "postgresql":
        return True
    try:
        conn = eng.connect()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: no connection for the sweep lock")
        return None
    try:
        got = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": SWEEP_LOCK}).scalar())
        conn.commit()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: could not ask for the sweep lock")
        got = False
    if got:
        return conn
    conn.close()
    return None


def _release(conn) -> None:
    if conn is True or conn is None:
        return
    try:
        conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": SWEEP_LOCK})
        conn.commit()
    except Exception:  # noqa: BLE001
        pass
    finally:
        try:
            conn.close()
        except Exception:  # noqa: BLE001
            pass


def _mark(vfx) -> bool:
    return isinstance(vfx, dict) and bool(vfx.get("catalog_mark"))


def _candidates(db: Session, now: datetime) -> list[list[Transfer]]:
    """The groups to follow now, grouped by (move day, code).

    Per cell, its EARLIEST transfer that is not final — an applied brigadir
    change from `FOLLOW_FROM` on, or a retroactive transfer of a cell with no
    landing event that is waiting for a retry — and only when it has no record
    yet or its retry is due: a later change of the same cell waits for it. A
    group goes whole or not at all.

    And across cells: a move waits while an EARLIER move at the same code, out
    of or into one of its units, is not final. Until that one is followed its
    positions still stand in the old unit with nobody there to own them, and
    the later move would take them as its own (an orphan letter is unclaimed,
    a lone departer owns everything unclaimed)."""
    E = CellLinkEvent
    evs = (db.query(E).filter(E.field == "manager_id", E.applied_at.isnot(None),
                              E.effective_from >= FOLLOW_FROM,
                              E.value.is_distinct_from(E.prev))
           .order_by(E.cell_id, E.effective_from, E.id).all())
    evs = [e for e in evs if not _mark(e.vfx)]
    rows = {r.event_id: r for r in db.query(PPCatalogMove).filter(
        PPCatalogMove.event_id.in_([e.id for e in evs])).all()} if evs else {}
    items: dict[int, list] = defaultdict(list)       # cell → [(h, rank, id, event, row)]
    for e in evs:
        r = rows.get(e.id)
        if r is not None and r.state in FINAL:
            continue
        items[e.cell_id].append((e.effective_from, 1, e.id, e, r))
    for r in db.query(PPCatalogMove).filter(PPCatalogMove.event_id.is_(None),
                                            PPCatalogMove.state.in_(RETRY)).all():
        items[r.cell_id].append((r.home_from, 0, r.id, None, r))
    if not items:
        return []
    heads = {cid: min(its, key=lambda i: i[:3]) for cid, its in items.items()}
    cells = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(list(heads))).all()}

    def code_of(cid):
        return norm_code(getattr(cells.get(cid), "sap_code", None))

    def units_of(head) -> set:
        _h, _k, _i, e, r = head
        pair = (e.prev, e.value) if e is not None else (r.from_unit, r.to_unit)
        return {u for u in pair if u is not None}

    def due(r) -> bool:
        return r is None or r.state == "dry" or (
            r.state in RETRY and (r.next_try_at is None or r.next_try_at <= now))

    groups: dict = defaultdict(list)
    waits: set = set()
    for cid, head in heads.items():
        h, _k, _i, e, r = head
        code = code_of(cid)
        units = units_of(head)
        # A group is followed WHOLE — its letters are settled together — so one
        # member that has to wait holds the whole group back.
        if not due(r) or (code and any(
                o != cid and oh[0] < h and code_of(o) == code and units & units_of(oh)
                for o, oh in heads.items())):
            waits.add((h, code))
        if e is None:
            groups[(h, code)].append(Transfer(
                cell_id=cid, event_id=None, src=r.from_unit, dst=r.to_unit, home_from=h,
                letter_src=_g(r.letter_from)))
            continue
        c = cells.get(cid)
        vfx = e.vfx if isinstance(e.vfx, dict) else {}
        if "letter_before" in vfx:
            letter = vfx["letter_before"]
        elif "wc_group_was" in vfx:
            letter = vfx["wc_group_was"]
        else:
            letter = getattr(c, "wc_group", None)
        groups[(h, code)].append(Transfer(
            cell_id=cid, event_id=e.id, src=e.prev, dst=e.value, home_from=h,
            letter_src=_g(letter)))
    return [sorted(v, key=lambda t: t.cell_id) for k, v in sorted(groups.items())
            if k not in waits]


def _group_kind(db: Session, transfers: list[Transfer]) -> str:
    """A group retried by the sweep keeps the kind it was first followed as: a
    retroactive transfer (the one-shot recorded it `busy`) is followed STRICT
    again, never as a live one."""
    return "retro" if any(r.kind == "retro" for r in _transfer_rows(db, transfers).values()) \
        else "live"


def _record_retry(transfers: list[Transfer], state: str, error: Optional[str],
                  now: datetime, kind: str = "live") -> list[dict]:
    """A `busy` / `failed` group, in its own transaction: tries counted, the
    next try at `now` + `BACKOFF_MIN`; past the last one, `gave_up`."""
    from app.database import SessionLocal
    out = []
    if not transfers:
        return out
    with SessionLocal() as db:
        existing = _transfer_rows(db, transfers)
        cells = {c.id: c for c in db.query(Cell).filter(
            Cell.id.in_([t.cell_id for t in transfers])).all()}
        for t in transfers:
            r = existing.get(_tkey(t))
            tries = (r.tries or 0) + 1 if r is not None else 1
            c = cells.get(t.cell_id)
            if r is None:
                r = PPCatalogMove(event_id=t.event_id, cell_id=t.cell_id)
                db.add(r)
            final = tries > len(BACKOFF_MIN)
            _fill_row(r, t, kind=kind, state="gave_up" if final else state,
                      code=norm_code(getattr(c, "sap_code", None)))
            r.tries = tries
            r.error = (error or None) and str(error)[:2000]
            r.next_try_at = None if final else now + timedelta(minutes=BACKOFF_MIN[tries - 1])
            out.append({"cell": getattr(c, "verifix_code", t.cell_id), "state": r.state,
                        "tries": tries, "error": r.error})
        db.commit()
    return out


def _summary(r: PPCatalogMove) -> dict:
    return {"cell": r.cell_id, "state": r.state, "from": r.from_unit, "to": r.to_unit,
            "h": _iso(r.home_from), "lines": len(r.line_ids or []),
            "named": [n.get("kind") for n in r.named or []]}


def _run_group(transfers: list[Transfer], now: datetime) -> dict:
    from app.database import SessionLocal
    from app.services import cell_register
    kind = "live"
    try:
        with SessionLocal() as db:
            kind = _group_kind(db, transfers)
            res = follow_group(db, transfers, kind=kind, strict=(kind == "retro"), now=now)
            if res.state == "busy":
                # What was settled without a lock (a cell with no code, one
                # archived …) stands; only the transfers that met the lock wait.
                waiting = {r.cell_id for r in res.rows if r.state == "busy"}
                settled = [_summary(r) for r in res.rows if r.state != "busy"]
                db.commit()
            else:
                waiting = None
                out = {"state": res.state, "rows": [_summary(r) for r in res.rows]}
                db.commit()
    except Exception as exc:  # noqa: BLE001 — retried with back-off
        log.exception("catalog follow: group failed")
        return {"retry": _record_retry(transfers, "failed", repr(exc), now, kind)}
    if waiting is not None:
        return {"rows": settled,
                "retry": _record_retry([t for t in transfers if t.cell_id in waiting],
                                       "busy", None, now, kind)}
    cell_register.after_commit()
    _forget_caches()
    return out


def _codes(transfers_rows: list) -> dict:
    from app.database import SessionLocal
    ids = {r["cell"] for r in transfers_rows if isinstance(r.get("cell"), int)}
    if not ids:
        return {}
    with SessionLocal() as db:
        return {c.id: c.verifix_code for c in db.query(Cell).filter(Cell.id.in_(ids)).all()}


def _report(results: list) -> None:
    """One Jurnal row per pass that did anything, one admin DM for what a
    person has to look at (named, gave up)."""
    rows = [r for res in results for r in res.get("rows") or []]
    retries = [r for res in results for r in res.get("retry") or []]
    if not rows and not retries:
        return
    codes = _codes(rows)
    tally = Counter(r["state"] for r in rows) + Counter(r["state"] for r in retries)
    details = [(f"catalog_{k}", v) for k, v in sorted(tally.items())]
    lines = []
    for r in rows:
        code = codes.get(r["cell"], r["cell"])
        lines.append(f"{code} {r['from']}→{r['to']} {r['h']}: {r['state']}"
                     + (f" · {r['lines']}" if r["lines"] else "")
                     + (f" · {', '.join(r['named'])}" if r["named"] else ""))
    for r in retries:
        lines.append(f"{r['cell']}: {r['state']} ({r['tries']})")
    # One Jurnal row, at most 40 detail rows in all — the tally first.
    details += [("catalog_cell", x) for x in lines[:max(0, 40 - len(details))]]
    try:
        from app.services import action_log
        action_log.record_system("org", "org.catalog_moved", details=details)
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: action log failed")
    tell = [x for x, r in zip(lines, rows + retries)
            if r.get("state") in ("named", "gave_up")
            or any(k in ATTENTION for k in r.get("named") or ())]
    if tell:
        import html
        text_ = ("📦 <b>Pozitsiyalar yacheyka bilan ko'chdi</b> — ko'rib chiqing:\n"
                 + "\n".join("• " + html.escape(x) for x in tell[:30])
                 + (f"\n… +{len(tell) - 30}" if len(tell) > 30 else "")
                 + "\n👉 /admin/upload?tab=logs")
        _dm(text_)


def _dm(text_: str) -> None:
    try:
        from app.routers.boot import _recipients
        from app.telegram_bot import bot
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text_[:4000], parse_mode="HTML")
            except Exception:  # noqa: BLE001
                pass
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: admin DM failed")


def run_sweep() -> None:
    """The minute job (and `kick`): follow every landed brigadir change that
    has not been followed. A no-op until the retroactive one-shot is `done`;
    one pass at a time across both app copies (`SWEEP_LOCK`) and inside this
    one; one transaction per group."""
    if not _SWEEP.acquire(blocking=False):
        return
    try:
        _sweep()
    except Exception:  # noqa: BLE001 — the next minute tries again
        log.exception("catalog follow: sweep failed")
    finally:
        _SWEEP.release()


def _sweep() -> None:
    from app.database import SessionLocal
    from app.services import cell_archive, cell_links
    with SessionLocal() as db:
        if not enabled(db):
            return
    conn = _claim()
    if conn is None:
        return
    try:
        # The dated links and archive spans are read through caches of
        # COMMITTED rows — a landing another copy committed a moment ago must
        # be seen.
        cell_links.forget()
        cell_archive.forget()
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            groups = _candidates(db, now)
        results = [_run_group(g, now) for g in groups]
        _report(results)
    finally:
        _release(conn)


def kick() -> None:
    """Run a sweep now, on a thread — called right after a brigadir change
    lands (`cell_links.run_apply_due`), so the positions follow within
    seconds rather than at the next minute. A sweep already running makes it
    a no-op; the minute job picks up anything it missed."""
    try:
        threading.Thread(target=run_sweep, name="catalog-follow-kick", daemon=True).start()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: kick failed")


def unsettled(db: Session, cell_ids: Iterable[int], day: date) -> set[int]:
    """The cells among `cell_ids` whose brigadir change has landed by `day`
    (from `FOLLOW_FROM` on) and whose positions have not followed it yet —
    no final record. Empty while the follow is off (`enabled`)."""
    ids = sorted({int(c) for c in cell_ids if c})
    if not ids or not enabled(db):
        return set()
    E = CellLinkEvent
    evs = [(eid, cid) for eid, cid, vfx in db.query(E.id, E.cell_id, E.vfx).filter(
        E.cell_id.in_(ids), E.field == "manager_id", E.applied_at.isnot(None),
        E.effective_from <= day, E.effective_from >= FOLLOW_FROM,
        E.value.is_distinct_from(E.prev)).all() if not _mark(vfx)]
    if not evs:
        return set()
    final = {eid for (eid,) in db.query(PPCatalogMove.event_id).filter(
        PPCatalogMove.event_id.in_([e for e, _c in evs]), PPCatalogMove.state.in_(FINAL)).all()}
    return {cid for eid, cid in evs if eid not in final}


def _forget_caches() -> None:
    """Drop every answer kept in memory that a moved position changes: the
    kept /zagruzka answers, the shift report, the «Liderlar KPI» plan half."""
    try:
        from app.services import kept_answer
        kept_answer.forget_all()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: kept answers not forgotten")
    try:
        from app.routers import shift_report
        with shift_report._cache_lock:
            shift_report._cache.clear()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: shift report cache not cleared")
    try:
        from app.services import leaders_kpi
        with leaders_kpi._plan_lock:
            leaders_kpi._plan_kept.clear()
    except Exception:  # noqa: BLE001
        log.exception("catalog follow: leaders KPI plan keep not cleared")
