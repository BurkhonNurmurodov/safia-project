"""Single-file attendance ingest — the admin «Davomat» tab.

Replaces uploading one verifix workbook per supervisor: ONE «Отчёт по посещениям
сотрудников» export covers the whole factory, every worker row carrying a «Код
подразделения» (a cell's verifix code) that resolves to the cell's supervisor.

Two phases, deliberately:

    upload  →  the file is parsed into a DRAFT batch. Nothing is in `attendance`
               yet, no supervisor has been told anything.
    adjust  →  the admin ticks cells in/out, drags cells between supervisors,
               edits/adds/deletes worker rows.
    save    →  the batch is projected into `attendance` for every ticked cell
               whose supervisor's day is still open, task exchanges are
               re-applied, and only THEN are the supervisors notified.

The batch is kept after Save and stays the editable source of truth for the day:
that is what lets an unticked cell be re-ticked later without re-uploading, and
it means every mutation has exactly one write path
(`AttendanceBatchRow` → `_sync_manager`), never two that can drift.

A supervisor's CLOSED day is immutable here, as on every other surface — Save
skips it and the tab offers Re-open instead. Days that predate this flow (no
batch) are shown read-only, grouped by cell where the code is known.
"""
import logging
from datetime import date as date_t, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Attendance, AttendanceBatch, AttendanceBatchCell, AttendanceBatchRow,
    Cell, DailySubmission, EditRequest, HrDocument, Manager,
)
from app.routers.admin import verify_admin
from app.services.attendance_sheet import AttendanceSheetError, parse_attendance_workbook
from app.services.day_state import day_state
from app.services.kpi_calculator import is_direct_role
from app.upload_guard import validate_spreadsheet

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/attendance-batch", tags=["attendance-batch"])

# Newest N dates offered by the picker — one row per worker per day, so an
# unbounded DISTINCT only ever gets longer (mirrors cell_attendance.DATE_LIMIT).
DATE_LIMIT = 180

# Row fields an admin may edit by hand.
EDITABLE_FIELDS = ("worker_name", "job_title", "schedule", "clock_in_out", "hours_worked")


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


def _default_included(cell: Optional[Cell]) -> bool:
    """Starting tick state for a cell on a new day: an explicit permanent
    decision when one was made, otherwise "does it have a supervisor" — an
    orphan cell must never silently land in somebody's numbers."""
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
    if hw:
        row.status = "worked"
    else:
        row.status = (row.clock_in_out or "").strip() or "—"


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


def _touched_managers(db: Session, batch: AttendanceBatch, d: date_t) -> set:
    """Supervisors whose `attendance` for this day is owned by this batch —
    the ones currently assigned PLUS the ones still holding rows from a previous
    save (so dragging a cell away actually removes it from the old owner)."""
    ids = {bc.manager_id for bc in batch.cells if bc.manager_id}
    codes = [bc.verifix_code for bc in batch.cells if bc.verifix_code]
    if codes:
        prev = db.query(Attendance.manager_id).filter(
            Attendance.date == d,
            Attendance.verifix_code.in_(codes),
        ).distinct().all()
        ids |= {m for (m,) in prev if m}
    return ids


def _sync_manager(db: Session, batch: AttendanceBatch, manager_id: int, d: date_t) -> int:
    """Project the batch onto ONE supervisor's day: wipe their attendance for the
    date and re-insert every row of every ticked cell routed to them.

    Wiping the whole (manager, date) — not just the batch's codes — is the same
    thing the per-supervisor upload has always done. It is what prevents a
    double count when a day was also uploaded the old way, and it keeps
    "what you see on the tab" identical to "what is in attendance".

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


def _resync_open(db: Session, batch: AttendanceBatch, manager_ids, d: date_t) -> list:
    """Re-project the given supervisors, skipping any whose day is closed.
    Only meaningful once the batch has been saved — a draft writes nothing."""
    if batch.status != "saved":
        return []
    skipped = []
    for mid in sorted({m for m in manager_ids if m}):
        state, _closure, _counts = day_state(db, mid, d)
        if state != "open":
            skipped.append(mid)
            continue
        _sync_manager(db, batch, mid, d)
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
        "workers":            len(rows),
        "present":            len(counted),
        "hours":              round(hours, 2),
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
                "status":            r.status,
                "counted":           is_direct_role(r.job_title, r.hours_worked),
                "edited":            bool(r.edited),
                "manual":            bool(r.manual),
            }
            for r in sorted(rows, key=lambda x: (x.worker_name or "").lower())
        ],
    }


def _section_totals(cells: list) -> dict:
    on = [c for c in cells if c["included"]]
    return {
        "cells":    len(cells),
        "included": len(on),
        "workers":  sum(c["workers"] for c in on),
        "present":  sum(c["present"] for c in on),
        "hours":    round(sum(c["hours"] for c in on), 2),
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
    return {
        "date":   d.isoformat(),
        "status": batch.status,
        "batch": {
            "filename":     batch.source_filename,
            "export_ts":    batch.export_ts.isoformat() if batch.export_ts else None,
            "uploaded_at":  batch.uploaded_at.isoformat() if batch.uploaded_at else None,
            "uploaded_by":  batch.uploaded_by_name,
            "saved_at":     batch.saved_at.isoformat() if batch.saved_at else None,
            "saved_by":     batch.saved_by_name,
        },
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
        },
    }


def _legacy_payload(db: Session, d: date_t) -> dict:
    """A day that predates this flow (or was uploaded per-supervisor): show what
    IS in `attendance`, grouped the same way, read-only. Rows with no cell code
    fall into one "—" group per supervisor rather than being hidden."""
    rows = db.query(Attendance).filter(Attendance.date == d).all()
    if not rows:
        return {
            "date": d.isoformat(), "status": "none", "batch": None,
            "sections": [], "unassigned": [],
            "totals": {"cells": 0, "included": 0, "unassigned": 0, "supervisors": 0,
                       "workers": 0, "counted": 0, "hours": 0, "excluded_rows": 0},
        }

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
                "workers":             len(rws),
                "present":             len(counted),
                "hours":               round(sum(float(r.hours_worked or 0) for r in counted), 2),
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
    return {
        "date": d.isoformat(), "status": "legacy", "batch": None,
        "sections": sections, "unassigned": [],
        "totals": {
            "cells":       len(all_cells),
            "included":    len(all_cells),
            "unassigned":  0,
            "supervisors": len(sections),
            "workers":     sum(c["workers"] for c in all_cells),
            "counted":     sum(c["present"] for c in all_cells),
            "hours":       round(sum(c["hours"] for c in all_cells), 2),
            "excluded_rows": 0,
        },
    }


# ── read ──────────────────────────────────────────────────────────────────────

@router.get("/dates")
def list_dates(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Days the tab can open, newest first: every uploaded batch plus every day
    that already has attendance from the older per-supervisor path."""
    out: dict = {}
    for b in db.query(AttendanceBatch).order_by(AttendanceBatch.date.desc()).limit(DATE_LIMIT).all():
        out[b.date] = {"date": b.date.isoformat(), "status": b.status}
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


# ── upload ────────────────────────────────────────────────────────────────────

@router.post("/upload")
async def upload(
    files: list[UploadFile] = File(...),
    replace: bool = Query(default=False),
    db: Session = Depends(get_db),
    payload: dict = Depends(verify_admin),
):
    """Parse one export into a DRAFT batch. Writes nothing to `attendance` and
    notifies nobody — that is what /save is for.

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
    existing = _batch_for(db, d)
    if existing and not replace:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "batch_exists",
                "date": d.isoformat(),
                "status": existing.status,
                "filename": existing.source_filename,
            },
        )

    rows = parsed["rows"]
    codes = sorted({r["verifix_code"] for r in rows if r["verifix_code"]})
    org_units = parsed["org_units"]

    # Auto-register unknown cells: supervisor-less, out of the load, named from
    # the header line. They land in the "no supervisor" bucket, unticked.
    known = _cell_catalog(db, codes)
    created = []
    for code in codes:
        if code in known:
            continue
        cell = Cell(
            verifix_code=code,
            name_workshop_ru=org_units.get(code),
            manager_id=None,
            in_load=False,
        )
        db.add(cell)
        known[code] = cell
        created.append(code)
    if created:
        db.flush()

    # Replace any pending/saved batch for the date. Attendance already written by
    # a previous save is left alone — the next Save re-projects it.
    if existing:
        db.delete(existing)
        db.flush()

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

    for code in codes:
        cell = known.get(code)
        db.add(AttendanceBatchCell(
            batch_id=batch.id,
            verifix_code=code,
            cell_id=cell.id if cell else None,
            manager_id=cell.manager_id if cell else None,
            included=_default_included(cell) and bool(cell and cell.manager_id),
            source_name=org_units.get(code),
        ))
    for r in rows:
        db.add(AttendanceBatchRow(
            batch_id=batch.id,
            verifix_code=r["verifix_code"],
            worker_name=r["worker_name"],
            job_title=r["job_title"],
            schedule=r["schedule"],
            clock_in_out=r["clock_in_out"],
            hours_worked=r["hours_worked"],
            early_arrival_min=r["early_arrival_min"],
            effective_hours=r["effective_hours"],
            status=r["status"],
        ))
    db.commit()
    db.refresh(batch)

    result = _batch_payload(db, batch, d)
    result["created_cells"] = created
    result["replaced"] = bool(existing)
    return result


@router.delete("")
def discard(
    date: str = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Throw away a batch. A DRAFT vanishes without trace; discarding a SAVED
    batch also removes the attendance it wrote (for supervisors whose day is
    still open), so the day goes back to having no data at all."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    skipped = []
    if batch.status == "saved":
        for mid in sorted(_touched_managers(db, batch, d)):
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
    """Apply tick / move decisions for the day. `permanent` additionally writes
    them into `cells` so every FUTURE day starts there too — the per-day state
    is always written, the registry only when asked."""
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    if not body.changes:
        return _batch_payload(db, batch, d)

    by_code = {bc.verifix_code: bc for bc in batch.cells}
    valid_managers = {m.id for m in db.query(Manager.id).all()}
    affected: set = set()

    for ch in body.changes:
        bc = by_code.get(ch.verifix_code)
        if not bc:
            raise HTTPException(status_code=404, detail=f"Yacheyka topilmadi: {ch.verifix_code}")
        if ch.manager_id is not None and ch.manager_id not in valid_managers:
            raise HTTPException(status_code=400, detail=f"Noma'lum brigadir: {ch.manager_id}")

        affected.add(bc.manager_id)
        if ch.clear_manager:
            bc.manager_id = None
            bc.included = False        # nobody owns it → it counts for nobody
        elif ch.manager_id is not None:
            bc.manager_id = ch.manager_id
        if ch.included is not None:
            bc.included = bool(ch.included) and bc.manager_id is not None
        affected.add(bc.manager_id)

        if body.permanent and bc.cell_id:
            cell = db.query(Cell).filter(Cell.id == bc.cell_id).first()
            if cell:
                cell.manager_id = bc.manager_id
                cell.att_included = bool(bc.included)

    # A saved day must keep `attendance` in step with what the tab now shows.
    # Closed supervisors are skipped and reported so the UI can say why.
    skipped = _resync_open(db, batch, affected, d)
    db.commit()
    db.refresh(batch)

    out = _batch_payload(db, batch, d)
    out["skipped_managers"] = skipped
    return out


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
    """Hand-add a worker the export missed (a forgotten punch, a late entry)."""
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
        status="worked" if body.hours_worked else "—",
        manual=True,
        edited=True,
    )
    _recompute_row(row)
    db.add(row)
    db.flush()
    _resync_open(db, batch, [manager_id], d)
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
    _recompute_row(row)
    _resync_open(db, batch, [manager_id], d)
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

    db.delete(row)
    db.flush()
    _resync_open(db, batch, [manager_id], d)
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
    """Drop every worker row of one cell for this day."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")
    if verifix_code not in {bc.verifix_code for bc in batch.cells}:
        raise HTTPException(status_code=404, detail=f"Yacheyka topilmadi: {verifix_code}")

    manager_id = _owner_of(batch, verifix_code)
    _require_open_day(db, manager_id, d)

    deleted = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.verifix_code == verifix_code,
    ).delete(synchronize_session=False)
    db.flush()
    _resync_open(db, batch, [manager_id], d)
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
        codes = [bc.verifix_code for bc in batch.cells if bc.manager_id == manager_id]
        if codes:
            db.query(AttendanceBatchRow).filter(
                AttendanceBatchRow.batch_id == batch.id,
                AttendanceBatchRow.verifix_code.in_(codes),
            ).delete(synchronize_session=False)
            for bc in batch.cells:
                if bc.manager_id == manager_id:
                    bc.included = False
    db.commit()

    if batch:
        db.refresh(batch)
        out = _batch_payload(db, batch, d)
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
    will overwrite, and who will be skipped because their day is closed."""
    d = _parse_date(date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    managers = _managers_map(db)
    rows_by_code: dict = {}
    for r in db.query(AttendanceBatchRow).filter(AttendanceBatchRow.batch_id == batch.id).all():
        rows_by_code.setdefault(r.verifix_code, []).append(r)

    plan: dict = {}
    for bc in batch.cells:
        if not bc.manager_id:
            continue
        entry = plan.setdefault(bc.manager_id, {"write": 0, "cells": 0})
        if bc.included:
            entry["cells"] += 1
            entry["write"] += len(rows_by_code.get(bc.verifix_code, []))

    for mid in _touched_managers(db, batch, d):
        plan.setdefault(mid, {"write": 0, "cells": 0})

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

    return {
        "date":            d.isoformat(),
        "status":          batch.status,
        "supervisors":     items,
        "skipped":         skipped,
        "unassigned_cells": sorted(unassigned),
        "excluded_cells":  sorted(excluded),
        "rows_to_write":   sum(i["rows_to_write"] for i in items),
        "rows_to_replace": sum(i["rows_existing"] for i in items),
        "will_notify":     [i["manager_id"] for i in items if i["rows_to_write"] > 0],
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
    """Commit the batch: project it into `attendance` for every supervisor whose
    day is still open, then notify each of them exactly as the per-supervisor
    upload used to. Closed days are skipped and returned so the admin can
    re-open them and press Save again."""
    d = _parse_date(body.date)
    batch = _batch_for(db, d)
    if not batch:
        raise HTTPException(status_code=404, detail="Bu sana uchun yuklama yo'q")

    managers = _managers_map(db)
    targets = _touched_managers(db, batch, d)
    if not targets:
        raise HTTPException(
            status_code=400,
            detail="Birorta yacheyka brigadirga biriktirilmagan — avval ularni joylashtiring",
        )

    written, skipped, notified = [], [], []
    for mid in sorted(targets):
        mgr = managers.get(mid)
        state, _closure, _counts = day_state(db, mid, d)
        if state != "open":
            skipped.append({"manager_id": mid,
                            "manager_name": mgr.name if mgr else f"#{mid}",
                            "day_state": state})
            continue
        n = _sync_manager(db, batch, mid, d)
        written.append({"manager_id": mid,
                        "manager_name": mgr.name if mgr else f"#{mid}",
                        "rows": n})

    batch.status = "saved"
    batch.saved_at = datetime.now(timezone.utc)
    batch.saved_by_name = _admin_name(payload)
    db.commit()

    # Notification is best-effort and deliberately AFTER the commit: a Telegram
    # hiccup must never roll back attendance that is already correct.
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
