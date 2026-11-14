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

TASKS FROM THE TOP (2026-11-14, the operator: «the task which assigned by
admins, top managers and shift managers to brigadirs and liders should be shown
in the shift day … and the notifications should appear in the bot too, like
different, like it is a very crucial task from top»). ``MANAGER_ROLES`` are
those three roles. A task one of them sets:

  * is told to its assignee by its OWN notice — ``task_from_top``, a card that
    never reads like an ordinary «Yangi vazifa» (``created_nkey`` picks the
    key, ``notice_params`` and ``open_markup`` fill it);
  * shows on «Smena kunligi» when it was set for a brigadir or a leader
    (``set_from_above`` → ``services/task_day``).

THE FIRST DAY. Everything here that is new for somebody who is NOT an admin
waits for ``OPEN_FROM`` — the operator names the day, exactly as on «Kutish
yechimlari»; until then the constant is None. Before it: only an admin sees
the day block, a top-manager sets nothing, a shift manager sets a brigadir's
task as before (the ordinary notice) and no leader's. On it and after: top- and
shift-managers see the block and set tasks for brigadirs and leaders, a
top-manager for shift managers too, all with the loud notice, and a
top-manager is given the «Vazifalar» page (``open_page_to_top_managers``).
An ADMIN's own act never waits: a task an admin sets is from the top today.
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

# ── tasks from the top ────────────────────────────────────────────────────────
# The roles that set work FROM THE TOP: their task for a brigadir or a leader
# shows on «Smena kunligi», and its notice is the loud one.
MANAGER_ROLES = ("admin", "top-manager", "shift-manager")

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


def from_top(payload: dict) -> bool:
    """Is this caller acting FROM THE TOP right now — an admin always; a top-
    or shift-manager from the first day on. Decides the notice a task they set
    goes out with, and whether a manager may set and govern a LEADER's task
    (a brigadir's own tier is `routers/brigadir_tasks`, unchanged)."""
    role = payload.get("role")
    return role == "admin" or (role in ("top-manager", "shift-manager") and is_open())


def set_from_above(t) -> bool:
    """Was this task set from the top (``MANAGER_ROLES``)? A brigadir's or a
    shift manager's own task always was — nobody else can set one. A leader's
    counts only when its creator's profile says so: most are set by the unit's
    own brigadir, and a row from before profile keys cannot tell."""
    if kind_of(t) != KIND_LEADER:
        return True
    return creator_role(t.created_by_profile) in MANAGER_ROLES


# ── «Vazifalar» for a top-manager, from the first day ─────────────────────────
# The operator (2026-11-14): «the task will be given from liders part from
# tasks» — tasks are set on Liderlar → «Vazifalar», by admins, top-managers and
# shift-managers. A top-manager does not hold that page by default, and a
# stored Access matrix shadows any new default, so on the first day the role is
# ADDED to the stored "tasks" list — once. The FLAG is what protects a later
# untick on the Access tab; changing what this does needs a NEW flag key.
TOP_PAGE_FLAG = "tasks_page_top_managers_2026_11_v1"
_top_page_done = False        # this process has nothing left to do


def open_page_to_top_managers() -> None:
    """Give top-managers the «Vazifalar» page — on the first day and after,
    once per database. Nothing before the day (while no day is named: never).

    Called at startup (`main` / `passenger_wsgi`) AND by the day read on
    «Smena kunligi» (`routers/tasks.day_tasks`), because the first day may come
    with no deploy on it: whoever opens that page first on the day opens this.
    Own session; never raises — config, not a request's business."""
    global _top_page_done
    if _top_page_done or not is_open():
        return
    import json
    from app.database import SessionLocal
    from app.models import AppSetting
    from app.permissions import SETTING_KEY, get_page_access

    db = SessionLocal()
    try:
        if not db.query(AppSetting).filter_by(key=TOP_PAGE_FLAG).first():
            row = db.query(AppSetting).filter_by(key=SETTING_KEY).first()
            stored = None
            if row:
                try:
                    stored = json.loads(row.value or "{}")
                except (ValueError, TypeError):
                    stored = None
            if row is None or isinstance(stored, dict):
                stored = stored if isinstance(stored, dict) else {}
                roles = stored.get("tasks")
                if not isinstance(roles, list):
                    # Never stored: start from what is in force today.
                    roles = list(get_page_access(db).get("tasks", []))
                if "top-manager" not in roles:
                    stored["tasks"] = roles + ["top-manager"]
                    if row:
                        row.value = json.dumps(stored)
                    else:
                        db.add(AppSetting(key=SETTING_KEY, value=json.dumps(stored)))
                    print(f"[tasks] opened /tasks to top-managers (was {roles})")
            db.add(AppSetting(key=TOP_PAGE_FLAG, value="1"))
            db.commit()
        _top_page_done = True
    except Exception as exc:  # pragma: no cover — never block a boot or a read
        db.rollback()
        print(f"[tasks] /tasks top-manager access not opened: {exc}")
    finally:
        db.close()


# ── the notice a new task goes out with ───────────────────────────────────────
NKEY_CREATED = "task_created"        # «Yangi vazifa» — a brigadir to their leader
NKEY_FROM_TOP = "task_from_top"      # «Rahbariyatdan muhim vazifa» — the card

_OPEN_LABEL = {"uz": "Vazifani ochish", "uz_cyrl": "Вазифани очиш",
               "ru": "Открыть задачу", "en": "Open the task"}


def created_nkey(payload: dict) -> str:
    """The key a task THIS caller sets is announced with."""
    return NKEY_FROM_TOP if from_top(payload) else NKEY_CREATED


def notice_params(payload: dict, t) -> dict:
    """The one set of params both notices are written from. ``creator_role``
    becomes the reader's-language role beside the name (`staff._notif_values`)."""
    return {
        "creator_name": payload.get("full_name"),
        "creator_role": payload.get("role"),
        "date": t.due_date,
        "task": snippet(t.task_text),
    }


def notice_kwargs(payload: dict, t) -> dict:
    """What `notify_profile` is passed for a NEW task, beside the addressee:
    the key, its params, and — for a task from the top — the warning colour in
    the bell and a button under the DM that opens the task, because a card
    whose whole point is «go and look» is a dead end without one."""
    nkey = created_nkey(payload)
    kw = {"nkey": nkey, "params": notice_params(payload, t), "subject": ("task", t.id)}
    if nkey == NKEY_FROM_TOP:
        kw["type"] = "warning"
        kw["markup_fn"] = open_markup(t.id)
    return kw


def open_markup(task_id: int):
    """``markup_fn(lang)`` for a task's DM: one button to its thread on
    «Vazifalar» (`/tasks?open=<id>` — the page's own deep link). Plain, never
    coloured: colour on a Telegram button means a decision (`app/tg_buttons`)."""
    def _markup(lang: str):
        from telebot import types
        from app.config import settings as cfg
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(
            _OPEN_LABEL.get(lang) or _OPEN_LABEL["uz"],
            web_app=types.WebAppInfo(url=f"{cfg.webapp_url.rstrip('/')}/tasks?open={task_id}")))
        return kb
    return _markup


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
