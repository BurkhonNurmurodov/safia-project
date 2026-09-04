"""
Leader tasks ("DAILY протокол") API — the brigadir → lider tier.

The WRITE endpoints here serve ``assignee_kind == "leader"`` rows and NOTHING
else. The brigadir tier (smena menejeri → brigadir) lives on the same table and
is written through ``routers/brigadir_tasks.py``; a task is READ wherever a
viewer's scope reaches it but MUTATED only through the router that owns it, so
neither router has to reason about the other's rights. The queue engine both
share is ``services/task_board.py`` — never re-spell it here.

Since 2026-09-04 there is ONE page for both tiers (`/tasks`), fed by ``board``
below: every row the viewer may see, from either tier, with the rights on each
row. ``GET /api/tasks`` (the leader tier alone) stays for a tab still open on
an older bundle.

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
Every queue mutation first locks the leader's role_profiles row, which
serialises concurrent renumbering per leader.

Identity note: a task belongs to a leader PROFILE — the person — not to the
registration that happened to be picked. Several Telegram accounts may work as
one leader; they share one board, one queue and one set of rights, and the work
survives an unassign→re-claim. See app/identity.py.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import (
    LeaderTask, LeaderTaskComment, Manager, RoleProfile, TelegramUserRole,
)
from app.capabilities import page_scope_is_all
from app.permissions import require_page
from app.services import action_log, shift_scope, task_board as tb
# Shared notification helpers: _notify writes a single bell row; notify_profile
# addresses the PERSON — one bell row on the profile plus a DM to every account
# holding it, so co-holders and successors are never silently skipped.
from app.routers.staff import _notify, notify_profile
# The brigadir tier's picker/creation rule, asked by the one board below so the
# «can create» flag and the list the endpoint accepts can never be two sets.
from app.routers import brigadir_tasks as _bt

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

VALID_STATUSES = tb.VALID_STATUSES
_snippet = tb.snippet


def _serialize(t: LeaderTask, comment_count: int, payload: dict,
               db: Session, live_name: str | None = None) -> dict:
    return {
        "id": t.id,
        # The PERSON the task belongs to. leader_role_ref is emitted only for
        # legacy rows the backfill could not resolve; nothing keys off it.
        "leader_profile_id": t.leader_profile_id,
        "leader_role_ref": t.leader_role_ref,
        # Read live from the profile so a rename propagates to every task
        # instead of leaving one person listed under two names.
        "leader_name": live_name or t.leader_name,
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
        # Core fields (text / due date) + delete: the creating PROFILE or admin.
        "can_edit": _can_edit_core(db, payload, t),
    }


# ── access helpers ────────────────────────────────────────────────────────────
# Every check below compares PROFILES. Two accounts holding one brigadir profile
# are the same person and must have identical rights over that unit's work; the
# same account switched into a different profile must not.

def _is_unit_supervisor(payload: dict, t: LeaderTask) -> bool:
    return (
        payload.get("role") == "supervisor"
        and t.supervisor_manager_id is not None
        and t.supervisor_manager_id == payload.get("role_id")
    )


def _is_owning_leader(db: Session, payload: dict, t: LeaderTask) -> bool:
    """True when the viewer IS the leader the task belongs to — from any of
    that person's logins. Legacy rows without a profile fall back to the old
    registration match so nothing becomes unreachable mid-migration."""
    if payload.get("role") != "leader":
        return False
    if t.leader_profile_id is not None:
        return t.leader_profile_id == identity.viewer_leader_profile_id(db, payload)
    return t.leader_role_ref is not None and t.leader_role_ref == payload.get("role_ref")


def _get_visible_task(task_id: int, payload: dict, db: Session) -> LeaderTask:
    t = db.query(LeaderTask).filter(LeaderTask.id == task_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    if tb.kind_of(t) != tb.KIND_LEADER:
        # Belongs to /brigadir-tasks. 404 rather than 403: on THIS board the row
        # does not exist, and saying "forbidden" would confirm an id to somebody
        # who has no business enumerating the other tier.
        raise HTTPException(status_code=404, detail="Task not found")
    role = payload.get("role")
    # Matches the list: a "see all" page grant makes every task readable. The
    # _assert_can_* guards below still gate every mutation.
    if page_scope_is_all(db, payload, "tasks"):
        return t
    if role == "supervisor" and not _is_unit_supervisor(payload, t):
        raise HTTPException(status_code=403, detail="Not your unit's task")
    if role == "leader" and not _is_owning_leader(db, payload, t):
        raise HTTPException(status_code=403, detail="Not your task")
    return t


def _can_edit_core(db: Session, payload: dict, t: LeaderTask) -> bool:
    """Task text / due date / delete: the creating PROFILE or an admin."""
    if payload.get("role") == "admin":
        return True
    return identity.owns(db, payload, t.created_by_profile, t.created_by)


def _assert_can_edit_core(db: Session, payload: dict, t: LeaderTask):
    if not _can_edit_core(db, payload, t):
        raise HTTPException(status_code=403, detail="Only the task's creator or an admin can do this")


def _assert_can_set_status(db: Session, payload: dict, t: LeaderTask):
    """Status: admin, the unit's supervisor, or the owning leader."""
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t) or _is_owning_leader(db, payload, t):
        return
    raise HTTPException(status_code=403, detail="You can't change this task's status")


def _assert_can_reorder(payload: dict, t: LeaderTask):
    """Priority: admin or the unit's supervisor (never the leader)."""
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t):
        return
    raise HTTPException(status_code=403, detail="Only a supervisor or admin can change priorities")


def _assert_can_comment(db: Session, payload: dict, t: LeaderTask):
    if payload.get("role") == "admin" or _is_unit_supervisor(payload, t) or _is_owning_leader(db, payload, t):
        return
    raise HTTPException(status_code=403, detail="You can't comment on this task")


# ── queue helpers ─────────────────────────────────────────────────────────────
# The priority queue belongs to the PERSON: one dense 1..N per leader profile,
# shared by all their logins. Keying it to a registration gave one person as
# many independent queues as they had accounts, each with its own "priority 1".

_owned_by = tb.owner_filter
_active_tasks = tb.active_tasks
_close_ranks_behind = tb.close_ranks_behind


def _lock_leader_queue(db: Session, profile_id: Optional[int]):
    """Serialise a leader's priority mutations by locking their PROFILE row —
    the one object all their registrations share."""
    tb.lock_queue(db, kind=tb.KIND_LEADER, leader_profile_id=profile_id)


# ── list + picker ─────────────────────────────────────────────────────────────

@router.get("")
def list_tasks(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """Admins see all tasks; supervisors their unit's; leaders their own. Any
    other role toggled onto the page gets a read-only view of everything — as
    does anyone holding a personal ``page.view.tasks`` grant at "all"."""
    role = payload.get("role")
    # A "see all" page grant widens READING to every board. It deliberately does
    # not touch the reported `role` / `can_create`: what this person may create
    # or edit is still their role's business, decided per row further down.
    sees_all = page_scope_is_all(db, payload, "tasks")
    # The leader tier only. A brigadir task carries the same unit id, so without
    # this a supervisor's own board would silently absorb the tasks their shift
    # manager set them — rows this page can neither name nor reorder.
    q = db.query(LeaderTask).filter(LeaderTask.assignee_kind == tb.KIND_LEADER)
    if role == "supervisor" and not sees_all:
        q = q.filter(LeaderTask.supervisor_manager_id == payload.get("role_id"))
    elif role == "leader" and not sees_all:
        # The person's whole queue, from whichever account they logged in with.
        pid = identity.viewer_leader_profile_id(db, payload)
        own = [LeaderTask.leader_profile_id == pid] if pid else []
        if payload.get("role_ref"):
            # legacy rows the backfill could not resolve to a profile
            own.append(and_(LeaderTask.leader_profile_id.is_(None),
                            LeaderTask.leader_role_ref == payload.get("role_ref")))
        q = q.filter(or_(*own)) if own else q.filter(False)

    rows = q.order_by(
        LeaderTask.leader_profile_id,
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
    # Supervisor → shift, so the client can offer a shift filter that also narrows
    # the supervisor picker. Attached to the list rows only (mutation responses
    # trigger a full list refetch, which carries the shift).
    mgr_shift = {m.id: m.shift for m in db.query(Manager).all()}
    # Current profile names, so a renamed leader doesn't read as two people.
    live_names = {
        p.id: p.name for p in db.query(RoleProfile).filter(
            RoleProfile.id.in_([r.leader_profile_id for r in rows if r.leader_profile_id] or [0])
        )
    }

    def _row(r):
        d = _serialize(r, counts.get(r.id, 0), payload, db,
                       live_name=live_names.get(r.leader_profile_id))
        d["supervisor_shift"] = mgr_shift.get(r.supervisor_manager_id)
        return d

    return {
        "role": role,
        "can_create": role in ("admin", "supervisor"),
        "data": [_row(r) for r in rows],
    }


# ── the ONE board ─────────────────────────────────────────────────────────────

def _creator_role(profile_key: Optional[str]) -> Optional[str]:
    """The creator's ROLE off their profile key (``"supervisor:12"`` →
    ``supervisor``) — what the analysis board badges a name with. Legacy rows
    that predate ``created_by_profile`` carry none."""
    if not profile_key or ":" not in profile_key:
        return None
    return profile_key.split(":", 1)[0]


@router.get("/board")
def board(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """BOTH tiers of everything in the viewer's reach, with the rights on each
    row — what `/tasks` renders since the two boards became one page.

    Reach is the UNION of what the two tier lists served: an admin (or a "see
    all" page grant) everything; a shift manager both tiers inside their shift
    ∩ plant (`services/shift_scope`, archived units kept — a unit's history
    must not vanish the day it is archived); a brigadir both tiers of their own
    unit (the tasks set FOR them and the ones they set their leaders); a leader
    their own queue and nothing above it. Any other role toggled onto the page
    reads everything and writes nothing.

    Rights are PER ROW because the board is not homogeneous: a shift manager
    governs the brigadir rows and only reads the leader rows, a brigadir the
    reverse. Each right is the same predicate the owning router's write
    endpoint applies (``_assert_can_*`` here, ``_can_manage`` /
    ``_is_assignee`` / ``_owns_row`` in brigadir_tasks), resolved ONCE per
    request rather than once per row, so a control drawn on the page is never
    one the endpoint then refuses. Which router owns a row is ``assignee_kind``
    — leader rows write through ``/api/tasks``, brigadir rows through
    ``/api/brigadir-tasks``.
    """
    role = payload.get("role")
    is_admin = role == "admin"
    sees_all = is_admin or page_scope_is_all(db, payload, "tasks")
    q = db.query(LeaderTask)
    if not sees_all:
        if role == "shift-manager":
            units = shift_scope.unit_ids(db, payload.get("role_id"), include_archived=True)
            q = q.filter(LeaderTask.supervisor_manager_id.in_(units)) if units else q.filter(False)
        elif role == "supervisor":
            q = q.filter(LeaderTask.supervisor_manager_id == payload.get("role_id"))
        elif role == "leader":
            pid = identity.viewer_leader_profile_id(db, payload)
            own = [LeaderTask.leader_profile_id == pid] if pid else []
            if payload.get("role_ref"):
                own.append(and_(LeaderTask.leader_profile_id.is_(None),
                                LeaderTask.leader_role_ref == payload.get("role_ref")))
            q = q.filter(LeaderTask.assignee_kind == tb.KIND_LEADER)
            q = q.filter(or_(*own)) if own else q.filter(False)

    rows = q.order_by(
        LeaderTask.assignee_kind,
        LeaderTask.supervisor_manager_id,
        LeaderTask.leader_profile_id,
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
    mgrs = {m.id: m for m in db.query(Manager).all()}
    live_names = {
        p.id: p.name for p in db.query(RoleProfile).filter(
            RoleProfile.id.in_([r.leader_profile_id for r in rows if r.leader_profile_id] or [0])
        )
    }

    # The viewer, resolved once: their profile (creator rights), their own
    # leader profile (assignee rights on the leader tier), their own unit
    # (brigadir rights on both tiers) and the units a shift manager RUNS —
    # `shift_scope.covers` per unit is shift ∩ plant, which is exactly
    # `unit_ids(include_archived=True)` as a set.
    viewer_key = identity.viewer_profile_key(db, payload)
    viewer_pid = identity.viewer_leader_profile_id(db, payload) if role == "leader" else None
    own_unit = payload.get("role_id") if role == "supervisor" else None
    managed = (set(shift_scope.unit_ids(db, payload.get("role_id"), include_archived=True))
               if role == "shift-manager" else set())
    try:
        sub = int(payload.get("sub"))
    except (TypeError, ValueError):
        sub = None

    def _owns(t: LeaderTask) -> bool:
        if is_admin:
            return True
        if t.created_by_profile:
            return identity.same_profile(t.created_by_profile, viewer_key)
        return t.created_by is not None and sub is not None and int(t.created_by) == sub

    def _owning_leader(t: LeaderTask) -> bool:
        if role != "leader":
            return False
        if t.leader_profile_id is not None:
            return t.leader_profile_id == viewer_pid
        return t.leader_role_ref is not None and t.leader_role_ref == payload.get("role_ref")

    def _rights(t: LeaderTask, kind: str) -> dict:
        unit_mine = own_unit is not None and t.supervisor_manager_id == own_unit
        if kind == tb.KIND_SUPERVISOR:
            manage = is_admin or t.supervisor_manager_id in managed
            return {"can_edit": _owns(t), "can_status": manage or unit_mine,
                    "can_reorder": manage, "can_comment": manage or unit_mine}
        lead = _owning_leader(t)
        return {"can_edit": _owns(t), "can_status": is_admin or unit_mine or lead,
                "can_reorder": is_admin or unit_mine, "can_comment": is_admin or unit_mine or lead}

    def _row(t: LeaderTask) -> dict:
        kind = tb.kind_of(t)
        sup_kind = kind == tb.KIND_SUPERVISOR
        m = mgrs.get(t.supervisor_manager_id)
        # Read live off the registers so a renamed unit or leader does not read
        # as two people.
        unit_name = (m.name if m else None) or t.supervisor_name
        leader_name = None if sup_kind else (live_names.get(t.leader_profile_id) or t.leader_name)
        return {
            "id": t.id,
            "assignee_kind": kind,
            # WHO the work was set for, whichever tier — one column to print.
            "assignee_name": unit_name if sup_kind else leader_name,
            "leader_profile_id": t.leader_profile_id,
            "leader_name": leader_name,
            "supervisor_manager_id": t.supervisor_manager_id,
            "supervisor_name": unit_name,
            "supervisor_shift": m.shift if m else None,
            "task_text": t.task_text,
            "priority": t.priority,
            "status": t.status,
            "due_date": t.due_date.isoformat() if t.due_date else None,
            "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "created_by": t.created_by,
            "created_by_name": t.created_by_name,
            "created_by_profile": t.created_by_profile,
            "creator_role": _creator_role(t.created_by_profile),
            "comment_count": counts.get(t.id, 0),
            **_rights(t, kind),
        }

    return {
        "role": role,
        "can_create_leader": role in ("admin", "supervisor"),
        "can_create_brigadir": _bt._can_create_anywhere(db, payload),
        "data": [_row(r) for r in rows],
    }


@router.get("/leaders")
def list_assignable_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    """Create-form picker source: one entry per leader PROFILE — per person.

    Built from role_profiles, never from registrations: a profile claimed by
    three Telegram accounts is still ONE person and must appear once. Unclaimed
    profiles are listed too (``holders: 0``) — a leader exists as an
    organizational post before anyone registers, and work assigned to them waits
    in the bell until the profile is claimed.
    """
    role = payload.get("role")
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Admin or supervisor only")
    profiles = identity.list_leader_profiles(
        db, payload.get("role_id") if role == "supervisor" else None
    )
    mgr_names = {m.id: m.name for m in db.query(Manager).all()}
    return [
        {
            "leader_profile_id": p.id,
            "name": p.name,
            "supervisor_manager_id": p.manager_id,
            "supervisor_name": mgr_names.get(p.manager_id),
            # How many logins currently work as this person — shown as a hint,
            # never as a reason to split them into several options.
            "holders": len(identity.profile_holders(db, f"leader:{p.id}")),
        }
        for p in profiles
    ]


# ── create / edit / delete ────────────────────────────────────────────────────

class TaskIn(BaseModel):
    task_text: str
    # The assignee PROFILE (role_profiles.id). ``leader_ref`` is the retired
    # registration-keyed field, still accepted so a browser tab left open across
    # the deploy keeps working; it is resolved to a profile below.
    leader_profile_id: Optional[int] = None
    leader_ref: Optional[int] = None
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

    # Resolve the assignee to a PROFILE. A legacy leader_ref (registration id)
    # is translated to the profile that registration claimed.
    profile_id = body.leader_profile_id
    if profile_id is None and body.leader_ref is not None:
        lr = db.query(TelegramUserRole).filter(
            TelegramUserRole.id == body.leader_ref,
            TelegramUserRole.role == "leader",
        ).first()
        _, profile_id = identity.parse_profile_key(
            identity.role_row_profile_key(db, lr) if lr else None
        )
    if profile_id is None:
        raise HTTPException(status_code=400, detail="Leader is required")

    prof = db.query(RoleProfile).filter(
        RoleProfile.id == profile_id, RoleProfile.role == "leader",
    ).first()
    if not prof:
        raise HTTPException(status_code=404, detail="Leader not found")
    if role == "supervisor" and prof.manager_id != payload.get("role_id"):
        raise HTTPException(status_code=403, detail="You can only assign tasks to your own leaders")

    mgr = db.query(Manager).filter(Manager.id == prof.manager_id).first()
    sub = int(payload["sub"])
    owner = tb.leader_owner_filter(prof.id)

    _lock_leader_queue(db, prof.id)
    t = LeaderTask(
        assignee_kind=tb.KIND_LEADER,
        leader_profile_id=prof.id,
        leader_name=prof.name,
        supervisor_manager_id=prof.manager_id,
        supervisor_name=(mgr.name if mgr else None),
        task_text=body.task_text.strip(),
        priority=_active_tasks(db, owner).count() + 1,   # joins at the back
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
            author_role_ref=_profile_ref(payload),
            author_profile=identity.viewer_profile_key(db, payload),
            author_name=payload.get("full_name"),
            text=body.comment.strip(),
        ))
        comment_count = 1

    # Reaches every account working as this leader — and waits in the bell if
    # nobody has claimed the profile yet.
    notify_profile(
        db, f"leader:{prof.id}", nkey="task_created",
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
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("leader", prof.name), ("text", t.task_text),
                 ("deadline", str(t.due_date)), ("priority", t.priority),
                 ("comment", comment_count)],
    )
    return _serialize(t, comment_count, payload, db, live_name=prof.name)


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
    _assert_can_edit_core(db, payload, t)
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
        details=[("leader", t.leader_name)],
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
    payload: dict = Depends(require_page("tasks")),
):
    t = _get_visible_task(task_id, payload, db)
    _assert_can_edit_core(db, payload, t)
    owner = _owned_by(t)
    gone = t.priority if t.status != "done" else None
    # Snapshot before the delete — the row is unreadable after commit.
    was = {"id": t.id, "text": _snippet(t.task_text), "leader": t.leader_name,
           "unit": t.supervisor_manager_id, "unit_name": t.supervisor_name,
           "day": t.due_date, "status": t.status, "priority": t.priority}
    _lock_leader_queue(db, t.leader_profile_id)
    dropped = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).delete()
    db.delete(t)
    db.flush()
    _close_ranks_behind(db, owner, gone)
    db.commit()
    action_log.enrich(
        target_kind="task", target_id=was["id"], target_name=was["text"],
        unit_id=was["unit"], unit_name=was["unit_name"], day=was["day"],
        details=[("leader", was["leader"]), ("text", was["text"]),
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
    payload: dict = Depends(require_page("tasks")),
):
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    t = _get_visible_task(task_id, payload, db)
    _assert_can_set_status(db, payload, t)

    old = t.status
    if body.status != old:
        owner = _owned_by(t)
        _lock_leader_queue(db, t.leader_profile_id)
        if body.status == "done":
            # Leaves the queue; everything behind closes ranks.
            gone = t.priority
            t.priority = None
            t.completed_at = datetime.now(timezone.utc)
            _close_ranks_behind(db, owner, gone)
        elif old == "done":
            # Reopened → rejoins at the back of the queue.
            t.priority = _active_tasks(db, owner).count() + 1
            t.completed_at = None
        t.status = body.status

        sub = int(payload["sub"])
        params = {
            "actor_name": payload.get("full_name"),
            "task_status": body.status,
            "task": _snippet(t.task_text),
        }
        if t.created_by_profile:
            # Everyone working as the brigadir who set the task hears about it.
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
        details=[("leader", t.leader_name), ("text", _snippet(t.task_text))],
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
    payload: dict = Depends(require_page("tasks")),
):
    if body.mode not in ("swap", "shift"):
        raise HTTPException(status_code=400, detail="Invalid mode")
    t = _get_visible_task(task_id, payload, db)
    _assert_can_reorder(payload, t)
    if t.status == "done" or t.priority is None:
        raise HTTPException(status_code=400, detail="Done tasks have no priority")

    owner = _owned_by(t)
    _lock_leader_queue(db, t.leader_profile_id)
    n = _active_tasks(db, owner).count()
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
        details=[("leader", t.leader_name), ("mode", body.mode),
                 ("count", n)],
        changes=[("priority", old_p, t.priority)] if t.priority != old_p else None,
    )
    count = db.query(LeaderTaskComment).filter(LeaderTaskComment.task_id == t.id).count()
    return _serialize(t, count, payload, db)


# ── comments ──────────────────────────────────────────────────────────────────

_profile_ref = tb.profile_ref
_is_comment_author = tb.is_comment_author
_serialize_comment = tb.serialize_comment


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
    return [_serialize_comment(c, payload, db) for c in rows]


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
    _assert_can_comment(db, payload, t)
    sub = int(payload["sub"])
    c = LeaderTaskComment(
        task_id=t.id,
        author_telegram_id=sub,
        author_role_ref=_profile_ref(payload),
        author_profile=identity.viewer_profile_key(db, payload),
        author_name=payload.get("full_name"),
        text=body.text.strip(),
    )
    db.add(c)

    # Notify the other side(s) of the thread — the assigned leader and the task's
    # creator — as PEOPLE: each gets one bell row on their profile and a DM to
    # every account working as them, minus the author's own account.
    params = {
        "author_name": payload.get("full_name"),
        "comment": _snippet(body.text, 200),
        "task": _snippet(t.task_text),
    }
    targets = []
    if t.leader_profile_id:
        targets.append(f"leader:{t.leader_profile_id}")
    if t.created_by_profile:
        targets.append(t.created_by_profile)
    for prof in dict.fromkeys(targets):          # de-duplicated, order kept
        notify_profile(db, prof, nkey="task_comment", params=params,
                       exclude_account=sub)
    if not targets and t.created_by and t.created_by != sub:
        # legacy rows with no profile on either side
        _notify(db, t.created_by, type="info", nkey="task_comment", params=params)

    db.commit()
    db.refresh(c)
    action_log.enrich(
        target_kind="comment", target_id=c.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("leader", t.leader_name), ("text", c.text)],
    )
    return _serialize_comment(c, payload, db)


def _get_own_comment(task_id: int, comment_id: int, payload: dict, db: Session) -> LeaderTaskComment:
    c = db.query(LeaderTaskComment).filter(
        LeaderTaskComment.id == comment_id, LeaderTaskComment.task_id == task_id,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _is_comment_author(c, payload, db):
        raise HTTPException(status_code=403, detail="Only the author profile can modify a comment")
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
    t = _get_visible_task(task_id, payload, db)
    c = _get_own_comment(task_id, comment_id, payload, db)
    was = c.text
    c.text = body.text.strip()
    c.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(c)
    action_log.enrich(
        target_kind="comment", target_id=c.id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("leader", t.leader_name)],
        changes=[("text", was, c.text)],
    )
    return _serialize_comment(c, payload, db)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
def delete_task_comment(
    task_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("tasks")),
):
    t = _get_visible_task(task_id, payload, db)
    c = _get_own_comment(task_id, comment_id, payload, db)
    gone_id, gone_text = c.id, c.text
    db.delete(c)
    db.commit()
    action_log.enrich(
        target_kind="comment", target_id=gone_id, target_name=_snippet(t.task_text),
        unit_id=t.supervisor_manager_id, unit_name=t.supervisor_name,
        day=t.due_date,
        details=[("task_id", t.id), ("leader", t.leader_name), ("text", gone_text)],
    )
