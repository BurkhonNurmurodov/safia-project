"""Startup in TWO phases: what a request needs, then everything else.

Until 2026-10-18 the lifespan ran every startup step — ~230 of them — before
the server took its first connection: the schema migrations, but also the
flag-guarded one-shots, the data backfills, the boot reports that DM the
operator, the Telegram webhook call and the verdict re-derive that walks the
whole AI corpus. On production that was a minute or more, and for that minute
nothing answered (a Cloudflare 502 before the supervisor, «Server
yangilanmoqda» behind it; and during a swap, two workers in memory).

Now the lifespan calls `boot.run(step)` for what MUST precede serving — the
schema (`create_all`, every `add_*` / `migrate_*` column and index), the seeds
a first request resolves against, the scheduler and its job registrations,
the warm import — and `boot.later(step)` for everything else, which runs on a
thread, in the same order as before, once the worker has told the supervisor
it is ready. Two rules for a new startup step:

  * a column, an index, a table, anything a request could hit → `run`;
  * a data fix, a seed behind a flag, a report, a DM, a sync → `later`.

A `run` step that raises still fails the boot (uvicorn exits 3; deploy.sh
rolls back) — exactly as before. A `later` step that raises is recorded and
the next steps still run; the boot report names it to the support chat, so a
failure is seen without taking the site down over a report that could not be
sent. Each step is timed; a step over half a second prints its time, and the
summary line names the slowest, so the journal says where a boot's seconds go.

perf_watch starts only after the deferred work has finished — the walks it
does hold the GIL and would read as freezes of a server that is, for the
first time, actually serving meanwhile.
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Callable, Optional

SLOW_STEP_S = 0.5


def _name(fn: Callable) -> str:
    return getattr(fn, "__name__", None) or repr(fn)


class Phases:
    def __init__(self) -> None:
        self.t0: Optional[float] = None
        self.ready_s: Optional[float] = None
        self.deferred_s: Optional[float] = None
        self.steps: list[tuple[str, float, str]] = []      # (name, seconds, "boot" | "later")
        self.failed: list[tuple[str, str]] = []
        self._queue: list[tuple[Callable, tuple, dict]] = []
        self._thread: Optional[threading.Thread] = None
        self._done = threading.Event()

    # -- phase one: on the loop, before readiness --------------------------

    def begin(self) -> None:
        self.t0 = time.monotonic()

    def run(self, fn: Callable, *args, **kwargs):
        """Run `fn` now, timed. An exception propagates: the boot fails."""
        started = time.monotonic()
        try:
            return fn(*args, **kwargs)
        finally:
            took = time.monotonic() - started
            self.steps.append((_name(fn), took, "boot"))
            if took >= SLOW_STEP_S:
                print(f"[startup] {_name(fn)} took {took:.1f} s", flush=True)

    def later(self, fn: Callable, *args, **kwargs) -> None:
        """Queue `fn` for the thread that starts once the worker is ready."""
        self._queue.append((fn, args, kwargs))

    def ready(self) -> None:
        self.ready_s = time.monotonic() - (self.t0 or time.monotonic())
        n = sum(1 for s in self.steps if s[2] == "boot")
        print(f"[startup] ready for requests after {self.ready_s:.1f} s "
              f"({n} steps run, {len(self._queue)} deferred to a thread)", flush=True)

    # -- phase two: on a thread, while serving -----------------------------

    def start_deferred(self, finally_: Optional[Callable] = None) -> None:
        self._thread = threading.Thread(target=self._drain, args=(finally_,),
                                        name="startup-deferred", daemon=True)
        self._thread.start()

    def _drain(self, finally_: Optional[Callable]) -> None:
        t0 = time.monotonic()
        for fn, args, kwargs in self._queue:
            name = _name(fn)
            started = time.monotonic()
            try:
                fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 — recorded, reported, never fatal here
                self.failed.append((name, f"{type(exc).__name__}: {exc}"[:300]))
                print(f"[startup] deferred step {name} FAILED: {exc!r}", flush=True)
                traceback.print_exc()
            took = time.monotonic() - started
            self.steps.append((name, took, "later"))
            if took >= SLOW_STEP_S:
                print(f"[startup] (later) {name} took {took:.1f} s", flush=True)
        self.deferred_s = time.monotonic() - t0
        slow = self.slowest("later")
        line = f"[startup] deferred startup work done in {self.deferred_s:.1f} s ({len(self._queue)} steps"
        if slow:
            line += "; slowest: " + ", ".join(f"{n} {t:.1f} s" for n, t in slow)
        if self.failed:
            line += "; FAILED: " + ", ".join(n for n, _ in self.failed)
        print(line + ")", flush=True)
        self._done.set()
        if finally_ is not None:
            try:
                finally_()
            except Exception:  # noqa: BLE001
                traceback.print_exc()

    # -- readers ------------------------------------------------------------

    def wait(self, timeout: float) -> bool:
        """True once the deferred work has finished (False after `timeout`)."""
        return self._done.wait(timeout)

    def join(self, timeout: float) -> None:
        """At shutdown: let the deferred work finish rather than die mid-step."""
        if self._thread is not None and self._thread.is_alive():
            print(f"[shutdown] waiting up to {timeout:.0f} s for the deferred startup work", flush=True)
            self._thread.join(timeout)
            if self._thread.is_alive():
                print("[shutdown] deferred startup work still running — exiting anyway", flush=True)

    def slowest(self, phase: str, n: int = 3) -> list[tuple[str, float]]:
        steps = sorted((s for s in self.steps if s[2] == phase), key=lambda s: -s[1])[:n]
        return [(name, took) for name, took, _ in steps if took >= SLOW_STEP_S]

    def summary(self) -> dict:
        return {
            "ready_s": self.ready_s,
            "deferred_s": self.deferred_s,
            "deferred_running": self._thread is not None and not self._done.is_set(),
            "deferred_queued": len(self._queue),
            "slowest_boot": self.slowest("boot"),
            "slowest_later": self.slowest("later"),
            "failed": list(self.failed),
        }


boot = Phases()
