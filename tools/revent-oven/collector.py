#!/usr/bin/env python3
"""The oven COLLECTOR: reads the Revent ovens on the factory LAN and posts what
they say to Safia IMS («Pechlar», /ovens).

It asks the platform which ovens to read (`GET /api/ovens/collector/plan` —
the admin keeps that list on /panel/ovens), then, for each oven:

    every minute       the live status          → POST /api/ovens/collector/status
    every 10 minutes   the day logs             → POST /api/ovens/collector/file
                       (+ ServiceData.txt)        only what changed: a log that
                                                  grew sends just its new bytes
    every hour         OvenSettings.xml         → only when it changed

The paces come from the platform (plan["poll"]), so changing them is a deploy
there and nothing here.

READ-ONLY toward the ovens, by construction: every oven request goes through
revent_oven.call(), whose OPERATIONS list holds only status, getLogs and
getSettings. The oven service has no password and would accept writes; this
program cannot build one.

    python3 collector.py                       # runs until Ctrl+C
    python3 collector.py --once                # one full round, then exits
    python3 collector.py --server http://127.0.0.1:8000   # a local stack

The key is read from ~/.safia/oven-collector.key (one line, mode 600) or the
SAFIA_OVEN_KEY variable. Standard library only, Python 3.8+.
"""
import argparse
import base64
import hashlib
import http.client
import json
import logging
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import revent_oven  # noqa: E402  (the read-only client, same folder)

SERVER = "https://production.safiacorporate.uz"
KEY_FILE = os.path.expanduser("~/.safia/oven-collector.key")
OVEN_TIMEOUT_S = {"status": 10, "logs": 60, "settings": 30}
HTTP_TIMEOUT_S = 60
log = logging.getLogger("collector")


class Server:
    """The platform's collector door: JSON in, JSON out, one key."""

    def __init__(self, base, key):
        self.base = base.rstrip("/")
        self.key = key

    def _req(self, method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base + "/api/ovens/collector" + path, data=data,
                                     method=method, headers={
                                         "X-Oven-Key": self.key,
                                         "Content-Type": "application/json",
                                         "Accept": "application/json",
                                         "User-Agent": "safia-oven-collector/1",
                                     })
        try:
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_S) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                detail = json.loads(e.read() or b"{}").get("detail")
            except ValueError:
                detail = None
            return e.code, detail if isinstance(detail, dict) else {"message": str(detail or e)}

    def plan(self):
        return self._req("GET", "/plan")

    def status(self, readings):
        return self._req("POST", "/status", {"readings": readings})

    def file(self, oven_id, kind, name, whole, offset=0):
        chunk = whole[offset:]
        return self._req("POST", "/file", {
            "oven_id": oven_id, "kind": kind, "name": name, "offset": offset,
            "size": len(whole), "sha256": hashlib.sha256(whole).hexdigest(),
            "data": base64.b64encode(chunk).decode("ascii"),
        })


def _ask(oven, op):
    """One read-only call to one oven: (result, None) or (None, error text)."""
    try:
        result, _raw = revent_oven.call(oven["ip"], op, oven["port"], timeout=OVEN_TIMEOUT_S[op])
        return result, None
    except (OSError, revent_oven.OvenError, http.client.HTTPException, ET.ParseError) as e:
        return None, "%s: %s" % (type(e).__name__, e)


class Collector:
    def __init__(self, server, workers=6):
        self.server = server
        self.pool = ThreadPoolExecutor(max_workers=workers)
        self.plan = {"poll": {"status_s": 60, "logs_s": 600, "settings_s": 3600}, "ovens": []}
        self.last = {"logs": 0.0, "settings": 0.0}
        self.service_sha = {}           # oven id → sha of the ServiceData.txt last sent
        self.stop = threading.Event()

    # -- the plan ------------------------------------------------------------
    def refresh_plan(self):
        code, body = self.server.plan()
        if code == 200 and isinstance(body, dict) and "ovens" in body:
            self.plan = body
            return True
        log.warning("plan: HTTP %s %s", code, (body or {}).get("message", ""))
        return False

    # -- status --------------------------------------------------------------
    def round_status(self):
        ovens = self.plan.get("ovens") or []
        if not ovens:
            return
        answers = list(self.pool.map(lambda o: (o, _ask(o, "status")), ovens))
        readings = []
        for oven, (lines, err) in answers:
            readings.append({"oven_id": oven["id"], "lines": lines, "error": err})
            if err:
                log.warning("%s (%s) status: %s", oven["name"], oven["ip"], err)
        code, body = self.server.status(readings)
        ok = sum(1 for r in readings if not r["error"])
        log.info("status: %d/%d ovens answered, posted HTTP %s", ok, len(readings), code)

    # -- logs ----------------------------------------------------------------
    def _send_log(self, oven, name, data, kept):
        """Only what this side lacks: nothing, the new tail, or the whole file."""
        if kept and kept.get("size") == len(data) and kept.get("sha256") == hashlib.sha256(data).hexdigest():
            return "same"
        offset = 0
        if kept and 0 < kept.get("size", 0) < len(data):
            if hashlib.sha256(data[:kept["size"]]).hexdigest() == kept.get("sha256"):
                offset = kept["size"]
        code, body = self.server.file(oven["id"], "log", name, data, offset)
        if code == 409 and offset:
            code, body = self.server.file(oven["id"], "log", name, data, 0)
        if code != 200:
            log.warning("%s %s: HTTP %s %s", oven["name"], name, code, (body or {}).get("message", ""))
            return "failed"
        return "tail" if offset else "whole"

    def _oven_logs(self, oven):
        files, err = _ask(oven, "logs")
        if err:
            log.warning("%s (%s) logs: %s", oven["name"], oven["ip"], err)
            return
        kept = oven.get("logs") or {}
        done = {"same": 0, "tail": 0, "whole": 0, "failed": 0}
        for path, data in files:
            name = os.path.basename((path or "").replace("\\", "/"))   # the oven sends «./LogFiles/001794.log»
            if name.lower().endswith(".log"):
                done[self._send_log(oven, name, data, kept.get(name))] += 1
            elif name == "ServiceData.txt":
                sha = hashlib.sha256(data).hexdigest()
                if self.service_sha.get(oven["id"]) != sha:
                    code, _b = self.server.file(oven["id"], "service", name, data)
                    if code == 200:
                        self.service_sha[oven["id"]] = sha
        log.info("%s logs: %s", oven["name"], ", ".join("%s %d" % kv for kv in done.items() if kv[1]))

    def round_logs(self):
        list(self.pool.map(self._oven_logs, self.plan.get("ovens") or []))

    # -- settings ------------------------------------------------------------
    def _oven_settings(self, oven):
        files, err = _ask(oven, "settings")
        if err:
            log.warning("%s (%s) settings: %s", oven["name"], oven["ip"], err)
            return
        for name, data in files:
            if hashlib.sha256(data).hexdigest() == oven.get("settings_sha256"):
                return
            code, body = self.server.file(oven["id"], "settings", name or "OvenSettings.xml", data)
            log.info("%s settings sent: HTTP %s", oven["name"], code)
            return

    def round_settings(self):
        list(self.pool.map(self._oven_settings, self.plan.get("ovens") or []))

    # -- the loop ------------------------------------------------------------
    def once(self):
        self.refresh_plan()
        self.round_status()
        self.round_settings()
        self.round_logs()

    def run(self):
        while not self.stop.is_set():
            started = time.monotonic()
            try:
                self.refresh_plan()
                poll = self.plan.get("poll") or {}
                self.round_status()
                now = time.monotonic()
                if now - self.last["settings"] >= poll.get("settings_s", 3600):
                    self.round_settings()
                    self.last["settings"] = now
                if now - self.last["logs"] >= poll.get("logs_s", 600):
                    self.round_logs()
                    self.last["logs"] = now
            except Exception:                           # never let one round end the loop
                log.exception("round failed")
            wait = max(5.0, (self.plan.get("poll") or {}).get("status_s", 60) - (time.monotonic() - started))
            self.stop.wait(wait)


def _key(path):
    v = os.environ.get("SAFIA_OVEN_KEY", "").strip()
    if v:
        return v
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        sys.exit("No collector key: put it in %s (one line) or SAFIA_OVEN_KEY." % path)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read the Revent ovens and post to Safia IMS (read-only).")
    ap.add_argument("--server", default=SERVER)
    ap.add_argument("--key-file", default=KEY_FILE)
    ap.add_argument("--once", action="store_true", help="one full round, then exit")
    ap.add_argument("--log-file", default=None, help="also write the log to this file")
    a = ap.parse_args(argv)
    handlers = [logging.StreamHandler()]
    if a.log_file:
        handlers.append(logging.FileHandler(a.log_file, encoding="utf-8"))
    logging.basicConfig(level=logging.INFO, handlers=handlers,
                        format="%(asctime)s %(levelname)s %(message)s", datefmt="%H:%M:%S")
    c = Collector(Server(a.server, _key(a.key_file)))
    if not c.refresh_plan():
        sys.exit("The platform did not hand out the oven list — check --server and the key.")
    log.info("%d oven(s): %s", len(c.plan["ovens"]),
             ", ".join("%s %s" % (o["name"], o["ip"]) for o in c.plan["ovens"]) or "none yet")
    if a.once:
        c.once()
        return 0
    try:
        c.run()
    except KeyboardInterrupt:
        log.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
