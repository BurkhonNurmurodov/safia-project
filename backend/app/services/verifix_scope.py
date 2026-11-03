"""«Qamrov» in Verifix's own numbers — the /reports scope rows (2026-11-03).

The operator, on the report's «Qamrov» (Scope) table: «we need the
official-Verifix number of active cells, and official-Verifix number of shift
managers, supervisors and leaders». Four rows beside the platform's own unit
count, per month, as VERIFIX holds them — not what the cells register or the
profiles here say.

Read off the STORED org (`verifix_org.stored`: every division, job and
employee of every status, re-read by the sync job every 10 minutes) and the
stored HR journals — never Verifix itself, so a report never waits on it.

* **A cell** is `verifix_org.cell_nodes`' (a coded or name-coded subdivision
  nobody holds as their department — the rule the live sync follows).
  **Active on day d**: opened by d (or no opening date) and not closed by it.
  A passive one with no closing date is counted on no day — Verifix says it is
  closed and not since when.
* **A shift-manager / brigadir / leader** is an employee working on d (hired
  by d, not dismissed by it — `turnover.employed_on`, the KPI's own test) whose
  job on d names that role (`verifix_org.role_of`: leader first, then
  brigadir, then shift-manager; assistants, deputies and «и.о.» never). The
  job on a past day is the HR journals' (`category_compliance.standing` — the
  last hiring or transfer dated by then); today's is Verifix's own.
* **The day** is the month's last day, or today for the month still running —
  a count of what stands, not a total, so a running month compares fairly.
* **A plant** narrows by `verifix_org.plant_of` (the division tree's names);
  a person by their CURRENT org unit, so a past month's plant split is as
  Verifix places people now.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.services import category_compliance, turnover, verifix_org

ROLES = {"shift_manager": "shiftManagers", "brigadir": "brigadirs", "leader": "leaders"}
KEYS = ("cells", *ROLES.values())


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


def counts(db: Session, months: list[dict], today: date,
           factory: Optional[int] = None) -> Optional[dict]:
    """{ym: {cells, shiftManagers, brigadirs, leaders}} — or None when no
    usable org read is stored (the rows then print «—»)."""
    org, _at = verifix_org.stored(db)
    if verifix_org.guard(org) is not None:
        return None
    divs, emps, jobs = org.get("divs") or {}, org.get("emps") or {}, org.get("jobs") or {}
    nodes = verifix_org.cell_nodes(divs, emps, jobs)["nodes"].values()
    plants = verifix_org.plants(db) if factory is not None else []
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

    days = {m["ym"]: min(m["to"], today) for m in months}
    past = any(d < today for d in days.values())
    events = category_compliance.events_by_person(db) if past else {}

    out = {ym: dict.fromkeys(KEYS, 0) for ym in days}
    for n in nodes:
        div = divs.get(n["id"]) or {}
        if not in_plant(n["id"]):
            continue
        for ym, d in days.items():
            if _cell_active(div, d):
                out[ym]["cells"] += 1

    for e in emps.values():
        hired, dismissed = _d(e.get("hired")), _d(e.get("dismissed"))
        job_now = verifix_org.job_name(org, e.get("job"))
        on_days = [(ym, d) for ym, d in days.items()
                   if turnover.employed_on(hired, dismissed, e.get("status") or "W", d)]
        if not on_days or not in_plant(e.get("unit")):
            continue
        for ym, d in on_days:
            job = job_now
            if d < today:
                job = category_compliance.standing(
                    {"code": None, "job": job_now}, events.get(e["id"]) or [], d, today)["job"]
            r = role(job)
            if r:
                out[ym][ROLES[r]] += 1
    return out
