"""Per-CELL загрузка — a TEST twin of the /zagruzka page, computed for the
cells of ONE supervisor at a time, chosen on the page.

**It served exactly one hard-locked unit until 2026-09-07** («Suvonov Elshod
Of», #5) — it was a pilot and a single unit was the point. It serves EVERY unit
now (the operator's directive): the lock, its name regex and its id fallback
are gone, `?manager_id=` picks the unit and `_pick_manager` decides what a
viewer may pick through `scoped_manager_ids`, the same door every other
factory-aware page uses — so a supervisor or leader is pinned to their own unit
SERVER-SIDE, not by hiding a control. One unit at a time is deliberate and not
a leftover: the roll-up row, the reconciliation against the fleet figure and
every diagnostic below are statements about ONE unit, and a grid mixing several
could not carry any of them.

It runs the SAME formula as the fleet page (``services/kpi_calculator.compute_metrics``)
so the two are directly comparable; only the INPUTS are re-sourced from per-cell
tables instead of the per-supervisor sheet imports:

    input          fleet /zagruzka                 this page (per cell)
    ─────────────  ──────────────────────────────  ──────────────────────────────
    prod_plan      production_data.prod_plan       Σ pp_products.labor_time
    prod_actual    production_data.prod_actual       × pp_daily.plan_qty|actual_qty ÷ 60
                                                     over the cell's work centre,
                                                     ÷ the number of cells naming
                                                     that work centre
    official_hc    headcount_data.official_hc      O. SONI (N): from 2026-09-02
                                                     the TYPED «Bugungi fakt» pin
                                                     (pp_work_center_daily.people)
                                                     and nothing else; before that
                                                     the pin, else ROUND(W × Q ÷ S)
                                                     exactly as pp_calc derives it
    attendance     attendance (verifix, per unit)  the SAME `attendance` rows,
                                                     split per cell by
                                                     Attendance.verifix_code
                                                     («Код подразделения»), with
                                                     cell_attendance as a per-day
                                                     fallback for days the daily
                                                     sheet does not cover
    equip_downtime downtime_data (sheet import)    the UNION of the STOPPED
                                                     cell_ojidaniya_intervals
                                                     ranges (legacy cell_ojidaniya
                                                     minutes for a day filed
                                                     before the interval model)

The cell↔production join is ``Cell.sap_code`` → ``pp_daily.work_center``; the
cell registry's SAP codes were normalised Cyrillic→Latin precisely so they match
the Production page's work-centre codes (see seed_cells_from_sheet.py).

Decisions taken with the user (2026-07-31), all deliberate:
  * ALL of the locked unit's cells are computed — ``Cell.in_load`` is ignored so
    that ticking cells for the real загрузка can never change this test page.
  * The formula's headcount is O. SONI, NOT штатка — the user corrected the
    first version, which fed штатка in. **From `zagruzka_source.ZAGRUZKA_FROM`
    (2026-09-02) it is the TYPED «Bugungi fakt» alone** (the operator's
    directive), which is also what the fleet загрузка now divides by — so the
    two pages cannot answer one cell-day with two different headcounts, and
    this page's reconciliation delta against the fleet should read ~0 from that
    date. A cell nobody typed reads BLANK, never 0: the blank is the warning.
    Counted in `diagnostics.no_typed_headcount`. Before the floor the derived
    ROUND(W × Q ÷ S) still answers, so history is untouched.
  * Ojidaniya = the UNION of the day's To'xtaganda (stopped) ranges, the
    Ojidaniya-only categories dropped BEFORE the union (2026-08-20; see the
    block that computes it). That list is `OJIDANIYA_ONLY_CATS` and today holds
    Cat H alone — Cat I joined the загрузка on 2026-08-22.
    A not-stopped range never counts, here or anywhere else.
  * The unit's own row runs **/zagruzka's logic, not a sum of the cells**
    (the operator's directive, 2026-09-09). Its трудоёмкость is
    `zagruzka_source.unit_labor` and its headcount `unit_people` — the fleet's
    own functions, so the whole unit's minutes are counted against the TYPED
    pins alone, exactly as /zagruzka counts them — and its attendance is the
    unit's own rows. Three fleet rules could not be reproduced by adding the
    rows on screen up, and each of them moved the number: an untyped work
    centre's minutes count while its people do not, a work centre with no cell
    has no row to be summed, and a worker whose «Код подразделения» is blank is
    still on the unit's payroll. Ergashev Muxriddin on 07.09.2026 read 78%
    here against 572% there. The cells' own aggregate is still computed and
    published as `cells_sum`; the reconciliation card charts the two against
    each other, which is the question this page exists to ask.
    The ojidaniya deduction stays the HEADCOUNT-WEIGHTED mean of the cells,
    (N1*T1 + ... + Nn*Tn) / (N1 + ... + Nn) — the user's formula, 2026-08-20.
    N was the people who actually worked that cell that day; from
    `zagruzka_source.ZAGRUZKA_FROM` it is the cell's typed O. SONI, the same
    weight `idle_source` applies to the fleet figure.
  * **A work centre named by several cells is SPLIT EVENLY between them**
    (2026-09-09) — ten groups today, the largest six cells wide. `pp_daily`
    and `pp_work_center_daily` are keyed by the work centre, so there is no
    per-cell трудоёмкость and no per-cell «Bugungi fakt»; giving each cell the
    whole work centre measured one line's entire production against a fraction
    of its people (the ±1000% cells) and counted its minutes once per cell in
    the roll-up. Evenly, never by attendance: `zagruzka_source.cell_people`
    already splits the same typed number evenly for the ojidaniya weight, and
    one split must not have two spellings. Such a cell's figures are SHARES and
    say so — `wc_share` / `wc_cells` on every input row,
    `diagnostics.shared_work_centers` for the groups.
  * A missing input is a plain zero, not a marker: no ojidaniya row for a day
    means downtime 0, exactly like a genuinely clean day.
  * Attendance rows are filtered by the same ``is_direct_role`` rule as the fleet
    page; the titles that got excluded are reported in ``diagnostics`` so a
    spelling drift in the cell export can't silently zero a cell.
  * Attendance comes from the DAILY «Davomat» upload (2026-08-14). It writes
    ``Attendance.verifix_code``, so the everyday factory-wide file already
    carries the cell dimension — no separate per-cell upload is needed, and the
    page now covers every day the factory uploads. ``cell_attendance`` survives
    as a per-DAY fallback for the days that predate that column. Which source
    fed each day is reported in ``diagnostics.attendance_sources``.
  * No day-close gate. Per-cell data has no DayApproval / EditRequest flow, so
    every day that carries data is shown.

Admin-only: the ``zagruzka-cell`` page key defaults to no roles. Nothing here
writes, and no existing pipeline reads it.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Attendance, Cell, CellAttendance, CellOjidaniya, CellOjidaniyaInterval,
    Manager, PPDaily, PPLineDaily, PPDaySetting, PPProduct, PPWorkCenter, PPWorkCenterDaily,
)
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services import zagruzka_source
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.routers.production import _constants as _pp_constants, _unit_per_head
from app.services import idle_intervals
from app.services.kpi_calculator import compute_metrics, is_direct_role
from app.services.pp_calc import _round_half_up, daily_key, line_keys, line_minutes
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

router = APIRouter(prefix="/api/zagruzka-cell", tags=["zagruzka-cell"])

PAGE = "zagruzka-cell"

# Excel ROUND-trip constant shared with pp_calc: labor_time is seconds/unit.
_SEC_PER_MIN = 60.0


def _pick_manager(db: Session, payload: dict, manager_id: Optional[int],
                  factory: Optional[int]) -> tuple[Manager, list[Manager]]:
    """Which unit the page is showing, and which units the viewer may pick.

    Until 2026-09-07 this page was HARD-LOCKED to one supervisor («Suvonov
    Elshod Of», unit 5) — it was a test twin of the fleet page and a single
    unit was the whole point. It serves every unit now (the operator's
    directive), so the lock, its name regex and its id fallback are gone.

    The list is `scoped_manager_ids`, the same door the fleet загрузка page
    uses, so the scope is decided SERVER-SIDE and not by hiding a control —
    `?manager_id=` is typeable. That scope is the PLANT lock, exactly as on
    /zagruzka: a supervisor, leader or shift-manager is pinned to their own
    factory whatever `?factory=` says, and inside it they may read any unit,
    while admin and top-manager switch plants freely. Deliberately not
    narrowed to a viewer's OWN unit: the sibling fleet page does not do that
    either, and a per-cell twin that is stricter than the page it reconciles
    against cannot be reconciled against it.

    An out-of-scope or unknown pick falls back to the first unit the viewer may
    see rather than 403-ing — the page remembers its pick, and a stale one must
    not lock somebody out of a page they can otherwise read.

    Returns (chosen, pickable). Raises 404 only when the viewer may see NO
    unit at all, so the page renders a message instead of an empty grid that
    reads as "this unit produced nothing".
    """
    scoped = scoped_manager_ids(db, payload, factory, [])
    if empty_scope(scoped):
        raise HTTPException(
            status_code=404,
            detail="No unit is visible to you under the current factory filter.",
        )
    q = db.query(Manager).filter(Manager.archived.is_(False))
    if scoped is not None:
        q = q.filter(Manager.id.in_(scoped))
    units = q.order_by(Manager.name).all()
    if not units:
        raise HTTPException(status_code=404, detail="No active unit is visible to you.")
    if manager_id is not None:
        for m in units:
            if m.id == manager_id:
                return m, units
    return units[0], units


def _parse_range(date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from must not be after date_to")
    if (date_to - date_from).days > 120:
        raise HTTPException(status_code=400, detail="Range is limited to 120 days")
    return date_from, date_to


def _cell_label(c: Cell) -> str:
    """Row key for the grid: the verifix CODE and nothing else.

    The workshop name used to be appended, which is the regression the
    «A cell is its CODE» directive (2026-08-29) exists to prevent — the names
    are long, they truncate to nothing in a grid row, and two cells share one
    («Холодная ягода» is both 1611 and 1622), so a reader holding only the name
    cannot tell them apart while the code always can. `verifix_code` is unique
    platform-wide, so it is also a safe key now that the page serves every
    unit."""
    return c.verifix_code or f"#{c.id}"


@router.get("")
def cell_zagruzka(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    # Which unit. Omitted (or one the viewer may not see) = the first unit in
    # their own scope — never a 403, because the page remembers the last pick
    # and a stale one must not lock somebody out of a page they can read.
    manager_id: Optional[int] = Query(default=None),
    # Which plant. Omitted / null = «All factories»; supervisors and leaders are
    # pinned to their own by the server (services/factory_scope).
    factory: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The whole page in one payload: a cells × dates grid in the same shape
    /api/heatmap returns (so ComparisonTable and HeatmapChart consume it
    verbatim), plus the raw inputs behind every number, a rolled-up totals row,
    the fleet page's figure for the same unit to reconcile against, and
    `units` — the supervisors this viewer may switch between."""
    date_from, date_to = _parse_range(date_from, date_to)
    mgr, pickable = _pick_manager(db, payload, manager_id, factory)
    units = [{"manager_id": m.id, "name": m.name, "shift": m.shift,
              "factory_id": m.factory_id} for m in pickable]

    dates = []
    cur = date_from
    while cur <= date_to:
        dates.append(cur)
        cur += timedelta(days=1)
    date_keys = [d.strftime("%d.%m.%Y") for d in dates]

    # ── The unit's cells. in_load is deliberately ignored (see module docstring).
    cells = (
        db.query(Cell)
        .filter(Cell.manager_id == mgr.id)
        .order_by(Cell.verifix_code)
        .all()
    )
    if not cells:
        return {
            "manager": {"id": mgr.id, "name": mgr.name, "shift": mgr.shift},
            "dates": date_keys, "managers": [], "data": {}, "cells": [],
            "units": units,
            "inputs": {}, "totals": {}, "fleet": {},
            "diagnostics": {
                "cells_without_sap": [],
                "work_centers_without_cell": [],
                "excluded_job_titles": [],
                "note": "This unit has no registered cells.",
            },
        }

    # ── Cell → work centre. Cells with no SAP code can never join production. ──
    wc_of_cell: dict[int, str] = {c.id: c.sap_code for c in cells if c.sap_code}
    cells_without_sap = [c.verifix_code for c in cells if not c.sap_code]
    wanted_wcs = set(wc_of_cell.values())

    # ── A work centre named by SEVERAL cells is split evenly between them ─────
    # Ten groups on the platform today, the largest six cells wide (Ibragimova
    # Sayyora's A2894). Such a group is ONE production line the registry spells
    # several ways: `pp_daily` and `pp_work_center_daily` are keyed by the WORK
    # CENTRE, so there is no per-cell trudoyomkost and no per-cell «Bugungi
    # fakt» to read, and nothing in the data says which of the cells produced
    # what.
    #
    # Handing each cell the WHOLE work centre — what this did until v4.82.0 —
    # broke both halves of the page. The cell measured the line's entire
    # production against a fraction of its people, so `labor_surplus` drove
    # `effective_hc` toward zero and the row read ±1000% (7222 and 7223 on
    # A14310: 938%, 2498%, 1644%). And the roll-up then added those minutes and
    # that headcount once PER CELL, so A2894 was counted six times over and the
    # unit's own row could not be reconciled against /zagruzka at all.
    #
    # So each cell carries 1/N of its work centre. EVENLY, and deliberately not
    # by attendance: `zagruzka_source.cell_people` already splits the same typed
    # number evenly across the same cells for the ojidaniya weight, and two
    # spellings of one split is how this page and /downtime would start
    # answering one cell-day two different ways. The per-cell figure is
    # therefore a SHARE, not a measurement, and is published as one
    # (`wc_share` / `wc_cells` on every input row) so it can never be read as
    # a number somebody typed for that cell.
    cells_per_wc: dict[str, int] = defaultdict(int)
    for _code in wc_of_cell.values():
        cells_per_wc[_code] += 1

    def _share(wc: Optional[str]) -> float:
        return 1.0 / cells_per_wc[wc] if wc and cells_per_wc.get(wc) else 1.0

    shared_wcs = {
        wc: sorted(c.verifix_code or f"#{c.id}" for c in cells
                   if wc_of_cell.get(c.id) == wc)
        for wc, n in cells_per_wc.items() if n > 1
    }

    # ── Trudoyomkost: Σ labor_time × qty ÷ 60, per (work centre, date) ─────────
    # labor_time lives on the catalog line (per SAP code + WC + operation); the
    # quantity is per (daily key, WC, date). Same grain, the same key (a code-less
    # line is keyed by its name — pp_calc.daily_key) and the same override
    # resolution as the Production dashboard, so the numbers agree with it.
    # Per CATALOG LINE, never per (work centre, SKU): two lines of one SKU are two
    # operations with their own labor_time, and since v4.32.0 they may carry their
    # own quantities too (models.PPLineDaily). Summing the labor first and
    # multiplying by one quantity — what this did before — cannot express that,
    # and would make this page disagree with the Positions table it mirrors.
    all_products = db.query(PPProduct).filter(PPProduct.manager_id == mgr.id).all()
    keys = line_keys(all_products)
    lines_by_key: dict[tuple[str, str], list[tuple[int, float]]] = defaultdict(list)
    products_missing_labor: set[str] = set()
    for p in all_products:
        if not p.active or p.work_center not in wanted_wcs:
            continue
        if p.labor_time is None:
            products_missing_labor.add(f"{p.work_center}/{p.sap_code or p.name}")
            continue
        lines_by_key[(p.work_center, daily_key(p.sap_code, p.name))].append(
            (keys.get(p.id, ""), float(p.labor_time)))

    # The two quantity levels, read exactly as the Positions table reads them:
    # the line's own value wins, else the group's, else the SAP snapshot.
    shared: dict[tuple[str, str, date], tuple] = {}
    for d in db.query(PPDaily).filter(
        PPDaily.manager_id == mgr.id,
        PPDaily.date >= date_from,
        PPDaily.date <= date_to,
    ).all():
        if d.work_center not in wanted_wcs:
            continue
        shared[(d.work_center, d.sap_code, d.date)] = (
            float((d.plan_override if d.plan_override is not None else d.plan_qty) or 0),
            float((d.actual_override if d.actual_override is not None else d.actual_qty) or 0),
        )
    per_line: dict[tuple[str, str, date, int], tuple] = {}
    for lo in db.query(PPLineDaily).filter(
        PPLineDaily.manager_id == mgr.id,
        PPLineDaily.date >= date_from,
        PPLineDaily.date <= date_to,
    ).all():
        if lo.work_center not in wanted_wcs:
            continue
        per_line[(lo.work_center, lo.qty_key, lo.date, lo.line_key)] = (
            (float(lo.plan_override) if lo.plan_override is not None else None),
            (float(lo.actual_override) if lo.actual_override is not None else None),
        )

    _pm, _am = line_minutes(lines_by_key, shared, per_line, _SEC_PER_MIN)
    plan_min: dict[tuple[str, date], float] = defaultdict(float, _pm)
    actual_min: dict[tuple[str, date], float] = defaultdict(float, _am)

    # ── O. SONI (N) per (work centre, day) — the formula's headcount ─────────
    # Same derivation as the Production dashboard (services/pp_calc.py), so the
    # number here always equals the «Jamoa tarkibi» card: a per-day people pin
    # wins outright; otherwise N = ROUND(W × Q ÷ S) where W is the (possibly
    # pinned) штатка, Q the day's plan minutes and S the WC's capacity — unless
    # the day pins an efficiency, then S = W × that rate for every cell.
    wcs = db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == mgr.id, PPWorkCenter.active.is_(True)
    ).all()
    shtatka: dict[str, float] = {w.code: float(w.shtatka or 0) for w in wcs}
    capacity: dict[str, Optional[float]] = {
        w.code: (float(w.capacity) if w.capacity is not None else None) for w in wcs
    }
    work_centers_without_cell = sorted(set(shtatka) - wanted_wcs)

    shtatka_pin: dict[tuple[str, date], float] = {}
    people_pin: dict[tuple[str, date], float] = {}
    for o in db.query(PPWorkCenterDaily).filter(
        PPWorkCenterDaily.manager_id == mgr.id,
        PPWorkCenterDaily.date >= date_from,
        PPWorkCenterDaily.date <= date_to,
    ).all():
        if o.shtatka is not None:
            shtatka_pin[(o.work_center, o.date)] = float(o.shtatka)
        if o.people is not None:
            people_pin[(o.work_center, o.date)] = float(o.people)

    day_pm_pin: dict[date, float] = {}
    for s in db.query(PPDaySetting).filter(
        PPDaySetting.manager_id == mgr.id,
        PPDaySetting.date >= date_from,
        PPDaySetting.date <= date_to,
    ).all():
        if s.productive_min is not None:
            day_pm_pin[s.date] = float(s.productive_min)

    _, _global_pm = _pp_constants(db)
    unit_pm = _unit_per_head(wcs, _global_pm)

    def o_soni(wc: str, d: date) -> tuple[float, bool]:
        """Effective O. SONI for one (work centre, day): (value, was_pinned).

        From `zagruzka_source.ZAGRUZKA_FROM` the TYPED «Bugungi fakt» is the
        only answer — the same rule the fleet загрузка now runs on, so the two
        pages cannot divide by two different headcounts for one cell-day. With
        nothing typed the cell has no загрузка at all (0 here, and
        `hc_required` below turns that into an explicit blank rather than a
        figure built out of the attendance correction).

        Before the floor the derived suggestion `ROUND(W × Q ÷ S)` still
        answers, exactly as it always did, so history is untouched.
        """
        pin = people_pin.get((wc, d))
        if pin is not None:
            return pin, True
        if zagruzka_source.uses_production(d):
            return 0.0, False
        w_eff = shtatka_pin.get((wc, d), shtatka.get(wc, 0.0))
        pm_pin = day_pm_pin.get(d)
        cap = capacity.get(wc)
        use_cap = bool(cap and cap > 0) and pm_pin is None
        s_eff = cap if use_cap else w_eff * (pm_pin if pm_pin else unit_pm)
        if s_eff > 0 and w_eff > 0:
            return float(_round_half_up(w_eff * plan_min.get((wc, d), 0.0) / s_eff)), False
        return 0.0, False

    # ── Attendance per (cell, date) ───────────────────────────────────────────
    # PRIMARY source: the DAILY «Davomat» single-file upload. Its rows land in
    # the per-manager `attendance` table already tagged with «Код подразделения»
    # (``Attendance.verifix_code``), so they carry the cell dimension this page
    # needs — and that upload runs every day, while the isolated `cell_attendance`
    # ingest is a test tab that only ever covered a handful of days.
    #
    # Matching is by CELL CODE, not by manager: the daily batch may hand a cell
    # to another supervisor for one day, and a per-cell page must keep the cell's
    # own attendance on the cell's own row.
    #
    # ``is_supervisor`` rows are excluded — the unit's cell-less brigadir is kept
    # off загрузка at every other enforcement point too.
    att_by_cell: dict[tuple[int, date], list] = defaultdict(list)
    excluded_titles: dict[str, int] = defaultdict(int)
    cell_ids = [c.id for c in cells]
    cell_id_set = set(cell_ids)
    code_to_cell = {c.verifix_code: c.id for c in cells if c.verifix_code}

    def _keep(r, cid: int, d: date) -> None:
        att_by_cell[(cid, d)].append(r)
        # Report rows dropped despite the worker actually being there — a title
        # the fleet rule doesn't recognise would silently shrink verifix_labor.
        if not is_direct_role(r.job_title, r.hours_worked,
                              getattr(r, "is_supervisor", False)):
            try:
                worked = float(r.hours_worked or 0) > 0
            except (TypeError, ValueError):
                worked = False
            if worked:
                excluded_titles[(r.job_title or "").strip() or "(blank)"] += 1

    sheet_days: set[date] = set()
    if code_to_cell:
        for r in db.query(Attendance).filter(
            Attendance.verifix_code.in_(list(code_to_cell)),
            Attendance.date >= date_from,
            Attendance.date <= date_to,
            Attendance.is_supervisor.is_(False),
        ).all():
            cid = code_to_cell.get(r.verifix_code)
            if cid is None:
                continue
            sheet_days.add(r.date)
            _keep(r, cid, r.date)

    # FALLBACK, resolved per DAY: `cell_attendance`, for days the daily sheet
    # does not cover at all — the days loaded through the «cellatt» tab before
    # the single-file flow started carrying cell codes (2026-08-01). That set is
    # now FROZEN: the tab was removed 2026-08-17, so nothing new lands in the
    # table and this branch only ever serves those historical days.
    #
    # Per DAY, never per cell: on a day the sheet DOES cover, a cell with no rows
    # was deliberately ticked out of that day's batch, and falling back would
    # resurrect attendance an admin had excluded on purpose.
    #
    # Matched by resolved id OR raw code, exactly like the cell-details footprint
    # (routers/profiles.py): the upload keeps a row even when its «Код
    # подразделения» matched no cell at the time, and an id-only filter makes
    # those rows invisible here while every other surface still shows them.
    cell_match = [CellAttendance.cell_id.in_(cell_ids)]
    if code_to_cell:
        cell_match.append(CellAttendance.verifix_code.in_(list(code_to_cell)))
    fallback_days: set[date] = set()
    for r in db.query(CellAttendance).filter(
        or_(*cell_match),
        CellAttendance.date >= date_from,
        CellAttendance.date <= date_to,
    ).all():
        if r.date in sheet_days:
            continue
        cid = r.cell_id if r.cell_id in cell_id_set else code_to_cell.get(r.verifix_code)
        if cid is None:
            continue
        fallback_days.add(r.date)
        _keep(r, cid, r.date)

    # ── Ojidaniya per (cell, date): the UNION of the day's STOPPED ranges ─────
    # An ojidaniya is a start→end EVENT (2026-08-20), so a cell's waiting time
    # is the UNION of its ranges — every minute counted ONCE however many causes
    # were filed over it. ``services/idle_intervals`` is THE definition and the
    # only place that arithmetic lives; summing the ranges here instead would
    # re-create precisely the over-count the interval model was built to kill
    # (one 30-minute stop filed under two categories reading as 60).
    #
    # The Ojidaniya-only categories (OJIDANIYA_ONLY_CATS — Cat H today) are
    # dropped BEFORE the union, never subtracted after it.
    # They must not count against загрузка (the fleet rule, 2026-07-25) and they
    # may overlap the categories that do, so subtracting their minutes from the
    # total would also remove minutes a counted range was covering. The
    # consequence is worth knowing and is therefore reported rather than hidden:
    # the figure here is ≤ the «To'xtaganda» total /idle-cell prints for the
    # same cell-day, and ``excluded_min`` is exactly the difference.
    #
    # A not-stopped range never enters anything ("we don't care about
    # to'xtamaganda") — ``summarize`` drops it, so nothing here has to.
    idle_by_cell: dict[tuple[int, str], float] = defaultdict(float)
    idle_cats: dict[tuple[int, str], dict] = defaultdict(dict)
    idle_meta: dict[tuple[int, str], dict] = {}
    iso_lo, iso_hi = date_from.isoformat(), date_to.isoformat()

    iv_by_cell: dict[tuple[int, str], list] = defaultdict(list)
    for iv in db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.cell_id.in_(cell_ids),
        CellOjidaniyaInterval.date >= iso_lo,
        CellOjidaniyaInterval.date <= iso_hi,
        # A leader's entry is a REQUEST until their brigadir confirms it. An
        # unconfirmed one must not move a KPI: this page and /idle-cell read the
        # same table, so they answer "approved only" the same way.
        CellOjidaniyaInterval.status == "approved",
    ).all():
        iv_by_cell[(iv.cell_id, iv.date)].append(iv)

    for k, ivs in iv_by_cell.items():
        counted = [
            {"id": iv.id, "category": iv.category, "start": iv.start,
             "end": iv.end, "stopped": bool(iv.stopped)}
            for iv in ivs if iv.category not in OJIDANIYA_ONLY_CATS
        ]
        summary = idle_intervals.summarize(counted)
        # What /idle-cell shows for this cell-day: the union over EVERY stopped
        # category. The difference is what the загрузка rule leaves out, and an
        # operator comparing the two pages is owed that number.
        all_union = idle_intervals.union_minutes([
            sp for sp in (idle_intervals.span(iv.start, iv.end)
                          for iv in ivs if iv.stopped) if sp
        ])
        idle_by_cell[k] = float(summary["stopped_union_min"])
        idle_cats[k] = {cat: c["union_min"]
                        for cat, c in summary["by_category"].items()
                        if c["union_min"]}
        idle_meta[k] = {
            "source": "intervals",
            "events": summary["stopped_count"],
            # What the pre-interval method would have reported, and by how much
            # it over-reported. Shown on the page for the same reason
            # /idle-cell shows it: a figure that silently changed reads as a bug.
            "sum_min": summary["stopped_sum_min"],
            "overlap_min": summary["overlap_min"],
            "excluded_min": max(0, all_union - summary["stopped_union_min"]),
            "all_cats_union_min": all_union,
        }

    # Days that predate the interval model keep their old numbers. The fallback
    # is per (cell, DAY) and fires ONLY for a day holding no interval at all, so
    # the two models are never mixed inside one day's arithmetic — a day filed
    # under the new model is answered by the union alone, even when that union
    # is 0 because every range on it was Ojidaniya-only.
    legacy_keys: set[tuple[int, str]] = set()
    for e in db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id.in_(cell_ids),
        CellOjidaniya.date >= iso_lo,
        CellOjidaniya.date <= iso_hi,
    ).all():
        k = (e.cell_id, e.date)
        if k in iv_by_cell or e.category in OJIDANIYA_ONLY_CATS:
            continue
        mins = float(e.stopped or 0)
        if mins <= 0:
            continue
        legacy_keys.add(k)
        idle_by_cell[k] += mins
        idle_cats[k][e.category] = mins
        meta = idle_meta.setdefault(k, {
            "source": "legacy", "events": 0, "sum_min": 0.0,
            # With only durations on record an overlap is unrepresentable, so
            # the over-count is unknown — null, never 0, which would claim the
            # old figure was checked and found clean.
            "overlap_min": None, "excluded_min": None,
            "all_cats_union_min": None,
        })
        meta["events"] += 1
        meta["sum_min"] += mins

    # ── The unit's own inputs — the SAME three the fleet page reads ───────────
    # `totals` below is the brigadir's own row, and from v4.82.0 it is computed
    # on /zagruzka's logic rather than by adding the cells up (the operator's
    # directive). Three of the fleet's rules could not be reproduced by a sum
    # over the rows on screen, and every one of them moved the number:
    #
    #   * трудоёмкость is the WHOLE unit's — every active catalog line, over
    #     every work centre, whether or not a cell names it and whether or not
    #     anybody typed its people. Divided by the TYPED pins alone. That
    #     asymmetry is deliberate on the fleet page (a unit that types 4 of its
    #     6 work centres reads a load that is too high — the pressure to type
    #     them all is the point), and a roll-up that dropped an untyped work
    #     centre's minutes as well as its people answered a different question:
    #     Ergashev Muxriddin on 07.09.2026 read 78% here against 572% there.
    #   * attendance is the unit's own rows, not the union of the rows carrying
    #     one of its cell codes — a worker whose «Код подразделения» is blank,
    #     or points at a cell the daily batch lent to another supervisor, is
    #     still on this unit's payroll and still in its verifix_labor.
    #   * a work centre with no cell at all has no row here to be summed.
    #
    # `zagruzka_source.unit_labor` / `unit_people` ARE those numbers — the same
    # functions `build_metrics_list` calls — so the two pages cannot answer one
    # unit-day two ways. Never re-spell them here.
    #
    # The cells' own aggregate is still computed, published as `cells_sum` and
    # charted against this row in the reconciliation card: "do the cells add up
    # to the unit" is the question this page exists to ask, and it is worth
    # asking out loud instead of being smuggled into the headline row.
    data: dict[str, dict[str, dict]] = {}
    inputs: dict[str, dict[str, dict]] = {}
    z_lo = zagruzka_source.range_start(date_from, date_to)
    z_labor: dict = {}
    z_people: dict = {}
    if z_lo is not None:
        z_labor = zagruzka_source.unit_labor(db, [mgr.id], z_lo, date_to)
        z_people = zagruzka_source.unit_people(
            zagruzka_source.typed_people(db, [mgr.id], z_lo, date_to))

    # The unit's own attendance, keyed by day — the fleet's set exactly
    # (`manager_id`, no `is_supervisor` filter: `is_direct_role` drops the
    # brigadir's own row inside `compute_metrics`, and doing it twice in two
    # places is how the two pages would start disagreeing about who counts).
    unit_att: dict[date, list] = defaultdict(list)
    for r in db.query(Attendance).filter(
        Attendance.manager_id == mgr.id,
        Attendance.date >= date_from,
        Attendance.date <= date_to,
    ).all():
        unit_att[r.date].append(r)

    # The cells' own aggregate, summed BEFORE the formula so it is a real
    # unit-level загрузка and not an average of per-cell percentages. Shares
    # make each work centre land here exactly once.
    roll: dict[date, dict] = {
        d: {"prod_plan": 0.0, "prod_actual": 0.0, "official_hc": 0.0,
            "downtime_w": 0.0, "downtime_n": 0.0, "att": []} for d in dates
    }
    collapsed_hc = 0
    # Cell-days blanked because nobody typed «Bugungi fakt» for them.
    no_typed_hc = 0   # cells blanked for a non-positive effective headcount

    # Days attendance actually covers for this unit's cells, from either source.
    # SAP production covers every working day, so without this the page can't
    # tell "nobody worked" from "the file for that day was never uploaded".
    days_with_attendance = sorted({d for (_cid, d) in att_by_cell})

    for c in cells:
        label = _cell_label(c)
        wc = wc_of_cell.get(c.id)
        data[label] = {}
        inputs[label] = {}
        for d, key in zip(dates, date_keys):
            att_rows = att_by_cell.get((c.id, d), [])
            downtime = idle_by_cell.get((c.id, d.isoformat()), 0.0)
            # 1/N of the work centre where several cells name it — see the
            # `cells_per_wc` block above. N == 1 for every other cell, so this
            # is the identity for all but the ten shared groups.
            share = _share(wc)
            p_plan = plan_min.get((wc, d), 0.0) * share if wc else 0.0
            p_actual = actual_min.get((wc, d), 0.0) * share if wc else 0.0
            hc_wc, hc_pinned = o_soni(wc, d) if wc else (0.0, False)
            hc = hc_wc * share

            # Attendance is a REQUIRED input, not an optional one. With no rows
            # verifix_labor is 0, so the surplus term (0 − prod_actual) ÷ base is
            # strongly negative, effective_hc collapses past zero and the result
            # explodes or flips sign (the ±1000% cells). The per-cell verifix
            # export is uploaded for only SOME days while SAP production covers
            # every working day, so an attendance-less day must read as "no
            # data" — never as a number derived from a zero headcount.
            if not att_rows:
                data[label][key] = {"baseline_util": None, "net_util": None}
                continue

            on_prod = zagruzka_source.uses_production(d)
            if on_prod and hc <= 0:
                # Nobody typed this cell's people on «Odamlar soni». The blank
                # IS the warning — never a zero, which would read as a cell that
                # stood idle all day.
                data[label][key] = {"baseline_util": None, "net_util": None}
                no_typed_hc += 1
                continue

            m = compute_metrics(
                manager_id=c.id,
                manager_name=label,
                shift=mgr.shift,
                date=key,
                attendance_rows=att_rows,
                prod_plan=p_plan,
                prod_actual=p_actual,
                official_hc=hc,
                equip_downtime=downtime,
                downtime_by_cat=idle_cats.get((c.id, d.isoformat()), {}),
                hc_required=on_prod,
                basis="production" if on_prod else "sheet",
            )
            # PARTIAL attendance collapses the maths the same way a missing file
            # does, in two shapes:
            #   verifix_hc <= 0 — rows exist but NONE survived the direct-role /
            #     hours filter, so verifix_labor is 0 and the load is derived
            #     from nobody. (`excluded_job_titles` below names the titles
            #     that were dropped, which is usually the reason.)
            #   effective_hc <= 0 — recorded labour far below produced labour
            #     drives the surplus term negative past официальный headcount.
            # compute_metrics only guards against effective_hc being exactly 0 —
            # the fleet page never sees either case because its attendance is
            # always whole — so unguarded these surface as the ±1000% cells.
            #
            # A TOLERANCE test, never `== 0`: since 2026-08-30 verifix_hc is a
            # sum of fractional weights, so a cell holding only split halves
            # legitimately reads 0.4 and an exact-equality guard would be one
            # rounding away from either passing a headcount of nobody or
            # blanking a cell that has real people standing in it.
            if m.verifix_hc <= 0 or m.effective_hc is None or m.effective_hc <= 0:
                data[label][key] = {"baseline_util": None, "net_util": None}
                collapsed_hc += 1
                continue
            data[label][key] = {
                "baseline_util": m.baseline_util,
                "net_util": m.net_util,
                "prod_actual": m.prod_actual,
                "prod_plan": m.prod_plan,
                "official_hc": m.official_hc,
                "avail_min": m.avail_min,
                "effective_hc": m.effective_hc,
                # Components of effective_hc, for the comment popup's breakdown.
                "labor_surplus": m.labor_surplus,
                "verifix_labor": m.verifix_labor,
                "equip_downtime": m.equip_downtime,
                "avg_early_arrival": m.avg_early_arrival,
            }
            inputs[label][key] = {
                "work_center": wc,
                # How much of that work centre this cell carries, and how many
                # cells it is shared with. 1.0 / 1 for all but the ten shared
                # groups. Published because trud_plan, trud_actual and o_soni
                # are then SHARES of a work-centre-level number and not facts
                # measured for this cell — a distinction the reader cannot make
                # from the figure alone, and the same one «Bugungi fakt» draws
                # between a typed pin and a derived suggestion.
                "wc_share": round(share, 4),
                "wc_cells": cells_per_wc.get(wc, 1) if wc else 1,
                "trud_plan": round(p_plan, 2),
                "trud_actual": round(p_actual, 2),
                "o_soni": hc,
                "o_soni_pinned": hc_pinned,
                "shtatka": shtatka_pin.get((wc, d), shtatka.get(wc, 0.0)) if wc else 0.0,
                "shtatka_pinned": (wc, d) in shtatka_pin,
                "verifix_labor": m.verifix_labor,
                "verifix_hc": m.verifix_hc,
                "att_rows": len(att_rows),
                "downtime": round(downtime, 2),
                "downtime_by_cat": idle_cats.get((c.id, d.isoformat()), {}),
                # Which model answered, what the old one would have said, and
                # what the Ojidaniya-only rule left out — the page prints it
                # under the figure, because a corrected number arriving with no
                # trace of the correction just looks like the number changed.
                "downtime_meta": idle_meta.get((c.id, d.isoformat())),
                # N as used in the unit's weighted mean, beside the T it weights.
                "idle_weight_n": m.verifix_hc,
                "avg_early_arrival": m.avg_early_arrival,
                "adjusted_util": m.adjusted_util,
                "after_idle_util": m.after_idle_util,
                "after_early_util": m.after_early_util,
            }

            r = roll[d]
            r["prod_plan"] += p_plan
            r["prod_actual"] += p_actual
            r["official_hc"] += hc
            # Ojidaniya is a per-person minute deduction, so the unit's figure
            # is the HEADCOUNT-WEIGHTED mean of its cells' totals —
            # (N1*T1 + … + Nn*Tn) ÷ (N1 + … + Nn), the user's formula
            # (2026-08-20). A plain average of the cells' minutes would let a
            # two-person cell's long stop outweigh a twenty-person cell's short
            # one, which is the opposite of how the loss was actually paid.
            #
            # N was the people who ACTUALLY worked the cell — the direct-role
            # attendance count — until 2026-09-02. **From
            # `zagruzka_source.ZAGRUZKA_FROM` it is the cell's typed O. SONI**,
            # the operator's directive and the same number `idle_source`
            # weighs the fleet figure with, so this page and /downtime can
            # never answer «how long did this unit wait» two different ways.
            # A cell with no typed number never reaches this line (the guard
            # above), so it contributes to neither side of the mean.
            n_idle = float(hc) if on_prod else float(m.verifix_hc)
            r["downtime_w"] += downtime * n_idle
            r["downtime_n"] += n_idle
            r["att"] += att_rows

    def _row(m, extra: Optional[dict] = None, guard: bool = True) -> dict:
        """One computed figure as the grid consumes it.

        Both the unit row and the cells' aggregate publish the same keys, so
        the reconciliation card, the funnel and the inputs table read one shape
        whichever side they are pointed at.

        `guard` blanks a collapsed headcount, and it is what the per-cell rows
        and `cells_sum` are built on: their attendance is PARTIAL by
        construction (only the rows carrying a cell code, only the cells that
        have any), so recorded labour far below produced labour drives the
        surplus term past the headcount and the figure explodes or flips sign —
        the ±1000% cells. The tolerance test is written against `<= 0` and never
        `== 0`, because since 2026-08-30 `verifix_hc` is a sum of fractional
        weights and an exact-equality guard would be one rounding away from
        passing a headcount of nobody.

        The UNIT row passes `guard=False`. Its attendance is the unit's whole
        payroll, so that failure mode cannot arise from a partial file — and
        where the arithmetic really does collapse, /zagruzka prints the number.
        A page whose whole purpose is to be reconciled against it must not go
        blank on exactly the day the fleet figure is worth questioning.
        """
        if guard and (m.verifix_hc <= 0 or m.effective_hc is None or m.effective_hc <= 0):
            return {"baseline_util": None, "net_util": None}
        out = {
            "baseline_util": m.baseline_util,
            "net_util": m.net_util,
            "prod_actual": m.prod_actual,
            "prod_plan": m.prod_plan,
            "official_hc": m.official_hc,
            "avail_min": m.avail_min,
            "effective_hc": m.effective_hc,
            "labor_surplus": m.labor_surplus,
            "equip_downtime": m.equip_downtime,
            "avg_early_arrival": m.avg_early_arrival,
            "verifix_labor": m.verifix_labor,
            "verifix_hc": m.verifix_hc,
        }
        out.update(extra or {})
        return out

    # ── The brigadir's own row: /zagruzka's logic, not a sum of the cells ─────
    # See the `unit_labor` / `unit_people` block above for why. From
    # `ZAGRUZKA_FROM` the three inputs are the fleet's own; before it the page
    # keeps deriving them from the cells, because the fleet reads the two sheet
    # tabs there and this page has never had access to them.
    totals: dict[str, dict] = {}
    for d, key in zip(dates, date_keys):
        r = roll[d]
        on_prod = zagruzka_source.uses_production(d)
        iso = d.isoformat()

        if on_prod:
            u_att = unit_att.get(d, [])
            u_plan, u_actual = z_labor.get((mgr.id, iso), (0.0, 0.0))
            u_hc = z_people.get((mgr.id, iso), 0.0)
        else:
            u_att = r["att"]
            u_plan, u_actual, u_hc = r["prod_plan"], r["prod_actual"], r["official_hc"]

        # Same rule as the individual cells: no attendance ⇒ no number, or the
        # row would publish a figure derived from a zero headcount. And no
        # typed people ⇒ no загрузка at all, which is the blank the fleet page
        # shows for the same unit-day and for the same reason.
        if not u_att or (on_prod and u_hc <= 0):
            totals[key] = {"baseline_util": None, "net_util": None}
            continue

        # The ojidaniya deduction is the headcount-weighted mean of the cells,
        # Σ(Nᵢ·Tᵢ) ÷ ΣNᵢ — and with the work-centre share applied above, N is
        # now the same weight `idle_source._n_by_cell` gives the fleet figure
        # (a work centre's typed people split evenly between the cells naming
        # it), so the two pages deduct the same minutes from the same day.
        m = compute_metrics(
            manager_id=mgr.id,
            manager_name=mgr.name or "",
            shift=mgr.shift,
            date=key,
            attendance_rows=u_att,
            prod_plan=u_plan,
            prod_actual=u_actual,
            official_hc=u_hc,
            equip_downtime=((r["downtime_w"] / r["downtime_n"])
                            if r["downtime_n"] else 0.0),
            downtime_by_cat={},
            hc_required=on_prod,
            basis="production" if on_prod else "sheet",
        )
        totals[key] = _row(m, guard=False, extra={
            # Σ N — the divisor of the weighted mean above. Published so the
            # unit's deduction can be re-derived from the rows on screen
            # instead of being taken on trust.
            "idle_weight_n": r["downtime_n"],
            "idle_weight_sum": round(r["downtime_w"], 2),
            # Which side each input came from, so «why does this row not equal
            # the rows above it» is answerable on the page.
            "basis": m.basis,
            "att_rows": len(u_att),
        })

    # ── The cells' own aggregate, for the reconciliation card ────────────────
    # What the rows on screen add up to: their shared трудоёмкость, their
    # typed people, their attendance. It is EXPECTED to sit below the unit row
    # whenever a work centre has no cell, a cell has no SAP code, a cell's
    # people were never typed, or a worker's «Код подразделения» is blank —
    # and naming that gap is the whole reason this page exists.
    cells_sum: dict[str, dict] = {}
    for d, key in zip(dates, date_keys):
        r = roll[d]
        on_prod = zagruzka_source.uses_production(d)
        if not r["att"] or (on_prod and r["official_hc"] <= 0):
            cells_sum[key] = {"baseline_util": None, "net_util": None}
            continue
        cm = compute_metrics(
            manager_id=mgr.id,
            manager_name=mgr.name or "",
            shift=mgr.shift,
            date=key,
            attendance_rows=r["att"],
            prod_plan=r["prod_plan"],
            prod_actual=r["prod_actual"],
            official_hc=r["official_hc"],
            equip_downtime=((r["downtime_w"] / r["downtime_n"])
                            if r["downtime_n"] else 0.0),
            downtime_by_cat={},
            hc_required=on_prod,
            basis="production" if on_prod else "sheet",
        )
        cells_sum[key] = _row(cm, {
            "idle_weight_n": r["downtime_n"],
            "idle_weight_sum": round(r["downtime_w"], 2),
            "att_rows": len(r["att"]),
        })

    # ── The fleet page's own figure for this unit, to reconcile against ───────
    # Different sources entirely (sheet imports vs pp_*), so these are EXPECTED
    # to differ; the page shows the delta, never asserts they should match.
    fleet: dict[str, dict] = {}
    for fm in build_metrics_list(db, date_from, date_to, None, [mgr.id],
                                 require_closed=False):
        fleet[fm.date] = {
            "baseline_util": fm.baseline_util,
            "net_util": fm.net_util,
            "prod_plan": fm.prod_plan,
            "prod_actual": fm.prod_actual,
            "official_hc": fm.official_hc,
            "equip_downtime": fm.equip_downtime,
            "verifix_labor": fm.verifix_labor,
            "verifix_hc": fm.verifix_hc,
            "avg_early_arrival": fm.avg_early_arrival,
        }

    # ── Which ojidaniya model answered which day ─────────────────────────────
    # Named for the same reason the attendance sources are: a day still counted
    # by the retired minutes-only rows carries the over-count that model could
    # not see, and nothing else on the page could tell it apart from a day the
    # union corrected.
    def _idle_days(keys) -> list[str]:
        return [date.fromisoformat(iso).strftime("%d.%m.%Y")
                for iso in sorted({iso for (_cid, iso) in keys})]

    idle_overlap_min = sum(float(mt["overlap_min"] or 0) for mt in idle_meta.values())
    idle_excluded_min = sum(float(mt["excluded_min"] or 0) for mt in idle_meta.values())

    return {
        "manager": {"id": mgr.id, "name": mgr.name, "shift": mgr.shift},
        "dates": date_keys,
        # `managers` keeps the /api/heatmap key name so ComparisonTable and
        # HeatmapChart take this payload unchanged — the rows are cells here.
        "managers": [_cell_label(c) for c in cells],
        "data": data,
        "cells": [
            {
                "cell_id": c.id,
                "label": _cell_label(c),
                "verifix_code": c.verifix_code,
                "sap_code": c.sap_code,
                "name_uz": c.name_workshop_uz,
                "name_uz_cyrl": c.name_workshop_uz_cyrl,
                "name_ru": c.name_workshop_ru,
                "name_en": c.name_workshop_en,
                "shtatka": shtatka.get(c.sap_code) if c.sap_code else None,
                "joined": bool(c.sap_code and c.sap_code in shtatka),
            }
            for c in cells
        ],
        "inputs": inputs,
        "totals": totals,
        # What the cells on screen add up to. `totals` above is the unit's own
        # figure on the fleet's logic; this is the sum of the rows under it, and
        # the reconciliation card charts one against the other.
        "cells_sum": cells_sum,
        "fleet": fleet,
        # The units this viewer may switch between — the page's own picker list,
        # decided here so a control can never offer a unit the query refuses.
        "units": units,
        "diagnostics": {
            # The days attendance covers. Everything outside this list is blank
            # BY DESIGN, not because the cells were idle.
            "days_with_attendance": [d.strftime("%d.%m.%Y") for d in days_with_attendance],
            "days_in_range": len(dates),
            # Which source fed each day: the daily factory-wide «Davomat» sheet,
            # or the retired per-cell «cellatt» upload. Named because a day
            # missing from BOTH is a day nobody uploaded, and that is worth
            # seeing — and because `cell_upload` can no longer grow.
            "attendance_sources": {
                "sheet": [d.strftime("%d.%m.%Y") for d in sorted(sheet_days)],
                "cell_upload": [d.strftime("%d.%m.%Y") for d in sorted(fallback_days)],
            },
            # The same question for ojidaniya: the start→end intervals (counted
            # as a union) or the retired minutes-only rows (a plain sum, with
            # an over-count nothing can measure).
            "ojidaniya_sources": {
                "intervals": _idle_days(iv_by_cell.keys()),
                "legacy": _idle_days(legacy_keys),
            },
            # Across the range: what the old method double-counted, and the
            # Ojidaniya-only minutes /idle-cell shows that загрузка never counts.
            "ojidaniya_overlap_min": round(idle_overlap_min, 1),
            "ojidaniya_excluded_min": round(idle_excluded_min, 1),
            # Cells dropped because partial attendance drove effective_hc ≤ 0.
            "collapsed_effective_hc": collapsed_hc,
            # Work centres named by more than one cell. Each such cell carries
            # 1/N of the work centre's трудоёмкость and typed people, because
            # neither is recorded per cell — so those rows are SHARES and the
            # page says so rather than letting a split figure read as a
            # measurement.
            "shared_work_centers": [
                {"work_center": wc, "cells": codes}
                for wc, codes in sorted(shared_wcs.items())
            ],
            # Cell-days blanked from `zagruzka_source.ZAGRUZKA_FROM` on because
            # nobody typed «Bugungi fakt» for that work centre. Named, because
            # a blank the page does not count reads as a quiet day.
            "no_typed_headcount": no_typed_hc,
            # A cell with no SAP code, or one whose code matches no configured
            # work centre, can never carry production numbers — say so loudly
            # instead of letting the row sit empty and look like a quiet day.
            "cells_without_sap": cells_without_sap,
            "cells_without_work_center": sorted(
                c.verifix_code for c in cells
                if c.sap_code and c.sap_code not in shtatka
            ),
            "work_centers_without_cell": work_centers_without_cell,
            "products_missing_labor_time": sorted(products_missing_labor),
            "excluded_job_titles": [
                {"title": k, "rows": v}
                for k, v in sorted(excluded_titles.items(), key=lambda kv: -kv[1])
            ],
        },
    }
