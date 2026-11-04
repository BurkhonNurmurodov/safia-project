#!/usr/bin/env python3
"""A desk test for the oven board, with no oven and no production IMS.

Runs two small servers on this Mac, both reachable from the board over Wi-Fi:

  * a FAKE OVEN (default port 8080) answering the three read-only SOAP calls
    exactly as a Revent 725 did on 3 Nov 2026 (the saved raw answers), sending
    its files the way the oven does (DIME, 1 KB chunks). The newest day log
    GROWS by 10 records every --grow-every seconds, so the board's «send only
    the new bytes» path is exercised. Any other request is refused with a SOAP
    fault and printed loudly — the board must never send one.
  * a COLLECTOR-ONLY GATEWAY (default port 8061) to a local IMS backend: only
    /api/ovens/collector/* is passed on; everything else is 404, so the local
    IMS is not opened to the network.

    python3 test/desk_test.py --answers <dir with raw_*.bin, status.txt>

Point the board at it:  setup_board.py --server http://<this Mac's IP>:8061
and point a local IMS oven at the fake: ip = <this Mac's IP>, port 8080.
"""
import argparse
import os
import struct
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LOCK = threading.Lock()


def pad4(n):
    return (n + 3) & ~3


def parse_dime(buf):
    out, pos, cur = [], 0, None
    while pos + 12 <= len(buf):
        b0 = buf[pos]
        me, cf = bool(b0 & 2), bool(b0 & 1)
        ol, il, tl = struct.unpack(">HHH", buf[pos + 2:pos + 8])
        dl = struct.unpack(">I", buf[pos + 8:pos + 12])[0]
        pos += 12
        parts = []
        for n in (ol, il, tl, dl):
            parts.append(buf[pos:pos + n])
            pos += pad4(n)
        opts, rid, rtype, data = parts
        if cur is None:
            cur = {"opts": bytes(opts), "id": bytes(rid), "type": bytes(rtype), "data": bytearray()}
        cur["data"] += data
        if not cf:
            out.append(cur)
            cur = None
        if me:
            break
    return out


def dime_record(first, mb, me, cf, tnf, opts, rid, rtype, data):
    b0 = (1 << 3) | (4 if mb else 0) | (2 if me else 0) | (1 if cf else 0)
    b1 = (tnf << 4) if first else 0
    h = bytes([b0, b1]) + struct.pack(">HHHI", len(opts), len(rid), len(rtype), len(data))
    body = b""
    for f in (opts, rid, rtype, data):
        body += f + b"\0" * (pad4(len(f)) - len(f))
    return h + body


def build_dime(envelope, files, chunk=1024):
    """The oven's way: envelope record, then each file in 1 KB chunks."""
    out = dime_record(True, True, False, False, 2, b"", b"cid:id0",
                      b"http://schemas.xmlsoap.org/soap/envelope/", envelope)
    for i, (path, data) in enumerate(files):
        last = i == len(files) - 1
        name = path.encode()
        opts = struct.pack(">HH", 0, len(name)) + name
        pieces = [data[k:k + chunk] for k in range(0, len(data), chunk)] or [b""]
        for j, piece in enumerate(pieces):
            first = j == 0
            more = j < len(pieces) - 1
            out += dime_record(first, False, last and not more, more, 1 if first else 0,
                               opts if first else b"", ("id%d" % (i + 2)).encode() if first else b"",
                               b"xml" if first else b"", piece)
    return out


class Oven:
    def __init__(self, answers, grow_every):
        self.status = open(os.path.join(answers, "raw_status.bin"), "rb").read()
        self.settings = open(os.path.join(answers, "raw_settings.bin"), "rb").read()
        recs = parse_dime(open(os.path.join(answers, "raw_logs.bin"), "rb").read())
        self.envelope = bytes(recs[0]["data"])
        self.files = []
        for r in recs[1:]:
            opts = r["opts"]
            n = struct.unpack(">H", opts[2:4])[0]
            self.files.append([opts[4:4 + n].decode(), bytearray(r["data"])])
        self.grow_every = grow_every
        self.started = time.time()
        self.grown = 0

    def logs(self):
        with LOCK:
            if self.grow_every:
                want = int((time.time() - self.started) // self.grow_every)
                newest = [f for f in self.files if f[0].endswith(".log")][-1]
                while self.grown < want:
                    newest[1] += newest[1][-200:]   # 10 more 20-byte records
                    self.grown += 1
            return build_dime(self.envelope, [(p, bytes(d)) for p, d in self.files])


def oven_handler(oven):
    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n).decode("utf-8", "replace")
            if "<ns:getLogs>" in body:
                op, ctype, data = "logs", "application/dime", oven.logs()
            elif "<ns:getSettings>" in body:
                op, ctype, data = "settings", "application/dime", oven.settings
            elif "<item>status</item>" in body and "exchangeStrings" in body:
                op, ctype, data = "status", "text/xml; charset=utf-8", oven.status
            else:
                print("!!! FAKE OVEN: a request that is not one of the three reads:\n" + body[:2000], flush=True)
                data = (b'<?xml version="1.0"?><SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">'
                        b"<SOAP-ENV:Body><SOAP-ENV:Fault><faultstring>refused by the desk test</faultstring>"
                        b"</SOAP-ENV:Fault></SOAP-ENV:Body></SOAP-ENV:Envelope>")
                self.send_response(500)
                self.send_header("Content-Type", "text/xml")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            print("oven  %-8s %8d bytes → %s" % (op, len(data), self.client_address[0]), flush=True)

        def log_message(self, *a):
            pass

    return H


def gateway_handler(backend):
    class H(BaseHTTPRequestHandler):
        def _pass(self, method):
            if not self.path.startswith("/api/ovens/collector/"):
                self.send_error(404)
                return
            n = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(n) if n else None
            hdrs = {k: v for k, v in self.headers.items()
                    if k.lower() in ("x-oven-key", "authorization", "content-type", "user-agent", "accept")}
            req = urllib.request.Request(backend + self.path, data=body, method=method, headers=hdrs)
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    code, data, ctype = r.status, r.read(), r.headers.get("Content-Type", "application/json")
            except urllib.error.HTTPError as e:
                code, data, ctype = e.code, e.read(), e.headers.get("Content-Type", "application/json")
            except OSError as e:
                code, data, ctype = 502, str(e).encode(), "text/plain"
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            path = self.path.split("&sha256=")[0]
            print("ims   %s %-70s %7d bytes in → HTTP %d %s" % (method, path[:70], n, code,
                  data[:120].decode("utf-8", "replace") if code != 200 else ""), flush=True)

        def do_GET(self):
            self._pass("GET")

        def do_POST(self):
            self._pass("POST")

        def log_message(self, *a):
            pass

    return H


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--answers", required=True)
    ap.add_argument("--backend", default="http://127.0.0.1:8002")
    ap.add_argument("--oven-port", type=int, default=8080)
    ap.add_argument("--gateway-port", type=int, default=8061)
    ap.add_argument("--grow-every", type=int, default=60)
    a = ap.parse_args()
    oven = Oven(a.answers, a.grow_every)
    s1 = ThreadingHTTPServer(("0.0.0.0", a.oven_port), oven_handler(oven))
    s2 = ThreadingHTTPServer(("0.0.0.0", a.gateway_port), gateway_handler(a.backend.rstrip("/")))
    threading.Thread(target=s1.serve_forever, daemon=True).start()
    print("fake oven on :%d (%d files, newest grows every %ds); gateway :%d → %s (collector paths only)"
          % (a.oven_port, len(oven.files), a.grow_every, a.gateway_port, a.backend), flush=True)
    try:
        s2.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
