"""A leader-day taken OUT of the results — neither a plus nor a minus.

THE definition of "this day does not count", and it is a different thing from
every other not-counting on this platform. The filing-window void scores a day
**0** and leaves it in the denominator; `LeaderDaySource` and `bot_from` switch
which LAYER supplies the number. Both were the only tools an operator had when
the platform itself was at fault, and both punish the leader for it — a night
the system got wrong still drags the month's mean down exactly as a night
nobody filed.

An exclusion removes the day from BOTH sides of the average: the leader's mean
is taken over the days that remain, their consistency counts neither a filing
nor a miss, and the unit mean loses that leader's contribution to it. The day is
still SHOWN — blank in the heatmap, greyed in the register, carrying the reason
— because a day that silently disappeared could not be told from one that was
never collected.

Two rules hold this together:

* **The key is the leader-DAY, not the row** (`key()`), keyed exactly as
  `LeaderLateRequest` is: the profile id when the sheet name resolved to a
  person, else the folded raw name. `leader_checklists` is wiped and reloaded on
  every sheet Refresh, so a row-id key would not survive the next sync; and
  ~18% of sheet names never resolve to a profile, so a profile-only key could
  never reach an unlinked leader's day.
* **Nothing is stored on the score itself.** Every consumer asks this module,
  so lifting an exclusion restores the day everywhere at once with no migration
  and no re-sync — the same property that makes the window edits free.

Lifting DELETES the row: "counts again" is the absence of a record, never a
third state every reader has to spell out.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import LeaderAiReview, LeaderDayExclusion

logger = logging.getLogger(__name__)


# ── identity ─────────────────────────────────────────────────────────────────

def key(leader_id: int | None, leader_name: str | None, date_iso: str) -> str:
    """Identity of one leader-day.

    A deliberate twin of `routers.leaders._late_key` — the two answer the same
    question about the same rows, and a leader-day that is one record to the
    late-open flow and two records to this one is a day whose two admin
    decisions cannot be read together.
    """
    who = f"p{leader_id}" if leader_id else f"n{(leader_name or '').strip().lower()}"
    return f"{who}|{str(date_iso)[:10]}"


# ── reading ──────────────────────────────────────────────────────────────────

def load(db: Session) -> dict[str, LeaderDayExclusion]:
    """Every live exclusion, by leader-day key. One query for a whole register."""
    return {e.leader_key: e
            for e in db.query(LeaderDayExclusion).all()}


def profile_days(db: Session) -> set[tuple[int, str]]:
    """Excluded `(profile_id, date)` pairs — the shape an id-keyed caller wants.

    The AI queue doors and the report sender know a leader by profile id and
    never by sheet spelling, so they ask in that currency. Name-keyed rows are
    deliberately absent: they belong to sheet rows the register could not resolve
    to a person, and neither a bot day nor a report DM can exist for one.
    """
    return {(int(e.leader_profile_id), str(e.date))
            for e in db.query(LeaderDayExclusion)
            .filter(LeaderDayExclusion.leader_profile_id.isnot(None)).all()}


def excluded(db: Session, leader_id: int | None, date: str | None, *,
             pairs: set[tuple[int, str]] | None = None) -> bool:
    """Is this leader-day out of the results?

    `pairs` is the preloaded answer for a caller already walking many rows
    (`profile_days`); without one this asks the DB for the single pair, which is
    what the per-row doors want.
    """
    if not leader_id or not date:
        return False
    if pairs is not None:
        return (int(leader_id), str(date)[:10]) in pairs
    return db.query(LeaderDayExclusion).filter(
        LeaderDayExclusion.leader_profile_id == int(leader_id),
        LeaderDayExclusion.date == str(date)[:10]).first() is not None


def row_for(db: Session, leader_id: int | None, leader_name: str | None,
            date: str) -> LeaderDayExclusion | None:
    """The exclusion on one leader-day, reached by whichever key it holds."""
    return (db.query(LeaderDayExclusion)
            .filter_by(leader_key=key(leader_id, leader_name, date)).first())


def wire(e: LeaderDayExclusion | None) -> dict | None:
    """What a register row carries about its own exclusion. None when it counts.

    The reason travels with the flag on purpose: the people whose number moved
    are shown this, and «does not count» without a why is the unexplainable
    score change the whole feature exists to avoid.
    """
    if e is None:
        return None
    return {
        "reason": e.reason or "",
        "by": e.set_by or None,
        "at": e.set_at.isoformat() if e.set_at else None,
        "score": float(e.score_at) if e.score_at is not None else None,
    }


# ── writing ──────────────────────────────────────────────────────────────────

def exclude(db: Session, *, leader_id: int | None, leader_name: str | None,
            date: str, manager_id: int | None, reason: str,
            score: float | None, actor: str | None) -> tuple[LeaderDayExclusion, bool]:
    """Take one leader-day out of the results. `(row, created)`.

    Re-excluding an already-excluded day UPDATES its reason rather than failing:
    the operator is correcting what they wrote, and a unique-key error on the
    second attempt would read as "the day is not excluded".
    """
    k = key(leader_id, leader_name, date)
    row = db.query(LeaderDayExclusion).filter_by(leader_key=k).first()
    created = row is None
    if row is None:
        row = LeaderDayExclusion(leader_key=k, date=str(date)[:10])
        db.add(row)
    row.leader_profile_id = int(leader_id) if leader_id else None
    row.leader_name = (leader_name or "")[:160] or None
    row.manager_id = int(manager_id) if manager_id else None
    row.reason = (reason or "").strip()[:2000]
    row.score_at = float(score) if score is not None else row.score_at
    row.set_by = (actor or "")[:160] or None
    row.set_at = datetime.now(timezone.utc)
    return row, created


def lift(db: Session, *, leader_id: int | None, leader_name: str | None,
         date: str) -> LeaderDayExclusion | None:
    """Put one leader-day back into the results. The row it removed, or None."""
    row = row_for(db, leader_id, leader_name, date)
    if row is not None:
        db.delete(row)
    return row


def drop_pending_reviews(db: Session, leader_id: int | None, date: str) -> int:
    """Take an excluded day's work back OUT of the AI queue.

    Closing the doors stops NEW rows; it does nothing about what was queued
    before the admin excluded the day — and on an incident night those are
    exactly the rows in flight. Left alone they are spent on Gemini and then
    displayed on a day whose number counts nowhere.

    **Only never-judged rows go** — `reviewed_at IS NULL AND resolution IS NULL`,
    the same rule as the rehearsal purge and the paused-shift purge. A verdict
    already written is an answer somebody may have acted on, and a human ruling
    is that row's terminal state. Nothing is lost: `discover()` re-finds every
    ref the moment the exclusion is lifted.
    """
    if not leader_id:
        return 0
    n = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.leader_id == int(leader_id),
                 LeaderAiReview.date == str(date)[:10],
                 LeaderAiReview.reviewed_at.is_(None),
                 LeaderAiReview.resolution.is_(None))
         .delete(synchronize_session=False))
    if n:
        logger.info("leader-exclusion: dropped %s queued review(s) for leader "
                    "%s on %s", n, leader_id, date)
    return int(n or 0)
