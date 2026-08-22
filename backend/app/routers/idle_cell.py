"""Manual per-cell idle-time (ojidaniya) entry — a TEST input toward computing
загрузка per cell. Separate from and additive to the sheets-import
``downtime_data`` table; it does NOT replace it.

**An ojidaniya is an EVENT with a start and an end** (from 2026-08-20). Several
per (cell, date, category): a cell may wait on the same cause twice in a day,
and each stint carries its own required reason and its own To'xtaganda /
To'xtamaganda answer — whether the cell actually stopped working for THAT one.

The change exists to fix an arithmetic error, not to add a field. Entries used
to be minutes only, which makes overlapping causes unrepresentable: two
categories waiting on the same wall-clock stretch were added together, so one
30-minute stop filed under two reasons was reported as 60. With endpoints on
record the total is the UNION of the ranges, and ``services/idle_intervals.py``
is the ONE place that arithmetic lives — every figure this router returns comes
from ``summarize()``, including the over-count the old method would have
produced, so the correction is visible rather than merely applied.

Rows filed before the change survive in ``cell_ojidaniya`` and are served as
``legacy_entries``: readable and deletable, never editable, and never added into
the union — they carry no times, so nothing can de-duplicate them.

**An entry COUNTS the moment it is saved** (from 2026-08-22). For one day a
leader's ojidaniya was a REQUEST that the cell's brigadir had to confirm; that
step is gone. Every row is written ``approved``, and what replaces the queue is
a different split of who may do what: a leader FILES and never corrects — only
the unit's brigadir, an admin/top-manager, or a ``CAP_IDLE_APPROVE`` grantee
covering the unit may edit or delete an entry, the leader's own included — and
the brigadir is TOLD of every entry a leader files (``idle_request_new``, the
«Yangi kutish kiritildi» bell/DM), so the register is reviewed after the fact
instead of gated before it. ``rejected`` rows from the request regime stay in
the table exactly as they were: visible, read-only, deletable by the same
people. Nothing is pending any more, so nothing blocks a day close.

The daily-actual «Perenaladka» entry that used to be this page's second tab
lives on the Setup-times page now (routers/setup_times.py «Fakt» endpoints);
this router is Ojidaniya-only.

Gated by the ``idle-cell`` page. ``PAGE_ACCESS["idle-cell"]`` stays EMPTY — the
page opens for a supervisor and their leaders (from 2026-08-21) through
per-profile ``page.view.idle-cell`` grants with "own" scope, never through a
role tick, which would open it to every supervisor and leader on the platform
at once.

Reads/writes are scoped to the caller's cells — admins/top-managers see all, a
``page.view.idle-cell`` "all" grant sees all, supervisors/shift-managers their
unit's cells, leaders their own. The scope ladder is server-side and re-decided
on every write, so the frontend's role-adaptive toolbar is a DISPLAY decision
only: it removes controls whose every option the server would answer the same
way, and can never widen what a caller reaches."""
import logging
from collections import defaultdict
from datetime import date as date_t, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Cell, CellOjidaniya, CellOjidaniyaInterval, Manager, RoleProfile
from app.capabilities import (
    CAP_IDLE_APPROVE, cap_scope, page_cap, page_scope_is_all, profile_unit_ids,
)
from app.capability_alerts import alert_grant_use, page_grant_used
from app.permissions import require_page
from app.security import require_auth
from app.services import idle_intervals, idle_lock
from app import identity

router = APIRouter(prefix="/api/idle-cell", tags=["idle-cell"])

log = logging.getLogger(__name__)

PAGE = "idle-cell"

# Canonical Ojidaniya categories — mirrors backend/app/services/sheets_reader.py
# SHIFT_CATEGORY_ORDER. Cat H never had a To'xtamaganda half (its 2nd source
# column is a people-count), so an ojidaniya on it is always a real stop.
IDLE_CATEGORIES = ["Cat A", "Cat B", "Cat C", "Cat D", "Cat D2", "Cat D3",
                   "Cat E", "Cat F", "Cat G", "Cat H", "Cat I"]
_VALID = set(IDLE_CATEGORIES)
_ALWAYS_STOPPED = {"Cat H"}


def _scoped_cells(db: Session, payload: dict, *pages: str) -> list[Cell]:
    """Every cell the caller may see/enter, admins = all. Built generically so a
    future ``page.view.idle-cell`` grant to a supervisor/leader Just Works.
    `pages` = which pages' "all"-scope grants widen the view, ANY of them. The
    changeover («Perenaladka») data is reachable from two pages, so its call
    sites pass both — a viewer granted "all" on either door sees every cell
    through it, otherwise a grant on one page would be silently narrowed by the
    other's absence."""
    role = payload.get("role")
    page_list = pages or (PAGE,)
    q = db.query(Cell)
    if role in ("admin", "top-manager") or any(page_scope_is_all(db, payload, p) for p in page_list):
        return q.all()
    if role == "leader":
        lpid = identity.viewer_leader_profile_id(db, payload)
        return q.filter(Cell.leader_id == lpid).all() if lpid else []
    units = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
    if units is None:      # unrestricted-by-unit fallback (safety)
        return q.all()
    if not units:
        return []
    return q.filter(Cell.manager_id.in_(units)).all()


def _valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


# ── who may CORRECT ──────────────────────────────────────────────────────────
# An entry counts the moment it is saved, so the page's second question beside
# "may this caller see the cell" is: may they CHANGE what is on it. A leader
# files and is done; whoever answers for the unit corrects.
#
# It is deliberately NOT `_scoped_cells` membership. That ladder ends in an
# unrestricted-by-unit fallback (`units is None` → every cell) which exists so a
# role nobody listed cannot be locked out of a page they were granted — a
# widening. Read editing rights off it and a guest holding a page grant would
# be able to rewrite every entry on the platform. So the editor is named
# explicitly, the way `leaders._may_decide` names one:
#
#   • admin / top-manager                      — always
#   • the supervisor whose unit owns the cell   — their own register, no grant needed
#   • a CAP_IDLE_APPROVE grantee covering it    — a delegated editor
#
# Everyone else — leaders, and shift-managers or "all"-grantees without the
# capability — adds entries, however much of the page they can see, and may
# not touch one afterwards, their own included. `CAP_IDLE_APPROVE` keeps its
# name from the request regime; what it grants now is this reach.


def _decider(db: Session, payload: dict) -> dict:
    """The caller's editing reach, resolved ONCE per request.

    Built as a context rather than a per-cell question because both halves cost
    a query: a payload answering forty cells would otherwise pay for them forty
    times over."""
    role = payload.get("role")
    ctx = {"role": role, "all": role in ("admin", "top-manager"),
           "own_units": set(), "granted_units": set()}
    if ctx["all"]:
        return ctx

    # The cell's own brigadir. Resolved through the PROFILE, not the token's
    # role_id, because one brigadir profile may be held by several accounts.
    if role == "supervisor":
        own = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
        if own:
            ctx["own_units"] = set(own)

    scope = cap_scope(db, payload, CAP_IDLE_APPROVE)
    if scope == "all":
        ctx["all"] = True
    elif scope == "own":
        granted = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
        if granted:
            ctx["granted_units"] = set(granted)
    return ctx


def _may_decide(ctx: dict, cell: Optional[Cell]) -> bool:
    """May this caller edit/delete entries on this cell?

    A cell with no supervisor (``manager_id`` NULL) has no brigadir to answer
    for it, so only an admin may correct it — never nobody, which would strand
    the row."""
    if ctx.get("all"):
        return True
    mid = getattr(cell, "manager_id", None)
    if not mid:
        return False
    return mid in ctx["own_units"] or mid in ctx["granted_units"]


def _row_perm(e: CellOjidaniyaInterval, may_decide: bool, day_open: bool) -> dict:
    """What this caller may do to THIS row — decided here, on the server, and
    shipped with the row.

    The client never re-derives it (the `is_own` rule the comment threads
    follow): permission depends on the caller's reach, the row's status and the
    day's lock at once, and a second spelling of that on the client is a second
    answer.

    Authorship is deliberately NOT a factor: a leader's own entry is theirs to
    read, not to rework — once saved it belongs to the register, and the unit's
    brigadir is who corrects it. A ``rejected`` row (left over from the request
    regime) is read-only for everyone and may only be retired. ``can_decide``
    is always False: there is no decision left to make, and the key survives
    only so an older client finds the shape it expects."""
    status = e.status or "approved"
    return {
        "can_edit":   day_open and may_decide and status != "rejected",
        "can_delete": day_open and may_decide,
        "can_decide": False,
    }


def _names_for(db: Session, keys) -> dict:
    """Resolve entry-author profile keys to display names, in ONE pair of
    queries however many rows the day holds.

    THREE roles write to this ledger now (2026-08-21): a leader filing their own
    cell, the unit's brigadir correcting it, an admin filling a gap. A row that
    does not say who filed it leaves the reader unable to tell their own
    correction from the entry it corrected — and the entries are free-text
    reasons, so there is nothing else on the row that identifies an author.
    Read live from the profile, exactly like ``identity.profile_display_name``
    (whose per-row form this batches), so a rename propagates instead of
    leaving stale snapshots on old rows.

    A key that resolves to nothing is simply absent from the map: an unknown
    author must read as unknown, never as somebody else."""
    mgr_ids, prof_ids, parsed = set(), set(), {}
    for k in {k for k in keys if k}:
        role, ref = identity.parse_profile_key(k)
        if not role or not ref:
            continue
        parsed[k] = (role, ref)
        (mgr_ids if role == "supervisor" else prof_ids).add(ref)
    mgrs = {m.id: m.name for m in db.query(Manager).filter(
        Manager.id.in_(mgr_ids)).all()} if mgr_ids else {}
    profs = {p.id: p.name for p in db.query(RoleProfile).filter(
        RoleProfile.id.in_(prof_ids)).all()} if prof_ids else {}
    out = {}
    for k, (role, ref) in parsed.items():
        name = mgrs.get(ref) if role == "supervisor" else profs.get(ref)
        if name:
            out[k] = name
    return out


def _interval_json(e: CellOjidaniyaInterval, names: Optional[dict] = None,
                   perm: Optional[dict] = None) -> dict:
    """One ojidaniya event. ``minutes`` and ``next_day`` are DERIVED here rather
    than on the client so the midnight rule (end <= start ⇒ next day) has one
    definition; a range the client measured differently would show a duration
    that disagrees with the total printed beside it."""
    return {
        "id": e.id,
        "category": e.category,
        "start": e.start,
        "end": e.end,
        "stopped": bool(e.stopped),
        "note": e.note or "",
        "minutes": idle_intervals.duration(e.start, e.end),
        "next_day": idle_intervals.to_min(e.end) <= idle_intervals.to_min(e.start),
        "entered_by": e.entered_by_profile,
        "entered_by_name": (names or {}).get(e.entered_by_profile),
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        # Status and the decision half survive for the rows the request regime
        # left behind: a `rejected` row still shows who refused it and why. New
        # rows are `approved` with nothing here — nobody decided them.
        "status": e.status or "approved",
        "decision_note": e.decision_note or None,
        "decided_by": e.decided_by_profile,
        "decided_by_name": (names or {}).get(e.decided_by_profile),
        "decided_at": e.decided_at.isoformat() if e.decided_at else None,
        **(perm or {"can_edit": False, "can_delete": False, "can_decide": False}),
    }


def _legacy_json(e: CellOjidaniya, names: Optional[dict] = None,
                 can_delete: bool = False) -> dict:
    """A pre-2026-08-20 minutes-only row. Read-only, and deliberately NOT folded
    into the union: with no start or end there is no way to know which of its
    minutes another entry already counted."""
    return {
        "id": e.id,
        "category": e.category,
        "stopped": float(e.stopped or 0),
        "not_stopped": float(e.not_stopped or 0),
        "note": e.note or "",
        "entered_by": e.entered_by_profile,
        "entered_by_name": (names or {}).get(e.entered_by_profile),
        "updated_at": e.updated_at.isoformat() if e.updated_at else None,
        "can_delete": can_delete,
    }


def _cell_json(c: Cell, intervals: list, requests: list, legacy: list,
               leader: Optional[str] = None, can_manage: bool = False,
               can_add: bool = False) -> dict:
    return {
        "cell_id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        "name_uz": c.name_workshop_uz,
        "name_uz_cyrl": c.name_workshop_uz_cyrl,
        "name_ru": c.name_workshop_ru,
        "name_en": c.name_workshop_en,
        # The cell's owning leader (role_profiles) — canonical uz-Latin name, the
        # UI transliterates it. Nearly 1:1 with cells, so the page shows it per
        # row and filters by it rather than grouping. NULL = unassigned.
        "leader_id": c.leader_id,
        "leader": leader,
        # `intervals` is APPROVED rows only, and `summary` is computed from
        # exactly that list. `requests` is what the request regime left behind
        # — REJECTED rows, kept visible with their reason so a leader can tell
        # a refusal from an entry they never filed — and it must not reach the
        # union, the overlap correction or the загрузка; keeping it in a second
        # list means no arithmetic anywhere had to learn what a status is.
        "intervals": intervals,
        "requests": requests,
        "legacy_entries": legacy,
        # May this caller edit/delete entries on the cell (any author's).
        "can_manage": can_manage,
        "can_add": can_add,
        # The whole ledger for this cell-day, computed in ONE place.
        "summary": idle_intervals.summarize(intervals),
    }


@router.get("/supervisors")
def list_supervisors(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Supervisors (units) that own cells in the caller's scope, with their shift
    — the toolbar's supervisor picker (the All/1/2 shift tabs filter it)."""
    cells = _scoped_cells(db, payload)
    ids = {c.manager_id for c in cells if c.manager_id}
    if not ids:
        return []
    mgrs = db.query(Manager).filter(Manager.id.in_(ids), Manager.archived == False).all()  # noqa: E712
    mgrs.sort(key=lambda m: (m.shift or 0, (m.name or "").lower()))
    return [{"id": m.id, "name": m.name, "shift": m.shift} for m in mgrs]


@router.get("/cells")
def list_cells(
    supervisor_id: int = Query(...),
    date: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Cells under one supervisor (must be in the caller's scope) plus each
    cell's ojidaniya events for the date, its read-only legacy rows, and the
    computed summary."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    cells = [c for c in _scoped_cells(db, payload) if c.manager_id == supervisor_id]
    if not cells:
        return {"cells": []}
    ids = [c.id for c in cells]

    ivs = db.query(CellOjidaniyaInterval).filter(
        CellOjidaniyaInterval.cell_id.in_(ids),
        CellOjidaniyaInterval.date == date,
    ).all()
    legs = db.query(CellOjidaniya).filter(
        CellOjidaniya.cell_id.in_(ids),
        CellOjidaniya.date == date,
    ).all()
    # Every author AND every decider (rejected rows still name one) resolved
    # together, so one day costs one pair of queries no matter how many people
    # touched the unit's cells.
    names = _names_for(db, [e.entered_by_profile for e in ivs + legs]
                       + [e.decided_by_profile for e in ivs])

    # The day's lock and the caller's editing reach — both once per request,
    # then applied per row.
    day = idle_lock.day_info(db, supervisor_id, date, payload)
    day_open = day["can_write"]
    ctx = _decider(db, payload)
    by_id = {c.id: c for c in cells}

    approved_by_cell: dict = defaultdict(list)
    requests_by_cell: dict = defaultdict(list)
    for e in ivs:
        decide = _may_decide(ctx, by_id.get(e.cell_id))
        row = _interval_json(e, names, _row_perm(e, decide, day_open))
        # Anything not approved goes to the second list. After the 2026-08-22
        # one-shot that is only ever `rejected`; routing by "not approved"
        # rather than by "rejected" means a stray row can never vanish from
        # both lists.
        (approved_by_cell if row["status"] == "approved" else requests_by_cell)[e.cell_id].append(row)
    # Chronological — an event log read in any other order stops being a log.
    for rows in list(approved_by_cell.values()) + list(requests_by_cell.values()):
        rows.sort(key=lambda r: (idle_intervals.to_min(r["start"]), r["end"]))

    legacy_by_cell: dict = defaultdict(list)
    for e in legs:
        # A legacy row has no author question to answer — it predates the
        # interval model entirely — so only a unit editor may retire one.
        legacy_by_cell[e.cell_id].append(
            _legacy_json(e, names, day_open and _may_decide(ctx, by_id.get(e.cell_id))))

    lids = {c.leader_id for c in cells if c.leader_id}
    leaders = {p.id: p.name for p in db.query(RoleProfile).filter(
        RoleProfile.id.in_(lids),
    ).all()} if lids else {}
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    out = [
        _cell_json(c, approved_by_cell.get(c.id, []), requests_by_cell.get(c.id, []),
                   legacy_by_cell.get(c.id, []), leaders.get(c.leader_id),
                   can_manage=_may_decide(ctx, c), can_add=day_open)
        for c in cells
    ]
    return {
        "day": day,
        "cells": out,
    }


@router.get("/day-summary")
def day_summary(
    manager_id: int = Query(...),
    date: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """How much ojidaniya the unit's cells carry for one day, and how much of it
    LEADERS filed — the two numbers the day-close dialog on Daily/Staff prints
    («Bugun liderlar N ta kutish kiritdi — ko'rib chiqdingizmi?»).

    Auth-only and unit-scoped, NOT page-gated: the brigadir closing their day
    is very often somebody nobody granted `/idle-cell` to (the page opens per
    profile), and the one fact they need before signing off — that a leader
    entered downtime on their unit today — must not 403 on them. What they may
    ask about is bounded the other way: an admin/top-manager any unit, a
    supervisor only the unit(s) their own profile covers, everyone else nothing.

    Counts APPROVED rows only, the same set every figure on the platform reads;
    a rejected leftover is not downtime and is not counted here either."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    role = payload.get("role")
    if role not in ("admin", "top-manager"):
        if role != "supervisor":
            raise HTTPException(status_code=403, detail="Not allowed")
        units = profile_unit_ids(db, identity.viewer_profile_key(db, payload)) or []
        if manager_id not in units:
            raise HTTPException(status_code=403, detail="Not your unit")

    rows = db.query(CellOjidaniyaInterval).join(
        Cell, Cell.id == CellOjidaniyaInterval.cell_id,
    ).filter(
        Cell.manager_id == manager_id,
        CellOjidaniyaInterval.date == date,
        CellOjidaniyaInterval.status == "approved",
    ).all()
    return {
        "entries": len(rows),
        "leader_entries": sum(1 for e in rows
                              if (e.entered_by_profile or "").startswith("leader:")),
        "cells": len({e.cell_id for e in rows}),
    }


class IntervalIn(BaseModel):
    cell_id: int
    date: str
    category: str
    start: str
    end: str
    stopped: bool = True
    note: str


def _validate(body: IntervalIn, db: Session, payload: dict) -> tuple[str, bool, int]:
    """Everything an ojidaniya must satisfy, in one place — both writers call it.
    The UI makes each of these unpickable rather than merely rejected, but the
    endpoint is reachable without the UI, so it re-decides all of them."""
    if not _valid_date(body.date):
        raise HTTPException(status_code=400, detail="Invalid date")
    if body.category not in _VALID:
        raise HTTPException(status_code=400, detail="Invalid category")
    note = (body.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="A reason is required")
    s, e = idle_intervals.to_min(body.start), idle_intervals.to_min(body.end)
    if s is None or e is None:
        raise HTTPException(status_code=400, detail="Invalid time")
    # end == start would otherwise be carried past midnight into a silent
    # 24-hour stop — the one range no operator ever means to file.
    if s == e:
        raise HTTPException(status_code=400, detail="The end must differ from the start")
    # A day in the future can never be CLOSED (`staff.close_day` refuses one),
    # so a row filed against it could never be locked either — it would sit
    # outside the register's only guarantee for good.
    if date_t.fromisoformat(body.date) > date_t.today():
        raise HTTPException(status_code=400, detail="Cannot file a future date")
    if body.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    # Cat H has no not-stopped half; forcing it here keeps the one category that
    # cannot answer the question from carrying a meaningless answer.
    stopped = True if body.category in _ALWAYS_STOPPED else bool(body.stopped)
    return note, stopped, idle_intervals.duration(body.start, body.end)


def _alert(db: Session, payload: dict, cell_id: int, date: str, key: str, changes: list):
    """This page opens for non-admins only through role×page ticks or a personal
    page grant — the latter is a delegated power, so its use warns the admins."""
    if not page_grant_used(db, payload, PAGE):
        return
    cell = db.query(Cell).filter_by(id=cell_id).first()
    alert_grant_use(
        db, payload, page_cap(PAGE), key,
        details=[("cell", cell.verifix_code if cell else f"#{cell_id}"), ("date", date)],
        changes=changes, native=False,
    )


def _cell_of(db: Session, cell_id: int) -> Optional[Cell]:
    return db.query(Cell).filter(Cell.id == cell_id).first()


def _tell(db: Session, profile: Optional[str], nkey: str, params: dict) -> None:
    """Tell one person what was entered on their unit — bell row plus a DM to
    every account holding that profile.

    Lazy import and swallowed failures on purpose: ``routers.staff`` pulls in
    half the app, and a Telegram outage must never be the reason an entry
    fails to save. The entry is the record; the message is about it.

    **It commits.** ``notify_profile`` only ``db.add()``s the bell row and
    documents that the caller commits — and every call here happens AFTER the
    write's own commit, so without this the request-scoped session closes and
    the bell row is rolled back. The DM would still go out, which is the worst
    version of the bug: the person is pinged about something their
    notifications list has no record of, and a profile nobody has claimed yet
    (bell-only, no DM) is told nothing at all."""
    if not profile:
        return
    try:
        from app.routers.staff import notify_profile
        notify_profile(db, profile, nkey, params)
        db.commit()
    except Exception:
        db.rollback()
        log.exception("idle-cell: could not notify %s about %s", profile, nkey)


def _row_facts(e: CellOjidaniyaInterval, cell: Optional[Cell]) -> dict:
    """The shared vocabulary every idle-cell notification is written in."""
    return {
        "cell": (getattr(cell, "verifix_code", None) or f"#{e.cell_id}"),
        "category": e.category,
        "time": f"{e.start}–{e.end}",
        "date": e.date,
    }


@router.post("/intervals")
def create_interval(
    body: IntervalIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Log one ojidaniya. Overlapping an existing one is ALLOWED and expected —
    a cell can genuinely be waiting on two causes at once, and the union is what
    keeps the shared minutes from being counted twice.

    The row counts from this moment, whoever files it. What differs by caller
    is only who gets TOLD: an author who could not correct the entry themselves
    (a leader) is filing onto somebody else's register, so that unit's brigadir
    is notified of it; a brigadir or admin entering their own is not told about
    their own work. The answer is the server's, because the endpoint is
    reachable without the UI."""
    note, stopped, _ = _validate(body, db, payload)
    cell = _cell_of(db, body.cell_id)
    idle_lock.require_open(db, getattr(cell, "manager_id", None), body.date)

    ctx = _decider(db, payload)
    decides = _may_decide(ctx, cell)
    # A cell with no brigadir has nobody to review a leader's entry, and no
    # listing could show it either (every view is keyed on a supervisor) — so
    # it is refused at the door rather than counted where nobody can see or
    # correct it, for the same reason a future date is.
    if not decides and not getattr(cell, "manager_id", None):
        raise HTTPException(status_code=400,
                            detail="This cell has no brigadir to review the entry")
    viewer = identity.viewer_profile_key(db, payload)

    e = CellOjidaniyaInterval(
        cell_id=body.cell_id, date=body.date, category=body.category,
        start=body.start, end=body.end, stopped=stopped, note=note,
        entered_by_profile=viewer,
        status="approved",
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    _alert(db, payload, e.cell_id, e.date, "idle_cell.interval_added",
           [("category", None, e.category), ("time", None, f"{e.start}–{e.end}"),
            ("note", None, e.note)])

    if not decides and cell is not None and cell.manager_id:
        # The unit's brigadir is the one who reviews it. Admins are deliberately
        # not DMed per entry: a chat carrying every cell's waits is a chat
        # nobody reads.
        _tell(db, identity.profile_key("supervisor", cell.manager_id),
              "idle_request_new",
              {**_row_facts(e, cell),
               "leader_name": identity.profile_display_name(db, viewer) or "—"})

    return _interval_json(e, _names_for(db, [e.entered_by_profile]),
                          _row_perm(e, decides, True))


@router.put("/intervals/{interval_id}")
def update_interval(
    interval_id: int,
    body: IntervalIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Correct one ojidaniya in place. The cell it belongs to is checked twice —
    the row's own cell and the body's — so an edit can never walk an entry into
    a cell the caller may write to from one the caller may not read.

    Status never moves here: the row was approved when it was saved and stays
    so, and a rejected leftover is read-only (``_row_perm``)."""
    e = db.query(CellOjidaniyaInterval).filter(CellOjidaniyaInterval.id == interval_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    note, stopped, _ = _validate(body, db, payload)

    cell = _cell_of(db, e.cell_id)
    idle_lock.require_open(db, getattr(cell, "manager_id", None), e.date)
    ctx = _decider(db, payload)
    decides = _may_decide(ctx, cell)
    perm = _row_perm(e, decides, True)
    if not perm["can_edit"]:
        # An entry belongs to the register, not to whoever filed it: its author
        # may read it, and the unit's brigadir is who corrects it.
        raise HTTPException(status_code=403, detail="Only the unit's brigadir may edit this entry")

    old = (e.category, f"{e.start}–{e.end}", bool(e.stopped), e.note or "")
    e.category, e.start, e.end = body.category, body.start, body.end
    e.stopped, e.note = stopped, note
    db.commit()
    db.refresh(e)

    new = (e.category, f"{e.start}–{e.end}", bool(e.stopped), e.note or "")
    diff = [(k, o, n) for k, o, n in
            zip(("category", "time", "stopped", "note"), old, new) if o != n]
    if diff:
        _alert(db, payload, e.cell_id, e.date, "idle_cell.interval_edited", diff)

    return _interval_json(e, _names_for(db, [e.entered_by_profile, e.decided_by_profile]),
                          _row_perm(e, decides, True))


@router.delete("/intervals/{interval_id}", status_code=204)
def delete_interval(
    interval_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Remove one ojidaniya (scope-checked; unit editors only)."""
    e = db.query(CellOjidaniyaInterval).filter(CellOjidaniyaInterval.id == interval_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    cell = _cell_of(db, e.cell_id)
    idle_lock.require_open(db, getattr(cell, "manager_id", None), e.date)
    ctx = _decider(db, payload)
    if not _row_perm(e, _may_decide(ctx, cell), True)["can_delete"]:
        raise HTTPException(status_code=403, detail="Only the unit's brigadir may delete this entry")
    # Snapshot before the delete — the row is unreadable after commit.
    cell_id, date = e.cell_id, e.date
    changes = [("category", e.category, None), ("time", f"{e.start}–{e.end}", None),
               ("note", e.note or "", None)]
    db.delete(e)
    db.commit()
    _alert(db, payload, cell_id, date, "idle_cell.interval_deleted", changes)


@router.delete("/{entry_id}", status_code=204)
def delete_legacy(
    entry_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Retire one pre-2026-08-20 minutes-only row (scope-checked). There is no
    writer for that table any more: a row with no start and no end cannot be
    de-duplicated against anything, so the only honest operations left on it are
    reading it and replacing it with real ranges."""
    e = db.query(CellOjidaniya).filter(CellOjidaniya.id == entry_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Entry not found")
    if e.cell_id not in {c.id for c in _scoped_cells(db, payload)}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    cell = _cell_of(db, e.cell_id)
    idle_lock.require_open(db, getattr(cell, "manager_id", None), str(e.date))
    if not _may_decide(_decider(db, payload), cell):
        raise HTTPException(status_code=403, detail="Only the unit's brigadir may retire a legacy row")
    cell_id, date = e.cell_id, str(e.date)
    changes = [("stopped", float(e.stopped or 0), None),
               ("not_stopped", float(e.not_stopped or 0), None),
               ("note", e.note or "", None)]
    db.delete(e)
    db.commit()
    _alert(db, payload, cell_id, date, "idle_cell.deleted", changes)
