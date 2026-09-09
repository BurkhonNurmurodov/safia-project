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

from app.models import PPDaily, PPLineDaily, PPProduct, PPWorkCenterDaily
from app.services.pp_calc import daily_key, line_keys, line_minutes, takes_sap

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


def typed_people(db: Session, manager_ids: Iterable[int],
                 date_from: date, date_to: date) -> dict[tuple[int, str, str], float]:
    """``{(manager_id, "YYYY-MM-DD", work_center): people}`` — the TYPED
    «Bugungi fakt» pins alone.

    ``people IS NOT NULL`` is the whole predicate, and it is what makes the
    rule expressible: the column distinguishes «nobody typed anything» from a
    deliberately typed 0, which is a real answer (a cell that ran with nobody
    in it) and must not be mistaken for silence.
    """
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}
    out: dict[tuple[int, str, str], float] = {}
    for r in db.query(
        PPWorkCenterDaily.manager_id, PPWorkCenterDaily.date,
        PPWorkCenterDaily.work_center, PPWorkCenterDaily.people,
    ).filter(
        PPWorkCenterDaily.manager_id.in_(ids),
        PPWorkCenterDaily.date >= date_from,
        PPWorkCenterDaily.date <= date_to,
        PPWorkCenterDaily.people.isnot(None),
    ).all():
        wc = (r.work_center or "").strip()
        if not wc:
            continue
        out[(int(r.manager_id), r.date.isoformat(), wc)] = float(r.people)
    return out


def unit_people(pins: dict[tuple[int, str, str], float]) -> dict[tuple[int, str], float]:
    """``{(manager_id, "YYYY-MM-DD"): Σ typed people}``. A unit-day with no
    typed pin is ABSENT — not 0 — because "nobody typed it" and "nobody came"
    are different facts and only one of them is a загрузка of zero."""
    out: dict[tuple[int, str], float] = defaultdict(float)
    for (mid, day, _wc), n in pins.items():
        out[(mid, day)] += n
    return dict(out)


def cell_people(cells, pins: dict[tuple[int, str, str], float]) -> dict[tuple[int, str], float]:
    """``{(cell_id, "YYYY-MM-DD"): people}`` — the ojidaniya weight.

    A cell reaches a work centre through ``Cell.sap_code``; a cell with none
    can never be weighed and is simply absent, which is the same treatment
    `unit_downtime` already gives a cell nobody worked in.

    Where SEVERAL cells of one unit name the same work centre — 10 groups on
    the platform today — the typed number is SPLIT evenly between them rather
    than counted once per cell. ΣN over the unit then equals what the brigadir
    actually typed, which is the property the whole weighted mean rests on: a
    work centre carrying four cells must not out-weigh the rest of the unit
    four times over just because the registry spells it four ways.
    """
    by_wc: dict[tuple[int, str], list[int]] = defaultdict(list)
    for c in cells:
        code = (c.sap_code or "").strip()
        if code:
            by_wc[(int(c.manager_id), code)].append(c.id)
    out: dict[tuple[int, str], float] = defaultdict(float)
    for (mid, day, wc), n in pins.items():
        ids = by_wc.get((mid, wc))
        if not ids or n <= 0:
            continue
        share = n / len(ids)
        for cid in ids:
            out[(cid, day)] += share
    return dict(out)


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
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}

    prods: dict[int, list] = defaultdict(list)
    for p in db.query(PPProduct).filter(PPProduct.manager_id.in_(ids)).all():
        prods[int(p.manager_id)].append(p)
    if not prods:
        return {}

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

    acc: dict[tuple[int, str, str], list] = {}
    for mid, products in prods.items():
        keys = line_keys(products)
        lines_by_key: dict[tuple[str, str], list] = defaultdict(list)
        # The lines the SAP upload does not answer for — `pp_calc.takes_sap`,
        # the same gate the Positions table applies, so the trudoyomkost the
        # загрузка divides and the minutes the page prints stay one number.
        sap_off: set[tuple[str, str, str]] = set()
        for p in products:
            if not p.active or p.labor_time is None:
                continue
            qkey = daily_key(p.sap_code, p.name)
            lines_by_key[(p.work_center, qkey)].append(
                (keys.get(p.id, ""), float(p.labor_time)))
            if not takes_sap(p.sap_code, p.auto_fill):
                sap_off.add((p.work_center, qkey, keys.get(p.id, "")))
        if not lines_by_key:
            continue
        pm, am = line_minutes(lines_by_key, shared.get(mid, {}),
                              per_line.get(mid, {}), _SEC_PER_MIN, sap_off)
        for src, slot in ((pm, 0), (am, 1)):
            for (wc, d), v in src.items():
                key = (mid, d.isoformat() if hasattr(d, "isoformat") else str(d), wc)
                row = acc.get(key)
                if row is None:
                    row = acc[key] = [0.0, 0.0]
                row[slot] += float(v or 0)

    return {k: (v[0], v[1]) for k, v in acc.items()}


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
