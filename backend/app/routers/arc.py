"""
ARC service-ticket register API (page /arc) — the tickets mirrored from the
ARC API by services/arc_sync.py, served as a filterable, sortable, exportable
register with a KPI strip.

Every derived fact the page shows («open», «late», hours-to-close …) is
defined ONCE, in :func:`_derived`, as SQL expressions over the row's own
timestamps, and every endpoint — list, stats, export — filters, sorts, counts
and serialises through those same expressions. A number on the KPI strip is
therefore always a count over exactly the rows the table would show for the
same filters; there is no second copy of «what counts as open» to drift.

Rows the API stopped returning (``missing_since`` set by a completed full
walk) are hidden unless ``include_missing`` is asked for — visible on request,
never deleted, never counted by default.
"""
from __future__ import annotations

from datetime import date as date_cls, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import Float, Text, and_, case, cast, func, not_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArcRequest, ArcSyncMeta
from app.permissions import require_page
from app.services import arc_client
from app.services.arc_export import build_arc_workbook
from app.services.arc_sync import _live, start_sync_thread
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/arc", tags=["arc"])

PAGE = "arc"

# The plant's wall clock. Tashkent has no DST, so a fixed offset is exact and
# spares the day-bound math a zoneinfo lookup per request.
_TASHKENT = timezone(timedelta(hours=5))

NOT_CONFIGURED_MSG = "ARC is not connected. Add ARC_USERNAME/ARC_PASSWORD to the backend."


# ── derived semantics (THE one definition) ───────────────────────────────────

def _derived() -> dict[str, Any]:
    """The page's derived facts as SQL expressions over ArcRequest.

    closed_at     = coalesce(completed_at, finished_at)
    is_cancelled  = cancelled_at IS NOT NULL
    is_open       = closed_at IS NULL AND NOT is_cancelled
    is_closed     = closed_at IS NOT NULL AND NOT is_cancelled
    due           = coalesce(deadline_time, deadline)
    late          = due IS NOT NULL AND coalesce(closed_at, now()) > due
    overdue_now   = is_open AND (is_overdue OR late)
    hours_to_close= (closed_at − created_at) in hours, when closed
    """
    R = ArcRequest
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
    }


# The derived columns that ride along with every serialised row, in the order
# they are selected. is_closed is a stats-only helper (it is the complement of
# open+cancelled and adds nothing to a row).
_ROW_DERIVED = ("closed_at", "is_cancelled", "is_open", "due", "late",
                "overdue_now", "hours_to_close")


# ── filters ──────────────────────────────────────────────────────────────────

def _filters(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: list[str] = Query(default=[]),
    category: list[str] = Query(default=[]),
    branch: list[str] = Query(default=[]),
    master: list[str] = Query(default=[]),
    urgent: str = Query("all"),
    overdue: str = Query("all"),
    sap: str = Query("all"),
    state: str = Query("all"),
    q: Optional[str] = Query(None),
    include_missing: bool = Query(False),
) -> dict:
    return {"date_from": date_from, "date_to": date_to, "status": status,
            "category": category, "branch": branch, "master": master,
            "urgent": urgent, "overdue": overdue, "sap": sap, "state": state,
            "q": q, "include_missing": include_missing}


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


def _apply_filters(query, f: dict, D: dict):
    """The one place the filter set becomes WHERE clauses; list, stats and
    export all go through it."""
    R = ArcRequest
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
        ))
    return query


# ── sorting ──────────────────────────────────────────────────────────────────

def _sort_expr(sort: Optional[str], D: dict):
    """«key:dir» → ORDER BY terms. Unknown keys fall back to created_at:desc.
    «deadline» (and «due») sort by the effective due moment the table shows."""
    R = ArcRequest
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
    "client_name", "first_seen_at", "synced_at", "missing_since",
)


def _serialize(r: ArcRequest, derived: dict[str, Any], with_raw: bool = False) -> dict:
    """A row + its derived facts (as computed by the SAME SQL the filters
    use, never re-derived in Python)."""
    out: dict[str, Any] = {"id": r.remote_id}
    for c in _ROW_COLS:
        v = getattr(r, c)
        out[c] = _iso(v) if isinstance(v, datetime) else v
    out["closed_at"] = _iso(derived.get("closed_at"))
    out["due"] = _iso(derived.get("due"))
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
    query = db.query(ArcRequest, *[D[k].label(k) for k in _ROW_DERIVED])
    return _apply_filters(query, f, D)


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

def _sync_state(meta: Optional[ArcSyncMeta]) -> dict:
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
    }


def _options(db: Session) -> dict:
    """Filter option lists over the rows the API still returns. Statuses group
    by ``normalized_status`` ALONE (one colour per value via min): the page keys
    the list by value, and one status carrying two colours upstream would
    otherwise render as two identical rows."""
    R = ArcRequest
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
            "branches": branches, "masters": masters}


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Sync state + filter options — one boot call for the page."""
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    return {
        "configured": arc_client.configured(),
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
    return {"total": total, "page": page, "page_size": page_size, "rows": rows}


def _n(v) -> int:
    return int(v or 0)


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
    f: dict = Depends(_filters),
):
    """KPI figures over exactly the rows /list shows for the same filters."""
    R = ArcRequest
    D = _derived()
    base = _apply_filters(db.query(R), f, D)

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
    return {
        "shown": _n(shown),
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


@router.get("/requests/{remote_id}")
def get_request(
    remote_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """One ticket, derived facts and the raw API item included."""
    D = _derived()
    tup = (db.query(ArcRequest, *[D[k].label(k) for k in _ROW_DERIVED])
           .filter(ArcRequest.remote_id == remote_id).first())
    if not tup:
        raise HTTPException(status_code=404, detail="Request not found")
    return _serialize(tup[0], dict(zip(_ROW_DERIVED, tup[1:])), with_raw=True)


@router.post("/refresh")
def refresh(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Walk every page of the API in the background; the meta poll is the
    progress feed. Offered to every profile that can open the page."""
    if not arc_client.configured():
        raise HTTPException(status_code=400, detail=NOT_CONFIGURED_MSG)
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    if _live(meta):
        raise HTTPException(status_code=409, detail="Sync is already running")
    if not start_sync_thread("full"):
        raise HTTPException(status_code=409, detail="Sync is already running")
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
    urgent: str = "all"
    overdue: str = "all"
    sap: str = "all"
    state: str = "all"
    q: Optional[str] = None
    include_missing: bool = False
    sort: str = "created_at:desc"
    columns: list[str] = []
    labels: dict[str, str] = {}
    caption: Optional[str] = None


# Export ceiling — an Excel sheet of more rows than this is not a report.
_EXPORT_MAX_ROWS = 50_000


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
          "urgent", "overdue", "sap", "state", "q", "include_missing")}
    D = _derived()
    query = _rows_query(db, f, D)
    rows = _fetch_rows(query, D, body.sort, limit=_EXPORT_MAX_ROWS)
    bio = build_arc_workbook(rows, body.columns, body.labels)

    today = datetime.now(_TASHKENT).date().isoformat()
    fname = f"arc_requests_{today}.xlsx"
    caption = body.caption or f"📊 ARC · {len(rows)} rows"
    try:
        return deliver_xlsx(request, payload, fname, bio.read(), caption)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")


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
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    if meta and meta.spec is not None:
        return {"spec": meta.spec, "fetched_at": _iso(meta.spec_fetched_at)}
    if not arc_client.configured():
        raise HTTPException(status_code=400, detail=NOT_CONFIGURED_MSG)
    try:
        with httpx.Client(timeout=arc_client._TIMEOUT) as client:
            doc = arc_client.fetch_openapi(client)
    except Exception:
        doc = None
    if doc is None:
        raise HTTPException(status_code=502, detail="ARC did not return its openapi document")
    if meta is None:
        meta = ArcSyncMeta(id=1)
        db.add(meta)
    meta.spec = doc
    meta.spec_fetched_at = datetime.now(timezone.utc)
    db.commit()
    return {"spec": doc, "fetched_at": _iso(meta.spec_fetched_at)}
