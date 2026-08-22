"""Which SOURCE a supervisor unit's ojidaniya minutes come from — and the
per-cell figure for the units that switched.

**Why this exists.** The fleet загрузка has always read a unit's waiting time
off the «Смена отчёт» sheet row (`DowntimeData`): one total per brigadir per
day, typed by the brigadir at end of shift. Since 2026-08-20 the leaders of a
unit can file each ojidaniya as a start→end EVENT on the cell where it
happened (`cell_ojidaniya_intervals`), and from 2026-08-22 ONE unit — the
pilot — has that record feed the fleet figure instead of the sheet. The switch
is per SUPERVISOR and DATED: before the from-date the sheet stays the answer,
so history is never rewritten by an admin flipping a toggle; after it the
sheet is never read for that unit, not even on a day a sheet row exists —
two sources answering one day is how a figure stops being explainable.

**The unit figure is the headcount-weighted mean of its cells.**
``T_unit = Σ(Nᵢ·Tᵢ) ÷ ΣNᵢ`` over every cell the unit owns (`Cell.manager_id`;
`in_load` is deliberately NOT consulted — that flag decides whether a cell's
PEOPLE count toward the load, and waiting is paid by whoever stood there).
``Nᵢ`` is the people who ACTUALLY worked cell i that day — the direct-role
attendance rows matched by «Код подразделения», the same predicate
`compute_metrics` uses for `verifix_hc` — never the planned headcount: nobody
waits in a cell they did not come to, and a plan overstating a cell would pull
the unit's figure toward a stoppage those people never stood through. A plain
average of the cells' minutes would let a two-person cell's long stop outweigh
a twenty-person cell's short one, which is the opposite of how the loss was
actually paid. A cell with ``Nᵢ == 0`` enters neither side; ``ΣN == 0`` is no
figure at all and the (unit, day) is simply ABSENT from the answer.

``Tᵢ`` is the UNION of the cell's stopped ranges, and every piece of that
arithmetic lives in ``services/idle_intervals`` — this module only decides
WHICH rows go in and how the cells are weighed together. Cat H / Cat I
(`OJIDANIYA_ONLY_CATS`) are dropped BEFORE the union for the KPI figure,
never subtracted after it (they may overlap a counted category, and
subtracting their minutes would also remove minutes a counted range was
covering); the Ojidaniya page without `kpi_only` still shows them, so both
totals are returned. Not-stopped ranges never enter a union — they never
counted — so their half is the plain SUM of spans per category, weighed by the
same rule, which keeps `total_ns` equal to the sum of `by_category_ns`.

Only ``status == "approved"`` rows are read: a rejected one stays a refusal
with its reason on it, and the legacy minutes-only `cell_ojidaniya` rows are
never consulted — they predate both the interval model and any from-date.
"""
from collections import defaultdict
from datetime import date
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Attendance, Cell, CellOjidaniyaInterval, IdleSourceSetting
from app.services import idle_intervals
from app.services.kpi_calculator import is_direct_role
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

SOURCE_SHEET = "sheet"
SOURCE_CELLS = "cells"
SOURCES = (SOURCE_SHEET, SOURCE_CELLS)


def parse_iso(s: Optional[str]) -> Optional[date]:
    """"YYYY-MM-DD" -> date, None for anything that is not one. The from-date
    is stored as text like every other ISO day column on the platform."""
    if not s:
        return None
    try:
        return date.fromisoformat(str(s).strip())
    except ValueError:
        return None


def cell_units(db: Session) -> dict[int, date]:
    """manager_id -> from_date for every unit whose figure comes from its
    cells. A `cells` row with no from-date is refused on write, but a row can
    still be read without one (a hand edit, an older dump) — it is treated as
    NOT switched rather than switched since forever, because "from forever"
    would silently rewrite every day of that unit's history."""
    out: dict[int, date] = {}
    for r in db.query(IdleSourceSetting).filter(
        IdleSourceSetting.source == SOURCE_CELLS,
    ).all():
        d = parse_iso(r.from_date)
        if d is not None:
            out[int(r.manager_id)] = d
    return out


def uses_cells(units: dict[int, date], manager_id: int, d: date) -> bool:
    """Does this (unit, day) read its cells? `units` is `cell_units()`."""
    start = units.get(manager_id)
    return start is not None and d >= start


def _counted_hc(r) -> bool:
    """The `verifix_hc` predicate of `kpi_calculator.compute_metrics`, applied
    to one attendance row: a direct role that actually came, with a name.
    Kept a twin on purpose — weigh the cells by one headcount rule and the
    load by another and the two pages stop adding up."""
    if not is_direct_role(r.job_title, r.hours_worked,
                          getattr(r, "is_supervisor", False)):
        return False
    name = r.worker_name
    return bool(name) and name not in ("nan", "NaN", "")


def unit_downtime(db: Session, manager_ids: Iterable[int],
                  date_from: date, date_to: date) -> dict[tuple[int, str], dict]:
    """The per-cell-derived ojidaniya of the given units over a date range.

    Returns ``{(manager_id, "YYYY-MM-DD"): figure}`` — see the module
    docstring for the rule. A (unit, day) whose cells carried no counted
    attendance (``ΣN == 0``) is ABSENT; a day with attendance and no ojidaniya
    filed is PRESENT with zeros, because on a closed day that IS the answer
    (no fallback to the sheet, ever).

    Three queries for the whole range — cells, attendance, intervals — then a
    dict join. This sits under `build_metrics_list`, which every KPI page
    calls, so one round trip per cell-day is not an option.
    """
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}

    cells = db.query(Cell).filter(Cell.manager_id.in_(ids)).all()
    if not cells:
        return {}
    cell_unit = {c.id: int(c.manager_id) for c in cells}
    code_to_cell = {c.verifix_code: c.id for c in cells if c.verifix_code}
    cells_per_unit: dict[int, int] = defaultdict(int)
    for c in cells:
        cells_per_unit[cell_unit[c.id]] += 1

    # ── N per (cell, day): who actually worked the cell ──────────────────────
    # Matched by CELL CODE, not by the row's manager_id: the daily batch may
    # hand a cell to another supervisor for one day, and the people standing
    # in the cell are the ones who waited in it. `is_supervisor` rows are out
    # — the unit's cell-less brigadir is kept off the load at every other
    # enforcement point too.
    n_by_cell: dict[tuple[int, str], int] = defaultdict(int)
    if code_to_cell:
        for r in db.query(Attendance).filter(
            Attendance.verifix_code.in_(list(code_to_cell)),
            Attendance.date >= date_from,
            Attendance.date <= date_to,
            Attendance.is_supervisor.is_(False),
        ).all():
            cid = code_to_cell.get(r.verifix_code)
            if cid is None or not _counted_hc(r):
                continue
            n_by_cell[(cid, r.date.isoformat())] += 1
    if not n_by_cell:
        return {}

    # ── Ranges per (cell, day): approved only, whole range in one query ──────
    iso_lo, iso_hi = date_from.isoformat(), date_to.isoformat()
    iv_by_cell: dict[tuple[int, str], list] = defaultdict(list)
    for iv in db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.cell_id.in_(list(cell_unit)),
        CellOjidaniyaInterval.date >= iso_lo,
        CellOjidaniyaInterval.date <= iso_hi,
        CellOjidaniyaInterval.status == "approved",
    ).all():
        iv_by_cell[(iv.cell_id, iv.date)].append(iv)

    # ── Weigh the cells into their unit-day ──────────────────────────────────
    acc: dict[tuple[int, str], dict] = {}
    for (cid, day), n in n_by_cell.items():
        if n <= 0:
            continue
        key = (cell_unit[cid], day)
        a = acc.get(key)
        if a is None:
            a = acc[key] = {
                "w_total": 0.0, "w_total_all": 0.0, "w_total_ns": 0.0,
                "w_cat": defaultdict(float), "w_cat_ns": defaultdict(float),
                "n_sum": 0.0, "cells_with_att": 0, "cells_with_idle": 0,
            }
        a["n_sum"] += n
        a["cells_with_att"] += 1

        ivs = iv_by_cell.get((cid, day)) or []
        if not ivs:
            continue                      # N counts, T is 0 on every axis
        a["cells_with_idle"] += 1
        rows = [
            {"id": iv.id, "category": iv.category, "start": iv.start,
             "end": iv.end, "stopped": bool(iv.stopped)}
            for iv in ivs
        ]
        # H/I dropped BEFORE the union (never subtracted after it) for the KPI
        # figure; the all-categories union is what /idle-cell itself prints.
        counted = [r for r in rows if r["category"] not in OJIDANIYA_ONLY_CATS]
        s_kpi = idle_intervals.summarize(counted) if counted else None
        s_all = idle_intervals.summarize(rows)

        a["w_total"] += n * float(s_kpi["stopped_union_min"] if s_kpi else 0)
        a["w_total_all"] += n * float(s_all["stopped_union_min"])
        for cat, c in s_all["by_category"].items():
            if c["union_min"]:
                a["w_cat"][cat] += n * float(c["union_min"])
        # Not-stopped: plain sum of spans per category — they never entered a
        # union, so there is nothing to merge.
        for r in rows:
            if r["stopped"]:
                continue
            mins = idle_intervals.duration(r["start"], r["end"])
            if mins:
                a["w_cat_ns"][r["category"]] += n * float(mins)
                a["w_total_ns"] += n * float(mins)

    out: dict[tuple[int, str], dict] = {}
    for key, a in acc.items():
        n_sum = a["n_sum"]
        if n_sum <= 0:
            continue
        out[key] = {
            "total": round(a["w_total"] / n_sum, 2),
            "total_all": round(a["w_total_all"] / n_sum, 2),
            "by_category": {cat: round(v / n_sum, 2)
                            for cat, v in a["w_cat"].items()},
            "total_ns": round(a["w_total_ns"] / n_sum, 2),
            "by_category_ns": {cat: round(v / n_sum, 2)
                               for cat, v in a["w_cat_ns"].items()},
            "n_sum": n_sum,
            "cells": cells_per_unit.get(key[0], 0),
            "cells_with_att": a["cells_with_att"],
            "cells_with_idle": a["cells_with_idle"],
        }
    return out


def switched_in_range(units: dict[int, date], manager_ids: Iterable[int],
                      date_from: date, date_to: date) -> tuple[list[int], Optional[date]]:
    """The units among `manager_ids` that read their cells on at least one day
    of the range, and the earliest day any of them does — the one call a
    consumer needs to make to `unit_downtime` for the whole range.
    ``([], None)`` when nothing in scope is switched, so the consumer can skip
    the three queries outright."""
    hit: list[int] = []
    lo: Optional[date] = None
    for mid in manager_ids:
        start = units.get(int(mid))
        if start is None or start > date_to:
            continue
        hit.append(int(mid))
        eff = max(start, date_from)
        lo = eff if lo is None or eff < lo else lo
    return hit, lo
