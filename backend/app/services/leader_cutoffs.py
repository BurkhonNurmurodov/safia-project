"""A leader who STOPS COUNTING from one day on — THE definition.

`leader_exclusions` beside this answers a question about a named DAY: the
platform got that night wrong, so it is scored for nobody. This answers a
question about a PERSON: from this date they are no longer a leader here, and
every day from that one on is a day they were never expected to file.

The two are not interchangeable and this one cannot be built out of the other.
An exclusion is one row per day; the future has no days in it yet. Expressing
"from 21 August onwards" as exclusions means writing rows for days that do not
exist, then writing more of them every morning forever — and the morning the
writer stops, the person starts scoring 0 again with nothing on screen saying
why. One record per decision is the only shape that goes on answering after the
person who made it has stopped looking.

What "does not count" means here is exactly what it means next door, because it
is the same arithmetic: the day leaves the NUMERATOR and the DENOMINATOR. A
leader cut off on the 21st, read over a window that starts on the 18th, is
scored over three days and not over the whole window with zeros in the tail —
scoring the tail 0 is precisely the "counts against them" a cutoff exists to
remove. A window that lies entirely after the cutoff leaves them out of the
ranking altogether, the same state as somebody with no rows at all.

Three rules hold it together:

* **The key is the PERSON** (`person_key`), spelled exactly as
  `leader_exclusions.key()` spells its own half before the date — the profile id
  when the name resolved to a person, else the folded raw name. That function
  now calls this one, so the two tools cannot come to disagree about who a
  leader is. ~18% of sheet names never resolve to a profile, and a profile-only
  key could not reach those leaders at all.
* **The date is a FLOOR with no ceiling.** A leader who returns has their cutoff
  lifted or moved later; a gap in the middle is a run of day exclusions, which
  is what that tool is for. A second date would give "is this day counted" four
  answers, and every reader would have to spell all four.
* **Nothing is written onto a score.** Every consumer asks this module, so
  lifting a cutoff restores every affected day everywhere at once with no
  migration and no re-sync — the property that already makes a photo-window edit
  free.

Lifting DELETES the row: "counts again" is the absence of a record, never a
third state every reader has to spell out.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import LeaderAiReview, LeaderCutoff

logger = logging.getLogger(__name__)


# ── identity ─────────────────────────────────────────────────────────────────

def person_key(leader_id: int | None, leader_name: str | None) -> str:
    """Identity of one leader, independent of any date.

    THE spelling — `leader_exclusions.key()` builds its own leader-day key by
    putting a date after this, so a leader who is one person to the day
    exclusions cannot be two people to a cutoff.
    """
    if leader_id:
        return f"p{int(leader_id)}"
    return f"n{(leader_name or '').strip().lower()}"


# ── reading ──────────────────────────────────────────────────────────────────

def load(db: Session) -> dict[str, LeaderCutoff]:
    """Every live cutoff, by person key. One query for a whole register.

    **The only preload shape, and deliberately not an id-keyed one.** A
    `{profile_id: from_date}` twin is the obvious convenience for the AI queue
    doors, which know a leader by profile id — and it silently drops every
    name-keyed cutoff, i.e. every leader whose sheet spelling never resolved to
    a profile (~18% of them). The census (`undiscovered`) and the queue
    (`discover`, `queue_report`) would then disagree about exactly those rows:
    «N tekshirilmagan» would promise work the button refuses, and the figure
    would never come down. One map, both spellings, `hit()` to read it.
    """
    return {c.leader_key: c for c in db.query(LeaderCutoff).all()}


def stopped_from(cuts: dict[str, LeaderCutoff], leader_id: int | None,
                 leader_name: str | None) -> str | None:
    """The day this leader stopped counting, out of a preloaded map. Or None.

    Both spellings are tried — a register row carries a profile id when the
    sheet name resolved and only a name when it did not, and the SAME leader can
    appear both ways across a period (a Refresh that newly matched them). Asking
    for one key only is how a cutoff set from the roster silently misses that
    leader's unmatched rows.
    """
    if leader_id:
        hit = cuts.get(person_key(int(leader_id), None))
        if hit is not None:
            return str(hit.from_date)[:10]
    if leader_name:
        hit = cuts.get(person_key(None, leader_name))
        if hit is not None:
            return str(hit.from_date)[:10]
    return None


def hit(cuts: dict[str, LeaderCutoff], leader_id: int | None,
        leader_name: str | None, date: str | None) -> LeaderCutoff | None:
    """The cutoff that takes this leader-day out of the results, or None.

    Inclusive on the floor: the cutoff date is itself the first day that does
    not count. Anything before it is untouched history.
    """
    if not date:
        return None
    d = str(date)[:10]
    for k in ((person_key(int(leader_id), None),) if leader_id else ()) + \
             ((person_key(None, leader_name),) if leader_name else ()):
        c = cuts.get(k)
        if c is not None and d >= str(c.from_date)[:10]:
            return c
    return None


def active(db: Session, leader_id: int | None, leader_name: str | None,
           date: str | None) -> LeaderCutoff | None:
    """The same question for ONE row, straight off the DB.

    The per-row doors (`queue_report`, `queue_task`, the report sender) ask this;
    anything walking many rows preloads `load()` or `by_profile()` instead.
    """
    if not date:
        return None
    d = str(date)[:10]
    keys = [person_key(int(leader_id), None)] if leader_id else []
    if leader_name:
        keys.append(person_key(None, leader_name))
    if not keys:
        return None
    return (db.query(LeaderCutoff)
            .filter(LeaderCutoff.leader_key.in_(keys),
                    LeaderCutoff.from_date <= d)
            .order_by(LeaderCutoff.from_date.asc()).first())


def wire(c: LeaderCutoff | None) -> dict | None:
    """What a register row carries about its own cutoff. None when it counts.

    **Deliberately the same shape `leader_exclusions.wire` returns**, and it
    lands on the same `excluded` field. The client already knows what an
    excluded row is — it leaves both sides of the average, it shows a grey chip
    instead of a score, its calendar cell is blank, no verdict is printed beside
    it — and every one of those is exactly right here. A second vocabulary for
    one arithmetic fact is how two surfaces start disagreeing about a day.

    `cutoff` + `from` are what let a reader tell the two apart where the
    difference matters: a per-day exclusion is a statement about that night, and
    this is a statement about everything from a date on.
    """
    if c is None:
        return None
    return {
        "reason": c.reason or "",
        "by": c.set_by or None,
        "at": c.set_at.isoformat() if c.set_at else None,
        # Nothing was taken out of an average: the day never entered one.
        "score": None,
        "cutoff": True,
        "from": str(c.from_date)[:10],
    }


# ── writing ──────────────────────────────────────────────────────────────────

def set_cutoff(db: Session, *, leader_id: int | None, leader_name: str | None,
               from_date: str, manager_id: int | None, reason: str,
               actor: str | None) -> tuple[LeaderCutoff, str | None]:
    """Stop this leader counting from `from_date`. `(row, previous_from)`.

    Re-setting an existing cutoff MOVES it rather than failing — the operator is
    correcting the date they wrote, and a unique-key error on the second attempt
    would read as "the leader is not cut off". The previous floor comes back so
    the caller can say what actually changed, and so a date moved EARLIER can
    take the newly-covered days out of the AI queue.
    """
    k = person_key(leader_id, leader_name)
    row = db.query(LeaderCutoff).filter_by(leader_key=k).first()
    prev = str(row.from_date)[:10] if row is not None else None
    if row is None:
        row = LeaderCutoff(leader_key=k)
        db.add(row)
    row.from_date = str(from_date)[:10]
    row.leader_profile_id = int(leader_id) if leader_id else None
    row.leader_name = (leader_name or "")[:160] or None
    row.manager_id = int(manager_id) if manager_id else None
    row.reason = (reason or "").strip()[:2000]
    row.set_by = (actor or "")[:160] or None
    row.set_at = datetime.now(timezone.utc)
    return row, prev


def lift(db: Session, *, leader_id: int | None,
         leader_name: str | None) -> LeaderCutoff | None:
    """Put this leader back into the results. The row it removed, or None.

    Every day the cutoff covered returns at the score it always had — nothing
    was written onto one, so there is nothing to restore.
    """
    row = (db.query(LeaderCutoff)
           .filter_by(leader_key=person_key(leader_id, leader_name)).first())
    if row is not None:
        db.delete(row)
    return row


def drop_pending_reviews(db: Session, leader_id: int | None,
                         from_date: str) -> int:
    """Take the cut-off days' work back OUT of the AI queue.

    Closing the doors stops NEW rows; it does nothing about what was queued
    before the decision. Left alone those are spent on Gemini and then displayed
    on days that count nowhere.

    **Only never-judged rows go** — `reviewed_at IS NULL AND resolution IS NULL`,
    the same rule as `leader_exclusions.drop_pending_reviews`, the rehearsal
    purge and the paused-shift purge. A verdict already written is an answer
    somebody may have acted on, and a human ruling is that row's terminal state.
    Nothing is lost: `discover()` re-finds every ref the moment the cutoff is
    lifted.
    """
    if not leader_id:
        return 0
    n = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.leader_id == int(leader_id),
                 LeaderAiReview.date >= str(from_date)[:10],
                 LeaderAiReview.reviewed_at.is_(None),
                 LeaderAiReview.resolution.is_(None))
         .delete(synchronize_session=False))
    if n:
        logger.info("leader-cutoff: dropped %s queued review(s) for leader %s "
                    "from %s", n, leader_id, from_date)
    return int(n or 0)
