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

# Meta key stored inside the page_access blob: the TOGGLEABLE_ROLES the matrix
# was last saved with. Lets get_page_access tell "role added to the code after
# the last save" (keep code defaults) apart from "admin deliberately unchecked
# the role everywhere" (respect the stored empty state).
_ROLES_KEY = "_roles"

# Roles an admin may toggle per page. "admin" is intentionally excluded — it is
# always granted full access and can never be locked out. "guest" ships with
# zero default pages: a fresh guest sees the no-access screen until an admin
# grants pages here.
TOGGLEABLE_ROLES = ["top-manager", "shift-manager", "supervisor", "leader", "guest"]

# The pages an admin can control. Order matters: it drives the "first accessible
# page" fallback on the frontend.
PAGE_KEYS = ["overview", "zagruzka", "leaderboard", "workers", "plan", "downtime", "staff", "daily", "production", "trudoyomkost", "leaders", "kaizen", "concerns", "tasks", "activity"]

# Default access — mirrors the original hardcoded frontend guards.
# "leaderboard" defaults to no toggleable roles, i.e. admin-only.
DEFAULT_PAGE_ACCESS = {
    "overview": ["shift-manager"],
    "zagruzka": ["top-manager", "shift-manager", "supervisor", "leader"],
    "leaderboard": [],
    "workers":  ["shift-manager"],
    "plan":     ["shift-manager"],
    "downtime": ["shift-manager"],
    "staff":    ["shift-manager", "supervisor"],
    "daily":    ["shift-manager", "supervisor"],
    # Pilot: admin-only by default. Admin previews the brigadir's exact dashboard
    # (manager 5). Flip on "supervisor" from the Access tab to let brigadirs in —
    # note that enables it for ALL supervisors (per-user gating is a later phase).
    "production": [],
    # Cross-brigadir trudoyomkost analysis (by weekday + trend + Excel). Aimed at
    # the analyst roles; supervisors can be toggled on from the Access tab.
    "trudoyomkost": ["top-manager", "shift-manager"],
    # Leader checklist monitoring (parsed from the leaders Google Sheet). Pilot:
    # admin-only by default; open up roles from the Access tab.
    "leaders": [],
    # Kaizen-session project analytics (synced from Notion). Admin-only by
    # default; open up roles from the Access tab.
    "kaizen": [],
    # Leader concerns ("Xavotirlar") log. Role-scoped: leaders manage their own
    # rows, supervisors their unit's leaders, shift-managers their shift's
    # units, admins everything; top-managers get a read-only view of all.
    "concerns": ["top-manager", "shift-manager", "supervisor", "leader"],
    # Leader tasks ("DAILY протокол") board. Supervisors assign tasks to their
    # leaders; leaders work their own queue; admins see everything.
    "tasks": ["supervisor", "leader"],
    # Users-activity & usage statistics (who's active, time-in-app, contribution
    # calendar). Admin-only by default; open up roles from the Access tab.
    "activity": [],
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
    if not isinstance(stored, dict):
        stored = {}

    # A role introduced in the code after the matrix was last saved appears
    # nowhere in the stored blob; letting the stored per-page lists shadow its
    # defaults would leave the role with zero pages (a dead-end no-access
    # screen). Such roles keep their code defaults until the next Access-tab
    # save makes every checkbox explicit. Legacy blobs predate _ROLES_KEY, so
    # fall back to "mentioned anywhere in the matrix" as the known-role set.
    known = stored.get(_ROLES_KEY)
    if not isinstance(known, list):
        known = {r for v in stored.values() if isinstance(v, list) for r in v}
    new_roles = [r for r in TOGGLEABLE_ROLES if r not in known]

    result = {}
    for page in PAGE_KEYS:
        roles = stored.get(page, DEFAULT_PAGE_ACCESS.get(page, []))
        if not isinstance(roles, list):
            roles = DEFAULT_PAGE_ACCESS.get(page, [])
        roles = [r for r in roles if r in TOGGLEABLE_ROLES]
        roles += [r for r in new_roles
                  if r in DEFAULT_PAGE_ACCESS.get(page, []) and r not in roles]
        result[page] = roles
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
    # Stamp the roles this save knew about so a later read can distinguish a
    # deliberately empty role column from a role that didn't exist yet.
    value = json.dumps({**clean, _ROLES_KEY: TOGGLEABLE_ROLES})
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
