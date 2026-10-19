"""The call forecast card's «Tasdiqlash» / «O'zgartirish» — RETIRED.

From v4.305.0 to v4.306.x (19 Oct 2026) the «Smenaga chaqirish» DM carried
two buttons, inside its body where Telegram took them, as a keyboard
elsewhere: «Tasdiqlash» recorded «I will call this many», «O'zgartirish» the
brigadir's own number. The same day the operator had both removed: the answer
was shown only in the «Smenaga chaqirish» modal, so it asked brigadirs for a
tap nobody would read. New cards carry no buttons.

What is left here is for the cards that already went out with them:

* a tap on one (`fa:…`, `telegram_bot._fa_callback`) records nothing, says the
  button is no longer used, and strips the buttons from every copy of that
  card (`retire`) — a copy with buttons in its body is re-sent with the body
  stored at send time (`ForecastCallNotice.tg_bodies`, `forecast_rich.TOKEN`
  where the buttons stood) and the figure by its file_id; any other copy has
  its keyboard removed;
* `TEST_SENDER` — `sent_by` of a notice the «Tugmalar sinovi» sent while the
  buttons existed; `production._call_rows` keeps skipping those, since they
  are in the table.

The answer columns on `forecast_call_notices` stay, unused: dropping them is a
separate decision.
"""
from __future__ import annotations

import json
import logging

from app.models import ForecastCallNotice
from app.services import forecast_rich

logger = logging.getLogger(__name__)

TEST_SENDER = -1

RETIRED = {
    "uz": "Bu tugma endi ishlatilmaydi — prognoz o'zgarmagan.",
    "uz_cyrl": "Бу тугма энди ишлатилмайди — прогноз ўзгармаган.",
    "ru": "Эта кнопка больше не используется — прогноз не изменился.",
    "en": "This button is no longer used — the forecast is unchanged.",
}


def retired_text(lang: str) -> str:
    return RETIRED.get(lang) or RETIRED["uz"]


def _not_modified(exc: Exception) -> bool:
    return "not modified" in str(exc).lower()


def retire(notice_id: int) -> None:
    """Take the buttons off every copy of one notice's card. Never raises."""
    from app.database import SessionLocal
    from app.routers.broadcast import _tg_api
    from app.telegram_bot import bot

    try:
        with SessionLocal() as db:
            n = db.get(ForecastCallNotice, notice_id)
            if n is None:
                return
            messages = list(n.tg_messages or [])
            bodies = dict(n.tg_bodies or {})
    except Exception:
        logger.exception("forecast retire: could not read notice %s", notice_id)
        return

    for m in messages:
        try:
            body = bodies.get(m.get("lang") or "uz")
            if m.get("kind") == "rich_btn" and body:
                rich = {"html": body.replace(forecast_rich.TOKEN, ""), "is_rtl": False}
                if m.get("photo"):
                    rich["media"] = [{"id": forecast_rich.PHOTO_ID,
                                      "media": {"type": "photo", "media": m["photo"]}}]
                _tg_api("editMessageText", {"chat_id": m["chat"],
                                            "message_id": m["mid"],
                                            "rich_message": json.dumps(rich)})
            else:
                bot.edit_message_reply_markup(m["chat"], m["mid"], reply_markup=None)
        except Exception as exc:
            if not _not_modified(exc):
                logger.warning("forecast retire: could not strip a copy of "
                               "notice %s: %s", notice_id, exc)
