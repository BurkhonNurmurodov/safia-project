"""«Smena hisoboti» — the status board a shift manager opens Overview on.

One row per brigadir, five columns, and not one of them is a new measurement:

    Brigadir          Manager.name
    O'rt. zagruzka    the «Zagruzka fayli» page's СР. ЗАГРУЖЕННОСТЬ, for TODAY
    Bajarilish %      the same page's «Compl. %», for YESTERDAY
    Hal qilingan %    the «Sifat va shikoyatlar» register's closure rate, whole time
    Ochiq xavotirlar  concerns still open at the brigadir's own level, whole time

It replaced a Google Sheet somebody filled and coloured by hand every morning,
with «XATO» typed wherever a brigadir had entered nothing.

This module FOLDS. It never queries and never imports a router: the router hands
it the production engine's own totals (`routers/production.py`), the quality
register's (brigadir, status) counts and the open-concern counts, so a figure
here can only ever be the figure its own page prints.

A figure that cannot be stated is None with a REASON, never 0 — the platform's
«the blank IS the warning» rule. A 0% load for a unit nobody typed people for
would read as an idle unit; «odam soni kiritilmagan» reads as what it is.
"""
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from app.services import live_overview

# The statuses that describe WORK. «не требуется мера» (not_required) is not a
# failure to fix, so it never enters a closure rate. The twin of ACTIONABLE in
# frontend/src/pages/Quality.jsx — keep the two in step, or this table and the
# Quality page state two different closure rates for one brigadir.
ACTIONABLE = ("done", "open", "waiting", "repeat")
RESOLVED = "done"

# routers/concerns.py VALID_STATUSES = todo | doing | done; open = not done.
OPEN_CONCERN = ("todo", "doing")
# The chain step this column counts — and the step a concern OPENS at, which is
# why routers/concerns.py `_level` reads a blank level as this one.
SUPERVISOR_LEVEL = "supervisor"

# Every reason a cell can be blank for. The client translates the key.
REASONS = ("not_configured", "no_people", "no_plan", "no_fact", "no_records")


def report_days(now: datetime, shift: Optional[int],
                windows: dict) -> tuple[date, date]:
    """(today, yesterday) for one shift, read off the SHIFT FRAME.

    The most recent shift start at or before `now` names «today» —
    `live_overview.shift_frame`, the rule `/live` runs on and the date a night's
    leaders file under. So at 09:00 shift 2's today is the night that has just
    ended (it opened at 20:00 the evening before), and shift 1's today flips at
    its own start rather than at midnight: before its first hour the board still
    shows the last finished day shift. «Yesterday» is the shift-day before.

    `windows` is `cell_hours.defaults(db)`. A unit carrying no shift has no
    frame, so it reads the plant's calendar date.
    """
    window = windows.get(shift) if shift is not None else None
    if window:
        today = date.fromisoformat(live_overview.shift_frame(now, shift, window)["day"])
    else:
        today = now.date()
    return today, today - timedelta(days=1)


def _blank(reason: str, **extra) -> dict:
    return {"value": None, **extra, "reason": reason}


def _ratio(v) -> Optional[float]:
    return None if v is None else round(float(v), 4)


def load_cell(totals: Optional[dict]) -> dict:
    """«O'rt. zagruzka» — `totals.avg_load` = I1 ÷ (ΣN × shift_min).

    `totals` is None for a unit with no production set up at all. The reasons
    follow the order the загрузка heatmap marks a blank day in — the headcount
    before the trudoyomkost: nobody typed people, then no plan minutes to load.
    """
    if totals is None:
        return _blank("not_configured", partial=False)
    people = totals.get("total_people")
    if not people or people <= 0:
        return _blank("no_people", partial=False)
    if not totals.get("total_plan_labor"):
        return _blank("no_plan", partial=False)
    return {
        "value": _ratio(totals.get("avg_load")),
        # ΣN sums the TYPED work centres while the unit's whole trudoyomkost is
        # divided by it, so a partly typed unit reads HIGH. The Production page
        # marks its own KPI «*» for this; the table carries the same mark.
        "partial": (totals.get("people_untyped") or 0) > 0,
        "reason": None,
    }


def compl_cell(totals: Optional[dict]) -> dict:
    """«Bajarilish %» — `totals.completion` = F1 ÷ I1.

    No plan minutes means there was nothing to complete. Plan minutes with no
    actual minutes at all is a ФАКТ nobody has entered — the `/live` reading
    («fakt kiritilmagan»), never «0%, behind».
    """
    if totals is None:
        return _blank("not_configured")
    if not totals.get("total_plan_labor"):
        return _blank("no_plan")
    if not totals.get("total_actual_labor"):
        return _blank("no_fact")
    return {"value": _ratio(totals.get("completion")), "reason": None}


def fold_quality(counts: Iterable[tuple], match: dict) -> dict[int, dict]:
    """{manager_id: {"done": n, "actionable": N}} over the WHOLE register.

    `counts` is (register brigadir spelling, status, rows); `match` is
    `name_map.supervisor_match` over EVERY live unit — the Quality page's own
    attribution («Отв. бригадир» resolved to a platform unit). A spelling that
    names no unit (technologists, IT, stores) is nobody's row here, as there.
    """
    out: dict[int, dict] = {}
    for name, status, n in counts:
        unit = match.get(name)
        if not unit or status not in ACTIONABLE:
            continue
        acc = out.setdefault(unit["id"], {"done": 0, "actionable": 0})
        acc["actionable"] += int(n)
        if status == RESOLVED:
            acc["done"] += int(n)
    return out


def quality_cell(acc: Optional[dict]) -> dict:
    """«Hal qilingan %» — resolved ÷ actionable, with both counts beside it:
    «0%» of one record and «0%» of forty are different facts."""
    if not acc or not acc.get("actionable"):
        return _blank("no_records", done=0, actionable=0)
    return {
        "value": _ratio(acc["done"] / acc["actionable"]),
        "done": acc["done"],
        "actionable": acc["actionable"],
        "reason": None,
    }


def row(unit, load: dict, compl: dict, quality: dict, open_concerns: int) -> dict:
    return {
        "manager_id": unit.id,
        "name": unit.name,
        "factory_id": unit.factory_id,
        "load": load,
        "compl": compl,
        "quality": quality,
        "concerns": {"open": int(open_concerns or 0)},
    }
