"""THE server's own account of being slow (2026-10-07).

The report that started it: the app sitting on its logo-and-spinner screen for
seconds on a good connection, with nothing anywhere saying why. Production runs
ONE uvicorn process (`--workers 1`), so there are exactly three ways for every
user to wait at once, and this module watches all three:

  * the EVENT LOOP is held — sync work inside an `async def` handler freezes
    every request on the server until it finishes. A heartbeat the loop writes
    every `BEAT_S`, read from a thread of its own; a gap of `LOOP_BLOCK_S` or
    more is a STALL, and the loop thread's stack is taken WHILE it lasts, which
    names the exact code that froze everybody;
  * the DB pool is empty — 15 connections, and a request that finds none waits
    up to 30 s for one;
  * the threadpool is full — every sync endpoint needs one of its 40 tokens.

Every API request is timed (`RequestTimingMiddleware`): the answer carries
`X-Server-Ms` (the time the server spent on it) and `X-Server-Stall-Ms` (the
longest stall of the last minute), so a client that waited can tell the server
apart from the network — see frontend/src/utils/stallReport.js. A request
slower than `SLOW_REQUEST_S` is recorded with the busiest the pool and the
threadpool were while it ran, and with WHERE its time went: from
`SAMPLE_AFTER_S` on, the watcher looks at the thread running the request's
handler every `SAMPLE_S` and counts the code it finds there (the handler's own
app frames and what they were waiting on — a Telegram call, a Verifix read, a
query). «17.6 s» alone could not tell a slow Verifix from forty Telegram
messages sent one by one (2026-10-07).

Records go to the log at once (`[SERVER-STALL]`, `[SLOW-REQUEST]`) and into a
small in-memory ledger. The support chat (or every admin) is DMed a summary
only when the server was in real trouble — `_severe` — and at most once per
`DM_EVERY_S`, so a bad afternoon is one message, not forty. The ledger is also
what a client's own stall report is matched against (`around`).

Nothing here may ever fail a request or the boot: every instrument is wrapped,
and a broken one simply stops reporting.
"""
from __future__ import annotations

import asyncio
import faulthandler
import gc
import html
import inspect
import logging
import os
import re
import resource
try:
    import pwd
except ImportError:  # not Linux: the host's process list is not read anyway
    pwd = None
import sys
import tempfile
import threading
import time
import traceback
from collections import deque
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

BEAT_S = 0.2              # how often the loop writes its heartbeat
LOOP_BLOCK_S = 1.0        # a gap this long (beyond BEAT_S) is a stall
SLOW_REQUEST_S = 3.0      # a request the server spent this long on is recorded
SAMPLE_AFTER_S = 1.0      # a request running this long starts being sampled …
SAMPLE_S = 0.25           # … this often: which code its handler's thread is in
_SIGS = 24                # distinct places kept per request
DM_EVERY_S = 30 * 60      # at most one DM per this many seconds
_KEEP = 300               # ledger size

# Thresholds that make a DM worth sending. One heavy export is not trouble;
# the whole server standing still, or everybody waiting at once, is.
_SEVERE_STALL_S = 2.0         # any loop stall this long
_SEVERE_AUTH_S = 5.0          # a sign-in / session check this slow (they are trivial)
_SEVERE_BURST = 5             # this many slow requests …
_SEVERE_BURST_S = 120         # … finishing within this window

# Paths whose answer should be instant — a slow one means the server, not the
# endpoint, was the problem.
_INSTANT = ("/api/auth/", "/api/page-access", "/api/my-capabilities", "/health")
# Paths slow BY DESIGN — workbooks and decks, Verifix reads (up to 72 s by
# their own budget), the assistant's model calls. Still timed, logged and
# recorded, but they never count toward a burst: an admin paging through the
# Verifix registers is not the server being in trouble.
_EXPECTED_SLOW = ("/api/verifix-test/", "/api/admin/verifix", "/api/assistant/",
                  "/api/attendance-batch/verifix", "/admin/db-", "/admin/refresh-sheet/")
_EXPECTED_SLOW_ENDS = (".xlsx", ".pptx", ".pdf", "/export", "/refresh", "?force")
# A Verifix read a PERSON asked for — «Verifix'dan yangilash» on /staff and the
# close dialog's button, `?force=true` on these paths — re-reads the plant's
# whole directory when it is older than two minutes: ~9 Verifix calls at about
# a second each (10–15 s on 2026-10-07). The event's path carries `?force` and
# is expected; the SAME path without it is a poll that found its stored read
# stale, which is the server's problem and still counts.
_FORCED = ("/api/staff-live/",)


def _expected_slow(path: str) -> bool:
    return path.startswith(_EXPECTED_SLOW) or path.endswith(_EXPECTED_SLOW_ENDS)


def _event_path(scope) -> str:
    path = scope.get("path", "")
    if path.startswith(_FORCED) and b"force=true" in (scope.get("query_string") or b""):
        return path + "?force"
    return path


_TIMED = ("/api/", "/admin/", "/bot/", "/health")

_TZ = timezone(timedelta(hours=5))
_APP_DIR = os.sep + "app" + os.sep

_lock = threading.Lock()
_events: deque[dict] = deque(maxlen=_KEEP)
_inflight = 0
# request → {"what": "GET /api/x", "t0": perf_counter start, "scope": …,
#            "hits": {where: samples}, "n": samples, "peak": busiest snapshot}
_active: dict[int, dict] = {}
_task = None                 # the heartbeat task (a reference, or it can be collected)
_beat = 0.0                  # monotonic, written by the loop
_loop_tid: int | None = None
_limiter = None              # anyio's default thread limiter, read from the watcher
_started = False
_stopping = False
_last_dm = 0.0
_since_dm: list[dict] = []   # what the next DM summarises
_recent_stall: tuple[float, float] = (0.0, 0.0)   # (monotonic end, ms) of the worst recent stall

# ── what a long freeze was (2026-10-08) ──────────────────────────────────────
# The report that asked for this: «loop held 52.5 s», with ONE stack, taken a
# second in, showing the loop about to resume the heartbeat itself. A stack
# taken once at 1 s cannot name a freeze that lasts 50: whatever held it was
# somewhere else, and by then the watcher thread may not be able to run at all
# — a thread inside C code that never lets the GIL go (a giant query result
# being turned into rows, a garbage collection over a huge heap) stops every
# Python thread, this one included. So four more instruments, all of them cheap
# (a /proc read every `_BASE_EVERY_S` for the baseline, the rest only once the
# loop has stalled):
#
#  * faulthandler's own watchdog — a C thread that needs no GIL. The heartbeat
#    re-arms it every `_REARM_BEATS`; a loop silent for `DUMP_AFTER_S` gets
#    every thread's stack written to a scratch file, and again every
#    `DUMP_AFTER_S` while it lasts. Read and emptied when the freeze ends.
#  * CPU time — the process's and each thread's, from the last healthy
#    baseline to the end of the freeze.
#    Burned by one thread ≈ that thread held the GIL; burned by nobody ≈ the
#    process was not running at all (paused, swapped, starved by the host).
#  * the garbage collector, timed through `gc.callbacks`.
#  * memory and the host — resident size, swap, major page faults, host
#    steal and iowait (`/proc/stat`), the load average.
# Each answers a different "why", and the DM prints the one that fits.
DUMP_AFTER_S = 6.0           # a loop silent this long gets every thread's stack dumped
_BASE_EVERY_S = 2.0          # the healthy baseline a freeze is measured against is this fresh
_base: dict | None = None    # the last `_machine()` read while the loop was beating
_PROCS_EVERY_S = 5.0         # the host's process list is read this often while healthy…
_PROCS_SHARE = 0.01          # …or less often, so it never costs more than 1% of a CPU
_pbase = None                # the last `_procs()` read while the loop was beating
_pbase_next = 0.0
_REARM_BEATS = 5             # the heartbeat re-arms the dump every this many beats (~1 s)
_DUMP_MAX = 4 * 1024 * 1024  # bytes of dumps read per freeze
_beats = 0
_dump_fh = None              # the scratch file faulthandler writes into
_gc_t0 = 0.0
_gc_gen = 0
_gc_log: deque = deque(maxlen=128)   # (monotonic end, generation, seconds, collected)


# ── snapshots ────────────────────────────────────────────────────────────────

def _pool() -> dict:
    try:
        from app.database import engine
        p = engine.pool
        out = {"out": int(p.checkedout()), "size": int(p.size())}
        cap = getattr(p, "_max_overflow", None)
        if isinstance(cap, int) and cap >= 0:
            out["cap"] = out["size"] + cap
        return out
    except Exception:
        return {}


def _threads() -> dict:
    lim = _limiter
    if lim is None:
        return {}
    try:
        return {"busy": int(lim.borrowed_tokens), "of": int(lim.total_tokens)}
    except Exception:
        return {}


def snapshot() -> dict:
    """The server as it stands right now — pool, threadpool, requests in flight."""
    return {"pool": _pool(), "threads": _threads(), "inflight": _inflight}


def _oldest_active(n: int = 5) -> list[str]:
    """The requests in flight longest, with their age. A stall whose stack holds
    no app frame (FastAPI encoding a huge answer on the loop, say) is placed by
    this list instead."""
    try:
        now = time.perf_counter()
        rows = sorted(list(_active.values()), key=lambda r: r["t0"])[:n]
        return [f"{r['what']} ({now - r['t0']:.1f} s)" for r in rows]
    except Exception:
        return []


def _short(path: str) -> str:
    i = path.rfind(_APP_DIR)
    return path[i + 1:] if i >= 0 else os.path.basename(path)


def _app_frames(frame, limit: int = 8) -> list[str]:
    """The app's own frames of a stack, outermost first — `file:line function`.
    The library frames around them (uvicorn, starlette, sqlalchemy, requests)
    are left out except the innermost one, which says WHAT the app code was
    waiting on (a socket read, a query)."""
    try:
        stack = traceback.extract_stack(frame)
    except Exception:
        return []
    out = []
    for fs in stack:
        if _APP_DIR in fs.filename and not fs.filename.endswith("perf_watch.py"):
            out.append(f"{_short(fs.filename)}:{fs.lineno} {fs.name}")
    if stack:
        inner = stack[-1]
        if _APP_DIR not in inner.filename:
            out.append(f"↳ {os.path.basename(inner.filename)}:{inner.lineno} {inner.name}")
    return out[-limit:]


def _busy_threads(skip: set[int]) -> list[str]:
    """Other threads that are inside app code right now — a scheduler job or a
    request on the threadpool. A loop held by nothing on its own stack is
    usually waiting for the GIL one of these has."""
    out = []
    try:
        names = {t.ident: t.name for t in threading.enumerate()}
        for tid, frame in sys._current_frames().items():
            if tid in skip:
                continue
            frames = [f for f in _app_frames(frame, 3) if not f.startswith("↳")]
            if frames:
                out.append(f"{names.get(tid, tid)}: {frames[-1]}")
    except Exception:
        pass
    return out[:6]


# ── the machine under a freeze ───────────────────────────────────────────────

_TICK = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100


def _thread_cpu() -> dict[int, float]:
    """native thread id → CPU seconds it has used, from /proc (Linux only)."""
    out: dict[int, float] = {}
    try:
        for name in os.listdir("/proc/self/task"):
            try:
                with open(f"/proc/self/task/{name}/stat", "rb") as fh:
                    raw = fh.read().decode("ascii", "replace")
                # The thread's name is in parentheses and may hold spaces.
                fields = raw[raw.rindex(")") + 2:].split()
                out[int(name)] = (int(fields[11]) + int(fields[12])) / _TICK
            except (OSError, ValueError, IndexError):
                continue
    except OSError:
        pass
    return out


def _host_cpu() -> list[int]:
    """The host's cumulative CPU jiffies (`/proc/stat`, first line)."""
    try:
        with open("/proc/stat", "rb") as fh:
            return [int(x) for x in fh.readline().split()[1:]]
    except (OSError, ValueError):
        return []


def _status_kb(*keys: str) -> dict[str, int]:
    out: dict[str, int] = {}
    try:
        with open("/proc/self/status", "rb") as fh:
            for line in fh:
                k, _, v = line.decode("ascii", "replace").partition(":")
                if k in keys:
                    out[k] = int(v.split()[0])
    except (OSError, ValueError, IndexError):
        pass
    return out


def _machine() -> dict:
    """Everything a freeze is later measured against, read at one instant."""
    snap: dict = {"mono": time.monotonic(), "threads": _thread_cpu(), "host": _host_cpu(),
                  "vm": _vmstat()}
    try:
        ru = resource.getrusage(resource.RUSAGE_SELF)
        snap["cpu"] = ru.ru_utime + ru.ru_stime
        snap["majflt"] = ru.ru_majflt
    except Exception:
        pass
    snap.update(_status_kb("VmRSS", "VmSwap"))
    try:
        snap["load"] = os.getloadavg()[0]
    except OSError:
        pass
    return snap


_VM_KEYS = ("pswpin", "pswpout", "pgmajfault", "compact_stall", "oom_kill")
_VM_SUMS = ("allocstall", "pgscan_direct")   # one counter per memory zone: summed


def _vmstat() -> dict[str, int]:
    """The host's memory traffic since boot (`/proc/vmstat`): pages swapped in
    and out, major faults, the times a program had to stop and reclaim memory
    itself (`allocstall`, `pgscan_direct`) or wait for it to be compacted, and
    processes killed for memory. Differenced over a freeze, they say whether
    the machine was short of MEMORY rather than of CPU."""
    out: dict[str, int] = {}
    try:
        with open("/proc/vmstat", "rb") as fh:
            for line in fh:
                k, _, v = line.decode("ascii", "replace").partition(" ")
                if k in _VM_KEYS:
                    out[k] = int(v)
                    continue
                for p in _VM_SUMS:
                    if k.startswith(p):
                        out[p] = out.get(p, 0) + int(v)
                        break
    except (OSError, ValueError):
        pass
    return out


def _psi() -> dict[str, tuple[float, float | None]]:
    """Linux pressure-stall information over the last 10 s: the share of time
    SOME tasks (and, for memory and io, ALL of them) waited for the CPU, for
    memory, for the disk. Empty where the kernel does not keep it."""
    out: dict[str, tuple[float, float | None]] = {}
    for res in ("cpu", "memory", "io"):
        try:
            some = full = None
            with open(f"/proc/pressure/{res}", "rb") as fh:
                for line in fh:
                    parts = line.decode("ascii", "replace").split()
                    vals = dict(p.split("=", 1) for p in parts[1:])
                    if parts[0] == "some":
                        some = float(vals["avg10"])
                    elif parts[0] == "full" and res != "cpu":
                        full = float(vals["avg10"])
            if some is not None:
                out[res] = (some, full)
        except (OSError, ValueError, KeyError, IndexError):
            continue
    return out


def _procs() -> tuple[float, dict[int, tuple[str, int, int]]]:
    """Every process on the host this user may read: pid → (command, CPU ticks
    used, resident kB), from /proc/<pid>/stat. A freeze in which this process
    barely ran (the 9 Oct 14:55 one: 0% idle, load 46, 2.4 s of CPU in 18 s)
    was somebody ELSE on the machine, and only the machine's own list can say
    who. Read while the loop beats (`_pbase`, at most every `_PROCS_EVERY_S`)
    and when a freeze ends: read at the moment the freeze was NOTICED it
    measured nothing, because on a full machine this thread is starved too and
    noticed it at the end (the 10 Oct 13:04 one: «CPU over the last 0 s»)."""
    out: dict[int, tuple[str, int, int]] = {}
    at = time.monotonic()
    try:
        names = os.listdir("/proc")
    except OSError:
        return at, out
    for name in names:
        if not name.isdigit():
            continue
        try:
            with open(f"/proc/{name}/stat", "rb") as fh:
                raw = fh.read().decode("utf-8", "replace")
            comm = raw[raw.index("(") + 1:raw.rindex(")")]
            f = raw[raw.rindex(")") + 2:].split()
            out[int(name)] = (comm, int(f[11]) + int(f[12]), int(f[21]) * _PAGE_KB)
        except (OSError, ValueError, IndexError):
            continue
    return at, out


_PAGE_KB = (os.sysconf("SC_PAGE_SIZE") // 1024) if hasattr(os, "sysconf") else 4


def _who(pids: list[int]) -> str:
    """The user a group's busiest processes run as and the script they run —
    «user: site/dist/server.js» — so «node ×4» says WHICH node. Never an
    argument past the script: a command line may carry a secret."""
    users: list[str] = []
    scripts: list[str] = []
    for pid in pids:
        try:
            uid = os.stat(f"/proc/{pid}").st_uid
            try:
                name = pwd.getpwuid(uid).pw_name if pwd else str(uid)
            except KeyError:
                name = str(uid)
            if name not in users:
                users.append(name)
        except OSError:
            pass
        try:
            with open(f"/proc/{pid}/cmdline", "rb") as fh:
                args = fh.read(4096).split(b"\0")
            for a in args[1:]:
                arg = a.decode("utf-8", "replace")
                if not arg or arg.startswith("-"):
                    continue
                if "/" in arg or "." in arg:
                    tail = "/".join(arg.rstrip("/").split("/")[-3:])[-48:]
                    if tail not in scripts:
                        scripts.append(tail)
                break
        except OSError:
            pass
    return ", ".join(users[:2]) + (": " + ", ".join(scripts[:2]) if scripts else "")


def _host_top(p0, p1, limit: int = 5) -> list[tuple[str, int, float, int, str]]:
    """Who used the host's CPU between two `_procs` reads, grouped by command:
    [(command, processes, CPU seconds, resident MB, who)], most CPU first —
    `who` is `_who` of the group's busiest processes. This process is «this
    server»; a process born in between counts from 0."""
    if not p0 or not p1:
        return []
    me = os.getpid()
    before = p0[1]
    groups: dict[str, list] = {}
    for pid, (comm, ticks, rss) in p1[1].items():
        used = ticks - (before[pid][1] if pid in before and before[pid][0] == comm else 0)
        label = "this server" if pid == me else comm
        g = groups.setdefault(label, [0, 0, 0, []])
        if used > 0:
            g[0] += 1
            g[1] += used
            g[3].append((used, pid))
        g[2] += rss
    rows = sorted(((k, n, round(t / _TICK, 1), round(r / 1024), busy)
                   for k, (n, t, r, busy) in groups.items()
                   if t / _TICK >= 0.2 or k == "this server"), key=lambda r: -r[2])[:limit]
    return [(k, n, cpu, mb, "" if k == "this server"
             else _who([pid for _, pid in sorted(busy, reverse=True)[:3]]))
            for k, n, cpu, mb, busy in rows]


def _meminfo() -> dict[str, int]:
    """The host's memory, kB (`/proc/meminfo`)."""
    out: dict[str, int] = {}
    try:
        with open("/proc/meminfo", "rb") as fh:
            for line in fh:
                k, _, v = line.decode("ascii", "replace").partition(":")
                if k in ("MemTotal", "MemAvailable", "SwapTotal", "SwapFree"):
                    out[k] = int(v.split()[0])
    except (OSError, ValueError, IndexError):
        pass
    return out


def _thread_names() -> dict[int, tuple[int, str]]:
    """native id → (threading ident, name) for every Python thread."""
    out = {}
    try:
        for t in threading.enumerate():
            if t.native_id is not None:
                out[t.native_id] = (t.ident, t.name)
    except Exception:
        pass
    return out


def _gc_watch(phase: str, info: dict) -> None:
    """`gc.callbacks`: time every collection of the older generations. A full
    collection holds the GIL from start to end, so a long one IS a freeze."""
    global _gc_t0, _gc_gen
    try:
        if phase == "start":
            _gc_gen = info.get("generation", 0)
            _gc_t0 = time.perf_counter() if _gc_gen else 0.0
        elif _gc_t0:
            took = time.perf_counter() - _gc_t0
            _gc_t0 = 0.0
            if took >= 0.05:
                _gc_log.append((time.monotonic(), _gc_gen, took, info.get("collected", 0)))
    except Exception:
        pass


def _arm_dump() -> None:
    """(Re-)arm faulthandler's watchdog. Called on the loop: when the loop
    stops calling it, the watchdog fires `DUMP_AFTER_S` later, from C."""
    fh = _dump_fh
    if fh is None:
        return
    try:
        faulthandler.dump_traceback_later(DUMP_AFTER_S, repeat=True, file=fh)
    except Exception:
        pass


_DUMP_THREAD = re.compile(r"^(?:Current thread|Thread) (0x[0-9a-fA-F]+)")
_DUMP_FRAME = re.compile(r'^\s+File "(.*)", line (\d+) in (.+?)\s*$')


def _read_dumps() -> list[dict[int, list[tuple[str, int, str]]]]:
    """Every dump faulthandler wrote since the last freeze — a list (one per
    dump, oldest first) of {thread ident: frames, innermost first} — and empty
    the file for the next one."""
    fh = _dump_fh
    if fh is None:
        return []
    try:
        fd = fh.fileno()
        size = os.fstat(fd).st_size
        if not size:
            return []
        raw = os.pread(fd, min(size, _DUMP_MAX), 0)
        os.ftruncate(fd, 0)
        os.lseek(fd, 0, os.SEEK_SET)
    except OSError:
        return []
    dumps: list[dict] = []
    cur: dict | None = None
    tid = None
    for line in raw.decode("utf-8", "replace").splitlines():
        if line.startswith("Timeout ("):
            cur = {}
            dumps.append(cur)
            tid = None
            continue
        m = _DUMP_THREAD.match(line)
        if m:
            if cur is None:
                cur = {}
                dumps.append(cur)
            tid = int(m.group(1), 16)
            cur[tid] = []
            continue
        m = _DUMP_FRAME.match(line)
        if m and cur is not None and tid is not None:
            cur[tid].append((m.group(1), int(m.group(2)), m.group(3)))
    return dumps


def _dump_lines(frames: list[tuple[str, int, str]], limit: int = 6) -> list[str]:
    """A dumped stack (innermost first) in `_app_frames`' shape: the app's own
    frames outermost first, then the library call they were inside."""
    out = [f"{_short(f)}:{ln} {fn}" for f, ln, fn in reversed(frames)
           if _APP_DIR in f and not f.endswith("perf_watch.py")]
    if frames and _APP_DIR not in frames[0][0]:
        out.append(f"↳ {os.path.basename(frames[0][0])}:{frames[0][1]} {frames[0][2]}")
    return out[-limit:]


def _freeze_account(base: dict | None, gap: float, looked: int, procs0=None) -> dict:
    """What the process, its threads, the collector and the host did between
    the last healthy look (`base`, at most `_BASE_EVERY_S` before the freeze
    began) and now. `looked` = how many times the watcher could look at the
    loop WHILE it was held — only possible when the GIL was free. `procs0` =
    the host's process list read while the loop last beat (`_pbase`), so the
    CPU each program used is counted over the whole freeze."""
    out: dict = {"looked": looked}
    try:
        if procs0:
            procs1 = _procs()
            out["host_top"] = _host_top(procs0, procs1)
            out["host_span"] = round(procs1[0] - procs0[0], 1)
        mem = _meminfo()
        if mem.get("MemTotal"):
            out["mem"] = mem
        out["ncpu"] = os.cpu_count() or 0
        m0 = base
        m1 = _machine()
        dumps = _read_dumps()
        names = _thread_names()
        out["dumps"] = len(dumps)
        span = m1["mono"] - m0["mono"] if m0 else 0.0
        top: list[tuple[float, int]] = []
        if m0 and span > 0:
            out["span"] = round(span, 1)
            if "cpu" in m0 and "cpu" in m1:
                out["cpu"] = round(m1["cpu"] - m0["cpu"], 1)
            # Every thread alive now, one born inside the freeze counted from 0.
            t0 = m0["threads"]
            top = sorted(((t - t0.get(n, 0.0), n) for n, t in m1["threads"].items()),
                         reverse=True)[:3]
            out["top"] = [(names.get(n, (None, f"thread {n}"))[1], round(s, 1))
                          for s, n in top if s >= 0.5]
            if top and top[0][0] >= 0.5:
                out["top_is_loop"] = names.get(top[0][1], (None, ""))[0] == _loop_tid
            if "majflt" in m0 and "majflt" in m1:
                out["majflt"] = m1["majflt"] - m0["majflt"]
            h0, h1 = m0.get("host") or [], m1.get("host") or []
            if len(h0) >= 8 and len(h1) >= 8:
                d = [b - a for a, b in zip(h0, h1)]
                total = sum(d[:8]) or 1
                out["steal"] = round(100 * d[7] / total)
                out["iowait"] = round(100 * d[4] / total)
                out["idle"] = round(100 * d[3] / total)
                # Busy in programs, or in the kernel — the kernel is where a
                # machine short of memory spends it (reclaim, compaction, swap).
                out["user"] = round(100 * (d[0] + d[1]) / total)
                out["kernel"] = round(100 * (d[2] + d[5] + d[6]) / total)
            v0, v1 = m0.get("vm") or {}, m1.get("vm") or {}
            vm = {k: v1[k] - v0.get(k, 0) for k in v1 if v1[k] - v0.get(k, 0) > 0}
            if vm:
                out["vm"] = vm
        psi = _psi()
        if psi:
            out["psi"] = psi
        for k in ("VmRSS", "VmSwap", "load"):
            if k in m1:
                out[k] = m1[k]
        # Collections that ran inside the freeze (the window is the whole gap).
        start = m1["mono"] - gap - 1.0
        gcs = [g for g in list(_gc_log) if g[0] >= start]
        if gcs:
            out["gc_s"] = round(sum(g[2] for g in gcs), 1)
            out["gc_max"] = round(max(g[2] for g in gcs), 1)
            out["gc_n"] = len(gcs)
        # The busiest thread's stack: the LAST dump written while the freeze
        # lasted (faulthandler's, taken without the GIL), else where that
        # thread stands now — it has only just let go.
        busiest = top[0][1] if top and top[0][0] >= 0.5 else None
        ident = names.get(busiest, (None, ""))[0] if busiest is not None else None
        stack: list[str] = []
        if ident is not None:
            for d in reversed(dumps):
                if d.get(ident):
                    stack = _dump_lines(d[ident])
                    out["stack_from"] = "dump"
                    break
            if not stack:
                frame = sys._current_frames().get(ident)
                if frame is not None:
                    stack = _app_frames(frame, 6)
                    out["stack_from"] = "after"
        out["busy_stack"] = stack
        # Every thread inside app code in the LAST dump — where a culprit that
        # has since finished (or that /proc could not single out) stood.
        if dumps:
            idents = {t.ident: t.name for t in threading.enumerate()}
            skip = {_loop_tid, ident}
            busy = []
            for tid_, frames in dumps[-1].items():
                if tid_ in skip:
                    continue
                lines = [x for x in _dump_lines(frames, 2)]
                if any(not x.startswith("↳") for x in lines):
                    busy.append(f"{idents.get(tid_, hex(tid_))}: " + " ".join(lines))
            out["dump_threads"] = busy[:4]
        # What the LOOP was doing while it was held, from the dumps (the
        # watcher's own look at 1 s is already in the record).
        if dumps and _loop_tid:
            loops = [tuple(_dump_lines(d[_loop_tid])) for d in dumps if d.get(_loop_tid)]
            if loops:
                out["loop_dump"] = list(max(set(loops), key=loops.count))
        out["verdict"] = _verdict(out, gap)
    except Exception:
        logger.exception("perf_watch: freeze account failed")
    return out


def _memory_short(a: dict) -> str:
    """«memory was short — 120 MB swapped in, 480 MB out, 2,140 reclaim
    stalls, tasks waited on memory 41% of the time», or "" when nothing in the
    freeze says the machine was short of memory."""
    vm = a.get("vm") or {}
    mb = _PAGE_KB / 1024
    sin, sout = vm.get("pswpin", 0) * mb, vm.get("pswpout", 0) * mb
    bits = []
    if sin + sout >= 10:
        bits.append(f"{sin:.0f} MB swapped in, {sout:.0f} MB out")
    if vm.get("allocstall"):
        bits.append(f"{vm['allocstall']:,} reclaim stalls")
    if vm.get("compact_stall"):
        bits.append(f"{vm['compact_stall']:,} compaction stalls")
    mem = (a.get("psi") or {}).get("memory")
    if mem and mem[0] >= 10:
        bits.append(f"tasks waited on memory {mem[0]:.0f}% of the time")
    if vm.get("oom_kill"):
        bits.append(f"{vm['oom_kill']} process(es) killed for memory")
    return ("memory was short — " + ", ".join(bits)) if bits else ""


def _verdict(a: dict, gap: float) -> str:
    """One line on WHY, read off the measurements — the first that fits."""
    span = a.get("span") or 0.0
    if span < 1.0:
        return ""
    cpu = a.get("cpu")
    top = a.get("top") or []
    looked = a.get("looked", 0)
    if a.get("gc_s", 0) >= 0.5 * span:
        return f"garbage collection — {a['gc_s']:.1f} s in {a.get('gc_n', 1)} full collection(s)"
    if top and top[0][1] >= 0.5 * gap:
        if a.get("top_is_loop"):
            return (f"the event loop ran code of its own the whole time ({top[0][1]:.1f} s of CPU) "
                    "— the loop's stack below")
        return (f"one thread used the CPU the whole time — «{top[0][0]}» ({top[0][1]:.1f} s)"
                + (" and never let the others run" if not looked else "") + ", named below")
    if cpu is not None and not looked and cpu >= 0.5 * span:
        return (f"something kept the GIL ({cpu:.1f} s of CPU in {span:.0f} s) and nothing "
                "else could run — the threads in app code are named below")
    if cpu is not None and cpu < 0.25 * span:
        if a.get("steal", 0) >= 30:
            return f"the machine itself was not running us — host steal {a['steal']}%"
        if "idle" in a and a["idle"] <= 10:
            # The CPUs were all busy and this process was not what kept them
            # so: other programs on the box had the machine.
            others = [h for h in a.get("host_top") or [] if h[0] != "this server"]
            lead = ""
            if others:
                name, n, cpu_s, _, who = others[0]
                lead = (f" — most of it «{name}»" + (f" ×{n}" if n > 1 else "")
                        + (f" ({who})" if who else "") + f", {cpu_s:.1f} s of CPU")
            ncpu = a.get("ncpu") or 0
            split = (f" (programs {a['user']}%, kernel {a['kernel']}%)"
                     if "kernel" in a else "")
            mem = _memory_short(a)
            return (f"the machine was full — {a['idle']}% idle{split}, load {a.get('load', 0):.0f}"
                    + (f" on {ncpu} CPUs" if ncpu else "")
                    + (f"; {mem}" if mem else "")
                    + f"; this process got {cpu:.1f} s of CPU in {span:.0f} s{lead}"
                    + ("" if others else " (the host's process list could not be read)"))
        if a.get("majflt", 0) >= 200 or a.get("VmSwap", 0) >= 50 * 1024:
            mem = _memory_short(a)
            return ("memory was being read back from swap (major page faults)"
                    + (f" — {mem}" if mem else ""))
        if looked >= 2:
            return ("the loop waited inside a call of its own (a query, a network call, "
                    "a lock or a sleep) — named below")
        if a.get("iowait", 0) >= 30:
            return f"the disk — iowait {a['iowait']}%"
        return (f"this process barely ran ({cpu:.1f} s of CPU in {span:.0f} s) — "
                "it was paused or waiting on the machine")
    if cpu is not None:
        return f"the CPU was busy ({cpu:.1f} s in {span:.0f} s) across several threads"
    return ""


def _machine_line(a: dict) -> str:
    bits = []
    if a.get("cpu") is not None and a.get("span"):
        bits.append(f"process CPU {a['cpu']:.1f} s in {a['span']:.0f} s")
    for name, s in (a.get("top") or [])[:2]:
        bits.append(f"«{name}» {s:.1f} s")
    if a.get("gc_n"):
        bits.append(f"GC {a['gc_s']:.1f} s (longest {a['gc_max']:.1f} s)")
    if a.get("VmRSS") is not None:
        bits.append(f"RSS {a['VmRSS'] / 1024 / 1024:.2f} GB")
    if a.get("VmSwap"):
        bits.append(f"swap {a['VmSwap'] / 1024:.0f} MB")
    if a.get("majflt"):
        bits.append(f"+{a['majflt']} major faults")
    if "steal" in a:
        bits.append(f"host steal {a['steal']}% · iowait {a['iowait']}% · idle {a['idle']}%"
                    + (f" · programs {a['user']}% · kernel {a['kernel']}%" if "kernel" in a else ""))
    if a.get("load") is not None:
        bits.append(f"load {a['load']:.1f}")
    mem = a.get("mem") or {}
    if mem.get("MemTotal"):
        bits.append(f"memory free {mem.get('MemAvailable', 0) / 1024 / 1024:.1f} of "
                    f"{mem['MemTotal'] / 1024 / 1024:.1f} GB")
        if mem.get("SwapTotal"):
            bits.append(f"swap used {(mem['SwapTotal'] - mem.get('SwapFree', 0)) / 1024 / 1024:.1f} GB")
    vm = a.get("vm") or {}
    if vm.get("pswpin") or vm.get("pswpout"):
        mb = _PAGE_KB / 1024
        bits.append(f"swapped in {vm.get('pswpin', 0) * mb:.0f} MB · out {vm.get('pswpout', 0) * mb:.0f} MB")
    if vm.get("allocstall") or vm.get("compact_stall"):
        bits.append(f"reclaim stalls {vm.get('allocstall', 0):,} · compaction stalls "
                    f"{vm.get('compact_stall', 0):,}")
    psi = a.get("psi") or {}
    if psi:
        bits.append("waiting (10 s): " + " · ".join(
            f"{res} {some:.0f}%" + (f" (all {full:.0f}%)" if full else "")
            for res, (some, full) in psi.items()))
    return " · ".join(bits)


def _host_line(a: dict) -> str:
    """«node ×3 (user: site/dist/server.js) 9.0 s 1.2 GB · postgres ×38
    (postgres) 21.4 s 3.1 GB · this server 2.4 s»"""
    rows = a.get("host_top") or []
    if not rows:
        return ""
    return " · ".join(f"{row[0]}" + (f" ×{row[1]}" if row[1] > 1 else "")
                      + (f" ({row[4]})" if len(row) > 4 and row[4] else "")
                      + f" {row[2]:.1f} s"
                      + (f" {row[3] / 1024:.1f} GB" if row[3] >= 1024 else f" {row[3]} MB")
                      for row in rows) + (
        f" (CPU over the {a['host_span']:.0f} s from just before the freeze to its end)"
        if a.get("host_span") else "")


# ── where a slow request spends its time ─────────────────────────────────────

def _where(frame) -> str:
    """One place in a stack, coarse enough to add up: the two innermost app
    functions (no line numbers — a loop's lines must count as one place) and
    the library call they were inside, e.g.
    `staff_live:_notify › telegram_bot:_set_menu_button ↳ ssl:read`."""
    try:
        stack = traceback.extract_stack(frame)
    except Exception:
        return ""
    app = [fs for fs in stack
           if _APP_DIR in fs.filename and not fs.filename.endswith("perf_watch.py")]
    name = lambda fs: f"{os.path.splitext(os.path.basename(fs.filename))[0]}:{fs.name}"
    out = " › ".join(name(fs) for fs in app[-2:])
    if stack and _APP_DIR not in stack[-1].filename:
        out = (out + " " if out else "") + "↳ " + name(stack[-1])
    return out


def _bump_peak(rec: dict, snap: dict) -> None:
    pk = rec["peak"]
    for k in ("pool", "threads"):
        new, old = snap.get(k) or {}, pk.get(k) or {}
        field = "out" if k == "pool" else "busy"
        if not old or new.get(field, 0) > old.get(field, 0):
            pk[k] = new
    pk["inflight"] = max(pk.get("inflight", 0), snap.get("inflight", 0))


def _sample(me: int) -> None:
    """Credit each request running past `SAMPLE_AFTER_S` with the place its
    handler's thread is in right now. The thread is found by the handler's own
    frame on its stack (`scope["endpoint"]` is the function the route
    matched); a handler of the same endpoint already credited this round is
    not counted twice. An `async` handler awaiting I/O is on no stack — it
    simply gathers no samples."""
    now = time.perf_counter()
    reqs = sorted((r for r in list(_active.values()) if now - r["t0"] >= SAMPLE_AFTER_S),
                  key=lambda r: r["t0"])
    if not reqs:
        return
    frames = sys._current_frames()
    snap = snapshot()
    taken: set[int] = set()
    for rec in reqs:
        _bump_peak(rec, snap)
        # A handler that hands its work to a thread of its own (the bot
        # webhook) is on no stack — that thread is named by `working_for`.
        tid = rec.get("tid")
        if tid is not None:
            frame = frames.get(tid)
            if frame is not None and tid not in taken:
                taken.add(tid)
                where = _where(frame)
                hits = rec["hits"]
                if where and (where in hits or len(hits) < _SIGS):
                    hits[where] = hits.get(where, 0) + 1
                rec["n"] += 1
            continue
        code = rec.get("code")
        if code is None:
            ep = rec["scope"].get("endpoint")
            try:
                ep = inspect.unwrap(ep) if ep is not None else None
            except Exception:  # noqa: BLE001 — a wrapper loop: take it as it is
                pass
            code = rec["code"] = getattr(ep, "__code__", None) or False
        if not code:
            continue
        for tid, frame in frames.items():
            if tid == me or tid in taken:
                continue
            f = frame
            while f is not None and f.f_code is not code:
                f = f.f_back
            if f is None:
                continue
            taken.add(tid)
            where = _where(frame)
            hits = rec["hits"]
            if where and (where in hits or len(hits) < _SIGS):
                hits[where] = hits.get(where, 0) + 1
            rec["n"] += 1
            break


@contextmanager
def working_for(scope, note: str = ""):
    """Credit the work THIS thread does to the request `scope` — for a handler
    that awaits a thread of its own and so stands on no stack the sampler can
    find (the bot webhook: every update on one dedicated thread). `note` names
    what the work was; it is printed beside the path when the request is slow."""
    rec = _active.get(id(scope)) if scope is not None else None
    if rec is not None:
        rec["tid"] = threading.get_ident()
        if note:
            rec["note"] = note[:120]
    try:
        yield rec
    finally:
        if rec is not None:
            rec.pop("tid", None)


def add_note(scope, note: str) -> None:
    """Append to a running request's note (see `working_for`)."""
    rec = _active.get(id(scope)) if scope is not None else None
    if rec is not None and note:
        rec["note"] = ((rec.get("note") + " · ") if rec.get("note") else "") + note[:120]


def _summary(rec: dict | None, limit: int = 3) -> list[str]:
    """«62% staff_live:_notify › …» — the places a request spent its sampled
    time in, biggest first."""
    if not rec or not rec.get("n"):
        return []
    n = rec["n"]
    top = sorted(rec["hits"].items(), key=lambda kv: -kv[1])[:limit]
    return [f"{round(100 * c / n)}% {w}" for w, c in top]


# ── the ledger ───────────────────────────────────────────────────────────────

def _record(ev: dict) -> None:
    global _last_dm
    ev["at"] = time.time()
    with _lock:
        _events.append(ev)
        _since_dm.append(ev)
        del _since_dm[:-_KEEP]
        send = _severe(ev) and (time.time() - _last_dm) >= DM_EVERY_S
        if send:
            _last_dm = time.time()
            batch = list(_since_dm)
            _since_dm.clear()
    if send:
        # Off the caller's thread: a request must not wait on Telegram, and the
        # watcher must not miss the next beat while a DM is on its way.
        threading.Thread(target=_dm, args=(batch,), name="perf-watch-dm", daemon=True).start()


def _severe(ev: dict) -> bool:
    if ev["kind"] == "stall":
        return ev["ms"] >= _SEVERE_STALL_S * 1000
    if ev.get("path", "").startswith(_INSTANT) and ev["ms"] >= _SEVERE_AUTH_S * 1000:
        return True
    pool = ev.get("pool") or {}
    if pool.get("cap") and pool.get("out", 0) >= pool["cap"]:
        return True
    if _expected_slow(ev.get("path", "")):
        return False
    cutoff = ev["at"] - _SEVERE_BURST_S
    slow = sum(1 for e in _events if e["kind"] == "request" and e["at"] >= cutoff
               and not _expected_slow(e.get("path", "")))
    return slow >= _SEVERE_BURST


def around(seconds: float, pad: float = 10.0) -> list[dict]:
    """What the server recorded in the last `seconds` (+ `pad`) — matched against
    a client that reports having waited that long."""
    cutoff = time.time() - seconds - pad
    with _lock:
        return [dict(e) for e in _events if e["at"] >= cutoff]


def stall_header_ms() -> int:
    """The longest loop stall of the last minute, 0 if none — including one that
    ended a moment ago and the watcher has not written down yet: the first
    answers sent after a freeze go out BEFORE the heartbeat runs again, so the
    heartbeat's age is that freeze's length."""
    now = time.monotonic()
    end, ms = _recent_stall
    out = int(ms) if end and now - end <= 60 else 0
    if _started and _beat:
        live = (now - _beat - BEAT_S) * 1000
        if live >= LOOP_BLOCK_S * 1000:
            out = max(out, int(live))
    return out


# ── the event-loop watcher ───────────────────────────────────────────────────

async def _heartbeat() -> None:
    global _beat, _recent_stall, _beats
    while not _stopping:
        now = time.monotonic()
        # The heartbeat is the first thing to run when a freeze ends, so it is
        # what writes the freeze down for `X-Server-Stall-Ms` — before the
        # answers that queued behind it go out. The watcher thread records the
        # same freeze with its stack a moment later.
        lag = now - _beat - BEAT_S
        if lag >= LOOP_BLOCK_S:
            end, ms = _recent_stall
            if lag * 1000 >= ms or now - end > 60:
                _recent_stall = (now, lag * 1000)
        # Re-armed BEFORE the beat is written: re-arming waits for a dump in
        # progress to finish, so once the watcher sees this beat no dump of the
        # freeze is still being written — and none can start for DUMP_AFTER_S.
        _beats += 1
        if lag >= LOOP_BLOCK_S or _beats % _REARM_BEATS == 0:
            _arm_dump()
        _beat = now
        await asyncio.sleep(BEAT_S)


def _watch() -> None:
    global _base, _pbase, _pbase_next
    me = threading.get_ident()
    last_seen = _beat
    held: dict | None = None
    last_sample = 0.0
    while not _stopping:
        time.sleep(BEAT_S / 2)
        try:
            now = time.monotonic()
            if now - last_sample >= SAMPLE_S and _active:
                last_sample = now
                try:
                    _sample(me)
                except Exception:
                    logger.exception("perf_watch: request sampling failed")
            beat = _beat
            if beat != last_seen:
                gap = beat - last_seen - BEAT_S
                if gap >= LOOP_BLOCK_S:
                    ms = round(gap * 1000)
                    # `held` is None only when this thread did not get to look
                    # while it lasted (starved itself) — still a stall, unnamed.
                    ev = {"kind": "stall", "ms": ms, **(held or {"stack": [], **snapshot()})}
                    looks = ev.pop("looks", None)
                    procs0 = _pbase
                    ev.pop("m0", None)
                    ev.pop("look_at", None)
                    if looks:
                        # The loop's stack seen most often while it was held —
                        # the 1 s look alone named a freeze by its first second.
                        common = max(looks.items(), key=lambda kv: kv[1])[0]
                        if list(common) != ev.get("stack"):
                            ev["stack_often"] = list(common)
                    if held is None:
                        # This thread never got to look while it lasted: the
                        # GIL was held the whole time (or the process stopped).
                        ev["unseen"] = True
                    if gap >= DUMP_AFTER_S / 2 or held is not None:
                        ev["freeze"] = _freeze_account(
                            (held or {}).get("m0") or _base, gap, sum((looks or {}).values()),
                            procs0)
                    fz = ev.get("freeze") or {}
                    logger.warning("[SERVER-STALL] event loop held %.1f s · %s%s%s\n  %s%s%s%s",
                                   gap, _pool_line(ev),
                                   ("\n  why: " + fz["verdict"]) if fz.get("verdict") else "",
                                   (("\n  machine: " + _machine_line(fz)) if fz else "")
                                   + (("\n  on the host: " + _host_line(fz)) if _host_line(fz) else ""),
                                   "loop never seen — the watcher could not run while it lasted"
                                   if ev.get("unseen") else
                                   "\n  ".join(ev.get("stack") or ["(no app frames)"]),
                                   (("\n  busiest thread:\n    " + "\n    ".join(fz["busy_stack"]))
                                    if fz.get("busy_stack") else "")
                                   + (("\n  in app code at the freeze dump:\n    "
                                       + "\n    ".join(fz["dump_threads"]))
                                      if fz.get("dump_threads") else ""),
                                   ("\n  in flight: " + "; ".join(ev["active"])) if ev.get("active") else "",
                                   ("\n  other threads:\n    " + "\n    ".join(ev["others"]))
                                   if ev.get("others") else "")
                    _record(ev)
                elif held is not None:
                    _read_dumps()   # a dump of a near-miss is not kept for the next one
                held = None
                last_seen = beat
                continue
            if (held is None and now - beat < BEAT_S * 2
                    and (_base is None or now - _base["mono"] >= _BASE_EVERY_S)):
                # The healthy baseline. When a freeze comes, this thread may not
                # get to run until it is over (a thread holding the GIL in C),
                # so what it is measured against must already be in hand. Never
                # taken on the tick that sees a freeze end — that is the END.
                _base = _machine()
            if held is None and now - beat < BEAT_S * 2 and now >= _pbase_next:
                # The host's process list, for the same reason: on a full
                # machine this thread is starved with everybody else, and a
                # list read when it noticed the freeze — at its end — measured
                # nothing. Read less often when it is slow to read.
                _pbase = _procs()
                took = time.monotonic() - _pbase[0]
                _pbase_next = time.monotonic() + max(_PROCS_EVERY_S, took / _PROCS_SHARE)
            if held is None and now - beat >= LOOP_BLOCK_S and _loop_tid:
                # Taken WHILE the loop is held, which is the only moment the
                # culprit is on its stack.
                frame = sys._current_frames().get(_loop_tid)
                held = {
                    "stack": _app_frames(frame) if frame is not None else [],
                    "others": _busy_threads({me, _loop_tid}),
                    "active": _oldest_active(),
                    "m0": _base,
                    "looks": {},
                    "look_at": now,
                    **snapshot(),
                }
            elif held is not None and now - held["look_at"] >= 2.0 and _loop_tid:
                # Still held and this thread can run: look again. A freeze the
                # watcher can look at is one where the GIL is free, so the loop
                # is blocked in something of its own — this names it.
                held["look_at"] = now
                frame = sys._current_frames().get(_loop_tid)
                if frame is not None:
                    key = tuple(_app_frames(frame))
                    held["looks"][key] = held["looks"].get(key, 0) + 1
        except Exception:
            logger.exception("perf_watch: watcher tick failed")
            time.sleep(5)


def start() -> None:
    """Called at the END of the lifespan's startup, from inside the loop: the
    startup migrations themselves run on the loop and must not be read as a
    stall."""
    global _started, _loop_tid, _limiter, _beat, _stopping, _task, _dump_fh
    if _started:
        return
    try:
        _loop_tid = threading.get_ident()
        try:
            import anyio.to_thread
            _limiter = anyio.to_thread.current_default_thread_limiter()
        except Exception:
            _limiter = None
        # Startup is done, and what it left behind lives as long as the
        # process: modules, mappers, settings. Freezing it moves all of that out
        # of the collector's reach, so every later FULL collection walks only
        # what the running server made — a full collection holds the GIL, and
        # so the whole server, for as long as it walks.
        try:
            gc.collect()
            gc.freeze()
            if _gc_watch not in gc.callbacks:
                gc.callbacks.append(_gc_watch)
        except Exception:
            logger.exception("perf_watch: could not set up the collector watch")
        try:
            # Anonymous (unlinked) — nothing to clean up, one per process.
            _dump_fh = tempfile.TemporaryFile(prefix="safia-freeze-")
        except Exception:
            _dump_fh = None
            logger.exception("perf_watch: no scratch file for freeze dumps")
        _stopping = False
        _beat = time.monotonic()
        _arm_dump()
        _task = asyncio.get_running_loop().create_task(_heartbeat())
        threading.Thread(target=_watch, name="perf-watch", daemon=True).start()
        _started = True
    except Exception:
        logger.exception("perf_watch: could not start the loop watcher")


def stop() -> None:
    """Shutdown: the heartbeat stops ON PURPOSE, which must not read as a stall."""
    global _stopping
    _stopping = True
    try:
        faulthandler.cancel_dump_traceback_later()
    except Exception:
        pass


# ── request timing ───────────────────────────────────────────────────────────

class RequestTimingMiddleware:
    """Times every API request from the moment the app receives it to the moment
    its answer starts, stamps `X-Server-Ms` / `X-Server-Stall-Ms` on the answer,
    and records the slow ones. Pure ASGI, like the middlewares around it."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not scope.get("path", "").startswith(_TIMED):
            await self.app(scope, receive, send)
            return
        global _inflight
        t0 = time.perf_counter()
        _inflight += 1
        key = id(scope)
        _active[key] = {"what": f"{scope.get('method', '')} {_event_path(scope)[:120]}",
                        "t0": t0, "scope": scope, "hits": {}, "n": 0, "peak": {}}
        state = {"status": 0, "ms": None}

        async def send_wrapper(message):
            if message["type"] == "http.response.start" and state["ms"] is None:
                ms = (time.perf_counter() - t0) * 1000
                state["ms"] = ms
                state["status"] = message.get("status", 0)
                try:
                    message["headers"] = list(message.get("headers", [])) + [
                        (b"x-server-ms", str(int(ms)).encode()),
                        (b"x-server-stall-ms", str(stall_header_ms()).encode()),
                    ]
                except Exception:
                    pass
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            _inflight -= 1
            rec = _active.pop(key, None)
            try:
                ms = state["ms"] if state["ms"] is not None else (time.perf_counter() - t0) * 1000
                if ms >= SLOW_REQUEST_S * 1000:
                    path = _event_path(scope)
                    # The busiest the server was WHILE it ran — taken at its end,
                    # the request's own thread and DB connection are already back.
                    peak = (rec or {}).get("peak") or snapshot()
                    ev = {"kind": "request", "ms": round(ms), "method": scope.get("method", ""),
                          "path": path[:160], "status": state["status"],
                          "pool": peak.get("pool") or {}, "threads": peak.get("threads") or {},
                          "inflight": peak.get("inflight", 0),
                          "peak": bool((rec or {}).get("peak")),
                          "where": _summary(rec)}
                    if (rec or {}).get("note"):
                        ev["note"] = rec["note"]
                    logger.warning("[SLOW-REQUEST] %s %s%s → %s in %.1f s · %s%s",
                                   ev["method"], ev["path"],
                                   f" [{ev['note']}]" if ev.get("note") else "",
                                   ev["status"] or "—", ms / 1000,
                                   _pool_line(ev),
                                   ("\n  where: " + " · ".join(ev["where"])) if ev["where"] else "")
                    _record(ev)
            except Exception:
                pass


# ── the DM ───────────────────────────────────────────────────────────────────

def _clock(ts: float) -> str:
    return datetime.fromtimestamp(ts, _TZ).strftime("%H:%M:%S")


def _pool_line(ev: dict) -> str:
    p = ev.get("pool") or {}
    t = ev.get("threads") or {}
    bits = []
    if p:
        full = p.get("cap") and p.get("out", 0) >= p["cap"]
        bits.append(f"DB {p.get('out', '?')}/{p.get('cap', p.get('size', '?'))}" + (" FULL" if full else ""))
    if t:
        bits.append(f"threads {t.get('busy', '?')}/{t.get('of', '?')}")
    if ev.get("inflight") is not None:
        bits.append(f"{ev['inflight']} in flight")
    line = " · ".join(bits)
    return f"busiest {line}" if line and ev.get("peak") else line


def event_lines(events: list[dict], limit: int = 6) -> list[str]:
    """HTML lines describing ledger events, worst first — shared with the
    client stall report (routers/boot.py), so both name a stall one way."""
    out = []
    for ev in sorted(events, key=lambda e: -e.get("ms", 0))[:limit]:
        if ev["kind"] == "stall":
            # The stack goes LAST: Telegram swallows the line break right after
            # a </pre>, so anything after it ran into the stack's last line.
            fz = ev.get("freeze") or {}
            pre = (["loop: never seen — the watcher could not run while it lasted"] if ev.get("unseen")
                   else ["loop, 1 s in:"] + ["  " + s for s in (ev.get("stack") or ["(no app frames)"])[-6:]])
            if ev.get("stack_often"):
                pre += ["loop, most of the time:"] + ["  " + s for s in ev["stack_often"][-6:]]
            elif fz.get("loop_dump") and fz["loop_dump"] != ev.get("stack"):
                pre += ["loop, in the freeze dump:"] + ["  " + s for s in fz["loop_dump"][-6:]]
            if fz.get("busy_stack"):
                who = (fz.get("top") or [("?", 0)])[0][0]
                when = "while frozen" if fz.get("stack_from") == "dump" else "just after"
                pre += [f"busiest thread «{who}» ({when}):"] + ["  " + s for s in fz["busy_stack"]]
            if fz.get("dump_threads"):
                pre += ["in app code at the freeze dump:"] + ["  " + s for s in fz["dump_threads"]]
            out.append(f"🧊 {_clock(ev['at'])} loop held <b>{ev['ms'] / 1000:.1f} s</b> · "
                       f"{html.escape(_pool_line(ev))}\n"
                       + (f"<b>why:</b> {html.escape(fz['verdict'])}\n" if fz.get("verdict") else "")
                       + (f"<i>machine:</i> {html.escape(_machine_line(fz))}\n"
                          if _machine_line(fz) else "")
                       + (f"<i>on the host:</i> {html.escape(_host_line(fz))}\n"
                          if _host_line(fz) else "")
                       + (f"<i>in flight:</i> {html.escape('; '.join(ev['active'][:4]))}\n"
                          if ev.get("active") else "")
                       + (f"<i>other threads:</i> {html.escape('; '.join(ev['others'][:3]))}\n"
                          if ev.get("others") else "")
                       + f"<pre>{html.escape(chr(10).join(pre))}</pre>")
        else:
            note = f" [{html.escape(ev['note'])}]" if ev.get("note") else ""
            out.append(f"🐢 {_clock(ev['at'])} {html.escape(ev.get('method', ''))} "
                       f"<code>{html.escape(ev.get('path', ''))}</code>{note} → {ev.get('status') or '—'} "
                       f"in <b>{ev['ms'] / 1000:.1f} s</b> · {html.escape(_pool_line(ev))}"
                       + (f"\n<i>time went to:</i> {html.escape(' · '.join(ev['where']))}"
                          if ev.get("where") else ""))
    return out


def _path_summary(slow: list[dict], limit: int = 4) -> list[str]:
    """«<code>/api/leaders</code> ×7 · median 4.2 s · 61% in leaders:… ↳ do_execute»
    — the paths slow most often, each with its median and where ITS time went
    over ALL of its events. The detail below prints only the slowest few
    requests, and the 2026-10-07 report counted /api/leaders twelve times
    without one line saying what they were doing."""
    by: dict[str, dict] = {}
    for e in slow:
        d = by.setdefault(e["path"], {"n": 0, "ms": [], "frames": {}})
        d["n"] += 1
        d["ms"].append(e["ms"])
        for w in e.get("where") or []:
            pct, sep, frame = w.partition("% ")
            if sep and pct.isdigit():
                d["frames"][frame] = d["frames"].get(frame, 0.0) + e["ms"] * int(pct) / 100
    out = []
    for p, d in sorted(by.items(), key=lambda kv: -kv[1]["n"])[:limit]:
        ms = sorted(d["ms"])
        line = f"<code>{html.escape(p)}</code> ×{d['n']} · median {ms[len(ms) // 2] / 1000:.1f} s"
        if d["frames"]:
            frame, sec = max(d["frames"].items(), key=lambda kv: kv[1])
            line += f" · {round(100 * sec / sum(d['ms']))}% in {html.escape(frame)}"
        out.append(line)
    return out


def _count_paths(events: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in events:
        out[e.get("path", "")] = out.get(e.get("path", ""), 0) + 1
    return out


def _dm(batch: list[dict]) -> None:
    try:
        stalls = [e for e in batch if e["kind"] == "stall"]
        # Requests slow BY DESIGN (a Verifix read a person pressed for, a sheet
        # refresh, an export) are listed apart and last: mixed in, three of the
        # six lines of the 2026-10-09 report were presses doing what they do,
        # and the report read as «nothing was fixed».
        designed = [e for e in batch if e["kind"] == "request" and _expected_slow(e.get("path", ""))]
        slow = [e for e in batch if e["kind"] == "request" and not _expected_slow(e.get("path", ""))]
        first = min(e["at"] for e in batch)
        head = [
            "🐌 <b>Server was slow</b>",
            f"Since {_clock(first)}: {len(stalls)} freeze(s) of the whole server, "
            f"{len(slow)} slow request(s) (≥ {SLOW_REQUEST_S:.0f} s)"
            + (f", plus {len(designed)} slow by design (Verifix presses, sheet refreshes, exports)"
               if designed else "") + ".",
        ]
        if stalls:
            w = max(stalls, key=lambda e: e["ms"])
            head.append(f"Longest freeze: {w['ms'] / 1000:.1f} s — nobody's request was answered meanwhile.")
            why = (w.get("freeze") or {}).get("verdict")
            if why:
                head.append(f"Why: {html.escape(why)}.")
        if slow:
            head.append("Slow most often:")
            head += ["• " + line for line in _path_summary(slow)]
        if designed:
            head.append("Slow by design: " + ", ".join(
                f"<code>{html.escape(p)}</code> ×{n}" for p, n in
                sorted(_count_paths(designed).items(), key=lambda kv: -kv[1])[:4]))
        text = "\n".join(head)
        real = event_lines(stalls + slow)
        for line in real + event_lines(designed, limit=max(0, 6 - len(real))):
            if len(text) + len(line) > 3900:     # whole lines only: a cut tag breaks the HTML
                break
            text += "\n\n" + line
        from app.routers.boot import _recipients   # lazily: a service never imports a router at load
        from app.telegram_bot import bot
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text, parse_mode="HTML")
            except Exception as e:
                logger.warning("perf_watch DM to %s failed: %s", chat_id, e)
    except Exception:
        logger.exception("perf_watch: DM failed")
