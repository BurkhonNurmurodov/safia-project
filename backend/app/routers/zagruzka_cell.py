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
    attendance     attendance (verifix, per unit)  cell_attendance (per cell)
    equip_downtime downtime_data (sheet import)    cell_ojidaniya.stopped

The cell↔production join is ``Cell.sap_code`` → ``pp_daily.work_center``; the
cell registry's SAP codes were normalised Cyrillic→Latin precisely so they match
the Production page's work-centre codes (see seed_cells_from_sheet.py).

Decisions taken with the user (2026-07-31), all deliberate:
  * ALL of the locked unit's cells are computed — ``Cell.in_load`` is ignored so
    that ticking cells for the real загрузка can never change this test page.
  * Ojidaniya = To'xtaganda (stopped) minutes only, excluding OJIDANIYA_ONLY_CATS
    (Cat H / Cat I), mirroring the fleet page's rule.
  * A missing input is a plain zero, not a marker: no ojidaniya row for a day
    means downtime 0, exactly like a genuinely clean day.
  * Attendance rows are filtered by the same ``is_direct_role`` rule as the fleet
    page; the titles that got excluded are reported in ``diagnostics`` so a
    spelling drift in the cell export can't silently zero a cell.
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
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Cell, CellAttendance, CellOjidaniya, Manager,
    PPDaily, PPProduct, PPWorkCenter, PPWorkCenterDaily,
)
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services.kpi_calculator import compute_metrics, is_direct_role
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

    # ── Штатка (W) per work centre, with the per-day pin winning ──────────────
    shtatka: dict[str, float] = {}
    for w in db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == mgr.id, PPWorkCenter.active.is_(True)
    ).all():
        shtatka[w.code] = float(w.shtatka or 0)
    work_centers_without_cell = sorted(set(shtatka) - wanted_wcs)

    shtatka_pin: dict[tuple[str, date], float] = {}
    for o in db.query(PPWorkCenterDaily).filter(
        PPWorkCenterDaily.manager_id == mgr.id,
        PPWorkCenterDaily.date >= date_from,
        PPWorkCenterDaily.date <= date_to,
    ).all():
        if o.shtatka is not None:
            shtatka_pin[(o.work_center, o.date)] = float(o.shtatka)

    # ── Attendance per (cell, date) ───────────────────────────────────────────
    att_by_cell: dict[tuple[int, date], list] = defaultdict(list)
    excluded_titles: dict[str, int] = defaultdict(int)
    cell_ids = [c.id for c in cells]
    for r in db.query(CellAttendance).filter(
        CellAttendance.cell_id.in_(cell_ids),
        CellAttendance.date >= date_from,
        CellAttendance.date <= date_to,
    ).all():
        att_by_cell[(r.cell_id, r.date)].append(r)
        # Report rows dropped despite the worker actually being there — a title
        # the fleet rule doesn't recognise would silently shrink verifix_labor.
        if not is_direct_role(r.job_title, r.hours_worked):
            try:
                worked = float(r.hours_worked or 0) > 0
            except (TypeError, ValueError):
                worked = False
            if worked:
                excluded_titles[(r.job_title or "").strip() or "(blank)"] += 1

    # ── Ojidaniya per (cell, date): stopped minutes, minus Cat H / Cat I ───────
    idle_by_cell: dict[tuple[int, str], float] = defaultdict(float)
    idle_cats: dict[tuple[int, str], dict] = defaultdict(dict)
    iso_lo, iso_hi = date_from.isoformat(), date_to.isoformat()
    for e in db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id.in_(cell_ids),
        CellOjidaniya.date >= iso_lo,
        CellOjidaniya.date <= iso_hi,
    ).all():
        if e.category in OJIDANIYA_ONLY_CATS:
            continue
        mins = float(e.stopped or 0)
        if mins <= 0:
            continue
        idle_by_cell[(e.cell_id, e.date)] += mins
        idle_cats[(e.cell_id, e.date)][e.category] = mins

    # ── Compute every (cell, date) through the fleet formula ──────────────────
    data: dict[str, dict[str, dict]] = {}
    inputs: dict[str, dict[str, dict]] = {}
    # Rolled-up unit totals per date, summed BEFORE the formula so the total is a
    # real unit-level загрузка, not an average of per-cell percentages.
    roll: dict[date, dict] = {
        d: {"prod_plan": 0.0, "prod_actual": 0.0, "official_hc": 0.0,
            "downtime_w": 0.0, "att": []} for d in dates
    }
    collapsed_hc = 0   # cells blanked for a non-positive effective headcount

    # Days the per-cell verifix export actually covers, for this unit's cells.
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
            hc = shtatka_pin.get((wc, d), shtatka.get(wc, 0.0)) if wc else 0.0

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
                "shtatka": hc,
                "shtatka_pinned": (wc, d) in shtatka_pin,
                "verifix_labor": m.verifix_labor,
                "verifix_hc": m.verifix_hc,
                "att_rows": len(att_rows),
                "downtime": round(downtime, 2),
                "downtime_by_cat": idle_cats.get((c.id, d.isoformat()), {}),
                "avg_early_arrival": m.avg_early_arrival,
                "adjusted_util": m.adjusted_util,
                "after_idle_util": m.after_idle_util,
                "after_early_util": m.after_early_util,
            }

            r = roll[d]
            r["prod_plan"] += p_plan
            r["prod_actual"] += p_actual
            r["official_hc"] += hc
            # Downtime is a per-person minute deduction, so rolling it up means
            # weighting each cell's minutes by that cell's штатка.
            r["downtime_w"] += downtime * hc
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
            equip_downtime=(r["downtime_w"] / hc) if hc else 0.0,
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
            # The days the per-cell verifix export covers. Everything outside
            # this list is blank BY DESIGN, not because the cells were idle.
            "days_with_attendance": [d.strftime("%d.%m.%Y") for d in days_with_attendance],
            "days_in_range": len(dates),
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
