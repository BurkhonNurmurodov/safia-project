"""Where the загрузка's two inputs come from — «Одам сони» and «Трудоёмкость».

**Why this exists.** Both figures have always been Google Sheet downloads:
`sheets_reader.read_headcount_data` reads the tab literally named «Одам сони»
into `headcount_data.official_hc`, and `read_production_data` reads «Минут»
into `production_data.prod_plan` / `.prod_actual`. One number per brigadir per
day, typed into a spreadsheet nobody on the platform can see.

**From 2026-09-02 (``ZAGRUZKA_FROM``) both come from the «Zagruzka fayli» page
instead** — the operator's directive. Same two fields, new source; the formula
in `kpi_calculator.compute_metrics` is untouched, byte for byte.

The floor is a CONSTANT with no override — the shape ``idle_source.CELLS_FROM``,
the AI review floor and the client-compat floor already use — because a rule a
per-unit toggle can quietly undo is a rule nobody can read off the platform.
Days BEFORE it are untouched and still read the two sheet tabs, so history is
never rewritten and one day is never answered by two sources.

**Odam soni is the TYPED number and nothing else** (the operator's ruling).
``pp_work_center_daily.people`` — the «Bugungi fakt» box on the «Odamlar soni»
tab — summed over the unit's work centres for that date. NULL is not a value:
the derived suggestion ``ROUND(W × Q ÷ S)`` is deliberately NOT a fallback and
neither is штатка, because a suggestion presented as a fact is exactly the
thing this switch replaces. A unit-day nobody typed has NO загрузка — an
explicit «no data» marker on every page, never a zero and never an empty cell.
**That blank IS the warning**: the unit finds out its numbers are missing by
losing its figure, which is what the operator asked for.

Only the pins that were typed are summed, and the whole unit's trudoyomkost is
counted against them (the operator's call). So a unit that types 4 of its 6
work centres reads a load that is too HIGH, and nothing on screen distinguishes
that from a genuinely overloaded unit — the pressure to type them all is the
point.

**Trudoyomkost is the production page's own resolution**, never a second
spelling of it: Σ over the unit's active catalog LINES of
``labor_time × qty ÷ 60``, with the per-line override winning over the group's
shared value over the SAP snapshot. That is `pp_calc.line_minutes`, the same
function `/zagruzka-cell` and `/live` already read, so the загрузка and the
Positions table can never report different minutes for one day. A line with no
``labor_time`` contributes nothing, and a unit with no catalog has no
trudoyomkost at all — again a marker, not a zero.

**Consequence to record: trudoyomkost is derived from the CURRENT catalog.**
Nothing is stored, so editing a `labor_time` or a quantity moves the загрузка
of every past day from the floor on — the property `idle_source` already has,
and the reason "recalculate from 2 September" needs no migration, no day
reopen and no notification: every consumer re-reads on the next restart.
"""
from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import PPDaily, PPLineDaily, PPWorkCenterDaily
from app.services.pp_calc import (daily_key, line_keys, line_minutes,
                                  line_minutes_by_group, takes_sap)
from app.services import pp_catalog
from app.services import wc_group

# THE floor: from this day the загрузка's headcount and trudoyomkost come from
# the «Zagruzka fayli» page and the «Одам сони» / «Минут» sheet tabs are not a
# source for anybody. Derived from nothing and overridable by nothing.
ZAGRUZKA_FROM = date(2026, 9, 2)

_SEC_PER_MIN = 60.0


def uses_production(day: date) -> bool:
    """Does this day read the production page? The ONE test — never re-spell
    the comparison at a call site."""
    return day >= ZAGRUZKA_FROM


def range_start(date_from: date, date_to: date) -> Optional[date]:
    """The first day of the range that reads the production page, or None when
    the whole range predates the floor — so a consumer can skip the queries
    outright instead of fetching rows it will not look at."""
    if date_to < ZAGRUZKA_FROM:
        return None
    return max(date_from, ZAGRUZKA_FROM)


def sheet_end(date_to: date) -> date:
    """The last day of the range still answered by the OLD source. The exact
    inverse of `range_start`, so a consumer splitting a range into its two
    halves can never leave a day in both or in neither."""
    return min(date_to, ZAGRUZKA_FROM - timedelta(days=1))


def typed_pins(db: Session, manager_ids: Iterable[int],
               date_from: date, date_to: date) -> dict[tuple[int, str, str, Optional[str]], float]:
    """``{(manager_id, "YYYY-MM-DD", work_center, group): people}`` — every
    TYPED «Bugungi fakt» pin, a group pin keyed by its letter and a whole-centre
    pin by None (services/wc_group.py).

    ``people IS NOT NULL`` is the whole predicate, and it is what makes the
    rule expressible: the column distinguishes «nobody typed anything» from a
    deliberately typed 0, which is a real answer (a cell that ran with nobody
    in it) and must not be mistaken for silence. A group pin's `people` is the
    only thing it carries, so a row holding just the day's штатка pin (people
    NULL) is not a pin here.
    """
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}
    out: dict[tuple[int, str, str, Optional[str]], float] = {}
    for r in db.query(
        PPWorkCenterDaily.manager_id, PPWorkCenterDaily.date,
        PPWorkCenterDaily.work_center, PPWorkCenterDaily.wc_group,
        PPWorkCenterDaily.people,
    ).filter(
        PPWorkCenterDaily.manager_id.in_(ids),
        PPWorkCenterDaily.date >= date_from,
        PPWorkCenterDaily.date <= date_to,
        PPWorkCenterDaily.people.isnot(None),
    ).all():
        wc = (r.work_center or "").strip()
        if not wc:
            continue
        out[(int(r.manager_id), r.date.isoformat(), wc, r.wc_group or None)] = float(r.people)
    return out


def fold_pins(pins: dict) -> dict[tuple[int, str, str], float]:
    """``{(manager_id, "YYYY-MM-DD", work_center): people}`` — one number per
    work centre out of `typed_pins`: the Σ of its GROUP pins wherever any exist,
    else its whole-centre pin. The pin rule of `wc_group.share`, folded up a
    level, so the unit's ΣN and the cells' weights can never count one work
    centre two ways."""
    whole: dict[tuple[int, str, str], float] = {}
    lettered: dict[tuple[int, str, str], float] = defaultdict(float)
    for (mid, day, wc, group), n in pins.items():
        if group:
            lettered[(mid, day, wc)] += n
        else:
            whole[(mid, day, wc)] = n
    out = dict(whole)
    out.update(lettered)
    return out


def typed_people(db: Session, manager_ids: Iterable[int],
                 date_from: date, date_to: date) -> dict[tuple[int, str, str], float]:
    """``{(manager_id, "YYYY-MM-DD", work_center): people}`` — the TYPED
    «Bugungi fakt» of each work centre: its group pins summed where the
    brigadir typed it per group (2026-09-14), else the one whole-centre pin.
    `fold_pins` over `typed_pins`; a work centre nobody typed is ABSENT."""
    return fold_pins(typed_pins(db, manager_ids, date_from, date_to))


def unit_people(pins: dict[tuple[int, str, str], float]) -> dict[tuple[int, str], float]:
    """``{(manager_id, "YYYY-MM-DD"): Σ typed people}``. A unit-day with no
    typed pin is ABSENT — not 0 — because "nobody typed it" and "nobody came"
    are different facts and only one of them is a загрузка of zero.

    Takes `typed_people` (one number per work centre); handed `typed_pins`
    instead it folds them first, so a group pin is never added on top of a
    whole-centre one."""
    if pins and len(next(iter(pins))) == 4:
        pins = fold_pins(pins)
    out: dict[tuple[int, str], float] = defaultdict(float)
    for (mid, day, _wc), n in pins.items():
        out[(mid, day)] += n
    return dict(out)


def cell_pins(cells, pins: dict) -> dict[tuple[int, str], tuple[Optional[float], frozenset]]:
    """``{(cell_id, "YYYY-MM-DD"): (value, letters)}`` — what each cell reads of
    its work centre's TYPED pins, before any «is it a weight» filter, plus the
    letters that were typed per group at that work centre that day.

    THE one spelling of the pin split, and `cell_people` is its `> 0` filter:
    the gap and unpriced reports read the value AND the letters here to say WHY
    a cell carries no weight, so a diagnosis can never describe a different
    split from the one the weighted mean divides by.

    `pins` is `typed_pins` (group-keyed; three-part legacy keys read as
    whole-centre pins). Cells meet work centres through `wc_group.cells_by_wc`
    (unit + normalised code), and pins under two spellings of one work centre
    are SUMMED onto it rather than one overwriting the other. Each cell reads its
    own group's pin plus an even share of whatever no cell's letter claims
    (`wc_group.share`, pin rule on). `value` is None when nothing reaches the
    cell — its group untyped and nothing unclaimed. A cell of a work centre with
    no pin that day is absent.
    """
    by_wc = wc_group.cells_by_wc(cells)
    per: dict[tuple[int, str, str], dict] = defaultdict(dict)
    for key, n in pins.items():
        if len(key) == 4:
            mid, day, wc, group = key
        else:
            (mid, day, wc), group = key, None
        mk = wc_group.wc_key(mid, wc)
        slot = per[(mk[0], mk[1], day)]
        g = group or None
        slot[g] = slot.get(g, 0.0) + float(n)
    out: dict[tuple[int, str], tuple[Optional[float], frozenset]] = {}
    for (mid, code, day), vals in per.items():
        cs = by_wc.get((mid, code))
        if not cs:
            continue
        letters = frozenset(g for g in vals if g)
        shares = wc_group.share([getattr(c, "wc_group", None) for c in cs], vals, pins=True)
        for c, v in zip(cs, shares):
            out[(c.id, day)] = (v, letters)
    return out


def cell_people(cells, pins: dict) -> dict[tuple[int, str], float]:
    """``{(cell_id, "YYYY-MM-DD"): people}`` — the ojidaniya weight.

    A cell reaches a work centre through ``Cell.sap_code`` (unit + normalised
    code, `wc_group.cells_by_wc`); a cell with none can never be weighed and is
    simply absent, which is the same treatment `unit_downtime` already gives a
    cell nobody worked in.

    `pins` is `typed_pins`. Each cell of a work centre reads **its own group's
    pin** — the brigadir typed that cell's people on its own «Odamlar soni» row —
    and whatever no letter claims (the whole-centre pin of a work centre nobody
    types per group, a letter no cell carries) is SPLIT evenly between the cells
    that name the work centre rather than counted once per cell
    (`wc_group.share`, pin rule on). ΣN over the unit then equals what the
    brigadir actually typed, which is the property the whole weighted mean rests
    on. A work centre nobody grouped is split exactly as before groups existed.

    **Pass EVERY cell of the unit**, never a one-cell list: the split is over the
    cells given, so a single cell handed alone would read every other group's
    people as unclaimed and take them all.

    A cell whose share is None (its group was not typed) or ≤ 0 carries no
    weight and is absent — a typed 0 is a cell that ran empty, and it leaves
    both sides of the mean exactly as a cell nobody worked in does. This is
    `cell_pins` with that filter and nothing else.
    """
    return {k: v for k, (v, _letters) in cell_pins(cells, pins).items()
            if v is not None and v > 0}


def wc_labor(db: Session, manager_ids: Iterable[int],
             date_from: date, date_to: date) -> dict[tuple[int, str, str], tuple[float, float]]:
    """``{(manager_id, "YYYY-MM-DD", work_center): (plan_minutes, actual_minutes)}``.

    THE trudoyomkost, one work centre at a time — and `unit_labor` below is a
    fold of this and nothing else, so the загрузка's numerator and any
    per-work-centre reading of it can never be two different numbers. Values are
    UNROUNDED here for exactly that reason: the unit figure rounds ONCE, after
    the sum, as it always has.

    The production page's own numbers: `pp_calc.line_minutes` over the unit's
    active catalog. A (unit, day, work centre) the catalog or the quantities
    cannot answer is ABSENT, never (0, 0) — the загрузка has no numerator then,
    and a zero would render as a genuinely idle work centre.

    `line_keys` is computed PER UNIT, exactly as the Positions table computes
    it: a catalog belongs to one brigadir, and pooling two would let one unit's
    line adopt another's positional suffix.
    """
    prods, shared, per_line = _labor_inputs(db, manager_ids, date_from, date_to)
    if not prods:
        return {}

    acc: dict[tuple[int, str, str], list] = {}
    for mid, products, sh, pl in _per_span(prods, shared, per_line):
        lines_by_key, sap_off = _lines_of(products)
        if not lines_by_key:
            continue
        pm, am = line_minutes(lines_by_key, sh, pl, _SEC_PER_MIN, sap_off)
        for src, slot in ((pm, 0), (am, 1)):
            for (wc, d), v in src.items():
                key = (mid, d.isoformat() if hasattr(d, "isoformat") else str(d), wc)
                row = acc.get(key)
                if row is None:
                    row = acc[key] = [0.0, 0.0]
                row[slot] += float(v or 0)

    return {k: (v[0], v[1]) for k, v in acc.items()}


def wc_group_labor(db: Session, manager_ids: Iterable[int], date_from: date,
                   date_to: date) -> dict[tuple[int, str, str, Optional[str]], tuple[float, float]]:
    """``{(manager_id, "YYYY-MM-DD", work_center, group): (plan, actual)}`` —
    `wc_labor` one level down (2026-09-14): each catalog line's minutes under the
    group it names (`wc_group.line_groups` — the LINE's own letter since
    2026-09-18, so two operations of one SKU may feed two cells), None for the
    ungrouped part. Same
    inputs, same resolution (`pp_calc.line_minutes_by_group` is `line_minutes`'
    own loop), so Σ over the groups of a work centre is its `wc_labor` figure.
    Hand it to `cell_labor` for what each CELL carries."""
    prods, shared, per_line = _labor_inputs(db, manager_ids, date_from, date_to)
    acc: dict[tuple[int, str, str, Optional[str]], list] = {}
    for mid, products, sh, pl in _per_span(prods, shared, per_line):
        lines_by_key, sap_off = _lines_of(products)
        if not lines_by_key:
            continue
        pg, ag = line_minutes_by_group(lines_by_key, sh, pl, _SEC_PER_MIN, sap_off,
                                       wc_group.line_groups(products))
        for src, slot in ((pg, 0), (ag, 1)):
            for (wc, g, d), v in src.items():
                key = (mid, d.isoformat() if hasattr(d, "isoformat") else str(d), wc, g)
                row = acc.get(key)
                if row is None:
                    row = acc[key] = [0.0, 0.0]
                row[slot] += float(v or 0)
    return {k: (v[0], v[1]) for k, v in acc.items()}


def cell_labor(cells, group_labor: dict) -> dict[tuple[int, str], tuple[float, float]]:
    """``{(cell_id, "YYYY-MM-DD"): (plan, actual)}`` — what each CELL carries of
    its work centre's trudoyomkost: its own group's lines plus an even share of
    whatever no cell's letter claims (`wc_group.share`). The minutes twin of
    `cell_pins`, matched the same way (`wc_group.cells_by_wc`, two spellings of
    one work centre summed), so a cell's minutes and a cell's people always
    describe the same slice of the work centre. Pass EVERY cell of the unit.
    Σ over the cells of a work centre is the work centre's figure. A cell
    nothing reaches is absent."""
    by_wc = wc_group.cells_by_wc(cells)
    per: dict[tuple[int, str, str], dict] = defaultdict(dict)
    for (mid, day, wc, g), (p, a) in group_labor.items():
        mk = wc_group.wc_key(mid, wc)
        slot = per[(mk[0], mk[1], day)]
        prev = slot.get(g or None, (0.0, 0.0))
        slot[g or None] = (prev[0] + p, prev[1] + a)
    out: dict[tuple[int, str], tuple[float, float]] = {}
    for (mid, code, day), vals in per.items():
        cs = by_wc.get((mid, code))
        if not cs:
            continue
        letters = [getattr(c, "wc_group", None) for c in cs]
        plans = wc_group.share(letters, {g: pa[0] for g, pa in vals.items()})
        acts = wc_group.share(letters, {g: pa[1] for g, pa in vals.items()})
        for c, pv, av in zip(cs, plans, acts):
            if pv is None and av is None:
                continue
            prev = out.get((c.id, day), (0.0, 0.0))
            out[(c.id, day)] = (prev[0] + (pv or 0.0), prev[1] + (av or 0.0))
    return out


def fold_group_labor(group_labor: dict) -> dict[tuple[int, str, str], tuple[float, float]]:
    """``{(manager_id, "YYYY-MM-DD", work_center): (plan, actual)}`` out of
    `wc_group_labor` — the per-work-centre figure `wc_labor` reads, for a caller
    that already holds the group-keyed minutes and must not read the whole range
    a second time. Equal to `wc_labor` up to float summation order; the fleet
    загрузка itself keeps calling `wc_labor`."""
    acc: dict[tuple[int, str, str], list] = {}
    for (mid, day, wc, _g), (p, a) in group_labor.items():
        row = acc.setdefault((mid, day, wc), [0.0, 0.0])
        row[0] += p
        row[1] += a
    return {k: (v[0], v[1]) for k, v in acc.items()}


def _lines_of(products) -> tuple[dict, set]:
    """One unit's active catalog lines as `line_minutes` reads them, plus the
    lines the SAP upload does not answer for (`pp_calc.takes_sap`). `line_keys`
    is computed over EVERY line of the unit, active or not — its own rule."""
    keys = line_keys(products)
    lines_by_key: dict[tuple[str, str], list] = defaultdict(list)
    sap_off: set[tuple[str, str, str]] = set()
    for p in products:
        if not p.active or p.labor_time is None:
            continue
        qkey = daily_key(p.sap_code, p.name)
        lines_by_key[(p.work_center, qkey)].append((keys.get(p.id, ""), float(p.labor_time)))
        if not takes_sap(p.sap_code, p.auto_fill):
            sap_off.add((p.work_center, qkey, keys.get(p.id, "")))
    return lines_by_key, sap_off


def _labor_inputs(db: Session, manager_ids: Iterable[int], date_from: date, date_to: date):
    """The three reads behind `wc_labor` / `wc_group_labor`: each unit's catalog
    CUT AT ITS BOUNDARIES (`pp_catalog.spans` — a day reads the catalog it had,
    so a labor time edited today never re-prices yesterday), the `pp_daily`
    quantities and the per-line overrides, grouped by unit.
    ``({}, {}, {})`` for an empty or inverted range."""
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}, {}, {}

    prods: dict[int, list] = {
        m: sp for m, sp in pp_catalog.spans(db, ids, date_from, date_to).items()
        if any(cat.lines for cat, _lo, _hi in sp)}
    if not prods:
        return {}, {}, {}

    shared: dict[int, dict] = defaultdict(dict)
    for d in db.query(PPDaily).filter(
        PPDaily.manager_id.in_(ids),
        PPDaily.date >= date_from,
        PPDaily.date <= date_to,
    ).all():
        shared[int(d.manager_id)][(d.work_center, d.sap_code, d.date)] = (
            float((d.plan_override if d.plan_override is not None else d.plan_qty) or 0),
            float((d.actual_override if d.actual_override is not None else d.actual_qty) or 0),
            # …and whether that is a person's number rather than the file's, so
            # `line_minutes` can silence the snapshot on a line the upload does
            # not fill without blanking what somebody typed.
            d.plan_override is not None, d.actual_override is not None,
        )
    per_line: dict[int, dict] = defaultdict(dict)
    for lo in db.query(PPLineDaily).filter(
        PPLineDaily.manager_id.in_(ids),
        PPLineDaily.date >= date_from,
        PPLineDaily.date <= date_to,
    ).all():
        per_line[int(lo.manager_id)][(lo.work_center, lo.qty_key, lo.date, lo.line_key)] = (
            (float(lo.plan_override) if lo.plan_override is not None else None),
            (float(lo.actual_override) if lo.actual_override is not None else None),
        )
    return prods, shared, per_line


def _per_span(prods: dict, shared: dict, per_line: dict):
    """(unit, catalog lines, its quantities, its per-line values) once per span
    of `_labor_inputs` — each run of days handed only its own dates, so it is
    priced with the catalog those days had. A unit with one span (no dated edit
    in the range) gets its quantities untouched, which keeps its figures the
    same floats they were before catalogs were dated."""
    for mid, sp in prods.items():
        sh_all, pl_all = shared.get(mid, {}), per_line.get(mid, {})
        if len(sp) == 1:
            yield mid, sp[0][0].lines, sh_all, pl_all
            continue
        for cat, lo, hi in sp:
            yield (mid, cat.lines,
                   {k: v for k, v in sh_all.items() if lo <= k[2] <= hi},
                   {k: v for k, v in pl_all.items() if lo <= k[2] <= hi})


def unit_labor(db: Session, manager_ids: Iterable[int],
               date_from: date, date_to: date) -> dict[tuple[int, str], tuple[float, float]]:
    """``{(manager_id, "YYYY-MM-DD"): (plan_minutes, actual_minutes)}``.

    Σ over the unit's work centres of `wc_labor`, rounded once at the end — one
    spelling of the resolution, folded two ways. A (unit, day) the catalog or
    the quantities cannot answer is ABSENT, never (0, 0): the загрузка has no
    numerator then, and a zero would render as a genuinely idle unit.
    """
    acc: dict[tuple[int, str], list] = {}
    for (mid, day, _wc), (plan, actual) in wc_labor(
            db, manager_ids, date_from, date_to).items():
        row = acc.get((mid, day))
        if row is None:
            row = acc[(mid, day)] = [0.0, 0.0]
        row[0] += plan
        row[1] += actual
    return {k: (round(v[0], 2), round(v[1], 2)) for k, v in acc.items()}
