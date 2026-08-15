"""Static server over frontend/dist that misbehaves on the ENTRY chunk on purpose.

MODE=delay  DELAY=14 → the entry module is held for DELAY seconds, then served (slow link)
MODE=404               → the entry module 404s (stale hash after a redeploy)
MODE=drop              → the entry GET is cut mid-flight; HEAD still answers 200 (dropped connection)
Everything else (index.html, other chunks, logo, telegram-web-app.js) is served normally.
"""
import os, re, sys, time, http.server, socketserver

DIST = os.environ.get("DIST", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
MODE = os.environ.get("MODE", "delay")
DELAY = float(os.environ.get("DELAY", "14"))
PORT = int(os.environ.get("PORT", "8765"))
ENTRY = re.compile(r"^/assets/index-[^/]+\.js$")


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def log_message(self, fmt, *args):
        sys.stderr.write("[srv %6.2fs] %s %s\n" % (time.time() - T0, self.command, fmt % args))

    def translate_path(self, path):
        p = path.split("?", 1)[0].split("#", 1)[0]
        full = os.path.abspath(os.path.join(DIST, p.lstrip("/")))
        if p == "/" or not os.path.isfile(full):
            return os.path.join(DIST, "index.html")   # SPA fallback
        return full

    def do_GET(self):
        p = self.path.split("?", 1)[0]
        if ENTRY.match(p):
            if MODE == "404":
                self.send_error(404); return
            if MODE == "drop":
                # Start the response, then kill the socket mid-body.
                full = self.translate_path(p)
                data = open(full, "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data[:20000]); self.wfile.flush()
                self.connection.close(); return
            if MODE == "corrupt":
                full = self.translate_path(p)
                data = b"this is not javascript ((( " + open(full, "rb").read()
                self.send_response(200); self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(data))); self.end_headers()
                self.wfile.write(data); return
            if MODE == "delay":
                time.sleep(DELAY)
        if p.startswith("/api/"):
            self.send_response(404); self.send_header("Content-Type", "application/json")
            self.end_headers(); self.wfile.write(b'{"detail":"stub"}'); return
        return super().do_GET()

    def do_HEAD(self):
        p = self.path.split("?", 1)[0]
        if ENTRY.match(p) and MODE == "404":
            self.send_error(404); return
        return super().do_HEAD()


T0 = time.time()
socketserver.ThreadingTCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), H) as srv:
    sys.stderr.write(f"slowserve MODE={MODE} DELAY={DELAY} on http://127.0.0.1:{PORT}/\n")
    srv.serve_forever()
