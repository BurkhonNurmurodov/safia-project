"""The «Toifalar bo'yicha» matrix — categories down, dates across.

ONE roll-up, read by `GET /api/downtime/matrix` and by the workbook that tab
exports, so the file can never state a figure the screen it was pressed on does
not. It computes nothing of its own: it is handed `_downtime`'s rows and only
arranges them, exactly as `ojidaniya_deck` is handed the page's output.

THE FIGURE, and why it is not the one the rest of the platform reads
--------------------------------------------------------------------
A leaf cell is a brigadir's minutes in one category on one day **divided by the
cells that had people standing in them that day** — an UNWEIGHTED mean over a
cell count (`_downtime(with_avg=True)` → `by_category_avg`, the divisor itself
riding along as `cells_att`).

Every other ojidaniya figure on the platform is the HEADCOUNT-WEIGHTED mean
``Σ(Nᵢ·Tᵢ) ÷ ΣN`` (`idle_source`, and `by_category` on the same row). The two
are different measures of one day and they do not agree: a 20-person cell and a
2-person cell weigh the same here and do not there. So **this tab's totals do
not match the Analysis tab's**, by construction and by the operator's ruling
(2026-09-04) — which is also why that tab carries no KPI cards: two totals of
two different kinds, one above the other, read as a bug.

Three roll-up rules, all of them the operator's:
  * a CATEGORY row is the **sum of the brigadir averages** under it — so it
    scales with how many brigadirs are in scope, and is not itself an average;
  * the TOTAL row is the **sum of the category rows**, i.e. the whole column.
    Per-category minutes overlap (one cell stopped for two causes is counted
    under both, while a day's own total is a UNION), so this can and does
    exceed the day's real waiting. It is the column sum it says it is;
  * `None` is a real answer and never 0 — the (unit, day) had no cell with
    anybody in it, so there is nothing to divide by. A day with cells and no
    waiting is 0.

A MONTH STILL RUNNING KEEPS ITS REMAINING COLUMNS
-------------------------------------------------
The period is a whole calendar month, ends included, so on the 4th of September
the matrix still carries all thirty columns (the operator's call, 2026-09-04).
The days that have not happened are a THIRD fact, and the two glyphs already on
the table cannot express it: rendered blank they would read as «cells ran and
nothing waited», rendered «·» as «no cell had anybody in it». So `future` — one
flag per date, computed HERE and by nothing else — travels beside `dates`, and
both readers (the tab and the workbook) draw those columns as visibly outside
the reported period instead of as an answer.

Today is never future: it is a day in progress and its figures are real as far
as they go. The clock is the plant's own wall clock, because the box's local
zone is not contracted anywhere (`scheduler.py` names Asia/Tashkent explicitly
for the same reason).
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

TZ = timezone(timedelta(hours=5))       # Tashkent, the platform's wall clock


def today_local() -> date:
    return datetime.now(TZ).date()


def _r(v: float) -> float:
    return round(v, 2)


def _after(d_str: str, ref: date) -> bool:
    """Is this «DD.MM.YYYY» column a day that has not happened yet?

    A date the page cannot parse is NOT called future: the honest failure is
    an ordinary column, never a whole month silently blanked.
    """
    try:
        return datetime.strptime(d_str, "%d.%m.%Y").date() > ref
    except (TypeError, ValueError):
        return False


def build(data: dict, stopped: bool = True,
          today: Optional[date] = None) -> dict:
    """Arrange `_downtime(..., with_avg=True)` output into the matrix.

    `stopped` picks the half of the report on screen — the «тўхтаганда»
    averages or the «тўхтамаганда» ones — the same narrowing every other
    reader of this page applies, so the matrix can never total an event the
    bar it sits under did not count.

    `today` is the day the period is read against; it decides nothing but
    `future`, the flag that tells the two readers which columns are days that
    have not happened yet. It is a parameter so a test can pin it, never so a
    caller can answer the question differently.
    """
    key = "by_category_avg" if stopped else "by_category_ns_avg"
    dates: list[str] = list(data.get("dates") or [])
    cat_names: list[str] = list(data.get("cat_names") or [])
    n = len(dates)
    di = {d: i for i, d in enumerate(dates)}
    now = today or today_local()
    future = [_after(d, now) for d in dates]

    # cat → manager_id → per-date value (None = no divisor that day)
    leaf: dict[str, dict[int, list[Optional[float]]]] = {c: {} for c in cat_names}
    meta: dict[int, dict] = {}
    cells: dict[int, list[Optional[int]]] = {}

    for r in data.get("rows") or []:
        i = di.get(r.get("date"))
        if i is None:
            continue
        mid = r.get("manager_id")
        if mid is None:
            continue
        if mid not in meta:
            meta[mid] = {"manager_id": mid, "name": r.get("manager_name") or "",
                         "shift": r.get("shift")}
            cells[mid] = [None] * n
        den = r.get("cells_att")
        cells[mid][i] = int(den) if den else None
        avg = r.get(key)
        for c in cat_names:
            per = leaf[c].setdefault(mid, [None] * n)
            per[i] = None if avg is None else float(avg.get(c) or 0.0)

    out_cats = []
    col_totals: list[Optional[float]] = [None] * n

    for c in cat_names:
        sups = []
        cat_days: list[Optional[float]] = [None] * n
        for mid, per in leaf[c].items():
            total = _r(sum(v for v in per if v is not None))
            sups.append({**meta[mid], "cells": cells[mid],
                         "days": [None if v is None else _r(v) for v in per],
                         "total": total})
            for i, v in enumerate(per):
                if v is None:
                    continue
                cat_days[i] = v if cat_days[i] is None else cat_days[i] + v

        cat_days = [None if v is None else _r(v) for v in cat_days]
        for i, v in enumerate(cat_days):
            if v is None:
                continue
            col_totals[i] = v if col_totals[i] is None else col_totals[i] + v

        # A brigadir with nothing at all in this category is COUNTED, not
        # listed: fifteen all-zero rows under a small category bury the two
        # that carry it, and a hidden row the reader is not told about is the
        # one thing worse than a long list.
        shown = sorted([s for s in sups if s["total"] > 0],
                       key=lambda s: (-s["total"], s["name"]))
        out_cats.append({
            "name": c,
            "days": cat_days,
            "total": _r(sum(v for v in cat_days if v is not None)),
            "sups": shown,
            "hidden": len(sups) - len(shown),
        })

    out_cats.sort(key=lambda c: (-c["total"], c["name"]))
    col_totals = [None if v is None else _r(v) for v in col_totals]

    return {
        "dates": dates,
        # One flag per date: this day has not happened yet. Neither glyph on
        # the table can say that, so both readers draw these columns as
        # outside the reported period rather than as an answer.
        "future": future,
        "cats": out_cats,
        "col_totals": col_totals,
        "grand": _r(sum(v for v in col_totals if v is not None)),
        # How many brigadirs the scope holds — the category rows are SUMS over
        # them, so the reader has to be able to see what they are sums over.
        "supervisors": len(meta),
    }
