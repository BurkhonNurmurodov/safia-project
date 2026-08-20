"""Per-CELL загрузка — a TEST twin of the /zagruzka page, computed for the
cells of ONE hard-locked supervisor («Suvonov Elshod Of», the sheet's SUVONOV
TEST unit).

It runs the SAME formula as the fleet page (``services/kpi_calculator.compute_metrics``)
so the two are directly comparable; only the INPUTS are re-sourced from per-cell
tables instead of the per-supervisor sheet imports:

    input          fleet /zagruzka                 this page (per cell)
    ─────────────  ──────────────────────────────  ──────────────────────────────
    prod_plan      production_data.prod_plan       Σ pp_products.labor_time
    prod_actual    production_data.prod_actual       × pp_daily.plan_qty|actual_qty ÷ 60
                                                     over the cell's work centre
    official_hc    headcount_data.official_hc      effective O. SONI (N): the
                                                     pp_work_center_daily.people pin,
                                                     else ROUND(W × Q ÷ S) exactly as
                                                     services/pp_calc derives it
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
    first version, which fed штатка in. O. SONI is the Production page's
    effective value: the per-day pin when the brigadir set one, else the derived
    ROUND(W × Q ÷ S), so the number here always matches the «Jamoa tarkibi» card.
  * Ojidaniya = the UNION of the day's To'xtaganda (stopped) ranges, Cat H /
    Cat I dropped BEFORE the union (2026-08-20; see the block that computes it).
    A not-stopped range never counts, here or anywhere else.
  * The unit's own figure is the HEADCOUNT-WEIGHTED mean of its cells',
    (N1*T1 + ... + Nn*Tn) / (N1 + ... + Nn), where N is the people who actually
    worked that cell that day — the user's formula, 2026-08-20.
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
import re

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Attendance, Cell, CellAttendance, CellOjidaniya, CellOjidaniyaInterval,
    Manager, PPDaily, PPDaySetting, PPProduct, PPWorkCenter, PPWorkCenterDaily,
)
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.routers.production import _constants as _pp_constants, _unit_per_head
from app.services import idle_intervals
from app.services.kpi_calculator import compute_metrics, is_direct_role
from app.services.pp_calc import _round_half_up
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

router = APIRouter(prefix="/api/zagruzka-cell", tags=["zagruzka-cell"])

PAGE = "zagruzka-cell"

# ── The one supervisor this page serves ──────────────────────────────────────
# Hard-locked by request: the page must never read as factory-wide. Resolution
# is by NAME first (the canonical-rename cascade means ids outlive spellings but
# a name is what the user asked for), falling back to the documented unit id.
# «Suvonov Elshod Valijon O'g'li» is a DIFFERENT unit — the "Of" / "Оф" suffix is
# what separates them, so it is matched as a whole word, never as a substring.
LOCKED_MANAGER_ID = 5
_SUVONOV_RE = re.compile(r"suvonov|сувонов", re.IGNORECASE)
_OF_SUFFIX_RE = re.compile(r"(?:^|[\s.])(?:of|оф)\b\.?", re.IGNORECASE)

# Excel ROUND-trip constant shared with pp_calc: labor_time is seconds/unit.
_SEC_PER_MIN = 60.0


def _resolve_locked_manager(db: Session) -> tuple[Manager, Optional[str]]:
    """The locked unit plus a warning when we had to fall back to the id.

    Returns (manager, warning|None). Raises 404 only when neither the name match
    nor the id resolves — the page then renders the message instead of an empty
    grid that looks like "no data"."""
    actives = db.query(Manager).filter(Manager.archived.is_(False)).all()
    matches = [
        m for m in actives
        if m.name and _SUVONOV_RE.search(m.name) and _OF_SUFFIX_RE.search(m.name)
    ]
    if len(matches) == 1:
        return matches[0], None
    fallback = db.query(Manager).filter(Manager.id == LOCKED_MANAGER_ID).first()
    if not fallback:
        raise HTTPException(
            status_code=404,
            detail=("Supervisor «Suvonov Elshod Of» not found: no active unit matches "
                    f"the name and unit #{LOCKED_MANAGER_ID} does not exist."),
        )
    if len(matches) > 1:
        warn = (f"{len(matches)} units match «Suvonov … Of»; locked to "
                f"#{fallback.id} «{fallback.name}» by id.")
    else:
        warn = (f"No active unit is named «Suvonov Elshod Of»; locked to "
                f"#{fallback.id} «{fallback.name}» by id.")
    return fallback, warn


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
    """Row key for the grid. The verifix code is the cell's stable identity and
    is what every other per-cell page shows, so it leads; the workshop name is
    appended when known. Must be unique — the grid is keyed by it."""
    name = c.name_workshop_ru or c.name_workshop_uz or c.name_workshop_en
    return f"{c.verifix_code} · {name}" if name else (c.verifix_code or f"#{c.id}")


@router.get("")
def cell_zagruzka(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE)),
):
    """The whole page in one payload: a cells × dates grid in the same shape
    /api/heatmap returns (so ComparisonTable and HeatmapChart consume it
    verbatim), plus the raw inputs behind every number, a rolled-up totals row,
    and the fleet page's figure for the same unit to reconcile against."""
    date_from, date_to = _parse_range(date_from, date_to)
    mgr, lock_warning = _resolve_locked_manager(db)

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
            "inputs": {}, "totals": {}, "fleet": {},
            "diagnostics": {
                "lock_warning": lock_warning,
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

    # ── Trudoyomkost: Σ labor_time × qty ÷ 60, per (work centre, date) ─────────
    # labor_time lives on the catalog line (per SAP code + WC + operation); the
    # quantity is per (SAP code, WC, date). Same grain and the same override
    # resolution as the Production dashboard, so the numbers agree with it.
    labor_by_wc_sap: dict[tuple[str, str], float] = defaultdict(float)
    products_missing_labor: set[str] = set()
    for p in db.query(PPProduct).filter(
        PPProduct.manager_id == mgr.id, PPProduct.active.is_(True)
    ).all():
        if p.work_center not in wanted_wcs:
            continue
        if p.labor_time is None:
            products_missing_labor.add(f"{p.work_center}/{p.sap_code}")
            continue
        labor_by_wc_sap[(p.work_center, p.sap_code)] += float(p.labor_time)

    plan_min: dict[tuple[str, date], float] = defaultdict(float)
    actual_min: dict[tuple[str, date], float] = defaultdict(float)
    for d in db.query(PPDaily).filter(
        PPDaily.manager_id == mgr.id,
        PPDaily.date >= date_from,
        PPDaily.date <= date_to,
    ).all():
        if d.work_center not in wanted_wcs:
            continue
        labor = labor_by_wc_sap.get((d.work_center, d.sap_code))
        if not labor:
            continue
        plan_qty = d.plan_override if d.plan_override is not None else d.plan_qty
        actual_qty = d.actual_override if d.actual_override is not None else d.actual_qty
        plan_min[(d.work_center, d.date)] += labor * float(plan_qty or 0) / _SEC_PER_MIN
        actual_min[(d.work_center, d.date)] += labor * float(actual_qty or 0) / _SEC_PER_MIN

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
        """Effective O. SONI for one (work centre, day): (value, was_pinned)."""
        pin = people_pin.get((wc, d))
        if pin is not None:
            return pin, True
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
    # Cat H / Cat I are dropped BEFORE the union, never subtracted after it.
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
    # is 0 because every range on it was Cat H / Cat I.
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

    # ── Compute every (cell, date) through the fleet formula ──────────────────
    data: dict[str, dict[str, dict]] = {}
    inputs: dict[str, dict[str, dict]] = {}
    # Rolled-up unit totals per date, summed BEFORE the formula so the total is a
    # real unit-level загрузка, not an average of per-cell percentages.
    roll: dict[date, dict] = {
        d: {"prod_plan": 0.0, "prod_actual": 0.0, "official_hc": 0.0,
            "downtime_w": 0.0, "downtime_n": 0.0, "att": []} for d in dates
    }
    collapsed_hc = 0   # cells blanked for a non-positive effective headcount

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
            p_plan = plan_min.get((wc, d), 0.0) if wc else 0.0
            p_actual = actual_min.get((wc, d), 0.0) if wc else 0.0
            hc, hc_pinned = o_soni(wc, d) if wc else (0.0, False)

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
            )
            # PARTIAL attendance collapses the maths the same way a missing file
            # does, in two shapes:
            #   verifix_hc == 0 — rows exist but NONE survived the direct-role /
            #     hours filter, so verifix_labor is 0 and the load is derived
            #     from nobody. (`excluded_job_titles` below names the titles
            #     that were dropped, which is usually the reason.)
            #   effective_hc <= 0 — recorded labour far below produced labour
            #     drives the surplus term negative past официальный headcount.
            # compute_metrics only guards against effective_hc being exactly 0 —
            # the fleet page never sees either case because its attendance is
            # always whole — so unguarded these surface as the ±1000% cells.
            if m.verifix_hc == 0 or m.effective_hc is None or m.effective_hc <= 0:
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
                "equip_downtime": m.equip_downtime,
                "avg_early_arrival": m.avg_early_arrival,
            }
            inputs[label][key] = {
                "work_center": wc,
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
                # what the Cat H/I rule left out — the page prints it under the
                # figure, because a corrected number arriving with no trace of
                # the correction just looks like the number changed.
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
            # N is the people who ACTUALLY worked the cell that day (the user's
            # ruling): the direct-role attendance count that already drives this
            # cell's own load, never the planned O. SONI. Nobody waits in a cell
            # they did not come to, and a plan overstating a cell would pull the
            # unit's deduction toward a stoppage those people never stood
            # through. A cell with no attendance never reaches this line at all
            # (the guards above), so it contributes to neither side of the mean.
            n_idle = float(m.verifix_hc)
            r["downtime_w"] += downtime * n_idle
            r["downtime_n"] += n_idle
            r["att"] += att_rows

    # ── Totals row: the same formula over the summed inputs ───────────────────
    totals: dict[str, dict] = {}
    for d, key in zip(dates, date_keys):
        r = roll[d]
        # Same rule as the individual cells: no attendance ⇒ no number, or the
        # roll-up would publish a figure derived from a zero headcount.
        if not r["att"]:
            totals[key] = {"baseline_util": None, "net_util": None}
            continue
        hc = r["official_hc"]
        m = compute_metrics(
            manager_id=mgr.id,
            manager_name=mgr.name or "",
            shift=mgr.shift,
            date=key,
            attendance_rows=r["att"],
            prod_plan=r["prod_plan"],
            prod_actual=r["prod_actual"],
            official_hc=hc,
            equip_downtime=((r["downtime_w"] / r["downtime_n"])
                            if r["downtime_n"] else 0.0),
            downtime_by_cat={},
        )
        totals[key] = {
            "baseline_util": m.baseline_util,
            "net_util": m.net_util,
            "prod_actual": m.prod_actual,
            "prod_plan": m.prod_plan,
            "official_hc": m.official_hc,
            "avail_min": m.avail_min,
            "effective_hc": m.effective_hc,
            "equip_downtime": m.equip_downtime,
            "avg_early_arrival": m.avg_early_arrival,
            "verifix_labor": m.verifix_labor,
            "verifix_hc": m.verifix_hc,
            # Σ N — the divisor of the weighted mean above. Published so the
            # unit's deduction can be re-derived from the rows on screen
            # instead of being taken on trust.
            "idle_weight_n": r["downtime_n"],
            "idle_weight_sum": round(r["downtime_w"], 2),
        }
        if m.verifix_hc == 0 or m.effective_hc is None or m.effective_hc <= 0:
            totals[key] = {"baseline_util": None, "net_util": None}

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
        "fleet": fleet,
        "diagnostics": {
            "lock_warning": lock_warning,
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
            # Cat H / Cat I minutes /idle-cell shows that загрузка never counts.
            "ojidaniya_overlap_min": round(idle_overlap_min, 1),
            "ojidaniya_excluded_min": round(idle_excluded_min, 1),
            # Cells dropped because partial attendance drove effective_hc ≤ 0.
            "collapsed_effective_hc": collapsed_hc,
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
