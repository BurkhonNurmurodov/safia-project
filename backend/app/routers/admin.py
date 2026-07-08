from typing import Annotated, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Manager, Attendance, RoleProfile, SheetSource, AppSetting, TelegramUser, TelegramUserRole
from app.services.verifix_parser import parse_verifix_file
from app.services.sheets_sync import sync_source_sheet, sync_shift_report_sheet, sync_leaders_sheet
from app.permissions import get_page_access, set_page_access, PAGE_KEYS, TOGGLEABLE_ROLES
from app.routers.auth import VALID_ROLES

router = APIRouter(prefix="/admin", tags=["admin"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")


def verify_admin(token: Annotated[str, Depends(oauth2_scheme)]):
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


@router.post("/upload")
async def upload_verifix(
    files: list[UploadFile] = File(...),
    admin_payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    try:
        actor_tg_id = int(admin_payload["sub"])
    except (KeyError, TypeError, ValueError):
        actor_tg_id = None

    results = []
    for f in files:
        content = await f.read()
        mgr_id, date, rows = parse_verifix_file(content, f.filename)
        if mgr_id is None or date is None:
            results.append({"file": f.filename, "status": "error", "detail": "Invalid filename format"})
            continue

        manager = db.query(Manager).filter(Manager.id == mgr_id).first()
        if not manager:
            results.append({"file": f.filename, "status": "error", "detail": f"Manager ID {mgr_id} not found"})
            continue

        db.query(Attendance).filter(
            Attendance.manager_id == mgr_id,
            Attendance.date == date
        ).delete()

        inserted = 0
        for r in rows:
            db.add(Attendance(manager_id=mgr_id, date=date, **r))
            inserted += 1

        # Tell this unit's supervisor their verifix data landed for this date so
        # they can make their changes (exchanges, role changes, deletions) and
        # close the day. The day's close-state is intentionally left untouched —
        # a re-upload over an already-closed day notifies but stays closed.
        # Best-effort: a missing supervisor or Telegram hiccup must not fail the
        # upload, and the notification commits together with the attendance rows.
        try:
            from app.routers.staff import notify_supervisor_verifix_upload
            notify_supervisor_verifix_upload(db, mgr_id, date, actor_tg_id=actor_tg_id)
        except Exception:
            pass

        db.commit()
        results.append({"file": f.filename, "status": "ok", "rows_inserted": inserted})

    return {"results": results}


@router.get("/sheet-sources")
def get_sheet_sources(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return db.query(SheetSource).all()


@router.get("/service-account")
def get_service_account(_: dict = Depends(verify_admin)):
    """The Google service account email that source sheets must be shared with."""
    from app.services.sheets_reader import get_service_account_email
    return {"email": get_service_account_email()}


@router.put("/sheet-sources/{name}")
def update_sheet_source(
    name: str,
    payload: dict,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    src = db.query(SheetSource).filter(SheetSource.name == name).first()
    if not src:
        src = SheetSource(name=name, sheet_id=payload["sheet_id"])
        db.add(src)
    else:
        src.sheet_id = payload["sheet_id"]
    db.commit()
    db.refresh(src)
    return src


@router.post("/refresh-sheet/{name}")
def refresh_sheet(
    name: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    src = db.query(SheetSource).filter(SheetSource.name == name).first()
    if not src:
        raise HTTPException(status_code=404, detail=f"Sheet '{name}' not configured")

    try:
        if name == "source":
            result = sync_source_sheet(src.sheet_id, db)
            return {"status": "ok", "sheet": name, **result}

        if name == "shift_report":
            result = sync_shift_report_sheet(src.sheet_id, db)
            return {"status": "ok", "sheet": name, **result}

        if name == "leaders":
            result = sync_leaders_sheet(src.sheet_id, db)
            return {"status": "ok", "sheet": name, **result}

        return {"status": "ok", "sheet": name}

    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to sync sheet: {e}")


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    rows = db.query(AppSetting).all()
    return {r.key: r.value for r in rows}


@router.put("/settings")
def update_settings(
    payload: dict,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    for key, value in payload.items():
        row = db.query(AppSetting).filter(AppSetting.key == key).first()
        if row:
            row.value = str(value)
        else:
            db.add(AppSetting(key=key, value=str(value)))
    db.commit()
    return {"status": "ok"}


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    users = db.query(TelegramUser).order_by(TelegramUser.created_at.desc()).all()
    roles_by_tid: dict[int, list[TelegramUserRole]] = {}
    for r in db.query(TelegramUserRole).order_by(TelegramUserRole.id).all():
        roles_by_tid.setdefault(r.telegram_id, []).append(r)

    return [
        {
            "id":          u.id,
            "telegram_id": u.telegram_id,
            "full_name":   u.full_name,
            "username":    u.username,
            "phone":       u.phone,
            "language":    u.language,
            "active_role_ref": u.active_role_ref,
            "last_seen":   u.last_seen.isoformat()  if u.last_seen   else None,
            "created_at":  u.created_at.isoformat() if u.created_at  else None,
            "roles": [
                {
                    "id":          r.id,
                    "role":        r.role,
                    "role_id":     r.role_id,
                    "full_name":   r.full_name,
                    "status":      r.status,
                    "created_at":  r.created_at.isoformat()  if r.created_at  else None,
                    "approved_at": r.approved_at.isoformat() if r.approved_at else None,
                }
                for r in roles_by_tid.get(u.telegram_id, [])
            ],
        }
        for u in users
    ]


class RoleUpdatePayload(BaseModel):
    status:  Optional[str] = None   # pending | approved | rejected
    role:    Optional[str] = None   # top-manager | shift-manager | supervisor
    role_id: Optional[int] = None


@router.patch("/users/{user_id}/roles/{role_ref}")
def update_user_role(
    user_id: int,
    role_ref: int,
    payload: RoleUpdatePayload,
    db: Session = Depends(get_db),
    admin_payload: dict = Depends(verify_admin),
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_row = db.query(TelegramUserRole).filter_by(
        id=role_ref, telegram_id=user.telegram_id,
    ).first()
    if not role_row:
        raise HTTPException(status_code=404, detail="Role not found")

    # Role / unit reassignment (no status change) is applied directly here.
    if payload.role is not None:
        role_row.role = payload.role
    if payload.role_id is not None:
        role_row.role_id = payload.role_id

    # A change to approved/rejected is delegated to the shared decision core so
    # the panel and the Telegram approve/reject buttons behave identically (it
    # sets the status, notifies the registrant and edits every admin's message).
    # Resetting back to pending is applied directly.
    status_decision = None
    if payload.status is not None and payload.status != role_row.status:
        if payload.status in ("approved", "rejected"):
            status_decision = payload.status
        else:
            role_row.status = payload.status

    db.commit()

    if status_decision:
        try:
            from app.telegram_bot import decide_registration
            decide_registration(role_ref, status_decision,
                                decided_by=admin_payload.get("full_name"))
        except Exception:
            pass

    return {"ok": True}


class AddRolePayload(BaseModel):
    role:    str            # top-manager | shift-manager | supervisor | leader
    # supervisor→managers.id | shift-manager/top-manager→role_profiles.id |
    # leader→role_profiles.id of the leader profile (stored role_id becomes
    # that profile's unit, per the leader role_id contract)
    role_id: Optional[int] = None


@router.post("/users/{user_id}/roles")
def add_user_role(
    user_id: int,
    payload: AddRolePayload,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Admin-create an extra role for an existing Telegram user, approved
    immediately. Mirrors the role_id/full_name derivation the bot uses on
    self-registration; respects the (telegram_id, role, role_id) uniqueness
    constraint by re-activating a previously rejected/pending instance."""
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    # Guests create their own profile during bot registration — there is no
    # pre-created pool for an admin to grant from.
    if payload.role == "guest":
        raise HTTPException(status_code=400, detail="Guests register themselves via the bot")

    # Derive role_id + role-scoped display name from the pre-created profile,
    # exactly like the bot does on self-registration.
    if payload.role == "supervisor":
        mgr = db.query(Manager).filter(Manager.id == payload.role_id,
                                       Manager.archived.is_(False)).first()
        if not mgr:
            raise HTTPException(status_code=400, detail="Unit not found")
        role_id, full_name = mgr.id, mgr.name
    elif payload.role == "leader":
        lp = db.query(RoleProfile).filter_by(id=payload.role_id, role="leader").first()
        if not lp:
            raise HTTPException(status_code=400, detail="Leader profile not found")
        role_id, full_name = lp.manager_id, lp.name
    elif payload.role == "shift-manager":
        p = db.query(RoleProfile).filter_by(id=payload.role_id, role="shift-manager").first()
        if not p:
            raise HTTPException(status_code=400, detail="Shift-manager profile not found")
        role_id, full_name = p.id, p.name
    else:  # top-manager
        p = db.query(RoleProfile).filter_by(id=payload.role_id, role="top-manager").first()
        if not p:
            raise HTTPException(status_code=400, detail="Top-manager profile not found")
        role_id, full_name = p.id, p.name

    now = datetime.now(timezone.utc)
    existing = db.query(TelegramUserRole).filter_by(
        telegram_id=user.telegram_id, role=payload.role, role_id=role_id,
    ).first()
    if existing:
        if existing.status == "approved":
            raise HTTPException(status_code=409, detail="User already has this role")
        existing.status = "approved"
        existing.approved_at = now
        existing.full_name = full_name
    else:
        db.add(TelegramUserRole(
            telegram_id=user.telegram_id,
            role=payload.role,
            role_id=role_id,
            full_name=full_name,
            status="approved",
            approved_at=now,
        ))

    telegram_id = user.telegram_id
    lang = user.language or "uz"
    db.commit()

    # Deliver any bell rows queued to this supervisor profile while it was
    # unclaimed (e.g. call-to-shift notices) — same as decide_registration.
    if payload.role == "supervisor":
        try:
            from app.routers.staff import flush_queued_supervisor_dms
            flush_queued_supervisor_dms(db, telegram_id, role_id)
        except Exception:
            pass

    # Tell the user over Telegram, same as a normal approval.
    try:
        from app.telegram_bot import notify_status_change
        notify_status_change(telegram_id, "approved", lang, role=payload.role)
    except Exception:
        pass

    return {"ok": True}


@router.delete("/users/{user_id}/roles/{role_ref}")
def delete_user_role(
    user_id: int,
    role_ref: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Remove a single role from a user. Removing the last role deletes the
    whole account, exactly like deleting the user."""
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_row = db.query(TelegramUserRole).filter_by(
        id=role_ref, telegram_id=user.telegram_id,
    ).first()
    if not role_row:
        raise HTTPException(status_code=404, detail="Role not found")

    telegram_id = user.telegram_id
    db.delete(role_row)

    remaining = db.query(TelegramUserRole).filter(
        TelegramUserRole.telegram_id == telegram_id,
        TelegramUserRole.id != role_ref,
    ).all()
    user_deleted = False
    if not remaining:
        db.delete(user)
        user_deleted = True
    elif user.active_role_ref == role_ref:
        approved = [r for r in remaining if r.status == "approved"]
        user.active_role_ref = approved[0].id if approved else None
    db.commit()

    try:
        from app.telegram_bot import forget_registration_notices
        if user_deleted:
            forget_registration_notices(telegram_id)
    except Exception:
        pass
    return {"ok": True, "user_deleted": user_deleted}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    telegram_id = user.telegram_id
    db.query(TelegramUserRole).filter_by(telegram_id=telegram_id).delete()
    db.delete(user)
    db.commit()
    try:
        from app.telegram_bot import forget_registration_notices
        forget_registration_notices(telegram_id)
    except Exception:
        pass
    return {"ok": True}


# ── Page access matrix ────────────────────────────────────────────────────────

@router.get("/page-access")
def admin_get_page_access(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return {
        "pages":            get_page_access(db),
        "page_keys":        PAGE_KEYS,
        "toggleable_roles": TOGGLEABLE_ROLES,
    }


class PageAccessPayload(BaseModel):
    pages: dict[str, list[str]]


@router.put("/page-access")
def admin_update_page_access(
    payload: PageAccessPayload,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    pages = set_page_access(db, payload.pages)
    return {"status": "ok", "pages": pages}
