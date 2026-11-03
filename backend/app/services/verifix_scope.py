"""«Qamrov» in Verifix's own numbers — the /reports scope rows (2026-11-03).

The operator, on the report's «Qamrov» (Scope) table: «we need the
official-Verifix number of active cells, and official-Verifix number of shift
managers, supervisors and leaders» — then, the same day: only the cells of the
supervisors the загрузка counts, «we dont [want] supervisors of cleaning or
logistics and so on», and the supervisors and leaders narrowed the same way.

Read off the STORED org (`verifix_org.stored`: every division, job and
employee of every status, re-read by the sync job every 10 minutes) and the
stored HR journals — never Verifix itself, so a report never waits on it.

* **The day** is the month's last day, or today for the month still running —
  a count of what stands, not a total, so a running month compares fairly.
* **A cell** is `verifix_org.cell_nodes`' (a coded or name-coded subdivision
  nobody holds as their department). It counts when Verifix has it **active on
  the day** — opened by it (or no opening date) and not closed by it; a passive
  one with no closing date counts on no day — AND its cell here (tied by the
  Verifix division id, else by code) stood that day under one of the report's
  units: the non-archived units the загрузка counts, in the viewer's plant /
  shift / brigadir scope (`brigadir_board.board_units`). A cell this platform
  does not hold, or holds under no such unit, is not counted.
* **A person** counts when working on the day (hired by it, not dismissed by
  it — `turnover.employed_on`) with a job naming the role on that day
  (`verifix_org.role_of`; the job on a past day is the HR journals' —
  `category_compliance.standing`; assistants, deputies, «и.о.» never):
  - **leaders** seated in a counted cell (their Verifix org unit is it);
  - **brigadirs** standing over a counted cell — the nearest division from the
    cell upward holding any (`verifix_org.nearest_over`), each person once;
  - **shift-managers** across the viewer's plant (`verifix_org.plant_of`, the
    division tree's names), since Verifix ties them to no cell — a shift or
    brigadir pick leaves that row «—».
  A person's place is their CURRENT org unit (Verifix keeps only today's).
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.services import category_compliance, cell_links, turnover, verifix_org

KEYS = ("cells", "shiftManagers", "brigadirs", "leaders")


def _d(raw) -> Optional[date]:
    try:
        return date.fromisoformat(str(raw)[:10]) if raw else None
    except ValueError:
        return None


def _cell_active(div: dict, d: date) -> bool:
    opened, closed = _d(div.get("opened")), _d(div.get("closed"))
    if opened and opened > d:
        return False
    if closed:
        return closed > d
    return (div.get("state") or "A") == "A"


def _our_cells(db: Session, nodes: Iterable[dict]) -> dict:
    """Verifix node id → (cell id, its current brigadir) for every node this
    platform holds — by the sync's division tie first, else by code."""
    from app.models import Cell
    rows = db.query(Cell.id, Cell.verifix_code, Cell.manager_id, Cell.vfx_division_id).all()
    by_div = {r.vfx_division_id: (r.id, r.manager_id) for r in rows if r.vfx_division_id}
    by_key: dict = {}
    for r in rows:
        k = verifix_org.code_key(r.verifix_code)
        if k:
            by_key.setdefault(k, (r.id, r.manager_id))
    out = {}
    for n in nodes:
        hit = by_div.get(n["id"]) or by_key.get(n["key"])
        if hit:
            out[n["id"]] = hit
    return out


def counts(db: Session, months: list[dict], today: date, unit_ids: Iterable[int],
           factory: Optional[int] = None, shift_managers: bool = True) -> Optional[dict]:
    """{ym: {cells, shiftManagers, brigadirs, leaders}} — or None when no
    usable org read is stored (the rows then print «—»). `shiftManagers` is
    None when `shift_managers` is off (a shift or brigadir pick)."""
    org, _at = verifix_org.stored(db)
    if verifix_org.guard(org) is not None:
        return None
    divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
    nodes = list(verifix_org.cell_nodes(divs, emps, jobs)["nodes"].values())
    ours = _our_cells(db, nodes)
    units = set(unit_ids)
    days = {m["ym"]: min(m["to"], today) for m in months}
    events = category_compliance.events_by_person(db) if any(d < today for d in days.values()) else {}

    plants = verifix_org.plants(db) if (shift_managers and factory is not None) else []
    plant_memo: dict = {}

    def in_plant(div_id: Optional[str]) -> bool:
        if factory is None:
            return True
        if div_id not in plant_memo:
            plant_memo[div_id] = verifix_org.plant_of(divs, div_id, plants)
        return plant_memo[div_id] == factory

    role_memo: dict = {}

    def role(job: Optional[str]) -> Optional[str]:
        if job not in role_memo:
            role_memo[job] = verifix_org.role_of(job)
        return role_memo[job]

    # Each day's role holders, placed by their current org unit.
    held: dict = {ym: defaultdict(lambda: defaultdict(list)) for ym in days}   # ym → role → unit → [eid]
    for e in emps.values():
        hired, dismissed = _d(e.get("hired")), _d(e.get("dismissed"))
        job_now = verifix_org.job_name(org, e.get("job"))
        for ym, d in days.items():
            if not turnover.employed_on(hired, dismissed, e.get("status") or "W", d):
                continue
            job = job_now
            if d < today:
                job = category_compliance.standing(
                    {"code": None, "job": job_now}, events.get(e["id"]) or [], d, today)["job"]
            r = role(job)
            if r:
                held[ym][r][e.get("unit") or ""].append(e["id"])

    out = {}
    for ym, d in days.items():
        mgr_on = cell_links.map_on(list(ours.values()), "manager_id", d)
        counted = [n["id"] for n in nodes
                   if n["id"] in ours and mgr_on.get(ours[n["id"]][0]) in units
                   and _cell_active(divs.get(n["id"]) or {}, d)]
        leaders = held[ym]["leader"]
        brigadirs = held[ym]["brigadir"]
        over: set = set()
        for nid in counted:
            over.update(verifix_org.nearest_over(divs, nid, brigadirs))
        sm = None
        if shift_managers:
            sm = sum(len(ids) for uid, ids in held[ym]["shift_manager"].items() if in_plant(uid))
        out[ym] = {"cells": len(counted), "shiftManagers": sm, "brigadirs": len(over),
                   "leaders": sum(len(leaders.get(nid) or ()) for nid in counted)}
    return out
