"""
Page-level access control.

Admin can decide, per page, which of the toggleable roles (top-manager,
shift-manager, supervisor) may access it. The admin role always has full
access and is never stored in the matrix.

The matrix is persisted as a single JSON blob in app_settings under the
``page_access`` key. Defaults below mirror the original hardcoded behavior so
nothing changes for any role until an admin edits the matrix.
"""
import json
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import AppSetting

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

SETTING_KEY = "page_access"

# Roles an admin may toggle per page. "admin" is intentionally excluded — it is
# always granted full access and can never be locked out.
TOGGLEABLE_ROLES = ["top-manager", "shift-manager", "supervisor"]

# The pages an admin can control. Order matters: it drives the "first accessible
# page" fallback on the frontend.
PAGE_KEYS = ["overview", "zagruzka", "leaderboard", "workers", "plan", "downtime", "staff", "daily", "production"]

# Default access — mirrors the original hardcoded frontend guards.
# "leaderboard" defaults to no toggleable roles, i.e. admin-only.
DEFAULT_PAGE_ACCESS = {
    "overview": ["shift-manager"],
    "zagruzka": ["top-manager", "shift-manager", "supervisor"],
    "leaderboard": [],
    "workers":  ["shift-manager"],
    "plan":     ["shift-manager"],
    "downtime": ["shift-manager"],
    "staff":    ["shift-manager", "supervisor"],
    "daily":    ["shift-manager", "supervisor"],
}


def get_page_access(db: Session) -> dict:
    """Return the full {page_key: [roles]} matrix, merging stored overrides on
    top of the defaults and dropping any unknown pages/roles."""
    row = db.query(AppSetting).filter(AppSetting.key == SETTING_KEY).first()
    stored = {}
    if row:
        try:
            stored = json.loads(row.value)
        except (ValueError, TypeError):
            stored = {}

    result = {}
    for page in PAGE_KEYS:
        roles = stored.get(page, DEFAULT_PAGE_ACCESS.get(page, []))
        if not isinstance(roles, list):
            roles = DEFAULT_PAGE_ACCESS.get(page, [])
        result[page] = [r for r in roles if r in TOGGLEABLE_ROLES]
    return result


def set_page_access(db: Session, matrix: dict) -> dict:
    """Validate and persist a new matrix; returns the normalized result."""
    clean = {}
    for page in PAGE_KEYS:
        roles = matrix.get(page, [])
        if not isinstance(roles, list):
            roles = []
        clean[page] = [r for r in roles if r in TOGGLEABLE_ROLES]

    row = db.query(AppSetting).filter(AppSetting.key == SETTING_KEY).first()
    value = json.dumps(clean)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SETTING_KEY, value=value))
    db.commit()
    return clean


def role_can_access(role: str | None, pages: list[str], access: dict) -> bool:
    """True if the role may access at least one of the given pages. Admin is
    always allowed."""
    if role == "admin":
        return True
    return any(role in access.get(p, []) for p in pages)


def require_page(*pages: str):
    """FastAPI dependency factory. Allows the request if the caller's role can
    access at least one of ``pages`` (admin always passes). Shared endpoints
    pass several page keys (OR semantics)."""
    page_list = list(pages)

    def _dep(
        token: Annotated[str, Depends(_oauth2)],
        db: Session = Depends(get_db),
    ):
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        if not role_can_access(payload.get("role"), page_list, get_page_access(db)):
            raise HTTPException(status_code=403, detail="You don't have access to this page")
        return payload

    return _dep
