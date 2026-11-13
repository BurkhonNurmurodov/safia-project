"""«Solved since the month's start» — the «0/24» in the hover box of «Smena
kunligi»'s «Sifat nazorati %» cell (docs/shift-report.md).

The operator, 2026-11-13: «there should be 0/24» — 24 = the problems that were
OPEN when the month started, 0 = how many of those the brigadir has solved
since. The quality register cannot answer that by itself: it is a wipe-and-
reload copy of the QA sheet (`sheets_sync.sync_quality_sheet`) carrying each
record's CURRENT status and the day it was filed — never the day it was
solved, and no history. So this module KEEPS the one thing that is missing: the
list of records that were open when the month's count began.

- **The starting list** (`quality_open_baseline`): one row per record open
  (`OPEN`) on the day the list was taken, plus one marker row (`fp == ""`) that
  says «taken», so a month with nothing open is not taken again. It is taken
  ONCE a month, by the first board built in that month (`ensure`) — so
  November 2026's list is 13 Nov, the day this shipped, and every later
  month's is its first day (or the first day somebody opened the board).
  `taken_on` is that date and the box prints it («solved since 13.11»).
- **A record has no id that survives a reload** — `quality_complaints.id` is
  re-issued by every sync. It is found again by its «№ не соответствия»
  (`ref_no`) when exactly one current record carries that number, else by a
  fingerprint of what does not change when a status flips: date, place,
  product, description (`fingerprint`). A record found by neither — deleted
  from the sheet, or rewritten beyond recognition — leaves the count: both
  numbers shrink, and nothing is ever counted solved because it vanished.
- **The count** (`fold`): of the starting list's records still in the
  register, those whose status still describes work (`COUNTED`, the board's
  `ACTIONABLE`) are the total, and the ones now `done` are the solved. A
  record filed after the list was taken is in NEITHER number — it joins next
  month's list if it is still open then. Hair is counted like any other
  record. Each record answers to the unit `quality_attribution` names for it
  TODAY, the rule every quality figure on the platform uses.

**Not on screen since the afternoon of 2026-11-13**: the box prints «solved of
the problems filed since 1 October» instead (`shift_report.QUALITY_SINCE`).
The lists are still TAKEN every month (`keep`, called by the board) — the one
part that cannot be made up afterwards — and `board` still answers the count
for whoever asks for it back.

The pure half (`fingerprint` · `pick_open` · `match` · `fold`) imports nothing
and is what `tests/test_quality_baseline.py` covers; the database half opens
its OWN session (`board`), so a failure here can never leave the board's
request in an aborted transaction — the router drops the figure and the hover
box falls back to «left: hair / without hair».
"""
from __future__ import annotations

import hashlib
import threading
from datetime import date
from typing import Callable, Iterable, NamedTuple, Optional

# Still owed: the twin of `QUALITY_UNRESOLVED` in frontend/src/utils/scopeLinks.js.
OPEN = ("open", "waiting", "repeat")
DONE = "done"
# shift_report.ACTIONABLE — «не требуется мера» is no work, so it is no count.
COUNTED = OPEN + (DONE,)

# pg_advisory_xact_lock key: two processes (a worker swap runs two at once)
# must not both take a month's list.
_PG_LOCK = 7_412_061_113


class Rec(NamedTuple):
    """What this module reads of one register record."""
    ref_no: Optional[str]
    date: Optional[str]
    place: Optional[str]
    product: Optional[str]
    description: Optional[str]
    status: Optional[str]
    brigadir: Optional[str] = None
    fault_code: Optional[str] = None


def month_of(day: date) -> str:
    return day.strftime("%Y-%m")


def _ref(v) -> Optional[str]:
    s = str(v).strip() if v is not None else ""
    return s or None


def fingerprint(day, place, product, description) -> str:
    """A record's identity where its number cannot give one: the fields a
    status change never touches, folded so a stray space or capital is not a
    new record."""
    raw = "\x1f".join(" ".join(str(v or "").lower().split())
                      for v in (day, place, product, description))
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def pick_open(rows: Iterable[Rec]) -> list[tuple[Optional[str], str]]:
    """(ref_no, fingerprint) for every record still owed — the starting list."""
    return [(_ref(r.ref_no), fingerprint(r.date, r.place, r.product, r.description))
            for r in rows if r.status in OPEN]


def match(baseline: Iterable[tuple[Optional[str], str]], rows: list[Rec]) -> list[Rec]:
    """The current record of each starting-list entry, one-to-one; an entry the
    register no longer holds is left out.

    By number when exactly ONE current record carries it (a number the sheet
    repeats identifies nobody), else by fingerprint. Two identical records are
    two entries and take two current records — never the same one twice."""
    by_ref: dict[str, list[int]] = {}
    by_fp: dict[str, list[int]] = {}
    for i, r in enumerate(rows):
        ref = _ref(r.ref_no)
        if ref:
            by_ref.setdefault(ref, []).append(i)
        by_fp.setdefault(fingerprint(r.date, r.place, r.product, r.description), []).append(i)
    used: set[int] = set()
    out: list[Rec] = []
    pending: list[str] = []
    # Numbers first, so a fingerprint twin never takes a record a number names.
    for ref, fp in baseline:
        hit = by_ref.get(ref) if ref else None
        if hit and len(hit) == 1 and hit[0] not in used:
            used.add(hit[0])
            out.append(rows[hit[0]])
        else:
            pending.append(fp)
    for fp in pending:
        i = next((i for i in by_fp.get(fp, ()) if i not in used), None)
        if i is not None:
            used.add(i)
            out.append(rows[i])
    return out


def fold(matched: Iterable[Rec], unit_of: Callable[[Rec], Optional[int]]) -> dict[int, dict]:
    """{unit id: {"done": solved since, "total": open at the start}} — `unit_of`
    is the attribution (None: nobody's record, as on every quality figure)."""
    out: dict[int, dict] = {}
    for r in matched:
        if r.status not in COUNTED:
            continue
        uid = unit_of(r)
        if uid is None:
            continue
        acc = out.setdefault(uid, {"done": 0, "total": 0})
        acc["total"] += 1
        if r.status == DONE:
            acc["done"] += 1
    return out


# ── the database half ────────────────────────────────────────────────────────

_lock = threading.Lock()
_taken: dict[str, str] = {}        # month → taken_on, once this process has seen it


def _current(s) -> list[Rec]:
    from app.models import QualityComplaint as QC
    return [Rec(*r) for r in s.query(
        QC.ref_no, QC.date, QC.place, QC.product, QC.description, QC.status,
        QC.brigadir, QC.fault_code).all()]


def ensure(s, today: date) -> Optional[str]:
    """Take this month's starting list if nobody has, and answer the date it
    was taken on (None: nothing to take it from yet). Idempotent, and safe
    against a second process doing the same."""
    from sqlalchemy import text

    from app.models import QualityOpenBaseline as B

    month = month_of(today)
    hit = _taken.get(month)
    if hit:
        return hit
    with _lock:
        hit = _taken.get(month)
        if hit:
            return hit

        def stored() -> Optional[str]:
            row = s.query(B.taken_on).filter(B.month == month, B.fp == "").first()
            return row[0] if row else None

        on = stored()
        if on is None:
            if s.get_bind().dialect.name == "postgresql":
                s.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _PG_LOCK})
                on = stored()
        if on is None:
            rows = _current(s)
            if not rows:
                # A register nobody has synced yet is not «nothing was open».
                s.rollback()
                return None
            on = today.isoformat()
            s.add(B(month=month, ref_no=None, fp="", taken_on=on))      # the marker
            for ref, fp in pick_open(rows):
                s.add(B(month=month, ref_no=ref, fp=fp, taken_on=on))
        s.commit()
        _taken[month] = on
        return on


def keep(today: date) -> None:
    """Take this month's starting list if nobody has — and nothing else. After
    the first call of a month it touches no database at all."""
    if month_of(today) in _taken:
        return
    from app.database import SessionLocal

    with SessionLocal() as s:
        ensure(s, today)


def board(today: date) -> tuple[Optional[str], dict[int, dict]]:
    """(taken_on, {unit id: {"done", "total"}}) for the month `today` is in —
    in a session of its own, so the caller's transaction is never touched."""
    from app.database import SessionLocal
    from app.models import QualityOpenBaseline as B
    from app.services.quality_attribution import Resolver

    with SessionLocal() as s:
        on = ensure(s, today)
        if on is None:
            return None, {}
        base = [(ref, fp) for ref, fp in
                s.query(B.ref_no, B.fp).filter(B.month == month_of(today), B.fp != "").all()]
        if not base:
            return on, {}
        matched = match(base, _current(s))
        who = Resolver(s, {r.brigadir for r in matched})

        def unit_of(r: Rec) -> Optional[int]:
            unit = who(r.place, r.brigadir, r.fault_code, r.date).unit
            return unit["id"] if unit is not None else None

        return on, fold(matched, unit_of)
