"""One port, no root: the process that owns 127.0.0.1:8030 never goes away.

Why this exists (2026-10-18). Every backend deploy restarted the single
uvicorn process, and so did every crash — and until the new process had
finished its ~60–120 s of startup work nothing listened on 8030, nginx
answered 502 and Cloudflare showed its «Bad gateway» page to everybody in
Telegram and in a browser alike. The blue-green fix (two copies on 8030/8031
behind an nginx fallback, deploy/03-bluegreen-setup.sh) needs a root step and
a second port, and IT declined both. So the fix moved INSIDE our process,
where nobody's cooperation is needed:

  systemd ──► uvicorn app.main:app …        (the unit file, unchanged)
                 │  app/main.py's first lines see INVOCATION_ID (systemd) and
                 │  os.execv() the process into `python -m app.supervisor` —
                 │  same PID, so systemd still owns it (maybe_exec_supervisor).
                 ▼
             SUPERVISOR  ── owns the listening socket, never closes it
                 ├─ worker gen N  (python -m app.supervisor --worker --fd 3)
                 │     the real server: uvicorn.Server.run(sockets=[fd 3]);
                 │     app.main's lifespan ends with signal_ready() → the pipe
                 ├─ worker gen N+1 on SIGHUP: starts on the NEW code, and only
                 │     once it is READY the old one is retired (SIGTERM, which
                 │     uvicorn takes as "finish the open requests, then exit")
                 └─ the FALLBACK: while no worker is ready (a boot after a
                       crash, or a swap done stop-then-start for want of
                       memory) the supervisor accepts the connections itself —
                       page files from frontend/dist, a JSON 503 marked
                       `X-Safia-Restarting: 1` on API paths — which the app
                       waits out behind «Server yangilanmoqda»
                       (frontend/src/utils/serverRestart.js). Never a 502.

Connections queue in the kernel on a socket that is never closed, so nginx
never again gets "connection refused". A deploy is `kill -HUP <MainPID>` from
deploy/deploy.sh — the same user, no sudo — and the status file under
backend/data/supervisor/ tells the deploy whether the swap landed.

The supervisor is deliberately TINY (stdlib only, no app import, ~25 MB): it
is the unit's main process, and a bug in it is the outage it exists to
prevent. Everything about the app lives in the worker. What the supervisor
records about a worker's death — the signal, the host's free memory and the
worker's own size at that moment, how long it lived — is what the next
worker's boot report (services/boot_report.py) tells the support chat, so a
restart nobody deployed explains itself without anybody's logs.

Opt-out: `SAFIA_SUPERVISE=0` in backend/.env and a `systemctl restart` give
back the plain uvicorn process. Outside systemd nothing happens unless
`SAFIA_SUPERVISE=1` is set — a laptop, a cloud session and `--reload` run
uvicorn exactly as before.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import select
import signal
import socket
import subprocess
import sys
import threading
import time
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import formatdate
from typing import Optional
from urllib.parse import unquote

# backend/app/supervisor.py → backend/ → repo root
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)
DIST_DIR = os.path.realpath(os.path.join(REPO_ROOT, "frontend", "dist"))
ENV_FILE = os.path.join(BACKEND_DIR, ".env")
DATA_DIR = os.path.join(BACKEND_DIR, "data", "supervisor")
STATUS_FILE = os.path.join(DATA_DIR, "status.json")
EVENTS_FILE = os.path.join(DATA_DIR, "events.jsonl")
PID_FILE = os.path.join(DATA_DIR, "supervisor.pid")

APP_SPEC = "app.main:app"
# A worker that has not said "ready" by then is given up on (killed, retried).
READY_TIMEOUT_S = 600
# A retired worker finishes its open requests; past this it is killed. Under
# the unit's TimeoutStopSec (90 s), so systemd never has to.
STOP_GRACE_S = 60
# Deaths inside this many seconds of becoming ready count toward the backoff.
QUICK_DEATH_S = 90
BACKOFF_S = (0, 5, 10, 20, 40, 60)
RSS_SAMPLE_S = 10
# Room needed for a second worker during an overlapping swap: the live one's
# RSS plus this margin. Short of it, the swap is stop-then-start behind the
# fallback — a boot-long «Server yangilanmoqda», never a 502, never the
# OOM killer invited onto a box that already swaps.
OVERLAP_MARGIN_KB = 200 * 1024
EVENTS_ROTATE_BYTES = 2 * 1024 * 1024
HEAD_MAX = 64 * 1024
BODY_DRAIN_MAX = 8 * 1024 * 1024


# ── the two hooks app.main calls ─────────────────────────────────────────────

def maybe_exec_supervisor() -> None:
    """Called first thing in app/main.py. Under systemd, the uvicorn CLI that
    imported us becomes the supervisor (same PID). A no-op for the worker, for
    `--reload`, for a socket already handed in (`--fd`/`--uds`), for another
    app spec, and anywhere outside systemd unless SAFIA_SUPERVISE=1."""
    env = os.environ
    if env.get("SAFIA_WORKER") == "1":
        return
    mode = (env.get("SAFIA_SUPERVISE") or "").strip()
    if mode == "0":
        return
    if mode != "1" and not env.get("INVOCATION_ID"):
        return
    argv0 = sys.argv[0] or ""
    if os.path.basename(argv0) != "uvicorn" and not argv0.endswith(os.path.join("uvicorn", "__main__.py")):
        return
    args = sys.argv[1:]
    if APP_SPEC not in args:
        return
    for a in args:
        if a == "--reload" or a.startswith("--reload") or a in ("--fd", "--uds") or a.startswith(("--fd=", "--uds=")):
            return
    sys.stdout.flush()
    sys.stderr.flush()
    try:
        os.execv(sys.executable, [sys.executable, "-m", "app.supervisor", *args])
    except OSError as exc:  # pragma: no cover — exec failing is a broken venv
        print(f"[supervisor] could not take over the process ({exc}); running plain uvicorn",
              file=sys.stderr, flush=True)


def signal_ready() -> None:
    """Called at the END of app.main's lifespan startup: the worker is ready to
    take the socket's connections. Writes one line down the pipe the supervisor
    handed it and forgets the fd, so a second call can never hit a reused
    descriptor. A no-op when no supervisor is listening."""
    raw = os.environ.pop("SAFIA_READY_FD", None)
    if not raw:
        return
    try:
        fd = int(raw)
        os.write(fd, b"ready\n")
        os.close(fd)
    except (OSError, ValueError):
        pass


def supervised() -> bool:
    return os.environ.get("SAFIA_WORKER") == "1"


def worker_gen() -> int:
    try:
        return int(os.environ.get("SAFIA_WORKER_GEN") or 0)
    except ValueError:
        return 0


# ── small helpers ────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _log(msg: str) -> None:
    print(f"[supervisor {datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def read_env_file(path: str = ENV_FILE) -> dict[str, str]:
    """backend/.env the way systemd's EnvironmentFile reads it (KEY=value, # comments,
    optional quotes). Laid over the environment at every worker spawn, so a key
    written to .env after the unit started (deploy/sync-env.sh, startup's own
    writers) reaches the next worker without a `systemctl restart`."""
    out: dict[str, str] = {}
    try:
        with open(path, "r", encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith(("#", ";")) or "=" not in line:
                    continue
                if line.startswith("export "):
                    line = line[7:].lstrip()
                key, _, value = line.partition("=")
                key = key.strip()
                if not key or not all(ch.isalnum() or ch == "_" for ch in key):
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                out[key] = value
    except OSError:
        return {}
    return out


def meminfo() -> dict:
    out: dict = {}
    try:
        with open("/proc/meminfo", "r", encoding="ascii") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                if key in ("MemTotal", "MemAvailable", "SwapTotal", "SwapFree"):
                    out[key] = int(rest.split()[0])          # kB
    except (OSError, ValueError, IndexError):
        pass
    if "SwapTotal" in out and "SwapFree" in out:
        out["SwapUsed"] = out["SwapTotal"] - out["SwapFree"]
    try:
        with open("/proc/loadavg", "r", encoding="ascii") as fh:
            out["load1"] = float(fh.read().split()[0])
    except (OSError, ValueError, IndexError):
        pass
    return out


def rss_kb(pid: int) -> Optional[int]:
    try:
        with open(f"/proc/{pid}/status", "r", encoding="ascii") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1])
    except (OSError, ValueError, IndexError):
        return None
    return None


def exit_info(rc: Optional[int]) -> dict:
    """A Popen returncode as facts: {"exit_code": n} or {"signal": n, "signal_name": "SIGKILL"}."""
    if rc is None:
        return {}
    if rc < 0:
        num = -rc
        try:
            name = signal.Signals(num).name
        except ValueError:
            name = f"signal {num}"
        return {"signal": num, "signal_name": name}
    return {"exit_code": rc}


def _commit() -> Optional[str]:
    try:
        from app.version import current_commit   # light: os, re, datetime
        return current_commit()
    except Exception:  # noqa: BLE001
        return None


def _version() -> str:
    try:
        from app.version import APP_VERSION
        return APP_VERSION
    except Exception:  # noqa: BLE001
        return "?"


# ── the fallback: answering while no worker is ready ─────────────────────────

_SPA_ADMIN = ("/admin", "/admin/upload")


def backend_only(path: str) -> bool:
    """Paths only the app can answer (nginx's $safia_backend_only map, kept in
    step by hand): a JSON 503 there, never index.html — the app reads an HTML
    body on /api as the hosting anti-bot page."""
    if path == "/admin" or path.rstrip("/") in _SPA_ADMIN:
        return False
    return path == "/api" or path.startswith(("/api/", "/admin/", "/bot/", "/health", "/docs", "/openapi.json"))


_TEXT_TYPES = {
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
    ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
    ".txt": "text/plain", ".xml": "application/xml", ".map": "application/json",
}


def _content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    ctype = _TEXT_TYPES.get(ext) or mimetypes.guess_type(path)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/json", "application/manifest+json",
                                              "image/svg+xml", "application/xml"):
        ctype += "; charset=utf-8"
    return ctype


class Fallback:
    """Accepts on the SHARED listening socket only while `active`, in a thread,
    and answers each connection from a small pool: the page files for a page
    path, a marked JSON 503 for a backend path. `Connection: close` on every
    answer — nginx opens a connection per request anyway. The listening socket
    is non-blocking (asyncio in the worker wants that too; the flag is on the
    shared file description, so NEVER call setblocking(True) on it here)."""

    def __init__(self, sock: socket.socket) -> None:
        self.sock = sock
        self.active = False
        self.since: Optional[float] = None
        self.since_iso: Optional[str] = None
        self.served = 0            # all time
        self.served_round = 0      # since the last start()
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start(self) -> None:
        with self._lock:
            if self.active:
                return
            self.active = True
            self.since = time.monotonic()
            self.since_iso = _now_iso()
            self.served_round = 0
            self._thread = threading.Thread(target=self._loop, name="fallback-accept", daemon=True)
            self._thread.start()
        _log("fallback: answering for the app while no worker is ready")

    def stop(self) -> tuple[float, int]:
        """Stops accepting. Returns (seconds it ran, requests it served) for the record."""
        with self._lock:
            if not self.active:
                return 0.0, 0
            self.active = False
            ran = time.monotonic() - (self.since or time.monotonic())
            served = self.served_round
            self.since = None
            self.since_iso = None
        _log(f"fallback: stopped after {ran:.0f}s, {served} request(s) answered")
        return ran, served

    def _loop(self) -> None:
        pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="fallback")
        try:
            while self.active:
                try:
                    readable, _, _ = select.select([self.sock], [], [], 0.25)
                except (OSError, ValueError):
                    break
                if not readable or not self.active:
                    continue
                try:
                    conn, _ = self.sock.accept()
                except (BlockingIOError, InterruptedError):
                    continue
                except OSError as exc:
                    _log(f"fallback: accept failed: {exc}")
                    time.sleep(0.1)
                    continue
                self.served += 1
                self.served_round += 1
                pool.submit(self._handle, conn)
        finally:
            pool.shutdown(wait=False)

    # -- one connection ------------------------------------------------------

    def _handle(self, conn: socket.socket) -> None:
        try:
            conn.settimeout(10)
            head, rest = self._read_head(conn)
            if head is None:
                return
            method, target, headers = self._parse(head)
            if method is None:
                self._respond(conn, 400, "Bad Request", {"Content-Type": "text/plain; charset=utf-8"},
                              b"bad request\n", head_only=False)
                return
            self._drain_body(conn, headers, rest)
            path = unquote(target.split("?", 1)[0].split("#", 1)[0]) or "/"
            head_only = method == "HEAD"
            if backend_only(path):
                body = json.dumps({"detail": "The server is restarting — try again in a few seconds.",
                                   "restarting": True}).encode("utf-8")
                self._respond(conn, 503, "Service Unavailable",
                              {"Content-Type": "application/json; charset=utf-8", "Retry-After": "5"},
                              body, head_only)
                return
            served = self._file(path)
            if served is None:
                served = self._file("/index.html")
            if served is None:
                self._respond(conn, 503, "Service Unavailable",
                              {"Content-Type": "text/plain; charset=utf-8", "Retry-After": "5"},
                              b"The server is restarting.\n", head_only)
                return
            body, ctype, cache = served
            self._respond(conn, 200, "OK", {"Content-Type": ctype, "Cache-Control": cache}, body, head_only)
        except (OSError, ValueError):
            pass
        except Exception:  # noqa: BLE001 — a fallback that raises serves nobody
            traceback.print_exc()
        finally:
            try:
                conn.close()
            except OSError:
                pass

    @staticmethod
    def _read_head(conn: socket.socket) -> tuple[Optional[bytes], bytes]:
        buf = b""
        while True:
            try:
                chunk = conn.recv(65536)
            except socket.timeout:
                return None, b""
            if not chunk:
                return None, b""
            buf += chunk
            end = buf.find(b"\r\n\r\n")
            if end >= 0:
                return buf[:end + 4], buf[end + 4:]
            if len(buf) > HEAD_MAX:
                return None, b""

    @staticmethod
    def _parse(head: bytes) -> tuple[Optional[str], str, dict[str, str]]:
        try:
            text = head.decode("latin-1")
            lines = text.split("\r\n")
            parts = lines[0].split(" ")
            if len(parts) != 3 or not parts[2].startswith("HTTP/"):
                return None, "", {}
            headers: dict[str, str] = {}
            for line in lines[1:]:
                if not line:
                    continue
                name, _, value = line.partition(":")
                headers[name.strip().lower()] = value.strip()
            return parts[0].upper(), parts[1], headers
        except Exception:  # noqa: BLE001
            return None, "", {}

    @staticmethod
    def _drain_body(conn: socket.socket, headers: dict[str, str], already: bytes) -> None:
        """Read the request body so nginx (proxy_request_buffering off) never
        sees us close while it is still sending — that would be its 502."""
        try:
            if "chunked" in headers.get("transfer-encoding", "").lower():
                total = len(already)
                deadline = time.monotonic() + 10
                while total < BODY_DRAIN_MAX and time.monotonic() < deadline:
                    chunk = conn.recv(65536)
                    if not chunk:
                        break
                    total += len(chunk)
                    if chunk.endswith(b"0\r\n\r\n"):
                        break
                return
            length = int(headers.get("content-length") or 0)
            remaining = length - len(already)
            if remaining <= 0 or length > BODY_DRAIN_MAX:
                return
            while remaining > 0:
                chunk = conn.recv(min(65536, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
        except (OSError, ValueError):
            return

    @staticmethod
    def _file(path: str) -> Optional[tuple[bytes, str, str]]:
        rel = path.lstrip("/")
        if not rel:
            return None
        full = os.path.realpath(os.path.join(DIST_DIR, rel))
        if not full.startswith(DIST_DIR + os.sep) or not os.path.isfile(full):
            return None
        try:
            with open(full, "rb") as fh:
                body = fh.read()
        except OSError:
            return None
        cache = "public, max-age=31536000, immutable" if rel.startswith("assets/") else "no-store"
        return body, _content_type(full), cache

    @staticmethod
    def _respond(conn: socket.socket, status: int, reason: str, headers: dict[str, str],
                 body: bytes, head_only: bool) -> None:
        lines = [f"HTTP/1.1 {status} {reason}",
                 f"Date: {formatdate(usegmt=True)}",
                 "Server: safia-supervisor",
                 "Connection: close",
                 "X-Safia-Restarting: 1",
                 f"Content-Length: {len(body)}"]
        lines += [f"{k}: {v}" for k, v in headers.items()]
        data = ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1")
        if not head_only:
            data += body
        conn.sendall(data)


# ── the supervisor ───────────────────────────────────────────────────────────

class Worker:
    def __init__(self, proc: subprocess.Popen, gen: int, reason: str, ready_r: int, commit: Optional[str]) -> None:
        self.proc = proc
        self.gen = gen
        self.reason = reason            # start · reload · crash · retry
        self.ready_r: Optional[int] = ready_r
        self.commit = commit
        self.started = time.monotonic()
        self.started_at = _now_iso()
        self.ready: Optional[float] = None
        self.ready_at: Optional[str] = None
        self.stop_sent: Optional[float] = None
        self.rss_kb: Optional[int] = None
        self.rss_sampled = 0.0

    @property
    def pid(self) -> int:
        return self.proc.pid

    def facts(self) -> dict:
        return {"pid": self.pid, "gen": self.gen, "reason": self.reason, "commit": self.commit,
                "started_at": self.started_at, "ready_at": self.ready_at, "rss_kb": self.rss_kb}


class Supervisor:
    def __init__(self, ns: argparse.Namespace) -> None:
        self.ns = ns
        self.sock = self._bind(ns.host, ns.port, ns.backlog)
        self.fallback = Fallback(self.sock)
        self.worker: Optional[Worker] = None        # the one serving
        self.booting: Optional[Worker] = None       # not yet ready
        self.retiring: list[Worker] = []            # told to stop, not yet gone
        self.stopping = False
        self.stop_began = 0.0
        self.gen = 0
        self.seq = 0
        self.deaths = 0
        self.quick_deaths = 0
        self.pending_reason: Optional[str] = None
        self.spawn_not_before = 0.0
        self.last_swap: Optional[dict] = None
        self.started_at = _now_iso()
        self.status_dirty = True
        self.status_written = 0.0
        self.signals: list[int] = []
        self.wake_r, self.wake_w = os.pipe()
        os.set_blocking(self.wake_r, False)
        os.set_blocking(self.wake_w, False)
        os.makedirs(DATA_DIR, exist_ok=True)
        self._load_seq()

    # -- setup ---------------------------------------------------------------

    @staticmethod
    def _bind(host: str, port: int, backlog: int) -> socket.socket:
        family = socket.AF_INET
        try:
            family = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)[0][0]
        except (socket.gaierror, IndexError):
            pass
        sock = socket.socket(family, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        sock.listen(backlog)
        sock.setblocking(False)
        sock.set_inheritable(True)
        return sock

    def _load_seq(self) -> None:
        """Event numbers keep climbing across supervisor restarts: the boot
        report's cursor is a seq, and a restart that began again at 1 would
        hide every event under an old cursor."""
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as fh:
                self.seq = int(json.load(fh).get("seq") or 0)
        except (OSError, ValueError, TypeError):
            self.seq = 0

    def _install_signals(self) -> None:
        for sig in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT, signal.SIGCHLD, signal.SIGUSR1):
            signal.signal(sig, self._on_signal)

    def _on_signal(self, signum: int, _frame) -> None:
        self.signals.append(signum)
        try:
            os.write(self.wake_w, b"x")
        except OSError:
            pass

    # -- records -------------------------------------------------------------

    def _event(self, kind: str, **fields) -> None:
        self.seq += 1
        rec = {"seq": self.seq, "t": _now_iso(), "kind": kind, **fields}
        line = json.dumps(rec, ensure_ascii=False, default=str)
        try:
            try:
                if os.path.getsize(EVENTS_FILE) > EVENTS_ROTATE_BYTES:
                    os.replace(EVENTS_FILE, EVENTS_FILE + ".1")
            except OSError:
                pass
            with open(EVENTS_FILE, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError as exc:
            _log(f"could not write the event record: {exc}")
        self.status_dirty = True
        _log(f"{kind}: " + ", ".join(f"{k}={v}" for k, v in fields.items() if k != "mem"))

    def _state(self) -> str:
        if self.stopping:
            return "stopping"
        if self.worker and self.booting:
            return "swapping"
        if self.worker:
            return "ready"
        if self.booting:
            return "starting"
        return "fallback"

    def _write_status(self, force: bool = False) -> None:
        now = time.monotonic()
        if not force and not self.status_dirty and now - self.status_written < 30:
            return
        status = {
            "pid": os.getpid(), "host": self.ns.host, "port": self.ns.port,
            "version": _version(), "started_at": self.started_at, "updated_at": _now_iso(),
            "state": self._state(), "seq": self.seq, "deaths": self.deaths,
            "worker": self.worker.facts() if self.worker else None,
            "booting": self.booting.facts() if self.booting else None,
            "retiring": [w.pid for w in self.retiring],
            "last_swap": self.last_swap,
            "fallback": {"active": self.fallback.active, "since": self.fallback.since_iso,
                         "served": self.fallback.served, "served_now": self.fallback.served_round},
            "mem": meminfo(),
        }
        tmp = STATUS_FILE + ".tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(status, fh, ensure_ascii=False, indent=1, default=str)
            os.replace(tmp, STATUS_FILE)
        except OSError as exc:
            _log(f"could not write the status file: {exc}")
        self.status_dirty = False
        self.status_written = now

    # -- the loop ------------------------------------------------------------

    def run(self) -> int:
        self._install_signals()
        try:
            with open(PID_FILE, "w", encoding="ascii") as fh:
                fh.write(str(os.getpid()))
        except OSError:
            pass
        _log(f"pid {os.getpid()} holds {self.ns.host}:{self.ns.port} (v{_version()}, commit {_commit()})")
        self._event("supervisor_started", pid=os.getpid(), version=_version(), commit=_commit(),
                    unit_start=bool(os.environ.get("INVOCATION_ID")))
        self.fallback.start()
        self._spawn("start")
        while True:
            watch = [self.wake_r]
            if self.booting and self.booting.ready_r is not None:
                watch.append(self.booting.ready_r)
            try:
                readable, _, _ = select.select(watch, [], [], 0.5)
            except InterruptedError:
                readable = []
            except (OSError, ValueError):
                readable = []
                time.sleep(0.1)
            if self.wake_r in readable:
                try:
                    while os.read(self.wake_r, 4096):
                        pass
                except OSError:
                    pass
            self._handle_signals()
            if self.booting and self.booting.ready_r is not None and self.booting.ready_r in readable:
                self._check_ready()
            self._reap()
            self._tick()
            if self.stopping and not self.worker and not self.booting and not self.retiring:
                break
        self._write_status(force=True)
        _log("exiting")
        return 0

    def _handle_signals(self) -> None:
        pending, self.signals = self.signals, []
        for signum in pending:
            if signum == signal.SIGHUP:
                self._reload()
            elif signum in (signal.SIGTERM, signal.SIGINT):
                self._begin_stop()
            elif signum == signal.SIGUSR1:
                self._write_status(force=True)
            # SIGCHLD: the loop reaps on every pass anyway

    # -- workers -------------------------------------------------------------

    def _worker_argv(self, fd: int) -> list[str]:
        ns = self.ns
        argv = [sys.executable, "-m", "app.supervisor", "--worker", "--fd", str(fd), ns.app,
                "--host", ns.host, "--port", str(ns.port), "--backlog", str(ns.backlog)]
        if ns.proxy_headers is False:
            argv.append("--no-proxy-headers")
        elif ns.proxy_headers:
            argv.append("--proxy-headers")
        if ns.forwarded_allow_ips:
            argv += ["--forwarded-allow-ips", ns.forwarded_allow_ips]
        if ns.log_level:
            argv += ["--log-level", ns.log_level]
        if ns.timeout_keep_alive:
            argv += ["--timeout-keep-alive", str(ns.timeout_keep_alive)]
        return argv

    def _spawn(self, reason: str) -> None:
        if self.stopping or self.booting:
            return
        self.pending_reason = None
        self.gen += 1
        gen = self.gen
        ready_r, ready_w = os.pipe()
        os.set_blocking(ready_r, False)
        env = dict(os.environ)
        env.update(read_env_file())
        env["SAFIA_WORKER"] = "1"
        env["SAFIA_READY_FD"] = str(ready_w)
        env["SAFIA_WORKER_GEN"] = str(gen)
        env["SAFIA_WORKER_REASON"] = reason
        env["SAFIA_SUPERVISOR_PID"] = str(os.getpid())
        env.pop("SAFIA_SUPERVISE", None)
        try:
            proc = subprocess.Popen(self._worker_argv(self.sock.fileno()), env=env, cwd=BACKEND_DIR,
                                    pass_fds=(self.sock.fileno(), ready_w), close_fds=True)
        except OSError as exc:
            os.close(ready_r)
            os.close(ready_w)
            self._event("spawn_failed", gen=gen, reason=reason, error=str(exc))
            self._schedule_spawn("retry", BACKOFF_S[-1])
            return
        os.close(ready_w)
        self.booting = Worker(proc, gen, reason, ready_r, _commit())
        self._event("worker_spawned", gen=gen, pid=proc.pid, reason=reason, commit=self.booting.commit,
                    overlap=self.worker is not None)

    def _schedule_spawn(self, reason: str, delay_s: float) -> None:
        if self.stopping:
            return
        self.pending_reason = reason
        self.spawn_not_before = time.monotonic() + delay_s
        if delay_s:
            _log(f"next worker ({reason}) in {delay_s:.0f}s")

    def _check_ready(self) -> None:
        w = self.booting
        if w is None or w.ready_r is None:
            return
        try:
            data = os.read(w.ready_r, 64)
        except BlockingIOError:
            return
        except OSError:
            data = b""
        if data:
            self._became_ready(w)
        else:
            # EOF with no word: the worker closed the pipe (exited) — reaped below.
            os.close(w.ready_r)
            w.ready_r = None

    def _became_ready(self, w: Worker) -> None:
        if w.ready_r is not None:
            try:
                os.close(w.ready_r)
            except OSError:
                pass
            w.ready_r = None
        now = time.monotonic()
        w.ready = now
        w.ready_at = _now_iso()
        old, self.worker, self.booting = self.worker, w, None
        ran, served = self.fallback.stop()
        if old is not None:
            self._retire(old, "replaced by gen %d" % w.gen)
        facts = {"gen": w.gen, "pid": w.pid, "reason": w.reason, "commit": w.commit,
                 "boot_s": round(now - w.started, 1), "fallback_s": round(ran, 1), "fallback_served": served}
        self._event("worker_ready", **facts)
        if w.reason == "reload" and self.last_swap is not None:
            self.last_swap.update(ok=True, finished_at=_now_iso(), gen=w.gen, boot_s=facts["boot_s"])
            self._event("swap_done", gen=w.gen, boot_s=facts["boot_s"], mode=self.last_swap.get("mode"))

    def _retire(self, w: Worker, why: str) -> None:
        try:
            w.proc.send_signal(signal.SIGTERM)
        except OSError:
            pass
        w.stop_sent = time.monotonic()
        self.retiring.append(w)
        self._event("worker_stopping", gen=w.gen, pid=w.pid, why=why)

    def _reap(self) -> None:
        if self.booting and self.booting.proc.poll() is not None:
            w, self.booting = self.booting, None
            self._booting_failed(w, w.proc.returncode)
        if self.worker and self.worker.proc.poll() is not None:
            w, self.worker = self.worker, None
            if self.stopping:
                self._event("worker_stopped", gen=w.gen, pid=w.pid, **exit_info(w.proc.returncode),
                            why="the supervisor is stopping")
            else:
                self._worker_died(w, w.proc.returncode)
        still = []
        for w in self.retiring:
            rc = w.proc.poll()
            if rc is None:
                still.append(w)
            else:
                self._event("worker_stopped", gen=w.gen, pid=w.pid, **exit_info(rc),
                            drain_s=round(time.monotonic() - (w.stop_sent or time.monotonic()), 1))
        self.retiring = still

    def _booting_failed(self, w: Worker, rc: Optional[int]) -> None:
        if w.ready_r is not None:
            try:
                os.close(w.ready_r)
            except OSError:
                pass
            w.ready_r = None
        self._event("worker_failed", gen=w.gen, pid=w.pid, reason=w.reason, **exit_info(rc),
                    after_s=round(time.monotonic() - w.started, 1), mem=meminfo())
        if self.stopping:
            return
        if w.reason == "reload" and self.last_swap is not None:
            self.last_swap.update(ok=False, finished_at=_now_iso(), gen=w.gen,
                                  error=f"the new worker exited before it was ready ({exit_info(rc)})")
            self._event("swap_failed", gen=w.gen, mode=self.last_swap.get("mode"), old_serving=self.worker is not None)
            if self.worker is not None:
                return                      # the old worker never stopped serving
        self.quick_deaths += 1
        self._schedule_spawn("retry", BACKOFF_S[min(self.quick_deaths, len(BACKOFF_S) - 1)])

    def _worker_died(self, w: Worker, rc: Optional[int]) -> None:
        now = time.monotonic()
        self.deaths += 1
        uptime = now - (w.ready or w.started)
        self._event("worker_died", gen=w.gen, pid=w.pid, **exit_info(rc), uptime_s=round(uptime),
                    rss_kb=w.rss_kb, commit=w.commit, mem=meminfo(), swapping=self.booting is not None)
        if self.stopping:
            return
        self.fallback.start()
        if self.booting is not None:
            return                          # its replacement is already on its way
        if uptime < QUICK_DEATH_S:
            self.quick_deaths += 1
        else:
            self.quick_deaths = 0
        self._schedule_spawn("crash", BACKOFF_S[min(self.quick_deaths, len(BACKOFF_S) - 1)])

    # -- reload / stop -------------------------------------------------------

    def _room_for_two(self) -> bool:
        if self.worker is None:
            return True
        mem = meminfo()
        avail = mem.get("MemAvailable")
        if avail is None:
            return True
        need = (self.worker.rss_kb or rss_kb(self.worker.pid) or 0) + OVERLAP_MARGIN_KB
        return avail >= need

    def _reload(self) -> None:
        if self.stopping:
            return
        if self.booting is not None:
            self._event("swap_busy", booting_gen=self.booting.gen)
            return
        mode = "overlap" if self._room_for_two() else "sequential"
        self.last_swap = {"requested_at": _now_iso(), "gen": self.gen + 1, "ok": None, "mode": mode,
                          "finished_at": None, "error": None}
        self._event("swap_requested", mode=mode, mem=meminfo(),
                    old_rss_kb=self.worker.rss_kb if self.worker else None)
        if mode == "sequential" and self.worker is not None:
            old, self.worker = self.worker, None
            self.fallback.start()
            self._retire(old, "sequential swap — not enough memory for two workers")
        self._spawn("reload")

    def _begin_stop(self) -> None:
        if self.stopping:
            return
        self.stopping = True
        self.stop_began = time.monotonic()
        self.pending_reason = None
        self.fallback.stop()
        self._event("supervisor_stopping")
        for w in (self.booting, self.worker):
            if w is not None:
                try:
                    w.proc.send_signal(signal.SIGTERM)
                except OSError:
                    pass
                w.stop_sent = time.monotonic()

    def _tick(self) -> None:
        now = time.monotonic()
        if self.pending_reason and now >= self.spawn_not_before and not self.booting and not self.stopping:
            self._spawn(self.pending_reason)
        if self.booting and now - self.booting.started > READY_TIMEOUT_S:
            _log(f"worker gen {self.booting.gen} not ready after {READY_TIMEOUT_S}s — killing it")
            try:
                self.booting.proc.kill()
            except OSError:
                pass
        for w in list(self.retiring) + [w for w in (self.worker, self.booting) if w and self.stopping]:
            if w.stop_sent and now - w.stop_sent > STOP_GRACE_S:
                try:
                    w.proc.kill()
                except OSError:
                    pass
        if self.worker and now - self.worker.rss_sampled > RSS_SAMPLE_S:
            self.worker.rss_kb = rss_kb(self.worker.pid)
            self.worker.rss_sampled = now
            if self.worker.ready and now - self.worker.ready > QUICK_DEATH_S:
                self.quick_deaths = 0
        self._write_status()


# ── the worker ───────────────────────────────────────────────────────────────

def _run_worker(ns: argparse.Namespace) -> int:
    """The real server, on the socket the supervisor passed down. Exits with
    uvicorn's own code (3 = the app's startup failed)."""
    import uvicorn
    sock = socket.socket(fileno=ns.fd)
    sock.setblocking(False)
    kwargs = dict(host=ns.host, port=ns.port, workers=1, lifespan="on", backlog=ns.backlog)
    if ns.proxy_headers is not None:
        kwargs["proxy_headers"] = ns.proxy_headers
    if ns.forwarded_allow_ips:
        kwargs["forwarded_allow_ips"] = ns.forwarded_allow_ips
    if ns.log_level:
        kwargs["log_level"] = ns.log_level
    if ns.timeout_keep_alive:
        kwargs["timeout_keep_alive"] = ns.timeout_keep_alive
    config = uvicorn.Config(ns.app, **kwargs)
    server = uvicorn.Server(config)
    server.run(sockets=[sock])
    return 0


def _parse(argv: Optional[list[str]]) -> argparse.Namespace:
    p = argparse.ArgumentParser(prog="app.supervisor", add_help=False)
    p.add_argument("app", nargs="?", default=APP_SPEC)
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8000)
    p.add_argument("--workers", type=int, default=1)
    p.add_argument("--proxy-headers", dest="proxy_headers", action="store_true", default=None)
    p.add_argument("--no-proxy-headers", dest="proxy_headers", action="store_false")
    p.add_argument("--forwarded-allow-ips", default=None)
    p.add_argument("--log-level", default=None)
    p.add_argument("--timeout-keep-alive", type=int, default=None)
    p.add_argument("--backlog", type=int, default=2048)
    p.add_argument("--worker", action="store_true")
    p.add_argument("--fd", type=int, default=None)
    ns, unknown = p.parse_known_args(argv)
    if unknown and not ns.worker:
        _log(f"ignoring uvicorn options the supervisor does not pass on: {' '.join(unknown)}")
    return ns


def main(argv: Optional[list[str]] = None) -> int:
    ns = _parse(sys.argv[1:] if argv is None else argv)
    if ns.worker:
        if ns.fd is None:
            print("--worker needs --fd", file=sys.stderr)
            return 2
        return _run_worker(ns)
    try:
        return Supervisor(ns).run()
    except Exception:  # noqa: BLE001 — never exit 0 by accident: systemd restarts on failure
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
