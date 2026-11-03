#!/usr/bin/env python3
"""Read-only client for Revent rack ovens (the «MCP» controller's SOAP service).

Worked out from Revent Oven Manager 1.3.29 (2019) and 1.3.39 beta (2024) —
ReventOvenManager.exe (.NET) and its helper PCtoMCPinterface.exe (gSOAP). Both
versions speak the same interface:

    POST http://<oven-ip>:8080/MCPtoPCinterface.cgi      namespace urn:MCPtoPC

    exchangeStrings(["status"])  -> live status, one text line per field
    getLogs()                    -> the oven's binary log file(s), as DIME attachments
    getSettings()                -> the oven's settings XML, as a DIME attachment

The same service also takes putRecipe, putRecipeImage, putSettings, putAutostarts,
putSw (a FIRMWARE upload) and exchangeStrings(["delete", <recipe>]). This client
cannot send any of them: the three calls above are the only requests it can
build (OPERATIONS), and nothing else in this file writes to an oven.

Standard library only, Python 3.8+, so it runs on any factory PC.

    python3 revent_oven.py 192.168.0.100 --out oven1

writes oven1/ with the raw answers (status.txt, log files, settings XML,
the HTTP bodies as received) and summary.json, and prints a short summary.
"""
import argparse
import base64
import http.client
import json
import os
import re
import struct
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

PORT = 8080
PATH = "/MCPtoPCinterface.cgi"
TIMEOUT_S = 30

# ---------------------------------------------------------------------------
# SOAP
# ---------------------------------------------------------------------------

_ENV = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<SOAP-ENV:Envelope'
    ' xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"'
    ' xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"'
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
    ' xmlns:xsd="http://www.w3.org/2001/XMLSchema"'
    ' xmlns:ns="urn:MCPtoPC">'
    "<SOAP-ENV:Body>{body}</SOAP-ENV:Body></SOAP-ENV:Envelope>"
)

# The ONLY requests this client can make. Every one of them reads.
OPERATIONS = {
    "status": (
        '<ns:exchangeStrings><srcStrings xsi:type="SOAP-ENC:Array"'
        ' SOAP-ENC:arrayType="xsd:string[1]"><item>status</item></srcStrings>'
        "</ns:exchangeStrings>"
    ),
    "logs": "<ns:getLogs></ns:getLogs>",
    "settings": "<ns:getSettings></ns:getSettings>",
}


class OvenError(Exception):
    pass


def _post(host, op, port=PORT, timeout=TIMEOUT_S):
    """One request from OPERATIONS. Returns (http status, content-type, body bytes)."""
    if op not in OPERATIONS:
        raise OvenError("not a read-only operation: %r" % op)
    body = _ENV.format(body=OPERATIONS[op]).encode("utf-8")
    conn = http.client.HTTPConnection(host, port, timeout=timeout)
    try:
        conn.request("POST", PATH, body=body, headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": '""',
            "Connection": "close",
        })
        resp = conn.getresponse()
        return resp.status, resp.getheader("Content-Type", ""), resp.read()
    finally:
        conn.close()


def _local(tag):
    return tag.rsplit("}", 1)[-1]


def _soap_xml(content_type, body):
    """The SOAP envelope and, for a DIME answer, its attachments by id."""
    if "dime" in content_type.lower() or (body[:1] and body[0] >> 3 == 1 and body[0] & 0x04):
        recs = parse_dime(body)
        if not recs:
            raise OvenError("empty DIME message")
        return recs[0]["data"], {r["id"]: r for r in recs[1:]}
    return body, {}


def _fault(root):
    for el in root.iter():
        if _local(el.tag) == "Fault":
            text = " ".join(t.strip() for t in el.itertext() if t.strip())
            return text or "SOAP fault"
    return None


def _utf8(s):
    """The oven's gSOAP treats its UTF-8 strings as Latin-1 and encodes them again,
    so «Выпечка» arrives as «ÐÑÐ¿ÐµÑÐºÐ°». Undo that when it round-trips."""
    try:
        return s.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def _items(root, container):
    """<item> children of the first element named `container`."""
    for el in root.iter():
        if _local(el.tag) == container:
            return [c for c in el if _local(c.tag) == "item"]
    return []


def _attachment(item, atts):
    """(file name, bytes) of one Data item: a DIME href, or inline base64."""
    href = next((v for k, v in item.attrib.items() if _local(k) == "href"), None)
    if href:
        rec = atts.get(href[4:] if href.startswith("cid:") else href)
        if rec is None:
            raise OvenError("attachment %s missing from the DIME message" % href)
        name = next(iter(dime_options(rec["options"])), "") or rec["id"]
        return name, bytes(rec["data"])
    text = "".join(item.itertext()).strip()
    return "", base64.b64decode(text) if text else b""


def call(host, op, port=PORT, timeout=TIMEOUT_S):
    """Run one operation. Returns (decoded result, raw HTTP body)."""
    status, ctype, raw = _post(host, op, port, timeout)
    return decode_answer(op, raw, ctype, status), raw


def decode_answer(op, raw, ctype="", status=200):
    """An answer as the oven sent it (also one saved by probe.ps1) -> result."""
    xml, atts = _soap_xml(ctype, raw)
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        raise OvenError("HTTP %s, answer is not SOAP XML (%s)" % (status, e))
    fault = _fault(root)
    if fault or status != 200:
        raise OvenError("HTTP %s: %s" % (status, fault or "no SOAP fault given"))
    if op == "status":
        return [_utf8(("".join(i.itertext()))) for i in _items(root, "returnStrings")]
    files = [_attachment(i, atts) for i in _items(root, op)]
    if not files and atts:  # an envelope that names no items: keep what arrived
        files = [(next(iter(dime_options(r["options"])), "") or r["id"], bytes(r["data"]))
                 for r in atts.values()]
    return files


# ---------------------------------------------------------------------------
# DIME (Direct Internet Message Encapsulation) — how gSOAP sends files
# ---------------------------------------------------------------------------

def _pad4(n):
    return (n + 3) & ~3


def parse_dime(buf):
    """Records in order, chunked records joined: [{id, type, options, data}]."""
    out, pos, cur = [], 0, None
    while pos + 12 <= len(buf):
        b0 = buf[pos]
        if b0 >> 3 != 1:
            raise OvenError("not a DIME record at byte %d" % pos)
        me, cf = bool(b0 & 0x02), bool(b0 & 0x01)
        optlen, idlen, typelen = struct.unpack(">HHH", buf[pos + 2:pos + 8])
        datalen = struct.unpack(">I", buf[pos + 8:pos + 12])[0]
        pos += 12
        parts = []
        for n in (optlen, idlen, typelen, datalen):
            parts.append(buf[pos:pos + n])
            pos += _pad4(n)
        opts, rid, rtype, data = parts
        if cur is None:
            cur = {"id": rid.decode("utf-8", "replace"), "type": rtype.decode("utf-8", "replace"),
                   "options": bytes(opts), "data": bytearray()}
        cur["data"] += data
        if not cf:
            out.append(cur)
            cur = None
        if me:
            break
    return out


def dime_options(opts):
    """gSOAP puts the file name in the options: [type u16][length u16][text]..."""
    vals, pos = [], 0
    while pos + 4 <= len(opts):
        _t, n = struct.unpack(">HH", opts[pos:pos + 4])
        vals.append(opts[pos + 4:pos + 4 + n].decode("utf-8", "replace").strip("\0"))
        pos += 4 + n
    return vals


# ---------------------------------------------------------------------------
# The oven's binary log: 20-byte records, big-endian
#   [0:7]  year-1900, month-1, day, hour, minute, second, hundredths
#   [7:9]  message id
#   [9:17] four 16-bit data words
#   [17:20] reserved
# A recipe start is followed by 140 bytes of recipe name and 100 or 240 bytes
# of its program; a manual start by 40 bytes; a crash report by 140.
# ---------------------------------------------------------------------------

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
SENSOR = {0: "oven", 1: "core1", 2: "core2", 3: "prover"}
OVEN_FAULT = {
    0x1: "heater", 0x2: "motor", 0x4: "overheat", 0x8: "temp_limit", 0x10: "connection",
    0x20: "temp_sensor", 0x40: "heat_exchanger_pressure", 0x2000: "warning_heat_up",
    0x4000: "warning_cool_down", 0x8000: "warning_rotation",
}
DOOR_CLOSED = 0x80   # digital-in bit: set = front door closed
REAR_DOOR_CLOSED = 0x10


def _u24(b, i):
    return (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]


def _program(b, temps, dampers, steams):
    """The recipe program logged at its start (temperature / damper / steam steps)."""
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


def decode_log(buf):
    events, pos = [], 0
    while pos + 20 <= len(buf):
        r = buf[pos:pos + 20]
        pos += 20
        try:
            ts = datetime(1900 + r[0], r[1] + 1, r[2], r[3], r[4], r[5]).isoformat(sep=" ")
        except ValueError:
            ts = None
        mid = (r[7] << 8) | r[8]
        data = list(struct.unpack(">4H", r[9:17]))
        ev = {"t": ts, "id": mid, "msg": MSG.get(mid, "unknown_%d" % mid), "data": data}
        if mid in (9, 30):
            ev["recipe"] = bytes(buf[pos:pos + 140]).split(b"\0", 1)[0].decode("utf-8", "replace")
            pos += 140
            if mid == 9 and data[0] == 1:
                ev["program"] = _program(buf[pos:pos + 100], 4, 3, 3)
                pos += 100
            elif mid == 9 and data[0] == 2:
                ev["program"] = _program(buf[pos:pos + 240], 8, 8, 8)
                pos += 240
        elif mid == 10 and data[0] in (1, 2):
            ev["recipe"] = "Manual bake"
            ev["program"] = _program(buf[pos:pos + 40], 1, 1, 1)
            pos += 40
        elif mid == 255:
            pos += 140
        events.append(ev)
    return events


def summarize(events):
    """What the Oven Manager shows, from the decoded log."""
    bakes, alarms, cur, door_open, energy = [], [], None, 0, {"total": 0, "rotor": 0, "fan": 0, "heater": 0}
    last_in, last_e, unknown = None, None, {}
    for e in events:
        m, d = e["id"], e["data"]
        if m in (9, 10):
            cur = {"recipe": e.get("recipe", ""), "start": e["t"], "stop": None, "kwh": 0.0,
                   "program": e.get("program")}
        elif m == 13 and cur:
            cur["stop"] = e["t"]
            bakes.append(cur)
            cur = None
        elif m == 16:
            alarms.append({"t": e["t"], "code": d[0],
                           "faults": [n for b, n in OVEN_FAULT.items() if d[0] & b]})
        elif m == 6:
            if last_in is not None and last_in & DOOR_CLOSED and not d[0] & DOOR_CLOSED:
                door_open += 1
            last_in = d[0]
        elif m == 33:
            if last_e is not None:
                delta = [(a - b) & 0xFFFF for a, b in zip(d, last_e)]
                for k, v in zip(("total", "rotor", "fan", "heater"), delta):
                    energy[k] += v
                if cur:
                    cur["kwh"] += delta[0] / 1000
            last_e = d
        elif e["msg"].startswith("unknown"):
            unknown[m] = unknown.get(m, 0) + 1
    for b in bakes:
        try:
            secs = (datetime.fromisoformat(b["stop"]) - datetime.fromisoformat(b["start"])).total_seconds()
            b["minutes"] = round(secs / 60, 1)
        except (TypeError, ValueError):
            b["minutes"] = None
        b["kwh"] = round(b["kwh"], 3)
    times = [e["t"] for e in events if e["t"]]
    return {
        "records": len(events),
        "from": min(times) if times else None,
        "to": max(times) if times else None,
        "bakes": bakes,
        "alarms": alarms,
        "door_openings": door_open,
        "energy_kwh": {k: round(v / 1000, 3) for k, v in energy.items()},
        "unknown_message_ids": unknown,
    }


# ---------------------------------------------------------------------------
# Live status: 31 lines (oven) or 39 (oven + prover)
# ---------------------------------------------------------------------------

STATUS_FIELDS = {
    0: "bake_elapsed_s", 1: "bake_remaining_s", 2: "bake_total_s", 3: "oven_set_c", 4: "oven_c",
    5: "core1_set_c", 6: "core1_c", 7: "core2_set_c", 8: "core2_c",
    9: "damper_program", 10: "steam_program", 11: "temp_program", 12: "steam", 13: "damper",
    14: "door_open", 15: "rotor_limit_switch", 16: "steam_on", 17: "damper_open_pct",
    18: "status_text", 23: "heater_on", 24: "fault_motor", 25: "fault_heater",
    26: "fault_overheat", 27: "fault_temp_limit", 28: "fault_connection",
    31: "prover_set_c", 32: "prover_c", 33: "prover_set_rh", 34: "prover_rh", 37: "prover_status",
}


def label_status(lines):
    return {STATUS_FIELDS.get(i, "line_%d" % i): v for i, v in enumerate(lines)}


# ---------------------------------------------------------------------------
# CLI: one oven, everything saved for inspection
# ---------------------------------------------------------------------------

def _safe(name, fallback):
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(name or "")).strip("._")
    return name or fallback


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read one Revent oven (read-only).")
    ap.add_argument("ip", help="the oven's IP, or with --raw-dir a label for the report")
    ap.add_argument("--port", type=int, default=PORT)
    ap.add_argument("--out", default=None, help="folder for the answers (default: oven_<ip>)")
    ap.add_argument("--only", choices=sorted(OPERATIONS), action="append")
    ap.add_argument("--raw-dir", default=None,
                    help="decode raw_<op>.bin files saved by probe.ps1 instead of asking the oven")
    a = ap.parse_args(argv)
    out = a.out or "oven_" + a.ip.replace(":", "_")
    os.makedirs(out, exist_ok=True)
    report = {"ip": a.ip, "port": a.port, "at": datetime.now().isoformat(sep=" ", timespec="seconds")}
    ok = True
    for op in a.only or ["status", "settings", "logs"]:
        try:
            if a.raw_dir:
                with open(os.path.join(a.raw_dir, "raw_%s.bin" % op), "rb") as f:
                    raw = f.read()
                result = decode_answer(op, raw)
            else:
                result, raw = call(a.ip, op, a.port)
        except (OSError, OvenError, http.client.HTTPException, ET.ParseError) as e:
            ok = False
            report[op] = {"error": str(e)}
            print("%-8s FAILED: %s" % (op, e))
            continue
        with open(os.path.join(out, "raw_%s.bin" % op), "wb") as f:
            f.write(raw)
        if op == "status":
            with open(os.path.join(out, "status.txt"), "w", encoding="utf-8") as f:
                f.write("\n".join(result))
            report["status"] = label_status(result)
            print("status   %d lines — %s, oven %s °C (set %s)" % (
                len(result), report["status"].get("status_text", "?"),
                report["status"].get("oven_c", "?"), report["status"].get("oven_set_c", "?")))
            continue
        saved, decoded = [], []
        for i, (name, data) in enumerate(result):
            fn = _safe(name, "%s_%d.bin" % (op, i + 1))
            with open(os.path.join(out, fn), "wb") as f:
                f.write(data)
            saved.append({"file": fn, "bytes": len(data)})
            # getLogs also sends ServiceData.txt (running-hour counters, "id;value h")
            if op == "logs" and fn.lower().endswith(".log"):
                decoded.extend(decode_log(data))
        report[op] = {"files": saved}
        print("%-8s %d file(s), %d bytes" % (op, len(saved), sum(s["bytes"] for s in saved)))
        if op == "logs":
            report["log_summary"] = summarize(decoded)
            with open(os.path.join(out, "log_events.json"), "w", encoding="utf-8") as f:
                json.dump(decoded, f, ensure_ascii=False, indent=1)
            s = report["log_summary"]
            print("         %d records %s → %s, %d bakes, %d alarms, %d door openings, %.1f kWh" % (
                s["records"], s["from"], s["to"], len(s["bakes"]), len(s["alarms"]),
                s["door_openings"], s["energy_kwh"]["total"]))
    with open(os.path.join(out, "summary.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print("saved in %s" % os.path.abspath(out))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
