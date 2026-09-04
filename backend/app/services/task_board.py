"""
The task-board core — ONE spelling of the queue, shared by both tiers.

Two boards read and write ``leader_tasks``:

  * ``/tasks``            brigadir → lider   (``assignee_kind == "leader"``)
  * ``/brigadir-tasks``   smena menejeri → brigadir (``assignee_kind ==
                          "supervisor"``)

They ask the same question one tier apart, so everything about HOW a board
behaves — the dense 1..N queue, who the assignee is, how a comment is owned —
lives here and is spelled once. Two copies of the queue engine is how one
board's "priority 1" stops meaning the other's: the renumber, the lock target
and the close-ranks rule all have to agree, and nothing would make them.

What is NOT here: WHO may do what. That is the routers' business and it is
genuinely different per tier — a leader task is governed by the unit's
supervisor, a brigadir task by the shift-manager covering that unit
(``services/shift_scope``). Folding both into one predicate would mean a
function that has to be told which tier it is answering for, which is two
functions wearing one name.

THE ASSIGNEE, per kind:

  kind          assignee column          name snapshot   queue lock
  ------------  -----------------------  --------------  ---------------
  "leader"      leader_profile_id        leader_name     role_profiles row
  "supervisor"  supervisor_manager_id    leader_name     managers row

``supervisor_manager_id`` is populated for BOTH kinds and means the same thing
in both — the unit the work belongs to. For a leader task that is the leader's
unit; for a brigadir task it is the brigadir themselves. That is what lets one
scope filter (``supervisor_manager_id IN units``) answer "everything happening
in these units" across both tiers.
"""
from typing import Optional

from sqlalchemy import and_
from sqlalchemy.orm import Session

from app import identity
from app.models import LeaderTask, LeaderTaskComment, Manager, RoleProfile
from app.routers.auth import ADMIN_ROLE_REF

KIND_LEADER = "leader"
KIND_SUPERVISOR = "supervisor"
VALID_KINDS = (KIND_LEADER, KIND_SUPERVISOR)

VALID_STATUSES = {"todo", "doing", "done"}


def snippet(text: str, n: int = 140) -> str:
    text = (text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def kind_of(t: LeaderTask) -> str:
    """The row's tier. NULL reads as "leader" — the value every row carried
    before the column existed, and the only thing such a row can be."""
    return t.assignee_kind or KIND_LEADER


def assignee_key(t: LeaderTask) -> Optional[str]:
    """The assignee as an identity key (``app.identity``) — who to notify, and
    whose rights over the row are "it's mine"."""
    if kind_of(t) == KIND_SUPERVISOR:
        return identity.profile_key("supervisor", t.supervisor_manager_id)
    return identity.profile_key("leader", t.leader_profile_id)


# ── the queue ─────────────────────────────────────────────────────────────────
# One dense 1..N per ASSIGNEE over the active (todo/doing) tasks. A done task
# leaves the queue (priority NULL) and everything behind it closes ranks; a
# reopened one rejoins at the back.

def owner_filter(t: LeaderTask):
    """Filter matching every task of the same assignee as ``t``.

    Always carries the kind, even though the id columns happen not to collide
    today: a filter that is only correct because the other tier's column is
    NULL stops being correct the first time somebody populates it."""
    if kind_of(t) == KIND_SUPERVISOR:
        return and_(LeaderTask.assignee_kind == KIND_SUPERVISOR,
                    LeaderTask.supervisor_manager_id == t.supervisor_manager_id)
    if t.leader_profile_id is not None:
        return and_(LeaderTask.assignee_kind == KIND_LEADER,
                    LeaderTask.leader_profile_id == t.leader_profile_id)
    # Legacy rows the profile backfill could not resolve, keyed by the old
    # registration reference. Never reached by a supervisor-kind row.
    return and_(LeaderTask.assignee_kind == KIND_LEADER,
                LeaderTask.leader_profile_id.is_(None),
                LeaderTask.leader_role_ref == t.leader_role_ref)


def unit_owner_filter(manager_id: int):
    """``owner_filter`` for a brigadir queue named by unit id — for the create
    path, which has no row to derive it from yet."""
    return and_(LeaderTask.assignee_kind == KIND_SUPERVISOR,
                LeaderTask.supervisor_manager_id == manager_id)


def leader_owner_filter(profile_id: int):
    """``owner_filter`` for a leader queue named by profile id."""
    return and_(LeaderTask.assignee_kind == KIND_LEADER,
                LeaderTask.leader_profile_id == profile_id)


def lock_queue(db: Session, *, kind: str, leader_profile_id: Optional[int] = None,
               manager_id: Optional[int] = None) -> None:
    """Serialise one assignee's priority mutations by locking the row every one
    of their logins shares — the leader's PROFILE, or the brigadir's UNIT.
    Keying the lock to a registration gave one person as many independent
    queues as they had accounts, each with its own "priority 1"."""
    if kind == KIND_SUPERVISOR:
        if manager_id is not None:
            db.query(Manager).filter(Manager.id == manager_id).with_for_update().first()
        return
    if leader_profile_id is not None:
        db.query(RoleProfile).filter(RoleProfile.id == leader_profile_id).with_for_update().first()


def lock_for(db: Session, t: LeaderTask) -> None:
    """``lock_queue`` for an existing row."""
    lock_queue(db, kind=kind_of(t), leader_profile_id=t.leader_profile_id,
               manager_id=t.supervisor_manager_id)


def active_tasks(db: Session, owner):
    return db.query(LeaderTask).filter(owner, LeaderTask.status != "done")


def close_ranks_behind(db: Session, owner, gone_priority: Optional[int]) -> None:
    """After a task leaves the active queue at ``gone_priority``, pull every
    task behind it one position forward."""
    if gone_priority is None:
        return
    for row in active_tasks(db, owner).filter(LeaderTask.priority > gone_priority).all():
        row.priority = row.priority - 1


def reinsert(db: Session, owner, t: LeaderTask, new_p: int, mode: str) -> None:
    """Move ``t`` to ``new_p``. ``swap`` trades the two positions; ``shift``
    re-inserts and moves the span between old and new by one."""
    old_p = t.priority
    if new_p == old_p:
        return
    if mode == "swap":
        other = active_tasks(db, owner).filter(LeaderTask.priority == new_p).first()
        if other:
            other.priority = old_p
    else:
        span = active_tasks(db, owner)
        if new_p > old_p:
            for row in span.filter(LeaderTask.priority > old_p, LeaderTask.priority <= new_p).all():
                row.priority = row.priority - 1
        else:
            for row in span.filter(LeaderTask.priority >= new_p, LeaderTask.priority < old_p).all():
                row.priority = row.priority + 1
    t.priority = new_p


# ── comments ──────────────────────────────────────────────────────────────────

def profile_ref(payload: dict) -> Optional[int]:
    """Stable id of the acting profile: telegram_user_roles.id of the active
    role, or the admin sentinel (admin JWTs carry role_ref=None)."""
    return ADMIN_ROLE_REF if payload.get("role") == "admin" else payload.get("role_ref")


def is_comment_author(c: LeaderTaskComment, payload: dict, db: Session) -> bool:
    """Ownership is per-PROFILE, not per-account: the profile wrote it, so any
    account working as that profile may edit or delete it — including a
    successor after a handover — while the same account switched into a
    different profile may not. Rows predating author_profile fall back to the
    old (account + role row) pair."""
    if c.author_profile:
        return identity.same_profile(c.author_profile,
                                     identity.viewer_profile_key(db, payload))
    if c.author_telegram_id != int(payload["sub"]):
        return False
    return c.author_role_ref is None or c.author_role_ref == profile_ref(payload)


def serialize_comment(c: LeaderTaskComment, payload: dict, db: Session) -> dict:
    return {
        "id": c.id,
        "task_id": c.task_id,
        "author_telegram_id": c.author_telegram_id,
        "author_role_ref": c.author_role_ref,
        "author_profile": c.author_profile,
        "author_name": c.author_name,
        "text": c.text,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "edited_at": c.edited_at.isoformat() if c.edited_at else None,
        # Edit/delete rights of the CALLER, resolved server-side so the client
        # never has to re-derive the profile-ownership rule.
        "is_own": is_comment_author(c, payload, db),
    }
