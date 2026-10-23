"""Requests asking the SAME question at the same time share ONE computation.

The rule the leaders board proved (`routers/leaders._shared_feed`, 2026-10-07),
for any key: a request only ever takes a build that STARTED after it arrived,
so nobody is handed an answer read before a write they are looking for (an
admin's own save, then the refetch). Requests arriving while a build runs share
the NEXT one; per key at most one build runs. Nothing is kept once a build is
done — the next request starts a new one — so this is never a cache.

Born of the 2026-10-09 «Server was slow» report: at the 08:57 morning rush
/api/heatmap ran 22 at once with the DB pool full, every one of them computing
the same fortnight of the same plant.

The value is SHARED: a caller must treat it as read-only (an endpoint returning
it as its JSON answer is fine — encoding never writes to it).

EVERY build is registered, so per key at most one ever runs (2026-10-23). A
request that waited WAIT_S for a build, or whose second build in a row failed,
answers a JSON 503 «still_building» instead of starting a build of its own.
Until then such a request ran an UNREGISTERED build nobody could share, and the
client's own retries of a Cloudflare 524 (100 s) fed it: on 23 Oct the ~50-
minute «Brigadirlar reytingi» build could run in several copies at once, each
holding a pool connection. A build that FAILS once is simply started again,
registered and shared, so one transient error does not fail every waiter.
"""
from __future__ import annotations

import threading
from typing import Any, Callable, Hashable, Optional

from fastapi import HTTPException

WAIT_S = 120.0


def _busy() -> HTTPException:
    # No X-Safia-Restarting: the client must not read it as a restart and retry.
    return HTTPException(
        status_code=503,
        detail="This is still being calculated — open it again in a minute.",
        headers={"Retry-After": "60"},
    )


class _Flight:
    __slots__ = ("seq", "done", "ok", "value")

    def __init__(self, seq: int):
        self.seq = seq                  # taken from the counter at creation
        self.done = threading.Event()
        self.ok = False
        self.value: Any = None


class SharedBuild:
    def __init__(self, wait_s: float = WAIT_S):
        self._lock = threading.Lock()
        self._seq = 0
        self._flights: dict[Hashable, _Flight] = {}
        self._wait_s = wait_s

    def run(self, key: Hashable, build: Callable[[], Any],
            before_wait: Optional[Callable[[], None]] = None) -> Any:
        """`build()` once for every request with this `key` that arrives
        before the build starts. `before_wait` runs once, just before this
        request first waits on somebody else's build — the place to hand a DB
        connection back to the pool (a waiting request needs none)."""
        with self._lock:
            self._seq += 1
            arrived = self._seq
        failures = 0
        while True:
            mine = False
            with self._lock:
                f = self._flights.get(key)
                if f is None:
                    self._seq += 1
                    f = self._flights[key] = _Flight(self._seq)
                    mine = True
            if mine:
                try:
                    f.value = build()
                    f.ok = True
                finally:
                    with self._lock:
                        if self._flights.get(key) is f:
                            del self._flights[key]
                    f.done.set()
                return f.value
            if before_wait is not None:
                before_wait()
                before_wait = None
            if f.seq > arrived:
                # Started after this request arrived: its answer is fresh enough.
                if not f.done.wait(self._wait_s):
                    raise _busy()       # hung: never a second, unshared build
                if f.ok:
                    return f.value
                failures += 1
                if failures > 1:
                    raise _busy()
                continue                # it failed: take or start the next, shared
            # Started before this request arrived: wait it out, then take (or
            # start) the build after it.
            if not f.done.wait(self._wait_s):
                raise _busy()
