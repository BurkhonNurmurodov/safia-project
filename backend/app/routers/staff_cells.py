"""
/api/staff-cells — the CELL-level people exchange, the sandbox twin of /staff.

**What this router answers that /staff cannot.** `/api/staff` is keyed by
`(manager_id, date)` from end to end: a document belongs to a UNIT, a roster is
a unit's roster, and a transfer is a unit → unit move. The cell — the yacheyka
a worker actually stood in — is nothing there but a nullable string column the
«Davomat» upload stamps, which no endpoint filters on and no helper resolves an
owner for. This router asks the same day one level down: which cell did these
people LEAVE, and which cell did they land in. That single change of key is
what makes the page reachable by a LEADER, who owns cells and not a unit, and
it is why nothing here is a widening of an existing endpoint — every read and
every write is a new door with its own scope.

**Nothing is shared with /staff except the parts that must never disagree.**
The split arithmetic, the day-open guard, the target-has-data rule, the payload
history, the notification templates, the staleness ceiling and the document
serialiser are all IMPORTED from `routers/staff`, because a second spelling of
any of them is a page that predicts one number and applies another. What is
NOT imported is every helper that carries the unit-level RULE:
`_scope_documents` (which falls through to `return q` — everything — for a
role it does not list, and a leader is such a role), `_resolve_manager` (which
takes `body.manager_id` verbatim for anyone who is not a supervisor),
`_resolve_exchange_target` (whose sender-unit ≠ target-unit refusal is exactly
the move this page exists to make), `_normalize_transfer_time` (which gates the
transfer clock on a role list leaders are not on) and `_staff_sees_all` (which
folds the `staff` and `daily` grants together — this page asks
`page_scope_is_all(db, caller, "staff-cell")`, its own key, nothing folded in).
Each of those has a cell-level twin below, and each twin FAILS CLOSED.

**Row scope is `services/cell_scope`, always.** A `manager_id`, a `sender_cell`
or a worker name arriving in a request body is typeable, and the page that
produced it is not the authority on what its author may touch — so every one of
them is intersected with `cell_scope.caller_cells` before it is trusted, in
memory through `cell_scope.allows` and in SQL through `cell_scope.code_clause`.
Never test `code in scope.codes` by hand: an admin's `codes` are empty by
design and the bare test refuses every action they take.

**THE INVARIANT: no attendance row is written on any path a document in
`cell_exchange.TEST_DOC_TYPES` can reach.** While the sandbox stands, every
document filed here carries a test doc_type; it is filed, notified, approved
and recorded for real, and instead of applying it, :func:`_approve_cell_doc`
stores what it WOULD have done at `payload["dry_run"]`. That is why the approve
path below writes its own status stamp rather than calling `staff._approve_doc`
— that function ends in `_apply_doc_effects`, and an invariant a reviewer has
to establish by reading a THIRD file is not one this diff can carry. Every
branch keys off `cell_exchange.is_test(doc.doc_type)` and never off `SANDBOX`
directly: after the cut-over the constant describes NEW documents, while the
documents already written stay what they were.

**One Save may file SEVERAL documents.** The body carries no sender cell at
all: the backend reads each selected worker's OWN attendance row, groups the
selection by the cell those rows name, and writes one document per distinct
sender cell inside ONE transaction. A document therefore always describes a
move out of exactly one cell, which is what lets the register, the notification
and the dry run all name a single origin. Telegram DMs fire only AFTER the
commit — a DM is not transactional, and one sent mid-transaction survives the
rollback and is re-sent by every retry.
"""
from __future__ import annotations

import logging
from collections.abc import Mapping
from datetime import date, datetime, timezone
from typing import List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.capabilities import CAP_DOCUMENTS_APPROVE, cap_scope, page_scope_is_all
from app.capability_alerts import alert_grant_use, tv
from app.database import get_db
from app.models import (
    Admin, Attendance, Cell, DayApproval, EditRequest, ExchangeTask,
    HrDocument, Manager, RoleProfile,
)
from app.notify_ctx import notifications_suppressed
from app.permissions import require_page
from app.routers import staff
from app.routers.staff import (
    STALE_APPROVE_DAYS, ExchangeTargetNoData, MIN_MOVED_ZAGRUZKA_HOURS,
    _assert_day_open, _compute_split, _doc_alert_details, _doc_log_fields,
    _ensure_exchange_task, _exchange_target_label, _fmt_hhmm, _notify,
    _parse_hhmm, _profile_key, _record_history, _revert_doc_effects,
    _serialize_doc, _sm_role_ids_for_shift, _sm_shift, _unit_has_attendance,
    is_assignable_target_role, notify_profile,
)
from app.services import action_log, cell_exchange, cell_lookup
from app.services.cell_scope import (
    CellScope, allows, caller_cells, code_clause, in_codes, same_code,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/staff-cells", tags=["staff-cells"])

PAGE = "staff-cell"

# The page key is SINGULAR while the route is PLURAL, and both spellings are
# load-bearing: `permissions.PAGE_KEYS`, `DEFAULT_PAGE_ACCESS`,
# `capabilities.SCOPED_PAGES` and every grant row say "staff-cell", the URL and
# this router's prefix say "/staff-cells". Never let one drift into the other.
_require_cell_staff = require_page(PAGE)

# Names the attendance importer writes for a row that carries no worker.
_NO_NAME = ["", "nan", "NaN"]


# ── scope plumbing ────────────────────────────────────────────────────────────

def _named_rows(q):
    """Narrow an Attendance query to rows that name a real person.

    The importer writes nameless rows for split leftovers and for hours it
    could not attribute; they are real minutes and they are counted in
    ``extra_hours``, but they are not people and can never be selected, moved
    or shown on a roster."""
    return q.filter(
        Attendance.worker_name.isnot(None),
        Attendance.worker_name.notin_(_NO_NAME),
    )


def _coded(col=Attendance.verifix_code):
    """«this row names a cell at all» — the precondition of every cell rule
    here. A blank string is treated as NULL because the upload writes both."""
    return and_(col.isnot(None), col != "")


def _own_brigadir_clause(caller: dict):
    """The caller's OWN cell-less attendance row, or None.

    A unit's brigadir clocks in with no «Код подразделения» — they are matched
    to the unit by NAME — so their row belongs to no cell and no cell scope can
    reach it. It is still their day and they expect to see themselves on it, so
    it is OR-ed in separately, keyed off ``caller["role_id"]`` — the caller's
    OWN unit — and never off ``scope.units``: a leader's cells belong to a unit
    too, and keying off the scope would hand every leader their brigadir's row
    on a page that has nothing to do with them.

    ``verifix_code IS NULL`` does NOT imply ``is_supervisor``: a legacy day
    ingested through the older per-supervisor files carries a null code on
    EVERY row, and a row resurrected by ``undo_request`` loses its code
    silently. So the boolean column is tested as well — it is the only marker
    that says «this row is the brigadir», and it is the same one the загрузка
    keeps them out of the load with.
    """
    if caller.get("role") != "supervisor" or not caller.get("role_id"):
        return None
    return and_(
        Attendance.manager_id == caller["role_id"],
        or_(Attendance.verifix_code.is_(None), Attendance.verifix_code == ""),
        Attendance.is_supervisor.is_(True),
    )


def _row_scope_clause(scope: CellScope, caller: dict):
    """«which attendance rows may this caller see» — cells in scope, plus their
    own cell-less brigadir row.

    Deliberately built as ``coded AND code_clause`` rather than leaning on
    ``code_clause`` alone: for an ADMIN that clause is ``true()``, which also
    matches every NULL-code row on the platform, and the whole point of this
    page is the cell dimension. Requiring a code first makes admin, supervisor,
    shift-manager and leader all read the same shape — a day whose upload
    carried no codes returns nothing but the brigadir's own row, which is
    exactly the fact the page needs in order to SAY the day has no cells rather
    than pretending it has none.
    """
    cells = and_(_coded(), code_clause(scope, Attendance.verifix_code))
    own = _own_brigadir_clause(caller)
    return or_(cells, own) if own is not None else cells


def _visible_units(db: Session, scope: CellScope) -> Optional[List[int]]:
    """The unit ids this caller's cells belong to; ``None`` = every unit.

    ``None`` is the admin answer and it is the only unrestricted one — an empty
    scope returns an EMPTY list, which is a real answer («you own no cell») and
    must narrow to nothing rather than read as «no narrowing». Derived from the
    CELLS, never from the token, so a supervisor whose unit holds no registered
    cell is correctly empty here too."""
    if scope.all:
        return None
    return sorted(scope.units)


def _assert_cell_allowed(scope: CellScope, code: Optional[str], what: str) -> str:
    """Trust a cell code that arrived in a request and return its normal form.

    Everything typeable goes through here. ``allows`` is the in-memory twin of
    ``code_clause`` and it answers True for an admin without enumerating the
    registry, which a hand-written ``code in scope.codes`` cannot do."""
    norm = cell_lookup.norm_code(code)
    if not norm:
        raise HTTPException(status_code=400, detail=f"{what} is required")
    if not allows(scope, norm):
        raise HTTPException(status_code=403, detail=f"{what} is outside your cells")
    return norm


def _scope_documents(q, caller: dict, db: Session):
    """Restrict an HrDocument query to what this caller may SEE. Fails closed.

    The unit-level twin (`staff._scope_documents`) ends in a bare ``return q``
    labelled «admin → everything», which a leader — matching no branch above it
    — also reaches: every document on the platform, every unit, every date.
    This one is exhaustive by role and its last rung is an always-empty filter,
    so a role nobody listed sees nothing.

    A cell-level document is visible from BOTH ends, because both ends lost or
    gained the people: a leader sees a document whose ``sender_cell`` OR whose
    ``target_cell`` is one of theirs. Both comparisons are made against the
    payload as TEXT — JSONB ``.astext`` is a string comparison — and both go
    through `cell_scope.code_clause`, the SAME twin that narrows the roster,
    rather than through a hand-written ``.in_(scope.codes)``.

    That distinction is the whole of this branch. A payload code is normalised
    on write, but it is normalised from the ATTENDANCE row's spelling, while
    `scope.codes` come from `cells.verifix_code` — and the plant writes one
    cell both ways, so a document filed out of a cell the register calls «0028»
    stores «28» whenever the day's upload spelled it that way. Filtering on the
    bare scope set made exactly those documents invisible to the leader who
    owns the cell, on a page whose register is the only place they can see a
    move out of it. `code_clause` matches every spelling, so the register and
    the roster answer for one cell the same way.
    """
    role = caller.get("role")

    # An "all"-scoped documents grant is admin reach over the queue, exactly as
    # on /staff: the transfers this person handles are every unit's.
    if cap_scope(db, caller, CAP_DOCUMENTS_APPROVE) == "all":
        return q
    # A page grant at "all" on THIS page — never folded in from "staff", whose
    # grant answers a different question about a different set of endpoints.
    if role == "admin" or page_scope_is_all(db, caller, PAGE):
        return q

    if role == "supervisor":
        rid = caller.get("role_id")
        if not rid:
            return q.filter(HrDocument.id < 0)
        return q.filter(or_(
            HrDocument.manager_id == rid,
            HrDocument.payload["target_manager_id"].astext == str(rid),
        ))

    if role == "shift-manager":
        shift = _sm_shift(db, caller.get("role_id"))
        if shift not in (1, 2):
            return q.filter(HrDocument.id < 0)
        unit_ids = [
            mid for (mid,) in db.query(Manager.id).filter(
                Manager.shift == shift, Manager.archived.is_(False)).all()
        ]
        if not unit_ids:
            return q.filter(HrDocument.id < 0)
        return q.filter(or_(
            HrDocument.manager_id.in_(unit_ids),
            HrDocument.payload["target_manager_id"].astext.in_(
                [str(u) for u in unit_ids]),
        ))

    if role == "leader":
        scope = caller_cells(db, caller)
        if not scope.codes:
            return q.filter(HrDocument.id < 0)
        return q.filter(or_(
            code_clause(scope, HrDocument.payload["sender_cell"].astext),
            code_clause(scope, HrDocument.payload["target_cell"].astext),
        ))

    # top-manager, guest, anything a future release invents → nothing.
    return q.filter(HrDocument.id < 0)


def _sandbox_clause(q):
    """While the sandbox stands this page shows its OWN documents only.

    A /staff document is a real transfer that moved real rows; showing it here
    beside a test one, in a register whose whole promise is «nothing moved»,
    would be the one confusion the TEST chip exists to prevent. After the
    cut-over the types converge and this filter becomes the real one — which is
    why it keys off the type set and not off the constant.
    """
    if cell_exchange.SANDBOX:                      # CUT-OVER: drop the narrowing
        return q.filter(cell_exchange.test_clause(HrDocument.doc_type))
    return q.filter(HrDocument.doc_type.in_(cell_exchange.REAL_DOC_TYPES))


def _get_doc(doc_id: int, caller: dict, db: Session) -> HrDocument:
    doc = _sandbox_clause(
        _scope_documents(db.query(HrDocument), caller, db)
    ).filter(HrDocument.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


# ── cell metadata ─────────────────────────────────────────────────────────────

def _cell_rows(db: Session, codes) -> dict:
    """{normalised code → Cell} for a set of raw attendance codes.

    Keyed through ``norm_code`` on both sides because the plant writes a code
    zero-padded in one register and zero-stripped in the other, and one lookup
    table indexed by the raw string is how a cell silently loses its name."""
    wanted = {cell_lookup.norm_code(c) for c in codes if c}
    wanted.discard("")
    if not wanted:
        return {}
    out: dict = {}
    for c in db.query(Cell).all():
        n = cell_lookup.norm_code(c.verifix_code)
        if not n:
            continue
        if n in wanted:
            out.setdefault(n, c)
            continue
        bare = n.lstrip("0")
        if bare and bare in wanted:
            out.setdefault(bare, c)
    return out


def _leader_names(db: Session) -> dict:
    """{role_profiles.id → display name} for every leader profile."""
    return {
        p.id: p.name for p in
        db.query(RoleProfile.id, RoleProfile.name).filter(RoleProfile.role == "leader").all()
    }


def _unit_names(db: Session) -> dict:
    return {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}


def _cell_catalog(db: Session, codes, cells: dict, leaders: dict, units: dict) -> list:
    """The day's cell catalog — one entry per code the roster carries.

    A code the registry has never heard of still appears, as the bare code with
    null names: the attendance register is the upload's and the cell register is
    ours, and the two are allowed to disagree in public. Folding an unknown code
    away would make «we have never seen this cell» indistinguishable from «this
    day has no cells», and this page is named for the difference.
    """
    out = []
    for code in sorted({cell_lookup.norm_code(c) for c in codes if c} - {""}):
        c = cells.get(code)
        out.append({
            "cell_id":       c.id if c else None,
            "verifix_code":  code,
            "name_uz":       c.name_workshop_uz      if c else None,
            "name_uz_cyrl":  c.name_workshop_uz_cyrl if c else None,
            "name_ru":       c.name_workshop_ru      if c else None,
            "name_en":       c.name_workshop_en      if c else None,
            "leader_name":   leaders.get(c.leader_id) if c and c.leader_id else None,
            "manager_id":    c.manager_id if c else None,
            "manager_name":  units.get(c.manager_id) if c and c.manager_id else None,
        })
    return out


def _cell_snapshot(cell: Optional[Cell], leaders: dict) -> tuple:
    """(names dict, leader name) frozen onto a payload at filing time.

    Snapshotted rather than resolved at read time because a document has to go
    on describing the move it recorded: reassign the cell to another leader
    tomorrow and a register that re-resolved would rewrite who was told about
    a transfer that already happened. The names are stored as a raw
    ``{uz, uz_cyrl, ru, en}`` map and never as one chosen string — the reader
    picks their own language, and a baked word freezes the filer's.
    """
    if cell is None:
        return None, None
    names = {
        "uz":      cell.name_workshop_uz,
        "uz_cyrl": cell.name_workshop_uz_cyrl,
        "ru":      cell.name_workshop_ru,
        "en":      cell.name_workshop_en,
    }
    return names, (leaders.get(cell.leader_id) if cell.leader_id else None)


# ── GET /attendance ───────────────────────────────────────────────────────────

@router.get("/attendance")
def get_attendance(
    attend_date: str,
    manager_id: Optional[int] = None,
    caller=Depends(_require_cell_staff),
    db: Session = Depends(get_db),
):
    """The day's roster, cell by cell, for every cell this caller owns.

    The unit-level read (`staff.get_attendance`) demands a `manager_id` and
    answers with one unit's whole roster; here the roster IS the scope and the
    unit is only a narrowing the page offers. `manager_id` is therefore
    optional and, when present, is intersected with the scope rather than
    trusted — the parameter is typeable, and a supervisor filter must never
    become a way to read another plant's day.

    Two properties of the original read are preserved deliberately, because a
    re-implementation that drops either shows a different day for the same
    date. The **below-min fold**: a worker sent to a task whose split cleared
    two hours on NEITHER side is nobody's worker, so they come off the roster
    and their effective before-T hours are credited to ``extra_hours`` instead
    — dropping the fold shows people /staff hides AND loses their minutes. And
    **``extra_hours``** itself, the nameless rows nobody can select. Both are
    computed over the CELLS on screen rather than over whole units, so the
    total under the table describes the rows above it; a unit-wide sum on a
    page filtered to one cell is a number that cannot be checked against
    anything visible.
    """
    try:
        d = date.fromisoformat(attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    scope = caller_cells(db, caller)
    units = _visible_units(db, scope)

    base = _named_rows(db.query(Attendance).filter(Attendance.date == d))
    base = base.filter(_row_scope_clause(scope, caller))
    if manager_id is not None:
        # A unit the caller owns no cell in is not a narrowing, it is a request
        # for somebody else's day. Said out loud rather than answered empty.
        if units is not None and manager_id not in units \
                and manager_id != caller.get("role_id"):
            raise HTTPException(status_code=403, detail="Not allowed for this unit")
        base = base.filter(Attendance.manager_id == manager_id)

    rows = base.order_by(Attendance.verifix_code, Attendance.worker_name).all()

    row_units = sorted({r.manager_id for r in rows})
    pending_map = {}
    if row_units:
        for r in db.query(EditRequest).filter(
            EditRequest.manager_id.in_(row_units),
            EditRequest.date == d,
            EditRequest.status == "pending",
        ).all():
            pending_map[(r.manager_id, r.worker_name)] = r

    # → task documents that were actually APPLIED. Real doc types only: a test
    # document changed no row, so folding its workers off the roster would show
    # a move the attendance table never made.
    task_map: dict = {}
    below_min_eff: dict = {}
    if row_units:
        for ex in db.query(HrDocument).filter(
            HrDocument.doc_type == "people_exchange",
            HrDocument.manager_id.in_(row_units),
            HrDocument.date == d,
            HrDocument.status == "approved",
        ).all():
            pl = ex.payload or {}
            if pl.get("target_type") != "task":
                continue
            ttime = pl.get("transfer_time")
            for emp in pl.get("employees", []):
                wn = emp.get("worker_name")
                if not wn:
                    continue
                task_map[(ex.manager_id, wn)] = pl.get("task_name")
                if ttime:
                    plan = _compute_split(emp.get("snapshot") or {}, ttime, pl.get("return_time"))
                    if plan and max(plan["part1"], plan["part2"]) < MIN_MOVED_ZAGRUZKA_HOURS:
                        below_min_eff[(ex.manager_id, wn)] = plan["part1_eff"]

    cells_by_code = _cell_rows(db, {r.verifix_code for r in rows})
    leaders = _leader_names(db)
    units_by_id = _unit_names(db)

    # Nameless hours, scoped to the same cells the rows above came from — the
    # total under the table has to describe the table, not the unit behind it.
    extra_q = db.query(func.sum(Attendance.hours_worked)).filter(
        Attendance.date == d,
        or_(Attendance.worker_name.is_(None), Attendance.worker_name.in_(_NO_NAME)),
        Attendance.hours_worked.isnot(None),
        Attendance.hours_worked > 0,
        _coded(),
        code_clause(scope, Attendance.verifix_code),
    )
    if manager_id is not None:
        extra_q = extra_q.filter(Attendance.manager_id == manager_id)
    # func.sum over a Numeric column returns Decimal, which FastAPI will not
    # serialise — cast at the boundary, exactly as the unit-level read does.
    extra_hours = float(extra_q.scalar() or 0.0)

    workers = []
    for r in rows:
        key = (r.manager_id, r.worker_name)
        if key in below_min_eff:
            extra_hours += below_min_eff[key]
            continue
        code = cell_lookup.norm_code(r.verifix_code)
        cell = cells_by_code.get(code) if code else None
        names, leader_name = _cell_snapshot(cell, leaders)
        pr = pending_map.get(key)
        workers.append({
            "id":                r.id,
            "worker_name":       r.worker_name,
            "job_title":         r.job_title,
            "schedule":          r.schedule,
            "clock_in_out":      r.clock_in_out,
            "hours_worked":      float(r.hours_worked)      if r.hours_worked      is not None else None,
            "early_arrival_min": float(r.early_arrival_min) if r.early_arrival_min is not None else None,
            "effective_hours":   float(r.effective_hours)   if r.effective_hours   is not None else None,
            "verifix_code":      code or None,
            # The two facts that must never be used as proxies for each other:
            # a null code does not imply the brigadir, and the brigadir is the
            # one row on this page that can never be moved.
            "is_supervisor":     bool(r.is_supervisor),
            "manager_id":        r.manager_id,
            "manager_name":      units_by_id.get(r.manager_id),
            "cell": {
                "cell_id":     cell.id if cell else None,
                "code":        code or None,
                "names":       names,
                "leader_name": leader_name,
            } if code else None,
            "on_task":         task_map.get(key),
            "pending_request": {"id": pr.id, "changes": pr.changes,
                                "original": pr.original} if pr else None,
        })

    sup_ids = sorted(set(row_units) | set(units or ()))
    if units is None and manager_id is not None:
        sup_ids = sorted(set(sup_ids) | {manager_id})
    mgr = db.query(Manager).filter_by(id=manager_id).first() if manager_id else None
    return {
        "manager_id":   manager_id,
        "manager_name": mgr.name if mgr else None,
        "date":         attend_date,
        "workers":      workers,
        "cells":        _cell_catalog(db, {r.verifix_code for r in rows},
                                      cells_by_code, leaders, units_by_id),
        # The whole in-scope unit list, independent of the current narrowing —
        # a supervisor filter built from the visible rows alone would offer the
        # one unit already picked and nothing to switch back to.
        "supervisors":  [{"manager_id": u, "full_name": units_by_id.get(u)}
                         for u in sup_ids if u in units_by_id],
        "extra_hours":  round(float(extra_hours), 2),
    }


# ── GET /supervisors ──────────────────────────────────────────────────────────

@router.get("/supervisors")
def list_supervisors(caller=Depends(_require_cell_staff), db: Session = Depends(get_db)):
    """The units this caller may narrow to, for the page's supervisor filter.

    It exists because `/api/staff/supervisors` cannot serve this page: that
    endpoint re-implements its own door as «page `staff` or `daily`, AND role
    in (admin, shift-manager)», which refuses BOTH of this page's own audiences
    — a supervisor and a leader — and does it with a 403 on a control that is
    only ever a narrowing. A filter that answers «forbidden» for the people the
    page was built for is worse than no filter.

    Scoped through `cell_scope` like every other read here: admins get every
    live unit, everyone else gets the units their own cells belong to. An empty
    list is a real answer.
    """
    scope = caller_cells(db, caller)
    units = _visible_units(db, scope)
    q = db.query(Manager).filter(Manager.archived.is_(False))
    if units is not None:
        if not units:
            return []
        q = q.filter(Manager.id.in_(units))
    return [
        {"manager_id": m.id, "full_name": m.name, "shift": m.shift}
        for m in q.order_by(Manager.shift, Manager.name).all()
    ]


# ── GET /exchange-targets ─────────────────────────────────────────────────────

def _shift_of_unit(db: Session, manager_id: Optional[int]) -> Optional[int]:
    if not manager_id:
        return None
    m = db.query(Manager).filter_by(id=manager_id).first()
    return m.shift if m else None


def _sender_shifts(db: Session, caller: dict, scope: CellScope,
                   sender_cell: Optional[str], d: date) -> Optional[frozenset]:
    """The shift(s) a move may be filed ON. **Fails CLOSED.**

    ``None`` means «do not narrow» and is the ADMIN answer and nothing else —
    an admin may file across the whole plant and there is nobody above them to
    ask. Every other caller gets a SET, and an EMPTY set is a real answer that
    the caller must render as «nowhere to send anybody», never as «no filter».

    That distinction is the whole of this function, and it used to be the other
    way round. It returned a single ``Optional[int]``, and `None` — the admin's
    «do not narrow» — was also what came back when the caller owned no unit at
    all, when the named sender cell belonged to no unit, and when the caller's
    own units straddled both shifts. `exchange_targets` applies no scope filter
    of its own, so each of those answered a caller who owns nothing with the
    name and shift of every live unit on the platform. `cell_scope` fails
    closed on the code dimension; this is the same discipline on the shift one.

    A cell carries no shift of its own — it is reached through
    ``Cell.manager_id → Manager.shift``, the one place the dimension is
    attached — so a cell with no owning unit names no shift, and the answer
    falls back to the caller's own units rather than opening up.
    """
    if caller.get("role") == "admin":
        return None
    if sender_cell:
        cell = _cell_rows(db, [sender_cell]).get(cell_lookup.norm_code(sender_cell))
        if cell is not None and cell.manager_id:
            s = _shift_of_unit(db, cell.manager_id)
            return frozenset({s}) if s in (1, 2) else frozenset()
    if not scope.units:
        return frozenset()
    return frozenset(
        s for (s,) in db.query(Manager.shift).filter(
            Manager.id.in_(sorted(scope.units))).distinct().all()
        if s in (1, 2)
    )


@router.get("/exchange-targets")
def exchange_targets(
    attend_date: str,
    sender_cell: Optional[str] = None,
    caller=Depends(_require_cell_staff),
    db: Session = Depends(get_db),
):
    """Where a move may land: units on the SENDER'S shift, with their cells.

    Three rules decide the list, and each of them is a rule about data rather
    than about permission. A unit that has **closed** the date cannot receive
    anybody — its day is final. A unit whose verifix file has **not landed**
    cannot receive anybody either, because `upload_verifix` wipes
    `(manager, date)` wholesale and would destroy the transferred rows when it
    eventually runs; that is what `ExchangeTargetNoData` says at approval time
    and it is honoured here so the option is never offered in the first place.
    And a **cell** is offered only when it has attendance that date — the same
    reasoning one level down.

    The sender's own UNIT is deliberately still offered: a cell → cell move
    inside one brigade is the ordinary case on this page and the whole reason
    the unit-level «cannot exchange to the same unit» refusal is not reused.
    Only the sender CELL itself is removed, because a move into the cell you
    are standing in is not a move.
    """
    try:
        d = date.fromisoformat(attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    scope = caller_cells(db, caller)
    sender_norm = ""
    if sender_cell:
        # A sender cell arriving on the query string is typeable like any body
        # value: it decides which shift the whole list is drawn from.
        sender_norm = _assert_cell_allowed(scope, sender_cell, "sender_cell")

    shifts = _sender_shifts(db, caller, scope, sender_norm or None, d)
    tasks = [
        t.name for t in db.query(ExchangeTask)
        .filter(ExchangeTask.active.is_(True))
        .order_by(func.lower(ExchangeTask.name)).all()
    ]
    if shifts is not None and not shifts:
        # FAIL CLOSED. A non-admin caller whose shift cannot be established
        # owns no cell this move could come out of, and the unfiltered query
        # below would hand them the name and shift of every live unit on the
        # platform. The task list is the platform's own global one and is left
        # as it is — it names no unit and no person.
        return {"supervisors": [], "tasks": tasks}

    closed = {
        a.manager_id for a in db.query(DayApproval).filter(DayApproval.date == d).all()
    }
    has_data = {
        mid for (mid,) in _named_rows(
            db.query(Attendance.manager_id).filter(Attendance.date == d)
        ).distinct().all()
    }
    unit_codes: dict = {}
    for mid, code in _named_rows(
        db.query(Attendance.manager_id, Attendance.verifix_code).filter(
            Attendance.date == d, _coded())
    ).distinct().all():
        norm = cell_lookup.norm_code(code)
        if norm:
            unit_codes.setdefault(mid, set()).add(norm)

    cells_by_code = _cell_rows(db, {c for s in unit_codes.values() for c in s})
    leaders = _leader_names(db)

    q = db.query(Manager).filter(Manager.archived.is_(False))
    if shifts is not None:
        # `.in_`, not `==`: a caller whose own cells straddle both shifts has
        # two sender shifts and both are theirs. The empty case never reaches
        # here — it returned above.
        q = q.filter(Manager.shift.in_(sorted(shifts)))

    out = []
    for m in q.order_by(Manager.shift, Manager.name).all():
        if m.id in closed or m.id not in has_data:
            continue
        cells = []
        for code in sorted(unit_codes.get(m.id) or ()):
            # `same_code`, not `==`: the sender cell arrived on the query
            # string and was normalised against the CELL REGISTER, while this
            # code came off the day's ATTENDANCE — one cell, two spellings. A
            # bare comparison left the sender's own cell in its own unit's
            # option list, and the move into it was then refused by a rule
            # nothing on screen had stated.
            if same_code(code, sender_norm):
                continue
            c = cells_by_code.get(code)
            cells.append({
                "verifix_code": code,
                "name_uz":      c.name_workshop_uz      if c else None,
                "name_uz_cyrl": c.name_workshop_uz_cyrl if c else None,
                "name_ru":      c.name_workshop_ru      if c else None,
                "name_en":      c.name_workshop_en      if c else None,
                "leader_name":  leaders.get(c.leader_id) if c and c.leader_id else None,
            })
        # A unit whose only cell was the sender's own has nowhere left to put
        # anybody — offering it would reveal an empty second step.
        if not cells and unit_codes.get(m.id):
            continue
        out.append({"manager_id": m.id, "full_name": m.name,
                    "shift": m.shift, "cells": cells})

    return {"supervisors": out, "tasks": tasks}


# ── transfer clock ────────────────────────────────────────────────────────────

def _norm_transfer_time(ttype: Optional[str], raw) -> Optional[str]:
    """Canonical «HH:MM» for a transfer time T, or None.

    A deliberate twin of `staff._normalize_transfer_time` with ONE difference:
    that function takes a `caller` and honours the clock for admins and
    supervisors only, so a leader's T would be silently dropped and their
    document would move the whole day instead of half of it. Leaders file on
    this page, so the role gate is gone — and the WINDOW ARITHMETIC is the
    imported `_parse_hhmm` / `_fmt_hhmm`, never re-spelled: the clock formats
    the plant's uploads produce (`08.00`, `8-00`, `17:04 (8.43)`) are the
    subtlest thing in that file, and a second parser is a second answer.
    """
    if not raw or ttype not in ("supervisor", "task"):
        return None
    mins = _parse_hhmm(raw)
    return _fmt_hhmm(mins) if mins is not None else None


def _norm_return_time(ttype: Optional[str], transfer_time: Optional[str], raw) -> Optional[str]:
    """Canonical «HH:MM» for the return time R — the END of the away stint.

    R only means anything beside a T: it closes the carve-out `[T, R]`, and a
    return with nothing to return from would be stored and then read by
    `_compute_split` as a window opening at midnight."""
    if not raw or not transfer_time or ttype not in ("supervisor", "task"):
        return None
    mins = _parse_hhmm(raw)
    return _fmt_hhmm(mins) if mins is not None else None


# ── target resolution ─────────────────────────────────────────────────────────

def _unit_cell_codes(db: Session, manager_id: int, d: date) -> set:
    """Normalised codes a unit's NAMED attendance carries for a date."""
    return {
        cell_lookup.norm_code(code) for (code,) in _named_rows(
            db.query(Attendance.verifix_code).filter(
                Attendance.manager_id == manager_id,
                Attendance.date == d, _coded())
        ).distinct().all()
    } - {""}


def _resolve_cell_target(db: Session, caller: dict, d: date, sender_unit: int,
                         sender_cell: str, ttype: Optional[str],
                         target_manager_id: Optional[int], task_name: Optional[str],
                         target_cell: Optional[str]):
    """Validate a move's destination. Returns
    (ttype, target_manager_id, target_manager_name, task_name, target_cell).

    This is NOT `staff._resolve_exchange_target` and must not become it. That
    function refuses `target_manager_id == sender_id` outright — the guard that
    makes a unit-level page correct and this one impossible, since the commonest
    move here is cell → cell inside ONE brigade. The refusal it is replaced by
    is one level down: **`sender_cell != target_cell`**. Everything else the
    unit-level rule protects is kept verbatim — a real unit, its day still open,
    its verifix data already landed, and a destination cell that the receiving
    unit's own attendance actually names.

    The **shift** rule is enforced here rather than left to the picker: the
    option list is drawn for the sender's shift, and a body is typeable. An
    admin is exempt, because an admin filing across shifts is a deliberate act
    and there is nobody above them to ask.
    """
    if ttype not in ("supervisor", "task"):
        raise HTTPException(status_code=400, detail="target_type must be 'supervisor' or 'task'")

    if ttype == "task":
        name = (task_name or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="task_name is required")
        return ttype, None, None, name, None

    if not target_manager_id:
        raise HTTPException(status_code=400, detail="target_manager_id is required")
    target = db.query(Manager).filter_by(id=target_manager_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target supervisor not found")

    if caller.get("role") != "admin":
        sender_shift = _shift_of_unit(db, sender_unit)
        if sender_shift in (1, 2) and target.shift != sender_shift:
            raise HTTPException(
                status_code=400,
                detail="A transfer may only target a unit on the same shift")

    _assert_day_open(db, target.id, d)          # a closed day accepts nobody
    if not _unit_has_attendance(db, target.id, d):
        raise ExchangeTargetNoData()            # its upload would wipe the move

    codes = _unit_cell_codes(db, target.id, d)
    cell = cell_lookup.norm_code(target_cell) or None
    if codes:
        if not cell:
            raise HTTPException(status_code=400, detail="Select the receiving supervisor's cell")
        # `in_codes`, not `in`: the body's cell was normalised against the CELL
        # REGISTER and these came off the receiving unit's ATTENDANCE, so one
        # cell can arrive spelled «0028» and be listed as «28». A bare
        # membership test 404s on a destination the picker itself offered.
        if not in_codes(cell, codes):
            raise HTTPException(
                status_code=404,
                detail="Target cell not found in the receiving unit's attendance for this date")
    else:
        # A legacy day whose upload carried no codes: the destination is the
        # unit, exactly as before cells existed. Refusing here would make the
        # page unusable on days nobody can retro-fit.
        cell = None

    # The one refusal that replaces /staff's «not the same unit»: a move into
    # the cell you are standing in is not a move. Compared through `same_code`
    # because the two sides come from two registers that spell one cell two
    # ways — an `==` here is a self-move the platform accepts.
    if cell and same_code(cell, sender_cell):
        raise HTTPException(status_code=400,
                            detail="Cannot exchange workers into the same cell")
    return ttype, target.id, target.name, None, cell


# ── payload ───────────────────────────────────────────────────────────────────

def _build_payload(db: Session, *, sender_unit: int, sender_unit_name: Optional[str],
                   sender_cell: str, d: date, target_type: str,
                   target_manager_id: Optional[int], target_manager_name: Optional[str],
                   task_name: Optional[str], rows: List[Attendance],
                   transfer_time: Optional[str], return_time: Optional[str],
                   target_cell: Optional[str], leaders: dict) -> dict:
    """The cell-level exchange payload — this router's OWN builder.

    It cannot be `staff._build_exchange_payload`, and the reason is worth
    stating because the failure is silent: that function REBUILDS the payload
    from scratch on every `update_document`, so any key it does not return is
    DROPPED on the first edit. `sender_cell`, the two cell-name snapshots, both
    leader names and the shift would survive filing and vanish the moment
    somebody changed one worker — leaving a register whose rows had no origin
    and a document nothing could scope.

    It also resolves each employee from a ROW it was handed rather than by
    re-querying `(manager_id, date, worker_name)`. That lookup takes
    `.first()`, and on a cell-level page one name can legitimately hold two
    rows in two cells of one unit: re-querying would pick whichever row the
    database happened to return and file the move against the wrong cell, with
    no error anywhere.

    Every code stored here is normalised, because `_scope_documents` compares
    them as JSONB text: a document written «28» is invisible to a leader whose
    scope says «0028».
    """
    emp_rows = []
    for att in rows:
        row = {
            "worker_name":      att.worker_name,
            "old_manager_id":   att.manager_id,
            "old_role":         att.job_title or "",
            # The worker's OWN cell — the dry run trusts this per-worker value
            # over the document's group, and a cancel restores from it.
            "old_verifix_code": cell_lookup.norm_code(att.verifix_code) or None,
        }
        # A full snapshot is what makes a cancel restorable and what the split
        # is computed against; a plain unit move needs neither.
        if target_type == "task" or transfer_time:
            row["snapshot"] = {
                "job_title":         att.job_title,
                "schedule":          att.schedule,
                "clock_in_out":      att.clock_in_out,
                "hours_worked":      float(att.hours_worked)      if att.hours_worked      is not None else None,
                "early_arrival_min": float(att.early_arrival_min) if att.early_arrival_min is not None else None,
                "effective_hours":   float(att.effective_hours)   if att.effective_hours   is not None else None,
            }
        emp_rows.append(row)

    cells = _cell_rows(db, [sender_cell, target_cell])
    s_names, s_leader = _cell_snapshot(cells.get(cell_lookup.norm_code(sender_cell)), leaders)
    t_names, t_leader = _cell_snapshot(
        cells.get(cell_lookup.norm_code(target_cell)) if target_cell else None, leaders)

    return {
        "target_type":         target_type,
        "target_manager_id":   target_manager_id,
        "target_manager_name": target_manager_name,
        "task_name":           task_name,
        "target_cell":         target_cell,
        "target_cell_names":   t_names,
        "target_leader_name":  t_leader,
        # The cell the people LEFT. Null only on a day whose upload carried no
        # codes at all — which is the one case this page cannot invent.
        "sender_cell":         cell_lookup.norm_code(sender_cell) or None,
        "sender_cell_names":   s_names,
        "sender_leader_name":  s_leader,
        "sender_manager_name": sender_unit_name,
        "shift":               _shift_of_unit(db, sender_unit),
        "transfer_time":       transfer_time,
        "return_time":         return_time,
        "employees":           emp_rows,
    }


def _build_role_payload(rows: List[Attendance], new_role: str, sender_cell: str,
                        db: Session, sender_unit: int, sender_unit_name: Optional[str],
                        leaders: dict) -> dict:
    """A role change, carrying the same cell identity as an exchange.

    It moves nobody — it rewrites `job_title` on rows that stay exactly where
    they are — but it is filed FROM a cell and read in the same register, so it
    carries the same origin keys. Without them the register would show a row
    with no cell beside rows that have one, and `_scope_documents` (which finds
    a leader's documents through `sender_cell`) could not reach it at all.
    """
    cells = _cell_rows(db, [sender_cell])
    s_names, s_leader = _cell_snapshot(cells.get(cell_lookup.norm_code(sender_cell)), leaders)
    return {
        "new_role": new_role,
        "sender_cell":         cell_lookup.norm_code(sender_cell) or None,
        "sender_cell_names":   s_names,
        "sender_leader_name":  s_leader,
        "sender_manager_name": sender_unit_name,
        "shift":               _shift_of_unit(db, sender_unit),
        "employees": [
            {"worker_name": a.worker_name,
             "old_role": a.job_title or "",
             "old_manager_id": a.manager_id,
             "old_verifix_code": cell_lookup.norm_code(a.verifix_code) or None}
            for a in rows
        ],
    }


# ── authorization ─────────────────────────────────────────────────────────────

def _native_can_approve_cell_doc(doc: HrDocument, caller: dict, db: Session) -> bool:
    """The approval authority the caller's ROLE carries on its own — no grants.

    Three authorities, and the shape of the list is the decision:

      * an **admin**, always;
      * the **RECEIVING supervisor** — the brigadir being handed the people,
        the one person whose day the move actually changes. A cell → cell move
        inside ONE brigade is covered by the same test, because there the
        receiving unit and the sending unit are the same id;
      * **any shift-manager** whose shift matches the sending unit's OR the
        receiving unit's. Both, not just the sender's: an admin may file across
        shifts, and the unit-level notifier's sender-only rule is exactly why a
        cross-shift transfer's receiving shift-manager was never told. It is
        also the only authority a `→ task` document has besides an admin, since
        such a document names no receiving supervisor at all.

    The receiving **LEADER cannot approve**, and that is enforced twice over:
    not here, and — decisively — by never sending them an `ApprovalNotice`. On
    this platform the notice IS the permission to tap
    (`telegram_bot._approval_callback` gates every non-admin on
    `recipient_has_notice_for_code`), so an approval CARD mailed to a leader
    would BE approve rights however this function answered. They get a plain
    informational DM instead.
    """
    role = caller.get("role")
    if role == "admin":
        return True
    payload = doc.payload or {}

    if (role == "supervisor" and caller.get("role_id")
            and payload.get("target_manager_id") == caller["role_id"]):
        return True

    if role == "shift-manager":
        sm = _sm_shift(db, caller.get("role_id"))
        if sm in (1, 2):
            return sm in {_shift_of_unit(db, doc.manager_id),
                          _shift_of_unit(db, payload.get("target_manager_id"))}
    return False


def _granted_over_cell_doc(doc: HrDocument, caller: dict, db: Session) -> bool:
    """Does a `staff.documents.approve` grant reach THIS document?

    Deliberately not `staff._granted_over_doc`: that helper resolves "own"
    through `capabilities.profile_unit_ids`, which answers ``None`` — «no
    restriction» — for a leader, so an own-scoped grant handed to a leader
    silently becomes platform-wide, for exactly the role this page adds. Here
    "own" is the caller's own CELL scope, so a grant can never reach further
    than the rows the person can already read.

    Both ends count: the grantee handles a transfer that touches one of their
    cells whether the people are leaving it or arriving in it.
    """
    scope_val = cap_scope(db, caller, CAP_DOCUMENTS_APPROVE)
    if scope_val is None:
        return False
    if scope_val == "all":
        return True
    payload = doc.payload or {}
    scope = caller_cells(db, caller)
    if scope.all:
        return True
    return (allows(scope, payload.get("sender_cell"))
            or allows(scope, payload.get("target_cell")))


def _can_approve_cell_doc(doc: HrDocument, caller: dict, db: Session) -> bool:
    """Approval authority, whole. One approval is always enough.

    The role's own authority, plus — additively — anyone granted
    ``staff.documents.approve``. The grant never REMOVES an authority: it is
    the mechanism for «this person handles transfers» without making them an
    admin.

    **Except for a LEADER, who is refused here before either ladder is asked.**
    A leader is never an approver on this page — they are told a move touches
    their cell and that is all — and the refusal has to be stated in THIS
    function because it is the one both doors read: the router's own
    approve/cancel/delete routes, and `approvals._decide_hr_document`, which
    settles an inline card through exactly this predicate. The Telegram side
    also refuses them structurally (they are never sent an `ApprovalNotice`,
    and on this platform the notice IS the permission to tap), so without the
    refusal here the API granted a power the card could not, to the same person
    over the same document — the two doors disagreeing about one person.

    `_native_can_approve_cell_doc` could never answer True for a leader, but
    `_granted_over_cell_doc` could: an own-scoped ``staff.documents.approve``
    resolves «own» to the caller's own CELL scope, and the receiving leader's
    cell is on the document by construction. So the grant silently made the
    receiving leader an approver of every transfer into their own cell.
    Withdrawing a draft they FILED themselves is a different act and still
    theirs — see `_may_reject`, which keeps the creator's door open.
    """
    if (caller or {}).get("role") == "leader":
        return False
    return (_native_can_approve_cell_doc(doc, caller, db)
            or _granted_over_cell_doc(doc, caller, db))


def _via_grant(doc: HrDocument, caller: dict, db: Session) -> bool:
    """True when the ONLY thing authorising this action is the grant — the
    trigger for the admin warning DM. Evaluate BEFORE the mutation: it answers
    «what authorised this», and after a status change the answer differs.

    A LEADER is False by the same rule `_can_approve_cell_doc` states: their
    grant authorises nothing here, so it can never be what authorised an
    action."""
    if (caller or {}).get("role") == "leader":
        return False
    return (not _native_can_approve_cell_doc(doc, caller, db)
            and _granted_over_cell_doc(doc, caller, db))


def _is_creator(doc: HrDocument, caller: dict) -> bool:
    """Was this document filed by the caller's PROFILE?

    A document belongs to the unit that filed it, and for a supervisor the unit
    IS the profile — so every account working as that brigadir may edit or
    withdraw its drafts. A leader's profile is their own, so their documents
    are compared by account."""
    if (caller.get("role") == "supervisor" and caller.get("role_id")
            and doc.manager_id == caller["role_id"]):
        return True
    return doc.created_by_telegram_id == int(caller["sub"])


def _may_reject(doc: HrDocument, caller: dict, db: Session) -> bool:
    """Rejecting a draft is withdrawing it when it is yours, and deciding it
    when it is not — so the door is the union of both.

    Deliberately NOT `role in ("admin", "shift-manager")`. That bare tuple
    carries no shift and no cell, while `_scope_documents` hands every document
    on the platform to a `page.view.staff-cell` grant at "all" — a READ grant.
    A shift-manager holding it could therefore reject, and then permanently
    delete, a document filed on the OTHER shift. `_can_approve_cell_doc` is the
    same predicate `approve` and `cancel` already use, and it bounds a
    shift-manager to the shifts the move actually touches; the omission here
    was the only thing that made the page grant a write authority.
    """
    return (_can_approve_cell_doc(doc, caller, db)
            or _is_creator(doc, caller))


# ── notifications ─────────────────────────────────────────────────────────────

def _cell_leader_profile(db: Session, code: Optional[str]) -> Optional[str]:
    """The profile key of the leader who owns a cell, or None.

    There is no «notify the leader of this cell» helper anywhere on the
    platform — `_notify_all_parties` addresses admins, one shift's
    shift-managers and one supervisor, and knows nothing about leaders — so
    this composes one from the identity the register already holds.

    The address is `Cell.leader_id`, deliberately NOT
    `identity.viewer_leader_profile_ids`: that helper answers a READ-scope
    question and returns SEVERAL profile rows for one human (name-folded
    duplicates), so using it to ADDRESS a message DMs the same person once per
    duplicate record."""
    norm = cell_lookup.norm_code(code)
    if not norm:
        return None
    cell = _cell_rows(db, [norm]).get(norm)
    if cell is None or not cell.leader_id:
        return None
    return _profile_key("leader", cell.leader_id)


def _doc_parties(db: Session, doc: HrDocument) -> list:
    """Every PROFILE this document's event is addressed to, in a stable order.

    Profiles, never accounts: one bell row per profile means a unit held by
    three people shows the notice once, and an unclaimed profile inherits it
    when somebody claims it. Building the set out of registrations instead is
    how a profile with three holders got three identical bell rows.

    Who is on the list, and why each of them is:
      * the SENDING supervisor — people left their day;
      * the RECEIVING supervisor — people arrived on theirs;
      * the RECEIVING leader — the cell that has to make room, informational
        only, and never through an approval card (see `_can_approve_cell_doc`);
      * the shift-manager(s) of BOTH shifts touched — the sender's and the
        receiver's, because an admin may file across them and the unit-level
        notifier only ever knew about the sender's;
      * every admin.

    The FILER is deliberately NOT here. On a decision they must be told — it is
    the answer to their own document — but the document does not record which
    PROFILE filed it (a leader files under their own, a supervisor under their
    unit's), so there is no profile key to add. `_notify_cell_doc` addresses
    their account directly, and only when nothing on this list already did.
    """
    payload = doc.payload or {}
    profiles: list = []

    def add(p):
        if p and p not in profiles:
            profiles.append(p)

    add(_profile_key("supervisor", doc.manager_id))
    if payload.get("target_type") == "supervisor" and payload.get("target_manager_id"):
        add(_profile_key("supervisor", payload["target_manager_id"]))
    add(_cell_leader_profile(db, payload.get("target_cell")))

    shifts = {_shift_of_unit(db, doc.manager_id),
              _shift_of_unit(db, payload.get("target_manager_id"))}
    for sh in sorted(s for s in shifts if s in (1, 2)):
        for rid in _sm_role_ids_for_shift(db, sh):
            add(_profile_key("shift-manager", rid))

    for a in db.query(Admin).all():
        if a.profile_id:
            add(_profile_key("admin", a.profile_id))

    return profiles


# ── the TEST chip, on the channel people act on ───────────────────────────────
#
# The approval CARD and the register row have said «🧪 TEST» since the page
# shipped; the bell row and the plain DM did not — and the plain DM is the
# channel the receiving brigadir actually reads and acts on. So a rehearsal
# arrived in their chat word for word identical to a transfer that really took
# their people, which is the one confusion the whole sandbox exists to prevent.
#
# It has to be a TEMPLATE and not a word pushed into `params`, because a bell
# row re-renders at VIEW time in the VIEWER's language: a «TEST» baked into a
# param is frozen in the filer's language for good. `_NOTIF_STRINGS` is the
# only renderer-side vocabulary there is, so these three keys join it — in all
# FOUR languages, because a key missing from `uz_cyrl` does not show the key,
# it silently renders Latin Uzbek at a Cyrillic reader.
#
# Registered rather than written into `routers/staff.py`: the table is that
# module's, this feature is this one's, and `main.py` imports this router at
# boot so the keys are present in every process that renders a bell row.
# `setdefault` — never overwrite a key `staff` itself defines.
_TEST_NOTIF_STRINGS: dict = {
    "worker_exchange_test_created": {
        "uz": ("🧪 TEST · {actor_name} xodim almashinuvi yaratdi",
               "{count} xodim → {target} | Sana: {date}\n"
               "🧪 TEST hujjat — hech qanday davomat yozuvi ko'chirilmaydi"),
        "uz_cyrl": ("🧪 ТЕСТ · {actor_name} ходим алмашинуви яратди",
                    "{count} ходим → {target} | Сана: {date}\n"
                    "🧪 ТЕСТ ҳужжат — ҳеч қандай давомат ёзуви кўчирилмайди"),
        "ru": ("🧪 ТЕСТ · Новый обмен сотрудниками от {actor_name}",
               "{count} сотр. → {target} | Дата: {date}\n"
               "🧪 ТЕСТ-документ — ни одна запись посещаемости не переносится"),
        "en": ("🧪 TEST · New worker exchange from {actor_name}",
               "{count} worker(s) → {target} | Date: {date}\n"
               "🧪 TEST document — no attendance row is moved"),
    },
    "worker_exchange_test_approved": {
        "uz": ("🧪 TEST · Xodim almashinuvi tasdiqlandi",
               "{count} xodim → {target} | Sana: {date}\n"
               "🧪 TEST hujjat — hech qanday davomat yozuvi ko'chirilmadi"),
        "uz_cyrl": ("🧪 ТЕСТ · Ходим алмашинуви тасдиқланди",
                    "{count} ходим → {target} | Сана: {date}\n"
                    "🧪 ТЕСТ ҳужжат — ҳеч қандай давомат ёзуви кўчирилмади"),
        "ru": ("🧪 ТЕСТ · Обмен сотрудниками одобрен",
               "{count} сотр. → {target} | Дата: {date}\n"
               "🧪 ТЕСТ-документ — ни одна запись посещаемости не перенесена"),
        "en": ("🧪 TEST · Worker exchange approved",
               "{count} worker(s) → {target} | Date: {date}\n"
               "🧪 TEST document — no attendance row was moved"),
    },
    "worker_exchange_test_cancelled": {
        "uz": ("🧪 TEST · Xodim almashinuvi bekor qilindi",
               "{count} xodim → {target} | Sana: {date}\n"
               "🧪 TEST hujjat — hech qanday davomat yozuvi ko'chirilmadi"),
        "uz_cyrl": ("🧪 ТЕСТ · Ходим алмашинуви бекор қилинди",
                    "{count} ходим → {target} | Сана: {date}\n"
                    "🧪 ТЕСТ ҳужжат — ҳеч қандай давомат ёзуви кўчирилмади"),
        "ru": ("🧪 ТЕСТ · Обмен сотрудниками отменён",
               "{count} сотр. → {target} | Дата: {date}\n"
               "🧪 ТЕСТ-документ — ни одна запись посещаемости не перенесена"),
        "en": ("🧪 TEST · Worker exchange cancelled",
               "{count} worker(s) → {target} | Date: {date}\n"
               "🧪 TEST document — no attendance row was moved"),
    },
}
for _k, _v in _TEST_NOTIF_STRINGS.items():
    staff._NOTIF_STRINGS.setdefault(_k, _v)

# real key → its TEST twin. The params are identical, so a document that turns
# out not to be a test simply keeps the key it always had.
_TEST_NKEY = {
    "worker_exchange_created":   "worker_exchange_test_created",
    "worker_exchange_approved":  "worker_exchange_test_approved",
    "worker_exchange_cancelled": "worker_exchange_test_cancelled",
}


def _notify_cell_doc(db: Session, doc: HrDocument, event: str, actor_tg_id: int,
                     *, admin_dm: bool = True) -> None:
    """Tell everyone the document concerns, once each, in their own language.

    Composed out of `notify_profile` rather than out of `_notify_all_parties`:
    that composite returns None, so a caller that also notifies a leader and a
    receiving supervisor cannot dedupe against it and a person holding two of
    the addressed profiles is DMed twice. Here the `dmed` set is threaded
    through every call, so one human gets at most one DM however many of these
    profiles they hold.

    Text is never composed here. The bell stores an `nkey` plus RAW params and
    re-renders at VIEW time in the viewer's language — bake a translated word
    into `params` and it is frozen in the filer's language forever. The
    existing `worker_exchange_*` templates are reused deliberately: a document
    filed from a cell is still a worker exchange, and a fifth template saying
    the same sentence is a fifth place a translation can go missing.

    A SANDBOX document takes the `_TEST_NKEY` twin of that template and nothing
    else changes — same params, same recipients, same dedupe. The chip has to
    be in the TEMPLATE for exactly the reason the paragraph above gives, and it
    has to be here at all because this is the channel the receiving brigadir
    acts on: the approval card and the register row already said «TEST», and
    the DM in their chat did not.

    Ghost Mode needs no branch: `notify_profile` and `_notify` both return at
    the `notifications_suppressed()` chokepoint, so a suppressed run writes
    nothing and still applies.
    """
    payload = doc.payload or {}
    nkey = {
        "created":   "worker_exchange_created",
        "approved":  "worker_exchange_approved",
        "cancelled": "worker_exchange_cancelled",
    }.get(event, "worker_exchange_created")
    # CUT-OVER: off the DOC_TYPE, never off SANDBOX — after the flip the
    # documents already written are still rehearsals and must go on saying so,
    # while a new real one takes the plain template with no edit here.
    if cell_exchange.is_test(doc.doc_type):
        nkey = _TEST_NKEY.get(nkey, nkey)
    params = {
        "actor_name": doc.created_by_name or "",
        "count":      len(payload.get("employees") or []),
        "target":     _exchange_target_label(payload),
        "date":       doc.date,
    }

    # Admins receive the rich approve/reject card on creation, so their plain
    # DM is withheld while their bell row is still written — the same split
    # `_notify_all_parties(admin_dm=False)` makes on /staff.
    admin_accounts = {a.telegram_id for a in db.query(Admin).all()} if not admin_dm else set()

    dmed: set = set()
    for prof in _doc_parties(db, doc):
        skip = set(dmed)
        if prof.startswith("admin:"):
            skip |= admin_accounts
        try:
            dmed |= notify_profile(db, prof, nkey, params,
                                   exclude_account=actor_tg_id, skip_accounts=skip)
        except Exception:
            logger.exception("staff-cells: notify_profile failed for %s (doc %s)", prof, doc.id)

    # The filer, on a decision. Their profile is not recorded on the document
    # (a leader files under their own, a supervisor under their unit's), so the
    # account is addressed directly — and only when nothing above already
    # reached it, which is the ordinary case for a supervisor filing their own.
    if (event != "created" and doc.created_by_telegram_id
            and doc.created_by_telegram_id != actor_tg_id
            and doc.created_by_telegram_id not in dmed):
        _notify(db, doc.created_by_telegram_id, type="info", nkey=nkey, params=params)


# ── serialisation ─────────────────────────────────────────────────────────────

def _serialize(doc: HrDocument, mgr_names: dict, detailed: bool = False) -> dict:
    """The unit-level document shape plus everything the cell page reads.

    `staff._serialize_doc` is reused rather than re-spelled so the two
    registers can never disagree about a status, a count or a target; the keys
    added on top are the ones only a cell-level document has.
    """
    payload = doc.payload or {}
    out = _serialize_doc(doc, mgr_names.get(doc.manager_id), detailed=detailed)
    out.update({
        "manager_name":        mgr_names.get(doc.manager_id),
        "sender_cell":         payload.get("sender_cell"),
        "sender_cell_names":   payload.get("sender_cell_names"),
        "sender_leader_name":  payload.get("sender_leader_name"),
        "sender_manager_name": payload.get("sender_manager_name") or doc.supervisor_name,
        "target_leader_name":  payload.get("target_leader_name"),
        "shift":               payload.get("shift"),
        # The chip's own fact, off the doc_type and never off SANDBOX: after
        # the cut-over the constant describes new documents while these stay
        # what they were, and a chip that vanished on deploy day would relabel
        # history.
        "is_test":             cell_exchange.is_test(doc.doc_type),
        "dry_run":             payload.get("dry_run"),
    })
    return out


# ── GET /documents ────────────────────────────────────────────────────────────

@router.get("/documents")
def list_documents(caller=Depends(_require_cell_staff), db: Session = Depends(get_db)):
    """This page's register — its own documents, from both ends of the move."""
    rows = _sandbox_clause(
        _scope_documents(db.query(HrDocument), caller, db)
    ).order_by(HrDocument.created_at.desc()).all()
    mgr_names = _unit_names(db)
    return {"documents": [_serialize(d, mgr_names) for d in rows]}


@router.get("/documents/pending-count")
def documents_pending_count(caller=Depends(_require_cell_staff), db: Session = Depends(get_db)):
    """The badge. It counts exactly what the Approvals tab lists — this page's
    drafts — and nothing from /staff: two badges over one number is how the
    sidebar and the tab silently drifted apart once already."""
    n = _sandbox_clause(
        _scope_documents(db.query(HrDocument), caller, db)
    ).filter(HrDocument.status == "draft").count()
    return {"count": n}


@router.get("/documents/{doc_id}")
def get_document(doc_id: int, caller=Depends(_require_cell_staff), db: Session = Depends(get_db)):
    doc = _get_doc(doc_id, caller, db)
    return _serialize(doc, _unit_names(db), detailed=True)


# ── POST /documents ───────────────────────────────────────────────────────────

class EmployeeRef(BaseModel):
    """ONE roster row, named the way the roster names it.

    A bare worker NAME does not identify a row on this page and never did.
    The roster spans several cells and, for a shift-manager or an admin,
    several units, and namesakes are ordinary in this data — so a selection
    sent as names was re-expanded server-side across every in-scope row those
    names hold, and one tick filed people the operator never chose, each into
    a document named for their OWN cell. The page has always known which rows
    were ticked; this is the shape that lets it say so.

    ``manager_id`` and ``verifix_code`` are OPTIONAL, which keeps the old
    bare-string body working — but a bare name is no longer re-expanded: it is
    accepted only while it resolves to exactly one row identity, and refused
    with a 409 naming the collision otherwise (see :func:`_resolve_selection`).
    Neither field is ever trusted as authority: they NARROW the caller's own
    in-scope rows and are then intersected with `cell_scope` exactly as before,
    so naming somebody else's row reaches a 403, never their day.
    """
    worker_name:  str
    manager_id:   Optional[int] = None
    verifix_code: Optional[str] = None


class DocCreateBody(BaseModel):
    doc_type:    str = "people_exchange"
    attend_date: str
    # Either shape: `["Ivanov I."]` (legacy) or
    # `[{"worker_name": …, "manager_id": …, "verifix_code": …}]`.
    employees:   List[Union[EmployeeRef, str]]
    # role_change
    new_role:    Optional[str] = None
    # people_exchange
    target_type:       Optional[str] = None      # "supervisor" | "task"
    target_manager_id: Optional[int] = None
    task_name:         Optional[str] = None
    target_cell:       Optional[str] = None
    transfer_time:     Optional[str] = None      # "HH:MM"
    return_time:       Optional[str] = None      # "HH:MM"
    # Deliberately NO manager_id and NO sender_cell: both are DERIVED from the
    # selected workers' own attendance rows. A body that named them would be a
    # body that could name somebody else's.


def _refs(entries) -> List[EmployeeRef]:
    """The body's ``employees`` in ONE shape, whichever of the two it arrived in.

    Pydantic hands back an :class:`EmployeeRef` for an object and a plain
    ``str`` for the legacy shape; both become a ref, and a blank name is
    dropped rather than resolved to every nameless row on the day.

    A raw MAPPING is accepted as the object shape too. It is not what the
    endpoint receives — the model has already parsed the body — but this
    function is reachable from anything holding a list, and ``str({...})``
    would turn a row identity into a worker name nobody has, filed as a 400
    quoting a Python dict at an operator."""
    out: List[EmployeeRef] = []
    for e in entries or []:
        if isinstance(e, EmployeeRef):
            ref = e
        elif isinstance(e, Mapping):
            ref = EmployeeRef(worker_name=str(e.get("worker_name") or ""),
                              manager_id=e.get("manager_id"),
                              verifix_code=e.get("verifix_code"))
        else:
            ref = EmployeeRef(worker_name=str(e or ""))
        name = (ref.worker_name or "").strip()
        if name:
            out.append(EmployeeRef(worker_name=name, manager_id=ref.manager_id,
                                   verifix_code=ref.verifix_code))
    return out


def _row_identity(r: Attendance) -> tuple:
    """THE identity of one roster row: unit + cell + name. The grouping key,
    the selection key the page ticks, and what an :class:`EmployeeRef` names."""
    return (r.manager_id, cell_lookup.norm_code(r.verifix_code), r.worker_name)


def _resolve_selection(db: Session, caller: dict, scope: CellScope, d: date,
                       entries) -> dict:
    """Resolve each SELECTED ROW and group the result by its sender cell.

    This is where the page's one Save becomes N documents, and it is where the
    namesake bug lived. The selection used to arrive as bare NAMES, and every
    name was re-expanded across every in-scope attendance row that held it —
    so a roster spanning several cells, where namesakes are ordinary, filed
    people nobody had ticked, each into a document named for their own cell.
    The operator saw «3 xodim» on screen and five in the register.

    An entry now names a ROW — worker plus unit plus cell (:class:`EmployeeRef`)
    — and is resolved to exactly the rows that identity names. **Nothing is ever
    expanded.** The old bare-name shape is still accepted, because the endpoint
    is reachable without the page, but it is no longer re-expanded either: a
    PARTLY named entry — a bare name, or a name plus only one of the two
    fields — is resolved only while it names ONE row identity on that date,
    and one holding two is refused with a **409 naming the collision** so the
    caller re-sends it with its unit and cell. Answering the ambiguity
    silently — either by taking one row or by taking them all — is the bug,
    and «name plus unit» over two of that unit's cells is the same bug in
    miniature.

    The refusals stay distinct, and none of them is a silent drop: an entry
    with no attendance row at all is a 400 («no record»), a namesake collision
    is a 409, and a row the caller's cell scope does not reach — or the
    brigadir's own cell-less row, which nothing on this page may move — is a
    403 («outside your cells»). Dropping any of them quietly is how an operator
    files three of the five people they selected and finds out a shift later.

    ``manager_id`` / ``verifix_code`` on a ref carry no authority: they only
    NARROW the rows the name already holds, and every surviving row is then put
    through `cell_scope.allows` exactly as before. Naming somebody else's row
    reaches the 403; it never reaches their day.
    """
    refs = _refs(entries)
    if not refs:
        raise HTTPException(status_code=400, detail="Select at least one employee")

    rows = _named_rows(db.query(Attendance).filter(
        Attendance.date == d,
        Attendance.worker_name.in_(sorted({r.worker_name for r in refs})))).all()
    by_name: dict = {}
    for r in rows:
        by_name.setdefault(r.worker_name, []).append(r)

    def _movable(r) -> bool:
        # The brigadir's own row carries no cell and is the one row on this
        # page that can never be moved — `verifix_code IS NULL` does not imply
        # `is_supervisor`, so both are tested.
        return bool(r.verifix_code) and not r.is_supervisor

    def _label(ref: EmployeeRef) -> str:
        cell = cell_lookup.norm_code(ref.verifix_code)
        return f"{ref.worker_name} ({cell})" if cell else ref.worker_name

    missing: list = []
    ambiguous: list = []
    refused: list = []
    groups: dict = {}
    seen_refs: set = set()
    taken: set = set()

    for ref in refs:
        key = (ref.worker_name, ref.manager_id, cell_lookup.norm_code(ref.verifix_code))
        if key in seen_refs:
            continue
        seen_refs.add(key)

        named = by_name.get(ref.worker_name) or []
        if ref.manager_id is not None:
            named = [r for r in named if r.manager_id == ref.manager_id]
        if key[2]:
            named = [r for r in named if same_code(r.verifix_code, key[2])]
        if not named:
            missing.append(_label(ref))
            continue

        movable = [r for r in named if _movable(r)]
        if not movable:
            refused.append(_label(ref))
            continue
        if (ref.manager_id is None or not key[2]) \
                and len({_row_identity(r) for r in movable}) > 1:
            # An entry that does not name BOTH the unit and the cell, over more
            # than one row identity: a bare name held by two people, or a name
            # plus a unit that stands in two of its cells. Never expanded,
            # never narrowed by guesswork — named back at the caller. A ref
            # that DOES name both cannot reach here, because every row it
            # matched carries the same (unit, cell, name) by construction.
            ambiguous.append("%s → %s" % (
                ref.worker_name,
                ", ".join(sorted({f"#{r.manager_id}/{cell_lookup.norm_code(r.verifix_code)}"
                                  for r in movable}))))
            continue

        out_of_scope = [r for r in movable if not allows(scope, r.verifix_code)]
        if out_of_scope:
            refused.append(_label(ref))
            continue
        for r in movable:
            if r.id in taken:
                continue
            taken.add(r.id)
            groups.setdefault(_row_identity(r)[:2], []).append(r)

    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"No attendance record on this date for: {', '.join(sorted(missing)[:5])}")
    if ambiguous:
        raise HTTPException(
            status_code=409,
            detail="This name is held by more than one roster row on this date — "
                   "re-send it with its unit and cell: "
                   f"{'; '.join(sorted(ambiguous)[:5])}")
    if refused:
        raise HTTPException(
            status_code=403,
            detail=f"Outside your cells (or not movable): {', '.join(sorted(refused)[:5])}")
    if not groups:
        raise HTTPException(status_code=400, detail="Select at least one employee")
    return groups


@router.post("/documents", status_code=201)
def create_documents(body: DocCreateBody, caller=Depends(_require_cell_staff),
                     db: Session = Depends(get_db)):
    """File one document per SENDER CELL, in one transaction.

    The body names no origin. Every worker is resolved to their own attendance
    row, the selection is grouped by the cell those rows carry, and each group
    becomes its own document — so a document always describes a move out of
    exactly one cell and the register, the notification and the dry run can all
    name a single origin. The response says what was written:
    `{"documents": [{"id", "sender_cell", "count"}], "count": N}`.

    **An admin's own filing IS the approval** — for both document types, at
    creation, immediately. There is nobody above an admin to ask, so a draft
    waiting on its author's second tap decides nothing; Ghost Mode already
    auto-approved for exactly that reason. The two branches differ ONLY in
    whether anyone is told: Ghost Mode is silent by definition, an ordinary
    admin filing is announced as a DONE deed, and neither sends an
    approve/reject card because there is nothing left to decide. That also
    means `STALE_APPROVE_DAYS` bites at CREATE time on the admin path — an
    admin back-filing a month-old day is refused the whole document rather
    than left holding one that can never be posted.

    Everything is committed once, and every Telegram message goes out AFTER
    that commit: a DM is not transactional, so one sent mid-transaction
    survives a rollback and is re-sent by every retry.
    """
    kind = body.doc_type
    if kind in cell_exchange.TEST_DOC_TYPES:
        kind = cell_exchange.REAL_OF[kind]
    if kind not in ("people_exchange", "role_change"):
        raise HTTPException(status_code=400, detail="Unsupported document type")

    try:
        d = date.fromisoformat(body.attend_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    scope = caller_cells(db, caller)
    groups = _resolve_selection(db, caller, scope, d, body.employees)

    is_admin = caller.get("role") == "admin"
    ghost = notifications_suppressed()
    auto = is_admin or ghost
    if auto and d and (date.today() - d).days > STALE_APPROVE_DAYS:
        # The admin path posts on the spot, so the staleness ceiling has to be
        # asked BEFORE anything is written — a document that could never be
        # approved is not a document worth filing.
        raise staff.StaleDocument(d, (date.today() - d).days)

    if kind == "role_change":
        if not body.new_role:
            raise HTTPException(status_code=400, detail="new_role is required")
        if not is_assignable_target_role(body.new_role):
            raise HTTPException(
                status_code=400,
                detail="This role can only be set from verifix files and cannot be chosen as a role-change target")

    unit_names = _unit_names(db)
    leaders = _leader_names(db)
    made: list = []
    pending_notify: list = []

    for (unit, sender_cell), rows in sorted(groups.items()):
        # The SENDING day must still be open, per group — a selection may span
        # two units and only one of them may have closed.
        _assert_day_open(db, unit, d)

        if kind == "people_exchange":
            ttype, tgt_id, tgt_name, task_name, tcell = _resolve_cell_target(
                db, caller, d, unit, sender_cell, body.target_type,
                body.target_manager_id, body.task_name, body.target_cell)
            ttime = _norm_transfer_time(ttype, body.transfer_time)
            rtime = _norm_return_time(ttype, ttime, body.return_time)
            payload = _build_payload(
                db, sender_unit=unit, sender_unit_name=unit_names.get(unit),
                sender_cell=sender_cell, d=d, target_type=ttype,
                target_manager_id=tgt_id, target_manager_name=tgt_name,
                task_name=task_name, rows=rows, transfer_time=ttime,
                return_time=rtime, target_cell=tcell, leaders=leaders)
            if ttype == "task":
                # 403s a non-admin naming a task that is not already ACTIVE:
                # a leader may pick from the shared list, never extend it.
                _ensure_exchange_task(db, task_name, caller)
            detail = {"target": _exchange_target_label(payload),
                      "employee_count": len(payload["employees"]),
                      "sender_cell": sender_cell}
        else:
            payload = _build_role_payload(rows, body.new_role, sender_cell, db,
                                          unit, unit_names.get(unit), leaders)
            detail = {"new_role": body.new_role,
                      "employee_count": len(payload["employees"]),
                      "sender_cell": sender_cell}

        doc = HrDocument(
            # ONE call decides the type, and after the cut-over the same call
            # returns the real one with nothing else here changing.
            doc_type=cell_exchange.doc_type_for(kind),
            manager_id=unit,
            supervisor_name=unit_names.get(unit),
            date=d,
            payload=payload,
            status="draft",
            created_by_telegram_id=int(caller["sub"]),
            created_by_name=caller.get("full_name", ""),
            created_by_role=caller.get("role"),
        )
        db.add(doc)
        db.flush()
        _record_history(db, doc, "created", caller, detail)

        if auto:
            _approve_cell_doc(doc, caller, db)
            pending_notify.append((doc, "approved" if not ghost else None))
        else:
            pending_notify.append((doc, "created"))
        made.append({"id": doc.id, "sender_cell": sender_cell, "count": len(rows)})

    db.commit()

    # One action-log row per request, so a five-cell Save is one line naming
    # what it produced rather than five the reader has to reassemble.
    action_log.enrich(
        target_kind="document",
        target_id=made[0]["id"] if len(made) == 1 else None,
        unit_id=sorted(groups)[0][0] if groups else None,
        day=d,
        details=[("doc_type", cell_exchange.doc_type_for(kind)),
                 ("cells", ", ".join(sorted({g[1] for g in groups}))),
                 ("documents", str(len(made))),
                 ("workers", str(sum(m["count"] for m in made)))],
        changes=[("status", None, "approved" if auto else "draft")],
    )

    for doc, event in pending_notify:
        if event:
            _notify_cell_doc(db, doc, event, int(caller["sub"]),
                             admin_dm=event != "created")
        if event == "created":
            try:
                from app.approvals import send_hr_document_to_admins
                send_hr_document_to_admins(db, doc)
            except Exception:
                logger.exception("staff-cells: approval card failed for doc %s", doc.id)

    # The bell rows the loop above just wrote. `staff._notify` only ever does
    # `db.add(Notification(...))` and `database.get_db` closes WITHOUT
    # committing, so every one of them was rolled back on the way out — on the
    # ADMIN auto-approve path silently and completely, since that path sends no
    # approval card and `_broadcast`'s own commit was what happened to save
    # them on the draft path. The DMs still went out, so the failure was
    # invisible: the people were told, and the platform kept no record of
    # having told them. Committed here, after the notifications and after every
    # Telegram send, so a DM failure can never roll back the documents either.
    try:
        db.commit()
    except Exception:
        logger.exception("staff-cells: could not commit notifications for %s", made)
        db.rollback()

    return {"documents": made, "count": len(made)}


# ── PUT /documents/{id} ───────────────────────────────────────────────────────

class DocUpdateBody(BaseModel):
    # The same two accepted shapes as `DocCreateBody.employees` — one
    # vocabulary for the selection, or the edit path would re-introduce the
    # namesake expansion the create path just lost.
    employees:         List[Union[EmployeeRef, str]]
    new_role:          Optional[str] = None
    target_type:       Optional[str] = None
    target_manager_id: Optional[int] = None
    task_name:         Optional[str] = None
    target_cell:       Optional[str] = None
    transfer_time:     Optional[str] = None
    return_time:       Optional[str] = None


@router.put("/documents/{doc_id}")
def update_document(doc_id: int, body: DocUpdateBody,
                    caller=Depends(_require_cell_staff), db: Session = Depends(get_db)):
    """Edit a draft — its people, its destination, its clock.

    The document's SENDER CELL is not editable and is not taken from the body:
    it is the document's identity, the thing its register row, its scope and
    its notification are all keyed by. Changing it would silently turn one
    document into a different one; filing from another cell is another
    document, which is what `POST /documents` produces per cell anyway. So
    every worker named here must belong to THIS document's cell, and a name
    that does not is refused rather than moved.

    The payload is rebuilt through this router's own builder for the reason
    stated on it: `staff._build_exchange_payload` rebuilds from scratch and
    would drop `sender_cell`, both leader snapshots and the shift on the first
    edit, leaving a register row with no origin.
    """
    doc = _get_doc(doc_id, caller, db)
    if doc.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft documents can be edited")
    # Same bounded rule as `_may_reject` and the delete rung: the bare
    # ("admin", "shift-manager") tuple carries no shift, and `_scope_documents`
    # hands every document to a `page.view.staff-cell` grant at "all".
    if not _can_approve_cell_doc(doc, caller, db) and not _is_creator(doc, caller):
        raise HTTPException(status_code=403, detail="Not allowed to edit this document")
    if not body.employees:
        raise HTTPException(status_code=400, detail="Select at least one employee")

    payload_prev = doc.payload or {}
    sender_cell = payload_prev.get("sender_cell") or ""
    scope = caller_cells(db, caller)
    if sender_cell and not allows(scope, sender_cell):
        raise HTTPException(status_code=403, detail="This document's cell is outside your cells")

    _assert_day_open(db, doc.manager_id, doc.date)

    groups = _resolve_selection(db, caller, scope, doc.date, body.employees)
    keys = sorted(groups)
    # The unit is an id and compares as one; the CELL is a code and compares
    # through `same_code`, because the group key was normalised from the
    # attendance row while `sender_cell` was normalised into the payload from
    # whichever spelling the day's upload carried. A `==` here refuses an edit
    # to the document's own workers whenever the two registers disagree about
    # the padding of one code.
    if len(keys) != 1 or keys[0][0] != doc.manager_id \
            or not same_code(keys[0][1], sender_cell):
        raise HTTPException(
            status_code=400,
            detail="Every worker on this document must come from its own cell — "
                   "file a separate document for another cell")
    rows = groups[keys[0]]

    unit_names = _unit_names(db)
    leaders = _leader_names(db)
    is_exchange = cell_exchange._semantic(doc.doc_type) == "people_exchange"

    if is_exchange:
        ttype = body.target_type or payload_prev.get("target_type")
        tgt_in = body.target_manager_id if body.target_manager_id is not None \
            else payload_prev.get("target_manager_id")
        task_in = body.task_name if body.task_name is not None else payload_prev.get("task_name")
        tcell_in = body.target_cell if body.target_cell is not None \
            else payload_prev.get("target_cell")
        ttype, tgt_id, tgt_name, task_name, tcell = _resolve_cell_target(
            db, caller, doc.date, doc.manager_id, sender_cell, ttype, tgt_in, task_in, tcell_in)
        ttime_in = body.transfer_time if body.transfer_time is not None \
            else payload_prev.get("transfer_time")
        ttime = _norm_transfer_time(ttype, ttime_in)
        rtime_in = body.return_time if body.return_time is not None \
            else payload_prev.get("return_time")
        rtime = _norm_return_time(ttype, ttime, rtime_in)
        payload = _build_payload(
            db, sender_unit=doc.manager_id, sender_unit_name=unit_names.get(doc.manager_id),
            sender_cell=sender_cell, d=doc.date, target_type=ttype,
            target_manager_id=tgt_id, target_manager_name=tgt_name, task_name=task_name,
            rows=rows, transfer_time=ttime, return_time=rtime, target_cell=tcell,
            leaders=leaders)
        if ttype == "task":
            _ensure_exchange_task(db, task_name, caller)
        detail = {"target": _exchange_target_label(payload),
                  "employee_count": len(payload["employees"])}
    else:
        new_role = body.new_role or payload_prev.get("new_role")
        if not new_role:
            raise HTTPException(status_code=400, detail="new_role is required")
        if not is_assignable_target_role(new_role):
            raise HTTPException(
                status_code=400,
                detail="This role can only be set from verifix files and cannot be chosen as a role-change target")
        payload = _build_role_payload(rows, new_role, sender_cell, db, doc.manager_id,
                                      unit_names.get(doc.manager_id), leaders)
        detail = {"new_role": new_role, "employee_count": len(payload["employees"])}

    doc.payload = payload
    _record_history(db, doc, "edited", caller, detail)
    log = _doc_log_fields(doc)
    db.commit()
    action_log.enrich(**log)
    return {"ok": True}


# ── the approve path ──────────────────────────────────────────────────────────

def _approve_cell_doc(doc: HrDocument, caller: dict, db: Session) -> None:
    """Post a document — and, for a TEST one, post everything EXCEPT the move.

    **This is the invariant of the whole feature and it is meant to be provable
    from this function alone.** `staff._approve_doc` ends in
    `_apply_doc_effects`, so calling it would push the proof into another file;
    this writes the same status stamp and the same history row itself, and
    branches ONCE:

      * `cell_exchange.is_test(doc.doc_type)` → `cell_exchange.dry_run`, a pure
        read, stored at `payload["dry_run"]`. Nothing else is called. In
        particular NOT `staff._apply_doc_effects`, NOT
        `staff._apply_people_exchange` and NOT `staff._apply_split_exchange` —
        that last one is not a calculator: it writes rows, stamps
        `emp["applied"]` onto the payload and calls `flag_modified` itself, so
        «run it and roll back» would still dirty the session.
      * otherwise → `staff._apply_doc_effects`, the real thing, unchanged.

    The branch is on the doc_type and never on `SANDBOX`, so after the
    cut-over the documents already written keep the meaning they were filed
    with.

    Two guards from the unit-level approve are kept verbatim, both checked
    BEFORE anything is applied so a refused document is left exactly as it was:
    the `STALE_APPROVE_DAYS` ceiling (approving a month-old document would
    rewrite that day's attendance), and the receiving unit's data check (a unit
    whose verifix file has not landed will wipe `(manager, date)` when it does,
    destroying the transfer). The second is asked of test documents too — a
    sandbox that accepted a move the real path would refuse would rehearse a
    document that can never be posted.
    """
    if doc.status == "approved":
        return
    if doc.status == "rejected":
        raise HTTPException(status_code=409, detail="Rejected documents cannot be posted")

    if doc.date:
        age = (date.today() - doc.date).days
        if age > STALE_APPROVE_DAYS:
            logger.warning("CELL-DOC-STALE refused approve of #%s (%s, %s days old) by %s",
                           doc.id, doc.date, age, caller.get("full_name") or caller.get("sub"))
            raise staff.StaleDocument(doc.date, age)

    payload = doc.payload or {}
    if (cell_exchange._semantic(doc.doc_type) == "people_exchange"
            and payload.get("target_type") == "supervisor"
            and payload.get("target_manager_id")
            and not _unit_has_attendance(db, payload["target_manager_id"], doc.date)):
        raise ExchangeTargetNoData()

    if cell_exchange.is_test(doc.doc_type):
        # THE sandbox path. A pure read in, a plain dict out, written onto the
        # payload HERE so the one mutation a test approval makes is visible in
        # this diff — `dry_run` itself never touches the object.
        projection = cell_exchange.dry_run(db, doc)
        payload = dict(doc.payload or {})
        payload["dry_run"] = projection
        doc.payload = payload
        flag_modified(doc, "payload")
    else:                                       # CUT-OVER: the live branch
        staff._apply_doc_effects(db, doc)

    doc.status                  = "approved"
    doc.approved_by_telegram_id = int(caller["sub"])
    doc.approved_by_name        = caller.get("full_name", "")
    doc.approved_at             = datetime.now(timezone.utc)
    _record_history(db, doc, "approved", caller)


def _cancel_cell_doc(doc: HrDocument, caller: dict, db: Session) -> None:
    """Un-post an approved document.

    A test document changed nothing, so there is nothing to revert — its
    `dry_run` is DROPPED instead, because the projection was computed against
    the day as it stood at approval and a draft carrying a stale one would
    describe a move nobody can check any more."""
    if doc.status != "approved":
        return
    if cell_exchange.is_test(doc.doc_type):
        payload = dict(doc.payload or {})
        if payload.pop("dry_run", None) is not None:
            doc.payload = payload
            flag_modified(doc, "payload")
    else:                                       # CUT-OVER: the live branch
        _revert_doc_effects(db, doc)
    doc.status                  = "draft"
    doc.approved_by_telegram_id = None
    doc.approved_by_name        = None
    doc.approved_at             = None
    _record_history(db, doc, "cancelled", caller)


def _reject_cell_doc(doc: HrDocument, caller: dict, db: Session) -> None:
    """Refuse a draft and KEEP it as a rejected record.

    Erasing it would leave the filer with a document that vanished and no way
    to see why. The refuser lands in the `approved_by_*` columns exactly as a
    poster would — those columns record who DECIDED, not who agreed."""
    if doc.status != "draft":
        raise HTTPException(status_code=409, detail="Only draft documents can be rejected")
    doc.status                  = "rejected"
    doc.approved_by_telegram_id = int(caller["sub"])
    doc.approved_by_name        = caller.get("full_name", "")
    doc.approved_at             = datetime.now(timezone.utc)
    _record_history(db, doc, "rejected", caller)
    if doc.created_by_telegram_id and doc.created_by_telegram_id != int(caller["sub"]):
        _notify(db, doc.created_by_telegram_id, type="error", nkey="document_rejected",
                params={
                    "actor_name": caller.get("full_name", ""),
                    # The REAL type, so the label resolves in the reader's own
                    # language instead of printing a raw sandbox type name.
                    "doc_type":   cell_exchange._semantic(doc.doc_type),
                    "date":       doc.date,
                })


def _clear_card(doc_id: int, status: str, name: str) -> None:
    """Rewrite the Telegram approve/reject cards with the outcome and drop
    their buttons. Called only AFTER the commit: `edit_admin_notices` opens its
    own session and commits, so calling it inside an open transaction can leave
    the buttons gone while the decision itself rolls back."""
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("hr_document", str(doc_id), status, name)
    except Exception:
        logger.exception("staff-cells: could not update approval cards for doc %s", doc_id)


@router.post("/documents/{doc_id}/approve")
def approve_document(doc_id: int, caller=Depends(_require_cell_staff),
                     db: Session = Depends(get_db)):
    doc = _get_doc(doc_id, caller, db)
    if not _can_approve_cell_doc(doc, caller, db):
        raise HTTPException(status_code=403, detail="Not authorised to post this document")
    if doc.status == "approved":
        # Idempotent and deliberately SILENT: a second press must not re-DM the
        # parties, re-warn about a grant use that changed nothing, or re-stamp
        # the inline card with the name of someone who did not approve it.
        return {"ok": True, "status": doc.status}
    # BEFORE the mutation: this answers «what authorised this action», and after
    # a status change the answer differs.
    via_grant = _via_grant(doc, caller, db)
    _approve_cell_doc(doc, caller, db)
    _notify_cell_doc(db, doc, "approved", int(caller["sub"]))
    log = _doc_log_fields(doc, [("status", "draft", "approved")])
    db.commit()
    action_log.enrich(**log)
    alert_grant_use(db, caller, CAP_DOCUMENTS_APPROVE, "document.approved",
                    details=_doc_alert_details(db, doc),
                    changes=[("status", tv("v.draft"), tv("v.approved"))],
                    native=not via_grant)
    _clear_card(doc_id, "approved", caller.get("full_name", ""))
    return {"ok": True, "status": doc.status}


@router.post("/documents/{doc_id}/reject")
def reject_document(doc_id: int, caller=Depends(_require_cell_staff),
                    db: Session = Depends(get_db)):
    doc = _get_doc(doc_id, caller, db)
    if not _may_reject(doc, caller, db):
        raise HTTPException(status_code=403, detail="Not authorised to reject this document")
    via_grant = (_granted_over_cell_doc(doc, caller, db)
                 and not _native_can_approve_cell_doc(doc, caller, db)
                 and caller.get("role") not in ("admin", "shift-manager")
                 and not _is_creator(doc, caller))
    _reject_cell_doc(doc, caller, db)
    log = _doc_log_fields(doc, [("status", "draft", "rejected")])
    db.commit()
    action_log.enrich(**log)
    alert_grant_use(db, caller, CAP_DOCUMENTS_APPROVE, "document.rejected",
                    details=_doc_alert_details(db, doc),
                    changes=[("status", tv("v.draft"), tv("v.rejected"))],
                    native=not via_grant)
    _clear_card(doc_id, "rejected", caller.get("full_name", ""))
    return {"ok": True, "status": doc.status}


@router.post("/documents/{doc_id}/cancel")
def cancel_document(doc_id: int, caller=Depends(_require_cell_staff),
                    db: Session = Depends(get_db)):
    doc = _get_doc(doc_id, caller, db)
    if not _can_approve_cell_doc(doc, caller, db):
        raise HTTPException(status_code=403, detail="Not authorised to un-post this document")
    if doc.status != "approved":
        # Nothing to un-post — idempotent and silent, as on the approve side.
        return {"ok": True, "status": doc.status}
    via_grant = _via_grant(doc, caller, db)
    _cancel_cell_doc(doc, caller, db)
    _notify_cell_doc(db, doc, "cancelled", int(caller["sub"]))
    log = _doc_log_fields(doc, [("status", "approved", "draft")])
    db.commit()
    action_log.enrich(**log)
    alert_grant_use(db, caller, CAP_DOCUMENTS_APPROVE, "document.cancelled",
                    details=_doc_alert_details(db, doc),
                    changes=[("status", tv("v.approved"), tv("v.draft"))],
                    native=not via_grant)
    return {"ok": True, "status": doc.status}


@router.post("/documents/{doc_id}/delete")
def delete_document(doc_id: int, caller=Depends(_require_cell_staff),
                    db: Session = Depends(get_db)):
    """Remove a document — except that deleting a DRAFT rejects it instead.

    A pending draft somebody refused is a decision, and a decision has to stay
    readable: the record is kept as `rejected`, exactly as the Telegram ❌
    button does, and the register says what happened rather than what the
    button was called. Only an APPROVED document is really deleted, and only by
    somebody who could have un-posted it — its effects are reverted first (for
    a test document there are none, by construction).
    """
    doc = _get_doc(doc_id, caller, db)
    grant_alert = None

    if doc.status == "approved":
        if not _can_approve_cell_doc(doc, caller, db):
            raise HTTPException(status_code=403,
                                detail="Approved documents can only be deleted by an approver")
        if _via_grant(doc, caller, db):
            grant_alert = (_doc_alert_details(db, doc),
                           [("status", tv("v.approved"), None)])
        if cell_exchange.is_test(doc.doc_type):
            pass                                # nothing was ever applied
        else:                                   # CUT-OVER: the live branch
            _revert_doc_effects(db, doc)
    elif doc.status == "draft":
        if not _may_reject(doc, caller, db):
            raise HTTPException(status_code=403, detail="Not allowed to reject this document")
        via_grant = (_granted_over_cell_doc(doc, caller, db)
                     and not _native_can_approve_cell_doc(doc, caller, db)
                     and caller.get("role") not in ("admin", "shift-manager")
                     and not _is_creator(doc, caller))
        _reject_cell_doc(doc, caller, db)
        log = _doc_log_fields(doc, [("status", "draft", "rejected")])
        db.commit()
        action_log.enrich(action="document.rejected", **log)
        alert_grant_use(db, caller, CAP_DOCUMENTS_APPROVE, "document.rejected",
                        details=_doc_alert_details(db, doc),
                        changes=[("status", tv("v.draft"), tv("v.rejected"))],
                        native=not via_grant)
        _clear_card(doc_id, "rejected", caller.get("full_name", ""))
        return {"ok": True, "status": doc.status}
    # Same rule as `_may_reject`, and for the same reason: the bare
    # ("admin", "shift-manager") tuple that used to stand here carried no shift,
    # so a shift-manager reading another shift's document through a
    # `page.view.staff-cell` grant at "all" could delete it outright.
    elif not _can_approve_cell_doc(doc, caller, db) and not _is_creator(doc, caller):
        raise HTTPException(status_code=403, detail="Not allowed to delete this document")

    # Snapshot BEFORE the delete: a removed row's attributes are expired after
    # the commit and cannot be read back to describe what was removed.
    log = _doc_log_fields(doc, [("status", doc.status, None)])
    alert_details = _doc_alert_details(db, doc) if grant_alert else None
    db.delete(doc)
    db.commit()
    action_log.enrich(**log)
    if grant_alert:
        alert_grant_use(db, caller, CAP_DOCUMENTS_APPROVE, "document.deleted",
                        details=alert_details, changes=grant_alert[1], native=False)
    # CUT-OVER: purging a batch of sandbox documents must also call
    # approvals.forget_notices("hr_document", id) for each, or Telegram keeps
    # live ✅/❌ buttons over rows that no longer exist.
    try:
        from app.approvals import forget_notices
        forget_notices("hr_document", doc_id)
    except Exception:
        logger.exception("staff-cells: could not forget approval cards for doc %s", doc_id)
    return {"ok": True}
