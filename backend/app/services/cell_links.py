"""A cell's links, DATED — THE reader and writer (2026-10-12, Verifix live sync).

A cell has three links to people: its brigadir (`cells.manager_id`), its
«Boshqaruvchi» (`leader_id`, who runs it) and its «Egasi» (`owner_id`, the
leader Verifix seats in it). Until this module every reader took the CURRENT
column for every day, so moving a cell to another brigadir re-weighed every
past day of ojidaniya, re-split work centres over days already reported and
re-copied closed live days into the new unit — history moved with the register.

The operator's ruling (2026-10-12): «from the sync, the history shouldn't get
affected». So:

* every change of a link is an APPEND-ONLY event (`cell_link_events`) with the
  day it takes effect. A BRIGADIR change lands at `opening()`, the unit's NEXT
  shift opening (the shift frame /live and «Smena hisoboti» run on), so the
  running shift-day and its closed copy never jump. A LEADER's link — the
  «Boshqaruvchi» and the «Egasi» — counts from the day it is made
  (`connected()`, from 2026-10-17, the operator: «count it from the day it's
  connected, not from the next day»), applied at once; only while the cell's
  brigadir change is still waiting does it land with that move;
* the `cells` columns stay the CURRENT mirror — present-tense readers (forms,
  pickers, the live day, the checklist being filed now) read them as before.
  An event reaches them at `effective_at` (`apply_due`, the minute job);
* a reader of a PAST (or a future) day asks `value_on` / `map_on`: the value
  on day D is the latest event with `effective_from` ≤ D; a day before every
  event reads the first event's `prev` (what was in force before anything was
  recorded); with no event at all it is the column, exactly as before.

`src` on an event: "verifix" (the sync, or a pick of the Verifix seat),
"manual" (a person — a brigadir's or admin's pick), "grandfather" (the first
build's mark that a manager who is not the seat was a person's choice; value
== prev, so it moves nothing). Whether a cell's manager is a person's override
is the latest `leader_id` event's src (`manager_mode`).
"""
from __future__ import annotations

import threading
import time as _time
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

TZ = ZoneInfo("Asia/Tashkent")
FIELDS = ("manager_id", "leader_id", "owner_id")
MANUAL = ("manual", "grandfather")
TTL_S = 20.0            # another app copy's write reaches this one within this


def _as_date(day) -> Optional[date]:
    if day is None:
        return None
    if isinstance(day, datetime):
        return day.date()
    if isinstance(day, date):
        return day
    try:
        return date.fromisoformat(str(day)[:10])
    except ValueError:
        return None


# ── when a change lands ───────────────────────────────────────────────────────

def opening(db: Session, manager_id: Optional[int],
            now: Optional[datetime] = None) -> tuple[date, datetime]:
    """(shift-day, instant) of the unit's NEXT shift opening — the moment a
    change of a cell's links takes effect. A shift-1 unit at 14:00 → tomorrow
    08:00; a shift-2 unit at 14:00 → tonight 20:00 (that night's shift-day is
    today); a unit with no shift (or no unit) → the next calendar day, 00:00."""
    from app.models import Manager
    from app.services import cell_hours, live_overview
    now = now or datetime.now(TZ)
    shift = None
    if manager_id:
        shift = db.query(Manager.shift).filter(Manager.id == manager_id).scalar()
    if shift in (1, 2):
        win = cell_hours.defaults(db).get(shift) or (("08:00", "20:00") if shift == 1
                                                     else ("20:00", "08:00"))
        fr = live_overview.shift_frame(now, shift, win)
        return (date.fromisoformat(fr["day"]) + timedelta(days=1),
                datetime.fromisoformat(fr["next_start_at"]))
    d = now.astimezone(TZ).date() + timedelta(days=1)
    return d, datetime.combine(d, time(0), tzinfo=TZ)


def connected(db: Session, manager_id: Optional[int],
              now: Optional[datetime] = None) -> tuple[date, datetime]:
    """(shift-day, instant) a LEADER's link to a cell lands on by default — the
    day it is connected (2026-10-17, the operator: «count it from the day it's
    connected, not from the next day»): the first checklist day of the cell's
    unit that can still be filed (`leader_owes.unit_day` — the day a picked
    profile starts owing), applied AT ONCE. A shift-1 unit → today, all day; a
    shift-2 unit → the night running now (after midnight still its evening's
    date), or tonight's once the last night's filing has shut at 09:00; no
    shift → today."""
    from app.services import leader_owes
    now = now or datetime.now(timezone.utc)
    return leader_owes.unit_day(db, manager_id, now), now


def opening_for_move(db: Session, old_mid: Optional[int], new_mid: Optional[int],
                     now: Optional[datetime] = None) -> tuple[date, datetime]:
    """A brigadir change lands at the LATER of the two units' next openings:
    a cell moving from a night unit to a day unit at 14:00 must not join the
    day unit's shift that has been running since 08:00."""
    a = opening(db, old_mid, now)
    if not new_mid or new_mid == old_mid:
        return a
    b = opening(db, new_mid, now)
    if a[0] == b[0]:
        # Both openings start the SAME shift-day: the column flips at the
        # earlier one (a night unit's cell joining a day unit at 03:00 is the
        # day unit's from its 08:00 — the night that runs then is the day
        # before's). Day-keyed readers are the same either way.
        return a if a[1] <= b[1] else b
    return a if a[1] >= b[1] else b


# ── the events, kept in memory (a small table, read by every past-day figure) ─

class _Ev:
    __slots__ = ("id", "eff", "value", "prev", "applied", "src", "at")

    def __init__(self, id, eff, value, prev, applied, src, at):
        self.id, self.eff, self.value, self.prev = id, eff, value, prev
        self.applied, self.src, self.at = applied, src, at


_cache: Optional[dict] = None    # field → cell id → [_Ev] (by effective_from, id)
_cache_at = 0.0
_gen = 0                           # bumped by `forget`: a read begun before it is stale
_lock = threading.Lock()


def forget() -> None:
    """A write landed: the next reader re-reads. The old answer stays for the
    readers that arrive WHILE one thread re-reads (they would otherwise queue
    behind it, each holding its own pool connection)."""
    global _cache_at, _gen
    _gen += 1
    _cache_at = 0.0


def _load(db: Optional[Session] = None) -> dict:
    out: dict = {f: defaultdict(list) for f in FIELDS}
    out[LETTERS] = defaultdict(list)
    from app.models import CellLinkEvent as E

    def read(s: Session) -> None:
        for r in (s.query(E.id, E.cell_id, E.field, E.effective_from, E.value, E.prev,
                          E.applied_at, E.src, E.effective_at, E.vfx)
                  .order_by(E.effective_from, E.id).all()):
            if r.field in out:
                vfx = r.vfx if isinstance(r.vfx, dict) else {}
                # A catalog mark (services/catalog_follow, value = prev) only
                # carries letter history: it is no link change for any reader.
                if not vfx.get("catalog_mark"):
                    out[r.field][r.cell_id].append(
                        _Ev(r.id, r.effective_from, r.value, r.prev, r.applied_at is not None,
                            r.src, r.effective_at))
                if r.field == "manager_id" and "wc_group_was" in vfx:
                    out[LETTERS][r.cell_id].append((r.effective_from, vfx["wc_group_was"]))
                # The letters the catalog follow gave the cells a move left
                # behind (the lone staying sibling, `catalog_follow`): each
                # sibling's letter before it, dated like the moved cell's own.
                if r.field == "manager_id" and isinstance(vfx.get("siblings_was"), dict):
                    for sid, was in vfx["siblings_was"].items():
                        try:
                            out[LETTERS][int(sid)].append((r.effective_from, was))
                        except (TypeError, ValueError):
                            continue
    try:
        if db is not None:
            read(db)
        else:
            from app.database import SessionLocal
            with SessionLocal() as s:
                read(s)
    except Exception:  # noqa: BLE001 — a box before the migration: no events
        if db is not None:
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
        return None
    return {f: dict(v) for f, v in out.items()}


def _empty() -> dict:
    return {**{f: {} for f in FIELDS}, LETTERS: {}}


# The work-centre letter a moved cell LOST when its brigadir change landed
# (`apply_due` keeps it on the event as `vfx.wc_group_was`): the letter is a
# plain column, so without this a past day of the OLD unit would read the
# cell's current letter and re-split that unit's typed pins and lines.
LETTERS = "_letters"


def letter_on(cell, day) -> Optional[str]:
    """The cell's work-centre letter on `day`: the letter a later brigadir move
    took away, else the column."""
    current = getattr(cell, "wc_group", None) if not isinstance(cell, dict) else cell.get("wc_group")
    d = _as_date(day)
    cid = getattr(cell, "id", None) if not isinstance(cell, dict) else cell.get("id")
    if d is None or cid is None:
        return current
    for eff, was in events().get(LETTERS, {}).get(cid) or []:
        if eff > d:
            return was
    return current


class DayCell:
    """A cell read on a past day: the same row with that day's work-centre
    letter (`letter_on`). Every other attribute is the cell's own."""
    __slots__ = ("_cell", "wc_group")

    def __init__(self, cell, letter):
        object.__setattr__(self, "_cell", cell)
        object.__setattr__(self, "wc_group", letter)

    def __getattr__(self, key):
        return getattr(object.__getattribute__(self, "_cell"), key)


def with_letters_on(cells: list, day) -> list:
    """`cells` with each moved cell's letter as it stood on `day` — the cells
    whose letter did not change since come back as themselves."""
    lets = events().get(LETTERS, {})
    if not lets:
        return cells
    out = []
    for c in cells:
        cid = c.get("id") if isinstance(c, dict) else getattr(c, "id", None)
        if cid in lets:
            g = letter_on(c, day)
            cur = c.get("wc_group") if isinstance(c, dict) else getattr(c, "wc_group", None)
            if g != cur:
                c = {**c, "wc_group": g} if isinstance(c, dict) else DayCell(c, g)
        out.append(c)
    return out


def events(fresh: bool = False) -> dict:
    """field → cell id → events, oldest first. Read at most every TTL_S.

    ONE thread re-reads; a reader arriving meanwhile is served the previous
    answer rather than queued (queued, each would hold its pool connection
    while the re-reader waits for one — a stall at a pool-full peak). A read
    that fails keeps the previous answer and is retried shortly; only a
    process that never read anything answers «no events»."""
    global _cache, _cache_at
    cur = _cache
    if not fresh and cur is not None and _time.monotonic() - _cache_at < TTL_S:
        return cur
    if not fresh and cur is not None:
        if not _lock.acquire(blocking=False):
            return cur
    else:
        _lock.acquire()
    try:
        if not fresh and _cache is not None and _time.monotonic() - _cache_at < TTL_S:
            return _cache
        gen = _gen
        got = _load()
        if got is None:
            if _cache is not None:
                _cache_at = _time.monotonic() - TTL_S + 2.0     # retry in ~2 s
                return _cache
            return _empty()
        _cache = got
        # A write that landed while this read ran leaves it stale at once.
        _cache_at = _time.monotonic() if gen == _gen else 0.0
        return _cache
    finally:
        _lock.release()


def _resolve(evs: list, current, d: date):
    # A catalog mark (`catalog_follow._mark_event`: src «catalog_follow»,
    # value = prev) carries letter history and nothing else. `_load` keeps it
    # out of `events()`, but `record` resolves over a list read straight off
    # the table (`_fresh`) — and a mark written beside a column that a LATER
    # change had already moved would answer every day before that change with
    # the later unit (`evs[0].prev`, or its own value). So it never resolves.
    if evs and any(e.src == "catalog_follow" and e.value == e.prev for e in evs):
        evs = [e for e in evs if not (e.src == "catalog_follow" and e.value == e.prev)]
    if not evs:
        return current
    last = None
    for e in evs:
        if e.eff <= d:
            last = e
        else:
            break
    if last is None:
        return evs[0].prev
    # The latest event, already on the column: the column is the truth (a
    # writer this module does not see may have moved it since).
    if last is evs[-1] and last.applied:
        return current
    return last.value


def value_on(cell, field: str, day) -> Optional[int]:
    """The cell's `field` on `day` (a date or "YYYY-MM-DD"). An unreadable day
    answers the column, as every reader did before."""
    d = _as_date(day)
    current = getattr(cell, field, None)
    if d is None:
        return current
    return _resolve(events().get(field, {}).get(getattr(cell, "id", None)) or [], current, d)


def map_on(cells: Iterable, field: str, day) -> dict:
    """{cell id: the cell's `field` on `day`} for every cell given — objects
    with `.id` and the field, or (id, current value) pairs."""
    d = _as_date(day)
    evs = events().get(field, {})
    out = {}
    for c in cells:
        if hasattr(c, "id") and hasattr(c, field):
            cid, cur = c.id, getattr(c, field)
        else:                                  # (id, current value) — a tuple or a Row
            cid, cur = c[0], c[1]
        out[cid] = cur if d is None else _resolve(evs.get(cid) or [], cur, d)
    return out


def changed_since(field: str, day) -> set:
    """Cell ids whose `field` has an event effective AFTER `day` — the cells
    whose current column does NOT answer for that day. A reader whose rows can
    be keyed by the current column for every other cell asks this first."""
    d = _as_date(day)
    if d is None:
        return set()
    out = set()
    for cid, evs in events().get(field, {}).items():
        real = [e for e in evs if e.value != e.prev]      # a mark changes no value
        if real and (real[-1].eff > d or not real[-1].applied):
            out.add(cid)
    return out


def cells_of_units(db: Session, unit_ids: Iterable[int], since=None, extra=None) -> list:
    """Every cell that is, or on any day from `since` on was (or will be), in
    one of these units — the selection a past-day reader starts from. A cell
    that has since moved away is still loaded for its old unit's days; the
    reader then keeps it on a day only where `units_on(...)` says so. Without
    `since` it is the current selection."""
    from sqlalchemy import or_
    from app.models import Cell
    ids = [int(u) for u in unit_ids if u]
    if not ids:
        return []
    cond = Cell.manager_id.in_(ids)
    moved = changed_since("manager_id", since) if since is not None else set()
    if moved:
        cond = or_(cond, Cell.id.in_(moved))
    q = db.query(Cell).filter(cond)
    if extra is not None:
        q = q.filter(extra)
    return q.all()


class OnDay:
    """`map_on` per day, computed once per (field, day) — a reader looping over
    days asks `units(day)` / `leaders(day)` / `get(field, day)` freely."""

    def __init__(self, cells: Iterable):
        self.cells = list(cells)
        self._m: dict = {}

    def get(self, field: str, day) -> dict:
        d = _as_date(day)
        key = (field, d)
        if key not in self._m:
            self._m[key] = map_on(self.cells, field, d)
        return self._m[key]

    def units(self, day) -> dict:
        return self.get("manager_id", day)

    def leaders(self, day) -> dict:
        return self.get("leader_id", day)

    def in_unit(self, day, unit_ids) -> list:
        """The cells standing in one of `unit_ids` on `day`."""
        u = self.units(day)
        want = {int(x) for x in unit_ids if x} if not isinstance(unit_ids, int) else {unit_ids}
        return [c for c in self.cells if u.get(getattr(c, "id", None)) in want]


def units_of_cells_on(cells: Iterable, day) -> dict:
    """{cell id: its brigadir unit on `day`} — the most read link."""
    return map_on(cells, "manager_id", day)


# ── the writer ────────────────────────────────────────────────────────────────

def _fresh(db: Session, cell_id: int, field: str) -> list:
    from app.models import CellLinkEvent as E
    return [_Ev(r.id, r.effective_from, r.value, r.prev, r.applied_at is not None, r.src,
                r.effective_at)
            for r in (db.query(E).filter(E.cell_id == cell_id, E.field == field)
                      .order_by(E.effective_from, E.id).all())]


def record(db: Session, cell, field: str, value: Optional[int], *, src: str,
           by: Optional[str] = None, vfx: Optional[dict] = None,
           effective_from: Optional[date] = None, effective_at: Optional[datetime] = None,
           mark: bool = False, now: Optional[datetime] = None):
    """Record that `cell.field` becomes `value` — a brigadir change from the
    unit's next shift opening, a leader's link from the day it is made
    (`connected`), or from `effective_from`. Returns the event, or None when
    nothing changes. `mark=True` writes the event even when the value does not change
    — it records WHO decides the link from then on (a pick of the Verifix seat
    ends a person's override; the first build's grandfather mark).

    ONE change per field waits at a time: a new decision REPLACES whatever was
    still waiting (a pick changed twice before the shift opens is one change; a
    brigadir corrected to a unit on another shift lands once, on the new
    opening), and is dropped when it would change nothing — which is how a
    waiting change is withdrawn. An event whose moment has already come is
    applied at once. Caller commits."""
    from app.models import CellLinkEvent as E
    assert field in FIELDS, field
    now = now or datetime.now(timezone.utc)
    if effective_from is None:
        # A «Boshqaruvchi» / «Egasi» change recorded while the cell's unit move
        # is still pending lands WITH the move (the later of the two openings),
        # never on the old unit's opening a shift before it.
        pend_m = [e for e in _fresh(db, cell.id, "manager_id") if not e.applied] \
            if field != "manager_id" else []
        if pend_m:
            eff, eff_at = opening_for_move(db, cell.manager_id, pend_m[-1].value)
        elif field == "manager_id":
            eff, eff_at = opening(db, cell.manager_id)
        else:
            eff, eff_at = connected(db, cell.manager_id, now)
    else:
        eff = effective_from
        eff_at = effective_at or datetime.combine(eff, time(0), tzinfo=TZ)
    evs = _fresh(db, cell.id, field)
    current = getattr(cell, field)
    waiting = [e for e in evs if not e.applied]
    if waiting:
        # Only what is STILL waiting: the minute job may have applied one of
        # them since it was read (its row lock makes this wait, then skip it).
        gone = (db.query(E).filter(E.id.in_([e.id for e in waiting]), E.applied_at.is_(None))
                .delete(synchronize_session=False))
        db.flush()
        if gone != len(waiting):
            db.refresh(cell)
            evs = _fresh(db, cell.id, field)
            current = getattr(cell, field)
    # What is in force ON `eff` by the changes already made — an event applied
    # for that very day (a profile delete applies its release at once, ahead of
    # its date) counts, or a change made after it would read as «no change».
    before = _resolve([e for e in evs if e.applied], current, eff)
    if value == before and not mark:
        forget()
        return None
    ev = E(cell_id=cell.id, field=field, value=value, prev=before, effective_from=eff,
           effective_at=eff_at, src=src, by_name=(by or "").strip() or None, vfx=vfx)
    db.add(ev)
    if eff_at <= now:
        _apply(db, cell, ev, now)
    db.flush()
    forget()
    return ev


def withdraw(db: Session, cell, field: str) -> int:
    """Drop the change still waiting on a cell's `field` (the column stands).
    Returns the rows dropped. Caller commits."""
    from app.models import CellLinkEvent as E
    n = (db.query(E).filter(E.cell_id == cell.id, E.field == field, E.applied_at.is_(None))
         .delete(synchronize_session=False))
    db.flush()
    forget()
    return n or 0


def _apply(db: Session, cell, ev, now: datetime) -> bool:
    """Put an event on the column. Returns True when the column moved."""
    moved = getattr(cell, ev.field) != ev.value
    setattr(cell, ev.field, ev.value)
    ev.applied_at = now
    return moved


def apply_due(db: Session, now: Optional[datetime] = None) -> list:
    """Every event whose moment has come lands on its column (the minute job,
    and the start of every sync pass). A brigadir change settles the cell's
    work-centre letter the way every unit move does. Returns
    [(cell code, field, old, new)]. Caller commits."""
    from app.models import Cell, CellLinkEvent as E
    from app.services import leader_load, wc_group
    now = now or datetime.now(timezone.utc)
    rows = (db.query(E).filter(E.applied_at.is_(None), E.effective_at <= now)
            .order_by(E.effective_at, E.id).with_for_update(skip_locked=True).all())
    if not rows:
        return []
    from app.models import Manager, RoleProfile
    done = []
    moved_to: dict = defaultdict(list)
    letter_was: list = []            # (event, cell, its letter before the move)
    exists: dict = {}

    def target_ok(field: str, value: int) -> bool:
        key = (field == "manager_id", value)
        if key not in exists:
            model = Manager if field == "manager_id" else RoleProfile
            exists[key] = db.query(model.id).filter(model.id == value).first() is not None
        return exists[key]

    for ev in rows:
        cell = db.query(Cell).filter(Cell.id == ev.cell_id).first()
        if cell is None:
            ev.applied_at = now
            continue
        # A unit or a profile deleted since the change was recorded: the event
        # names nobody. It is voided (kept, marked) — applied, its foreign key
        # would fail the commit and hold every other due change back.
        if ev.value is not None and not target_ok(ev.field, ev.value):
            # Kept, read as no change at all (value = prev), the target it named
            # remembered — a later event must not let past days resolve to it.
            ev.applied_at = now
            ev.vfx = {**(ev.vfx or {}), "void": "target_gone", "value_was": ev.value}
            ev.value = ev.prev
            continue
        old = getattr(cell, ev.field)
        if ev.field == "owner_id":
            from app.services.cell_register import owner_meta_of
            cell.owner_meta = owner_meta_of(ev)
        was_letter = getattr(cell, "wc_group", None)
        if _apply(db, cell, ev, now):
            done.append((cell.verifix_code, ev.field, old, ev.value))
            if ev.field == "manager_id":
                # The letter the cell carried in its old unit, as the move
                # found it — the catalog follow reads it to know which of the
                # old unit's positions were this cell's (`catalog_follow`).
                ev.vfx = {**(ev.vfx or {}), "letter_before": was_letter or None}
                if was_letter:
                    letter_was.append((ev, cell, was_letter))
                if ev.value:
                    moved_to[ev.value].append(cell)
                elif getattr(cell, "wc_group", None):
                    # With no unit a letter names nothing (wc_group.check_cell).
                    cell.wc_group = None
    # The letters of the cells that moved: a colliding one yields
    # (wc_group.settle_moved, per destination), and the kept ones are dropped,
    # flushed and restored — two cells SWAPPING one lettered work centre between
    # units at one opening would otherwise meet on uq_cells_wc_group mid-flush
    # (the «Doimiy qilish» pattern in routers/attendance_batch.py).
    kept = []
    for mid, cells in moved_to.items():
        try:
            wc_group.settle_moved(db, cells, mid)
        except Exception:  # noqa: BLE001 — a letter must never hold a move back
            pass
        kept += [(c, c.wc_group) for c in cells if getattr(c, "wc_group", None)]
    if kept:
        for c, _g in kept:
            c.wc_group = None
        db.flush()
        for c, g in kept:
            c.wc_group = g
    # A letter the move took away is kept on its event: the days before it
    # still read it (`letter_on`).
    for ev, c, was in letter_was:
        if getattr(c, "wc_group", None) != was:
            ev.vfx = {**(ev.vfx or {}), "wc_group_was": was}
    leader_load.forget()
    forget()
    return done


def run_apply_due() -> None:
    """The minute job: apply what is due, one Jurnal row when anything moved.
    The caches are dropped AFTER the commit (`apply_due`'s own `forget` runs
    before it, so a reader in between could re-cache the old answer), and a
    brigadir change that landed kicks the catalog follow at once
    (`catalog_follow`: the cell's positions go with it)."""
    from app.database import SessionLocal
    try:
        with SessionLocal() as db:
            done = apply_due(db)
            db.commit()
            if done:
                from app.services import action_log
                action_log.record_system(
                    "org", "org.cell_links_applied", db,
                    details=[("count", len(done))] + [
                        ("cell", f"{c} {f}: {a} → {b}") for c, f, a, b in done[:40]])
        if done:
            from app.services import cell_register
            cell_register.after_commit()
            if any(f == "manager_id" for _c, f, _a, _b in done):
                from app.services import catalog_follow
                catalog_follow.kick()
    except Exception:  # noqa: BLE001 — the next minute tries again
        import logging
        logging.getLogger(__name__).exception("cell links: apply_due failed")


def register_jobs() -> None:
    """Every minute (mirrored in passenger_wsgi.py): the links landing, and the
    catalog follow that moves a landed cell's positions after it."""
    from app.scheduler import schedule_interval
    from app.services import catalog_follow
    schedule_interval("cell-links-apply", run_apply_due, minutes=1)
    schedule_interval("catalog-follow", catalog_follow.run_sweep, minutes=1)


# ── what a form shows ─────────────────────────────────────────────────────────

def pending(db: Session, cell_ids: Iterable[int]) -> dict:
    """{cell id: {field: {"value", "from", "src", "by"}}} — the changes recorded
    and not yet in force (the latest per field)."""
    from app.models import CellLinkEvent as E
    ids = list({int(c) for c in cell_ids if c})
    if not ids:
        return {}
    out: dict = defaultdict(dict)
    for r in (db.query(E).filter(E.cell_id.in_(ids), E.applied_at.is_(None))
              .order_by(E.effective_from, E.id).all()):
        out[r.cell_id][r.field] = {"value": r.value, "from": r.effective_from.isoformat(),
                                   "src": r.src, "by": r.by_name}
    return dict(out)


def manager_mode(db: Session, cell_ids: Iterable[int]) -> dict:
    """{cell id: "manual" | "verifix" | None} — who decides each cell's
    «Boshqaruvchi» from now on: the latest `leader_id` event's source (None:
    no event — the cell was never decided either way, and follows the seat)."""
    from app.models import CellLinkEvent as E
    ids = list({int(c) for c in cell_ids if c})
    if not ids:
        return {}
    out: dict = {}
    for r in (db.query(E.cell_id, E.src).filter(E.cell_id.in_(ids), E.field == "leader_id")
              .order_by(E.effective_from, E.id).all()):
        out[r.cell_id] = "manual" if r.src in MANUAL else "verifix"
    return out


def history(db: Session, cell_id: int) -> list:
    """Every event of one cell, newest first — /cells/:id prints it. A catalog
    mark (`catalog_follow`) is left out: it changed no link."""
    from app.models import CellLinkEvent as E
    return [{"field": r.field, "value": r.value, "prev": r.prev,
             "from": r.effective_from.isoformat(), "src": r.src, "by": r.by_name,
             "applied": r.applied_at is not None,
             "at": r.created_at.isoformat() if r.created_at else None}
            for r in (db.query(E).filter(E.cell_id == cell_id)
                      .order_by(E.effective_from.desc(), E.id.desc()).all())
            if not (isinstance(r.vfx, dict) and r.vfx.get("catalog_mark"))]
