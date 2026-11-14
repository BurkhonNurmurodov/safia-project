"""
Shift-manager tasks API — the top menejer → smena menejeri tier (2026-11-14).

The third tier of the one task board (`/tasks`, `routers/tasks.py::board`): a
top-manager — or an admin — sets a task for a SHIFT MANAGER, who works it like
a brigadir works theirs: status, a chat thread, the bell. The urgency flag, the
assignee rule and the comment-ownership rule are NOT restated here — they live
in ``services/task_board.py`` and every tier calls them.

WHAT THIS ROUTER OWNS. Only ``assignee_kind == "shift-manager"`` rows. One
task, one router that owns it; the client routes each mutation by the row's
``assignee_kind``.

THE ASSIGNEE is a shift-manager PROFILE — ``role_profiles.id``, stored in
``leader_profile_id`` (the column names a ``role_profiles`` row; see the table
in ``services/task_board``). ``supervisor_manager_id`` stays NULL: the task
belongs to a person above the units, not to a unit.

WHO REACHES WHAT.
  * governs (sets, raises or drops the flame, closes on the assignee's behalf,
    writes in the thread): an admin, and a top-manager from the first day
    (``tb.OPEN_FROM`` — the operator names it; before it only an admin sets);
  * the ASSIGNEE reads their own tasks, changes their status and writes in
    their thread — from any account working as that shift manager;
  * a shift manager never reads a COLLEAGUE's tasks: what was asked of one
    person above the units is theirs and their manager's;
  * edits the text / the date / deletes: the creating profile or an admin.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all
from app.database import get_db
from app.models import LeaderTask, LeaderTaskComment, RoleProfile
from app.permissions import page_allowed, require_page
from app.services import action_log, task_board as tb
from app.routers.staff import _notify, notify_profile

router = APIRouter(prefix="/api/shift-manager-tasks", tags=["shift-manager-tasks"])

PAGE = "tasks"
# The second door, and why it opens nothing by itself: routers/brigadir_tasks.
DAY_PAGE = "shift-daily"
_door = require_page(PAGE, DAY_PAGE)
_snippet = tb.snippet


# ── rights ────────────────────────────────────────────────────────────────────

def can_manage(payload: dict) -> bool:
    """May the caller RUN a shift manager's tasks — set them, flame them, close
    one on the assignee's behalf? The tier above: an admin, and a top-manager
    from the first day on."""
    return payload.get("role") == "admin" or tb.top_sets(payload)


def is_assignee(payload: dict, t: LeaderTask) -> bool:
    """True when the viewer IS the shift manager the task was set for — from
    any of that person's logins (the profile id is the JWT's ``role_id``)."""
    return (
        payload.get("role") == "shift-manager"
        and t.leader_profile_id is not None
        and t.leader_profile_id == payload.get("role_id")
    )


def _owns_row(db: Session, payload: dict, t: LeaderTask) -> bool:
    if payload.get("role") == "admin":
        return True
    return identity.owns(db, payload, t.created_by_profile, t.created_by)


def can_read(db: Session, payload: dict, t: LeaderTask) -> bool:
    """The row's readers: whoever governs it, the assignee, and a reader the
    TASK page was opened to whole (a "see all" grant, or a role toggled onto it
    that is neither a shift manager nor below one)."""
    if can_manage(payload) or is_assignee(payload, t):
        return True
    if page_scope_is_all(db, payload, PAGE):
        return True
    return (payload.get("role") not in ("shift-manager", "supervisor", "leader")
            and page_allowed(db, payload, PAGE))


def _serialize(t: LeaderTask, comment_count: int, payload: dict, db: Session,
               *, live: Optional[RoleProfile] = None) -> dict:
    manage = can_manage(payload)
    mine = is_assignee(payload, t)
    name = (live.name if live else None) or t.leader_name
    return {
        "id": t.id,
        "assignee_kind": tb.KIND_SHIFT_MANAGER,
        "assignee_name": name,
        "assignee_profile_id": t.leader_profile_id,
        "leader_profile_id": None,
        "leader_name": None,
        "supervisor_manager_id": None,
        "supervisor_name": None,
        "supervisor_shift": live.shift if live else None,
        "task_text": t.task_text,
        "priority": t.priority,
        "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_by": t.created_by,
        "created_by_name": t.created_by_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "comment_count": comment_count,
        "can_edit": _owns_row(db, payload, t),
        "can_status": manage or mine,
        "can_reorder": manage,
        "can_comment": manage or mine,
    }


def _assert(ok: bool, msg: str) -> None:
    if not ok:
        raise HTTPException(status_code=403, detail=msg)


def _mine(task_id: int, payload: dict, db: Session) -> LeaderTask:
    """A row this router owns and the caller may read. 404 for another tier's
    row — on THIS board it does not exist."""
    t = db.query(LeaderTask).filter(LeaderTask.id == task_id).first()
    if not t or tb.kind_of(t) != tb.KIND_SHIFT_MANAGER:
        raise HTTPException(status_code=404, detail="Task not found")
    _assert(can_read(db, payload, t), "Not your task")
    return t


def _profile(db: Session, profile_id: Optional[int]) -> Optional[RoleProfile]:
    if not profile_id:
        return None
    return db.query(RoleProfile).filter_by(id=profile_id, role="shift-manager").first()


def _count(db: Session, task_id: int) -> int:
    return db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == task_id).count()


def _log(t: LeaderTask, **kw) -> None:
    action_log.enrich(
        target_kind=kw.pop("target_kind", "task"),
        target_id=kw.pop("target_id", t.id),
        target_name=_snippet(t.task_text), day=t.due_date, **kw,
    )


# ── picker ────────────────────────────────────────────────────────────────────

@router.get("/managers")
def list_assignable_managers(
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    """Create-form picker source: one entry per shift-manager PROFILE — per
    person. Unclaimed profiles are listed too (``holders: 0``): work set for
    them waits in the bell until the profile is claimed."""
    _assert(can_manage(payload), "Admin or top manager only")
    rows = (db.query(RoleProfile).filter(RoleProfile.role == "shift-manager")
            .order_by(RoleProfile.name, RoleProfile.id).all())
    return [
        {
            "profile_id": p.id,
            "name": p.name,
            "shift": p.shift,
            "factory_id": p.factory_id,
            "holders": len(identity.profile_holders(db, f"shift-manager:{p.id}")),
        }
        for p in rows
    ]


# ── create / edit / delete ────────────────────────────────────────────────────

class TaskIn(BaseModel):
    task_text: str
    profile_id: int                     # the assignee: a shift-manager profile
    due_date: date
    comment: Optional[str] = None       # optional first message of the thread
    urgent: bool = False


@router.post("")
def create_task(
    body: TaskIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    _assert(can_manage(payload), "Only top managers and admins can set shift-manager tasks")
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")
    prof = _profile(db, body.profile_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Shift manager not found")

    sub = int(payload["sub"])
    t = LeaderTask(
        assignee_kind=tb.KIND_SHIFT_MANAGER,
        leader_profile_id=prof.id,            # the assignee's role_profiles.id
        leader_name=prof.name,                # assignee name snapshot
        supervisor_manager_id=None,           # above the units — no unit
        supervisor_name=None,
        task_text=body.task_text.strip(),
        priority=tb.urgent_value(body.urgent),
        status="todo",
        due_date=body.due_date,
        created_by=sub,
        created_by_profile=identity.viewer_profile_key(db, payload),
        created_by_name=payload.get("full_name"),
    )
    db.add(t)
    db.flush()

    comment_count = 0
    if (body.comment or "").strip():
        db.add(LeaderTaskComment(
            task_id=t.id,
            author_telegram_id=sub,
            author_role_ref=tb.profile_ref(payload),
            author_profile=identity.viewer_profile_key(db, payload),
            author_name=payload.get("full_name"),
            text=body.comment.strip(),
        ))
        comment_count = 1

    notify_profile(
        db, f"shift-manager:{prof.id}", nkey="task_created",
        params={
            "creator_name": payload.get("full_name"),
            "date": body.due_date,
            "task": _snippet(t.task_text),
        },
        exclude_account=sub, subject=("task", t.id)
    )

    db.commit()
    db.refresh(t)
    _log(t, details=[("shift_manager", prof.name), ("text", t.task_text),
                     ("deadline", str(t.due_date)), ("priority", t.priority),
                     ("comment", comment_count)])
    return _serialize(t, comment_count, payload, db, live=prof)


class TaskUpdate(BaseModel):
    task_text: str
    due_date: date


@router.put("/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    """Core-field edit (text + due date). The assignee is never changed — delete
    and set it again. The flame is its own control, with its own right."""
    t = _mine(task_id, payload, db)
    _assert(_owns_row(db, payload, t), "Only the task's creator or an admin can do this")
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")
    was_text, was_due = t.task_text, t.due_date
    t.task_text = body.task_text.strip()
    t.due_date = body.due_date
    db.commit()
    db.refresh(t)
    _log(t, details=[("shift_manager", t.leader_name)],
         changes=[c for c in (("text", was_text, t.task_text),
                              ("deadline", str(was_due), str(t.due_date)))
                  if c[1] != c[2]])
    return _serialize(t, _count(db, t.id), payload, db, live=_profile(db, t.leader_profile_id))


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    t = _mine(task_id, payload, db)
    _assert(_owns_row(db, payload, t), "Only the task's creator or an admin can do this")
    was = {"id": t.id, "text": _snippet(t.task_text), "name": t.leader_name,
           "day": t.due_date, "status": t.status, "urgent": tb.is_urgent(t)}
    dropped = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).delete()
    db.delete(t)
    db.commit()
    action_log.enrich(
        target_kind="task", target_id=was["id"], target_name=was["text"], day=was["day"],
        details=[("shift_manager", was["name"]), ("text", was["text"]),
                 ("status", was["status"]),
                 ("urgent", "yes" if was["urgent"] else "no"),
                 ("deadline", str(was["day"])), ("comment", dropped or 0)],
    )


# ── status ────────────────────────────────────────────────────────────────────

class StatusIn(BaseModel):
    status: str


@router.patch("/{task_id}/status")
def set_status(
    task_id: int,
    body: StatusIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    if body.status not in tb.VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    t = _mine(task_id, payload, db)
    _assert(can_manage(payload) or is_assignee(payload, t),
            "You can't change this task's status")

    old = t.status
    if body.status != old:
        if body.status == "done":
            t.completed_at = datetime.now(timezone.utc)
        elif old == "done":
            t.completed_at = None
        t.status = body.status

        sub = int(payload["sub"])
        params = {
            "actor_name": payload.get("full_name"),
            "task_status": body.status,
            "task": _snippet(t.task_text),
        }
        if t.created_by_profile:
            notify_profile(db, t.created_by_profile, nkey="task_status_changed",
                           params=params, exclude_account=sub, subject=("task", t.id))
        elif t.created_by and t.created_by != sub:
            _notify(db, t.created_by, type="info", nkey="task_status_changed",
                    params=params, subject=("task", t.id))
        db.commit()
        db.refresh(t)

    _log(t, details=[("shift_manager", t.leader_name), ("text", _snippet(t.task_text))],
         changes=[("status", old, t.status)] if t.status != old else None)
    return _serialize(t, _count(db, t.id), payload, db, live=_profile(db, t.leader_profile_id))


# ── the flame ─────────────────────────────────────────────────────────────────

class PriorityIn(BaseModel):
    urgent: bool


@router.patch("/{task_id}/priority")
def set_priority(
    task_id: int,
    body: PriorityIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    t = _mine(task_id, payload, db)
    # Never the assignee: what is urgent is the statement of whoever set the
    # work, exactly as on the two tiers below.
    _assert(can_manage(payload), "Only a top manager or admin can change urgency")

    was = tb.is_urgent(t)
    now = bool(body.urgent)
    if now != was:
        t.priority = tb.urgent_value(now)
        db.commit()
        db.refresh(t)

    _log(t, details=[("shift_manager", t.leader_name)],
         changes=[("urgent", "yes" if was else "no", "yes" if now else "no")]
                 if now != was else None)
    return _serialize(t, _count(db, t.id), payload, db, live=_profile(db, t.leader_profile_id))


# ── comments ──────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    text: str


@router.get("/{task_id}/comments")
def list_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    _mine(task_id, payload, db)
    rows = (
        db.query(LeaderTaskComment)
        .filter(LeaderTaskComment.task_id == task_id)
        .order_by(LeaderTaskComment.created_at, LeaderTaskComment.id)
        .all()
    )
    return [tb.serialize_comment(c, payload, db) for c in rows]


@router.post("/{task_id}/comments")
def add_task_comment(
    task_id: int,
    body: CommentIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Comment text is required")
    t = _mine(task_id, payload, db)
    _assert(can_manage(payload) or is_assignee(payload, t),
            "You can't comment on this task")
    sub = int(payload["sub"])
    c = LeaderTaskComment(
        task_id=t.id,
        author_telegram_id=sub,
        author_role_ref=tb.profile_ref(payload),
        author_profile=identity.viewer_profile_key(db, payload),
        author_name=payload.get("full_name"),
        text=body.text.strip(),
    )
    db.add(c)

    # Both sides of the thread, as PEOPLE: the shift manager it was set for and
    # whoever set it, minus the author's own account.
    params = {
        "author_name": payload.get("full_name"),
        "comment": _snippet(body.text, 200),
        "task": _snippet(t.task_text),
    }
    targets = [k for k in (tb.assignee_key(t), t.created_by_profile) if k]
    for prof in dict.fromkeys(targets):
        notify_profile(db, prof, nkey="task_comment", params=params,
                       exclude_account=sub, subject=("task", t.id))
    if not targets and t.created_by and t.created_by != sub:
        _notify(db, t.created_by, type="info", nkey="task_comment", params=params,
                subject=("task", t.id))

    db.commit()
    db.refresh(c)
    _log(t, target_kind="comment", target_id=c.id,
         details=[("task_id", t.id), ("shift_manager", t.leader_name), ("text", c.text)])
    return tb.serialize_comment(c, payload, db)


def _own_comment(task_id: int, comment_id: int, payload: dict, db: Session) -> LeaderTaskComment:
    c = db.query(LeaderTaskComment).filter(
        LeaderTaskComment.id == comment_id, LeaderTaskComment.task_id == task_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not tb.is_comment_author(c, payload, db):
        raise HTTPException(status_code=403, detail="Only the author profile can modify a comment")
    return c


@router.put("/{task_id}/comments/{comment_id}")
def edit_task_comment(
    task_id: int,
    comment_id: int,
    body: CommentIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Comment text is required")
    t = _mine(task_id, payload, db)
    c = _own_comment(task_id, comment_id, payload, db)
    was = c.text
    c.text = body.text.strip()
    c.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    _log(t, target_kind="comment", target_id=c.id,
         details=[("task_id", t.id), ("shift_manager", t.leader_name)],
         changes=[("text", was, c.text)])
    return tb.serialize_comment(c, payload, db)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
def delete_task_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(_door),
):
    t = _mine(task_id, payload, db)
    c = _own_comment(task_id, comment_id, payload, db)
    gone_id, gone_text = c.id, c.text
    db.delete(c)
    db.commit()
    _log(t, target_kind="comment", target_id=gone_id,
         details=[("task_id", t.id), ("shift_manager", t.leader_name), ("text", gone_text)])
