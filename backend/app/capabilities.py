"""
Per-profile admin capabilities.

The platform has two independent permission axes:

  * **pages × roles** (``app/permissions.py``) — which PAGES a ROLE may open.
    Coarse, shared by everyone holding that role, edited on the admin Access
    tab.
  * **capabilities × profiles** (this module) — which admin-only ACTIONS ONE
    person may perform. Fine-grained, per individual, edited on the admin
    Permissions tab.

THE RULES, in one place:

1. **Additive, never subtractive.** Every hardcoded authority check keeps
   working exactly as before — admins do everything, shift-managers still
   approve edit-requests, the receiving supervisor still approves a transfer
   addressed to their unit. A capability only ever *widens* the set of people
   who may act, so nothing breaks on deploy and a grant is a deliberate
   exception rather than a migration.

2. **Keyed by profile, not by registration.** ``profile_key`` ("supervisor:42",
   see ``app/identity.py``) is the person; ``telegram_user_roles.id`` is just a
   login. Every holder of a granted profile wields the grant, it survives an
   unassign→re-claim, and switching to a *different* profile drops it.

3. **Read live.** Guards look grants up per request, so a grant — and, more
   importantly, a REVOKE — takes effect on the person's next page load with no
   re-login.

4. **Scope per grant.** ``own`` adds the action but keeps the profile's normal
   row scoping (supervisor → their unit, shift-manager → their shift). ``all``
   gives admin reach across every unit, shift and date. Guards ask
   :func:`scope_is_all` when deciding whether to lift row filters.

5. **No escalation.** Two things are deliberately absent from the catalog and
   can never be granted: this permission system itself (only a real admin opens
   the Permissions tab) and any authority over ADMIN profiles — a grantee with
   ``admin.users.manage`` / ``admin.profiles.manage`` cannot create, rename,
   delete or assign an admin identity, so they can never promote themselves.
   The page × role Access matrix is likewise not a capability.
"""
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.identity import parse_profile_key, profile_holders, viewer_profile_key
from app.models import CapabilityAudit, Manager, ProfileCapability, RoleProfile

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

# ── the catalog ───────────────────────────────────────────────────────────────
# One entry per coherent job, not per endpoint: "approve & reject" is one
# capability because a grant to approve without the power to reject is nonsense.

CAP_DOCUMENTS_APPROVE = "staff.documents.approve"
CAP_REQUESTS_APPROVE  = "staff.requests.approve"
CAP_ATTENDANCE_EDIT   = "staff.attendance.edit"
CAP_ATTENDANCE_DELETE = "staff.attendance.delete"
CAP_DAY_REOPEN        = "staff.day.reopen"
CAP_CLEANUP           = "admin.cleanup"
CAP_USERS_MANAGE      = "admin.users.manage"
CAP_PROFILES_MANAGE   = "admin.profiles.manage"
CAP_CELLS_MANAGE      = "admin.cells.manage"

# key   → the capability id, also the i18n key suffix (caps.<key>.label/.hint)
# group → UI grouping on the Permissions tab
# pages → page keys this capability unlocks (rule: a capability IMPLIES page
#         access, so a grant is never dead — see capability_pages)
# tab   → admin-panel tab this capability unlocks, if any
#
# scoped→ whether "own" vs "all" means anything for this capability. The
#         unit-scoped ones (requests, attendance, cleanup) honour it. The
#         identity ones do not: profiles, users and cells are factory-wide
#         registers with no unit dimension to narrow, so they are always stored
#         at "all" and the UI hides the selector rather than offering a choice
#         that does nothing. What DOES bound them is the escalation rule —
#         admin identities stay untouchable for anyone but a real admin.
CAPABILITIES = [
    {"key": CAP_DOCUMENTS_APPROVE, "group": "requests",   "pages": ["staff"],          "tab": None,        "scoped": True},
    {"key": CAP_REQUESTS_APPROVE,  "group": "requests",   "pages": ["staff"],          "tab": None,        "scoped": True},
    {"key": CAP_ATTENDANCE_EDIT,   "group": "attendance", "pages": ["staff"],          "tab": None,        "scoped": True},
    {"key": CAP_ATTENDANCE_DELETE, "group": "attendance", "pages": ["staff"],          "tab": None,        "scoped": True},
    {"key": CAP_DAY_REOPEN,        "group": "attendance", "pages": ["staff", "daily"], "tab": None,        "scoped": True},
    {"key": CAP_CLEANUP,           "group": "attendance", "pages": [],                 "tab": "cleanup",   "scoped": True},
    {"key": CAP_USERS_MANAGE,      "group": "identity",   "pages": [],                 "tab": "users",     "scoped": False},
    {"key": CAP_PROFILES_MANAGE,   "group": "identity",   "pages": [],                 "tab": "profiles",  "scoped": False},
    {"key": CAP_CELLS_MANAGE,      "group": "identity",   "pages": [],                 "tab": "cells",     "scoped": False},
]

# Capabilities whose stored scope is meaningless — normalised to "all" on save
# so the DB never implies a narrowing the guards don't perform.
UNSCOPED_CAPABILITIES = frozenset(c["key"] for c in CAPABILITIES if not c["scoped"])

CAPABILITY_KEYS = [c["key"] for c in CAPABILITIES]
CAPABILITY_GROUPS = ["requests", "attendance", "identity"]

SCOPES = ("own", "all")
DEFAULT_SCOPE = "own"

# Roles that may never be granted anything: admins already have everything, so
# a row for them would be a confusing no-op.
UNGRANTABLE_ROLES = ("admin",)


# ── reading grants ────────────────────────────────────────────────────────────

def caps_for_profile(db: Session, key: Optional[str]) -> dict[str, str]:
    """``{capability: scope}`` granted to one profile key. Unknown capability
    keys (catalog entries removed in code) are dropped rather than returned, so
    a stale row can never authorize anything."""
    if not key:
        return {}
    rows = db.query(ProfileCapability).filter(ProfileCapability.profile_key == key).all()
    return {
        r.capability: (r.scope if r.scope in SCOPES else DEFAULT_SCOPE)
        for r in rows if r.capability in CAPABILITY_KEYS
    }


def caller_caps(db: Session, payload: dict) -> dict[str, str]:
    """``{capability: scope}`` the JWT holder wields right now. Admins hold the
    whole catalog at ``all`` — they are the baseline these grants imitate."""
    if not payload:
        return {}
    if payload.get("role") == "admin":
        return {k: "all" for k in CAPABILITY_KEYS}
    return caps_for_profile(db, viewer_profile_key(db, payload))


def cap_scope(db: Session, payload: dict, capability: str) -> Optional[str]:
    """``"own"`` / ``"all"`` if the caller holds the capability, else None."""
    return caller_caps(db, payload).get(capability)


def has_cap(db: Session, payload: dict, capability: str) -> bool:
    """True if the caller may perform the action at all (either scope)."""
    return cap_scope(db, payload, capability) is not None


def scope_is_all(db: Session, payload: dict, capability: str) -> bool:
    """True if the caller's grant reaches EVERY unit/shift/date — the flag row
    scoping consults to decide whether to behave like admin. Real admins always
    pass, so guards can call this alone instead of ``role == "admin" or …``."""
    return cap_scope(db, payload, capability) == "all"


def capability_pages(db: Session, payload: dict) -> list[str]:
    """Page keys unlocked purely by the caller's capabilities.

    Rule 'a capability implies page access': granting
    ``staff.documents.approve`` opens /staff for that profile even when the
    role × page matrix says no, so a grant is never silently dead and opening
    the page for one person never opens it for every peer of their role."""
    held = caller_caps(db, payload)
    pages: list[str] = []
    for c in CAPABILITIES:
        if c["key"] in held:
            pages += [p for p in c["pages"] if p not in pages]
    return pages


def capability_tabs(db: Session, payload: dict) -> list[str]:
    """Admin-panel tab ids the caller may open. Admins get every tab from the
    normal admin check; this is what a NON-admin grantee sees instead."""
    held = caller_caps(db, payload)
    return [c["tab"] for c in CAPABILITIES if c["tab"] and c["key"] in held]


def profiles_with_cap(db: Session, capability: str) -> list[str]:
    """Profile keys holding a capability — the extra recipients a notification
    fans out to alongside the admins who already get it."""
    rows = db.query(ProfileCapability).filter(
        ProfileCapability.capability == capability,
    ).all()
    return sorted({r.profile_key for r in rows if r.profile_key})


def profile_unit_ids(db: Session, key: Optional[str]) -> Optional[list[int]]:
    """Unit (manager) ids a profile's OWN row scoping covers; None = no
    restriction.

    The one definition of "own scope", shared by the request guards (via the
    caller's active profile) and by notification fan-out (via a stored grant),
    so what a grantee is *told about* can never drift from what they may act on.
    Roles the staff scoping leaves unfiltered — admin, top-manager, leader —
    return None here for the same reason."""
    role, ref = parse_profile_key(key)
    if role == "supervisor":
        return [ref] if ref else []
    if role == "shift-manager":
        p = db.query(RoleProfile).filter_by(id=ref, role="shift-manager").first() if ref else None
        if not p or not p.shift:
            return []
        return [m.id for m in db.query(Manager).filter(
            Manager.shift == p.shift, Manager.archived.is_(False)).all()]
    return None


def cap_recipients(db: Session, capability: str, *manager_ids: Optional[int]) -> set[int]:
    """Telegram ids to notify about work a capability covers.

    Every holder of every profile granted ``capability`` whose scope reaches at
    least one of ``manager_ids`` — "all" always does, "own" only for its own
    units. A profile fans out to EVERY account holding it (they are all that one
    person), which is why this keys off profile_holders rather than a single id."""
    units_wanted = [m for m in manager_ids if m]
    out: set[int] = set()
    for key in profiles_with_cap(db, capability):
        if caps_for_profile(db, key).get(capability) != "all":
            units = profile_unit_ids(db, key)
            if units is not None and not any(m in units for m in units_wanted):
                continue
        out.update(profile_holders(db, key))
    return out


# ── writing grants ────────────────────────────────────────────────────────────

def set_caps_for_profile(db: Session, key: str, caps: dict[str, str],
                         actor_name: str | None = None,
                         actor_telegram_id: int | None = None) -> dict[str, str]:
    """Replace a profile's whole grant set with ``caps`` ({capability: scope}).

    Diffs against what was stored so the audit log records grants, revokes and
    scope changes individually rather than "someone saved the form"."""
    clean = {
        k: ("all" if k in UNSCOPED_CAPABILITIES else (v if v in SCOPES else DEFAULT_SCOPE))
        for k, v in (caps or {}).items() if k in CAPABILITY_KEYS
    }

    existing = {r.capability: r for r in db.query(ProfileCapability).filter(
        ProfileCapability.profile_key == key).all()}

    def _audit(capability: str, action: str, scope: str | None) -> None:
        db.add(CapabilityAudit(
            profile_key=key, capability=capability, action=action, scope=scope,
            actor_name=actor_name, actor_telegram_id=actor_telegram_id,
        ))

    for capability, scope in clean.items():
        row = existing.get(capability)
        if row is None:
            db.add(ProfileCapability(
                profile_key=key, capability=capability, scope=scope,
                granted_by=actor_name,
            ))
            _audit(capability, "granted", scope)
        elif row.scope != scope:
            row.scope = scope
            row.granted_by = actor_name
            _audit(capability, "rescoped", scope)

    for capability, row in existing.items():
        if capability not in clean:
            db.delete(row)
            _audit(capability, "revoked", None)

    db.commit()
    return clean


# ── FastAPI guards ────────────────────────────────────────────────────────────

def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def require_cap(*capabilities: str):
    """Dependency factory: admin OR any one of ``capabilities`` (OR semantics).

    Use on endpoints that were previously admin-only. Row scoping stays the
    endpoint's own business — this only answers "may this person act at all";
    ask :func:`scope_is_all` for "over which rows"."""
    wanted = list(capabilities)

    def _dep(
        token: Annotated[str, Depends(_oauth2)],
        db: Session = Depends(get_db),
    ):
        payload = _decode(token)
        if payload.get("role") == "admin":
            return payload
        held = caller_caps(db, payload)
        if not any(c in held for c in wanted):
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload

    return _dep
