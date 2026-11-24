"""Carry one unit's typed ПЛАН and «Bugungi fakt» headcount from one day into
the next — only into what the next day leaves EMPTY.

2026-11-24, the operator: «put the plan and the workers for today getting
information from yesterday to know the number of containers» for four
brigadirs. AXO asks at 06:00 for the 08:00 containers; the hourly figure needs
the plan and each team's headcount (services/hourly_containers.py), and
neither had been typed for the day yet. docs/data-fixes.md «24 Nov».

What moves, and what never does:

- **ПЛАН** — only into a unit-day with NO typed plan at all (no per-line
  `pp_line_daily.plan_override` > 0 and no legacy `pp_daily.plan_override`
  > 0). Then every line the source day planned gets the same ПЛАН, and its
  «Navbat» (`priority`) where the destination row has none. A unit that typed
  even one line for the day keeps its plan exactly as typed — a partial carry
  would add products the brigadir did not plan.
- **«Bugungi fakt» (people)** — per work centre: only where the destination
  day has NO people pin for that centre (whole or any group), and only on a
  centre the destination day plans (`zagruzka_source.planned_wcs` — the
  «Odam soni» form's own rule: a headcount on a planless centre divides
  nothing). Then the source day's pins of that centre are copied as they
  were — whole-centre and per group never both, because the source never had
  both. The day's ШТАТКА pin is never copied.
- ФАКТ, «Kontiner krishka» and the efficiency are never touched.

`carry_day` returns what it did; it does not commit.
"""
from __future__ import annotations

from datetime import date
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models import PPDaily, PPLineDaily, PPWorkCenterDaily
from app.services import wc_group


def _planned(db: Session, mid: int, day: date) -> frozenset:
    from app.services import zagruzka_source
    return zagruzka_source.planned_wcs(db, [mid], day, day).get((mid, day.isoformat())) or frozenset()


def has_plan(db: Session, mid: int, day: date) -> bool:
    """Does the unit-day carry any TYPED ПЛАН?"""
    line = db.query(PPLineDaily.id).filter(
        PPLineDaily.manager_id == mid, PPLineDaily.date == day,
        PPLineDaily.plan_override > 0).first()
    if line:
        return True
    return bool(db.query(PPDaily.id).filter(
        PPDaily.manager_id == mid, PPDaily.date == day, PPDaily.plan_override > 0).first())


def carry_day(db: Session, mid: int, src: date, dst: date,
              planned: Optional[Callable[[Session, int, date], frozenset]] = None,
              people: bool = True, plan: bool = True) -> dict:
    """Copy `src`'s typed plan and headcount into `dst` where `dst` is empty.
    `people=False` copies the ПЛАН (and its «Navbat») alone — the 24 → 25 Nov
    first-shift copy (`startup.plan_copy_nov24`); `plan=False` the headcount
    alone (`startup.people_copy_nov24`).
    → {plan: "copied" | "kept" | "none", lines, groups, people: [(wc, group, n)],
       people_kept: [wc], people_skipped: [wc]}"""
    from app.services import pp_catalog

    planned = planned or _planned
    out = {"plan": "none", "lines": 0, "groups": 0, "people": [], "people_kept": [], "people_skipped": []}
    # the shared lock every quantity write takes (`/override`, the pins): a
    # catalog edit of this unit (exclusive) cannot move its lines under the copy
    pp_catalog.lock(db, [mid], ns=pp_catalog.NS_QTY, shared=True)

    # ── ПЛАН ─────────────────────────────────────────────────────────────────
    if not plan:
        pass
    elif has_plan(db, mid, dst):
        out["plan"] = "kept"
    else:
        src_lines = db.query(PPLineDaily).filter(
            PPLineDaily.manager_id == mid, PPLineDaily.date == src,
            PPLineDaily.plan_override > 0).all()
        have = {(r.qty_key, r.work_center, r.line_key): r for r in db.query(PPLineDaily).filter(
            PPLineDaily.manager_id == mid, PPLineDaily.date == dst).all()}
        for s in src_lines:
            row = have.get((s.qty_key, s.work_center, s.line_key))
            if row is None:
                db.add(PPLineDaily(manager_id=mid, date=dst, qty_key=s.qty_key, work_center=s.work_center,
                                   line_key=s.line_key, plan_override=s.plan_override, priority=s.priority))
            else:
                row.plan_override = s.plan_override
                if row.priority is None:
                    row.priority = s.priority
            out["lines"] += 1
        src_groups = db.query(PPDaily).filter(
            PPDaily.manager_id == mid, PPDaily.date == src, PPDaily.plan_override > 0).all()
        have_g = {(r.sap_code, r.work_center): r for r in db.query(PPDaily).filter(
            PPDaily.manager_id == mid, PPDaily.date == dst).all()}
        for s in src_groups:
            row = have_g.get((s.sap_code, s.work_center))
            if row is None:
                db.add(PPDaily(manager_id=mid, date=dst, sap_code=s.sap_code, work_center=s.work_center,
                               plan_qty=0, actual_qty=0, plan_override=s.plan_override))
            else:
                row.plan_override = s.plan_override
            out["groups"] += 1
        if out["lines"] or out["groups"]:
            out["plan"] = "copied"
        db.flush()

    # ── «Bugungi fakt» people ────────────────────────────────────────────────
    if not people:
        return out
    norm = lambda wc: wc_group.wc_key(mid, wc)[1]                      # noqa: E731
    src_pins = db.query(PPWorkCenterDaily).filter(
        PPWorkCenterDaily.manager_id == mid, PPWorkCenterDaily.date == src,
        PPWorkCenterDaily.people.isnot(None)).order_by(PPWorkCenterDaily.work_center,
                                                       PPWorkCenterDaily.wc_group).all()
    if not src_pins:
        return out
    dst_rows = db.query(PPWorkCenterDaily).filter(
        PPWorkCenterDaily.manager_id == mid, PPWorkCenterDaily.date == dst).all()
    typed_dst = {norm(r.work_center) for r in dst_rows if r.people is not None}
    by_slot = {(norm(r.work_center), r.wc_group or ""): r for r in dst_rows}
    plans = planned(db, mid, dst)
    for s in src_pins:
        wc = norm(s.work_center)
        if wc in typed_dst:
            if wc not in out["people_kept"]:
                out["people_kept"].append(wc)
            continue
        if wc not in plans:
            if wc not in out["people_skipped"]:
                out["people_skipped"].append(wc)
            continue
        row = by_slot.get((wc, s.wc_group or ""))
        if row is None:
            db.add(PPWorkCenterDaily(manager_id=mid, date=dst, work_center=s.work_center,
                                     wc_group=s.wc_group, people=s.people))
        else:
            row.people = s.people
        out["people"].append((wc, s.wc_group or "", int(s.people)))
    db.flush()
    return out
