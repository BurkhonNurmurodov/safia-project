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
per-cell summary it used to be (and its ``/by-cell`` endpoint) is gone. It
carries exactly one narrowing of its own — ``cells_only``, the tickets whose
division names a cell — because the question it asks has no answer for the
rest; what that hides is counted back as ``hidden_no_cell`` on /stats and named
on the page, never dropped in silence.

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
    cells_only: bool = Query(False),
) -> dict:
    return {"date_from": date_from, "date_to": date_to, "status": status,
            "category": category, "division": division, "cell": cell,
            "shift": shift, "manager": manager, "leader": leader,
            "brigada": brigada, "author": author, "urgent": urgent,
            "overdue": overdue, "source": source, "state": state, "q": q,
            "include_missing": include_missing, "cells_only": cells_only}


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


def _apply_filters(query, f: dict, D: dict, db: Session, org_cache: Optional[dict] = None):
    """The one place the filter set becomes WHERE clauses; list, stats, export
    and the filter option lists all go through it.

    ``org_cache`` is a caller-owned memo for the org walk below. /facets builds
    up to five bases out of one filter set, and resolving «which codes does
    this scope reach» once per base is four walks of the cell registry for one
    answer that cannot have changed between them."""
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
    # The «by cells» view asks ONE question — whose cell is this ticket on, and
    # where does it stand — and a ticket whose division names no cell has no
    # answer to it: its cell, brigadir and leader columns can only ever be
    # blank. So that view narrows the register to the tickets that name one.
    # It rides the shared filter set on purpose: the table, the KPI strip and
    # the export then read the same rows, and a count above the table can never
    # describe more tickets than the table can show. What it excludes is not
    # silently dropped — /stats returns it as `hidden_no_cell` and the page
    # says so, with the way back to «Barchasi» where those tickets live.
    if f.get("cells_only"):
        query = query.filter(D["cell_code"].isnot(None))
    # The org chain — shift → brigadir → leader — reaches a ticket only through
    # the cell its division names, so it narrows to a SET OF CODES and joins
    # the register at exactly the same expression the cell pick uses. An empty
    # set is a real answer («no cell in this scope»): it must show an empty
    # register, never the whole plant, and a ticket whose division names no
    # cell belongs to no unit, so it is out of every org scope by construction.
    shifts, mgrs, leads = (_ints(f.get("shift") or []), _ints(f.get("manager") or []),
                           _ints(f.get("leader") or []))
    if shifts or mgrs or leads:
        ck = (tuple(shifts), tuple(mgrs), tuple(leads))
        if org_cache is not None and ck in org_cache:
            codes = org_cache[ck]
        else:
            codes = arc_cells.org_codes(db, shifts, mgrs, leads)
            if org_cache is not None:
                org_cache[ck] = codes
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


# ── filter option lists ──────────────────────────────────────────────────────
# Every list is counted over the rows the CURRENT VIEW holds — the whole
# filtered set, every page of it, not the page on screen — with exactly ONE
# narrowing lifted: its own.
#
# Lifting its own is what makes the number beside a name answer the question
# the reader asks of it: «how many rows do I get if I pick this INSTEAD».
# Applying it too would leave every other name in the list reading 0 the
# moment one was picked; counting the whole mirror instead — what this page
# did until v3.47.0 — offered «Оборудование 8281» beside a table of 566 and
# sent the reader to a category the period holds nothing of.
#
# The reader's OWN pick is always offered, at 0 when the rest of the view
# holds none of it. A pick that vanished from its own list would be un-picked
# by the page's chain guards — the view silently widening, answering a
# question nobody asked — and its chip would lose the name it renders from
# that list and fall back to a raw id.

# What each control looks like when it is narrowing nothing.
_OFF: dict[str, Any] = {
    "status": [], "category": [], "division": [], "cell": [], "shift": [],
    "manager": [], "leader": [], "brigada": [], "author": [],
    "urgent": "all", "overdue": "all", "source": "all", "state": "all",
}

# The filter set that narrows nothing at all — every ticket the API still
# returns. /meta serves its lists over this, which is what the page showed
# before /facets existed.
_ALL_ROWS: dict[str, Any] = {**_OFF, "date_from": None, "date_to": None,
                             "q": None, "include_missing": False,
                             "cells_only": False}


def _lift(f: dict, *keys: str) -> dict:
    """The filter set with the named controls switched off."""
    return {**f, **{k: _OFF[k] for k in keys}}


def _relabel(db: Session, id_col, name_col, ids) -> dict:
    """{id → name} straight off the mirror, unnarrowed.

    A pick its own list could not count keeps its NAME: the panel row and the
    chip both render from the option list, and an id is not a name."""
    ids = [i for i in ids if i is not None]
    if not ids:
        return {}
    return dict(db.query(id_col, func.max(name_col))
                .filter(id_col.in_(ids)).group_by(id_col).all())


def _by_name(items: list[dict]) -> list[dict]:
    return sorted(items, key=lambda x: (x.get("name") or "").lower())


def _facets(db: Session, f: dict) -> dict:
    """The filter option lists for exactly the rows this filter set shows."""
    R = ArcRequest
    D = _derived()
    oc: dict = {}                      # the org walk, resolved once per scope

    def base(*lift: str):
        return _apply_filters(db.query(R), _lift(f, *lift), D, db, oc)

    def counted(lift: str, *cols):
        return (base(lift).with_entities(*cols, func.count(R.id))
                .group_by(*cols).all())

    # ── the register's own columns ───────────────────────────────────────────
    statuses = [{"value": st, "count": n}
                for st, n in counted("status", R.status) if st is not None]
    statuses += [{"value": v, "count": 0}
                 for v in set(_ints(f.get("status") or [])) - {s["value"] for s in statuses}]
    statuses.sort(key=lambda s: s["value"])

    categories = [{"id": cid, "name": name, "urgent": bool(urg), "count": n}
                  for cid, name, urg, n in counted("category", R.category_id, R.category_name,
                                                   R.category_urgent)
                  if cid is not None]
    missing = set(_ints(f.get("category") or [])) - {c["id"] for c in categories}
    if missing:
        categories += [{"id": cid, "name": name, "urgent": bool(urg), "count": 0}
                       for cid, name, urg in (
                           db.query(R.category_id, func.max(R.category_name),
                                    func.bool_or(R.category_urgent))
                           .filter(R.category_id.in_(sorted(missing)))
                           .group_by(R.category_id).all())]
    categories = _by_name(categories)

    divisions = [{"id": did, "name": name, "count": n}
                 for did, name, n in counted("division", R.division_id, R.division_name) if did]
    divisions += [{"id": did, "name": name, "count": 0} for did, name in _relabel(
        db, R.division_id, R.division_name,
        set(f.get("division") or []) - {d["id"] for d in divisions}).items()]
    divisions = _by_name(divisions)

    brigadas = [{"id": bid, "name": name, "count": n}
                for bid, name, n in counted("brigada", R.brigada_id, R.brigada_name)
                if bid is not None]
    brigadas += [{"id": bid, "name": name, "count": 0} for bid, name in _relabel(
        db, R.brigada_id, R.brigada_name,
        set(_ints(f.get("brigada") or [])) - {b["id"] for b in brigadas}).items()]
    brigadas = _by_name(brigadas)

    authors = [{"id": uid, "name": name, "count": n}
               for uid, name, n in counted("author", R.user_id, R.user_name)
               if uid is not None]
    authors += [{"id": uid, "name": name, "count": 0} for uid, name in _relabel(
        db, R.user_id, R.user_name,
        set(_ints(f.get("author") or [])) - {a["id"] for a in authors}).items()]
    authors.sort(key=lambda a: -a["count"])

    # ── the cell code, and the org chain behind it ───────────────────────────
    # Four lists come off the ONE code expression, each over its own base: the
    # cell list lifts «cell», the brigadir list lifts «manager», and so on —
    # every other level stays applied, which is the cascade this page already
    # had, now measured against the whole filter set instead of the whole
    # mirror. A level nobody picked leaves its base identical to its
    # neighbours', so the memo collapses the four queries back to one.
    code = D["cell_code"]
    memo: dict = {}

    def code_rows(lift: str):
        sig = tuple((k, () if k == lift else tuple(str(v) for v in (f.get(k) or [])))
                    for k in ("cell", "shift", "manager", "leader"))
        if sig not in memo:
            memo[sig] = (base(lift).with_entities(code.label("code"), func.count(R.id))
                         .group_by(code).all())
        return memo[sig]

    cell_rows, mgr_rows = code_rows("cell"), code_rows("manager")
    lead_rows, shift_rows = code_rows("leader"), code_rows("shift")
    picked_cells = {c for c in (f.get("cell") or []) if c and c != arc_cells.NO_CELL}
    picked_mgrs, picked_leads = _ints(f.get("manager") or []), _ints(f.get("leader") or [])
    all_codes = {c for rows in (cell_rows, mgr_rows, lead_rows, shift_rows)
                 for c, _ in rows if c} | picked_cells
    known = arc_cells.cells_for(db, all_codes)
    # The catalog is built over the UNION of the four bases (a name has to be
    # available to whichever list needs it), but which names a list OFFERS is
    # decided by that list's own rows below — a manager reached only by some
    # other level's codes would otherwise be offered at 0.
    org = arc_cells.org_index(db, all_codes, keep_managers=picked_mgrs,
                              keep_leaders=picked_leads)
    by_code = org["by_code"]

    per_code = {c: n for c, n in cell_rows if c}
    for c in picked_cells:
        per_code.setdefault(c, 0)
    cells = sorted(
        ({"code": c, "count": n, "cell": known.get(c),
          "sh": (by_code.get(c) or {}).get("shift"),
          "mgr": (by_code.get(c) or {}).get("manager_id"),
          "lead": (by_code.get(c) or {}).get("leader_id")}
         for c, n in per_code.items()),
        key=lambda x: x["code"],
    )
    no_cell = sum(n for c, n in cell_rows if not c)

    # Counted in TICKETS, like every other list here — the question the number
    # answers is «how much of this view is behind this name».
    def level(rows, key: str, keep: list[int]) -> dict[int, int]:
        out: dict[int, int] = {}
        for c, n in rows:
            v = (by_code.get(c) or {}).get(key)
            if v is not None:
                out[v] = out.get(v, 0) + n
        for k in keep:
            out.setdefault(k, 0)
        return out

    shift_n = level(shift_rows, "shift", _ints(f.get("shift") or []))
    mgr_n = level(mgr_rows, "manager_id", picked_mgrs)
    lead_n = level(lead_rows, "leader_id", picked_leads)
    org_out = {
        "shifts": [{"value": s, "count": shift_n[s]} for s in sorted(shift_n)],
        "managers": _by_name([{**org["managers"][i], "count": n}
                              for i, n in mgr_n.items() if i in org["managers"]]),
        "leaders": _by_name([{**org["leaders"][i], "count": n}
                             for i, n in lead_n.items() if i in org["leaders"]]),
    }
    return {"statuses": statuses, "categories": categories,
            "divisions": divisions, "brigadas": brigadas, "authors": authors,
            "cells": cells, "no_cell_count": no_cell, "org": org_out}


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    options: bool = Query(True),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Sync state, and — for a bundle that predates /facets — the option lists
    over the whole mirror.

    ``options=0`` is what the current page sends: it reads its lists from
    /facets, narrowed to the view, and this call is then the sync progress
    feed alone, which is polled every 2.5 s while a walk runs. The default
    stays ON so a tab still open on an older bundle keeps the lists it renders
    its filter panel from."""
    meta = db.query(ArcSyncMeta).filter_by(id=1).first()
    return {
        "configured": arc_client.configured(),
        "can_refresh": True,
        "sync": _sync_state(meta),
        "options": _facets(db, _ALL_ROWS) if options else None,
    }


@router.get("/facets")
def get_facets(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
    f: dict = Depends(_filters),
):
    """The filter option lists over exactly the rows /list shows.

    Split off /meta because the two answer different questions and move at
    different rates: the sync state is a progress feed that no filter touches,
    while these lists change with every pick and never need polling. Counts
    are over the whole filtered set — the page is paginated, the lists are
    not: a list that described the fifty rows on screen would rewrite itself
    every time the reader turned a page."""
    return _facets(db, f)


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
    # What this view is NOT showing. Only the «by cells» scope can hide a
    # ticket the other filters kept, so it is counted over the same filter set
    # with that one narrowing lifted — an org pick already excludes cell-less
    # tickets by itself, and then this is 0, which is the honest answer.
    hidden_no_cell = 0
    if f.get("cells_only"):
        hidden_no_cell = _n(
            _apply_filters(db.query(func.count(R.id)), {**f, "cells_only": False}, D, db)
            .filter(D["cell_code"].is_(None)).scalar())

    return {
        "shown": _n(shown),
        "hidden_no_cell": hidden_no_cell,
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


# ── analysis (the «Tahlil» mode) ─────────────────────────────────────────────
# Chart aggregates over exactly the rows /list shows for the same filters —
# the analysis mode is the same register read as charts, so every figure is a
# count/percentile through the same _apply_filters and the same derived
# expressions as the table and the KPI strip. `view` picks WHICH aggregates
# are computed: the two tabs ask different questions («Barchasi» = IT's flow,
# «Yacheykalar bo'yicha» = whose cells), and walking the org index for a tab
# that never renders it would be work with no reader.

_GRANS = ("day", "week", "month")
# A day-granularity walk of the whole mirror is thousands of points nobody can
# read — the trend keeps its LAST buckets and the axis states where it starts.
_TREND_MAX_BUCKETS = 400
_TOP = 12          # ranked bars: top N on screen, the card names the rest
_TOP_LEADERS = 14  # leaders are the longest list; one extra row of headroom


def _py_trunc(d: date_cls, gran: str) -> date_cls:
    """date_trunc's bucket start, in Python — for padding the trend's edges to
    the picked period. Must agree with SQL date_trunc (weeks start Monday)."""
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
    R = ArcRequest
    D = _derived()
    if gran not in _GRANS:
        gran = "day"
    base = _apply_filters(db.query(R), f, D, db)

    def _sum(cond):
        return func.coalesce(func.sum(case((cond, 1), else_=0)), 0)

    # ── flow trend: filed vs closed per bucket, Tashkent wall clock ──────────
    # The trend ALONE widens a very short period to the platform's 7-day chart
    # minimum (the utils/chartRange.js rule: only the chart window is padded;
    # every other figure keeps the exact range the reader picked).
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
            (tbase.filter(D["closed_at"].isnot(None))
             .with_entities(closed_b, func.count(R.id)).group_by(closed_b).all())
            if k is not None}
    # Zero-fill every bucket in the span — a bucket with no tickets is a real
    # zero, and a line that skips it draws a slope that never happened. The
    # picked period's own edges count toward the span, so a quiet first week
    # still starts the axis where the reader's filter starts.
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

    # ── the category mix (both views' donut) ─────────────────────────────────
    categories = [
        {"id": cid, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc)}
        for cid, name, n, dn, op, ov, cc in (
            base.with_entities(R.category_id, R.category_name, func.count(R.id),
                               _sum(D["is_done"]), _sum(D["is_open"]),
                               _sum(D["overdue_now"]), _sum(D["is_cancelled"]))
            .group_by(R.category_id, R.category_name)
            .order_by(func.count(R.id).desc()).all())
    ]
    out: dict[str, Any] = {"gran": gran, "trend": trend, "categories": categories}

    if view == "cells":
        # Per-code counts once; the top-cells chart and the two owner rollups
        # (brigadir, leader) are all read off this one pass, joined to the org
        # chart through the SAME org_index the filter panel resolves scopes
        # with — the chart and the filter must agree on whose cell a code is.
        code = D["cell_code"]
        crows = (base.filter(code.isnot(None))
                 .with_entities(code, func.count(R.id), _sum(D["is_done"]),
                                _sum(D["is_open"]), _sum(D["overdue_now"]),
                                _sum(D["is_cancelled"]))
                 .group_by(code).all())
        codes = [c for c, *_ in crows]
        org = arc_cells.org_index(db, codes)
        by_code = org["by_code"]

        cells = sorted(
            ({"code": c, "total": int(n), "done": _n(dn), "open": _n(op),
              "overdue": _n(ov), "cancelled": _n(cc)}
             for c, n, dn, op, ov, cc in crows),
            key=lambda x: -x["total"])
        top_cells = cells[:_TOP]
        out["cells"] = top_cells
        out["cells_n"] = len(cells)
        # Names for exactly the codes on screen; a code the registry has never
        # heard of stays absent and the page marks it unregistered.
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
                # k None = the codes this platform's org chart cannot place (an
                # unregistered cell, or a cell with nobody assigned). Shown as
                # its own bucket, never folded into somebody's row.
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

    # ── the register view: where from, how fast, and who does the work ───────
    divisions = [
        {"id": did, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc)}
        for did, name, n, dn, op, ov, cc in (
            base.with_entities(R.division_id, R.division_name, func.count(R.id),
                               _sum(D["is_done"]), _sum(D["is_open"]),
                               _sum(D["overdue_now"]), _sum(D["is_cancelled"]))
            .group_by(R.division_id, R.division_name)
            .order_by(func.count(R.id).desc()).all())
        if did
    ]
    out["divisions"] = divisions[:_TOP]
    out["divisions_n"] = len(divisions)

    # Median close time per category, beside the hours that category ALLOWS
    # (`ftime` — the same figure the due date is derived from). Only closed
    # tickets carry an hours figure, so each row names the count behind it.
    hours_closed = case((D["is_done"], D["hours_to_close"]), else_=None)
    speed = [
        {"id": cid, "name": name, "closed": _n(n),
         "median_h": round(float(m), 1),
         "allowed_h": float(ft) if ft else None}
        for cid, name, n, m, ft in (
            base.with_entities(R.category_id, R.category_name,
                               _sum(hours_closed.isnot(None)),
                               func.percentile_cont(0.5).within_group(hours_closed),
                               func.max(R.category_ftime))
            .group_by(R.category_id, R.category_name).all())
        if _n(n) > 0 and m is not None
    ]
    speed.sort(key=lambda x: -x["closed"])
    out["speed"] = speed[:10]
    out["speed_n"] = len(speed)

    # IT's own crews. The NULL brigade is the not-yet-assigned pile — a real
    # state (fresh tickets nobody has picked up), shown as its own row.
    brigadas = [
        {"id": bid, "name": name, "total": int(n), "done": _n(dn),
         "open": _n(op), "overdue": _n(ov), "cancelled": _n(cc),
         "median_h": round(float(m), 1) if m is not None else None}
        for bid, name, n, dn, op, ov, cc, m in (
            base.with_entities(R.brigada_id, R.brigada_name, func.count(R.id),
                               _sum(D["is_done"]), _sum(D["is_open"]),
                               _sum(D["overdue_now"]), _sum(D["is_cancelled"]),
                               func.percentile_cont(0.5).within_group(hours_closed))
            .group_by(R.brigada_id, R.brigada_name)
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
    cells_only: bool = False
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
                "urgent", "overdue", "source", "state", "q", "include_missing",
                "cells_only")


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
    if f.get("cells_only"):
        parts.append("cells_only=yes")
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
