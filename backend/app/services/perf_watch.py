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
import html
import inspect
import logging
import os
import sys
import threading
import time
import traceback
from collections import deque
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
                  "/api/attendance-batch/verifix", "/admin/db-")
_EXPECTED_SLOW_ENDS = (".xlsx", ".pptx", ".pdf", "/export", "/refresh")


def _expected_slow(path: str) -> bool:
    return path.startswith(_EXPECTED_SLOW) or path.endswith(_EXPECTED_SLOW_ENDS)
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
    global _beat, _recent_stall
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
        _beat = now
        await asyncio.sleep(BEAT_S)


def _watch() -> None:
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
                    logger.warning("[SERVER-STALL] event loop held %.1f s · %s\n  %s%s%s",
                                   gap, _pool_line(ev),
                                   "\n  ".join(ev.get("stack") or ["(no app frames)"]),
                                   ("\n  in flight: " + "; ".join(ev["active"])) if ev.get("active") else "",
                                   ("\n  other threads:\n    " + "\n    ".join(ev["others"]))
                                   if ev.get("others") else "")
                    _record(ev)
                held = None
                last_seen = beat
                continue
            if held is None and now - beat >= LOOP_BLOCK_S and _loop_tid:
                # Taken WHILE the loop is held, which is the only moment the
                # culprit is on its stack.
                frame = sys._current_frames().get(_loop_tid)
                held = {
                    "stack": _app_frames(frame) if frame is not None else [],
                    "others": _busy_threads({me, _loop_tid}),
                    "active": _oldest_active(),
                    **snapshot(),
                }
        except Exception:
            logger.exception("perf_watch: watcher tick failed")
            time.sleep(5)


def start() -> None:
    """Called at the END of the lifespan's startup, from inside the loop: the
    startup migrations themselves run on the loop and must not be read as a
    stall."""
    global _started, _loop_tid, _limiter, _beat, _stopping, _task
    if _started:
        return
    try:
        _loop_tid = threading.get_ident()
        try:
            import anyio.to_thread
            _limiter = anyio.to_thread.current_default_thread_limiter()
        except Exception:
            _limiter = None
        _stopping = False
        _beat = time.monotonic()
        _task = asyncio.get_running_loop().create_task(_heartbeat())
        threading.Thread(target=_watch, name="perf-watch", daemon=True).start()
        _started = True
    except Exception:
        logger.exception("perf_watch: could not start the loop watcher")


def stop() -> None:
    """Shutdown: the heartbeat stops ON PURPOSE, which must not read as a stall."""
    global _stopping
    _stopping = True


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
        _active[key] = {"what": f"{scope.get('method', '')} {scope.get('path', '')[:120]}",
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
                    path = scope.get("path", "")
                    # The busiest the server was WHILE it ran — taken at its end,
                    # the request's own thread and DB connection are already back.
                    peak = (rec or {}).get("peak") or snapshot()
                    ev = {"kind": "request", "ms": round(ms), "method": scope.get("method", ""),
                          "path": path[:160], "status": state["status"],
                          "pool": peak.get("pool") or {}, "threads": peak.get("threads") or {},
                          "inflight": peak.get("inflight", 0),
                          "peak": bool((rec or {}).get("peak")),
                          "where": _summary(rec)}
                    logger.warning("[SLOW-REQUEST] %s %s → %s in %.1f s · %s%s",
                                   ev["method"], ev["path"], ev["status"] or "—", ms / 1000,
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
            where = (ev.get("stack") or ["(no app frames on the loop)"])
            out.append(f"🧊 {_clock(ev['at'])} loop held <b>{ev['ms'] / 1000:.1f} s</b> · "
                       f"{html.escape(_pool_line(ev))}\n"
                       + (f"<i>in flight:</i> {html.escape('; '.join(ev['active'][:4]))}\n"
                          if ev.get("active") else "")
                       + (f"<i>other threads:</i> {html.escape('; '.join(ev['others'][:3]))}\n"
                          if ev.get("others") else "")
                       + f"<pre>{html.escape(chr(10).join(where[-6:]))}</pre>")
        else:
            out.append(f"🐢 {_clock(ev['at'])} {html.escape(ev.get('method', ''))} "
                       f"<code>{html.escape(ev.get('path', ''))}</code> → {ev.get('status') or '—'} "
                       f"in <b>{ev['ms'] / 1000:.1f} s</b> · {html.escape(_pool_line(ev))}"
                       + (f"\n<i>time went to:</i> {html.escape(' · '.join(ev['where']))}"
                          if ev.get("where") else ""))
    return out


def _dm(batch: list[dict]) -> None:
    try:
        stalls = [e for e in batch if e["kind"] == "stall"]
        slow = [e for e in batch if e["kind"] == "request"]
        first = min(e["at"] for e in batch)
        head = [
            "🐌 <b>Server was slow</b>",
            f"Since {_clock(first)}: {len(stalls)} freeze(s) of the whole server, "
            f"{len(slow)} slow request(s) (≥ {SLOW_REQUEST_S:.0f} s).",
        ]
        if stalls:
            worst = max(e["ms"] for e in stalls) / 1000
            head.append(f"Longest freeze: {worst:.1f} s — nobody's request was answered meanwhile.")
        paths: dict[str, int] = {}
        for e in slow:
            paths[e["path"]] = paths.get(e["path"], 0) + 1
        if len(paths) > 1:
            top = sorted(paths.items(), key=lambda kv: -kv[1])[:4]
            head.append("Slow most often: " + ", ".join(f"<code>{html.escape(p)}</code> ×{n}" for p, n in top))
        text = "\n".join(head)
        for line in event_lines(batch):
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
