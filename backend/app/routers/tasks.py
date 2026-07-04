"""
Leader tasks ("DAILY протокол") API.

Supervisors assign tasks to the leaders of their unit; admins act for any
leader; leaders work their own queue. Access is gated by the ``tasks`` page in
the access matrix (default: ``supervisor`` + ``leader`` + admin). Any other
role toggled onto the page gets a read-only view of everything.

Priority is a per-leader queue over the ACTIVE (todo/doing) tasks only and is
always dense 1..N:
  - a new task joins at the back (N+1);
  - a task flipped to done leaves the queue (priority NULL) and everything
    behind it closes ranks;
  - a reopened task rejoins at the back;
  - an explicit re-prioritisation either swaps two positions or shifts the
    span between the old and new position by one (``mode``: swap | shift).
Every queue mutation first locks the leader's telegram_user_roles row, which
serialises concurrent renumbering per leader.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LeaderTask, LeaderTaskComment, Manager, TelegramUserRole
from app.permissions import require_page
from app.routers.auth import ADMIN_ROLE_REF
# Shared notification helper: writes the bell row (rendered per-viewer) + DM.
from app.routers.staff import _notify

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

VALID_STATUSES = {"todo", "doing", "done"}


def _snippet(text: str, n: int = 140) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _serialize(t: LeaderTask, comment_count: int, payload: dict) -> dict:
    role = payload.get("role")
    sub = int(payload["sub"])
    return {
        "id": t.id,
        "leader_role_ref": t.leader_role_ref,
        "leader_name": t.leader_name,
        "supervisor_manager_id": t.supervisor_manager_id,
        "supervisor_name": t.supervisor_name,
        "task_text": t.task_text,
        "priority": t.priority,
        "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_by": t.created_by,
        "created_by_name": t.created_by_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "comment_count": comment_count,
        # Core fields (text / due date) + delete: creator or admin only.
        "can_edit": role == "admin" or t.created_by == sub,
    }


# ── access helpers ────────────────────────────────────────────────────────────

def _is_unit_supervisor(payload: dict, t: LeaderTask) -> bool:
    return (
        payload.get("role") == "supervisor"
        and t.supervisor_manager_id is not None
        and t.supervisor_manager_id == payload.get("role_id")
    )


def _is_owning_leader(payload: dict, t: LeaderTask) -> bool:
    return payload.get("role") == "leader" and t.leader_role_ref == payload.get("role_ref")


def _get_visible_task(task_id: int, payload: dict, db: Session) -> LeaderTask:
    t = db.query(LeaderTask).filter(LeaderTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    role = payload.get("role")
    if role == "supervisor" and not _is_unit_supervisor(payload, t):
        raise HTTPException(status_code=403, detail="Not your unit's task")
    if role == "leader" and not _is_owning_leader(payload, t):
        raise HTTPException(status_code=403, detail="Not your task")
    return t


def _assert_can_edit_core(payload: dict, t: LeaderTask):
    """Task text / due date / delete: the creator or an admin."""
    if payload.get("role") == "admin":
        return
    if t.created_by != int(payload["sub"]):
        raise HTTPException(status_code=403, detail="Only the task's creator or an admin can do this")


def _assert_can_set_status(payload: dict, t: LeaderTask):
    """Status: admin, the unit's supervisor, or the owning leader."""
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t) or _is_owning_leader(payload, t):
        return
    raise HTTPException(status_code=403, detail="You can't change this task's status")


def _assert_can_reorder(payload: dict, t: LeaderTask):
    """Priority: admin or the unit's supervisor (never the leader)."""
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t):
        return
    raise HTTPException(status_code=403, detail="Only a supervisor or admin can change priorities")


def _assert_can_comment(payload: dict, t: LeaderTask):
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t) or _is_owning_leader(payload, t):
        return
    raise HTTPException(status_code=403, detail="You can't comment on this task")


# ── queue helpers ─────────────────────────────────────────────────────────────

def _lock_leader_queue(db: Session, leader_ref: int):
    """Serialise all priority mutations for one leader by locking their role
    row — cheaper and simpler than range-locking the task rows themselves."""
    db.query(TelegramUserRole).filter(TelegramUserRole.id == leader_ref).with_for_update().first()


def _active_tasks(db: Session, leader_ref: int):
    return db.query(LeaderTask).filter(
        LeaderTask.leader_role_ref == leader_ref,
        LeaderTask.status != "done",
    )


def _close_ranks_behind(db: Session, leader_ref: int, gone_priority: Optional[int]):
    """After a task leaves the active queue at ``gone_priority``, pull every
    task behind it one position forward."""
    if gone_priority is None:
        return
    for row in _active_tasks(db, leader_ref).filter(LeaderTask.priority > gone_priority).all():
        row.priority = row.priority - 1


def _leader_telegram_id(db: Session, leader_ref: int) -> Optional[int]:
    lr = db.query(TelegramUserRole).filter(TelegramUserRole.id == leader_ref).first()
    return lr.telegram_id if lr else None


# ── list + picker ─────────────────────────────────────────────────────────────

@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """Admins see all tasks; supervisors their unit's; leaders their own. Any
    other role toggled onto the page gets a read-only view of everything."""
    role = payload.get("role")
    q = db.query(LeaderTask)
    if role == "supervisor":
        q = q.filter(LeaderTask.supervisor_manager_id == payload.get("role_id"))
    elif role == "leader":
        q = q.filter(LeaderTask.leader_role_ref == payload.get("role_ref"))

    rows = q.order_by(
        LeaderTask.leader_role_ref,
        LeaderTask.priority.is_(None),          # active first
        LeaderTask.priority,
        LeaderTask.completed_at.desc().nullslast(),
    ).all()

    counts = dict(
        db.query(LeaderTaskComment.task_id, func.count(LeaderTaskComment.id))
        .filter(LeaderTaskComment.task_id.in_([r.id for r in rows] or [0]))
        .group_by(LeaderTaskComment.task_id)
        .all()
    )
    return {
        "role": role,
        "can_create": role in ("admin", "supervisor"),
        "data": [_serialize(r, counts.get(r.id, 0), payload) for r in rows],
    }


@router.get("/leaders")
def list_assignable_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """Create-form picker source: admins get every approved leader (with their
    unit's brigadir for the grouped label); supervisors only their own."""
    role = payload.get("role")
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Admin or supervisor only")
    q = db.query(TelegramUserRole).filter(
        TelegramUserRole.role == "leader", TelegramUserRole.status == "approved",
    )
    if role == "supervisor":
        q = q.filter(TelegramUserRole.role_id == payload.get("role_id"))
    rows = q.order_by(TelegramUserRole.full_name).all()
    mgr_names = {m.id: m.name for m in db.query(Manager).all()}
    return [
        {
            "role_ref": r.id,
            "name": r.full_name,
            "supervisor_manager_id": r.role_id,
            "supervisor_name": mgr_names.get(r.role_id),
        }
        for r in rows
    ]


# ── create / edit / delete ────────────────────────────────────────────────────

class TaskIn(BaseModel):
    task_text: str
    leader_ref: int
    due_date: date
    comment: Optional[str] = None   # optional first message of the task's thread


@router.post("")
def create_task(
    body: TaskIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    role = payload.get("role")
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Only supervisors and admins can create tasks")
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")

    lr = db.query(TelegramUserRole).filter(
        TelegramUserRole.id == body.leader_ref,
        TelegramUserRole.role == "leader",
        TelegramUserRole.status == "approved",
    ).first()
    if not lr:
        raise HTTPException(status_code=404, detail="Leader not found")
    if role == "supervisor" and lr.role_id != payload.get("role_id"):
        raise HTTPException(status_code=403, detail="You can only assign tasks to your own leaders")

    mgr = db.query(Manager).filter(Manager.id == lr.role_id).first()
    sub = int(payload["sub"])

    _lock_leader_queue(db, lr.id)
    t = LeaderTask(
        leader_role_ref=lr.id,
        leader_name=lr.full_name,
        supervisor_manager_id=lr.role_id,
        supervisor_name=(mgr.name if mgr else None),
        task_text=body.task_text.strip(),
        priority=_active_tasks(db, lr.id).count() + 1,   # joins at the back
        status="todo",
        due_date=body.due_date,
        created_by=sub,
        created_by_name=payload.get("full_name"),
    )
    db.add(t)
    db.flush()

    comment_count = 0
    if (body.comment or "").strip():
        db.add(LeaderTaskComment(
            task_id=t.id,
            author_telegram_id=sub,
            author_name=payload.get("full_name"),
            text=body.comment.strip(),
        ))
        comment_count = 1

    if lr.telegram_id != sub:
        _notify(
            db, lr.telegram_id, type="info", nkey="task_created",
            params={
                "creator_name": payload.get("full_name"),
                "date": body.due_date,
                "task": _snippet(t.task_text),
            },
        )

    db.commit()
    db.refresh(t)
    return _serialize(t, comment_count, payload)


class TaskUpdate(BaseModel):
    task_text: str
    due_date: date


@router.put("/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """Core-field edit (text + due date). The leader is never reassigned —
    that would mean re-queueing across two leaders; delete and recreate."""
    t = _get_visible_task(task_id, payload, db)
    _assert_can_edit_core(payload, t)
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")
    t.task_text = body.task_text.strip()
    t.due_date = body.due_date
    db.commit()
    db.refresh(t)
    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    t = _get_visible_task(task_id, payload, db)
    _assert_can_edit_core(payload, t)
    leader_ref = t.leader_role_ref
    gone = t.priority if t.status != "done" else None
    _lock_leader_queue(db, leader_ref)
    db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).delete()
    db.delete(t)
    db.flush()
    _close_ranks_behind(db, leader_ref, gone)
    db.commit()


# ── status ────────────────────────────────────────────────────────────────────

class StatusIn(BaseModel):
    status: str


@router.patch("/{task_id}/status")
def set_status(
    task_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    t = _get_visible_task(task_id, payload, db)
    _assert_can_set_status(payload, t)

    old = t.status
    if body.status != old:
        _lock_leader_queue(db, t.leader_role_ref)
        if body.status == "done":
            # Leaves the queue; everything behind closes ranks.
            gone = t.priority
            t.priority = None
            t.completed_at = datetime.now(timezone.utc)
            _close_ranks_behind(db, t.leader_role_ref, gone)
        elif old == "done":
            # Reopened → rejoins at the back of the queue.
            t.priority = _active_tasks(db, t.leader_role_ref).count() + 1
            t.completed_at = None
        t.status = body.status

        sub = int(payload["sub"])
        if t.created_by and t.created_by != sub:
            _notify(
                db, t.created_by, type="info", nkey="task_status_changed",
                params={
                    "actor_name": payload.get("full_name"),
                    "task_status": body.status,
                    "task": _snippet(t.task_text),
                },
            )
        db.commit()
        db.refresh(t)

    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload)


# ── priority ──────────────────────────────────────────────────────────────────

class PriorityIn(BaseModel):
    priority: int
    mode: str = "shift"   # swap | shift


@router.patch("/{task_id}/priority")
def set_priority(
    task_id: int,
    body: PriorityIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    if body.mode not in ("swap", "shift"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    t = _get_visible_task(task_id, payload, db)
    _assert_can_reorder(payload, t)
    if t.status == "done" or t.priority is None:
        raise HTTPException(status_code=400, detail="Done tasks have no priority")

    _lock_leader_queue(db, t.leader_role_ref)
    n = _active_tasks(db, t.leader_role_ref).count()
    new_p, old_p = body.priority, t.priority
    if not (1 <= new_p <= n):
        raise HTTPException(status_code=400, detail=f"Priority must be between 1 and {n}")

    if new_p != old_p:
        if body.mode == "swap":
            other = _active_tasks(db, t.leader_role_ref).filter(LeaderTask.priority == new_p).first()
            if other:
                other.priority = old_p
        else:
            # Re-insert at new_p: the span between old and new shifts by one.
            span = _active_tasks(db, t.leader_role_ref)
            if new_p > old_p:
                for row in span.filter(LeaderTask.priority > old_p, LeaderTask.priority <= new_p).all():
                    row.priority = row.priority - 1
            else:
                for row in span.filter(LeaderTask.priority >= new_p, LeaderTask.priority < old_p).all():
                    row.priority = row.priority + 1
        t.priority = new_p
        db.commit()
        db.refresh(t)

    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload)


# ── comments ──────────────────────────────────────────────────────────────────

def _profile_ref(payload: dict) -> Optional[int]:
    """Stable id of the acting profile: telegram_user_roles.id of the active
    role, or the admin sentinel (admin JWTs carry role_ref=None)."""
    return ADMIN_ROLE_REF if payload.get("role") == "admin" else payload.get("role_ref")


def _is_comment_author(c: LeaderTaskComment, payload: dict) -> bool:
    """Ownership is per-PROFILE, not per-account: one telegram account can hold
    several profiles via role switching. Legacy rows (NULL ref, written before
    author_role_ref existed) match by account only."""
    if c.author_telegram_id != int(payload["sub"]):
        return False
    return c.author_role_ref is None or c.author_role_ref == _profile_ref(payload)


def _serialize_comment(c: LeaderTaskComment, payload: dict) -> dict:
    return {
        "id": c.id,
        "task_id": c.task_id,
        "author_telegram_id": c.author_telegram_id,
        "author_role_ref": c.author_role_ref,
        "author_name": c.author_name,
        "text": c.text,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
        # Edit/delete rights of the CALLER, resolved server-side so the client
        # never has to re-derive the profile-ownership rule.
        "is_own": _is_comment_author(c, payload),
    }


class CommentIn(BaseModel):
    text: str


@router.get("/{task_id}/comments")
def list_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    _get_visible_task(task_id, payload, db)
    rows = (
        db.query(LeaderTaskComment)
        .filter(LeaderTaskComment.task_id == task_id)
        .order_by(LeaderTaskComment.created_at, LeaderTaskComment.id)
        .all()
    )
    return [_serialize_comment(c) for c in rows]


@router.post("/{task_id}/comments")
def add_task_comment(
    task_id: int,
    body: CommentIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Comment text is required")
    t = _get_visible_task(task_id, payload, db)
    _assert_can_comment(payload, t)
    sub = int(payload["sub"])
    c = LeaderTaskComment(
        task_id=t.id,
        author_telegram_id=sub,
        author_name=payload.get("full_name"),
        text=body.text.strip(),
    )
    db.add(c)

    # Notify the other side(s) of the thread: the task's creator and the
    # assigned leader, minus the author.
    recipients = {t.created_by, _leader_telegram_id(db, t.leader_role_ref)}
    recipients.discard(None)
    recipients.discard(sub)
    for tg_id in recipients:
        _notify(
            db, tg_id, type="info", nkey="task_comment",
            params={
                "author_name": payload.get("full_name"),
                "comment": _snippet(body.text, 200),
                "task": _snippet(t.task_text),
            },
        )

    db.commit()
    db.refresh(c)
    return _serialize_comment(c)


def _get_own_comment(task_id: int, comment_id: int, payload: dict, db: Session) -> LeaderTaskComment:
    c = db.query(LeaderTaskComment).filter(
        LeaderTaskComment.id == comment_id, LeaderTaskComment.task_id == task_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.author_telegram_id != int(payload["sub"]):
        raise HTTPException(status_code=403, detail="Only the author can modify a comment")
    return c


@router.put("/{task_id}/comments/{comment_id}")
def edit_task_comment(
    task_id: int,
    comment_id: int,
    body: CommentIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Comment text is required")
    _get_visible_task(task_id, payload, db)
    c = _get_own_comment(task_id, comment_id, payload, db)
    c.text = body.text.strip()
    c.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    return _serialize_comment(c)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
def delete_task_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    _get_visible_task(task_id, payload, db)
    c = _get_own_comment(task_id, comment_id, payload, db)
    db.delete(c)
    db.commit()
