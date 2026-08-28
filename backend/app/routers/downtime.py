from datetime import date, datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.models import Manager, DowntimeData
from app.services.day_state import confirmed_pairs
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services import idle_source
from app.services.name_map import sheet_alias_map
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

router = APIRouter(prefix="/api", tags=["downtime"])


@router.get("/downtime")
def get_downtime(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    # kpi_only=1: strip the Ojidaniya-page-only categories (OJIDANIYA_ONLY_CATS)
    # from totals, breakdowns and flags. Every consumer of this endpoint OTHER
    # than the Ojidaniya page itself (today: the Daily performance block) must
    # pass it, so those categories exist nowhere outside /downtime and the
    # totals shown match the equip_downtime used by the загрузка KPIs.
    kpi_only: bool = Query(default=False),
    # Which plant. Omitted / null = «All factories». Ojidaniya rows key off the
    # supervisor NAME, so the factory narrows the manager set first and the
    # alias map then resolves only those names (services/factory_scope).
    factory: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime", "daily")),
):
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=13)

    scoped = scoped_manager_ids(db, payload, factory, manager_id)
    managers = db.query(Manager).filter(Manager.archived.is_(False))
    if shift:
        managers = managers.filter(Manager.shift == shift)
    if scoped is not None:
        managers = managers.filter(Manager.id.in_(scoped))
    managers = [] if empty_scope(scoped) else managers.all()
    # DowntimeData spells brigadirs in either alphabet; accept every known
    # spelling and resolve each row back to the canonical Manager.name.
    alias = sheet_alias_map(db, (m.name for m in managers))
    manager_names = set(alias.keys())

    cur = date_from
    dates = []
    while cur <= date_to:
        dates.append(cur.strftime("%d.%m.%Y"))
        cur += timedelta(days=1)

    dt_rows = db.query(DowntimeData).filter(
        DowntimeData.manager_name.in_(manager_names),
        DowntimeData.date.in_(dates),
    ).all()

    # Both halves of every category pair travel together: `total`/`by_category`
    # are the «тўхтаганда» numbers (the wait stopped the cell) and the `_ns`
    # fields the «тўхтамаганда» ones. The page tabs between them client-side, so
    # one fetch serves both and switching tabs costs no round-trip.
    dt_total: dict[str, dict[str, float]] = {}
    dt_by_cat: dict[str, dict[str, dict]] = {}
    dt_total_ns: dict[str, dict[str, float]] = {}
    dt_by_cat_ns: dict[str, dict[str, dict]] = {}
    cat_names_set: set[str] = set()
    for r in dt_rows:
        canon = alias.get(r.manager_name, r.manager_name)
        dt_total.setdefault(canon, {})[r.date] = float(r.total_minutes or 0)
        dt_by_cat.setdefault(canon, {})[r.date] = r.by_category or {}
        dt_total_ns.setdefault(canon, {})[r.date] = float(r.total_minutes_ns or 0)
        dt_by_cat_ns.setdefault(canon, {})[r.date] = r.by_category_ns or {}
        cat_names_set.update((r.by_category or {}).keys())
        cat_names_set.update((r.by_category_ns or {}).keys())

    # Every unit answers with its CELLS from `idle_source.CELLS_FROM` on —
    # earlier where the register switched one by hand — the headcount-weighted
    # mean of its cells' interval unions, and the sheet row for such a day is
    # dropped first: present or not, the sheet is no longer a source. The day-close gate
    # below is left exactly as it is: a switched day with nothing filed yet is
    # simply "not reported", so a confirmed one reads as a real zero and an open
    # one stays hidden, the same two answers the sheet model gives. A day with
    # at least one approved range on some cell is the unit's report for it.
    #
    # `kpi_only` is honoured HERE for the derived figures (the
    # Ojidaniya-only categories dropped before the union for `total`, stripped
    # from the breakdowns), so the subtract-after step in the loop below finds
    # nothing left to subtract.
    units = idle_source.cell_units(db)
    switched, lo = idle_source.switched_in_range(
        units, (m.id for m in managers), date_from, date_to)
    derived_days: list[tuple[str, str]] = []      # (manager name, d_str) overridden
    if switched:
        derived = idle_source.unit_downtime(db, switched, lo, date_to)
        by_id = {m.id: m for m in managers}
        for mid in switched:
            name = by_id[mid].name
            for d_str in dates:
                d_obj = datetime.strptime(d_str, "%d.%m.%Y").date()
                if not idle_source.uses_cells(units, mid, d_obj):
                    continue
                for bucket in (dt_total, dt_by_cat, dt_total_ns, dt_by_cat_ns):
                    bucket.get(name, {}).pop(d_str, None)
                row = derived.get((mid, d_obj.isoformat()))
                if not row or not row["cells_with_idle"]:
                    continue
                cats = dict(row["by_category"])
                cats_ns = dict(row["by_category_ns"])
                total = float(row["total"] if kpi_only else row["total_all"])
                total_ns = float(row["total_ns"])
                if kpi_only:
                    cats = {k: v for k, v in cats.items() if k not in OJIDANIYA_ONLY_CATS}
                    cats_ns = {k: v for k, v in cats_ns.items() if k not in OJIDANIYA_ONLY_CATS}
                    # A weighted plain sum is linear, so the not-stopped total
                    # without the Ojidaniya-only categories is exactly the sum
                    # of the remaining ones.
                    total_ns = float(sum(cats_ns.values()))
                dt_total.setdefault(name, {})[d_str] = total
                dt_by_cat.setdefault(name, {})[d_str] = cats
                dt_total_ns.setdefault(name, {})[d_str] = total_ns
                dt_by_cat_ns.setdefault(name, {})[d_str] = cats_ns
                cat_names_set.update(cats.keys())
                cat_names_set.update(cats_ns.keys())
                derived_days.append((name, d_str))

    cat_names = sorted(cat_names_set)
    if kpi_only:
        cat_names = [c for c in cat_names if c not in OJIDANIYA_ONLY_CATS]
    # A derived breakdown names only the categories that were filed; pad it to
    # the page's column set so every row carries every column, as sheet rows do.
    for name, d_str in derived_days:
        for c in cat_names:
            dt_by_cat[name][d_str].setdefault(c, 0.0)
            dt_by_cat_ns[name][d_str].setdefault(c, 0.0)

    # Day-close state — here it decides only whether an unreported day counts as
    # a reported zero (see the loop below), not whether reported data is shown.
    confirmed = confirmed_pairs(db, date_from, date_to, [m.id for m in managers])

    rows = []
    for mgr in sorted(managers, key=lambda m: m.name or ""):
        for d_str in dates:
            d_obj = datetime.strptime(d_str, "%d.%m.%Y").date()
            # The shift report is a source of its own: the brigadir submits it
            # once at end of shift and it carries no attendance, so a submitted
            # report shows as soon as it syncs — open day or not. The day-close
            # gate still governs the silent case: only on a confirmed day does
            # "no report" mean a real zero rather than "not reported yet".
            reported = d_str in dt_total.get(mgr.name, {})
            if not reported and (mgr.id, d_obj) not in confirmed:
                continue
            total = dt_total.get(mgr.name, {}).get(d_str, 0.0)
            cats = dt_by_cat.get(mgr.name, {}).get(d_str, {c: 0.0 for c in cat_names})
            total_ns = dt_total_ns.get(mgr.name, {}).get(d_str, 0.0)
            cats_ns = dt_by_cat_ns.get(mgr.name, {}).get(d_str, {c: 0.0 for c in cat_names})
            if kpi_only:
                total = max(total - sum(float(cats.get(c) or 0) for c in OJIDANIYA_ONLY_CATS), 0.0)
                total_ns = max(total_ns - sum(float(cats_ns.get(c) or 0) for c in OJIDANIYA_ONLY_CATS), 0.0)
                cats = {k: v for k, v in cats.items() if k not in OJIDANIYA_ONLY_CATS}
                cats_ns = {k: v for k, v in cats_ns.items() if k not in OJIDANIYA_ONLY_CATS}
            rows.append({
                "manager_name": mgr.name,
                "shift": mgr.shift,
                "date": d_str,
                "total": total,
                "flagged": total > 50,
                "by_category": cats,
                "total_ns": total_ns,
                "flagged_ns": total_ns > 50,
                "by_category_ns": cats_ns,
            })

    summary: dict[str, dict] = {}
    for r in rows:
        n = r["manager_name"]
        if n not in summary:
            summary[n] = {
                "manager_name": n, "shift": r["shift"],
                "total": 0.0, "flagged_days": 0,
                "total_ns": 0.0, "flagged_days_ns": 0,
            }
        summary[n]["total"] += r["total"]
        summary[n]["total_ns"] += r["total_ns"]
        if r["flagged"]:
            summary[n]["flagged_days"] += 1
        if r["flagged_ns"]:
            summary[n]["flagged_days_ns"] += 1

    return {
        "dates": dates,
        "cat_names": cat_names,
        "rows": rows,
        "summary": sorted(summary.values(), key=lambda x: x["total"], reverse=True),
    }


@router.get("/downtime/seasonality")
def get_downtime_seasonality(
    year: Optional[int] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    # Same meaning as on /downtime: drop the Ojidaniya-only categories so the
    # grid shows only the waiting that the загрузка KPIs count.
    kpi_only: bool = Query(default=False),
    factory: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("downtime", "daily")),
):
    """Category × calendar-month waiting minutes for one year (the Ojidaniya
    seasonality grid). Its own time axis — deliberately independent of the page
    date range, which still narrows nothing here beyond shift/supervisor — so a
    whole year is one small aggregate instead of ~11k daily rows on the wire.

    `col_totals` is the SUM OF THE CATEGORIES of that month, not the reported
    `total_minutes`: it is the denominator the grid's percentages divide by, so
    a column always adds up to 100%.
    """
    scoped = scoped_manager_ids(db, payload, factory, manager_id)
    managers = db.query(Manager).filter(Manager.archived.is_(False))
    if shift:
        managers = managers.filter(Manager.shift == shift)
    if scoped is not None:
        managers = managers.filter(Manager.id.in_(scoped))
    managers = [] if empty_scope(scoped) else managers.all()
    alias = sheet_alias_map(db, (m.name for m in managers))
    manager_names = set(alias.keys())

    if not manager_names:
        return {"years": [], "year": year, "cat_names": [],
                "col_totals": [0.0] * 12, "col_totals_ns": [0.0] * 12,
                "by_category": {}, "by_category_ns": {}}

    # Units read their CELLS from `idle_source.CELLS_FROM` on (earlier where
    # the register switched one by hand): their sheet rows on and after that
    # day are dropped and the derived per-day breakdown is added in their
    # place. The year list also carries the year each unit's switch starts in,
    # or a unit switched before its first sheet row would have no year to pick.
    units = idle_source.cell_units(db)
    mgr_ids = [m.id for m in managers]
    name_to_id = {m.name: m.id for m in managers}
    switch_years = {idle_source.start_day(units, mid).year for mid in mgr_ids}

    # Years that actually hold shift reports for the scoped supervisors, newest
    # first — the card's year selector.
    years = sorted({
        int(d[-4:]) for (d,) in db.query(DowntimeData.date)
        .filter(DowntimeData.manager_name.in_(manager_names)).distinct().all()
        if d and len(d) >= 4 and d[-4:].isdigit()
    } | switch_years, reverse=True)
    if year is None:
        today_year = date.today().year
        year = today_year if today_year in years else (years[0] if years else today_year)

    dt_rows = db.query(DowntimeData).filter(
        DowntimeData.manager_name.in_(manager_names),
        DowntimeData.date.like(f"%.{year}"),
    ).all()

    col_totals = [0.0] * 12
    col_totals_ns = [0.0] * 12
    by_cat: dict[str, list[float]] = {}
    by_cat_ns: dict[str, list[float]] = {}

    def _add(m: int, cats_stopped: dict, cats_ns: dict) -> None:
        for cats, cols, dest in (
            (cats_stopped or {}, col_totals, by_cat),
            (cats_ns or {}, col_totals_ns, by_cat_ns),
        ):
            for cat, val in cats.items():
                if kpi_only and cat in OJIDANIYA_ONLY_CATS:
                    continue
                v = float(val or 0)
                dest.setdefault(cat, [0.0] * 12)[m] += v
                cols[m] += v

    for r in dt_rows:
        try:
            d_obj = datetime.strptime(r.date or "", "%d.%m.%Y").date()
        except ValueError:
            continue
        canon = alias.get(r.manager_name, r.manager_name)
        mid = name_to_id.get(canon)
        if mid is not None and idle_source.uses_cells(units, mid, d_obj):
            continue                      # the cells answer this day, not the sheet
        _add(d_obj.month - 1, r.by_category, r.by_category_ns)

    y_lo, y_hi = date(year, 1, 1), date(year, 12, 31)
    switched, lo = idle_source.switched_in_range(units, mgr_ids, y_lo, y_hi)
    if switched:
        derived = idle_source.unit_downtime(db, switched, lo, y_hi)
        for (mid, iso), row in derived.items():
            d_obj = date.fromisoformat(iso)
            if not idle_source.uses_cells(units, mid, d_obj):
                continue
            _add(d_obj.month - 1, row["by_category"], row["by_category_ns"])

    return {
        "years": years,
        "year": year,
        "cat_names": sorted(set(by_cat) | set(by_cat_ns)),
        "col_totals": [round(v, 2) for v in col_totals],
        "col_totals_ns": [round(v, 2) for v in col_totals_ns],
        "by_category": {k: [round(v, 2) for v in vals] for k, vals in by_cat.items()},
        "by_category_ns": {k: [round(v, 2) for v in vals] for k, vals in by_cat_ns.items()},
    }
