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
"""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Iterable, Optional, Union
from zoneinfo import ZoneInfo

from sqlalchemy import or_

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


def alive(cell, day: Day) -> bool:
    """Does the cell exist on `day`? An unreadable day answers True — the rule
    must never hide a cell because a caller passed something odd."""
    gone = archived_day(cell)
    if gone is None:
        return True
    d = _as_date(day)
    return d is None or gone >= d


def alive_on(cells: Iterable, day: Day) -> list:
    return [c for c in cells if alive(c, day)]


def today() -> date:
    return datetime.now(TZ).date()


def alive_clause(day: Day = None):
    """SQL twin of `alive`: archived_at IS NULL OR archived on/after `day`
    (today when omitted)."""
    from app.models import Cell
    d = _as_date(day) or today()
    start = datetime.combine(d, time.min, tzinfo=TZ)
    return or_(Cell.archived_at.is_(None), Cell.archived_at >= start)
