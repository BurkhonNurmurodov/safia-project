"""«Kutish xaritasi» — WHO waited and HOW LONG, one bubble per answer
(/downtime → «Tahlil», 2026-10-23, the operator: «x is the number of people who
waited, y is the wait time, the bubble's size is the two multiplied, its colour
the category»).

Every bubble is a pair of facts the platform already publishes, reached through
the modules that own them — nothing here is a new measurement:

* MINUTES are the union of the filed ranges (``idle_intervals``), taken per
  (cell, day, category) — two overlapping entries of one cause are one stop —
  and summed over days. Categories are NOT unioned with each other: a minute
  with two causes is named under both, the rule «Xarajat» and «Toifalar
  bo'yicha» already keep.
* PEOPLE are ``idle_source.cell_headcount`` — the very weight the unit's
  ojidaniya mean divides by — and a Tozalash minute counts its
  «Tozalovchilar», not the whole cell, through ``idle_intervals.people_pieces``.
* The SIZE is the person-minutes those two give (``person_minutes``), so a
  bubble's x × y is its size by construction: x is the minute-weighted mean of
  the people (Σ people·minutes ÷ Σ minutes), never a plain average a reader
  could not multiply back.

**A minute nobody can put a headcount on is not drawn, and is COUNTED.** A cell
whose work centre nobody typed has no x; drawing it at 0 or 1 would invent a
number. Its minutes ride every bubble as ``unplaced`` and the payload totals
them, so the chart says what it is missing.

**Only the cells' days.** Before ``idle_source.CELLS_FROM`` (earlier where the
register moved a unit) a unit's ojidaniya is the «Смена отчёт» row — category
minutes with no cell, no clock and no people. Those days have no bubble and are
counted in ``sheet_days``.

Three grains, one arithmetic: ``cell`` (a cell's waiting for one cause over the
period — the default), ``unit`` (a brigadir's cells folded, per cause), and
``event`` (one filed stop: its own duration × the people it stopped). Read
ONLY by `GET /api/downtime/bubbles`; the endpoint scopes, this module computes.
"""
from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Cell, CellOjidaniyaInterval, Manager, RoleProfile
from app.services import cell_archive, cell_links, idle_intervals, idle_source
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

GRAINS = ("cell", "unit", "event")
# One bubble per filed stop can be thousands over a long period; past this the
# biggest are drawn and the rest are counted (`capped`), never silently cut.
MAX_EVENTS = 1500


def _days(date_from: date, date_to: date) -> list[date]:
    n = (date_to - date_from).days + 1
    return [date_from + timedelta(days=i) for i in range(max(n, 0))]


def _row(e) -> dict:
    """An interval ORM row → the dict `idle_intervals` reads. `stopped` is set
    True because the caller has already picked the half: the union is taken
    over whatever is handed in."""
    return {"start": e.start, "end": e.end, "stopped": True, "cleaners": e.cleaners}


class _Acc:
    """minutes (all), placed minutes (a headcount known), person-minutes."""

    __slots__ = ("minutes", "placed", "pm", "events", "days", "cells", "lo", "hi")

    def __init__(self):
        self.minutes = 0
        self.placed = 0
        self.pm = 0.0
        self.events = 0
        self.days: set = set()
        self.cells: set = set()
        self.lo = None
        self.hi = None

    def add(self, pieces: dict, n_events: int, day: str, cell_id: int) -> None:
        self.events += n_events
        self.days.add(day)
        self.cells.add(cell_id)
        for k, m in pieces.items():
            self.minutes += m
            if k is None or m <= 0:
                continue
            self.placed += m
            self.pm += float(k) * m
            self.lo = k if self.lo is None else min(self.lo, k)
            self.hi = k if self.hi is None else max(self.hi, k)

    def out(self) -> dict:
        placed = self.placed > 0
        return {
            "minutes": self.placed,
            "unplaced": self.minutes - self.placed,
            "person_min": round(self.pm, 1),
            "people": round(self.pm / self.placed, 2) if placed else None,
            "people_lo": self.lo,
            "people_hi": self.hi,
            "events": self.events,
            "days": len(self.days),
            "cells": len(self.cells),
        }


def build(db: Session, manager_ids: Iterable[int], date_from: date, date_to: date,
          stopped: bool, kpi_only: bool, cats: Optional[list[str]],
          grain: str = "cell") -> dict:
    grain = grain if grain in GRAINS else "cell"
    ids = [int(m) for m in manager_ids]
    managers = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(ids)).all()} if ids else {}
    empty = {"grain": grain, "points": [], "sheet_days": 0, "capped": 0,
             "totals": {"minutes": 0, "unplaced": 0, "person_min": 0.0, "points": 0}}
    if not managers:
        return empty

    units = idle_source.cell_units(db)
    days = _days(date_from, date_to)
    ok_days = {mid: {d.isoformat() for d in days if idle_source.uses_cells(units, mid, d)}
               for mid in managers}
    sheet_days = len({d for d in days
                      if any(d.isoformat() not in ok_days[mid] for mid in managers)})
    wanted_days = sorted({d for s in ok_days.values() for d in s})
    if not wanted_days:
        return {**empty, "sheet_days": sheet_days}

    cur = db.query(Cell).filter(Cell.manager_id.in_(list(managers))).all()
    cells = idle_source.cells_with_moved(db, cur, managers, date_from, date_to)
    by_cell = {c.id: c for c in cells}
    if not by_cell:
        return {**empty, "sheet_days": sheet_days}
    # Which unit a cell stood in on a day — the current column unless a cell
    # here changed brigadir inside the period (`cell_links`, 2026-10-12).
    on_day = (cell_links.OnDay(cells)
              if cell_links.changed_since("manager_id", date_from) & set(by_cell) else None)

    def unit_on(cid: int, day: str):
        return by_cell[cid].manager_id if on_day is None else on_day.units(day).get(cid)

    wanted = set(cats) if cats else None
    events = []
    for e in db.query(CellOjidaniyaInterval).filter(
            CellOjidaniyaInterval.cell_id.in_(list(by_cell)),
            CellOjidaniyaInterval.date.in_(wanted_days),
            CellOjidaniyaInterval.status == "approved").all():
        if bool(e.stopped) is not stopped:
            continue
        if kpi_only and e.category in OJIDANIYA_ONLY_CATS:
            continue
        if wanted is not None and e.category not in wanted:
            continue
        if not cell_archive.alive(by_cell[e.cell_id], e.date):
            continue
        mid = unit_on(e.cell_id, e.date)
        if mid not in managers or e.date not in ok_days[mid]:
            continue
        events.append((mid, e))

    hc = idle_source.cell_headcount(db, cells, date_from, date_to)
    lids = {c.leader_id for c in cells if c.leader_id}
    leaders = ({r.id: r.name for r in db.query(RoleProfile.id, RoleProfile.name)
                .filter(RoleProfile.id.in_(lids)).all()} if lids else {})

    points: list[dict] = []
    tot = _Acc()
    capped = 0
    # Answers with no headcount on any of their minutes: not drawn, counted.
    hidden = 0

    if grain == "event":
        for mid, e in events:
            c = by_cell[e.cell_id]
            n = hc.get((e.cell_id, e.date))
            # One stop, on its own: the whole cell unless it names its crew,
            # a crew never above the cell's people (`people_pieces`' cap).
            pieces = idle_intervals.people_pieces([_row(e)], n, stopped_only=False)
            tot.add(pieces, 1, e.date, e.cell_id)
            a = _Acc()
            a.add(pieces, 1, e.date, e.cell_id)
            o = a.out()
            if not o["minutes"]:
                hidden += 1
                continue
            points.append({
                **o,
                "key": f"e{e.id}",
                "id": e.id,
                "manager_id": mid,
                "manager": managers[mid].name,
                "cell_id": c.id,
                "code": c.verifix_code,
                "leader": leaders.get(c.leader_id),
                "category": e.category,
                "date": e.date,
                "start": e.start,
                "end": e.end,
                "cleaners": e.cleaners,
                "note": e.note or "",
            })
        points.sort(key=lambda p: -p["person_min"])
        if len(points) > MAX_EVENTS:
            capped = len(points) - MAX_EVENTS
            points = points[:MAX_EVENTS]
    else:
        # The union is taken per (cell, day, category) — within one date only:
        # clocks are minutes-of-day, so a union across dates would merge two
        # different afternoons (`ojidaniya_cost._union_by_day`).
        per: dict[tuple, list] = defaultdict(list)
        for mid, e in events:
            per[(e.cell_id, mid, e.date, e.category)].append(e)
        acc: dict[tuple, _Acc] = defaultdict(_Acc)
        for (cid, mid, d, cat), rows in per.items():
            pieces = idle_intervals.people_pieces(
                [_row(r) for r in rows], hc.get((cid, d)), stopped_only=False)
            key = (cid, mid, cat) if grain == "cell" else (mid, cat)
            acc[key].add(pieces, len(rows), d, cid)
            tot.add(pieces, len(rows), d, cid)
        for key, a in acc.items():
            o = a.out()
            if not o["minutes"]:
                hidden += 1
                continue
            if grain == "cell":
                cid, mid, cat = key
                c = by_cell[cid]
                o.update({"key": f"c{cid}|{mid}|{cat}", "cell_id": cid,
                          "code": c.verifix_code, "leader": leaders.get(c.leader_id)})
            else:
                mid, cat = key
                o.update({"key": f"u{mid}|{cat}"})
            o.update({"manager_id": mid, "manager": managers[mid].name,
                      "shift": managers[mid].shift, "category": cat})
            points.append(o)
        points.sort(key=lambda p: -p["person_min"])

    t = tot.out()
    return {
        "grain": grain,
        "points": points,
        "sheet_days": sheet_days,
        "capped": capped,
        "totals": {
            "minutes": t["minutes"],
            "unplaced": t["unplaced"],
            "person_min": t["person_min"],
            "points": len(points) + capped,
            # Answers whose every minute lacks a headcount — not drawn.
            "hidden": hidden,
        },
    }
