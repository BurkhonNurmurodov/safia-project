"""Browser login — username + password, no Telegram in the loop.

Three public endpoints (login, forgot) plus one that needs a live browser
session (change-password). Everything else about being logged in is unchanged:
the token these mint is the same JWT a Telegram login produces, with the two
extra claims described in ``app/web_auth.py``.

Delivery and recovery both run through the bot, so a person who has never
claimed a profile from a Telegram account has no web login either — that is the
intended shape, not a gap: there would be nowhere to send the password.
"""
import logging
from datetime import datetime, timezone
from typing import Annotated, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import web_auth
from app.config import settings
from app.database import get_db
from app.identity import profile_display_name, viewer_profile_key
from app.models import Admin, TelegramUser, WebCredential

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth/web", tags=["web-auth"])
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/web/login")


def _client_ip(request: Request) -> str:
    """The real client address. nginx sits in front, so the socket peer is
    always 127.0.0.1 — the first hop in X-Forwarded-For is the caller."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


class LoginBody(BaseModel):
    username: str
    password: str
    remember: bool = False


@router.post("/login")
def web_login(body: LoginBody, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if web_auth.ip_throttled(ip):
        raise HTTPException(status_code=429, detail="too_many_attempts")
    web_auth.record_ip_attempt(ip)

    username = web_auth.normalize_username(body.username)
    cred = db.query(WebCredential).filter(WebCredential.username == username).first()

    # An unknown username and a wrong password answer identically, so the form
    # cannot be used to find out who has an account.
    if not cred or not cred.enabled:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    wait = web_auth.lock_seconds_left(cred)
    if wait > 0:
        # Naming the lockout does confirm the username exists — but only to
        # someone who has already burned five guesses on it and is locked out
        # regardless. A person who mistyped their own password deserves to be
        # told why the next four attempts will also fail.
        raise HTTPException(status_code=423, detail=f"locked:{wait}")

    if not web_auth.verify_password(body.password, cred.password_hash):
        web_auth.register_failure(db, cred)
        db.commit()
        raise HTTPException(status_code=401, detail="invalid_credentials")

    identity = web_auth.session_identity(db, cred.profile_key)
    if not identity:
        # The credential outlived its profile's registration (holder unassigned,
        # profile deleted). Nothing to log in AS, and no DM address either.
        log.warning("web login: no session identity for %s", cred.profile_key)
        raise HTTPException(status_code=403, detail="profile_unavailable")

    web_auth.clear_failures(db, cred)
    cred.last_login_at = datetime.now(timezone.utc)
    db.commit()
    log.info("WEB-LOGIN signin | login=%s | profile=%s | ip=%s",
             cred.username, cred.profile_key, ip)

    token = web_auth.create_web_jwt(identity, cred, body.remember)
    user = db.query(TelegramUser).filter_by(telegram_id=identity["telegram_id"]).first()
    admin = db.query(Admin).filter_by(telegram_id=identity["telegram_id"]).first()

    return {
        "status":      "approved",
        "role":        identity["role"],
        "role_id":     identity["role_id"],
        "full_name":   identity["full_name"],
        "token":       token,
        "telegram_id": identity["telegram_id"],
        "language":    (user.language if user else None) or (admin.language if admin else None) or "uz",
        # A browser session is bound to ONE profile — the credential names it.
        # Offering the Telegram role-switcher here would move the session to a
        # profile this password was never issued for.
        "roles":           [],
        "active_role_ref": identity["role_ref"],
        "web":             True,
        "web_login": {
            "username":      cred.username,
            "profile":       profile_display_name(db, cred.profile_key),
            "last_login_at": cred.last_login_at.isoformat(),
        },
    }


class ForgotBody(BaseModel):
    username: str


@router.post("/forgot")
def web_forgot(body: ForgotBody, request: Request, db: Session = Depends(get_db)):
    """Issue a fresh password and DM it to the profile's Telegram holders.

    Always answers ``{"ok": true}``. Whether the username exists, whether the
    profile still has a holder, whether the DM reached anyone — none of it is
    reflected back, because this endpoint is unauthenticated and the answer
    would otherwise be a membership oracle.
    """
    ip = _client_ip(request)
    if web_auth.ip_throttled(ip):
        raise HTTPException(status_code=429, detail="too_many_attempts")
    web_auth.record_ip_attempt(ip)

    username = web_auth.normalize_username(body.username)
    cred = db.query(WebCredential).filter(WebCredential.username == username).first()
    if cred and cred.enabled:
        password = web_auth.generate_password()
        cred.password_hash = web_auth.hash_password(password)
        cred.password_set_at = datetime.now(timezone.utc)
        # A reset must not leave old browser sessions alive — the point of
        # resetting is usually that someone else may hold the old password.
        cred.token_version = (cred.token_version or 1) + 1
        web_auth.clear_failures(db, cred)
        db.commit()
        sent = web_auth.dm_credentials(db, cred.profile_key, cred.username, password)
        log.info("WEB-LOGIN self_reset | login=%s | profile=%s | ip=%s | dm_sent=%s",
                 cred.username, cred.profile_key, ip, sent)
        if not sent:
            log.warning("web forgot: no holder received the reset for %s", cred.username)
    return {"ok": True}


def _web_caller(token: Annotated[str, Depends(_oauth2)], db: Session = Depends(get_db)) -> dict:
    """A live BROWSER session. Deliberately narrower than the app-wide
    ``require_auth``: changing a web password from inside Telegram would be
    changing a credential the caller never had to prove they hold."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not payload.get("web") or not web_auth.web_session_is_live(db, payload):
        raise HTTPException(status_code=401, detail="Not a web session")
    return payload


class ChangePasswordBody(BaseModel):
    # Optional because a TELEGRAM session does not prove it holds the current
    # password (see below); a browser session must always supply it.
    current_password: Optional[str] = None
    new_password: str


def _any_caller(token: Annotated[str, Depends(_oauth2)]) -> dict:
    """Any live session — browser or Telegram. The app-wide origin guard has
    already run for this request, so a Telegram-issued token here arrived with
    valid initData and a web token with nothing else; web-token revocation is
    still re-checked by the caller below."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/password")
def change_password(body: ChangePasswordBody, payload: dict = Depends(_any_caller),
                    db: Session = Depends(get_db)):
    """Change the web password from EITHER surface.

    A browser session must prove it holds the current password: its token was
    minted from that password, and an unlocked machine must not be enough to
    quietly take over the account.

    A Telegram session proves identity with initData instead — the same proof
    the password is DELIVERED against (both the admin reset and «Forgot
    password» DM a fresh password to Telegram with no current-password check).
    Requiring the current password there would add friction, not security, so
    it changes with the new password alone.
    """
    is_web = bool(payload.get("web"))
    if is_web:
        if not web_auth.web_session_is_live(db, payload):
            raise HTTPException(status_code=401, detail="Not a live web session")
        cred = db.query(WebCredential).filter(
            WebCredential.username == payload.get("wu")).first()
    else:
        key = viewer_profile_key(db, payload)
        cred = db.query(WebCredential).filter(
            WebCredential.profile_key == key).first() if key else None
    if not cred:
        raise HTTPException(status_code=404, detail="no_web_login")
    if not cred.enabled:
        # An admin disabled this login on purpose; a self-change must not be a
        # way to argue with that (and a fresh password would not log in anyway).
        raise HTTPException(status_code=403, detail="login_disabled")

    if is_web and not web_auth.verify_password(body.current_password or "",
                                               cred.password_hash):
        raise HTTPException(status_code=400, detail="wrong_current_password")

    err = web_auth.password_error(body.new_password)
    if err:
        raise HTTPException(status_code=400, detail=err)

    cred.password_hash = web_auth.hash_password(body.new_password)
    cred.password_set_at = datetime.now(timezone.utc)
    # Every other browser holding the old password is signed out — that is what
    # a password change is for. A browser caller gets a fresh token below so the
    # tab they are typing in does not log itself out; a Telegram session carries
    # no version claim and is untouched.
    cred.token_version = (cred.token_version or 1) + 1
    web_auth.clear_failures(db, cred)
    db.commit()
    log.info("WEB-LOGIN self_change | login=%s | profile=%s | via=%s",
             cred.username, cred.profile_key, "web" if is_web else "telegram")

    if not is_web:
        return {"ok": True}

    identity = web_auth.session_identity(db, cred.profile_key)
    if not identity:
        raise HTTPException(status_code=403, detail="profile_unavailable")
    remember = _is_long_session(payload)
    return {"ok": True, "token": web_auth.create_web_jwt(identity, cred, remember)}


def _is_long_session(payload: dict) -> bool:
    """Preserve the caller's "remember me" choice across a password change:
    anything valid for more than a day was a remembered session."""
    exp = payload.get("exp")
    if not exp:
        return False
    remaining = datetime.fromtimestamp(exp, tz=timezone.utc) - datetime.now(timezone.utc)
    return remaining.total_seconds() > web_auth.SESSION_HOURS * 3600


@router.get("/session")
def web_session(payload: dict = Depends(_web_caller), db: Session = Depends(get_db)):
    """Rebuild the full auth payload for a browser that already holds a token.

    The reload path. It re-derives everything from the profile rather than
    restoring a snapshot the browser kept, so a rename, a role change or a
    revoked login takes effect on the next page load instead of persisting in
    somebody's tab until the token expires.
    """
    cred = db.query(WebCredential).filter(WebCredential.username == payload.get("wu")).first()
    if not cred:
        raise HTTPException(status_code=401, detail="No web login")

    identity = web_auth.session_identity(db, cred.profile_key)
    if not identity:
        raise HTTPException(status_code=403, detail="profile_unavailable")

    user = db.query(TelegramUser).filter_by(telegram_id=identity["telegram_id"]).first()
    admin = db.query(Admin).filter_by(telegram_id=identity["telegram_id"]).first()
    return {
        "status":      "approved",
        "role":        identity["role"],
        "role_id":     identity["role_id"],
        "full_name":   identity["full_name"],
        "telegram_id": identity["telegram_id"],
        "language":    (user.language if user else None) or (admin.language if admin else None) or "uz",
        "roles":           [],
        "active_role_ref": identity["role_ref"],
        "web":             True,
        "web_login": {
            "username":      cred.username,
            "profile":       profile_display_name(db, cred.profile_key),
            "last_login_at": cred.last_login_at.isoformat() if cred.last_login_at else None,
        },
    }
