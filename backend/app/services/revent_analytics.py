"""«Pechlar» — what the page shows, read off the logs the collector posted.

Everything the Windows «Revent Oven Manager» 1.3.39 shows, from the same files
and by the same rules (its decompiled LogControl / StatusControl /
SettingsControl, 3 Nov 2026):

- the live board (`board`): each oven's status lines as the collector last
  read them, named, with their age;
- the period (`analysis`): bakes, oven modes (utilisation), alarms, door and
  heater time per oven per day, and the bakes themselves;
- one oven's day (`day`): temperature series against their references, the
  mode timeline, door and relay timelines, alarms, bakes with their programs;
- the oven's own word about itself (`info`): its settings file, its software
  versions (from the log) and the service counters.

Nothing here is stored: a log file is decoded once per (row, sha) and its
FACTS kept in memory (`_facts`), so a day re-read costs a dict lookup and a
file that grew is decoded again. The record layout is `revent_log`; what each
record MEANS is this module's.

Where the app and the platform differ, on purpose:
- energy: the app starts each counter from 0, so the first record adds its
  whole running total; here the first record only sets the baseline;
- a bake whose file ends while it runs is shown as running, not as ending at
  the file's last record.
"""
from __future__ import annotations

import threading
import xml.etree.ElementTree as ET
from collections import OrderedDict, defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session, defer

from app.models import ReventOven, ReventOvenLog
from app.services import revent_log, revent_ovens

# ── what the records mean ─────────────────────────────────────────────────────

SENSOR = {0: "oven", 1: "core1", 2: "core2", 3: "prover"}
NO_PROBE = -24.6                     # a sensor with no probe plugged in reads −24.6 °C

# Oven modes: the app's statistics read ONLY these records (MakeStatistics_New);
# each mode lasts until the next of them. change_state (18) / baking (17) are
# never read by the app and are not read here.
MODE_OF_MSG = {1: "off", 2: "off", 3: "standby", 4: "energy_save",
               9: "bake_recipe", 10: "bake_manual", 13: "standby"}
MODES = ("bake_recipe", "bake_manual", "standby", "energy_save", "off")
BAKE_ENDS = (0, 1, 2, 3, 4, 9, 10, 13)   # a bake ends at the next of these
PROVER_MODE_OF_MSG = {20: "off", 21: "standby", 22: "proving", 28: "cooling"}

# Fault (15) / alarm (16): d0 is ONE of these codes (the app shows «Unknown»
# for anything else; here an unknown code keeps its number).
FAULT = {
    0x1: "heater", 0x2: "motor_breaker", 0x4: "overheat", 0x8: "temp_limit",
    0x10: "oven_interface", 0x20: "temp_sensor", 0x40: "heat_exchanger_pressure",
    0x2000: "not_heating_up", 0x4000: "not_cooling_down", 0x8000: "not_rotating",
}
PROVER_ALARM = {0x100: "rh_sensor", 0x200: "temp_sensor", 0x400: "water_inlet",
                0x800: "boiler_or_water_inlet", 0x1000: "overheat"}

# Relays (digital_out, 5) — the ones a reader can act on. The app names every
# bit; the prover / lift bits (0x1000+) mean different things per oven model.
DIGITAL_OUT = {0x1: "oven", 0x2: "fan", 0x4: "rotor", 0x8: "stack_fan", 0x10: "steam",
               0x20: "rotor_ccw", 0x40: "canopy_fan", 0x80: "canopy_low_or_cooler",
               0x100: "buzzer", 0x200: "heat", 0x800: "damper_motor"}
# Inputs (digital_in, 6): set = closed / in position / tripped.
DIGITAL_IN = {0x1: "motor_breaker", 0x10: "rear_door", 0x20: "temp_limit", 0x40: "burner",
              0x80: "door", 0x100: "rotor"}
DOOR_CLOSED, REAR_DOOR_CLOSED, ROTOR_SWITCH = 0x80, 0x10, 0x100


def _code_names(code: int, table: dict) -> list[str]:
    if code in table:
        return [table[code]]
    return [n for b, n in table.items() if code & b] or ["code_%d" % code]


def _chars(*words) -> str:
    """Four words that each carry two ASCII characters (release, start)."""
    s = "".join(chr(w >> 8) + chr(w & 0xFF) for w in words)
    return "".join(c for c in s if 32 <= ord(c) < 127).strip()


# ── the per-file facts, decoded once ──────────────────────────────────────────

_CACHE: "OrderedDict[tuple, dict]" = OrderedDict()
_CACHE_MAX = 400                     # ~ 50 ovens × 7 days with room to spare
_LOCK = threading.Lock()


def forget(oven_id: Optional[int] = None) -> None:
    """Drop the kept facts (of one oven, or all) — a file changed."""
    with _LOCK:
        for k in [k for k in _CACHE if oven_id is None or k[0] == oven_id]:
            _CACHE.pop(k, None)


def _facts(row: ReventOvenLog) -> dict:
    key = (row.oven_id, row.id, row.sha256)
    with _LOCK:
        hit = _CACHE.get(key)
        if hit is not None:
            _CACHE.move_to_end(key)
            return hit
    facts = file_facts(revent_ovens.log_bytes(row))
    with _LOCK:
        _CACHE[key] = facts
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return facts


def _on_spans(changes: list[tuple], bit: int, end: datetime) -> list[tuple]:
    """(on, off) runs of one bit over a list of (t, word) changes."""
    out, since, prev = [], None, 0
    for t, w in changes:
        if w & bit and not prev & bit:
            since = t
        elif not w & bit and prev & bit and since:
            out.append((since, t))
            since = None
        prev = w
    if since:
        out.append((since, end))
    return out


def file_facts(buf: bytes) -> dict:
    """What one log file says, as plain lists (times are the oven's wall clock)."""
    events = revent_log.decode(buf)
    temps: dict[str, list] = defaultdict(list)
    refs: dict[str, list] = defaultdict(list)
    prover_rh, prover_rh_ref = [], []
    bakes, alarms, door, rear, rotations, verifies = [], [], [], [], [], []
    modes: list[tuple] = []          # (t, mode)
    prover_modes: list[tuple] = []
    outs: list[tuple] = []           # (t, digital_out word)
    energy: list[tuple] = []         # (t, Δtotal, Δrotor, Δfan, Δheater) in Wh
    starts, release, oi = [], None, None
    cur = None
    last_in, last_e = None, None
    door_open_at = rear_open_at = None
    first = last = None
    unknown = defaultdict(int)
    for e in events:
        t, m, d = e["t"], e["id"], e["data"]
        if t is None:
            continue
        first = first or t
        last = t
        if cur and m in BAKE_ENDS:
            cur["stop"] = t
            cur["ended_by"] = revent_log.MSG.get(m)
            bakes.append(cur)
            cur = None
        mode = MODE_OF_MSG.get(m)
        if mode:
            modes.append((t, mode))
        pmode = PROVER_MODE_OF_MSG.get(m)
        if pmode:
            prover_modes.append((t, pmode))
        if m == 14:
            v = (d[1] - 0x10000 if d[1] >= 0x8000 else d[1]) / 10
            temps[SENSOR.get(d[0], "s%d" % d[0])].append((t, v))
        elif m == 11:
            refs[SENSOR.get(d[0], "s%d" % d[0])].append((t, d[1] / 10))
        elif m == 24 and d[0] == 3:
            temps["prover"].append((t, (d[1] - 0x10000 if d[1] >= 0x8000 else d[1]) / 10))
        elif m == 23 and d[0] == 3:
            refs["prover"].append((t, d[1] / 10))
        elif m == 26:
            prover_rh.append((t, d[1]))
        elif m == 25:
            prover_rh_ref.append((t, d[1]))
        elif m in (9, 10):
            prog = e.get("program") or {}
            steps = prog.get("temp") or []
            cur = {"start": t, "stop": None, "manual": m == 10,
                   "recipe": e.get("recipe") or "", "program": prog,
                   "set_c": steps[0]["temp_c"] if steps else None,
                   "planned_s": sum(s["duration_s"] for s in steps) or None,
                   "door_opened": 0, "wh": 0}
        elif m in (15, 16):
            alarms.append({"t": t, "kind": "alarm" if m == 16 else "fault", "code": d[0],
                           "names": _code_names(d[0], FAULT)})
        elif m == 27:
            alarms.append({"t": t, "kind": "prover", "code": d[0],
                           "names": _code_names(d[0], PROVER_ALARM)})
        elif m == 6:
            v = d[0]
            prev = 0x80 if last_in is None else last_in      # the app starts «door closed»
            if prev & DOOR_CLOSED and not v & DOOR_CLOSED:
                door_open_at = t
                if cur:
                    cur["door_opened"] += 1
            elif not prev & DOOR_CLOSED and v & DOOR_CLOSED and door_open_at:
                door.append((door_open_at, t))
                door_open_at = None
            if prev & REAR_DOOR_CLOSED and not v & REAR_DOOR_CLOSED:
                rear_open_at = t
            elif not prev & REAR_DOOR_CLOSED and v & REAR_DOOR_CLOSED and rear_open_at:
                rear.append((rear_open_at, t))
                rear_open_at = None
            if v & ROTOR_SWITCH and not prev & ROTOR_SWITCH:
                rotations.append(t)
            last_in = v
        elif m == 5:
            outs.append((t, d[0]))
        elif m == 32:
            mask = (d[2] & 1) | ((d[3] & 1) << 1)
            verifies.append({"t": t, "confirmed": d[0] == 0,
                             "door": {1: "front", 2: "back", 3: "both"}.get(mask)})
        elif m == 33:
            if last_e is not None:
                delta = tuple((a - b) & 0xFFFF for a, b in zip(d, last_e))
                energy.append((t,) + delta)
                if cur:
                    cur["wh"] += delta[0]
            last_e = d
        elif m == 0:
            starts.append({"t": t, "label": _chars(*d) if d[0] else ""})
        elif m == 253:
            release = _chars(*d)
        elif m == 254:
            oi = {"hw": "%d.%d" % (d[0], d[1]), "sw": "%d.%d" % (d[2], d[3])}
        elif m not in revent_log.MSG:
            unknown[m] += 1
    if cur:                                               # still baking at the file's end
        bakes.append(cur)
    if door_open_at:
        door.append((door_open_at, None))
    if rear_open_at:
        rear.append((rear_open_at, None))
    end = last or first
    relays = {name: _on_spans(outs, bit, end) for bit, name in DIGITAL_OUT.items()} if end else {}
    return {"first": first, "last": last, "records": len(events),
            "temps": dict(temps), "refs": dict(refs),
            "prover_rh": prover_rh, "prover_rh_ref": prover_rh_ref,
            "bakes": bakes, "alarms": alarms, "door": door, "rear_door": rear,
            "door_verify": verifies, "rotations": rotations, "modes": modes,
            "prover_modes": prover_modes, "relays": {k: v for k, v in relays.items() if v},
            "energy": energy, "starts": starts, "release": release, "oi": oi,
            "unknown": dict(unknown)}


# ── helpers ───────────────────────────────────────────────────────────────────

def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _rows(db: Session, oven_ids: Iterable[int], d1: date, d2: date) -> list[ReventOvenLog]:
    """The log files that may hold records of [d1, d2] (a file is one oven day;
    one day either side for records past midnight)."""
    return (db.query(ReventOvenLog)
            .filter(ReventOvenLog.oven_id.in_(list(oven_ids)),
                    ReventOvenLog.day >= d1 - timedelta(days=1),
                    ReventOvenLog.day <= d2 + timedelta(days=1))
            .order_by(ReventOvenLog.oven_id, ReventOvenLog.first_at).all())


def _clip(a: datetime, b: datetime, lo: datetime, hi: datetime) -> float:
    s, e = max(a, lo), min(b, hi)
    return max(0.0, (e - s).total_seconds())


def _mode_spans(modes: list[tuple], start: datetime, end: datetime) -> list[tuple]:
    """(start, end, mode) runs; the file opens in «off» (the app's rule) until
    its first mode record, and the last mode runs to `end`."""
    seq = [(start, "off")] + list(modes)
    out = []
    for i, (t, m) in enumerate(seq):
        nxt = seq[i + 1][0] if i + 1 < len(seq) else end
        if out and out[-1][2] == m:
            out[-1] = (out[-1][0], nxt, m)
        elif nxt > t:
            out.append((t, nxt, m))
    return out


def _bake_out(b: dict) -> dict:
    dur = (b["stop"] - b["start"]).total_seconds() if b.get("stop") else None
    return {"start": _iso(b["start"]), "stop": _iso(b.get("stop")),
            "minutes": round(dur / 60, 1) if dur is not None else None,
            "manual": b["manual"], "recipe": b["recipe"], "set_c": b["set_c"],
            "planned_min": round(b["planned_s"] / 60, 1) if b.get("planned_s") else None,
            "door_opened": b["door_opened"], "ended_by": b.get("ended_by"),
            "kwh": round(b["wh"] / 1000, 3) if b.get("wh") else None,
            "program": b.get("program")}


# ── the live board ────────────────────────────────────────────────────────────

# The status answer: 31 lines (oven), 38 (oven + prover, v1) or 39 (v2).
STATUS_FIELDS = {
    0: "bake_elapsed_s", 1: "bake_remaining_s", 2: "bake_total_s", 3: "oven_set_c", 4: "oven_c",
    5: "core1_set_c", 6: "core1_c", 7: "core2_set_c", 8: "core2_c",
    9: "damper_program", 10: "steam_program", 11: "temp_program", 12: "steam", 13: "damper",
    14: "door_open", 15: "rotor_limit_switch", 16: "steam_on", 17: "damper_open_pct",
    18: "status_text", 19: "status_subtext", 20: "energy_save", 21: "high_temp", 22: "low_temp",
    23: "heater_on", 24: "fault_motor", 25: "fault_heater", 26: "fault_overheat",
    27: "fault_temp_limit", 28: "fault_connection", 29: "core1_reached", 30: "core2_reached",
    31: "prover_set_c", 32: "prover_c", 33: "prover_set_rh", 34: "prover_rh",
}
PROVER_V1 = {35: "prover_fault_water_inlet", 36: "prover_fault_water_outlet", 37: "prover_status"}
PROVER_V2 = {35: "prover_fault_water", 36: "prover_fault_boiler", 37: "prover_fault_overheat",
             38: "prover_status"}
FAULT_FLAGS = ("fault_motor", "fault_heater", "fault_overheat", "fault_temp_limit", "fault_connection",
               "prover_fault_water_inlet", "prover_fault_water_outlet", "prover_fault_water",
               "prover_fault_boiler", "prover_fault_overheat")
STALE_S = 180                        # a status older than this is «not current»


def _num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _bool(v):
    return {"true": True, "false": False}.get((v or "").strip().lower())


def live(lines: Optional[list]) -> Optional[dict]:
    """The status lines as named values (numbers as numbers, flags as flags)."""
    if not lines:
        return None
    names = dict(STATUS_FIELDS)
    names.update(PROVER_V2 if len(lines) >= 39 else PROVER_V1 if len(lines) >= 38 else {})
    raw = {names.get(i, "line_%d" % i): v for i, v in enumerate(lines)}
    out = {"raw": raw, "has_prover": len(lines) >= 38}
    for k in ("bake_elapsed_s", "bake_total_s", "oven_set_c", "oven_c", "core1_set_c", "core1_c",
              "core2_set_c", "core2_c", "damper_open_pct", "prover_set_c", "prover_c",
              "prover_set_rh", "prover_rh"):
        out[k] = _num(raw.get(k))
    for k in ("core1_c", "core2_c", "prover_c"):
        if out.get(k) is not None and out[k] <= NO_PROBE * 10 + 1:
            out[k] = None                                   # «−246» = no probe
    for k in ("core1_set_c", "core2_set_c"):
        if not out.get(k):
            out[k] = None                                   # 0 = no core program
    for k in ("door_open", "rotor_limit_switch", "steam_on", "heater_on", "energy_save",
              "core1_reached", "core2_reached") + FAULT_FLAGS:
        out[k] = _bool(raw.get(k))
    out["status_text"] = (raw.get("status_text") or "").strip(" ,")
    out["prover_status"] = (raw.get("prover_status") or "").strip(" ,") if out["has_prover"] else None
    out["faults"] = [k for k in FAULT_FLAGS if out.get(k)]
    total, elapsed = out.get("bake_total_s"), out.get("bake_elapsed_s")
    out["baking"] = bool(total)
    out["bake_left_s"] = max(0.0, total - (elapsed or 0)) if total else None   # the app: line 2 − line 0
    return out


def board(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    ovens = (db.query(ReventOven).options(defer(ReventOven.settings))
             .order_by(ReventOven.position, ReventOven.id).all())
    out = []
    for o in ovens:
        age = (now - o.status_at).total_seconds() if o.status_at else None
        out.append({
            "id": o.id, "name": o.name, "ip": o.ip, "active": bool(o.active),
            "status": live(o.status), "status_at": _iso(o.status_at),
            "age_s": round(age) if age is not None else None,
            "stale": age is None or age > STALE_S,
            "tried_at": _iso(o.tried_at), "error": o.error, "collector": o.collector,
            "logs_at": _iso(o.logs_at),
        })
    return {"ovens": out, "stale_s": STALE_S, "now": _iso(now)}


# ── the period ────────────────────────────────────────────────────────────────

def _day_bounds(d: date) -> tuple[datetime, datetime]:
    lo = datetime.combine(d, time.min)
    return lo, lo + timedelta(days=1)


def analysis(db: Session, d1: date, d2: date, oven_ids: Optional[list[int]]) -> dict:
    ovens = db.query(ReventOven).options(defer(ReventOven.settings))
    if oven_ids:
        ovens = ovens.filter(ReventOven.id.in_(oven_ids))
    ovens = ovens.order_by(ReventOven.position, ReventOven.id).all()
    ids = [o.id for o in ovens]
    days = [d1 + timedelta(days=i) for i in range((d2 - d1).days + 1)]
    per: dict[tuple, dict] = {}
    bakes_out, alarms_out = [], []
    for row in _rows(db, ids, d1, d2) if ids else []:
        f = _facts(row)
        if not f["first"]:
            continue
        spans = _mode_spans(f["modes"], f["first"], f["last"])
        heat = f["relays"].get("heat", [])
        for d in days:
            lo, hi = _day_bounds(d)
            if f["last"] < lo or f["first"] >= hi:
                continue
            c = per.setdefault((row.oven_id, d), {
                "bakes": 0, "bakes_manual": 0, "bake_s": 0.0, "door_open": 0, "door_s": 0.0,
                "door_on_s": 0.0, "door_open_on": 0,
                "alarms": 0, "mode_s": defaultdict(float), "heat_s": 0.0, "logged_s": 0.0,
                "wh": 0, "set_c": defaultdict(int)})
            c["logged_s"] += _clip(f["first"], f["last"], lo, hi)
            for b in f["bakes"]:
                if lo <= b["start"] < hi:
                    c["bakes"] += 1
                    c["bakes_manual"] += 1 if b["manual"] else 0
                    end = b.get("stop") or f["last"]
                    c["bake_s"] += max(0.0, (end - b["start"]).total_seconds())
                    if b["set_c"] is not None:
                        c["set_c"][b["set_c"]] += 1
                    out = _bake_out(b)
                    out.pop("program", None)                 # the day view carries it
                    bakes_out.append({"oven_id": row.oven_id, **out})
            on_spans = [(a, z) for a, z, m in spans if m != "off"]
            for a, z in f["door"]:
                z = z or f["last"]
                if lo <= a < hi:
                    c["door_open"] += 1
                    if any(x <= a < y for x, y in on_spans):
                        c["door_open_on"] += 1
                c["door_s"] += _clip(a, z, lo, hi)
                c["door_on_s"] += sum(_clip(max(a, x), min(z, y), lo, hi) for x, y in on_spans
                                      if x < z and a < y)
            for al in f["alarms"]:
                if lo <= al["t"] < hi:
                    c["alarms"] += 1
                    alarms_out.append({"oven_id": row.oven_id, "t": _iso(al["t"]),
                                       "kind": al["kind"], "code": al["code"], "names": al["names"]})
            for a, z, m in spans:
                s = _clip(a, z, lo, hi)
                if s:
                    c["mode_s"][m] += s
            c["heat_s"] += sum(_clip(a, z, lo, hi) for a, z in heat)
            c["wh"] += sum(e[1] for e in f["energy"] if lo <= e[0] < hi)
    rows = []
    for o in ovens:
        for d in days:
            c = per.get((o.id, d))
            if not c:
                rows.append({"oven_id": o.id, "date": d.isoformat(), "logged": False})
                continue
            rows.append({
                "oven_id": o.id, "date": d.isoformat(), "logged": True,
                "logged_h": round(c["logged_s"] / 3600, 2),
                "bakes": c["bakes"], "bakes_manual": c["bakes_manual"],
                "bake_h": round(c["bake_s"] / 3600, 2),
                "door_open": c["door_open"], "door_min": round(c["door_s"] / 60, 1),
                "door_open_on": c["door_open_on"], "door_on_min": round(c["door_on_s"] / 60, 1),
                "alarms": c["alarms"], "heat_h": round(c["heat_s"] / 3600, 2),
                "kwh": round(c["wh"] / 1000, 2) if c["wh"] else None,
                "mode_h": {m: round(s / 3600, 2) for m, s in c["mode_s"].items()},
                "set_c": sorted(([t, n] for t, n in c["set_c"].items()), key=lambda x: -x[1])[:5],
            })
    bakes_out.sort(key=lambda b: b["start"], reverse=True)
    alarms_out.sort(key=lambda a: a["t"], reverse=True)
    return {
        "from": d1.isoformat(), "to": d2.isoformat(),
        "ovens": [{"id": o.id, "name": o.name, "active": bool(o.active),
                   "days_logged": sum(1 for d in days if (o.id, d) in per)} for o in ovens],
        "days": rows, "bakes": bakes_out[:3000], "bakes_total": len(bakes_out),
        "alarms": alarms_out[:2000], "modes": list(MODES),
    }


# ── one oven's day ────────────────────────────────────────────────────────────

def _thin(series: list, step_s: int = 60) -> list:
    """At most one point per `step_s` — the last of each step, so a change is
    never smoothed away."""
    out, slot = [], None
    for t, v in series:
        k = int(t.timestamp()) // step_s
        if k == slot:
            out[-1] = [_iso(t), v]
        else:
            out.append([_iso(t), v])
            slot = k
    return out


def _spans_in(spans: list, lo: datetime, hi: datetime, last: datetime) -> list:
    return [[_iso(max(a, lo)), _iso(min(z, hi) if z else None)]
            for a, z in spans if (z or last) >= lo and a < hi]


def day(db: Session, oven: ReventOven, d: date) -> dict:
    lo, hi = _day_bounds(d)
    temps, refs = defaultdict(list), defaultdict(list)
    rh, rh_ref = [], []
    bakes, alarms, door, rear, modes, pmodes = [], [], [], [], [], []
    relays = defaultdict(list)
    last = None
    for row in _rows(db, [oven.id], d, d):
        f = _facts(row)
        if not f["first"] or f["last"] < lo or f["first"] >= hi:
            continue
        last = max(last, f["last"]) if last else f["last"]
        for s, pts in f["temps"].items():
            temps[s].extend((t, v) for t, v in pts if lo <= t < hi)
        for s, pts in f["refs"].items():
            refs[s].extend((t, v) for t, v in pts if lo <= t < hi)
        rh += [(t, v) for t, v in f["prover_rh"] if lo <= t < hi]
        rh_ref += [(t, v) for t, v in f["prover_rh_ref"] if lo <= t < hi]
        bakes += [_bake_out(b) for b in f["bakes"] if lo <= b["start"] < hi]
        alarms += [{"t": _iso(a["t"]), "kind": a["kind"], "code": a["code"], "names": a["names"]}
                   for a in f["alarms"] if lo <= a["t"] < hi]
        door += _spans_in(f["door"], lo, hi, f["last"])
        rear += _spans_in(f["rear_door"], lo, hi, f["last"])
        for name, spans in f["relays"].items():
            relays[name] += _spans_in(spans, lo, hi, f["last"])
        modes += [[_iso(max(a, lo)), _iso(min(z, hi)), m]
                  for a, z, m in _mode_spans(f["modes"], f["first"], f["last"]) if z > lo and a < hi]
        if f["prover_modes"]:
            pmodes += [[_iso(max(a, lo)), _iso(min(z, hi)), m]
                       for a, z, m in _mode_spans(f["prover_modes"], f["first"], f["last"])
                       if z > lo and a < hi]
    return {
        "oven": {"id": oven.id, "name": oven.name}, "date": d.isoformat(),
        "last": _iso(last),
        "temps": {s: _thin(sorted(p)) for s, p in temps.items()
                  if any(v > NO_PROBE + 0.05 for _, v in p)},
        "refs": {s: [[_iso(t), v] for t, v in sorted(p)] for s, p in refs.items()},
        "prover_rh": _thin(sorted(rh)), "prover_rh_ref": [[_iso(t), v] for t, v in sorted(rh_ref)],
        "bakes": sorted(bakes, key=lambda b: b["start"]),
        "alarms": alarms, "door": door, "rear_door": rear, "modes": modes,
        "prover_modes": pmodes, "relays": dict(relays),
    }


# ── the oven about itself ─────────────────────────────────────────────────────

SECRET_SETTINGS = ("PASSWORD",)     # never shown: the oven keeps its passwords here
OVEN_MODEL = {1: "—", 2: "Other", 3: "ONE39", 4: "ONE26", 5: "ONE25", 6: "ONE24"}


def settings_table(xml: bytes) -> tuple[Optional[str], list[dict]]:
    """(the controller's version, every setting with the oven's own comment
    above it as its label)."""
    if not revent_ovens.plain_xml(xml):
        return None, []
    parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True))
    root = ET.fromstring(xml, parser=parser)
    out, section = [], None
    for g in root:
        if g.tag is ET.Comment:
            section = (g.text or "").strip()
            continue
        if g.tag != "group":
            continue
        label = None
        for ch in g:
            if ch.tag is ET.Comment:
                label = (ch.text or "").strip()
                continue
            if ch.tag != "setting":
                continue
            sid = ch.findtext("id") or ""
            value = ch.findtext("value")
            if any(s in sid for s in SECRET_SETTINGS) and ch.findtext("type") == "ST_STRING":
                value = "••••"
            out.append({"section": section, "group": g.findtext("id"), "id": sid,
                        "label": label, "type": ch.findtext("type"), "value": value,
                        "min": ch.findtext("min"), "max": ch.findtext("max")})
            label = None
    return root.get("version"), out


def service_counters(text: str) -> list[dict]:
    """ServiceData.txt — «id;value h» lines. The app stores them and names none."""
    out = []
    for line in (text or "").splitlines():
        k, _, v = line.partition(";")
        if k.strip().isdigit():
            out.append({"id": int(k), "hours": _num(v.replace("h", "").strip()), "raw": v.strip()})
    return out


def info(db: Session, oven: ReventOven) -> dict:
    xml = revent_ovens.settings_xml(oven)
    version, table = None, []
    if xml:
        try:
            version, table = settings_table(xml)
        except ET.ParseError:
            table = []
    pick = {r["id"]: r["value"] for r in table}
    release = oi = None
    starts = []
    for row in (db.query(ReventOvenLog).filter(ReventOvenLog.oven_id == oven.id)
                .order_by(ReventOvenLog.first_at.desc()).limit(7).all()):
        f = _facts(row)
        release = release or f["release"]
        oi = oi or f["oi"]
        starts += f["starts"]
    model = pick.get("MCPS_OVEN_MODEL")
    return {
        "oven": {"id": oven.id, "name": oven.name, "ip": oven.ip, "port": oven.port},
        "oven_name": pick.get("MCPS_OVEN_NAME"), "model_type": pick.get("MCPS_OVEN_MODEL_TYPE"),
        "model": OVEN_MODEL.get(int(model)) if (model or "").isdigit() else model,
        "serial": pick.get("MCPS_OVEN_SERIAL_NUMBER"), "mcp_version": version,
        "release": release, "oi": oi,
        "restarts": [{"t": _iso(s["t"]), "label": s["label"]} for s in
                     sorted(starts, key=lambda s: s["t"], reverse=True)[:20]],
        "settings": table, "settings_at": _iso(oven.settings_at),
        "service": service_counters(oven.service or ""), "service_at": _iso(oven.service_at),
    }
