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
PAGE_KEYS = ["overview", "zagruzka", "leaderboard", "workers", "plan", "downtime", "staff", "daily", "production", "trudoyomkost", "leaders", "cells", "kaizen", "quality", "concerns", "worker-concerns", "tasks", "activity", "setup", "idle-cell", "zagruzka-cell", "arc"]

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
    # Pilot: admin-only by default. Above supervisors pick a configured brigadir
    # from the dashboard picker (shift-managers within their shift, top-managers
    # across all); flip those roles on here to let them in. "supervisor" grants
    # every brigadir their own pinned dashboard (per-user gating is a later phase).
    "production": [],
    # Cross-brigadir trudoyomkost analysis (by weekday + trend + Excel). Aimed at
    # the analyst roles; supervisors can be toggled on from the Access tab.
    "trudoyomkost": ["top-manager", "shift-manager"],
    # Leader checklist monitoring (parsed from the leaders Google Sheet). Pilot:
    # admin-only by default; open up roles from the Access tab.
    "leaders": [],
    # Cell registry (verifix/SAP codes, workshop names, supervisor & leader
    # assignment). Admin-only by default; hand out per-person view/edit on the
    # Permissions tab (page.view.cells / admin.cells.manage) or open a role
    # here on the Access tab.
    "cells": [],
    # Kaizen-session project analytics (synced from Notion). Admin-only by
    # default; open up roles from the Access tab.
    "kaizen": [],
    # Quality register (complaints & non-conformances, synced from the QA
    # sheet). A management view of the whole factory: admins plus the two
    # manager tiers; supervisors/leaders can be toggled on from the Access tab.
    "quality": ["top-manager", "shift-manager"],
    # Leader concerns ("Xavotirlar") log. Role-scoped: leaders manage their own
    # rows, supervisors their unit's leaders, shift-managers their shift's
    # units, admins everything; top-managers get a read-only view of all.
    "concerns": ["top-manager", "shift-manager", "supervisor", "leader"],
    # Worker-concerns KPI («Ishchi havotirlari») — the concerns workers file to
    # their cell leader, synced from the per-cell Google sheets. Role-scoped
    # server-side: supervisors see their own unit's leaders, leaders their own
    # numbers only, admins everything. Manager tiers can be toggled on here.
    "worker-concerns": ["supervisor", "leader"],
    # Leader tasks ("DAILY протокол") board. Supervisors assign tasks to their
    # leaders; leaders work their own queue; admins see everything.
    "tasks": ["supervisor", "leader"],
    # Users-activity & usage statistics (who's active, time-in-app, contribution
    # calendar). Admin-only by default; open up roles from the Access tab.
    "activity": [],
    # Setup-times register (среднее время переналадки по ячейкам). Admin-only
    # by default; open up roles from the Access tab.
    "setup": [],
    # Manual per-cell idle-time (ojidaniya) TEST entry — admin-only by default;
    # open to leaders/supervisors from the Access tab (or per-person via
    # page.view.idle-cell on the Permissions tab). Does NOT replace the sheet import.
    "idle-cell": [],
    # Per-cell загрузка TEST twin of /zagruzka, hard-locked to one supervisor's
    # cells. Admin-only by default and meant to stay that way while the per-cell
    # method is being validated — it reads pp_* / cell_* tables only and feeds
    # nothing downstream.
    "zagruzka-cell": [],
    # ARC service-ticket register (mirrored from the ARC API by
    # services/arc_sync.py). Admin-only by default; open up roles from the
    # Access tab or per person via page.view.arc.
    "arc": [],
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


def role_can_access(role: str | None, pages: list[str], access: dict,
                    cap_pages: list[str] | None = None,
                    denied_pages: list[str] | None = None) -> bool:
    """True if the role may access at least one of the given pages. Admin is
    always allowed.

    ``cap_pages`` are pages unlocked by the caller's *personal* capability
    grants (``app/capabilities.capability_pages``). A capability implies page
    access, so a grant is never dead — and unlike ticking the page in the
    role × page matrix, it opens the page for that ONE profile instead of for
    every peer holding the same role. Callers that have no payload at hand may
    omit it and keep the pure role check.

    ``denied_pages`` are the pages this ONE person is blocked from
    (``app/capabilities.caller_denied_pages``) — the single subtractive entry in
    the system, used to close a page the role opens for everyone else. A denied
    page is dropped before either check, so neither the role matrix nor a
    capability can re-open it; the way back in is an account-level grant, which
    ``caller_denied_pages`` has already removed from this list. Shared endpoints
    pass several pages and keep OR semantics: denying one of them still leaves
    the endpoint reachable through another the caller holds."""
    if role == "admin":
        return True
    live = [p for p in pages if p not in (denied_pages or ())]
    if not live:
        return False
    if any(role in access.get(p, []) for p in live):
        return True
    return any(p in (cap_pages or []) for p in live)


def page_allowed(db: Session, payload: dict, *pages: str) -> bool:
    """`require_page` as a QUESTION rather than a gate.

    For endpoints with two legitimate doors — the page, or a narrower per-row
    claim — where the page check can no longer be the dependency because it
    would slam the second door shut. Runs the identical decision `require_page`
    makes, so "does this person hold the page" cannot come to mean two things.
    """
    from app.capabilities import capability_pages, caller_denied_pages
    return role_can_access(payload.get("role"), list(pages), get_page_access(db),
                           capability_pages(db, payload),
                           caller_denied_pages(db, payload))


def require_page(*pages: str):
    """FastAPI dependency factory. Allows the request if the caller's role can
    access at least one of ``pages`` (admin always passes), or if a personal
    capability grant unlocks one of them — unless that page is denied for this
    person specifically. Shared endpoints pass several page keys (OR
    semantics)."""
    page_list = list(pages)

    def _dep(
        token: Annotated[str, Depends(_oauth2)],
        db: Session = Depends(get_db),
    ):
        try:
            payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

        # Imported lazily: capabilities.py imports identity/models only, but
        # keeping the import local documents that page access is the older,
        # standalone axis and never depends on a grant existing.
        from app.capabilities import capability_pages, caller_denied_pages

        if not role_can_access(payload.get("role"), page_list, get_page_access(db),
                               capability_pages(db, payload),
                               caller_denied_pages(db, payload)):
            raise HTTPException(status_code=403, detail="You don't have access to this page")
        return payload

    return _dep
