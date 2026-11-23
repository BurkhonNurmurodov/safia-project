"""
Cell concerns («Yacheyka havotirlari») — the page a WORKER types into.

A PC stands on each production cell with its LEADER's profile open on this page,
and the cell's workers write their concerns into it directly. It replaced the
~180 per-cell Google sheets the `/worker-concerns` KPI used to read; from
2026-10-03 that KPI reads THESE rows (routers/worker_concerns.py) and the sheet
crawl is gone.

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

NO DEADLINE ON FILING (2026-09-23): the worker used to pick one here. A
deadline is now the RECEIVER's — the leader sets it when they take the concern
into work, through the ordinary PUT, which is where that rule lives.

WHO IS TOLD: only the LEADER (the operator's call). A worker filing is not the
brigadir's business until somebody decides it is, and that decision is the
uplift — which notifies them through the ordinary escalate. The ordinary
create_concern notifies three people; this one notifies one.

THE NAME IS PICKED, NOT TYPED (2026-11-23 — the operator reversed the
2026-09-04 typing ruling: one person sat under many spellings). The form lists
the cell's people from Verifix (``GET /workers``) and the filing carries the
employee id; the server takes the name from Verifix, never from the client. A
typed name — an older bundle, every filing before — is matched to one person of
the cell (``services/concern_workers.py``) or kept as typed. ``/stats`` groups
by the employee id where there is one, else by the exact string.
"""
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_leader_profile_id
from app.models import Cell, ConcernEscalation, LeaderConcern, Manager, RoleProfile
from app.permissions import require_page
from app.services import action_log, cell_archive, concern_workers
from app.services.factory_scope import factory_manager_ids, resolve_factory
from app.routers.concerns import (
    CATEGORIES, _cell_leader_recipient, _cell_leaders, _cell_manager_id,
    _comment_counts, _due, _no, _notify_recipients, _owner_names, _scope_query,
    _serialize, _shift_unit_ids, _sm_names, _snippet, _viewer_ctx,
)

router = APIRouter(prefix="/api/cell-concerns", tags=["cell-concerns"])

PAGE = "cell-concerns"

# How much text one worker may file at once. Long enough for a real account of
# a shift, short enough that a stuck key cannot fill the table.
MAX_TEXT = 4000
MAX_NAME = 120


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
        .filter(Cell.verifix_code.isnot(None),
                cell_archive.alive_clause())    # an archived cell takes no filing
    )
    role = payload.get("role")
    if role == "leader":
        # THE resolver, never the token's own (unit, name): a browser token
        # keeps the claims it was minted with, so after a rename or a unit move
        # that pair named nobody and the cell's PC read «no cell assigned» over
        # a cell that was assigned (2026-10-02).
        pid = viewer_leader_profile_id(db, payload)
        if not pid:
            return []
        q = q.filter(Cell.leader_id == pid)
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


def _page_rows(db: Session, payload: dict, date_from, date_to, cell, category, status,
               factory=None, shift=None, manager_id=None):
    """The page's rows under its filters — ONE clause for the register and the
    analysis, so the two halves of the page can never be narrowed two ways (the
    status filter used to reach the register and silently skip the analysis)."""
    q = _scope_query(_worker_rows(db.query(LeaderConcern)), payload, db)
    # The org chain (plant → shift → brigadir) narrows by the UNIT a concern was
    # filed under — /concerns' own rule for the plant. An empty list is a real
    # answer (nothing in scope), never «no filter».
    units = factory_manager_ids(db, resolve_factory(db, payload, factory))
    if shift in (1, 2):
        in_shift = {i for (i,) in db.query(Manager.id).filter(Manager.shift == shift)}
        units = list(in_shift) if units is None else [u for u in units if u in in_shift]
    if manager_id:
        units = [manager_id] if units is None else [u for u in units if u == manager_id]
    if units is not None:
        q = q.filter(LeaderConcern.brigadir_manager_id.in_(units))
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
    return q


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


@router.get("/workers")
def cell_workers(
    cell: str = Query(...),
    q: str = Query(default=""),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The «Ismingiz» list: the cell's people in Verifix; with 2+ letters typed,
    those it fits and then the plant's current workers it fits. Only for a cell
    this PC may file for."""
    code = (cell or "").strip()
    if code not in {c[0] for c in _leader_cells(db, payload)}:
        raise HTTPException(status_code=400, detail="Yacheyka tanlanmagan yoki sizga tegishli emas")
    rows, more = concern_workers.search(db, code, q)
    return {"rows": rows, "more": more}


class WorkerConcernIn(BaseModel):
    cell_code: str
    # The Verifix employee id picked off the cell's list. A tab on an older
    # bundle sends only `worker_name` (typed), which is matched or kept.
    worker_id: Optional[str] = None
    worker_name: Optional[str] = None
    category: str
    concern_text: str
    # No deadline: the leader sets one when they take the concern into work. A
    # tab still open on an older bundle sends `deadline_days`; pydantic drops
    # the unknown field, so that filing still lands — without it.


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

    worker_id = (body.worker_id or "").strip() or None
    if worker_id:
        worker = concern_workers.person(db, worker_id)
        if not worker:
            raise HTTPException(status_code=400, detail="Ismingizni ro'yxatdan tanlang")
    if not worker:
        raise HTTPException(status_code=400, detail="Ismingizni yozing")
    if not text:
        raise HTTPException(status_code=400, detail="Havotiringizni yozing")
    if len(text) > MAX_TEXT:
        raise HTTPException(status_code=400, detail="Havotir matni juda uzun")
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail="Bo'limni tanlang")

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

    typed = None
    if not worker_id:
        hit = concern_workers.match_now(db, worker, cell_code, manager_id)
        if hit:
            typed, (worker_id, worker) = worker, hit

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
        worker_id=worker_id,
        worker_typed=typed,
        # The Owner column and every notification print this. Same string as
        # worker_name, same job the sheets' «Хавотир эгаси» column did.
        concern_owner=worker,
        owner_role=None,
        owner_profile_id=None,
        concern_text=text,
        status="todo",
        deadline_days=None,
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
    dmed: set = set()
    sent = False
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
            int(payload["sub"]), dmed, subject=("concern", c.id)
        )
    if sent:
        db.commit()

    action_log.enrich(
        target_kind="concern", target_id=c.id, target_name=_snippet(text),
        unit_id=c.brigadir_manager_id, unit_name=c.brigadir_name,
        day=today,
        details=[("id", c.seq), ("cell", cell_code), ("category", category),
                 ("worker", worker), ("leader", leader_name),
                 ("text", _snippet(text))],
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
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    manager_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The register — worker filings still sitting at the leader step, newest
    first, scoped by concerns._scope_query so this page can never widen what a
    viewer may read on /concerns."""
    q = _page_rows(db, payload, date_from, date_to, cell, category, status,
                   factory, shift, manager_id)

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


# «How long it takes» — the day buckets the /concerns board already draws, so
# the two pages' answers to «how fast» sit on one scale. A mean alone hides the
# tail: 2.7 days on average says nothing about the concern waiting three weeks.
AGE_BUCKETS = ((0, 1), (2, 3), (4, 7), (8, 14), (15, None))

# The trend follows the PERIOD the reader picked, never a fixed 14 days. It is
# never narrower than a week (a date chart with three bars reads as noise), and
# past nine weeks it counts per WEEK: ninety daily columns cannot be read.
TREND_MIN_DAYS = 7
TREND_DAILY_MAX = 62

# How many of the busiest filers the «who filed» card may draw. The card
# shows as many as fit beside its neighbour, and says how many it holds.
TOP_WORKERS = 15


def _age_bucket(days: int) -> int:
    days = max(0, days)
    for i, (_lo, hi) in enumerate(AGE_BUCKETS):
        if hi is None or days <= hi:
            return i
    return len(AGE_BUCKETS) - 1


def _search_text(r) -> str:
    """The register's own search string — the page filters its table on
    «№ · name · cell · text» client-side, and the analysis must match exactly
    that."""
    return f"{_no(r)} {r.worker_name or ''} {r.cell_code or ''} {r.concern_text or ''}".lower()


def _trend(rows, date_from, date_to, today):
    """(unit, points) — filed and resolved per day, or per week past
    TREND_DAILY_MAX days. Filed = the row's entry_date; resolved = its
    completion_date. A row can appear in both, in two different columns."""
    end = date_to or today
    if date_from:
        start = date_from
    else:
        start = min((r.entry_date for r in rows if r.entry_date), default=end - timedelta(days=13))
    start = min(start, end - timedelta(days=TREND_MIN_DAYS - 1))
    weekly = (end - start).days + 1 > TREND_DAILY_MAX
    if weekly:
        key = lambda d: d - timedelta(days=d.weekday())      # the week's Monday
        start, step = key(start), 7
    else:
        key, step = (lambda d: d), 1
    buckets = []
    d = start
    while d <= end:
        buckets.append(d)
        d += timedelta(days=step)
    filed = {b: 0 for b in buckets}
    solved = {b: 0 for b in buckets}
    for r in rows:
        if r.entry_date and start <= r.entry_date <= end:
            filed[key(r.entry_date)] += 1
        if r.completion_date and start <= r.completion_date <= end:
            solved[key(r.completion_date)] += 1
    return ("week" if weekly else "day",
            [{"d": b.isoformat(), "filed": filed[b], "done": solved[b]} for b in buckets])


@router.get("/stats")
def cell_concern_stats(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    cell: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    manager_id: Optional[int] = Query(None),
    q: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The analysis tab, computed over EXACTLY the rows the register would show
    under the same filters — status and the search box included — so the two
    halves of one page can never quote different totals.

    ``overdue`` is a flag, never a bucket: it counts the OPEN rows already past
    their own deadline, and those rows are also still counted under todo/doing.
    Subtracting them into a fourth bucket is how a board of twelve overdue «to
    do» rows comes to print «to do: 0» above a table of twelve of them. Every
    breakdown (department, cell) carries the same flag beside its status split.
    """
    rows = _page_rows(db, payload, date_from, date_to, cell, category, status,
                   factory, shift, manager_id).all()
    needle = (q or "").strip().lower()
    if needle:
        rows = [r for r in rows if needle in _search_text(r)]

    today = date.today()
    cell_info = _cell_leaders(db)        # code → (cell id, leader, brigadir)
    total = len(rows)
    by_status = {"todo": 0, "doing": 0, "done": 0}
    by_cat: dict = {}
    by_cell: dict = {}
    by_worker: dict = {}
    overdue = 0
    res_days: list = []
    age_done = [0] * len(AGE_BUCKETS)
    age_open = [0] * len(AGE_BUCKETS)

    def _acc():
        return {"todo": 0, "doing": 0, "done": 0, "overdue": 0, "days": []}

    for r in rows:
        st = r.status if r.status in by_status else "todo"
        by_status[st] += 1
        c = by_cat.setdefault(r.category or "other", _acc())
        b = by_cell.setdefault(r.cell_code or "—", _acc())
        c[st] += 1
        b[st] += 1
        # By the Verifix person; a typed name nobody fits by its exact string —
        # folding spellings here would invent a person.
        w = (r.worker_name or "").strip() or "—"
        e = by_worker.setdefault(r.worker_id or w, {"name": w, "n": 0, "employee_id": r.worker_id})
        e["n"] += 1
        # _due, the register's own answer: a receiver's deadline counts from
        # the day they took the concern into work, not from filing.
        due = _due(r)
        if st != "done" and due is not None and due < today:
            overdue += 1
            c["overdue"] += 1
            b["overdue"] += 1
        if st == "done" and r.completion_date and r.entry_date:
            days = (r.completion_date - r.entry_date).days
            res_days.append(days)
            b["days"].append(days)
            age_done[_age_bucket(days)] += 1
        elif st != "done" and r.entry_date:
            age_open[_age_bucket((today - r.entry_date).days)] += 1

    unit, trend = _trend(rows, date_from, date_to, today)

    def _cell_row(code, v):
        cid, leader, brigadir = cell_info.get(code, (None, None, None))
        n = v["todo"] + v["doing"] + v["done"]
        return {
            "code": code, "cell_id": cid, "leader": leader, "brigadir": brigadir,
            "todo": v["todo"], "doing": v["doing"], "done": v["done"],
            "open": v["todo"] + v["doing"], "overdue": v["overdue"], "n": n,
            "resolved_pct": round(v["done"] * 100 / n) if n else 0,
            "avg_days": round(sum(v["days"]) / len(v["days"]), 1) if v["days"] else None,
        }

    return {
        "total": total,
        "by_status": by_status,
        "open": by_status["todo"] + by_status["doing"],
        "overdue": overdue,
        "avg_days": round(sum(res_days) / len(res_days), 1) if res_days else None,
        "resolved_pct": round(by_status["done"] * 100 / total) if total else 0,
        "workers": len(by_worker),
        "by_category": sorted(
            [{"key": k, "todo": v["todo"], "doing": v["doing"], "done": v["done"],
              "overdue": v["overdue"], "n": v["todo"] + v["doing"] + v["done"]}
             for k, v in by_cat.items()],
            key=lambda x: (-x["n"], x["key"]),
        ),
        # Every cell, most still-open first — the page's cell table sorts it
        # further on the reader's own column.
        "by_cell": sorted(
            [_cell_row(k, v) for k, v in by_cell.items()],
            key=lambda x: (-x["open"], -x["n"], x["code"]),
        ),
        "by_worker": sorted(
            list(by_worker.values()),
            key=lambda x: (-x["n"], x["name"]),
        )[:TOP_WORKERS],
        # `trend` keeps the shape a tab on an older bundle reads; `trend_unit`
        # says whether its points are days or weeks (the week's Monday).
        "trend": trend,
        "trend_unit": unit,
        "age": {
            "buckets": [f"{lo}–{hi}" if hi is not None else f"{lo}+" for lo, hi in AGE_BUCKETS],
            "done": age_done,
            "open": age_open,
        },
    }
