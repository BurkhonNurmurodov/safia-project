"""
Cell concerns («Yacheyka havotirlari») — the page a WORKER types into.

A PC stands on each production cell with its LEADER's profile open on this page,
and the cell's workers write their concerns into it directly. It replaces the
~180 per-cell Google sheets that services/worker_concerns.py crawls for the
`/worker-concerns` KPI; that page and those sheets are deliberately untouched
here (the operator's call, 2026-09-04 — «completely new page»).

WHERE THE ROWS LIVE, and why there is no table of their own
-----------------------------------------------------------
Straight into ``leader_concerns`` at ``level="leader"``, the bottom step of the
chain routers/concerns.py already defines. That step existed before this feature
as a DOWNGRADE destination only — a supervisor handing a concern down to the
leader it was logged against; this is the first thing that OPENS there.

Everything the page has to do downstream is then machinery that already exists
and is already trusted:

  * "uplift to my brigadir"  = POST /api/concerns/{id}/escalate direction=up,
    leader → supervisor, reason mandatory, ConcernEscalation trail written and
    the receiving brigadir notified — the one definition of a handover;
  * status / solution        = PUT /api/concerns/{id};
  * the comment thread       = /api/concerns/{id}/comments;
  * who may touch a row      = _visible_concern / _assert_can_edit /
    _can_set_status, unchanged.

Those handlers are reached under this page's own grant through
``concerns.ROW_ACTION_PAGES`` — the page gate is widened, the per-ROW checks are
not. A second implementation of "resolve a concern" or "hand one to the
brigadir" is precisely what would let this page and /concerns start disagreeing
about one row, so this module deliberately owns none of it.

WHAT THIS MODULE DOES OWN: the two things that are genuinely new — the worker's
filing (``POST ""``) and the two read surfaces the page is made of, its register
(``GET ""``) and its analysis (``GET /stats``).

THE PAGE'S OWN SCOPE is one clause, ``_worker_rows``: worker-filed AND still at
the leader step. An uplifted concern LEAVES this page entirely (the operator's
ruling) — it is the brigadir's now, and it is on /concerns, where the whole
chain can see it. Rows are then narrowed by ``concerns._scope_query``, so a
leader reads their own, a brigadir their unit's, an admin everything.

WHO IS TOLD: only the LEADER (the operator's call). A worker filing is not the
brigadir's business until somebody decides it is, and that decision is the
uplift — which notifies them through the ordinary escalate. The ordinary
create_concern notifies three people; this one notifies one.

THE NAME IS FREE TEXT and must never be used as a key. The operator chose typing
over picking off the day's cell roster, so one person legitimately appears as
«Karimova Nilufar» and «Karimova N.»; ``/stats`` groups by the exact string and
says so on the page rather than pretending the grouping is a person.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, ConcernEscalation, LeaderConcern, Manager, RoleProfile
from app.permissions import require_page
from app.services import action_log
from app.routers.concerns import (
    CATEGORIES, _cell_leader_recipient, _cell_leaders, _cell_manager_id,
    _comment_counts, _no, _notify_recipients, _owner_names, _scope_query,
    _serialize, _shift_unit_ids, _sm_names, _snippet, _viewer_ctx,
)

router = APIRouter(prefix="/api/cell-concerns", tags=["cell-concerns"])

PAGE = "cell-concerns"

# How much text one worker may file at once. Long enough for a real account of
# a shift, short enough that a stuck key cannot fill the table.
MAX_TEXT = 4000
MAX_NAME = 120
# The deadline chips the page offers, plus anything typed inside the same range.
MAX_DEADLINE_DAYS = 365


def _worker_rows(q):
    """THE page's scope, in one place: a concern a WORKER filed that is still at
    the LEADER step.

    Both halves are load-bearing. ``worker_name IS NOT NULL`` keeps the ordinary
    /concerns rows out — this page shows what the shop floor wrote, not what
    managers logged about it. ``level == "leader"`` is what makes an uplift
    remove the row from here: the escalate moves the level and nothing else
    needs to know this page exists.
    """
    return q.filter(
        LeaderConcern.worker_name.isnot(None),
        func.coalesce(LeaderConcern.level, "supervisor") == "leader",
    )


def _leader_cells(db: Session, payload: dict):
    """The cells this page may file against, newest registry state, as
    [(code, cell_id, leader_profile_id, leader_name, manager_id)].

    Ownership is plain ``cells.leader_id`` — assign a cell on /cells and the
    concern box follows it, the same rule the per-cell checklist uses. A
    supervisor gets their whole unit's cells (they read the page, they do not
    normally type into it); an admin gets every cell.
    """
    q = (
        db.query(Cell.verifix_code, Cell.id, RoleProfile.id, RoleProfile.name,
                 func.coalesce(RoleProfile.manager_id, Cell.manager_id))
        .outerjoin(RoleProfile, (RoleProfile.id == Cell.leader_id)
                   & (RoleProfile.role == "leader"))
        .filter(Cell.verifix_code.isnot(None))
    )
    role = payload.get("role")
    if role == "leader":
        # A leader's role row points at the UNIT, so the profile is resolved by
        # (unit, name) exactly as concerns._own_profile does it.
        prof = db.query(RoleProfile).filter_by(
            role="leader", manager_id=payload.get("role_id"),
            name=payload.get("full_name"),
        ).first()
        if not prof:
            return []
        q = q.filter(Cell.leader_id == prof.id)
    elif role == "supervisor":
        q = q.filter(func.coalesce(RoleProfile.manager_id, Cell.manager_id)
                     == payload.get("role_id"))
    elif role == "shift-manager":
        # _shift_unit_ids, not shift_scope.unit_ids direct: it is the one place
        # that says a concern's unit stays in scope after the unit is archived,
        # and it takes the role_id (the profile), never the payload.
        units = _shift_unit_ids(db, payload.get("role_id"))
        if not units:
            return []
        q = q.filter(func.coalesce(RoleProfile.manager_id, Cell.manager_id).in_(units))
    return [tuple(r) for r in q.order_by(Cell.verifix_code).all()]


@router.get("/meta")
def cell_concerns_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """What the entry form needs before a worker touches anything: which cells
    this PC may file for, who answers them, and the category whitelist.

    The categories are served as KEYS — the page renders each through
    ``concerns.category.<key>`` in the viewer's language, so the four locales
    stay the one place those words live.
    """
    cells = _leader_cells(db, payload)
    mgr_names = {
        m.id: m.name for m in db.query(Manager).filter(
            Manager.id.in_([c[4] for c in cells if c[4]] or [0])
        )
    }
    return {
        "cells": [
            {
                "code": code, "cell_id": cid,
                "leader_profile_id": lpid, "leader_name": lname,
                "manager_id": mid, "brigadir_name": mgr_names.get(mid),
            }
            for code, cid, lpid, lname, mid in cells
        ],
        # Whitelist order is the backend's; the page sorts by its own labels.
        "categories": sorted(CATEGORIES),
        "role": payload.get("role"),
    }


class WorkerConcernIn(BaseModel):
    cell_code: str
    worker_name: str
    category: str
    concern_text: str
    deadline_days: Optional[int] = None


@router.post("")
def file_cell_concern(
    body: WorkerConcernIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """A worker files a concern from the shop-floor PC.

    The session belongs to the LEADER (the PC stands open on their profile), so
    the authenticated caller is emphatically NOT the author. That is why
    ``owner_role`` / ``owner_profile_id`` are left NULL: _serialize resolves the
    Owner column from those first and falls back to ``concern_owner``, so
    filling them would print the leader's name over every concern the floor
    wrote about them. ``created_by`` still records the account the filing came
    through, which is what the action log needs.
    """
    cell_code = (body.cell_code or "").strip()
    worker = " ".join((body.worker_name or "").split())[:MAX_NAME]
    category = (body.category or "").strip()
    text = (body.concern_text or "").strip()

    if not worker:
        raise HTTPException(status_code=400, detail="Ismingizni yozing")
    if not text:
        raise HTTPException(status_code=400, detail="Havotiringizni yozing")
    if len(text) > MAX_TEXT:
        raise HTTPException(status_code=400, detail="Havotir matni juda uzun")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Bo'limni tanlang")
    days = body.deadline_days
    if days is not None and not (0 < days <= MAX_DEADLINE_DAYS):
        raise HTTPException(status_code=400, detail="Muddat noto'g'ri")

    # The cell must be one this page may file for — the code arrives over the
    # wire and the endpoint is reachable without the UI, so a typed code must
    # not be able to drop a concern onto another unit's leader.
    allowed = {c[0]: c for c in _leader_cells(db, payload)}
    if cell_code not in allowed:
        raise HTTPException(status_code=400, detail="Yacheyka tanlanmagan yoki sizga tegishli emas")
    _, _, leader_profile_id, leader_name, manager_id = allowed[cell_code]
    if not leader_profile_id:
        # A cell with no leader has nobody to answer the concern, and the whole
        # page is "your leader". Refusing names the fix; filing it would park
        # the row where no reader is scoped to it.
        raise HTTPException(status_code=400, detail="Bu yacheykaga lider biriktirilmagan")

    if not manager_id:
        manager_id = _cell_manager_id(db, cell_code)
    mgr = db.query(Manager).filter_by(id=manager_id).first() if manager_id else None

    next_seq = (db.query(func.max(LeaderConcern.seq)).scalar() or 0) + 1
    today = date.today()
    c = LeaderConcern(
        seq=next_seq,
        leader_profile_id=leader_profile_id,
        leader_name=leader_name,
        brigadir_manager_id=manager_id,
        brigadir_name=mgr.name if mgr else None,
        cell_code=cell_code,
        category=category,
        worker_name=worker,
        # The Owner column and every notification print this. Same string as
        # worker_name, same job the sheets' «Хавотир эгаси» column did.
        concern_owner=worker,
        owner_role=None,
        owner_profile_id=None,
        concern_text=text,
        status="todo",
        deadline_days=days,
        entry_date=today,
        # Opens at the LEADER step — the whole point. Nothing else in the
        # codebase creates a concern here.
        level="leader",
        level_since=func.now(),
        created_by=int(payload["sub"]),
    )
    db.add(c)
    db.commit()
    db.refresh(c)

    # ONLY the leader is told (the operator's ruling). The brigadir hears about
    # it if and when the leader uplifts it, through the escalate's own notify —
    # a worker's concern is not the brigadir's business until somebody decides
    # it is. _notify_recipients skips a profile whose only holder is the caller,
    # so a leader filing on a worker's behalf is not DMed their own typing.
    rec = _cell_leader_recipient(db, cell_code)
    if rec is not None:
        sent = _notify_recipients(
            db, [(None, rec[1])], "concern_assigned",
            {
                "concern_no": _no(c),
                "actor_name": worker,
                "owner": worker,
                "date": today,
                "concern": _snippet(text),
            },
            int(payload["sub"]), set(),
        )
        if sent:
            db.commit()

    action_log.enrich(
        target_kind="concern", target_id=c.id, target_name=_snippet(text),
        unit_id=c.brigadir_manager_id, unit_name=c.brigadir_name,
        day=today,
        details=[("id", c.seq), ("cell", cell_code), ("category", category),
                 ("worker", worker), ("leader", leader_name),
                 ("deadline", days), ("text", _snippet(text))],
    )
    return _serialize(c, _viewer_ctx(db, payload), sm_names=_sm_names(db),
                      owner_names=_owner_names(db, [c]), cell_leaders=_cell_leaders(db),
                      comment_counts=_comment_counts(db, [c.id]))


@router.get("")
def list_cell_concerns(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    cell: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The register — worker filings still sitting at the leader step, newest
    first, scoped by concerns._scope_query so this page can never widen what a
    viewer may read on /concerns."""
    q = _worker_rows(db.query(LeaderConcern))
    q = _scope_query(q, payload, db)
    if date_from:
        q = q.filter(LeaderConcern.entry_date >= date_from)
    if date_to:
        q = q.filter(LeaderConcern.entry_date <= date_to)
    if cell:
        q = q.filter(LeaderConcern.cell_code == cell.strip())
    if category:
        q = q.filter(LeaderConcern.category == category.strip())
    if status:
        q = q.filter(LeaderConcern.status == status.strip())

    rows = q.order_by(LeaderConcern.entry_date.desc(),
                      LeaderConcern.seq.desc().nullslast(),
                      LeaderConcern.id.desc()).all()

    ctx = _viewer_ctx(db, payload)
    ids = [r.id for r in rows]
    # One grouped query for the whole page, exactly as list_concerns does it —
    # _esc_counts_for answers for a SINGLE row and would be a query per row here.
    esc_counts: dict = {}
    if ids:
        esc_counts = dict(
            db.query(ConcernEscalation.concern_id, func.count(ConcernEscalation.id))
            .filter(ConcernEscalation.concern_id.in_(ids))
            .group_by(ConcernEscalation.concern_id)
            .all()
        )
    sm, on, cl = _sm_names(db), _owner_names(db, rows), _cell_leaders(db)
    counts = _comment_counts(db, ids)
    return {
        "rows": [_serialize(r, ctx, esc_counts, sm, on, cl, counts) for r in rows],
        # The cells the viewer may file for, so the register's filter and the
        # entry form offer one list and cannot disagree about it.
        "cells": [c[0] for c in _leader_cells(db, payload)],
    }


@router.get("/stats")
def cell_concern_stats(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    cell: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The analysis tab, computed over EXACTLY the rows the register would show
    under the same filters — the two halves of one page must never be able to
    quote different totals.

    ``overdue`` is a flag, never a bucket: it counts the OPEN rows already past
    their own deadline, and those rows are also still counted under todo/doing.
    Subtracting them into a fourth bucket is how a board of twelve overdue «to
    do» rows comes to print «to do: 0» above a table of twelve of them.
    """
    q = _scope_query(_worker_rows(db.query(LeaderConcern)), payload, db)
    if date_from:
        q = q.filter(LeaderConcern.entry_date >= date_from)
    if date_to:
        q = q.filter(LeaderConcern.entry_date <= date_to)
    if cell:
        q = q.filter(LeaderConcern.cell_code == cell.strip())
    if category:
        q = q.filter(LeaderConcern.category == category.strip())
    rows = q.all()

    today = date.today()
    total = len(rows)
    by_status = {"todo": 0, "doing": 0, "done": 0}
    by_cat: dict = {}
    by_cell: dict = {}
    by_worker: dict = {}
    overdue = 0
    res_days: list = []

    for r in rows:
        st = r.status if r.status in by_status else "todo"
        by_status[st] += 1
        by_cat.setdefault(r.category or "other", 0)
        by_cat[r.category or "other"] += 1
        code = r.cell_code or "—"
        b = by_cell.setdefault(code, {"todo": 0, "doing": 0, "done": 0})
        b[st] += 1
        # Grouped on the EXACT typed string: free text is not an identity, so
        # folding spellings together here would invent a person. The page says
        # so beside the list.
        w = (r.worker_name or "").strip() or "—"
        by_worker[w] = by_worker.get(w, 0) + 1
        if st != "done" and r.deadline_days and r.entry_date:
            if r.entry_date + timedelta(days=r.deadline_days) < today:
                overdue += 1
        if st == "done" and r.completion_date and r.entry_date:
            res_days.append((r.completion_date - r.entry_date).days)

    # The 14-day trend. Filed = rows whose entry_date is that day; resolved =
    # rows whose completion_date is. A row can appear in both, on two days.
    end = date_to or today
    start = end - timedelta(days=13)
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    filed = {d: 0 for d in days}
    solved = {d: 0 for d in days}
    for r in rows:
        if r.entry_date in filed:
            filed[r.entry_date] += 1
        if r.completion_date in solved:
            solved[r.completion_date] += 1

    return {
        "total": total,
        "by_status": by_status,
        "overdue": overdue,
        "avg_days": round(sum(res_days) / len(res_days), 1) if res_days else None,
        "resolved_pct": round(by_status["done"] * 100 / total) if total else 0,
        "workers": len(by_worker),
        "by_category": sorted(
            [{"key": k, "n": v} for k, v in by_cat.items()],
            key=lambda x: -x["n"],
        ),
        "by_cell": sorted(
            [{"code": k, **v, "n": sum(v.values())} for k, v in by_cell.items()],
            key=lambda x: -x["n"],
        ),
        "by_worker": sorted(
            [{"name": k, "n": v} for k, v in by_worker.items()],
            key=lambda x: (-x["n"], x["name"]),
        )[:8],
        "trend": [
            {"d": d.isoformat(), "filed": filed[d], "done": solved[d]}
            for d in days
        ],
    }
