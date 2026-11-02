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
  platform's one ojidaniya reading). «Kutish %» is `idle_share.build`: Σ(N·T)
  person-minutes over the Verifix worked minutes of the same cells, Tozalash
  left out.
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
the picked month and the one before it (`HISTORY`), oldest → newest, so a
figure is always read against where it came from. A table also names each
figure's unit of measurement (TopSim's «MEUR / %» column) — the words for it
come from the page, like every other word in the document.

ONE block shape — a **periods** block, `rows[]`, each `{key, fmt, values: [per
month], ...}` — so the page, the document and a later section all read it the
same way. **The report carries no per-brigadir table** (the operator,
2026-11-02: «we don't need any data by supervisors»): every figure is the
plant's — or the scope's — whole; a brigadir's own figures live on the pages
that own them.

`fmt` says how a cell is printed and nothing else: int · num1 · pct · min ·
money · text. `None` is «no answer» everywhere and is printed «—», never 0 —
the platform's standing rule, and the one that keeps «nothing filed» apart from
«nothing resolved».
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable, Optional

# How many months a table carries, the picked one last: the month and the one
# before it — TopSim's «Previous Period · Current Period» (the operator,
# 2026-11-02: «we don't need 3 months of comparison, just 2»).
HISTORY = 2

# The section ids, in the order the page lists them and the document lays them
# out. The words live in the frontend's bundle (pages/reportsText.js) in the
# four platform languages and come back with the export — the rule
# `services/grid_export.py` keeps: the screen describes itself, the server only
# lays it out, so the file can never name something the page does not.
SECTIONS = ("summary", "production", "personnel", "idle", "figures")
# Built but never shown as sections of their own (the operator, 2026-11-02:
# «we dont need section called Cost of Waiting, Quality and Concerns»): their
# headline figures still reach the Executive summary and Key figures, which
# lift rows out of them.
BUILT_ONLY = ("cost", "quality", "concerns")

# The headline rows that are a TOTAL over the period rather than a rate. A
# month still running holds fewer days than the one before it, so the change
# in a total says nothing a reader can act on — 26 days against 30 — while the
# change in a RATE is a fair comparison. Deltas on these are withheld while the
# picked month is partial, rather than printed as a fall nobody caused.
CUMULATIVE = {
    "production.actualMin", "production.planMin", "production.shortMin",
    "personnel.listed", "personnel.came", "personnel.onLeave", "personnel.left",
    "personnel.overtimeDirect", "personnel.overtimeIndirect",
    "personnel.vkPresence", "personnel.vkAbsence",
    "personnel.vkFree", "personnel.vkDayOff", "personnel.vkEarlyLeave", "personnel.vkLate",
    # Counts over the month that a running month has not finished counting —
    # their change is withheld too, now every table carries one.
    "production.countedDays", "production.noFact", "production.noPlan",
    "idle.unitDays", "idle.flaggedDays",
    "cost.pricedMin", "cost.unpricedMin", "quality.openLeft",
    "concerns.uplifted", "concerns.openLeft", "summary.cells",
    "idle.idleMin", "idle.idlePersonMin", "idle.workedMin",
    "cost.costSum", "quality.complaints", "quality.actionable", "quality.resolved",
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


def _mean(vals: list) -> Optional[float]:
    nums = [v for v in vals if v is not None]
    return _r(sum(nums) / len(nums)) if nums else None


# ── the sections ────────────────────────────────────────────────────────────
def _production(inp: dict, n: int) -> list[dict]:
    plan = inp["plan"]                       # ym → plan_fulfillment totals
    eff = inp["eff"]                         # unit → {"v": [...], "days": [...]}
    ids = inp["unit_ids"]
    yms = inp["yms"]

    pl = [(plan.get(y) or {}).get("plan") for y in yms]
    ac = [(plan.get(y) or {}).get("actual") for y in yms]
    sh = [(plan.get(y) or {}).get("short") for y in yms]
    days = [(plan.get(y) or {}).get("days") for y in yms]
    # «Smena boshi / Smena oxiri Zagruzka» — /zagruzka's simplified table,
    # pooled over the scope's closed unit-days (`brigadir_board.shift_load`).
    sl = inp.get("sload") or {}
    l_start = _pooled(list(zip(_sums(sl, ids, "plan", n), _sums(sl, ids, "pcap", n))))
    l_end = _pooled(list(zip(_sums(sl, ids, "act", n), _sums(sl, ids, "acap", n))))
    blocks = [periods_block("volume", [
        prow("planMin", "min", [_r(v) for v in pl]),
        prow("actualMin", "min", [_r(v) for v in ac]),
        prow("shortMin", "min", [_r(v) for v in sh]),
        prow("fulfil", "pct", [_pct(a, p) for a, p in zip(ac, pl)], bold=True),
        prow("eff", "pct", [_mean(x) for x in _series(eff, ids, "v", n)]),
        prow("loadStart", "pct", l_start),
        prow("loadEnd", "pct", l_end),
        prow("countedDays", "int", [_r(v) for v in days]),
        prow("noFact", "int", [_r((plan.get(y) or {}).get("no_fact")) for y in yms]),
        prow("noPlan", "int", [_r((plan.get(y) or {}).get("no_plan")) for y in yms]),
    ])]

    return blocks


def _personnel(inp: dict, n: int) -> list[dict]:
    att = inp["att"]
    ids = inp["unit_ids"]
    roster = _sums(att, ids, "roster", n)
    came = _sums(att, ids, "came", n)
    leave = _sums(att, ids, "leave", n)
    turn = inp["turnover"]                   # ym → turnover totals | None
    yms = inp["yms"]
    vk = inp.get("vkinds") or {}             # ym → {Verifix time_kind_id: minutes}

    blocks = [periods_block("attendance", [
        prow("listed", "int", [_r(v) for v in roster]),
        prow("came", "int", [_r(v) for v in came]),
        prow("onLeave", "int", [_r(v) for v in leave]),
        prow("attRate", "pct", _pooled([(c + lv, r) for r, c, lv in zip(roster, came, leave)]),
             bold=True),
    ])]

    # Verifix's own time kinds, in hours (the operator, 2026-11-02 — overtime
    # is «Сверхурочные», and these kinds belong here): stored by
    # `verifix_month_kinds`, by each person's current placement. A month no
    # read has landed for is «—», never 0.
    def _vk(y: str, kid: str):
        m = vk.get(y)
        return None if m is None else _r((m.get(kid) or 0.0) / 60)

    from app.services.verifix_month_kinds import TRACKED
    blocks.append(periods_block("verifix", [
        prow(key, "int", [_vk(y, kid) for y in yms], bold=key.startswith("overtime"))
        for kid, key in TRACKED
    ]))

    have_turn = any(turn.get(y) for y in yms)
    if have_turn:
        blocks.append(periods_block("turnover", [
            prow("working", "int", [_r((turn.get(y) or {}).get("working")) for y in yms]),
            prow("left", "int", [_r((turn.get(y) or {}).get("left")) for y in yms]),
            prow("turnRate", "pct", [_r((turn.get(y) or {}).get("rate"), 1) for y in yms],
                 bold=True),
        ]))

    return blocks


def _idle(inp: dict, n: int) -> list[dict]:
    idle = inp["idle"]                       # ym → {"total", "unit_days", "by_cat", "flagged"}
    yms = inp["yms"]
    tot = [(idle.get(y) or {}).get("total") for y in yms]
    ud = [(idle.get(y) or {}).get("unit_days") for y in yms]
    # Idle as a share of worked time (`services/idle_share.py`): its person-
    # minutes and worked minutes are printed under it so the % can be checked
    # by eye. One decimal — idle is a few percent, where a whole percent hides
    # the move. None (no worked minutes) stays «—».
    share = inp.get("idle_share") or {}
    sh = [share.get(y) or {} for y in yms]

    blocks = [periods_block("total", [
        prow("idleMin", "min", [_r(v) for v in tot], bold=True),
        prow("idlePct", "pct", [_r(x["idle"] / x["worked"] * 100, 1)
                                if x.get("worked") else None for x in sh], bold=True),
        prow("idlePerDay", "num1", [_r(t / d, 1) if t is not None and d else None
                                    for t, d in zip(tot, ud)]),
        prow("unitDays", "int", [_r(v) for v in ud]),
        prow("flaggedDays", "int", [_r((idle.get(y) or {}).get("flagged")) for y in yms]),
        prow("idlePersonMin", "min", [_r(x.get("idle")) for x in sh]),
        prow("workedMin", "min", [_r(x.get("worked")) for x in sh]),
    ])]
    # No table by cause here (the operator, 2026-11-02: «remove this one too»)
    # — the /downtime page carries the causes.

    return blocks


def _cost(inp: dict, n: int) -> list[dict]:
    cost = inp["cost"]                       # ym → {"totals", "cat_rows"}
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

    # No table by cause here either (the operator, 2026-11-02: «we dont need
    # this table also») — the «Xarajat» tab on /downtime carries the causes.

    return blocks


def _quality(inp: dict, n: int) -> list[dict]:
    q = inp["qual"]
    ids = inp["unit_ids"]
    act = _sums(q, ids, "n", n)
    done = _sums(q, ids, "done", n)
    # Every complaint filed, whatever its status, HAIR INCLUDED (the operator,
    # 2026-11-02) — «needing action» and the closure rate below stay hair
    # aside, as on the Quality page.
    filed = _sums(inp.get("qual_n") or {}, ids, "n", n)
    blocks = [periods_block("total", [
        prow("complaints", "int", [_r(v) for v in filed], bold=True),
        prow("actionable", "int", [_r(v) for v in act]),
        prow("resolved", "int", [_r(v) for v in done]),
        prow("closure", "pct", _pooled(list(zip(done, act))), bold=True),
        prow("openLeft", "int", [_r(a - d) for a, d in zip(act, done)]),
    ])]

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
        ("production", "volume", "loadStart"),
        ("production", "volume", "loadEnd"),
        ("personnel", "attendance", "listed"),
        ("personnel", "attendance", "attRate"),
        ("personnel", "turnover", "turnRate"),
        ("idle", "total", "idleMin"),
        ("idle", "total", "idlePct"),
        ("idle", "total", "idlePerDay"),
        ("cost", "total", "costSum"),
        ("quality", "total", "complaints"),
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
                                ("production", "volume", "loadStart"),
                                ("production", "volume", "loadEnd"),
                                ("personnel", "attendance", "attRate"),
                                ("idle", "total", "idleMin"),
                                ("idle", "total", "idlePct"),
                                ("cost", "total", "costSum"),
                                # How many complaints came in — the count, not
                                # the share resolved (the operator, 2026-11-02).
                                ("quality", "total", "complaints"),
                                ("concerns", "total", "closure")):
        r = val(section, block, key)
        if r:
            rows.append(_headline_row(section, key, r, inp["partial"]))
        if key == "loadEnd":
            # On-time delivery — the /ontime page's headline, the whole
            # plant's (`routers/reports._ontime_by_month`); a rate, so its
            # change is never withheld.
            ot = inp.get("ontime") or {}
            rows.append(_headline_row("ontime", "pct", prow(
                "pct", "pct", [ot.get(y) for y in inp["yms"]]), inp["partial"]))
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
    router: `months` (the `months_for` list), `unit_ids`, `plan`, `eff`, `att`,
    `turnover`, `idle`, `idle_share`, `cost`, `qual`, `xav`, `scope`. `idle` arrives through the viewer's category lock and
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

    # Every row of every table carries its change against the month before
    # (the operator, 2026-11-02: «All sections should have change column») —
    # `_headline_row`'s rule, so a figure changes by one number wherever it is
    # printed: withheld on a TOTAL while the picked month is still running.
    for sec, blocks in built.items():
        for b in blocks:
            for r in b.get("rows") or []:
                if "delta" in r:
                    continue
                vals = r["values"]
                cur = vals[-1] if vals else None
                prev = vals[-2] if len(vals) > 1 else None
                if inp["partial"] and f"{sec}.{r['key']}" in CUMULATIVE:
                    r["delta"] = None
                    r["no_delta"] = "partial"
                else:
                    r["delta"] = _delta(cur, prev)

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
    {key: label}, `months` [labels], `rowUnits`
    {"<section>.<block>.<row>": unit} with its column's header `uomCol`, plus
    the fixed captions. Every figure is already formatted by the page, so the
    file and the screen cannot state two different numbers. A tab from before
    the unit column sends no `rowUnits`, and its file simply has no such column.
    """
    sec_t = words.get("sections") or {}
    row_t = words.get("rows") or {}
    cap = words.get("caps") or {}
    mcols = words.get("months") or [m["ym"] for m in payload.get("months") or []]
    uom = words.get("rowUnits") if isinstance(words.get("rowUnits"), dict) else None
    uom_col = [words.get("uomCol") or ""] if uom is not None else []
    # The change column, as the screen printed it (`deltaText`), on every
    # table; a tab that sends none gets a file without it.
    deltas = payload.get("_deltas") if isinstance(payload.get("_deltas"), dict) else None
    delta_col = [words.get("deltaCol") or ""] if deltas and words.get("deltaCol") else []

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
            # bundle's `caps` — «Kutish — toifalar», not a second «Toifalar»): «… (2)», «… (3)» would name nothing.
            if b["kind"] != "periods":
                continue
            key = f"{sec['key']}.{b['key']}"
            out.append({
                "type": "table",
                "columns": [cap.get("figure", ""), *uom_col, *mcols, *delta_col],
                "rows": [[row_t.get(r["key"], r.get("label") or r["key"]),
                          *([uom.get(f"{key}.{r['key']}") or ""] if uom is not None else []),
                          *[_cell(v) for v in r.get("display", r["values"])],
                          *([deltas.get(f"{key}.{r['key']}") or "—"] if delta_col else [])]
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
