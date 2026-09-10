"""«Mening toifam» (`/idle-owner`) — the ojidaniya register read CAUSE-first,
plus the admin register that says who owns which cause.

Why a page of its own rather than a narrowed `/downtime`: see the module
docstring of `services/idle_owner`. What lives HERE is the fetching and the
scope; every figure is computed in that service, which in turn reaches them
through `services/ojidaniya_cost` — the split `ojidaniya_deck` already keeps, so
nothing in `services/` imports a router and nothing in a router does
arithmetic.

**Scope is decided on the server, twice.** The unit set through
`factory_scope.scoped_manager_ids` (so a plant lock still holds) and the
CATEGORY set through `services/idle_scope` (so a «Kutish mas'uli» reads their
own causes and no others). `?cats=` is a query parameter anyone can type, and an
EMPTY resolved scope is a real answer meaning «nothing», never «everything».

**The page is open to more than its owners.** An admin, a top-manager or anyone
an admin opens the page to reads it unlocked — the register is useful to whoever
is chasing a cause, and the lock is a property of the ROLE, not of the page.
"""
from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import Manager, RoleProfile
from app.permissions import require_page
from app.services import action_log, idle_owner, idle_scope, wage_rate
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.idle_owner_export import build_owner_workbook
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/idle-owner", tags=["idle-owner"])

PAGE = "idle-owner"

# The register is per EVENT and the page draws a point per day, so the window is
# bounded like every other ojidaniya surface. 400 days is `/downtime`'s own cap.
_MAX_DAYS = 400


def _window(date_from: Optional[date], date_to: Optional[date]) -> tuple:
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=29)
    if date_from > date_to:
        raise HTTPException(status_code=400, detail="date_from is after date_to")
    if (date_to - date_from).days + 1 > _MAX_DAYS:
        raise HTTPException(status_code=400,
                            detail=f"Period longer than {_MAX_DAYS} days")
    return date_from, date_to


def _scope(db: Session, payload: dict, factory: Optional[int],
           shift: Optional[int], manager_id: List[int]) -> list[int]:
    """The units this viewer may read, after the plant lock and their own
    supervisor pick. An EMPTY list is a real answer."""
    scoped = scoped_manager_ids(db, payload, factory, manager_id)
    if empty_scope(scoped):
        return []
    q = db.query(Manager.id).filter(Manager.archived.is_(False))
    if shift:
        q = q.filter(Manager.shift == shift)
    if scoped is not None:
        q = q.filter(Manager.id.in_(scoped))
    return [r[0] for r in q.all()]


def _cats(db: Session, payload: dict, cats: List[str]) -> Optional[list[str]]:
    """The category scope for this request, or None for «every category».

    A viewer who is NOT a «Kutish mas'uli» — an admin chasing a cause, a
    top-manager reading the register — is unlocked, so an empty pick means the
    whole register rather than nothing. That asymmetry is the entire difference
    between a lock and a filter, and `idle_scope.resolve_cats` is where it lives.
    """
    return idle_scope.resolve_cats(db, payload, cats)


def _pre_rows(db: Session, payload: dict, date_from: date, date_to: date,
              shift: Optional[int], manager_id: List[int],
              factory: Optional[int]) -> Optional[list[dict]]:
    """`/downtime`'s own rows for the era before the typed per-cell headcount.

    Imported from the downtime router rather than re-derived: that function is
    the platform's one answer to «how much did this unit wait», it already
    merges the cells era with the «Смена отчёт» era and applies the day-close
    gate, and a second spelling here is how this page and the «Xarajat» tab
    would come to cover different days.
    """
    from app.routers.downtime import _pre_floor_rows
    return _pre_floor_rows(db, payload, date_from, date_to, shift, manager_id,
                           factory)


def _mine(db: Session, payload: dict) -> dict:
    """What the page says about the person reading it: which categories they
    OWN (as opposed to which they are currently looking at), and whether they
    are locked to them at all."""
    lock = idle_scope.viewer_categories(db, payload)
    return {
        "locked": lock is not None,
        "owned": list(lock or []),
        "labels": idle_scope.owner_labels(db),
        "all": idle_scope.CATEGORIES,
    }


@router.get("/overview")
def get_overview(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    cats: List[str] = Query(default=[]),
    factory: Optional[int] = Query(default=None),
    # The equal-length window immediately before this one. Off by default so a
    # reader paging through a register does not pay for a second full
    # computation they are not looking at.
    compare: bool = Query(default=True),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE, "downtime")),
):
    """KPI, trend and the two ranked boards, for the categories in scope."""
    date_from, date_to = _window(date_from, date_to)
    ids = _scope(db, payload, factory, shift, manager_id)
    cat_scope = _cats(db, payload, cats)
    if idle_scope.empty_scope(cat_scope):
        ids = []      # an owner of nothing sees nothing, never everything
    rate_for = wage_rate.resolver(wage_rate.load(db))

    out = idle_owner.overview(
        db, ids, date_from, date_to, list(cat_scope or []), rate_for,
        pre_rows=_pre_rows(db, payload, date_from, date_to, shift, manager_id,
                           factory),
        # The LOCK, never the pick: the reader's own category choice must not
        # shorten the list it was chosen from.
        cat_lock=idle_scope.viewer_categories(db, payload))
    out["mine"] = _mine(db, payload)
    out["owners"] = idle_scope.owner_labels(db)

    if compare and ids:
        p_from, p_to = idle_owner.previous_window(date_from, date_to)
        out["prev"] = idle_owner.totals_only(
            db, ids, p_from, p_to, list(cat_scope or []), rate_for,
            pre_rows=_pre_rows(db, payload, p_from, p_to, shift, manager_id,
                               factory),
            cat_lock=idle_scope.viewer_categories(db, payload))
        out["prev_window"] = {"from": p_from.isoformat(), "to": p_to.isoformat()}
    return out


@router.get("/events")
def get_events(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    shift: Optional[int] = Query(default=None),
    manager_id: List[int] = Query(default=[]),
    cell_id: List[int] = Query(default=[]),
    cats: List[str] = Query(default=[]),
    factory: Optional[int] = Query(default=None),
    q: str = Query(default=""),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=idle_owner.PAGE_MAX),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE, "downtime")),
):
    """The register — one row per filed event, newest first.

    Paginated on the server: a plant-wide category over a quarter is thousands
    of events, and the whole point of the table is that it can be read.
    """
    date_from, date_to = _window(date_from, date_to)
    ids = _scope(db, payload, factory, shift, manager_id)
    cat_scope = _cats(db, payload, cats)
    if idle_scope.empty_scope(cat_scope):
        ids = []
    return idle_owner.register(
        db, ids, date_from, date_to, list(cat_scope or []),
        wage_rate.resolver(wage_rate.load(db)),
        search=q, cell_ids=cell_id, offset=offset, limit=limit)


class OwnerExportBody(BaseModel):
    date_from: str
    date_to: str
    shift: Optional[int] = None
    manager_id: List[int] = []
    cell_id: List[int] = []
    cats: List[str] = []
    factory: Optional[int] = None
    q: str = ""
    title: Optional[str] = None
    subtitle: Optional[str] = None
    scope: List[dict] = []
    labels: dict = {}
    cats_meta: dict = {}


@router.post("/export.xlsx")
def export_owner(
    request: Request,
    body: OwnerExportBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE, "downtime")),
):
    """The page as a workbook: KPI + the two boards + the whole register.

    The client sends the SCOPE and the WORDS; every figure is computed here,
    through the very functions the screen reads, so the file can never state a
    number the page it was pressed on does not.
    """
    try:
        d1, d2 = date.fromisoformat(body.date_from), date.fromisoformat(body.date_to)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    d1, d2 = _window(d1, d2)

    ids = _scope(db, payload, body.factory, body.shift, body.manager_id)
    cat_scope = _cats(db, payload, body.cats)
    if idle_scope.empty_scope(cat_scope):
        ids = []
    cl = list(cat_scope or [])
    rate_for = wage_rate.resolver(wage_rate.load(db))

    over = idle_owner.overview(
        db, ids, d1, d2, cl, rate_for,
        pre_rows=_pre_rows(db, payload, d1, d2, body.shift, body.manager_id,
                           body.factory),
        cat_lock=idle_scope.viewer_categories(db, payload))
    # The whole register, not the page on screen: a file is what somebody opens
    # away from the app, and a workbook holding fifty of nine hundred rows is a
    # file that lies about the period on its own cover.
    reg = idle_owner.register(db, ids, d1, d2, cl, rate_for, search=body.q,
                              cell_ids=body.cell_id, offset=0,
                              limit=idle_owner.PAGE_MAX)
    rows = reg["rows"]
    while len(rows) < reg["total"]:
        more = idle_owner.register(db, ids, d1, d2, cl, rate_for, search=body.q,
                                   cell_ids=body.cell_id, offset=len(rows),
                                   limit=idle_owner.PAGE_MAX)
        if not more["rows"]:
            break
        rows += more["rows"]

    owners = idle_scope.owner_labels(db)
    blob = build_owner_workbook({
        "title": body.title or "Ojidaniya · toifa",
        "subtitle": body.subtitle or "",
        "scope": body.scope, "labels": body.labels,
        "cats_meta": {c: {**(m or {}), "owner": (owners.get(c) or {}).get("name") or ""}
                      for c, m in (body.cats_meta or {}).items()},
        "cats": over["cats"], "managers": over["managers"],
        "cells": over["cells"], "daily": over["daily"],
        "totals": over["totals"], "prev": over.get("prev"),
        "events": rows,
    }).getvalue()

    fname = f"ojidaniya-toifa-{body.date_from}_{body.date_to}.xlsx"
    resp = deliver_xlsx(request, payload, fname, blob)
    action_log.enrich(
        target_kind="report", target_id=fname,
        details=[("file", fname), ("from_date", body.date_from),
                 ("to_date", body.date_to), ("cats", ", ".join(cl) or "—"),
                 ("events", len(rows)), ("size", len(blob))],
    )
    return resp


# ── the admin register: WHO owns which category ──────────────────────────────
#
# Admin-only and NOT grantable: no capability exists for it, so
# `capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
# / `logs` / `ltdaily` model. The assignment decides what a whole role is
# allowed to read, so handing it out is handing out the ability to widen
# somebody's scope.

def _verify_admin(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")


@router.get("/admin/owners")
def list_owners(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE, "downtime")),
):
    """Every category and the person answerable for it, plus the profiles an
    admin may assign.

    Readable by anyone who can open the page — a name printed beside a category
    on four surfaces is not a secret, and hiding the register would only make
    those names unexplainable. WRITING is admin-only; see below.
    """
    labels = idle_scope.owner_labels(db)
    assigned = idle_scope.owners(db)
    rows = [{
        "category": c,
        "profile_key": assigned.get(c),
        "owner": labels.get(c),
    } for c in idle_scope.CATEGORIES]

    # The pick list. «Kutish mas'uli» profiles first because that is the role
    # the page exists for, then everybody else who could hold the answer — a
    # brigadir or a shift manager may perfectly well own a cause, and refusing
    # to offer them would make the register describe less than reality.
    people = [{
        "profile_key": f"{p.role}:{p.id}", "role": p.role, "id": p.id,
        "name": p.name, "name_uz_cyrl": p.name_uz_cyrl,
        "name_ru": p.name_ru, "name_en": p.name_en,
    } for p in db.query(RoleProfile).filter(
        RoleProfile.role.in_((idle_scope.OWNER_ROLE, "shift-manager", "top-manager"))
    ).order_by(RoleProfile.role, RoleProfile.name).all()]
    people += [{
        "profile_key": f"supervisor:{m.id}", "role": "supervisor", "id": m.id,
        "name": m.name, "name_uz_cyrl": None, "name_ru": None, "name_en": None,
    } for m in db.query(Manager).filter(Manager.archived.is_(False))
        .order_by(Manager.name).all()]

    return {"rows": rows, "people": people,
            "can_edit": payload.get("role") == "admin"}


class OwnerAssignBody(BaseModel):
    # A LIST, so one toggle and a bulk press are one call and one transaction —
    # the rule `PUT /admin/leader-tasks/cell-from` already keeps. A null
    # profile_key CLEARS that category.
    assignments: List[dict]


@router.put("/admin/owners")
def put_owners(
    request: Request,
    body: OwnerAssignBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE, "downtime")),
):
    """Assign or clear the owner of one or more categories.

    Checked here and not merely by hiding the control: the endpoint is
    reachable without the UI, and this is what decides which register a whole
    role may read.
    """
    _verify_admin(payload)

    actor = None
    try:
        actor = int(payload.get("sub"))
    except (TypeError, ValueError):
        pass

    before = idle_scope.owners(db)
    changed = []
    for a in body.assignments or []:
        cat = str((a or {}).get("category") or "")
        key = (a or {}).get("profile_key") or None
        if cat not in idle_scope.CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Unknown category: {cat}")
        if key:
            role, ref = identity.parse_profile_key(key)
            # A key naming nothing would store an owner no reader can resolve,
            # which prints as «nobody is assigned» while the register says
            # somebody is — the one state this table must not be able to hold.
            exists = (
                db.query(Manager).filter(Manager.id == ref).first() if role == "supervisor"
                else db.query(RoleProfile).filter(RoleProfile.id == ref,
                                                  RoleProfile.role == role).first()
            ) if ref else None
            if not exists:
                raise HTTPException(status_code=400, detail=f"Unknown profile: {key}")
        if before.get(cat) != key:
            changed.append((cat, before.get(cat), key))
        idle_scope.set_owner(db, cat, key, actor)
    db.commit()

    # `changes` is the old→new table the register renders — one line per
    # category that actually moved, so «why is Cat D3 mine now» is answerable
    # from «Jurnal» rather than from memory.
    action_log.enrich(
        target_kind="setting", target_id="idle_category_owners",
        details=[("changed", len(changed))],
        changes=[(c, w or "—", n or "—") for c, w, n in changed],
    )
    return {"rows": list_owners(db, payload)["rows"], "changed": len(changed)}
