"""Per-task checklist submission — closing one task at a time.

On a unit switched into this mode (`LeaderUnitSetting.per_task_close`) the
leader never closes a DAY. They fill a task in — proofs and answers save as they
go, exactly as before — and then press «Vazifani yopish», which does two things
and only these two:

  * locks that task FOREVER. No more photos, no retake, no re-answer, and
    nothing anywhere reopens it. That is the point: a submission you can still
    edit is not a submission, and the whole feature exists so a proof cannot be
    revised after the fact.
  * hands that task's proofs to the AI on their own, so a task closed at 08:00
    is judged at 08:00 instead of waiting for a day that ends at 20:00.

The day then closes ITSELF when the last enabled task is closed, which is what
keeps every downstream reader — the register, the score, the day report, the
disputes — working with no knowledge of this module.

Nothing here runs for a unit that was not switched on. `locked()` is the one
predicate every writer consults, and outside this mode it answers exactly what
it always answered: an entry is immutable once its DAY is closed.

This module also owns the OTHER deadline close — the day-level one
(`close_expired_days`, `sweep_expired_days`), which has nothing to do with
per-task submission and everything to do with the same question: what happens
to a checklist when its window shuts and nobody pressed anything. Both live
here so "closing on a deadline" has one home and one sweep.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    LeaderAiDispute, LeaderAiReview, LeaderTaskDay, LeaderTaskEntry,
    LeaderTaskMedia, Manager, RoleProfile,
)
from app.services import action_log, leader_ai, leader_proof, leader_tasks

logger = logging.getLogger(__name__)


# ── the one predicate every writer consults ──────────────────────────────────

def locked(entry: LeaderTaskEntry | None, day: LeaderTaskDay | None) -> bool:
    """Can this answer still be changed?

    Reads BOTH locks, always, whatever mode the unit is in: a closed day has
    always frozen its entries, and per-task submission adds a second, earlier
    freeze on one task. One predicate rather than a mode check at each call
    site, because "is this editable" must have exactly one answer — a writer
    that consulted only one of the two would happily overwrite a submitted
    proof.
    """
    if day is not None and day.closed_at is not None:
        return True
    return entry is not None and entry.closed_at is not None


def closed_tasks(db: Session, day: LeaderTaskDay | None) -> set[int]:
    """Task ids already submitted on this day — one query for a whole menu."""
    if not day:
        return set()
    return {t for (t,) in db.query(LeaderTaskEntry.task_id)
            .filter(LeaderTaskEntry.day_id == day.id,
                    LeaderTaskEntry.closed_at.isnot(None)).all()}


# ── when a task stops accepting work ─────────────────────────────────────────

def _shift_pos(shift: int | None, clock: str,
               opens: str | None = None) -> tuple[int, str]:
    """Where a closing hour falls relative to the REPORT day — `(days, clock)`.

    The comparable form of a closing time, and the only honest way to ask which
    of two hours comes first on a shift whose day is not a calendar day: on
    shift 2, «10:00» is the morning AFTER the evening «23:00» belongs to, so
    comparing the two clocks as strings gets the order exactly backwards.
    Tuples order on the day first and the clock second, which is that question
    answered.

    `leader_ai.window_offset` is the anchor, as everywhere else here; `overnight`
    applies only to a real RANGE, a bare clock being one hour and not a span.
    Both `due_at` (which seats the hour on a real date) and `closing_time`
    (which has to know whether the task outlives its day) read it, so the
    ordering and the seating cannot drift apart.
    """
    lo = opens if opens is not None else clock
    days = leader_ai.window_offset(shift, (lo, clock))
    if opens is not None and leader_ai.overnight((lo, clock)):
        days += 1
    return days, clock


def closing_time(cfg_entry: dict | None,
                 shift: int | None) -> tuple[str, str | None]:
    """When this task stops accepting work — `(clock, the range it came from)`.

    THE definition, in one place, because three surfaces read it: the sweep that
    closes the task, the bot line that promises the leader when that will
    happen, and the «Vazifalar» tab where they go to look the rule up. Three
    spellings would tell one leader three different hours.

    The chain, narrowest first:

    1. the per-task `deadline`, where an admin set one — an explicit submission
       time outranks anything derived;
    2. **the END of the task's own submission range** (the `window`), which is
       what a task normally carries. This is the answer the user asked for
       (2026-08-21): a range is given to every task, so the task closes when its
       range runs out rather than surviving until midnight;
    3. the DAY's filing deadline, for a task with neither — a mode whose
       auto-close only worked for hand-configured tasks would leave the rest of
       the checklist with no end at all.

    **That third step is also a CEILING, not just a fallback.** The day's filing
    deadline is when the checklist itself stops accepting work — `close_expired_days`
    closes the whole day on it, from a sweep that knows nothing about per-task
    hours — so a task whose own clock falls after it cannot ever reach that
    clock. Left unclamped the platform PROMISED the later hour on both surfaces
    the leader reads and then locked the task on the earlier one, recording it
    not-done: a shift-2 task with the 26 Aug incident's own «08:00 — 10:00»
    window said 10:00 and was closed at 09:05 (found by audit, 2026-08-27). One
    hour rather than the fifteen the shift anchor was costing before it, but the
    same defect — a task closed before the time the leader was given.

    The comparison is a `_shift_pos`, never a string compare: a shift-2 evening
    task closing at «23:00» is EARLIER than the day's «09:00», which lands the
    next morning, and ordering the raw clocks would clamp exactly the tasks that
    do not need it.

    The second return value is the range's OPENING time when the clock was read
    off a range, and None when it is a bare hour. `due_at` needs it to tell
    09:00-tomorrow from 09:00-today: which day an hour falls on is decided by
    where it sits relative to the SHIFT's own opening, and only the range's
    opening side can answer that.

    **`date_check` / `time_check` deliberately do NOT gate this.** They answer
    whether the clock the AI transcribes off the PROOF is judged; this answers
    how long the task accepts work. A task exempted from the date question is
    still a task with a shift to be done in, and gating on those flags would
    have made the feature silently do nothing for exactly the units most likely
    to use it — the camera pilot, whose proofs are dashboard screens in
    date-only mode. The fairness this protects is bought elsewhere, by SAYING
    the hour: the bot prints it on the draft view (`pt_auto`) and the
    «Vazifalar» tab prints it on the card, both straight from here.

    Enforcement is still per-task units ONLY — `autoclose_due` is bounded to
    `per_task_units`, and both other readers are per-task surfaces. The 2026-08-15
    ruling (the deadline is informational) stands everywhere else.
    """
    day_hh = leader_tasks.deadline_hhmm(shift)
    own = opens = None
    admin = leader_ai.hhmm((cfg_entry or {}).get("deadline"))
    if admin:
        own = admin
    else:
        win = (cfg_entry or {}).get("window") or ()
        if len(win) == 2:
            lo, hi = leader_ai.hhmm(win[0]), leader_ai.hhmm(win[1])
            if hi:
                own, opens = hi, lo
    if own is None:
        return day_hh, None
    # The day dies first — see the docstring. Returned as a bare clock, because
    # it no longer came off the task's range and `_shift_pos` must seat it as
    # the day's own deadline.
    if _shift_pos(shift, own, opens) > _shift_pos(shift, day_hh):
        return day_hh, None
    return own, opens


def task_deadline(cfg_entry: dict | None, shift: int | None) -> str:
    """The clock at which this task auto-closes, "HH:MM" — what a human is
    shown. `closing_time` carries the reasoning."""
    return closing_time(cfg_entry, shift)[0]


def due_at(cfg_entry: dict | None, shift: int | None,
           date: str) -> datetime | None:
    """The instant this task stops accepting work — Tashkent, on a real day.

    Which DAY that hour falls on has exactly one answer on this platform, and it
    is `leader_ai.window_offset`. A shift's report day is not a calendar day:
    shift 2's «26.08» runs 26.08 17:00 → 27.08 09:00, and a task's hours are
    written in those same shift hours, so an hour sits on the report day or on
    the one after it depending on nothing but which side of the shift's own
    opening it falls on. «08:00 — 10:00» on a night shift can only mean the
    morning of the 27th — 08:00 on the 26th is not inside that shift at all.

    This used to decide for itself, with the platform's crossing-midnight rule
    (`end <= start`, as in `idle_cell` / `cell_hours`), and that rule cannot see
    the shift. A shift-2 task whose window runs 08:00→10:00 does not cross
    midnight, so its close was pinned to 10:00 on the REPORT day — seven hours
    before the night began. Every such task was therefore already past due the
    moment the day existed: `autoclose_due` closed the whole checklist at the
    START of the shift, locked it forever and handed it to the AI, which then
    judged the photos against a window that had not opened yet (reported
    2026-08-26, a per-task shift-2 unit whose tasks were all closed and failed
    before 01:00). The reviewer has been anchored to the shift since 2026-08-22;
    this was not, and two anchors for one window is how a task closes before it
    opens. There is now one.

    `overnight` is applied only to a real RANGE. A bare clock — an admin's
    explicit `deadline`, or the day's filing deadline for a task carrying
    neither — is one hour and not a span, and `window_offset` already places it
    inside the shift on its own: 22:00 on a night shift is that same evening,
    09:00 is the morning after. That replaces the old blanket "+1 day for shift
    2", under which an evening deadline landed a full day late — past the 09:00
    at which the day sweep closes the day, so it could never fire at all.

    None when the day or the clock cannot be read; the caller decides what an
    unreadable deadline means (`past_deadline`: not past).
    """
    hhmm, opens = closing_time(cfg_entry, shift)
    try:
        h, m = (int(x) for x in hhmm.split(":"))
        day0 = datetime.strptime(date, "%Y-%m-%d").replace(
            tzinfo=leader_proof.TASHKENT)
    except (ValueError, AttributeError, TypeError):
        return None
    days, _ = _shift_pos(shift, hhmm, opens)
    return day0.replace(hour=h, minute=m) + timedelta(days=days)


def starts_at(cfg_entry: dict | None, shift: int | None,
              date: str) -> datetime | None:
    """The instant this task STARTS accepting work, or None when it has no
    range of its own and is therefore open for the whole day.

    The twin of `due_at`, seated by the same `_shift_pos`, and it exists because
    of the sharpest reading of the 26 Aug incident (the operator's, 2026-08-27):
    the tasks that were force-closed at the start of that night were the ones
    **whose own start time had not come yet**. A task nobody could have begun is
    not a task somebody failed to finish.
    """
    win = (cfg_entry or {}).get("window") or ()
    if len(win) != 2:
        return None                     # a bare deadline bounds the END only
    lo, hi = leader_ai.hhmm(win[0]), leader_ai.hhmm(win[1])
    if not lo or not hi:
        return None
    try:
        day0 = datetime.strptime(date, "%Y-%m-%d").replace(
            tzinfo=leader_proof.TASHKENT)
    except (ValueError, AttributeError, TypeError):
        return None
    # The OPENING side takes the window's own offset and never `overnight`'s
    # extra day — that one moves the closing side across midnight.
    days = leader_ai.window_offset(shift, (lo, hi))
    return day0.replace(hour=int(lo[:2]), minute=int(lo[3:])) + timedelta(days=days)


def not_started(cfg_entry: dict | None, shift: int | None, date: str,
                now: datetime | None = None) -> bool:
    """Has this task's own window not opened yet?

    THE guard that keeps a deadline from reaching a task nobody could have
    begun. Two very different things had been landing in one bucket — a task
    the leader had time for and did not do, and a task whose hours had not
    arrived — and only the first is a failure.
    """
    start = starts_at(cfg_entry, shift, date)
    if start is None:
        return False
    now = (now or datetime.now(timezone.utc)).astimezone(leader_proof.TASHKENT)
    return now < start


def past_deadline(cfg_entry: dict | None, shift: int | None, date: str,
                  now: datetime | None = None) -> bool:
    """Has this task's own closing time gone by for the day it belongs to?

    Anchored on the checklist DAY, not on the wall clock alone: shift 2's day
    opens at 17:00 and dies at 09:00 the next morning, so "is 08:00 past 09:00"
    is only answerable once you know which day's 09:00 is meant. `due_at` is
    where that reasoning lives.
    """
    due = due_at(cfg_entry, shift, date)
    if due is None:
        return False
    now = (now or datetime.now(timezone.utc)).astimezone(leader_proof.TASHKENT)
    return now >= due


# ── closing ──────────────────────────────────────────────────────────────────

def close_task(db: Session, *, day: LeaderTaskDay, entry: LeaderTaskEntry,
               cfg: dict, actor: str | None = None) -> bool:
    """Submit one task. False when it was already closed (or its day was).

    The order matters: the lock is written and committed FIRST, and only then is
    the review queued. A queue failure must never leave a task the leader was
    told they submitted still editable — the drain re-finds an unqueued entry on
    its next pass, but nothing re-locks a task whose lock was rolled back.
    """
    if locked(entry, day):
        return False
    entry.closed_at = datetime.now(timezone.utc)
    db.commit()

    try:
        n = leader_ai.queue_task(db, day, entry)
        if n:
            db.commit()
            leader_ai.note_auto_run(db, n, actor or _leader_name(db, day))
    except Exception:
        logger.exception("per-task close: could not queue entry %s for review",
                         entry.id)
        db.rollback()

    maybe_close_day(db, day, cfg)
    return True


def _leader_name(db: Session, day: LeaderTaskDay) -> str:
    prof = db.query(RoleProfile).filter_by(id=day.leader_id).first()
    return prof.name if prof else f"leader {day.leader_id}"


def maybe_close_day(db: Session, day: LeaderTaskDay, cfg: dict) -> bool:
    """Close the day once every enabled task has been submitted.

    This is what keeps per-task submission invisible to everything downstream:
    the register, the score, the day report and the disputes all key off a
    CLOSED day, and they go on doing so. The day simply stops being closed by a
    button and starts being closed by the last task.
    """
    if day.closed_at is not None:
        return False
    want = {t for t, s in cfg.items() if s.get("enabled")}
    if not want or not want <= closed_tasks(db, day):
        return False
    from app.services import leader_late_proof   # cycle: see reset_task
    entries = db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()
    day.closed_at = datetime.now(timezone.utc)
    day.completion = leader_tasks.compute_completion(cfg, entries)
    # The late door shuts with the day (`leader_late_proof.eligible` requires an
    # OPEN day), so any draft still staged can never be submitted by anybody.
    # Left behind it would be a pile of photos with no route to any reader —
    # precisely the state this feature exists to abolish rather than create.
    leader_late_proof.drop_drafts(db, day.id)
    db.commit()
    return True


# ── taking a submission back: the admin's inverse ────────────────────────────

def reopen_task(db: Session, *, day: LeaderTaskDay | None, task_id: int,
                entry: LeaderTaskEntry | None,
                actor: str | None = None) -> dict:
    """Unlock ONE task again — ADMINS only, and the only thing that ever does.

    Closing stays final for the leader: nothing they press and no config change
    reopens a submission, which is the whole reason the mode exists. From
    2026-08-26 an admin has a way back, because the alternative was worse — a
    task submitted by accident, or shot against the wrong standard, was frozen
    for good with no route out except editing the database, and this platform
    has no shell.

    It lifts whatever locks actually stand, which is why it reads BOTH of
    `locked()`'s: the entry's own `closed_at`, and the DAY's, which on a
    per-task unit `maybe_close_day` wrote the moment this task closed. Lifting
    the task without the day would hand back a lock the leader cannot see and
    nothing else can reach.

    **The verdict goes with it.** `queue_task` dedupes on `bot:<entry_id>`, so a
    review row left behind would let the re-close pass silently — the old
    verdict standing over new photos, the one outcome a reopen must never
    produce. It is DELETED rather than re-queued: a `pending` row is worked by
    the drain within minutes, and the leader has not redone anything yet. The
    next close re-creates it from the ref, exactly as discovery does after
    «stop and clear». Any live objection to it is retired too — see
    `_retire_disputes`.

    The day's report is NOT recalled — a DM cannot be. It corrects itself the
    ordinary way: the re-close re-scores the day and `resend_if_changed` sends
    the new number, the same path a re-review or an upheld dispute takes.

    Returns what it actually lifted, so the caller can SAY so. A reopen that
    found nothing locked must not read like one that undid a submission.
    """
    lifted = {"task": False, "day": False, "verdict": False, "disputes": 0}
    if day is None:
        return lifted
    if task_id not in reopened_tasks(day):
        # A NEW list, never an in-place append: SQLAlchemy only sees the change
        # when the attribute is reassigned.
        from app.services import leader_late_proof   # cycle: see reset_task
        day.reopened = sorted(reopened_tasks(day) | {task_id})
        # A reopened task is back on the DAY's own deadline and is no longer
        # late-fileable at all (`leader_late_proof.eligible`), so any draft
        # staged against it is unreachable from this moment on. Dropping it
        # here is what stops it sitting on the day forever with no door.
        leader_late_proof.clear_draft(db, day.id, task_id)
    if day.closed_at is not None:
        day.closed_at = None
        day.completion = None          # an open day is not a scored one
        lifted["day"] = True
    if entry is not None and entry.closed_at is not None:
        entry.closed_at = None
        lifted["task"] = True
    if entry is not None:
        ref = leader_ai.bot_ref(entry.id)
        lifted["disputes"] = _retire_disputes(db, ref, actor)
        lifted["verdict"] = bool(
            db.query(LeaderAiReview).filter_by(ref=ref)
            .delete(synchronize_session=False))
    db.commit()
    logger.info("checklist: task reopened (day %s, entry %s) by %s — %s",
                day.id, entry.id if entry else None, actor or "admin", lifted)
    return lifted


def _retire_disputes(db: Session, ref: str, actor: str | None) -> int:
    """Cancel every live objection to a verdict that is being WITHDRAWN.

    Deliberately not `supersede_dispute`, which answers a different question —
    "a later RULING contradicted this one" — and therefore only touches settled
    rows. Here the submission the objection is about stops existing, so a
    still-pending objection has to go with it: it would otherwise sit in the
    admin queue pointing at a verdict that is gone, and its card is built from
    that verdict.
    """
    n = 0
    for d in (db.query(LeaderAiDispute)
              .filter(LeaderAiDispute.ref == ref,
                      LeaderAiDispute.status != "cancelled").all()):
        d.status = "cancelled"
        if actor:
            d.decided_by_name = actor[:160]
        d.decided_at = datetime.now(timezone.utc)
        n += 1
        logger.info("leader-dispute: %s cancelled — %s was reopened", d.id, ref)
    return n


def reopened_tasks(day: LeaderTaskDay | None) -> set[int]:
    """Tasks an ADMIN took back on this day.

    THE reader of `LeaderTaskDay.reopened`, because two surfaces act on it and
    they must agree: `autoclose_due`, which must not re-close such a task on
    the deadline that already fired, and the bot line that tells the leader
    when the task WILL close. A grace the sweep honours and the screen does not
    name is a task the leader believes is already over.
    """
    return {int(t) for t in ((day.reopened if day is not None else None) or [])}


def reset_task(db: Session, day: LeaderTaskDay | None, task_id: int) -> bool:
    """Empty ONE task — its answer, its media rows and its camera roll.

    THE reset core: the bot's two «Qayta topshirish» buttons (upload flow and
    camera prompt) and the admin panel's «Tozalash» all run this, so «empty»
    can never come to mean two different things on two surfaces.

    The roll is dropped whether or not an answer exists: a camera task below
    `min_media` holds shots and no entry, and that half-shot state is exactly
    what a leader resets from — clearing it only alongside an entry would leave
    the menu counting «📷 2/3» on a task the leader just emptied.

    Refuses a task that is still LOCKED, which is what makes the admin's
    «Tozalash» a two-step act: `reopen_task` first, this second. The channel
    copies stay either way — the archive is the audit trail.

    Returns whether anything was actually emptied, so a caller can say so.
    """
    if not day:
        return False
    e = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=task_id).first()
    if locked(e, day):
        return False        # submitted on a per-task unit — nothing empties it
    hit = e is not None
    if e:  # channel posts stay (audit trail); only our rows go
        db.query(LeaderTaskMedia).filter_by(entry_id=e.id).delete()
        db.delete(e)
    from app.services import leader_late_proof   # cycle: it imports this module
    hit = leader_proof.clear_roll(db, day.id, task_id) or hit
    # A late DRAFT goes with it. «Empty» has to mean one thing, and a half-shot
    # late roll surviving a reset would be photos staged for a filing the
    # leader was just told no longer exists.
    hit = bool(leader_late_proof.clear_draft(db, day.id, task_id)) or hit
    db.commit()
    return bool(hit)


def force_answer(db: Session, *, day: LeaderTaskDay, task_id: int,
                 cfg_entry: dict, shift: int | None) -> LeaderTaskEntry:
    """The answer to record for a task the deadline caught mid-flight.

    Per the user's ruling: whatever exists is submitted. A roll short of
    `min_media` is still evidence taken inside the window, so it goes to the AI
    and is judged as it stands rather than thrown away — but a task with NO
    answer at all has nothing to judge, and is recorded not-done with the
    missed-deadline reason, exactly as the day-close has always done.
    """
    entry = db.query(LeaderTaskEntry).filter_by(
        day_id=day.id, task_id=task_id).first()
    if entry:
        return entry
    photos = leader_proof.roll(db, day.id, task_id)
    if photos:
        entry = leader_proof.sync_entry(db, day, task_id, len(photos))
        if entry:
            return entry
    entry = LeaderTaskEntry(day_id=day.id, task_id=task_id, done=False,
                            reason=leader_tasks.missed_reason(shift))
    db.add(entry)
    db.flush()
    return entry


def _awaiting_reopen(db: Session, day: LeaderTaskDay) -> bool:
    """Is this day still waiting on a task an admin handed back?

    THE predicate both sweeps consult, because a reopen has to survive BOTH or
    it survives neither: `autoclose_due` would re-close the task and
    `close_expired_days` would re-close the day around it.

    True only while a reopened task is genuinely unfinished — no entry (it was
    emptied) or an entry not yet re-submitted. Once the leader closes it again
    the day is ordinary, so a stale id left in `reopened` can never strand a
    day: `maybe_close_day` closes it the moment the last task is in.
    """
    want = reopened_tasks(day)
    if not want:
        return False
    done = {t for (t,) in db.query(LeaderTaskEntry.task_id)
            .filter(LeaderTaskEntry.day_id == day.id,
                    LeaderTaskEntry.task_id.in_(want),
                    LeaderTaskEntry.closed_at.isnot(None)).all()}
    return bool(want - done)


def autoclose_due(db: Session, now: datetime | None = None) -> int:
    """Close every task whose deadline has passed, on every per-task unit.

    Returns how many tasks were closed. Runs on a timer AND whenever a leader
    opens /tasks, for the same reason the day auto-close does both: a deadline
    that only bites when somebody happens to look is not a deadline.

    Deliberately bounded to OPEN days of per-task units — the pass is a scan and
    it runs all day, so it must not walk the archive to find work that cannot
    exist there.
    """
    units = leader_tasks.per_task_units(db)
    if not units:
        return 0
    days = (db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.closed_at.is_(None),
                    LeaderTaskDay.manager_id.in_(units)).all())
    if not days:
        return 0
    shifts = {m.id: m.shift for m in
              db.query(Manager).filter(Manager.id.in_(units)).all()}
    profs = {p.id: p for p in db.query(RoleProfile)
             .filter(RoleProfile.id.in_({d.leader_id for d in days})).all()}
    done = 0
    for day in days:
        prof = profs.get(day.leader_id)
        if not prof:
            continue
        shift = shifts.get(day.manager_id)
        cfg = leader_tasks.effective_leader_config(db, prof, shift)
        already = closed_tasks(db, day)
        graced = reopened_tasks(day)
        for tid, s in cfg.items():
            if not s.get("enabled") or tid in already:
                continue
            # A task an admin took back is never re-closed by a sweep. It was
            # meant to fall back on the DAY's own filing deadline, but that
            # deadline is in the PAST for every reopen that matters: a shift-2
            # day is only locked once 09:00 has gone by, so the grace resolved
            # to an hour already spent and this pass undid the admin within five
            # minutes — silently, and in front of them (found by audit,
            # 2026-08-27; the reopen shipped 2026-08-26 and was inert on shift 2
            # from the day it landed).
            #
            # A reopen is a person deciding this task must be redone, so a
            # person closes it: the leader re-submits, or an admin closes or
            # empties it again. Such a day stays OPEN until then and shows on
            # «Tozalash» → «Yakunlanmagan», which exists to expose exactly that.
            if tid in graced:
                continue
            # NOT YET STARTED. The operator's reading of the 26 Aug night, and
            # the one that explains why the day closed at 22:36 rather than at
            # the shift's start: a subset of tasks was force-closed as not-done
            # the moment the night began — the ones whose windows were written
            # in hours that had not arrived — the leader worked through what was
            # left by hand, and when the last of those landed `maybe_close_day`
            # counted 13 of 13 closed and ended the day mid-shift.
            #
            # The anchor fix stops a window being seated on the wrong DAY; this
            # stops the whole class, including a window that cannot open inside
            # its shift at all (705 shapes on shift 2, where the clamp to the
            # day's filing deadline lands before the window's own opening). A
            # task nobody could begin is left OPEN: it never counts toward «all
            # tasks closed», so the day is not ended out from under a leader who
            # is still working.
            if not_started(s, shift, day.date, now):
                continue
            if not past_deadline(s, shift, day.date, now):
                continue
            entry = force_answer(db, day=day, task_id=tid, cfg_entry=s, shift=shift)
            db.commit()
            # Read here, not after the close: `close_task` commits, which
            # expires the instance, so the same two reads would then cost a
            # re-SELECT. `locked()` loads it on the next line either way.
            eid, was_done = entry.id, bool(entry.done)
            if close_task(db, day=day, entry=entry, cfg=cfg,
                          actor=f"deadline · {prof.name}"):
                done += 1
                # A submission nobody pressed anything for. It locks a task
                # forever and hands it to the AI, so it has to be as visible in
                # the register as the leader's own «Vazifani yopish» — one row
                # per task ACTUALLY closed, which is why it sits inside the
                # `if`: the 5-minute sweep is otherwise a no-op and must write
                # nothing on the ticks where nothing was due.
                action_log.record_system(
                    "leader_review", "checklist.task_autoclosed", db=db,
                    target_kind="task", target_id=eid,
                    target_name=prof.name,
                    unit_id=day.manager_id, day=day.date,
                    details=[("leader", prof.name), ("task_id", tid),
                             ("shift", shift),
                             ("deadline", task_deadline(s, shift)),
                             ("state", "done" if was_done else "not_done")],
                    reason="deadline",
                )
        maybe_close_day(db, day, cfg)
    return done


# ── the day-level deadline: closing a checklist nobody came back to ──────────
#
# A day-mode checklist has only ever closed itself when THAT leader personally
# reopened /tasks. A leader who does not come back leaves the day open — and an
# open day is a day every read surface on the platform agrees does not exist:
# the register, the score, the day report and the AI queue all serve a CLOSED
# day, so a checklist that was filled in but never submitted reads exactly like
# a leader who filed nothing (which is what the «Tozalash» → «Yakunlanmagan»
# view was built to expose).
#
# Shift 2 is where that bites hardest. Its window shuts at 09:00, hours after
# the crew has gone home, and it files ONLY in the bot — there is no fill-out
# row underneath to read instead, so an unclosed night is simply lost. From
# 2026-08-22 the sweep closes those days on their own deadline and hands them
# to the AI, with nobody present (the user's directive).
#
# Bounded to shift 2 on purpose — one tuple, widened deliberately. Shift 1 goes
# on closing when its leader next opens /tasks, exactly as before.
AUTOCLOSE_SHIFTS = (2,)


def close_expired_days(db: Session, prof, shift: int,
                       *, actor: str | None = None) -> int:
    """Finalize this leader's expired open days. Returns how many closed.

    THE definition of a day-level auto-close: the bot's /tasks entry
    (`telegram_bot._lt_autoclose`) and the scheduled sweep both call it, because
    a day closed by the timer and a day closed by the leader walking back in
    have to BE the same day — same missed-deadline reason, same score, same
    hand-off to the AI. Two spellings would mean a leader's score depended on
    which of the two happened to reach the day first.

    Any enabled task left unanswered once the submission window shut is recorded
    as not-done carrying the missed-deadline reason; the day is then closed and
    scored. A day still INSIDE its window is never touched — the leader closes
    that one themselves.

    The cutoff is the WINDOW, not the shift boundary. Shift 2 files until 09:00
    while `effective_date` only rolls at 17:00, so a plain `date < today` test
    would leave a missed night open — and editable — for the hours in between,
    which is exactly the stretch nobody is at the factory to file it.
    """
    today = leader_tasks.effective_date(shift)
    # Staged config due at this boundary, applied before anything is SCORED
    # against it: a day closed by the sweep must be measured by the same
    # checklist the leader would have been shown.
    leader_tasks.promote_due(db, shift, today)
    stale = (db.query(LeaderTaskDay)
             .filter(LeaderTaskDay.leader_id == prof.id,
                     LeaderTaskDay.date <= leader_tasks.expired_through(shift),
                     LeaderTaskDay.closed_at.is_(None))
             .all())
    # A day holding a task an ADMIN reopened is not an abandoned day — it is a
    # day somebody deliberately put back into play, and every such day is past
    # its deadline by construction (nothing reopens a day still inside its
    # window). This sweep never consulted `reopened`, so it re-stamped the day
    # wholesale on the next tick and re-recorded an emptied task as not-done,
    # undoing the reopen through a second door (audit, 2026-08-27).
    stale = [d for d in stale if not _awaiting_reopen(db, d)]
    if not stale:
        return 0

    cfg = leader_tasks.effective_leader_config(db, prof)
    now = datetime.now(timezone.utc)
    reason = leader_tasks.missed_reason(shift)
    closed: list[tuple] = []
    for day in stale:
        have = {e.task_id for e in
                db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
        for tid, s in cfg.items():
            if s["enabled"] and tid not in have:
                db.add(LeaderTaskEntry(day_id=day.id, task_id=tid,
                                       done=False, reason=reason))
        db.flush()
        from app.services import leader_late_proof   # cycle: see reset_task
        day.closed_at = now
        day.completion = leader_tasks.compute_completion(
            cfg, db.query(LeaderTaskEntry).filter_by(day_id=day.id).all())
        # Same rule as `maybe_close_day`: the late door shuts with the day, so
        # a draft left staged here could never be submitted by anyone again.
        leader_late_proof.drop_drafts(db, day.id)
        # Snapshotted HERE, while the instances are loaded: the commit below
        # expires them, and re-reading four columns per day to describe the
        # work would make the audit trail cost a query round for every close.
        closed.append((day.id, day.manager_id, day.date,
                       round(float(day.completion or 0))))
    db.commit()

    # The register learns what the deadline did — one row per day actually
    # closed, written AFTER the commit so nothing is announced that did not
    # land. Both doors reach this (the bot's /tasks entry and the scheduled
    # sweep) and both are the platform acting, not the leader: nobody pressed
    # anything, and a score that moved with no button behind it is precisely
    # the change an operator later cannot explain.
    deadline = leader_tasks.deadline_hhmm(shift)
    for did, mid, dday, score in closed:
        action_log.record_system(
            "leader_review", "checklist.day_autoclosed", db=db,
            target_kind="day", target_id=did, target_name=prof.name,
            unit_id=mid or prof.manager_id, day=dday,
            details=[("leader", prof.name), ("shift", shift),
                     ("score", score), ("deadline", deadline)],
            reason="deadline",
        )

    # Auto-closed bygone days are submissions too — queue their photos, and ONLY
    # theirs: one `queue_report` per day just closed, exactly the rule the manual
    # close uses. `discover()` here would walk every report ever filed, so one
    # forgotten day would re-queue the whole corpus.
    #
    # Wrapped: an AI hiccup must never leave a day looking unclosed. A day with
    # nothing filed queues nothing (no done-with-media entry exists), so it
    # closes at 0 and no report DM is sent — there is no verdict to report.
    try:
        n = sum(leader_ai.queue_report(db, day=day) for day in stale)
        if n:
            # The same record the manual close writes, so the hand-off gets the
            # progress bar, the ETA and the detail view instead of a queue that
            # silently grew.
            leader_ai.note_auto_run(db, n, actor or prof.name)
    except Exception:
        logger.exception("day auto-close: could not queue leader %s's days "
                         "for AI review", prof.id)
        db.rollback()
    return len(stale)


def sweep_expired_days(db: Session) -> int:
    """Close every expired open day on the shifts this is switched on for.

    The counterpart of `autoclose_due` one level up: that one closes a TASK
    whose own clock ran out, this one closes a DAY whose filing window shut. A
    per-task unit reaches this only for a day its tasks somehow did not finish,
    so the two never fight over the same row — `close_expired_days` writes an
    entry only where none exists, and a closed day is skipped by both.

    **A leader's shift comes from their OWN unit**, exactly as `_lt_shift` reads
    it in the bot, not from the unit stamped on the day. The two agree for
    everyone who has not moved, and for someone who has, the bot's door and this
    one must not disagree about which hour their checklist dies at — one of the
    two would then re-open a question the other had already answered.

    Bounded to open days of the enrolled shifts, so the pass is a near-empty
    index scan for the 287 minutes of the day when nothing is due.
    """
    if not AUTOCLOSE_SHIFTS:
        return 0
    units = [m.id for m in
             db.query(Manager).filter(Manager.shift.in_(AUTOCLOSE_SHIFTS)).all()]
    if not units:
        return 0
    profs = {p.id: p for p in db.query(RoleProfile)
             .filter(RoleProfile.role == "leader",
                     RoleProfile.manager_id.in_(units)).all()}
    if not profs:
        return 0
    shifts = {m.id: m.shift for m in
              db.query(Manager).filter(Manager.id.in_(units)).all()}
    # One `expired_through` per shift rather than per day: it is a pure function
    # of the clock, and the whole point is that every day of a shift dies at the
    # same hour. The widest cutoff prunes the query; each leader is then held to
    # their own.
    cutoff = {sh: leader_tasks.expired_through(sh) for sh in set(shifts.values())}
    if not cutoff:
        return 0
    open_by_leader = {
        lid for (lid,) in db.query(LeaderTaskDay.leader_id)
        .filter(LeaderTaskDay.closed_at.is_(None),
                LeaderTaskDay.leader_id.in_(profs.keys()),
                LeaderTaskDay.date <= max(cutoff.values()))
        .distinct().all()
    }
    done = 0
    for lid in open_by_leader:
        prof = profs.get(lid)
        if not prof:
            continue
        shift = shifts.get(prof.manager_id) or 1
        try:
            # `close_expired_days` applies that leader's own cutoff, so a day
            # inside its window is still never touched by this pass.
            done += close_expired_days(db, prof, shift,
                                       actor=f"deadline · {prof.name}")
        except Exception:
            logger.exception("day auto-close sweep failed for leader %s", lid)
            db.rollback()
    return done


# ── what the leader reads in the menu ────────────────────────────────────────

def score_line(db: Session, day: LeaderTaskDay | None,
               cfg: dict) -> tuple[int, int, int]:
    """(earned, out_of, pending) for the running score on a per-task menu.

    Only REVIEWED tasks are in the fraction — a task still being checked is in
    neither number, and is counted separately. The user's rule, and the right
    one: a verdict that has not arrived is not a zero, and showing it as one
    makes the score fall as the day goes well.

    A «Yo'q» task and a task the deadline caught unanswered ARE reviewed in this
    sense — nothing is pending on them — so they land in `out_of` with 0 earned.
    """
    if not day:
        return (0, 0, 0)
    enabled = {t: s for t, s in cfg.items() if s.get("enabled")}
    entries = {e.task_id: e for e in
               db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
    verdicts = leader_ai.verdicts_for(db, day)
    has_media = {r[0] for r in db.query(LeaderTaskMedia.entry_id)
                 .filter(LeaderTaskMedia.entry_id.in_(
                     [e.id for e in entries.values()] or [0])).distinct().all()}

    earned = out_of = pending = 0
    for tid, s in enabled.items():
        e = entries.get(tid)
        if not e or e.closed_at is None:
            continue                      # not submitted yet — not in the score
        weight = int(s.get("weight") or 0)
        rev = verdicts.get(tid)
        reviewable = e.done and e.id in has_media
        if reviewable and (rev is None or rev.status in ("pending", "error")):
            pending += 1
            continue
        out_of += weight
        if e.done and not (rev and rev.status == "flagged" and rev.resolution != "approved"):
            earned += weight
    return (earned, out_of, pending)


# The three ways a task can end badly, kept apart. They used to be one state
# («failed») wearing one ⚠️, and a leader could not tell which had happened:
# choosing not to do a task, running out of time on it, and having a photo
# rejected are three different facts with three different things to do about
# them, and the warning triangle made all three read as an accusation (the
# operator's report, 2026-08-27).
FAILED_STATES = frozenset({"notdone", "expired", "rejected"})


def task_state(entry: LeaderTaskEntry | None, rev, has_media: bool,
               day: LeaderTaskDay | None = None) -> str:
    """One word for how a task stands, for the menu row.

    open     nothing answered yet          draft    answered, still editable
    pending  closed, waiting on the AI     passed   closed and accepted
    notdone  the leader answered «Yo'q»    — a decision, not a failure
    expired  the clock ran out with no answer at all
    rejected the proof was reviewed and refused

    The last three are `FAILED_STATES`; anything asking only "did this go
    wrong" must test membership rather than compare to a single word.

    `day` is optional only for the callers that already know it is open —
    `locked(entry, None)` is exactly the entry's own lock, so passing nothing
    behaves as it always did. Pass it wherever the DAY may be closed: in day
    mode an entry never carries a lock of its own, so without it a submitted
    task on a closed day reads as a «draft» and prints as «not done».
    """
    if entry is None:
        return "open"
    if not locked(entry, day):
        return "draft"
    if not entry.done:
        # The missed-deadline sentinel is what separates «I decided not to» from
        # «nobody ever asked me»: `force_answer` and the day close write it,
        # a leader answering «Yo'q» writes their own words.
        return ("expired"
                if str(entry.reason or "").startswith(leader_tasks.MISSED_PREFIX)
                else "notdone")
    if has_media and (rev is None or rev.status in ("pending", "error")):
        return "pending"
    if rev is not None and rev.status == "flagged" and rev.resolution != "approved":
        return "rejected"
    return "passed"


def register_autoclose_job() -> None:
    """Put both deadline sweeps on the scheduler at boot.

    Every 5 minutes, which is the resolution a deadline deserves: the leader is
    told «⏰ 14:00 da avtomatik yopiladi», and a task still editable at 14:20
    makes that sentence a lie. Cheap when nothing is due — each pass returns on
    its first query.

    **A 5-minute sweep rather than a job pinned to the hour**, and that is the
    point: the day close is due at shift 2's 09:00 (`expired_through`), but a
    cron that fires once at 09:00 closes nothing if the box was restarting, and
    nothing at all for a day it missed. This one asks "what is past its
    deadline" every five minutes, so it lands within minutes of the hour, heals
    a day the last outage skipped, and needs no timezone of its own.

    A safety net, not the only door for the TASK sweep: /tasks runs
    `autoclose_due` whenever a leader opens it, so a per-task deadline bites
    even on a box whose scheduler died. The DAY sweep has no such twin — a
    leader who never comes back is exactly the case it exists for — which is
    why it must be the scheduler that owns it.
    """
    from app.scheduler import schedule_interval
    schedule_interval("leader-per-task-autoclose", _sweep, minutes=5)


def _sweep() -> None:
    """Both passes, independently: a failure in one must not skip the other,
    and neither is a precondition of the other."""
    from app.database import SessionLocal
    with SessionLocal() as db:
        try:
            n = autoclose_due(db)
            if n:
                logger.info("per-task auto-close: closed %s task(s) on deadline", n)
        except Exception:
            logger.exception("per-task auto-close sweep failed")
            db.rollback()
        try:
            n = sweep_expired_days(db)
            if n:
                logger.info("day auto-close: closed %s expired day(s) and sent "
                            "them for review", n)
                # The leader is not waiting on this one, but the report the
                # brigadir reads is: kicking the drain here is the difference
                # between a verified score at 09:05 and one at the next
                # 20-minute tick.
                leader_ai.run_async(discover_first=False)
        except Exception:
            logger.exception("day auto-close sweep failed")
            db.rollback()


# ── the closing rules, checked out loud at every boot ────────────────────────

# The clocks a self-check walks. Hourly is enough: every rule here turns on
# which SIDE of the shift's opening an hour falls, and an hour grid crosses
# every one of those boundaries. A finer grid buys nothing and costs boot time.
_CHECK_CLOCKS = tuple(f"{h:02d}:00" for h in range(24))
_CHECK_DATE = "2026-06-15"      # an arbitrary settled day; nothing here is dated


def self_check() -> list[str]:
    """Prove the task-closing rules still hold. Every violation, as a sentence.

    This exists because of what breaking them costs and how invisible it is.
    Twice now a task has been closed at an hour nobody intended — on 2026-08-26
    a whole shift-2 checklist was closed and AI-failed before its windows even
    opened (a second anchor for one window), and the audit that followed found
    a task still being locked an hour before the hour both leader-facing
    surfaces promised (a deadline past the day's own death). Neither showed up
    as an error. Both surfaced as leaders losing points, days later, and the
    only reason anybody caught them is that a person complained.

    There is no test suite on this repo and a push to `main` is a deploy, so
    the app checking its own arithmetic at boot is the earliest a regression can
    be caught. The pattern is `action_log.unmatched_routes`: ONE rule stays
    correct only if the app says out loud when something falls out of it.

    The four invariants, and what each one is the scar of:

    1. **No shift-2 task closes before its shift opens.** The 26 Aug incident
       exactly: a window written in daytime hours was seated on the report day,
       so it was past due the moment the day existed.
    2. **No task closes after its own day's filing deadline.** `close_expired_days`
       ends the whole checklist on that hour knowing nothing about per-task
       clocks, so a later one is unreachable — and while it was merely unreachable
       the platform went on printing it, then locked the task an hour early.
    3. **The hour the leader is TOLD is the hour that fires.** `task_deadline`
       feeds the bot's `pt_auto` line and the «Vazifalar» card; the whole reason
       `closing_time` is one function is that a leader must never be given two
       different hours.
    4. **An unclamped range closes exactly when the REVIEWER's window closes.**
       `leader_ai.date_window` is what the AI judges a proof against. The two
       drifting apart is what made the 26 Aug photos fail against a window that
       had not opened, so the agreement is asserted rather than assumed.
    5. **The sweep never reaches a task that has not STARTED.** The operator's
       own reading of that night: what got force-closed at its beginning were
       the tasks whose hours had not arrived. Asserted against the composite
       predicate `autoclose_due` actually evaluates, so deleting the
       `not_started` guard fails the check rather than the leaders.

    Pure arithmetic — no DB, no clock, no I/O — so it is safe anywhere and costs
    microseconds. Returns [] when everything holds.
    """
    bad: list[str] = []

    def _say(msg: str) -> None:
        if len(bad) < 40:               # a broken rule fails thousands of cases
            bad.append(msg)

    for shift in (1, 2):
        s_lo, _ = leader_ai.shift_window(shift)
        day0 = datetime.strptime(_CHECK_DATE, "%Y-%m-%d").replace(
            tzinfo=leader_proof.TASHKENT)
        opens_at = day0.replace(hour=int(s_lo[:2]), minute=int(s_lo[3:]))
        dies_at = due_at({}, shift, _CHECK_DATE)          # the day's own end
        if dies_at is None:
            _say(f"shift {shift}: the day's filing deadline does not resolve")
            continue

        cfgs = [{"window": [lo, hi]} for lo in _CHECK_CLOCKS
                for hi in _CHECK_CLOCKS if lo != hi]
        cfgs += [{"deadline": d} for d in _CHECK_CLOCKS]
        cfgs += [{}]
        for cfg in cfgs:
            due = due_at(cfg, shift, _CHECK_DATE)
            if due is None:
                _say(f"shift {shift} {cfg}: no closing time resolves")
                continue
            # 1 — never before the shift itself opens (shift 1's day IS the
            # calendar day, so only the night shift can express this at all).
            if shift == 2 and due < opens_at:
                _say(f"shift 2 {cfg}: closes {due:%d %H:%M}, before the shift "
                     f"opens at {opens_at:%d %H:%M}")
            # 2 — never after the day stops accepting work.
            if due > dies_at:
                _say(f"shift {shift} {cfg}: closes {due:%d %H:%M}, after the "
                     f"day dies at {dies_at:%d %H:%M} — unreachable")
            # 3 — the promise is the enforcement.
            told = task_deadline(cfg, shift)
            if told != due.strftime("%H:%M"):
                _say(f"shift {shift} {cfg}: leader told {told}, fires "
                     f"{due:%H:%M}")
            # 5 — nothing closes a task whose window has not opened. Tested
            # on the pair `autoclose_due` evaluates, one minute before the
            # opening, which is where a missing guard shows itself.
            start = starts_at(cfg, shift, _CHECK_DATE)
            if start is not None:
                t = start - timedelta(minutes=1)
                if (not not_started(cfg, shift, _CHECK_DATE, t)
                        and past_deadline(cfg, shift, _CHECK_DATE, t)):
                    _say(f"shift {shift} {cfg}: closed at {t:%d %H:%M}, before "
                         f"its window opens at {start:%d %H:%M}")
            # 4 — an unclamped range agrees with what the AI judges against.
            win = cfg.get("window")
            if win:
                _, ai_hi = leader_ai.date_window(_CHECK_DATE, shift,
                                                 (win[0], win[1]))
                want = min(ai_hi, dies_at.strftime("%Y-%m-%d %H:%M"))
                if due.strftime("%Y-%m-%d %H:%M") != want:
                    _say(f"shift {shift} {cfg}: closes {due:%m-%d %H:%M}, the "
                         f"reviewer's window ends {ai_hi} — anchors disagree")
    return bad
