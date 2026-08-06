"""
Setup-times page API — three tabs, one router:

* «Standart» — the hand-maintained reference register (среднее время
  переналадки по ячейкам): one row per production cell with the supervisor who
  reported it, the average changeover time in minutes, the reason for longer
  setups, and the SKU (filled in from the UI — the source workbook has no SKU
  column). Rows seeded once at startup (see startup.seed_setup_times); admins
  edit them from the page afterwards.
* «Fakt» — the daily ACTUAL changeover minutes per cell (``cell_perenaladka``,
  one row per cell+date, optional note), moved here from the Idle-cell page's
  former «Perenaladka» tab. Manual upsert/delete plus the on-demand import of
  the shift report's per-cell «Переналадка» history.
* «Tahlil» — the raw material for the standard-vs-fact comparison: per cell,
  its standard and its dated fact entries over a range (the page aggregates).

Reads/writes of fact data are scoped to the caller's cells exactly like the
Idle-cell page (admins/top-managers all, "all"-scope grants all, supervisors
their unit, leaders their own) — via idle_cell._scoped_cells(page="setup").
"""
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_cap
from app.capability_alerts import alert_grant_use, page_grant_used
from app.database import get_db
from app.models import Cell, CellPerenaladka, Manager, RoleProfile, SetupTime, SheetSource
from app.permissions import require_page
from app.routers.idle_cell import _scoped_cells
from app.services.cell_lookup import by_verifix, resolve_verifix

router = APIRouter(prefix="/api/setup-times", tags=["setup-times"])

PAGE = "setup"


class SetupTimeIn(BaseModel):
    """Create/update payload. On PATCH only the provided fields change."""
    manager_id: int | None = None
    supervisor: str | None = None
    cell: str | None = None
    minutes: float | None = None
    reason: str | None = None
    sku: str | None = None


def _require_admin(payload: dict) -> None:
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only an admin can edit setup times")


def _parse_minutes(v) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        d = Decimal(str(v))
    except InvalidOperation:
        raise HTTPException(status_code=422, detail="minutes must be a number")
    if d < 0 or d > 9999:
        raise HTTPException(status_code=422, detail="minutes out of range")
    return d


@router.get("")
def list_setup_times(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    """The whole register + the supervisor list for filters and the edit form.
    A row linked to a manager unit speaks that unit's live name/shift; unlinked
    rows keep their stored free-text supervisor name."""
    managers = {m.id: m for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    rows = db.query(SetupTime).order_by(SetupTime.id).all()

    # The free-text `cell` column holds Verifix cell codes; resolve each against
    # the canonical registry so the page can label the row with the workshop name
    # and flag codes that aren't a known cell (unseeded / suffixed sub-cells).
    cells_tbl = by_verifix(db, with_leader=True)

    def resolved(r: SetupTime):
        m = managers.get(r.manager_id)
        cell = resolve_verifix(cells_tbl, r.cell)
        return {
            "id": r.id,
            "manager_id": r.manager_id,
            "supervisor": m.name if m else r.supervisor,
            "shift": m.shift if m else None,
            "cell": r.cell,
            "cell_id": (cell["id"] if cell else None),
            "cell_name": {k: cell[k] for k in ("uz", "uz_cyrl", "ru", "en")} if cell else None,
            "cell_known": cell is not None,
            "minutes": float(r.minutes) if r.minutes is not None else None,
            "reason": r.reason,
            "sku": r.sku,
        }

    # Full cell registry for the edit-form picker: verifix code + per-language
    # workshop name + owning leader, in code order. Admin-only page, so serving
    # the whole (~100-row) catalog is cheap and keeps the picker offline-fast.
    cell_opts = [
        {
            "code": c.verifix_code,
            "uz": c.name_workshop_uz, "uz_cyrl": c.name_workshop_uz_cyrl,
            "ru": c.name_workshop_ru, "en": c.name_workshop_en,
        }
        for c in db.query(Cell).order_by(Cell.verifix_code).all()
    ]

    return {
        "can_edit": payload.get("role") == "admin",
        "supervisors": sorted(
            ({"id": m.id, "name": m.name, "shift": m.shift} for m in managers.values()),
            key=lambda m: m["name"],
        ),
        "cells": cell_opts,
        "rows": [resolved(r) for r in rows],
    }


@router.post("")
def create_setup_time(
    body: SetupTimeIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    if not (body.cell or "").strip():
        raise HTTPException(status_code=422, detail="cell is required")
    if body.manager_id is not None and not db.query(Manager).filter_by(id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Manager not found")
    r = SetupTime(
        manager_id=body.manager_id,
        supervisor=(body.supervisor or "").strip(),
        cell=body.cell.strip(),
        minutes=_parse_minutes(body.minutes),
        reason=(body.reason or "").strip(),
        sku=(body.sku or "").strip(),
    )
    db.add(r)
    db.commit()
    return {"status": "ok", "id": r.id}


# ── «Fakt» tab — daily actual changeover minutes (cell_perenaladka) ──────────
# Declared BEFORE the /{row_id} handlers: row_id is a typed int path param, so
# a later "/fact/…" would otherwise be swallowed by it as a 422.

def _valid_date(s: str) -> bool:
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except (ValueError, TypeError):
        return False


def _peren_json(p: Optional[CellPerenaladka]) -> Optional[dict]:
    if p is None:
        return None
    return {
        "id": p.id,
        "minutes": float(p.minutes or 0),
        "note": p.note or "",
        "entered_by": p.entered_by_profile,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _standards_by_cell_id(db: Session) -> dict[int, float]:
    """Registry-resolved standard minutes per cell id — the mean of the
    SetupTime rows whose free-text code resolves to that cell (rows with no
    minutes or an unknown code contribute nothing)."""
    tbl = by_verifix(db)
    acc: dict[int, list[float]] = defaultdict(list)
    for r in db.query(SetupTime).filter(SetupTime.minutes.isnot(None)).all():
        cell = resolve_verifix(tbl, r.cell)
        if cell:
            acc[cell["id"]].append(float(r.minutes))
    return {cid: sum(v) / len(v) for cid, v in acc.items()}


def _fact_cell_meta(c: Cell, mgr: Optional[Manager], leader: Optional[str],
                    standard: Optional[float]) -> dict:
    return {
        "cell_id": c.id,
        "code": c.verifix_code,
        "name": {"uz": c.name_workshop_uz, "uz_cyrl": c.name_workshop_uz_cyrl,
                 "ru": c.name_workshop_ru, "en": c.name_workshop_en},
        "leader": leader,
        "manager_id": c.manager_id,
        "supervisor": mgr.name if mgr else None,
        "shift": mgr.shift if mgr else None,
        "standard": standard,
    }


@router.get("/fact")
def list_fact(
    date: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every cell in the caller's scope with its fact entry for the date (null =
    not entered) plus its resolved standard — one payload, filtered client-side
    like the Standart tab's register."""
    if not _valid_date(date):
        raise HTTPException(status_code=400, detail="Invalid date")
    cells = _scoped_cells(db, payload, PAGE)
    if not cells:
        return {"cells": []}
    ids = [c.id for c in cells]
    entries = {p.cell_id: p for p in db.query(CellPerenaladka).filter(
        CellPerenaladka.cell_id.in_(ids),
        CellPerenaladka.date == date,
    ).all()}
    managers = {m.id: m for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    lids = {c.leader_id for c in cells if c.leader_id}
    leaders = {p.id: p.name for p in db.query(RoleProfile).filter(
        RoleProfile.id.in_(lids),
    ).all()} if lids else {}
    standards = _standards_by_cell_id(db)
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    return {"cells": [
        {**_fact_cell_meta(c, managers.get(c.manager_id), leaders.get(c.leader_id),
                           standards.get(c.id)),
         "entry": _peren_json(entries.get(c.id))}
        for c in cells
    ]}


class FactIn(BaseModel):
    cell_id: int
    date: str
    minutes: float
    note: Optional[str] = ""


@router.post("/fact")
def save_fact(
    body: FactIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Create or update (upsert by cell+date) one cell's actual changeover
    minutes. The note is OPTIONAL; the minutes must be > 0 — a blank/0 value
    means "not entered", which the UI expresses by DELETEing the row instead."""
    if not _valid_date(body.date):
        raise HTTPException(status_code=400, detail="Invalid date")
    allowed = {c.id for c in _scoped_cells(db, payload, PAGE)}
    if body.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    minutes = max(0.0, float(body.minutes or 0))
    if minutes <= 0:
        raise HTTPException(status_code=400, detail="Enter the changeover minutes")
    note = (body.note or "").strip()

    who = identity.viewer_profile_key(db, payload)
    p = db.query(CellPerenaladka).filter(
        CellPerenaladka.cell_id == body.cell_id,
        CellPerenaladka.date == body.date,
    ).first()
    old = None if p is None else {"minutes": float(p.minutes or 0), "note": p.note or ""}
    if p is None:
        p = CellPerenaladka(cell_id=body.cell_id, date=body.date)
        db.add(p)
    p.minutes = minutes
    p.note = note
    p.entered_by_profile = who
    db.commit()
    db.refresh(p)
    if page_grant_used(db, payload, PAGE):
        diff = [(k, old[k] if old else None, v) for k, v in
                (("minutes", minutes), ("note", note))
                if old is None or old[k] != v]
        if diff:
            cell = db.query(Cell).filter_by(id=body.cell_id).first()
            alert_grant_use(
                db, payload, page_cap(PAGE), "idle_cell.peren_saved",
                details=[("cell", cell.verifix_code if cell else f"#{body.cell_id}"),
                         ("date", body.date)],
                changes=diff, native=False,
            )
    return _peren_json(p)


@router.post("/fact/refresh")
def refresh_fact(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Pull the shift report's per-cell «Переналадка» minutes into the Fakt tab
    — the same «Смена отчёт» workbook the Ojidaniya sync reads, on demand from
    the page. Shown to every profile that can open the page (the refresh-button
    rule); the import itself is global history, not scoped to the caller's
    cells — it writes only what the owning brigadir answered on the form."""
    from app.services.sheets_sync import sync_cell_perenaladka

    src = db.query(SheetSource).filter(SheetSource.name == "shift_report").first()
    if not src:
        raise HTTPException(status_code=404, detail="Shift report sheet is not configured")
    try:
        result = sync_cell_perenaladka(src.sheet_id, db)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail=f"Sheet import failed: {exc}")
    if page_grant_used(db, payload, PAGE):
        alert_grant_use(
            db, payload, page_cap(PAGE), "idle_cell.peren_refreshed",
            details=[("l.count", f"+{result.get('saved', 0)} / −{result.get('cleared', 0)}")],
        )
    return {"status": "ok", **result}


@router.delete("/fact/{entry_id}", status_code=204)
def delete_fact(
    entry_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Clear one cell's fact entry (scope-checked)."""
    p = db.query(CellPerenaladka).filter(CellPerenaladka.id == entry_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Entry not found")
    allowed = {c.id for c in _scoped_cells(db, payload, PAGE)}
    if p.cell_id not in allowed:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    # Snapshot before the delete — the row is unreadable after commit.
    via_grant = page_grant_used(db, payload, PAGE)
    if via_grant:
        cell = db.query(Cell).filter_by(id=p.cell_id).first()
        del_details = [("cell", cell.verifix_code if cell else f"#{p.cell_id}"),
                       ("date", str(p.date))]
        del_changes = [("minutes", float(p.minutes or 0), None),
                       ("note", p.note or "", None)]
    db.delete(p)
    db.commit()
    if via_grant:
        alert_grant_use(db, payload, page_cap(PAGE), "idle_cell.peren_deleted",
                        details=del_details, changes=del_changes, native=False)


# ── «Tahlil» tab — standard vs fact over a range ─────────────────────────────

@router.get("/analysis")
def setup_analysis(
    start: str = Query(...),
    end: str = Query(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Per scoped cell: its standard + every dated fact entry in [start..end].
    Aggregation (averages, deltas, daily trend) happens client-side so the
    page's shift/supervisor filters recompute instantly without refetching."""
    if not _valid_date(start) or not _valid_date(end):
        raise HTTPException(status_code=400, detail="Invalid date")
    if start > end:
        start, end = end, start
    span = (datetime.strptime(end, "%Y-%m-%d") - datetime.strptime(start, "%Y-%m-%d")).days
    if span > 400:
        raise HTTPException(status_code=422, detail="Range too long (max 400 days)")
    cells = _scoped_cells(db, payload, PAGE)
    if not cells:
        return {"cells": []}
    ids = [c.id for c in cells]
    by_cell: dict[int, list[dict]] = defaultdict(list)
    rows = db.query(CellPerenaladka).filter(
        CellPerenaladka.cell_id.in_(ids),
        CellPerenaladka.date >= start,
        CellPerenaladka.date <= end,
    ).order_by(CellPerenaladka.date).all()
    for p in rows:
        by_cell[p.cell_id].append({"date": p.date, "minutes": float(p.minutes or 0)})
    managers = {m.id: m for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    standards = _standards_by_cell_id(db)
    cells.sort(key=lambda c: (c.verifix_code or "").lower())
    return {"cells": [
        {**_fact_cell_meta(c, managers.get(c.manager_id), None, standards.get(c.id)),
         "entries": by_cell.get(c.id, [])}
        for c in cells
    ]}


@router.patch("/{row_id}")
def update_setup_time(
    row_id: int,
    body: SetupTimeIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    r = db.query(SetupTime).filter_by(id=row_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Row not found")
    fields = body.model_dump(exclude_unset=True)
    if "manager_id" in fields:
        mid = fields["manager_id"]
        if mid is not None and not db.query(Manager).filter_by(id=mid).first():
            raise HTTPException(status_code=404, detail="Manager not found")
        r.manager_id = mid
    if "supervisor" in fields:
        r.supervisor = (fields["supervisor"] or "").strip()
    if "cell" in fields:
        cell = (fields["cell"] or "").strip()
        if not cell:
            raise HTTPException(status_code=422, detail="cell is required")
        r.cell = cell
    if "minutes" in fields:
        r.minutes = _parse_minutes(fields["minutes"])
    if "reason" in fields:
        r.reason = (fields["reason"] or "").strip()
    if "sku" in fields:
        r.sku = (fields["sku"] or "").strip()
    db.commit()
    return {"status": "ok"}


@router.delete("/{row_id}")
def delete_setup_time(
    row_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("setup")),
):
    _require_admin(payload)
    r = db.query(SetupTime).filter_by(id=row_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Row not found")
    db.delete(r)
    db.commit()
    return {"status": "ok"}
