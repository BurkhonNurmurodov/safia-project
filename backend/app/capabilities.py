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

1. **Additive for ACTIONS; pages may also be subtracted.** Every hardcoded
   authority check keeps working exactly as before — admins do everything,
   shift-managers still approve edit-requests, the receiving supervisor still
   approves a transfer addressed to their unit. An action capability only ever
   *widens* the set of people who may act, so nothing breaks on deploy and a
   grant is a deliberate exception rather than a migration.

   PAGE access is the one place a subtraction exists: a ``page.view.*`` entry
   may carry ``mode="deny"``, which CLOSES a page the person's role opens on
   the Access matrix. It is deliberately confined to the page family, because a
   page is gated in exactly two places (``require_page`` here, ``canAccessPage``
   on the client) while a role-native action is gated by hardcoded checks
   scattered across every router — a deny list those checks never consult would
   be a lie. To take an ACTION away, revoke the grant or change the profile's
   role.

2. **TWO targets, both read live: the POSITION and the LOGIN.** An entry is
   written either to a ``profile_key`` (:class:`~app.models.ProfilePermission`
   — the position: "brigadir of unit 12") or to one ``telegram_id``
   (:class:`~app.models.UserCapability` — the individual login). The admin
   Permissions tab picks which with a switch above the tree; everything below
   resolves both together in :func:`caller_caps`.

   **A profile entry belongs to the JOB, not to the person doing it.** Every
   account holding the profile wields it the moment it is saved, and an account
   that switches to another profile leaves it behind — nothing is ever copied
   onto a login, so there is nothing to carry away. That is what makes it the
   right target for "whoever runs this unit approves its documents": it survives
   the person changing, it equips a position nobody has claimed yet (profiles
   exist before their people register), and it cannot follow someone into a
   role that was never meant to have it.

   **An account entry is the exception on top**: it belongs to one login, so two
   people holding the same profile can differ — one supervisor login made the
   factory's transfer handler without their co-holder getting it. This is the
   deliberate exception to "a profile is the person" (``app/identity.py``).

   ``scope`` "own" resolves from the profile the account is ACTING AS in both
   cases, so the rows an entry reaches never drift from what the holder could
   already see.

   Resolution is most-specific-last (:func:`caller_caps`): start from the active
   profile's grants, overlay the account's own. For pages the same order runs in
   reverse for the subtractive half (:func:`caller_denied_pages`): an account
   entry decides if it has one, else a profile deny closes the page, else the
   role × page matrix. An account-level grant is therefore the escape hatch from
   a profile deny for exactly one login.

   Deny is PERMANENT on both targets and never consumed — "this position does
   not see /staff" has to stay true when the person filling it changes.

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
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.identity import parse_profile_key, role_row_profile_key, viewer_profile_key
from app.models import (
    CapabilityAudit, Manager, ProfilePermission, RoleProfile, TelegramUserRole,
    UserCapability,
)
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
CAP_CELL_HOURS_MANAGE = "admin.cell_hours.manage"
CAP_FACTORIES_MANAGE  = "admin.factories.manage"

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
SCOPED_PAGES = ("staff", "daily", "production", "concerns", "worker-concerns", "tasks", "leaders", "quality", "setup", "idle-cell")

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
    {"key": CAP_CELLS_MANAGE,      "group": "identity",   "pages": ["cells"],          "tab": None,        "scoped": False, "page": None},
    # The cells' working start/end clock («Smena vaqtlari») — a plant-wide
    # register with no unit dimension, so unscoped like the cells grant beside
    # it. Nothing consumes these hours yet; the grant opens the tab that sets
    # them and its per-shift defaults.
    {"key": CAP_CELL_HOURS_MANAGE, "group": "identity",   "pages": [],                 "tab": "shifttimes", "scoped": False, "page": None},
    # Factories are a plant-wide register with no unit dimension of their own —
    # unscoped for the same reason profiles and cells are. The grant carries
    # real weight: reassigning a supervisor's factory moves that unit's numbers
    # between tabs on all six factory-aware pages at once.
    {"key": CAP_FACTORIES_MANAGE,  "group": "identity",   "pages": [],                 "tab": "factories", "scoped": False, "page": None},
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

# An entry's direction. "grant" is every row the system wrote before denies
# existed and stays the default, so an un-migrated row can never read as a
# block. "deny" closes a page — see rule 1: only the page family may carry it.
MODE_GRANT = "grant"
MODE_DENY = "deny"
MODES = (MODE_GRANT, MODE_DENY)

# The capabilities a deny is accepted for. Confining it to the page family is
# what keeps every hardcoded action check honest: those never consult a deny
# list, so a denied ACTION would silently keep working.
DENIABLE_KEYS = frozenset(c["key"] for c in CAPABILITIES if c["page"])

# Roles that may never be granted anything: admins already have everything, so
# a row for them would be a confusing no-op.
UNGRANTABLE_ROLES = ("admin",)


# ── reading grants ────────────────────────────────────────────────────────────

# "argument not supplied", distinct from an explicit None (= no active profile,
# which is a real answer meaning "this session resolves to no position").
_UNSET = object()


def caps_for_user(db: Session, telegram_id: Optional[int]) -> dict[str, str]:
    """``{capability: scope}`` GRANTED to one Telegram account. Unknown
    capability keys (catalog entries removed in code) are dropped rather than
    returned, so a stale row can never authorize anything.

    Deny rows live in the same table and are excluded here — this is the
    positive set every guard asks about, and a block that read back as a grant
    would invert the meaning of every call site at once. Ask
    :func:`denied_pages_for_user` for the other direction."""
    if not telegram_id:
        return {}
    rows = db.query(UserCapability).filter(UserCapability.telegram_id == telegram_id).all()
    return {
        r.capability: (r.scope if r.scope in SCOPES else DEFAULT_SCOPE)
        for r in rows if r.capability in CAPABILITY_KEYS and r.mode != MODE_DENY
    }


def caps_for_profile(db: Session, key: Optional[str]) -> dict[str, str]:
    """``{capability: scope}`` GRANTED to a PROFILE — the twin of
    :func:`caps_for_user` one level down, read live for whoever is acting as
    that profile right now.

    A grant written here belongs to the POSITION: every account holding it
    wields it immediately, and an account that switches to another profile
    leaves it behind, because nothing was ever copied onto the login. Deny rows
    are excluded for the same reason they are in :func:`caps_for_user` — this is
    the positive set, and a block reading back as a grant would invert every
    call site at once."""
    if not key:
        return {}
    rows = db.query(ProfilePermission).filter(ProfilePermission.profile_key == key).all()
    return {
        r.capability: (r.scope if r.scope in SCOPES else DEFAULT_SCOPE)
        for r in rows if r.capability in CAPABILITY_KEYS and r.mode != MODE_DENY
    }


def _profile_perm_modes(db: Session) -> set[str]:
    """Which KINDS of profile-level entry exist at all, in one indexed sweep.

    Both halves of the profile layer sit on the request hot path — every
    ``require_page`` asks for grants and for denies — and answering either means
    resolving the caller's active profile, which costs real joins. An
    installation using neither half (or only one) buys its way out of that work
    with this one probe, so adding the layer costs nothing where it is unused."""
    return {m for (m,) in db.query(ProfilePermission.mode).distinct().all()}


def denied_pages_for_user(db: Session, telegram_id: Optional[int]) -> set[str]:
    """Page keys this ACCOUNT is explicitly blocked from, whatever its role
    says. The account level is the most specific one, so these survive every
    profile-level entry underneath."""
    if not telegram_id:
        return set()
    rows = db.query(UserCapability).filter(
        UserCapability.telegram_id == telegram_id,
        UserCapability.mode == MODE_DENY,
    ).all()
    return {c["page"] for c in CAPABILITIES if c["page"]
            and c["key"] in {r.capability for r in rows}}


def denied_pages_for_profile(db: Session, key: Optional[str]) -> set[str]:
    """Page keys blocked for EVERY holder of a profile — the subtractive half of
    :class:`~app.models.ProfilePermission`, read live on every request and never
    consumed, so it keeps applying to whoever fills the position next."""
    if not key:
        return set()
    rows = db.query(ProfilePermission).filter(
        ProfilePermission.profile_key == key,
        ProfilePermission.mode == MODE_DENY,
    ).all()
    return {c["page"] for c in CAPABILITIES if c["page"]
            and c["key"] in {r.capability for r in rows}}


def caller_denied_pages(db: Session, payload: dict) -> list[str]:
    """Pages closed for the caller right now, most-specific-first.

    An account-level entry always wins: a deny on the login blocks the page, and
    a GRANT on the login re-opens a page the profile denies — that is the escape
    hatch for one person in a position that is otherwise blocked. Admins are
    never denied; they are the baseline the whole system imitates and locking
    one out of a page would leave nobody able to lift it."""
    if not payload or payload.get("role") == "admin":
        return []
    try:
        telegram_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return []

    denied = denied_pages_for_user(db, telegram_id)

    modes = _profile_perm_modes(db)
    if MODE_DENY not in modes:
        return sorted(denied)

    # Resolved once and handed to caller_caps below: this runs on EVERY request
    # through require_page and both halves of the profile layer need the same
    # answer, so a session must not pay for the joins twice.
    key = viewer_profile_key(db, payload)
    profile_denied = denied_pages_for_profile(db, key)
    if profile_denied:
        # Only the pages the caller holds no GRANT for. A profile cannot hold a
        # grant and a deny for the same capability (one row, unique key), so in
        # practice this subtracts the account-level escape hatch.
        held = caller_caps(db, payload, key)
        granted = {c["page"] for c in CAPABILITIES if c["page"] and c["key"] in held}
        denied = denied | (profile_denied - granted)
    return sorted(denied)


def caller_caps(db: Session, payload: dict,
                profile_key: object = _UNSET) -> dict[str, str]:
    """``{capability: scope}`` the JWT holder wields right now — BOTH axes,
    most specific last. Admins hold the whole catalog at ``all``; they are the
    baseline these grants imitate.

    The PROFILE the token is acting as supplies the position's own grants, then
    the ACCOUNT (``sub`` = telegram id) overlays anything handed to that one
    login — so where both carry the same capability the account's scope is the
    one that stands. Switching profiles therefore changes what a person may do:
    a position's powers stay with the position, exactly as its rows do, and a
    grant handed to a login follows that login wherever it goes.

    ``profile_key`` is an optimisation, not a variant — pass the already-resolved
    active profile when one is to hand (:func:`caller_denied_pages` resolves it
    anyway) so a request never resolves it twice."""
    if not payload:
        return {}
    if payload.get("role") == "admin":
        return {k: "all" for k in CAPABILITY_KEYS}
    try:
        telegram_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        return {}

    caps: dict[str, str] = {}
    if MODE_GRANT in _profile_perm_modes(db):
        key = viewer_profile_key(db, payload) if profile_key is _UNSET else profile_key
        caps.update(caps_for_profile(db, key))
    caps.update(caps_for_user(db, telegram_id))
    return caps


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


def profile_holder_ids(db: Session, keys) -> set[int]:
    """Telegram ids approved on any of ``keys`` (profile keys).

    Rows stamped with ``profile_key`` answer directly; the un-stamped legacy
    ones are resolved the same way every other reader resolves them, and are the
    only reason this cannot be one ``IN`` query."""
    keys = set(keys)
    if not keys:
        return set()
    rows = db.query(TelegramUserRole).filter(
        TelegramUserRole.status == "approved",
        or_(TelegramUserRole.profile_key.in_(keys),
            TelegramUserRole.profile_key.is_(None)),
    ).all()
    out: set[int] = set()
    for r in rows:
        key = r.profile_key or role_row_profile_key(db, r, heal=False)
        if key in keys and r.telegram_id:
            out.add(r.telegram_id)
    return out


def users_with_cap(db: Session, capability: str) -> list[int]:
    """Telegram ids holding a capability — the extra recipients a notification
    fans out to alongside the admins who already get it.

    BOTH axes count: an account handed the capability directly, and every
    account approved on a PROFILE that holds it. A position granted the power to
    approve documents has to be TOLD about the documents, or the grant is a
    permission nobody knows to use."""
    rows = db.query(UserCapability).filter(
        UserCapability.capability == capability,
        UserCapability.mode != MODE_DENY,
    ).all()
    ids = {r.telegram_id for r in rows if r.telegram_id}
    keys = {r.profile_key for r in db.query(ProfilePermission).filter(
        ProfilePermission.capability == capability,
        ProfilePermission.mode != MODE_DENY,
    ).all() if r.profile_key}
    return sorted(ids | profile_holder_ids(db, keys))


def account_profile_keys(db: Session, telegram_id: int) -> set[str]:
    """Every profile key an account is approved on.

    Fan-out asks about a STORED account, where there is no active profile to
    read — nobody is holding a token — so every position the account can act as
    counts. Request guards must not use this: they have an active profile, and
    unioning the others would hand a session powers it switched away from."""
    keys: set[str] = set()
    for r in db.query(TelegramUserRole).filter(
        TelegramUserRole.telegram_id == telegram_id,
        TelegramUserRole.status == "approved",
    ).all():
        key = r.profile_key or role_row_profile_key(db, r, heal=False)
        if key:
            keys.add(key)
    return keys


def account_cap_scope(db: Session, telegram_id: int,
                      capability: str) -> Optional[str]:
    """The widest scope a STORED account has for a capability, over both axes.

    The fan-out twin of :func:`caller_caps`: "all" from either the login's own
    entry or any position it holds wins, because a notification withheld is not
    recoverable the way an extra one is."""
    scopes = {caps_for_user(db, telegram_id).get(capability)}
    for key in account_profile_keys(db, telegram_id):
        scopes.add(caps_for_profile(db, key).get(capability))
    if "all" in scopes:
        return "all"
    if "own" in scopes:
        return "own"
    return None


def account_unit_ids(db: Session, telegram_id: int) -> Optional[list[int]]:
    """Unit ids an account's OWN scope covers, unioned over every profile it
    holds; None when ANY of them is already unrestricted (admin/top-manager/
    leader), matching :func:`profile_unit_ids`' None convention.

    Used only by notification fan-out: a per-account "own" grant reaches the
    units of whatever the account can act as, so a co-held profile never hides a
    unit the grantee should have been told about."""
    units: set[int] = set()
    for key in account_profile_keys(db, telegram_id):
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

    Every account holding ``capability`` on either axis whose scope reaches at
    least one of ``manager_ids`` — "all" always does, "own" only for the units of
    a profile the account holds. A grant handed to one login of a shared profile
    notifies exactly that login; one written on the profile notifies every
    holder, which is the whole point of putting it there."""
    units_wanted = [m for m in manager_ids if m]
    out: set[int] = set()
    for telegram_id in users_with_cap(db, capability):
        if account_cap_scope(db, telegram_id, capability) != "all":
            units = account_unit_ids(db, telegram_id)
            if units is not None and not any(m in units for m in units_wanted):
                continue
        out.add(telegram_id)
    return out


# ── writing grants ────────────────────────────────────────────────────────────

def _clean_diff(grants: dict[str, str] | None,
                denies: list[str] | None,
                revokes: list[str] | None) -> tuple[dict[str, str], list[str], list[str]]:
    """Normalise one edit into (grants, denies, revokes) with no key in two of
    them. A key can't be granted and denied in the same save; the GRANT wins,
    because that is the direction an admin has to act deliberately to reach and
    a malformed payload must never silently close a page."""
    clean = {
        k: ("all" if k in UNSCOPED_CAPABILITIES else (v if v in SCOPES else DEFAULT_SCOPE))
        for k, v in (grants or {}).items() if k in CAPABILITY_KEYS
    }
    block = [k for k in (denies or []) if k in DENIABLE_KEYS and k not in clean]
    drop = [k for k in (revokes or [])
            if k in CAPABILITY_KEYS and k not in clean and k not in block]
    return clean, block, drop


def apply_caps(db: Session, telegram_ids: list[int],
               grants: dict[str, str] | None = None,
               revokes: list[str] | None = None,
               denies: list[str] | None = None,
               actor_name: str | None = None,
               actor_telegram_id: int | None = None) -> dict[int, dict[str, str]]:
    """Apply a DIFF — grant/rescope ``grants``, block ``denies``, clear
    ``revokes`` — to every listed Telegram account, leaving their other
    capabilities untouched.

    Deliberately a diff and not a whole-set replace: the Permissions tab can
    select several accounts at once, and those accounts rarely hold the same
    grants. Replacing would silently wipe whatever the admin wasn't looking at.
    With a diff, ticking one box for five people means exactly that.

    The three directions are the row's three states: a grant row, a deny row, or
    no row at all ("inherit" — the role × page matrix decides). ``revokes``
    therefore clears a deny just as it clears a grant; which one it was is what
    the audit action records.

    Returns the resulting {telegram_id: {capability: scope}}. The audit log
    records each capability separately, so history reads as individual grants
    rather than "someone saved the form"."""
    clean, block, drop = _clean_diff(grants, denies, revokes)

    def _audit(tid: int, capability: str, action: str, scope: str | None) -> None:
        db.add(CapabilityAudit(
            telegram_id=tid, capability=capability, action=action, scope=scope,
            actor_name=actor_name, actor_telegram_id=actor_telegram_id,
        ))

    for tid in telegram_ids:
        existing = {r.capability: r for r in db.query(UserCapability).filter(
            UserCapability.telegram_id == tid).all()}

        for capability, scope in clean.items():
            row = existing.get(capability)
            if row is None:
                db.add(UserCapability(
                    telegram_id=tid, capability=capability, scope=scope,
                    mode=MODE_GRANT, granted_by=actor_name,
                ))
                _audit(tid, capability, "granted", scope)
            elif row.mode == MODE_DENY:
                # Lifting a block and granting in its place is ONE decision to
                # the admin, but two facts in the trail — a later reader must be
                # able to see that the page had been closed.
                row.mode, row.scope, row.granted_by = MODE_GRANT, scope, actor_name
                _audit(tid, capability, "undenied", None)
                _audit(tid, capability, "granted", scope)
            elif row.scope != scope:
                row.scope = scope
                row.granted_by = actor_name
                _audit(tid, capability, "rescoped", scope)

        for capability in block:
            row = existing.get(capability)
            if row is None:
                db.add(UserCapability(
                    telegram_id=tid, capability=capability, scope=DEFAULT_SCOPE,
                    mode=MODE_DENY, granted_by=actor_name,
                ))
                _audit(tid, capability, "denied", None)
            elif row.mode != MODE_DENY:
                row.mode, row.granted_by = MODE_DENY, actor_name
                _audit(tid, capability, "revoked", None)
                _audit(tid, capability, "denied", None)

        for capability in drop:
            row = existing.get(capability)
            if row is not None:
                was_deny = row.mode == MODE_DENY
                db.delete(row)
                _audit(tid, capability, "undenied" if was_deny else "revoked", None)

    db.commit()
    return {tid: caps_for_user(db, tid) for tid in telegram_ids}


# ── the profile layer ─────────────────────────────────────────────────────────

def perms_for_profile(db: Session, key: Optional[str]) -> dict[str, dict]:
    """``{capability: {"mode": …, "scope": …}}`` stored on one PROFILE.

    What the Permissions tab reads back to render a profile target. Both kinds
    of entry come back together because they occupy the same row and the same
    three-state control. Guards read the same rows through
    :func:`caps_for_profile` and :func:`denied_pages_for_profile`."""
    if not key:
        return {}
    rows = db.query(ProfilePermission).filter(ProfilePermission.profile_key == key).all()
    return {
        r.capability: {
            "mode":  r.mode if r.mode in MODES else MODE_GRANT,
            "scope": r.scope if r.scope in SCOPES else DEFAULT_SCOPE,
        }
        for r in rows if r.capability in CAPABILITY_KEYS
    }


def apply_profile_perms(db: Session, profile_keys: list[str],
                        grants: dict[str, str] | None = None,
                        revokes: list[str] | None = None,
                        denies: list[str] | None = None,
                        actor_name: str | None = None,
                        actor_telegram_id: int | None = None) -> dict[str, dict]:
    """The :func:`apply_caps` diff, applied to PROFILES instead of accounts.

    Same three directions, same meaning, one different subject: what lands here
    belongs to the POSITION (see :class:`~app.models.ProfilePermission`). Every
    account holding the profile is affected on its next request — including
    accounts that already held it — and an account that switches away loses it
    again, because nothing is copied onto a login.

    Audit rows carry ``profile_key`` instead of ``telegram_id`` — the same
    column the pre-rollout history used — so the trail says plainly whether a
    change was aimed at a position or at a login."""
    clean, block, drop = _clean_diff(grants, denies, revokes)

    def _audit(key: str, capability: str, action: str, scope: str | None) -> None:
        db.add(CapabilityAudit(
            profile_key=key, capability=capability, action=action, scope=scope,
            actor_name=actor_name, actor_telegram_id=actor_telegram_id,
        ))

    for key in profile_keys:
        existing = {r.capability: r for r in db.query(ProfilePermission).filter(
            ProfilePermission.profile_key == key).all()}

        for capability, scope in clean.items():
            row = existing.get(capability)
            if row is None:
                db.add(ProfilePermission(
                    profile_key=key, capability=capability, scope=scope,
                    mode=MODE_GRANT, granted_by=actor_name,
                ))
                _audit(key, capability, "granted", scope)
            elif row.mode == MODE_DENY:
                row.mode, row.scope, row.granted_by = MODE_GRANT, scope, actor_name
                _audit(key, capability, "undenied", None)
                _audit(key, capability, "granted", scope)
            elif row.scope != scope:
                row.scope = scope
                row.granted_by = actor_name
                _audit(key, capability, "rescoped", scope)

        for capability in block:
            row = existing.get(capability)
            if row is None:
                db.add(ProfilePermission(
                    profile_key=key, capability=capability, scope=DEFAULT_SCOPE,
                    mode=MODE_DENY, granted_by=actor_name,
                ))
                _audit(key, capability, "denied", None)
            elif row.mode != MODE_DENY:
                row.mode, row.granted_by = MODE_DENY, actor_name
                _audit(key, capability, "revoked", None)
                _audit(key, capability, "denied", None)

        for capability in drop:
            row = existing.get(capability)
            if row is not None:
                was_deny = row.mode == MODE_DENY
                db.delete(row)
                _audit(key, capability, "undenied" if was_deny else "revoked", None)

    db.commit()
    return {key: perms_for_profile(db, key) for key in profile_keys}


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
