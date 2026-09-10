"""«Mening toifam» — the page a «Kutish mas'uli» works from.

The three ojidaniya views on ``/downtime`` answer fleet questions: which
brigadir waited most, how the causes share out a month, what the plant owes.
Narrowed to ONE cause they stop answering anything — a doughnut of a single
slice, a comparison matrix with nothing to compare, a 50-minute flag defined
over a whole day sitting on top of one category's share of it. So the category
owner gets a page of their own, and it asks their questions instead:

    is my cause getting better or worse · where is it concentrated ·
    what did it cost · and what actually happened, in the leaders' own words

**Nothing here is a new measurement.** Every figure is reached through
``services/ojidaniya_cost``, which is already the platform's answer to "what did
stopped waiting cost" — its ``build`` supplies the totals and the
toifa → brigadir → yacheyka tree, and the daily series below is folded from the
same ``_union`` / ``cell_headcount`` / ``wage_rate`` primitives, in the same two
eras. A second spelling of that arithmetic is how this page and the «Xarajat»
tab would come to state two different numbers for one week.

**The headline is the CATEGORY sum, not the union.** A minute a cell stood still
for two causes is owed once (the union — the money) and is genuinely named under
both causes. This page is read cause-first by construction: an owner asking "how
much did MY cause produce" is asking for their category's own union, and folding
it into a shared union would hand them a figure that shrinks when somebody
else's category overlaps theirs. Where the two differ the page prints both and
says which is which — the rule ``ojidaniya_cost`` already states for
``cat_minutes`` beside ``cost``.

**The comparison window is the SAME LENGTH, immediately before.** A percentage
against a window of another length means nothing, so the previous period is
``[from - n, from - 1]`` for the ``n`` days on screen — the shape
``services/report_week`` already uses for the deck.

**A period that reaches back before the floors is answered, not refused.**
Before ``zagruzka_source.ZAGRUZKA_FROM`` there is no per-cell headcount, so
those days are priced per BRIGADIR off the «Одам сони» sheet and carry no cell
and no clock; before ``idle_source.CELLS_FROM`` the minutes come from the
«Смена отчёт» row and there are no EVENTS at all. Both are handed in as
``pre_rows`` exactly as the «Xarajat» tab hands them in, so this page and that
tab cover the same days — and the register says out loud how many of the
period's minutes have no event behind them, because a short event list under a
large total otherwise reads as a quiet month.
"""
from collections import defaultdict
from datetime import date, timedelta
from typing import Callable, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Manager
from app.services import (idle_intervals, idle_source, ojidaniya_cost,
                          zagruzka_source)
from app.services.ojidaniya_cost import _Acc, _events, _union, unit_headcount

# The register is a page of events, not a dump: a plant-wide category over a
# quarter is thousands of rows and the page paginates.
PAGE_MAX = 200


def _managers(db: Session, manager_ids: Iterable[int]) -> dict:
    """``{id: Manager}`` for the scope. Its own helper because three readers
    here need it and each would otherwise carry its own query."""
    ids = list(manager_ids)
    if not ids:
        return {}
    return {m.id: m for m in db.query(Manager).filter(Manager.id.in_(ids)).all()}


def previous_window(date_from: date, date_to: date) -> tuple[date, date]:
    """The equal-length window ending the day before this one begins.

    Equal length is the whole point: a delta against a period of another size is
    a statement about the calendar, not about the cause.
    """
    n = (date_to - date_from).days + 1
    return date_from - timedelta(days=n), date_from - timedelta(days=1)


def _rank(r: dict) -> tuple:
    """Longest first, then costliest — the reverse of `ojidaniya_cost._rank`.

    Deliberate: that tab is a BILL and sorts by money, so an unpriced row (a
    day inside a wage period nobody filled in) sinks to the bottom however long
    it was. This page is about the cause, and minutes are what an owner can act
    on — an unpriced stoppage is still a stoppage.
    """
    return (-r["minutes"], -(r["cost"] or 0))


def _flatten(cat_rows: list[dict]) -> tuple[list[dict], list[dict]]:
    """The category tree re-folded two ways: per BRIGADIR and per CELL.

    Re-folded, never re-measured — the leaf is the (cell, category) pair
    ``build`` already accumulated, so a ranked board and the tree it came from
    cannot disagree. A cell appears once however many of the owner's categories
    touched it, with those categories named on the row: «7222 waited for A and
    for D3» is one place to go and look, not two rows to add up by eye.
    """
    per_mgr: dict[int, dict] = {}
    per_cell: dict[int, dict] = {}

    for k in cat_rows:
        cat = k["category"]
        for m in k["managers"]:
            mid = m["manager_id"]
            slot = per_mgr.setdefault(mid, {
                "manager_id": mid, "manager": m["manager"], "shift": m.get("shift"),
                "cats": set(), "_rows": [],
            })
            slot["cats"].add(cat)
            slot["_rows"].append(m)

            for c in m["cells"]:
                # The pre-floor lump is a whole UNIT and names no cell, so it
                # belongs on the brigadir board and nowhere on the cell board —
                # inventing a cell for it is the one thing that would make this
                # page disagree with the register underneath it.
                if c.get("pre") or c.get("cell_id") is None:
                    continue
                cid = c["cell_id"]
                cslot = per_cell.setdefault(cid, {
                    "cell_id": cid, "code": c.get("code"), "leader": c.get("leader"),
                    "manager_id": mid, "manager": m["manager"], "shift": m.get("shift"),
                    "cats": set(), "_rows": [],
                })
                cslot["cats"].add(cat)
                cslot["_rows"].append(c)

    def _finish(slots: dict) -> list[dict]:
        out = []
        for s in slots.values():
            rows = s.pop("_rows")
            out.append({**s, "cats": sorted(s["cats"]), **ojidaniya_cost._fold(rows)})
        out.sort(key=_rank)
        return out

    return _finish(per_mgr), _finish(per_cell)


def _daily(db: Session, cells, cats: list[str], date_from: date, date_to: date,
           rate_for: Callable[[date], Optional[float]],
           ok_days: dict[int, set[str]]) -> tuple[dict[str, _Acc], dict[str, int]]:
    """``{"YYYY-MM-DD": _Acc}`` for the per-cell era.

    Accumulated per (cell, day, CATEGORY) and summed across categories, so the
    series adds up to the same ``cat_minutes`` the headline prints. A union is
    taken within one category on one date and never across dates — clocks are
    minutes-of-day, so a union spanning a period merges 17:10–17:25 filed on
    two different days into one span (``ojidaniya_cost._union_by_day``).
    """
    by_cell = {c.id: c for c in cells}
    wanted_days = sorted({d for s in ok_days.values() for d in s})
    events = [e for e in _events(db, cells, wanted_days)
              if by_cell.get(e.cell_id) is not None
              and e.date in ok_days.get(by_cell[e.cell_id].manager_id, ())
              and (not cats or e.category in set(cats))]

    hc = idle_source.cell_headcount(db, cells, date_from, date_to)

    per: dict[tuple[int, str, str], list] = defaultdict(list)
    for e in events:
        per[(e.cell_id, e.date, e.category)].append(e)

    out: dict[str, _Acc] = defaultdict(_Acc)
    counts: dict[str, int] = defaultdict(int)
    for (cid, d, _cat), rows in per.items():
        out[d].add(_union(rows), hc.get((cid, d)), rate_for(date.fromisoformat(d)))
        counts[d] += len(rows)
    # Two dicts and not one field on the accumulator: `_Acc` carries __slots__,
    # so an extra attribute is an AttributeError at runtime rather than a
    # compile-time complaint.
    return out, dict(counts)


def _daily_pre(pre_rows: Optional[list[dict]], managers: dict, cats: list[str],
               unit_hc: dict, rate_for: Callable[[date], Optional[float]],
               ) -> dict[str, _Acc]:
    """The same series for the era before the typed per-cell headcount.

    One figure per (unit, day) per category, priced on the unit's own «Одам
    сони» sheet headcount — precisely what ``ojidaniya_cost.build`` does with
    these rows, so the two halves of a straddling period are the same
    arithmetic at two levels of detail.
    """
    out: dict[str, _Acc] = defaultdict(_Acc)
    if not pre_rows:
        return out
    keep = set(cats) if cats else None
    for r in pre_rows:
        mid = r.get("manager_id")
        iso = ojidaniya_cost._iso(r.get("date") or "")
        if mid is None or iso is None or mid not in managers:
            continue
        n = unit_hc.get((mid, iso))
        rate = rate_for(date.fromisoformat(iso))
        for cat, v in (r.get("by_category") or {}).items():
            if keep is not None and cat not in keep:
                continue
            m = round(float(v or 0))
            if m > 0:
                out[iso].add(m, n, rate)
    return out


def overview(db: Session, manager_ids: list[int], date_from: date, date_to: date,
             cats: list[str], rate_for: Callable[[date], Optional[float]],
             pre_rows: Optional[list[dict]] = None,
             cat_lock: Optional[list[str]] = None) -> dict:
    """Everything the page draws above its register.

    This function never decides scope — it only reports on the scope it is
    handed, the split ``ojidaniya_deck`` keeps between the router that FETCHES
    and the service that COMPUTES.

    ``cats`` is what the reader PICKED (already intersected with their lock by
    the router); ``cat_lock`` is the lock itself. They are two arguments and
    never one: a pick must not shorten the option list it was picked from,
    while a lock must — a control naming a category the page can never show a
    row for is worse than no control. ``None`` is the only value meaning «no
    lock» (``services/idle_scope``), so an empty list is «locked to nothing».
    """
    tree = ojidaniya_cost.build(db, manager_ids, date_from, date_to, cats,
                                rate_for, pre_rows=pre_rows, cat_lock=cat_lock)
    cat_rows = tree["cat_rows"]
    managers_board, cells_board = _flatten(cat_rows)

    # ── the daily series ─────────────────────────────────────────────────────
    cells = ojidaniya_cost._cells_of(db, manager_ids)
    units = idle_source.cell_units(db)
    cell_from = max(date_from, zagruzka_source.ZAGRUZKA_FROM)
    span = [cell_from + timedelta(days=i)
            for i in range((date_to - cell_from).days + 1)] if cell_from <= date_to else []
    ok_days = {mid: {d.isoformat() for d in span
                     if idle_source.uses_cells(units, mid, d)}
               for mid in manager_ids}

    acc, counts = _daily(db, cells, cats, cell_from, date_to, rate_for, ok_days)
    if pre_rows:
        mgr_rows = _managers(db, manager_ids)
        pre = _daily_pre(pre_rows, mgr_rows, cats,
                         unit_headcount(db, mgr_rows, date_from, date_to), rate_for)
        for d, a in pre.items():
            tgt = acc.setdefault(d, _Acc())
            tgt.minutes += a.minutes
            tgt.priced += a.priced
            tgt.person_min += a.person_min
            tgt.cost += a.cost

    n_days = (date_to - date_from).days + 1
    daily = []
    for i in range(n_days):
        d = (date_from + timedelta(days=i)).isoformat()
        a = acc.get(d)
        # Every day of the period is a point, filed or not: a line drawn only
        # through the days that had events cannot show a cause stopping.
        row = a.out() if a else _Acc().out()
        daily.append({"date": d, "minutes": row["minutes"], "cost": row["cost"],
                      "events": counts.get(d, 0)})

    totals = dict(tree["totals"])
    totals["events"] = sum(d["events"] for d in daily)
    totals["cells"] = len(cells_board)
    totals["managers"] = len(managers_board)
    totals["days"] = n_days
    # Days the period covers that no event can ever be shown for — everything
    # before `idle_source.CELLS_FROM`, where the minutes came off the «Смена
    # отчёт» row. Named, so a thin register under a fat total reads as history
    # rather than as a quiet month.
    totals["pre_days"] = sum(
        1 for i in range(n_days)
        if (date_from + timedelta(days=i)) < zagruzka_source.ZAGRUZKA_FROM)

    return {
        "cats": cat_rows,
        "managers": managers_board,
        "cells": cells_board,
        "daily": daily,
        "totals": totals,
        "options": tree["options"],
        "cells_from": idle_source.CELLS_FROM.isoformat(),
        "priced_from": zagruzka_source.ZAGRUZKA_FROM.isoformat(),
    }


def totals_only(db: Session, manager_ids: list[int], date_from: date,
                date_to: date, cats: list[str],
                rate_for: Callable[[date], Optional[float]],
                pre_rows: Optional[list[dict]] = None,
                cat_lock: Optional[list[str]] = None) -> dict:
    """The comparison window's figures alone — the same computation, without
    the boards nothing renders for a period nobody is looking at."""
    tree = ojidaniya_cost.build(db, manager_ids, date_from, date_to, cats,
                                rate_for, pre_rows=pre_rows, cat_lock=cat_lock)
    return dict(tree["totals"])


def register(db: Session, manager_ids: list[int], date_from: date, date_to: date,
             cats: list[str], rate_for: Callable[[date], Optional[float]],
             search: str = "", cell_ids: Optional[Iterable[int]] = None,
             offset: int = 0, limit: int = 50) -> dict:
    """Every filed event in scope — THE table the owner acts on.

    Each row is priced on its OWN minutes, so the column adds up by eye; where
    two events of one category overlap that sum exceeds the union the totals
    print, which is stated on the page rather than left to be discovered — the
    rule ``ojidaniya_cost.entries`` already follows for one cell.

    The NOTE is why this table exists. It is the leader's own account of what
    stopped the cell, and it is reproduced verbatim: an owner deciding what to
    fix is reading evidence, not a summary of it.
    """
    cells = ojidaniya_cost._cells_of(db, manager_ids)
    keep_cells = {int(c) for c in (cell_ids or [])}
    if keep_cells:
        cells = [c for c in cells if c.id in keep_cells]
    if not cells:
        return {"rows": [], "total": 0, "sum_minutes": 0, "offset": offset}

    by_cell = {c.id: c for c in cells}
    leaders = ojidaniya_cost._leader_names(db, cells)
    mgr_names = _managers(db, manager_ids)

    units = idle_source.cell_units(db)
    lo = max(date_from, idle_source.CELLS_FROM)
    span = [lo + timedelta(days=i)
            for i in range((date_to - lo).days + 1)] if lo <= date_to else []
    ok_days = {mid: {d.isoformat() for d in span
                     if idle_source.uses_cells(units, mid, d)}
               for mid in manager_ids}
    wanted_days = sorted({d for s in ok_days.values() for d in s})

    keep = set(cats) if cats else None
    rows = [e for e in _events(db, cells, wanted_days)
            if by_cell.get(e.cell_id) is not None
            and e.date in ok_days.get(by_cell[e.cell_id].manager_id, ())
            and (keep is None or e.category in keep)]

    q = (search or "").strip().lower()
    if q:
        def _hit(e) -> bool:
            c = by_cell[e.cell_id]
            m = mgr_names.get(c.manager_id)
            hay = " ".join(str(x or "").lower() for x in (
                e.note, e.category, c.verifix_code,
                leaders.get(c.leader_id), m.name if m else "", e.date))
            return q in hay
        rows = [e for e in rows if _hit(e)]

    rows.sort(key=lambda r: (r.date, r.start or ""), reverse=True)
    total = len(rows)
    sum_min = sum(idle_intervals.duration(r.start, r.end) or 0
                  for r in rows)

    page = rows[offset:offset + max(1, min(limit, PAGE_MAX))]
    hc = idle_source.cell_headcount(db, cells, date_from, date_to)

    out = []
    for r in page:
        c = by_cell[r.cell_id]
        m = mgr_names.get(c.manager_id)
        n = hc.get((c.id, r.date))
        rate = rate_for(date.fromisoformat(r.date))
        mins = idle_intervals.duration(r.start, r.end) or 0
        out.append({
            "id": r.id, "date": r.date, "category": r.category,
            "cell_id": c.id, "code": c.verifix_code,
            "leader": leaders.get(c.leader_id),
            "manager_id": c.manager_id, "manager": m.name if m else None,
            "shift": m.shift if m else None,
            "start": r.start, "end": r.end, "minutes": mins,
            "hc": None if n is None else round(n, 2),
            "cost": None if (n is None or rate is None) else round(mins / 60.0 * n * rate),
            "note": r.note or "",
        })

    return {"rows": out, "total": total, "sum_minutes": sum_min, "offset": offset}
