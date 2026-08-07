"""
Profile identity — the single source of truth for "who is this person".

THE RULE: a PROFILE is a person. `role_profiles` rows (and `managers` rows for
supervisors) are durable organizational identities — a named post held by a real
person. `telegram_user_roles` rows are merely REGISTRATIONS: which Telegram
accounts may log in *as* that person. Several accounts holding one profile is
normal and intended — they are all that one person, working the same post.

Therefore, everywhere in the app:
  * a list of people shows each profile EXACTLY ONCE (never one row per
    registration, never one row per Telegram account);
  * an assignment, a comment, a request, a document and a queue position belong
    to the PROFILE, so every holder sees and can act on it;
  * a person's statistics aggregate over the PROFILE, not over logins;
  * a Telegram DM addressed to a profile fans out to EVERY holder.

Telegram accounts remain the right key for exactly four things: login/JWT
subject, DM delivery, language preference, and account management.

The canonical key is the string ``"role:id"`` over the stable profile
namespaces — ``role_profiles.id`` for admin / top-manager / shift-manager /
leader / guest, ``managers.id`` for supervisor. Never ``telegram_user_roles.id``:
role rows churn on unassign→re-claim, so anything keyed to them orphans.

This module deliberately imports only models + SQLAlchemy so every router can
use it without circular imports.
"""
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import (
    Admin, Manager, RoleProfile, TelegramUser, TelegramUserRole,
)

# Roles whose role_id IS already the profile id — the key needs no lookup.
# (supervisor → managers.id; the rest → role_profiles.id.)
_DIRECT_ROLES = ("top-manager", "shift-manager", "guest", "supervisor")


# ── the key ───────────────────────────────────────────────────────────────────

def profile_key(role: Optional[str], ref: Optional[int]) -> Optional[str]:
    """Canonical ``"role:id"`` key, or None when the reference is unknown."""
    return f"{role}:{ref}" if role and ref else None


def parse_profile_key(key: Optional[str]) -> tuple[Optional[str], Optional[int]]:
    """Inverse of :func:`profile_key`. ("leader", 12) from "leader:12"."""
    if not key or ":" not in key:
        return None, None
    role, _, ref = key.partition(":")
    try:
        return role, int(ref)
    except ValueError:
        return None, None


# ── resolving a key from a registration / a JWT ───────────────────────────────

def role_row_profile_key(db: Session, r: TelegramUserRole,
                         heal: bool = True) -> Optional[str]:
    """The profile a registration claimed.

    Prefers the stamped ``profile_key`` column. Falls back to deriving it — by
    role_id for the direct roles, by (unit, name) for leaders — which is what
    the whole app used to do everywhere and why a renamed leader silently lost
    their holders. When the derivation succeeds on a NULL row we stamp it
    (``heal``) so the fragile name match is never needed for that row again.
    The caller owns the transaction; we only assign, never commit.
    """
    if r is None:
        return None
    if r.profile_key:
        return r.profile_key

    key = None
    if r.role in _DIRECT_ROLES:
        key = profile_key(r.role, r.role_id)
    elif r.role == "leader":
        prof = db.query(RoleProfile).filter_by(
            role="leader", manager_id=r.role_id, name=r.full_name,
        ).first()
        key = profile_key("leader", prof.id if prof else None)
    elif r.role == "admin":
        a = db.query(Admin).filter_by(telegram_id=r.telegram_id).first()
        key = profile_key("admin", a.profile_id if a else None)

    if key and heal:
        r.profile_key = key
    return key


def viewer_profile_key(db: Session, payload: dict) -> Optional[str]:
    """The JWT holder's ACTIVE profile — the identity every read filter and
    permission check must compare against.

    A person switched into profile A must not see or act on profile B's rows
    even though it is the same Telegram account; conversely a colleague holding
    profile A must see everything A owns. Returns None only for identities we
    cannot resolve (legacy unbound admins, stale leader-name JWTs), which
    degrades to the old account-scoped behaviour rather than granting anything.
    """
    role = payload.get("role")
    if role == "admin":
        a = db.query(Admin).filter_by(telegram_id=int(payload["sub"])).first()
        return profile_key("admin", a.profile_id if a else None)
    if role in _DIRECT_ROLES:
        return profile_key(role, payload.get("role_id"))
    if role == "leader":
        # Prefer the stamped registration — survives a profile rename, which the
        # name match below does not.
        row = db.query(TelegramUserRole).filter(
            TelegramUserRole.telegram_id == int(payload["sub"]),
            TelegramUserRole.role == "leader",
            TelegramUserRole.role_id == payload.get("role_id"),
            TelegramUserRole.status == "approved",
            TelegramUserRole.profile_key.isnot(None),
        ).first()
        if row:
            return row.profile_key
        prof = db.query(RoleProfile).filter_by(
            role="leader", manager_id=payload.get("role_id"),
            name=payload.get("full_name"),
        ).first()
        return profile_key("leader", prof.id if prof else None)
    return None


def viewer_leader_profile_id(db: Session, payload: dict) -> Optional[int]:
    """``role_profiles.id`` of the viewer's leader profile, else None."""
    role, ref = parse_profile_key(viewer_profile_key(db, payload))
    return ref if role == "leader" else None


# ── holders: profile → the accounts that may act as this person ───────────────

def profile_holders(db: Session, key: Optional[str]) -> list[int]:
    """Telegram ids of every APPROVED holder of a profile, sorted.

    Empty for an unclaimed profile — a real state, not an error: profiles exist
    before anyone registers, and work addressed to them waits in the bell until
    someone claims it. Callers must handle the empty case rather than skipping
    the notification.
    """
    role, ref = parse_profile_key(key)
    if not role or not ref:
        return []

    if role == "admin":
        return sorted({
            a.telegram_id for a in db.query(Admin).filter(Admin.profile_id == ref)
            if a.telegram_id
        })

    q = db.query(TelegramUserRole).filter(
        TelegramUserRole.role == role,
        TelegramUserRole.status == "approved",
    )
    if role == "leader":
        # Stamped rows are authoritative; unstamped legacy rows still have to be
        # matched the old way — by (unit, name) — or their holder disappears.
        prof = db.query(RoleProfile).filter_by(id=ref, role="leader").first()
        if not prof:
            return []
        rows = [
            r for r in q.filter(TelegramUserRole.role_id == prof.manager_id)
            if (r.profile_key == key
                or (not r.profile_key and r.full_name == prof.name))
        ]
    else:
        rows = [r for r in q.filter(TelegramUserRole.role_id == ref)
                if not r.profile_key or r.profile_key == key]
    return sorted({r.telegram_id for r in rows if r.telegram_id})


def holder_names(db: Session, key: Optional[str]) -> list[str]:
    """Telegram account names of a profile's holders — for admin UIs that show
    WHO currently works as this person. Never used as the person's own name:
    that always comes from the profile."""
    ids = profile_holders(db, key)
    if not ids:
        return []
    return [
        (u.tg_name or u.username or str(u.telegram_id))
        for u in db.query(TelegramUser).filter(TelegramUser.telegram_id.in_(ids))
    ]


# ── people lists: one row per profile, never one per registration ─────────────

def list_leader_profiles(db: Session, manager_id: Optional[int] = None
                         ) -> list[RoleProfile]:
    """Every leader PROFILE (optionally of one unit), claimed or not, ordered by
    name. THE source for any leader picker — building one from
    telegram_user_roles renders a 3-holder profile three times."""
    q = db.query(RoleProfile).filter(RoleProfile.role == "leader")
    if manager_id is not None:
        q = q.filter(RoleProfile.manager_id == manager_id)
    return q.order_by(RoleProfile.name).all()


def profile_display_name(db: Session, key: Optional[str]) -> Optional[str]:
    """The person's CURRENT name, read live from the profile so a rename
    propagates everywhere instead of leaving stale snapshots behind."""
    role, ref = parse_profile_key(key)
    if not role or not ref:
        return None
    if role == "supervisor":
        m = db.query(Manager).filter_by(id=ref).first()
        return m.name if m else None
    p = db.query(RoleProfile).filter_by(id=ref).first()
    return p.name if p else None


def same_profile(a: Optional[str], b: Optional[str]) -> bool:
    """True when two keys denote the same person. Never true for two NULLs —
    an unresolved identity must not match another unresolved identity."""
    return bool(a) and bool(b) and a == b


def owns(db: Session, payload: dict, owner_key: Optional[str],
         legacy_account_id: Optional[int] = None) -> bool:
    """Does the caller own a row, given its profile key?

    Profile match wins. ``legacy_account_id`` is the pre-migration account
    column and is consulted ONLY when the row has no profile key, so historical
    rows keep working without granting a switched-away account any new rights.
    """
    if owner_key:
        return same_profile(owner_key, viewer_profile_key(db, payload))
    if legacy_account_id is None:
        return False
    try:
        return int(legacy_account_id) == int(payload.get("sub"))
    except (TypeError, ValueError):
        return False


def stamp_role_row(db: Session, r: TelegramUserRole,
                   key: Optional[str] = None) -> Optional[str]:
    """Record which profile a registration claimed. Call at every point a role
    row is created or re-pointed (registration approval, admin grant, role
    switch) — that is what keeps profile identity exact instead of guessed."""
    if r is None:
        return None
    r.profile_key = key or role_row_profile_key(db, r, heal=False)
    return r.profile_key


def dedupe_by_profile(db: Session, rows: Iterable[TelegramUserRole]
                      ) -> dict[str, list[TelegramUserRole]]:
    """Group registrations by the profile they claim: {key: [rows]}. Rows whose
    profile cannot be resolved are dropped — they have no identity to show."""
    out: dict[str, list[TelegramUserRole]] = {}
    for r in rows:
        key = role_row_profile_key(db, r)
        if key:
            out.setdefault(key, []).append(r)
    return out
