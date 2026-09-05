"""
Live shift monitor — THE arithmetic behind `/live` (page key ``live``, in the
Laboratory until the operator opens it up).

The page is a wall screen: it stays open for a whole shift and its one job is
to make a problem VISIBLE the moment the platform can see it — a cell that is
stopped right now, a brigadir whose ФАКТ is falling behind the clock, a unit
whose waiting has crossed the 50-minute flag. It answers two questions and
nothing else: *how much did we wait so far* and *how fast is the plan being
filled* — per shift, per brigadir, per cell.

Every figure here is derived from what other pages already store; this module
computes and never queries. The router hands it:

  * the SHIFT FRAME (`shift_frame`) — which calendar day the running shift
    belongs to, how far through it we are, and the clock in "minutes since that
    day's midnight", the same axis the interval model stores its events on;
  * the cells' filed ojidaniya intervals (``cell_ojidaniya_intervals``,
    approved rows — the same table `/idle-cell` writes and `idle_source` reads);
  * the day's counted attendance (headcount per unit and per cell, under the
    `idle_source._counted_hc` predicate, so "people" means what the загрузка
    means by it);
  * the unit ojidaniya figure from `idle_source.unit_downtime` — the
    headcount-weighted mean every KPI page prints, so the number a brigadir is
    ranked by here is the number `/downtime` will show tomorrow;
  * planned / actual MINUTES per work centre from `pp_calc.line_minutes`, the
    second reader of the per-line quantity rule, so ПЛАН and ФАКТ here are the
    Positions table's own.

**Two things this module decides on its own, and both are said on screen.**

1. **Where an event sits on the clock.** Intervals are stored as "HH:MM" pairs
   on the shift's DAY and `idle_intervals.span` carries an end that lands at or
   before its start into the next day — enough for every TOTAL on the platform,
   because a duration does not care which side of midnight it was. A LIVE page
   does care: to say a cell is stopped *right now* it must know whether
   «01:00 → 01:40» filed on a night shift means the small hours after the
   shift opened (it does) or the morning before it (span alone reads it so).
   `seat` picks whichever of the two placements overlaps the shift window more.
   Nothing about a total moves — the same minutes, seated.

2. **What "on pace" means.** The plan is judged against a LINEAR clock: at 40%
   of the shift, 40% of the planned minutes are expected. That is a floor, not
   a model of the shopfloor (batches are lumpy, and a line that runs its big
   SKU last is behind all afternoon and fine at 20:00) — so a unit is only
   *judged* after `PACE_GRACE` of the shift has run, and a unit with a plan but
   NO ФАКТ at all is called «fakt kiritilmagan», never «lagging»: the SAP
   «Поставлено» often lands once, after the shift, and a screen that paints
   every brigadir red every morning teaches them to stop looking at it.

The unit ojidaniya figure needs the day's ATTENDANCE (it weighs each cell by
the people in it). Until the day's file is uploaded the page falls back to the
plain mean over the unit's registered cells and marks it an ESTIMATE; the
moment attendance lands it switches to the platform's own number. A page that
showed nothing until the file arrived would be dark for exactly the hours a
shift manager watches it.

Thresholds are constants, in one place, and every one of them is named on the
page's legend so nobody has to guess what red means here.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from app.services import idle_intervals
from app.services.sheets_reader import OJIDANIYA_ONLY_CATS

TZ = timezone(timedelta(hours=5))       # Tashkent, the platform's wall clock
DAY = 1440

# ── Thresholds ───────────────────────────────────────────────────────────────
UNIT_IDLE_FLAG_MIN = 50     # the platform's own flag (kpi_calculator.idle_flagged)
UNIT_IDLE_WARN_MIN = 25     # half the flag — "heading there"
CELL_IDLE_CRIT_MIN = 60     # one cell, one hour stopped
CELL_IDLE_WARN_MIN = 30
STOPPED_NOW_CRIT_MIN = 15   # a stop still running after this long is critical
PACE_WARN = 0.95            # actual ÷ expected below this → warning
PACE_CRIT = 0.80            # … below this → critical
PACE_GRACE = 0.10           # the first 10% of a shift is never judged
NOACTUAL_AFTER = 0.25       # a plan with no ФАКТ is flagged after a quarter of the shift
PLAN_STALE_MIN = 120        # ФАКТ untouched this long during a running shift
ATT_MISSING_AFTER = 0.10    # no attendance uploaded this far into the shift

SEV_RANK = {"crit": 3, "warn": 2, "info": 1}
STATUS_RANK = {"crit": 3, "warn": 2, "ok": 1, "quiet": 0}


def now_local() -> datetime:
    return datetime.now(TZ)


def _r(v: Optional[float], n: int = 1) -> Optional[float]:
    return None if v is None else round(float(v), n)


# ── The shift frame ──────────────────────────────────────────────────────────
def shift_frame(now: datetime, shift: int, window: tuple) -> dict:
    """Which shift-day is on the clock right now, and how far through it we are.

    ``window`` is the shift's (start, end) "HH:MM" pair — `cell_hours.defaults`,
    the register an admin confirms on «Smena vaqtlari». The most recent start
    at or before ``now`` names the day (a night shift running at 02:00 belongs
    to yesterday's date, which is also the date its leaders file under);
    ``running`` says whether that shift is still inside its window. Once it is
    over the frame stays on that day at 100% until the next start — a monitor
    between shifts shows the last result, never a blank.

    ``now_rel`` is the clock on the interval model's own axis: minutes since the
    shift DAY's midnight, so a night shift's 02:00 is 1560, not 120.
    """
    s = idle_intervals.to_min(window[0])
    e = idle_intervals.to_min(window[1])
    if s is None or e is None:            # defaults always parse; belt and braces
        s, e = 480, 1200
    dur = (e - s) if e > s else (e + DAY - s)
    nm = now.hour * 60 + now.minute + now.second / 60.0
    day = now.date() if nm >= s else now.date() - timedelta(days=1)
    start_at = datetime.combine(day, time(0), tzinfo=TZ) + timedelta(minutes=s)
    elapsed = (now - start_at).total_seconds() / 60.0
    running = elapsed < dur
    inside = min(elapsed, float(dur))
    progress = (inside / dur) if dur else 1.0
    return {
        "shift": shift,
        "start": window[0],
        "end": window[1],
        "day": day.isoformat(),
        "duration_min": dur,
        "elapsed_min": _r(inside),
        "progress": round(max(0.0, min(1.0, progress)), 4),
        "state": "running" if running else "ended",
        "started_at": start_at.isoformat(),
        "ends_at": (start_at + timedelta(minutes=dur)).isoformat(),
        "next_start_at": (start_at + timedelta(days=1)).isoformat(),
        "now_rel": _r(s + inside),
        "win_lo": s,
        "win_hi": s + dur,
    }


def replay_frame(day: date, shift: int, window: tuple) -> dict:
    """A finished day looked at after the fact: the whole shift has run."""
    s = idle_intervals.to_min(window[0])
    e = idle_intervals.to_min(window[1])
    if s is None or e is None:
        s, e = 480, 1200
    dur = (e - s) if e > s else (e + DAY - s)
    start_at = datetime.combine(day, time(0), tzinfo=TZ) + timedelta(minutes=s)
    return {
        "shift": shift, "start": window[0], "end": window[1], "day": day.isoformat(),
        "duration_min": dur, "elapsed_min": float(dur), "progress": 1.0,
        "state": "replay",
        "started_at": start_at.isoformat(),
        "ends_at": (start_at + timedelta(minutes=dur)).isoformat(),
        "next_start_at": (start_at + timedelta(days=1)).isoformat(),
        "now_rel": float(s + dur), "win_lo": s, "win_hi": s + dur,
    }


def pick_shift(frames: dict) -> int:
    """The shift a monitor should open on: the one running now, else the one
    that ended most recently."""
    running = [f for f in frames.values() if f["state"] == "running"]
    if running:
        return min(running, key=lambda f: f["elapsed_min"])["shift"]
    # Ended: the smaller gap since its end wins.
    def gap(f):
        return f["elapsed_min"] if f["elapsed_min"] is not None else 0
    return min(frames.values(), key=gap)["shift"]


# ── Events on the clock ──────────────────────────────────────────────────────
def seat(sp: tuple, win_lo: int, win_hi: int) -> tuple:
    """Place one (lo, hi) span on the shift's own clock — as filed, or a day
    later, whichever overlaps the shift window more. Ties keep the filing."""
    lo, hi = sp

    def ov(a, b):
        return max(0, min(b, win_hi) - max(a, win_lo))

    if ov(lo + DAY, hi + DAY) > ov(lo, hi):
        return (lo + DAY, hi + DAY)
    return sp


def cell_idle(rows: Iterable[dict], frame: dict) -> dict:
    """One cell's waiting so far: the union of its STOPPED ranges (the
    загрузка's categories only, then everything), what is running right now,
    and the per-category split for the tooltip.

    ``rows`` are ``{category, start, end, stopped, note}`` — approved intervals
    of this cell on the frame's day."""
    win_lo, win_hi, now_rel = frame["win_lo"], frame["win_hi"], frame["now_rel"]
    live = frame["state"] == "running"
    counted, everything = [], []
    ongoing = []
    by_cat: dict = defaultdict(int)
    ns_min = 0
    events = 0
    last_end = None
    for r in rows:
        sp = idle_intervals.span(r.get("start"), r.get("end"))
        if not sp:
            continue
        events += 1
        sp = seat(sp, win_lo, win_hi)
        cat = r.get("category") or ""
        mins = sp[1] - sp[0]
        if not r.get("stopped", True):
            ns_min += mins
            continue
        everything.append(sp)
        by_cat[cat] += mins
        if cat not in OJIDANIYA_ONLY_CATS:
            counted.append(sp)
        if last_end is None or sp[1] > last_end:
            last_end = sp[1]
        if live and sp[0] <= now_rel < sp[1]:
            ongoing.append((sp, cat, r.get("note") or ""))
    out = {
        "idle_min": idle_intervals.union_minutes(counted),
        "idle_all": idle_intervals.union_minutes(everything),
        "ns_min": ns_min,
        "events": events,
        "by_cat": dict(sorted(by_cat.items(), key=lambda kv: -kv[1])),
        "stopped_now": bool(ongoing),
        "since": None, "now_min": None, "now_cats": [], "now_note": None,
        "last_end": idle_intervals.fmt_min(int(last_end)) if last_end is not None else None,
        "last_end_ago": (_r(now_rel - last_end, 0) if last_end is not None and now_rel >= last_end else None),
    }
    if ongoing:
        lo = min(o[0][0] for o in ongoing)
        out["since"] = idle_intervals.fmt_min(int(lo))
        out["now_min"] = _r(now_rel - lo, 0)
        cats = []
        for _sp, cat, _n in ongoing:
            if cat not in cats:
                cats.append(cat)
        out["now_cats"] = cats
        # The reason of the event that started earliest — one line on the card.
        out["now_note"] = min(ongoing, key=lambda o: o[0][0])[2][:140]
    return out


# ── Plan pace ────────────────────────────────────────────────────────────────
def plan_figures(plan_min: float, actual_min: float, frame: dict,
                 updated_at: Optional[datetime], now: datetime,
                 closed: bool) -> dict:
    """ПЛАН/ФАКТ minutes judged against the shift clock. See the module
    docstring for what «on pace» means and what is deliberately NOT judged."""
    plan_min = float(plan_min or 0.0)
    actual_min = float(actual_min or 0.0)
    progress = float(frame["progress"])
    running = frame["state"] == "running" and not closed
    out = {
        "plan_min": _r(plan_min), "actual_min": _r(actual_min),
        "pct": None, "expected_pct": _r(progress * 100), "pace": None,
        "projected_pct": None, "lag_min": None, "status": "none",
        "updated_at": updated_at.astimezone(TZ).isoformat() if updated_at else None,
        "stale_min": None, "stale": False,
    }
    if plan_min <= 0:
        return out
    pct = actual_min / plan_min
    out["pct"] = _r(pct * 100)
    expected = progress if running else 1.0
    out["lag_min"] = _r(plan_min * expected - actual_min, 0)
    if updated_at is not None:
        age = (now - updated_at.astimezone(TZ)).total_seconds() / 60.0
        out["stale_min"] = _r(max(0.0, age), 0)
        out["stale"] = running and actual_min > 0 and age > PLAN_STALE_MIN
    if running and progress < PACE_GRACE:
        out["status"] = "early"
        return out
    if running and actual_min <= 0:
        out["status"] = "noactual" if progress >= NOACTUAL_AFTER else "early"
        return out
    pace = pct / expected if expected > 0 else None
    out["pace"] = _r(pace * 100) if pace is not None else None
    if progress >= 0.05:
        out["projected_pct"] = _r(min(pct / max(progress, 0.05), 3.0) * 100) if running else out["pct"]
    if pace is None:
        out["status"] = "none"
    elif pace >= PACE_WARN:
        out["status"] = "ok"
    elif pace >= PACE_CRIT:
        out["status"] = "warn"
    else:
        out["status"] = "crit"
    return out


# ── The whole picture ────────────────────────────────────────────────────────
def _worse(a: str, b: str) -> str:
    return a if STATUS_RANK.get(a, 0) >= STATUS_RANK.get(b, 0) else b


def build(*, frame: dict, now: datetime, units: list, cells: list,
          intervals_by_cell: dict, unit_people: dict, cell_people: dict,
          idle_unit: dict, plan_by_unit: dict, wc_plan: dict, wc_cell: dict,
          day_closed: dict, att_uploaded: dict) -> dict:
    """Assemble the payload. Pure: every input is a plain structure.

      units             [{id, name, shift, factory_id}]
      cells             [{id, code, unit_id, leader}]
      intervals_by_cell {cell_id: [interval rows]}
      unit_people       {unit_id: Σ hc_weight of counted attendance}
      cell_people       {cell_id: Σ hc_weight}
      idle_unit         idle_source.unit_downtime output for the day
      plan_by_unit      {unit_id: {plan_min, actual_min, updated_at, configured}}
      wc_plan           {(unit_id, wc): (plan_min, actual_min)}
      wc_cell           {wc: cell_id} — SAP work centre → cell, where the
                        registry carries the code
      day_closed        {unit_id: bool}
      att_uploaded      {unit_id: bool} — any attendance row at all today
    """
    live = frame["state"] == "running"
    progress = float(frame["progress"])
    day_iso = frame["day"]

    # Per-cell plan minutes, where a work centre resolves to a cell.
    cell_plan: dict = defaultdict(lambda: [0.0, 0.0])
    for (uid, wc), (p, a) in wc_plan.items():
        cid = wc_cell.get(wc)
        if cid is None:
            continue
        cell_plan[cid][0] += p
        cell_plan[cid][1] += a

    alerts: list = []

    def alert(kind, sev, unit=None, cell=None, **extra):
        key = f"{kind}:{unit['id'] if unit else ''}:{cell['id'] if cell else ''}"
        a = {"key": key, "kind": kind, "sev": sev,
             "unit_id": unit["id"] if unit else None,
             "unit": unit["name"] if unit else None,
             "cell_id": cell["id"] if cell else None,
             "cell": cell["code"] if cell else None,
             "leader": cell.get("leader") if cell else None}
        a.update(extra)
        alerts.append(a)

    units_by_id = {u["id"]: u for u in units}
    cells_out: list = []
    cells_by_unit: dict = defaultdict(list)
    for c in cells:
        u = units_by_id.get(c["unit_id"])
        if u is None:
            continue
        ci = cell_idle(intervals_by_cell.get(c["id"], []), frame)
        n = float(cell_people.get(c["id"], 0.0))
        pl = cell_plan.get(c["id"])
        plan = None
        if pl is not None and pl[0] > 0:
            plan = plan_figures(pl[0], pl[1], frame, plan_by_unit.get(u["id"], {}).get("updated_at"),
                                now, bool(day_closed.get(u["id"])))
        status = "quiet"
        if ci["stopped_now"]:
            status = "crit" if (ci["now_min"] or 0) >= STOPPED_NOW_CRIT_MIN else "warn"
            alert("cell_stopped_now", status, u, c, minutes=ci["now_min"], since=ci["since"],
                  cats=ci["now_cats"], note=ci["now_note"])
        if ci["idle_min"] >= CELL_IDLE_CRIT_MIN:
            status = _worse(status, "crit")
            if not ci["stopped_now"]:
                alert("cell_idle", "crit", u, c, minutes=ci["idle_min"])
        elif ci["idle_min"] >= CELL_IDLE_WARN_MIN:
            status = _worse(status, "warn")
            if not ci["stopped_now"]:
                alert("cell_idle", "warn", u, c, minutes=ci["idle_min"])
        elif ci["events"] or n > 0 or plan is not None:
            status = _worse(status, "ok")
        if plan is not None and plan["status"] in ("warn", "crit"):
            status = _worse(status, plan["status"])
        row = {
            "id": c["id"], "code": c["code"], "leader": c.get("leader"),
            "unit_id": u["id"], "unit": u["name"],
            "people": _r(n), "status": status,
            "idle": ci, "plan": plan,
        }
        cells_out.append(row)
        cells_by_unit[u["id"]].append(row)

    units_out: list = []
    fleet_plan = fleet_actual = 0.0
    fleet_idle_vals: list = []
    people_total = 0.0
    for u in units:
        uid = u["id"]
        ucells = cells_by_unit.get(uid, [])
        closed = bool(day_closed.get(uid))
        n_people = float(unit_people.get(uid, 0.0))
        people_total += n_people
        fig = idle_unit.get((uid, day_iso))
        if fig is not None:
            idle_min, idle_all, basis = float(fig["total"]), float(fig["total_all"]), "weighted"
            cells_with_people = int(fig.get("cells_with_att", 0))
        elif ucells:
            idle_min = sum(r["idle"]["idle_min"] for r in ucells) / len(ucells)
            idle_all = sum(r["idle"]["idle_all"] for r in ucells) / len(ucells)
            basis = "estimate"
            cells_with_people = sum(1 for r in ucells if (r["people"] or 0) > 0)
        else:
            idle_min = idle_all = 0.0
            basis = "none"
            cells_with_people = 0
        stopped = [r for r in ucells if r["idle"]["stopped_now"]]
        with_idle = [r for r in ucells if r["idle"]["idle_min"] > 0]
        worst = max(ucells, key=lambda r: r["idle"]["idle_min"], default=None)
        pu = plan_by_unit.get(uid, {})
        plan = plan_figures(pu.get("plan_min", 0.0), pu.get("actual_min", 0.0), frame,
                            pu.get("updated_at"), now, closed)
        plan["configured"] = bool(pu.get("configured"))
        fleet_plan += plan["plan_min"] or 0.0
        fleet_actual += plan["actual_min"] or 0.0
        if basis != "none":
            fleet_idle_vals.append(idle_min)

        status = "quiet"
        if idle_min >= UNIT_IDLE_FLAG_MIN:
            status = "crit"
            alert("unit_idle", "crit", u, minutes=_r(idle_min, 0), basis=basis)
        elif idle_min >= UNIT_IDLE_WARN_MIN:
            status = "warn"
            alert("unit_idle", "warn", u, minutes=_r(idle_min, 0), basis=basis)
        elif basis != "none" or ucells:
            status = "ok"
        if stopped:
            status = _worse(status, max((r["status"] for r in stopped), key=lambda s: STATUS_RANK[s]))
        if plan["status"] in ("warn", "crit"):
            status = _worse(status, plan["status"])
            alert("plan_pace", plan["status"], u, pace=plan["pace"], pct=plan["pct"],
                  expected=plan["expected_pct"], lag=plan["lag_min"])
        elif plan["status"] == "noactual":
            status = _worse(status, "warn")
            alert("plan_noactual", "warn", u, plan_min=plan["plan_min"])
        elif plan["status"] == "ok":
            status = _worse(status, "ok")
        if plan["stale"]:
            status = _worse(status, "warn")
            alert("plan_stale", "warn", u, minutes=plan["stale_min"], updated_at=plan["updated_at"])
        if live and progress >= ATT_MISSING_AFTER and not att_uploaded.get(uid) and ucells:
            alert("no_attendance", "info", u)
        if closed:
            alert("day_closed", "info", u, pct=plan["pct"], idle=_r(idle_min, 0))

        units_out.append({
            "id": uid, "name": u["name"], "shift": u.get("shift"),
            "factory_id": u.get("factory_id"),
            "status": status,
            "people": _r(n_people), "attendance": bool(att_uploaded.get(uid)),
            "cells": len(ucells), "cells_with_people": cells_with_people,
            "cells_stopped": len(stopped), "cells_with_idle": len(with_idle),
            "idle": {
                "min": _r(idle_min), "all": _r(idle_all), "basis": basis,
                "worst_cell": worst["code"] if worst and worst["idle"]["idle_min"] > 0 else None,
                "worst_cell_id": worst["id"] if worst and worst["idle"]["idle_min"] > 0 else None,
                "worst_cell_min": worst["idle"]["idle_min"] if worst else 0,
                "worst_cell_leader": worst.get("leader") if worst else None,
            },
            "plan": plan,
            "day_closed": closed,
        })

    # Worst first; inside a band, the bigger problem first.
    def unit_sort(r):
        pace_def = 0.0
        if r["plan"]["pace"] is not None:
            pace_def = max(0.0, 100.0 - r["plan"]["pace"])
        return (-STATUS_RANK.get(r["status"], 0), -r["cells_stopped"],
                -(r["idle"]["min"] or 0), -pace_def, r["name"])
    units_out.sort(key=unit_sort)
    order = {r["id"]: i for i, r in enumerate(units_out)}

    def cell_sort(r):
        return (-STATUS_RANK.get(r["status"], 0), 0 if r["idle"]["stopped_now"] else 1,
                -(r["idle"]["now_min"] or 0), -r["idle"]["idle_min"], order.get(r["unit_id"], 99), r["code"])
    cells_out.sort(key=cell_sort)

    alerts.sort(key=lambda a: (-SEV_RANK.get(a["sev"], 0), -(a.get("minutes") or 0), a.get("unit") or ""))

    pct = (fleet_actual / fleet_plan * 100) if fleet_plan > 0 else None
    expected = (progress if live else 1.0) * 100
    pace = (pct / expected * 100) if (pct is not None and expected > 0) else None
    stopped_cells = [r for r in cells_out if r["idle"]["stopped_now"]]
    kpi = {
        "plan_min": _r(fleet_plan), "actual_min": _r(fleet_actual),
        "plan_pct": _r(pct), "expected_pct": _r(expected),
        "pace": _r(pace) if (live and progress >= PACE_GRACE and fleet_actual > 0) or not live else None,
        "units_with_plan": sum(1 for r in units_out if (r["plan"]["plan_min"] or 0) > 0),
        "units_with_actual": sum(1 for r in units_out if (r["plan"]["actual_min"] or 0) > 0),
        "idle_mean": _r(sum(fleet_idle_vals) / len(fleet_idle_vals)) if fleet_idle_vals else None,
        "idle_units_counted": len(fleet_idle_vals),
        "idle_estimate_units": sum(1 for r in units_out if r["idle"]["basis"] == "estimate"),
        "cells_total": len(cells_out),
        "cells_stopped": len(stopped_cells),
        "cells_with_idle": sum(1 for r in cells_out if r["idle"]["idle_min"] > 0),
        "cells_with_people": sum(1 for r in cells_out if (r["people"] or 0) > 0),
        "people": _r(people_total, 0),
        "units": len(units_out),
        "units_with_attendance": sum(1 for r in units_out if r["attendance"]),
        "units_by_status": {k: sum(1 for r in units_out if r["status"] == k) for k in STATUS_RANK},
        "alerts": {k: sum(1 for a in alerts if a["sev"] == k) for k in SEV_RANK},
        "days_closed": sum(1 for r in units_out if r["day_closed"]),
    }
    return {
        "frame": frame,
        "generated_at": now.isoformat(),
        "kpi": kpi,
        "units": units_out,
        "cells": cells_out,
        "alerts": alerts,
        "thresholds": {
            "unit_idle_flag": UNIT_IDLE_FLAG_MIN, "unit_idle_warn": UNIT_IDLE_WARN_MIN,
            "cell_idle_crit": CELL_IDLE_CRIT_MIN, "cell_idle_warn": CELL_IDLE_WARN_MIN,
            "stopped_now_crit": STOPPED_NOW_CRIT_MIN,
            "pace_warn": PACE_WARN, "pace_crit": PACE_CRIT, "pace_grace": PACE_GRACE,
            "noactual_after": NOACTUAL_AFTER, "plan_stale_min": PLAN_STALE_MIN,
        },
    }
