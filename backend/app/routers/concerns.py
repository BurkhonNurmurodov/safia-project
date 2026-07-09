"""
Leader concerns ("Xavotirlar") API.

A concern is owned by a leader's pre-created *profile* (role_profiles), so it
can be logged for a leader who hasn't claimed their profile yet — the leader
inherits it on registration. Every role works within its scope:

- admin         — everything, full manage, picks supervisor → leader
- top-manager   — sees everything; manages ONLY concerns escalated to them
- shift-manager — their shift's units, full manage, picks supervisor → leader
- supervisor    — their own unit's leaders, full manage, picks a leader
- leader        — their own rows only (no picker — always writes on themselves);
                  may create and edit open base-level concerns but never resolve
                  (mark done), delete or escalate them — that responsibility
                  sits with the supervisor and above

Escalation ("uplift"): every concern starts at the "supervisor" level (the
leader level was removed 2026-07; legacy rows were migrated up) and moves one
step at a time along supervisor → shift-manager → top-manager, each step
requiring a reason (POST /{id}/escalate, direction up|down). The handler at
the concern's CURRENT level and everyone above it in the chain (within their
scope) keep edit rights; levels below turn read-only. Top-management is
person-specific — the shift-manager picks one top-manager profile, and only
that person (plus admin) may act on the concern. Each move notifies the
receiving handler(s) via the bell + a Telegram DM and is recorded in
concern_escalations (the history modal).

Ownership ("Owner" column): the person who CREATED the concern, keyed by their
profile identity (owner_role + owner_profile_id) and resolved to the current
profile name at view time; concern_owner keeps a name snapshot as a fallback
(legacy rows: whatever free text was typed, without a position).

Every new concern notifies the leader's brigadir (the approved supervisor of
the leader's unit) and the leader themself via the bell + a Telegram DM —
whoever of them isn't the author (unregistered leaders are skipped silently).
Access is gated by the ``concerns`` page in the access matrix.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, ConcernEscalation, LeaderConcern, Manager, RoleProfile, TelegramUserRole
from app.permissions import require_page
# Reuse the shared notification helpers: _find_supervisor resolves the brigadir
# for a unit, _notify writes the bell row (rendered per-viewer) + Telegram DM.
from app.routers.staff import _find_supervisor, _notify, _profile_key

router = APIRouter(prefix="/api/concerns", tags=["concerns"])

VALID_STATUSES = {"todo", "doing", "done"}

# Department categories a concern can fall under — the "по отделам" whitelist.
# The client renders each key's label per language (concerns.category.<key>); the
# backend only validates membership. Keep this list in sync with the frontend
# CATEGORIES array in Concerns.jsx.
CATEGORIES = {
    "ars", "inventory", "warehouse", "fridge", "procurement", "logistics",
    "it", "washing", "plan", "hr", "technologist", "raw_material",
}

# Escalation chain, bottom → top. leader_concerns.level always holds one of
# these ("leader" only survives in old concern_escalations history rows).
LEVELS = ["supervisor", "shift-manager", "top-manager"]
LEVEL_IDX = {l: i for i, l in enumerate(LEVELS)}

# Roles that pick a leader when creating (everyone but the leader themself).
PICKER_ROLES = ("admin", "shift-manager", "supervisor")


def _sm_names(db: Session) -> dict:
    """manager_id → shift-manager profile name(s) covering that unit's shift.
    Feeds responsible_name for shift-manager-level rows (the only level whose
    holder isn't already a column on the concern); several managers sharing a
    shift render comma-joined."""
    by_shift: dict = {}
    for prof in (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "shift-manager", RoleProfile.shift.isnot(None))
        .order_by(RoleProfile.name)
    ):
        by_shift.setdefault(prof.shift, []).append(prof.name)
    if not by_shift:
        return {}
    return {
        mid: ", ".join(by_shift[shift])
        for mid, shift in db.query(Manager.id, Manager.shift).all()
        if shift in by_shift
    }


def _cell_leaders(db: Session) -> dict:
    """cell → leader name(s) currently assigned to it. Each leader carries their
    production cell on the profile (role_profiles.cell); the Concerns table shows
    the leader who owns a concern's cell, resolved live so re-assignments stay
    current. Several leaders on one cell render comma-joined."""
    by_cell: dict = {}
    for prof in (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "leader", RoleProfile.cell.isnot(None))
        .order_by(RoleProfile.name)
    ):
        cell = (prof.cell or "").strip()
        if cell:
            by_cell.setdefault(cell, []).append(prof.name)
    return {cell: ", ".join(names) for cell, names in by_cell.items()}


def _level(c: LeaderConcern) -> str:
    """Normalized escalation level — pre-migration 'leader' rows read as the
    new base of the chain."""
    level = c.level or "supervisor"
    return "supervisor" if level == "leader" else level


def _serialize(
    c: LeaderConcern,
    ctx: Optional[dict] = None,
    esc_counts: Optional[dict] = None,
    sm_names: Optional[dict] = None,
    owner_names: Optional[dict] = None,
    cell_leaders: Optional[dict] = None,
) -> dict:
    resolution_days = None
    if c.completion_date and c.entry_date:
        resolution_days = (c.completion_date - c.entry_date).days
    # Minute-grained "время выполнения": created_at → done_at. NULL done_at
    # (still open, or done before the column existed) renders as "—".
    resolution_minutes = None
    if c.done_at and c.created_at:
        resolution_minutes = max(0, int((c.done_at - c.created_at).total_seconds() // 60))
    level = _level(c)
    # Who answers for the concern right now — the level names a step in the
    # chain, this names the person on that step: supervisor → the brigadir,
    # shift-manager → that unit's shift's manager(s), top-manager → the
    # specifically assigned one.
    responsible = (
        c.brigadir_name if level == "supervisor"
        else (c.shift_manager_name or (sm_names or {}).get(c.brigadir_manager_id)) if level == "shift-manager"
        else c.top_manager_name
    )
    # Owner = whoever created the concern, resolved to their CURRENT profile
    # name (renames stay live); the concern_owner snapshot / legacy typed text
    # is the fallback, without a position.
    owner_name = (owner_names or {}).get((c.owner_role, c.owner_profile_id))
    out = {
        "id": c.id,
        "leader_profile_id": c.leader_profile_id,
        "leader_role_ref": c.leader_role_ref,
        "leader_name": c.leader_name,
        "brigadir_manager_id": c.brigadir_manager_id,
        "brigadir_name": c.brigadir_name,
        "cell_code": c.cell_code,
        # The leader currently assigned to this concern's cell, resolved live
        # (falls back to the leader-name snapshot for legacy leader-logged rows).
        "cell_leader_name": (
            (cell_leaders or {}).get((c.cell_code or "").strip())
            or (c.leader_name or None)
        ) if (c.cell_code or c.leader_name) else None,
        "category": c.category,
        "concern_owner": c.concern_owner,
        "owner_name": owner_name or c.concern_owner,
        "owner_role": c.owner_role if owner_name else None,
        "concern_text": c.concern_text,
        "status": c.status,
        "deadline_days": c.deadline_days,
        "entry_date": c.entry_date.isoformat() if c.entry_date else None,
        "completion_date": c.completion_date.isoformat() if c.completion_date else None,
        "solution": c.solution,
        "resolution_days": resolution_days,
        "resolution_minutes": resolution_minutes,
        "level": level,
        "top_manager_profile_id": c.top_manager_profile_id,
        "top_manager_name": c.top_manager_name,
        "shift_manager_profile_id": c.shift_manager_profile_id,
        "shift_manager_name": c.shift_manager_name,
        "responsible_name": responsible,
        "escalation_count": (esc_counts or {}).get(c.id, 0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
    # Per-row rights, computed for the requesting viewer (see _can_edit):
    # escalation is one step at a time, blocked on resolved concerns. Leaders
    # sit below the chain — they may edit their own open base-level concerns
    # but never resolve, delete or escalate them.
    if ctx is not None:
        manage = _can_edit(ctx, c)
        set_status = _can_set_status(ctx, c)
        not_leader = ctx["role"] != "leader"
        lvl = LEVEL_IDX.get(level, 0)
        out["can_edit"] = manage
        out["can_set_status"] = set_status
        out["can_resolve"] = set_status                       # kept for the status dropdown
        out["can_delete"] = ctx["role"] == "admin" or (_is_owner(ctx, c) and not_leader)
        out["can_escalate"] = manage and not_leader and c.status != "done" and lvl < LEVEL_IDX["top-manager"]
        out["can_deescalate"] = manage and not_leader and c.status != "done" and lvl > 0
    return out


class ConcernIn(BaseModel):
    cell_code: Optional[str] = None
    category: Optional[str] = None            # department bucket (see CATEGORIES)
    # Legacy clients still send the old free-text owner — accepted but ignored:
    # the owner is always the authenticated creator now.
    concern_owner: Optional[str] = None
    concern_text: str
    status: str = "todo"
    deadline_days: Optional[int] = None
    entry_date: Optional[date] = None
    completion_date: Optional[date] = None
    solution: Optional[str] = None
    leader_profile_id: Optional[int] = None   # picker roles: which leader to act for
    leader_ref: Optional[int] = None          # legacy clients: telegram_user_roles.id
    level: Optional[str] = None               # admin-only on create: seed the chain step
    top_manager_profile_id: Optional[int] = None    # required when the level is top-manager
    shift_manager_profile_id: Optional[int] = None  # required when the level is shift-manager


# ── role scope helpers ───────────────────────────────────────────────────────

def _viewer_shift(db: Session, payload: dict) -> Optional[int]:
    """A shift-manager's shift (1|2) — the JWT has no shift field, so it is
    resolved from their claimed profile (role_id → role_profiles.id)."""
    prof = db.query(RoleProfile).filter(
        RoleProfile.id == payload.get("role_id"),
        RoleProfile.role == "shift-manager",
    ).first()
    return prof.shift if prof else None


def _supervisor_shift(db: Session, payload: dict) -> Optional[int]:
    """A supervisor's shift (1|2) — a supervisor IS a manager (role_id =
    managers.id), so their shift is that unit's shift."""
    mgr = db.query(Manager).filter(Manager.id == payload.get("role_id")).first()
    return mgr.shift if mgr else None


def _shift_manager_profile(db: Session, profile_id: Optional[int], shift: Optional[int] = None) -> Optional[RoleProfile]:
    """Validate a picked shift-manager profile, optionally constrained to a
    given shift (used to keep supervisors on their own shift)."""
    if not profile_id:
        return None
    prof = db.query(RoleProfile).filter_by(id=profile_id, role="shift-manager").first()
    if not prof:
        return None
    if shift is not None and prof.shift != shift:
        return None
    return prof


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


def _owner_filter(payload: dict):
    """SQLAlchemy condition matching concerns the caller created (non-leader
    roles — owner_profile_id is managers.id for supervisors, role_profiles.id
    for the rest). Lets a creator always see their own concern even once it
    sits at a level above their own step."""
    return and_(
        LeaderConcern.owner_role == payload.get("role"),
        LeaderConcern.owner_profile_id == payload.get("role_id"),
    )


def _scope_query(query, payload: dict, db: Session):
    """Restrict a LeaderConcern query to what the caller may see: their own
    creations, concerns assigned to them, and the chain below them in scope."""
    role = payload.get("role")
    if role in ("admin", "top-manager"):
        return query
    if role == "shift-manager":
        unit_ids = _shift_unit_ids(db, _viewer_shift(db, payload))
        return query.filter(or_(
            LeaderConcern.brigadir_manager_id.in_(unit_ids),
            LeaderConcern.shift_manager_profile_id == payload.get("role_id"),
            _owner_filter(payload),
        ))
    if role == "supervisor":
        return query.filter(or_(
            LeaderConcern.brigadir_manager_id == payload.get("role_id"),
            _owner_filter(payload),
        ))
    return query.filter(_leader_own_filter(db, payload))


def _viewer_ctx(db: Session, payload: dict) -> dict:
    """Everything _can_edit needs about the caller, resolved once per request
    (the list endpoint reuses it across every row)."""
    role = payload.get("role")
    ctx = {
        "role": role,
        "role_id": payload.get("role_id"),
        "role_ref": payload.get("role_ref"),
        "own_profile_id": None,
        "shift_units": set(),
    }
    if role == "leader":
        prof = _own_profile(db, payload)
        ctx["own_profile_id"] = prof.id if prof else None
    elif role == "shift-manager":
        ctx["shift_units"] = set(_shift_unit_ids(db, _viewer_shift(db, payload)))
    return ctx


def _is_owner(ctx: dict, c: LeaderConcern) -> bool:
    """The authenticated caller CREATED this concern (Owner-column identity)."""
    role = ctx["role"]
    if role == "leader":
        return (
            (c.leader_role_ref is not None and c.leader_role_ref == ctx["role_ref"])
            or (ctx["own_profile_id"] is not None and c.leader_profile_id == ctx["own_profile_id"])
        )
    return (
        c.owner_role == role
        and c.owner_profile_id is not None
        and c.owner_profile_id == ctx["role_id"]
    )


def _is_responsible(ctx: dict, c: LeaderConcern) -> bool:
    """The caller is the person who currently HOLDS the concern at its level —
    the only one (besides admin) allowed to change its STATUS. Each level names
    its holder on the row: supervisor → the brigadir, shift-manager → the picked
    shift-manager, top-manager → the picked top-manager."""
    role = ctx["role"]
    level = _level(c)
    if level == "supervisor":
        return role == "supervisor" and c.brigadir_manager_id == ctx["role_id"]
    if level == "shift-manager":
        return (
            role == "shift-manager"
            and c.shift_manager_profile_id is not None
            and c.shift_manager_profile_id == ctx["role_id"]
        )
    if level == "top-manager":
        return (
            role == "top-manager"
            and c.top_manager_profile_id is not None
            and c.top_manager_profile_id == ctx["role_id"]
        )
    return False


def _can_edit(ctx: dict, c: LeaderConcern) -> bool:
    """MANAGE rights — view, edit fields, escalate/deescalate. The owner and
    everyone above them in the chain (inside their scope) may manage; changing
    the STATUS is reserved to the responsible holder (see _can_set_status).
    Admin manages everything; a leader may edit only their own still-open row;
    top-managers manage only what's assigned to them."""
    role = ctx["role"]
    if role == "admin":
        return True
    if role == "leader":
        return _is_owner(ctx, c) and c.status != "done"
    if _is_owner(ctx, c) or _is_responsible(ctx, c):
        return True
    lvl = LEVEL_IDX.get(_level(c), 0)
    if role == "shift-manager":
        return c.brigadir_manager_id in ctx["shift_units"] and lvl <= LEVEL_IDX["shift-manager"]
    if role == "supervisor":
        return c.brigadir_manager_id == ctx["role_id"] and lvl <= LEVEL_IDX["supervisor"]
    return False  # top-manager (only assigned, handled above) and anything else


def _can_set_status(ctx: dict, c: LeaderConcern) -> bool:
    """Only the responsible holder at the current level (plus admin) may move
    the status between To do / Doing / Done."""
    return ctx["role"] == "admin" or _is_responsible(ctx, c)


def _assert_can_edit(payload: dict, c: LeaderConcern, db: Session):
    """403 with a scope- or level-specific message when _can_edit says no."""
    ctx = _viewer_ctx(db, payload)
    if _can_edit(ctx, c):
        return
    role = ctx["role"]
    if role == "top-manager":
        raise HTTPException(status_code=403, detail="Only concerns escalated to you can be managed")
    if role == "shift-manager" and c.brigadir_manager_id not in ctx["shift_units"]:
        raise HTTPException(status_code=403, detail="This concern is outside your shift")
    if role == "supervisor" and c.brigadir_manager_id != ctx["role_id"]:
        raise HTTPException(status_code=403, detail="This concern is outside your unit")
    if role == "leader":
        own = (c.leader_role_ref is not None and c.leader_role_ref == ctx["role_ref"]) or (
            ctx["own_profile_id"] is not None and c.leader_profile_id == ctx["own_profile_id"]
        )
        if not own:
            raise HTTPException(status_code=403, detail="You can only manage your own concerns")
        if c.status == "done":
            raise HTTPException(status_code=403, detail="A resolved concern can only be managed by the supervisor and above")
    raise HTTPException(status_code=403, detail="This concern has been escalated above your level")


def _claimed_role_row(db: Session, prof: RoleProfile) -> Optional[TelegramUserRole]:
    """The approved leader role row that claimed this profile, if any — leader
    role rows bind to profiles via (unit, canonical name)."""
    return db.query(TelegramUserRole).filter_by(
        role="leader",
        role_id=prof.manager_id,
        full_name=prof.name,
        status="approved",
    ).first()


def _creator_identity(db: Session, payload: dict):
    """(owner_role, owner_profile_id, name_snapshot) for the authenticated
    creator — what the Owner column is keyed by. Profile ids follow the bell's
    _profile_key semantics: role_profiles.id for admin/leader/shift-manager,
    managers.id for supervisors (the manager row IS the profile). The snapshot
    lands in concern_owner as the display fallback."""
    role = payload.get("role")
    prof = None
    if role == "leader":
        prof = _own_profile(db, payload)
    elif role == "supervisor":
        mgr = db.query(Manager).filter_by(id=payload.get("role_id")).first()
        return "supervisor", payload.get("role_id"), (mgr.name if mgr else payload.get("full_name"))
    elif role == "shift-manager":
        prof = db.query(RoleProfile).filter_by(id=payload.get("role_id"), role="shift-manager").first()
    elif role == "admin":
        a = db.query(Admin).filter_by(telegram_id=int(payload["sub"])).first()
        if a and a.profile_id:
            prof = db.query(RoleProfile).filter_by(id=a.profile_id, role="admin").first()
    else:
        return None, None, payload.get("full_name")
    return role, (prof.id if prof else None), (prof.name if prof else payload.get("full_name"))


def _owner_names(db: Session, rows) -> dict:
    """(owner_role, owner_profile_id) → CURRENT profile name, batch-resolved
    for a page of rows (canonical renames stay live). Supervisor profiles live
    in managers; every other role in role_profiles."""
    keys = {
        (r.owner_role, r.owner_profile_id)
        for r in rows if r.owner_role and r.owner_profile_id
    }
    if not keys:
        return {}
    out: dict = {}
    sup_ids = [pid for role, pid in keys if role == "supervisor"]
    prof_ids = [pid for role, pid in keys if role != "supervisor"]
    if sup_ids:
        for mid, name in db.query(Manager.id, Manager.name).filter(Manager.id.in_(sup_ids)).all():
            out[("supervisor", mid)] = name
    if prof_ids:
        for p in db.query(RoleProfile).filter(RoleProfile.id.in_(prof_ids)).all():
            out[(p.role, p.id)] = p.name
    return out


def _resolve_target(payload: dict, body: ConcernIn, db: Session) -> dict:
    """Build the level + responsible-holder columns for a NEW concern from the
    creator's role — each role raises the concern to the step directly above
    them (the Owner column identity is stamped separately by _creator_identity):

      leader        → supervisor level, held by their own unit's brigadir (auto)
      supervisor    → shift-manager level, held by a shift-manager they pick
                      from their own shift
      shift-manager → top-manager level, held by a top-manager they pick
      admin         → picks the level: shift-manager (pick a shift-manager) or
                      top-manager (pick a top-manager)

    Returns a dict of LeaderConcern kwargs (level + the holder columns)."""
    role = payload.get("role")
    tgt = {
        "level": "supervisor",
        "leader_profile_id": None, "leader_role_ref": None, "leader_name": "",
        "brigadir_manager_id": None, "brigadir_name": None,
        "shift_manager_profile_id": None, "shift_manager_name": None,
        "top_manager_profile_id": None, "top_manager_name": None,
    }

    if role == "leader":
        if not payload.get("role_ref"):
            raise HTTPException(status_code=403, detail="Only a leader can create concerns")
        prof = _own_profile(db, payload)
        mgr = db.query(Manager).filter(Manager.id == payload.get("role_id")).first()
        tgt.update(
            level="supervisor",
            leader_profile_id=(prof.id if prof else None),
            leader_role_ref=payload.get("role_ref"),
            leader_name=(payload.get("full_name") or ""),
            brigadir_manager_id=payload.get("role_id"),
            brigadir_name=(mgr.name if mgr else None),
        )
        return tgt

    if role == "supervisor":
        prof = _shift_manager_profile(db, body.shift_manager_profile_id, _supervisor_shift(db, payload))
        if not prof:
            raise HTTPException(status_code=400, detail="Select a shift-manager from your shift")
        mgr = db.query(Manager).filter(Manager.id == payload.get("role_id")).first()
        tgt.update(
            level="shift-manager",
            brigadir_manager_id=payload.get("role_id"),   # own unit → keeps it in the shift's scope
            brigadir_name=(mgr.name if mgr else None),
            shift_manager_profile_id=prof.id,
            shift_manager_name=prof.name,
        )
        return tgt

    if role == "shift-manager":
        top = db.query(RoleProfile).filter_by(id=(body.top_manager_profile_id or 0), role="top-manager").first()
        if not top:
            raise HTTPException(status_code=400, detail="Select a top-manager")
        sm = db.query(RoleProfile).filter_by(id=payload.get("role_id"), role="shift-manager").first()
        tgt.update(
            level="top-manager",
            # Remember the raising shift-manager so a later step-down returns to them.
            shift_manager_profile_id=(sm.id if sm else None),
            shift_manager_name=(sm.name if sm else None),
            top_manager_profile_id=top.id,
            top_manager_name=top.name,
        )
        return tgt

    if role == "admin":
        if body.level == "shift-manager":
            prof = _shift_manager_profile(db, body.shift_manager_profile_id)
            if not prof:
                raise HTTPException(status_code=400, detail="Select a shift-manager")
            tgt.update(level="shift-manager", shift_manager_profile_id=prof.id, shift_manager_name=prof.name)
        elif body.level == "top-manager":
            top = db.query(RoleProfile).filter_by(id=(body.top_manager_profile_id or 0), role="top-manager").first()
            if not top:
                raise HTTPException(status_code=400, detail="Select a top-manager")
            tgt.update(level="top-manager", top_manager_profile_id=top.id, top_manager_name=top.name)
        else:
            raise HTTPException(status_code=400, detail="Choose a level")
        return tgt

    raise HTTPException(status_code=403, detail="Read-only access")


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
    # Per-viewer rights + history badge, resolved once for the whole page.
    ctx = _viewer_ctx(db, payload)
    esc_counts: dict = {}
    ids = [r.id for r in rows]
    if ids:
        esc_counts = dict(
            db.query(ConcernEscalation.concern_id, func.count(ConcernEscalation.id))
            .filter(ConcernEscalation.concern_id.in_(ids))
            .group_by(ConcernEscalation.concern_id)
            .all()
        )
    sm_names = _sm_names(db)
    owner_names = _owner_names(db, rows)
    return {
        "role": role,
        "picker": picker,
        "read_only": role == "top-manager",
        "can_pick_leader": picker is not None,
        "data": [_serialize(r, ctx, esc_counts, sm_names, owner_names) for r in rows],
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


@router.get("/top-managers")
def list_top_manager_profiles(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Target list for the shift-manager → top-management uplift step: every
    pre-created top-manager profile (claimed or not — the bell row queues on an
    unclaimed profile and is inherited on registration)."""
    if payload.get("role") not in ("admin", "shift-manager"):
        raise HTTPException(status_code=403, detail="Admin or shift-manager only")
    claimed = {
        r.role_id
        for r in db.query(TelegramUserRole).filter_by(role="top-manager", status="approved").all()
    }
    return [
        {"profile_id": p.id, "name": p.name, "registered": p.id in claimed}
        for p in db.query(RoleProfile).filter_by(role="top-manager").order_by(RoleProfile.name).all()
    ]


@router.get("/shift-managers")
def list_shift_manager_profiles(
    shift: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Target list for the → shift-manager step (a supervisor uplifting/seeding,
    or an admin seeding). Supervisors are pinned to their own shift; admins see
    every shift-manager and may narrow with ?shift."""
    role = payload.get("role")
    if role not in ("admin", "supervisor"):
        raise HTTPException(status_code=403, detail="Admin or supervisor only")
    q = db.query(RoleProfile).filter(RoleProfile.role == "shift-manager")
    if role == "supervisor":
        q = q.filter(RoleProfile.shift == _supervisor_shift(db, payload))
    elif shift is not None:
        q = q.filter(RoleProfile.shift == shift)
    claimed = {
        r.role_id
        for r in db.query(TelegramUserRole).filter_by(role="shift-manager", status="approved").all()
    }
    return [
        {"profile_id": p.id, "name": p.name, "shift": p.shift, "registered": p.id in claimed}
        for p in q.order_by(RoleProfile.name).all()
    ]


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
    if not (body.concern_text or "").strip():
        raise HTTPException(status_code=400, detail="Concern text is required")


@router.post("")
def create_concern(
    body: ConcernIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    _validate(body)
    # Where the concern lands (level + who holds it) is derived from the
    # creator's role; the Owner column identity is the creator themselves.
    tgt = _resolve_target(payload, body, db)
    owner_role, owner_profile_id, owner_snapshot = _creator_identity(db, payload)
    entry = body.entry_date or date.today()

    # A brand-new concern always opens at "todo": setting status is the
    # responsible holder's call, and the creator isn't that person.
    c = LeaderConcern(
        cell_code=(body.cell_code or "").strip() or None,
        concern_owner=(owner_snapshot or "").strip() or "—",
        owner_role=owner_role,
        owner_profile_id=owner_profile_id,
        concern_text=body.concern_text.strip(),
        status="todo",
        deadline_days=body.deadline_days,
        entry_date=entry,
        completion_date=None,
        done_at=None,
        solution=None,
        created_by=int(payload["sub"]),
        **tgt,
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    # Tell whoever now holds the concern (the responsible person at its level),
    # skipping the author and never DM'ing one account twice. Unclaimed profiles
    # queue a bell row (tg None → no DM) inherited on registration.
    author = int(payload["sub"])
    snippet = c.concern_text if len(c.concern_text) <= 160 else c.concern_text[:157] + "…"
    dmed: set[int] = set()
    sent = False
    for tg, prof_key in _level_recipients(db, c, _level(c)):
        if tg == author:
            continue
        dm = tg is not None and tg not in dmed
        if dm:
            dmed.add(tg)
        _notify(
            db, tg, type="info", dm=dm, nkey="concern_created",
            params={
                "leader_name": c.leader_name or "",
                "owner": c.concern_owner,
                "date": entry,
                "concern": snippet,
                "concern_level": _level(c),
            },
            profile=prof_key,
        )
        sent = True
    if sent:
        db.commit()

    return _serialize(c, _viewer_ctx(db, payload), sm_names=_sm_names(db), owner_names=_owner_names(db, [c]))


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
    # Changing the status is the responsible holder's call (plus admin); everyone
    # else who may edit keeps the current status untouched.
    if body.status != c.status and not _can_set_status(_viewer_ctx(db, payload), c):
        raise HTTPException(status_code=403, detail="Only the responsible person can change the status")

    # Ownership (leader/brigadir) and the creator identity are never reassigned
    # on edit — only the concern fields change.
    c.cell_code = (body.cell_code or "").strip() or None
    c.concern_text = body.concern_text.strip()
    c.status = body.status
    c.deadline_days = body.deadline_days
    if body.entry_date:
        c.entry_date = body.entry_date
    c.completion_date = _apply_completion(body.status, body.completion_date, c.completion_date)
    # Same lifecycle as completion_date, but minute-grained and never client-set:
    # stamp the flip to done, keep it across done→done edits, clear on reopen.
    if body.status == "done":
        if c.done_at is None:
            c.done_at = datetime.now(timezone.utc)
    else:
        c.done_at = None
    c.solution = (body.solution or "").strip() or None

    db.commit()
    db.refresh(c)
    return _serialize(c, _viewer_ctx(db, payload), _esc_counts_for(db, c.id), _sm_names(db), _owner_names(db, [c]))


def _esc_counts_for(db: Session, concern_id: int) -> dict:
    n = db.query(func.count(ConcernEscalation.id)).filter(
        ConcernEscalation.concern_id == concern_id
    ).scalar() or 0
    return {concern_id: n}


def _level_recipients(db: Session, c: LeaderConcern, level: str) -> list[tuple[Optional[int], Optional[str]]]:
    """(telegram_id, profile_key) pairs for whoever holds ``level`` on this
    concern. telegram_id None = the profile is unclaimed — the bell row queues
    on the profile (no DM) and is inherited when the profile is claimed."""
    out: list[tuple[Optional[int], Optional[str]]] = []
    if level == "supervisor":
        if c.brigadir_manager_id:
            sup = _find_supervisor(db, c.brigadir_manager_id)
            out.append((sup.telegram_id if sup else None,
                        _profile_key("supervisor", c.brigadir_manager_id)))
    elif level == "shift-manager":
        if c.shift_manager_profile_id:
            # The specifically picked shift-manager holds it.
            row = db.query(TelegramUserRole).filter_by(
                role="shift-manager", role_id=c.shift_manager_profile_id, status="approved",
            ).first()
            out.append((row.telegram_id if row else None,
                        _profile_key("shift-manager", c.shift_manager_profile_id)))
        elif c.brigadir_manager_id:
            # Legacy rows without a picked holder: everyone on the unit's shift.
            mgr = db.query(Manager).filter_by(id=c.brigadir_manager_id).first()
            if mgr:
                claimed = {
                    r.role_id: r.telegram_id
                    for r in db.query(TelegramUserRole).filter_by(
                        role="shift-manager", status="approved",
                    ).all()
                }
                for p in db.query(RoleProfile).filter_by(role="shift-manager", shift=mgr.shift).all():
                    out.append((claimed.get(p.id), _profile_key("shift-manager", p.id)))
    elif level == "top-manager":
        if c.top_manager_profile_id:
            row = db.query(TelegramUserRole).filter_by(
                role="top-manager", role_id=c.top_manager_profile_id, status="approved",
            ).first()
            out.append((row.telegram_id if row else None,
                        _profile_key("top-manager", c.top_manager_profile_id)))
    return out


class EscalateIn(BaseModel):
    direction: str                                  # "up" | "down"
    reason: str
    top_manager_profile_id: Optional[int] = None    # required on the → top-manager step
    shift_manager_profile_id: Optional[int] = None  # required on the → shift-manager step


@router.post("/{concern_id}/escalate")
def escalate_concern(
    concern_id: int,
    body: EscalateIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Move a concern one step up ("I can't solve this") or back down the
    supervisor → shift-manager → top-manager chain. Gated by the same rights
    as editing (leaders never escalate); a reason is mandatory and the move
    lands in the concern_escalations trail + the receiving handler's bell/DM."""
    c = db.query(LeaderConcern).filter(LeaderConcern.id == concern_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    if payload.get("role") == "leader":
        raise HTTPException(status_code=403, detail="Leaders cannot escalate concerns")
    _assert_can_edit(payload, c, db)

    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reason is required")
    if c.status == "done":
        raise HTTPException(status_code=400, detail="A resolved concern cannot be escalated")

    cur = _level(c)
    idx = LEVEL_IDX.get(cur, 0)
    if body.direction == "up":
        if idx >= LEVEL_IDX["top-manager"]:
            raise HTTPException(status_code=400, detail="Already at the top level")
        new_level = LEVELS[idx + 1]
        if new_level == "shift-manager":
            # A supervisor uplifting picks a shift-manager from their own shift.
            shift = _supervisor_shift(db, payload) if payload.get("role") == "supervisor" else None
            prof = _shift_manager_profile(db, body.shift_manager_profile_id, shift)
            if not prof:
                raise HTTPException(status_code=400, detail="Select a shift-manager")
            c.shift_manager_profile_id = prof.id
            c.shift_manager_name = prof.name
        elif new_level == "top-manager":
            top = db.query(RoleProfile).filter_by(
                id=body.top_manager_profile_id or 0, role="top-manager",
            ).first()
            if not top:
                raise HTTPException(status_code=400, detail="Select a top-manager")
            c.top_manager_profile_id = top.id
            c.top_manager_name = top.name
    elif body.direction == "down":
        if idx <= 0:
            raise HTTPException(status_code=400, detail="Already at the supervisor level")
        new_level = LEVELS[idx - 1]
        if cur == "top-manager":
            c.top_manager_profile_id = None
            c.top_manager_name = None
            # Back to shift-manager: the remembered holder resumes, or the actor
            # names one if none was stored (e.g. a concern seeded at the top).
            if new_level == "shift-manager" and not c.shift_manager_profile_id:
                prof = _shift_manager_profile(db, body.shift_manager_profile_id)
                if not prof:
                    raise HTTPException(status_code=400, detail="Select a shift-manager")
                c.shift_manager_profile_id = prof.id
                c.shift_manager_name = prof.name
        elif cur == "shift-manager":
            # Back to supervisor: the unit's brigadir holds it again.
            c.shift_manager_profile_id = None
            c.shift_manager_name = None
    else:
        raise HTTPException(status_code=400, detail="Invalid direction")

    c.level = new_level
    db.add(ConcernEscalation(
        concern_id=c.id,
        from_level=cur,
        to_level=new_level,
        reason=reason,
        actor_telegram_id=int(payload["sub"]),
        actor_name=payload.get("full_name"),
        actor_role=payload.get("role"),
        target_name=c.top_manager_name if new_level == "top-manager" else None,
    ))
    db.commit()
    db.refresh(c)

    # Tell whoever now holds the concern — level label renders per-viewer at
    # view time (concern_level param), the actor is never notified, and one
    # account never gets the DM twice however many profiles it holds.
    author = int(payload["sub"])
    snippet = c.concern_text if len(c.concern_text) <= 160 else c.concern_text[:157] + "…"
    reason_snip = reason if len(reason) <= 160 else reason[:157] + "…"
    nkey = "concern_escalated" if body.direction == "up" else "concern_returned"
    dmed: set[int] = set()
    sent = False
    for tg, prof_key in _level_recipients(db, c, new_level):
        if tg == author:
            continue
        dm = tg is not None and tg not in dmed
        if dm:
            dmed.add(tg)
        _notify(
            db, tg, type="info", dm=dm, nkey=nkey,
            params={
                "actor_name": payload.get("full_name") or "",
                "leader_name": c.leader_name,
                "date": c.entry_date,
                "reason": reason_snip,
                "concern": snippet,
                "concern_level": new_level,
            },
            profile=prof_key,
        )
        sent = True
    if sent:
        db.commit()

    return _serialize(c, _viewer_ctx(db, payload), _esc_counts_for(db, c.id), _sm_names(db), _owner_names(db, [c]))


@router.get("/{concern_id}/history")
def concern_history(
    concern_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Escalation trail for the history modal, newest first — readable by
    anyone who can SEE the concern (scope-filtered, not edit-gated)."""
    c = _scope_query(
        db.query(LeaderConcern).filter(LeaderConcern.id == concern_id), payload, db,
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    rows = db.query(ConcernEscalation).filter_by(concern_id=concern_id).order_by(
        ConcernEscalation.id.desc()
    ).all()
    return [
        {
            "id": e.id,
            "from_level": e.from_level,
            "to_level": e.to_level,
            "reason": e.reason,
            "actor_name": e.actor_name,
            "actor_role": e.actor_role,
            "target_name": e.target_name,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in rows
    ]


@router.delete("/{concern_id}", status_code=204)
def delete_concern(
    concern_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    c = db.query(LeaderConcern).filter(LeaderConcern.id == concern_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    # Deleting would be a resolve loophole for leaders — supervisor and above only.
    if payload.get("role") == "leader":
        raise HTTPException(status_code=403, detail="Leaders cannot delete concerns")
    _assert_can_edit(payload, c, db)
    db.delete(c)
    db.commit()
