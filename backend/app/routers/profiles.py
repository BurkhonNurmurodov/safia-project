"""
Pre-created profiles.

Admins create every identity here (Profiles tab); registration only binds one
of them to a Telegram account — nobody types a name at registration anymore.

Profile storage:
  supervisor              → the `managers` row itself (id = Verifix file id)
  top-manager / shift-manager / leader / admin / guest → `role_profiles`

Guest is the one exception to "admins create every identity": a guest profile
is auto-created (or re-claimed) during bot registration and only managed here
(rename / delete / unassign) — there is no admin "create guest" path.

Binding resolution (who holds a profile):
  supervisor      telegram_user_roles: role='supervisor',   role_id = manager.id
  shift-manager   telegram_user_roles: role='shift-manager',role_id = profile.id
  top-manager     telegram_user_roles: role='top-manager',  role_id = profile.id
  guest           telegram_user_roles: role='guest',        role_id = profile.id
  leader          telegram_user_roles: role='leader',
                  role_id = profile.manager_id AND full_name = profile.name
                  (leader role rows keep pointing at the unit — JWT/Concerns contract)
  admin           admins.profile_id = profile.id

Multilingual names: one canonical (Uzbek Latin) name per profile; per-language
display variants are `name.<canonical>` override keys in `translations`
(rendered by the frontend tl() helper, auto-transliterated when absent).
"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    Admin, Cell, LeaderConcern, LeaderTask, Manager, RoleProfile, TelegramUser,
    TelegramUserRole, Translation,
)
from app.reg_token import validate_reg_token
from app.routers.admin import verify_admin
from app.routers.auth import _validate_init_data

router = APIRouter(prefix="/api/profiles", tags=["profiles"])
_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")

PROFILE_TYPES = {"top-manager", "shift-manager", "supervisor", "leader", "admin", "guest"}

# Every relational column that keys on managers.id — used when an admin
# re-keys a supervisor's Verifix ID. (JSONB payloads inside hr_documents may
# embed manager ids too; those are historical snapshots and stay untouched.)
_MANAGER_ID_REFS = [
    ("attendance", "manager_id"),
    ("comments", "manager_id"),
    ("edit_requests", "manager_id"),
    ("hr_documents", "manager_id"),
    ("day_approvals", "manager_id"),
    ("daily_submissions", "manager_id"),
    ("pp_products", "manager_id"),
    ("pp_work_centers", "manager_id"),
    ("pp_daily", "manager_id"),
    ("pp_reconciliation", "manager_id"),
    ("pp_uploads", "manager_id"),
    ("leader_concerns", "brigadir_manager_id"),
    ("leader_checklists", "supervisor_manager_id"),
    ("role_profiles", "manager_id"),
]


def _caller(token: Annotated[str, Depends(_oauth2)]) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# ── Shared helpers ────────────────────────────────────────────────────────────

def _rekey_name_overrides(db: Session, old_name: str, new_name: str) -> None:
    """Move `name.<old>` translation overrides to `name.<new>` so per-language
    display variants survive a canonical rename."""
    if not old_name or old_name == new_name:
        return
    old_key, new_key = f"name.{old_name}", f"name.{new_name}"
    taken = {(t.lang, t.key) for t in db.query(Translation).filter(Translation.key == new_key).all()}
    for t in db.query(Translation).filter(Translation.key == old_key).all():
        if (t.lang, new_key) in taken:
            db.delete(t)  # target already customised — keep it, drop the stale source
        else:
            t.key = new_key


def _remove_role_row(db: Session, role_row: TelegramUserRole) -> None:
    """Delete one role binding, mirroring admin.delete_user_role semantics:
    the user's last role takes the whole account with it, and a deleted active
    role falls back to the first remaining approved one."""
    tid = role_row.telegram_id
    ref = role_row.id
    db.delete(role_row)
    remaining = (
        db.query(TelegramUserRole)
        .filter(TelegramUserRole.telegram_id == tid, TelegramUserRole.id != ref)
        .all()
    )
    user = db.query(TelegramUser).filter_by(telegram_id=tid).first()
    if not remaining:
        if user:
            db.delete(user)
    elif user and user.active_role_ref == ref:
        approved = [r for r in remaining if r.status == "approved"]
        user.active_role_ref = approved[0].id if approved else None


def _bound_role_rows(db: Session, ptype: str, pid: int) -> list[TelegramUserRole]:
    if ptype == "supervisor":
        return db.query(TelegramUserRole).filter_by(role="supervisor", role_id=pid).all()
    if ptype in ("shift-manager", "top-manager", "guest"):
        return db.query(TelegramUserRole).filter_by(role=ptype, role_id=pid).all()
    if ptype == "leader":
        p = db.query(RoleProfile).filter_by(id=pid, role="leader").first()
        if not p:
            return []
        return db.query(TelegramUserRole).filter_by(
            role="leader", role_id=p.manager_id, full_name=p.name,
        ).all()
    return []


def _rename_profile(db: Session, ptype: str, pid: int, new_name: str) -> str:
    """Canonical rename + full cascade (role rows, translation overrides).
    Returns the old name. Caller commits."""
    new_name = (new_name or "").strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name is required")

    if ptype == "supervisor":
        mgr = db.query(Manager).filter_by(id=pid).first()
        if not mgr:
            raise HTTPException(status_code=404, detail="Unit not found")
        old = mgr.name
        if old == new_name:
            return old
        mgr.name = new_name
        for r in db.query(TelegramUserRole).filter_by(role="supervisor", role_id=pid).all():
            r.full_name = new_name
    else:
        p = db.query(RoleProfile).filter_by(id=pid).first()
        if not p or p.role != ptype:
            raise HTTPException(status_code=404, detail="Profile not found")
        old = p.name
        if old == new_name:
            return old
        # Registration resolves profiles by name — block ambiguous duplicates
        # (leaders are scoped per unit, the rest per role). Guests are exempt:
        # their profiles resolve by id only, and two real people may share a
        # name.
        if ptype != "guest":
            dup = db.query(RoleProfile).filter(
                RoleProfile.role == ptype, RoleProfile.name == new_name, RoleProfile.id != pid,
            )
            if ptype == "leader":
                dup = dup.filter(RoleProfile.manager_id == p.manager_id)
            if dup.first():
                raise HTTPException(status_code=409, detail="Profile with this name already exists")
        for r in _bound_role_rows(db, ptype, pid):
            r.full_name = new_name
        p.name = new_name

    _rekey_name_overrides(db, old, new_name)
    return old


def _user_info(db: Session) -> dict[int, dict]:
    return {
        u.telegram_id: {"full_name": u.full_name, "username": u.username,
                        "phone": u.phone, "tg_name": u.tg_name}
        for u in db.query(TelegramUser).all()
    }


def _set_leader_cells(db: Session, leader_id: int, codes: list[str]) -> None:
    """Reconcile a leader's owned cells to exactly `codes`: release rows no
    longer listed (leader_id → NULL — cells are first-class rows now, their
    sap_code/workshop names survive reassignment), claim or create the rest.
    A code owned by ANOTHER leader is a 409 — cells are unique, reassign it
    from its current owner first."""
    want: list[str] = []
    for c in codes or []:
        c = " ".join((c or "").split())
        if c and c not in want:
            want.append(c)
    existing = db.query(Cell).filter_by(leader_id=leader_id).all()
    for row in existing:
        if row.verifix_code not in want:
            row.leader_id = None
    have = {row.verifix_code for row in existing}
    for code in want:
        if code in have:
            continue
        row = db.query(Cell).filter_by(verifix_code=code).first()
        if row and row.leader_id not in (None, leader_id):
            owner = db.query(RoleProfile).filter_by(id=row.leader_id).first()
            raise HTTPException(
                status_code=409,
                detail=f"Cell {code} is already assigned to "
                       f"{owner.name if owner else 'another leader'}")
        if row:
            row.leader_id = leader_id
        else:
            db.add(Cell(verifix_code=code, leader_id=leader_id))


def _release_leader_cells(db: Session, leader_id: int) -> None:
    """Unassign every cell owned by the profile (delete + role switch away from
    leader). The rows stay — cell metadata outlives its owner."""
    db.query(Cell).filter_by(leader_id=leader_id).update({"leader_id": None})


def _manager_has_data(db: Session, manager_id: int) -> bool:
    for table, col in _MANAGER_ID_REFS:
        if table == "role_profiles":
            continue  # leader profiles are config, not history — deleted along
        row = db.execute(
            text(f"SELECT 1 FROM {table} WHERE {col} = :mid LIMIT 1"), {"mid": manager_id}
        ).first()
        if row:
            return True
    return False


# ── Admin: list ───────────────────────────────────────────────────────────────

@router.get("/admin/list")
def admin_list_profiles(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    users = _user_info(db)

    def binding(r: TelegramUserRole) -> dict:
        info = users.get(r.telegram_id, {})
        return {
            "role_ref":    r.id,
            "telegram_id": r.telegram_id,
            "status":      r.status,
            "user_name":   info.get("full_name"),
            "username":    info.get("username"),
            "tg_name":     info.get("tg_name"),
        }

    role_rows = db.query(TelegramUserRole).order_by(TelegramUserRole.id).all()
    by_key: dict[tuple, list] = {}
    for r in role_rows:
        if r.status == "rejected":
            continue
        by_key.setdefault((r.role, r.role_id), []).append(r)

    supervisors = []
    for m in db.query(Manager).order_by(Manager.id).all():
        supervisors.append({
            "id": m.id, "name": m.name, "shift": m.shift, "archived": bool(m.archived),
            "has_data": _manager_has_data(db, m.id),
            "bindings": [binding(r) for r in by_key.get(("supervisor", m.id), [])],
        })

    profiles = db.query(RoleProfile).order_by(RoleProfile.id).all()
    mgr_names = {m.id: m.name for m in db.query(Manager).all()}
    admin_rows = db.query(Admin).all()
    admins_by_profile = {a.profile_id: a for a in admin_rows if a.profile_id}
    cell_rows = db.query(Cell).order_by(Cell.verifix_code).all()
    cells_by_leader: dict[int, list[str]] = {}
    for c in cell_rows:
        if c.leader_id:
            cells_by_leader.setdefault(c.leader_id, []).append(c.verifix_code)

    out = {"supervisors": supervisors, "top_managers": [], "shift_managers": [],
           "leaders": [], "admins": [], "guests": []}
    for p in profiles:
        item = {"id": p.id, "name": p.name, "name_uz_cyrl": p.name_uz_cyrl,
                "name_ru": p.name_ru, "name_en": p.name_en}
        if p.role == "top-manager":
            item["bindings"] = [binding(r) for r in by_key.get(("top-manager", p.id), [])]
            out["top_managers"].append(item)
        elif p.role == "guest":
            item["bindings"] = [binding(r) for r in by_key.get(("guest", p.id), [])]
            out["guests"].append(item)
        elif p.role == "shift-manager":
            item["shift"] = p.shift
            item["bindings"] = [binding(r) for r in by_key.get(("shift-manager", p.id), [])]
            out["shift_managers"].append(item)
        elif p.role == "leader":
            item["manager_id"] = p.manager_id
            item["supervisor"] = mgr_names.get(p.manager_id)
            item["cells"] = cells_by_leader.get(p.id, [])
            item["bindings"] = [
                binding(r) for r in by_key.get(("leader", p.manager_id), [])
                if r.full_name == p.name
            ]
            out["leaders"].append(item)
        elif p.role == "admin":
            a = admins_by_profile.get(p.id)
            info = users.get(a.telegram_id, {}) if a else {}
            item["bindings"] = [{
                "role_ref": None, "telegram_id": a.telegram_id, "status": "approved",
                "user_name": info.get("full_name"), "username": info.get("username"),
                "tg_name": info.get("tg_name"),
            }] if a else []
            # pending /adminreg requests for this profile
            item["bindings"] += [
                binding(r) for r in db.query(TelegramUserRole)
                .filter_by(role="admin", role_id=p.id, status="pending").all()
            ]
            out["admins"].append(item)

    out["assigned_admin_count"] = sum(1 for a in admin_rows)
    # Every known cell code, sorted — informational for the admin UI.
    out["cells"] = [c.code for c in cell_rows]
    return out


# ── Admin: create ─────────────────────────────────────────────────────────────

class CreateProfilePayload(BaseModel):
    role:       str
    name:       str
    shift:      Optional[int] = None        # shift-manager | supervisor
    manager_id: Optional[int] = None        # leader → supervisor unit
    cells:      Optional[list[str]] = None  # leader → owned cell codes (optional)
    verifix_id: Optional[int] = None        # supervisor → managers.id


@router.post("/admin")
def admin_create_profile(payload: CreateProfilePayload, db: Session = Depends(get_db),
                         _: dict = Depends(verify_admin)):
    role = payload.role
    name = (payload.name or "").strip()
    if role not in PROFILE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid profile type")
    # Guest profiles are the registration flow's own creation — no admin path.
    if role == "guest":
        raise HTTPException(status_code=400, detail="Guest profiles are created at registration")
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    if role == "supervisor":
        if not payload.verifix_id or payload.verifix_id <= 0:
            raise HTTPException(status_code=400, detail="Verifix ID is required")
        if payload.shift not in (1, 2):
            raise HTTPException(status_code=400, detail="Shift must be 1 or 2")
        if db.query(Manager).filter_by(id=payload.verifix_id).first():
            raise HTTPException(status_code=409, detail="Verifix ID already in use")
        db.add(Manager(id=payload.verifix_id, name=name, shift=payload.shift, archived=False))
        db.commit()
        return {"ok": True, "id": payload.verifix_id}

    if role == "shift-manager":
        if payload.shift not in (1, 2):
            raise HTTPException(status_code=400, detail="Shift must be 1 or 2")
        # Registration resolves shift-managers by name — duplicates would be ambiguous.
        if db.query(RoleProfile).filter_by(role=role, name=name).first():
            raise HTTPException(status_code=409, detail="Profile with this name already exists")
        p = RoleProfile(role=role, name=name, shift=payload.shift)
    elif role == "leader":
        mgr = db.query(Manager).filter_by(id=payload.manager_id).first()
        if not mgr:
            raise HTTPException(status_code=400, detail="Supervisor unit not found")
        dup = db.query(RoleProfile).filter_by(role="leader", name=name,
                                              manager_id=payload.manager_id).first()
        if dup:
            raise HTTPException(status_code=409, detail="This leader already exists")
        p = RoleProfile(role=role, name=name, manager_id=payload.manager_id)
    else:  # top-manager | admin
        if db.query(RoleProfile).filter_by(role=role, name=name).first():
            raise HTTPException(status_code=409, detail="Profile with this name already exists")
        p = RoleProfile(role=role, name=name)

    db.add(p)
    if role == "leader" and payload.cells:
        db.flush()  # p.id must exist before cells can point at it
        _set_leader_cells(db, p.id, payload.cells)
    db.commit()
    return {"ok": True, "id": p.id}


# ── Admin: update ─────────────────────────────────────────────────────────────

class UpdateProfilePayload(BaseModel):
    name:           Optional[str] = None
    shift:          Optional[int] = None
    manager_id:     Optional[int] = None        # leader → move to another unit
    cells:          Optional[list[str]] = None  # leader → replace owned cell codes
    new_verifix_id: Optional[int] = None        # supervisor → re-key managers.id
    archived:       Optional[bool] = None       # supervisor only
    overrides:      Optional[dict[str, str]] = None  # lang → display name ("" clears)


def _apply_overrides(db: Session, canonical: str, overrides: dict[str, str]) -> None:
    # The session runs with autoflush=False; a rename in the same request keeps
    # its rekeyed override rows pending, invisible to the SELECTs below — flush
    # first or the inserts collide with them on uq_translation_lang_key.
    db.flush()
    key = f"name.{canonical}"
    for lang, value in overrides.items():
        row = db.query(Translation).filter_by(lang=lang, key=key).first()
        value = (value or "").strip()
        if value:
            if row:
                row.value = value
            else:
                db.add(Translation(lang=lang, key=key, value=value))
        elif row:
            db.delete(row)


@router.put("/admin/{ptype}/{pid}")
def admin_update_profile(ptype: str, pid: int, payload: UpdateProfilePayload,
                         db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    if ptype not in PROFILE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid profile type")

    if ptype == "supervisor":
        mgr = db.query(Manager).filter_by(id=pid).first()
        if not mgr:
            raise HTTPException(status_code=404, detail="Unit not found")
        if payload.name is not None:
            _rename_profile(db, "supervisor", pid, payload.name)
        if payload.shift in (1, 2):
            mgr.shift = payload.shift
        if payload.archived is not None:
            mgr.archived = bool(payload.archived)
        if payload.overrides:
            _apply_overrides(db, mgr.name, payload.overrides)
        new_id = pid
        if payload.new_verifix_id and payload.new_verifix_id != pid:
            new_id = _rekey_manager_id(db, mgr, payload.new_verifix_id)
        db.commit()
        return {"ok": True, "id": new_id}

    p = db.query(RoleProfile).filter_by(id=pid).first()
    if not p or p.role != ptype:
        raise HTTPException(status_code=404, detail="Profile not found")

    if payload.name is not None:
        _rename_profile(db, ptype, pid, payload.name)
    if ptype == "shift-manager" and payload.shift in (1, 2):
        p.shift = payload.shift
    if ptype == "leader" and payload.manager_id and payload.manager_id != p.manager_id:
        mgr = db.query(Manager).filter_by(id=payload.manager_id).first()
        if not mgr:
            raise HTTPException(status_code=400, detail="Supervisor unit not found")
        # Bound leaders move with their profile — their role rows point at the unit.
        for r in _bound_role_rows(db, "leader", pid):
            r.role_id = payload.manager_id
        p.manager_id = payload.manager_id
    if ptype == "leader" and payload.cells is not None:
        _set_leader_cells(db, pid, payload.cells)
    if payload.overrides:
        _apply_overrides(db, p.name, payload.overrides)
    db.commit()
    return {"ok": True, "id": pid}


def _rekey_manager_id(db: Session, mgr: Manager, new_id: int) -> int:
    """Change a unit's Verifix ID: insert a fresh managers row under the new id,
    re-point every referencing table, drop the old row. One transaction —
    the caller commits."""
    if new_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid Verifix ID")
    if db.query(Manager).filter_by(id=new_id).first():
        raise HTTPException(status_code=409, detail="Verifix ID already in use")

    old_id = mgr.id
    db.add(Manager(id=new_id, name=mgr.name, shift=mgr.shift, archived=mgr.archived))
    db.flush()
    for table, col in _MANAGER_ID_REFS:
        db.execute(text(f"UPDATE {table} SET {col} = :new WHERE {col} = :old"),
                   {"new": new_id, "old": old_id})
    db.execute(text(
        "UPDATE telegram_user_roles SET role_id = :new "
        "WHERE role IN ('supervisor', 'leader') AND role_id = :old"
    ), {"new": new_id, "old": old_id})
    db.execute(text("DELETE FROM managers WHERE id = :old"), {"old": old_id})
    return new_id


# ── Admin: switch role ────────────────────────────────────────────────────────

class SwitchRolePayload(BaseModel):
    ptype:      str                    # current type
    pid:        int                    # current id (managers.id for supervisor)
    new_role:   str
    shift:      Optional[int] = None        # → shift-manager | supervisor
    manager_id: Optional[int] = None        # → leader (unit)
    cells:      Optional[list[str]] = None  # → leader (owned cell codes, optional)
    verifix_id: Optional[int] = None        # → supervisor (new managers.id)
    confirm:    bool = False                # acknowledge the impacts from the 409


def _migrate_role_row(db: Session, row: TelegramUserRole, new_role: str,
                      new_role_id: int) -> None:
    """Re-point one binding at the profile's new role. If the user already
    holds exactly that binding (uq_user_role_instance), keep the stronger row
    and drop the other."""
    dup = (
        db.query(TelegramUserRole)
        .filter(TelegramUserRole.telegram_id == row.telegram_id,
                TelegramUserRole.role == new_role,
                TelegramUserRole.role_id == new_role_id,
                TelegramUserRole.id != row.id)
        .first()
    )
    if dup:
        if row.status == "approved" and dup.status != "approved":
            _remove_role_row(db, dup)
        else:
            _remove_role_row(db, row)
            return
        db.flush()  # the DELETE must land before the UPDATE re-uses the unique key
    row.role = new_role
    row.role_id = new_role_id


@router.post("/admin/switch-role")
def admin_switch_role(payload: SwitchRolePayload, db: Session = Depends(get_db),
                      _: dict = Depends(verify_admin)):
    """Move a profile to another role. Only the name (and its per-language
    display overrides, keyed by name) moves along — every role-specific value
    comes from the payload. Holders migrate in place: their binding rows switch
    to the new role, so the next app open grants the new role's access.

    Side effects that lose or hide something (leader history staying behind,
    the unit being archived/deleted on a supervisor switch) are returned as a
    409 {"code": "confirm_required", ...} until the caller re-sends confirm."""
    ptype, new_role = payload.ptype, payload.new_role
    if ptype not in PROFILE_TYPES or new_role not in PROFILE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid profile type")
    if ptype == new_role:
        raise HTTPException(status_code=400, detail="Profile already has this role")

    mgr = p = None
    if ptype == "supervisor":
        mgr = db.query(Manager).filter_by(id=payload.pid).first()
        if not mgr:
            raise HTTPException(status_code=404, detail="Unit not found")
        name = mgr.name
    else:
        p = db.query(RoleProfile).filter_by(id=payload.pid).first()
        if not p or p.role != ptype:
            raise HTTPException(status_code=404, detail="Profile not found")
        name = p.name

    # Target-specific values are never inherited — they must be explicit.
    if new_role in ("shift-manager", "supervisor") and payload.shift not in (1, 2):
        raise HTTPException(status_code=400, detail="Shift must be 1 or 2")
    if new_role == "supervisor":
        if not payload.verifix_id or payload.verifix_id <= 0:
            raise HTTPException(status_code=400, detail="Verifix ID is required")
        if db.query(Manager).filter_by(id=payload.verifix_id).first():
            raise HTTPException(status_code=409, detail="Verifix ID already in use")
    if new_role == "leader":
        if ptype == "supervisor" and payload.manager_id == payload.pid:
            raise HTTPException(status_code=400,
                                detail="The unit is being removed — pick another unit")
        if not db.query(Manager).filter_by(id=payload.manager_id).first():
            raise HTTPException(status_code=400, detail="Supervisor unit not found")

    # Registration resolves profiles by name — same duplicate rules as create
    # (guest names are not unique, so they are exempt).
    if new_role == "leader":
        if db.query(RoleProfile).filter_by(role="leader", name=name,
                                           manager_id=payload.manager_id).first():
            raise HTTPException(status_code=409, detail="This leader already exists")
    elif new_role not in ("supervisor", "guest"):
        if db.query(RoleProfile).filter_by(role=new_role, name=name).first():
            raise HTTPException(status_code=409, detail="Profile with this name already exists")

    if ptype == "admin":
        # Approved admins live in the admins table; role rows are pending /adminreg.
        rows = db.query(TelegramUserRole).filter_by(role="admin", role_id=payload.pid).all()
        admin_holders = db.query(Admin).filter_by(profile_id=payload.pid).all()
        if admin_holders and db.query(Admin).count() - len(admin_holders) < 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
    else:
        rows = _bound_role_rows(db, ptype, payload.pid)
        admin_holders = []
    approved_rows = [r for r in rows if r.status == "approved"]

    if new_role == "admin":
        # One admin profile — one account (mirrors /adminreg semantics).
        if len(approved_rows) > 1:
            raise HTTPException(status_code=409,
                                detail="An admin profile can be held by one account only — "
                                       "unassign the extra holders first")
        if approved_rows and db.query(Admin).filter_by(
                telegram_id=approved_rows[0].telegram_id).first():
            raise HTTPException(status_code=409, detail="The holder is already an admin")

    # Impacts an admin must acknowledge before the switch goes through.
    impacts: dict = {}
    if ptype == "leader":
        refs = [r.id for r in rows]
        concerns = db.query(LeaderConcern).filter(
            LeaderConcern.leader_profile_id == payload.pid).count()
        tasks = 0
        if refs:
            concerns += (
                db.query(LeaderConcern)
                .filter(LeaderConcern.leader_profile_id.is_(None),
                        LeaderConcern.leader_role_ref.in_(refs)).count()
            )
            tasks = db.query(LeaderTask).filter(LeaderTask.leader_role_ref.in_(refs)).count()
        if concerns:
            impacts["concerns"] = concerns
        if tasks:
            impacts["tasks"] = tasks
    if ptype == "supervisor":
        if _manager_has_data(db, payload.pid):
            impacts["unit_archive"] = True
        else:
            impacts["unit_delete"] = True
            n_leaders = db.query(RoleProfile).filter_by(
                role="leader", manager_id=payload.pid).count()
            if n_leaders:
                impacts["unit_leaders"] = n_leaders
    if impacts and not payload.confirm:
        raise HTTPException(status_code=409, detail={"code": "confirm_required", **impacts})

    # ── target entity ──
    if new_role == "supervisor":
        db.add(Manager(id=payload.verifix_id, name=name, shift=payload.shift, archived=False))
        db.flush()
        target_profile = None
        target_role_id = payload.verifix_id
    else:
        if ptype == "supervisor":
            target_profile = RoleProfile(role=new_role, name=name)
            db.add(target_profile)
        else:
            target_profile = p
            target_profile.role = new_role
        target_profile.shift = payload.shift if new_role == "shift-manager" else None
        target_profile.manager_id = payload.manager_id if new_role == "leader" else None
        db.flush()
        if new_role == "leader":
            if payload.cells:
                _set_leader_cells(db, target_profile.id, payload.cells)
        else:
            # Leaving the leader role frees the profile's cells.
            _release_leader_cells(db, target_profile.id)
        target_role_id = payload.manager_id if new_role == "leader" else target_profile.id

    # ── migrate holders ──
    now = datetime.now(timezone.utc)
    if new_role == "admin":
        for r in rows:
            if r.status != "approved":
                _migrate_role_row(db, r, "admin", target_profile.id)
        for r in approved_rows:
            user = db.query(TelegramUser).filter_by(telegram_id=r.telegram_id).first()
            db.add(Admin(telegram_id=r.telegram_id, profile_id=target_profile.id,
                         language=(user.language if user else None) or "uz"))
            # The admins row is the binding — the role row goes away (see /adminreg).
            if user and user.active_role_ref == r.id:
                other = (
                    db.query(TelegramUserRole)
                    .filter(TelegramUserRole.telegram_id == r.telegram_id,
                            TelegramUserRole.status == "approved",
                            TelegramUserRole.id != r.id)
                    .first()
                )
                user.active_role_ref = other.id if other else None
            db.delete(r)
    else:
        for r in rows:
            _migrate_role_row(db, r, new_role, target_role_id)
        for a in admin_holders:  # ptype == "admin": convert admins rows to role rows
            user = db.query(TelegramUser).filter_by(telegram_id=a.telegram_id).first()
            if not user:
                # Seeded admins have no telegram_users row — create the account shell.
                user = TelegramUser(telegram_id=a.telegram_id, full_name=name,
                                    role=new_role, role_id=target_role_id,
                                    status="approved", language=a.language or "uz")
                db.add(user)
            row = (
                db.query(TelegramUserRole)
                .filter_by(telegram_id=a.telegram_id, role=new_role, role_id=target_role_id)
                .first()
            )
            if row:
                row.full_name = name
                if row.status != "approved":
                    row.status, row.approved_at = "approved", now
            else:
                row = TelegramUserRole(telegram_id=a.telegram_id, role=new_role,
                                       role_id=target_role_id, full_name=name,
                                       status="approved", approved_at=now)
                db.add(row)
            db.flush()
            if not user.active_role_ref:
                user.active_role_ref = row.id
            db.delete(a)

    # ── source cleanup ──
    if ptype == "supervisor":
        if impacts.get("unit_archive"):
            mgr.archived = True
        else:
            # No history: same cascade as delete — the unit's leader profiles go too.
            for lp in db.query(RoleProfile).filter_by(role="leader",
                                                      manager_id=payload.pid).all():
                for r in _bound_role_rows(db, "leader", lp.id):
                    _remove_role_row(db, r)
                _release_leader_cells(db, lp.id)
                db.delete(lp)
            db.flush()
            db.delete(mgr)
    elif new_role == "supervisor":
        if ptype == "leader":
            _release_leader_cells(db, p.id)
        db.delete(p)  # the identity now lives in the managers row

    db.commit()
    return {"ok": True, "role": new_role,
            "id": target_role_id if new_role == "supervisor" else target_profile.id}


# ── Admin: delete / unassign ──────────────────────────────────────────────────

@router.delete("/admin/{ptype}/{pid}")
def admin_delete_profile(ptype: str, pid: int, db: Session = Depends(get_db),
                         _: dict = Depends(verify_admin)):
    if ptype not in PROFILE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid profile type")

    if ptype == "supervisor":
        mgr = db.query(Manager).filter_by(id=pid).first()
        if not mgr:
            raise HTTPException(status_code=404, detail="Unit not found")
        for r in _bound_role_rows(db, "supervisor", pid):
            _remove_role_row(db, r)
        if _manager_has_data(db, pid):
            mgr.archived = True   # history stays queryable; unit leaves pickers/dashboards
            db.commit()
            return {"ok": True, "archived": True}
        # No history: take the unit's leader profiles (and their bindings) along.
        for lp in db.query(RoleProfile).filter_by(role="leader", manager_id=pid).all():
            for r in _bound_role_rows(db, "leader", lp.id):
                _remove_role_row(db, r)
            _release_leader_cells(db, lp.id)
            db.delete(lp)
        db.delete(mgr)
        db.commit()
        return {"ok": True, "archived": False}

    p = db.query(RoleProfile).filter_by(id=pid).first()
    if not p or p.role != ptype:
        raise HTTPException(status_code=404, detail="Profile not found")

    if ptype == "admin":
        holder = db.query(Admin).filter_by(profile_id=pid).first()
        if holder and db.query(Admin).count() <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
        if holder:
            db.delete(holder)
        # drop pending /adminreg requests for this profile
        for r in db.query(TelegramUserRole).filter_by(role="admin", role_id=pid).all():
            _remove_role_row(db, r)
    else:
        for r in _bound_role_rows(db, ptype, pid):
            _remove_role_row(db, r)

    if ptype == "leader":
        _release_leader_cells(db, pid)
    db.delete(p)
    db.commit()
    return {"ok": True}


class UnassignPayload(BaseModel):
    ptype:       str
    pid:         int
    role_ref:    Optional[int] = None  # non-admin bindings
    telegram_id: Optional[int] = None  # admin bindings


@router.post("/admin/unassign")
def admin_unassign_profile(payload: UnassignPayload, db: Session = Depends(get_db),
                           _: dict = Depends(verify_admin)):
    if payload.ptype == "admin":
        holder = db.query(Admin).filter_by(telegram_id=payload.telegram_id,
                                           profile_id=payload.pid).first()
        if not holder:
            raise HTTPException(status_code=404, detail="Assignment not found")
        if db.query(Admin).count() <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
        db.delete(holder)
        db.commit()
        return {"ok": True}

    row = db.query(TelegramUserRole).filter_by(id=payload.role_ref).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")
    _remove_role_row(db, row)
    db.commit()
    return {"ok": True}


# ── Registration options (pre-login, Telegram-initData-gated) ─────────────────

class RegistrationOptionsPayload(BaseModel):
    init_data: str
    reg_token: Optional[str] = None  # bot-signed ?rt= from the register button


@router.post("/registration-options")
def registration_options(payload: RegistrationOptionsPayload, db: Session = Depends(get_db)):
    """Name lists for the registration pickers. Gated so anonymous web
    visitors get 401 (per the privacy decision). Two accepted credentials:
    Telegram initData (menu/inline/direct-link launches), or the bot-signed
    reg_token — the register page opens from a keyboard button (required for
    sendData()) and keyboard-button launches never receive initData."""
    if payload.init_data and payload.init_data != "__dev__":
        if not _validate_init_data(payload.init_data):
            raise HTTPException(status_code=401, detail="Invalid Telegram initData")
    elif payload.reg_token:
        if not validate_reg_token(payload.reg_token):
            raise HTTPException(status_code=401,
                                detail="Expired registration link — send /register to the bot again")
    elif not settings.dev_auth:
        raise HTTPException(status_code=401, detail="Missing Telegram initData")

    managers = (
        db.query(Manager)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.shift, Manager.name)
        .all()
    )
    mgr_names = {m.id: m.name for m in managers}
    leaders: dict[str, list[str]] = {}
    for p in (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "leader")
        .order_by(RoleProfile.name)
        .all()
    ):
        sup = mgr_names.get(p.manager_id)
        if sup:  # archived units keep their leaders out of the picker
            leaders.setdefault(sup, []).append(p.name)

    # Guest profiles without an approved holder are offered for re-claiming in
    # the registration picker. Guest names are NOT unique — a typed name always
    # gets its own fresh profile, so there is no taken-name list to check.
    guest_profiles = (
        db.query(RoleProfile).filter(RoleProfile.role == "guest")
        .order_by(RoleProfile.name).all()
    )
    approved_guest_ids = {
        r.role_id for r in db.query(TelegramUserRole)
        .filter(TelegramUserRole.role == "guest",
                TelegramUserRole.status == "approved").all()
    }

    return {
        "top_managers": [
            p.name for p in db.query(RoleProfile)
            .filter(RoleProfile.role == "top-manager").order_by(RoleProfile.name).all()
        ],
        "shift_managers": [
            {"name": p.name, "shift": p.shift}
            for p in db.query(RoleProfile)
            .filter(RoleProfile.role == "shift-manager")
            .order_by(RoleProfile.shift, RoleProfile.name).all()
        ],
        "supervisors": [{"name": m.name, "shift": m.shift} for m in managers],
        "leaders": leaders,
        "guests": [
            {"id": p.id, "name": p.name}
            for p in guest_profiles if p.id not in approved_guest_ids
        ],
    }


# ── Self-service: my profile names ────────────────────────────────────────────

@router.get("/mine")
def my_profiles(caller: dict = Depends(_caller), db: Session = Depends(get_db)):
    """The caller's approved profiles with their canonical names and stored
    per-language overrides — the settings-modal name editor's data source."""
    tid = int(caller["sub"])
    entries = []

    for r in (
        db.query(TelegramUserRole)
        .filter_by(telegram_id=tid, status="approved")
        .order_by(TelegramUserRole.id)
        .all()
    ):
        if r.role == "admin":
            continue  # surfaced via the admins-table entry below
        entries.append({
            "kind": "role", "role": r.role, "role_ref": r.id, "canonical": r.full_name,
        })

    admin_row = db.query(Admin).filter_by(telegram_id=tid).first()
    if admin_row and admin_row.profile_id:
        p = db.query(RoleProfile).filter_by(id=admin_row.profile_id, role="admin").first()
        if p:
            entries.append({"kind": "admin", "role": "admin",
                            "role_ref": None, "canonical": p.name})

    names = {e["canonical"] for e in entries if e["canonical"]}
    overrides: dict[str, dict[str, str]] = {n: {} for n in names}
    if names:
        keys = [f"name.{n}" for n in names]
        for t in db.query(Translation).filter(Translation.key.in_(keys)).all():
            overrides[t.key[len("name."):]][t.lang] = t.value
    for e in entries:
        e["overrides"] = overrides.get(e["canonical"], {})
    return {"profiles": entries}


class MyNamePayload(BaseModel):
    kind:      str                       # "role" | "admin"
    role_ref:  Optional[int] = None      # kind="role"
    name:      Optional[str] = None      # new canonical (uz) — rename cascade
    overrides: Optional[dict[str, str]] = None  # lang → display ("" clears)


@router.put("/mine")
def update_my_name(payload: MyNamePayload, caller: dict = Depends(_caller),
                   db: Session = Depends(get_db)):
    """Self-service rename: users edit their own profile's canonical name and
    per-language display variants once approved. Immediate, app-wide."""
    tid = int(caller["sub"])

    if payload.kind == "admin":
        admin_row = db.query(Admin).filter_by(telegram_id=tid).first()
        if not admin_row or not admin_row.profile_id:
            raise HTTPException(status_code=403, detail="No admin profile")
        p = db.query(RoleProfile).filter_by(id=admin_row.profile_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Profile not found")
        if payload.name is not None:
            _rename_profile(db, "admin", p.id, payload.name)
        if payload.overrides:
            _apply_overrides(db, p.name, payload.overrides)
        db.commit()
        return {"ok": True, "canonical": p.name}

    row = db.query(TelegramUserRole).filter_by(id=payload.role_ref, telegram_id=tid).first()
    if not row or row.status != "approved":
        raise HTTPException(status_code=403, detail="Not your approved profile")

    canonical = row.full_name
    if payload.name is not None and (payload.name or "").strip() != canonical:
        if row.role == "supervisor":
            _rename_profile(db, "supervisor", row.role_id, payload.name)
        elif row.role in ("shift-manager", "top-manager", "guest"):
            if row.role_id:
                _rename_profile(db, row.role, row.role_id, payload.name)
            else:  # legacy row without a profile — rename the row itself
                _rekey_name_overrides(db, canonical, payload.name.strip())
                row.full_name = payload.name.strip()
        else:  # leader — bind via (manager_id, name)
            p = db.query(RoleProfile).filter_by(
                role="leader", manager_id=row.role_id, name=canonical,
            ).first()
            if p:
                _rename_profile(db, "leader", p.id, payload.name)
            else:
                _rekey_name_overrides(db, canonical, payload.name.strip())
                row.full_name = payload.name.strip()
        db.refresh(row)
        canonical = row.full_name

    if payload.overrides:
        _apply_overrides(db, canonical, payload.overrides)
    db.commit()
    return {"ok": True, "canonical": canonical}
