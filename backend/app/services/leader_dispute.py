"""Objections to an automatic AI rejection — the one definition of the chain.

A flag costs its task the whole weight the moment it is written, and nobody
presses anything to make that happen. The way back has to be at least as
reliable as the deduction, and until now it was not: the objection could only
be raised by the unit's BRIGADIR, in one step, straight to an admin. Two things
were wrong with that, and both were reported from the floor.

  * **The person who was judged could not speak.** The leader reads the verdict
    on their own day report — the report DM goes to them by design — sees a
    photo they know is right refused for a reason they can answer, and has no
    control that does anything. Their only route was to find their brigadir and
    persuade them to type it up, so the objection that reached the admin was a
    second-hand paraphrase of an argument nobody recorded.
  * **The admin ruled with one side of it.** One note, from somebody who was
    not there, on a photograph they did not take. Whether the reason is TRUE is
    a question about the shift, and the person who can answer it is the
    brigadir — who was being asked to be the author instead of the witness.

So the chain is the one the late-proof flow already runs
(`leader_late_proof`), for the same reason and in the same shape — a leader who
missed a deadline and a leader the machine misjudged are the same person asking
the same thing, and answering them through two different flows taught nobody
anything:

    leader     files the objection with their own note, off the day report
               they were sent.
    supervisor the unit's own brigadir reads that note and either REJECTS it
               (final — the AI ruling stands and the task keeps its 0) or
               UPLIFTS it, which REQUIRES their own written case for why it
               should be pointed. They cannot restore the weight themselves.
    admin      reads BOTH notes and decides whether it counts. Approving is
               the only thing that gives the task its weight back.

The asymmetry is the design, not an omission. The person closest to the leader
knows best whether the excuse is true, and is the worst possible choice for the
only person who decides that it counts.

`status` is the stage AND the outcome, one column — "supervisor" → "admin" →
"approved" | "rejected", plus "cancelled" for a ruling taken back. A separate
stage column would be a second thing to keep in step, and every reader would
consult both to answer one question.

WHERE A FILING ENTERS is decided by WHO FILED IT, and that one rule is what
keeps the older flow's capability alive without a second code path:

    a leader     → "supervisor". The normal case, and the one this exists for.
    a supervisor → "admin", recorded as their own uplift. About
                   18% of leader rows never resolve to a profile (see
                   `leader-register-unlinked-rows`), so those leaders cannot
                   log in as themselves and the brigadir is the ONLY person who
                   can raise the objection at all. Making this leader-only
                   would have closed the route back for exactly them.
    an admin     → filed and settled in one act, unchanged: an admin asking
                   themselves for permission is not a flow.

It is also how every row filed under the OLD flow reads correctly with no
rewriting: those were all filed by a brigadir and were all waiting on an admin,
which is precisely "entered at the admin stage". `startup.migrate_dispute_stages`
does nothing more than say so.

THE WEIGHT still moves in exactly one place — `LeaderAiReview.resolution`, the
same field an admin's triage ruling writes — so nothing downstream learns a new
rule. This module is the paper trail and the queue; that column is the score.
And it is written from the ADMIN stage ONLY: see `_write_verdict` for the two
ways a stage-1 write breaks that, both of which this module shipped with.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import LeaderAiDispute, LeaderAiReview

logger = logging.getLogger(__name__)

# The stages, as one vocabulary. Storage words — never shown to anybody without
# going through a translation first.
SUPERVISOR = "supervisor"   # waiting on the unit's brigadir
ADMIN = "admin"             # uplifted, waiting on an admin
APPROVED = "approved"
REJECTED = "rejected"
CANCELLED = "cancelled"     # a settled ruling taken back

OPEN_STATES = (SUPERVISOR, ADMIN)
DONE_STATES = (APPROVED, REJECTED, CANCELLED)

# The two stage-1 verbs, and the two stage-2 ones.
SUP_ACTIONS = ("rejected", "uplifted")
ADM_ACTIONS = (APPROVED, REJECTED)

REASON_MAX = 1000


class Refused(Exception):
    """The ruling cannot be made — already decided, or the wrong stage."""


# ── who files, and where it lands ────────────────────────────────────────────

def entry_stage(role: str | None) -> str:
    """THE stage a new filing enters at, from the filer's role.

    One function because three surfaces ask it — the endpoint that files, the
    day report that describes what pressing the button will do, and the
    migration that places every legacy row. A second spelling is how a leader
    is told their objection went to their brigadir while it sat with an admin.
    """
    return SUPERVISOR if role == "leader" else ADMIN


# ── the verdict: the ONE place the weight moves ──────────────────────────────

def _review(db: Session, d: LeaderAiDispute) -> LeaderAiReview | None:
    """The verdict under objection. By id, falling back to the ref.

    Keyed by `ref` and not by `review_id` for the reason the model states: a
    review row is re-creatable from its ref (discovery re-inserts a deleted
    row), so a dispute hung off the numeric id alone would lose its subject.
    """
    return (db.query(LeaderAiReview).filter_by(id=d.review_id).first()
            if d.review_id else None) \
        or db.query(LeaderAiReview).filter_by(ref=d.ref).first()


def _write_verdict(db: Session, d: LeaderAiDispute, resolution: str | None,
                   by_name: str | None, note: str | None) -> None:
    """Stamp the human ruling onto the verdict — what actually moves the score.

    **Reachable from the ADMIN stage only** (`decide_admin`, and `undo`
    reversing one). `approved` is the only value that restores the task's
    weight; `rejected` is a human agreeing with the machine. `None` clears the
    ruling, which is what an undo means.

    A stage-1 refusal deliberately writes NOTHING here, and that is load-bearing
    twice over — it was written unconditionally in the first cut of this module
    and both consequences are real:

      * `rejected` deducts in EVERY regime (`leader_ai.rejected_by_uid` matches
        `resolution == "rejected"` outside `_auto_clause()` entirely), so on a
        manual-regime day — where a flag costs nothing until a human rules — a
        brigadir refusing an objection would newly TAKE the weight off. That is
        a supervisor moving a score, which this chain exists to prevent.
      * an open objection does not remove its verdict from the AI triage queue
        (`resolution.is_(None)`), so an admin can rule `approved` there while
        the objection still sits at stage 1. `supersede` only retires SETTLED
        rows, so the brigadir's card survives — and their refusal would then
        overwrite the admin's `approved` and strip the weight it restored.

    The objection ROW is the paper trail for a brigadir's refusal. The triage
    queue is the ADMIN's queue, and a flag staying in it after a brigadir
    declined to argue for it is correct, not a leak.
    """
    rev = _review(db, d)
    if rev is None:
        return
    rev.resolution = resolution
    rev.resolved_by = (by_name or "")[:160] or None if resolution else None
    rev.resolved_at = datetime.now(timezone.utc) if resolution else None
    rev.resolution_note = (note or "")[:2000] or None if resolution else None


# ── filing ───────────────────────────────────────────────────────────────────

def create(db: Session, *, ref: str, review_id: int | None, report: dict,
           task_id: int, reason: str, role: str | None,
           profile: str | None, actor_name: str | None,
           actor_telegram: int | None) -> LeaderAiDispute:
    """File one objection, at the stage its filer's role puts it.

    Replaces every earlier row for the same verdict, so one rejection never
    carries two live objections — a refused objection may be filed again with
    a better account of the day, exactly as before.

    A SUPERVISOR's filing is recorded as their uplift — `sup_action` says an
    uplift is what happened and `sup_by_name` says who made it — but the TEXT
    is left in `reason` alone. Copying it into `sup_note` as well made every
    reader print one sentence twice under two different labels ("the leader's
    note" and "the brigadir's case"), which is precisely the confusion
    `requested_by_profile` exists to prevent. `echoes_reason` is the guard for
    the rows already written that way, this module's own first cut included.
    """
    for old in db.query(LeaderAiDispute).filter_by(ref=ref).all():
        db.delete(old)
    db.flush()

    stage = entry_stage(role)
    text = (reason or "").strip()[:REASON_MAX]
    d = LeaderAiDispute(
        ref=ref, review_id=review_id, date=report["date"], task_id=task_id,
        leader_id=report["leaderId"], leader_name=(report["leader"] or "")[:160],
        manager_id=report["managerId"], status=stage, reason=text,
        requested_by_profile=profile, requested_by_name=actor_name,
        requested_by_telegram=actor_telegram,
    )
    if stage == ADMIN:
        # Filed by somebody who already outranks stage 1: the uplift IS the
        # filing, so it is recorded as one rather than leaving the admin card
        # printing an empty brigadir block that nobody skipped.
        d.sup_action = "uplifted"
        d.sup_by_name = actor_name
        d.sup_by_telegram = actor_telegram
        d.sup_at = datetime.now(timezone.utc)
    db.add(d)
    db.flush()
    return d


def echoes_reason(d: LeaderAiDispute) -> bool:
    """Is `sup_note` merely a copy of the text this row was FILED with?

    True for a supervisor's or admin's own filing (their text IS the uplift) and
    for every row `startup.migrate_dispute_stages` moved, which copied `reason`
    into `sup_note` by design. Every surface that prints the two notes as a
    thread asks this first — otherwise one sentence appears twice, attributed
    once to the leader and once to the brigadir, on the very card somebody is
    supposed to weigh two accounts from.

    ONE definition, because three renderers need it: the admin's Telegram card,
    the «Norozliklar» queue and the day report.
    """
    a = (d.sup_note or "").strip()
    return bool(a) and a == (d.reason or "").strip()


def sup_case(d: LeaderAiDispute) -> str | None:
    """The brigadir's OWN words, or None when they never added any."""
    return None if echoes_reason(d) else ((d.sup_note or "").strip() or None)


# ── stage 1: the unit's brigadir ─────────────────────────────────────────────

def decide_supervisor(db: Session, d: LeaderAiDispute, *, action: str,
                      note: str | None, actor_name: str | None,
                      actor_telegram: int | None = None) -> None:
    """`action` is "rejected" (final) or "uplifted" (to the admins).

    An uplift REQUIRES the brigadir's own case for it. That is the whole reason
    this stage exists: an admin ruling on an account of a shift they were not
    on is a coin toss, and the one person who was there is exactly the one
    passing it up. A rejection needs no note — the AI ruling simply stands and
    the task keeps the 0 it already has — but the leader is told either way, so
    a brigadir who explains themselves is doing the leader a kindness the flow
    does not force.
    """
    if d.status != SUPERVISOR:
        raise Refused(d.status)
    if action not in SUP_ACTIONS:
        raise Refused("bad action")
    note = (note or "").strip()
    if action == "uplifted" and not note:
        raise Refused("note required")
    d.sup_action = action
    d.sup_note = note[:REASON_MAX] or None
    d.sup_by_name = (actor_name or "")[:160] or None
    d.sup_by_telegram = actor_telegram
    d.sup_at = datetime.now(timezone.utc)
    d.status = ADMIN if action == "uplifted" else REJECTED
    # NOTHING is written to the verdict here — see `_write_verdict`. A refusal
    # settles this ROW and leaves the score exactly where it already was, which
    # is the whole difference between the two stages. The twin flow does the
    # same: `leader_late_proof.decide_supervisor` touches no scoring column.
    db.flush()


# ── stage 2: the admins — the only place the weight comes back ───────────────

def decide_admin(db: Session, d: LeaderAiDispute, *, action: str,
                 note: str | None, actor_name: str | None,
                 actor_telegram: int | None = None) -> None:
    """Approve (the task gets its weight back) or refuse (the AI ruling stands).

    Approving writes `resolution="approved"` on the verdict, which is what
    actually restores the weight — everywhere at once, at read time, for the
    register, the leaderboard, the day report and the corrected report DM
    alike. This row stays the paper trail.
    """
    if d.status != ADMIN:
        raise Refused(d.status)
    if action not in ADM_ACTIONS:
        raise Refused("bad action")
    note = (note or "").strip()
    d.status = action
    d.decision_note = note[:REASON_MAX] or None
    d.decided_by_name = (actor_name or "")[:160] or None
    d.decided_by_telegram = actor_telegram
    d.decided_at = datetime.now(timezone.utc)
    _write_verdict(db, d, action, actor_name,
                   f"dispute #{d.id}: {note or d.reason}")
    db.flush()


def undo(db: Session, d: LeaderAiDispute, *, actor_name: str | None,
         actor_telegram: int | None = None) -> str:
    """Take a settled ruling back. Returns what it was.

    Reverses exactly the two writes the ruling made: the verdict goes back to
    `open` — nobody has ruled, which in the automatic regime means the flag
    costs its weight again, the state the day was in before anyone touched it —
    and this row becomes `cancelled` rather than being deleted, because a score
    that moved twice has to stay explainable afterwards, and because only a
    LIVE row blocks a re-filing: a cancelled one lets the leader object again.

    It reaches a stage-1 refusal too. A brigadir's rejection is final for the
    brigadir, not for the platform — they are one tap from ending an objection
    they have not finished reading, and an admin is who fixes that.
    """
    if d.status not in (APPROVED, REJECTED):
        raise Refused(d.status)
    was = d.status
    # Clear the verdict ONLY when this objection is what wrote it — i.e. an
    # ADMIN settled it at stage 2 (`decided_at`). A stage-1 refusal writes no
    # resolution at all, so whatever is on the verdict now was put there by
    # somebody else (an admin's triage ruling, most likely) and blanking it
    # here would silently reverse THEIR decision under cover of undoing this
    # one — the same clobber, in the opposite direction.
    if d.decided_at is not None:
        _write_verdict(db, d, None, None, None)
    d.status = CANCELLED
    d.decided_by_name = (actor_name or "")[:160] or d.decided_by_name
    d.decided_by_telegram = actor_telegram
    d.decided_at = datetime.now(timezone.utc)
    db.flush()
    return was


def supersede(db: Session, ref: str, resolution: str | None,
              by: str | None = None) -> bool:
    """Cancel a settled objection that a LATER ruling on the same verdict has
    contradicted. Does not commit — the caller's own commit carries it.

    The AI triage tab rules on the verdict; this table is the paper trail the
    day report prints beside it. Moving one without the other is how a card
    ends up showing a refused task under a green «objection upheld» box: two
    sentences that were each true when written and cannot both describe the
    score on screen now.

    A settled row records the resolution its ruling wrote — `approved` →
    approved, `rejected` → rejected. Anything else on the verdict now
    (including `open` and `requeried`) means a human has overruled it.
    """
    expects = {APPROVED: APPROVED, REJECTED: REJECTED}
    hit = False
    for d in (db.query(LeaderAiDispute)
              .filter(LeaderAiDispute.ref == ref,
                      LeaderAiDispute.status.in_(tuple(expects))).all()):
        if expects[d.status] == resolution:
            continue
        d.status = CANCELLED
        if by:
            d.decided_by_name = by[:160]
        d.decided_at = datetime.now(timezone.utc)
        hit = True
        logger.info("leader-dispute: %s superseded by a %s ruling on %s",
                    d.id, resolution or "open", ref)
    return hit


# ── telling people ───────────────────────────────────────────────────────────

def task_label(db: Session, d: LeaderAiDispute) -> str:
    from app.services import leader_ai
    return leader_ai.task_label(db, d.task_id, d.manager_id, d.leader_id)


def notify_filed(db: Session, d: LeaderAiDispute) -> None:
    """Tell the unit's brigadir that one of their leaders has objected.

    Only at stage 1 — an objection a supervisor filed themselves needs no
    message telling them they filed it.
    """
    if d.status != SUPERVISOR or not d.manager_id:
        return
    from app.identity import profile_key
    from app.routers.staff import notify_profile
    try:
        notify_profile(db, profile_key("supervisor", int(d.manager_id)),
                       "leader_dispute_filed", {
                           "date": d.date, "task": task_label(db, d),
                           "leader": d.leader_name or "—",
                           "reason": (d.reason or "—")[:400],
                       }, type="warning")
    except Exception:
        logger.warning("leader-dispute: supervisor notice failed", exc_info=True)


def notify_decided(db: Session, d: LeaderAiDispute, *, stage: str) -> None:
    """Tell the leader — and, once it is out of their hands, the brigadir too.

    At EVERY terminal stage, refusal included. A leader who explained themselves
    and heard nothing back learns that explaining is pointless, which is the one
    outcome that makes the whole flow worthless.
    """
    from app.identity import profile_key
    from app.routers.staff import notify_profile

    nkey = {
        ADMIN: "leader_dispute_uplifted",
        APPROVED: "leader_dispute_approved",
        REJECTED: ("leader_dispute_sup_rejected" if stage == "supervisor"
                   else "leader_dispute_rejected"),
        CANCELLED: "leader_dispute_undone",
    }.get(d.status)
    if not nkey:
        return
    by = d.sup_by_name if stage == "supervisor" else d.decided_by_name
    note = d.sup_note if stage == "supervisor" else d.decision_note
    params = {
        "date": d.date, "task": task_label(db, d),
        "by": by or "—", "note": (note or "—").strip() or "—",
    }
    tone = "success" if d.status == APPROVED else "info"
    try:
        dmed = set()
        if d.leader_id:
            dmed = notify_profile(db, profile_key("leader", int(d.leader_id)),
                                  nkey, params, type=tone) or set()
        # The brigadir hears about the two rulings they did not make — the
        # admin's, and an undo. Telling them about their OWN stage-1 decision
        # is a message that says what they just pressed.
        if d.manager_id and stage != "supervisor":
            notify_profile(db, profile_key("supervisor", int(d.manager_id)),
                           nkey, params, type=tone, skip_accounts=dmed)
    except Exception:
        logger.warning("leader-dispute: decision notice failed", exc_info=True)
