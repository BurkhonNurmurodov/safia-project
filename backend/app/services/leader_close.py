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
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    LeaderTaskDay, LeaderTaskEntry, LeaderTaskMedia, Manager, RoleProfile,
)
from app.services import leader_ai, leader_proof, leader_tasks

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
            if close_task(db, day=day, entry=entry, cfg=cfg,
                          actor=f"deadline · {prof.name}"):
                done += 1
        maybe_close_day(db, day, cfg)
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
    """Put the deadline sweep on the scheduler at boot.

    Every 5 minutes, which is the resolution a per-task deadline deserves: the
    leader is told «⏰ 14:00 da avtomatik yopiladi», and a task still editable at
    14:20 makes that sentence a lie. Cheap when nothing is enrolled — the pass
    returns on its first query if no unit is in per-task mode.

    A safety net, not the only door: /tasks runs the same sweep whenever a
    leader opens it, so a deadline bites even on a box whose scheduler died.
    """
    from app.scheduler import schedule_interval
    schedule_interval("leader-per-task-autoclose", _sweep, minutes=5)


def _sweep() -> None:
    from app.database import SessionLocal
    with SessionLocal() as db:
        try:
            n = autoclose_due(db)
            if n:
                logger.info("per-task auto-close: closed %s task(s) on deadline", n)
        except Exception:
            logger.exception("per-task auto-close sweep failed")
            db.rollback()
