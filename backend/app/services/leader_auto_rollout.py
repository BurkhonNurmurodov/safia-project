"""Switching #1, #8 and #9 to automatic checks — 20 September 2026.

The one pass that turns the three dashboard-backed tasks over to
`services/leader_auto.py`, for EVERY non-archived unit, in two scheduled
instants so no shift is re-configured in the middle of a checklist it is
already filling: **shift 1's day of the 20th** and **shift 2's night of
20→21 Sep**. `startup.register_leader_auto_sep20` arms it.

WHAT IT WRITES, and nothing else
--------------------------------
* `LeaderTaskDef.auto_check` — which check decides each task. GLOBAL, written
  once, because «Kunlik plan» means one thing on every unit.
* the per-unit `deadline` — WHEN it is asked. This is the only figure that
  differs by shift, and it is an ordinary admin field: an operator who wants
  the night asked at 02:00 instead of 03:00 edits «Chek-list sozlamalari» and
  needs no deploy.
* the per-unit `proof_kind` = "auto" — which is what actually takes the task
  away from the leader, so it is written LAST of the three. Written before its
  check or its hour, the task would be unanswerable in the window between.
* the leader-facing `description`, with its «for now, also send a screenshot»
  paragraph replaced. That paragraph is the reason this is not optional: it
  tells leaders to do something the bot now refuses.

The `criteria` are deliberately NOT touched. They are the grader's text and
Gemini never sees one of these tasks again, so rewriting them would move
nothing and would mark twenty-one units as overriding a value they merely
inherit.

THE HOURS, and where they come from
-----------------------------------
Shift 1's three are the operator's own (10:00 / 14:00 / 17:00, agreed 14 Sep).
Shift 2's are those same points of a NIGHT — three, seven and ten hours after a
20:00 start — because a night shift asked at 10:00 would be asked five hours
after its checklist has already closed. They are settings, not constants, and
the admin page is where they are corrected.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import LeaderTaskDef, Manager
from app.services import leader_auto, leader_tasks

# task id → (the check, {shift: the hour it is asked})
TASKS: dict[int, tuple[str, dict[int, str]]] = {
    1: ("plan_staffing", {1: "10:00", 2: "23:00"}),
    9: ("plan_pct:30",   {1: "14:00", 2: "03:00"}),
    8: ("concerns",      {1: "17:00", 2: "06:00"}),
}

# The paragraph that replaces «Hozircha buni isbotlash uchun …». One sentence
# per task and then the same closing line, because what changed is the same
# thing for all three. The THRESHOLD stays out of it: task 9 goes on saying
# 50% while its check passes at 30%, which is the operator's standing rule —
# a minimum exists so nobody fails on a technicality, and printed as the
# instruction it becomes the target.
_TAIL = ("\n\nBu vazifani endi tizim o'zi tekshiradi — skrinshot yuborish "
         "shart emas. Tekshiruv vaqti vazifa ekranida yozilgan; 30 daqiqa "
         "oldin eslatma keladi, natija esa tekshiruvdan so'ng darhol "
         "yuboriladi.")

DESCRIPTIONS: dict[int, str] = {
    1: ("Yacheykalaringiz uchun bugungi planni va xodimlarni kiriting. "
        "«Zagruzka fayli» sahifasida har bir pozitsiyaning plani va «Bugungi "
        "fakt» (odam soni) to'ldirilgan bo'lsin. Buni smena boshida, ish "
        "boshlanishidan oldin qiling — kun davomidagi barcha hisob-kitob shu "
        "ma'lumotdan chiqadi." + _TAIL),
    8: ("Xodimlaringizni sizga xavotir yozishga chaqiring, o'zingiz esa "
        "brigadiringizga xavotir yozing. Yacheykada ishga to'sqinlik "
        "qilayotgan har bir narsa — uskuna, xom ashyo, kutish, sifat — yozib "
        "borilsin. Xavotir qancha aniq yozilsa, muammo shuncha tez hal "
        "bo'ladi." + _TAIL),
    9: ("Belgilangan vaqtgacha kunlik rejaning 50% ini bajaring. Ishni shunday "
        "rejalashtiringki, smena o'rtasiga borib reja yarmi bajarilgan bo'lsin "
        "— qolgani oxirgi soatlarga qolib ketmasin." + _TAIL),
}


def units(db: Session, shift: int) -> list[Manager]:
    """Every non-archived unit of one shift — the same roster
    `leader_rules_sep19.units` walks."""
    return (db.query(Manager)
            .filter(Manager.shift == shift, Manager.archived.is_(False))
            .order_by(Manager.id).all())


def set_checks(db: Session) -> int:
    """Name the check on each def. Global, idempotent, and the one write here
    that is not per unit — so it runs in whichever shift's pass comes first and
    is a no-op in the second."""
    n = 0
    for tid, (check, _hours) in sorted(TASKS.items()):
        td = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == tid).first()
        if td is None or (td.auto_check or "") == check:
            continue
        td.auto_check = check
        n += 1
    if n:
        db.commit()
    return n


def apply(db: Session, shift: int) -> dict:
    """Switch one shift's units over. Idempotent: every write below is a
    set-to-this-value, so a pass that dies half way is re-run whole by the next
    boot. The setters commit for themselves, so this cannot be one transaction
    — which is exactly why nothing here is an increment."""
    out = {"units": 0, "checks": set_checks(db), "deadlines": 0,
           "kinds": 0, "texts": 0, "skipped": 0, "shift": shift}
    # The evaluator only visits units that close tasks ONE AT A TIME
    # (`leader_auto.run` is bounded to `per_task_units`), and on a day-close
    # unit an auto task would be answerable by nobody: no entry is ever
    # written, the bot refuses every button, and «KUNNI YOPISH» refuses to end
    # a day while an enabled task has no entry — so the leader could not close
    # their day at all. Refused rather than reported.
    per_task = leader_tasks.per_task_units(db)
    for m in units(db, shift):
        if m.id not in per_task:
            out["skipped"] += 1
            continue
        out["units"] += 1
        for tid, (_check, hours) in sorted(TASKS.items()):
            hh = hours.get(shift)
            if not hh:
                continue
            # ORDER: the hour and the instruction first, the switch last. A unit
            # carrying proof_kind="auto" with no deadline of its own would be
            # asked at its window's end — an hour nobody chose — and a leader
            # opening it in between would read «send a screenshot» on a task
            # that no longer accepts one.
            leader_tasks.set_deadline(db, task_id=tid, deadline=hh,
                                      manager_id=m.id)
            out["deadlines"] += 1
            if txt := DESCRIPTIONS.get(tid):
                leader_tasks.set_description(db, task_id=tid, description=txt,
                                             manager_id=m.id)
                out["texts"] += 1
            leader_tasks.set_proof_kind(db, task_id=tid, proof_kind="auto",
                                        manager_id=m.id)
            out["kinds"] += 1
    return out


def leader_overrides_left(db: Session, shift: int) -> list[str]:
    """Leaders whose own row shadows one of the fields this pass writes.

    A leader row wins over the unit row under it, so a leader carrying their own
    `proof_kind` or `deadline` on these tasks is NOT switched — and an auto
    task's hour is a unit decision by design (`leader_auto._unit_due` reads the
    unit level only), so a leader-level `deadline` here would be a clock the
    evaluator never reads. Both are named rather than silently overwritten:
    they are deliberate admin edits, and a rule that quietly does not apply to
    some leaders is exactly what nobody finds out about.
    """
    from app.models import LeaderTaskLeaderSetting, RoleProfile
    ids = [m.id for m in units(db, shift)]
    if not ids:
        return []
    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(RoleProfile.manager_id.in_(ids),
                    LeaderTaskLeaderSetting.task_id.in_(list(TASKS))).all())
    out = []
    for r, prof in rows:
        # EVERY field a leader row can use to shadow what this pass writes.
        # `description` matters most and was missed at first: a leader carrying
        # their own instruction is switched to auto by the unit's `proof_kind`
        # and goes on being told to send a screenshot the bot now refuses —
        # precisely the state this module exists to prevent. `win_from`/`win_to`
        # matter because `leader_close.closing_time` falls back to the window
        # when no deadline is set, and the evaluator reads the UNIT's.
        fields = [f for f in ("proof_kind", "deadline", "description",
                              "win_from", "win_to")
                  if (getattr(r, f, None) or "") != ""]
        if fields:
            out.append(f"{prof.name} · vazifa {r.task_id} · {', '.join(fields)}")
    return sorted(out)


def preview(db: Session, shift: int) -> list[str]:
    """What the pass WOULD do, for the boot report and the DM."""
    lines = []
    for tid, (check, hours) in sorted(TASKS.items()):
        lines.append(f"#{tid} · {check} · {hours.get(shift, '—')}")
    return lines


def self_check(db: Session) -> list[str]:
    """Everything about the switched state that is wrong, said out loud.

    This repo has no test suite and a push to main is a deploy, so the
    invariants that would otherwise be tests are asserted at boot instead —
    the shape `leader_close.self_check` already has.
    """
    from app.services import leader_ai, leader_close
    bad: list[str] = []
    per_task = leader_tasks.per_task_units(db)
    for shift in (1, 2):
        for m in units(db, shift):
            cfg = None
            for tid in sorted(TASKS):
                td = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == tid).first()
                if td is None or not td.auto_check:
                    continue
                if cfg is None:
                    cfg = leader_tasks.requirements_for(
                        db, manager=m, shift=shift)
                entry = next((t for t in cfg.get("tasks", [])
                              if t.get("id") == tid), None)
                if entry is None or entry.get("proof_kind") != "auto":
                    continue
                if m.id not in per_task:
                    bad.append(f"{m.name}: #{tid} is automatic but the unit "
                               f"closes whole DAYS — nothing closes the task")
                # `requirements_for` publishes the window as ONE key, a
                # two-element list. Reading `win_from`/`win_to` off it (which
                # do not exist there) passed `(None, None)`, `closing_time`
                # dropped it and fell through to the day's filing deadline —
                # always a valid clock — so this invariant could never fire.
                due = leader_close.due_at(
                    {"deadline": entry.get("deadline"),
                     "window": entry.get("window")},
                    shift, leader_tasks.effective_date(shift))
                if due is None:
                    bad.append(f"{m.name}: #{tid} is automatic with no readable "
                               f"check hour")
    if not leader_auto.CHECKS:
        bad.append("no checks are registered in leader_auto.CHECKS")
    _ = leader_ai      # imported for symmetry with the other self-checks
    return bad
