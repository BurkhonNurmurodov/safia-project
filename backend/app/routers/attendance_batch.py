"""Single-file attendance ingest — the admin «Davomat» tab.

Replaces uploading one verifix workbook per supervisor: the «Отчёт по посещениям
сотрудников» export carries every worker row tagged with a «Код подразделения»
(a cell's verifix code) that resolves to the cell's supervisor.

Two phases, deliberately:

    upload  →  the file MERGES into the day's batch. Nothing is in `attendance`
               yet, no supervisor has been told anything.
    adjust  →  the admin ticks cells in/out, drags cells between supervisors,
               edits/adds/deletes worker rows.
    save    →  the batch is projected into `attendance` for the supervisors whose
               data actually changed, and only THEY are notified.

A DATE IS FED BY SEVERAL FILES. The export is taken per «Орг. единица» group, so
one day arrives as several workbooks covering different cells. Uploading never
replaces the day: cells a file doesn't mention keep their routing, ticks and row
edits untouched. When a file DOES re-supply a cell, the newer rows win — except
that the cell's routing/tick and the admin's own row work survive, because those
are decisions the file knows nothing about. A row an admin edited keeps the
admin's value and stores what the file said in `file_values`, so the tab can flag
it and offer a revert instead of losing the newer number silently.

`AttendanceBatchCell.pending` is what keeps repeat Saves cheap and safe: it marks
a cell whose state has not reached `attendance` yet, so Save only rewrites (and
only notifies) supervisors that actually changed since the last Save.

The batch is kept after Save and stays the editable source of truth for the day:
that is what lets an unticked cell be re-ticked without re-uploading, and it means
every mutation has exactly one write path (`AttendanceBatchRow` → `_sync_manager`),
never two that can drift.

A supervisor's CLOSED day is immutable here, as on every other surface — Save
skips it and the tab offers Re-open. Days that predate this flow (no batch) are
shown read-only, grouped by cell where the code is known.
"""
import logging
import re
from datetime import date as date_t, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Attendance, AttendanceBatch, AttendanceBatchCell, AttendanceBatchRow,
    AttendanceUploadFile, Cell, DailySubmission, EditRequest, HrDocument, Manager,
)
from app.routers.admin import verify_admin
from app.services.attendance_sheet import AttendanceSheetError, parse_attendance_workbook
from app.services.day_state import day_state
from app.services.kpi_calculator import is_direct_role
from app.services.name_map import supervisor_match
from app.upload_guard import validate_spreadsheet

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance-batch", tags=["attendance-batch"])

# Newest N dates offered by the picker — one row per worker per day, so an
# unbounded DISTINCT only ever gets longer (mirrors cell_attendance.DATE_LIMIT).
DATE_LIMIT = 180

# Row fields an admin may edit by hand.
EDITABLE_FIELDS = ("worker_name", "job_title", "schedule", "clock_in_out", "hours_worked")

# Fields a file supplies for a worker — snapshotted into `file_values` when an
# admin edit outranks a newer file, so the newer numbers stay recoverable.
FILE_FIELDS = ("job_title", "schedule", "clock_in_out", "hours_worked",
               "early_arrival_min", "effective_hours", "status")


# ── helpers ───────────────────────────────────────────────────────────────────

def _parse_date(s: str) -> date_t:
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid date format (expected YYYY-MM-DD)")


def _num(v):
    return float(v) if v is not None else None


def _admin_name(payload: dict) -> str:
    return payload.get("full_name") or "admin"


def _admin_tg_id(payload: dict):
    """The app JWT carries the telegram id as the string `sub` claim."""
    try:
        return int(payload.get("sub"))
    except (TypeError, ValueError):
        return None


def _name_key(name: Optional[str]) -> str:
    """Match a worker across two exports of the same cell. Verifix spells names
    consistently but pads/cases them loosely, so compare on a squeezed form."""
    return re.sub(r"\s+", " ", (name or "").strip()).upper()


def _default_included(cell: Optional[Cell]) -> bool:
    """Starting tick state for a cell on a new day: the LAST tick the admin set
    for it (every tick is remembered in `cells.att_included`), otherwise "does
    it have a supervisor" — an orphan cell must never silently land in
    somebody's numbers."""
    if cell is None:
        return False
    if cell.att_included is not None:
        return bool(cell.att_included)
    return cell.manager_id is not None


def _batch_for(db: Session, d: date_t) -> Optional[AttendanceBatch]:
    return db.query(AttendanceBatch).filter(AttendanceBatch.date == d).first()


def _recompute_row(row: AttendanceBatchRow) -> None:
    """Keep the derived fields consistent after a manual edit, using the same
    rules the parser applies (early arrival from the clock string vs schedule,
    effective hours = worked − early)."""
    from app.services.attendance_sheet import clock_metrics

    _in, _out, _hrs, early, _off = clock_metrics(row.schedule or "", row.clock_in_out or "")
    row.early_arrival_min = early
    hw = _num(row.hours_worked)
    row.effective_hours = round(hw - early / 60, 4) if hw is not None else None
    # Hours are what the calculation actually keys on (is_direct_role), so the
    # status label follows them — a hand-added row with hours but no clock
    # string still reads as "worked" rather than as an absence marker.
    row.status = "worked" if hw else ((row.clock_in_out or "").strip() or "—")


def _cell_catalog(db: Session, codes) -> dict:
    codes = [c for c in codes if c]
    if not codes:
        return {}
    return {
        c.verifix_code: c
        for c in db.query(Cell).filter(Cell.verifix_code.in_(codes)).all()
    }


def _managers_map(db: Session) -> dict:
    return {m.id: m for m in db.query(Manager).all()}


def _mark_pending(batch: AttendanceBatch, codes) -> None:
    codes = set(codes)
    for bc in batch.cells:
        if bc.verifix_code in codes:
            bc.pending = True


def _pending_targets(batch: AttendanceBatch) -> set:
    """Supervisors that Save must re-project: the owner of every pending cell,
    plus the owner it was last saved under (so a dragged cell leaves the old
    supervisor as well as joining the new one)."""
    ids = set()
    for bc in batch.cells:
        if not bc.pending:
            continue
        if bc.manager_id:
            ids.add(bc.manager_id)
        if bc.prev_manager_id:
            ids.add(bc.prev_manager_id)
    return ids


def _holding_managers(db: Session, batch: AttendanceBatch, d: date_t) -> set:
    """Every supervisor whose `attendance` for this day is owned by this batch —
    assigned now, saved under it before, or still holding rows tagged with one of
    its codes. Used by the destructive paths (discard, upload removal)."""
    ids = {bc.manager_id for bc in batch.cells if bc.manager_id}
    ids |= {bc.prev_manager_id for bc in batch.cells if bc.prev_manager_id}
    codes = [bc.verifix_code for bc in batch.cells if bc.verifix_code]
    if codes:
        prev = db.query(Attendance.manager_id).filter(
            Attendance.date == d,
            Attendance.verifix_code.in_(codes),
        ).distinct().all()
        ids |= {m for (m,) in prev if m}
    return {m for m in ids if m}


def _cellless_by_manager(db: Session, batch: AttendanceBatch) -> tuple[dict, list]:
    """Split the batch's cell-less rows into {manager_id: [rows]} + unmatched names.

    A brigadir clocks in with no «Код подразделения», so there is no cell to
    route their row on and _sync_manager has always dropped it — the person who
    runs the unit was the one person missing from their own page. The only link
    left is the NAME, matched against the supervisor registry by the same
    scorer the Quality and Leaders sheets use.

    That scorer is also what keeps this to brigadirs only: it demands surname
    AND given name agree, so the mechanics and office staff who likewise carry
    no cell match nothing and stay out, exactly as before.
    """
    rows = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.verifix_code.is_(None),
    ).all()
    if not rows:
        return {}, []

    # Active units only. An archived supervisor must not collect new attendance,
    # and leaving them in the candidate set lets a retired namesake outscore the
    # live unit — the matcher returns the single best candidate, not all of them.
    managers = db.query(Manager).filter(Manager.archived.is_(False)).all()
    hits = supervisor_match(managers, [r.worker_name for r in rows])
    by_manager: dict[int, list] = {}
    unmatched: list[str] = []
    for r in rows:
        hit = hits.get(r.worker_name)
        if hit:
            by_manager.setdefault(hit["id"], []).append(r)
        elif r.worker_name:
            unmatched.append(r.worker_name)
    return by_manager, sorted(set(unmatched))


def _sync_manager(db: Session, batch: AttendanceBatch, manager_id: int, d: date_t,
                  cellless=None) -> int:
    """Project the batch onto ONE supervisor's day: wipe their attendance for the
    date and re-insert every row of every ticked cell routed to them.

    Wiping the whole (manager, date) — not just the batch's codes — is the same
    thing the per-supervisor upload has always done. It is what prevents a
    double count when a day was also uploaded the old way, and it keeps
    "what you see on the tab" identical to "what is in attendance". The batch
    holds every file's cells for the day, so nothing another upload contributed
    is lost by the wipe.

    `cellless` is the {manager_id: [rows]} map from _cellless_by_manager, passed
    in so a save resolving twenty supervisors runs the name match once rather
    than twenty times. Resolved here when the caller doesn't supply it.

    Caller commits. Returns the number of rows written.
    """
    db.query(Attendance).filter(
        Attendance.manager_id == manager_id,
        Attendance.date == d,
    ).delete(synchronize_session=False)

    codes = [
        bc.verifix_code for bc in batch.cells
        if bc.included and bc.manager_id == manager_id and bc.verifix_code
    ]
    written = 0
    if codes:
        rows = db.query(AttendanceBatchRow).filter(
            AttendanceBatchRow.batch_id == batch.id,
            AttendanceBatchRow.verifix_code.in_(codes),
        ).all()
        for r in rows:
            db.add(Attendance(
                manager_id=manager_id,
                date=d,
                worker_name=r.worker_name,
                job_title=r.job_title,
                schedule=r.schedule,
                clock_in_out=r.clock_in_out,
                hours_worked=r.hours_worked,
                early_arrival_min=r.early_arrival_min,
                effective_hours=r.effective_hours,
                verifix_code=r.verifix_code,
            ))
            written += 1

    # The unit's own brigadir, matched by name because they carry no cell code.
    # Written on every re-projection like any other row, so the wipe above never
    # leaves them behind. Cell stays NULL — the Yacheyka column shows a dash,
    # which is the truth: they came without being assigned to one.
    if cellless is None:
        cellless = _cellless_by_manager(db, batch)[0]
    for r in cellless.get(manager_id, []):
        db.add(Attendance(
            manager_id=manager_id,
            date=d,
            worker_name=r.worker_name,
            job_title=r.job_title,
            schedule=r.schedule,
            clock_in_out=r.clock_in_out,
            hours_worked=r.hours_worked,
            early_arrival_min=r.early_arrival_min,
            effective_hours=r.effective_hours,
            verifix_code=None,
            is_supervisor=True,
        ))
        written += 1

    # A re-projection over a day that already had approved → task exchanges
    # brings every worker's full row back while the exchange docs stay, so
    # task-assigned workers would reappear with full hours and be re-counted.
    # Same guard the per-supervisor upload uses.
    try:
        from app.routers.staff import reapply_task_exchanges
        reapply_task_exchanges(db, manager_id, d)
    except Exception:  # noqa: BLE001 — never fail a write on the replay
        log.exception("reapply_task_exchanges failed for manager %s on %s", manager_id, d)
    return written


def _clear_pending(batch: AttendanceBatch, synced: set) -> None:
    """A cell stops being pending once BOTH ends of its move have been written:
    its current owner and the supervisor it used to be saved under. A cell whose
    new owner's day is closed stays pending, which is exactly right — the tab
    keeps showing it as unsaved until the day is re-opened and saved."""
    for bc in batch.cells:
        if not bc.pending:
            continue
        old_done = bc.prev_manager_id is None or bc.prev_manager_id in synced
        if bc.manager_id is None:
            if old_done:
                bc.pending = False
                bc.prev_manager_id = None
        elif bc.manager_id in synced and old_done:
            bc.pending = False
            bc.prev_manager_id = bc.manager_id


def _project(db: Session, batch: AttendanceBatch, d: date_t, targets=None):
    """Write the batch into `attendance` for the given supervisors (default: the
    ones with pending changes), skipping any whose day is closed.

    Returns (written, skipped) where `written` is [{manager_id, rows}] — the list
    Save notifies from, so a supervisor untouched by this round is never pinged.
    """
    if targets is None:
        targets = _pending_targets(batch)
    cellless = _cellless_by_manager(db, batch)[0]
    written, skipped = [], []
    for mid in sorted({m for m in targets if m}):
        state, _closure, _counts = day_state(db, mid, d)
        if state != "open":
            skipped.append(mid)
            continue
        written.append({
            "manager_id": mid,
            "rows": _sync_manager(db, batch, mid, d, cellless),
        })
    _clear_pending(batch, {w["manager_id"] for w in written})
    return written, skipped


def _stage(batch: AttendanceBatch, codes) -> None:
    """Record a change WITHOUT touching `attendance`.

    Everything the admin does on the tab — uploading another file, ticking,
    dragging, editing or adding a worker — is staged. Save is the single moment
    data goes live and supervisors are told, which is the whole point of the
    two-phase flow: an upload that quietly rewrote an already-saved day would
    change a supervisor's numbers with nobody notified.

    The three explicitly destructive actions (remove upload, delete a cell's day,
    delete a supervisor's day) are the deliberate exception — they are confirmed
    deletions that only ever REMOVE data, so they apply at once via `_project`.
    """
    _mark_pending(batch, codes)


def _apply_removal(db: Session, batch: AttendanceBatch, d: date_t) -> list:
    """Push a confirmed deletion through to `attendance` immediately. Returns the
    supervisors skipped because their day is closed (there are none in practice —
    the callers gate on `_require_open_day` first)."""
    if batch.saved_at is None:
        return []
    db.flush()
    _written, skipped = _project(db, batch, d)
    return skipped


def _require_open_day(db: Session, manager_id: Optional[int], d: date_t) -> None:
    """A closed day is immutable — the admin re-opens it first (the tab shows a
    Re-open button next to the supervisor). Unassigned cells have no day to
    close, so they are always editable."""
    if not manager_id:
        return
    state, _closure, _counts = day_state(db, manager_id, d)
    if state == "open":
        return
    mgr = db.query(Manager).filter(Manager.id == manager_id).first()
    raise HTTPException(
        status_code=409,
        detail={
            "code": "day_closed",
            "manager_id": manager_id,
            "manager_name": mgr.name if mgr else str(manager_id),
            "state": state,
        },
    )


# ── payload builders ──────────────────────────────────────────────────────────

def _row_json(r: AttendanceBatchRow) -> dict:
    return {
        "id":                r.id,
        "worker_name":       r.worker_name,
        "job_title":         r.job_title,
        "schedule":          r.schedule,
        "clock_in_out":      r.clock_in_out,
        "hours_worked":      _num(r.hours_worked),
        "early_arrival_min": _num(r.early_arrival_min),
        "effective_hours":   _num(r.effective_hours),
        "status":            r.status,
        "counted":           is_direct_role(r.job_title, r.hours_worked),
        "edited":            bool(r.edited),
        "manual":            bool(r.manual),
        "file_values":       r.file_values,
    }


def _cell_json(bc: AttendanceBatchCell, cell: Optional[Cell], rows: list) -> dict:
    counted = [r for r in rows if is_direct_role(r.job_title, r.hours_worked)]
    hours = sum(float(r.hours_worked or 0) for r in counted)
    registry_manager = cell.manager_id if cell else None
    return {
        "verifix_code":       bc.verifix_code,
        "cell_id":            bc.cell_id,
        "name":               (cell.name_workshop_ru if cell else None) or bc.source_name,
        "name_uz":            cell.name_workshop_uz if cell else None,
        "name_uz_cyrl":       cell.name_workshop_uz_cyrl if cell else None,
        "name_ru":            (cell.name_workshop_ru if cell else None) or bc.source_name,
        "name_en":            cell.name_workshop_en if cell else None,
        "sap_code":           cell.sap_code if cell else None,
        "manager_id":         bc.manager_id,
        "registry_manager_id": registry_manager,
        "included":           bool(bc.included),
        "registry_included":  _default_included(cell),
        "moved":              bc.manager_id != registry_manager,
        "pending":            bool(bc.pending),
        "upload_id":          bc.upload_id,
        "workers":            len(rows),
        "present":            len(counted),
        "hours":              round(hours, 2),
        "conflicts":          sum(1 for r in rows if r.file_values),
        "rows":               [_row_json(r) for r in sorted(rows, key=lambda x: (x.worker_name or "").lower())],
    }


def _section_totals(cells: list) -> dict:
    on = [c for c in cells if c["included"]]
    return {
        "cells":    len(cells),
        "included": len(on),
        "workers":  sum(c["workers"] for c in on),
        "present":  sum(c["present"] for c in on),
        "hours":    round(sum(c["hours"] for c in on), 2),
        "pending":  sum(1 for c in cells if c["pending"]),
    }


def _batch_payload(db: Session, batch: AttendanceBatch, d: date_t) -> dict:
    cells_by_code = _cell_catalog(db, [bc.verifix_code for bc in batch.cells])
    rows_by_code: dict = {}
    for r in db.query(AttendanceBatchRow).filter(AttendanceBatchRow.batch_id == batch.id).all():
        rows_by_code.setdefault(r.verifix_code, []).append(r)

    managers = _managers_map(db)
    sections: dict = {}
    unassigned: list = []

    for bc in sorted(batch.cells, key=lambda c: (c.verifix_code or "zzz")):
        cj = _cell_json(bc, cells_by_code.get(bc.verifix_code), rows_by_code.get(bc.verifix_code, []))
        if bc.manager_id and bc.manager_id in managers:
            sections.setdefault(bc.manager_id, []).append(cj)
        else:
            cj["manager_id"] = None
            unassigned.append(cj)

    out_sections = []
    for mid, cells in sections.items():
        mgr = managers[mid]
        state, closure, counts = day_state(db, mid, d)
        out_sections.append({
            "manager_id":   mid,
            "manager_name": mgr.name,
            "shift":        mgr.shift,
            "archived":     bool(mgr.archived),
            "day_state":    state,
            "closed_at":    closure.approved_at.isoformat() if closure and getattr(closure, "approved_at", None) else None,
            "pending":      counts,
            "cells":        cells,
            "totals":       _section_totals(cells),
        })
    out_sections.sort(key=lambda s: (s["manager_name"] or "").lower())

    all_cells = [c for s in out_sections for c in s["cells"]] + unassigned
    pending_cells = sum(1 for c in all_cells if c["pending"])

    # Status is DERIVED, so a merged day reads honestly: nothing saved yet →
    # draft; some cells saved and others still waiting → partial.
    if batch.saved_at is None:
        status = "draft"
    elif pending_cells:
        status = "partial"
    else:
        status = "saved"

    return {
        "date":   d.isoformat(),
        "status": status,
        "batch": {
            "saved_at":     batch.saved_at.isoformat() if batch.saved_at else None,
            "saved_by":     batch.saved_by_name,
            "pending_cells": pending_cells,
        },
        "uploads": [
            {
                "id":             u.id,
                "filename":       u.filename,
                "uploaded_at":    u.uploaded_at.isoformat() if u.uploaded_at else None,
                "uploaded_by":    u.uploaded_by_name,
                "export_ts":      u.export_ts.isoformat() if u.export_ts else None,
                "cells_added":    u.cells_added,
                "cells_replaced": u.cells_replaced,
                "rows_added":     u.rows_added,
                "cells_now":      sum(1 for bc in batch.cells if bc.upload_id == u.id),
            }
            for u in sorted(batch.uploads, key=lambda x: (x.uploaded_at or datetime.min.replace(tzinfo=timezone.utc)))
        ],
        "sections":   out_sections,
        "unassigned": unassigned,
        "totals": {
            "cells":         len(all_cells),
            "included":      sum(1 for c in all_cells if c["included"]),
            "unassigned":    len(unassigned),
            "supervisors":   len(out_sections),
            "workers":       sum(c["workers"] for c in all_cells),
            "counted":       sum(c["present"] for c in all_cells if c["included"]),
            "hours":         round(sum(c["hours"] for c in all_cells if c["included"]), 2),
            "excluded_rows": sum(c["workers"] for c in all_cells if not c["included"]),
            "pending":       pending_cells,
            "conflicts":     sum(c["conflicts"] for c in all_cells),
        },
    }


def _legacy_payload(db: Session, d: date_t) -> dict:
    """A day that predates this flow (or was uploaded per-supervisor): show what
    IS in `attendance`, grouped the same way, read-only. Rows with no cell code
    fall into one "—" group per supervisor rather than being hidden."""
    rows = db.query(Attendance).filter(Attendance.date == d).all()
    empty_totals = {"cells": 0, "included": 0, "unassigned": 0, "supervisors": 0,
                    "workers": 0, "counted": 0, "hours": 0, "excluded_rows": 0,
                    "pending": 0, "conflicts": 0}
    if not rows:
        return {"date": d.isoformat(), "status": "none", "batch": None, "uploads": [],
                "sections": [], "unassigned": [], "totals": empty_totals}

    managers = _managers_map(db)
    cells_by_code = _cell_catalog(db, {r.verifix_code for r in rows})
    grouped: dict = {}
    for r in rows:
        grouped.setdefault(r.manager_id, {}).setdefault(r.verifix_code, []).append(r)

    sections = []
    for mid, by_code in grouped.items():
        mgr = managers.get(mid)
        state, closure, counts = day_state(db, mid, d) if mid else ("open", None, {})
        cells = []
        for code, rws in sorted(by_code.items(), key=lambda kv: (kv[0] or "zzz")):
            cell = cells_by_code.get(code)
            counted = [r for r in rws if is_direct_role(r.job_title, r.hours_worked)]
            cells.append({
                "verifix_code":        code,
                "cell_id":             cell.id if cell else None,
                "name":                (cell.name_workshop_ru if cell else None),
                "name_uz":             cell.name_workshop_uz if cell else None,
                "name_uz_cyrl":        cell.name_workshop_uz_cyrl if cell else None,
                "name_ru":             cell.name_workshop_ru if cell else None,
                "name_en":             cell.name_workshop_en if cell else None,
                "sap_code":            cell.sap_code if cell else None,
                "manager_id":          mid,
                "registry_manager_id": cell.manager_id if cell else None,
                "included":            True,
                "registry_included":   True,
                "moved":               False,
                "pending":             False,
                "upload_id":           None,
                "workers":             len(rws),
                "present":             len(counted),
                "hours":               round(sum(float(r.hours_worked or 0) for r in counted), 2),
                "conflicts":           0,
                "rows": [
                    {
                        "id":                r.id,
                        "worker_name":       r.worker_name,
                        "job_title":         r.job_title,
                        "schedule":          r.schedule,
                        "clock_in_out":      r.clock_in_out,
                        "hours_worked":      _num(r.hours_worked),
                        "early_arrival_min": _num(r.early_arrival_min),
                        "effective_hours":   _num(r.effective_hours),
                        "status":            "worked" if (r.hours_worked or 0) else "—",
                        "counted":           is_direct_role(r.job_title, r.hours_worked),
                        "edited":            False,
                        "manual":            False,
                        "file_values":       None,
                    }
                    for r in sorted(rws, key=lambda x: (x.worker_name or "").lower())
                ],
            })
        sections.append({
            "manager_id":   mid,
            "manager_name": mgr.name if mgr else f"#{mid}",
            "shift":        mgr.shift if mgr else None,
            "archived":     bool(mgr.archived) if mgr else False,
            "day_state":    state,
            "closed_at":    closure.approved_at.isoformat() if closure and getattr(closure, "approved_at", None) else None,
            "pending":      counts,
            "cells":        cells,
            "totals":       _section_totals(cells),
        })
    sections.sort(key=lambda s: (s["manager_name"] or "").lower())

    all_cells = [c for s in sections for c in s["cells"]]
    totals = dict(empty_totals)
    totals.update({
        "cells":       len(all_cells),
        "included":    len(all_cells),
        "supervisors": len(sections),
        "workers":     sum(c["workers"] for c in all_cells),
        "counted":     sum(c["present"] for c in all_cells),
        "hours":       round(sum(c["hours"] for c in all_cells), 2),
    })
    return {"date": d.isoformat(), "status": "legacy", "batch": None, "uploads": [],
            "sections": sections, "unassigned": [], "totals": totals}


# ── read ──────────────────────────────────────────────────────────────────────

@router.get("/dates")
def list_dates(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Days the tab can open, newest first: every uploaded batch plus every day
    that already has attendance from the older per-supervisor path."""
    out: dict = {}
    for b in db.query(AttendanceBatch).order_by(AttendanceBatch.date.desc()).limit(DATE_LIMIT).all():
        out[b.date] = {"date": b.date.isoformat(),
                       "status": "draft" if b.saved_at is None else "saved"}
    rows = (
        db.query(Attendance.date)
        .distinct()
        .order_by(Attendance.date.desc())
        .limit(DATE_LIMIT)
        .all()
    )
    for (d,) in rows:
        out.setdefault(d, {"date": d.isoformat(), "status": "legacy"})
    return sorted(out.values(), key=lambda x: x["date"], reverse=True)


@router.get("/managers")
def list_managers(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Every active supervisor — the drag/move targets, including units that
    carry no cell in the current file (so a cell can be routed to them)."""
    rows = (
        db.query(Manager.id, Manager.name, Manager.shift)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    return [{"manager_id": r.id, "name": r.name, "shift": r.shift} for r in rows]


@router.get("")
def get_day(
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if batch:
        return _batch_payload(db, batch, d)
    return _legacy_payload(db, d)


# ── upload (merge) ────────────────────────────────────────────────────────────

def _merge_file(db: Session, batch: AttendanceBatch, upload: AttendanceUploadFile,
                parsed: dict, known: dict):
    """Fold one workbook into the day. Returns (added, replaced, rows_added,
    kept_edits) — `added`/`replaced` are cell codes, for the upload summary.

    Cells this file does not mention are never touched. For a cell it DOES bring:
      * the cell's supervisor and tick are left exactly as the admin set them —
        the file has no opinion about routing;
      * file-supplied rows are replaced by the newer ones;
      * rows the admin edited, and rows the admin added by hand, SURVIVE. When
        the newer file disagrees with an edited row, the file's version is kept
        in `file_values` so the tab can flag it and offer a revert.
    """
    org_units = parsed["org_units"]
    by_code: dict = {}
    for r in parsed["rows"]:
        by_code.setdefault(r["verifix_code"], []).append(r)

    existing_cells = {bc.verifix_code: bc for bc in batch.cells}
    added, replaced, rows_added, kept_edits = [], [], 0, 0

    for code, new_rows in by_code.items():
        if not code:
            continue
        cell = known.get(code)
        bc = existing_cells.get(code)
        if bc is None:
            bc = AttendanceBatchCell(
                batch_id=batch.id,
                verifix_code=code,
                cell_id=cell.id if cell else None,
                manager_id=cell.manager_id if cell else None,
                included=_default_included(cell) and bool(cell and cell.manager_id),
                source_name=org_units.get(code),
                upload_id=upload.id,
                pending=True,
            )
            db.add(bc)
            existing_cells[code] = bc
            added.append(code)
        else:
            bc.upload_id = upload.id
            bc.pending = True
            if not bc.source_name:
                bc.source_name = org_units.get(code)
            replaced.append(code)

        prior = db.query(AttendanceBatchRow).filter(
            AttendanceBatchRow.batch_id == batch.id,
            AttendanceBatchRow.verifix_code == code,
        ).all()
        # The admin's own work outranks the file (their explicit choice).
        protected = {_name_key(r.worker_name): r for r in prior if r.edited or r.manual}
        for r in prior:
            if not (r.edited or r.manual):
                db.delete(r)

        for nr in new_rows:
            keep = protected.get(_name_key(nr["worker_name"]))
            if keep is not None:
                snapshot = {k: nr.get(k) for k in FILE_FIELDS}
                current = {
                    "job_title": keep.job_title, "schedule": keep.schedule,
                    "clock_in_out": keep.clock_in_out,
                    "hours_worked": _num(keep.hours_worked),
                    "early_arrival_min": _num(keep.early_arrival_min),
                    "effective_hours": _num(keep.effective_hours),
                    "status": keep.status,
                }
                # Only flag a real disagreement — an identical re-export is not
                # a conflict and must not litter the table with badges.
                if any(snapshot.get(k) != current.get(k) for k in FILE_FIELDS):
                    keep.file_values = snapshot
                    kept_edits += 1
                else:
                    keep.file_values = None
                continue
            db.add(AttendanceBatchRow(
                batch_id=batch.id,
                upload_id=upload.id,
                verifix_code=code,
                worker_name=nr["worker_name"],
                job_title=nr["job_title"],
                schedule=nr["schedule"],
                clock_in_out=nr["clock_in_out"],
                hours_worked=nr["hours_worked"],
                early_arrival_min=nr["early_arrival_min"],
                effective_hours=nr["effective_hours"],
                status=nr["status"],
            ))
            rows_added += 1

    return added, replaced, rows_added, kept_edits


@router.post("/upload")
async def upload(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_admin),
):
    """MERGE one export into its day. Writes nothing to `attendance` and notifies
    nobody — that is what /save is for.

    A day is normally fed by several files (one per «Орг. единица» group), so an
    upload only ever adds to the day. It never disturbs cells another file
    contributed, and never resets routing or ticks the admin has already made.

    Unknown «Код подразделения» values auto-register as supervisor-less cells
    (named from the file's «Орг. единица» line) so they surface in the tab's
    "no supervisor" section, unticked, ready to be dragged onto a supervisor.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No file uploaded")
    if len(files) > 1:
        raise HTTPException(status_code=400, detail="Bitta faylni yuklang")
    f = files[0]

    content = await f.read()
    validate_spreadsheet(f, content)          # extension + magic bytes

    try:
        parsed = parse_attendance_workbook(content, f.filename or "")
    except AttendanceSheetError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:  # noqa: BLE001 — a broken export must not 500
        log.exception("attendance workbook parse failed: %s", f.filename)
        raise HTTPException(status_code=400, detail=f"Faylni o'qib bo'lmadi: {e}")

    if parsed["day_count"] != 1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Fayl {parsed['day_count']} kunni qamrab olgan. "
                "Bir martada faqat BITTA kunlik hisobotni yuklang."
            ),
        )

    d = parsed["period_from"]
    codes = sorted({r["verifix_code"] for r in parsed["rows"] if r["verifix_code"]})
    if not codes:
        raise HTTPException(status_code=400, detail="Faylda «Код подразделения» yo'q")

    # Auto-register unknown cells: supervisor-less, out of the load, named from
    # the header line. They land in the "no supervisor" bucket, unticked.
    known = _cell_catalog(db, codes)
    created = []
    for code in codes:
        if code in known:
            continue
        cell = Cell(
            verifix_code=code,
            name_workshop_ru=parsed["org_units"].get(code),
            manager_id=None,
            in_load=False,
        )
        db.add(cell)
        known[code] = cell
        created.append(code)
    if created:
        db.flush()

    batch = _batch_for(db, d)
    if batch is None:
        batch = AttendanceBatch(
            date=d,
            status="draft",
            source_filename=f.filename,
            export_ts=parsed["export_ts"],
            uploaded_by=_admin_tg_id(payload),
            uploaded_by_name=_admin_name(payload),
        )
        db.add(batch)
        db.flush()

    upload_row = AttendanceUploadFile(
        batch_id=batch.id,
        filename=f.filename,
        export_ts=parsed["export_ts"],
        uploaded_by=_admin_tg_id(payload),
        uploaded_by_name=_admin_name(payload),
    )
    db.add(upload_row)
    db.flush()

    added, replaced, rows_added, kept_edits = _merge_file(db, batch, upload_row, parsed, known)
    upload_row.cells_added = len(added)
    upload_row.cells_replaced = len(replaced)
    upload_row.rows_added = rows_added
    db.flush()
    db.refresh(batch)

    # Staged, never live: the merged cells are marked pending by `_merge_file`
    # and reach `attendance` only when the admin presses Save. Uploading a second
    # file into an already-saved day therefore changes nobody's numbers until
    # that Save — and then only the supervisors this file actually touched.
    try:
        db.commit()
    except IntegrityError:
        # Two admins uploading at the same moment: one of them loses the race on
        # `cells.verifix_code` / the one-batch-per-date constraint.
        db.rollback()
        log.warning("attendance batch upload raced for %s", d)
        raise HTTPException(
            status_code=409,
            detail="Bir vaqtda boshqa yuklama bo'ldi — qayta urinib ko'ring",
        )
    db.refresh(batch)

    matched, unmatched = _cellless_by_manager(db, batch)

    result = _batch_payload(db, batch, d)
    result["upload_result"] = {
        "upload_id":      upload_row.id,
        "filename":       f.filename,
        "cells_added":    added,
        "cells_replaced": replaced,
        "rows_added":     rows_added,
        "kept_edits":     kept_edits,
        "created_cells":  created,
        # Brigadirs found by name among the cell-less rows, and the cell-less
        # names that reached no supervisor. The second list is the one worth
        # reading: a brigadir whose name is spelled a new way silently stays
        # off their own page, and without this nothing would ever say so.
        "brigadirs":      sum(len(v) for v in matched.values()),
        "unmatched":      unmatched,
    }
    return result


@router.delete("/uploads/{upload_id}")
def remove_upload(
    upload_id: int,
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Pull one file back out of the day, leaving every other file's cells alone.

    Removes exactly the rows this file supplied. A cell left with no rows goes
    with it; a cell that still holds hand-added rows STAYS (that work was not the
    file's to take), just detached from the upload. Cells a later file re-supplied
    belong to that file and are untouched.
    """
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    up = db.query(AttendanceUploadFile).filter(
        AttendanceUploadFile.id == upload_id,
        AttendanceUploadFile.batch_id == batch.id,
    ).first()
    if not up:
        raise HTTPException(status_code=404, detail="Yuklama topilmadi")

    rows = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.upload_id == up.id,
    ).all()
    codes = {r.verifix_code for r in rows} | {
        bc.verifix_code for bc in batch.cells if bc.upload_id == up.id
    }

    # Every supervisor that owns an affected cell must be open — removing an
    # upload rewrites their attendance, and a closed day is immutable.
    owners = {bc.manager_id for bc in batch.cells if bc.verifix_code in codes and bc.manager_id}
    for mid in sorted(owners):
        _require_open_day(db, mid, d)

    rows_deleted = 0
    for r in rows:
        db.delete(r)
        rows_deleted += 1
    db.flush()

    kept_manual, dropped_cells = 0, []
    for bc in list(batch.cells):
        if bc.verifix_code not in codes:
            continue
        remaining = db.query(AttendanceBatchRow).filter(
            AttendanceBatchRow.batch_id == batch.id,
            AttendanceBatchRow.verifix_code == bc.verifix_code,
        ).count()
        if remaining == 0:
            if bc.prev_manager_id or bc.manager_id:
                # Its supervisor must be re-projected so the rows leave attendance.
                bc.included = False
                bc.pending = True
            else:
                dropped_cells.append(bc.verifix_code)
        else:
            kept_manual += remaining
            if bc.upload_id == up.id:
                bc.upload_id = None
            bc.pending = True

    _mark_pending(batch, codes)
    skipped = _apply_removal(db, batch, d)

    # Now that attendance no longer references them, the emptied cells can go.
    for bc in list(batch.cells):
        if bc.verifix_code in codes:
            remaining = db.query(AttendanceBatchRow).filter(
                AttendanceBatchRow.batch_id == batch.id,
                AttendanceBatchRow.verifix_code == bc.verifix_code,
            ).count()
            if remaining == 0:
                if bc.verifix_code not in dropped_cells:
                    dropped_cells.append(bc.verifix_code)
                db.delete(bc)

    db.delete(up)
    db.flush()
    db.refresh(batch)

    if not batch.cells:
        db.delete(batch)
        db.commit()
        return {**_legacy_payload(db, d),
                "removed": {"rows_deleted": rows_deleted, "cells_removed": sorted(dropped_cells),
                            "manual_rows_kept": kept_manual, "skipped_managers": skipped}}

    db.commit()
    db.refresh(batch)
    out = _batch_payload(db, batch, d)
    out["removed"] = {
        "rows_deleted":     rows_deleted,
        "cells_removed":    sorted(dropped_cells),
        "manual_rows_kept": kept_manual,
        "skipped_managers": skipped,
    }
    return out


@router.delete("")
def discard(
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Throw away the WHOLE day — every file, every adjustment. Attendance that
    was already saved goes too (for supervisors whose day is still open). Use the
    per-upload removal for a single wrong file."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    skipped = []
    for mid in sorted(_holding_managers(db, batch, d)):
        state, _c, _n = day_state(db, mid, d)
        if state != "open":
            skipped.append(mid)
            continue
        db.query(Attendance).filter(
            Attendance.manager_id == mid, Attendance.date == d,
        ).delete(synchronize_session=False)

    db.delete(batch)
    db.commit()
    return {"date": d.isoformat(), "skipped_managers": skipped}


# ── mapping (checkbox + drag) ─────────────────────────────────────────────────

class CellChange(BaseModel):
    verifix_code: str
    manager_id: Optional[int] = None
    included: Optional[bool] = None
    clear_manager: bool = False       # explicit "move back to no supervisor"


class MappingBody(BaseModel):
    date: str
    changes: list[CellChange]
    permanent: bool = False           # also write the decision to the cell registry


@router.put("/cells")
def update_cells(
    body: MappingBody,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Apply tick / move decisions for the day. A TICK always writes itself into
    `cells.att_included`, so every FUTURE day starts from the last decision
    (that is the whole point of the checkbox — it does not change day to day).
    A MOVE stays this-day-only until `permanent`, which also writes the
    supervisor into the registry every other page reads."""
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    if not body.changes:
        return _batch_payload(db, batch, d)

    by_code = {bc.verifix_code: bc for bc in batch.cells}
    valid_managers = {m.id for m in db.query(Manager.id).all()}

    for ch in body.changes:
        bc = by_code.get(ch.verifix_code)
        if not bc:
            raise HTTPException(status_code=404, detail=f"Yacheyka topilmadi: {ch.verifix_code}")
        if ch.manager_id is not None and ch.manager_id not in valid_managers:
            raise HTTPException(status_code=400, detail=f"Noma'lum brigadir: {ch.manager_id}")

        if ch.clear_manager:
            bc.manager_id = None
            bc.included = False        # nobody owns it → it counts for nobody
        elif ch.manager_id is not None:
            bc.manager_id = ch.manager_id
        if ch.included is not None:
            bc.included = bool(ch.included) and bc.manager_id is not None
        bc.pending = True

        # The TICK is a standing preference, not a whim of one day: whatever the
        # admin last decided about a cell is what every future day starts from,
        # so the same 139 boxes are not re-ticked every morning. The SUPERVISOR
        # is deliberately not written here — `cells.manager_id` owns the cell
        # platform-wide, so a move stays this-day-only until «Doimiy qilish».
        if bc.cell_id and (body.permanent or ch.included is not None):
            cell = db.query(Cell).filter(Cell.id == bc.cell_id).first()
            if cell:
                if ch.included is not None:
                    cell.att_included = bool(ch.included)
                if body.permanent:
                    cell.manager_id = bc.manager_id
                    cell.att_included = bool(bc.included)

    db.commit()
    db.refresh(batch)
    return _batch_payload(db, batch, d)


# ── worker rows ───────────────────────────────────────────────────────────────

class RowBody(BaseModel):
    date: str
    worker_name: Optional[str] = None
    job_title: Optional[str] = None
    schedule: Optional[str] = None
    clock_in_out: Optional[str] = None
    hours_worked: Optional[float] = None
    verifix_code: Optional[str] = None   # create only


def _row_or_404(db: Session, row_id: int, batch: AttendanceBatch) -> AttendanceBatchRow:
    row = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.id == row_id,
        AttendanceBatchRow.batch_id == batch.id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Qator topilmadi")
    return row


def _owner_of(batch: AttendanceBatch, code: Optional[str]) -> Optional[int]:
    for bc in batch.cells:
        if bc.verifix_code == code:
            return bc.manager_id
    return None


@router.post("/rows")
def add_row(
    body: RowBody,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Hand-add a worker the export missed (a forgotten punch, a late entry).
    Manual rows survive any later re-upload of their cell."""
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    if not (body.worker_name or "").strip():
        raise HTTPException(status_code=400, detail="Xodim ismi kerak")
    if not body.verifix_code:
        raise HTTPException(status_code=400, detail="Yacheyka tanlanmagan")
    if body.verifix_code not in {bc.verifix_code for bc in batch.cells}:
        raise HTTPException(status_code=404, detail=f"Yacheyka topilmadi: {body.verifix_code}")

    manager_id = _owner_of(batch, body.verifix_code)
    _require_open_day(db, manager_id, d)

    row = AttendanceBatchRow(
        batch_id=batch.id,
        verifix_code=body.verifix_code,
        worker_name=body.worker_name.strip(),
        job_title=(body.job_title or "").strip(),
        schedule=(body.schedule or "").strip(),
        clock_in_out=(body.clock_in_out or "").strip(),
        hours_worked=body.hours_worked,
        manual=True,
        edited=True,
    )
    _recompute_row(row)
    db.add(row)
    db.flush()
    _stage(batch, [body.verifix_code])
    db.commit()
    db.refresh(batch)
    return _batch_payload(db, batch, d)


@router.patch("/rows/{row_id}")
def edit_row(
    row_id: int,
    body: RowBody,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    row = _row_or_404(db, row_id, batch)
    manager_id = _owner_of(batch, row.verifix_code)
    _require_open_day(db, manager_id, d)

    patch = body.model_dump(exclude_unset=True)
    touched = False
    for field in EDITABLE_FIELDS:
        if field not in patch:
            continue
        value = patch[field]
        if field == "hours_worked":
            if value is not None:
                try:
                    value = float(value)
                except (TypeError, ValueError):
                    raise HTTPException(status_code=400, detail="Soat qiymati noto'g'ri")
                if value < 0 or value > 24:
                    raise HTTPException(status_code=400, detail="Soat 0 va 24 orasida bo'lishi kerak")
        elif value is not None:
            value = str(value).strip()
        setattr(row, field, value)
        touched = True

    if not touched:
        return _batch_payload(db, batch, d)
    if not (row.worker_name or "").strip():
        raise HTTPException(status_code=400, detail="Xodim ismi bo'sh bo'lishi mumkin emas")

    row.edited = True
    row.file_values = None          # the admin has now spoken again
    _recompute_row(row)
    _stage(batch, [row.verifix_code])
    db.commit()
    db.refresh(batch)
    return _batch_payload(db, batch, d)


@router.post("/rows/{row_id}/revert")
def revert_row(
    row_id: int,
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Drop the admin's edit and take the newer file's values for this worker.
    Only offered on rows where a later upload actually disagreed."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    row = _row_or_404(db, row_id, batch)
    if not row.file_values:
        raise HTTPException(status_code=400, detail="Bu qatorda fayl qiymati saqlanmagan")
    manager_id = _owner_of(batch, row.verifix_code)
    _require_open_day(db, manager_id, d)

    fv = row.file_values
    for k in FILE_FIELDS:
        if k in fv:
            setattr(row, k, fv[k])
    row.file_values = None
    row.edited = False
    _recompute_row(row)
    _stage(batch, [row.verifix_code])
    db.commit()
    db.refresh(batch)
    return _batch_payload(db, batch, d)


@router.delete("/rows/{row_id}")
def delete_row(
    row_id: int,
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    row = _row_or_404(db, row_id, batch)
    manager_id = _owner_of(batch, row.verifix_code)
    _require_open_day(db, manager_id, d)
    code = row.verifix_code

    db.delete(row)
    db.flush()
    _stage(batch, [code])
    db.commit()
    db.refresh(batch)
    return _batch_payload(db, batch, d)


@router.delete("/cell-day")
def delete_cell_day(
    date: str = Query(...),
    verifix_code: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Drop every worker row of one cell for this day, and the cell with them."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    bc = next((c for c in batch.cells if c.verifix_code == verifix_code), None)
    if bc is None:
        raise HTTPException(status_code=404, detail=f"Yacheyka topilmadi: {verifix_code}")

    _require_open_day(db, bc.manager_id, d)

    deleted = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.verifix_code == verifix_code,
    ).delete(synchronize_session=False)
    bc.included = False
    bc.pending = True
    db.flush()
    _apply_removal(db, batch, d)
    db.delete(bc)
    db.commit()
    db.refresh(batch)
    out = _batch_payload(db, batch, d)
    out["rows_deleted"] = deleted
    return out


@router.delete("/supervisor-day")
def delete_supervisor_day(
    date: str = Query(...),
    manager_id: int = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Wipe one supervisor's whole day: their attendance plus everything that
    hangs off it, plus every cell routed to them in this batch. Mirrors the
    «Cleanup» tab, reachable inline.

    The requests and documents go too — leaving them behind would keep the day
    unconfirmable forever, pointing at worker rows that no longer exist. The day
    is guaranteed OPEN here (`_require_open_day`), so there is no DayApproval to
    remove and no confirmation is being undone."""
    d = _parse_date(date)
    mgr = db.query(Manager).filter(Manager.id == manager_id).first()
    if not mgr:
        raise HTTPException(status_code=404, detail="Brigadir topilmadi")
    _require_open_day(db, manager_id, d)

    rows_deleted = db.query(Attendance).filter(
        Attendance.manager_id == manager_id, Attendance.date == d,
    ).delete(synchronize_session=False)
    db.query(EditRequest).filter(
        EditRequest.manager_id == manager_id, EditRequest.date == d,
    ).delete(synchronize_session=False)
    db.query(HrDocument).filter(
        HrDocument.manager_id == manager_id, HrDocument.date == d,
    ).delete(synchronize_session=False)
    db.query(DailySubmission).filter(
        DailySubmission.manager_id == manager_id, DailySubmission.date == d,
    ).delete(synchronize_session=False)

    batch = _batch_for(db, d)
    if batch:
        doomed = [bc for bc in batch.cells if bc.manager_id == manager_id]
        codes = [bc.verifix_code for bc in doomed]
        if codes:
            db.query(AttendanceBatchRow).filter(
                AttendanceBatchRow.batch_id == batch.id,
                AttendanceBatchRow.verifix_code.in_(codes),
            ).delete(synchronize_session=False)
        for bc in doomed:
            db.delete(bc)
    db.commit()

    if batch:
        db.refresh(batch)
        out = _batch_payload(db, batch, d) if batch.cells else _legacy_payload(db, d)
    else:
        out = _legacy_payload(db, d)
    out["rows_deleted"] = rows_deleted
    return out


# ── save ──────────────────────────────────────────────────────────────────────

@router.get("/save-preview")
def save_preview(
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Exactly what Save is about to do, per supervisor: rows to write, rows it
    will overwrite, and who is skipped because their day is closed.

    Only supervisors with CHANGES appear — a second Save for the same day leaves
    everyone else's attendance untouched and does not notify them again."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    managers = _managers_map(db)
    rows_by_code: dict = {}
    for r in db.query(AttendanceBatchRow).filter(AttendanceBatchRow.batch_id == batch.id).all():
        rows_by_code.setdefault(r.verifix_code, []).append(r)

    targets = _pending_targets(batch)
    plan = {mid: {"write": 0, "cells": 0} for mid in targets}
    for bc in batch.cells:
        if bc.manager_id in plan and bc.included:
            plan[bc.manager_id]["cells"] += 1
            plan[bc.manager_id]["write"] += len(rows_by_code.get(bc.verifix_code, []))

    items, skipped = [], []
    for mid, info in plan.items():
        mgr = managers.get(mid)
        state, _closure, counts = day_state(db, mid, d)
        existing = db.query(Attendance).filter(
            Attendance.manager_id == mid, Attendance.date == d,
        ).count()
        row = {
            "manager_id":    mid,
            "manager_name":  mgr.name if mgr else f"#{mid}",
            "shift":         mgr.shift if mgr else None,
            "day_state":     state,
            "pending":       counts,
            "cells":         info["cells"],
            "rows_to_write": info["write"],
            "rows_existing": existing,
        }
        (items if state == "open" else skipped).append(row)

    items.sort(key=lambda x: (x["manager_name"] or "").lower())
    skipped.sort(key=lambda x: (x["manager_name"] or "").lower())
    unassigned = [bc.verifix_code for bc in batch.cells if not bc.manager_id]
    excluded = [bc.verifix_code for bc in batch.cells if bc.manager_id and not bc.included]
    unchanged = sorted(
        {managers[bc.manager_id].name for bc in batch.cells
         if bc.manager_id and not bc.pending and bc.manager_id in managers}
        - {i["manager_name"] for i in items} - {s["manager_name"] for s in skipped}
    )

    return {
        "date":             d.isoformat(),
        "status":           "draft" if batch.saved_at is None else "saved",
        "supervisors":      items,
        "skipped":          skipped,
        "unchanged":        unchanged,
        "unassigned_cells": sorted(unassigned),
        "excluded_cells":   sorted(excluded),
        "rows_to_write":    sum(i["rows_to_write"] for i in items),
        "rows_to_replace":  sum(i["rows_existing"] for i in items),
        "will_notify":      [i["manager_id"] for i in items if i["rows_to_write"] > 0],
    }


class SaveBody(BaseModel):
    date: str
    notify: bool = True


@router.post("/save")
def save(
    body: SaveBody,
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_admin),
):
    """Commit the day's pending changes: project them into `attendance` for every
    CHANGED supervisor whose day is still open, then notify exactly those.
    Supervisors whose cells did not change are neither rewritten nor pinged, so
    saving twice for a day fed by two files is safe. Closed days are skipped and
    returned so the admin can re-open them and press Save again."""
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    targets = _pending_targets(batch)
    if not targets:
        if any(bc.pending for bc in batch.cells):
            raise HTTPException(
                status_code=400,
                detail="Birorta yacheyka brigadirga biriktirilmagan — avval ularni joylashtiring",
            )
        raise HTTPException(status_code=400, detail="Saqlanmagan o'zgarish yo'q")

    managers = _managers_map(db)
    written, skipped_ids = _project(db, batch, d, targets)
    for w in written:
        mgr = managers.get(w["manager_id"])
        w["manager_name"] = mgr.name if mgr else f"#{w['manager_id']}"
    skipped = [
        {"manager_id": mid,
         "manager_name": managers[mid].name if mid in managers else f"#{mid}",
         "day_state": day_state(db, mid, d)[0]}
        for mid in skipped_ids
    ]

    # Only a save that actually reached at least one supervisor counts as saved.
    # If EVERY target's day was closed nothing was written, so the batch stays a
    # draft — otherwise the tab would claim "Saved" over a day it never touched.
    if written:
        batch.status = "saved"
        batch.saved_at = datetime.now(timezone.utc)
        batch.saved_by_name = _admin_name(payload)
    db.commit()

    # Notification is best-effort and deliberately AFTER the commit: a Telegram
    # hiccup must never roll back attendance that is already correct.
    notified = []
    if body.notify:
        from app.routers.staff import notify_supervisor_verifix_upload
        for item in written:
            if item["rows"] <= 0:
                continue
            try:
                notify_supervisor_verifix_upload(db, item["manager_id"], d)
                notified.append(item["manager_id"])
            except Exception:  # noqa: BLE001 — one bad chat must not stop the rest
                log.exception("verifix-upload notification failed for manager %s on %s",
                              item["manager_id"], d)
        try:
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
            log.exception("failed to persist upload notifications for %s", d)

    db.refresh(batch)
    out = _batch_payload(db, batch, d)
    out["saved"] = {
        "written":  written,
        "skipped":  skipped,
        "notified": notified,
        "rows":     sum(i["rows"] for i in written),
    }
    return out
