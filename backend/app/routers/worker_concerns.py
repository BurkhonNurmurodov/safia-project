"""
Worker-concerns («Ishchi havotirlari») analytics API — the leaders' KPI over
the concerns workers file to their cell leader, synced from the per-cell
Google sheets (services/worker_concerns.py).

This feeds a real evaluation of real people, so the router is deliberately
conservative about attribution:

  * every percentage is computed HERE from raw row statuses — the sheets' own
    aggregate columns show 131% and resolved > total, and are never trusted;
  * KPI grouping keys off the registry's (brigadir, leader, cell) assignment
    (``reg_*``), the same attribution the business's own monthly sheet uses;
    rows whose cell has NO registered leader surface as an explicit
    «unassigned» bucket — visible, never ranked, never silently dropped;
  * leaders with fewer than MIN_RANKED concerns in the window are reported but
    flagged unranked — a leader with one concern must not out-rank one with a
    hundred at 93%.

Scoping (page-access matrix opens the page to supervisor + leader by default):

  * admin / any role with an "all"-scope page grant → everything;
  * supervisor → their own unit's rows (server-side, like every factory lock);
  * leader → only rows of cells registered to THEM (name-matched through
    name_map.leader_is, which already handles the sheets' spelling drift).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import false, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSetting, Cell, Manager, RoleProfile, WorkerConcern, WorkerConcernSyncMeta
from app.permissions import require_page
from app.capabilities import page_scope_is_all
from app.services.factory_scope import factory_of_managers, resolve_factory, viewer_factory_id
from app.services.name_map import leader_is, supervisor_match
from app.services.worker_concerns import STALE_AFTER, start_sync_thread

router = APIRouter(prefix="/api/worker-concerns", tags=["worker-concerns"])

PAGE_KEY = "worker-concerns"

# KPI traffic-light bands (admin-editable on the page; AppSetting-backed).
BANDS_SETTING = "worker_concern_bands"
DEFAULT_BANDS = {"green": 80, "yellow": 50}

# Leaders with fewer concerns than this in the selected window are shown but
# not color-ranked: 1/1 = 100% is noise, not performance.
MIN_RANKED = 5

STATUSES = ("todo", "doing", "done", "deferred", "other")


def get_bands(db: Session) -> dict:
    row = db.query(AppSetting).filter_by(key=BANDS_SETTING).first()
    if row:
        try:
            v = json.loads(row.value)
            g, y = int(v.get("green")), int(v.get("yellow"))
            if 0 < y < g <= 100:
                return {"green": g, "yellow": y}
        except (ValueError, TypeError):
            pass
    return dict(DEFAULT_BANDS)


# ── scoping ──────────────────────────────────────────────────────────────────

def _brigadir_map(db: Session) -> dict[str, dict]:
    """Distinct synced brigadir spellings → the supervisor unit each names.
    Resolved per request (not baked into rows) so a unit rename in Profiles
    takes effect without a re-sync — same choice as Quality."""
    names = [n for (n,) in db.query(WorkerConcern.reg_brigadir).distinct() if n]
    managers = db.query(Manager).filter(Manager.archived.is_(False)).all()
    return supervisor_match(managers, names)


def _leader_lock_names(db: Session, payload: dict) -> list[str]:
    """The reg_leader spellings that belong to the viewing leader. May be
    empty — a leader whose name matches no registry spelling sees an empty
    page (honest) rather than someone else's numbers."""
    prof = db.query(RoleProfile).filter_by(
        role="leader", manager_id=payload.get("role_id"),
        name=payload.get("full_name"),
    ).first()
    pname = prof.name if prof else (payload.get("full_name") or "")
    if not pname:
        return []
    distinct = [n for (n,) in db.query(WorkerConcern.reg_leader).distinct() if n]
    return [n for n in distinct if leader_is(n, pname)]


def _apply_scope_and_filters(
    db: Session, payload: dict, *,
    date_from: Optional[str], date_to: Optional[str],
    factory: Optional[int], manager_id: list[int],
    leader: list[str], cell: list[str], status: list[str],
    q: Optional[str] = None,
):
    """One filter builder for every read endpoint, so the KPI table, the
    charts and the register can never disagree about what "the current scope"
    means. Returns (query, sup_map)."""
    query = db.query(WorkerConcern)
    sup = _brigadir_map(db)
    fac_of = factory_of_managers(db)
    role = payload.get("role")

    # Viewer locks first — a query parameter must never widen them.
    if role == "supervisor" and not page_scope_is_all(db, payload, PAGE_KEY):
        manager_id = [payload.get("role_id")]
    elif role == "leader" and not page_scope_is_all(db, payload, PAGE_KEY):
        own = _leader_lock_names(db, payload)
        query = query.filter(WorkerConcern.reg_leader.in_(own) if own else false())

    fac = resolve_factory(db, payload, factory)
    if fac is not None:
        names = [n for n, m in sup.items() if fac_of.get(m["id"]) == fac]
        # Rows whose brigadir resolves to no unit are reachable only under
        # «All factories» — never padded onto a plant they may not belong to.
        query = query.filter(WorkerConcern.reg_brigadir.in_(names) if names else false())

    if manager_id:
        wanted = set(manager_id)
        names = [n for n, m in sup.items() if m["id"] in wanted]
        query = query.filter(WorkerConcern.reg_brigadir.in_(names) if names else false())
    if leader:
        query = query.filter(WorkerConcern.reg_leader.in_(leader))
    if cell:
        query = query.filter(WorkerConcern.reg_cell.in_(cell))
    if status:
        query = query.filter(WorkerConcern.status.in_([s for s in status if s in STATUSES]))
    # Rows with an unparseable filing date (date=None) PASS the range filter:
    # each consumer decides — the register shows them (sorted last, "—"), while
    # stats/leaders exclude them from a date-bound window and report the count.
    # Filtering them out here would make them undiscoverable forever.
    if date_from:
        query = query.filter(or_(WorkerConcern.date >= date_from,
                                 WorkerConcern.date.is_(None)))
    if date_to:
        query = query.filter(or_(WorkerConcern.date <= date_to,
                                 WorkerConcern.date.is_(None)))
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            WorkerConcern.text.ilike(like),
            WorkerConcern.owner.ilike(like),
            WorkerConcern.row_leader.ilike(like),
            WorkerConcern.reg_leader.ilike(like),
            WorkerConcern.reg_cell.ilike(like),
        ))
    return query, sup


def _filter_params(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    manager_id: list[int] = Query(default=[]),
    leader: list[str] = Query(default=[]),
    cell: list[str] = Query(default=[]),
    status: list[str] = Query(default=[]),
) -> dict:
    return {"date_from": date_from, "date_to": date_to, "factory": factory,
            "manager_id": manager_id, "leader": leader, "cell": cell, "status": status}


def _live(meta: Optional[WorkerConcernSyncMeta]) -> bool:
    """Is a crawl ACTUALLY running? The stored flag alone lies after a process
    death — a dead crawl can't flip it back, and reporting it as running gave
    the page an eternal spinner with a Refresh button nobody could press. A
    claim without a fresh heartbeat is a dead claim."""
    if not (meta and meta.running):
        return False
    hb = meta.heartbeat
    if hb is None:
        return False
    if hb.tzinfo is None:
        hb = hb.replace(tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - hb) < STALE_AFTER


def _sync_state(meta: Optional[WorkerConcernSyncMeta]) -> dict:
    return {
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "ok": meta.ok if meta else None,
        "message": meta.message if meta else None,
        "row_count": meta.row_count if meta else 0,
        "invalid_dates": meta.invalid_dates if meta else 0,
        "failed_sheets": meta.failed_sheets if meta else 0,
        "running": _live(meta),
        "progress_done": meta.progress_done if meta else 0,
        "progress_total": meta.progress_total if meta else 0,
    }


# ── endpoints ────────────────────────────────────────────────────────────────

@router.get("/meta")
def get_meta(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """Filter options + sync state + KPI bands — one boot call for the page."""
    meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
    sup = _brigadir_map(db)
    matched_ids = {m["id"] for m in sup.values()}
    managers = db.query(Manager).filter(Manager.archived.is_(False)).all()

    leaders = sorted(n for (n,) in db.query(WorkerConcern.reg_leader).distinct() if n)
    cells = sorted(
        (c for (c,) in db.query(WorkerConcern.reg_cell).distinct() if c),
        key=lambda v: (len(v), v),
    )
    # Localized workshop names for the cell filter, keyed by verifix code.
    cell_rows = db.query(Cell).filter(Cell.verifix_code.in_(cells)).all() if cells else []
    cell_names = {
        c.verifix_code: {
            "ru": c.name_workshop_ru, "uz": c.name_workshop_uz,
            "uz_cyrl": c.name_workshop_uz_cyrl, "en": c.name_workshop_en,
        } for c in cell_rows
    }

    role = payload.get("role")
    sees_all = page_scope_is_all(db, payload, PAGE_KEY)
    return {
        "can_refresh": True,
        "sync": _sync_state(meta),
        "bands": get_bands(db),
        "min_ranked": MIN_RANKED,
        "is_admin": role == "admin",
        "lock_own_unit": role == "supervisor" and not sees_all,
        "lock_own_leader": role == "leader" and not sees_all,
        "locked_factory_id": viewer_factory_id(db, payload),
        # Only units the sync actually resolved rows to — a supervisor filter
        # offering a unit with zero concerns would look broken when picked.
        "supervisors": sorted(
            ({"id": m.id, "name": m.name, "shift": m.shift, "factory_id": m.factory_id}
             for m in managers if m.id in matched_ids),
            key=lambda m: m["name"],
        ),
        "leaders": leaders,
        "cells": [{"code": c, "names": cell_names.get(c)} for c in cells],
    }


@router.get("/stats")
def get_stats(
    chart_from: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """KPI cards + daily trend + per-brigadir and per-cell breakdowns.

    ``chart_from`` (≤ date_from) widens ONLY the daily series so the trend
    chart honors the platform's 7-day minimum window while the KPI numbers
    keep the exact range the user picked (utils/chartRange.js contract)."""
    base_flt = dict(flt)
    # Daily series may need the widened window; fetch once over the widest
    # range and split in Python.
    wide = dict(flt)
    if chart_from and (not wide["date_from"] or chart_from < wide["date_from"]):
        wide["date_from"] = chart_from
    query, sup = _apply_scope_and_filters(db, payload, **wide)
    rows = query.with_entities(
        WorkerConcern.date, WorkerConcern.status, WorkerConcern.owner,
        WorkerConcern.reg_brigadir, WorkerConcern.reg_cell, WorkerConcern.reg_leader,
    ).all()

    fac_of = factory_of_managers(db)
    lo, hi = base_flt["date_from"], base_flt["date_to"]

    def in_exact(d: Optional[str]) -> bool:
        if lo and (d is None or d < lo):
            return False
        if hi and (d is None or d > hi):
            return False
        return True

    kpi = {s: 0 for s in STATUSES}
    workers: set[str] = set()
    daily: dict[str, dict] = {}
    brig: dict[str, dict] = {}
    cells: dict[str, dict] = {}
    undated = 0

    ranged = bool(lo or hi)
    for d, st, owner, b, c, l in rows:
        # Daily series: the widened window, dated rows only.
        if d is not None:
            day = daily.setdefault(d, {s: 0 for s in STATUSES})
            day[st] += 1
        if ranged and d is None:
            # In people-scope but with an unusable filing date: excluded from
            # the date-bound KPIs, counted so the page can say so.
            undated += 1
            continue
        if not in_exact(d):
            continue
        kpi[st] += 1
        if owner:
            workers.add(" ".join(owner.lower().split()))
        bd = brig.setdefault(b or "", {s: 0 for s in STATUSES})
        bd[st] += 1
        cd = cells.setdefault(c or "", {**{s: 0 for s in STATUSES}, "leader": l or ""})
        cd[st] += 1

    total = sum(kpi.values())
    done = kpi["done"]
    by_brigadir = []
    for name, v in brig.items():
        m = sup.get(name) or {}
        t = sum(v[s] for s in STATUSES)
        by_brigadir.append({
            "name": (m.get("name") or name or "—"),
            "manager_id": m.get("id"), "shift": m.get("shift"),
            "factory_id": fac_of.get(m.get("id")),
            "total": t, **{s: v[s] for s in STATUSES},
        })
    by_brigadir.sort(key=lambda r: -r["total"])

    top_cells = []
    for code, v in cells.items():
        t = sum(v[s] for s in STATUSES)
        open_n = t - v["done"]
        top_cells.append({"code": code or "—", "leader": v["leader"],
                          "total": t, "open": open_n, "done": v["done"]})
    top_cells.sort(key=lambda r: (-r["open"], -r["total"]))

    return {
        "kpi": {
            "total": total, "done": done,
            "doing": kpi["doing"], "todo": kpi["todo"],
            "deferred": kpi["deferred"], "other": kpi["other"],
            "open": total - done,
            "pct": round(done * 100 / total, 1) if total else None,
            "workers": len(workers),
            # Rows inside the current people/status scope whose filing date is
            # unusable — surfaced so a date-filtered view can say what it can't
            # show instead of silently shrinking (rows with date=None are
            # excluded by the range filters above whenever a range is set).
            "undated_in_scope": undated,
        },
        "daily": [{"d": d, **v} for d, v in sorted(daily.items())],
        "by_brigadir": by_brigadir,
        "top_cells": top_cells[:12],
    }


@router.get("/leaders")
def get_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """The KPI table: one row per REGISTERED leader (the business's own
    attribution). Cells with no registered leader fold into one explicit
    «unassigned» summary — counted, displayed, never ranked."""
    query, sup = _apply_scope_and_filters(db, payload, **flt)
    rows = query.with_entities(
        WorkerConcern.reg_leader, WorkerConcern.reg_brigadir, WorkerConcern.reg_cell,
        WorkerConcern.status, WorkerConcern.date,
    ).all()

    ranged = bool(flt["date_from"] or flt["date_to"])
    groups: dict[str, dict] = {}
    unassigned = {s: 0 for s in STATUSES}
    undated = 0
    for leader, b, c, st, d in rows:
        # A date-bound KPI must not absorb rows whose filing date is unusable —
        # they are counted and reported instead (same rule as /stats).
        if ranged and d is None:
            undated += 1
            continue
        if not leader:
            unassigned[st] += 1
            continue
        g = groups.setdefault(leader, {**{s: 0 for s in STATUSES},
                                       "brigadirs": set(), "cells": set()})
        g[st] += 1
        if b:
            g["brigadirs"].add(b)
        if c:
            g["cells"].add(c)

    out = []
    for leader, g in groups.items():
        total = sum(g[s] for s in STATUSES)
        done = g["done"]
        out.append({
            "leader": leader,
            "brigadirs": sorted((sup.get(b) or {}).get("name") or b for b in g["brigadirs"]),
            "cells": sorted(g["cells"], key=lambda v: (len(v), v)),
            "total": total, "done": done, "doing": g["doing"],
            "todo": g["todo"], "deferred": g["deferred"], "other": g["other"],
            "open": total - done,
            "pct": round(done * 100 / total, 1) if total else None,
            "ranked": total >= MIN_RANKED,
        })
    out.sort(key=lambda r: -r["total"])

    ua_total = sum(unassigned.values())
    return {
        "rows": out,
        "bands": get_bands(db),
        "min_ranked": MIN_RANKED,
        "unassigned": {**unassigned, "total": ua_total} if ua_total else None,
        "undated": undated,
    }


@router.get("/list")
def get_list(
    q: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=10, le=200),
    sort: str = Query("date_desc"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
    flt: dict = Depends(_filter_params),
):
    """The paginated register. Full concern text rides along (median ~76
    chars) — 50 rows a page keeps the payload phone-friendly without a second
    per-row fetch."""
    query, _sup = _apply_scope_and_filters(db, payload, **flt, q=q)
    total = query.count()

    order = {
        "date_asc": (WorkerConcern.date.asc().nullslast(), WorkerConcern.id.asc()),
        "date_desc": (WorkerConcern.date.desc().nullslast(), WorkerConcern.id.desc()),
    }.get(sort) or (WorkerConcern.date.desc().nullslast(), WorkerConcern.id.desc())
    items = (query.order_by(*order)
             .offset((page - 1) * page_size).limit(page_size).all())

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "rows": [{
            "id": r.id, "d": r.date, "draw": r.date_raw,
            "cell": r.reg_cell, "leader": r.reg_leader,
            "row_leader": r.row_leader, "owner": r.owner,
            "text": r.text, "st": r.status, "straw": r.status_raw,
            "brigadir": r.reg_brigadir,
        } for r in items],
    }


@router.post("/refresh")
def refresh(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """Re-crawl the registry + all ~180 cell sheets in the background (2–4
    min). Offered to every profile that can open the page; the meta poll below
    is the progress feed."""
    meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
    if _live(meta):
        raise HTTPException(status_code=409, detail="Sync is already running")
    if not start_sync_thread():
        raise HTTPException(status_code=409, detail="Sync is already running")
    return {"status": "started"}


@router.get("/refresh/status")
def refresh_status(
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE_KEY)),
):
    meta = db.query(WorkerConcernSyncMeta).filter_by(id=1).first()
    return _sync_state(meta)


class BandsBody(BaseModel):
    green: int
    yellow: int


@router.put("/thresholds")
def set_thresholds(
    body: BandsBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE_KEY)),
):
    """KPI color bands — ADMIN-ONLY (narrower than the page): the bands define
    what counts as good performance on a real evaluation, which is a policy
    decision, not a viewer preference."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if not (0 < body.yellow < body.green <= 100):
        raise HTTPException(status_code=422,
                            detail="Expected 0 < yellow < green ≤ 100")
    row = db.query(AppSetting).filter_by(key=BANDS_SETTING).first()
    value = json.dumps({"green": body.green, "yellow": body.yellow})
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=BANDS_SETTING, value=value))
    db.commit()
    return {"green": body.green, "yellow": body.yellow}
