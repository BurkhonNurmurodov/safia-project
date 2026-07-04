"""
Leader concerns ("Xavotirlar") API.

A concern is owned by a leader's pre-created *profile* (role_profiles), so it
can be logged for a leader who hasn't claimed their profile yet — the leader
inherits it on registration. Every role works within its scope:

- admin         — everything, full manage, picks supervisor → leader
- top-manager   — everything, read-only
- shift-manager — their shift's units, full manage, picks supervisor → leader
- supervisor    — their own unit's leaders, full manage, picks a leader
- leader        — their own rows only (no picker — always writes on themselves)

Every new concern notifies the leader's brigadir (the approved supervisor of
the leader's unit) and the leader themself via the bell + a Telegram DM —
whoever of them isn't the author (unregistered leaders are skipped silently).
Access is gated by the ``concerns`` page in the access matrix.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderConcern, Manager, RoleProfile, TelegramUserRole
from app.permissions import require_page
# Reuse the shared notification helpers: _find_supervisor resolves the brigadir
# for a unit, _notify writes the bell row (rendered per-viewer) + Telegram DM.
from app.routers.staff import _find_supervisor, _notify, _profile_key

router = APIRouter(prefix="/api/concerns", tags=["concerns"])

VALID_STATUSES = {"todo", "doing", "done"}

# Roles that pick a leader when creating (everyone but the leader themself).
PICKER_ROLES = ("admin", "shift-manager", "supervisor")


def _serialize(c: LeaderConcern) -> dict:
    resolution_days = None
    if c.completion_date and c.entry_date:
        resolution_days = (c.completion_date - c.entry_date).days
    # Minute-grained "время выполнения": created_at → done_at. NULL done_at
    # (still open, or done before the column existed) renders as "—".
    resolution_minutes = None
    if c.done_at and c.created_at:
        resolution_minutes = max(0, int((c.done_at - c.created_at).total_seconds() // 60))
    return {
        "id": c.id,
        "leader_profile_id": c.leader_profile_id,
        "leader_role_ref": c.leader_role_ref,
        "leader_name": c.leader_name,
        "brigadir_manager_id": c.brigadir_manager_id,
        "brigadir_name": c.brigadir_name,
        "cell_code": c.cell_code,
        "concern_owner": c.concern_owner,
        "concern_text": c.concern_text,
        "status": c.status,
        "deadline_days": c.deadline_days,
        "entry_date": c.entry_date.isoformat() if c.entry_date else None,
        "completion_date": c.completion_date.isoformat() if c.completion_date else None,
        "solution": c.solution,
        "resolution_days": resolution_days,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


class ConcernIn(BaseModel):
    cell_code: Optional[str] = None
    concern_owner: str
    concern_text: str
    status: str = "todo"
    deadline_days: Optional[int] = None
    entry_date: Optional[date] = None
    completion_date: Optional[date] = None
    solution: Optional[str] = None
    leader_profile_id: Optional[int] = None   # picker roles: which leader to act for
    leader_ref: Optional[int] = None          # legacy clients: telegram_user_roles.id


# ── role scope helpers ───────────────────────────────────────────────────────

def _viewer_shift(db: Session, payload: dict) -> Optional[int]:
    """A shift-manager's shift (1|2) — the JWT has no shift field, so it is
    resolved from their claimed profile (role_id → role_profiles.id)."""
    prof = db.query(RoleProfile).filter(
        RoleProfile.id == payload.get("role_id"),
        RoleProfile.role == "shift-manager",
    ).first()
    return prof.shift if prof else None


def _shift_unit_ids(db: Session, shift: Optional[int]) -> list[int]:
    if shift is None:
        return []
    return [mid for (mid,) in db.query(Manager.id).filter(Manager.shift == shift).all()]


def _own_profile(db: Session, payload: dict) -> Optional[RoleProfile]:
    """The viewing leader's pre-created profile. Leader role rows point at the
    unit (role_id = managers.id) and bind to a profile via (unit, name)."""
    return db.query(RoleProfile).filter_by(
        role="leader",
        manager_id=payload.get("role_id"),
        name=payload.get("full_name"),
    ).first()


def _leader_own_filter(db: Session, payload: dict):
    """SQLAlchemy condition matching the viewing leader's own concerns: by
    profile when it resolves, plus the role-row fallback (legacy rows without a
    profile match, or a stale JWT name during a canonical rename)."""
    conds = [LeaderConcern.leader_role_ref == payload.get("role_ref")]
    prof = _own_profile(db, payload)
    if prof:
        conds.append(LeaderConcern.leader_profile_id == prof.id)
    return or_(*conds)


def _scope_query(query, payload: dict, db: Session):
    """Restrict a LeaderConcern query to what the caller may see."""
    role = payload.get("role")
    if role in ("admin", "top-manager"):
        return query
    if role == "shift-manager":
        unit_ids = _shift_unit_ids(db, _viewer_shift(db, payload))
        return query.filter(LeaderConcern.brigadir_manager_id.in_(unit_ids))
    if role == "supervisor":
        return query.filter(LeaderConcern.brigadir_manager_id == payload.get("role_id"))
    return query.filter(_leader_own_filter(db, payload))


def _assert_can_edit(payload: dict, c: LeaderConcern, db: Session):
    """Full manage inside one's scope: admin anything, shift-manager their
    shift's units, supervisor their unit, leader their own rows. Top-managers
    are read-only."""
    role = payload.get("role")
    if role == "admin":
        return
    if role == "top-manager":
        raise HTTPException(status_code=403, detail="Read-only access")
    if role == "shift-manager":
        if c.brigadir_manager_id in _shift_unit_ids(db, _viewer_shift(db, payload)):
            return
        raise HTTPException(status_code=403, detail="This concern is outside your shift")
    if role == "supervisor":
        if c.brigadir_manager_id == payload.get("role_id"):
            return
        raise HTTPException(status_code=403, detail="This concern is outside your unit")
    # leader
    if c.leader_role_ref == payload.get("role_ref"):
        return
    prof = _own_profile(db, payload)
    if prof and c.leader_profile_id == prof.id:
        return
    raise HTTPException(status_code=403, detail="You can only manage your own concerns")


def _claimed_role_row(db: Session, prof: RoleProfile) -> Optional[TelegramUserRole]:
    """The approved leader role row that claimed this profile, if any — leader
    role rows bind to profiles via (unit, canonical name)."""
    return db.query(TelegramUserRole).filter_by(
        role="leader",
        role_id=prof.manager_id,
        full_name=prof.name,
        status="approved",
    ).first()


def _resolve_owner(payload: dict, body: ConcernIn, db: Session):
    """Resolve the owning leader for a new concern → (profile_id, role_ref,
    leader_name, brigadir_manager_id, brigadir_name, leader_telegram_id).
    Leaders always write their own row; picker roles name a leader profile
    inside their scope."""
    role = payload.get("role")

    if role == "leader":
        role_ref = payload.get("role_ref")
        if not role_ref:
            raise HTTPException(status_code=403, detail="Only a leader can create concerns")
        prof = _own_profile(db, payload)
        mgr = db.query(Manager).filter(Manager.id == payload.get("role_id")).first()
        return (
            prof.id if prof else None, role_ref, payload.get("full_name"),
            payload.get("role_id"), (mgr.name if mgr else None), int(payload["sub"]),
        )

    if role not in PICKER_ROLES:
        raise HTTPException(status_code=403, detail="Read-only access")

    prof = None
    if body.leader_profile_id:
        prof = db.query(RoleProfile).filter_by(
            id=body.leader_profile_id, role="leader",
        ).first()
    elif body.leader_ref:
        # Legacy client fallback: role row → its bound profile.
        lr = db.query(TelegramUserRole).filter_by(id=body.leader_ref, role="leader").first()
        if lr:
            prof = db.query(RoleProfile).filter_by(
                role="leader", manager_id=lr.role_id, name=lr.full_name,
            ).first()
    if not prof:
        raise HTTPException(status_code=400, detail="Select a leader")

    if role == "supervisor" and prof.manager_id != payload.get("role_id"):
        raise HTTPException(status_code=403, detail="This leader is outside your unit")
    if role == "shift-manager":
        if prof.manager_id not in _shift_unit_ids(db, _viewer_shift(db, payload)):
            raise HTTPException(status_code=403, detail="This leader is outside your shift")

    mgr = db.query(Manager).filter(Manager.id == prof.manager_id).first()
    claimed = _claimed_role_row(db, prof)
    return (
        prof.id, (claimed.id if claimed else None), prof.name,
        prof.manager_id, (mgr.name if mgr else None),
        (claimed.telegram_id if claimed else None),
    )


def _apply_completion(status: str, requested: Optional[date], existing: Optional[date]) -> Optional[date]:
    """Only a done concern carries a completion date; default it to today when
    the leader marks it done without setting one."""
    if status == "done":
        return requested or existing or date.today()
    return None


@router.get("")
def list_concerns(
    leader_ref: Optional[int] = Query(default=None),
    status: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Concerns inside the caller's scope (see module docstring). Admins may
    additionally narrow to one leader via ``leader_ref``; optional status +
    free-text filters."""
    role = payload.get("role")
    query = _scope_query(db.query(LeaderConcern), payload, db)
    if role == "admin" and leader_ref:
        query = query.filter(LeaderConcern.leader_role_ref == leader_ref)

    if status in VALID_STATUSES:
        query = query.filter(LeaderConcern.status == status)

    rows = query.order_by(
        LeaderConcern.entry_date.desc(), LeaderConcern.id.desc()
    ).all()

    if q:
        ql = q.strip().lower()
        rows = [
            r for r in rows
            if ql in (r.concern_text or "").lower()
            or ql in (r.concern_owner or "").lower()
            or ql in (r.cell_code or "").lower()
        ]

    picker = (
        "supervisor_leader" if role in ("admin", "shift-manager")
        else "leader" if role == "supervisor"
        else None
    )
    return {
        "role": role,
        "picker": picker,
        "read_only": role == "top-manager",
        "can_pick_leader": picker is not None,
        "data": [_serialize(r) for r in rows],
    }


@router.get("/supervisors")
def list_supervisor_units(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Supervisor step of the create cascade: active units for admins, the
    caller's shift's units for shift-managers."""
    role = payload.get("role")
    if role not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Admin or shift-manager only")
    q = db.query(Manager).filter(Manager.archived.is_(False))
    if role == "shift-manager":
        shift = _viewer_shift(db, payload)
        if shift is None:
            return []
        q = q.filter(Manager.shift == shift)
    return [
        {"manager_id": m.id, "name": m.name, "shift": m.shift}
        for m in q.order_by(Manager.name).all()
    ]


@router.get("/leaders")
def list_leader_profiles(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Leader step of the create cascade: every pre-created leader profile in
    the caller's scope (claimed or not), with its unit for client-side
    cascading. Archived units are excluded."""
    role = payload.get("role")
    if role not in PICKER_ROLES:
        raise HTTPException(status_code=403, detail="No leader picker for this role")

    q = db.query(RoleProfile).filter(RoleProfile.role == "leader")
    if role == "supervisor":
        q = q.filter(RoleProfile.manager_id == payload.get("role_id"))
    elif role == "shift-manager":
        q = q.filter(RoleProfile.manager_id.in_(
            _shift_unit_ids(db, _viewer_shift(db, payload))
        ))

    mgrs = {m.id: m for m in db.query(Manager).all()}
    claimed = {
        (r.role_id, r.full_name)
        for r in db.query(TelegramUserRole).filter_by(role="leader", status="approved").all()
    }
    out = []
    for p in q.order_by(RoleProfile.name).all():
        mgr = mgrs.get(p.manager_id)
        if not mgr or mgr.archived:
            continue
        out.append({
            "profile_id": p.id,
            "name": p.name,
            "manager_id": p.manager_id,
            "brigadir_name": mgr.name,
            "registered": (p.manager_id, p.name) in claimed,
        })
    return out


@router.get("/cell-codes")
def list_cell_codes(
    leader_profile_id: Optional[int] = Query(default=None),
    leader_ref: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Distinct cell codes already used by a leader — powers the code dropdown
    (with an 'add new' option on the client). Picker roles pass the leader;
    leaders get their own. Always scope-filtered."""
    query = _scope_query(db.query(LeaderConcern.cell_code), payload, db)
    if payload.get("role") in PICKER_ROLES:
        if leader_profile_id:
            query = query.filter(LeaderConcern.leader_profile_id == leader_profile_id)
        elif leader_ref:
            query = query.filter(LeaderConcern.leader_role_ref == leader_ref)
        else:
            return []
    rows = query.filter(
        LeaderConcern.cell_code.isnot(None),
        LeaderConcern.cell_code != "",
    ).distinct().all()
    return sorted({r[0] for r in rows})


def _validate(body: ConcernIn):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if not (body.concern_owner or "").strip():
        raise HTTPException(status_code=400, detail="Concern owner is required")
    if not (body.concern_text or "").strip():
        raise HTTPException(status_code=400, detail="Concern text is required")


@router.post("")
def create_concern(
    body: ConcernIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    _validate(body)
    profile_id, role_ref, name, mgr_id, mgr_name, leader_tg = _resolve_owner(payload, body, db)
    entry = body.entry_date or date.today()

    c = LeaderConcern(
        leader_profile_id=profile_id,
        leader_role_ref=role_ref,
        leader_name=name,
        brigadir_manager_id=mgr_id,
        brigadir_name=mgr_name,
        cell_code=(body.cell_code or "").strip() or None,
        concern_owner=body.concern_owner.strip(),
        concern_text=body.concern_text.strip(),
        status=body.status,
        deadline_days=body.deadline_days,
        entry_date=entry,
        completion_date=_apply_completion(body.status, body.completion_date, None),
        solution=(body.solution or "").strip() or None,
        created_by=int(payload["sub"]),
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    # Notify the brigadir (approved supervisor of the leader's unit) and the
    # leader themself about every new concern — skipping whoever authored it and
    # never DM'ing the same person twice (one account may hold both roles). For
    # a leader who hasn't registered yet the bell row queues on their profile
    # (leader_tg None → no DM); they inherit it when they claim the profile.
    author = int(payload["sub"])
    snippet = c.concern_text if len(c.concern_text) <= 160 else c.concern_text[:157] + "…"
    notified: set[int] = set()
    sup = _find_supervisor(db, mgr_id) if mgr_id else None
    if sup and sup.telegram_id != author:
        _notify(
            db, sup.telegram_id, type="info", nkey="concern_created",
            params={
                "leader_name": name,
                "owner": c.concern_owner,
                "date": entry,
                "concern": snippet,
            },
            profile=_profile_key("supervisor", mgr_id),
        )
        notified.add(sup.telegram_id)
    if leader_tg != author and leader_tg not in notified:
        _notify(
            db, leader_tg, type="info", nkey="concern_assigned",
            params={
                "actor_name": payload.get("full_name") or "",
                "owner": c.concern_owner,
                "date": entry,
                "concern": snippet,
            },
            profile=_profile_key("leader", profile_id),
        )
        notified.add(leader_tg)
    if notified:
        db.commit()

    return _serialize(c)


@router.put("/{concern_id}")
def update_concern(
    concern_id: int,
    body: ConcernIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    c = db.query(LeaderConcern).filter(LeaderConcern.id == concern_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    _assert_can_edit(payload, c, db)
    _validate(body)

    # Ownership (leader/brigadir) is never reassigned on edit — only the concern
    # fields change.
    c.cell_code = (body.cell_code or "").strip() or None
    c.concern_owner = body.concern_owner.strip()
    c.concern_text = body.concern_text.strip()
    c.status = body.status
    c.deadline_days = body.deadline_days
    if body.entry_date:
        c.entry_date = body.entry_date
    c.completion_date = _apply_completion(body.status, body.completion_date, c.completion_date)
    c.solution = (body.solution or "").strip() or None

    db.commit()
    db.refresh(c)
    return _serialize(c)


@router.delete("/{concern_id}", status_code=204)
def delete_concern(
    concern_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    c = db.query(LeaderConcern).filter(LeaderConcern.id == concern_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    _assert_can_edit(payload, c, db)
    db.delete(c)
    db.commit()
