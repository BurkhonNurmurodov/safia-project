from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Annotated, Optional
import jwt
from jwt import PyJWTError as JWTError

from app.config import settings
from app.database import get_db
from app.models import Notification
from app.translit import transliterate
# Notification text is template-based: rows store a template key + raw params and
# the renderer lives with the templates in routers.staff. Importing it here lets
# us render each row in the *viewer's* current language at request time.
from app.routers.staff import _mk_notif, _get_user_lang

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp", auto_error=False)


def _decode_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None


def _require_admin(token: Annotated[str | None, Depends(_oauth2)]):
    payload = _decode_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


class NotificationCreate(BaseModel):
    title: str
    body: str
    type: str = "info"
    recipient_telegram_id: Optional[int] = None


def _row(r, lang: str):
    """Serialise a row, rendering its template in ``lang`` at view time. Template
    rows (nkey set) re-render in any language from their stored params; free-form
    rows (admin broadcast / legacy) keep their stored text but are transliterated
    to match the viewer's script (Cyrillic→Latin for uz/en), like the dashboard."""
    if r.nkey:
        try:
            title, body = _mk_notif(r.nkey, r.params or {}, lang)
        except Exception:
            title, body = r.title or r.nkey, r.body or ""
    else:
        title = transliterate(r.title or "", lang)
        body  = transliterate(r.body or "", lang)
    return {
        "id":         r.id,
        "title":      title,
        "body":       body,
        "type":       r.type,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_notifications(
    lang: Optional[str] = None,
    token: Annotated[str | None, Depends(_oauth2)] = None,
    db: Session = Depends(get_db),
):
    """Returns notifications relevant to the caller:
    - broadcast (recipient_telegram_id IS NULL)
    - addressed specifically to them

    Each row is rendered in ``lang`` (the viewer's current UI language). When it
    is omitted, the caller's saved language is used; otherwise Uzbek.
    """
    payload = _decode_token(token)
    telegram_id = int(payload["sub"]) if payload else None
    view_lang = lang or (_get_user_lang(db, telegram_id) if telegram_id else None) or "uz"

    q = db.query(Notification).order_by(Notification.created_at.desc())

    if telegram_id:
        q = q.filter(
            or_(
                Notification.recipient_telegram_id == None,       # noqa: E711
                Notification.recipient_telegram_id == telegram_id,
            )
        )
    else:
        q = q.filter(Notification.recipient_telegram_id == None)  # noqa: E711

    rows = q.limit(50).all()
    return [_row(r, view_lang) for r in rows]


@router.post("", status_code=201)
def create_notification(
    body: NotificationCreate,
    admin=Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only — create a broadcast or targeted notification."""
    n = Notification(
        title=body.title,
        body=body.body,
        type=body.type,
        recipient_telegram_id=body.recipient_telegram_id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return {"id": n.id, "title": n.title}


@router.delete("/{notif_id}", status_code=204)
def delete_notification(
    notif_id: int,
    admin=Depends(_require_admin),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(n)
    db.commit()
