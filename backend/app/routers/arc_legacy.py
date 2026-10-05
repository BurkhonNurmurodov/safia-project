"""
ARC service-ticket register from the OLD login API (page /arc-legacy) — the
tickets mirrored from it by services/arc_legacy_sync.py, served as a
filterable, sortable, exportable register with a KPI strip.

Every derived fact the page shows («open», «late», hours-to-close …) is
defined ONCE, in :func:`_derived`, as SQL expressions over the row's own
timestamps, and every endpoint — list, stats, export — filters, sorts, counts
and serialises through those same expressions. A number on the KPI strip is
therefore always a count over exactly the rows the table would show for the
same filters; there is no second copy of «what counts as open» to drift.

Rows the API stopped returning (``missing_since`` set by a completed full
walk) are hidden unless ``include_missing`` is asked for — visible on request,
never deleted, never counted by default.

From 2026-10-05 the page is TWO tabs over this one register, as /arc is:
«Barchasi» and «Yacheykalar bo'yicha». The link between IT's ticket and this
platform's cell is the ticket's ``warehouse_name`` — the new app's field from
29 Sep 2026, the cell's Verifix code in front («8920 Цех Выпекания») —
read by ``arc_cells.warehouse_code_expr`` into ``cell_code`` and resolved to
the cell's brigadir and leader through the same ``arc_cells`` walk /arc uses.
The cells tab carries /arc's two narrowings of its own — ``cells_only`` and the
owner scope — and counts back what they hide (``hidden_no_cell`` /
``hidden_unassigned`` on /stats); the org chain (shift → brigadir → leader →
cell) narrows both tabs.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import Float, Text, and_, case, cast, false, func, not_, or_
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArcLegacyRequest, ArcLegacySyncMeta
from app.permissions import require_page
from app.translit import transliterate
from app.services import action_log, arc_cells, arc_legacy_client, arc_legacy_discovery
from app.services.arc_legacy_export import build_arc_legacy_workbook
from app.services.arc_legacy_sync import _live, start_sync_thread
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/arc-legacy", tags=["arc_legacy"])

PAGE = "arc"

# The plant's wall clock. Tashkent has no DST, so a fixed offset is exact and
# spares the day-bound math a zoneinfo lookup per request.
_TASHKENT = timezone(timedelta(hours=5))

NOT_CONFIGURED_MSG = ("The old ARC API is not connected. Add ARC_USERNAME/ARC_PASSWORD "
                      "(or USERNAME/PASSWORD) to the backend .env.")


# ── derived semantics (THE one definition) ───────────────────────────────────

def _derived() -> dict[str, Any]:
    """The page's derived facts as SQL expressions over ArcLegacyRequest.

    closed_at     = coalesce(completed_at, finished_at)
    is_cancelled  = cancelled_at IS NOT NULL
    is_open       = closed_at IS NULL AND NOT is_cancelled
    is_closed     = closed_at IS NOT NULL AND NOT is_cancelled
    due           = coalesce(deadline_time, deadline)
    late          = due IS NOT NULL AND coalesce(closed_at, now()) > due
    overdue_now   = is_open AND (is_overdue OR late)
    hours_to_close= (closed_at − created_at) in hours, when closed
    cell_code     = the four digits the warehouse name carries, else NULL
    """
    R = ArcLegacyRequest
    closed_at = func.coalesce(R.completed_at, R.finished_at)
    is_cancelled = R.cancelled_at.isnot(None)
    is_open = and_(closed_at.is_(None), not_(is_cancelled))
    is_closed = and_(closed_at.isnot(None), not_(is_cancelled))
    due = func.coalesce(R.deadline_time, R.deadline)
    late = and_(due.isnot(None), func.coalesce(closed_at, func.now()) > due)
    overdue_now = and_(is_open, or_(R.is_overdue.is_(True), late))
    hours_to_close = case(
        (closed_at.isnot(None),
         cast(func.extract("epoch", closed_at - R.created_at), Float) / 3600.0),
        else_=None,
    )
    return {
        "closed_at": closed_at,
        "is_cancelled": is_cancelled,
        "is_open": is_open,
        "is_closed": is_closed,
        "due": due,
        "late": late,
        "overdue_now": overdue_now,
        "hours_to_close": hours_to_close,
        "cell_code": arc_cells.warehouse_code_expr(),
    }


# The derived columns that ride along with every serialised row, in the order
# they are selected. is_closed is a stats-only helper (it is the complement of
# open+cancelled and adds nothing to a row).
_ROW_DERIVED = ("closed_at", "is_cancelled", "is_open", "due", "late",
                "overdue_now", "hours_to_close", "cell_code")


# ── filters ──────────────────────────────────────────────────────────────────

def _ints(values: list[str]) -> list[int]:
    out = []
    for v in values or []:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out


def _owner_scope(scope: Optional[str]) -> str:
    """The cells tab's owner scope: "" (every cell), "manager" (cells with a
    brigadir) or "leader" (cells with a lider) — /arc's rule. Anything else is
    no scope, never a silently empty one."""
    s = (scope or "").strip().lower()
    return s if s in arc_cells.OWNER_LEVELS else ""


def _filters(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: list[str] = Query(default=[]),
    category: list[str] = Query(default=[]),
    branch: list[str] = Query(default=[]),
    master: list[str] = Query(default=[]),
    cell: list[str] = Query(default=[]),
    shift: list[str] = Query(default=[]),
    manager: list[str] = Query(default=[]),
    leader: list[str] = Query(default=[]),
    urgent: str = Query("all"),
    overdue: str = Query("all"),
    sap: str = Query("all"),
    state: str = Query("all"),
    q: Optional[str] = Query(None),
    include_missing: bool = Query(False),
    cells_only: bool = Query(False),
    owner_scope: str = Query(""),
) -> dict:
    return {"date_from": date_from, "date_to": date_to, "status": status,
            "category": category, "branch": branch, "master": master,
            "cell": cell, "shift": shift, "manager": manager, "leader": leader,
            "urgent": urgent, "overdue": overdue, "sap": sap, "state": state,
            "q": q, "include_missing": include_missing, "cells_only": cells_only,
            "owner_scope": _owner_scope(owner_scope)}


def _day_start(s: Optional[str]) -> Optional[datetime]:
    """«YYYY-MM-DD» → that Tashkent day's first instant, UTC-aware."""
    if not s:
        return None
    try:
        d = date_cls.fromisoformat(s[:10])
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Bad date: {s}")
    return datetime(d.year, d.month, d.day, tzinfo=_TASHKENT).astimezone(timezone.utc)


def _tri(value: str, expr) -> Optional[Any]:
    """all|yes|no over a boolean expression (NULL reads as «no»)."""
    if value == "yes":
        return expr.is_(True)
    if value == "no":
        return func.coalesce(expr, False).is_(False)
    return None


def _apply_filters(query, f: dict, D: dict, db: Session):
    """The one place the filter set becomes WHERE clauses; list, stats and
    export all go through it."""
    R = ArcLegacyRequest
    if not f.get("include_missing"):
        query = query.filter(R.missing_since.is_(None))
    lo = _day_start(f.get("date_from"))
    if lo is not None:
        query = query.filter(R.created_at >= lo)
    hi = _day_start(f.get("date_to"))
    if hi is not None:
        query = query.filter(R.created_at < hi + timedelta(days=1))
    if f.get("status"):
        query = query.filter(R.normalized_status.in_(f["status"]))
    if f.get("category"):
        query = query.filter(R.category_id.in_(f["category"]))
    if f.get("branch"):
        query = query.filter(R.branch_id.in_(f["branch"]))
    if f.get("master"):
        query = query.filter(R.master_id.in_(f["master"]))
    # The cell the warehouse NAMES, by its code — the value the cell column and
    # the cells tab's owner columns are read off, so the pick and the columns
    # can never mean two things. «No cell» (arc_cells.NO_CELL) is a pick like
    # any other: the tickets whose warehouse names none, or that carry none.
    code = D["cell_code"]
    picked = [c for c in (f.get("cell") or []) if c]
    if picked:
        conds = []
        codes = [c for c in picked if c != arc_cells.NO_CELL]
        if codes:
            conds.append(code.in_(codes))
        if arc_cells.NO_CELL in picked:
            conds.append(code.is_(None))
        query = query.filter(or_(*conds))
    # «Yacheykalar bo'yicha» asks whose cell a ticket is on; a ticket whose
    # warehouse names none has no answer to it, so that tab narrows to the ones
    # that do — counted back as `hidden_no_cell` on /stats, never dropped in
    # silence.
    if f.get("cells_only"):
        query = query.filter(code.isnot(None))
    # …and, unless the reader lifted it, to the cells an owner is on at the level
    # the toggle names (arc_cells.assigned_codes is the whole rule). An empty set
    # is a real answer: an empty register, never the whole plant.
    scope = f.get("owner_scope") or ""
    if scope:
        owned = arc_cells.assigned_codes(db, scope, code)
        query = query.filter(code.in_(sorted(owned))) if owned else query.filter(false())
    # The org chain — shift → brigadir → leader — reaches a ticket only through
    # its cell, so it narrows to a SET OF CODES (plus, for «Biriktirilmagan»,
    # the tickets naming no cell) and meets the register at the same expression.
    shifts = _ints(f.get("shift") or [])
    mgrs = [str(v) for v in (f.get("manager") or []) if str(v).strip()]
    leads = [str(v) for v in (f.get("leader") or []) if str(v).strip()]
    if shifts or mgrs or leads:
        codes, with_null = arc_cells.org_codes(db, shifts, mgrs, leads, code)
        conds = []
        if codes:
            conds.append(code.in_(sorted(codes)))
        if with_null:
            conds.append(code.is_(None))
        query = query.filter(or_(*conds)) if conds else query.filter(false())
    for key, expr in (("urgent", R.category_is_urgent),
                      ("sap", R.sended_to_sap)):
        cond = _tri(f.get(key) or "all", expr)
        if cond is not None:
            query = query.filter(cond)
    ov = f.get("overdue") or "all"
    if ov == "yes":
        query = query.filter(D["overdue_now"])
    elif ov == "no":
        query = query.filter(not_(D["overdue_now"]))
    state = f.get("state") or "all"
    if state == "open":
        query = query.filter(D["is_open"])
    elif state == "closed":
        query = query.filter(D["is_closed"])
    elif state == "cancelled":
        query = query.filter(D["is_cancelled"])
    q = (f.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            cast(R.request_num, Text).ilike(like),
            R.description.ilike(like),
            R.branch_name.ilike(like),
            R.client_name.ilike(like),
            R.master_name.ilike(like),
            R.warehouse_name.ilike(like),
        ))
    return query


# ── sorting ──────────────────────────────────────────────────────────────────

def _sort_expr(sort: Optional[str], D: dict):
    """«key:dir» → ORDER BY terms. Unknown keys fall back to created_at:desc.
    «deadline» (and «due») sort by the effective due moment the table shows."""
    R = ArcLegacyRequest
    key, _, direction = (sort or "created_at:desc").partition(":")
    desc = (direction or "desc").lower() != "asc"
    cols = {
        "request_num": R.request_num,
        "created_at": R.created_at,
        "deadline": D["due"],
        "due": D["due"],
        "branch_name": R.branch_name,
        "category_name": R.category_name,
        "master_name": R.master_name,
        "normalized_status": R.normalized_status,
        "closed_at": D["closed_at"],
        "hours_to_close": D["hours_to_close"],
        "cell_code": D["cell_code"],
        "warehouse_name": R.warehouse_name,
    }
    col = cols.get(key)
    if col is None:
        col, desc = R.created_at, True
    primary = col.desc().nullslast() if desc else col.asc().nullslast()
    tiebreak = R.id.desc() if desc else R.id.asc()
    return primary, tiebreak


# ── serialisation ────────────────────────────────────────────────────────────

def _iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


_ROW_COLS = (
    "remote_id", "request_num", "branch_id", "branch_name", "country_id",
    "description", "category_id", "category_name", "category_is_urgent",
    "category_deadline_hours", "deadline", "deadline_time", "master_id",
    "master_name", "status", "normalized_status", "status_color", "is_overdue",
    "created_at", "cancelled_at", "finished_at", "completed_at", "extra_phone",
    "latitude", "longitude", "deny_reason", "sended_to_sap", "photo_report",
    "comment_report", "document_url", "has_other_active", "other_active_count",
    "client_name", "warehouse_id", "warehouse_name", "first_seen_at",
    "synced_at", "missing_since",
)


def _serialize(r: ArcLegacyRequest, derived: dict[str, Any], with_raw: bool = False) -> dict:
    """A row + its derived facts (as computed by the SAME SQL the filters
    use, never re-derived in Python)."""
    out: dict[str, Any] = {"id": r.remote_id}
    for c in _ROW_COLS:
        v = getattr(r, c)
        out[c] = _iso(v) if isinstance(v, datetime) else v
    out["closed_at"] = _iso(derived.get("closed_at"))
    out["due"] = _iso(derived.get("due"))
    # The cell the warehouse NAMES — digits only; which cell that is comes from
    # the payload's own `cells` map, keyed by code.
    out["cell_code"] = derived.get("cell_code")
    out["is_cancelled"] = bool(derived.get("is_cancelled"))
    out["is_open"] = bool(derived.get("is_open"))
    out["late"] = bool(derived.get("late"))
    out["overdue_now"] = bool(derived.get("overdue_now"))
    h = derived.get("hours_to_close")
    out["hours_to_close"] = round(float(h), 2) if h is not None else None
    if with_raw:
        out["raw"] = r.raw
    return out


def _rows_query(db: Session, f: dict, D: dict):
    """The register query: the entity plus its derived facts, filtered."""
    query = db.query(ArcLegacyRequest, *[D[k].label(k) for k in _ROW_DERIVED])
    return _apply_filters(query, f, D, db)


def _cells_map(db: Session, rows: list[dict]) -> dict[str, dict]:
    """{code → cell} for the codes in these rows (id, both codes, the leader and
    the brigadir), so the page names each unit once per page. A code no
    registered cell answers to is absent — the row keeps its digits."""
    codes = {r.get("cell_code") for r in rows if r.get("cell_code")}
    return arc_cells.cells_for(db, codes) if codes else {}


def _fetch_rows(query, D: dict, sort: Optional[str], offset: int = 0,
                limit: Optional[int] = None) -> list[dict]:
    query = query.order_by(*_sort_expr(sort, D))
    if offset:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)
    out = []
    for tup in query.all():
        r = tup[0]
        derived = dict(zip(_ROW_DERIVED, tup[1:]))
        out.append(_serialize(r, derived))
    return out


# ── sync state ───────────────────────────────────────────────────────────────

def _sync_state(meta: Optional[ArcLegacySyncMeta]) -> dict:
    return {
        "last_synced": _iso(meta.last_synced) if meta else None,
        "ok": meta.ok if meta else None,
        "message": meta.message if meta else None,
        "row_count": (meta.row_count if meta else 0) or 0,
        "remote_total": (meta.remote_total if meta else 0) or 0,
        "running": _live(meta),
        "progress_done": (meta.progress_done if meta else 0) or 0,
        "progress_total": (meta.progress_total if meta else 0) or 0,
        "mode": meta.mode if meta else None,
        "started_at": _iso(meta.started_at) if meta else None,
        "last_full_at": _iso(meta.last_full_at) if meta else None,
        "spec_available": bool(meta and meta.spec is not None),
        # What the API says it holds under the widest parameters we found, vs
        # what we hold. The two numbers side by side are the whole «are we
        # missing data?» question — never make the reader compute it.
        "probe_at": _iso(getattr(meta, "probe_at", None)) if meta else None,
        "filters": getattr(meta, "filters", None) if meta else None,
    }


def _options(db: Session) -> dict:
    """Filter option lists over the rows the API still returns. Statuses group
    by ``normalized_status`` ALONE (one colour per value via min): the page keys
    the list by value, and one status carrying two colours upstream would
    otherwise render as two identical rows."""
    R = ArcLegacyRequest
    base = db.query(R).filter(R.missing_since.is_(None))
    statuses = [
        {"value": ns, "label": ns, "color": col, "count": n}
        for ns, col, n in (base.with_entities(R.normalized_status, func.min(R.status_color), func.count(R.id))
                           .group_by(R.normalized_status)
                           .order_by(R.normalized_status).all())
        if ns
    ]
    categories = [
        {"id": cid, "name": name, "is_urgent": bool(urg), "count": n}
        for cid, name, urg, n in (base.with_entities(R.category_id, R.category_name,
                                                     R.category_is_urgent, func.count(R.id))
                                  .group_by(R.category_id, R.category_name, R.category_is_urgent)
                                  .order_by(R.category_name).all())
        if cid
    ]
    branches = [
        {"id": bid, "name": name, "count": n}
        for bid, name, n in (base.with_entities(R.branch_id, R.branch_name, func.count(R.id))
                             .group_by(R.branch_id, R.branch_name)
                             .order_by(R.branch_name).all())
        if bid
    ]
    masters = [
        {"id": mid, "name": name, "count": n}
        for mid, name, n in (base.with_entities(R.master_id, R.master_name, func.count(R.id))
                             .group_by(R.master_id, R.master_name)
                             .order_by(R.master_name).all())
        if mid
    ]
    return {"statuses": statuses, "categories": categories,
            "branches": branches, "masters": masters, **_cell_options(db, base)}


def _cell_options(db: Session, base) -> dict:
    """The cell list and the org chain behind it (shift → brigadir → leader),
    counted in TICKETS over the same rows as the other lists here — the whole
    mirror, as every list on this page is. Each option carries its own place in
    the chain (`sh`, `mgr`, `lead`, and a leader's `manager_id`), which is what
    lets the page narrow each level by the picks above it without asking again.

    «Biriktirilmagan» is counted per owner level: the tickets that reach no such
    person — the warehouse names no cell, names one the registry has never
    heard of, or the cell has nobody assigned. All three render a blank owner
    column, so all three are what that option picks (arc_cells.org_codes)."""
    R = ArcLegacyRequest
    code = arc_cells.warehouse_code_expr()
    rows = base.with_entities(code.label("code"), func.count(R.id)).group_by(code).all()
    codes = {c for c, _ in rows if c}
    known = arc_cells.cells_for(db, codes)
    org = arc_cells.org_index(db, codes)
    by_code = org["by_code"]
    cells = sorted(
        ({"code": c, "count": n, "cell": known.get(c),
          "sh": (by_code.get(c) or {}).get("shift"),
          "mgr": (by_code.get(c) or {}).get("manager_id"),
          "lead": (by_code.get(c) or {}).get("leader_id")}
         for c, n in rows if c),
        key=lambda x: x["code"],
    )

    def level(key: str) -> tuple[dict[int, int], int]:
        out: dict[int, int] = {}
        none_n = 0
        for c, n in rows:
            v = (by_code.get(c) or {}).get(key) if c else None
            if v is None:
                none_n += n
            else:
                out[v] = out.get(v, 0) + n
        return out, none_n

    def by_name(items: list[dict]) -> list[dict]:
        return sorted(items, key=lambda x: (x.get("name") or "").lower())

    shift_n, _ = level("shift")
    mgr_n, mgr_none = level("manager_id")
    lead_n, lead_none = level("leader_id")
    return {
        "cells": cells,
        "no_cell_count": sum(n for c, n in rows if not c),
        "org": {
            "shifts": [{"value": v, "count": shift_n[v]} for v in sorted(shift_n)],
            "managers": by_name([{**org["managers"][i], "count": n}
                                 for i, n in mgr_n.items() if i in org["managers"]]),
            "leaders": by_name([{**org["leaders"][i], "count": n}
                                for i, n in lead_n.items() if i in org["leaders"]]),
            "managers_none": mgr_none,
            "leaders_none": lead_none,
        },
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Sync state + filter options — one boot call for the page."""
    meta = db.query(ArcLegacySyncMeta).filter_by(id=1).first()
    return {
        "configured": arc_legacy_client.configured(),
        "can_refresh": True,
        "sync": _sync_state(meta),
        "options": _options(db),
    }


@router.get("/list")
def get_list(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    sort: str = Query("created_at:desc"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
    f: dict = Depends(_filters),
):
    """The paginated register, each row carrying its derived facts."""
    D = _derived()
    query = _rows_query(db, f, D)
    total = query.order_by(None).count()
    rows = _fetch_rows(query, D, sort, offset=(page - 1) * page_size, limit=page_size)
    return {"total": total, "page": page, "page_size": page_size, "rows": rows,
            "cells": _cells_map(db, rows)}


def _n(v) -> int:
    return int(v or 0)


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
    f: dict = Depends(_filters),
):
    """KPI figures over exactly the rows /list shows for the same filters."""
    R = ArcLegacyRequest
    D = _derived()
    base = _apply_filters(db.query(R), f, D, db)

    def _sum(cond):
        return func.coalesce(func.sum(case((cond, 1), else_=0)), 0)

    closed_with_due = and_(D["is_closed"], D["due"].isnot(None))
    late_closed = and_(D["is_closed"], D["late"])
    hours_closed = case((D["is_closed"], D["hours_to_close"]), else_=None)

    tot = base.with_entities(
        func.count(R.id),
        _sum(D["is_open"]),
        _sum(D["overdue_now"]),
        _sum(D["is_cancelled"]),
        _sum(D["is_closed"]),
        _sum(closed_with_due),
        _sum(late_closed),
        func.percentile_cont(0.5).within_group(hours_closed),
        func.avg(hours_closed),
    ).one()
    shown, n_open, n_overdue, n_cancelled, n_closed, n_cwd, n_late, med, avg = tot
    n_cwd, n_late = _n(n_cwd), _n(n_late)
    on_time = round(100.0 * (n_cwd - n_late) / n_cwd, 1) if n_cwd else None

    by_status = [
        {"value": ns, "label": ns, "color": col, "count": n}
        for ns, col, n in (base.with_entities(R.normalized_status, func.min(R.status_color), func.count(R.id))
                           .group_by(R.normalized_status)
                           .order_by(func.count(R.id).desc()).all())
    ]
    by_category = [
        {"id": cid, "name": name, "count": n, "overdue": _n(ov)}
        for cid, name, n, ov in (base.with_entities(R.category_id, R.category_name,
                                                    func.count(R.id), _sum(D["overdue_now"]))
                                 .group_by(R.category_id, R.category_name)
                                 .order_by(func.count(R.id).desc()).all())
    ]
    by_master = [
        {"id": mid, "name": name, "open": _n(o), "overdue": _n(ov),
         "closed": _n(c), "late_closed": _n(lc),
         "median_hours": round(float(m), 1) if m is not None else None}
        for mid, name, o, ov, c, lc, m in (
            base.with_entities(R.master_id, R.master_name,
                               _sum(D["is_open"]), _sum(D["overdue_now"]),
                               _sum(D["is_closed"]), _sum(late_closed),
                               func.percentile_cont(0.5).within_group(hours_closed))
            .group_by(R.master_id, R.master_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    # What the cells tab is NOT showing, in its two ways of hiding a ticket the
    # other filters kept: its warehouse names no cell, and its cell has nobody
    # at the level the owner toggle reads. Counted with BOTH of the tab's own
    # narrowings lifted, which keeps the two disjoint (/arc's rule).
    hidden_no_cell = hidden_unassigned = 0
    if f.get("cells_only") or f.get("owner_scope"):
        lifted = {**f, "cells_only": False, "owner_scope": ""}
        code = D["cell_code"]
        if f.get("cells_only"):
            hidden_no_cell = _n(
                _apply_filters(db.query(func.count(R.id)), lifted, D, db)
                .filter(code.is_(None)).scalar())
        if f.get("owner_scope"):
            owned = arc_cells.assigned_codes(db, f["owner_scope"], code)
            q_un = (_apply_filters(db.query(func.count(R.id)), lifted, D, db)
                    .filter(code.isnot(None)))
            if owned:
                q_un = q_un.filter(code.notin_(sorted(owned)))
            hidden_unassigned = _n(q_un.scalar())

    return {
        "shown": _n(shown),
        "hidden_no_cell": hidden_no_cell,
        "hidden_unassigned": hidden_unassigned,
        "open": _n(n_open),
        "overdue": _n(n_overdue),
        "cancelled": _n(n_cancelled),
        "closed": _n(n_closed),
        "closed_with_due": n_cwd,
        "late_closed": n_late,
        "on_time_pct": on_time,
        "median_hours": round(float(med), 1) if med is not None else None,
        "avg_hours": round(float(avg), 1) if avg is not None else None,
        "by_status": by_status,
        "by_category": by_category,
        "by_master": by_master,
    }


# ── analysis (the «Tahlil» mode) ─────────────────────────────────────────────
# /arc's analysis, over this register: the SAME response shape, so the page
# renders it with /arc's own component (components/arc/ArcAnalysis.jsx, given
# this endpoint). Every figure goes through _apply_filters and _derived, so the
# charts count exactly the rows the table lists. Where /arc reads its own
# columns this reads the legacy twins: «done» is `is_closed`, a category's norm
# is `category_deadline_hours`, the «where from» ranking is the warehouse
# (bo'linma, from 29 Sep 2026) and the crews are IT's `master_name`.

_GRANS = ("day", "week", "month")
_TREND_MAX_BUCKETS = 400
_TOP = 12
_TOP_LEADERS = 14


def _py_trunc(d: date_cls, gran: str) -> date_cls:
    """date_trunc's bucket start in Python (weeks start Monday, as in SQL)."""
    if gran == "week":
        return d - timedelta(days=d.weekday())
    if gran == "month":
        return d.replace(day=1)
    return d


def _next_bucket(d: date_cls, gran: str) -> date_cls:
    if gran == "week":
        return d + timedelta(weeks=1)
    if gran == "month":
        return (d.replace(day=1) + timedelta(days=32)).replace(day=1)
    return d + timedelta(days=1)


@router.get("/analysis")
def get_analysis(
    view: str = Query("all"),
    gran: str = Query("day"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
    f: dict = Depends(_filters),
):
    """Aggregates behind the analysis charts, per view, over the filtered set."""
    R = ArcLegacyRequest
    D = _derived()
    if gran not in _GRANS:
        gran = "day"
    base = _apply_filters(db.query(R), f, D, db)

    def _sum(cond):
        return func.coalesce(func.sum(case((cond, 1), else_=0)), 0)

    # ── flow trend: filed vs closed per bucket, Tashkent wall clock. The trend
    # ALONE widens a very short period to the 7-day chart minimum.
    f_trend = dict(f)
    lo_d = hi_d = None
    try:
        if f.get("date_from"):
            lo_d = date_cls.fromisoformat(f["date_from"][:10])
        if f.get("date_to"):
            hi_d = date_cls.fromisoformat(f["date_to"][:10])
    except ValueError:
        pass
    if lo_d and hi_d and (hi_d - lo_d).days + 1 < 7:
        lo_d = hi_d - timedelta(days=6)
        f_trend["date_from"] = lo_d.isoformat()
    tbase = _apply_filters(db.query(R), f_trend, D, db)

    def _bucket(col):
        return func.date_trunc(gran, func.timezone("Asia/Tashkent", col))

    created_b = _bucket(R.created_at)
    made = {k.date(): int(n) for k, n in
            (tbase.filter(R.created_at.isnot(None))
             .with_entities(created_b, func.count(R.id)).group_by(created_b).all())
            if k is not None}
    closed_b = _bucket(D["closed_at"])
    shut = {k.date(): int(n) for k, n in
            (tbase.filter(D["is_closed"])
             .with_entities(closed_b, func.count(R.id)).group_by(closed_b).all())
            if k is not None}
    span = sorted(set(made) | set(shut)
                  | ({_py_trunc(lo_d, gran)} if lo_d else set())
                  | ({_py_trunc(hi_d, gran)} if hi_d else set()))
    trend: list[dict] = []
    if span:
        cur, last = span[0], span[-1]
        while cur <= last and len(trend) < 20_000:
            trend.append({"d": cur.isoformat(), "created": made.get(cur, 0),
                          "closed": shut.get(cur, 0)})
            cur = _next_bucket(cur, gran)
    trend = trend[-_TREND_MAX_BUCKETS:]

    # ── the category mix + deadline discipline (both views), one grouped pass.
    # `cwd` = closures that HAD a deadline — the only rows a timeliness verdict
    # exists for; `allowed_h` is the category's own norm.
    closed_with_due = and_(D["is_closed"], D["due"].isnot(None))
    late_closed = and_(closed_with_due, D["late"])
    hours_closed = case((D["is_closed"], D["hours_to_close"]), else_=None)
    categories = [
        {"id": cid, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc),
         "cwd": _n(cw), "late": _n(lt), "closed_n": _n(hn),
         "avg_h": round(float(av), 1) if av is not None else None,
         "median_h": round(float(md), 1) if md is not None else None,
         "allowed_h": float(ft) if ft else None}
        for cid, name, n, dn, op, ov, cc, cw, lt, hn, av, md, ft in (
            base.with_entities(R.category_id, R.category_name, func.count(R.id),
                               _sum(D["is_closed"]), _sum(D["is_open"]),
                               _sum(D["overdue_now"]), _sum(D["is_cancelled"]),
                               _sum(closed_with_due), _sum(late_closed),
                               _sum(hours_closed.isnot(None)),
                               func.avg(hours_closed),
                               func.percentile_cont(0.5).within_group(hours_closed),
                               func.max(R.category_deadline_hours))
            .group_by(R.category_id, R.category_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    st = base.with_entities(
        func.count(R.id), _sum(D["is_closed"]), _sum(D["is_open"]),
        _sum(D["overdue_now"]), _sum(D["is_cancelled"]),
        _sum(closed_with_due), _sum(late_closed),
        func.avg(hours_closed),
    ).one()
    sla_totals = {"total": _n(st[0]), "done": _n(st[1]), "open": _n(st[2]),
                  "overdue": _n(st[3]), "cancelled": _n(st[4]),
                  "cwd": _n(st[5]), "late": _n(st[6]),
                  "avg_h": round(float(st[7]), 1) if st[7] is not None else None}

    out: dict[str, Any] = {"gran": gran, "trend": trend,
                           "categories": categories, "sla_totals": sla_totals}

    if view == "cells":
        # Per-code counts once; the top cells and both owner rollups read off
        # this pass, joined to the org chart through the SAME org_index the
        # filter panel uses.
        code = D["cell_code"]
        crows = (base.filter(code.isnot(None))
                 .with_entities(code, func.count(R.id), _sum(D["is_closed"]),
                                _sum(D["is_open"]), _sum(D["overdue_now"]),
                                _sum(D["is_cancelled"]))
                 .group_by(code).all())
        org = arc_cells.org_index(db, [c for c, *_ in crows])
        by_code = org["by_code"]
        cells = sorted(
            ({"code": c, "total": int(n), "done": _n(dn), "open": _n(op),
              "overdue": _n(ov), "cancelled": _n(cc)}
             for c, n, dn, op, ov, cc in crows),
            key=lambda x: -x["total"])
        top_cells = cells[:_TOP]
        out["cells"] = top_cells
        out["cells_n"] = len(cells)
        out["cells_map"] = arc_cells.cells_for(db, [c["code"] for c in top_cells])

        def rollup(key: str, catalog: dict) -> list[dict]:
            agg: dict = {}
            for c, n, dn, op, ov, cc in crows:
                k = (by_code.get(c) or {}).get(key)
                a = agg.setdefault(k, {"total": 0, "done": 0, "open": 0,
                                       "overdue": 0, "cancelled": 0})
                a["total"] += int(n)
                a["done"] += _n(dn)
                a["open"] += _n(op)
                a["overdue"] += _n(ov)
                a["cancelled"] += _n(cc)
            rows = []
            for k, a in agg.items():
                info = catalog.get(k) if k is not None else None
                # k None = codes the org chart cannot place — its own bucket.
                rows.append({"id": k, "name": (info or {}).get("name"), **a})
            rows.sort(key=lambda x: (-x["total"], (x["name"] or "").lower()))
            return rows

        sups = rollup("manager_id", org["managers"])
        out["sups"] = sups[:40]
        out["sups_n"] = len(sups)
        leaders = rollup("leader_id", org["leaders"])
        out["leaders"] = leaders[:_TOP_LEADERS]
        out["leaders_n"] = len(leaders)
        return out

    # ── the register view: where from (the warehouse), how fast, which crew ──
    divisions = [
        {"id": wid or name, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc)}
        for wid, name, n, dn, op, ov, cc in (
            base.filter(R.warehouse_name.isnot(None))
            .with_entities(R.warehouse_id, R.warehouse_name, func.count(R.id),
                           _sum(D["is_closed"]), _sum(D["is_open"]),
                           _sum(D["overdue_now"]), _sum(D["is_cancelled"]))
            .group_by(R.warehouse_id, R.warehouse_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    out["divisions"] = divisions[:_TOP]
    out["divisions_n"] = len(divisions)

    speed = [
        {"id": cid, "name": name, "closed": _n(n),
         "median_h": round(float(m), 1),
         "allowed_h": float(ft) if ft else None}
        for cid, name, n, m, ft in (
            base.with_entities(R.category_id, R.category_name,
                               _sum(hours_closed.isnot(None)),
                               func.percentile_cont(0.5).within_group(hours_closed),
                               func.max(R.category_deadline_hours))
            .group_by(R.category_id, R.category_name).all())
        if _n(n) > 0 and m is not None
    ]
    speed.sort(key=lambda x: -x["closed"])
    out["speed"] = speed[:10]
    out["speed_n"] = len(speed)

    # IT's crews (`master_name` — «Бригада2», «Бригада ремонт» …). NULL is the
    # not-yet-assigned pile, shown as its own row.
    brigadas = [
        {"id": mid, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc),
         "median_h": round(float(m), 1) if m is not None else None}
        for mid, name, n, dn, op, ov, cc, m in (
            base.with_entities(R.master_id, R.master_name, func.count(R.id),
                               _sum(D["is_closed"]), _sum(D["is_open"]),
                               _sum(D["overdue_now"]), _sum(D["is_cancelled"]),
                               func.percentile_cont(0.5).within_group(hours_closed))
            .group_by(R.master_id, R.master_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    out["brigadas"] = brigadas[:_TOP]
    out["brigadas_n"] = len(brigadas)
    return out


@router.get("/requests/{remote_id}")
def get_request(
    remote_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """One ticket, derived facts and the raw API item included."""
    D = _derived()
    tup = (db.query(ArcLegacyRequest, *[D[k].label(k) for k in _ROW_DERIVED])
           .filter(ArcLegacyRequest.remote_id == remote_id).first())
    if not tup:
        raise HTTPException(status_code=404, detail="Request not found")
    out = _serialize(tup[0], dict(zip(_ROW_DERIVED, tup[1:])), with_raw=True)
    out["cells"] = _cells_map(db, [out])
    return out


@router.post("/refresh")
def refresh(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Walk every page of the API in the background; the meta poll is the
    progress feed. Offered to every profile that can open the page."""
    if not arc_legacy_client.configured():
        raise HTTPException(status_code=400, detail=NOT_CONFIGURED_MSG)
    meta = db.query(ArcLegacySyncMeta).filter_by(id=1).first()
    if _live(meta):
        raise HTTPException(status_code=409, detail="Sync is already running")
    if not start_sync_thread("full"):
        raise HTTPException(status_code=409, detail="Sync is already running")
    # The walk runs in a thread, so the rows it will bring are not knowable here;
    # what IS knowable is the mode and what the mirror held when it was asked for.
    action_log.enrich(
        target_kind="batch", target_id="arc-legacy",
        details=[("mode", "full"), ("state", "started"),
                 ("total", (meta.row_count if meta else 0) or 0)],
    )
    return {"status": "started"}


class ArcExportBody(BaseModel):
    """The page's current filter set + sort + the visible column keys in
    on-screen order. ``labels`` (optional) carries the column headers already
    in the viewer's language; a key without one falls back to a plain English
    header. Data is re-queried HERE through the same filters as /list, so the
    file carries every matching row, not the page on screen."""
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    status: list[str] = []
    category: list[str] = []
    branch: list[str] = []
    master: list[str] = []
    cell: list[str] = []
    shift: list[str] = []
    manager: list[str] = []
    leader: list[str] = []
    urgent: str = "all"
    overdue: str = "all"
    sap: str = "all"
    state: str = "all"
    q: Optional[str] = None
    include_missing: bool = False
    cells_only: bool = False
    owner_scope: str = ""
    sort: str = "created_at:desc"
    columns: list[str] = []
    labels: dict[str, str] = {}
    caption: Optional[str] = None
    # Which tab the file came off — it names the file, nothing more: both tabs
    # are this register, differing only in the `columns` the page sends.
    view: str = "list"
    # The viewer's language — the brigadir and leader columns are names from our
    # own registry, and the screen spells them through the transliterator.
    lang: str = "ru"


# Export ceiling — an Excel sheet of more rows than this is not a report.
_EXPORT_MAX_ROWS = 50_000


def _scope_line(f: dict, sort: Optional[str]) -> str:
    """The filter set that produced the file, as one sentence. Only the
    narrowings actually applied are named — «who pulled what data» is a question
    about what was EXCLUDED, and a list of a dozen «all»s hides that."""
    parts = []
    for key in ("date_from", "date_to", "q"):
        if f.get(key):
            parts.append(f"{key}={f[key]}")
    for key in ("status", "category", "branch", "master", "cell", "shift",
                "manager", "leader"):
        vals = f.get(key) or []
        if vals:
            parts.append(f"{key}={','.join(str(v) for v in vals)}")
    for key in ("urgent", "overdue", "sap", "state"):
        if (f.get(key) or "all") != "all":
            parts.append(f"{key}={f[key]}")
    if f.get("include_missing"):
        parts.append("include_missing=yes")
    if f.get("cells_only"):
        parts.append("cells_only=yes")
    if f.get("owner_scope"):
        parts.append(f"owner_scope={f['owner_scope']}")
    if sort:
        parts.append(f"sort={sort}")
    return (" · ".join(parts) or "no filters")[:1000]


@router.post("/export.xlsx")
def export_xlsx(
    request: Request,
    body: ArcExportBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Excel of the register as filtered on the page, in the page's column
    order. A browser session downloads it; inside Telegram it lands in the
    caller's private chat (app/xlsx_delivery.py)."""
    f = {k: getattr(body, k) for k in
         ("date_from", "date_to", "status", "category", "branch", "master",
          "cell", "shift", "manager", "leader", "urgent", "overdue", "sap",
          "state", "q", "include_missing", "cells_only")}
    f["owner_scope"] = _owner_scope(body.owner_scope)
    D = _derived()
    query = _rows_query(db, f, D)
    rows = _fetch_rows(query, D, body.sort, limit=_EXPORT_MAX_ROWS)
    # The cell column is the code, already on the row; its two OWNERS are
    # resolved off the one cells map and spelled as the screen spells them.
    cells = _cells_map(db, rows)
    for r in rows:
        c = cells.get(r.get("cell_code"))
        r["sup_name"] = transliterate((c or {}).get("sup") or "", body.lang)
        r["leader_name"] = transliterate((c or {}).get("leader") or "", body.lang)
    bio = build_arc_legacy_workbook(rows, body.columns, body.labels)

    today = datetime.now(_TASHKENT).date().isoformat()
    fname = (f"arc_legacy_cells_{today}.xlsx" if body.view == "cells"
             else f"arc_legacy_requests_{today}.xlsx")
    caption = body.caption or f"📊 ARC (old API) · {len(rows)} rows"
    try:
        data = bio.read()
        resp = deliver_xlsx(request, payload, fname, data, caption)
        action_log.enrich(
            target_kind="report", target_id=fname,
            details=[("file", fname), ("rows", len(rows)), ("size", len(data)),
                     ("view", body.view), ("columns", len(body.columns)),
                     ("scope", _scope_line(f, body.sort))],
        )
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")


@router.post("/probe")
def post_probe(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Re-measure what the ARC API is willing to give under which parameters
    (services/arc_legacy_discovery.py) and adopt the widest set. ADMIN-ONLY: it is a
    burst of calls against a third-party system and it CHANGES what every
    later sync sends."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not arc_legacy_client.configured():
        raise HTTPException(status_code=400, detail=NOT_CONFIGURED_MSG)
    report = arc_legacy_discovery.run_probe(db)
    if not report.get("ok"):
        raise HTTPException(status_code=502, detail=f"ARC probe failed: {report.get('error')}")
    # The probe CHANGES what every later walk sends, so the adopted parameter set
    # and what it bought (baseline total → combined total) are the record.
    winners = report.get("filters") or {}
    combined = report.get("combined_total")
    action_log.enrich(
        target_kind="setting", target_id="arc-legacy.filters",
        details=[
            ("count", report.get("calls")),
            ("value", ", ".join(f"{k}={v}" for k, v in winners.items()) or "defaults"),
            ("spec_available", bool(report.get("spec_available"))),
        ],
        changes=([("total", report.get("baseline_total"), combined)]
                 if combined is not None else None),
    )
    return report


@router.get("/probe")
def get_probe(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The last measurement, unchanged — what the API declares it accepts,
    what each parameter did to the total, and which set the walk now sends."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    meta = db.query(ArcLegacySyncMeta).filter_by(id=1).first()
    return {
        "report": getattr(meta, "probe", None),
        "at": _iso(getattr(meta, "probe_at", None)),
        "filters": getattr(meta, "filters", None),
        # The spec may exist even when nothing has been probed yet — the
        # parameter list alone already answers «which filters are there?».
        "params": arc_legacy_discovery.describe_params(getattr(meta, "spec", None)),
        "paths": arc_legacy_discovery.describe_paths(getattr(meta, "spec", None)),
        "spec_available": bool(getattr(meta, "spec", None)),
    }


@router.get("/fields")
def get_fields(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every attribute the API sends, counted over EVERY stored ticket's full
    payload, and which of them the page does not use — «is the API sending
    anything new?» (services/arc_legacy_discovery.field_census). ADMIN-ONLY,
    like the rest of the API panel: it shows sample values of fields nobody
    has reviewed."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    try:
        return arc_legacy_discovery.field_census(db)
    except OperationalError:
        # statement_timeout: the scan is bounded so the panel gets an answer.
        db.rollback()
        raise HTTPException(status_code=503, detail="The attribute check took too long — try again later.")


@router.get("/diag")
def get_diag(payload: dict = Depends(require_page(PAGE))):
    """Why «not connected»? ADMIN-ONLY. Reports which env NAMES the process
    finds and where (never a value) — the platform has no shell, so this is the
    only way to tell «wrong file» from «unparseable line» from «blank value»."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return arc_legacy_client.diagnostics()


@router.get("/spec")
def get_spec(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The ARC API's own openapi document — ADMIN-ONLY (narrower than the
    page): reference material about a third-party system, not ticket data.
    Served from the stored copy; fetched live once when none is stored yet."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    meta = db.query(ArcLegacySyncMeta).filter_by(id=1).first()
    if meta and meta.spec is not None:
        return {"spec": meta.spec, "fetched_at": _iso(meta.spec_fetched_at)}
    if not arc_legacy_client.configured():
        raise HTTPException(status_code=400, detail=NOT_CONFIGURED_MSG)
    try:
        with httpx.Client(timeout=arc_legacy_client._TIMEOUT) as client:
            doc = arc_legacy_client.fetch_openapi(client)
    except Exception:
        doc = None
    if doc is None:
        raise HTTPException(status_code=502, detail="ARC did not return its openapi document")
    if meta is None:
        meta = ArcLegacySyncMeta(id=1)
        db.add(meta)
    meta.spec = doc
    meta.spec_fetched_at = datetime.now(timezone.utc)
    db.commit()
    return {"spec": doc, "fetched_at": _iso(meta.spec_fetched_at)}
