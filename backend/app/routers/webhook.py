import logging
from collections import deque

import telebot
from fastapi import APIRouter, Request

from app.telegram_bot import bot

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Deduplication ─────────────────────────────────────────────────────────────
# Telegram retries webhook delivery when it doesn't receive 200 OK within 10 s.
# If the handler already sent a message before the error was raised, the retry
# produces a duplicate.  We track the last 200 update_ids (ring-buffer) so we
# can skip updates we've already processed.
_SEEN_MAX = 200
_seen_ids: deque[int] = deque()
_seen_set: set[int] = set()


def _is_non_private(update: telebot.types.Update) -> bool:
    """True for updates originating in group/supergroup/channel chats.

    The bot is private-chat-only for now: it may be added to groups later,
    but until group features ship it must stay silent there — no replies to
    messages, commands, or button taps outside private chats.
    """
    msg = update.message or update.edited_message
    if msg is None and update.callback_query is not None:
        msg = update.callback_query.message
    return msg is not None and msg.chat.type != "private"


def _already_seen(update_id: int) -> bool:
    if update_id in _seen_set:
        return True
    _seen_set.add(update_id)
    _seen_ids.append(update_id)
    if len(_seen_ids) > _SEEN_MAX:
        evicted = _seen_ids.popleft()
        _seen_set.discard(evicted)
    return False


@router.post("/bot/webhook")
async def telegram_webhook(request: Request):
    try:
        data   = await request.json()
        update = telebot.types.Update.de_json(data)

        if _already_seen(update.update_id):
            logger.warning("Duplicate update_id %s — skipped", update.update_id)
            return {"ok": True}

        bot.process_new_updates([update])

    except Exception:
        # Log the error but always return 200 so Telegram does NOT retry.
        # A retry would call send_message a second time if the first call
        # already succeeded before the exception was raised.
        logger.exception("Error processing webhook update")

    return {"ok": True}
