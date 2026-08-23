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
    LeaderTaskDay, LeaderTaskEntry, LeaderTaskMedia, Manager, RoleProfile,
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

    The second return value is the range's OPENING time when the clock was read
    off a range, and None when it is a bare hour. `past_deadline` needs it to
    tell 09:00-tomorrow from 09:00-today without guessing from the shift.

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
    own = leader_ai.hhmm((cfg_entry or {}).get("deadline"))
    if own:
        return own, None
    win = (cfg_entry or {}).get("window") or ()
    if len(win) == 2:
        lo, hi = leader_ai.hhmm(win[0]), leader_ai.hhmm(win[1])
        if hi:
            return hi, lo
    return leader_tasks.deadline_hhmm(shift), None


def task_deadline(cfg_entry: dict | None, shift: int | None) -> str:
    """The clock at which this task auto-closes, "HH:MM" — what a human is
    shown. `closing_time` carries the reasoning."""
    return closing_time(cfg_entry, shift)[0]


def past_deadline(cfg_entry: dict | None, shift: int | None, date: str,
                  now: datetime | None = None) -> bool:
    """Has this task's own closing time gone by for the day it belongs to?

    Anchored on the checklist DAY, not on the wall clock alone: shift 2's day
    opens at 17:00 and dies at 09:00 the next morning, so "is 08:00 past 09:00"
    is only answerable once you know which day's 09:00 is meant.
    """
    hhmm, opens = closing_time(cfg_entry, shift)
    now = (now or datetime.now(timezone.utc)).astimezone(leader_proof.TASHKENT)
    try:
        h, m = (int(x) for x in hhmm.split(":"))
        day0 = datetime.strptime(date, "%Y-%m-%d").replace(
            tzinfo=leader_proof.TASHKENT)
    except (ValueError, AttributeError):
        return False
    due = day0.replace(hour=h, minute=m)
    if opens is not None:
        # A range says for ITSELF which day it ends on — `end <= start` is the
        # platform's crossing-midnight rule (`idle_cell`, `cell_hours`), and it
        # is right for both shifts: 17:00→09:00 lands on the morning after the
        # evening its day is named for, 07:00→20:00 stays put, and a shift-2
        # range that does NOT cross (17:00→23:00) correctly stays on its own
        # evening — which the old blanket "+1 day for shift 2" got wrong.
        if hhmm <= opens:
            due += timedelta(days=1)
    elif shift == 2:
        # A bare clock carries no range, so the night shift's boundary still has
        # to be applied from outside: its day is named for the evening it starts
        # and its deadline falls the following morning.
        due += timedelta(days=1)
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
    entries = db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()
    day.closed_at = datetime.now(timezone.utc)
    day.completion = leader_tasks.compute_completion(cfg, entries)
    db.commit()
    return True


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
        for tid, s in cfg.items():
            if not s.get("enabled") or tid in already:
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
        day.closed_at = now
        day.completion = leader_tasks.compute_completion(
            cfg, db.query(LeaderTaskEntry).filter_by(day_id=day.id).all())
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


def task_state(entry: LeaderTaskEntry | None, rev, has_media: bool) -> str:
    """One word for how a task stands, for the menu row.

    draft   answered but still editable        open    nothing answered yet
    pending closed, waiting on the AI          passed  closed and accepted
    failed  closed and rejected (or «Yo'q»)
    """
    if entry is None:
        return "open"
    if entry.closed_at is None:
        return "draft"
    if not entry.done:
        return "failed"
    if has_media and (rev is None or rev.status in ("pending", "error")):
        return "pending"
    if rev is not None and rev.status == "flagged" and rev.resolution != "approved":
        return "failed"
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
