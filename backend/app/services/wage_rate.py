"""The hourly wage that PRICES ojidaniya — THE definition, in one place.

`/downtime` → «Xarajat» answers one question: what did a stopped cell cost in
wages while it stood still. The arithmetic is

    xarajat = union_minutes ÷ 60 × odam soni × w

and this module owns the last term. Everything about `w` that a caller could
get wrong lives here rather than at the call site: which period covers a day,
what an unfilled period means, and what a valid timeline is.

**The timeline is contiguous and gapless by construction.** The rows are
periods, oldest first, the first optionally open at the start
(`effective_from is None` — "Boshidan") and the last always open at the end. An
admin does not add a period; they put a BORDER on a date, which splits the
period containing it, so neither a gap nor an overlap is expressible. `save`
re-checks that anyway, because the endpoint is reachable without the UI.

**Never re-spell `resolve` at a call site.** Two spellings of "which rate
applied on 3 September" is how the table, the modal and the workbook start
pricing one day three ways. Build the resolver ONCE per request (`resolver`)
and hand it down — a query per day would be a query per cell per day.

**An unset rate is not zero.** `rate_uzs is None` means nobody has said what
that period costs, which is a different fact from a period that cost nothing,
and only the first is ever true here. `resolve` answers `None` for such a day
and every reader must carry that through to «—» plus a named count of unpriced
minutes — the rule `idle_source.cell_headcount` already applies to a cell whose
headcount nobody typed. Substituting 0 would understate the bill by exactly the
days nobody has configured, which are the days most likely to be wrong.
"""
from datetime import date
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models import WageRatePeriod

# A timeline is a handful of raises, not a dataset. The cap exists so a broken
# client cannot write thousands of rows the resolver then walks per day.
MAX_PERIODS = 60
# Nothing on this platform is priced in fractions of a so'm, and a rate this
# large is a typo (a monthly salary pasted into an hourly field).
MAX_RATE = 100_000_000


def _key(from_iso: Optional[str]) -> tuple:
    """Sort key putting the open first period ahead of every dated one."""
    return (from_iso is not None, from_iso or "")


def load(db: Session) -> list[dict]:
    """The whole timeline, oldest first, as plain JSON-able dicts.

    `{"from": "YYYY-MM-DD" | None, "rate": float | None}` — the shape the API
    serves and `resolver` consumes, so the browser, the workbook and the
    resolver all read one structure.
    """
    rows = db.query(WageRatePeriod).all()
    out = [{"from": r.effective_from.isoformat() if r.effective_from else None,
            "rate": None if r.rate_uzs is None else float(r.rate_uzs)}
           for r in rows]
    out.sort(key=lambda p: _key(p["from"]))
    return out


def resolve(periods: list[dict], d: date) -> Optional[float]:
    """The rate in force on `d`, or None when no period covers it or the one
    that does has no rate set.

    A day BEFORE the first dated period, on a timeline with no open first row,
    is genuinely uncovered — it answers None rather than borrowing the earliest
    rate, because "we had not started recording a wage yet" is not the same
    claim as "the wage was whatever it later became".
    """
    iso = d.isoformat()
    rate: Optional[float] = None
    covered = False
    for p in sorted(periods, key=lambda x: _key(x["from"])):
        if p["from"] is None or p["from"] <= iso:
            rate, covered = p["rate"], True
        else:
            break
    return rate if covered else None


def resolver(periods: list[dict]) -> Callable[[date], Optional[float]]:
    """`resolve` with the timeline sorted once and memoised per day.

    The cost tree resolves a rate for every (cell, day) it prices; on a
    fortnight across the fleet that is thousands of calls over the same handful
    of dates.
    """
    ordered = sorted(periods, key=lambda x: _key(x["from"]))
    cache: dict[date, Optional[float]] = {}

    def rate_for(d: date) -> Optional[float]:
        if d not in cache:
            cache[d] = resolve(ordered, d)
        return cache[d]

    return rate_for


def normalise(periods: list[dict]) -> list[dict]:
    """Validate an incoming timeline and return it in canonical order.

    Raises ``ValueError`` with a message meant for a person: this is what the
    endpoint turns into a 400, and the modal renders it inside the dialog.
    """
    if not isinstance(periods, list):
        raise ValueError("Timeline must be a list")
    if len(periods) > MAX_PERIODS:
        raise ValueError(f"Too many periods (max {MAX_PERIODS})")

    seen: set[Optional[str]] = set()
    out: list[dict] = []
    for p in periods:
        raw = p.get("from")
        if raw in (None, ""):
            frm = None
        else:
            try:
                frm = date.fromisoformat(str(raw)[:10]).isoformat()
            except ValueError:
                raise ValueError(f"Bad date: {raw}")
        if frm in seen:
            raise ValueError("Two periods start on the same date")
        seen.add(frm)

        rate = p.get("rate")
        if rate in (None, ""):
            rate = None
        else:
            try:
                rate = float(rate)
            except (TypeError, ValueError):
                raise ValueError(f"Bad rate: {rate}")
            if rate < 0:
                raise ValueError("A rate cannot be negative")
            if rate > MAX_RATE:
                raise ValueError("That rate looks like a typo")
        out.append({"from": frm, "rate": rate})

    out.sort(key=lambda x: _key(x["from"]))
    return out


def save(db: Session, periods: list[dict]) -> list[dict]:
    """Replace the whole timeline in ONE transaction.

    Whole-list rather than per-row: a border is a split of two adjacent periods
    at once, so a row-at-a-time API would leave the table momentarily holding a
    gap that `resolve` would answer through. The caller commits.
    """
    clean = normalise(periods)
    db.query(WageRatePeriod).delete(synchronize_session=False)
    db.flush()
    for p in clean:
        db.add(WageRatePeriod(
            effective_from=None if p["from"] is None else date.fromisoformat(p["from"]),
            rate_uzs=p["rate"],
        ))
    return clean


def affected_days(before: list[dict], after: list[dict],
                  lo: date, hi: date) -> int:
    """How many days between `lo` and `hi` are priced differently by `after`.

    The number the Save confirm names. A rate edit is allowed to rewrite a
    figure somebody has already read, so the dialog has to say how far the
    rewrite reaches instead of leaving the admin to work it out.
    """
    a, b = resolver(before), resolver(after)
    n, cur = 0, lo
    while cur <= hi:
        if a(cur) != b(cur):
            n += 1
        cur = date.fromordinal(cur.toordinal() + 1)
    return n
