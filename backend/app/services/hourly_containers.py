"""Containers per clock HOUR — the Python twin of
`frontend/src/components/production/HourlyContainers.jsx` (`teamTimeline`).
KEEP THE TWO IN STEP. docs/production-quantities.md «Hourly containers».

A team (work centre, or one group of a work centre typed per group, or that
centre's unlettered lines) makes its lines one after another from its shift
start: «Navbat» first, then № for the lines nobody ordered; lines sharing a
«Navbat» (only a legacy repeat now) are made together. A step lasts
Σ total_labor ÷ N ÷ (productive_min ÷ shift_min) clock minutes, and its
containers are needed as it is made — an hour gets

    ROUNDUP(made by the hour's end ÷ cap) − ROUNDUP(made by its start ÷ cap)

so the hours add up to the line's daily count. Minutes count from the day's
midnight and run past 1440 for a shift that crosses it.

Read by «Smena kunligi» (`GET /api/shift-report/containers-hourly`), summed
over every unit in scope off each unit's own dashboard."""
from __future__ import annotations

import math
from typing import Optional

from app.services import pp_containers

DAY = 1440
KEYS = pp_containers.keys()
FIELDS = pp_containers.CONTAINERS


def _to_min(hhmm) -> Optional[int]:
    try:
        h, m = str(hhmm or "").split(":")[:2]
        return int(h) * 60 + int(m[:2])
    except (ValueError, TypeError):
        return None


def _ceil6(x: float) -> int:
    return math.ceil(round(x, 6))


def _num(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def team_timeline(rows: list, people, start_hhmm, eff: float):
    """({hour: {key: n}}, {key: n untimed}) for one team's rows."""
    start = _to_min(start_hhmm)
    if start is None:
        start = 8 * 60
    hours: dict = {}
    untimed: dict = {}
    n_people = _num(people)
    big = float("inf")
    ordered = sorted(rows, key=lambda r: (r.get("priority") if r.get("priority") is not None else big,
                                          r.get("seq") or 0))
    steps: list = []
    for r in ordered:
        p = r.get("priority")
        if p is not None and steps and steps[-1][0] == p:
            steps[-1][1].append(r)
        else:
            steps.append((p, [r]))
    cur = float(start)
    for _p, step in steps:
        timed = []
        for r in step:
            plan = _num(r.get("plan_qty"))
            if plan <= 0:
                continue
            caps = [(k, _num(r.get(f))) for k, f in zip(KEYS, FIELDS) if _num(r.get(f)) > 0]
            if n_people > 0 and _num(r.get("total_labor")) > 0:
                timed.append((r, plan, caps))
                continue
            for k, cap in caps:
                untimed[k] = untimed.get(k, 0) + _ceil6(plan / cap)
        if not timed:
            continue
        dur = sum(_num(r.get("total_labor")) for r, _pl, _c in timed) / n_people / eff
        t0, t1 = cur, cur + dur
        for _r, plan, caps in timed:
            if not caps:
                continue
            h = math.floor(t0 / 60)
            while h * 60 < t1:
                a, b = max(t0, h * 60), min(t1, (h + 1) * 60)
                qa, qb = plan * (a - t0) / dur, plan * (b - t0) / dur
                for k, cap in caps:
                    n = _ceil6(qb / cap) - _ceil6(qa / cap)
                    if n:
                        e = hours.setdefault(h, {})
                        e[k] = e.get(k, 0) + n
                h += 1
        cur = t1
    return hours, untimed


def _norm(v) -> str:
    return str(v or "").strip().upper()


def unit_hours(dash: dict):
    """One unit's dashboard → ({hour: {key: n}}, {key: n untimed}), its teams
    split exactly as the «Jamoalar» card splits them."""
    const = dash.get("constants") or {}
    s = _num(const.get("shift_min")) or 480.0
    pm = _num(const.get("productive_min")) or 408.0
    eff = pm / s if 0 < pm / s <= 1.5 else 0.85
    unit_clock = (const.get("shift_hours") or {}).get("start")
    rows = dash.get("rows") or []
    hours: dict = {}
    untimed: dict = {}

    def add(h_map, u_map):
        for h, e in h_map.items():
            o = hours.setdefault(h, {})
            for k, n in e.items():
                o[k] = o.get(k, 0) + n
        for k, n in u_map.items():
            untimed[k] = untimed.get(k, 0) + n

    def clock_of(cell, w_cell):
        c = cell or w_cell or {}
        return (c.get("shift_hours") or {}).get("start") or unit_clock

    for w in dash.get("work_centers") or []:
        code = _norm(w.get("work_center"))
        mine = [r for r in rows if _norm(r.get("work_center")) == code]
        groups = [g for g in (w.get("groups") or []) if not g.get("orphan")]
        if groups:
            for g in groups:
                add(*team_timeline([r for r in mine if r.get("wc_group") == g.get("group")],
                                   g.get("people"), clock_of(g.get("cell"), w.get("cell")), eff))
            add(*team_timeline([r for r in mine if not r.get("wc_group")],
                               w.get("people"), clock_of(None, w.get("cell")), eff))
        else:
            add(*team_timeline(mine, w.get("people"), clock_of(None, w.get("cell")), eff))
    return hours, untimed


def unit_teams(dash: dict) -> list:
    """One unit's dashboard → its TEAMS, each with its own hours:
    `[{work_center, group, rest, cell, people, hours: {h: {key: n}}, untimed}]`
    — the very split `unit_hours` sums (keep the two in step), kept apart for
    the container flow, whose need and shares are per team
    (services/container_flow.py, docs/containers-flow.md). A team with no
    count at all is left out."""
    const = dash.get("constants") or {}
    s = _num(const.get("shift_min")) or 480.0
    pm = _num(const.get("productive_min")) or 408.0
    eff = pm / s if 0 < pm / s <= 1.5 else 0.85
    unit_clock = (const.get("shift_hours") or {}).get("start")
    rows = dash.get("rows") or []
    out: list = []

    def clock_of(cell, w_cell):
        c = cell or w_cell or {}
        return (c.get("shift_hours") or {}).get("start") or unit_clock

    def team(code, group, rest, cell, people, mine, start):
        h_map, u_map = team_timeline(mine, people, start, eff)
        if h_map or u_map:
            out.append({"work_center": code, "group": group or "", "rest": bool(rest),
                        "cell": cell if isinstance(cell, dict) else None,
                        "people": people, "hours": h_map, "untimed": u_map})

    for w in dash.get("work_centers") or []:
        code = _norm(w.get("work_center"))
        mine = [r for r in rows if _norm(r.get("work_center")) == code]
        groups = [g for g in (w.get("groups") or []) if not g.get("orphan")]
        if groups:
            for g in groups:
                team(code, g.get("group"), False, g.get("cell") or w.get("cell"), g.get("people"),
                     [r for r in mine if r.get("wc_group") == g.get("group")],
                     clock_of(g.get("cell"), w.get("cell")))
            team(code, "", True, w.get("cell"), w.get("people"),
                 [r for r in mine if not r.get("wc_group")], clock_of(None, w.get("cell")))
        else:
            team(code, "", False, w.get("cell"), w.get("people"), mine, clock_of(None, w.get("cell")))
    return out
