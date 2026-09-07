"""Which SOURCE a supervisor unit's ojidaniya minutes come from — and the
per-cell figure for the units that switched.

**Why this exists.** The fleet загрузка has always read a unit's waiting time
off the «Смена отчёт» sheet row (`DowntimeData`): one total per brigadir per
day, typed by the brigadir at end of shift. Since 2026-08-20 the leaders of a
unit can file each ojidaniya as a start→end EVENT on the cell where it
happened (`cell_ojidaniya_intervals`), and on 2026-08-22 ONE unit — the pilot
— had that record feed the fleet figure instead of the sheet.

**From 2026-08-27 (``CELLS_FROM``) that is the rule for EVERY unit**, by the
operator's directive: the cells are the only source of a waiting minute, the
sheet row is not read for any supervisor on any day from that date on, and no
setting turns it back on. The floor is a CONSTANT with no override — the shape
the review floor and the client-compat floor already use — because a rule a
per-unit toggle can quietly undo is a rule nobody can read off the platform.

Days BEFORE the floor are untouched, and they are what the per-supervisor
register (``IdleSourceSetting``, the «Kutish manbasi» tab) still governs: it
can start a unit EARLIER than the floor — that is where the pilot's
2026-08-21 lives — and never later, and never back onto the sheet for a day
the floor covers. History is therefore never rewritten by an admin flipping a
toggle, and one day is never answered by two sources, which is how a figure
stops being explainable.

**The unit figure is the headcount-weighted mean of its cells.**
``T_unit = Σ(Nᵢ·Tᵢ) ÷ ΣNᵢ`` over every cell the unit owns (`Cell.manager_id`;
`in_load` is deliberately NOT consulted — that flag decides whether a cell's
PEOPLE count toward the load, and waiting is paid by whoever stood there).
``Nᵢ`` came from ATTENDANCE until 2026-09-02 — the direct-role rows matched by
«Код подразделения», the same predicate `compute_metrics` uses for
`verifix_hc`. **From `zagruzka_source.ZAGRUZKA_FROM` it is the typed «Bugungi
fakt» on the work centre the cell's `sap_code` names** (the operator's
directive), i.e. the very number the загрузка itself now divides by, so one
answer to «how many people were in this cell» feeds both. `_n_by_cell` is THE
definition and splits the range at that floor; days before it are untouched.
A plain average of the cells' minutes would let a two-person cell's long stop
outweigh a twenty-person cell's short one, which is the opposite of how the
loss was actually paid. A cell with ``Nᵢ == 0`` — nobody typed its work centre,
or it names none — enters neither side; ``ΣN == 0`` is no figure at all and the
(unit, day) is simply ABSENT from the answer, which downstream reads as 0
minutes. Nothing is stored, so typing the numbers later, for a past day too,
starts the weighting at once.

``Nᵢ`` is FRACTIONAL. Before the загрузка floor because of the split model
(2026-08-30): a worker-day split across two of the unit's cells is `hc_weight`
of a person in each (NULL = one whole person), pro-rata by the hours placed
there, and both halves sit in the same unit so ``ΣN`` — and the unit's minutes
— is unmoved by a split. From the floor because a typed work-centre number is
SHARED evenly by the cells that name it, so ``ΣN`` equals what the brigadir
actually typed rather than counting one work centre several times over.

``Tᵢ`` is the UNION of the cell's stopped ranges, and every piece of that
arithmetic lives in ``services/idle_intervals`` — this module only decides
WHICH rows go in and how the cells are weighed together. The Ojidaniya-only
categories (`OJIDANIYA_ONLY_CATS` — today Cat H alone; Cat I joined the
загрузка on 2026-08-22) are dropped BEFORE the union for the KPI figure,
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

from app.models import (Attendance, Cell, CellOjidaniyaInterval,
                        IdleSourceSetting, Manager)
from app.services import idle_intervals, zagruzka_source
from app.services.kpi_calculator import is_direct_role
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

SOURCE_SHEET = "sheet"
SOURCE_CELLS = "cells"
SOURCES = (SOURCE_SHEET, SOURCE_CELLS)

# THE floor: from this day every unit's ojidaniya is the headcount-weighted
# mean of its cells and the «Смена отчёт» row is not a source for anybody.
# Derived from nothing and overridable by nothing — a per-supervisor row can
# only start a unit EARLIER (the pilot's 2026-08-21). Moving it later would
# hand days back to the sheet that have already been read off the cells.
CELLS_FROM = date(2026, 8, 27)


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
    """manager_id -> the FIRST day that unit's figure comes from its cells.

    EVERY unit is in this map, at ``CELLS_FROM`` unless a per-supervisor
    `cells` row starts it earlier: the floor is the rule and the register is
    the exception to it, never the other way round. A row dated on or after
    the floor is dropped rather than stored twice — the floor already answers
    those days — and a `sheet` row is not read here at all, because from the
    floor on there is nothing for it to switch back to.

    A `cells` row with no from-date is refused on write, but one can still be
    read without a date (a hand edit, an older dump); it is ignored rather
    than read as "since forever", because "from forever" would silently
    rewrite every day of that unit's history.
    """
    out: dict[int, date] = {}
    for (mid,) in db.query(Manager.id).all():
        out[int(mid)] = CELLS_FROM
    for r in db.query(IdleSourceSetting).filter(
        IdleSourceSetting.source == SOURCE_CELLS,
    ).all():
        d = parse_iso(r.from_date)
        if d is None or d >= CELLS_FROM:
            continue
        out[int(r.manager_id)] = d
    return out


def start_day(units: dict[int, date], manager_id: int) -> date:
    """The first day this unit reads its cells — THE answer, and never later
    than the floor whatever the map holds. `units` is `cell_units()`; a unit
    missing from it (an id created after the map was built) still gets the
    floor, because the floor is not a per-unit fact to look up."""
    explicit = units.get(int(manager_id))
    return explicit if explicit is not None and explicit < CELLS_FROM else CELLS_FROM


def uses_cells(units: dict[int, date], manager_id: int, d: date) -> bool:
    """Does this (unit, day) read its cells? True for every unit from
    ``CELLS_FROM`` on, and earlier for one the register switched by hand."""
    return d >= start_day(units, manager_id)


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


def _n_by_cell(db: Session, cells, date_from: date, date_to: date) -> dict[tuple[int, str], float]:
    """N per (cell, "YYYY-MM-DD") — the weight each cell carries in its unit's
    mean. THE definition, shared by `unit_downtime` and `cell_counts`: the two
    must divide by the same thing or the matrix and the KPI stop describing one
    day.

    The range is split at `zagruzka_source.ZAGRUZKA_FROM`, and the two halves
    are complementary by construction (`sheet_end` is the exact inverse of
    `range_start`), so no day is weighed twice and none is left unweighed.

    **Before the floor**: the people who ACTUALLY worked the cell — direct-role
    attendance matched by CELL CODE, `hc_weight` summed rather than rows
    counted (a split worker is a fraction of a person in each cell).

    **From the floor**: the TYPED «Bugungi fakt» on the work centre the cell's
    `sap_code` names — the operator's directive, the same number the загрузка
    itself now divides by. A cell whose work centre nobody typed has no weight
    and leaves BOTH sides of the mean, exactly as a cell nobody worked in
    already did; a unit where nothing was typed has ΣN = 0, no figure, and
    therefore 0 minutes on every surface. Nothing is stored, so the moment the
    numbers are typed — for a past day too — the weighting starts working.

    COLUMNS, not entities, in the attendance query: this runs under
    `build_metrics_list` on every KPI request, and a column left out of an
    explicit select is an AttributeError thrown from inside Overview, the
    Zagruzka heatmap and the brigadir profile at once.
    """
    out: dict[tuple[int, str], float] = defaultdict(float)

    code_to_cell = {c.verifix_code: c.id for c in cells if c.verifix_code}
    att_hi = zagruzka_source.sheet_end(date_to)
    if code_to_cell and date_from <= att_hi:
        for r in db.query(
            Attendance.verifix_code, Attendance.date, Attendance.job_title,
            Attendance.hours_worked, Attendance.is_supervisor,
            Attendance.worker_name, Attendance.hc_weight,
        ).filter(
            Attendance.verifix_code.in_(list(code_to_cell)),
            Attendance.date >= date_from,
            Attendance.date <= att_hi,
            Attendance.is_supervisor.is_(False),
        ).all():
            cid = code_to_cell.get(r.verifix_code)
            if cid is None or not _counted_hc(r):
                continue
            out[(cid, r.date.isoformat())] += (
                1.0 if r.hc_weight is None else float(r.hc_weight)
            )

    lo = zagruzka_source.range_start(date_from, date_to)
    if lo is not None:
        ids = sorted({int(c.manager_id) for c in cells})
        pins = zagruzka_source.typed_people(db, ids, lo, date_to)
        for key, n in zagruzka_source.cell_people(cells, pins).items():
            out[key] += n

    return out


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

    # ── N per (cell, day) — see `_n_by_cell`, THE weight definition ─────────
    # Attendance before the загрузка floor, the typed «Bugungi fakt» from it.
    n_by_cell = _n_by_cell(db, cells, date_from, date_to)
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
                # The same per-category minutes UNWEIGHTED — Σ Tᵢ over the
                # cells, with no headcount in it. The weighted pair above is
                # what every KPI reads; this one is the numerator of the
                # per-cell AVERAGE the «Toifalar bo\'yicha» matrix asks for
                # (Σ T ÷ cells that had people), and the two must never be
                # mixed up: they answer different questions about one day.
                "p_cat": defaultdict(float), "p_cat_ns": defaultdict(float),
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
        # The Ojidaniya-only categories are dropped BEFORE the union (never
        # subtracted after it) for the KPI figure; the all-categories union is
        # what /idle-cell itself prints.
        counted = [r for r in rows if r["category"] not in OJIDANIYA_ONLY_CATS]
        s_kpi = idle_intervals.summarize(counted) if counted else None
        s_all = idle_intervals.summarize(rows)

        a["w_total"] += n * float(s_kpi["stopped_union_min"] if s_kpi else 0)
        a["w_total_all"] += n * float(s_all["stopped_union_min"])
        for cat, c in s_all["by_category"].items():
            if c["union_min"]:
                a["w_cat"][cat] += n * float(c["union_min"])
                a["p_cat"][cat] += float(c["union_min"])
        # Not-stopped: plain sum of spans per category — they never entered a
        # union, so there is nothing to merge.
        for r in rows:
            if r["stopped"]:
                continue
            mins = idle_intervals.duration(r["start"], r["end"])
            if mins:
                a["w_cat_ns"][r["category"]] += n * float(mins)
                a["p_cat_ns"][r["category"]] += float(mins)
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
            # Unweighted Σ T per category — the matrix's numerator. Divided by
            # `cell_counts` (never by `cells_with_att` at a call site), so the
            # denominator has ONE definition on both sources.
            "by_category_sum": {cat: round(v, 2) for cat, v in a["p_cat"].items()},
            "by_category_ns_sum": {cat: round(v, 2) for cat, v in a["p_cat_ns"].items()},
            "n_sum": n_sum,
            "cells": cells_per_unit.get(key[0], 0),
            "cells_with_att": a["cells_with_att"],
            "cells_with_idle": a["cells_with_idle"],
        }
    return out


def cell_counts(db: Session, manager_ids: Iterable[int],
                date_from: date, date_to: date) -> dict[tuple[int, str], int]:
    """THE denominator of the per-cell average: how many of a unit's cells had
    people standing in them on a given day.

    Returns ``{(manager_id, "YYYY-MM-DD"): count}``; a (unit, day) no cell
    carries a weight on is ABSENT, which is the honest answer — a day with no
    cells to divide by has no average, not an average of zero.

    Deliberately its own function rather than `unit_downtime`'s own
    `cells_with_att`: the matrix divides BOTH sources by this, and a
    «Смена отчёт» day never reaches `unit_downtime` at all. It reads the SAME
    `_n_by_cell` the mean is weighed with — who worked the cell before the
    загрузка floor, the typed «Bugungi fakt» from it — so for a cells day the
    two answers are identical by construction, which is the whole reason that
    weight has one definition.
    """
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}

    cells = db.query(Cell).filter(Cell.manager_id.in_(ids)).all()
    if not cells:
        return {}
    cell_unit = {c.id: int(c.manager_id) for c in cells}

    w = _n_by_cell(db, cells, date_from, date_to)

    out: dict[tuple[int, str], int] = defaultdict(int)
    for (cid, day), weight in w.items():
        if weight > 0:
            out[(cell_unit[cid], day)] += 1
    return dict(out)


def switched_in_range(units: dict[int, date], manager_ids: Iterable[int],
                      date_from: date, date_to: date) -> tuple[list[int], Optional[date]]:
    """The units among `manager_ids` that read their cells on at least one day
    of the range, and the earliest day any of them does — the one call a
    consumer needs to make to `unit_downtime` for the whole range.
    ``([], None)`` when the range ends before the floor and nothing in scope
    was switched earlier by hand, so the consumer can skip the three queries
    outright."""
    hit: list[int] = []
    lo: Optional[date] = None
    for mid in manager_ids:
        start = start_day(units, mid)
        if start > date_to:
            continue
        hit.append(int(mid))
        eff = max(start, date_from)
        lo = eff if lo is None or eff < lo else lo
    return hit, lo
