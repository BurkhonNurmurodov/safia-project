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
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Admin, ConcernEscalation, LeaderConcern, Manager, RoleProfile, TelegramUserRole
from app.permissions import require_page
# Reuse the shared notification helpers: _find_supervisor resolves the brigadir
# for a unit, _notify writes the bell row (rendered per-viewer) + Telegram DM.
from app.routers.staff import _find_supervisor, _notify, _profile_key

router = APIRouter(prefix="/api/concerns", tags=["concerns"])

VALID_STATUSES = {"todo", "doing", "done"}

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


def _serialize(
    c: LeaderConcern,
    ctx: Optional[dict] = None,
    esc_counts: Optional[dict] = None,
    sm_names: Optional[dict] = None,
) -> dict:
    resolution_days = None
    if c.completion_date and c.entry_date:
        resolution_days = (c.completion_date - c.entry_date).days
    # Minute-grained "время выполнения": created_at → done_at. NULL done_at
    # (still open, or done before the column existed) renders as "—".
    resolution_minutes = None
    if c.done_at and c.created_at:
        resolution_minutes = max(0, int((c.done_at - c.created_at).total_seconds() // 60))
    level = c.level or "leader"
    # Who answers for the concern right now — the level names a step in the
    # chain, this names the person on that step: leader → the leader,
    # supervisor → the brigadir, shift-manager → that unit's shift's
    # manager(s), top-manager → the specifically assigned one.
    responsible = (
        c.leader_name if level == "leader"
        else c.brigadir_name if level == "supervisor"
        else (sm_names or {}).get(c.brigadir_manager_id) if level == "shift-manager"
        else c.top_manager_name
    )
    out = {
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
        "resolution_minutes": resolution_minutes,
        "level": level,
        "top_manager_profile_id": c.top_manager_profile_id,
        "top_manager_name": c.top_manager_name,
        "responsible_name": responsible,
        "escalation_count": (esc_counts or {}).get(c.id, 0),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }
    # Per-row rights, computed for the requesting viewer (see _can_edit):
    # escalation is one step at a time, blocked on resolved concerns.
    if ctx is not None:
        can = _can_edit(ctx, c)
        lvl = LEVEL_IDX.get(level, 0)
        out["can_edit"] = can
        out["can_escalate"] = can and c.status != "done" and lvl < LEVEL_IDX["top-manager"]
        out["can_deescalate"] = can and c.status != "done" and lvl > 0
    return out


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


def _can_edit(ctx: dict, c: LeaderConcern) -> bool:
    """Responsibility moves UP the escalation chain: the handler at the
    concern's current level and every chain role above it (inside their scope)
    may edit / resolve / escalate; levels below the current one are read-only.
    Top-management is person-specific — only the assigned top-manager acts at
    the top level. Admin manages everything."""
    role = ctx["role"]
    lvl = LEVEL_IDX.get(c.level or "leader", 0)
    if role == "admin":
        return True
    if role == "top-manager":
        return (
            lvl == LEVEL_IDX["top-manager"]
            and c.top_manager_profile_id is not None
            and c.top_manager_profile_id == ctx["role_id"]
        )
    if role == "shift-manager":
        return c.brigadir_manager_id in ctx["shift_units"] and lvl <= LEVEL_IDX["shift-manager"]
    if role == "supervisor":
        return c.brigadir_manager_id == ctx["role_id"] and lvl <= LEVEL_IDX["supervisor"]
    if role == "leader":
        own = (c.leader_role_ref is not None and c.leader_role_ref == ctx["role_ref"]) or (
            ctx["own_profile_id"] is not None and c.leader_profile_id == ctx["own_profile_id"]
        )
        return own and lvl == 0
    return False


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
    return {
        "role": role,
        "picker": picker,
        "read_only": role == "top-manager",
        "can_pick_leader": picker is not None,
        "data": [_serialize(r, ctx, esc_counts, sm_names) for r in rows],
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
        done_at=datetime.now(timezone.utc) if body.status == "done" else None,
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

    return _serialize(c, _viewer_ctx(db, payload), sm_names=_sm_names(db))


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
    return _serialize(c, _viewer_ctx(db, payload), _esc_counts_for(db, c.id), _sm_names(db))


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
    if level == "leader":
        tg = None
        if c.leader_profile_id:
            prof = db.query(RoleProfile).filter_by(id=c.leader_profile_id, role="leader").first()
            if prof:
                claimed = _claimed_role_row(db, prof)
                tg = claimed.telegram_id if claimed else None
        if tg is None and c.leader_role_ref:
            row = db.query(TelegramUserRole).filter_by(
                id=c.leader_role_ref, status="approved",
            ).first()
            tg = row.telegram_id if row else None
        out.append((tg, _profile_key("leader", c.leader_profile_id)))
    elif level == "supervisor":
        if c.brigadir_manager_id:
            sup = _find_supervisor(db, c.brigadir_manager_id)
            out.append((sup.telegram_id if sup else None,
                        _profile_key("supervisor", c.brigadir_manager_id)))
    elif level == "shift-manager":
        mgr = db.query(Manager).filter_by(id=c.brigadir_manager_id).first() if c.brigadir_manager_id else None
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
    direction: str                              # "up" | "down"
    reason: str
    top_manager_profile_id: Optional[int] = None  # required on the shift-manager → top step


@router.post("/{concern_id}/escalate")
def escalate_concern(
    concern_id: int,
    body: EscalateIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("concerns")),
):
    """Move a concern one step up ("I can't solve this") or back down the
    leader → supervisor → shift-manager → top-manager chain. Gated by the same
    rights as editing; a reason is mandatory and the move lands in the
    concern_escalations trail + the receiving handler's bell/DM."""
    c = db.query(LeaderConcern).filter(LeaderConcern.id == concern_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concern not found")
    _assert_can_edit(payload, c, db)

    reason = (body.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="A reason is required")
    if c.status == "done":
        raise HTTPException(status_code=400, detail="A resolved concern cannot be escalated")

    cur = c.level or "leader"
    idx = LEVEL_IDX.get(cur, 0)
    if body.direction == "up":
        if idx >= LEVEL_IDX["top-manager"]:
            raise HTTPException(status_code=400, detail="Already at the top level")
        new_level = LEVELS[idx + 1]
        if new_level == "top-manager":
            prof = db.query(RoleProfile).filter_by(
                id=body.top_manager_profile_id or 0, role="top-manager",
            ).first()
            if not prof:
                raise HTTPException(status_code=400, detail="Select a top-manager")
            c.top_manager_profile_id = prof.id
            c.top_manager_name = prof.name
    elif body.direction == "down":
        if idx <= 0:
            raise HTTPException(status_code=400, detail="Already at the leader level")
        new_level = LEVELS[idx - 1]
        if cur == "top-manager":
            c.top_manager_profile_id = None
            c.top_manager_name = None
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

    return _serialize(c, _viewer_ctx(db, payload), _esc_counts_for(db, c.id), _sm_names(db))


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
    _assert_can_edit(payload, c, db)
    db.delete(c)
    db.commit()
