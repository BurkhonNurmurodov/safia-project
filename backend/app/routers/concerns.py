"""
Leader concerns ("Xavotirlar") API.

A leader logs the concerns raised on their floor and manages only their own
rows; an admin can act for any registered leader by passing ``leader_ref`` (the
leader's ``telegram_user_roles.id``). Every new concern notifies the leader's
brigadir — the approved supervisor of the leader's unit — via the bell + a
Telegram DM. Access is gated by the ``concerns`` page in the access matrix
(default: the ``leader`` role + admin).
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderConcern, Manager, TelegramUserRole
from app.permissions import require_page
# Reuse the shared notification helpers: _find_supervisor resolves the brigadir
# for a unit, _notify writes the bell row (rendered per-viewer) + Telegram DM.
from app.routers.staff import _find_supervisor, _notify

router = APIRouter(prefix="/api/concerns", tags=["concerns"])

VALID_STATUSES = {"todo", "doing", "done"}


def _serialize(c: LeaderConcern) -> dict:
    resolution_days = None
    if c.completion_date and c.entry_date:
        resolution_days = (c.completion_date - c.entry_date).days
    return {
        "id": c.id,
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
    leader_ref: Optional[int] = None   # admin only: which leader to act for


def _resolve_owner(payload: dict, body_leader_ref: Optional[int], db: Session):
    """Resolve the owning leader for a new concern → (role_ref, leader_name,
    brigadir_manager_id, brigadir_name). Leaders always write their own row;
    admins must name a registered leader via ``leader_ref``."""
    if payload.get("role") == "admin":
        if not body_leader_ref:
            raise HTTPException(status_code=400, detail="Select a leader")
        lr = db.query(TelegramUserRole).filter(
            TelegramUserRole.id == body_leader_ref,
            TelegramUserRole.role == "leader",
        ).first()
        if not lr:
            raise HTTPException(status_code=404, detail="Leader not found")
        mgr = db.query(Manager).filter(Manager.id == lr.role_id).first()
        return lr.id, lr.full_name, lr.role_id, (mgr.name if mgr else None)

    role_ref = payload.get("role_ref")
    if not role_ref:
        raise HTTPException(status_code=403, detail="Only a leader can create concerns")
    mgr = db.query(Manager).filter(Manager.id == payload.get("role_id")).first()
    return role_ref, payload.get("full_name"), payload.get("role_id"), (mgr.name if mgr else None)


def _assert_can_edit(payload: dict, c: LeaderConcern):
    """Admins may touch any row; a leader only their own."""
    if payload.get("role") == "admin":
        return
    if c.leader_role_ref != payload.get("role_ref"):
        raise HTTPException(status_code=403, detail="You can only manage your own concerns")


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
    """Leaders get their own concerns; admins get all, or one leader's rows when
    ``leader_ref`` is passed. Optional status + free-text filters."""
    role = payload.get("role")
    query = db.query(LeaderConcern)
    if role == "admin":
        if leader_ref:
            query = query.filter(LeaderConcern.leader_role_ref == leader_ref)
    else:
        query = query.filter(LeaderConcern.leader_role_ref == payload.get("role_ref"))

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

    return {
        "role": role,
        "can_pick_leader": role == "admin",
        "data": [_serialize(r) for r in rows],
    }


@router.get("/leaders")
def list_registered_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Admin picker source: approved ``leader``-role users with their brigadir."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    rows = (
        db.query(TelegramUserRole)
        .filter(TelegramUserRole.role == "leader", TelegramUserRole.status == "approved")
        .order_by(TelegramUserRole.full_name)
        .all()
    )
    mgr_names = {m.id: m.name for m in db.query(Manager).all()}
    return [
        {
            "role_ref": r.id,
            "name": r.full_name,
            "brigadir_manager_id": r.role_id,
            "brigadir_name": mgr_names.get(r.role_id),
        }
        for r in rows
    ]


@router.get("/cell-codes")
def list_cell_codes(
    leader_ref: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Distinct cell codes already used by the leader — powers the code dropdown
    (with an 'add new' option on the client). Admins pass ``leader_ref``."""
    role = payload.get("role")
    ref = leader_ref if role == "admin" else payload.get("role_ref")
    if not ref:
        return []
    rows = (
        db.query(LeaderConcern.cell_code)
        .filter(
            LeaderConcern.leader_role_ref == ref,
            LeaderConcern.cell_code.isnot(None),
            LeaderConcern.cell_code != "",
        )
        .distinct()
        .all()
    )
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
    ref, name, mgr_id, mgr_name = _resolve_owner(payload, body.leader_ref, db)
    entry = body.entry_date or date.today()

    c = LeaderConcern(
        leader_role_ref=ref,
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

    # Notify the brigadir (the supervisor of the leader's unit) about every new
    # concern. Skipped silently if that brigadir hasn't registered, or is the
    # author (e.g. would never happen for a leader, but guards admin edge cases).
    if mgr_id:
        sup = _find_supervisor(db, mgr_id)
        if sup and sup.telegram_id != int(payload["sub"]):
            snippet = c.concern_text if len(c.concern_text) <= 160 else c.concern_text[:157] + "…"
            _notify(
                db, sup.telegram_id, type="info", nkey="concern_created",
                params={
                    "leader_name": name,
                    "owner": c.concern_owner,
                    "date": entry,
                    "concern": snippet,
                },
            )
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
    _assert_can_edit(payload, c)
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
    _assert_can_edit(payload, c)
    db.delete(c)
    db.commit()
