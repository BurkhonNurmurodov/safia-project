"""The boot report — why THIS process is running, told to the support chat.

Until 2026-10-18 nothing recorded a boot: a process that died and was started
again by systemd left no trace but a Cloudflare 502 page in somebody's hand,
and our own stall report called every restart "a deploy". Now every worker
boot reads what the supervisor (app/supervisor.py) recorded since the last
report — how the previous worker died (its exit signal, its memory and the
host's free memory at that moment, how long it had lived), how long the
fallback answered for it — and DMs the support chat (the perf_watch
recipients) whenever the boot was anything but an ordinary deploy swap:

  • a worker the supervisor replaced after it DIED, with the verdict
    (SIGKILL on a host with no memory left = the OOM killer; SIGSEGV = a
    native library of ours; a Python exit code = our code);
  • a worker that failed to start, and the retry;
  • the whole unit (re)started with the SAME code — systemd restarted it,
    which is a crash of the supervisor, a host reboot or a `systemctl
    restart`, never a deploy;
  • a full restart for a deploy (the supervisor's own file changed), which
    is the one deploy that still leaves a gap.

An ordinary swap (SIGHUP from deploy.sh, the old worker serving until the new
one was ready) is QUIET — three to twenty a day would bury the one line that
matters. Without a supervisor (plain uvicorn) the report sends only when the
commit equals the previous boot's: the same code booting again is a restart
nobody deployed. Nothing here is on the request path; it runs on a thread a
few seconds after the lifespan has finished.
"""
from __future__ import annotations

import html
import json
import logging
import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from app import supervisor as sup
from app.version import APP_VERSION, STARTED_AT, current_commit

logger = logging.getLogger(__name__)


def _esc(value) -> str:
    """Telegram's HTML wants only &, < and > escaped — never the apostrophes."""
    return html.escape(str(value), quote=False)

CURSOR_FILE = os.path.join(sup.DATA_DIR, "boot-report.cursor")
LAST_BOOT_FILE = os.path.join(sup.DATA_DIR, "last-boot.json")
# Below this much free memory a SIGKILL is read as the kernel's OOM killer.
OOM_FREE_KB = 300 * 1024
_NATIVE = {"SIGSEGV", "SIGBUS", "SIGABRT", "SIGFPE", "SIGILL"}
_ASKED = {"SIGTERM", "SIGINT", "SIGHUP", "SIGQUIT"}


def schedule(delay_s: float = 4.0) -> None:
    """Called at the end of app.main's lifespan. Waits a few seconds so the
    supervisor has recorded this worker as ready and the bot is up."""
    threading.Thread(target=_run, args=(delay_s,), name="boot-report", daemon=True).start()


def _run(delay_s: float) -> None:
    try:
        time.sleep(delay_s)
        # The deferred startup work (services/boot_steps.py): wait for it, so
        # the report can say what it cost — or that it is still running.
        from app.services.boot_steps import boot
        boot.wait(90)
        built = build()
        _remember_boot()
        if built is None:
            return
        text, send = built
        logger.info("boot report%s: %s", "" if send else " (quiet)", text.replace("\n", " | "))
        if not send:
            return
        from app.config import settings
        if not settings.is_production:
            return
        _dm(text)
    except Exception:  # noqa: BLE001
        logger.exception("boot report failed")


# ── building it ──────────────────────────────────────────────────────────────

def build() -> Optional[tuple[str, bool]]:
    """(text, send) for this boot, consuming the supervisor's unreported events."""
    commit = current_commit()
    last = _read_json(LAST_BOOT_FILE) or {}
    supervised = sup.supervised()
    gen = sup.worker_gen()
    cursor = _read_cursor()
    events = [e for e in _read_events() if int(e.get("seq") or 0) > cursor]
    max_seq = max([int(e.get("seq") or 0) for e in events], default=cursor)

    mine = next((e for e in events if e.get("kind") == "worker_spawned" and e.get("gen") == gen), None)
    ready = next((e for e in events if e.get("kind") == "worker_ready" and e.get("gen") == gen), None)
    deaths = [e for e in events if e.get("kind") == "worker_died"]
    failures = [e for e in events if e.get("kind") == "worker_failed"]
    reason = (mine or {}).get("reason") or os.environ.get("SAFIA_WORKER_REASON") or ("start" if supervised else "plain")
    same_code = bool(commit) and last.get("commit") == commit
    prev_version = last.get("version")

    lines = [f"🟢 <b>Server started</b> · v{_esc(APP_VERSION)} · pid {os.getpid()}"
             + (f" · worker gen {gen}" if supervised else " · plain uvicorn, no supervisor")]

    if supervised:
        if reason == "reload":
            why = "a deploy swap — the previous worker kept serving until this one was ready"
            if same_code:
                why += " (the same code: a forced reload)"
            send = bool(deaths or failures)
        elif reason == "crash":
            why = "the previous worker DIED and the supervisor started this one"
            send = True
        elif reason == "retry":
            why = "a retry after a worker failed to start"
            send = True
        elif not last:
            why = "the first boot under the supervisor"
            send = True
        elif same_code:
            why = ("the whole unit was started again with the SAME code — not a deploy: systemd restarted it "
                   "(the supervisor died, the host rebooted, or somebody ran systemctl restart)")
            send = True
        else:
            why = (f"a full restart for a deploy (v{_esc(str(prev_version))} → v{_esc(APP_VERSION)}) — "
                   "the one kind of deploy that still leaves a gap")
            send = True
    else:
        if not last:
            why = "first recorded boot"
            send = False
        elif same_code:
            why = ("the SAME code started again — not a deploy: a crash or a kill "
                   "(journalctl -u safia-production on the box says which)")
            send = True
        else:
            why = f"a deploy restart (v{_esc(str(prev_version))} → v{_esc(APP_VERSION)})"
            send = False
    lines.append(f"Reason: {why}.")

    boot_s = (ready or {}).get("boot_s")
    if boot_s is None:
        boot_s = _process_age_s()
    when = _local(STARTED_AT)
    if boot_s is not None:
        lines.append(f"Boot took {_dur(float(boot_s))} (process started {when}, commit {_esc(str(commit))}).")
    from app.services.boot_steps import boot
    ph = boot.summary()
    if ph.get("ready_s") is not None:
        line = f"The startup work a request needs took {_dur(ph['ready_s'])}"
        if ph.get("deferred_running"):
            line += f"; the deferred startup work ({ph['deferred_queued']} steps) is still running"
        elif ph.get("deferred_s") is not None:
            line += f"; the deferred startup work took {_dur(ph['deferred_s'])} more on a thread"
        slow = ph.get("slowest_later") or ph.get("slowest_boot")
        if slow:
            line += " (slowest: " + ", ".join(f"{_esc(n)} {_dur(t)}" for n, t in slow[:2]) + ")"
        lines.append(line + ".")
    for name, err in ph.get("failed") or []:
        lines.append(f"⚠ Deferred startup step <code>{_esc(name)}</code> failed: {_esc(err)}.")
        send = True
    fb_s, fb_n = (ready or {}).get("fallback_s"), (ready or {}).get("fallback_served")
    if fb_s:
        lines.append(f"Meanwhile the supervisor answered {fb_n or 0} request(s) over {_dur(float(fb_s))} "
                     "with «Server yangilanmoqda» instead of a 502.")

    for e in deaths:
        lines.append(_death_line(e))
    for e in failures:
        lines.append(f"⚠ A worker (gen {e.get('gen')}, {_esc(str(e.get('reason')))}) failed to start at "
                     f"{_local(e.get('t'))} after {_dur(float(e.get('after_s') or 0))}: {_esc(_how(e))}.")
    restarts = _systemd_restarts()
    if restarts:
        lines.append(f"systemd has restarted the unit {restarts} time(s) since it was last started by hand "
                     "— that many times the main process itself died.")
    _write_cursor(max_seq)
    return "\n".join(lines), send


def _death_line(e: dict) -> str:
    mem = e.get("mem") or {}
    bits = [f"its memory was {_gb(e.get('rss_kb'))}"] if e.get("rss_kb") else []
    if mem.get("MemAvailable") is not None:
        bits.append(f"the host had {_mb(mem['MemAvailable'])} free")
    if mem.get("SwapUsed"):
        bits.append(f"{_gb(mem['SwapUsed'])} in swap")
    tail = (" — " + ", ".join(bits)) if bits else ""
    return (f"🔴 Previous worker (gen {e.get('gen')}) stopped at {_local(e.get('t'))} after "
            f"{_dur(float(e.get('uptime_s') or 0))}: {_esc(_how(e))}{tail} → {_esc(_verdict(e))}.")


def _how(e: dict) -> str:
    if e.get("signal_name"):
        return f"killed by {e['signal_name']}"
    if e.get("exit_code") is not None:
        return f"exited with code {e['exit_code']}"
    return "ended, how is unknown"


def _verdict(e: dict) -> str:
    name = e.get("signal_name")
    mem = e.get("mem") or {}
    if name == "SIGKILL":
        avail = mem.get("MemAvailable")
        swapped = mem.get("SwapUsed") or 0
        total_swap = mem.get("SwapTotal") or 0
        if (avail is not None and avail < OOM_FREE_KB) or (total_swap and swapped > 0.5 * total_swap):
            return "most likely the kernel's OOM killer: the host had run out of memory"
        return "SIGKILL with memory to spare: the OOM killer or somebody's kill -9 (the kernel log on the box says which)"
    if name in _NATIVE:
        return "a crash in native code — a C library of ours (Pillow, numpy, the database driver); faulthandler's traceback is in the journal"
    if name in _ASKED:
        return "stopped by a signal — systemctl stop/restart or a kill"
    if name:
        return f"ended by {name}"
    code = e.get("exit_code")
    if code == 3:
        return "uvicorn: the app's startup failed (the traceback is in the journal)"
    if code == 0:
        return "exited cleanly on its own, which a server never should"
    return "a Python-level exit — see the journal"


# ── facts about this process / the box ──────────────────────────────────────

def _process_age_s() -> Optional[float]:
    try:
        with open("/proc/self/stat", "r", encoding="ascii") as fh:
            fields = fh.read().rsplit(")", 1)[1].split()
        start_ticks = int(fields[19])              # field 22 overall, 20th after the comm
        with open("/proc/uptime", "r", encoding="ascii") as fh:
            uptime = float(fh.read().split()[0])
        return max(0.0, uptime - start_ticks / os.sysconf("SC_CLK_TCK"))
    except (OSError, ValueError, IndexError):
        return None


def _systemd_unit() -> Optional[str]:
    try:
        with open("/proc/self/cgroup", "r", encoding="utf-8") as fh:
            for line in fh:
                for part in line.strip().split("/"):
                    if part.endswith(".service"):
                        return part
    except OSError:
        return None
    return None


def _systemd_restarts() -> int:
    unit = _systemd_unit()
    if not unit:
        return 0
    try:
        out = subprocess.run(["systemctl", "show", "-p", "NRestarts", "--value", unit],
                             capture_output=True, text=True, timeout=3)
        return int((out.stdout or "0").strip() or 0)
    except (OSError, ValueError, subprocess.SubprocessError):
        return 0


# ── files ────────────────────────────────────────────────────────────────────

def _read_json(path: str) -> Optional[dict]:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def _read_events() -> list[dict]:
    out: list[dict] = []
    for path in (sup.EVENTS_FILE + ".1", sup.EVENTS_FILE):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except ValueError:
                        continue
                    if isinstance(rec, dict):
                        out.append(rec)
        except OSError:
            continue
    return out


def _read_cursor() -> int:
    try:
        with open(CURSOR_FILE, "r", encoding="ascii") as fh:
            return int(fh.read().strip() or 0)
    except (OSError, ValueError):
        return 0


def _write_cursor(seq: int) -> None:
    try:
        os.makedirs(sup.DATA_DIR, exist_ok=True)
        with open(CURSOR_FILE, "w", encoding="ascii") as fh:
            fh.write(str(seq))
    except OSError:
        pass


def _remember_boot() -> None:
    try:
        os.makedirs(sup.DATA_DIR, exist_ok=True)
        tmp = LAST_BOOT_FILE + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump({"commit": current_commit(), "version": APP_VERSION, "at": STARTED_AT,
                       "gen": sup.worker_gen(), "supervised": sup.supervised(), "pid": os.getpid()}, fh)
        os.replace(tmp, LAST_BOOT_FILE)
    except OSError:
        pass


# ── words ────────────────────────────────────────────────────────────────────

def _local(iso: Optional[str]) -> str:
    if not iso:
        return "?"
    try:
        dt = datetime.fromisoformat(str(iso))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        try:
            from zoneinfo import ZoneInfo
            dt = dt.astimezone(ZoneInfo("Asia/Tashkent"))
        except Exception:  # noqa: BLE001 — no tz database: UTC+5 by hand
            from datetime import timedelta
            dt = dt.astimezone(timezone(timedelta(hours=5)))
        return dt.strftime("%d.%m %H:%M:%S")
    except ValueError:
        return str(iso)


def _dur(seconds: float) -> str:
    s = int(round(seconds))
    if s < 90:
        return f"{s} s"
    m, s = divmod(s, 60)
    if m < 60:
        return f"{m} min {s} s" if s else f"{m} min"
    h, m = divmod(m, 60)
    if h < 48:
        return f"{h} h {m} min" if m else f"{h} h"
    d, h = divmod(h, 24)
    return f"{d} d {h} h"


def _mb(kb) -> str:
    mb = int(kb) / 1024
    return f"{mb / 1024:.1f} GB" if mb >= 1024 else f"{mb:.0f} MB"


def _gb(kb) -> str:
    return f"{int(kb) / 1024 / 1024:.2f} GB"


def _dm(text: str) -> None:
    from app.routers.boot import _recipients     # lazily: a service never imports a router at load
    from app.telegram_bot import bot
    for chat_id in _recipients():
        try:
            bot.send_message(chat_id, text, parse_mode="HTML")
        except Exception as exc:  # noqa: BLE001
            logger.warning("boot report DM to %s failed: %s", chat_id, exc)
