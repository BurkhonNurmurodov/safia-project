"""«Smena hisoboti» — the status board a shift manager opens Overview on.

One row per brigadir, six columns, and not one of them is a new measurement:

    Brigadir          Manager.name
    O'rt. zagruzka    the «Zagruzka fayli» page's СР. ЗАГРУЖЕННОСТЬ, for TODAY
    Davomat           /workers' «Davomat issiqlik xaritasi» figure, for TODAY so
                      far — off the stored live Verifix read
    Bajarilish %      the same page's «Compl. %», for YESTERDAY
    Hal qilingan %    the «Sifat va shikoyatlar» register's closure rate, ALL
                      TIME (`quality_window`) — the column prints the OVERALL rate, every
                      record, hair too (`quality_hair`); the rate with hair
                      records left out (`quality`) rides beside it for the
                      cell's hover box
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
import re
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from app.services import live_overview

# The statuses that describe WORK. «не требуется мера» (not_required) is not a
# failure to fix, so it never enters a closure rate. The twin of ACTIONABLE in
# frontend/src/pages/Quality.jsx — keep the two in step, or this table and the
# Quality page state two different closure rates for one brigadir.
ACTIONABLE = ("done", "open", "waiting", "repeat")
RESOLVED = "done"

# The foreign-object category this column does NOT count (the operator's call,
# 2026-09-18). A «соч / волос» record is the register's commonest kind and the
# Quality page itself opens WITHOUT it — `quality_hair_mode` defaults to
# "without", dropping every hair record from its KPIs, charts and tables — so a
# board counting them stated a closure rate the page beside it never shows. The
# router applies it (this module never queries); a row with NO category is kept,
# because «uncategorised» is not «hair».
#
# From 2026-11-13 the board's figure is the OVERALL rate (the operator: «take
# the overall quality control by user, with hair and without»): `quality_hair`
# is the rate over every record, hair included — the Quality page's «Soch
# bilan» — and is what the cell prints; `quality` is this without-hair one,
# unchanged, printed in the cell's hover box beside it. Only this board gained
# it; «Brigadirlar reytingi», «Hisobotlar» and the KPIs keep the without-hair
# rate.
SKIP_CATEGORY = "hair"

# routers/concerns.py VALID_STATUSES = todo | doing | done; open = not done.
OPEN_CONCERN = ("todo", "doing")
# The chain step this column counts — and the step a concern OPENS at, which is
# why routers/concerns.py `_level` reads a blank level as this one.
SUPERVISOR_LEVEL = "supervisor"

# Every reason a cell can be blank for. The client translates the key.
REASONS = ("not_configured", "no_people", "no_plan", "no_fact", "no_records",
           # «Davomat»: the unit has no workload cell (Verifix reads nobody for
           # it), the minute job has not read its day yet, nobody's own shift
           # has begun, nobody is on the list.
           "no_cells", "no_read", "not_started", "no_list")


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


# The floor of «all time» — the twin of `ALL_TIME_FROM` in
# frontend/src/components/ui/DateRangePicker.jsx, the Quality page's «Barcha
# vaqt». The register holds nothing older, and the cell's link opens that page
# on this very span, so the board and the list behind it count one window.
QUALITY_FROM = "2015-01-01"


def quality_window(day: date) -> tuple[str, str, str]:
    """("", first, after_last) — ALL TIME up to `day`, as the ISO strings the
    quality register is cut by (`first <= date < after_last`).

    From 2026-11-13 (the operator: «we have to go all time with hair, right now
    I see the problems, it's kinda low» → «Count all time») the column counts
    every record the register holds. It was the MONTH IN PROGRESS from
    2026-09-18, because a whole-register rate moves by a fraction of a point
    whatever a unit does this week; thirteen days into a month that left a
    brigadir judged on one or two records, which is what the operator saw. The
    trade is his: the count is the brigadir's whole record, and it moves slowly.

    `day` is the plant's own date, never a picked shift-day: a record's status
    is today's status, so «all time as of last Tuesday» is not a figure the
    register can state.

    The first value was the month («2026-11») and is "" now: a tab still on a
    bundle that captions the column with it prints no month rather than a month
    the figures were not counted over. `QualityComplaint.date` is an ISO
    "YYYY-MM-DD" STRING, so the cut is a plain string range, and a row carrying
    no date falls outside it — as it does on the Quality page's «Barcha vaqt».
    """
    return "", QUALITY_FROM, (day + timedelta(days=1)).isoformat()


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
        # the day's work in minutes (I1) and the people it is split over (ΣN):
        # the tooltip prints them as hours, so the % can be read against a size
        "plan_min": round(float(totals.get("total_plan_labor") or 0), 1),
        "people": people,
        # the time the people have: ΣN × shift_min, recovered from the unit's
        # own avg_load so it is the very shift length the % was divided by
        "cap_min": (round(float(totals["total_plan_labor"]) / float(totals["avg_load"]), 1)
                    if totals.get("avg_load") else None),
        "reason": None,
    }


def start_load(plan_min: Optional[float], people: Optional[float],
               shift_min: float) -> Optional[float]:
    """«Smena boshi Zagruzka» for ONE unit-day off the range readers —
    I1 ÷ (ΣN × shift_min), the arithmetic `pp_calc`'s `avg_load` runs, blank on
    exactly the days `load_cell` blanks: nobody typed people (or typed 0), no
    plan minutes. The KPI cards on the shift dashboard read this, because their
    day stepper and 7-day trend cannot afford the engine per unit per day."""
    if not people or people <= 0 or not plan_min or not shift_min:
        return None
    return round(float(plan_min) / (float(people) * float(shift_min)), 4)


_CLOCK = re.compile(r"(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})")


def fold_clock(rows: Iterable[tuple], shift: Optional[int]) -> Optional[dict]:
    """The day's ACTUAL clock for one unit, off Verifix's stored «Kelgan-ketgan»
    strings (`attendance.clock_in_out`, "08:02-17:10 (9.13)"): the MEDIAN
    arrival and departure of the people who clocked both, and the mean hours
    they worked. Median, so one late leaver does not move the unit's day.
    `rows` is (clock_in_out, hours_worked). A night shift's small hours belong
    after midnight, so they are lifted by 24 h before the median and folded
    back for display. None when nobody has a clock."""
    ins, outs, hrs = [], [], []
    for raw, hours in rows:
        m = _CLOCK.search(raw or "")
        if not m:
            continue
        a = int(m.group(1)) * 60 + int(m.group(2))
        b = int(m.group(3)) * 60 + int(m.group(4))
        if shift == 2 and a < 600:
            a += 1440
        if b <= a:
            b += 1440
        ins.append(a)
        outs.append(b)
        if hours is not None and float(hours) > 0:
            hrs.append(float(hours))
    if not ins:
        return None

    def med(v):
        v = sorted(v)
        n = len(v)
        return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2

    def hhmm(x):
        x = int(round(x)) % 1440
        return f"{x // 60:02d}:{x % 60:02d}"

    return {"start": hhmm(med(ins)), "end": hhmm(med(outs)), "n": len(ins),
            "avg_min": round(sum(hrs) / len(hrs) * 60, 1) if hrs else None}


def compl_cell(totals: Optional[dict], clock: Optional[dict] = None) -> dict:
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
    return {
        "value": _ratio(totals.get("completion")),
        # the minutes behind the % (F1 and I1) — the tooltip prints them as hours
        "actual_min": round(float(totals.get("total_actual_labor") or 0), 1),
        "plan_min": round(float(totals.get("total_plan_labor") or 0), 1),
        # who did it and the shift's length: ΣN, and ΣN × shift_min recovered
        # from avg_load as `load_cell` does — the tooltip prints hours PER PERSON
        "people": totals.get("total_people") or None,
        "cap_min": (round(float(totals["total_plan_labor"]) / float(totals["avg_load"]), 1)
                    if totals.get("avg_load") else None),
        # when they ACTUALLY started and finished, off Verifix (None: no clocks)
        "clock": clock,
        "reason": None,
    }


def fold_quality(counts: Iterable[tuple]) -> dict[int, dict]:
    """{manager_id: {"done": n, "actionable": N}} over the window handed in.

    The window is the router's — this module never queries — so a unit that
    had nothing filed in it, or nothing but `SKIP_CATEGORY` records, is
    simply absent, and reads the blank `no_records` rather than a 0% it did
    not earn.

    `counts` is (unit id, status, …, rows) — `quality_attribution.unit_rows`,
    the Quality page's own attribution (from 2026-11-02 the record's CELL on
    its date, else «Отв. бригадир»). A record no unit answers for
    (technologists, IT, stores) is nobody's row here, as there.
    """
    out: dict[int, dict] = {}
    for unit_id, status, *_rest, n in counts:
        if unit_id is None or status not in ACTIONABLE:
            continue
        acc = out.setdefault(unit_id, {"done": 0, "actionable": 0})
        acc["actionable"] += int(n)
        if status == RESOLVED:
            acc["done"] += int(n)
    return out


def quality_cell(acc: Optional[dict]) -> dict:
    """«Hal qilingan %» — resolved ÷ actionable over the window, with both
    counts beside it: «0%» of one record and «0%» of forty are different facts.

    A unit nothing was ever filed against reads `no_records`, and that blank is
    the honest answer — «nothing filed» is not «nothing resolved»."""
    if not acc or not acc.get("actionable"):
        return _blank("no_records", done=0, actionable=0)
    return {
        "value": _ratio(acc["done"] / acc["actionable"]),
        "done": acc["done"],
        "actionable": acc["actionable"],
        "reason": None,
    }


def att_cell(acc: Optional[dict], has_cells: bool) -> dict:
    """«Davomat» — (came + on leave) ÷ on the list, the unit's shift-day so far.

    `acc` is the unit's `live_staff.attendance` count (who is on the list, who
    came — the router hands it in, this module never queries), None when there
    is no stored read of the day to count from. Every count rides beside the
    rate, because the cell's tooltip spells the fraction out."""
    if not has_cells:
        return _blank("no_cells")
    if acc is None:
        return _blank("no_read")
    at = acc.get("read_at")
    extra = {"not_yet": acc["not_yet"], "unread": acc["unread"],
             "read_at": at.isoformat(timespec="minutes") if at else None}
    roster = acc["roster"]
    if not roster:
        reason = ("not_started" if acc["not_yet"]
                  else "no_read" if acc["unread"] else "no_list")
        return _blank(reason, **extra)
    came, leave = acc["came"], acc["on_leave"]
    return {
        "value": _ratio((came + leave) / roster),
        "roster": roster,
        "came": came,
        "on_leave": leave,
        **extra,
        "reason": None,
    }


def row(unit, load: dict, compl: dict, quality: dict, open_concerns: int,
        att: Optional[dict] = None, quality_hair: Optional[dict] = None,
        quality_open: Optional[dict] = None) -> dict:
    return {
        "manager_id": unit.id,
        "name": unit.name,
        "factory_id": unit.factory_id,
        "load": load,
        "att": att or _blank("no_read"),
        "compl": compl,
        "quality": quality,
        # the same rate WITH the hair records (`SKIP_CATEGORY` says why both)
        "quality_hair": quality_hair or _blank("no_records", done=0, actionable=0),
        # «0/24»: of the records open when the month's count began, how many
        # are solved since (`quality_baseline`). None: no starting list yet.
        "quality_open": quality_open,
        "concerns": {"open": int(open_concerns or 0)},
    }
