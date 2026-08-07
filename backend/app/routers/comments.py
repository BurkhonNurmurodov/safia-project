from datetime import date
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.orm import Session
import jwt
from jwt import PyJWTError as JWTError

from app import identity
from app.config import settings
from app.database import get_db
from app.models import Comment

router = APIRouter(prefix="/api", tags=["comments"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


class CommentIn(BaseModel):
    manager_id: int
    date: date
    text: str


class CommentUpdate(BaseModel):
    text: str


def _is_author(c: Comment, user: dict, db: Session) -> bool:
    """A unit comment belongs to the PROFILE that wrote it, not to the login.
    Two people running one unit share their team's comments — either may fix or
    remove one — and rights survive a handover. The same account switched into a
    different profile has no rights here."""
    return identity.owns(db, user, c.author_profile, c.author_telegram_id)


def _serialize(c: Comment, user: dict | None = None, db: Session | None = None) -> dict:
    return {
        "id": c.id,
        "manager_id": c.manager_id,
        "date": c.date.isoformat(),
        "text": c.text,
        "author_telegram_id": c.author_telegram_id,
        "author_profile": c.author_profile,
        "author_name": c.author_name,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        # Resolved server-side so no client has to re-derive the ownership rule
        # (two frontend copies of it had already drifted).
        "is_own": _is_author(c, user, db) if (user and db is not None) else False,
    }


@router.get("/comments")
def list_comments(
    manager_id: Optional[int] = Query(default=None),
    date_val: Optional[date] = Query(default=None, alias="date"),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    q = db.query(Comment)
    if manager_id:
        q = q.filter(Comment.manager_id == manager_id)
    if date_val:
        q = q.filter(Comment.date == date_val)
    if date_from:
        q = q.filter(Comment.date >= date_from)
    if date_to:
        q = q.filter(Comment.date <= date_to)
    return [_serialize(c, user, db) for c in q.order_by(Comment.created_at).all()]


@router.post("/comments")
def create_comment(
    payload: CommentIn,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = Comment(
        manager_id=payload.manager_id,
        date=payload.date,
        text=payload.text,
        author_telegram_id=int(user["sub"]),
        author_profile=identity.viewer_profile_key(db, user),
        author_name=user.get("full_name", ""),
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _serialize(c, user, db)


@router.put("/comments/{comment_id}")
def update_comment(
    comment_id: int,
    payload: CommentUpdate,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Comment).filter_by(id=comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _is_author(c, user, db):
        raise HTTPException(status_code=403, detail="Not your comment")
    c.text = payload.text
    db.commit()
    db.refresh(c)
    return _serialize(c, user, db)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: int,
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Comment).filter_by(id=comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _is_author(c, user, db):
        raise HTTPException(status_code=403, detail="Not your comment")
    db.delete(c)
    db.commit()
