from typing import Annotated, Optional
from datetime import datetime, timezone
import logging
import mimetypes
import os
import tempfile

import requests
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app import identity
from app.capability_alerts import alert_grant_use, tv
from app.capabilities import (
    CAP_CELLS_MANAGE, CAP_CLEANUP, CAP_PROFILES_MANAGE, CAP_USERS_MANAGE,
    CAPABILITIES, CAPABILITY_GROUPS, CAPABILITY_KEYS, SCOPES, UNGRANTABLE_ROLES,
    apply_caps, cap_scope, profile_unit_ids, require_cap,
)
from app.config import settings
from app.database import get_db
from app.models import (
    Admin, Manager, Attendance, CapabilityAudit, CapabilityUse, UserCapability,
    RoleProfile, SheetSource, AppSetting, TelegramUser, TelegramUserRole,
    EditRequest, HrDocument, DayApproval, DailySubmission, LeaderSyncMeta,
    Cell, CellAttendance,
)
from app.services.verifix_parser import parse_verifix_file
from app.services.cell_attendance_parser import parse_cell_attendance_file
from app.services.sheets_sync import (
    sync_source_sheet, sync_shift_report_sheet, sync_leaders_sheet, sync_quality_sheet,
)
from app.permissions import get_page_access, set_page_access, role_can_access, PAGE_KEYS, TOGGLEABLE_ROLES
from app.routers.auth import VALID_ROLES
from app.upload_guard import validate_spreadsheet

log = logging.getLogger(__name__)

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
        try:
            validate_spreadsheet(f, content)
        except HTTPException as e:
            results.append({"file": f.filename, "status": "error", "detail": e.detail})
            continue
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


@router.post("/cell-attendance/upload")
async def upload_cell_attendance(
    files: list[UploadFile] = File(...),
    admin_payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    """TEST-MODE per-cell attendance ingest → the isolated `cell_attendance`
    table (a step toward per-cell zagruzka). Deliberately does NOT touch the
    per-manager `attendance` flow: no supervisor notification, no day-close, no
    task-exchange reapply. Re-uploading a day performs a whole-date replace —
    every existing row for the date(s) the file covers is wiped first."""
    # Resolve «Код подразделения» → cell id once (rows are kept even when a code
    # has no matching cell — the raw code is always stored).
    code_to_cell = {
        row.verifix_code: row.id
        for row in db.query(Cell.id, Cell.verifix_code).all()
        if row.verifix_code
    }

    results = []
    for f in files:
        content = await f.read()
        try:
            validate_spreadsheet(f, content)
        except HTTPException as e:
            results.append({"file": f.filename, "status": "error", "detail": e.detail})
            continue

        try:
            period_from, period_to, export_ts, dates, records = parse_cell_attendance_file(content, f.filename)
        except Exception as e:  # noqa: BLE001 — surface any parse failure per-file
            results.append({"file": f.filename, "status": "error", "detail": f"Parse error: {e}"})
            continue

        if period_from is None:
            results.append({"file": f.filename, "status": "error", "detail": "Could not read «Период» date from the sheet"})
            continue
        if not records:
            results.append({"file": f.filename, "status": "error", "detail": "No attendance rows found (unexpected layout?)"})
            continue

        # Whole-date replace: wipe every existing row for the covered day(s).
        if dates:
            db.query(CellAttendance).filter(
                CellAttendance.date.in_(dates)
            ).delete(synchronize_session=False)

        unmatched = set()
        for r in records:
            cid = code_to_cell.get(r["verifix_code"])
            if r["verifix_code"] and cid is None:
                unmatched.add(r["verifix_code"])
            db.add(CellAttendance(
                cell_id=cid,
                source_filename=f.filename,
                export_ts=export_ts,
                **r,
            ))
        db.commit()

        sample = [
            {
                "date":         r["date"].isoformat(),
                "verifix_code": r["verifix_code"],
                "worker_name":  r["worker_name"],
                "job_title":    r["job_title"],
                "day_raw":      r["day_raw"],
                "hours_worked": r["hours_worked"],
                "status":       r["status"],
            }
            for r in records[:15]
        ]
        results.append({
            "file":            f.filename,
            "status":          "ok",
            "rows_inserted":   len(records),
            "period_from":     period_from.isoformat(),
            "period_to":       period_to.isoformat() if period_to else period_from.isoformat(),
            "days":            len(dates),
            "cells":           sorted({r["verifix_code"] for r in records if r["verifix_code"]}),
            "unmatched_codes": sorted(unmatched),
            "sample":          sample,
        })

    return {"results": results}


class DeleteAttendanceBody(BaseModel):
    date: str
    manager_ids: list[int]


@router.post("/delete-attendance")
def delete_attendance(
    body: DeleteAttendanceBody,
    caller: dict = Depends(require_cap(CAP_CLEANUP)),
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

    # This wipes a day irreversibly, so an "own"-scoped grant must not reach a
    # unit outside the profile's normal scoping. Refuse the whole call rather
    # than silently skipping units — a partial wipe is worse than none.
    if caller.get("role") != "admin" and cap_scope(db, caller, CAP_CLEANUP) != "all":
        allowed = profile_unit_ids(db, identity.viewer_profile_key(db, caller))
        if allowed is not None and any(m not in allowed for m in body.manager_ids):
            raise HTTPException(status_code=403, detail="Some units are outside your scope")

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
    alert_grant_use(
        db, caller, CAP_CLEANUP, "cleanup.wipe",
        details=[("date", body.date), ("deleted_rows", total_rows)],
        changes=[(r["manager_name"], r["rows_deleted"], None)
                 for r in results if r["status"] == "ok"],
    )
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
    _: dict = Depends(require_cap(CAP_USERS_MANAGE)),
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
            # Telegram account name — the only field that identifies WHICH
            # account filed a request (full_name mirrors the claimed profile).
            "tg_name":     u.tg_name,
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
    admin_payload: dict = Depends(require_cap(CAP_USERS_MANAGE)),
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role_row = db.query(TelegramUserRole).filter_by(
        id=role_ref, telegram_id=user.telegram_id,
    ).first()
    if not role_row:
        raise HTTPException(status_code=404, detail="Role not found")

    old = {"role": role_row.role, "role_id": role_row.role_id, "status": role_row.status}

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

    alert_changes = []
    if payload.role is not None and payload.role != old["role"]:
        alert_changes.append(("role", tv("role." + old["role"]), tv("role." + payload.role)))
    if payload.role_id is not None and payload.role_id != old["role_id"]:
        alert_changes.append(("profile", old["role_id"], payload.role_id))
    if payload.status is not None and payload.status != old["status"]:
        alert_changes.append(("status", old["status"], payload.status))
    if alert_changes:
        alert_grant_use(
            db, admin_payload, CAP_USERS_MANAGE, "user.role_updated",
            details=[("user", user.full_name or user.tg_name or f"#{user.telegram_id}"),
                     ("account", user.telegram_id),
                     ("profile", role_row.full_name)],
            changes=alert_changes,
        )

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
    caller: dict = Depends(require_cap(CAP_USERS_MANAGE)),
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
    # The profile being granted. payload.role_id already IS the profile id for
    # every role (managers.id for supervisors), so the grant records the exact
    # identity instead of leaving it to be re-derived from (unit, name) later.
    pkey = f"{payload.role}:{payload.role_id}"

    # Leaders share role_id (the unit) across every leader profile in it, so a
    # (telegram_id, role, role_id) lookup would collide with a DIFFERENT leader
    # profile the user already holds — 409ing, or silently re-pointing that
    # registration and stripping the first profile of its holder. Match the
    # profile itself.
    q = db.query(TelegramUserRole).filter_by(
        telegram_id=user.telegram_id, role=payload.role, role_id=role_id,
    )
    if payload.role == "leader":
        existing = q.filter(or_(TelegramUserRole.profile_key == pkey,
                                and_(TelegramUserRole.profile_key.is_(None),
                                     TelegramUserRole.full_name == full_name))).first()
    else:
        existing = q.first()

    if existing:
        if existing.status == "approved":
            raise HTTPException(status_code=409, detail="User already has this role")
        existing.status = "approved"
        existing.approved_at = now
        existing.full_name = full_name
        existing.profile_key = pkey
    else:
        db.add(TelegramUserRole(
            telegram_id=user.telegram_id,
            role=payload.role,
            role_id=role_id,
            full_name=full_name,
            profile_key=pkey,
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

    alert_grant_use(
        db, caller, CAP_USERS_MANAGE, "user.role_added",
        details=[("user", user.full_name or user.tg_name or f"#{telegram_id}"),
                 ("account", telegram_id),
                 ("role", tv("role." + payload.role)),
                 ("profile", full_name)],
        changes=[("status", None, tv("v.approved"))],
    )
    return {"ok": True}


@router.delete("/users/{user_id}/roles/{role_ref}")
def delete_user_role(
    user_id: int,
    role_ref: int,
    db: Session = Depends(get_db),
    caller: dict = Depends(require_cap(CAP_USERS_MANAGE)),
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

    # Snapshots for the grant-use warning — both rows may be gone after commit.
    alert_details = [("user", user.full_name or user.tg_name or f"#{user.telegram_id}"),
                     ("account", user.telegram_id),
                     ("role", tv("role." + role_row.role)),
                     ("profile", role_row.full_name)]

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
    if user_deleted:
        alert_details.append(("status", tv("v.account_deleted")))
    alert_grant_use(db, caller, CAP_USERS_MANAGE, "user.role_removed",
                    details=alert_details,
                    changes=[("status", tv("v.approved"), None)])
    return {"ok": True, "user_deleted": user_deleted}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    caller: dict = Depends(require_cap(CAP_USERS_MANAGE)),
):
    user = db.query(TelegramUser).filter(TelegramUser.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    telegram_id = user.telegram_id
    # "A grantee can never touch admin profiles" applies to the accounts that
    # hold them too — otherwise deleting the admins out of the way would be the
    # way around every other guard. Role assignment needs no such check:
    # VALID_ROLES has no "admin", so no user-role endpoint can mint one.
    if caller.get("role") != "admin" and db.query(Admin).filter_by(telegram_id=telegram_id).first():
        raise HTTPException(status_code=403, detail="Only an admin can remove an admin account")
    alert_details = [("user", user.full_name or user.tg_name or f"#{telegram_id}"),
                     ("account", telegram_id)]
    roles_removed = db.query(TelegramUserRole).filter_by(telegram_id=telegram_id).delete()
    db.delete(user)
    db.commit()
    try:
        from app.telegram_bot import forget_registration_notices
        forget_registration_notices(telegram_id)
    except Exception:
        pass
    alert_details.append(("count", roles_removed))
    alert_grant_use(db, caller, CAP_USERS_MANAGE, "user.deleted",
                    details=alert_details)
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


# ── Per-profile capabilities ──────────────────────────────────────────────────
# The per-person half of the permission system (see app/capabilities.py). Always
# `verify_admin`, never `require_cap`: the power to hand out powers is
# deliberately absent from the catalog, so a grantee can never widen their own
# access or a colleague's.

@router.get("/capabilities")
def admin_list_capabilities(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """The catalog plus every grant, keyed by Telegram account, as a
    role ▸ profile ▸ user tree.

    Capabilities are granted per ACCOUNT now, so the picker descends past the
    profile to the individual logins that hold it — the same tree the Broadcast
    recipient picker builds. Admin profiles are omitted (those accounts already
    hold the whole catalog), and a profile nobody has claimed simply shows no
    users to grant, since a grant needs a login to attach to."""
    from app.routers.broadcast import _profile_holders, _stored_names

    grants: dict[int, dict[str, str]] = {}
    for row in db.query(UserCapability).all():
        if row.capability in CAPABILITY_KEYS:
            grants.setdefault(row.telegram_id, {})[row.capability] = (
                row.scope if row.scope in SCOPES else "own")

    # Reuse the Broadcast recipient structure (role → profile → holder ids) and
    # the best-stored-name resolver, so the two pickers read identically.
    blocks = _profile_holders(db)
    names = _stored_names(db, blocks)
    users = {u.telegram_id: u for u in db.query(TelegramUser).all()}

    def user_node(tid: int) -> dict:
        u = users.get(tid)
        return {
            "telegram_id": tid,
            "name":        names.get(tid) or f"#{tid}",
            "username":    u.username if u else None,
            "caps":        grants.get(tid, {}),
        }

    # `shift` / `unit` stay structured rather than a pre-joined caption, so the
    # frontend renders them through t()/tl() in the viewer's language.
    tree = []
    for b in blocks:
        if b["role"] in UNGRANTABLE_ROLES:   # admins already hold everything
            continue
        profiles = []
        for p in b["profiles"]:
            node = {k: p[k] for k in ("key", "name", "shift", "unit", "unit_id") if k in p}
            node["users"] = [user_node(t) for t in p["user_ids"]]
            profiles.append(node)
        tree.append({"role": b["role"], "profiles": profiles})

    return {
        "capabilities": CAPABILITIES,
        "groups":       CAPABILITY_GROUPS,
        "scopes":       list(SCOPES),
        "tree":         tree,
    }


class CapabilitiesPayload(BaseModel):
    keys:    list[int]            # telegram ids to apply the change to
    grants:  dict[str, str] = {}  # {capability: "own" | "all"} to add / rescope
    revokes: list[str] = []       # capabilities to remove


@router.put("/capabilities")
def admin_set_capabilities(
    payload: CapabilitiesPayload,
    db: Session = Depends(get_db),
    admin_payload: dict = Depends(verify_admin),
):
    """Apply one capability DIFF to one or many Telegram accounts.

    A diff rather than a whole-set replace because the Permissions tab selects
    several accounts at once and they rarely hold the same grants — replacing
    would wipe whatever the admin wasn't looking at. Granting an admin account
    is a harmless no-op (they already hold everything via the role check), so no
    special rejection is needed here."""
    if not payload.keys:
        raise HTTPException(status_code=400, detail="No users selected")

    if any(tid <= 0 for tid in payload.keys):
        raise HTTPException(status_code=400, detail="Invalid telegram id")

    unknown = [k for k in list(payload.grants) + payload.revokes if k not in CAPABILITY_KEYS]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown capability: {unknown[0]}")

    caps = apply_caps(
        db, payload.keys, payload.grants, payload.revokes,
        actor_name=admin_payload.get("full_name"),
        actor_telegram_id=int(admin_payload["sub"]),
    )
    return {"status": "ok", "caps": caps}


@router.get("/capabilities/audit")
def admin_capability_audit(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Newest-first grant/revoke history. Survives the grant itself: a revoked
    capability deletes its UserCapability row but never its audit trail.

    Each row's target account is resolved to a display name; pre-rollout rows
    carry a ``profile_key`` instead of a ``telegram_id`` and fall back to it."""
    rows = (db.query(CapabilityAudit)
              .order_by(CapabilityAudit.id.desc())
              .limit(max(1, min(limit, 1000))).all())

    tids = {r.telegram_id for r in rows if r.telegram_id}
    names: dict[int, str] = {}
    if tids:
        for u in db.query(TelegramUser).filter(TelegramUser.telegram_id.in_(tids)).all():
            names[u.telegram_id] = (
                u.tg_name or u.full_name or (f"@{u.username}" if u.username else "") or f"#{u.telegram_id}")

    def target_name(r) -> str:
        if r.telegram_id:
            return names.get(r.telegram_id) or f"#{r.telegram_id}"
        return r.profile_key or "—"

    return [{
        "id":          r.id,
        "telegram_id": r.telegram_id,
        "target_name": target_name(r),
        "capability":  r.capability,
        "action":      r.action,
        "scope":       r.scope,
        "actor_name":  r.actor_name,
        "created_at":  r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


@router.get("/capability-uses")
def admin_capability_uses(
    limit: int = 50,
    offset: int = 0,
    lang: str = "uz",
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Admin «Action history» tab: the persistent log of granted-capability
    USES — capability_alerts writes one row per warned action, so this list and
    the warning DMs always agree. verify_admin like the Permissions tab:
    oversight of delegated powers stays a real admin's job. Rows arrive
    pre-rendered for ``lang`` through the same 4-lang table as the DMs."""
    from app.capability_alerts import render_use
    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    q = db.query(CapabilityUse).order_by(CapabilityUse.id.desc())
    total = q.count()
    out = []
    for r in q.offset(offset).limit(limit).all():
        try:
            out.append(render_use(r, lang))
        except Exception:
            continue   # one malformed legacy row must not blank the tab
    return {"total": total, "rows": out}


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


# ── Full database dump → Telegram DM ──────────────────────────────────────────
#
# ahost has no pg_dump binary and no psql, so the only way to get the database
# off it is from inside the app. Admin-only and deliberately NOT capability-
# grantable: the file is every phone number, name and stored secret in one
# place, so it stays a real admin's action (see app/db_dump.py).

# Bot API caps sendDocument at 50 MB; leave headroom for the multipart envelope.
_TG_DOC_LIMIT = 45 * 1024 * 1024


def _human_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024.0


def _split_dump(path: str, base: str) -> list[tuple[str, str]]:
    """Cut an over-limit dump into (path, filename) parts of _TG_DOC_LIMIT."""
    parts: list[tuple[str, str]] = []
    with open(path, "rb") as src:
        idx = 1
        while True:
            chunk = src.read(_TG_DOC_LIMIT)
            if not chunk:
                break
            ppath = f"{path}.part{idx:03d}"
            with open(ppath, "wb") as out:
                out.write(chunk)
            parts.append((ppath, f"{base}.part{idx:03d}"))
            idx += 1
    return parts


def _send_db_dump(tg_id: int, include_drops: bool) -> None:
    """Build the dump and DM it. Runs after the response — never inline, since
    a large database takes longer than a gateway is willing to wait."""
    from app import db_dump
    from app.telegram_bot import bot

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
    base  = f"safia_db_{stamp}.sql.gz"
    fd, tmp_path = tempfile.mkstemp(prefix="safia_dump_", suffix=".sql.gz")
    os.close(fd)
    cleanup = [tmp_path]

    try:
        stats = db_dump.dump_to_file(tmp_path, include_drops=include_drops)
        size  = stats["bytes"]
        log.info("db-dump: %s tables, %s rows, %s for tg=%s",
                 stats["tables"], stats["rows"], _human_bytes(size), tg_id)

        caption = (f"🗄 Full database dump\n"
                   f"{stats['tables']} tables · {stats['rows']:,} rows · {_human_bytes(size)}\n"
                   f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]} {stamp[9:11]}:{stamp[11:]} UTC")

        if size <= _TG_DOC_LIMIT:
            with open(tmp_path, "rb") as fh:
                bot.send_document(chat_id=tg_id, document=(base, fh),
                                  caption=caption, timeout=600)
            n_parts = 1
        else:
            parts = _split_dump(tmp_path, base)
            cleanup += [p for p, _ in parts]
            n_parts = len(parts)
            for i, (ppath, pname) in enumerate(parts, 1):
                with open(ppath, "rb") as fh:
                    bot.send_document(
                        chat_id=tg_id, document=(pname, fh), timeout=600,
                        caption=(f"{caption}\nPart {i}/{n_parts}" if i == 1
                                 else f"Part {i}/{n_parts}"))

        steps = ["<b>Restore on the new server</b>"]
        if n_parts > 1:
            steps.append(f"0) Rejoin the parts:\n<pre>cat {base}.part* &gt; {base}</pre>")
        steps += [
            "1) Create an empty database and role there (once).",
            f"2) Import:\n<pre>gunzip -c {base} | psql \"$DATABASE_URL\"</pre>",
            "3) Point <code>backend/.env</code> at the new DATABASE_URL and restart Passenger.",
            "The script runs in one transaction — if it fails, nothing is applied.",
            "⚠️ This file holds all personal data. Delete this message once restored.",
        ]
        if stats.get("skipped"):
            # Never let a hand-made trigger/domain vanish quietly in a move.
            items = "\n".join(f"• {s}" for s in stats["skipped"][:20])
            steps.insert(1, f"<b>Not in the dump — recreate by hand:</b>\n{items}")
        bot.send_message(tg_id, "\n\n".join(steps), parse_mode="HTML")

    except Exception as e:                                    # noqa: BLE001
        log.exception("db-dump failed for tg=%s", tg_id)
        try:
            bot.send_message(tg_id, f"❌ Database dump failed:\n<pre>{str(e)[:900]}</pre>",
                             parse_mode="HTML")
        except Exception:
            pass
    finally:
        for p in cleanup:
            try:
                os.unlink(p)
            except OSError:
                pass


class DbDumpBody(BaseModel):
    include_drops: bool = True


@router.get("/db-dump/inventory")
def admin_db_dump_inventory(_: dict = Depends(verify_admin)):
    """What the dump would contain — estimated rows and on-disk size per table."""
    from app import db_dump

    rows = db_dump.table_inventory()
    return {"tables": rows, "total_bytes": sum(r["bytes"] for r in rows)}


@router.post("/db-dump")
def admin_db_dump(
    body: DbDumpBody,
    background: BackgroundTasks,
    caller: dict = Depends(verify_admin),
):
    """Dump the whole database and DM it to the caller as a .sql.gz file."""
    tg_id = int(caller["sub"])
    background.add_task(_send_db_dump, tg_id, body.include_drops)
    return {"ok": True}
