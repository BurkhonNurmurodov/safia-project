"""Phone notifications for the Android app (CLAUDE.md «Phone notifications»).

The app has no push service behind it — that would take a Firebase project —
so it ASKS: Android's job scheduler wakes android/…/Push.java about every 15
minutes, and it calls ``GET /api/push/poll`` with the session the app holds
(the year-long app token, utils/appSession.js). What comes back is the bell's
own feed, cut to what the phone should show (services/notification_center
.push_entries); nothing here writes, so a poll costs a read and nothing else.

``POST /api/push/test`` writes ONE bell row to the caller themself, so the
settings dialog's «Sinov xabari» proves the whole path — the row, the poll,
the phone notification and the tap — on the person's own phone.
"""
from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_profile_key
from app.models import Notification
from app.routers.notifications import _lang
from app.routers.staff import _jsonify_params, _mk_notif
from app.security import require_auth
from app.services import action_log
from app.services import notification_center as center

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/poll")
def poll(after: int = -1, lang: Optional[str] = None,
         payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """What the phone should show now (``items``), which of its notifications
    are still unread (``active``), and the newest row id (``latest``) — its
    next cursor. ``after`` < 0 asks for ``latest`` alone."""
    return center.push_entries(db, payload, _lang(db, payload, lang), after)


@router.post("/test")
def send_test(lang: Optional[str] = None,
              payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """A test notification to the caller themself — a bell row only (no
    Telegram DM, no Ghost-Mode check: nobody else is told anything)."""
    lang = _lang(db, payload, lang)
    profile = viewer_profile_key(db, payload)
    title, body = _mk_notif("push_test", {}, lang)
    row = Notification(
        recipient_telegram_id=int(payload["sub"]), recipient_profile=profile,
        nkey="push_test", params=_jsonify_params({}), title=title, body=body,
        type="info", subject_kind="page", subject_id="/notifications",
    )
    db.add(row)
    db.commit()
    action_log.enrich(target_kind="notification", target_id=str(row.id),
                      details=[("profile", profile or "")])
    return {"ok": True, "id": row.id}
