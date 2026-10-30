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
    per-task deadline to miss), the task's own deadline has gone by, the
    LATE WINDOW is still open, the task was not actually done, and no late
    proof exists for it yet.

THE LATE WINDOW (2026-10-14, the operator's rulings): shift 1 until 24:00 of
the checklist day, shift 2 until 12:00 the morning after its night — by the
shift the leader's CHECKLIST runs on (`leader_shift`), strict: at the minute
the door shuts, nothing more is accepted and the draft roll goes. It used to
be «while the day is open», and on a per-task unit the day closes itself the
moment its last task closes — 20:00 on shift 1, 09:00 on shift 2 — so a
leader who missed a morning task had at most a few hours, and none at all
for the last tasks of the day. A closed day does not shut it any more; the
leader's own «Kunni yopish» does (`finish_day`), for that checklist.

THE BRIGADIR HEARS AT THE END (same day, the operator: «When everyone closes
the day, then send»): a filing is stored at once and the leader can see it,
but the brigadir's card and the chat's first notice are HELD until every
leader of the unit is done with that day — pressed «Kunni yopish», has
nothing left to file late, or reached the cut-off — and then go out together
(`release`, run at the filing, at each «Kunni yopish» and every five minutes
by `leader_close._sweep`).
"""
from __future__ import annotations

import logging
from datetime import date as _date, datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from sqlalchemy.orm import Session

from app.models import (
    LeaderAiDispute, LeaderLateProof, LeaderLateProofMedia, LeaderLateProofShot, LeaderTaskDay,
    LeaderTaskEntry, LeaderTaskOverride, Manager, RoleProfile,
)
from app.services import (
    action_log, leader_bot, leader_close, leader_dispute, leader_proof,
    leader_tasks)

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


# ── the late window ──────────────────────────────────────────────────────────

def late_until(shift: int | None, date: str | None) -> datetime | None:
    """THE end of the late window for checklist `date` on `shift` — Tashkent.

    Shift 1 (and a unit with no shift, which files on the calendar day) until
    24:00 of the date itself, i.e. 00:00 of the next one; shift 2 until 12:00
    of the morning after its night (the night of 13 → 14 October closes its
    late door at 12:00 on the 14th). `shift` is the one the leader's CHECKLIST
    runs on that day — `checklist_shift` — never the unit's when the two
    differ. None only when the date cannot be read."""
    try:
        d = _date.fromisoformat(str(date or "")[:10])
    except ValueError:
        return None
    nxt = d + timedelta(days=1)
    hh = 12 if shift == 2 else 0
    return datetime(nxt.year, nxt.month, nxt.day, hh, 0, tzinfo=leader_proof.TASHKENT)


def late_until_label(shift: int | None) -> str:
    """The cut-off as people say it — «24:00», or «12:00» for a night."""
    return "12:00" if shift == 2 else "24:00"


def checklist_shift(db: Session, prof: RoleProfile, date: str) -> int:
    """The shift this leader's checklist for `date` runs on — their unit's,
    unless their profile moved it (`services/leader_shift`)."""
    from app.services import leader_shift
    return leader_shift.shift_on(db, prof.id, date,
                                 leader_shift.unit_shift(db, prof.manager_id))


def window_open(day: LeaderTaskDay | None, shift: int | None, date: str,
                now: datetime | None = None) -> bool:
    """Is the late window of this checklist still open — before its cut-off and
    not shut by the leader's own «Kunni yopish»?"""
    if day is not None and day.finished_at is not None:
        return False
    cut = late_until(shift, date)
    return cut is None or (now or datetime.now(timezone.utc)) < cut


# ── is this task late-fileable? ──────────────────────────────────────────────

def eligible(db: Session, *, day: LeaderTaskDay | None, task_id: int,
             cfg_entry: dict | None, shift: int | None,
             per_task: bool, now: datetime | None = None,
             entries: dict | None = None, lates: dict | None = None) -> bool:
    """THE predicate. True while a late proof may still be filed for this task.

    Every surface that offers, accepts or describes the late door reads this
    one function — the bot button, the bot's own re-check when the button is
    pressed, and the warning screen in between. A second spelling is how a
    leader is offered a door that then refuses them.

    Bounded to per-task units on purpose: a day-close unit has no per-task
    deadline to be late for, and the day's own deadline is where its checklist
    ends altogether.

    `entries` / `lates` (task id → row, for this day) let a caller asking about
    a whole checklist read each table once (`late_open`); the rule is the same.
    """
    if not per_task:
        return False
    if not cfg_entry or not cfg_entry.get("enabled"):
        return False
    # An AUTOMATIC task has no late door, because it had no door at all: nobody
    # was allowed to file it, so nobody can be late for it. Without this refusal
    # every auto task matches the whole of the rest of this function — enabled,
    # untouched, past its hour, not done — and the leader is offered «Kechikkan
    # isbot» on a verdict the platform reached by reading its own database, then
    # a brigadir and an admin are put in front of a two-stage ruling about a
    # photograph of it. This is the ONE place it can be refused once: the bot
    # screen and `routers/leader_proof._late_ctx` both read this predicate.
    from app.services import leader_auto
    if leader_auto.is_auto(cfg_entry):
        return False
    # A DAY ROW MAY NOT EXIST, and that is the commonest case this feature is
    # for. `LeaderTaskDay` is created lazily by the first SAVED task, so a
    # leader who filed nothing all day has none — and `autoclose_due` only
    # walks days that exist, so nothing was force-closed and nothing is locked.
    # Refusing on a missing day made the whole flow unreachable for exactly the
    # leader it was built for (found in production, 2026-08-30).
    #
    # Absent means "open and holding nothing", which is open. The row is
    # created when the leader actually commits to filing late, never by a
    # sweep, so an untouched day is never conjured.
    #
    # A CLOSED day is no longer the end (2026-10-14): the window runs to the
    # cut-off — 24:00, or 12:00 for a night — unless the leader pressed
    # «Kunni yopish» on this checklist.
    now = now or datetime.now(timezone.utc)
    date = day.date if day is not None else leader_tasks.effective_date(shift)
    if not window_open(day, shift, date, now):
        return False
    # Nothing before 1 September 2026 can be argued any more — the floor the
    # objection chain applies too, defined once in `leader_dispute`.
    if not leader_dispute.appealable(date):
        return False
    # A task an admin handed back is on the DAY's deadline and is not late.
    if day is not None and task_id in leader_close.reopened_tasks(day):
        return False
    if not leader_close.past_deadline(cfg_entry, shift, date, now):
        return False
    if leader_close.not_started(cfg_entry, shift, date, now):
        return False
    if day is None:
        # Nothing filed, nothing locked, nothing already late-filed — and the
        # deadline has gone by. That is precisely a late filing.
        return True
    entry = (entries.get(task_id) if entries is not None else
             db.query(LeaderTaskEntry)
             .filter_by(day_id=day.id, task_id=task_id).first())
    # A task the leader actually DID has nothing to file late. Only the two
    # empty-handed endings qualify — the deadline caught it, or they answered
    # «Yo'q» — and both are recorded the same way: an entry that is not done.
    if entry is not None and entry.done:
        return False
    # An objection to the closing itself (2026-10-30) already argues this task:
    # while it waits, or once it gave the weight back, a late proof would be a
    # second chain granting the same weight.
    if entry is not None and db.query(LeaderAiDispute.id).filter(
            LeaderAiDispute.ref == f"bot:{entry.id}",
            LeaderAiDispute.status.in_(
                (*leader_dispute.OPEN_STATES, leader_dispute.APPROVED))).first():
        return False
    if lates is not None:
        return task_id not in lates
    return existing(db, day.id, task_id) is None


def late_open(db: Session, *, day: LeaderTaskDay | None, cfg: dict,
              shift: int | None, per_task: bool,
              now: datetime | None = None) -> list[int]:
    """Every task of this checklist a late proof may still be filed for —
    `eligible`, asked of the whole config with each table read once. The bot
    menu, the web tab and the release readiness all count off this."""
    if not per_task:
        return []
    now = now or datetime.now(timezone.utc)
    entries = lates = None
    if day is not None:
        entries = {e.task_id: e for e in
                   db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
        lates = by_day(db, day.id)
    return [tid for tid, c in cfg.items()
            if c.get("enabled") and eligible(
                db, day=day, task_id=tid, cfg_entry=c, shift=shift,
                per_task=True, now=now, entries=entries, lates=lates)]


def existing(db: Session, day_id: int, task_id: int) -> LeaderLateProof | None:
    """The one live late proof for this (day, task), whatever its state."""
    return (db.query(LeaderLateProof)
            .filter_by(day_id=day_id, task_id=task_id).first())


def by_day(db: Session, day_id: int) -> dict[int, LeaderLateProof]:
    """Every late proof on one day, keyed by task — one query for a whole menu."""
    return {r.task_id: r for r in
            db.query(LeaderLateProof).filter_by(day_id=day_id).all()}


# ── the draft roll: photos taken before the reason is written ────────────────
#
# BOTH doors land here — the in-app camera and a photo sent to the bot chat —
# so the count on screen, the durability and the submit all read one store.
#
# It is a table and not the bot's `LeaderTaskCapture` staging row because that
# row is per Telegram ACCOUNT, is deleted by any `_lt_clear` (a plain /tasks
# does one) and expires after 30 minutes: a leader who took three photos and
# then spent too long writing the reason lost all three. And it is not
# `leader_task_photos` because that table is READ by the scoring path — see the
# model docstring; the short version is that `force_answer` would turn a late
# shot into a done entry and hand it to Gemini.


class ShotError(ValueError):
    """The shot cannot be stored — the same vocabulary the camera page reads."""


def draft_shots(db: Session, day_id: int, task_id: int) -> list[LeaderLateProofShot]:
    """Everything staged for this (day, task), in slot order."""
    return (db.query(LeaderLateProofShot)
            .filter_by(day_id=day_id, task_id=task_id)
            .order_by(LeaderLateProofShot.slot).all())


def draft_count(db: Session, day_id: int | None, task_id: int) -> int:
    if not day_id:
        return 0
    return (db.query(LeaderLateProofShot)
            .filter_by(day_id=day_id, task_id=task_id).count())


def _next_slot(current: list[LeaderLateProofShot], cap: int) -> int:
    taken = {p.slot for p in current}
    nxt = next((i for i in range(cap) if i not in taken), None)
    if nxt is None:
        raise ShotError("roll_full")
    return nxt


def save_shot(db: Session, *, prof: RoleProfile, day: LeaderTaskDay, task_id: int,
              cap: int, data: bytes | None, captured_at: datetime | None,
              slot: int | None, skew_s: int | None, relay,
              source: str, client_key: str | None = None,
              relayed: tuple[str, int | None] | None = None) -> LeaderLateProofShot:
    """Put one shot on the draft roll.

    Deliberately NOT a call into `leader_proof.save_photo`, and the difference
    is the whole safety argument: that function checks `_task_locked` (a late
    task is ALWAYS locked, so it would refuse every real filing), allocates a
    slot in the on-time roll's key space, and ends by calling `sync_entry`,
    which at `min_media` writes a `done` LeaderTaskEntry and rebuilds the media
    the AI reads. Punching a mode-shaped hole through those three would reach
    far past this feature. What IS shared is everything that should be — the
    stamp (`leader_proof.burn`) and the archive relay — because those are the
    parts that must not have a second spelling.

    `relayed` lets the bot pass an ALREADY-relayed chat photo straight in; the
    camera passes raw `data` and gets the server stamp burnt into it here.
    """
    from app.services import leader_proof

    if client_key:
        seen = (db.query(LeaderLateProofShot)
                .filter_by(leader_id=prof.id, task_id=task_id,
                           client_key=client_key).first())
        if seen:
            logger.info("late proof replay ignored: leader=%s task=%s key=%s",
                        prof.id, task_id, client_key)
            return seen

    current = draft_shots(db, day.id, task_id)
    if slot is None:
        slot = _next_slot(current, cap)
    elif slot < 0 or slot >= cap:
        raise ShotError("bad_slot")

    stamp_text = None
    if relayed is None:
        # The stamp is burnt on the SERVER or the shot is not stored — an
        # unstamped camera photo is indistinguishable from the third-party
        # shots this whole feature replaces.
        try:
            stamped, stamp_text = leader_proof.burn(data, captured_at)
        except leader_proof.ProofError:
            raise
        got = relay(stamped)
        if not got:
            raise ShotError("relay_failed")
    else:
        got = relayed
    file_id, message_id = got

    now = datetime.now(timezone.utc)
    old = next((p for p in current if p.slot == slot), None)
    if old is not None:
        # A retake REPLACES the slot; the channel post stays, because the
        # archive is the audit trail exactly as it is everywhere else here.
        db.delete(old)
        db.flush()
    row = LeaderLateProofShot(
        day_id=day.id, leader_id=prof.id, task_id=task_id, slot=slot,
        source=source, file_id=file_id, message_id=message_id,
        captured_at=captured_at, received_at=now, stamp=stamp_text,
        skew_s=skew_s, client_key=client_key,
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        # Two copies of one shot in flight — the offline drain can fire from
        # the mount effect and from `online` in the same second. The unique
        # index settles it; the loser answers with the winner's row rather than
        # failing a save the leader already made.
        db.rollback()
        seen = (db.query(LeaderLateProofShot)
                .filter_by(leader_id=prof.id, task_id=task_id,
                           client_key=client_key).first() if client_key else None)
        if seen:
            return seen
        raise
    return row


def delete_shot(db: Session, shot: LeaderLateProofShot) -> None:
    db.delete(shot)
    db.flush()


def clear_draft(db: Session, day_id: int | None, task_id: int) -> int:
    """Drop one task's draft roll. Returns how many shots went."""
    if not day_id:
        return 0
    n = (db.query(LeaderLateProofShot)
         .filter_by(day_id=day_id, task_id=task_id).delete())
    db.flush()
    return n


def drop_drafts(db: Session, day_id: int | None) -> int:
    """Drop every draft on a day whose late window has shut.

    Called when the leader presses «Kunni yopish» (`finish_day`) and, for a
    window that ran out at its cut-off, by `sweep` — never by the day closing
    any more, because the window now outlives the close (2026-10-14). Once it
    has shut nothing can ever submit these, and a draft roll left behind is a
    pile of photos with no route to any reader, which is the state this
    feature exists to abolish rather than create.
    """
    if not day_id:
        return 0
    n = db.query(LeaderLateProofShot).filter_by(day_id=day_id).delete()
    db.flush()
    return n


# ── filing ───────────────────────────────────────────────────────────────────

def create(db: Session, *, day: LeaderTaskDay, task_id: int,
           prof: RoleProfile, shift: int | None, cfg_entry: dict | None,
           reason: str, actor_telegram: int | None = None) -> LeaderLateProof:
    """File one late proof, CONSUMING its draft roll. Caller has checked `eligible`.

    The photos are not passed in: they are whatever is on the draft roll for
    this (day, task), whichever door put them there. One place knows the
    draft → filing transition, so there is no way for a caller to submit a
    different set of photos from the ones the leader was looking at.

    Provenance travels with each photo (`source`, `captured_at`, `stamp`) —
    a camera shot must stay distinguishable from an uploaded file all the way
    to the brigadir's card, or the stamp reads as decoration.

    Raises `ShotError("no_photos")` rather than filing an empty proof: a late
    filing with nothing to show is exactly what the brigadir cannot rule on.
    """
    shots = draft_shots(db, day.id, task_id)
    if not shots:
        raise ShotError("no_photos")
    row = LeaderLateProof(
        day_id=day.id, task_id=task_id,
        leader_id=prof.id, leader_name=prof.name,
        manager_id=day.manager_id, date=day.date, shift=shift,
        uid=leader_bot.day_uid(day.id),
        deadline=leader_close.task_deadline(cfg_entry, shift),
        # The same hour as an instant, from the same cfg in the same breath.
        # `deadline` alone cannot say how late this is: which DAY «09:00» falls
        # on is decided by the shift anchor, and only `closing_time` — which
        # `due_at` reads — knows the range it came off.
        due_at=leader_close.due_at(cfg_entry, shift, day.date),
        status=SUPERVISOR, reason=(reason or "").strip()[:1000],
    )
    db.add(row)
    db.flush()
    for i, sh in enumerate(shots):
        db.add(LeaderLateProofMedia(
            late_id=row.id, file_id=sh.file_id, message_id=sh.message_id,
            pos=i, source=sh.source, captured_at=sh.captured_at, stamp=sh.stamp,
            # WHEN the leader actually sent it. The draft row is deleted on the
            # next line, so this is the only chance to keep it — and it is the
            # only instant an UPLOADED photo has at all (`captured_at` is
            # camera-only by design, because a file the leader picked carries
            # no moment this platform can vouch for).
            received_at=sh.received_at,
        ))
        db.delete(sh)
    db.flush()
    from app.services import leader_appeal_chat as chat
    chat.add(db, chat.LATE, row.id, kind=chat.FILED, text=row.reason,
             author_profile=f"leader:{prof.id}", author_name=prof.name,
             author_role="leader", author_telegram=actor_telegram)
    cam = sum(1 for sh in shots if sh.source == "camera")
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_filed",
        actor_name=prof.name, target_kind="task", target_id=row.id,
        target_name=prof.name, unit_id=day.manager_id, day=day.date,
        details=[("leader", prof.name), ("task_id", task_id),
                 ("photos", len(shots)), ("in_app", cam),
                 ("uploaded", len(shots) - cam), ("deadline", row.deadline)],
    )
    return row


def photos(db: Session, late_id: int) -> list[LeaderLateProofMedia]:
    return (db.query(LeaderLateProofMedia)
            .filter_by(late_id=late_id)
            .order_by(LeaderLateProofMedia.pos).all())


def photos_for(db: Session, late_ids) -> dict[int, list[LeaderLateProofMedia]]:
    """`photos` for a whole queue in ONE query, keyed by proof id. Asked one
    card at a time, the «Kechikkan isbotlar» list (up to 400 cards) spent 83%
    of a 3.2 s answer on these lookups while it held a connection the full
    pool needed (the 2026-10-07 «Server was slow» DM)."""
    ids = sorted({int(i) for i in late_ids if i is not None})
    out: dict[int, list[LeaderLateProofMedia]] = {i: [] for i in ids}
    if not ids:
        return out
    for m in (db.query(LeaderLateProofMedia)
              .filter(LeaderLateProofMedia.late_id.in_(ids))
              .order_by(LeaderLateProofMedia.late_id, LeaderLateProofMedia.pos)
              .all()):
        out.setdefault(m.late_id, []).append(m)
    return out


# ── how late is late? ────────────────────────────────────────────────────────

def local(ts: datetime | None) -> datetime | None:
    """Any stored instant as the PLANT'S WALL CLOCK — Tashkent, as everywhere.

    Every deadline on this platform is a Tashkent clock and every timestamp
    column is a `timestamptz` the driver hands back in the database's own zone,
    which is UTC. Serving one beside the other is how a card came to print
    «filed 04:01» under «due 09:00» for a filing that was one minute LATE: two
    clocks, five hours apart, with nothing on screen saying so — and a reviewer
    reading it could only conclude the platform had flagged somebody who was
    five hours early.

    So the conversion happens HERE, once, on the way out, and the client goes on
    reading a plain ISO string. Deriving it in the browser would put the zone in
    a second place and make it the viewer's timezone rather than the plant's.

    A naive datetime is read as UTC — the zone `func.now()` writes — rather than
    as the box's local time, which is not contracted anywhere.
    """
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(leader_proof.TASHKENT)


def late_minutes(row: LeaderLateProof) -> int | None:
    """How late this filing was, in whole minutes — THE definition.

    `created_at - due_at`, both of them stored ON the row, so it costs no config
    lookup and cannot quietly restate itself when somebody edits a window next
    week. `deadline` is the same fact for a human to read; this is the same fact
    subtracted, and the two can never disagree because they were written from
    one `cfg_entry` in one breath.

    **None is a real answer and must stay distinguishable from 0.** A row filed
    before `due_at` existed that the backfill could not place, or one whose
    config could not be read, has no measurable lateness — and "filed exactly on
    the hour" is a very different thing to tell a reviewer than "we cannot say".
    A negative delta is None for the same reason: a row exists only because
    `eligible` found the deadline already past, so a filing that measures as
    EARLY means the two stamps disagree (a backfilled `due_at` read off a config
    that has since moved), and a late proof reported as early is worse than one
    reported as unmeasured.
    """
    due, at = row.due_at, row.created_at
    if due is None or at is None:
        return None
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    if at.tzinfo is None:
        at = at.replace(tzinfo=timezone.utc)
    mins = int((at - due).total_seconds() // 60)
    return mins if mins >= 0 else None


# ── the two rulings ──────────────────────────────────────────────────────────

class Refused(Exception):
    """The ruling cannot be made — already decided, or the wrong stage."""


def decide_supervisor(db: Session, row: LeaderLateProof, *, action: str,
                      note: str | None, actor_name: str,
                      actor_telegram: int | None = None,
                      actor_profile: str | None = None,
                      actor_role: str | None = None) -> None:
    """Stage 1. `action` is "rejected" (final for the brigadir) or "uplifted"
    (to the admins).

    BOTH require the brigadir's own comment (the operator's ruling, 2026-09-26
    — until then only an uplift did). A refusal costs nothing extra — the task
    already scores 0 — but the leader who explained themselves is owed the
    reason it was not enough; an uplift needs the case because an admin ruling
    on a reason they have no context for is a coin toss. Either way the comment
    is the ruling's entry in the chat.
    """
    from app.services import leader_appeal_chat as chat
    if row.status != SUPERVISOR:
        raise Refused(row.status)
    if action not in ("rejected", "uplifted"):
        raise Refused("bad action")
    note = (note or "").strip()
    if not note:
        raise Refused("note required")
    row.sup_action = action
    row.sup_note = note[:1000] or None
    row.sup_by_name = actor_name
    row.sup_by_telegram = actor_telegram
    row.sup_at = datetime.now(timezone.utc)
    row.status = ADMIN if action == "uplifted" else REJECTED
    chat.ruling(db, chat.LATE, row.id,
                chat.UPLIFTED if action == "uplifted" else chat.SUP_REJECTED,
                note=note, actor_name=actor_name, actor_telegram=actor_telegram,
                actor_profile=actor_profile, actor_role=actor_role,
                fallback_role="supervisor")
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
                 actor_telegram: int | None = None,
                 actor_profile: str | None = None,
                 actor_role: str | None = None) -> None:
    """Stage 2 — the only place points can come back.

    Approval writes the `LeaderTaskOverride`, which is what actually moves the
    number: the day's stored `completion` is never rewritten (a closed bot day
    is immutable), so the correction is applied at read time by
    `routers/leaders._apply_overlays`, everywhere at once, for the register,
    the leaderboard, the day report and the corrected report DM alike.

    A REFUSAL REQUIRES the admin's own reason, and it travels to the leader in
    the notice (`late_proof_rejected` prints `{note}`). This is the end of the
    chain: the leader did the work, filed it late, explained themselves to two
    people and has no route left — so «rejected» with nothing beside it is the
    platform declining to say why, on the one decision it cannot be argued
    with. Approving may carry a comment and needs none: the outcome IS the
    answer — the twin rule in `leader_dispute.decide_admin`.
    """
    if row.status != ADMIN:
        raise Refused(row.status)
    if action not in (APPROVED, REJECTED):
        raise Refused("bad action")
    note = (note or "").strip()
    if action == REJECTED and not note:
        raise Refused("note required")
    row.adm_action = action
    row.adm_note = note[:1000] or None
    row.adm_by_name = actor_name
    row.adm_by_telegram = actor_telegram
    row.adm_at = datetime.now(timezone.utc)
    row.status = action
    if action == APPROVED:
        _grant(db, row, actor_name)
    from app.services import leader_appeal_chat as chat
    chat.ruling(db, chat.LATE, row.id,
                chat.APPROVED if action == APPROVED else chat.REJECTED,
                note=note, actor_name=actor_name, actor_telegram=actor_telegram,
                actor_profile=actor_profile, actor_role=actor_role,
                fallback_role="admin")
    db.flush()
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_admin",
        actor_name=actor_name, target_kind="task", target_id=row.id,
        target_name=row.leader_name, unit_id=row.manager_id, day=row.date,
        details=[("leader", row.leader_name), ("task_id", row.task_id),
                 ("action", action)],
        reason=note or None,
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

def reopen_stage(row: LeaderLateProof) -> str | None:
    """The stage an undo sends this row back to — None when no ruling is in
    force. An ADMIN ruling (`adm_action`) goes back to the admins; a brigadir's
    refusal back to the brigadir."""
    if row.status == APPROVED:
        return ADMIN
    if row.status == REJECTED:
        return ADMIN if row.adm_action else SUPERVISOR
    return None


def undo(db: Session, row: LeaderLateProof, *, actor_name: str | None,
         actor_telegram: int | None = None,
         actor_profile: str | None = None) -> str:
    """Take a ruling back and REOPEN the late proof at the stage it was made at
    (2026-09-26, the operator's ruling — the twin of `leader_dispute.undo`).
    The same chat opens again with that stage's buttons; an approval's point is
    taken back (`revoke`) until somebody rules again. Returns what the ruling
    was."""
    from app.services import leader_appeal_chat as chat
    back = reopen_stage(row)
    if back is None:
        raise Refused(row.status)
    was = row.status
    if back == ADMIN:
        if row.status == APPROVED:
            revoke(db, row)
        row.adm_action = None
        row.adm_note = None
        row.adm_by_name = None
        row.adm_by_telegram = None
        row.adm_at = None
    else:
        row.sup_action = None
        row.sup_note = None
        row.sup_by_name = None
        row.sup_by_telegram = None
        row.sup_at = None
    row.status = back
    chat.ruling(db, chat.LATE, row.id, chat.UNDONE, note=None,
                actor_name=actor_name, actor_telegram=actor_telegram,
                actor_profile=actor_profile, actor_role="admin")
    db.flush()
    action_log.record_bot(
        db, actor_telegram, "leader_review", "checklist.late_proof_undone",
        actor_name=actor_name, target_kind="task", target_id=row.id,
        target_name=row.leader_name, unit_id=row.manager_id, day=row.date,
        details=[("leader", row.leader_name), ("task_id", row.task_id),
                 ("was", was), ("reopened_at", back)],
    )
    return was


def supervisor_of(db: Session, row: LeaderLateProof) -> Manager | None:
    if not row.manager_id:
        return None
    return db.query(Manager).filter_by(id=int(row.manager_id)).first()


def task_name(db: Session, row: LeaderLateProof, lang: str) -> str:
    """The task's name in one language, resolved down the leader's own chain."""
    prof = db.query(RoleProfile).filter_by(id=int(row.leader_id)).first()
    if prof is None:
        return f"#{row.task_id}"
    cfg = leader_tasks.effective_leader_config(db, prof, row.shift, day=row.date)
    entry = cfg.get(int(row.task_id))
    return leader_tasks.config_name(entry, lang) if entry else f"#{row.task_id}"


# ── telling people ───────────────────────────────────────────────────────────

def _params(db: Session, row: LeaderLateProof) -> dict:
    return {"date": row.date, "task": task_name(db, row, "uz"),
            "leader": row.leader_name or "\u2014"}


def notify_filed(db: Session, row: LeaderLateProof, *,
                 skip_dm: set[int] | None = None) -> None:
    """Tell everybody in the chat that it has opened — the brigadir, whose turn
    it is, and every admin (the operator's ruling: all three parties hear about
    every message, the first one included). `skip_dm` are the accounts that
    already got the card with the photos."""
    from app.services import leader_appeal_chat as chat
    params = {**_params(db, row), "deadline": row.deadline or "\u2014",
              "reason": chat.notice_text(row.reason)}
    try:
        chat.fanout(db, chat.LATE, row, "late_proof_filed", params,
                    author_profile=f"leader:{row.leader_id}", tone="warning",
                    skip_dm=skip_dm)
    except Exception:
        logger.warning("late-proof filing notice failed", exc_info=True)


def notify_decided(db: Session, row: LeaderLateProof, *, stage: str,
                   actor_profile: str | None = None,
                   actor_telegram: int | None = None,
                   skip_dm: set[int] | None = None) -> None:
    """Tell all three parties about a ruling — the leader, the brigadir and
    every admin — except whoever made it, each with the button onto the chat.

    Always, and at every step — including a rejection. A leader who filed a
    reason and heard nothing back learns that filing one is pointless, which is
    the one outcome that makes the whole flow worthless.
    """
    from app.services import leader_appeal_chat as chat
    nkey = {
        REJECTED: "late_proof_rejected",
        APPROVED: "late_proof_approved",
        ADMIN: "late_proof_uplifted",
    }.get(row.status)
    if not nkey:
        return
    by = row.adm_by_name if stage == "admin" else row.sup_by_name
    note = row.adm_note if stage == "admin" else row.sup_note
    params = {**_params(db, row), "by": by or "\u2014",
              "note": (note or "").strip()}
    actor_tid = actor_telegram or (row.adm_by_telegram if stage == "admin"
                                   else row.sup_by_telegram)
    try:
        chat.fanout(db, chat.LATE, row, nkey, params,
                    author_profile=actor_profile, author_telegram=actor_tid,
                    tone="success" if row.status == APPROVED else "info",
                    skip_dm=skip_dm)
    except Exception:
        logger.warning("late-proof decision notice failed", exc_info=True)


def notify_undone(db: Session, row: LeaderLateProof, *, actor_name: str | None,
                  actor_profile: str | None, actor_telegram: int | None) -> None:
    from app.services import leader_appeal_chat as chat
    params = {**_params(db, row), "by": actor_name or "\u2014"}
    nkey = ("late_proof_undone" if row.status == ADMIN
            else "late_proof_undone_sup")
    try:
        chat.fanout(db, chat.LATE, row, nkey, params,
                    author_profile=actor_profile, author_telegram=actor_telegram)
    except Exception:
        logger.warning("late-proof undo notice failed", exc_info=True)


def notify_message(db: Session, row: LeaderLateProof, m, nfiles: int,
                   invited: list[str] | None = None) -> None:
    from app.services import leader_appeal_chat as chat
    # A HELD filing has not been announced yet: a message the leader adds to
    # its chat stays in the thread and is read when the card arrives, rather
    # than telling the brigadir early by a side door (`release`).
    if row.held:
        return
    params = {**_params(db, row), "author": m.author_name or "\u2014",
              "text": chat.notice_text(m.text),
              "files": str(nfiles) if nfiles else ""}
    try:
        chat.fanout(db, chat.LATE, row, "late_proof_message", params,
                    author_profile=m.author_profile,
                    author_telegram=m.author_telegram,
                    skip_profiles=set(invited or ()))
    except Exception:
        logger.warning("late-proof message notice failed", exc_info=True)
    if invited:
        chat.notify_invited(db, chat.LATE, row, invited, "late_proof_invited",
                            params, author_telegram=m.author_telegram)


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


# ── «Kunni yopish» and the held announcement ─────────────────────────────────
#
# The operator (2026-10-14): late proofs may now arrive until 24:00 (shift 1)
# or 12:00 (shift 2), so the moment a brigadir would be told about one is no
# longer predictable — «add kunni yopish button to submit their works … When
# everyone closes the day, then send». So a filing is HELD (`held`), and the
# unit-day is released as a whole once every leader who owed a checklist that
# day is done with it. Done = any of
#
#   * they pressed «Kunni yopish» on it (`LeaderTaskDay.finished_at`);
#   * their day is closed and nothing on it can be filed late any more (every
#     task done, or its late proof already filed) — a leader who did the work
#     on time owes no button press;
#   * their late window ran out (`late_until`, by their checklist's shift).
#
# A leader who filed nothing at all has no day row and is done at the cut-off.
# The release always comes, at the latest at the cut-off; the five-minute sweep
# is what guarantees it when nobody presses anything.


def _day(db: Session, leader_id: int, date: str,
         cell_id: int | None) -> LeaderTaskDay | None:
    q = db.query(LeaderTaskDay).filter_by(leader_id=leader_id, date=date)
    q = (q.filter(LeaderTaskDay.cell_id == cell_id) if cell_id
         else q.filter(LeaderTaskDay.cell_id.is_(None)))
    return q.first()


def finish_state(db: Session, *, day: LeaderTaskDay | None, cfg: dict,
                 shift: int | None, per_task: bool,
                 now: datetime | None = None) -> dict | None:
    """What a leader is shown about their late window and «Kunni yopish» — the
    bot menu and the web tab read this one answer. None on a day-close unit,
    which has no late door at all.

    `can` is the button: the day's tasks are all closed (it closed itself),
    the window is open, the leader has not pressed it yet, and something can
    still be filed late — a leader with nothing left to file is done already
    and is not asked to press anything."""
    if not per_task:
        return None
    now = now or datetime.now(timezone.utc)
    date = day.date if day is not None else leader_tasks.effective_date(shift)
    is_open = window_open(day, shift, date, now)
    open_ids = (late_open(db, day=day, cfg=cfg, shift=shift, per_task=True, now=now)
                if is_open else [])
    held = (db.query(LeaderLateProof)
            .filter(LeaderLateProof.day_id == day.id,
                    LeaderLateProof.held.is_(True)).count()
            if day is not None else 0)
    return {
        "date": date,
        "until": late_until(shift, date),
        "label": late_until_label(shift),
        "window_open": is_open,
        "open": open_ids,
        "finished_at": day.finished_at if day is not None else None,
        "finished_by": day.finished_by if day is not None else None,
        "can": bool(day is not None and day.closed_at is not None
                    and day.finished_at is None and is_open and open_ids),
        "held": held,
    }


def finish_day(db: Session, day: LeaderTaskDay, *,
               actor_name: str | None) -> bool:
    """«Kunni yopish» on a per-task checklist. False when already pressed.

    Shuts the late door for this checklist and drops its draft roll — the
    leader said there is nothing more, so photos staged and never sent have no
    reader left. Commits. The caller releases the unit-day (`release`) and
    writes the register row; refusing a day that cannot be finished
    (`finish_state`'s `can`) is the caller's, so each door says why in its own
    words."""
    if day.finished_at is not None:
        return False
    day.finished_at = datetime.now(timezone.utc)
    day.finished_by = (actor_name or "").strip()[:160] or None
    drop_drafts(db, day.id)
    db.commit()
    return True


def _owed(db: Session, unit: Manager | None,
          date: str) -> list[tuple[RoleProfile, int | None]]:
    """The checklists a unit-day waits on — the brigadir's digest roster: the
    unit's leaders minus a cutoff, an exclusion or a day they do not owe, one
    checklist per cell where the unit files per cell."""
    from app.services import (leader_cells, leader_cutoffs, leader_exclusions,
                              leader_owes)
    if unit is None or unit.archived:
        return []
    profs = (db.query(RoleProfile)
             .filter(RoleProfile.role == "leader",
                     RoleProfile.manager_id == unit.id).all())
    if not profs:
        return []
    cuts = leader_cutoffs.load(db)
    excluded = {k for (k, _cell) in leader_exclusions.load(db)}
    floors = leader_cells.floors(db)
    out: list[tuple[RoleProfile, int | None]] = []
    for p in profs:
        if (leader_cutoffs.hit(cuts, p.id, p.name, date) is not None
                or leader_exclusions.key(p.id, p.name, date) in excluded
                or not leader_owes.owes(p, date)):
            continue
        for cid in leader_cells.expected_days(db, p, date, shift_floors=floors):
            out.append((p, cid))
    return out


def checklist_done(db: Session, prof: RoleProfile, cell_id: int | None,
                   date: str, now: datetime | None = None) -> bool:
    """Is this leader done with this checklist's late window? See the section
    comment above for the three ways."""
    now = now or datetime.now(timezone.utc)
    shift = checklist_shift(db, prof, date)
    cut = late_until(shift, date)
    if cut is not None and now >= cut:
        return True
    day = _day(db, prof.id, date, cell_id)
    if day is None:
        return False
    if day.finished_at is not None:
        return True
    if day.closed_at is None:
        return False       # still filing — a task may yet be missed
    cfg = leader_tasks.effective_leader_config(db, prof, shift, day=date)
    return not late_open(db, day=day, cfg=cfg, shift=shift,
                         per_task=leader_tasks.per_task_close(db, prof.manager_id),
                         now=now)


def unit_day_done(db: Session, manager_id: int, date: str,
                  now: datetime | None = None, extra=()) -> bool:
    """Has every leader of this unit-day closed it? The owed roster, plus the
    checklists the held filings themselves sit on (a leader moved since is
    still waited on for what they filed), plus `extra` (profile, cell) pairs."""
    now = now or datetime.now(timezone.utc)
    unit = db.query(Manager).filter_by(id=int(manager_id)).first()
    waits: dict[tuple[int, int | None], RoleProfile] = {
        (p.id, cid): p for p, cid in _owed(db, unit, date)}
    for p, cid in extra or ():
        if p is not None:
            waits.setdefault((p.id, cid), p)
    held = (db.query(LeaderLateProof.leader_id, LeaderTaskDay.cell_id)
            .join(LeaderTaskDay, LeaderTaskDay.id == LeaderLateProof.day_id)
            .filter(LeaderLateProof.held.is_(True),
                    LeaderLateProof.manager_id == int(manager_id),
                    LeaderLateProof.date == date).distinct().all())
    for lid, cid in held:
        if (lid, cid) not in waits:
            p = db.query(RoleProfile).filter_by(id=int(lid)).first()
            if p is not None:
                waits[(lid, cid)] = p
    return all(checklist_done(db, p, cid, date, now)
               for (_pid, cid), p in waits.items())


def _announce(db: Session, row: LeaderLateProof) -> None:
    """Put one filing in front of the brigadir — the card with its photos —
    and tell everybody in its chat. The two calls the bot always made, in the
    bot's order; never fatal."""
    carded: set = set()
    try:
        from app.telegram_bot import _lp_send_to_supervisor
        carded = _lp_send_to_supervisor(db, row) or set()
    except Exception:
        logger.warning("late proof %s: card to the brigadir failed", row.id,
                       exc_info=True)
    notify_filed(db, row, skip_dm=carded)
    try:
        db.commit()
    except Exception:
        db.rollback()


def release(db: Session, manager_id: int | None, date: str | None,
            now: datetime | None = None, extra=()) -> int:
    """Announce every held filing of this unit-day once everybody is done with
    it. Returns how many were released.

    The rows are CLAIMED first (`FOR UPDATE SKIP LOCKED`, then `held` off and
    committed) and only then announced: two leaders pressing «Kunni yopish» in
    the same second, or the sweep beside them, can never send one card twice.
    A filing somebody already ruled on (it is not hidden from its own chat) is
    released without a card — there is nothing left to ask the brigadir."""
    if not manager_id or not date:
        return 0
    now = now or datetime.now(timezone.utc)
    if not unit_day_done(db, int(manager_id), str(date), now, extra=extra):
        db.rollback()
        return 0
    rows = (db.query(LeaderLateProof)
            .filter(LeaderLateProof.held.is_(True),
                    LeaderLateProof.manager_id == int(manager_id),
                    LeaderLateProof.date == str(date))
            .order_by(LeaderLateProof.id)
            .with_for_update(skip_locked=True).all())
    if not rows:
        db.rollback()
        return 0
    for r in rows:
        r.held = False
        r.released_at = now
    db.commit()
    for r in rows:
        if r.status == SUPERVISOR:
            _announce(db, r)
    try:
        action_log.record_system(
            "leader_review", "checklist.late_proofs_released", db=db,
            target_kind="unit", target_id=int(manager_id),
            unit_id=int(manager_id), day=str(date),
            details=[("released", len(rows)),
                     ("ids", ", ".join(str(r.id) for r in rows[:20]))])
        db.commit()
    except Exception:
        db.rollback()
    return len(rows)


def file_announcement(db: Session, row: LeaderLateProof, *,
                      prof: RoleProfile | None = None,
                      cell_id: int | None = None,
                      now: datetime | None = None) -> bool:
    """Right after `create`: HOLD the filing, then release the unit-day if
    everybody is already done — this filing may well have been the last thing
    anybody had left. True when it is still held.

    Ghost Mode keeps the old behaviour exactly: nothing is held, and the card
    and the notices are suppressed now, as they always were — a held filing
    would otherwise be announced later by the sweep, outside the request that
    asked for silence."""
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        row.released_at = datetime.now(timezone.utc)
        db.commit()
        _announce(db, row)
        return False
    row.held = True
    db.commit()
    extra = [(prof, cell_id)] if prof is not None else ()
    try:
        release(db, row.manager_id, row.date, now=now, extra=extra)
    except Exception:
        logger.exception("late proof %s: release check failed", row.id)
        db.rollback()
    db.refresh(row)
    return bool(row.held)


def sweep(db: Session, now: datetime | None = None) -> dict:
    """The five-minute pass (`leader_close._sweep`): drop draft rolls whose
    window has shut, and release every unit-day that has become done — the
    cut-off included, which is what makes the release certain."""
    now = now or datetime.now(timezone.utc)
    dropped = 0
    day_ids = [d for (d,) in db.query(LeaderLateProofShot.day_id).distinct().all()]
    if day_ids:
        profs: dict[int, RoleProfile | None] = {}
        for day in db.query(LeaderTaskDay).filter(LeaderTaskDay.id.in_(day_ids)).all():
            if day.leader_id not in profs:
                profs[day.leader_id] = (db.query(RoleProfile)
                                        .filter_by(id=day.leader_id).first())
            prof = profs[day.leader_id]
            shift = checklist_shift(db, prof, day.date) if prof is not None else None
            if not window_open(day, shift, day.date, now):
                dropped += drop_drafts(db, day.id)
        db.commit()
    released = 0
    groups = (db.query(LeaderLateProof.manager_id, LeaderLateProof.date)
              .filter(LeaderLateProof.held.is_(True)).distinct().all())
    for mid, d in groups:
        try:
            released += release(db, mid, d, now)
        except Exception:
            logger.exception("late-proof release failed for unit %s · %s", mid, d)
            db.rollback()
    return {"drafts": dropped, "released": released}

