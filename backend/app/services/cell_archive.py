"""Which cells EXIST on a given day — THE archive rule (2026-10-10).

A cell closed on /cells is ARCHIVED (`cells.archived_at`, a timestamptz),
never deleted. The operator's ruling (2026-10-10): from the day AFTER its
archive day a cell is gone everywhere — not a row, card, tile, filter option
or picker entry, and it no longer counts: no per-cell checklist owed for it,
no automatic check of it, no share of its work centre's people or minutes.
Its own archive day and every day before it are untouched, so history reads
exactly as it was filed.

The archive DAY is the plant's wall clock (Tashkent): a cell archived at
15:00 on 5 Oct still worked that day, so it exists on the 5th and is gone
from the 6th.

Every reader asks here, never re-spells the comparison:

* `alive(cell, day)`       — one cell on one day (a `date` or "YYYY-MM-DD").
* `alive_on(cells, day)`   — the cells of a list that exist on `day`.
* `alive_clause(day)`      — the same test as SQL on `Cell`.

An object with no `archived_at` attribute (a light row, a tuple) is alive:
the rule only ever REMOVES a cell somebody archived.

**From 2026-10-12 the days a cell did not exist are SPANS**
(`cell_archive_spans`, the Verifix live sync): archiving opens a span from
the day after the archive day, restoring CLOSES it on the day the restore
takes effect — it no longer clears the cell's past. Before, a restore wiped
`archived_at` and every archived day counted again (a cell Verifix closed and
re-opened would flap the figures of days already reported). A cell with spans
is read through them; a cell with none (nothing was ever written for it)
keeps the `archived_at` rule above. `archive` / `restore` are THE writers —
/cells and the sync both go through them.
"""
from __future__ import annotations

import threading
import time as _time
from datetime import date, datetime, time, timedelta, timezone
from typing import Iterable, Optional, Union
from zoneinfo import ZoneInfo

from sqlalchemy import and_, exists, or_

TZ = ZoneInfo("Asia/Tashkent")

Day = Union[date, str, None]


def _as_date(day: Day) -> Optional[date]:
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


def archived_day(cell) -> Optional[date]:
    """The plant-clock day the cell was archived on, None for an active cell."""
    at = getattr(cell, "archived_at", None)
    if at is None:
        return None
    if at.tzinfo is None:            # a naive stamp is UTC (the column's zone)
        from datetime import timezone
        at = at.replace(tzinfo=timezone.utc)
    return at.astimezone(TZ).date()


# ── the spans, kept in memory (a small table, read on every alive()) ─────────

SPANS_TTL_S = 20.0              # another app copy's write reaches this one within this
_spans: Optional[dict] = None   # cell id → [(from_day, to_day | None)]
_spans_at = 0.0
_spans_lock = threading.Lock()


_spans_gen = 0


def forget() -> None:
    """A writer landed: the next reader re-reads (called by every writer
    below). The old spans stay for the readers arriving while ONE thread
    re-reads — the `cell_links.events` rule."""
    global _spans_at, _spans_gen
    _spans_gen += 1
    _spans_at = 0.0


def spans() -> dict:
    """cell id → [(from_day, to_day)] — every span, read at most every
    SPANS_TTL_S. One thread re-reads while the others are served the previous
    answer; a failed read keeps it (retried shortly). A database that never
    answered (a box before the migration) answers {} — the `archived_at` rule
    then decides, as before."""
    global _spans, _spans_at
    now = _time.monotonic()
    cur = _spans
    if cur is not None and now - _spans_at < SPANS_TTL_S:
        return cur
    if cur is not None:
        if not _spans_lock.acquire(blocking=False):
            return cur
    else:
        _spans_lock.acquire()
    try:
        if _spans is not None and _time.monotonic() - _spans_at < SPANS_TTL_S:
            return _spans
        gen = _spans_gen
        out: dict = {}
        try:
            from app.database import SessionLocal
            from app.models import CellArchiveSpan
            with SessionLocal() as db:
                for cid, f, t in db.query(CellArchiveSpan.cell_id, CellArchiveSpan.from_day,
                                          CellArchiveSpan.to_day).all():
                    out.setdefault(cid, []).append((f, t))
        except Exception:  # noqa: BLE001 — never hide a cell over a read failure
            if _spans is not None:
                _spans_at = _time.monotonic() - SPANS_TTL_S + 2.0      # retry in ~2 s
                return _spans
            return {}
        _spans = out
        _spans_at = _time.monotonic() if gen == _spans_gen else 0.0
        return out
    finally:
        _spans_lock.release()


def _dead_in(sp: list, d: date) -> bool:
    return any(f <= d and (t is None or d < t) for f, t in sp)


_NO_ATTR = object()


def _spans_of(cell) -> Optional[list]:
    """The cell's spans as they count. An OPEN span counts only while the cell
    is archived: a cell restored by code that knows nothing of spans (the old
    copy during a blue-green swap, a rolled-back release) has `archived_at`
    cleared and its span left open, and must not vanish from every page
    while /cells shows it active. An object carrying no `archived_at` at all
    (a light row) is read by its spans as they stand."""
    cid = getattr(cell, "id", None)
    sp = spans().get(cid) if cid is not None else None
    if not sp:
        return sp
    at = getattr(cell, "archived_at", _NO_ATTR)
    if at is None:
        sp = [(f, t) for f, t in sp if t is not None]
    return sp


def alive(cell, day: Day) -> bool:
    """Does the cell exist on `day`? An unreadable day answers True — the rule
    must never hide a cell because a caller passed something odd."""
    d = _as_date(day)
    if d is None:
        return True
    sp = _spans_of(cell)
    if sp:
        return not _dead_in(sp, d)
    gone = archived_day(cell)
    if gone is None:
        return True
    return gone >= d


def dead_from(cell, day: Day) -> Optional[date]:
    """The first day of the run of archived days that covers `day` (or of the
    cell's archive when it has no span) — what a reader prints as «archived
    since». None when the cell exists on `day`."""
    d = _as_date(day)
    sp = _spans_of(cell)
    if sp and d is not None:
        hits = [f for f, t in sp if f <= d and (t is None or d < t)]
        if hits:
            return max(hits)
        return None
    gone = archived_day(cell)
    if gone is None or (d is not None and gone >= d):
        return None
    return gone + timedelta(days=1)


def alive_on(cells: Iterable, day: Day) -> list:
    return [c for c in cells if alive(c, day)]


def today() -> date:
    return datetime.now(TZ).date()


def alive_clause(day: Day = None):
    """SQL twin of `alive` (today when `day` is omitted): no span covers the
    day, and a cell with no span at all is alive while not archived before it."""
    from app.models import Cell, CellArchiveSpan as S
    d = _as_date(day) or today()
    start = datetime.combine(d, time.min, tzinfo=TZ)
    covered = exists().where(and_(S.cell_id == Cell.id, S.from_day <= d,
                                  or_(and_(S.to_day.is_(None), Cell.archived_at.isnot(None)),
                                      S.to_day > d)))
    has_span = exists().where(S.cell_id == Cell.id)
    return and_(~covered, or_(has_span, Cell.archived_at.is_(None), Cell.archived_at >= start))


# ── the writers ───────────────────────────────────────────────────────────────

def archive(db, cell, *, by: Optional[str] = None, src: str = "manual",
            at: Optional[datetime] = None) -> bool:
    """Archive the cell AT NOW (re-archiving keeps the first date): the cell
    exists on its archive day and is gone from the next. Opens a span unless
    one is already open. Returns True when anything changed. Caller commits."""
    from app.models import CellArchiveSpan
    changed = False
    if cell.archived_at is None:
        cell.archived_at = at or datetime.now(timezone.utc)
        cell.archived_by = (by or "").strip() or None
        changed = True
    open_ = (db.query(CellArchiveSpan)
             .filter(CellArchiveSpan.cell_id == cell.id, CellArchiveSpan.to_day.is_(None)).first())
    if open_ is None:
        db.add(CellArchiveSpan(cell_id=cell.id, from_day=archived_day(cell) + timedelta(days=1),
                               src=src, by_name=(by or "").strip() or None))
        changed = True
    forget()
    return changed


def restore(db, cell, *, effective_from: Optional[date] = None, by: Optional[str] = None,
            src: str = "manual") -> bool:
    """Bring the cell back from `effective_from` (default: today) — the open
    span is CLOSED there, so every day it was archived stays archived. A span
    that would close before it opened (archived and restored before the
    archive took effect) is removed: the cell was never gone. Caller commits."""
    from app.models import CellArchiveSpan
    eff = effective_from or today()
    changed = cell.archived_at is not None
    cell.archived_at = None
    cell.archived_by = None
    for sp in (db.query(CellArchiveSpan)
               .filter(CellArchiveSpan.cell_id == cell.id, CellArchiveSpan.to_day.is_(None)).all()):
        if eff <= sp.from_day:
            db.delete(sp)
        else:
            sp.to_day = eff
            sp.restored_by = (by or "").strip() or None
            sp.restored_src = src
            sp.restored_at = datetime.now(timezone.utc)
        changed = True
    forget()
    return changed
