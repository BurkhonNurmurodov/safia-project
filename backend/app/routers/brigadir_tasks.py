"""
Brigadir tasks API — the smena menejeri → brigadir tier.

The same board as ``/tasks`` one level up the org chart: a shift manager sets
tasks for the brigadirs of their shift, each brigadir works a dense 1..N queue,
every task carries a chat thread, and the bell tells the people concerned. The
queue engine, the assignee rule and the comment-ownership rule are NOT restated
here — they live in ``services/task_board.py`` and both boards call them, so
"priority 1" cannot come to mean two different things.

WHAT THIS BOARD OWNS. Only ``assignee_kind == "supervisor"`` rows. Leader tasks
inside the viewer's units are SERVED here (a shift manager is answerable for
their shift and asked to see the whole cascade) but are strictly read-only:
every mutation refuses them, and they are edited on ``/tasks``, where the
unit's own brigadir governs them. One task, one board that owns it — otherwise
two routers with two rights models can both claim the same row and only one of
them is right.

WHO REACHES WHAT. Never re-spelled: ``services/shift_scope`` is THE definition
of a shift manager's reach (their shift ∩ their plant), and it is asked twice —
``unit_ids`` for reading, ``covers`` for every single-unit write. A shift
manager with no plant covers their shift everywhere, which is that module's
standing "None covers everything" rule and the reason this ships inert for
anyone an admin has not narrowed.

Identity note: a task belongs to a PROFILE — the person — not to the
registration that happened to be picked. A brigadir profile is
``supervisor:<managers.id>``; several Telegram accounts may work as one
brigadir, and they share one board, one queue and one set of rights.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all
from app.database import get_db
from app.models import LeaderTask, LeaderTaskComment, Manager
from app.permissions import require_page
from app.services import action_log, shift_scope, task_board as tb
# Shared notification helpers: _notify writes a single bell row; notify_profile
# addresses the PERSON — one bell row on the profile plus a DM to every account
# holding it, so co-holders and successors are never silently skipped.
from app.routers.staff import _notify, notify_profile

router = APIRouter(prefix="/api/brigadir-tasks", tags=["brigadir-tasks"])

PAGE = "brigadir-tasks"
_snippet = tb.snippet


# ── scope ─────────────────────────────────────────────────────────────────────
# Reading and writing are two different questions and are answered separately.
# A viewer widened by a page grant may BROWSE another shift's board and must not
# set its brigadirs work — the rule /staff's cell placement already follows.

def _sees_all(db: Session, payload: dict) -> bool:
    return payload.get("role") == "admin" or page_scope_is_all(db, payload, PAGE)


def _scope_units(db: Session, payload: dict) -> Optional[list[int]]:
    """The units this viewer's board covers. ``None`` = every unit; an EMPTY
    list is a real answer ("no unit matches") and must never be read as "no
    filter" — that is the whole plant."""
    if _sees_all(db, payload):
        return None
    role = payload.get("role")
    if role == "shift-manager":
        # Archived units included: a unit's history must not vanish the day it
        # is archived, exactly as /concerns reads it.
        return shift_scope.unit_ids(db, payload.get("role_id"), include_archived=True)
    if role == "supervisor":
        return [payload.get("role_id")]
    # Any other role toggled onto the page reads everything and writes nothing —
    # the convention /tasks already sets for a page opened to an extra role.
    return None


def _can_manage(db: Session, payload: dict, manager_id: Optional[int]) -> bool:
    """May the caller RUN this unit's brigadir board — set tasks, move the
    queue, close a task on the brigadir's behalf?

    Admin, or the shift manager whose shift ∩ plant contains the unit. Asked per
    UNIT, never per role: "you are a shift manager" is not "you are answerable
    for THIS unit", and ``covers`` is the one place that distinction lives.
    """
    role = payload.get("role")
    if role == "admin":
        return True
    if role == "shift-manager":
        return shift_scope.covers(db, payload.get("role_id"), manager_id)
    return False


def _is_assignee(payload: dict, t: LeaderTask) -> bool:
    """True when the viewer IS the brigadir the task was set for — from any of
    that person's logins, since a brigadir profile is keyed by unit."""
    return (
        payload.get("role") == "supervisor"
        and t.supervisor_manager_id is not None
        and t.supervisor_manager_id == payload.get("role_id")
    )


def _owns_row(db: Session, payload: dict, t: LeaderTask) -> bool:
    """Task text / due date / delete: the creating PROFILE or an admin."""
    if payload.get("role") == "admin":
        return True
    return identity.owns(db, payload, t.created_by_profile, t.created_by)


# ── serialisation ─────────────────────────────────────────────────────────────
# Every right is resolved server-side and shipped per ROW. The /tasks board can
# derive them from the viewer's role because it is homogeneous; this one is not
# — it mixes brigadir tasks the viewer governs with leader tasks they may only
# read — so a client deriving rights from a role would draw controls the
# endpoints then refuse.

def _serialize(t: LeaderTask, comment_count: int, payload: dict, db: Session,
               *, unit_name: Optional[str] = None,
               unit_shift: Optional[int] = None) -> dict:
    kind = tb.kind_of(t)
    mine = kind == tb.KIND_SUPERVISOR
    manage = mine and _can_manage(db, payload, t.supervisor_manager_id)
    assignee = mine and _is_assignee(payload, t)
    return {
        "id": t.id,
        "assignee_kind": kind,
        # WHO the work was set for, whichever tier this row belongs to — so the
        # table has one column to print and never a blank cell it cannot explain.
        "assignee_name": (unit_name or t.supervisor_name) if mine else t.leader_name,
        "leader_profile_id": t.leader_profile_id,
        "leader_name": None if mine else t.leader_name,
        "supervisor_manager_id": t.supervisor_manager_id,
        # Read live off the register so a renamed unit does not read as two.
        "supervisor_name": unit_name or t.supervisor_name,
        "supervisor_shift": unit_shift,
        "task_text": t.task_text,
        "priority": t.priority,
        "status": t.status,
        "due_date": t.due_date.isoformat() if t.due_date else None,
        "completed_at": t.completed_at.isoformat() if t.completed_at else None,
        "created_by": t.created_by,
        "created_by_name": t.created_by_name,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "comment_count": comment_count,
        "can_edit": mine and _owns_row(db, payload, t),
        "can_status": manage or assignee,
        "can_reorder": manage,
        "can_comment": manage or assignee,
    }


# ── row access ────────────────────────────────────────────────────────────────

def _visible(task_id: int, payload: dict, db: Session) -> LeaderTask:
    t = db.query(LeaderTask).filter(LeaderTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    units = _scope_units(db, payload)
    if units is not None and t.supervisor_manager_id not in units:
        raise HTTPException(status_code=403, detail="Not in your scope")
    return t


def _mine(task_id: int, payload: dict, db: Session) -> LeaderTask:
    """A row this board may WRITE. A leader task is read-only here whoever is
    asking — including an admin, who has /tasks for it."""
    t = _visible(task_id, payload, db)
    if tb.kind_of(t) != tb.KIND_SUPERVISOR:
        raise HTTPException(status_code=403, detail="A leader task is managed on the tasks board")
    return t


def _assert(ok: bool, msg: str) -> None:
    if not ok:
        raise HTTPException(status_code=403, detail=msg)


# ── list + picker ─────────────────────────────────────────────────────────────

@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Both tiers of everything in the viewer's units — brigadir tasks they act
    on, leader tasks they only read. The client tabs between them; the rights
    ride on each row."""
    units = _scope_units(db, payload)
    q = db.query(LeaderTask)
    if units is not None:
        if not units:                      # an empty scope is a real answer
            q = q.filter(False)
        else:
            q = q.filter(LeaderTask.supervisor_manager_id.in_(units))

    rows = q.order_by(
        LeaderTask.assignee_kind,
        LeaderTask.supervisor_manager_id,
        LeaderTask.leader_profile_id,
        LeaderTask.priority.is_(None),     # active first
        LeaderTask.priority,
        LeaderTask.completed_at.desc().nullslast(),
    ).all()

    counts = dict(
        db.query(LeaderTaskComment.task_id, func.count(LeaderTaskComment.id))
        .filter(LeaderTaskComment.task_id.in_([r.id for r in rows] or [0]))
        .group_by(LeaderTaskComment.task_id)
        .all()
    )
    mgrs = {m.id: m for m in db.query(Manager).all()}

    def _row(r):
        m = mgrs.get(r.supervisor_manager_id)
        return _serialize(r, counts.get(r.id, 0), payload, db,
                          unit_name=(m.name if m else None),
                          unit_shift=(m.shift if m else None))

    data = [_row(r) for r in rows]
    return {
        "role": payload.get("role"),
        "can_create": _can_create_anywhere(db, payload),
        "data": data,
    }


def _manageable_units(db: Session, payload: dict) -> list[Manager]:
    """The units whose board this viewer may RUN, live and unarchived — THE
    source for the assignee picker, so the list offered and the units the
    create endpoint accepts can never be two different sets."""
    role = payload.get("role")
    q = db.query(Manager).filter(Manager.archived.is_(False))
    if role == "admin":
        pass
    elif role == "shift-manager":
        ids = shift_scope.unit_ids(db, payload.get("role_id"))
        if not ids:
            return []
        q = q.filter(Manager.id.in_(ids))
    else:
        return []
    return q.order_by(Manager.name).all()


def _can_create_anywhere(db: Session, payload: dict) -> bool:
    return bool(_manageable_units(db, payload))


@router.get("/brigadirs")
def list_assignable_brigadirs(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Create-form picker source: one entry per brigadir — per unit, which is
    what a brigadir profile is keyed by. Unclaimed units are listed too
    (``holders: 0``): a brigadir exists as an organizational post before anyone
    registers, and work set for them waits in the bell until the profile is
    claimed."""
    if payload.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Admin or shift manager only")
    return [
        {
            "supervisor_manager_id": m.id,
            "name": m.name,
            "shift": m.shift,
            "factory_id": m.factory_id,
            "holders": len(identity.profile_holders(db, f"supervisor:{m.id}")),
        }
        for m in _manageable_units(db, payload)
    ]


# ── create / edit / delete ────────────────────────────────────────────────────

class TaskIn(BaseModel):
    task_text: str
    supervisor_manager_id: int          # the assignee: the brigadir's unit
    due_date: date
    comment: Optional[str] = None       # optional first message of the thread


@router.post("")
def create_task(
    body: TaskIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    if payload.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Only shift managers and admins can set brigadir tasks")
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")

    mgr = db.query(Manager).filter(Manager.id == body.supervisor_manager_id).first()
    if not mgr:
        raise HTTPException(status_code=404, detail="Brigadir not found")
    # Re-checked here and not merely by what the picker offered — the endpoint
    # is reachable without the UI.
    _assert(_can_manage(db, payload, mgr.id), "This brigadir is not in your shift")

    sub = int(payload["sub"])
    owner = tb.unit_owner_filter(mgr.id)
    tb.lock_queue(db, kind=tb.KIND_SUPERVISOR, manager_id=mgr.id)

    t = LeaderTask(
        assignee_kind=tb.KIND_SUPERVISOR,
        leader_profile_id=None,
        leader_name=mgr.name,                 # assignee name snapshot
        supervisor_manager_id=mgr.id,
        supervisor_name=mgr.name,
        task_text=body.task_text.strip(),
        priority=tb.active_tasks(db, owner).count() + 1,   # joins at the back
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

    # Reaches every account working as this brigadir — and waits in the bell if
    # nobody has claimed the profile yet.
    notify_profile(
        db, f"supervisor:{mgr.id}", nkey="task_created",
        params={
            "creator_name": payload.get("full_name"),
            "date": body.due_date,
            "task": _snippet(t.task_text),
        },
        exclude_account=sub,
    )

    db.commit()
    db.refresh(t)
    action_log.enrich(
        target_kind="task", target_id=t.id, target_name=_snippet(t.task_text),
        unit_id=mgr.id, unit_name=mgr.name, day=t.due_date,
        details=[("brigadir", mgr.name), ("text", t.task_text),
                 ("deadline", str(t.due_date)), ("priority", t.priority),
                 ("comment", comment_count)],
    )
    return _serialize(t, comment_count, payload, db,
                      unit_name=mgr.name, unit_shift=mgr.shift)


class TaskUpdate(BaseModel):
    task_text: str
    due_date: date


@router.put("/{task_id}")
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Core-field edit (text + due date). The brigadir is never reassigned —
    that would mean re-queueing across two units; delete and recreate."""
    t = _mine(task_id, payload, db)
    _assert(_owns_row(db, payload, t), "Only the task's creator or an admin can do this")
    if not (body.task_text or "").strip():
        raise HTTPException(status_code=400, detail="Task text is required")
    was_text, was_due = t.task_text, t.due_date
    t.task_text = body.task_text.strip()
    t.due_date = body.due_date
    db.commit()
    db.refresh(t)
    action_log.enrich(
        target_kind="task", target_id=t.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("brigadir", t.supervisor_name)],
        changes=[c for c in (("text", was_text, t.task_text),
                             ("deadline", str(was_due), str(t.due_date)))
                 if c[1] != c[2]],
    )
    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload, db)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    t = _mine(task_id, payload, db)
    _assert(_owns_row(db, payload, t), "Only the task's creator or an admin can do this")
    owner = tb.owner_filter(t)
    gone = t.priority if t.status != "done" else None
    # Snapshot before the delete — the row is unreadable after commit.
    was = {"id": t.id, "text": _snippet(t.task_text), "unit": t.supervisor_manager_id,
           "unit_name": t.supervisor_name, "day": t.due_date,
           "status": t.status, "priority": t.priority}
    tb.lock_for(db, t)
    dropped = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).delete()
    db.delete(t)
    db.flush()
    tb.close_ranks_behind(db, owner, gone)
    db.commit()
    action_log.enrich(
        target_kind="task", target_id=was["id"], target_name=was["text"],
        unit_id=was["unit"], unit_name=was["unit_name"], day=was["day"],
        details=[("brigadir", was["unit_name"]), ("text", was["text"]),
                 ("status", was["status"]), ("priority", was["priority"]),
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
    payload: dict = Depends(require_page(PAGE)),
):
    if body.status not in tb.VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    t = _mine(task_id, payload, db)
    _assert(_can_manage(db, payload, t.supervisor_manager_id) or _is_assignee(payload, t),
            "You can't change this task's status")

    old = t.status
    if body.status != old:
        owner = tb.owner_filter(t)
        tb.lock_for(db, t)
        if body.status == "done":
            # Leaves the queue; everything behind closes ranks.
            gone = t.priority
            t.priority = None
            t.completed_at = datetime.now(timezone.utc)
            tb.close_ranks_behind(db, owner, gone)
        elif old == "done":
            # Reopened → rejoins at the back of the queue.
            t.priority = tb.active_tasks(db, owner).count() + 1
            t.completed_at = None
        t.status = body.status

        sub = int(payload["sub"])
        params = {
            "actor_name": payload.get("full_name"),
            "task_status": body.status,
            "task": _snippet(t.task_text),
        }
        if t.created_by_profile:
            # Everyone working as the shift manager who set it hears about it.
            notify_profile(db, t.created_by_profile, nkey="task_status_changed",
                           params=params, exclude_account=sub)
        elif t.created_by and t.created_by != sub:
            _notify(db, t.created_by, type="info", nkey="task_status_changed",
                    params=params)
        db.commit()
        db.refresh(t)

    action_log.enrich(
        target_kind="task", target_id=t.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("brigadir", t.supervisor_name), ("text", _snippet(t.task_text))],
        changes=[("status", old, t.status)] if t.status != old else None,
    )
    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload, db)


# ── priority ──────────────────────────────────────────────────────────────────

class PriorityIn(BaseModel):
    priority: int
    mode: str = "shift"   # swap | shift


@router.patch("/{task_id}/priority")
def set_priority(
    task_id: int,
    body: PriorityIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    if body.mode not in ("swap", "shift"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    t = _mine(task_id, payload, db)
    # Never the brigadir: the order of their queue is the shift manager's
    # statement of what matters, exactly as a leader cannot reorder theirs.
    _assert(_can_manage(db, payload, t.supervisor_manager_id),
            "Only a shift manager or admin can change priorities")
    if t.status == "done" or t.priority is None:
        raise HTTPException(status_code=400, detail="Done tasks have no priority")

    owner = tb.owner_filter(t)
    tb.lock_for(db, t)
    n = tb.active_tasks(db, owner).count()
    new_p, old_p = body.priority, t.priority
    if not (1 <= new_p <= n):
        raise HTTPException(status_code=400, detail=f"Priority must be between 1 and {n}")

    if new_p != old_p:
        tb.reinsert(db, owner, t, new_p, body.mode)
        db.commit()
        db.refresh(t)

    action_log.enrich(
        target_kind="task", target_id=t.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("brigadir", t.supervisor_name), ("mode", body.mode), ("count", n)],
        changes=[("priority", old_p, t.priority)] if t.priority != old_p else None,
    )
    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload, db)


# ── comments ──────────────────────────────────────────────────────────────────

class CommentIn(BaseModel):
    text: str


@router.get("/{task_id}/comments")
def list_task_comments(
    task_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    # Readable wherever the row is readable — including a leader task the shift
    # manager may only look at; the thread is part of what they are shown.
    _visible(task_id, payload, db)
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
    payload: dict = Depends(require_page(PAGE)),
):
    if not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="Comment text is required")
    t = _mine(task_id, payload, db)
    _assert(_can_manage(db, payload, t.supervisor_manager_id) or _is_assignee(payload, t),
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

    # Notify the other side(s) of the thread — the brigadir it was set for and
    # the person who set it — as PEOPLE: one bell row on the profile plus a DM
    # to every account working as them, minus the author's own account.
    params = {
        "author_name": payload.get("full_name"),
        "comment": _snippet(body.text, 200),
        "task": _snippet(t.task_text),
    }
    targets = [k for k in (tb.assignee_key(t), t.created_by_profile) if k]
    for prof in dict.fromkeys(targets):          # de-duplicated, order kept
        notify_profile(db, prof, nkey="task_comment", params=params,
                       exclude_account=sub)
    if not targets and t.created_by and t.created_by != sub:
        _notify(db, t.created_by, type="info", nkey="task_comment", params=params)

    db.commit()
    db.refresh(c)
    action_log.enrich(
        target_kind="comment", target_id=c.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("brigadir", t.supervisor_name), ("text", c.text)],
    )
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
    payload: dict = Depends(require_page(PAGE)),
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
    action_log.enrich(
        target_kind="comment", target_id=c.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("brigadir", t.supervisor_name)],
        changes=[("text", was, c.text)],
    )
    return tb.serialize_comment(c, payload, db)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
def delete_task_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    t = _mine(task_id, payload, db)
    c = _own_comment(task_id, comment_id, payload, db)
    gone_id, gone_text = c.id, c.text
    db.delete(c)
    db.commit()
    action_log.enrich(
        target_kind="comment", target_id=gone_id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("brigadir", t.supervisor_name), ("text", gone_text)],
    )
