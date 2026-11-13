"""«Kutish yechimlari» — the daily reminder (2026-11-14).

A brigadir and a cause's owner are told ONCE a day, in Telegram and in the bell,
what waits on them on `/idle-solutions`: the filed stops they wrote nothing to,
and their own plans whose date has passed. The answer is
`routers/idle_solutions.waiting` — the page's «Sizni kutmoqda» list and the
number on the menu row read that same function, so the message never names a
number the page does not show.

* **Who** — the brigadir of every unarchived unit (`supervisor:<unit>`) and
  every «Kutish mas'uli» whose profile is of the owner role: the two roles the
  page itself asks (`EXPECTED_ROLES`). A profile nobody holds is skipped — there
  is nobody to tell.
* **When** — by the clock, two hours into the working day (`SLOTS`, Tashkent):
  shift 1 and the owners at 10:00, shift 2 at 22:00. The job fires every 20
  minutes for `OPEN_MIN` from each slot, so a deploy at the slot's own minute
  costs nothing.
* **Once** — `idle_solution_reminders`, one row per (profile, day), written
  BEFORE the message goes out; the unique key is what makes «once a day» true
  when two copies of the app overlap or a missed job is caught up.
* **Nothing waits → nothing is sent.** Never a «0» message; the day is still
  recorded, so it is not asked again.
* **Not before the page's first day** (`idle_solutions.OPEN_FROM`, None until
  the operator names it): until then nobody is asked and nothing is written.

It is one notification key (`idle_solution_reminder`, category «idle»): the
person who turned that category's Telegram off keeps the bell row and gets no
DM, like every other notice.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from html import escape
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import identity
from app.models import IdleSolutionReminder, Manager
from app.services import idle_scope

log = logging.getLogger(__name__)

NKEY = "idle_solution_reminder"
PAGE = "/idle-solutions"

# Shift → the wall clock its reminder goes out at (Tashkent). Owners ride slot 1.
SLOTS = {1: time(10, 0), 2: time(22, 0)}
OPEN_MIN = 120          # a slot stays open this long — the catch-up window
LIST_TOP = 3            # stops named per kind in the message; the rest are counted

_L = {
    "uz": {
        "title": "Kutish yechimlari",
        "lead": "<b>{n} ta</b> to'xtash sizni kutmoqda.",
        "unanswered": "📝 <b>Yechim yozilmagan — {n} ta</b>",
        "overdue": "⏰ <b>Rejangiz muddati o'tgan — {n} ta</b>",
        "due": "muddat {d} edi",
        "more": "… va yana {n} ta",
        "hint": "Har biriga nima qilganingizni yozing.",
        "btn": "Yechim yozish", "min": "daq",
    },
    "uz_cyrl": {
        "title": "Кутиш ечимлари",
        "lead": "<b>{n} та</b> тўхташ сизни кутмоқда.",
        "unanswered": "📝 <b>Ечим ёзилмаган — {n} та</b>",
        "overdue": "⏰ <b>Режангиз муддати ўтган — {n} та</b>",
        "due": "муддат {d} эди",
        "more": "… ва яна {n} та",
        "hint": "Ҳар бирига нима қилганингизни ёзинг.",
        "btn": "Ечим ёзиш", "min": "дақ",
    },
    "ru": {
        "title": "Решения по ожиданиям",
        "lead": "Остановок, которые ждут вашего решения: <b>{n}</b>.",
        "unanswered": "📝 <b>Решение не написано — {n}</b>",
        "overdue": "⏰ <b>Срок вашего плана прошёл — {n}</b>",
        "due": "срок был {d}",
        "more": "… и ещё {n}",
        "hint": "Напишите по каждой, что вы сделали.",
        "btn": "Написать решение", "min": "мин",
    },
    "en": {
        "title": "Idle solutions",
        "lead": "Stops waiting for you: <b>{n}</b>.",
        "unanswered": "📝 <b>No solution written — {n}</b>",
        "overdue": "⏰ <b>Your plan's date has passed — {n}</b>",
        "due": "was due {d}",
        "more": "… and {n} more",
        "hint": "Write what you did about each one.",
        "btn": "Write a solution", "min": "min",
    },
}


def _ddmm(iso: Optional[str]) -> str:
    return f"{iso[8:10]}.{iso[5:7]}" if iso and len(iso) >= 10 else ""


def open_shifts(now: datetime) -> list[int]:
    """The shifts whose slot is open at `now` (Tashkent wall clock)."""
    out = []
    for shift, at in SLOTS.items():
        start = datetime.combine(now.date(), at, tzinfo=now.tzinfo)
        if start <= now < start + timedelta(minutes=OPEN_MIN):
            out.append(shift)
    return out


def recipients(db: Session) -> list[dict]:
    """Everybody the page asks, with the slot each is told in: the brigadir of
    every unarchived unit (their unit's shift; a unit with no shift rides slot
    1) and every cause owner of the owner role (slot 1)."""
    out = []
    for m in db.query(Manager.id, Manager.shift).filter(Manager.archived.is_(False)).all():
        out.append({"profile": identity.profile_key("supervisor", m.id),
                    "payload": {"role": "supervisor", "role_id": m.id},
                    "slot": m.shift if m.shift in SLOTS else 1})
    for key in sorted(set(idle_scope.owners(db).values())):
        role, ref = identity.parse_profile_key(key)
        if role == idle_scope.OWNER_ROLE and ref:
            out.append({"profile": key, "payload": {"role": role, "role_id": ref}, "slot": 1})
    return out


def body(lang: str, w: dict, plans: dict) -> str:
    """The message as Telegram HTML, in `lang`. `w` is `waiting()`'s answer;
    `plans` = stop id → the reader's overdue plan's date (ISO)."""
    from app.services.ojidaniya_svodka import CAT_LABELS
    t = _L.get(lang) or _L["uz"]
    labels = CAT_LABELS.get(lang) or CAT_LABELS["uz"]

    def line(s: dict, why: str) -> str:
        bits = [_ddmm(s.get("date")), f"<code>{escape(str(s.get('cell') or '—'))}</code>",
                escape(labels.get(s.get("category"), s.get("category") or ""))]
        if why == "overdue" and plans.get(s.get("id")):
            bits.append(t["due"].format(d=_ddmm(plans[s["id"]])))
        elif s.get("minutes"):
            bits.append(f"{round(float(s['minutes']))} {t['min']}")
        return "• " + " · ".join(b for b in bits if b)

    def block(why: str, n: int) -> list[str]:
        rows = [s for s, k in w["stops"] if k == why]
        out = ["", t[why].format(n=n)] + [line(s, why) for s in rows[:LIST_TOP]]
        if len(rows) > LIST_TOP:
            out.append(t["more"].format(n=len(rows) - LIST_TOP))
        return out

    total = w["unanswered"] + w["overdue"]
    parts = [f"🔔 <b>{escape(t['title'])}</b>", "", t["lead"].format(n=total)]
    if w["overdue"]:
        parts += block("overdue", w["overdue"])
    if w["unanswered"]:
        parts += block("unanswered", w["unanswered"])
    parts += ["", f"<i>{escape(t['hint'])}</i>"]
    return "\n".join(parts)


def _markup(lang: str):
    from telebot import types
    from app.config import settings
    t = _L.get(lang) or _L["uz"]
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        t["btn"], web_app=types.WebAppInfo(url=f"{settings.webapp_url.rstrip('/')}{PAGE}")))
    return kb


def _plan_dates(db: Session, profile: str, w: dict) -> dict:
    """Stop id → the date of the reader's own overdue plan on it (the earliest,
    when a stop carries several)."""
    from app.models import IdleCategorySolution
    ids = [s["id"] for s, why in w["stops"] if why == "overdue"]
    if not ids:
        return {}
    out: dict = {}
    for eid, due in db.query(IdleCategorySolution.event_id, IdleCategorySolution.due_date).filter(
            IdleCategorySolution.author_key == profile,
            IdleCategorySolution.event_id.in_(ids),
            IdleCategorySolution.status != "done",
            IdleCategorySolution.due_date < w["to"]).all():
        iso = due.isoformat()
        out[eid] = min(out.get(eid, iso), iso)
    return out


def _claim(db: Session, profile: str, day: date, w: Optional[dict]) -> Optional[IdleSolutionReminder]:
    """The ledger row for (profile, day), or None when another copy got there
    first. Committed before anything is sent."""
    row = IdleSolutionReminder(profile_key=profile, day=day, sent=False,
                               unanswered=(w or {}).get("unanswered", 0),
                               overdue=(w or {}).get("overdue", 0))
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    return row


def run(now: Optional[datetime] = None, *, shifts: Optional[list[int]] = None) -> dict:
    """One pass: everybody whose slot is open and who has not been asked today
    is asked once. Returns what happened, for the log and the tests.

    `shifts` overrides the clock (the tests, and a pass run by hand)."""
    from app.database import SessionLocal
    from app.routers.idle_solutions import TZ, is_open, waiting
    now = now or datetime.now(TZ)
    slots = open_shifts(now) if shifts is None else list(shifts)
    out = {"slots": slots, "asked": 0, "sent": 0, "quiet": 0, "nobody": 0}
    # before the page's first day nobody has been told anything: nobody is asked
    if not slots or not is_open(now.date()):
        return out
    today = now.date()
    db = SessionLocal()
    try:
        done = {k for (k,) in db.query(IdleSolutionReminder.profile_key).filter(
            IdleSolutionReminder.day == today).all()}
        for r in recipients(db):
            profile = r["profile"]
            if not profile or r["slot"] not in slots or profile in done:
                continue
            done.add(profile)
            try:
                out["asked"] += 1
                if not identity.profile_holders(db, profile):
                    out["nobody"] += 1
                    _claim(db, profile, today, None)
                    continue
                w = waiting(db, r["payload"], today)
                total = (w["unanswered"] + w["overdue"]) if w else 0
                row = _claim(db, profile, today, w)
                if row is None:
                    continue
                if not total:
                    out["quiet"] += 1
                    continue
                _send(db, profile, w)
                row.sent = True
                db.commit()
                out["sent"] += 1
            except Exception:  # noqa: BLE001 — one person's failure is not the next one's
                db.rollback()
                log.exception("idle-solution reminder: %s failed", profile)
    finally:
        db.close()
    return out


def _send(db: Session, profile: str, w: dict) -> None:
    """The bell row and the DM to every holder, each in their own language. The
    caller commits (`notify_profile` only adds the bell row)."""
    from app.routers.staff import notify_profile
    plans = _plan_dates(db, profile, w)
    total = w["unanswered"] + w["overdue"]
    notify_profile(
        db, profile, NKEY,
        # a blank value drops its row from the bell text (`_render_body`)
        {"n": total, "unanswered": w["unanswered"] or "", "overdue": w["overdue"] or ""},
        type="warning" if w["overdue"] else "info",
        html_fn=lambda lang: body(lang, w, plans),
        markup_fn=_markup,
        subject=("page", PAGE),
    )


def _job() -> None:
    try:
        res = run()
        if res["asked"]:
            log.info("idle-solution reminder: slots %s — %s asked, %s sent, %s with nothing "
                     "waiting, %s with no holder", res["slots"], res["asked"], res["sent"],
                     res["quiet"], res["nobody"])
    except Exception:  # noqa: BLE001
        log.exception("idle-solution reminder: pass failed")


def register_jobs() -> None:
    """One cron job, re-armed at every boot (memory jobstore): every 20 minutes
    through each slot's open window. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler
        hours = sorted({(at.hour + h) % 24 for at in SLOTS.values()
                        for h in range((OPEN_MIN + 59) // 60)})
        get_scheduler().add_job(
            _job, trigger=CronTrigger(hour=",".join(map(str, hours)), minute="0,20,40",
                                      timezone=SCHEDULER_TZ),
            id="idle-solution-reminder", replace_existing=True)
        log.info("idle-solution reminder: job registered (hours %s, every 20 min)", hours)
    except Exception:  # noqa: BLE001
        log.exception("idle-solution reminder: could not register the job")
