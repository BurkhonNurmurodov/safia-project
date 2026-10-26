"""«Hisobotlar» (/reports) — the platform's period report, folded into sections.

The operator's ask (2026-10-26), with TopSim's «Report System» as the picture:
one screen that reads a PERIOD the way a management report reads it — a list of
sections down the side, each a table of figures with the period and the ones
before it side by side — and hands the whole thing over as a document somebody
forwards, prints or files.

**Nothing is measured here.** Every figure is one another page already prints,
read through that page's own code and handed to `compose()` — the rule
`services/ojidaniya_deck.py` and `services/brigadir_board.py` already keep, and
the reason this module imports no router and makes no query. `routers/reports.py`
does the fetching; this one only folds. Where a figure comes from, section by
section:

* **Ishlab chiqarish** — `plan_fulfillment.build`'s own minute totals (Σ fact ÷
  Σ plan over the unit-days that had BOTH halves), i.e. the /plan page's
  figure; «Samaradorlik» is the /zagruzka heatmap's AVG through
  `brigadir_board.efficiency`, and «Plan bajarish %» per unit its
  `fulfillment` — the twins of `utils/formulas.js`, never a second spelling.
* **Xodimlar** — /workers' own `att_rate` ((came + on leave) ÷ on the list)
  through `brigadir_board.attendance`, and the month's turnover out of
  `turnover.month_payload` — the «Liderlar KPI» page's own.
* **Kutish** — `routers/downtime._downtime`'s rows, which ARE the /downtime
  page's computation (the headcount-weighted mean of a unit's cells, the
  platform's one ojidaniya reading).
* **Xarajat** — `ojidaniya_cost.build`, the «Xarajat» tab's own tree: the union
  of stopped minutes priced at the wage rate in force on each day.
* **Sifat** — the Quality page's closure rate through `brigadir_board.quality`
  (actionable records, hair left out, «Отв. бригадир» matched against every
  live unit).
* **Xavotirlar** — the /concerns register through `brigadir_board.concerns`:
  of the concerns filed WITH the unit in the period, the share resolved; one
  handed above the brigadir is out of the count.

**A figure the platform has no source for is NOT in this report.** TopSim's
financial half — equity, WACC, NOPAT, EVA, the cash-flow statement, the balance
sheet, contribution margin, inventory, R&D — has no source on this platform,
and a report that invented one would be worse than a report that is silent
about it. `MISSING` names them, the page prints that list under the sections,
and the document carries it too: «not reported» said out loud, never a zero.

The PERIOD is a calendar MONTH — the platform's own KPI month (`leaders_kpi`,
`turnover` and `category_compliance` all count by it) — and every table carries
the picked month plus `HISTORY - 1` months before it, oldest → newest, so a
figure is always read against where it came from. The picked month is the last
column and the one the per-unit tables describe.

Shapes, so the page, the document and a later section all read ONE of them:

* a **periods** block — `rows[]`, each `{key, fmt, values: [per month], ...}`;
* a **units** block — `columns[]` (the first is the unit's name) and `rows[]`,
  each `{key, cells: [...]}`, describing the PICKED month alone.

`fmt` says how a cell is printed and nothing else: int · num1 · pct · min ·
money · text. `None` is «no answer» everywhere and is printed «—», never 0 —
the platform's standing rule, and the one that keeps «nothing filed» apart from
«nothing resolved».
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable, Optional

# How many months a table carries, the picked one last. Three is TopSim's own
# reading (Period 0 · 1 · 2) and the most a phone column can hold.
HISTORY = 3

# The section ids, in the order the page lists them and the document lays them
# out. The words live in the frontend's bundle (pages/reportsText.js) in the
# four platform languages and come back with the export — the rule
# `services/grid_export.py` keeps: the screen describes itself, the server only
# lays it out, so the file can never name something the page does not.
SECTIONS = ("summary", "production", "personnel", "idle", "cost",
            "quality", "concerns", "figures")

# The headline rows that are a TOTAL over the period rather than a rate. A
# month still running holds fewer days than the one before it, so the change
# in a total says nothing a reader can act on — 26 days against 30 — while the
# change in a RATE is a fair comparison. Deltas on these are withheld while the
# picked month is partial, rather than printed as a fall nobody caused.
CUMULATIVE = {
    "production.actualMin", "production.planMin", "production.shortMin",
    "personnel.listed", "personnel.came", "personnel.onLeave", "personnel.left",
    "idle.idleMin", "cost.costSum", "quality.actionable", "quality.resolved",
    "concerns.filed", "concerns.counted", "concerns.resolved",
}

# What a management report of this shape usually also carries and this platform
# cannot: no source exists for any of it. Named rather than left out, so a
# reader asking «where is the P&L» is answered instead of left guessing.
MISSING = ("finance", "inventory", "rnd", "market", "margin")


# ── numbers ─────────────────────────────────────────────────────────────────
def _r(v: Optional[float], nd: int = 0) -> Optional[float]:
    """Round, keeping None as None — «no answer» must never become 0."""
    if v is None:
        return None
    try:
        out = round(float(v), nd)
    except (TypeError, ValueError):
        return None
    return int(out) if nd == 0 else out


def _pct(part: Optional[float], whole: Optional[float]) -> Optional[float]:
    """A whole percent, half up, or None when there is nothing to divide by.

    A 0 denominator is «nothing to say», never 0% — the difference between a
    unit that resolved none of its forty complaints and one that filed none.
    """
    if not whole:
        return None
    return _r(part / whole * 100)


def _delta(cur: Optional[float], prev: Optional[float]) -> Optional[float]:
    if cur is None or prev is None:
        return None
    return _r(cur - prev, 1)


def _pooled(per: list[tuple[Optional[float], Optional[float]]]) -> list[Optional[float]]:
    """Σ part ÷ Σ whole per period — the POOLED share, never a mean of means.

    The 2026-10-19 ruling for the comparison tables' AVG column, applied to
    every plant-level percentage here: a small brigade weighs what it is worth,
    and a mean of per-unit percentages is a figure no page prints.
    """
    return [_pct(p, w) for p, w in per]


# ── months ──────────────────────────────────────────────────────────────────
def month_start(m: date) -> date:
    return m.replace(day=1)


def month_end(m: date) -> date:
    start = month_start(m)
    nxt = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return nxt - timedelta(days=1)


def prev_month(m: date) -> date:
    return month_start(m) - timedelta(days=1)


def ym(m: date) -> str:
    return m.strftime("%Y-%m")


def months_for(picked: date, today: date, floor: Optional[date]) -> list[dict]:
    """`HISTORY` months, oldest → newest, the last holding `picked`.

    A month after today is never served (the caller clamps the pick), the month
    still running ends at today and says so (`partial`), and a month that ended
    before the platform's first closed day is dropped — it could only ever read
    «—» in every row. The shape is `brigadir_board.periods`' own, so the board's
    per-unit builders bucket into it unchanged.
    """
    out: list[dict] = []
    cur = month_start(min(picked, today))
    for _ in range(HISTORY):
        end = month_end(cur)
        if floor and end < floor and out:
            break
        out.append({"from": cur, "to": min(end, today), "end": end,
                    "partial": end > today, "ym": ym(cur)})
        cur = month_start(prev_month(cur))
    out.reverse()
    return out


# ── block builders ──────────────────────────────────────────────────────────
def prow(key: str, fmt: str, values: list, **extra) -> dict:
    """One row of a `periods` block — a figure across the months."""
    return {"key": key, "fmt": fmt, "values": list(values), **extra}


def periods_block(key: str, rows: list[dict]) -> dict:
    return {"kind": "periods", "key": key, "rows": [r for r in rows if r]}


def units_block(key: str, columns: list[dict], rows: list[dict]) -> dict:
    return {"kind": "units", "key": key, "columns": columns, "rows": rows}


def col(key: str, fmt: str = "num1", **extra) -> dict:
    return {"key": key, "fmt": fmt, **extra}


def _series(by_unit: dict, ids: Iterable[int], field: str, n: int) -> list[list]:
    """Per period, the `field` list of every unit that has one — the input a
    pooled share is summed from."""
    out: list[list] = [[] for _ in range(n)]
    for mid in ids:
        row = by_unit.get(mid)
        if not row:
            continue
        vals = row.get(field) or []
        for i in range(min(n, len(vals))):
            v = vals[i]
            if v is not None:
                out[i].append(v)
    return out


def _sums(by_unit: dict, ids: Iterable[int], field: str, n: int) -> list[float]:
    return [sum(x) for x in _series(by_unit, ids, field, n)]


def _at(vals: Optional[list], i: int):
    """The i-th value of a series, or None. Every series the builders are
    handed is exactly as long as the month list — this keeps a short one from
    raising rather than reading «—»."""
    if not vals or i < 0 or i >= len(vals):
        return None
    return vals[i]


def _mean(vals: list) -> Optional[float]:
    nums = [v for v in vals if v is not None]
    return _r(sum(nums) / len(nums)) if nums else None


# ── the sections ────────────────────────────────────────────────────────────
def _production(inp: dict, n: int) -> list[dict]:
    plan = inp["plan"]                       # ym → plan_fulfillment totals
    eff = inp["eff"]                         # unit → {"v": [...], "days": [...]}
    ful = inp["ful"]
    ids = inp["unit_ids"]
    yms = inp["yms"]

    pl = [(plan.get(y) or {}).get("plan") for y in yms]
    ac = [(plan.get(y) or {}).get("actual") for y in yms]
    sh = [(plan.get(y) or {}).get("short") for y in yms]
    days = [(plan.get(y) or {}).get("days") for y in yms]
    blocks = [periods_block("volume", [
        prow("planMin", "min", [_r(v) for v in pl]),
        prow("actualMin", "min", [_r(v) for v in ac]),
        prow("shortMin", "min", [_r(v) for v in sh]),
        prow("fulfil", "pct", [_pct(a, p) for a, p in zip(ac, pl)], bold=True),
        prow("eff", "pct", [_mean(x) for x in _series(eff, ids, "v", n)]),
        prow("countedDays", "int", [_r(v) for v in days]),
        prow("noFact", "int", [_r((plan.get(y) or {}).get("no_fact")) for y in yms]),
        prow("noPlan", "int", [_r((plan.get(y) or {}).get("no_plan")) for y in yms]),
    ])]

    last = n - 1
    rows = []
    for u in inp["units"]:
        pu = (inp["plan_units"].get(u["id"]) or {})
        rows.append({"key": str(u["id"]), "cells": [
            u["name"],
            _r(pu.get("plan")), _r(pu.get("actual")), _r(pu.get("short")),
            _pct(pu.get("actual"), pu.get("plan")),
            _at((ful.get(u["id"]) or {}).get("v"), last),
            _at((eff.get(u["id"]) or {}).get("v"), last),
        ]})
    rows.sort(key=lambda r: (r["cells"][4] is None, r["cells"][4] or 0))
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("planMin", "min"), col("actualMin", "min"),
        col("shortMin", "min"), col("fulfil", "pct"), col("fulfilAvg", "pct"),
        col("eff", "pct"),
    ], rows))
    return blocks


def _personnel(inp: dict, n: int) -> list[dict]:
    att = inp["att"]
    ids = inp["unit_ids"]
    roster = _sums(att, ids, "roster", n)
    came = _sums(att, ids, "came", n)
    leave = _sums(att, ids, "leave", n)
    turn = inp["turnover"]                   # ym → turnover totals | None
    yms = inp["yms"]

    blocks = [periods_block("attendance", [
        prow("listed", "int", [_r(v) for v in roster]),
        prow("came", "int", [_r(v) for v in came]),
        prow("onLeave", "int", [_r(v) for v in leave]),
        prow("attRate", "pct", _pooled([(c + lv, r) for r, c, lv in zip(roster, came, leave)]),
             bold=True),
        prow("attDays", "int", [_r(v) for v in _sums(att, ids, "days", n)]),
    ])]

    have_turn = any(turn.get(y) for y in yms)
    if have_turn:
        blocks.append(periods_block("turnover", [
            prow("working", "int", [_r((turn.get(y) or {}).get("working")) for y in yms]),
            prow("left", "int", [_r((turn.get(y) or {}).get("left")) for y in yms]),
            prow("turnRate", "pct", [_r((turn.get(y) or {}).get("rate"), 1) for y in yms],
                 bold=True),
        ]))

    last = n - 1
    rows = []
    for u in inp["units"]:
        a = att.get(u["id"]) or {}
        rows.append({"key": str(u["id"]), "cells": [
            u["name"],
            _r(_at(a.get("roster"), last)),
            _r(_at(a.get("came"), last)),
            _r(_at(a.get("leave"), last)),
            _at(a.get("v"), last),
        ]})
    rows.sort(key=lambda r: (r["cells"][4] is None, r["cells"][4] or 0))
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("listed", "int"), col("came", "int"),
        col("onLeave", "int"), col("attRate", "pct"),
    ], rows))
    return blocks


def _idle(inp: dict, n: int) -> list[dict]:
    idle = inp["idle"]                       # ym → {"total", "unit_days", "by_cat", "flagged"}
    yms = inp["yms"]
    tot = [(idle.get(y) or {}).get("total") for y in yms]
    ud = [(idle.get(y) or {}).get("unit_days") for y in yms]

    blocks = [periods_block("total", [
        prow("idleMin", "min", [_r(v) for v in tot], bold=True),
        prow("idlePerDay", "num1", [_r(t / d, 1) if t is not None and d else None
                                    for t, d in zip(tot, ud)]),
        prow("unitDays", "int", [_r(v) for v in ud]),
        prow("flaggedDays", "int", [_r((idle.get(y) or {}).get("flagged")) for y in yms]),
    ])]

    # Categories, worst first in the PICKED month — a cause that only appeared
    # earlier still gets its row, so a column is never silently short.
    last_cats = (idle.get(yms[-1]) or {}).get("by_cat") or {}
    names: set = set()
    for y in yms:
        names |= set(((idle.get(y) or {}).get("by_cat") or {}).keys())
    order = sorted(names, key=lambda c: (-(last_cats.get(c) or 0), c))
    if order:
        blocks.append(periods_block("byCategory", [
            prow(c, "min", [_r(((idle.get(y) or {}).get("by_cat") or {}).get(c)) for y in yms],
                 label=c)
            for c in order
        ]))

    rows = []
    for u in inp["units"]:
        r = ((idle.get(yms[-1]) or {}).get("by_unit") or {}).get(u["id"]) or {}
        rows.append({"key": str(u["id"]), "cells": [
            u["name"], _r(r.get("total")), _r(r.get("days")),
            _r(r.get("total") / r["days"], 1) if r.get("total") is not None and r.get("days") else None,
            _r(r.get("flagged")),
        ]})
    rows.sort(key=lambda r: (r["cells"][1] is None, -(r["cells"][1] or 0)))
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("idleMin", "min"), col("unitDays", "int"),
        col("idlePerDay", "num1"), col("flaggedDays", "int"),
    ], rows))
    return blocks


def _cost(inp: dict, n: int) -> list[dict]:
    cost = inp["cost"]                       # ym → {"totals", "cat_rows", "rows"}
    if cost is None:
        # Not this viewer's section (`routers/reports._sees_cost` —
        # `/downtime/cost`'s own COST_ROLES): no block at all, so `compose`
        # leaves «Xarajat» out of the payload, as the tab is left off
        # /downtime for them. Never an empty table that reads as «cost 0».
        return []
    yms = inp["yms"]
    t = [(cost.get(y) or {}).get("totals") or {} for y in yms]

    blocks = [periods_block("total", [
        prow("costSum", "money", [x.get("cost") for x in t], bold=True),
        prow("pricedMin", "min", [_r(x.get("priced_minutes")) for x in t]),
        prow("unpricedMin", "min", [_r(x.get("unpriced_minutes")) for x in t]),
        prow("costPerDay", "money", [_r(x["cost"] / x["days"])
                                     if x.get("cost") and x.get("days") else None for x in t]),
        prow("hc", "num1", [_r(x.get("hc"), 1) for x in t]),
    ])]

    # The CAUSE rows add up to more than the bill wherever one minute carried
    # two causes — the «Xarajat» tab's own two sums, each named rather than one
    # of them quietly printed as the other.
    cat_cost: dict[str, dict] = {}
    for y in yms:
        for r in (cost.get(y) or {}).get("cat_rows") or []:
            cat_cost.setdefault(r["category"], {})[y] = r.get("cost")
    picked = yms[-1]
    order = sorted(cat_cost, key=lambda c: (-(cat_cost[c].get(picked) or 0), c))
    if order:
        blocks.append(periods_block("byCategory", [
            prow(c, "money", [cat_cost[c].get(y) for y in yms], label=c) for c in order
        ]))

    rows = []
    for r in sorted(((cost.get(yms[-1]) or {}).get("rows") or []),
                    key=lambda x: -(x.get("cost") or 0)):
        rows.append({"key": str(r.get("manager_id") or r.get("manager")), "cells": [
            r.get("manager"), _r(r.get("minutes")), _r(r.get("priced_minutes")),
            r.get("cost"), _r(r.get("hc"), 1),
        ]})
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("idleMin", "min"), col("pricedMin", "min"),
        col("costSum", "money"), col("hc", "num1"),
    ], rows))
    return blocks


def _quality(inp: dict, n: int) -> list[dict]:
    q = inp["qual"]
    ids = inp["unit_ids"]
    act = _sums(q, ids, "n", n)
    done = _sums(q, ids, "done", n)
    blocks = [periods_block("total", [
        prow("actionable", "int", [_r(v) for v in act]),
        prow("resolved", "int", [_r(v) for v in done]),
        prow("closure", "pct", _pooled(list(zip(done, act))), bold=True),
        prow("openLeft", "int", [_r(a - d) for a, d in zip(act, done)]),
    ])]

    last = n - 1
    rows = []
    for u in inp["units"]:
        r = q.get(u["id"]) or {}
        rows.append({"key": str(u["id"]), "cells": [
            u["name"],
            _r(_at(r.get("n"), last)),
            _r(_at(r.get("done"), last)),
            _at(r.get("v"), last),
        ]})
    rows.sort(key=lambda r: (r["cells"][3] is None, r["cells"][3] or 0))
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("actionable", "int"), col("resolved", "int"),
        col("closure", "pct"),
    ], rows))
    return blocks


def _concerns(inp: dict, n: int) -> list[dict]:
    c = inp["xav"]
    ids = inp["unit_ids"]
    cnt = _sums(c, ids, "n", n)
    done = _sums(c, ids, "done", n)
    up = _sums(c, ids, "up", n)
    blocks = [periods_block("total", [
        prow("filed", "int", [_r(a + b) for a, b in zip(cnt, up)]),
        prow("counted", "int", [_r(v) for v in cnt]),
        prow("resolved", "int", [_r(v) for v in done]),
        prow("closure", "pct", _pooled(list(zip(done, cnt))), bold=True),
        prow("uplifted", "int", [_r(v) for v in up]),
        prow("openLeft", "int", [_r(a - d) for a, d in zip(cnt, done)]),
    ])]

    last = n - 1
    rows = []
    for u in inp["units"]:
        r = c.get(u["id"]) or {}
        rows.append({"key": str(u["id"]), "cells": [
            u["name"],
            _r(_at(r.get("n"), last)),
            _r(_at(r.get("done"), last)),
            _at(r.get("v"), last),
            _r(_at(r.get("up"), last)),
        ]})
    rows.sort(key=lambda r: (r["cells"][3] is None, r["cells"][3] or 0))
    blocks.append(units_block("byUnit", [
        col("unit", "text"), col("counted", "int"), col("resolved", "int"),
        col("closure", "pct"), col("uplifted", "int"),
    ], rows))
    return blocks


def _headline_row(section: str, key: str, r: dict, partial: bool) -> dict:
    """A figure lifted into the summary or the key-figures table, with its
    change against the month before — withheld on a TOTAL while the picked
    month is still running (see `CUMULATIVE`)."""
    vals = r["values"]
    cur = vals[-1] if vals else None
    prev = vals[-2] if len(vals) > 1 else None
    full = f"{section}.{key}"
    delta = None if (partial and full in CUMULATIVE) else _delta(cur, prev)
    return prow(full, r["fmt"], vals, section=section, delta=delta,
                **({"no_delta": "partial"} if delta is None and partial
                   and full in CUMULATIVE else {}))


def _figures(inp: dict, n: int, built: dict) -> list[dict]:
    """TopSim's «Corporate Key Figures» — one table, every headline figure of
    the report with the month before it and the change. Nothing new: each row
    is lifted from the section it belongs to, so the two can never disagree."""
    def pick(section: str, block: str, key: str) -> Optional[dict]:
        for b in built.get(section) or []:
            if b["kind"] == "periods" and b["key"] == block:
                for r in b["rows"]:
                    if r["key"] == key:
                        return r
        return None

    want = [
        ("production", "volume", "actualMin"),
        ("production", "volume", "fulfil"),
        ("production", "volume", "eff"),
        ("personnel", "attendance", "listed"),
        ("personnel", "attendance", "attRate"),
        ("personnel", "turnover", "turnRate"),
        ("idle", "total", "idleMin"),
        ("idle", "total", "idlePerDay"),
        ("cost", "total", "costSum"),
        ("quality", "total", "closure"),
        ("concerns", "total", "closure"),
    ]
    rows = []
    for section, block, key in want:
        r = pick(section, block, key)
        if r:
            rows.append(_headline_row(section, key, r, inp["partial"]))
    return [periods_block("all", rows)]


def _summary(inp: dict, n: int, built: dict) -> list[dict]:
    """The headline — the figures a reader wants before any table."""
    def val(section: str, block: str, key: str):
        for b in built.get(section) or []:
            if b["kind"] == "periods" and b["key"] == block:
                for r in b["rows"]:
                    if r["key"] == key:
                        return r
        return None

    rows = []
    for section, block, key in (("production", "volume", "fulfil"),
                                ("production", "volume", "eff"),
                                ("personnel", "attendance", "attRate"),
                                ("idle", "total", "idleMin"),
                                ("cost", "total", "costSum"),
                                ("quality", "total", "closure"),
                                ("concerns", "total", "closure")):
        r = val(section, block, key)
        if r:
            rows.append(_headline_row(section, key, r, inp["partial"]))
    # «units» is a FILTER fact — the same scope answers every month, so it is
    # repeated. «cells» is a PERIOD fact (cells that carried a stoppage) and
    # is read per month: repeating the picked month's count under the two
    # before it would state something about them that was never measured.
    scope = [prow("units", "int", [inp["scope"]["units"]] * n)]
    if inp["cost"] is not None:
        # The count comes out of the «Xarajat» tree, so a viewer the cost
        # section is not for gets no row — not a «—» that reads as unknown.
        scope.append(prow("cells", "int",
                          [((inp["cost"].get(y) or {}).get("totals") or {}).get("cells")
                           for y in inp["yms"]]))
    return [periods_block("headline", rows), periods_block("scope", scope)]


def compose(inp: dict) -> dict:
    """The whole payload from inputs each page's own code produced.

    `inp` carries, all already scoped and already period-bucketed by the
    router: `months` (the `months_for` list), `units`, `unit_ids`, `plan`,
    `plan_units`, `eff`, `ful`, `att`, `turnover`, `idle`, `cost`, `qual`,
    `xav`, `scope`. `idle` arrives through the viewer's category lock and
    `cost` is None for a viewer the «Xarajat» section is not for — both the
    router's decisions; nothing here knows a role.
    """
    months = inp["months"]
    n = len(months)
    inp = {**inp, "yms": [m["ym"] for m in months],
           "partial": bool(months[-1].get("partial"))}

    built: dict[str, list[dict]] = {}
    built["production"] = _production(inp, n)
    built["personnel"] = _personnel(inp, n)
    built["idle"] = _idle(inp, n)
    built["cost"] = _cost(inp, n)
    built["quality"] = _quality(inp, n)
    built["concerns"] = _concerns(inp, n)
    built["summary"] = _summary(inp, n, built)
    built["figures"] = _figures(inp, n, built)

    return {
        "month": months[-1]["ym"],
        "months": [{"ym": m["ym"], "from": m["from"].isoformat(),
                    "to": m["to"].isoformat(), "partial": m["partial"]}
                   for m in months],
        "sections": [{"key": k, "blocks": built[k]} for k in SECTIONS if built.get(k)],
        "missing": list(MISSING),
        "scope": inp["scope"],
    }


# ── the document ────────────────────────────────────────────────────────────
def doc_blocks(payload: dict, words: dict) -> list[dict]:
    """The report as `assistant_documents` blocks — the house document builder,
    never a second layout engine.

    `words` is what the SCREEN printed, in the reader's language, sent back by
    the client (`grid_export`'s rule): `sections` {key: title}, `rows`
    {key: label}, `cols` {key: label}, `months` [labels], `units` {…}, plus the
    fixed captions. Every figure is already formatted by the page, so the file
    and the screen cannot state two different numbers.
    """
    sec_t = words.get("sections") or {}
    row_t = words.get("rows") or {}
    col_t = words.get("cols") or {}
    cap = words.get("caps") or {}
    mcols = words.get("months") or [m["ym"] for m in payload.get("months") or []]

    out: list[dict] = []
    for sec in payload.get("sections") or []:
        sec_name = sec_t.get(sec["key"], sec["key"])
        out.append({"type": "heading", "level": 1, "text": sec_name})
        for b in sec.get("blocks") or []:
            title = cap.get(f"{sec['key']}.{b['key']}") or cap.get(b["key"])
            if title:
                out.append({"type": "heading", "level": 2, "text": title})
            # A workbook names its sheet after the last heading, so every
            # block title in this report is DISTINCT across sections (the
            # bundle's `caps` — «Kutish — brigadalar», not a fifth «Brigadalar
            # bo'yicha»): «… (2)», «… (3)» would name nothing.
            if b["kind"] == "periods":
                out.append({
                    "type": "table",
                    "columns": [cap.get("figure", ""), *mcols],
                    "rows": [[row_t.get(r["key"], r.get("label") or r["key"]),
                              *[_cell(v) for v in r.get("display", r["values"])]]
                             for r in b["rows"]],
                })
            else:
                out.append({
                    "type": "table",
                    "columns": [col_t.get(c["key"], c["key"]) for c in b["columns"]],
                    "rows": [[_cell(v) for v in r.get("display", r["cells"])]
                             for r in b["rows"]],
                })
    notes = words.get("missingNote")
    if notes:
        out.append({"type": "heading", "level": 1, "text": cap.get("notReported", "")})
        out.append({"type": "paragraph", "text": notes})
        items = [words.get("missing", {}).get(k) for k in payload.get("missing") or []]
        items = [x for x in items if x]
        if items:
            out.append({"type": "bullets", "items": items})
    return out


def _cell(v: Any) -> Any:
    """«—» for a missing figure — the platform's standing rule, kept all the
    way into the file: a blank cell in a report reads as a zero."""
    return "—" if v is None or v == "" else v
