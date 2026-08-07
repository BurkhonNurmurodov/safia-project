"""Per-profile UI preferences — small JSON blobs the webapp persists per viewer
(e.g. table column visibility/order). Prefs follow the caller's ACTIVE profile
so they travel across devices and never leak between an account's profiles."""
import json
from typing import Annotated

import jwt
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import UiPref
from app.routers.staff import _viewer_profile_key

router = APIRouter(prefix="/api/ui-prefs", tags=["ui-prefs"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp", auto_error=False)


def _caller_key(db: Session, token: str | None) -> str:
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    # Legacy unbound accounts (no active profile) keep account-keyed storage.
    return _viewer_profile_key(db, payload) or f"acct:{payload.get('sub')}"


@router.get("/{pref_key}")
def get_pref(
    pref_key: str,
    token: Annotated[str | None, Depends(_oauth2)] = None,
    db: Session = Depends(get_db),
):
    who = _caller_key(db, token)
    row = db.query(UiPref).filter_by(profile_key=who, pref_key=pref_key).first()
    return {"value": json.loads(row.value) if row else None}


@router.put("/{pref_key}")
def put_pref(
    pref_key: str,
    body: dict = Body(...),
    token: Annotated[str | None, Depends(_oauth2)] = None,
    db: Session = Depends(get_db),
):
    who = _caller_key(db, token)
    row = db.query(UiPref).filter_by(profile_key=who, pref_key=pref_key).first()
    if row is None:
        row = UiPref(profile_key=who, pref_key=pref_key, value="null")
        db.add(row)
    row.value = json.dumps(body.get("value"), ensure_ascii=False)
    db.commit()
    return {"ok": True}
