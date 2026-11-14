"""
The task-board core — ONE spelling of the rules, shared by every tier.

Three routers read and write ``leader_tasks``, one per tier:

  * ``/api/tasks``                 brigadir → lider   (``assignee_kind ==
                                   "leader"``)
  * ``/api/brigadir-tasks``        smena menejeri → brigadir (``assignee_kind
                                   == "supervisor"``)
  * ``/api/shift-manager-tasks``   top menejer → smena menejeri
                                   (``assignee_kind == "shift-manager"``,
                                   from 2026-11-14)

They ask the same question one tier apart, so everything about HOW a board
behaves — who the assignee is, what URGENT means, how a comment is owned —
lives here and is spelled once.

URGENCY. A task is urgent or it is not: ONE flag, drawn as a flame, and nothing
else (the operator's directive, 2026-09-08). ``LeaderTask.priority`` carries it
— 1 = urgent, NULL = ordinary — and ``URGENT`` / ``urgent_value`` / ``is_urgent``
below are its only spelling, so neither router can invent a third value for the
column. It replaced a dense 1..N queue per assignee (positions, swap/shift
re-insertion, close-ranks whenever a task left, a row lock per mutation), which
stated far more than anybody was answering: nobody ranks their fourteenth task
against their fifteenth, so the positions were noise carrying an invariant.
A flag needs no serialising, so the queue lock went with the queue.

What is NOT here: WHO may do what. That is the routers' business and it is
genuinely different per tier — a leader task is governed by the unit's
supervisor, a brigadir task by the shift-manager covering that unit
(``services/shift_scope``). Folding both into one predicate would mean a
function that has to be told which tier it is answering for, which is two
functions wearing one name.

THE ASSIGNEE, per kind:

  kind             assignee column          name snapshot
  ---------------  -----------------------  --------------
  "leader"         leader_profile_id        leader_name
  "supervisor"     supervisor_manager_id    leader_name
  "shift-manager"  leader_profile_id        leader_name

``supervisor_manager_id`` is populated for the two UNIT tiers and means the
same thing in both — the unit the work belongs to. For a leader task that is
the leader's unit; for a brigadir task it is the brigadir themselves. That is
what lets one scope filter (``supervisor_manager_id IN units``) answer
"everything happening in these units" across both.

A SHIFT-MANAGER task belongs to no unit: ``supervisor_manager_id`` is NULL (so
no unit filter can ever pick it up by accident) and the assignee is
``leader_profile_id`` — the column is a ``role_profiles.id``, which is exactly
what a shift-manager profile is. One table of profiles, one column naming one
of them; ids never collide across roles, so a leader's queue and a shift
manager's can not read each other's rows. Always ask ``kind_of`` first.

THE FIRST DAY (2026-11-14). A TOP-MANAGER setting tasks (for a brigadir or a
shift manager) and anybody but an admin seeing the brigadirs' day block on
«Smena kunligi» (``services/task_day``) wait for ``OPEN_FROM`` — the operator
names the day, exactly as on «Kutish yechimlari»; until then the constant is
None and nothing changed for anybody who is not an admin.
"""
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import case
from sqlalchemy.orm import Session

from app import identity
from app.models import LeaderTask, LeaderTaskComment
from app.routers.auth import ADMIN_ROLE_REF

KIND_LEADER = "leader"
KIND_SUPERVISOR = "supervisor"
KIND_SHIFT_MANAGER = "shift-manager"
VALID_KINDS = (KIND_LEADER, KIND_SUPERVISOR, KIND_SHIFT_MANAGER)

# The platform's wall clock (Tashkent) — a task's DAY is read on it.
TZ = timezone(timedelta(hours=5))

# ── the first day ─────────────────────────────────────────────────────────────
# The first day a TOP-MANAGER sets tasks and the day block is shown to anybody
# but an admin. The operator names it (2026-11-14: «admins only first»); until
# then it is None. ONE constant — the browser asks the server, so there is no
# twin to keep in step. Once the day has come it never moves LATER.
OPEN_FROM: Optional[date] = None


def is_open(today: Optional[date] = None) -> bool:
    """Has the first day come (``OPEN_FROM``)? While no day is named: no."""
    return OPEN_FROM is not None and (today or datetime.now(TZ).date()) >= OPEN_FROM


def top_sets(payload: dict) -> bool:
    """May this caller set and govern tasks AS A TOP-MANAGER — a top-manager,
    from the first day on. The tier above, one level up from a shift manager."""
    return payload.get("role") == "top-manager" and is_open()


def creator_role(profile_key: Optional[str]) -> Optional[str]:
    """The creator's ROLE off their profile key (``"supervisor:12"`` →
    ``supervisor``) — what a board badges a name with. Legacy rows that predate
    ``created_by_profile`` carry none."""
    if not profile_key or ":" not in profile_key:
        return None
    return profile_key.split(":", 1)[0]

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
    kind = kind_of(t)
    if kind == KIND_SUPERVISOR:
        return identity.profile_key("supervisor", t.supervisor_manager_id)
    if kind == KIND_SHIFT_MANAGER:
        return identity.profile_key("shift-manager", t.leader_profile_id)
    return identity.profile_key("leader", t.leader_profile_id)


# ── urgency ───────────────────────────────────────────────────────────────────
# The flame, and the only place the column's two values are written down.
# Anything reading it asks ``is_urgent``; anything writing it asks
# ``urgent_value``. There is no third value and no ordering.

URGENT = 1


def is_urgent(t: LeaderTask) -> bool:
    """Urgent is ``priority == 1`` and NOTHING ELSE — deliberately not "not
    NULL". Rows written under the queue still carry their old position, and a
    task that happened to sit fourth in somebody's list was never a statement
    that it was urgent. Only the position that WAS the top of a queue reads as a
    flame; every write from here on stores 1 or NULL, so the old numbers go as
    the rows are touched. Nothing was erased to ship this."""
    return t.priority == URGENT


def urgent_value(flag: bool) -> Optional[int]:
    return URGENT if flag else None


def urgent_first():
    """ORDER BY term putting the flamed rows on top. Not ``priority`` itself:
    that would sort a leftover position 2 above an ordinary task."""
    return case((LeaderTask.priority == URGENT, 0), else_=1)


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
