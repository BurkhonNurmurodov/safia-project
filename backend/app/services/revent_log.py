"""THE decoder of a Revent oven's binary log and live status.

Worked out from Revent Oven Manager 1.3.29 / 1.3.39 (the decompiled .NET app
and its gSOAP helper) and checked against a real oven (192.168.0.100, a Revent
725 with a prover, 3 Nov 2026: 74,431 records, none unknown). The field probe
`tools/revent-oven/revent_oven.py` carries its own copy of the record layout so
it stays standard-library-only on any factory PC; THIS module is the one the
platform reads with. Change both together.

A log file is a run of 20-byte big-endian records:

    [0:7]   year-1900, month-1, day, hour, minute, second, hundredths
    [7:9]   message id
    [9:17]  four 16-bit data words
    [17:20] reserved

A recipe start is followed by 140 bytes of recipe name and 100 or 240 bytes of
its program; a manual start by 40 bytes of program; a crash report by 140.
Times are the oven's own clock, with no zone (the factory's wall clock).
"""
from __future__ import annotations

import struct
from datetime import datetime

MSG = {
    0: "start", 1: "stop", 2: "oven_off", 3: "oven_standby", 4: "oven_power_save",
    5: "digital_out", 6: "digital_in", 7: "analog_out", 8: "analog_in",
    9: "recipe_start", 10: "manual_start", 11: "reference_temp", 12: "baking_time",
    13: "baking_stopped", 14: "current_temp", 15: "fault", 16: "alarm", 17: "baking",
    18: "change_state", 19: "lapb_change_state", 20: "prover_off", 21: "prover_standby",
    22: "prover_time", 23: "prover_ref_temp", 24: "prover_curr_temp", 25: "prover_ref_rh",
    26: "prover_curr_rh", 27: "prover_alarm", 28: "prover_cooling", 29: "autostart_arm",
    30: "autostart_arm_recipe", 31: "autostart_disarm", 32: "door_verify",
    33: "energy_consumption", 252: "mem_status", 253: "release", 254: "oi_version",
    255: "crash_report",
}


def _u24(b, i):
    return (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]


def _program(b, temps, dampers, steams):
    """The program logged at a bake's start (temperature / damper / steam steps)."""
    prog = {"temp": [], "damper": [], "steam": []}
    for i in range(temps):
        s = b[i * 10:i * 10 + 10]
        if len(s) < 10 or not any(s):
            break
        prog["temp"].append({"duration_s": _u24(s, 0), "temp_c": ((s[3] << 8) | s[4]) / 10})
    base = temps * 10
    for i in range(dampers):
        s = b[base + i * 10:base + i * 10 + 10]
        if len(s) < 10 or not any(s):
            break
        prog["damper"].append({"start_s": _u24(s, 0), "duration_s": _u24(s, 3), "open_pct": s[6]})
    base = (temps + dampers) * 10
    for i in range(steams):
        s = b[base + i * 10:base + i * 10 + 10]
        if len(s) < 10 or not any(s):
            break
        prog["steam"].append({"start_s": _u24(s, 0), "spray_s": (s[3] << 8) | s[4],
                              "rest_s": (s[5] << 8) | s[6], "total_s": _u24(s, 7)})
    return prog


def decode(buf: bytes) -> list[dict]:
    """Every record of one log file, in order: {t: datetime|None, id, data[4],
    recipe?, program?}. A record whose clock does not parse keeps t=None."""
    out, pos, n = [], 0, len(buf)
    while pos + 20 <= n:
        r = buf[pos:pos + 20]
        pos += 20
        try:
            t = datetime(1900 + r[0], r[1] + 1, r[2], r[3], r[4], r[5], r[6] * 10000)
        except ValueError:
            t = None
        mid = (r[7] << 8) | r[8]
        ev = {"t": t, "id": mid, "data": struct.unpack(">4H", r[9:17])}
        d0 = ev["data"][0]
        if mid in (9, 30):
            ev["recipe"] = bytes(buf[pos:pos + 140]).split(b"\0", 1)[0].decode("utf-8", "replace")
            pos += 140
            if mid == 9 and d0 == 1:
                ev["program"] = _program(buf[pos:pos + 100], 4, 3, 3)
                pos += 100
            elif mid == 9 and d0 == 2:
                ev["program"] = _program(buf[pos:pos + 240], 8, 8, 8)
                pos += 240
        elif mid == 10 and d0 in (1, 2):
            ev["program"] = _program(buf[pos:pos + 40], 1, 1, 1)
            pos += 40
        elif mid == 255:
            pos += 140
        out.append(ev)
    return out


def span(buf: bytes):
    """(first, last) record time of a log file, or (None, None)."""
    times = [e["t"] for e in decode(buf) if e["t"]]
    return (min(times), max(times)) if times else (None, None)
