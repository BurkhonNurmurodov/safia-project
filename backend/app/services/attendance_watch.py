"""
The nightly watch over `attendance_reconcile`.

Silent data loss is only dangerous while it is silent. The 19.08 losses sat
unnoticed for three days across four units, and the 30.06 ones for seven weeks,
because nothing ever asked whether the platform still showed everyone the file
said worked. A report somebody has to remember to open is not an answer to that
— the whole failure mode is that nobody had a reason to look.

So the same comparison runs on a timer and DMs admins the moment it is not
zero. Two rules keep it worth reading:

* Only `lost` rows raise it. A `not_saved` row is a cell staged and never
  saved — visible on the «Davomat» tab, fixed by pressing Save, and not a row
  the platform accepted and then dropped. Alarming on both trains the reader to
  dismiss the alert.
* One DM per (date, unit) FINDING, not per pass. `AppSetting` remembers what has
  already been reported, so a loss nobody has repaired yet goes quiet after the
  first night instead of arriving every night until it does.

`WINDOW_DAYS` is the lookback. A wipe can only affect a day whose batch still
exists, and an operator can only act on a recent one; a scan bounded by nothing
would get slower every day it worked correctly.
"""
import json
import logging
from datetime import date as date_t, timedelta

from app.database import SessionLocal
from app.models import AppSetting
from app.services import action_log, attendance_reconcile

log = logging.getLogger(__name__)

WINDOW_DAYS = 30
SEEN_KEY = "attendance_reconcile_reported_v1"
JOB_ID = "attendance_reconcile_watch"


def _seen(db) -> set:
    row = db.query(AppSetting).filter_by(key=SEEN_KEY).first()
    if not row or not row.value:
        return set()
    try:
        return {tuple(x) for x in json.loads(row.value)}
    except (ValueError, TypeError):
        return set()


def _remember(db, keys: set) -> None:
    # Bounded, and pruned to the window so the blob cannot grow forever: a key
    # that has aged out is one nothing will report again anyway.
    floor = (date_t.today() - timedelta(days=WINDOW_DAYS * 2)).isoformat()
    keep = sorted({k for k in keys if k[0] >= floor})
    row = db.query(AppSetting).filter_by(key=SEEN_KEY).first()
    payload = json.dumps([list(k) for k in keep])
    if row:
        row.value = payload
    else:
        db.add(AppSetting(key=SEEN_KEY, value=payload))
    db.commit()


def _message(fresh: list[dict], total_lost: int) -> str:
    by_day: dict = {}
    for r in fresh:
        by_day.setdefault(r["date"], []).append(r)
    lines = [
        "⚠️ <b>Davomatda yo'qolgan xodimlar</b>",
        f"Faylda bor, lekin platformada hech qaysi ro'yxatda yo'q: <b>{len(fresh)}</b> ta yangi"
        + (f" (jami {total_lost})" if total_lost != len(fresh) else ""),
        "",
    ]
    for day in sorted(by_day, reverse=True):
        rows = by_day[day]
        units = sorted({r["manager_name"] for r in rows})
        lines.append(f"<b>{day}</b> — {len(rows)} ta · {', '.join(units)}")
        for r in rows[:6]:
            hrs = f" · {r['hours_worked']:.2f} soat" if r.get("hours_worked") else ""
            lines.append(f"  • {r['worker_name']} ({r['verifix_code']}){hrs}")
        if len(rows) > 6:
            lines.append(f"  • …va yana {len(rows) - 6} ta")
        lines.append("")
    lines.append("Admin panel → Vositalar → «Yo'qolgan xodimlar»")
    return "\n".join(lines)


def run_watch() -> int:
    """One pass. Returns how many NEW lost workers were reported."""
    db = SessionLocal()
    try:
        today = date_t.today()
        data = attendance_reconcile.scan(db, today - timedelta(days=WINDOW_DAYS), today)
        lost = [r for r in data["rows"] if r["reason"] == "lost"]
        if not lost:
            return 0

        seen  = _seen(db)
        fresh = [r for r in lost if (r["date"], r["worker_name"]) not in seen]
        # Remember everything currently lost, reported or not, so the ledger
        # reflects the state rather than only what this pass happened to send.
        _remember(db, seen | {(r["date"], r["worker_name"]) for r in lost})
        if not fresh:
            return 0

        log.warning("ATTENDANCE-RECONCILE %d lost worker(s), %d new", len(lost), len(fresh))
        # Imported here, not at module scope: the bot pulls in the whole
        # Telegram stack and this module is imported by the scheduler at boot.
        from app.telegram_bot import bot, _admin_ids
        text = _message(fresh, len(lost))
        sent = 0
        for admin_id in _admin_ids():
            try:
                bot.send_message(admin_id, text, parse_mode="HTML")
                sent += 1
            except Exception:
                log.exception("reconcile watch: could not DM admin %s", admin_id)
        # The register learns what the DM said. Only a pass that actually FOUND
        # something new writes a row — the timer fires twice a day and a line
        # saying "nothing was lost" every twelve hours is how a register stops
        # being read. `day` is the most recent affected date, so the row sorts
        # beside the attendance work that caused it.
        days = sorted({r["date"] for r in fresh})
        action_log.record_system(
            "attendance", "attendance.reconcile_alert", db=db,
            target_kind="day", target_id=days[-1] if days else None,
            day=days[-1] if days else None,
            details=[("workers", len(fresh)), ("total", len(lost)),
                     ("from_date", days[0] if days else None),
                     ("to_date", days[-1] if days else None),
                     ("sent", sent)],
        )
        return len(fresh)
    except Exception:
        log.exception("attendance reconcile watch failed")
        return 0
    finally:
        db.close()


def register_watch() -> None:
    """Register the nightly pass. Called from both startup entrypoints."""
    from app.scheduler import schedule_interval
    # Every 12h rather than a wall-clock cron: uploads happen the morning after
    # the shift, so a pass shortly after each one is what catches a bad save on
    # the day it happened, and a missed run costs half a day, not a day.
    schedule_interval(JOB_ID, run_watch, minutes=12 * 60)
