"""THE door for client-side failure reports, forwarded to the support Telegram
chat (or every admin when no support chat is configured).

Two kinds, one delivery path — never add a third endpoint for a fourth kind:

  * /api/boot-report  — the app never started. Posted by the recovery screen in
    frontend/index.html when the user presses "Report the problem".
    Intentionally UNAUTHENTICATED: the whole point is that it works when the
    app failed to boot and the user may not be logged in.
  * /api/crash-report — the app started and then a render threw. Posted
    automatically by the ErrorBoundary, with no user involvement.

Both are throttled and size-capped so neither can be turned into a spam relay,
and the automatic one is de-duplicated by fingerprint as well: one crash that
hits forty people on a shift is one message, not forty.
"""
import hashlib
import html
import logging
import time
from collections import deque

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import TelegramUser
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


# ── Runtime crashes ─────────────────────────────────────────────────────────
# A render-time exception is caught by the webapp's ErrorBoundary, which shows a
# calm recovery card instead of a white page. That card used to be the ONLY
# record of the failure: nobody was told, so a crash reached us only if a user
# thought to screenshot it — which is exactly how the "422 detail rendered as a
# React child" bug surfaced, days late and with a minified stack for evidence.
# The boundary now posts here on every catch, so the report arrives before the
# complaint does.
#
# Unlike /boot-report this path is NOT in security._EXEMPT_PATHS, so the global
# guard has already proved the caller is a genuine WebView or a live web
# session. Attribution on top of that is best-effort ON PURPOSE: the crashes
# that matter most are the ones on the way IN, before any token exists.

_CRASH_RECENT: deque[float] = deque(maxlen=64)
_CRASH_MAX_PER_MIN = 10
# One message per distinct crash per hour. A crash in a shared component fires
# for everyone who opens that page, and forty identical DMs would train whoever
# reads them to ignore the next one.
_CRASH_WINDOW_S = 3600
_CRASH_SEEN: dict[str, dict] = {}
_CRASH_SEEN_MAX = 500


class CrashReport(BaseModel):
    message: str = Field("", max_length=500)
    stack: str = Field("", max_length=3000)
    component: str = Field("", max_length=2000)   # React component stack
    url: str = Field("", max_length=500)
    version: str = Field("", max_length=40)
    ua: str = Field("", max_length=500)


def _crash_who(db: Session, request: Request) -> str:
    """Name the reporter if the request carries a readable session, never fail.

    Everything here is optional: a crash before login has no token, and a
    report that says "not signed in" is worth incomparably more than no report.
    """
    header = request.headers.get("Authorization") or ""
    token = header[7:].strip() if header[:7].lower() == "bearer " else ""
    if not token:
        return "not signed in"
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except Exception:
        return "unreadable session"
    tid = payload.get("sub")
    role = payload.get("role") or "?"
    name = ""
    try:
        user = db.query(TelegramUser).filter_by(telegram_id=int(tid)).first()
        if user:
            name = (user.full_name or user.tg_name or "").strip()
            if user.username:
                name = f"{name} @{user.username}".strip()
    except Exception:
        pass
    return f"{name or 'user'} (id {tid}) · {role}"


def _fingerprint(body: CrashReport) -> str:
    """What makes two reports THE SAME crash: the message, the innermost frame
    of the component stack (which names the failing component), and the page.
    Deliberately not the whole stack — minified frame ids differ between builds,
    so including them would defeat the de-duplication on the next deploy."""
    where = ""
    for line in (body.component or "").strip().splitlines():
        if line.strip():
            where = line.strip()
            break
    path = (body.url or "").split("?")[0]
    raw = "|".join([body.message.strip(), where, path])
    return hashlib.sha1(raw.encode("utf-8", "replace")).hexdigest()


@router.post("/crash-report")
def crash_report(body: CrashReport, request: Request, db: Session = Depends(get_db)):
    who = _crash_who(db, request)
    path = (body.url or "?").split("?")[0]

    # The log line lands regardless of throttling, de-duplication or whether
    # Telegram is reachable — it is the record that survives.
    logger.error(
        "[CLIENT-CRASH] %s | v%s | %s | %s\n%s\n%s",
        who, body.version or "?", path, body.message or "(no message)",
        (body.stack or "").strip(), (body.component or "").strip(),
    )

    now = time.time()
    fp = _fingerprint(body)
    seen = _CRASH_SEEN.get(fp)
    if seen and now - seen["sent"] < _CRASH_WINDOW_S:
        seen["count"] += 1
        return {"ok": True, "reported": False, "repeats": seen["count"]}
    repeats = seen["count"] if seen else 0
    if len(_CRASH_SEEN) >= _CRASH_SEEN_MAX:      # keep the map bounded
        oldest = min(_CRASH_SEEN, key=lambda k: _CRASH_SEEN[k]["sent"])
        _CRASH_SEEN.pop(oldest, None)
    _CRASH_SEEN[fp] = {"sent": now, "count": 0}

    while _CRASH_RECENT and now - _CRASH_RECENT[0] > 60:
        _CRASH_RECENT.popleft()
    if len(_CRASH_RECENT) >= _CRASH_MAX_PER_MIN:
        return {"ok": True, "reported": False, "throttled": True}
    _CRASH_RECENT.append(now)

    # The first lines of the component stack name the failing component and the
    # chunk it came from — that is what identifies the PAGE in a minified build,
    # so it is the part worth carrying into the message.
    where = "\n".join((body.component or "").strip().splitlines()[:6]) or "(no component stack)"
    lines = [
        "🐞 <b>App crash</b>" + (f" · v{html.escape(body.version)}" if body.version else ""),
        f"Who: {html.escape(who)}",
        f"Page: {html.escape(path or '?')}",
    ]
    if repeats:
        lines.append(f"Also seen {repeats}× in the previous hour")
    text = "\n".join(lines) + (
        f"\n\n<pre>{html.escape(body.message or '(no message)')}</pre>"
        f"\n<pre>{html.escape(where)}</pre>"
    )

    delivered = 0
    for chat_id in _recipients():
        try:
            bot.send_message(chat_id, text, parse_mode="HTML")
            delivered += 1
        except Exception as e:
            logger.warning("crash-report send to %s failed: %s", chat_id, e)
    # Never raise: the caller is an app that has ALREADY failed once, and a
    # rejected report would only give its error handler something else to trip
    # over. The log line above is the guaranteed record.
    return {"ok": True, "reported": bool(delivered)}
