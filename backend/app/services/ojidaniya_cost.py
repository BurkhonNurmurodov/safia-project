"""What a stopped cell COST in wages — /downtime → «Xarajat».

    xarajat(yacheyka, kun) = union_minutes ÷ 60 × odam soni × w(kun)

summed up a three-level tree: brigadir → yacheyka → toifa, with the filed
events themselves one tap below that. Nothing here is a new measurement — every
term is a figure the platform already publishes, reached through the module
that owns it:

* the MINUTES are ``idle_intervals.merged_spans`` / ``union_minutes``, the same
  union the загрузка reads and the bar-detail modal prints;
* the PEOPLE are ``idle_source.cell_headcount``, the very weight
  ``idle_source.unit_downtime`` divides by — never a second count of its own,
  or the cost and the load would disagree about how many people stood in a cell;
* the RATE is ``wage_rate.resolve``, per DAY, so a raise entered today cannot
  rewrite what last month cost.

Three rulings this module exists to hold, all of them the operator's:

**Only a STOPPED cell costs.** A wait the cell worked through cost nothing, so
``stopped`` is fixed here and is not a toggle the tab exposes. The page's
To'xtamaganda half has no meaning on this measure.

**Every category is priced, Cat H included.** A cell stopped for cleaning is
paying the same wages as a cell stopped for a broken mixer, so
``OJIDANIYA_ONLY_CATS`` is NOT applied. Consequence to know: this tab's minutes
read higher than /downtime's headline, which drops Cat H under «Zagruzkada
hisoblanadi». The category filter is how a reader takes one out.

**Each minute is paid ONCE.** A cell stopped at 10:00–10:40 for two causes filed
two events; the cell's figure is the UNION, so the 40 minutes are billed once.
A CATEGORY row unions within its own category — two overlapping events of one
cause are not double-paid either — but categories are summed ACROSS each other,
because a minute genuinely has two causes and both deserve to be named. So the
categories under a cell can total MORE than the cell, and every surface that
shows them says so. Never "fix" that by summing the categories into the cell:
the cell figure is the money, and money is not owed twice for one minute.

**Before `zagruzka_source.ZAGRUZKA_FROM` a unit is priced WHOLE, never per
cell** (the operator's directive, 2026-09-09). The typed «Odam soni fakt» is
what makes a per-cell headcount knowable, and it does not exist before that
day — so those days carry one figure per BRIGADIR: the unit's own ojidaniya
minutes (handed in from `_downtime`, the page's one computation, which already
merges the cells era and the «Смена отчёт» era) times the unit's «Одам сони»
sheet headcount, which is exactly what the загрузка itself divided by then.
The two halves of a period that straddles the floor sit under the same
brigadir: its cells from the floor on, plus ONE marked row for everything
before, so the brigadir's total is still their whole bill.

`mean × ΣN = Σ(Nᵢ·Tᵢ)` — `unit_downtime` returns the headcount-weighted mean,
so multiplying it by the unit's headcount gives back exactly the person-minutes
the per-cell method would have summed. The two regimes are the same arithmetic
at two levels of detail, not two different measures.

**A day the unit does not read from its cells is not priced.** ``uses_cells``
is the same gate ``_downtime`` applies — before ``idle_source.CELLS_FROM``
(earlier where the register moved a unit) the unit's ojidaniya came off the
«Смена отчёт» row, which carries category minutes, no cells, no clocks and no
headcount. Pricing its events anyway would bill minutes /downtime does not
count.

**An unknowable cost is «—» and a NAMED count, never 0.** A cell whose
headcount nobody typed, and a day inside a wage period nobody has filled in,
both leave the cost side while keeping their minutes on the minutes side. The
gap is published as ``unpriced_minutes`` at every level so a reader is told the
total is short rather than shown a total that quietly is.
"""
from collections import defaultdict
from datetime import date, timedelta
from typing import Callable, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import (Cell, CellOjidaniyaInterval, HeadcountData, Manager,
                        RoleProfile)
from app.services import idle_intervals, idle_source, zagruzka_source
from app.services.name_map import sheet_alias_map

# One row per event on the entries modal; a category on one cell over a couple
# of months is tens of rows, not thousands, but the endpoint takes a period.
MAX_ENTRIES = 2000


def _days(date_from: date, date_to: date) -> list[date]:
    n = (date_to - date_from).days + 1
    return [date_from + timedelta(days=i) for i in range(max(n, 0))]


def _iso(ddmmyyyy: str) -> Optional[str]:
    """«DD.MM.YYYY» (how the sheet tables key a day) → «YYYY-MM-DD»."""
    try:
        d, m, y = ddmmyyyy.split(".")
        return f"{y}-{m}-{d}"
    except (ValueError, AttributeError):
        return None


def unit_headcount(db: Session, managers: dict,
                   date_from: date, date_to: date) -> dict[tuple[int, str], float]:
    """``{(manager_id, "YYYY-MM-DD"): official_hc}`` — the «Одам сони» sheet.

    THE unit-level headcount for a day before `zagruzka_source.ZAGRUZKA_FROM`,
    and deliberately the same one the загрузка divided by then: a cost and a
    load that disagree about how many people a unit had are two accounts of one
    shift. A unit-day the sheet has no row for is ABSENT, never 0 — those
    minutes stay on the minutes side and are counted as unpriced.

    Keyed by NAME in the sheet and spelled in either alphabet, so it resolves
    through `sheet_alias_map` exactly as `_downtime` does; a name is not an
    address.
    """
    if not managers:
        return {}
    by_name = {m.name: mid for mid, m in managers.items() if m.name}
    alias = sheet_alias_map(db, by_name.keys())
    lo, hi = date_from.isoformat(), date_to.isoformat()

    out: dict[tuple[int, str], float] = {}
    for r in db.query(HeadcountData.manager_name, HeadcountData.date,
                      HeadcountData.official_hc).filter(
            HeadcountData.manager_name.in_(list(alias.keys()) or [""])).all():
        iso = _iso(r.date)
        if not iso or iso < lo or iso > hi:
            continue
        mid = by_name.get(alias.get(r.manager_name, r.manager_name))
        n = None if r.official_hc is None else float(r.official_hc)
        # A typed 0 is a real answer; only a missing row is "no headcount".
        if mid is not None and n is not None:
            out[(mid, iso)] = n
    return out


def _cells_of(db: Session, manager_ids: Iterable[int]) -> list:
    ids = list(manager_ids)
    if not ids:
        return []
    return db.query(Cell).filter(Cell.manager_id.in_(ids)).all()


def _leader_names(db: Session, cells) -> dict:
    """Leader id → name. COLUMNS, not the entity: this needs two fields, and
    selecting the whole row makes the query depend on every column the model
    has ever grown — the trap `idle_source._n_by_cell` documents for its own
    attendance query."""
    lids = {c.leader_id for c in cells if c.leader_id}
    if not lids:
        return {}
    return {r.id: r.name for r in db.query(RoleProfile.id, RoleProfile.name)
            .filter(RoleProfile.id.in_(lids)).all()}


def _events(db: Session, cells, days: list[str]) -> list:
    """Approved STOPPED events on these cells over these days.

    ``status == "approved"`` and ``stopped`` are both fixed: a rejected entry is
    not an ojidaniya, and a wait the cell worked through is not a cost.
    """
    if not cells or not days:
        return []
    return db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.cell_id.in_([c.id for c in cells]),
        CellOjidaniyaInterval.date.in_(days),
        CellOjidaniyaInterval.status == "approved",
        CellOjidaniyaInterval.stopped.is_(True),
    ).all()


def _row(rows) -> list[dict]:
    """Interval ORM rows → the dict shape ``idle_intervals`` consumes."""
    return [{"start": r.start, "end": r.end, "stopped": True} for r in rows]


def _union(rows) -> int:
    """The union of rows that all fall on ONE date."""
    return idle_intervals.union_minutes(
        idle_intervals._spans_of(_row(rows), stopped_only=False))


def _union_by_day(rows) -> int:
    """Σ over DATES of that date's own union.

    A union taken ACROSS dates is meaningless and silently wrong: clocks are
    stored as wall-clock "HH:MM" and `idle_intervals` reads them as
    minutes-of-day, so 17:10–17:25 filed on the 3rd and again on the 7th merge
    into a single 15-minute span. The entries modal spans a whole period, so it
    must fold per day first — six events over six days once reported a union of
    25 minutes against a sum of 75."""
    per: dict[str, list] = defaultdict(list)
    for r in rows:
        per[r.date].append(r)
    return sum(_union(v) for v in per.values())


class _Acc:
    """A running (minutes, priced minutes, person-minutes, cost) accumulator.

    ``person_min`` is what makes the displayed headcount honest: the figure
    shown beside a cell is Σ(T·N) ÷ ΣT over the days that were actually priced,
    i.e. the one N that reproduces the cost from the minutes beside it. A plain
    average over days would print a number the row's own arithmetic contradicts.
    """

    __slots__ = ("minutes", "priced", "person_min", "cost", "hc_lo", "hc_hi")

    def __init__(self):
        self.minutes = 0
        self.priced = 0
        self.person_min = 0.0
        self.cost = 0.0
        # The range of headcounts this row folds. «Odam soni» is a FACT — the
        # number a person typed — so it is never printed with a ~. Where a row
        # spans days that carried DIFFERENT headcounts the figure shown is the
        # minute-weighted mean of facts, and `hc_varies` is what lets the client
        # say so on hover instead of hedging the number itself.
        self.hc_lo = None
        self.hc_hi = None

    def add(self, minutes: int, n: Optional[float], rate: Optional[float]) -> None:
        self.minutes += minutes
        if n is None or rate is None or minutes <= 0:
            return
        self.priced += minutes
        self.person_min += minutes * n
        self.cost += minutes / 60.0 * n * rate
        self.hc_lo = n if self.hc_lo is None else min(self.hc_lo, n)
        self.hc_hi = n if self.hc_hi is None else max(self.hc_hi, n)

    def out(self) -> dict:
        priced = self.priced > 0
        return {
            "minutes": self.minutes,
            "hours": round(self.minutes / 60.0, 2),
            "priced_minutes": self.priced,
            "unpriced_minutes": self.minutes - self.priced,
            "cost": round(self.cost) if priced else None,
            "hc": round(self.person_min / self.priced, 2) if priced else None,
            "hc_lo": self.hc_lo,
            "hc_hi": self.hc_hi,
            "hc_varies": bool(priced and self.hc_lo != self.hc_hi),
        }


def build(db: Session, manager_ids: list[int], date_from: date, date_to: date,
          cats: list[str], rate_for: Callable[[date], Optional[float]],
          pre_rows: Optional[list[dict]] = None) -> dict:
    """The whole tree for one scope, plus the option lists the filters need.

    ``cats`` narrows which events are counted — and therefore the cell and
    brigadir unions too, since a filtered-out stoppage is not part of the answer
    the reader asked for. The option lists are built BEFORE that narrowing, so
    picking a category never shortens the list it was picked from.

    ``pre_rows`` are `_downtime`'s own rows for the part of the period BEFORE
    `zagruzka_source.ZAGRUZKA_FROM`. Handed in rather than computed here — that
    function is the page's one answer to «how many minutes did this unit wait»,
    and it already merges the cells era with the «Смена отчёт» era. They become
    ONE marked row per brigadir; see the module docstring.
    """
    managers = {m.id: m for m in db.query(Manager).filter(
        Manager.id.in_(manager_ids)).all()} if manager_ids else {}
    cells = _cells_of(db, managers)
    leaders = _leader_names(db, cells)

    units = idle_source.cell_units(db)
    # Per-cell pricing only reaches days the typed headcount reaches.
    cell_from = max(date_from, zagruzka_source.ZAGRUZKA_FROM)
    all_days = _days(cell_from, date_to)
    # Which (unit, day) pairs read their cells at all. One test per unit-day.
    ok_days: dict[int, set[str]] = {
        mid: {d.isoformat() for d in all_days if idle_source.uses_cells(units, mid, d)}
        for mid in managers
    }
    wanted_days = sorted({d for s in ok_days.values() for d in s})

    by_cell = {c.id: c for c in cells}
    # Only events on a day this unit actually reads from its cells. Applied
    # FIRST, so the option list below can never offer a category whose only
    # events sit on days this tab does not price.
    events = [e for e in _events(db, cells, wanted_days)
              if by_cell.get(e.cell_id) is not None
              and e.date in ok_days.get(by_cell[e.cell_id].manager_id, ())]

    # Option list — the org scope, unnarrowed by the record picks, so choosing
    # a category never shortens the list it was chosen from.
    categories = {e.category for e in events if e.category}

    if cats:
        keep = set(cats)
        events = [e for e in events if e.category in keep]

    hc = idle_source.cell_headcount(db, cells, cell_from, date_to)

    # (cell, day) → rows, and (cell, day, category) → rows.
    per_day: dict[tuple[int, str], list] = defaultdict(list)
    per_cat: dict[tuple[int, str, str], list] = defaultdict(list)
    for e in events:
        per_day[(e.cell_id, e.date)].append(e)
        per_cat[(e.cell_id, e.date, e.category)].append(e)

    cell_acc: dict[int, _Acc] = defaultdict(_Acc)
    cat_acc: dict[tuple[int, str], _Acc] = defaultdict(_Acc)
    # Σ of the per-category unions, i.e. what the categories under a cell add up
    # to. Compared against the cell's own union to say how many minutes carried
    # two causes at once — the one number that explains why they differ.
    cat_sum: dict[int, int] = defaultdict(int)

    for (cid, d), rows in per_day.items():
        n = hc.get((cid, d))
        rate = rate_for(date.fromisoformat(d))
        cell_acc[cid].add(_union(rows), n, rate)

    for (cid, d, cat), rows in per_cat.items():
        n = hc.get((cid, d))
        rate = rate_for(date.fromisoformat(d))
        m = _union(rows)
        cat_acc[(cid, cat)].add(m, n, rate)
        cat_sum[cid] += m

    # Every per-cell day is at or after the floor now, so the headcount behind
    # a CELL row is always the typed «Bugungi fakt». Earlier days never reach a
    # cell at all — they arrive as `pre_rows` and are priced on the unit's own
    # «Одам сони» sheet figure instead.
    hc_typed = True

    # ── roll up ──────────────────────────────────────────────────────────────
    cells_by_mgr: dict[int, list[dict]] = defaultdict(list)
    for cid, acc in cell_acc.items():
        c = by_cell.get(cid)
        if not c or acc.minutes <= 0:
            continue
        row = acc.out()
        row.update({
            "cell_id": cid,
            "code": c.verifix_code,
            "leader": leaders.get(c.leader_id),
            "hc_typed": hc_typed,
            "cat_sum": cat_sum.get(cid, 0),
            "cats": sorted(
                ({"category": cat, **a.out()}
                 for (ccid, cat), a in cat_acc.items() if ccid == cid),
                key=lambda r: (-r["minutes"], r["category"]),
            ),
        })
        cells_by_mgr[c.manager_id].append(row)

    # ── the pre-floor half: ONE row per brigadir, no cell breakdown ─────────
    # `_downtime` keys its days «DD.MM.YYYY» and has already applied the
    # day-close gate and the unit's own source rule, so a day it omitted is a
    # day the page does not report either.
    pre_by_mgr: dict[int, _Acc] = defaultdict(_Acc)
    pre_cats: set[str] = set()
    if pre_rows:
        unit_hc = unit_headcount(db, managers, date_from, date_to)
        wanted = set(cats) if cats else None
        for r in pre_rows:
            mid = r.get("manager_id")
            iso = _iso(r.get("date") or "")
            if mid is None or iso is None or mid not in managers:
                continue
            by_cat = r.get("by_category") or {}
            pre_cats.update(k for k, v in by_cat.items() if v)
            # With a category pick the figure is the SUM of the picked ones —
            # the same convention the page's own doughnut picks already use.
            # Unpicked, it is the day's own total, which is the union.
            minutes = (sum(float(by_cat.get(c) or 0) for c in wanted) if wanted
                       else float(r.get("total") or 0))
            if minutes <= 0:
                continue
            pre_by_mgr[mid].add(round(minutes), unit_hc.get((mid, iso)),
                                rate_for(date.fromisoformat(iso)))

    rows: list[dict] = []
    for mid in set(cells_by_mgr) | set(pre_by_mgr):
        cell_rows = cells_by_mgr.get(mid, [])
        m = managers.get(mid)
        if not m:
            continue
        # Cells rank by cost among themselves; the lump is a different KIND of
        # row, so it is appended after the sort and always sits last.
        cell_rows.sort(key=lambda r: (-(r["cost"] or 0), -r["minutes"]))
        pre = pre_by_mgr.get(mid)
        if pre is not None and pre.minutes > 0:
            # Marked, never disguised as a cell: `pre: True` and a NULL
            # cell_id are what tell the client to render it as the one lump
            # the operator asked for, with no chevron and no categories under
            # it — there is no per-cell answer to open.
            cell_rows = cell_rows + [{
                "cell_id": None, "code": None, "leader": None, "pre": True,
                "hc_typed": False, "cat_sum": 0, "cats": [], **pre.out(),
            }]
        acc = _Acc()
        for c in cell_rows:
            acc.minutes += c["minutes"]
            acc.priced += c["priced_minutes"]
            acc.cost += c["cost"] or 0
            if c["hc"] is not None:
                acc.person_min += c["hc"] * c["priced_minutes"]
            for v in (c.get("hc_lo"), c.get("hc_hi")):
                if v is None:
                    continue
                acc.hc_lo = v if acc.hc_lo is None else min(acc.hc_lo, v)
                acc.hc_hi = v if acc.hc_hi is None else max(acc.hc_hi, v)
        rows.append({
            "manager_id": mid,
            "manager": m.name,
            "shift": m.shift,
            **acc.out(),
            "cells": cell_rows,
        })
    rows.sort(key=lambda r: (-(r["cost"] or 0), -r["minutes"]))

    total = _Acc()
    for r in rows:
        total.minutes += r["minutes"]
        total.priced += r["priced_minutes"]
        total.cost += r["cost"] or 0
        if r["hc"] is not None:
            total.person_min += r["hc"] * r["priced_minutes"]
        for v in (r.get("hc_lo"), r.get("hc_hi")):
            if v is None:
                continue
            total.hc_lo = v if total.hc_lo is None else min(total.hc_lo, v)
            total.hc_hi = v if total.hc_hi is None else max(total.hc_hi, v)

    return {
        "rows": rows,
        "totals": {**total.out(), "days": len(all_days),
                   "managers": len(rows),
                   "cells": sum(len(r["cells"]) for r in rows)},
        "options": {
            "managers": sorted(
                ({"id": m.id, "name": m.name, "shift": m.shift}
                 for m in managers.values()),
                key=lambda r: (r["name"] or "").lower()),
            "cells": sorted(
                ({"id": c.id, "code": c.verifix_code,
                  "leader": leaders.get(c.leader_id), "manager_id": c.manager_id}
                 for c in cells),
                key=lambda r: (r["code"] or "").lower()),
            "categories": sorted(categories | pre_cats),
        },
    }


def entries(db: Session, manager_id: int, cell_id: int, category: Optional[str],
            date_from: date, date_to: date,
            rate_for: Callable[[date], Optional[float]]) -> dict:
    """Every filed event behind one (cell, category) cell of the tree.

    Each row is priced on its OWN minutes, which is what a person checking a
    figure expects to be able to add up. Where two events of this category
    overlap, that sum exceeds the union the table row shows — so both totals
    ride on the payload and the modal names them separately rather than
    printing one and letting the other be discovered. Same rule
    `UnitOjidaniyaModal` follows.
    """
    cell = db.query(Cell).filter(Cell.id == cell_id,
                                 Cell.manager_id == manager_id).first()
    if not cell:
        return {"entries": [], "sum_minutes": 0, "union_minutes": 0}

    units = idle_source.cell_units(db)
    days = [d.isoformat() for d in _days(date_from, date_to)
            if idle_source.uses_cells(units, manager_id, d)]
    rows = _events(db, [cell], days)
    if category:
        rows = [r for r in rows if r.category == category]
    rows.sort(key=lambda r: (r.date, idle_intervals.to_min(r.start) or 0), reverse=True)
    rows = rows[:MAX_ENTRIES]

    hc = idle_source.cell_headcount(db, [cell], date_from, date_to)

    out = []
    for r in rows:
        d = date.fromisoformat(r.date)
        n = hc.get((cell.id, r.date))
        rate = rate_for(d)
        m = idle_intervals.duration(r.start, r.end)
        out.append({
            "id": r.id,
            "date": r.date,
            "start": r.start,
            "end": r.end,
            "minutes": m,
            "hours": round(m / 60.0, 2),
            "hc": None if n is None else round(n, 2),
            "rate": rate,
            "cost": None if (n is None or rate is None) else round(m / 60.0 * n * rate),
            "category": r.category,
            "note": r.note or "",
        })

    return {
        "cell_id": cell.id,
        "code": cell.verifix_code,
        "category": category,
        "entries": out,
        "sum_minutes": sum(e["minutes"] for e in out),
        "union_minutes": _union_by_day(rows),
        "truncated": len(out) >= MAX_ENTRIES,
    }


def retotal(rows: list[dict], base: dict) -> dict:
    """Re-sum the totals after the caller has narrowed `rows` to a cell pick.

    The cell filter is applied to the finished tree rather than to the query, so
    the option lists it is chosen from are not shortened by the choice — which
    means the totals have to be rebuilt from what survived. Keeping `base`'s
    `days` is deliberate: the period is what the reader selected, not what
    happens to have events in it, and «kunlik o'rtacha» divides by the period.
    """
    acc = _Acc()
    for r in rows:
        acc.minutes += r["minutes"]
        acc.priced += r["priced_minutes"]
        acc.cost += r["cost"] or 0
        if r["hc"] is not None:
            acc.person_min += r["hc"] * r["priced_minutes"]
        for v in (r.get("hc_lo"), r.get("hc_hi")):
            if v is None:
                continue
            acc.hc_lo = v if acc.hc_lo is None else min(acc.hc_lo, v)
            acc.hc_hi = v if acc.hc_hi is None else max(acc.hc_hi, v)
    return {**acc.out(), "days": base.get("days", 0), "managers": len(rows),
            "cells": sum(len(r.get("cells") or []) for r in rows)}
