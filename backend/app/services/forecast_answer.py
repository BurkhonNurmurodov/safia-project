"""The brigadir's answer to the call forecast card (2026-10-19).

The «Smenaga chaqirish» DM carries two buttons — inside its body where
Telegram takes them (Bot API 10.3, `<tg-button-row>`), as a keyboard under it
everywhere else:

* **«Tasdiqlash»** records «I will call this many» — the count the notice
  sent — with who answered and when;
* **«O'zgartirish»** has the bot ask for a number, stored as the brigadir's
  own count beside the forecast. The forecast itself never changes.

The operator's rulings (2026-10-19): only a holder of the unit's supervisor
profile may answer; the latest answer wins (each is also a «Jurnal» row); the
«Smenaga chaqirish» modal shows it beside the unit. Nothing is notified.

**Every copy is re-drawn.** The card goes to every holder of the profile, so
an answer edits them all (the decided-card rule of the approval cards): a copy
with buttons in its body is re-sent with the body stored at send time
(`ForecastCallNotice.tg_bodies`, `forecast_rich.TOKEN` where the buttons go)
and the figure by the file_id Telegram gave it; any other copy has its
keyboard replaced. A copy that cannot be edited costs nothing but its look —
the answer is stored and the bot replies either way.

A tap on an OLDER notice (a newer one went out for the same unit-day) is
refused and that card is marked superseded; a day already past (plant clock)
takes no answer.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import ForecastCallNotice, TelegramUser, TelegramUserRole
from app.services import forecast_rich

logger = logging.getLogger(__name__)

TASHKENT = ZoneInfo("Asia/Tashkent")

# The largest count «O'zgartirish» takes — a typo guard, not a rule.
MAX_COUNT = 999

# `sent_by` of a notice sent by the «Tugmalar sinovi» (services/button_test) —
# AUTO_SENDER's shape (0 = the clock). A test notice works end to end for the
# admin it was sent to, and is invisible everywhere else: the modal and the
# automatic send skip it (`production._call_rows`), it is never the «latest»
# notice of a real unit-day, and its answers file no «Jurnal» row.
TEST_SENDER = -1


def today() -> date:
    return datetime.now(TASHKENT).date()


def state_of(n: ForecastCallNotice) -> dict | None:
    """The answer as the buttons and the modal read it, or None."""
    if not n.answer:
        return None
    return {"answer": n.answer, "count": n.answer_count, "at": n.answered_at,
            "by": n.answered_name}


class Tracker:
    """Collects what one send put in front of each holder — handed to
    `notify_profile` as `sent_fn`, read back onto the notice after it."""

    def __init__(self):
        self.messages: list[dict] = []
        self.bodies: dict[str, str] = {}

    def sent(self, tid: int, lang: str, kind: str, index, result) -> None:
        if kind == "rich":
            mid = (result or {}).get("message_id")
            entry = {"chat": tid, "mid": mid, "lang": lang,
                     "kind": "rich_btn" if index == 0 else "rich"}
            if index == 0:
                from app.routers.broadcast import _harvest_file_ids
                specs = _harvest_file_ids(result or {}, [
                    {"id": forecast_rich.PHOTO_ID, "kind": "photo"}])
                if specs:
                    entry["photo"] = specs[0]["media"]["media"]
        else:
            entry = {"chat": tid, "mid": getattr(result, "message_id", None),
                     "lang": lang, "kind": kind}
        if entry["mid"] is not None:
            self.messages.append(entry)


def latest(db: Session, manager_id: int, for_date) -> ForecastCallNotice | None:
    return (db.query(ForecastCallNotice)
            .filter_by(manager_id=manager_id, for_date=for_date)
            .filter(ForecastCallNotice.sent_by != TEST_SENDER)
            .order_by(ForecastCallNotice.sent_at.desc(),
                      ForecastCallNotice.id.desc())
            .first())


def refusal(db: Session, n: ForecastCallNotice | None, tid: int) -> str | None:
    """Why this account may not answer this notice now — a key of
    `forecast_rich.A` — or None. Checked on the tap AND again when the typed
    number lands: a minute of typing is time for a newer notice to go out."""
    if n is None:
        return "gone"
    if n.sent_by == TEST_SENDER:
        # A test card answers to the account it was sent to, and to nobody else.
        chats = {m.get("chat") for m in (n.tg_messages or [])}
        return None if tid in chats else "not_yours"
    from app.identity import profile_holders, profile_key
    if tid not in set(profile_holders(db, profile_key("supervisor", n.manager_id))):
        return "not_yours"
    if n.for_date < today():
        return "past"
    last = latest(db, n.manager_id, n.for_date)
    if last is not None and last.id != n.id:
        return "newer"
    return None


def _name(db: Session, tid: int, manager_id: int) -> str | None:
    r = (db.query(TelegramUserRole)
         .filter_by(telegram_id=tid, role="supervisor", role_id=manager_id,
                    status="approved").first())
    if r is not None and r.full_name:
        return r.full_name
    u = db.query(TelegramUser).filter_by(telegram_id=tid).first()
    return (u.full_name or u.tg_name) if u else None


def answer(db: Session, n: ForecastCallNotice, tid: int, kind: str,
           count: int | None = None) -> None:
    """Store one answer — «ok» (the notice's own count) or «own» — and file it
    in the «Jurnal». The caller commits, then calls `redraw`."""
    from app.models import Manager
    from app.services import action_log

    before = n.answer_count if n.answer else None
    n.answer = "ok" if kind == "ok" else "own"
    n.answer_count = int(n.workers if kind == "ok" else count)
    n.answered_at = datetime.now(timezone.utc)
    n.answered_by = tid
    n.answered_name = _name(db, tid, n.manager_id)
    if n.sent_by == TEST_SENDER:
        return
    mgr = db.get(Manager, n.manager_id)
    action_log.record_bot(
        db, tid, "comms",
        "notification.call_confirmed" if kind == "ok"
        else "notification.call_count_changed",
        actor_name=n.answered_name, actor_role="supervisor",
        target_kind="forecast_call", target_id=n.id,
        unit_id=n.manager_id, unit_name=mgr.name if mgr else None,
        day=n.for_date,
        details=[("workers", n.answer_count), ("value", n.workers)],
        changes=([("workers", before, n.answer_count)]
                 if before is not None and before != n.answer_count else None))


def _edit_rich(m: dict, html: str) -> None:
    from app.routers.broadcast import _tg_api
    rich = {"html": html, "is_rtl": False}
    if m.get("photo"):
        rich["media"] = [{"id": forecast_rich.PHOTO_ID,
                          "media": {"type": "photo", "media": m["photo"]}}]
    _tg_api("editMessageText", {"chat_id": m["chat"], "message_id": m["mid"],
                                "rich_message": json.dumps(rich)})


def _edit_keyboard(m: dict, kb) -> None:
    from app import tg_buttons
    from app.telegram_bot import bot
    tg_buttons.send(bot.edit_message_reply_markup, chat_id=m["chat"],
                    message_id=m["mid"], reply_markup=kb)


def _not_modified(exc: Exception) -> bool:
    return "not modified" in str(exc).lower()


def redraw(notice_id: int, *, stale: bool = False,
           only_mid: int | None = None) -> set:
    """Re-draw the copies of one notice's card to its current state —
    answered, or `stale` (a newer notice exists). `only_mid` limits it to the
    card that was tapped (a stale tap re-draws that one alone). Returns the
    message ids it re-drew (or found already drawn so). Never raises."""
    from app.database import SessionLocal

    done: set = set()

    try:
        with SessionLocal() as db:
            n = db.get(ForecastCallNotice, notice_id)
            if n is None:
                return
            state = state_of(n)
            messages = list(n.tg_messages or [])
            bodies = dict(n.tg_bodies or {})
    except Exception:
        logger.exception("forecast answer: could not read notice %s", notice_id)
        return done

    for m in messages:
        if only_mid is not None and m.get("mid") != only_mid:
            continue
        lang = m.get("lang") or "uz"
        kb = forecast_rich.keyboard(notice_id, state, lang, stale=stale)
        try:
            body = bodies.get(lang)
            if m.get("kind") == "rich_btn" and body:
                try:
                    _edit_rich(m, body.replace(
                        forecast_rich.TOKEN,
                        forecast_rich.button_row(notice_id, state, lang,
                                                 stale=stale)))
                    done.add(m.get("mid"))
                    continue
                except Exception as exc:
                    if _not_modified(exc):
                        done.add(m.get("mid"))
                        continue
                    # The body could not be re-sent: the state goes UNDER it
                    # as a keyboard instead — its own buttons stay, the
                    # server refuses what no longer holds.
                    logger.warning("forecast answer: rich edit refused for "
                                   "notice %s (%s) — keyboard instead",
                                   notice_id, exc)
            _edit_keyboard(m, kb)
            done.add(m.get("mid"))
        except Exception as exc:
            if _not_modified(exc):
                done.add(m.get("mid"))
            else:
                logger.warning("forecast answer: could not re-draw a copy of "
                               "notice %s: %s", notice_id, exc)
    return done
