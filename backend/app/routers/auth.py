import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, unquote

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Admin, Language, RegistrationNotice, RoleProfile, TelegramUser, TelegramUserRole

router = APIRouter(prefix="/api/auth", tags=["auth"])

VALID_ROLES = {"top-manager", "shift-manager", "supervisor", "leader", "guest"}

# Sentinel role_ref for the admin's own "admin" profile in the role switcher.
# Real telegram_user_roles ids autoincrement from 1, so 0 never collides.
ADMIN_ROLE_REF = 0

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

SHIFT_ADMIN_SLOTS = [
    {"name": "Shift Admin 1", "shift": 1},
    {"name": "Shift Admin 2", "shift": 1},
    {"name": "Shift Admin 3", "shift": 2},
    {"name": "Shift Admin 4", "shift": 2},
]


def _validate_init_data(init_data: str) -> dict | None:
    try:
        params = dict(parse_qsl(init_data, strict_parsing=True))
    except Exception:
        return None

    recv_hash = params.pop("hash", "")
    if not recv_hash:
        return None

    data_check = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))
    secret = hmac.new(b"WebAppData", settings.telegram_bot_token.encode(), hashlib.sha256).digest()
    calc_hash = hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(calc_hash, recv_hash):
        return None

    user_str = params.get("user")
    if user_str:
        try:
            params["user"] = json.loads(unquote(user_str))
        except Exception:
            return None

    return params


def create_jwt(telegram_id: int, role: str, full_name: str, role_id: int | None = None,
               role_ref: int | None = None) -> str:
    payload = {
        "sub":       str(telegram_id),
        "role":      role,
        "full_name": full_name,
        "role_id":   role_id,
        "role_ref":  role_ref,   # telegram_user_roles.id of the active role
        "exp":       datetime.utcnow() + timedelta(hours=settings.access_token_expire_hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def _admin_profile_name(db: Session, admin_row: Admin | None) -> str | None:
    """Canonical name of the admin's claimed profile (admins.profile_id →
    role_profiles). Profiles are the identity shown everywhere in the app;
    the Telegram account name is only a fallback for unbound legacy admins."""
    if not admin_row or not admin_row.profile_id:
        return None
    p = db.query(RoleProfile).filter_by(id=admin_row.profile_id, role="admin").first()
    return p.name if p else None


def _serialize_role(r: TelegramUserRole) -> dict:
    return {
        "id":        r.id,
        "role":      r.role,
        "role_id":   r.role_id,
        "full_name": r.full_name,
        "status":    r.status,
    }


class WebAppLoginRequest(BaseModel):
    init_data: str


@router.post("/webapp")
def webapp_login(body: WebAppLoginRequest, db: Session = Depends(get_db)):
    import logging; _log = logging.getLogger(__name__)

    # Dev bypass: empty init_data when running outside Telegram.
    # Gated behind DEV_AUTH=1 — in production, missing initData must never
    # grant access (this endpoint is public).
    if not body.init_data or body.init_data == "__dev__":
        if not settings.dev_auth:
            raise HTTPException(status_code=401, detail="Missing Telegram initData")
        first_admin = db.query(Admin).order_by(Admin.id).first()
        _log.warning("AUTH: __dev__ bypass fired, returning admin_id=%s",
                     first_admin.telegram_id if first_admin else None)
        if first_admin:
            dev_name = _admin_profile_name(db, first_admin) or "Dev Admin"
            token = create_jwt(first_admin.telegram_id, "admin", dev_name)
            return {"status": "approved", "role": "admin", "full_name": dev_name, "token": token, "telegram_id": first_admin.telegram_id}
        return {"status": "not_registered"}

    parsed = _validate_init_data(body.init_data)
    if not parsed:
        raise HTTPException(status_code=401, detail="Invalid Telegram initData")

    tg_user = parsed.get("user", {})
    telegram_id = tg_user.get("id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="No user ID in initData")
    # Telegram account name from initData — refreshed on every login so the
    # admin profiles list can show who actually holds each profile.
    tg_name = " ".join(
        p for p in (tg_user.get("first_name"), tg_user.get("last_name")) if p
    ).strip() or None

    admin_row = db.query(Admin).filter_by(telegram_id=telegram_id).first()
    is_admin = admin_row is not None
    _log.warning("AUTH: telegram_id=%s  is_admin=%s", telegram_id, is_admin)

    # Admin check — no telegram_users record needed
    if is_admin:
        # The admin's display name is their claimed profile, never the
        # Telegram account name (that lives in tg_name for the holder chips).
        full_name = _admin_profile_name(db, admin_row) or tg_name or "Admin"

        # An admin may also have registered regular roles (via /register). If so,
        # expose an "admin" profile alongside them so they can switch in the app.
        user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
        roles = (
            db.query(TelegramUserRole)
            .filter_by(telegram_id=telegram_id)
            .order_by(TelegramUserRole.id)
            .all()
            if user else []
        )
        # role='admin' rows are /adminreg plumbing (pending requests only —
        # approvals delete the row and write the admins table instead); the
        # switcher's "admin" entry is the ADMIN_ROLE_REF sentinel below.
        visible = [r for r in roles if r.status != "rejected" and r.role != "admin"]

        if user and tg_name and user.tg_name != tg_name:
            user.tg_name = tg_name
            db.commit()

        if not visible:
            token = create_jwt(telegram_id, "admin", full_name)
            return {"status": "approved", "role": "admin", "full_name": full_name,
                    "token": token, "telegram_id": telegram_id,
                    "language": (user.language if user else None) or admin_row.language or "uz"}

        admin_profile = {"id": ADMIN_ROLE_REF, "role": "admin", "role_id": None,
                         "full_name": full_name, "status": "approved"}
        approved = [r for r in visible if r.status == "approved"]
        valid_refs = {ADMIN_ROLE_REF} | {r.id for r in approved}

        active_ref = user.active_role_ref if user.active_role_ref in valid_refs else ADMIN_ROLE_REF

        if active_ref == ADMIN_ROLE_REF:
            active_role, active_role_id, active_name = "admin", None, full_name
        else:
            ar = next(r for r in approved if r.id == active_ref)
            active_role, active_role_id, active_name = ar.role, ar.role_id, ar.full_name

        user.last_seen = datetime.now(timezone.utc)
        user.active_role_ref = active_ref
        db.commit()

        token = create_jwt(telegram_id, active_role, active_name, active_role_id,
                           None if active_ref == ADMIN_ROLE_REF else active_ref)
        return {
            "status":      "approved",
            "role":        active_role,
            "role_id":     active_role_id,
            "full_name":   active_name,
            "token":       token,
            "telegram_id": telegram_id,
            "language":    user.language or "uz",
            "roles":       [admin_profile] + [_serialize_role(r) for r in visible],
            "active_role_ref": active_ref,
        }

    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()

    if not user:
        return {"status": "not_registered"}

    roles = (
        db.query(TelegramUserRole)
        .filter_by(telegram_id=telegram_id)
        .order_by(TelegramUserRole.id)
        .all()
    )
    if not roles:
        return {"status": "not_registered"}

    approved = [r for r in roles if r.status == "approved"]
    pending  = [r for r in roles if r.status == "pending"]

    if not approved:
        if pending:
            return {"status": "pending", "full_name": pending[-1].full_name}
        return {"status": "rejected"}

    # Active role: the one last used, as long as it is still approved
    active = next((r for r in approved if r.id == user.active_role_ref), approved[0])

    user.last_seen = datetime.now(timezone.utc)
    user.active_role_ref = active.id
    user.tg_name = tg_name or user.tg_name
    db.commit()

    token = create_jwt(telegram_id, active.role, active.full_name, active.role_id, active.id)
    return {
        "status":    "approved",
        "role":      active.role,
        "role_id":   active.role_id,
        "full_name": active.full_name,
        "token":     token,
        "telegram_id": telegram_id,
        "language":  user.language or "uz",
        "roles":     [_serialize_role(r) for r in roles if r.status != "rejected"],
        "active_role_ref": active.id,
    }


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


class SwitchRoleBody(BaseModel):
    role_ref: int


@router.post("/switch-role")
def switch_role(body: SwitchRoleBody, token: str = Depends(_oauth2), db: Session = Depends(get_db)):
    """Re-issue the JWT for another approved role the caller holds, and
    remember it as the last-used role for the next login."""
    payload = _decode_token(token)
    telegram_id = int(payload["sub"])

    # Switch into the admin's own "admin" profile (not a telegram_user_roles row).
    if body.role_ref == ADMIN_ROLE_REF:
        admin_row = db.query(Admin).filter_by(telegram_id=telegram_id).first()
        if not admin_row:
            raise HTTPException(status_code=403, detail="Not an admin")
        user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
        if user:
            user.active_role_ref = ADMIN_ROLE_REF
            db.commit()
        full_name = _admin_profile_name(db, admin_row) or "Admin"
        new_token = create_jwt(telegram_id, "admin", full_name)
        return {
            "token":     new_token,
            "role":      "admin",
            "role_id":   None,
            "full_name": full_name,
            "active_role_ref": ADMIN_ROLE_REF,
        }

    target = db.query(TelegramUserRole).filter_by(id=body.role_ref, telegram_id=telegram_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Role not found")
    if target.status != "approved":
        raise HTTPException(status_code=403, detail="Role is not approved")

    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
    if user:
        user.active_role_ref = target.id
        db.commit()

    new_token = create_jwt(telegram_id, target.role, target.full_name, target.role_id, target.id)
    return {
        "token":     new_token,
        "role":      target.role,
        "role_id":   target.role_id,
        "full_name": target.full_name,
        "active_role_ref": target.id,
    }


class SetLanguageBody(BaseModel):
    language: str


@router.post("/language")
def set_language(body: SetLanguageBody, token: str = Depends(_oauth2), db: Session = Depends(get_db)):
    """Persist the caller's UI-selected language to their profile so the Telegram
    bot DMs them in the same language as the dashboard. The in-app bell is rendered
    at view time per request, but DMs are rendered once at send time from this
    stored value (see staff._get_user_lang)."""
    payload = _decode_token(token)
    telegram_id = int(payload["sub"])

    lang = (body.language or "").strip()
    valid = {row.code for row in db.query(Language.code).all()} or {"uz", "uz_cyrl", "ru", "en"}
    if lang not in valid:
        raise HTTPException(status_code=400, detail="Unknown language")

    # Persist to whichever profile(s) the caller has. Seeded admins have no
    # telegram_users row, so their language lives on the admins row instead —
    # _get_user_lang reads both, so the bot DMs them in this language too.
    persisted = False
    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
    if user:
        user.language = lang
        persisted = True
    admin = db.query(Admin).filter_by(telegram_id=telegram_id).first()
    if admin:
        admin.language = lang
        persisted = True
    if persisted:
        db.commit()
    return {"ok": True, "language": lang, "persisted": persisted}


@router.delete("/roles/{role_ref}")
def leave_role(role_ref: int, token: str = Depends(_oauth2), db: Session = Depends(get_db)):
    """Drop one of the caller's own roles. Removing the last role deletes the
    whole account (same as full sign-out)."""
    payload = _decode_token(token)
    telegram_id = int(payload["sub"])

    target = db.query(TelegramUserRole).filter_by(id=role_ref, telegram_id=telegram_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Role not found")

    db.delete(target)
    db.query(RegistrationNotice).filter_by(role_ref=role_ref).delete()

    remaining = (
        db.query(TelegramUserRole)
        .filter(TelegramUserRole.telegram_id == telegram_id, TelegramUserRole.id != role_ref)
        .order_by(TelegramUserRole.id)
        .all()
    )
    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()

    if not remaining:
        if user:
            db.delete(user)
        db.query(RegistrationNotice).filter_by(target_telegram_id=telegram_id).delete()
        db.commit()
        return {"ok": True, "roles": [], "account_deleted": True}

    approved = [r for r in remaining if r.status == "approved"]
    response_token = None
    if user and user.active_role_ref == role_ref:
        if approved:
            user.active_role_ref = approved[0].id
            response_token = create_jwt(
                telegram_id, approved[0].role, approved[0].full_name,
                approved[0].role_id, approved[0].id,
            )
        else:
            user.active_role_ref = None
    db.commit()

    return {
        "ok": True,
        "roles": [_serialize_role(r) for r in remaining if r.status != "rejected"],
        "account_deleted": False,
        "token": response_token,
    }


# The old public /shift-admins endpoint is gone: shift-manager profiles are
# admin-created now and the registration picker reads them from the
# initData-gated /api/profiles/registration-options instead. SHIFT_ADMIN_SLOTS
# above survives only as the source for the one-time profiles backfill.


@router.get("/bot-info")
def bot_info():
    return {"bot_username": settings.telegram_bot_username}


class SendStartHintBody(BaseModel):
    init_data: str
    language: str = "uz"


@router.post("/send-start-hint")
def send_start_hint(body: SendStartHintBody):
    """Validate initData and send the /start hint message to the user via bot."""
    parsed = _validate_init_data(body.init_data)
    if not parsed:
        raise HTTPException(status_code=401, detail="Invalid initData")

    telegram_id = parsed.get("user", {}).get("id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="No user ID")

    messages = {
        "uz": "Ro'yxatdan o'tish uchun quyidagi buyruqni bosing: /start",
        "uz_cyrl": "Рўйхатдан ўтиш учун қуйидаги буйруқни босинг: /start",
        "ru": "Для регистрации нажмите: /start",
        "en": "Tap the command below to register: /start",
    }
    try:
        from app.telegram_bot import bot
        bot.send_message(telegram_id, messages.get(body.language, messages["uz"]))
    except Exception:
        pass
    return {"ok": True}


@router.delete("/me")
def delete_me(token: str = Depends(_oauth2), db: Session = Depends(get_db)):
    """Delete the calling user's account with all roles (sign-out + unregister)."""
    payload = _decode_token(token)

    telegram_id = int(payload["sub"])
    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
    if user:
        lang = user.language or "uz"
        db.query(TelegramUserRole).filter_by(telegram_id=telegram_id).delete()
        db.query(RegistrationNotice).filter_by(target_telegram_id=telegram_id).delete()
        db.delete(user)
        db.commit()
        # Send a message with /start so the user can tap it to re-register
        try:
            from app.telegram_bot import bot
            messages = {
                "uz": "Siz tizimdan chiqdingiz.\n\nQayta ro'yxatdan o'tish uchun quyidagi buyruqni bosing: /start",
                "uz_cyrl": "Сиз тизимдан чиқдингиз.\n\nҚайта рўйхатдан ўтиш учун қуйидаги буйруқни босинг: /start",
                "ru": "Вы вышли из системы.\n\nДля повторной регистрации нажмите: /start",
                "en": "You have been signed out.\n\nTap the command below to register again: /start",
            }
            bot.send_message(telegram_id, messages.get(lang, messages["uz"]))
        except Exception:
            pass
    return {"ok": True}
