"""
Per-profile admin capabilities.

The platform has two independent permission axes:

  * **pages × roles** (``app/permissions.py``) — which PAGES a ROLE may open.
    Coarse, shared by everyone holding that role, edited on the admin Access
    tab.
  * **capabilities × profiles** (this module) — which admin-only ACTIONS ONE
    person may perform, and which PAGES ONE person may open and how much of
    each page's data they see. Fine-grained, per individual, edited on the
    admin Permissions tab.

THE RULES, in one place:

1. **Additive, never subtractive.** Every hardcoded authority check keeps
   working exactly as before — admins do everything, shift-managers still
   approve edit-requests, the receiving supervisor still approves a transfer
   addressed to their unit. A capability only ever *widens* the set of people
   who may act, so nothing breaks on deploy and a grant is a deliberate
   exception rather than a migration.

2. **Keyed by the Telegram ACCOUNT.** A grant belongs to one ``telegram_id``
   (the JWT ``sub``), so two accounts holding the same profile can differ — one
   supervisor login can be made the transfer handler without the other getting
   it. This is the deliberate exception to "a profile is the person"
   (``app/identity.py``): identity, data ownership and notifications still key
   off the profile, but the power to ACT is handed out per login. ``scope``
   "own" is still resolved from the profile the account is acting as, so the
   rows a grant reaches never drift from what the account could already see.

3. **Read live.** Guards look grants up per request, so a grant — and, more
   importantly, a REVOKE — takes effect on the person's next page load with no
   re-login.

4. **Scope per grant.** ``own`` adds the action but keeps the profile's normal
   row scoping (supervisor → their unit, shift-manager → their shift). ``all``
   gives admin reach across every unit, shift and date. Guards ask
   :func:`scope_is_all` when deciding whether to lift row filters — or
   :func:`page_scope_is_all` for the page-view family below.

4b. **Page-view grants** (``page.view.<page>``). One entry per page in
   ``permissions.PAGE_KEYS``, generated rather than hand-listed so a new page
   is grantable the day it ships. They are what the role × page matrix cannot
   express: they open a page for ONE person instead of every peer of their
   role, and they carry the same ``own``/``all`` scope as any other capability
   — ``own`` opens the page with the viewer's normal row scoping intact (a
   supervisor still sees only their unit), ``all`` lifts it so the page reads
   factory-wide. Only :data:`SCOPED_PAGES` narrow by viewer at all; the rest
   are already factory-wide for anyone who can open them and are stored at
   ``all``.

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
from app.identity import parse_profile_key, role_row_profile_key
from app.models import CapabilityAudit, Manager, RoleProfile, TelegramUserRole, UserCapability
from app.permissions import PAGE_KEYS

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

# Page-view grants: one per page key, ids built from the page so the catalog
# never drifts from permissions.PAGE_KEYS.
CAP_PAGE_PREFIX = "page.view."


def page_cap(page: str) -> str:
    """``page.view.<page>`` — the capability id granting sight of one page."""
    return f"{CAP_PAGE_PREFIX}{page}"


# The pages whose data actually narrows to the viewer — the only ones where
# "own" and "all" mean different things. Every other page is already
# factory-wide for whoever may open it, so its grant is stored at "all" and the
# Permissions tab shows a static chip instead of a selector that does nothing.
SCOPED_PAGES = ("staff", "daily", "production", "concerns", "tasks", "leaders", "quality")

# key   → the capability id, also the i18n key suffix (caps.<key>.label/.hint)
# group → UI grouping on the Permissions tab
# pages → page keys this capability unlocks (rule: a capability IMPLIES page
#         access, so a grant is never dead — see capability_pages)
# tab   → admin-panel tab this capability unlocks, if any
# page  → set only on the page-view family; the Permissions tab labels those
#         from the page's own nav label instead of a caps.<key>.label string,
#         so adding a page needs no new translation keys.
#
# scoped→ whether "own" vs "all" means anything for this capability. The
#         unit-scoped ones (requests, attendance, cleanup) honour it. The
#         identity ones do not: profiles, users and cells are factory-wide
#         registers with no unit dimension to narrow, so they are always stored
#         at "all" and the UI hides the selector rather than offering a choice
#         that does nothing. What DOES bound them is the escalation rule —
#         admin identities stay untouchable for anyone but a real admin.
CAPABILITIES = [
    {"key": CAP_DOCUMENTS_APPROVE, "group": "requests",   "pages": ["staff"],          "tab": None,        "scoped": True,  "page": None},
    {"key": CAP_REQUESTS_APPROVE,  "group": "requests",   "pages": ["staff"],          "tab": None,        "scoped": True,  "page": None},
    {"key": CAP_ATTENDANCE_EDIT,   "group": "attendance", "pages": ["staff"],          "tab": None,        "scoped": True,  "page": None},
    {"key": CAP_ATTENDANCE_DELETE, "group": "attendance", "pages": ["staff"],          "tab": None,        "scoped": True,  "page": None},
    {"key": CAP_DAY_REOPEN,        "group": "attendance", "pages": ["staff", "daily"], "tab": None,        "scoped": True,  "page": None},
    {"key": CAP_CLEANUP,           "group": "attendance", "pages": [],                 "tab": "cleanup",   "scoped": True,  "page": None},
    {"key": CAP_USERS_MANAGE,      "group": "identity",   "pages": [],                 "tab": "users",     "scoped": False, "page": None},
    {"key": CAP_PROFILES_MANAGE,   "group": "identity",   "pages": [],                 "tab": "profiles",  "scoped": False, "page": None},
    {"key": CAP_CELLS_MANAGE,      "group": "identity",   "pages": [],                 "tab": "cells",     "scoped": False, "page": None},
] + [
    # Generated, in PAGE_KEYS order — the same order the nav and the "first
    # accessible page" fallback use, so the Permissions tab reads like the menu.
    {"key": page_cap(p), "group": "pages", "pages": [p], "tab": None,
     "scoped": p in SCOPED_PAGES, "page": p}
    for p in PAGE_KEYS
]

# Capabilities whose stored scope is meaningless — normalised to "all" on save
# so the DB never implies a narrowing the guards don't perform.
UNSCOPED_CAPABILITIES = frozenset(c["key"] for c in CAPABILITIES if not c["scoped"])

CAPABILITY_KEYS = [c["key"] for c in CAPABILITIES]
# Pages first: opening a page is the coarse decision an admin makes before
# handing out the actions inside it.
CAPABILITY_GROUPS = ["pages", "requests", "attendance", "identity"]

SCOPES = ("own", "all")
DEFAULT_SCOPE = "own"

# Roles that may never be granted anything: admins already have everything, so
# a row for them would be a confusing no-op.
UNGRANTABLE_ROLES = ("admin",)


# ── reading grants ────────────────────────────────────────────────────────────

def caps_for_user(db: Session, telegram_id: Optional[int]) -> dict[str, str]:
    """``{capability: scope}`` granted to one Telegram account. Unknown
    capability keys (catalog entries removed in code) are dropped rather than
    returned, so a stale row can never authorize anything."""
    if not telegram_id:
        return {}
    rows = db.query(UserCapability).filter(UserCapability.telegram_id == telegram_id).all()
    return {
        r.capability: (r.scope if r.scope in SCOPES else DEFAULT_SCOPE)
        for r in rows if r.capability in CAPABILITY_KEYS
    }


def caller_caps(db: Session, payload: dict) -> dict[str, str]:
    """``{capability: scope}`` the JWT holder wields right now. Admins hold the
    whole catalog at ``all`` — they are the baseline these grants imitate.

    Read off the ACCOUNT (``sub`` = telegram id), not the active profile: a
    grant follows the login it was handed to, so switching profiles keeps it."""
    if not payload:
        return {}
    if payload.get("role") == "admin":
        return {k: "all" for k in CAPABILITY_KEYS}
    try:
        telegram_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return {}
    return caps_for_user(db, telegram_id)


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


def page_view_scope(db: Session, payload: dict, page: str) -> Optional[str]:
    """``"own"`` / ``"all"`` if the caller holds a page-view grant for ``page``,
    else None (their role × page access, if any, is untouched)."""
    return cap_scope(db, payload, page_cap(page))


def page_scope_is_all(db: Session, payload: dict, page: str) -> bool:
    """True when this person's sight of ``page`` reaches every unit and shift.

    The one question a scoped read endpoint asks before it applies its usual
    viewer filters: a supervisor granted ``page.view.leaders`` at "all" reads
    the whole factory's checklist, at "own" only their own unit's — the rows
    they could already see, just on a page their role wasn't given.

    Real admins always pass (``caller_caps`` hands them the whole catalog at
    "all"), so a call site can use this alone instead of ``role == "admin"
    or …``."""
    return page_view_scope(db, payload, page) == "all"


def page_scopes(db: Session, payload: dict) -> dict[str, str]:
    """``{page: "own" | "all"}`` for every page-view grant the caller holds —
    what the UI reads to decide whether to keep a supervisor pinned to their
    own unit or offer them the whole factory's picker."""
    held = caller_caps(db, payload)
    return {c["page"]: held[c["key"]]
            for c in CAPABILITIES if c["page"] and c["key"] in held}


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


def users_with_cap(db: Session, capability: str) -> list[int]:
    """Telegram ids holding a capability — the extra recipients a notification
    fans out to alongside the admins who already get it."""
    rows = db.query(UserCapability).filter(
        UserCapability.capability == capability,
    ).all()
    return sorted({r.telegram_id for r in rows if r.telegram_id})


def account_unit_ids(db: Session, telegram_id: int) -> Optional[list[int]]:
    """Unit ids an account's OWN scope covers, unioned over every profile it
    holds; None when ANY of them is already unrestricted (admin/top-manager/
    leader), matching :func:`profile_unit_ids`' None convention.

    Used only by notification fan-out: a per-account "own" grant reaches the
    units of whatever the account can act as, so a co-held profile never hides a
    unit the grantee should have been told about."""
    keys: set[str] = set()
    for r in db.query(TelegramUserRole).filter(
        TelegramUserRole.telegram_id == telegram_id,
        TelegramUserRole.status == "approved",
    ).all():
        key = r.profile_key or role_row_profile_key(db, r, heal=False)
        if key:
            keys.add(key)
    units: set[int] = set()
    for key in keys:
        u = profile_unit_ids(db, key)
        if u is None:
            return None
        units.update(u)
    return sorted(units)


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

def apply_caps(db: Session, profile_keys: list[str],
               grants: dict[str, str] | None = None,
               revokes: list[str] | None = None,
               actor_name: str | None = None,
               actor_telegram_id: int | None = None) -> dict[str, dict[str, str]]:
    """Apply a DIFF — grant/rescope ``grants``, revoke ``revokes`` — to every
    listed profile, leaving their other capabilities untouched.

    Deliberately a diff and not a whole-set replace: the Permissions tab can
    select several profiles at once, and those profiles rarely hold the same
    grants. Replacing would silently wipe whatever the admin wasn't looking at.
    With a diff, ticking one box for five people means exactly that.

    Returns the resulting {profile_key: {capability: scope}}. The audit log
    records each capability separately, so history reads as individual grants
    rather than "someone saved the form"."""
    clean = {
        k: ("all" if k in UNSCOPED_CAPABILITIES else (v if v in SCOPES else DEFAULT_SCOPE))
        for k, v in (grants or {}).items() if k in CAPABILITY_KEYS
    }
    # A capability can't be granted and revoked in one call; the grant wins so
    # a malformed payload can never leave the profile half-changed.
    drop = [k for k in (revokes or []) if k in CAPABILITY_KEYS and k not in clean]

    def _audit(key: str, capability: str, action: str, scope: str | None) -> None:
        db.add(CapabilityAudit(
            profile_key=key, capability=capability, action=action, scope=scope,
            actor_name=actor_name, actor_telegram_id=actor_telegram_id,
        ))

    for key in profile_keys:
        existing = {r.capability: r for r in db.query(ProfileCapability).filter(
            ProfileCapability.profile_key == key).all()}

        for capability, scope in clean.items():
            row = existing.get(capability)
            if row is None:
                db.add(ProfileCapability(
                    profile_key=key, capability=capability, scope=scope,
                    granted_by=actor_name,
                ))
                _audit(key, capability, "granted", scope)
            elif row.scope != scope:
                row.scope = scope
                row.granted_by = actor_name
                _audit(key, capability, "rescoped", scope)

        for capability in drop:
            row = existing.get(capability)
            if row is not None:
                db.delete(row)
                _audit(key, capability, "revoked", None)

    db.commit()
    return {key: caps_for_profile(db, key) for key in profile_keys}


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
