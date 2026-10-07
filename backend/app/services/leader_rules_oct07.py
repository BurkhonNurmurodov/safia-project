"""Task 4 (obxod / Tasker) from 7 October 2026: every inspection at 100%, the
screenshot taken during the shift, its date and time checked.

The operator, 07.10.2026: the proof stays a screenshot of the Tasker inspection
list, but every progress bar on it must be full; the check time is the WHOLE
shift, for both shifts; leaders are told that every obxod must be 100% done.

What this pass writes, for task 4 only:

* the AI `criteria` (English) and the leader's `description` (Uzbek) —
  compare-and-set, level by level: a text is replaced only while it is blank,
  still the 19 Sep text, or already this one; a unit an admin has worded since
  keeps its text and is NAMED in the summary;
* the date rule, WHOLE: date + time («sana + vaqt» — the date question asked,
  the day and the clock both judged), the photo window set to the unit's whole
  shift (07:00—20:00 / 17:00—09:00), no task deadline of its own and no date
  tolerance. Written explicitly on every unit, so no unit leans on the global
  level while the other shift's pass is still to come.

**It is a DATED change** (`services/leader_rule_eras`). A date-rule edit
otherwise re-judges every verdict ever written for the task at the next boot —
and every task-4 proof since August was filed under «the date is not checked».
Before the first write the task's rule is frozen, each shift records the first
day it runs on the new rule, and every day before that keeps reading the old
one. The criteria are NOT dated — the platform's rule for a criteria edit: it
reaches the proofs reviewed after it, which is why each shift's pass runs in
that shift's gap (16:30 for shift 2, 00:30 for shift 1), never mid-checklist.

Leader-level rows are left alone and NAMED, the 19 Sep convention: a leader
carrying their own task-4 text, window or date rule keeps it.

TEMPORARY one-shot: delete this module, `startup.register_leader_rules_oct07`,
its job and DM helpers and the call in BOTH entrypoints once all three flags
are set. `leader_rule_eras.py` and its frozen row STAY — they are history the
boot re-derive reads.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (LeaderTaskDef, LeaderTaskLeaderSetting,
                        LeaderTaskSetting, Manager, RoleProfile)
from app.services import leader_ai, leader_rule_eras, leader_tasks

TASK = 4
ERA = next(e for e in leader_rule_eras.ERAS if e.task_id == TASK
           and e.key == "leader_rule_era_t4_2026_10_07")
_TASHKENT = ZoneInfo("Asia/Tashkent")

CRITERIA = (
    "The proof for this task is a screenshot — one or several — of the "
    "inspection (obxod) list screen in the Tasker app, taken after the shift's "
    "inspections are done. There are two requirements: the screenshot must be "
    "of that screen, and EVERY inspection on it must be 100% complete.\n\n"
    "That screen looks like this:\n"
    "- A header row at the top: a back arrow on the left, the workshop or cell "
    "name in the middle (for example «Мелкоштучка отдел 1.03»), and a round «+» "
    "button on the right.\n"
    "- Below it, a series of cards, one per inspection. Each card has a check "
    "name and a time range (for example «Цехни текшируви 21:30 - 22:30», «Мойка "
    "21:30 - 22:30», «Холодильник», «Логистика»), a line «Время выполнения: …» "
    "with a clock or a red lock icon, an arrow on the right, a progress bar "
    "underneath, and beside the bar a count of completed items (for example "
    "«16/16») and a percentage in a small box (for example «100.0» or "
    "«86.0 %»).\n"
    "- Some cards also carry a grey note or a red «Отменить все задачи» link.\n"
    "- The list scrolls, so the card at the top or bottom edge may be cut off.\n\n"
    "A card is COMPLETE when its progress bar is filled to the right end, the "
    "two numbers of its count are equal (for example «7/7»), and its percentage "
    "is 100 («100.0» or «100.0 %»).\n\n"
    "PASSES if the screenshot(s) show that screen and EVERY card whose progress "
    "bar, count or percentage is visible is complete.\n\n"
    "FAILS if:\n"
    "- Any visible card is not complete: the bar is not filled to the end, the "
    "two numbers of the count differ (for example «12/14» or «0/7»), or the "
    "percentage is below 100 (for example «86.0»). One incomplete card is "
    "enough to fail.\n"
    "- No card's progress bar, count or percentage can be seen.\n"
    "- Another screen is shown: one card opened, a different page of Tasker, or "
    "a different app.\n"
    "- A paper or another document has been photographed.\n\n"
    "NOT JUDGED: the workshop name; the number of cards; the check names and "
    "their time ranges; the clock and lock icons; the notes and the «Отменить "
    "все задачи» links; a card cut off so far that none of its bar, count and "
    "percentage shows. The clock and date at the top of the screen are read "
    "separately — do not fail the proof over them here."
)

DESCRIPTION = (
    "Tasker ilovasidagi obxod ro'yxati ekranining skrinshoti talab qilinadi. "
    "Smenadagi barcha obxodlar 100% bajarilgan bo'lishi shart — skrinshotni "
    "hamma obxodlar tugagandan keyin oling.\n\n"
    "Birorta obxod 100% bo'lmasa, vazifa bajarilmagan hisoblanadi."
)

#: The texts the 19 Sep pass wrote — what «not edited since» means here.
#: Copied, not imported, so this module does not tie `leader_rules_sep19`'s
#: deletion to its own.
OLD_CRITERIA = (
    "The proof for this task is a screenshot of the inspection list screen in "
    "the Tasker app. There is exactly one requirement: the screenshot must be "
    "of that screen.\n\nThat screen looks like this:\n- A header row at the "
    "top: a back arrow on the left, the workshop or cell name in the middle "
    "(for example «Заготовка Пирожных 1.24»), and a round «+» button on the "
    "right.\n- Below it, a series of cards. Each card has a check name and a "
    "time range (for example «Цехни текшируви 14:30 - 15:30», «Холодильник "
    "14:30 - 15:30»), an arrow on the right, a progress bar underneath, and "
    "beside it a count of completed items (for example «12/14») and a "
    "percentage (for example «86.0 %»).\n- Some cards also carry a grey note "
    "(for example «toldirilmagan») and a red «Отменить все задачи» link.\n\n"
    "PASSES if the screenshot shows that screen with at least one card.\n\n"
    "FAILS if:\n- Another screen is shown: one card opened, a different page "
    "of Tasker, or a different app.\n- A paper or another document has been "
    "photographed.\n\nNOT JUDGED: the workshop name; the percentages, counts "
    "and number of cards; the notes; the time ranges; the date and time in the "
    "screenshot."
)
OLD_DESCRIPTION = ("Tasker ilovasida obxod ro'yxati ekranini oching va o'sha "
                   "ekranning skrinshotini yuboring.")
#: …and the same text as the 18 Sep preview published it, behind its «starts on
#: the 19th» notice — what a level the real 19 Sep pass never reached still holds.
OLD_PREVIEW_DESCRIPTION = (
    "\u26a0\ufe0f YANGI TALAB \u2014 19-sentabrdan kuchga kiradi. Bugun va "
    "bugun kechasi vazifa eski qoida bo'yicha baholanadi; quyidagini oldindan "
    "o'qib, tayyorlanib qo'ying.\n\n" + OLD_DESCRIPTION)

#: The date rule, written whole: date + time.
DATE_MODE = {"date_check": True, "day_check": True, "time_check": True}
_FLAG_SETTERS = {"date_check": leader_tasks.set_date_check,
                 "day_check": leader_tasks.set_day_check,
                 "time_check": leader_tasks.set_time_check}


def _same(a, b) -> bool:
    return (a or "").strip() == (b or "").strip()


def _replaceable(cur, old, new) -> bool:
    """Blank, one of the texts this platform itself wrote, or already the new
    one. Anything else is somebody's own wording."""
    olds = old if isinstance(old, tuple) else (old,)
    return (not (cur or "").strip() or _same(cur, new)
            or any(_same(cur, o) for o in olds))


def units(db: Session, shift: int) -> list[Manager]:
    """The non-archived units of one shift, in id order."""
    return (db.query(Manager)
            .filter(Manager.shift == shift, Manager.archived.is_(False))
            .order_by(Manager.id).all())


def first_new_day(shift: int, now: datetime | None = None) -> str:
    """The first checklist day of `shift` that has not started yet — the day the
    new rule begins. A shift's day opens at its window's first hour (07:00 /
    17:00); at or after it, today's day is under way or over, so it is
    tomorrow's."""
    now = (now or datetime.now(timezone.utc)).astimezone(_TASHKENT)
    lo = leader_ai.shift_window(shift)[0]
    start = now.replace(hour=int(lo[:2]), minute=int(lo[3:5]), second=0,
                        microsecond=0)
    day = now.date() if now < start else now.date() + timedelta(days=1)
    return day.isoformat()


def apply(db: Session, shift: int) -> dict:
    """Write task 4's new rule onto every non-archived unit of ONE shift.

    Freezes the old rule and records this shift's first new day BEFORE any
    write. Every write is idempotent, `rejudge=False` throughout (the caller
    re-derives once). The flag is set LAST, by the caller."""
    leader_rule_eras.freeze(db, ERA)
    start = leader_rule_eras.mark_from(db, ERA, shift, first_new_day(shift))
    lo, hi = leader_ai.shift_window(shift)
    out = {"shift": shift, "from": start, "window": f"{lo}—{hi}", "units": 0,
           "texts": 0, "kept": [], "windows": [], "deadlines": [],
           "modes": 0, "names": []}
    for m in units(db, shift):
        # Every value is read before the first setter: each one commits, and a
        # commit expires the row this loop would otherwise go on reading.
        row = (db.query(LeaderTaskSetting)
               .filter_by(manager_id=m.id, task_id=TASK).first())
        cur = {f: getattr(row, f, None) for f in
               ("criteria", "description", "win_from", "win_to", "deadline",
                "date_plus", *DATE_MODE)}
        name = m.name

        for field, new, old, setter in (
                ("criteria", CRITERIA, OLD_CRITERIA, leader_tasks.set_criteria),
                ("description", DESCRIPTION,
                 (OLD_DESCRIPTION, OLD_PREVIEW_DESCRIPTION),
                 leader_tasks.set_description)):
            if _same(cur[field], new):
                continue
            if not _replaceable(cur[field], old, new):
                out["kept"].append(f"{name} · {field}")
                continue
            setter(db, task_id=TASK, manager_id=m.id, **{field: new})
            out["texts"] += 1

        if (cur["win_from"], cur["win_to"]) != (lo, hi):
            if cur["win_from"] or cur["win_to"]:
                out["windows"].append(
                    f"{name}: {cur['win_from'] or '…'}—{cur['win_to'] or '…'}")
            leader_tasks.set_window(db, task_id=TASK, win_from=lo, win_to=hi,
                                    manager_id=m.id, rejudge=False)
        if cur["deadline"]:
            out["deadlines"].append(f"{name}: {cur['deadline']}")
            leader_tasks.set_deadline(db, task_id=TASK, deadline=None,
                                      manager_id=m.id)
        if cur["date_plus"] not in (None, 0):
            leader_tasks.set_date_plus(db, task_id=TASK, date_plus=0,
                                       manager_id=m.id, rejudge=False)
        # One after the other, never in parallel: all of them land on the SAME
        # row (the 2026-08-19 camera-pilot race on `uq_ltask_setting`).
        for attr, want in DATE_MODE.items():
            if cur[attr] is not want:
                _FLAG_SETTERS[attr](db, task_id=TASK, manager_id=m.id,
                                    rejudge=False, **{attr: want})
        out["modes"] += 1
        out["units"] += 1
        out["names"].append(name)
    return out


def apply_global(db: Session) -> dict:
    """The same rule at the GLOBAL level — for a unit that has no row of its own
    (a unit created later). Run only after BOTH per-unit passes: every live unit
    then carries its own values, so this moves no resolved rule today. The
    window is CLEARED rather than written: the global level serves both shifts,
    and a blank window falls through to each shift's own hours."""
    td = db.query(LeaderTaskDef).filter_by(id=TASK).first()
    out = {"texts": [], "kept": [], "old_window": None, "old_deadline": None}
    if td is None:
        return out
    cur = {f: getattr(td, f, None) for f in
           ("criteria", "description", "win_from", "win_to", "deadline",
            "date_plus", *DATE_MODE)}
    for field, new, old, setter in (
            ("criteria", CRITERIA, OLD_CRITERIA, leader_tasks.set_criteria),
            ("description", DESCRIPTION,
                 (OLD_DESCRIPTION, OLD_PREVIEW_DESCRIPTION),
             leader_tasks.set_description)):
        if _same(cur[field], new):
            continue
        if not _replaceable(cur[field], old, new):
            out["kept"].append(field)
            continue
        setter(db, task_id=TASK, **{field: new})
        out["texts"].append(field)
    if cur["win_from"] or cur["win_to"]:
        out["old_window"] = f"{cur['win_from'] or '…'}—{cur['win_to'] or '…'}"
        leader_tasks.set_window(db, task_id=TASK, win_from=None, win_to=None,
                                rejudge=False)
    if cur["deadline"]:
        out["old_deadline"] = cur["deadline"]
        leader_tasks.set_deadline(db, task_id=TASK, deadline=None)
    if cur["date_plus"] not in (None, 0):
        leader_tasks.set_date_plus(db, task_id=TASK, date_plus=0, rejudge=False)
    for attr, want in DATE_MODE.items():
        if cur[attr] is not want:
            _FLAG_SETTERS[attr](db, task_id=TASK, rejudge=False, **{attr: want})
    return out


_LEADER_FIELDS = ("criteria", "description", "win_from", "win_to", "deadline",
                  "date_check", "day_check", "time_check", "date_plus")


def leader_overrides_left(db: Session, shift: int) -> list[str]:
    """Leaders of this shift whose OWN task-4 row overrides something this pass
    writes on the unit — named, never overwritten."""
    ids = {m.id for m in units(db, shift)}
    if not ids:
        return []
    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(RoleProfile.manager_id.in_(ids),
                    LeaderTaskLeaderSetting.task_id == TASK).all())
    out = []
    for row, prof in rows:
        own = [f for f in _LEADER_FIELDS
               if getattr(row, f, None) not in (None, "")]
        if own:
            out.append(f"{prof.name}: {', '.join(own)}")
    return sorted(out)
