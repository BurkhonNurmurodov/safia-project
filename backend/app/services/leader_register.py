"""The /api/leaders register, KEPT between requests.

The register is the platform's heaviest read — the whole checklist history,
assembled from twenty-odd tables and serialised to ~20 MB — and until
2026-10-12 it was rebuilt from scratch on every request: an admin tabbing back
to Monitoring paid 7–9 s on production (the «Server was slow» DMs named it in
every report for a week), and the shared-flight rule only helped the requests
that arrived while a build was already running. Nothing was kept once a build
was done.

Now ONE build is kept — the unscoped («see all») one, which is the same for
every viewer bar the header and a cutoff's reason — and a request is answered
from it under three rules, in this order:

1. **Nothing it read has changed → served, at once.** `fingerprint()` is one
   query over every table the build reads: per table the row count and the
   newest transaction that touched a row (`xmin`), which moves on every
   committed insert, update or delete. The big per-day tables are counted over
   CLOSED days only — a leader answering a task on an open day changes nothing
   the register shows and must not throw the build away. The fingerprint is
   taken BEFORE a build starts, so a change landing during the build reads as
   changed at the next request. Exact: a kept build is served only while the
   database would produce the same one.
2. **Something changed, but the kept build is young (`STALE_MAX_S`) → served,
   and a new one is built in the background.** A verdict landing or a day
   closing elsewhere does not make a viewer who did nothing wait 8 s; their
   next refetch (react-query's 60 s staleTime, or the next focus) gets the new
   build. Bounded: older than that, the request waits for the rebuild.
3. **The viewer WROTE something since the kept build started → never served
   it.** A ruling, an override, an exclusion, a sheet refresh — then the
   refetch — must show the write. `wrote(actor)` is called for every mutating
   request (the action-log middleware, before the response leaves) and every
   bot act (`record_bot`), keyed by the Telegram account, so it needs no door
   per endpoint and cannot miss one. The viewer then waits for a build that
   started after their write, sharing it with anybody else waiting.

Rebuilds share one flight exactly as before: at most one build runs, a request
takes only a build that started after it arrived, and a failed build costs
nobody else theirs. What is kept is BYTES (the `data` list already encoded),
not the dict: a 20 MB JSON string is a fraction of the memory of the two
hundred thousand dicts behind it, and a served request skips the encode too.

Postgres only (`xmin`); on any other database every request builds, as before.
"""
from __future__ import annotations

import logging
import threading
from time import monotonic
from typing import Callable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, engine

log = logging.getLogger(__name__)

# A kept build whose inputs have moved is still served while it is younger
# than this, with a rebuild started behind it. Beyond it the request waits.
STALE_MAX_S = 180.0
# How long a request waits on a build somebody else is running.
FLIGHT_WAIT_S = 120.0


class Build:
    """One finished build: the encoded rows plus the small per-viewer parts."""
    __slots__ = ("fp", "started", "done_at", "data", "roster", "cutoffs",
                 "cut_units", "last_synced", "rows")

    def __init__(self, *, data: bytes, roster: list, cutoffs: dict,
                 cut_units: dict, last_synced, rows: int):
        self.fp: tuple = ()
        self.started: float = 0.0
        self.done_at: float = 0.0
        self.data = data
        self.roster = roster
        self.cutoffs = cutoffs
        self.cut_units = cut_units
        self.last_synced = last_synced
        self.rows = rows


class _Flight:
    __slots__ = ("started", "done", "build")

    def __init__(self, started: float):
        self.started = started
        self.done = threading.Event()
        self.build: Optional[Build] = None   # None once done = the build failed


_lock = threading.Lock()
_kept: Optional[Build] = None
_flight: Optional[_Flight] = None
_writes: dict[str, float] = {}     # actor → monotonic() of their last write


# ── what the build reads ─────────────────────────────────────────────────────
# One arm per table `routers.leaders._leaders_feed` reads, directly or through
# a helper (leader_bot, leader_ai, leader_auto, leader_exclusions,
# leader_cutoffs, leader_load, leader_cells, name_map). A table added to the
# build is a line added here — a kept build is exact only while this list is.
# `xmin::text::bigint` is the id of the transaction that last wrote the row;
# Postgres keeps it through a freeze (the hint bit moves, the value stays), so
# `max()` over it changes on every update and every insert, and `count()`
# catches a delete. The day-level tables join to CLOSED days: an open day is
# invisible to the register, and its entries change all shift long.
_ARMS = [
    ("leader_checklists", "select count(*), max(xmin::text::bigint) from leader_checklists"),
    ("managers", "select count(*), max(xmin::text::bigint) from managers"),
    ("role_profiles", "select count(*), max(xmin::text::bigint) from role_profiles"),
    ("cells", "select count(*), max(xmin::text::bigint) from cells"),
    ("leader_sync_meta", "select count(*), max(xmin::text::bigint) from leader_sync_meta"),
    ("leader_late_requests", "select count(*), max(xmin::text::bigint) from leader_late_requests"),
    ("leader_day_exclusions", "select count(*), max(xmin::text::bigint) from leader_day_exclusions"),
    ("leader_cutoffs", "select count(*), max(xmin::text::bigint) from leader_cutoffs"),
    ("leader_task_defs", "select count(*), max(xmin::text::bigint) from leader_task_defs"),
    ("leader_task_settings", "select count(*), max(xmin::text::bigint) from leader_task_settings"),
    ("leader_task_leader_settings", "select count(*), max(xmin::text::bigint) from leader_task_leader_settings"),
    ("leader_unit_settings", "select count(*), max(xmin::text::bigint) from leader_unit_settings"),
    ("leader_day_sources", "select count(*), max(xmin::text::bigint) from leader_day_sources"),
    ("leader_task_overrides", "select count(*), max(xmin::text::bigint) from leader_task_overrides"),
    ("leader_ai_disputes", "select count(*), max(xmin::text::bigint) from leader_ai_disputes"),
    ("leader_ai_reviews", "select count(*), max(xmin::text::bigint) from leader_ai_reviews"),
    ("leader_task_days", "select count(*), max(xmin::text::bigint) from leader_task_days"
                         " where closed_at is not null"),
    ("leader_task_entries", "select count(*), max(e.xmin::text::bigint) from leader_task_entries e"
                            " join leader_task_days d on d.id = e.day_id and d.closed_at is not null"),
    ("leader_task_media", "select count(*), max(m.xmin::text::bigint) from leader_task_media m"
                          " join leader_task_entries e on e.id = m.entry_id"
                          " join leader_task_days d on d.id = e.day_id and d.closed_at is not null"),
    ("leader_task_photos", "select count(*), max(p.xmin::text::bigint) from leader_task_photos p"
                           " join leader_task_days d on d.id = p.day_id and d.closed_at is not null"),
    ("leader_auto_checks", "select count(*), max(a.xmin::text::bigint) from leader_auto_checks a"
                           " join leader_task_entries e on e.id = a.entry_id"
                           " join leader_task_days d on d.id = e.day_id and d.closed_at is not null"),
]
_FP_SQL = text(" union all ".join(
    f"select '{name}' as t, n, x from ({sql}) as f{i}(n, x)" for i, (name, sql) in enumerate(_ARMS)))


def enabled() -> bool:
    return engine.dialect.name == "postgresql"


def fingerprint(db: Session) -> tuple:
    """The state of everything the build reads, as one comparable value."""
    rows = db.execute(_FP_SQL).all()
    return tuple(sorted((str(t), int(n or 0), int(x or 0)) for t, n, x in rows))


# ── who wrote, and when ──────────────────────────────────────────────────────

def actor_key(payload: Optional[dict]) -> Optional[str]:
    """The ACCOUNT behind a request — one person's web session and their bot
    taps carry the same Telegram id, so one key covers both doors."""
    sub = (payload or {}).get("sub")
    if sub in (None, ""):
        return None
    try:
        return str(int(sub))
    except (TypeError, ValueError):
        return str(sub)


def wrote(actor) -> None:
    """Note that this account changed something. Called for every mutating
    request and every bot act, whatever it touched: a write that could not
    move the register costs that one account one rebuild, never a stale view."""
    if actor is None:
        return
    key = str(actor)
    now = monotonic()
    with _lock:
        _writes[key] = now
        if len(_writes) > 4096:             # bounded; the oldest marks go first
            for k in sorted(_writes, key=_writes.get)[:1024]:
                _writes.pop(k, None)


def _written_since(actor: Optional[str]) -> float:
    with _lock:
        return _writes.get(actor, 0.0) if actor else 0.0


# ── the kept build ───────────────────────────────────────────────────────────

def kept() -> Optional[Build]:
    with _lock:
        return _kept


def get(db: Session, payload: dict, build_fn: Callable[[Session], Build]) -> Build:
    """The build to answer this viewer with — see the module docstring."""
    if not enabled():
        return _run(db, build_fn, None, fp=())
    arrived = monotonic()
    try:
        fp = fingerprint(db)
    except Exception:
        log.exception("leader-register: fingerprint failed; building unkept")
        return _run(db, build_fn, None, fp=())
    since = _written_since(actor_key(payload))
    with _lock:
        k = _kept
    if k is not None and k.started > since:
        if k.fp == fp:
            return k
        if arrived - k.done_at < STALE_MAX_S:
            _refresh_later(build_fn)
            return k
    return _wait_build(db, build_fn, after=arrived, fp=fp)


def _wait_build(db: Session, build_fn, *, after: float, fp: tuple) -> Build:
    """A build that STARTED after `after`: start one, or join one somebody
    else started late enough. A build that started earlier may have read the
    data before a write this request is looking for, so it is waited out."""
    global _flight
    while True:
        with _lock:
            f = _flight
            mine = f is None
            if mine:
                f = _flight = _Flight(monotonic())
        if mine:
            try:
                return _run(db, build_fn, f, fp=fp)
            finally:
                with _lock:
                    if _flight is f:
                        _flight = None
                f.done.set()
        if f.started > after:
            if f.done.wait(FLIGHT_WAIT_S) and f.build is not None:
                return f.build
            break                       # it failed or hung — build alone
        if not f.done.wait(FLIGHT_WAIT_S):
            break
    return _run(db, build_fn, None, fp=fp)


def _run(db: Session, build_fn, flight: Optional[_Flight], *, fp: tuple) -> Build:
    """Build, stamp, keep. `fp` is the fingerprint taken BEFORE this build read
    anything (the caller's own, when the build starts in its session; the
    background thread takes one of its own)."""
    global _kept
    started = flight.started if flight is not None else monotonic()
    if not fp and enabled():
        try:
            fp = fingerprint(db)
        except Exception:
            log.exception("leader-register: fingerprint failed; building unkept")
            fp = ()
    b = build_fn(db)
    b.fp, b.started, b.done_at = fp, started, monotonic()
    if fp:
        with _lock:
            if _kept is None or b.started > _kept.started:
                _kept = b
    if flight is not None:
        flight.build = b
    return b


def _refresh_later(build_fn) -> None:
    """Start a background build unless one is already running."""
    global _flight
    with _lock:
        if _flight is not None:
            return
        f = _flight = _Flight(monotonic())

    def run():
        global _flight
        db = SessionLocal()
        try:
            _run(db, build_fn, f, fp=())
        except Exception:
            log.exception("leader-register: background rebuild failed")
        finally:
            db.close()
            with _lock:
                if _flight is f:
                    _flight = None
            f.done.set()

    threading.Thread(target=run, name="leader-register", daemon=True).start()


def forget() -> None:
    """Drop the kept build (tests, and a deliberate reset)."""
    global _kept
    with _lock:
        _kept = None
