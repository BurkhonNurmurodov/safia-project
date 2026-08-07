"""Receives boot-failure reports from the recovery screen in frontend/index.html
(the "Report the problem" button) and forwards them to the support Telegram chat.

Intentionally unauthenticated: the whole point is that it works when the app
failed to boot and the user may not be logged in. Because of that it is throttled
and size-capped so it can't be turned into a spam relay to the support chat.
"""
import html
import logging
import time
from collections import deque

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.routers.auth import _validate_init_data
from app.telegram_bot import bot, _admin_ids

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["boot"])

# In-memory global throttle (per Passenger worker). Boot failures are rare, so a
# low ceiling is plenty and keeps the unauthenticated endpoint from being abused.
_RECENT: deque[float] = deque(maxlen=64)
_MAX_PER_MIN = 20


class BootReport(BaseModel):
    stage: str = Field("", max_length=200)
    ua: str = Field("", max_length=500)
    details: str = Field("", max_length=3500)
    initData: str = Field("", max_length=4096)


def _recipients() -> list[int]:
    """Support chat from settings.support_chat_id (comma-separated), or every
    admin if that's unset — so reports always land somewhere out of the box."""
    raw = (settings.support_chat_id or "").strip()
    if raw:
        out: list[int] = []
        for part in raw.replace(" ", "").split(","):
            try:
                out.append(int(part))
            except ValueError:
                pass
        if out:
            return out
    try:
        return list(_admin_ids())
    except Exception:
        return []


@router.post("/boot-report")
def boot_report(body: BootReport):
    now = time.time()
    while _RECENT and now - _RECENT[0] > 60:
        _RECENT.popleft()
    if len(_RECENT) >= _MAX_PER_MIN:
        raise HTTPException(status_code=429, detail="Too many reports")
    _RECENT.append(now)

    # Best-effort attribution — a valid initData names the reporter, but it's
    # never required (the app may have failed before the user ever logged in).
    who = "unknown user"
    parsed = _validate_init_data(body.initData) if body.initData else None
    if parsed and isinstance(parsed.get("user"), dict):
        u = parsed["user"]
        name = " ".join(x for x in [u.get("first_name"), u.get("last_name")] if x).strip()
        uname = f" @{u['username']}" if u.get("username") else ""
        who = f"{name or 'user'}{uname} (id {u.get('id')})"

    text = (
        "⚠️ <b>Boot failure report</b>\n"
        f"From: {html.escape(who)}\n"
        f"Stage: {html.escape(body.stage or '?')}\n\n"
        f"<pre>{html.escape(body.details or '(no details)')}</pre>"
    )

    recipients = _recipients()
    if not recipients:
        logger.warning("boot-report: no support chat and no admins to notify")
        raise HTTPException(status_code=503, detail="No support channel configured")

    delivered = 0
    for chat_id in recipients:
        try:
            bot.send_message(chat_id, text, parse_mode="HTML")
            delivered += 1
        except Exception as e:  # a blocked/unstarted chat must not fail the others
            logger.warning("boot-report send to %s failed: %s", chat_id, e)

    if not delivered:
        raise HTTPException(status_code=502, detail="Could not deliver report")
    return {"ok": True, "delivered": delivered}
