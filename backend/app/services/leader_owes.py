"""From which day a leader OWES a checklist and stands in the rankings —
THE rule (2026-10-12, the operator's ruling 5 of the Verifix live sync).

A leader profile the Verifix sync creates for a seated leader is on the
register, «Ish grafigi» and the concerns box from day one, but nothing is OWED
until the person claims the profile in the bot — a profile nobody has claimed
cannot file, and every day it sat unclaimed would otherwise be a missed day in
the digest, the automatic checks, the exclusions tab and the ranking. A
brigadir's own pick of a manager starts the obligation on the pick day (they
chose the person to file; a 0 is the right signal to get them registered).

* `role_profiles.owes_from` — NULL: owes as it always did (every profile
  claimed before this rule); `UNCLAIMED`: created by the sync, nobody has
  claimed it yet — owes nothing; a date: owes from that day.
* The CREATION FLOOR: for a profile with NO owes_from, no day before it
  existed is owed (`created_at`, the plant's calendar day; the day before when
  it was made before 09:00, so a night-shift leader made after midnight owes
  the night they are in) — for a profile created from `CREATION_FLOOR_FROM`
  (the day after the release) on. A set owes_from decides alone: it is
  the leader's own checklist day at the claim or pick (`shift_day`), so a night
  claimed after midnight owes the night it is in. Profiles made earlier (the role backfill, the
  admins' hand creations) carry a `created_at` later than their own sheet
  history; a floor there would forgive misses already scored, and the rule is
  that no past figure moves.

`floor(prof)` is the first day the profile owes (None = no floor at all);
`owes(prof, day)` the test. Readers take a profile object or the two values.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Tashkent")
UNCLAIMED = date(9999, 12, 31)
# The first creation day the floor applies to: the day AFTER the release that
# brought it (13 Oct 2026), so no profile that existed before it — or was made
# on the deploy day itself — has a past figure move.
CREATION_FLOOR_FROM = date(2026, 10, 14)
# A profile made before this hour of the plant's clock floors at the day
# BEFORE: a night-shift leader created at 01:30 is in that evening's night,
# which they can still file until 09:00.
CREATION_EVE_BEFORE_HOUR = 9


def _day(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(TZ).date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def floor_of(owes_from, created_at) -> Optional[date]:
    """The first day owed, from the two raw values. A date somebody SET (a
    claim, a pick — both the leader's own checklist day, so a night claimed
    after midnight owes the night it is in) decides alone; the creation day is
    the floor only of a profile that carries none."""
    a = _day(owes_from)
    if a is not None:
        return a
    b = _day(created_at)
    if b is None or b < CREATION_FLOOR_FROM:
        return None
    if isinstance(created_at, datetime):
        at = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        if at.astimezone(TZ).hour < CREATION_EVE_BEFORE_HOUR:
            from datetime import timedelta
            return b - timedelta(days=1)
    return b


def floor(prof) -> Optional[date]:
    return floor_of(getattr(prof, "owes_from", None), getattr(prof, "created_at", None))


def owes(prof, day) -> bool:
    f = floor(prof)
    d = _day(day)
    return f is None or d is None or d >= f


def iso(prof) -> Optional[str]:
    """The floor as the roster serves it — None when there is none, and the
    UNCLAIMED sentinel as itself (a client compares strings: «9999-12-31» is
    after every real day)."""
    f = floor(prof)
    return f.isoformat() if f else None


def _fileable(shift, day: date) -> date:
    """`day`, or the next one when its filing window has already shut — a
    night-shift day «running» at 11:30 closed at 09:00, so nobody claimed then
    can file it, and it must not be owed."""
    from datetime import timedelta
    from app.services import leader_tasks
    try:
        shut = date.fromisoformat(leader_tasks.expired_through(shift)[:10])
    except (TypeError, ValueError):
        return day
    return day + timedelta(days=1) if day <= shut else day


def unit_day(db, manager_id) -> date:
    """The first checklist day a profile made for this unit NOW can still file
    (a night after midnight is still its evening's date; a night already shut
    is not) — the day it starts owing."""
    try:
        from app.services import leader_shift, leader_tasks
        sh = leader_shift.unit_shift(db, manager_id)
        return _fileable(sh, date.fromisoformat(leader_tasks.effective_date(sh)[:10]))
    except Exception:
        return datetime.now(TZ).date()


def shift_day(db, prof) -> date:
    """The first checklist day this leader can still file (`leader_shift.current`,
    moved on a day when that day's window has shut) — what a claim or a pick
    starts owing from."""
    try:
        from app.services import leader_shift
        sh, d = leader_shift.current(db, prof)
        return _fileable(sh, date.fromisoformat(str(d)[:10]))
    except Exception:
        return datetime.now(TZ).date()


def claim(prof, day: Optional[date] = None) -> bool:
    """The person claimed the profile (an approved registration): an
    UNCLAIMED profile owes from that day. A NULL or a real date is left —
    nothing claimed before the rule moves. Returns True when it changed."""
    if prof is None or getattr(prof, "owes_from", None) != UNCLAIMED:
        return False
    prof.owes_from = day or datetime.now(TZ).date()
    return True


def picked(prof, day: Optional[date] = None) -> bool:
    """A brigadir picked this person to run a cell: an unclaimed profile owes
    from the pick day."""
    return claim(prof, day)


def claim_key(db, profile_key: Optional[str], day: Optional[date] = None) -> bool:
    """`claim` for an approved registration that names `leader:<id>` — what
    every approval door calls, in its own transaction. Anything else (another
    role, a legacy row with no key) is left."""
    key = str(profile_key or "")
    if not key.startswith("leader:"):
        return False
    try:
        pid = int(key.split(":", 1)[1])
    except ValueError:
        return False
    from app.models import RoleProfile
    prof = db.query(RoleProfile).filter_by(id=pid).first()
    if prof is None or getattr(prof, "owes_from", None) != UNCLAIMED:
        return False
    return claim(prof, day or shift_day(db, prof))
