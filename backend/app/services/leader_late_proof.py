"""Proofs filed AFTER the task's own deadline — the one definition.

A per-task unit's task dies on its own clock: `leader_close.autoclose_due`
force-closes it, records it not-done and locks it forever. Until now that was
the whole story, and it had exactly one shape for two very different people —
the leader who did not do the work, and the leader who did it and could not
file it in time (a dead phone, a line that would not stop, a shift that ran
over). Both scored 0 and neither could say anything about it.

This module is the second story, and it changes NOTHING about the first:

  * the entry stays locked and not-done, so `leader_close.locked()` answers
    exactly what it always answered and no writer anywhere needs to learn a new
    rule;
  * the day closes on its own schedule, the score is stamped as it always was;
  * **the AI never sees any of it.** No `LeaderAiReview` row is written, so
    there is no queue door to close — a late proof is judged on WHY it is late,
    which is a question about a person and not about a photograph.

What it adds is a two-stage human decision, and the asymmetry is the design
(the operator's spec): the unit's own brigadir can REJECT it outright or make
the case for it to the admins, but cannot grant the points themselves. The
person closest to the leader knows best whether the excuse is true, and is the
worst possible choice for the only person who decides that it counts.

Points come back at the very end, through the ordinary `LeaderTaskOverride`
overlay — the same read-time mechanism an admin's manual done/not-done ruling
already uses, so an approved late proof moves the register, the leaderboard,
the day report and the corrected report DM without a single new scoring path.

THE ELIGIBILITY RULE, in one place: a task is late-fileable while

    the unit closes tasks one at a time (per-task mode — nothing else HAS a
    per-task deadline to miss), the task's own deadline has gone by, its day
    is still OPEN, the task was not actually done, and no late proof exists
    for it yet.

"its day is still open" is what bounds the window to the day (the operator's
call, 2026-08-30): the late door shuts when the checklist itself shuts, so a
proof can never arrive for a day whose score has already been reported and
read.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    LeaderLateProof, LeaderLateProofMedia, LeaderTaskDay, LeaderTaskEntry,
    LeaderTaskOverride, Manager, RoleProfile,
)
from app.services import action_log, leader_bot, leader_close, leader_tasks

logger = logging.getLogger(__name__)

# The stages, as one vocabulary. `status` is the stage AND the outcome — a
# separate "stage" column would be a second thing to keep in step with it, and
# every reader would have to consult both to answer one question.
SUPERVISOR = "supervisor"   # waiting on the unit's brigadir
ADMIN = "admin"             # uplifted, waiting on an admin
APPROVED = "approved"
REJECTED = "rejected"

OPEN_STATES = (SUPERVISOR, ADMIN)
DONE_STATES = (APPROVED, REJECTED)


# ── is this task late-fileable? ──────────────────────────────────────────────

def eligible(db: Session, *, day: LeaderTaskDay | None, task_id: int,
             cfg_entry: dict | None, shift: int | None,
             per_task: bool, now: datetime | None = None) -> bool:
    """THE predicate. True while a late proof may still be filed for this task.

    Every surface that offers, accepts or describes the late door reads this
    one function — the bot button, the bot's own re-check when the button is
    pressed, and the warning screen in between. A second spelling is how a
    leader is offered a door that then refuses them.

    Bounded to per-task units on purpose: a day-close unit has no per-task
    deadline to be late for, and the day's own deadline is where its checklist
    ends altogether.
    """
    if not per_task or day is None or day.closed_at is not None:
        return False
    if not cfg_entry or not cfg_entry.get("enabled"):
        return False
    # A task an admin handed back is on the DAY's deadline and is not late.
    if task_id in leader_close.reopened_tasks(day):
        return False
    if not leader_close.past_deadline(cfg_entry, shift, day.date, now):
        return False
    if leader_close.not_started(cfg_entry, shift, day.date, now):
        return False
    entry = (db.query(LeaderTaskEntry)
             .filter_by(day_id=day.id, task_id=task_id).first())
    # A task the leader actually DID has nothing to file late. Only the two
    # empty-handed endings qualify — the deadline caught it, or they answered
    # «Yo'q» — and both are recorded the same way: an entry that is not done.
    if entry is not None and entry.done:
        return False
    return existing(db, day.id, task_id) is None


def existing(db: Session, day_id: int, task_id: int) -> LeaderLateProof | None:
    """The one live late proof for this (day, task), whatever its state."""
    return (db.query(LeaderLateProof)
            .filter_by(day_id=day_id, task_id=task_id).first())


def by_day(db: Session, day_id: int) -> dict[int, LeaderLateProof]:
    """Every late proof on one day, keyed by task — one query for a whole menu."""
    return {r.task_id: r for r in
            db.query(LeaderLateProof).filter_by(day_id=day_id).all()}


# ── filing ───────────────────────────────────────────────────────────────────

def create(db: Session, *, day: LeaderTaskDay, task_id: int,
           prof: RoleProfile, shift: int | None, cfg_entry: dict | None,
           reason: str, media: list[tuple[str, int | None]],
           actor_telegram: int | None = None) -> LeaderLateProof:
    """File one late proof. The caller has already checked `eligible`.

    Photos are stored as the ARCHIVE-CHANNEL copies the relay returns, exactly
    as an ordinary proof is — the private-chat original is never kept, so the
    audit trail is the same one every other photo on the platform leaves.
    """
    row = LeaderLateProof(
        day_id=day.id, task_id=task_id,
        leader_id=prof.id, leader_name=prof.name,
        manager_id=day.manager_id, date=day.date, shift=shift,
        uid=leader_bot.day_uid(day.id),
        deadline=leader_close.task_deadline(cfg_entry, shift),
        status=SUPERVISOR, reason=(reason or "").strip()[:1000],
    )
    db.add(row)
    db.flush()
    for i, (file_id, msg_id) in enumerate(media):
        db.add(LeaderLateProofMedia(late_id=row.id, file_id=file_id,
                                    message_id=msg_id, pos=i))
    db.flush()
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_filed",
        actor_name=prof.name, target_kind="task", target_id=row.id,
        target_name=prof.name, unit_id=day.manager_id, day=day.date,
        details=[("leader", prof.name), ("task_id", task_id),
                 ("photos", len(media)), ("deadline", row.deadline)],
    )
    return row


def photos(db: Session, late_id: int) -> list[LeaderLateProofMedia]:
    return (db.query(LeaderLateProofMedia)
            .filter_by(late_id=late_id)
            .order_by(LeaderLateProofMedia.pos).all())


# ── the two rulings ──────────────────────────────────────────────────────────

class Refused(Exception):
    """The ruling cannot be made — already decided, or the wrong stage."""


def decide_supervisor(db: Session, row: LeaderLateProof, *, action: str,
                      note: str | None, actor_name: str,
                      actor_telegram: int | None = None) -> None:
    """Stage 1. `action` is "rejected" (final) or "uplifted" (to the admins).

    A reject is FINAL and costs nothing extra: the task already scores 0, so
    refusing simply lets that stand and closes the row so nobody re-reads it.
    An uplift REQUIRES the brigadir's own case for it — an admin ruling on a
    reason they have no context for is a coin toss, and the person who does
    have that context is exactly the one passing it up.
    """
    if row.status != SUPERVISOR:
        raise Refused(row.status)
    note = (note or "").strip()
    if action == "uplifted" and not note:
        raise Refused("note required")
    row.sup_action = action
    row.sup_note = note[:1000] or None
    row.sup_by_name = actor_name
    row.sup_by_telegram = actor_telegram
    row.sup_at = datetime.now(timezone.utc)
    row.status = ADMIN if action == "uplifted" else REJECTED
    db.flush()
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_supervisor",
        actor_name=actor_name, target_kind="task", target_id=row.id,
        target_name=row.leader_name, unit_id=row.manager_id, day=row.date,
        details=[("leader", row.leader_name), ("task_id", row.task_id),
                 ("action", action)],
        reason=note or None,
    )


def decide_admin(db: Session, row: LeaderLateProof, *, action: str,
                 note: str | None, actor_name: str,
                 actor_telegram: int | None = None) -> None:
    """Stage 2 — the only place points can come back.

    Approval writes the `LeaderTaskOverride`, which is what actually moves the
    number: the day's stored `completion` is never rewritten (a closed bot day
    is immutable), so the correction is applied at read time by
    `routers/leaders._apply_overlays`, everywhere at once, for the register,
    the leaderboard, the day report and the corrected report DM alike.
    """
    if row.status != ADMIN:
        raise Refused(row.status)
    if action not in (APPROVED, REJECTED):
        raise Refused("bad action")
    row.adm_action = action
    row.adm_note = (note or "").strip()[:1000] or None
    row.adm_by_name = actor_name
    row.adm_by_telegram = actor_telegram
    row.adm_at = datetime.now(timezone.utc)
    row.status = action
    if action == APPROVED:
        _grant(db, row, actor_name)
    db.flush()
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_admin",
        actor_name=actor_name, target_kind="task", target_id=row.id,
        target_name=row.leader_name, unit_id=row.manager_id, day=row.date,
        details=[("leader", row.leader_name), ("task_id", row.task_id),
                 ("action", action)],
        reason=(note or "").strip() or None,
    )


def _grant(db: Session, row: LeaderLateProof, actor_name: str) -> None:
    """Give the task its full weight back, through the ordinary overlay.

    FULL weight, by the operator's ruling: an approved late proof is the work
    having been done and shown, and a fraction would need a number nobody has
    chosen. The lateness is not laundered — the row itself, its chip in the
    register and the day report all go on saying the proof arrived late and who
    decided it counted.
    """
    if not row.uid:
        return
    ov = (db.query(LeaderTaskOverride)
          .filter_by(uid=row.uid, task_id=row.task_id).first())
    if ov is None:
        ov = LeaderTaskOverride(uid=row.uid, task_id=row.task_id, date=row.date,
                                leader=row.leader_name)
        db.add(ov)
    ov.done = True
    ov.set_by = actor_name
    ov.set_at = datetime.now(timezone.utc)
    db.flush()


def revoke(db: Session, row: LeaderLateProof) -> None:
    """Take back a grant — the inverse of `_grant`, for an undone approval.

    Deletes the override rather than writing `done=False`: the row exists only
    because this flow put it there, and a false one would state that an admin
    ruled the task NOT done, which nobody did.
    """
    if not row.uid:
        return
    (db.query(LeaderTaskOverride)
     .filter_by(uid=row.uid, task_id=row.task_id).delete())
    db.flush()


# ── who is answerable for one ────────────────────────────────────────────────

def supervisor_of(db: Session, row: LeaderLateProof) -> Manager | None:
    if not row.manager_id:
        return None
    return db.query(Manager).filter_by(id=int(row.manager_id)).first()


def task_name(db: Session, row: LeaderLateProof, lang: str) -> str:
    """The task's name in one language, resolved down the leader's own chain."""
    prof = db.query(RoleProfile).filter_by(id=int(row.leader_id)).first()
    if prof is None:
        return f"#{row.task_id}"
    cfg = leader_tasks.effective_leader_config(db, prof, row.shift)
    entry = cfg.get(int(row.task_id))
    return leader_tasks.config_name(entry, lang) if entry else f"#{row.task_id}"


# ── telling people ───────────────────────────────────────────────────────────

def notify_decided(db: Session, row: LeaderLateProof, *, stage: str) -> None:
    """Tell the leader what happened to their late proof.

    Always, and at every terminal stage — including a rejection. A leader who
    filed a reason and heard nothing back learns that filing one is pointless,
    which is the one outcome that makes the whole flow worthless.
    """
    from app.identity import profile_key
    from app.routers.staff import notify_profile

    nkey = {
        REJECTED: "late_proof_rejected",
        APPROVED: "late_proof_approved",
        ADMIN: "late_proof_uplifted",
    }.get(row.status)
    if not nkey:
        return
    by = row.adm_by_name if stage == "admin" else row.sup_by_name
    note = row.adm_note if stage == "admin" else row.sup_note
    params = {
        "date": row.date,
        "task": task_name(db, row, "uz"),
        "by": by or "—",
        "note": (note or "—").strip() or "—",
    }
    try:
        notify_profile(db, profile_key("leader", int(row.leader_id)),
                       nkey, params,
                       type="success" if row.status == APPROVED else "info")
    except Exception:
        logger.warning("late-proof leader notice failed", exc_info=True)


def rescore(db: Session, row: LeaderLateProof) -> None:
    """Re-send the day's report when an approval moved its score.

    The same door a re-review or an upheld dispute uses, so a corrected number
    announces itself once and in one voice. Never fatal: a DM that cannot be
    delivered must not roll back a ruling somebody already made.
    """
    try:
        from app.services import leader_reports
        leader_reports.resend_if_changed(db, uid=row.uid)
    except Exception:
        logger.warning("late-proof rescore failed", exc_info=True)
