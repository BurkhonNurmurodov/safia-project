"""
ARC service-ticket register API (page /arc) — the «АРС Фабрика» tickets
mirrored from IT's internal read-only API by services/arc_sync.py, served as a
filterable, sortable, exportable register with a KPI strip.

Every derived fact the page shows («open», «late», hours-to-close …) is
defined ONCE, in :func:`_derived`, as SQL expressions over the row's own
status and timestamps, and every endpoint — list, stats, export — filters,
sorts, counts and serialises through those same expressions. A number on the
KPI strip is therefore always a count over exactly the rows the table would
show for the same filters; there is no second copy of «what counts as open» to
drift.

Two facts about the source shape the whole module:

  * **the status integer IS the state.** The API ships 0/1/3/4/6 and no label,
    no colour and no «is_overdue» flag of its own, so open / done / cancelled
    are read off it (services/arc_client names the codes) and the words come
    from the four locales.
  * **there is no deadline field.** The category carries ``ftime`` — the hours
    a ticket of that kind is allowed — so the due moment is DERIVED as
    ``created_at + ftime hours``. A category without one has no due date, and
    such a ticket is neither on time nor late; every «on time» figure names
    the count it was computed over.

A third fact is derived the same way, from the division NAME: an ARC division
ending in a four-digit number names one of this platform's production cells by
its Verifix code (services/arc_cells.py). That is the only link between IT's
register and our cell registry, so it rides every row as ``cell_code``, filters
like any other scope, and resolves each ticket's owning brigadir and leader for
the page's «by cells» view — all off the one expression, never re-read per call
site. That view is a COLUMN SET over this same register, not an aggregate: the
per-cell summary it used to be (and its ``/by-cell`` endpoint) is gone.

That link is also what carries the org chain — shift → brigadir → leader — onto
a register that knows nothing about this platform's org chart: each level
narrows to the CELLS it owns and meets the tickets at the same ``cell_code``
expression (``arc_cells.org_codes``), so a scope the filter panel offers and a
scope the query applies can never be two different things.

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
from sqlalchemy import (DateTime, Float, Text, and_, case, cast, false, func,
                        not_, or_, text, type_coerce)
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ArcRequest, ArcSyncMeta
from app.permissions import require_page
from app.translit import transliterate
from app.services import action_log, arc_cells, arc_client
from app.services.arc_client import (CANCELLED_STATUSES, DONE_STATUSES,
                                     OPEN_STATUSES)
from app.services.arc_export import build_arc_workbook
from app.services.cell_lookup import workshop_name
from app.services.arc_sync import _live, detail_pending, fetch_detail, start_sync_thread
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/arc", tags=["arc"])

PAGE = "arc"

# The plant's wall clock. Tashkent has no DST, so a fixed offset is exact and
# spares the day-bound math a zoneinfo lookup per request.
_TASHKENT = timezone(timedelta(hours=5))

NOT_CONFIGURED_MSG = "ARC is not connected. INTERNAL_API_KEY is missing on the backend."

# One hour as a SQL interval — the unit `category.ftime` is counted in.
_HOUR = text("INTERVAL '1 hour'")


# ── derived semantics (THE one definition) ───────────────────────────────────

def _derived() -> dict[str, Any]:
    """The page's derived facts as SQL expressions over ArcRequest.

    is_cancelled  = status = 4                (Отклонена)
    is_done       = status IN (3, 6)          (Завершена · Обработана)
    is_open       = status IS NULL OR status IN (0, 1)
    closed_at     = finished_at, but only once the ticket is done or denied
    due           = created_at + category_ftime hours, when the category has one
    late          = due IS NOT NULL AND coalesce(closed_at, now()) > due
    overdue_now   = is_open AND late
    hours_to_close= (closed_at − created_at) in hours, when closed
    hours_to_start= (started_at − created_at) in hours, when taken into work
    cell_code     = the four digits the division name ends in, else NULL
    """
    R = ArcRequest
    is_cancelled = R.status.in_(CANCELLED_STATUSES)
    is_done = R.status.in_(DONE_STATUSES)
    is_open = or_(R.status.is_(None), R.status.in_(OPEN_STATUSES))
    # finished_at is stamped on denial and on handling; a status that is still
    # running must never read as closed just because a stamp survived an edit.
    closed_at = case((or_(is_done, is_cancelled), R.finished_at), else_=None)
    due = case(
        (and_(R.created_at.isnot(None), R.category_ftime > 0),
         type_coerce(R.created_at + R.category_ftime * _HOUR, DateTime(timezone=True))),
        else_=None,
    )
    late = and_(due.isnot(None), func.coalesce(closed_at, func.now()) > due)
    overdue_now = and_(is_open, late)
    hours_to_close = case(
        (closed_at.isnot(None),
         cast(func.extract("epoch", closed_at - R.created_at), Float) / 3600.0),
        else_=None,
    )
    hours_to_start = case(
        (R.started_at.isnot(None),
         cast(func.extract("epoch", R.started_at - R.created_at), Float) / 3600.0),
        else_=None,
    )
    return {
        "closed_at": closed_at,
        "is_cancelled": is_cancelled,
        "is_open": is_open,
        "is_done": is_done,
        "due": due,
        "late": late,
        "overdue_now": overdue_now,
        "hours_to_close": hours_to_close,
        "hours_to_start": hours_to_start,
        # Derived from the division NAME rather than from a timestamp, but the
        # same contract: one expression, read by the filter, the group-by, the
        # register column and the export alike.
        "cell_code": arc_cells.code_expr(),
    }


# The derived columns that ride along with every serialised row, in the order
# they are selected. is_done is a stats-only helper (it is the complement of
# open+cancelled and adds nothing to a row).
_ROW_DERIVED = ("closed_at", "is_cancelled", "is_open", "due", "late",
                "overdue_now", "hours_to_close", "hours_to_start", "cell_code")


# ── filters ──────────────────────────────────────────────────────────────────

def _ints(values: list[str]) -> list[int]:
    """Query values → ints, silently dropping anything that is not one. The
    page sends ids it got from /meta, so a non-numeric value is a typed URL."""
    out = []
    for v in values or []:
        try:
            out.append(int(v))
        except (TypeError, ValueError):
            continue
    return out


def _filters(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    status: list[str] = Query(default=[]),
    category: list[str] = Query(default=[]),
    division: list[str] = Query(default=[]),
    cell: list[str] = Query(default=[]),
    shift: list[str] = Query(default=[]),
    manager: list[str] = Query(default=[]),
    leader: list[str] = Query(default=[]),
    brigada: list[str] = Query(default=[]),
    author: list[str] = Query(default=[]),
    urgent: str = Query("all"),
    overdue: str = Query("all"),
    source: str = Query("all"),
    state: str = Query("all"),
    q: Optional[str] = Query(None),
    include_missing: bool = Query(False),
) -> dict:
    return {"date_from": date_from, "date_to": date_to, "status": status,
            "category": category, "division": division, "cell": cell,
            "shift": shift, "manager": manager, "leader": leader,
            "brigada": brigada, "author": author, "urgent": urgent,
            "overdue": overdue, "source": source, "state": state, "q": q,
            "include_missing": include_missing}


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
    R = ArcRequest
    if not f.get("include_missing"):
        query = query.filter(R.missing_since.is_(None))
    lo = _day_start(f.get("date_from"))
    if lo is not None:
        query = query.filter(R.created_at >= lo)
    hi = _day_start(f.get("date_to"))
    if hi is not None:
        query = query.filter(R.created_at < hi + timedelta(days=1))
    for key, col in (("status", R.status), ("category", R.category_id),
                     ("brigada", R.brigada_id), ("author", R.user_id)):
        vals = _ints(f.get(key) or [])
        if vals:
            query = query.filter(col.in_(vals))
    if f.get("division"):
        query = query.filter(R.division_id.in_(f["division"]))
    # Cells are picked by the CODE the division name carries, which is the same
    # value the register's cell column and the «by cells» view's owner columns
    # read — so the filter and what is on screen can never mean two different
    # things. The «no cell» bucket is a pick like any other: a division naming
    # none is a real answer, and the reader must be able to ask for exactly
    # those tickets.
    picked = [c for c in (f.get("cell") or []) if c]
    if picked:
        code = D["cell_code"]
        conds = []
        codes = [c for c in picked if c != arc_cells.NO_CELL]
        if codes:
            conds.append(code.in_(codes))
        if arc_cells.NO_CELL in picked:
            conds.append(code.is_(None))
        query = query.filter(or_(*conds))
    # The org chain — shift → brigadir → leader — reaches a ticket only through
    # the cell its division names, so it narrows to a SET OF CODES and joins
    # the register at exactly the same expression the cell pick uses. An empty
    # set is a real answer («no cell in this scope»): it must show an empty
    # register, never the whole plant, and a ticket whose division names no
    # cell belongs to no unit, so it is out of every org scope by construction.
    shifts, mgrs, leads = (_ints(f.get("shift") or []), _ints(f.get("manager") or []),
                           _ints(f.get("leader") or []))
    if shifts or mgrs or leads:
        codes = arc_cells.org_codes(db, shifts, mgrs, leads)
        query = query.filter(D["cell_code"].in_(sorted(codes))) if codes else query.filter(false())
    cond = _tri(f.get("urgent") or "all", R.category_urgent)
    if cond is not None:
        query = query.filter(cond)
    src = f.get("source") or "all"
    if src == "bot":
        query = query.filter(R.is_bot.is_(True))
    elif src == "app":
        query = query.filter(func.coalesce(R.is_bot, False).is_(False))
    ov = f.get("overdue") or "all"
    if ov == "yes":
        query = query.filter(D["overdue_now"])
    elif ov == "no":
        query = query.filter(not_(D["overdue_now"]))
    state = f.get("state") or "all"
    if state == "open":
        query = query.filter(D["is_open"])
    elif state == "done":
        query = query.filter(D["is_done"])
    elif state == "cancelled":
        query = query.filter(D["is_cancelled"])
    q = (f.get("q") or "").strip()
    if q:
        like = f"%{q}%"
        query = query.filter(or_(
            cast(R.request_num, Text).ilike(like),
            R.description.ilike(like),
            R.division_name.ilike(like),
            R.user_name.ilike(like),
            R.brigada_name.ilike(like),
            R.category_name.ilike(like),
        ))
    return query


# ── sorting ──────────────────────────────────────────────────────────────────

def _sort_expr(sort: Optional[str], D: dict):
    """«key:dir» → ORDER BY terms. Unknown keys fall back to created_at:desc.
    «due» sorts by the derived due moment the table shows."""
    R = ArcRequest
    key, _, direction = (sort or "created_at:desc").partition(":")
    desc = (direction or "desc").lower() != "asc"
    cols = {
        "request_num": R.request_num,
        "created_at": R.created_at,
        "started_at": R.started_at,
        "due": D["due"],
        "division_name": R.division_name,
        "cell_code": D["cell_code"],
        "category_name": R.category_name,
        "brigada_name": R.brigada_name,
        "user_name": R.user_name,
        "status": R.status,
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
    "remote_id", "request_num", "status", "user_id", "user_name", "user_phone",
    "user_manager", "division_id", "division_name", "manager_name",
    "brigada_id", "brigada_name", "category_id", "category_name",
    "category_urgent", "category_ftime", "department", "sphere_status",
    "is_bot", "created_at", "started_at", "finished_at", "description",
    "deny_reason", "files", "update_time", "comment_count", "detail_at",
    "first_seen_at", "synced_at", "missing_since",
)


def _serialize(r: ArcRequest, derived: dict[str, Any], with_detail: bool = False) -> dict:
    """A row + its derived facts (as computed by the SAME SQL the filters
    use, never re-derived in Python)."""
    out: dict[str, Any] = {"id": r.remote_id}
    for c in _ROW_COLS:
        v = getattr(r, c)
        out[c] = _iso(v) if isinstance(v, datetime) else v
    out["closed_at"] = _iso(derived.get("closed_at"))
    out["due"] = _iso(derived.get("due"))
    # The cell the division NAMES — digits only. Which cell that is (and what
    # it is called) comes from the payload's own `cells` map, so a ~thousand-row
    # page carries each workshop name once instead of once per ticket.
    out["cell_code"] = derived.get("cell_code")
    out["is_cancelled"] = bool(derived.get("is_cancelled"))
    out["is_open"] = bool(derived.get("is_open"))
    out["late"] = bool(derived.get("late"))
    out["overdue_now"] = bool(derived.get("overdue_now"))
    for k in ("hours_to_close", "hours_to_start"):
        h = derived.get(k)
        out[k] = round(float(h), 2) if h is not None else None
    # `detail_at` is what says whether the card was ever fetched; a row with
    # none is list-only, and an empty description on it means «not read yet»,
    # not «the ticket has none». The page must be able to tell those apart.
    out["has_detail"] = r.detail_at is not None
    if with_detail:
        out["comments"] = r.comments
        out["raw"] = r.raw
        out["detail_raw"] = r.detail_raw
    return out


def _cells_map(db: Session, rows: list[dict]) -> dict[str, dict]:
    """{code → cell} for the codes present in these rows, so the page can name
    them. A code with no registered cell is absent — the row keeps its digits
    and says «not in the registry» rather than showing nothing."""
    codes = {r.get("cell_code") for r in rows if r.get("cell_code")}
    return arc_cells.cells_for(db, codes) if codes else {}


def _rows_query(db: Session, f: dict, D: dict):
    """The register query: the entity plus its derived facts, filtered."""
    query = db.query(ArcRequest, *[D[k].label(k) for k in _ROW_DERIVED])
    return _apply_filters(query, f, D, db)


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
        # Cards are fetched one ticket at a time and bounded per pass, so the
        # mirror fills in over several passes. Saying how many are still
        # outstanding is the difference between «still loading» and «this
        # ticket has no description».
        "detail_pending": (meta.detail_pending if meta else 0) or 0,
        "detail_done": (meta.detail_done if meta else 0) or 0,
    }


def _options(db: Session) -> dict:
    """Filter option lists over the rows the API still returns."""
    R = ArcRequest
    base = db.query(R).filter(R.missing_since.is_(None))
    statuses = [
        {"value": st, "count": n}
        for st, n in (base.with_entities(R.status, func.count(R.id))
                      .group_by(R.status).order_by(R.status).all())
        if st is not None
    ]
    categories = [
        {"id": cid, "name": name, "urgent": bool(urg), "count": n}
        for cid, name, urg, n in (base.with_entities(R.category_id, R.category_name,
                                                     R.category_urgent, func.count(R.id))
                                  .group_by(R.category_id, R.category_name, R.category_urgent)
                                  .order_by(R.category_name).all())
        if cid is not None
    ]
    divisions = [
        {"id": did, "name": name, "count": n}
        for did, name, n in (base.with_entities(R.division_id, R.division_name, func.count(R.id))
                             .group_by(R.division_id, R.division_name)
                             .order_by(R.division_name).all())
        if did
    ]
    brigadas = [
        {"id": bid, "name": name, "count": n}
        for bid, name, n in (base.with_entities(R.brigada_id, R.brigada_name, func.count(R.id))
                             .group_by(R.brigada_id, R.brigada_name)
                             .order_by(R.brigada_name).all())
        if bid is not None
    ]
    authors = [
        {"id": uid, "name": name, "count": n}
        for uid, name, n in (base.with_entities(R.user_id, R.user_name, func.count(R.id))
                             .group_by(R.user_id, R.user_name)
                             .order_by(func.count(R.id).desc()).all())
        if uid is not None
    ]
    # Cells are offered as the CODES the division names carry, counted the same
    # way — a code with no registered cell is still offered (it is a real
    # narrowing over real tickets), and the «no cell» bucket is offered too so
    # the reader can ask for the divisions this rule cannot resolve.
    code = arc_cells.code_expr()
    cell_rows = (base.with_entities(code.label("code"), func.count(R.id))
                 .group_by(code).all())
    known = arc_cells.cells_for(db, [c for c, _ in cell_rows if c])
    # The org chain behind those codes — shift, owning unit, owning leader. It
    # is read from the CELLS the register names, so a unit is offered only
    # while it has tickets, and every cell option carries the three keys the
    # chain narrows it by (a level must be able to shorten the list below it).
    org = arc_cells.org_index(db, [c for c, _ in cell_rows if c])
    by_code = org["by_code"]
    cells = sorted(
        ({"code": c, "count": n, "cell": known.get(c),
          "sh": (by_code.get(c) or {}).get("shift"),
          "mgr": (by_code.get(c) or {}).get("manager_id"),
          "lead": (by_code.get(c) or {}).get("leader_id")}
         for c, n in cell_rows if c),
        key=lambda x: x["code"],
    )
    no_cell = sum(n for c, n in cell_rows if not c)
    # Counted in TICKETS, like every other option list here — the question the
    # number answers is «how much of the register is behind this name».
    shift_n: dict[int, int] = {}
    mgr_n: dict[int, int] = {}
    lead_n: dict[int, int] = {}
    for c, n in cell_rows:
        o = by_code.get(c)
        if not o:
            continue
        for key, bucket in ((o["shift"], shift_n), (o["manager_id"], mgr_n),
                            (o["leader_id"], lead_n)):
            if key is not None:
                bucket[key] = bucket.get(key, 0) + n
    org_out = {
        "shifts": [{"value": s, "count": shift_n[s]} for s in sorted(shift_n)],
        "managers": sorted(
            ({**m, "count": mgr_n.get(m["id"], 0)} for m in org["managers"].values()),
            key=lambda m: (m["name"] or "").lower()),
        "leaders": sorted(
            ({**l, "count": lead_n.get(l["id"], 0)} for l in org["leaders"].values()),
            key=lambda l: (l["name"] or "").lower()),
    }
    return {"statuses": statuses, "categories": categories,
            "divisions": divisions, "brigadas": brigadas, "authors": authors,
            "cells": cells, "no_cell_count": no_cell, "org": org_out}


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
    R = ArcRequest
    D = _derived()
    base = _apply_filters(db.query(R), f, D, db)

    def _sum(cond):
        return func.coalesce(func.sum(case((cond, 1), else_=0)), 0)

    closed_with_due = and_(D["is_done"], D["due"].isnot(None), D["closed_at"].isnot(None))
    late_closed = and_(D["is_done"], D["closed_at"].isnot(None), D["late"])
    hours_closed = case((D["is_done"], D["hours_to_close"]), else_=None)

    tot = base.with_entities(
        func.count(R.id),
        _sum(D["is_open"]),
        _sum(D["overdue_now"]),
        _sum(D["is_cancelled"]),
        _sum(D["is_done"]),
        _sum(closed_with_due),
        _sum(late_closed),
        func.percentile_cont(0.5).within_group(hours_closed),
        func.avg(hours_closed),
    ).one()
    shown, n_open, n_overdue, n_cancelled, n_done, n_cwd, n_late, med, avg = tot
    n_cwd, n_late = _n(n_cwd), _n(n_late)
    on_time = round(100.0 * (n_cwd - n_late) / n_cwd, 1) if n_cwd else None

    by_status = [
        {"value": st, "count": n}
        for st, n in (base.with_entities(R.status, func.count(R.id))
                      .group_by(R.status).order_by(func.count(R.id).desc()).all())
    ]
    by_category = [
        {"id": cid, "name": name, "count": n, "overdue": _n(ov)}
        for cid, name, n, ov in (base.with_entities(R.category_id, R.category_name,
                                                    func.count(R.id), _sum(D["overdue_now"]))
                                 .group_by(R.category_id, R.category_name)
                                 .order_by(func.count(R.id).desc()).all())
    ]
    by_brigada = [
        {"id": bid, "name": name, "open": _n(o), "overdue": _n(ov),
         "closed": _n(c), "late_closed": _n(lc),
         "median_hours": round(float(m), 1) if m is not None else None}
        for bid, name, o, ov, c, lc, m in (
            base.with_entities(R.brigada_id, R.brigada_name,
                               _sum(D["is_open"]), _sum(D["overdue_now"]),
                               _sum(D["is_done"]), _sum(late_closed),
                               func.percentile_cont(0.5).within_group(hours_closed))
            .group_by(R.brigada_id, R.brigada_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    return {
        "shown": _n(shown),
        "open": _n(n_open),
        "overdue": _n(n_overdue),
        "cancelled": _n(n_cancelled),
        "done": _n(n_done),
        "closed_with_due": n_cwd,
        "late_closed": n_late,
        "on_time_pct": on_time,
        "median_hours": round(float(med), 1) if med is not None else None,
        "avg_hours": round(float(avg), 1) if avg is not None else None,
        "by_status": by_status,
        "by_category": by_category,
        "by_brigada": by_brigada,
    }


@router.get("/requests/{remote_id}")
def get_request(
    remote_id: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """One ticket, derived facts and the whole card included.

    The list walk cannot carry a description — that is a per-ticket call — so a
    row nobody has hydrated yet is fetched HERE, once, on the way out. A reader
    who opens a ticket never waits on the background queue, and a failure is a
    silent fall back to what the mirror already holds rather than a modal that
    refuses to open."""
    D = _derived()

    def _load():
        return (db.query(ArcRequest, *[D[k].label(k) for k in _ROW_DERIVED])
                .filter(ArcRequest.remote_id == remote_id).first())

    tup = _load()
    if not tup:
        raise HTTPException(status_code=404, detail="Request not found")
    if tup[0].detail_at is None and arc_client.configured():
        try:
            with httpx.Client(timeout=arc_client._TIMEOUT) as client:
                fetch_detail(db, client, remote_id)
            db.commit()
            tup = _load() or tup
        except Exception:
            db.rollback()
    out = _serialize(tup[0], dict(zip(_ROW_DERIVED, tup[1:])), with_detail=True)
    out["cells"] = _cells_map(db, [out])
    return out


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
    # The walk runs in a thread, so the rows it will bring are not knowable here;
    # what IS knowable is the mode and what the mirror held when it was asked for.
    action_log.enrich(
        target_kind="batch", target_id="arc",
        details=[("mode", "full"), ("state", "started"),
                 ("total", (meta.row_count if meta else 0) or 0)],
    )
    return {"status": "started"}


class ArcExportBody(BaseModel):
    """The page's current filter set + sort + the visible column keys in
    on-screen order. ``labels`` (optional) carries the column headers already
    in the viewer's language; a key without one falls back to a plain English
    header. ``status_labels`` maps a status code to its word, for the same
    reason — the API ships an integer and the words live in the locales. Data
    is re-queried HERE through the same filters as /list, so the file carries
    every matching row, not the page on screen."""
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    status: list[str] = []
    category: list[str] = []
    division: list[str] = []
    cell: list[str] = []
    shift: list[str] = []
    manager: list[str] = []
    leader: list[str] = []
    brigada: list[str] = []
    author: list[str] = []
    urgent: str = "all"
    overdue: str = "all"
    source: str = "all"
    state: str = "all"
    q: Optional[str] = None
    include_missing: bool = False
    sort: str = "created_at:desc"
    columns: list[str] = []
    labels: dict[str, str] = {}
    status_labels: dict[str, str] = {}
    caption: Optional[str] = None
    # Which VIEW is on screen. Both are the register now — same rows, same
    # filters, differing only in the `columns` the page sends — so this no
    # longer picks a builder, only the FILENAME, and «arc_cells_…» still tells
    # the reader which of the two tabs the file came off.
    view: str = "list"
    # The viewer's language, for the one value the backend has to pick a
    # spelling of: a cell's workshop name exists in four and the export writes
    # one. Headers still arrive already translated in `labels`.
    lang: str = "ru"


# Export ceiling — an Excel sheet of more rows than this is not a report.
_EXPORT_MAX_ROWS = 50_000

_FILTER_KEYS = ("date_from", "date_to", "status", "category", "division",
                "cell", "shift", "manager", "leader", "brigada", "author",
                "urgent", "overdue", "source", "state", "q", "include_missing")


def _scope_line(f: dict, sort: Optional[str]) -> str:
    """The filter set that produced the file, as one sentence. Only the
    narrowings actually applied are named — «who pulled what data» is a question
    about what was EXCLUDED, and a list of a dozen «all»s hides that."""
    parts = []
    for key in ("date_from", "date_to", "q"):
        if f.get(key):
            parts.append(f"{key}={f[key]}")
    for key in ("status", "category", "division", "cell", "shift", "manager",
                "leader", "brigada", "author"):
        vals = f.get(key) or []
        if vals:
            parts.append(f"{key}={','.join(str(v) for v in vals)}")
    for key in ("urgent", "overdue", "source", "state"):
        if (f.get(key) or "all") != "all":
            parts.append(f"{key}={f[key]}")
    if f.get("include_missing"):
        parts.append("include_missing=yes")
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
    f = {k: getattr(body, k) for k in _FILTER_KEYS}
    D = _derived()
    today = datetime.now(_TASHKENT).date().isoformat()

    # Both views are the register — the same tickets through the same filters,
    # differing only in which columns ride along — so there is ONE export path
    # and `view` only names the file. A second builder here is what used to let
    # the file and the screen hold two different answers.
    query = _rows_query(db, f, D)
    rows = _fetch_rows(query, D, body.sort, limit=_EXPORT_MAX_ROWS)
    # The register's cell column is a NAME on screen and must be one in the
    # file too; the row carries only the digits, so resolve them once here.
    # The cell's two owners ride on that same projection — a ticket whose
    # division names no cell (or names one the registry does not know)
    # reaches no unit, and its owner columns stay blank rather than guessing.
    # Both owner names are OUR registry's text and the screen renders them
    # through the transliterator, so the file must too — an export that mirrors
    # the table everywhere except the spelling of a person's name is a file the
    # reader cannot match against what they just pressed Export on. (The author
    # and division-manager columns stay raw on both sides: those are IT's own
    # text, not ours.)
    cells = _cells_map(db, rows)
    for r in rows:
        c = cells.get(r.get("cell_code"))
        r["cell_name"] = workshop_name(c, body.lang)
        r["sup_name"] = transliterate((c or {}).get("sup") or "", body.lang)
        r["leader_name"] = transliterate((c or {}).get("leader") or "", body.lang)
    bio = build_arc_workbook(rows, body.columns, body.labels, body.status_labels)
    fname = (f"arc_cells_{today}.xlsx" if body.view == "cells"
             else f"arc_requests_{today}.xlsx")

    caption = body.caption or f"📊 ARC · {len(rows)} rows"
    try:
        blob = bio.read()
        resp = deliver_xlsx(request, payload, fname, blob, caption)
        action_log.enrich(
            target_kind="report", target_id=fname,
            details=[("file", fname), ("rows", len(rows)), ("size", len(blob)),
                     ("view", body.view), ("columns", len(body.columns)),
                     ("scope", _scope_line(f, body.sort))],
        )
        return resp
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Telegram send failed: {e}")


@router.get("/diag")
def get_diag(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Why «not connected»? ADMIN-ONLY. Reports whether the process finds the
    internal key and where (never its value), plus one live knock on the API —
    the platform has no shell, so this is the only way to tell «wrong file»
    from «unparseable line» from «their server rejects our key»."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    out = arc_client.diagnostics()
    out["pending_details"] = detail_pending(db)
    if arc_client.configured():
        try:
            with httpx.Client(timeout=arc_client._TIMEOUT) as client:
                probe = arc_client.ping(client)
        except Exception as exc:                       # noqa: BLE001 - reported
            probe = {"ok": False, "error": str(exc)[:300]}
        # The sample row would carry a real person's name and phone into a
        # diagnostic panel; the numbers are the whole answer here.
        probe.pop("sample", None)
        out["ping"] = probe
    return out
