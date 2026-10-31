"""Idle time as a share of WORKED time — the «Hisobotlar» executive figure.

    Kutish % = Σ(Nᵢ·Tᵢ) ÷ Σ(Отработано − erta kelish) × 100

The operator's rulings (2026-10-31, asked one by one):

* **The numerator is the person-minutes /downtime and «Xarajat» already
  read.** Per (cell, day): T = the union of the cell's STOPPED, approved ranges
  (`idle_intervals.people_pieces`, THE arithmetic), N = the cell's typed
  «Bugungi fakt» share — `idle_source.cell_headcount`, the very weight the
  unit's ojidaniya mean divides by and «Xarajat» prices at. Not divided by ΣN:
  the sum of person-minutes is the figure.
* **Tozalash (Cat H) is left out of the numerator.** The cleaners' hours stay
  in the denominator, i.e. cleaning counts as working time, not idle time.
* **The denominator is the WORKED time of the same cells**: Σ `effective_hours`
  (Verifix «Отработано» minus early arrival — the file's own arithmetic,
  `verifix_attendance._row` / `live_projection`) of the attendance rows the
  загрузка counts (`idle_source._counted_hc`: a direct role who came, with a
  name), matched to the cell by its Verifix code, as `_n_by_cell` matches them.
* **A cell-day counts only with BOTH halves** — a typed headcount AND Verifix
  worked minutes. A cell nobody typed has no N; a day whose attendance is not
  saved yet (a live day before its close) has no worked time. Either half alone
  would move the percentage for a reason that is not idle time.
* **From `zagruzka_source.ZAGRUZKA_FROM` only** — before it there is no typed
  N, and the metric is defined on the typed N.

Nothing here is a new measurement: the stops, the union, N and the worked hours
are each read through the module that owns them. `fold` is the arithmetic and
touches no database, so it can be checked on its own.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Callable, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Attendance, Cell, CellOjidaniyaInterval
from app.services import cell_archive, cell_links, idle_intervals, idle_source, zagruzka_source

# Tozalash — out of the numerator by the operator's ruling.
EXCLUDED_CATS = frozenset({"Cat H"})


def worked_minutes(hours_worked, early_arrival_min, effective_hours) -> float:
    """One attendance row's worked minutes, early arrival taken off.

    `effective_hours` IS «Отработано» − early arrival wherever the read wrote it
    (and a split row carries its own share of it). A row written without it
    falls back to the same arithmetic on its own two fields."""
    if effective_hours is not None:
        return max(0.0, float(effective_hours) * 60.0)
    if hours_worked is None:
        return 0.0
    return max(0.0, float(hours_worked) * 60.0 - float(early_arrival_min or 0))


def fold(hc: dict, worked: dict, stops: dict,
         unit_on: Callable[[int, str], Optional[int]],
         units: set) -> dict:
    """{(unit, "YYYY-MM-DD"): [idle person-minutes, worked minutes, cells]}.

    `hc` and `worked` are keyed (cell id, day); `stops` holds each cell-day's
    stopped rows in the dict shape `idle_intervals` reads. A cell-day enters
    only with a typed N above 0 AND worked minutes above 0, and only in a unit
    asked for on that day."""
    out: dict = {}
    for (cid, day), w in worked.items():
        n = hc.get((cid, day))
        if not n or w <= 0:
            continue
        u = unit_on(cid, day)
        if u is None or u not in units:
            continue
        rows = stops.get((cid, day))
        pm = (idle_intervals.person_minutes(idle_intervals.people_pieces(rows, n))
              if rows else 0.0)
        acc = out.setdefault((u, day), [0.0, 0.0, 0])
        acc[0] += pm
        acc[1] += w
        acc[2] += 1
    return out


def _days(lo: date, hi: date) -> list[str]:
    out, d = [], lo
    while d <= hi:
        out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def build(db: Session, manager_ids: Iterable[int], date_from: date, date_to: date,
          cats: Optional[Iterable[str]] = None) -> dict:
    """`fold`'s answer for these units over this range.

    `cats` is the viewer's category scope (`idle_scope.resolve_cats`): None =
    every category, a list = only those — the «Kutish mas'uli» lock, applied as
    the rest of the report's idle section applies it. Tozalash is out either
    way."""
    units = {int(u) for u in manager_ids if u is not None}
    lo = max(date_from, zagruzka_source.ZAGRUZKA_FROM)
    if not units or lo > date_to:
        return {}
    cur = db.query(Cell).filter(Cell.manager_id.in_(sorted(units))).all()
    cells = idle_source.cells_with_moved(db, cur, units, lo, date_to)
    if not cells:
        return {}
    by_id = {c.id: c for c in cells}

    # Which unit a cell stood in on a day: the current column unless one of
    # these cells changed brigadir in the range (`cell_links`) — the rule
    # «Xarajat» keys its rows by.
    on_day = (cell_links.OnDay(cells)
              if cell_links.changed_since("manager_id", lo) & set(by_id) else None)

    def unit_on(cid: int, day: str) -> Optional[int]:
        if on_day is None:
            u = by_id[cid].manager_id
        else:
            u = on_day.units(day).get(cid)
        return int(u) if u is not None else None

    hc = idle_source.cell_headcount(db, cells, lo, date_to)

    # Worked minutes per (cell, day) — the загрузка's own attendance set.
    code_to_cell = {c.verifix_code: c.id for c in cells if c.verifix_code}
    worked: dict = defaultdict(float)
    if code_to_cell:
        for r in db.query(
            Attendance.verifix_code, Attendance.date, Attendance.job_title,
            Attendance.hours_worked, Attendance.early_arrival_min,
            Attendance.effective_hours, Attendance.is_supervisor,
            Attendance.worker_name,
        ).filter(
            Attendance.verifix_code.in_(list(code_to_cell)),
            Attendance.date >= lo,
            Attendance.date <= date_to,
            Attendance.is_supervisor.is_(False),
        ).all():
            cid = code_to_cell.get(r.verifix_code)
            if cid is None or not idle_source._counted_hc(r):
                continue
            if not cell_archive.alive(by_id[cid], r.date):
                continue
            worked[(cid, r.date.isoformat())] += worked_minutes(
                r.hours_worked, r.early_arrival_min, r.effective_hours)

    # The stopped, approved ranges per (cell, day), Tozalash left out.
    keep = None if cats is None else set(cats)
    stops: dict = defaultdict(list)
    for e in db.query(
        CellOjidaniyaInterval.cell_id, CellOjidaniyaInterval.date,
        CellOjidaniyaInterval.category, CellOjidaniyaInterval.start,
        CellOjidaniyaInterval.end,
    ).filter(
        CellOjidaniyaInterval.cell_id.in_(list(by_id)),
        CellOjidaniyaInterval.date.in_(_days(lo, date_to)),
        CellOjidaniyaInterval.status == "approved",
        CellOjidaniyaInterval.stopped.is_(True),
    ).all():
        if e.category in EXCLUDED_CATS or (keep is not None and e.category not in keep):
            continue
        if not cell_archive.alive(by_id[e.cell_id], e.date):
            continue
        stops[(e.cell_id, e.date)].append(
            {"start": e.start, "end": e.end, "stopped": True, "cleaners": None})

    return fold(hc, worked, stops, unit_on, units)
