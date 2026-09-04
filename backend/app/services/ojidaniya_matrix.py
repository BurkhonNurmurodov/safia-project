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
"""

from typing import Optional


def _r(v: float) -> float:
    return round(v, 2)


def build(data: dict, stopped: bool = True) -> dict:
    """Arrange `_downtime(..., with_avg=True)` output into the matrix.

    `stopped` picks the half of the report on screen — the «тўхтаганда»
    averages or the «тўхтамаганда» ones — the same narrowing every other
    reader of this page applies, so the matrix can never total an event the
    bar it sits under did not count.
    """
    key = "by_category_avg" if stopped else "by_category_ns_avg"
    dates: list[str] = list(data.get("dates") or [])
    cat_names: list[str] = list(data.get("cat_names") or [])
    n = len(dates)
    di = {d: i for i, d in enumerate(dates)}

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
        "cats": out_cats,
        "col_totals": col_totals,
        "grand": _r(sum(v for v in col_totals if v is not None)),
        # How many brigadirs the scope holds — the category rows are SUMS over
        # them, so the reader has to be able to see what they are sums over.
        "supervisors": len(meta),
    }
