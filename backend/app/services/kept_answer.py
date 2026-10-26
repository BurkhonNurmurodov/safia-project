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

The FIGURES are the build's, untouched; nothing is stored outside this
process, and a restart starts empty. Bounded by `max_keys`.

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
from typing import Any, Callable, Hashable

from sqlalchemy.orm import Session

from app.services import leader_register, shared_build

log = logging.getLogger(__name__)

# Every KeptAnswers built in this process — weakly, so a test's throwaway
# instance is not kept alive by the registry.
_REGISTRY: "weakref.WeakSet[KeptAnswers]" = weakref.WeakSet()
_REGISTRY_LOCK = threading.Lock()


def forget_all() -> None:
    """Drop every kept answer of every instance — the next request builds."""
    with _REGISTRY_LOCK:
        kept = list(_REGISTRY)
    for k in kept:
        k.forget()


class KeptAnswers:
    def __init__(self, name: str, *, ttl: float = 60, stale: float = 300, max_keys: int = 64,
                 writer_waits: bool = False):
        self.name = name
        self.ttl = ttl
        self.stale = stale
        self.max_keys = max_keys
        self.writer_waits = writer_waits
        self._kept: dict = {}            # key → (monotonic() the build STARTED, answer)
        self._lock = threading.Lock()
        self._flight = shared_build.SharedBuild()
        self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"kept-{name}")
        self._refreshing: set = set()
        with _REGISTRY_LOCK:
            _REGISTRY.add(self)

    def _put(self, key: Hashable, started: float, value: Any) -> None:
        now = time.monotonic()
        with self._lock:
            old = self._kept.get(key)
            if old is not None and old[0] > started:
                return                   # a build that started later is already kept
            if key not in self._kept and len(self._kept) >= self.max_keys:
                for k in [k for k, (t, _v) in list(self._kept.items()) if now - t > self.stale]:
                    self._kept.pop(k, None)
                while len(self._kept) >= self.max_keys:
                    self._kept.pop(next(iter(self._kept)), None)
            self._kept[key] = (started, value)

    def get(self, db: Session, payload: dict, key: Hashable,
            build: Callable[[Session], Any]) -> Any:
        """The answer for `key`; `build(session)` computes it."""
        with self._lock:
            hit = self._kept.get(key)
        if hit is not None:
            started, value = hit
            age = time.monotonic() - started
            fresh = started > leader_register.last_write(payload)
            if age < self.ttl and (fresh or not self.writer_waits):
                return value
            if age < self.stale and fresh:
                self._refresh_later(key, build)
                return value

        def run():
            t0 = time.monotonic()
            value = build(db)
            self._put(key, t0, value)
            return value

        return self._flight.run(key, run, before_wait=db.rollback)

    def _refresh_later(self, key: Hashable, build: Callable[[Session], Any]) -> None:
        with self._lock:
            if key in self._refreshing:
                return
            self._refreshing.add(key)

        def go():
            from app.database import SessionLocal
            try:
                with SessionLocal() as s:
                    t0 = time.monotonic()
                    self._put(key, t0, build(s))
            except Exception:  # noqa: BLE001 — the next request builds inline
                log.exception("kept answer %s: background rebuild failed", self.name)
            finally:
                with self._lock:
                    self._refreshing.discard(key)

        try:
            self._pool.submit(go)
        except Exception:  # noqa: BLE001 — a pool shut down at exit
            with self._lock:
                self._refreshing.discard(key)

    def forget(self) -> None:
        with self._lock:
            self._kept.clear()
