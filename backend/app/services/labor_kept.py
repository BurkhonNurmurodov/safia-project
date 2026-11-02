"""The trudoyomkost of each (unit, day), KEPT between requests (2026-11-02).

**Why.** `zagruzka_source.wc_labor` — and its two siblings `wc_group_labor` and
`line_facts` — re-read every unit's dated catalog, every `pp_daily` and
`pp_line_daily` row of the range and re-ran `pp_calc`'s line loop on EVERY
request. Since 2026-10-26 every reader of a typed «Bugungi fakt» pin runs it too
(`typed_pins` keeps only the pins of planned work centres), so /zagruzka,
/downtime and its bubbles, /workers, «Smena kunligi», /plan, «Liderlar KPI» and
«Hisobotlar» each paid it, often twice. «Server was slow» named it on every
report of 2 November: `zagruzka_source:wc_labor › _labor_inputs` behind
/api/heatmap, /api/downtime/bubbles, /api/workers/headcount and /api/reports.

**What is kept.** One answer per (kind, unit, day): `wc` (minutes per work
centre), `grp` (per work centre and group letter), `facts` (every line's own
quantities and minutes). A day's answer depends only on that day's quantities
and the unit's catalog, never on the range it was asked in, so a month asked
once answers every day of it afterwards.

**When it is served — EXACTLY, never for-a-while.** Every call first reads one
STAMP query: per (unit, day) the row count, Σ and max of `xmin` of `pp_daily`
and of `pp_line_daily`, and per unit the same over `pp_products` and
`pp_catalog_versions` — every input `wc_labor` reads. `xmin` is the id of the
transaction that last wrote a row, so any insert, update or delete moves the
stamp (the `leader_register` fingerprint rule, per day). An answer is served
only while its stamp is unchanged; a typed ФАКТ re-computes that one unit-day, a
catalog edit that unit's days, nothing else. The stamp is read BEFORE the inputs,
so a write landing during a computation stores a stamp that is already old —
the next request computes again; never a stale answer.

**Never kept from a session that wrote.** A transaction that has written
anything (`txid_current_if_assigned()`), or holds unflushed ORM changes,
computes as before and stores nothing: an answer read off rows somebody else
cannot see yet must never reach them. On anything but Postgres, and if the stamp
query fails, every call computes as before.

**Byte for byte.** A day's numbers come out of the same loop in the same order
as an uncached call (`pp_calc._line_minutes` accumulates each (work centre, day)
over the lines in catalog order, whatever the range), so `unit_labor`'s sums are
the same floats. Only the order ACROSS days of the returned dict differs — no
reader depends on it (Python's own date hashing made it process-random anyway).

**Memory.** Values are packed (interned strings, `array('d')` numbers); the
stores are bounded LRU maps (`CAPS`). A line in `facts` is a plain snapshot of
the catalog row (`pp_catalog.LINE_FIELDS`), never a live ORM object.
"""
from __future__ import annotations

import logging
import sys
import threading
from array import array
from collections import OrderedDict, defaultdict
from datetime import date
from typing import Callable, Iterable, Optional

from sqlalchemy import Integer, bindparam, event, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Session

log = logging.getLogger("app.labor_kept")

# unit-days kept per kind (21 units ≈ 7,700 unit-days a year)
CAPS = {"wc": 12000, "grp": 6000, "facts": 3000}

_STAMP_SQL = text("""
SELECT 'd' AS t, manager_id AS m, date AS d, count(*) AS n,
       sum(xmin::text::bigint) AS s, max(xmin::text::bigint) AS x
  FROM pp_daily
 WHERE manager_id = ANY(:ids) AND date >= :lo AND date <= :hi
 GROUP BY manager_id, date
UNION ALL
SELECT 'l', manager_id, date, count(*), sum(xmin::text::bigint), max(xmin::text::bigint)
  FROM pp_line_daily
 WHERE manager_id = ANY(:ids) AND date >= :lo AND date <= :hi
 GROUP BY manager_id, date
UNION ALL
SELECT 'p', manager_id, NULL, count(*), sum(xmin::text::bigint), max(xmin::text::bigint)
  FROM pp_products WHERE manager_id = ANY(:ids) GROUP BY manager_id
UNION ALL
SELECT 'v', manager_id, NULL, count(*), sum(xmin::text::bigint), max(xmin::text::bigint)
  FROM pp_catalog_versions WHERE manager_id = ANY(:ids) GROUP BY manager_id
UNION ALL
SELECT 'x', NULL, NULL, txid_current_if_assigned(), NULL, NULL
""").bindparams(bindparam("ids", type_=ARRAY(Integer)))

_MISS = object()


class _Store:
    """One kind's answers: {(unit, iso day): (stamp, packed value | None)}."""

    def __init__(self, cap: int):
        self.cap = cap
        self.lock = threading.Lock()
        self.rows: "OrderedDict[tuple, tuple]" = OrderedDict()

    def get(self, key, stamp):
        with self.lock:
            got = self.rows.get(key)
            if got is None or got[0] != stamp:
                return _MISS
            self.rows.move_to_end(key)
            return got[1]

    def put(self, key, stamp, value) -> None:
        with self.lock:
            self.rows[key] = (stamp, value)
            self.rows.move_to_end(key)
            while len(self.rows) > self.cap:
                self.rows.popitem(last=False)

    def clear(self) -> None:
        with self.lock:
            self.rows.clear()


_STORES = {k: _Store(c) for k, c in CAPS.items()}
_stats = {"hit": 0, "miss": 0, "empty": 0, "bypass": 0}


def forget() -> None:
    """Drop every kept answer (tests, an admin's «recompute»)."""
    for s in _STORES.values():
        s.clear()


def stats() -> dict:
    """Counters since the process started, and what each store holds."""
    return {**_stats, **{f"kept_{k}": len(s.rows) for k, s in _STORES.items()}}


def _stamps(db: Session, ids: list[int], lo: date, hi: date):
    """``(units {mid: stamp}, days {(mid, iso): stamp})`` — or None when this
    call must not use the store (not Postgres, the session wrote, the query
    failed). Read once per (units, range) per session — one request asks for
    the minutes and for the planned work centres over the same range — and
    dropped the moment that session flushes, commits or rolls back."""
    memo_key = ("lk_stamps", tuple(ids), lo, hi)
    if memo_key in db.info:
        return db.info[memo_key]
    got = _read_stamps(db, ids, lo, hi)
    db.info[memo_key] = got
    return got


def _read_stamps(db: Session, ids: list[int], lo: date, hi: date):
    try:
        if db.get_bind().dialect.name != "postgresql":
            return None
    except Exception:
        return None
    if db.new or db.dirty or db.deleted:
        return None
    try:
        with db.begin_nested():
            rows = db.execute(_STAMP_SQL, {"ids": ids, "lo": lo, "hi": hi}).all()
    except Exception:                                     # never fail a page over a cache
        log.exception("[labor-kept] stamp query failed — computing without the store")
        return None
    units: dict = defaultdict(dict)
    days: dict = defaultdict(dict)
    for t, m, d, n, s, x in rows:
        if t == "x":
            if n is not None:                              # this transaction has written
                return None
            continue
        st = (int(n or 0), int(s or 0), int(x or 0))
        if t in ("p", "v"):
            units[int(m)][t] = st
        else:
            days[(int(m), d.isoformat())][t] = st
    return ({m: (v.get("p"), v.get("v")) for m, v in units.items()},
            {k: (v.get("d"), v.get("l")) for k, v in days.items()})


def get(db: Session, kind: str, manager_ids: Iterable[int], date_from: date,
        date_to: date, compute: Callable[[list, date, date], dict],
        pack: Callable, unpack: Callable) -> Optional[dict]:
    """``{(mid, iso): value}`` for every (unit, day) of the range that has one,
    or None when the caller must compute the range itself (it then behaves
    exactly as before).

    `compute(ids, lo, hi)` is the uncached computation, answering
    ``{(mid, iso): value}``; `pack` / `unpack` turn a value into what the store
    keeps and back. A (unit, day) with no quantity row at all has no value by
    construction (`pp_calc._line_minutes` walks only days the quantities name)
    and is never computed."""
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {}
    st = _stamps(db, ids, date_from, date_to)
    if st is None:
        _stats["bypass"] += 1
        return None
    units, days = st
    store = _STORES[kind]
    out: dict = {}
    missing: dict[int, list[str]] = defaultdict(list)
    for key, day_stamp in days.items():
        hit = store.get(key, (units.get(key[0]), day_stamp))
        if hit is _MISS:
            missing[key[0]].append(key[1])
        elif hit is not None:
            out[key] = unpack(hit, key)
    hits = len(days) - sum(len(v) for v in missing.values())
    _stats["hit"] += hits
    if missing:
        # One computation per distinct day span; the common cases — a cold
        # store (every unit, the whole range) and one changed unit-day — are
        # one call each.
        by_span: dict[tuple[str, str], list[int]] = defaultdict(list)
        for mid, isos in missing.items():
            by_span[(min(isos), max(isos))].append(mid)
        for (lo, hi), mids in by_span.items():
            got = compute(sorted(mids), date.fromisoformat(lo), date.fromisoformat(hi))
            for mid in mids:
                for iso in missing[mid]:
                    key = (mid, iso)
                    value = got.get(key)
                    _stats["miss"] += 1
                    if value is None:
                        _stats["empty"] += 1
                    packed = pack(value, key) if value is not None else None
                    store.put(key, (units.get(mid), days[key]), packed)
                    if value is not None:
                        out[key] = unpack(packed, key)
    return out


def _forget_stamps(session, *_a) -> None:
    for k in [k for k in session.info if isinstance(k, tuple) and k and k[0] == "lk_stamps"]:
        session.info.pop(k, None)


event.listen(Session, "after_flush", _forget_stamps)
event.listen(Session, "after_commit", _forget_stamps)
event.listen(Session, "after_soft_rollback", _forget_stamps)


# ── packing ───────────────────────────────────────────────────────────────────

def _s(v):
    return sys.intern(v) if isinstance(v, str) else v


def pack_wc(rows, _key):
    """[(wc, plan, actual), …] → (wcs, plans, actuals)."""
    return (tuple(_s(w) for w, _p, _a in rows),
            array("d", (p for _w, p, _a in rows)), array("d", (a for _w, _p, a in rows)))


def unpack_wc(packed, _key):
    wcs, ps, acts = packed
    return list(zip(wcs, ps, acts))


def pack_grp(rows, _key):
    """[(wc, group, plan, actual), …] → (wcs, groups, plans, actuals)."""
    return (tuple(_s(w) for w, _g, _p, _a in rows), tuple(_s(g) for _w, g, _p, _a in rows),
            array("d", (p for _w, _g, p, _a in rows)), array("d", (a for _w, _g, _p, a in rows)))


def unpack_grp(packed, _key):
    wcs, gs, ps, acts = packed
    return list(zip(wcs, gs, ps, acts))


def pack_facts(rows, key):
    """[(line, wc, qty_key, line_key, d, qp, qa, pv, av), …] → columns; the
    four numbers of each row side by side in one array. `d` is the entry's own
    day, kept once."""
    nums = array("d")
    for r in rows:
        nums.extend((float(r[5]), float(r[6]), float(r[7]), float(r[8])))
    day = rows[0][4] if rows else date.fromisoformat(key[1])
    return (tuple(r[0] for r in rows), tuple(_s(r[1]) for r in rows),
            tuple(_s(r[2]) for r in rows), tuple(_s(r[3]) for r in rows), day, nums)


def unpack_facts(packed, _key):
    """The packed columns as they are — `replay_facts` walks them."""
    return packed


def replay_facts(mid, packed, emit) -> None:
    """Hand one kept day's lines to ``emit(mid, line, wc, qty_key, line_key,
    d, qp, qa, pv, av)`` in the order they were computed."""
    lines, wcs, keys, lks, day, nums = packed
    it = iter(nums)
    for line, wc, key, lk, qp, qa, pv, av in zip(lines, wcs, keys, lks, it, it, it, it):
        emit(mid, line, wc, key, lk, day, qp, qa, pv, av)


# ── a fresh process fills the store behind the first requests ────────────────

WARM_DAYS = 62          # what /zagruzka, /downtime, /workers and the reports read
WARM_DELAY_S = 15.0     # after readiness; the leaders board warms at 45 s


def warm() -> None:
    """Fill the store for the last `WARM_DAYS` of every live unit on a thread of
    its own, shortly after a process starts — every deploy starts with an empty
    store, and without this the first viewers of /zagruzka, /downtime,
    /workers, /plan and «Hisobotlar» after it would each pay the computation
    the store exists to spare them. Read-only; a failure costs the warm-up,
    never a page."""
    import time

    def run():
        time.sleep(WARM_DELAY_S)
        from datetime import timedelta
        from zoneinfo import ZoneInfo
        from datetime import datetime
        from app.database import SessionLocal
        from app.models import Manager
        from app.services import gc_pause, zagruzka_source as zs
        db = SessionLocal()
        try:
            t0 = time.monotonic()
            today = datetime.now(ZoneInfo("Asia/Tashkent")).date()
            lo = max(zs.ZAGRUZKA_FROM, today - timedelta(days=WARM_DAYS))
            ids = [int(m) for (m,) in db.query(Manager.id).filter(Manager.archived.is_(False))]
            if ids and lo <= today:
                with gc_pause.paused():
                    zs.wc_labor(db, ids, lo, today)
                    zs.line_facts(db, ids, lo, today, lambda *_a: None)
            db.rollback()
            print(f"[labor-kept] warmed {len(ids)} units {lo}..{today} in "
                  f"{time.monotonic() - t0:.1f} s · {stats()}", flush=True)
        except Exception:                                  # noqa: BLE001
            log.exception("[labor-kept] warm-up failed")
        finally:
            db.close()

    threading.Thread(target=run, name="labor-warm", daemon=True).start()
