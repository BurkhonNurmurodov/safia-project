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


def _row(r):
    return {
        "id":         r.id,
        "title":      r.title,
        "body":       r.body,
        "type":       r.type,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_notifications(
    token: Annotated[str | None, Depends(_oauth2)] = None,
    db: Session = Depends(get_db),
):
    """Returns notifications relevant to the caller:
    - broadcast (recipient_telegram_id IS NULL)
    - addressed specifically to them
    """
    payload = _decode_token(token)
    telegram_id = int(payload["sub"]) if payload else None

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
    return [_row(r) for r in rows]


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
