"""The call forecast, sent by the clock («Smenaga chaqirish», automatically).

Every evening at 19:00 shift 1's brigadirs are DMed how many workers to call
for their next shift, and every morning at 06:00 shift 2's are — the same
message the «Ertangi chaqiruv» modal sends by hand, with nobody having to
press it. Times are the plant's wall clock (the scheduler is pinned to
Asia/Tashkent), so the box's own zone cannot move them.

Four rules hold this together:

* **ONE computation.** The job calls ``_call_rows`` and ``_send_call_notice``
  in routers/production.py — the very functions the modal's own two endpoints
  read — so a count DMed by the clock can never differ from the one the modal
  would have shown for that date. Nothing here computes a forecast, a band or a
  message of its own.

* **Each shift is sent its NEXT shift-day**, and that is not the same calendar
  arithmetic for the two of them, so ``target_date`` is THE definition and must
  never be re-derived at a call site. At 19:00 a shift-1 brigadir is on today's
  day shift, so the next one they staff is TOMORROW's. At 06:00 a shift-2
  brigadir is finishing the night the platform labels YESTERDAY (a night
  belongs to the date its 20:00 boundary opened), so the next one they staff
  opens at 20:00 TODAY — today's date, ~14 hours ahead. Sending them tomorrow's
  instead would mean a brigadir never gets a forecast for the shift they are
  about to begin.

* **A unit already notified for that date is SKIPPED.** ``last_notice`` is the
  modal's own resend guard, read here as a hard skip rather than a confirm: a
  person who sent that unit's call by hand this afternoon has already answered
  the question, and a job that fires twice (a restart inside the misfire grace,
  a hand-run) must not DM the plant twice.

* **The audience mirrors the modal's own pre-selection** — a forecast AND a
  claimed supervisor profile. A unit with too little history has no number to
  send, and an unclaimed profile can only queue a bell row nobody will read
  today. Both are exactly the rows the modal leaves unticked, so the automatic
  send can never reach somebody the manual one would not have.

The switch and the «Smena unumi» the counts are computed at are two AppSetting
rows read AT FIRE TIME, never captured at boot: pausing the send has to be an
admin edit and not a deploy, because this platform has no shell. An ABSENT row
reads as ON at ``DEFAULT_CAPACITY`` (90%), the same "absent row = on" convention
the SAP auto-fill register already uses. That constant only decides a box with
NO row, so the move off the original 100% carries a flag-guarded one-shot in
startup.py too — a default nothing reads is a setting that never changed.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta

from app.database import SessionLocal
from app.models import AppSetting, Manager
from app.services import action_log

log = logging.getLogger(__name__)

# Plant wall clock. {shift: (hour, minute)}
SEND_AT: dict[int, tuple[int, int]] = {1: (19, 0), 2: (6, 0)}

JOB_ID = "forecast-autocall-{}"

# A push to main restarts the unit, and a cron fire time that passes while the
# process is down is simply dropped (the scheduler's jobstore is memory-only and
# the misfire grace is five minutes). So a boot inside this window after a send
# time runs that send late rather than losing the day's call entirely — bounded,
# because "late" stops being a kindness somewhere before the middle of the night.
# It cannot double-send: run() skips every unit that already holds a notice for
# the date, so a catch-up after a send that DID happen writes nothing.
CATCHUP_MIN = 90

# ``ForecastCallNotice.sent_by`` is a NOT NULL telegram id, so the platform's
# own sends carry this sentinel instead. The modal prints «Avtomatik» for it
# rather than resolving a name that will never be found.
AUTO_SENDER = 0

SETTING_ENABLED = "forecast_autocall_enabled"
SETTING_CAPACITY = "forecast_autocall_capacity_pct"
# The «Smena unumi» the call counts are computed at — 90% of the 480-min shift
# (432 productive minutes per worker), the operator's figure of 2026-09-09.
# A brigadir is being told how many people to CALL, and somebody who is present
# is not productive for every minute of the shift; costing the forecast at 100%
# quietly assumed they were. Making the divisor more realistic RAISES the count:
# the same trudoyomkost now asks for ~11% more people.
DEFAULT_CAPACITY = 90.0

_OFF = ("0", "false", "off", "no", "")


def settings(db) -> dict:
    """The two knobs, with the defaults an untouched platform runs on."""
    rows = {
        r.key: r.value
        for r in db.query(AppSetting).filter(
            AppSetting.key.in_([SETTING_ENABLED, SETTING_CAPACITY])
        )
    }
    raw = rows.get(SETTING_ENABLED)
    enabled = True if raw is None else str(raw).strip().lower() not in _OFF
    try:
        cap = float(str(rows.get(SETTING_CAPACITY, "")).replace(",", "."))
    except (TypeError, ValueError):
        cap = DEFAULT_CAPACITY
    if not 1 <= cap <= 100:
        cap = DEFAULT_CAPACITY
    return {"enabled": enabled, "capacity_pct": cap}


def save(db, *, enabled: bool, capacity_pct: float) -> None:
    """Write both knobs. Values are stored as strings, like every AppSetting."""
    for key, value in ((SETTING_ENABLED, "1" if enabled else "0"),
                       (SETTING_CAPACITY, f"{float(capacity_pct):g}")):
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSetting(key=key, value=value))


def target_date(shift: int, today: date | None = None) -> date:
    """The shift-day a send made NOW is about. See the module docstring — this
    is the one place the two shifts' arithmetic differs, and the one place it
    is allowed to be spelled."""
    today = today or date.today()
    return today + timedelta(days=1) if shift == 1 else today


def send_at(shift: int) -> str:
    h, m = SEND_AT[shift]
    return f"{h:02d}:{m:02d}"


def run(shift: int) -> dict:
    """One scheduled send. Never raises — a job that dies takes the next
    fire time with it on some APScheduler paths, and a silent failure here is
    a shift nobody was called for."""
    summary = {"shift": shift, "sent": 0, "skipped": None}
    db = SessionLocal()
    try:
        cfg = settings(db)
        target = target_date(shift)
        summary["date"] = target.isoformat()
        if not cfg["enabled"]:
            summary["skipped"] = "off"
            log.info("autocall: shift %s for %s skipped — switched off", shift, target)
            return summary

        # function-level import: the router owns the computation, and importing
        # it at module level would close a circle through app.routers.staff
        from app.routers.production import _call_rows, _send_call_notice

        eff = int(round(cfg["capacity_pct"]))
        rows = _call_rows(db, target, cfg["capacity_pct"], shift)
        due = [r for r in rows
               if r["forecast"] is not None and r["registered"] and not r["last_notice"]]
        by_id = {m.id: m for m in db.query(Manager).filter(
            Manager.id.in_([r["manager_id"] for r in due]),
            Manager.archived.is_(False),
        )} if due else {}

        called: list[str] = []
        for r in due:
            mgr = by_id.get(r["manager_id"])
            if mgr is None:
                continue
            band_hi = r["band_hi"]
            max_workers = band_hi if band_hi is not None else r["forecast"]
            _send_call_notice(db, mgr, target, eff, r["forecast"], max_workers,
                              AUTO_SENDER)
            called.append(f"{mgr.name}: {r['forecast']}")
        db.commit()
        summary["sent"] = len(called)

        # Filed under the action the manual modal files: one act, one place in
        # the register, told apart by its source ("system") and its actor.
        action_log.record_system(
            "comms", "notification.workers_called", db=db,
            target_kind="notification", target_id=f"autocall:{shift}:{target}",
            day=target,
            details=[("shift", shift), ("sent", len(called)),
                     ("audience", "; ".join(called)),
                     ("skipped", len(rows) - len(due)),
                     ("value", f"{eff}%")],
        )
        log.info("autocall: shift %s for %s — %s sent, %s skipped",
                 shift, target, len(called), len(rows) - len(due))
    except Exception:
        log.exception("autocall: shift %s send failed", shift)
        summary["skipped"] = "error"
        try:
            db.rollback()
        except Exception:
            pass
        action_log.record_system(
            "comms", "notification.workers_called", outcome="error",
            target_kind="notification", target_id=f"autocall:{shift}",
            details=[("shift", shift)],
        )
    finally:
        db.close()
    return summary


def register_jobs() -> None:
    """Both daily sends. Mirrored in passenger_wsgi.py like every other boot
    job; the scheduler's jobstore is memory-only, so every boot re-arms them."""
    from apscheduler.triggers.cron import CronTrigger
    from app.scheduler import SCHEDULER_TZ, get_scheduler

    from app.scheduler import schedule_at

    now = datetime.now(SCHEDULER_TZ)
    for shift, (hour, minute) in SEND_AT.items():
        try:
            get_scheduler().add_job(
                # default arg, or every job would close over the last shift
                lambda s=shift: run(s),
                trigger=CronTrigger(hour=hour, minute=minute, timezone=SCHEDULER_TZ),
                id=JOB_ID.format(shift), replace_existing=True,
            )
        except Exception:
            log.exception("autocall: could not register the shift-%s job", shift)

        due = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if due <= now < due + timedelta(minutes=CATCHUP_MIN):
            schedule_at(f"{JOB_ID.format(shift)}-catchup",
                        now + timedelta(seconds=60), lambda s=shift: run(s))
            log.info("autocall: shift %s boot catch-up armed (%s has passed)",
                     shift, send_at(shift))
    log.info("autocall: jobs registered (%s)",
             ", ".join(f"shift {s} at {send_at(s)}" for s in sorted(SEND_AT)))
