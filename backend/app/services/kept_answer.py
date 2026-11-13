"""An expensive read KEPT between requests, served while it is rebuilt.

The rule the shift report has used since 2026-10-13 (routers/shift_report.py),
made reusable for /api/heatmap (2026-10-24 — «Zagruzka feels slow»: every open
recomputed the whole загрузка for the period). Per key — everything the answer
depends on — an answer is:

- served as it stands for `ttl` seconds (the staleness a page's own
  react-query `staleTime` already accepts);
- older but younger than `stale` seconds, served AT ONCE while ONE new build
  runs behind it on a thread with a session of its own, so the next refetch has
  it — unless the viewer changed something since it was built
  (`leader_register.last_write`), who waits for a build that started after
  their write;
- older than that (or absent), built in the request, sharing one build with
  whoever asks the same at the same time (`shared_build`).

`writer_waits=True` (the «Liderlar KPI» board, 2026-10-24) holds that last
rule inside `ttl` too: a viewer who changed something after the kept answer
was built never gets it, however young — a page whose own buttons (close a
month, start a read) refetch right after must show what they did.

`writers_refresh=True` («Hisobotlar», 2026-11-05) answers that viewer
differently: they ARE served the kept answer, at once, and a build that
started after their write runs behind it. `lookup` says so («refreshing»), and
the page asks again until the new answer lands — the writer sees what they did
a few seconds later instead of waiting for it on a blank page.

`store=…` («Hisobotlar», 2026-11-13) keeps the answers ACROSS RESTARTS too
(`services/kept_store.py`): every answer kept here is also written to the
store, and a key this process does not hold is looked for there before it is
built. An answer ANOTHER process built is never the fresh one — it predates
this process's code, and whatever its viewer wrote before the restart
(`leader_register` remembers a write only since boot): it is served at once,
however old, and rebuilt behind the reader ONCE («refreshing»). From then on
it is an answer of this process and the rules above apply. `ensure` keeps a
key built by the clock, with no reader at all.

The FIGURES are the build's, untouched. Without a store nothing is kept
outside this process and a restart starts empty. Bounded by `max_keys`.

Every instance registers itself, so a writer that changes what ALL of them
answer — the catalog follow moving a cell's positions to another brigadir
(`catalog_follow`), which re-prices days long past — drops them in one call:
`forget_all()`.
"""
from __future__ import annotations

import logging
import threading
import time
import weakref
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Hashable, Optional

from sqlalchemy.orm import Session

from app.services import leader_register, shared_build

log = logging.getLogger(__name__)

# Every KeptAnswers built in this process — weakly, so a test's throwaway
# instance is not kept alive by the registry.
_REGISTRY: "weakref.WeakSet[KeptAnswers]" = weakref.WeakSet()
_REGISTRY_LOCK = threading.Lock()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def forget_all() -> None:
    """Drop every kept answer of every instance — the next request builds."""
    with _REGISTRY_LOCK:
        kept = list(_REGISTRY)
    for k in kept:
        k.forget()


class KeptAnswers:
    def __init__(self, name: str, *, ttl: float = 60, stale: float = 300, max_keys: int = 64,
                 writer_waits: bool = False, writers_refresh: bool = False, store=None):
        self.name = name
        self.ttl = ttl
        self.stale = stale
        self.max_keys = max_keys
        self.writer_waits = writer_waits
        self.writers_refresh = writers_refresh
        self._kept: dict = {}            # key → (monotonic() the build STARTED, answer)
        self._lock = threading.Lock()
        self._flight = shared_build.SharedBuild()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"kept-{name}")
        self._refreshing: set = set()
        self._failed: dict = {}          # key → monotonic() its last background build failed
        self._forgot = 0.0               # monotonic() of the last `forget`
        self._store = store              # None = this process alone (kept_store.DbStore)
        self._seeded: set = set()        # keys whose answer ANOTHER process built
        self._forgot_wall: Optional[datetime] = None   # the last `forget`, on the wall clock
        with _REGISTRY_LOCK:
            _REGISTRY.add(self)

    def _make_room(self, now: float) -> None:
        """Under `_lock`: room for one more key."""
        if len(self._kept) < self.max_keys:
            return
        for k in [k for k, (t, _v) in list(self._kept.items()) if now - t > self.stale]:
            self._kept.pop(k, None)
            self._seeded.discard(k)
        while len(self._kept) >= self.max_keys:
            k = next(iter(self._kept))
            self._kept.pop(k, None)
            self._seeded.discard(k)

    def _put(self, key: Hashable, started: float, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            if started < self._forgot:
                return                   # it read what a `forget` since has declared stale
            old = self._kept.get(key)
            if old is not None and old[0] > started:
                return                   # a build that started later is already kept
            if key not in self._kept:
                self._make_room(now)
            self._kept[key] = (started, value)
            self._seeded.discard(key)    # built here: an answer of this process now
        self._store_put(key, started, value)

    def _store_put(self, key: Hashable, started: float, value: Any) -> None:
        """Write a kept answer through to the store — outside `_lock`, it is
        database work. A store's fault leaves the answer kept here alone."""
        if self._store is None:
            return
        try:
            built_at = _utcnow() - timedelta(seconds=max(0.0, time.monotonic() - started))
            self._store.save(key, built_at, value)
            with self._lock:
                forgotten = started < self._forgot
            if forgotten:                # a `forget` landed while it was being written
                self._store.delete(key)
        except Exception:  # noqa: BLE001
            log.exception("kept answer %s: not written to its store", self.name)

    def _entry(self, key: Hashable) -> tuple:
        """What is held for `key` — ((build started, answer) or None, whether
        ANOTHER process built it). A key this process does not hold is looked
        for in the store and, found, held here from then on."""
        with self._lock:
            hit = self._kept.get(key)
            if hit is not None or self._store is None:
                return hit, key in self._seeded
        try:
            got = self._store.load(key)
        except Exception:  # noqa: BLE001 — a miss: the caller builds
            log.exception("kept answer %s: its store could not be read", self.name)
            got = None
        if got is None:
            return None, False
        built_at, value = got
        now = time.monotonic()
        started = now - max(0.0, (_utcnow() - built_at).total_seconds())
        with self._lock:
            cur = self._kept.get(key)
            if cur is not None:          # a build landed while the store was read
                return cur, key in self._seeded
            if self._forgot_wall is not None and built_at <= self._forgot_wall:
                return None, False       # written before a `forget`: declared stale
            self._make_room(now)
            self._kept[key] = (started, value)
            self._seeded.add(key)
            return (started, value), True

    def get(self, db: Session, payload: dict, key: Hashable,
            build: Callable[[Session], Any]) -> Any:
        """The answer for `key`; `build(session)` computes it."""
        return self.lookup(db, payload, key, build)[0]

    def lookup(self, db: Session, payload: dict, key: Hashable,
               build: Callable[[Session], Any]) -> tuple[Any, str]:
        """`get`, and how the answer was come by: «kept» (served as kept),
        «refreshing» (served as kept while a new build runs behind it — the
        caller may ask again in a moment for the new one) or «built» (built in
        this request, or taken from a build somebody else had started)."""
        value, state, _source = self.lookup_from(db, payload, key, build)
        return value, state

    def lookup_from(self, db: Session, payload: dict, key: Hashable,
                    build: Callable[[Session], Any]) -> tuple[Any, str, str]:
        """`lookup`, and WHERE the answer was: «built» (as above), «memory»
        (this process built it earlier) or «store» (another process did).
        Decided with the answer in hand — the build a «store» answer starts
        behind the reader may land a moment later, and asking `seeded` after
        the fact would then say «memory» of an answer that was not."""
        hit, seeded = self._entry(key)
        if hit is not None and seeded:
            # Another process built it: served at once, whatever its age, and
            # rebuilt behind — by this process's code, after anything written
            # before the restart. Never «fresh», so never served as kept
            # without that build; one that failed is tried again in a minute.
            running = self._refresh_later(key, build)
            return hit[1], "refreshing" if running else "kept", "store"
        if hit is not None:
            started, value = hit
            age = time.monotonic() - started
            fresh = started > leader_register.last_write(payload)
            if age < self.ttl and (fresh or not self.writer_waits):
                return value, "kept", "memory"
            if age < self.stale and (fresh or self.writers_refresh):
                running = self._refresh_later(key, build)
                return value, "refreshing" if running else "kept", "memory"

        def run():
            t0 = time.monotonic()
            value = build(db)
            self._put(key, t0, value)
            return value

        return self._flight.run(key, run, before_wait=db.rollback), "built", "built"

    def _refresh_later(self, key: Hashable, build: Callable[[Session], Any]) -> bool:
        """Start one build of `key` behind the reader. True while one is
        running; False when none will (one failed under a minute ago, or the
        pool is gone) — the answer served is then simply the kept one."""
        with self._lock:
            if key in self._refreshing:
                return True
            # A build that just failed is not tried again on every poll of a
            # page asking whether it has landed — once a minute at most.
            if time.monotonic() - self._failed.get(key, -1e9) < 60:
                return False
            self._refreshing.add(key)

        def go():
            from app.database import SessionLocal
            try:
                with SessionLocal() as s:
                    t0 = time.monotonic()
                    value = build(s)
                self._put(key, t0, value)
                with self._lock:
                    self._failed.pop(key, None)
            except Exception:  # noqa: BLE001 — the next request builds inline
                with self._lock:
                    self._failed[key] = time.monotonic()
                log.exception("kept answer %s: background rebuild failed", self.name)
            finally:
                with self._lock:
                    self._refreshing.discard(key)

        try:
            self._pool.submit(go)
        except Exception:  # noqa: BLE001 — a pool shut down at exit
            with self._lock:
                self._refreshing.discard(key)
            return False
        return True

    def ensure(self, key: Hashable, build: Callable[[Session], Any], max_age: float) -> str:
        """Keep `key` built with NO reader — for a job that keeps an answer
        ready by the clock. «kept»: what is held (here, or in the store) is
        younger than `max_age` seconds and nothing was done; «refreshing»: a
        build of it is already running behind a reader; «built»: built now, on
        the calling thread with a session of its own, sharing a build a request
        has in flight. An answer the store handed over stays one another
        process built — its first reader still has it rebuilt behind them."""
        hit, _seeded = self._entry(key)
        if hit is not None and time.monotonic() - hit[0] < max_age:
            return "kept"
        with self._lock:
            if key in self._refreshing:
                return "refreshing"

        def run():
            from app.database import SessionLocal
            t0 = time.monotonic()
            with SessionLocal() as s:
                value = build(s)
            self._put(key, t0, value)
            return value

        self._flight.run(key, run)
        return "built"

    def seeded(self, key: Hashable) -> bool:
        """Whether the answer held for `key` is one another process built."""
        with self._lock:
            return key in self._seeded

    def drop(self, key: Hashable) -> None:
        """Let go of ONE answer, here and in the store — the next request for
        it builds. For an answer its reader found it can no longer use."""
        with self._lock:
            self._kept.pop(key, None)
            self._seeded.discard(key)
        if self._store is not None:
            try:
                self._store.delete(key)
            except Exception:  # noqa: BLE001
                log.exception("kept answer %s: not deleted from its store", self.name)

    def prune(self) -> int:
        """Delete the store's rows too old to be read. 0 without a store."""
        if self._store is None:
            return 0
        try:
            return int(self._store.prune() or 0)
        except Exception:  # noqa: BLE001
            log.exception("kept answer %s: its store was not pruned", self.name)
            return 0

    def peek(self) -> list[tuple[float, Hashable, Any]]:
        """Every answer kept and younger than `stale`, as (age seconds, key,
        answer) — newest first. A READ of what is already kept: it never
        builds, never refreshes. For a page that may show another page's
        figure only when that page has already computed it («Xodim kartasi»
        reading the «Liderlar KPI» board). The answers are shared: read them,
        never change them."""
        now = time.monotonic()
        with self._lock:
            items = [(now - t, k, v) for k, (t, v) in self._kept.items()
                     if t >= self._forgot and now - t < self.stale]
        items.sort(key=lambda x: x[0])
        return items

    def forget(self) -> None:
        """Drop every kept answer — the store's too. A build already running
        when this is called read the old data: its answer goes to its own
        caller and is not kept."""
        with self._lock:
            self._forgot = time.monotonic()
            self._forgot_wall = _utcnow()
            self._kept.clear()
            self._seeded.clear()
        if self._store is not None:
            try:
                self._store.clear()
            except Exception:  # noqa: BLE001 — `_forgot_wall` still keeps its rows out
                log.exception("kept answer %s: its store was not cleared", self.name)
