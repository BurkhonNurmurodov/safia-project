"""Checklist task #11 («Ish jadvalini grafika tuzish») becomes an AUTOMATIC
check — 5 October 2026. TEMPORARY: the rollout and the transition grant.

The operator's rules (asked one by one, 4—5 Oct 2026):

* **Hard switch** from shift 1's day of 5 Oct and shift 2's night of 5→6 Oct
  (checklist day 5 Oct): no screenshot any more. `leader_auto`'s `staff_list`
  check reads the cell's «Ish grafigi» list (/kelish) at the END of the shift —
  20:00 for shift 1, 08:00 for shift 2 — and a warning goes out 30 minutes
  before. The check's own rules live in `leader_auto._check_staff_list`.
* **Transition**: 4 Oct (shift 1) and the night of 4→5 Oct (shift 2) stayed
  screenshot tasks, and a leader whose table was filled before their shift
  ended gets the task's full points as well — screenshot or no screenshot, AI
  rejection or not (`grant`). The switch day itself (5 Oct, shift 1, which the
  switch reached mid-day) is handled inside `leader_auto`: an answer filed by
  screenshot before the switch stands, and a filled table grants the points.

WHAT `apply` WRITES — the shape `leader_auto_rollout` used for #1/#8/#9:
`LeaderTaskDef.auto_check` (global), then per non-archived unit that closes
tasks one at a time the `deadline` (the check hour), the leader-facing
`description` and — LAST — `proof_kind` = "auto". A LEADER row carrying its own
`proof_kind` or `description` on task 11 is overwritten too (unlike the 20 Sep
pass, which only named them): the operator asked for a hard switch, and a leader
row is exactly how a leader would go on being offered the screenshot.

Delete this module with `startup.register_leader_auto_t11` and its two jobs,
and the call in BOTH entrypoints, once both flags are set.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    LeaderAiReview, LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskLeaderSetting, LeaderTaskOverride, Manager, RoleProfile,
)
from app.services import leader_auto, leader_exclusions, leader_tasks

log = logging.getLogger(__name__)

TASK_ID = 11
CHECK = "staff_list"
HOURS = {1: "20:00", 2: "08:00"}

# The job, never the pass mark (CLAUDE.md «Tasks the PLATFORM answers»).
DESCRIPTION = (
    "«Ish grafigi» sahifasida yacheykalaringiz ro'yxatini to'ldiring: "
    "ro'yxatdagi har bir xodim yonida «Keladi» yoki «Kelmaydi» belgilangan "
    "bo'lsin. Kim belgilagani muhim emas — ro'yxat to'liq bo'lsin."
    "\n\nBu vazifani endi tizim o'zi tekshiradi — skrinshot yuborish shart "
    "emas. Tekshiruv smena oxirida, vazifa ekranida yozilgan vaqtda "
    "o'tkaziladi; 30 daqiqa oldin eslatma keladi, natija esa tekshiruvdan "
    "so'ng darhol yuboriladi.")

# The transition days: (shift, checklist day). Their «end of the shift» is the
# same hour the check takes from 5 Oct on.
TRANSITION = ((1, "2026-10-04"), (2, "2026-10-04"))
GRANT_BY = "Ish grafigi to'ldirilgan (o'tish kuni)"


def units(db: Session, shift: int) -> list[Manager]:
    return (db.query(Manager)
            .filter(Manager.shift == shift, Manager.archived.is_(False))
            .order_by(Manager.id).all())


def apply(db: Session) -> dict:
    """Switch task #11 to the `staff_list` check on every unit. Idempotent:
    every write is a set-to-this-value, so a pass that dies half way is re-run
    whole."""
    out = {"check": False, "units": 0, "skipped": [], "no_shift": [],
           "leaders": []}
    td = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == TASK_ID).first()
    if td is None:
        raise RuntimeError("task 11 does not exist")
    per_task = leader_tasks.per_task_units(db)
    plan = []
    for shift in (1, 2):
        for m in units(db, shift):
            if m.id not in per_task:
                out["skipped"].append(m.name)
            else:
                plan.append((shift, m))
    out["no_shift"] = [m.name for m in db.query(Manager).filter(
        Manager.shift.is_(None), Manager.archived.is_(False)).all()]

    # ORDER (the 20 Sep lesson): the hour and the instruction first, the check
    # name next, the switch last — a unit carrying proof_kind="auto" with no
    # hour of its own would be asked at an hour nobody chose.
    for shift, m in plan:
        leader_tasks.set_deadline(db, task_id=TASK_ID, deadline=HOURS[shift],
                                  manager_id=m.id)
        leader_tasks.set_description(db, task_id=TASK_ID,
                                     description=DESCRIPTION, manager_id=m.id)
    if (td.auto_check or "") != CHECK:
        td.auto_check = CHECK
        db.commit()
        out["check"] = True
    for shift, m in plan:
        leader_tasks.set_proof_kind(db, task_id=TASK_ID, proof_kind="auto",
                                    manager_id=m.id)
        out["units"] += 1

    # A leader row shadows the unit row under it.
    for r, prof in (db.query(LeaderTaskLeaderSetting, RoleProfile)
                    .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
                    .filter(LeaderTaskLeaderSetting.task_id == TASK_ID).all()):
        touched = []
        if (r.description or "").strip() and r.description != DESCRIPTION:
            leader_tasks.set_description(db, task_id=TASK_ID,
                                         description=DESCRIPTION, leader_id=prof.id)
            touched.append("description")
        if (r.proof_kind or "") not in ("", "auto"):
            leader_tasks.set_proof_kind(db, task_id=TASK_ID, proof_kind="auto",
                                        leader_id=prof.id)
            touched.append("proof_kind")
        if touched:
            out["leaders"].append(f"{prof.name} · {', '.join(touched)}")
    return out


# ── the transition grant ─────────────────────────────────────────────────────

def _passing(db: Session, entry: LeaderTaskEntry | None) -> bool:
    """Does this task already score its full weight? A done entry whose proof
    the AI passed (or an admin approved), or that carries no proof to review."""
    if entry is None or not entry.done:
        return False
    rev = db.query(LeaderAiReview).filter_by(ref=f"bot:{entry.id}").first()
    if rev is None:
        return True
    if rev.resolution == "rejected":
        return False
    return rev.status in ("ok", "skipped") or rev.resolution == "approved"


def grant(db: Session, now: datetime | None = None) -> dict:
    """Give task #11 its full points on the transition days to every leader
    whose «Ish grafigi» was filled by the end of their shift — the check's own
    rule, read as the lists stood at that hour. Writes the ordinary admin
    overlay (`LeaderTaskOverride`, done — reversible on the day report), then
    re-sends each changed day's report."""
    from app.services import leader_close, leader_reports
    now = now or datetime.now(timezone.utc)
    out = {"granted": [], "already": 0, "not_filled": 0, "no_checklist": [],
           "errors": 0, "resent": 0}
    uids: list[str] = []
    for shift, date in TRANSITION:
        due = leader_close.due_at({"deadline": HOURS[shift]}, shift, date)
        if due is None or now < due:
            continue
        for m in units(db, shift):
            leaders = (db.query(RoleProfile)
                       .filter(RoleProfile.role == "leader",
                               RoleProfile.manager_id == m.id)
                       .order_by(RoleProfile.name).all())
            for prof in leaders:
                try:
                    if leader_exclusions.excluded(db, prof.id, date,
                                                  leader_name=prof.name):
                        continue
                    v = leader_auto.evaluate(
                        db, prof=prof, manager=m, shift=shift, date=date,
                        cell=None, check=CHECK, target=None, due=due, now=now)
                    if not v.done:
                        if v.outcome == leader_auto.SKIPPED:
                            out["errors"] += 1
                        else:
                            out["not_filled"] += 1
                        continue
                    days = (db.query(LeaderTaskDay)
                            .filter(LeaderTaskDay.leader_id == prof.id,
                                    LeaderTaskDay.date == date).all())
                    if not days:
                        out["no_checklist"].append(f"{prof.name} · S{shift}")
                        continue
                    got = False
                    for day in days:
                        entry = (db.query(LeaderTaskEntry)
                                 .filter_by(day_id=day.id, task_id=TASK_ID).first())
                        if _passing(db, entry):
                            out["already"] += 1
                            continue
                        uid = leader_auto._grant(db, day, TASK_ID, prof, GRANT_BY)
                        if uid:
                            uids.append(uid)
                            got = True
                    db.commit()
                    if got:
                        out["granted"].append(f"{prof.name} · S{shift}")
                except Exception:                       # noqa: BLE001
                    db.rollback()
                    out["errors"] += 1
                    log.exception("t11 grant failed for leader %s", prof.id)
    for uid in uids:
        try:
            if leader_reports.resend_if_changed(db, uid):
                out["resent"] += 1
        except Exception:                               # noqa: BLE001
            db.rollback()
            log.exception("t11 grant: corrected report for %s failed", uid)
    return out


def overrides_left(db: Session) -> int:
    """How many task-11 grants the transition wrote — for the report."""
    return (db.query(LeaderTaskOverride)
            .filter(LeaderTaskOverride.task_id == TASK_ID,
                    LeaderTaskOverride.set_by == GRANT_BY).count())
