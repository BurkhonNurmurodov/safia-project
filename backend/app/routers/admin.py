from typing import Annotated, Optional
from datetime import datetime, timezone
import mimetypes

import requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    Manager, Attendance, RoleProfile, SheetSource, AppSetting, TelegramUser, TelegramUserRole,
    EditRequest, HrDocument, DayApproval, DailySubmission, LeaderSyncMeta,
)
from app.services.verifix_parser import parse_verifix_file
from app.services.sheets_sync import (
    sync_source_sheet, sync_shift_report_sheet, sync_leaders_sheet, sync_quality_sheet,
)
from app.permissions import get_page_access, set_page_access, role_can_access, PAGE_KEYS, TOGGLEABLE_ROLES
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


def verify_refresh_access(
    name: str,
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Session = Depends(get_db),
):
    """Sheet re-sync is admin-only, except the leaders sheet: anyone who can open
    the Leaders page may refresh it (the refresh button is shown to every such
    profile), since they re-sync from the page and each still only reads their
    own scoped rows afterwards."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = payload.get("role")
    if role == "admin":
        return payload
    if name == "leaders" and role_can_access(role, ["leaders"], get_page_access(db)):
        return payload
    raise HTTPException(status_code=403, detail="Admin access required")


@router.post("/upload")
async def upload_verifix(
    files: list[UploadFile] = File(...),
    admin_payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
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

        # A re-upload over a day that already had approved → task exchanges brings
        # every worker's full row back while the exchange docs stay, so task-assigned
        # workers would reappear with full hours and get re-counted (zagruzka etc.).
        # Re-apply those within-unit → task effects over the fresh rows to restore
        # the intended state. (First-time uploads have no approved docs → a no-op.)
        from app.routers.staff import reapply_task_exchanges
        reapply_task_exchanges(db, mgr_id, date)

        # Tell this unit's supervisor their verifix data landed for this date so
        # they can make their changes (exchanges, role changes, deletions) and
        # close the day. The day's close-state is intentionally left untouched —
        # a re-upload over an already-closed day notifies but stays closed.
        # Best-effort: a missing supervisor or Telegram hiccup must not fail the
        # upload, and the notification commits together with the attendance rows.
        try:
            from app.routers.staff import notify_supervisor_verifix_upload
            notify_supervisor_verifix_upload(db, mgr_id, date)
        except Exception:
            pass

        db.commit()
        results.append({"file": f.filename, "status": "ok", "rows_inserted": inserted})

    return {"results": results}


class DeleteAttendanceBody(BaseModel):
    date: str
    manager_ids: list[int]


@router.post("/delete-attendance")
def delete_attendance(
    body: DeleteAttendanceBody,
    _: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """Wipe a whole day's footprint for the given supervisors (units) — used to
    undo a verifix upload that landed on the wrong date.

    For each (manager, date) this removes the attendance rows AND everything that
    hangs off them so the day is fully reset (not left "closed but empty" or with
    orphaned edit requests / documents): EditRequest, HrDocument (+history via DB
    cascade), DayApproval, DailySubmission. A subsequent correctly-named upload
    recreates the day cleanly.
    """
    try:
        d = datetime.strptime(body.date, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid date format (expected YYYY-MM-DD)")

    if not body.manager_ids:
        raise HTTPException(status_code=400, detail="No supervisors selected")

    results = []
    total_rows = 0
    for mgr_id in body.manager_ids:
        manager = db.query(Manager).filter(Manager.id == mgr_id).first()
        if not manager:
            results.append({"manager_id": mgr_id, "status": "error", "detail": "Manager not found"})
            continue

        rows = db.query(Attendance).filter(
            Attendance.manager_id == mgr_id, Attendance.date == d,
        ).delete(synchronize_session=False)
        db.query(EditRequest).filter(
            EditRequest.manager_id == mgr_id, EditRequest.date == d,
        ).delete(synchronize_session=False)
        db.query(HrDocument).filter(
            HrDocument.manager_id == mgr_id, HrDocument.date == d,
        ).delete(synchronize_session=False)
        db.query(DayApproval).filter(
            DayApproval.manager_id == mgr_id, DayApproval.date == d,
        ).delete(synchronize_session=False)
        db.query(DailySubmission).filter(
            DailySubmission.manager_id == mgr_id, DailySubmission.date == d,
        ).delete(synchronize_session=False)

        total_rows += rows
        results.append({
            "manager_id": mgr_id,
            "manager_name": manager.name,
            "status": "ok",
            "rows_deleted": rows,
        })

    db.commit()
    return {"date": body.date, "rows_deleted": total_rows, "results": results}


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
    _: dict = Depends(verify_refresh_access),
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
            # Stamp the sync time so the Leaders page can show "last updated".
            meta = db.query(LeaderSyncMeta).filter_by(id=1).first()
            if not meta:
                meta = LeaderSyncMeta(id=1)
                db.add(meta)
            meta.last_synced = datetime.now(timezone.utc)
            meta.ok = True
            meta.message = None
            meta.row_count = result.get("leader_rows", 0)
            db.commit()
            return {"status": "ok", "sheet": name, **result}

        if name == "quality":
            result = sync_quality_sheet(src.sheet_id, db)
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


# ── Telegram file_id viewer ───────────────────────────────────────────────────
# The bot answers any media an admin sends with its file_id; the admin panel's
# «Media» tab pastes that id back here to look at the file. Telegram's file URL
# embeds the bot token, so it can never reach the browser — the backend
# resolves the id with getFile and proxies the bytes itself.

_TG_API = "https://api.telegram.org"

# Extensions Telegram serves that mimetypes doesn't know (or gets wrong).
_TG_MIME_OVERRIDES = {
    ".oga": "audio/ogg",
    ".ogg": "audio/ogg",
    ".webp": "image/webp",
    ".tgs": "application/gzip",     # animated sticker (lottie) — not renderable
    ".webm": "video/webm",
}


def _tg_get_file(file_id: str) -> dict:
    """getFile → {file_path, file_size, file_unique_id}. Raises the Telegram
    error as an HTTP error so the panel can show why an id didn't resolve."""
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="Bot token not configured")
    try:
        r = requests.get(
            f"{_TG_API}/bot{settings.telegram_bot_token}/getFile",
            params={"file_id": file_id}, timeout=20,
        )
        body = r.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(status_code=502, detail="Telegram API unreachable")
    if not body.get("ok"):
        # 400 "wrong file_id" / "file is too big" — surface Telegram's wording.
        raise HTTPException(status_code=404, detail=body.get("description") or "File not found")
    return body.get("result") or {}


def _tg_media_kind(mime: str, path: str) -> str:
    """How the panel should render it: image / video / audio / file."""
    if path.lower().endswith(".tgs"):
        return "file"                      # lottie archive, no <img> can show it
    for prefix in ("image", "video", "audio"):
        if mime.startswith(prefix):
            return prefix
    return "file"


def _tg_file_meta(file_id: str) -> dict:
    result = _tg_get_file(file_id)
    path = result.get("file_path") or ""
    ext = ("." + path.rsplit(".", 1)[-1].lower()) if "." in path else ""
    mime = _TG_MIME_OVERRIDES.get(ext) or mimetypes.guess_type(path)[0] or "application/octet-stream"
    return {
        "file_id":        file_id,
        "file_unique_id": result.get("file_unique_id"),
        "file_path":      path,
        "file_name":      path.rsplit("/", 1)[-1] or "file",
        "file_size":      result.get("file_size"),
        "mime_type":      mime,
        "kind":           _tg_media_kind(mime, path),
    }


@router.get("/tg-file")
def admin_tg_file_info(file_id: str, _: dict = Depends(verify_admin)):
    """Resolve a file_id to metadata (no bytes) so the panel knows what to render."""
    return _tg_file_meta(file_id.strip())


@router.get("/tg-file/raw")
def admin_tg_file_raw(file_id: str, _: dict = Depends(verify_admin)):
    """Stream the file itself. Fetched as a blob by the panel (the JWT rides on
    the Authorization header, so this can't be a plain <img src>)."""
    meta = _tg_file_meta(file_id.strip())
    if not meta["file_path"]:
        raise HTTPException(status_code=404, detail="File has no download path")
    url = f"{_TG_API}/file/bot{settings.telegram_bot_token}/{meta['file_path']}"
    try:
        upstream = requests.get(url, stream=True, timeout=60)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="Telegram file download failed")
    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(status_code=404, detail="File no longer available")

    def _chunks():
        try:
            yield from upstream.iter_content(chunk_size=64 * 1024)
        finally:
            upstream.close()

    headers = {
        "Content-Disposition": f'inline; filename="{meta["file_name"]}"',
        "Cache-Control": "no-store",
    }
    if meta["file_size"]:
        headers["Content-Length"] = str(meta["file_size"])
    return StreamingResponse(_chunks(), media_type=meta["mime_type"], headers=headers)
