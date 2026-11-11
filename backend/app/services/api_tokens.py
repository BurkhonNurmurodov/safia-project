"""Personal tokens for the external read API (2026-11-11) — GitHub's model.

Whoever may open the «API» page (`page.view.api`) makes tokens for themselves
there. A token is shown ONCE and kept as a SHA-256 digest; it carries a name
and an expiry (a year at most), and it is its OWNER's: every call asks again
whether that person still holds the profile and the page, so taking either
away stops their tokens at once — nothing to remember to revoke. The owner (or
an admin) revokes one by hand. See docs/ext-api.md.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app import identity
from app.models import Admin, ApiToken

PAGE = "api"
DAYS = (30, 90, 365)
MAX_ACTIVE = 10          # per owner
_SEEN_EVERY = timedelta(minutes=1)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def digest_of(token: str) -> str:
    return hashlib.sha256(token.strip().encode()).hexdigest()


def state(row: ApiToken, now: Optional[datetime] = None) -> str:
    """"revoked" · "expired" · "active" — the row's own answer, before its
    owner is asked about."""
    if row.revoked_at is not None:
        return "revoked"
    return "expired" if row.expires_at <= (now or _now()) else "active"


def owner_ok(db: Session, row: ApiToken) -> bool:
    """Does the owner still hold the profile the token was made under, and may
    that profile still open the page?"""
    from app.capabilities import capability_pages, caller_denied_pages
    from app.permissions import get_page_access, role_can_access
    p = row.payload or {}
    if row.owner_key:
        if row.owner_tid not in identity.profile_holders(db, row.owner_key):
            return False
    elif p.get("role") != "admin" or not db.query(Admin).filter_by(telegram_id=row.owner_tid).first():
        return False                     # an identity nothing can re-check
    return role_can_access(p.get("role"), [PAGE], get_page_access(db),
                           capability_pages(db, p), caller_denied_pages(db, p))


def mint(db: Session, payload: dict, name: str, days: int) -> tuple[str, ApiToken]:
    """(the token — the only time it exists in the clear, its row)."""
    token = "sfx_" + secrets.token_urlsafe(32)
    keep = {k: v for k, v in payload.items() if k not in ("exp", "iat", "nbf", "jti")}
    row = ApiToken(
        name=name, prefix=token[:9], digest=digest_of(token),
        owner_tid=int(payload["sub"]), owner_key=identity.viewer_profile_key(db, payload),
        owner_name=payload.get("full_name"), payload=keep,
        expires_at=_now() + timedelta(days=days))
    db.add(row)
    db.commit()
    db.refresh(row)
    return token, row


def use(db: Session, token: str) -> Optional[ApiToken]:
    """The live token this string is, or None. Stamps `last_used_at` (at most
    once a minute — a write per call would be a write per poll)."""
    row = db.query(ApiToken).filter(ApiToken.digest == digest_of(token)).first()
    if row is None or state(row) != "active" or not owner_ok(db, row):
        return None
    now = _now()
    if row.last_used_at is None or now - row.last_used_at > _SEEN_EVERY:
        row.last_used_at = now
        db.commit()
    return row
