"""
Cell working hours — the «Smena vaqtlari» admin register.

One start clock and one end clock per production CELL, plus the two per-shift
platform defaults a cell inherits when its own pair is unset. All of the
arithmetic and every rule about these two clocks lives in
``app.services.cell_hours``; this module is only the door.

**A register, nothing more** (user's decision, 2026-08-21). Nothing consumes
these hours: not загрузка, not idle-cell, not the leader checklist, not
attendance. The read surfaces are this tab and the cell details page, and that
is deliberately the whole list — so every endpoint here, READS INCLUDED, is
gated on ``admin.cell_hours.manage``. A register no other page needs has no
reason to be readable by pages that do not need it.

Single-cell edits go through ``PUT /bulk`` with one id: one writer means one
place where "both or neither", the start≠end rule, the audit line and the
change count are decided.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.capabilities import CAP_CELL_HOURS_MANAGE, require_cap
from app.capability_alerts import alert_grant_use, unit_name
from app.database import get_db
from app.models import Cell, Manager, RoleProfile
from app.services import cell_hours
from app.services.factory_scope import list_factories, serialize

router = APIRouter(prefix="/api/cell-hours", tags=["cell-hours"])

log = logging.getLogger(__name__)

_manage = require_cap(CAP_CELL_HOURS_MANAGE)


class DefaultIn(BaseModel):
    shift: int
    start: str
    end: str


class BulkIn(BaseModel):
    """``clear=True`` empties both columns on the listed cells (they fall back
    to their shift default). Otherwise BOTH clocks are required — half a window
    is not a window."""
    cell_ids: list[int]
    start: Optional[str] = None
    end: Optional[str] = None
    clear: bool = False


def _defaults_payload(db: Session) -> dict:
    defs = cell_hours.defaults(db)
    return {
        str(shift): {
            "start": pair[0], "end": pair[1],
            "minutes": cell_hours.duration_min(pair[0], pair[1]),
        }
        for shift, pair in defs.items()
    }


@router.get("")
def get_cell_hours(db: Session = Depends(get_db), _: dict = Depends(_manage)):
    """The whole tab's input in one call — defaults, every cell with its
    resolved hours, and the option lists the filters need.

    Four queries and a dict join, never one query per cell: the register is the
    full cell roster and an N+1 here would be a few hundred round trips per
    page load. ALL cells are listed, archived supervisors included — a cell
    whose unit was archived still has hours somebody may need to correct, and
    hiding it would make it uneditable rather than tidy.
    """
    managers = db.query(Manager).order_by(Manager.id).all()
    mgrs = {m.id: m for m in managers}
    leaders = (db.query(RoleProfile)
               .filter(RoleProfile.role == "leader")
               .order_by(RoleProfile.id).all())
    lnames = {p.id: p.name for p in leaders}
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    defs = cell_hours.defaults(db)

    rows = []
    for c in cells:
        m = mgrs.get(c.manager_id)
        shift = m.shift if m else None
        eff_start, eff_end, source = cell_hours.resolve(
            c.shift_start, c.shift_end, shift, defs)
        rows.append({
            "id": c.id,
            "verifix_code": c.verifix_code,
            "sap_code": c.sap_code,
            "name_workshop_uz": c.name_workshop_uz,
            "name_workshop_uz_cyrl": c.name_workshop_uz_cyrl,
            "name_workshop_ru": c.name_workshop_ru,
            "name_workshop_en": c.name_workshop_en,
            "manager_id": c.manager_id,
            "supervisor": m.name if m else None,
            "shift": shift,
            # The factory dimension hangs off managers.factory_id and nowhere
            # else (CLAUDE.md «Factory (plant) dimension»): a cell follows its
            # supervisor's plant, it never carries one of its own.
            "factory_id": m.factory_id if m else None,
            "leader_id": c.leader_id,
            "leader": lnames.get(c.leader_id),
            "start": cell_hours.hhmm(c.shift_start),
            "end": cell_hours.hhmm(c.shift_end),
            "eff_start": eff_start,
            "eff_end": eff_end,
            "minutes": cell_hours.duration_min(eff_start, eff_end),
            "source": source,
        })

    return {
        "defaults": _defaults_payload(db),
        "cells": rows,
        "supervisors": [
            {"id": m.id, "name": m.name, "shift": m.shift,
             "factory_id": m.factory_id, "archived": bool(m.archived)}
            for m in managers
        ],
        "leaders": [
            {"id": p.id, "name": p.name, "manager_id": p.manager_id}
            for p in leaders
        ],
        "factories": [serialize(f) for f in list_factories(db)],
    }


@router.put("/defaults")
def put_default(body: DefaultIn, db: Session = Depends(get_db),
                caller: dict = Depends(_manage)):
    """Set one shift's default. Every cell in that shift with no hours of its
    own changes at once — the UI says how many before asking."""
    if body.shift not in cell_hours.DEFAULT_KEYS:
        raise HTTPException(status_code=400, detail="shift must be 1 or 2")
    before = cell_hours.defaults(db).get(body.shift)
    try:
        start, end = cell_hours.set_default(db, body.shift, body.start, body.end)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    db.commit()

    log.info("CELL-HOURS default | shift=%s %s-%s -> %s-%s | by=%s",
             body.shift, (before or ("", ""))[0], (before or ("", ""))[1],
             start, end, (caller or {}).get("sub"))
    alert_grant_use(
        db, caller, CAP_CELL_HOURS_MANAGE, "cell_hours.default",
        details=[("shift", body.shift)],
        changes=[("hours",
                  cell_hours.fmt_pair(*(before or (None, None))) or "—",
                  cell_hours.fmt_pair(start, end))],
    )
    return {"ok": True, "defaults": _defaults_payload(db)}


@router.put("/bulk")
def put_bulk(body: BulkIn, db: Session = Depends(get_db),
             caller: dict = Depends(_manage)):
    """Write (or clear) the own hours of the listed cells in ONE transaction.

    ``updated`` counts the rows whose stored value actually CHANGED — re-saving
    the hours a cell already had is not an update, and reporting it as one
    turns the confirmation toast into noise.

    Unknown ids are skipped rather than refused: the page's selection can
    outlive a cell somebody else deleted, and failing the whole write for that
    would lose the other forty edits.
    """
    ids = [int(i) for i in (body.cell_ids or [])]
    if not ids:
        raise HTTPException(status_code=400, detail="No cells selected")

    if body.clear:
        start = end = None
    else:
        start, end = cell_hours.hhmm(body.start), cell_hours.hhmm(body.end)
        if not start or not end:
            raise HTTPException(status_code=400, detail="both")
        if start == end:
            # Mirrors routers/idle_cell.py: an end equal to its start is not a
            # 24-hour window, it is an unset one.
            raise HTTPException(status_code=400, detail="same")

    rows = db.query(Cell).filter(Cell.id.in_(ids)).all()
    changed: list[Cell] = []
    for c in rows:
        if (c.shift_start or None) == start and (c.shift_end or None) == end:
            continue
        c.shift_start = start
        c.shift_end = end
        changed.append(c)
    db.commit()

    action = "cell_hours.clear" if body.clear else "cell_hours.bulk"
    codes = [c.verifix_code for c in changed]
    log.info("CELL-HOURS %s | cells=%s changed=%s value=%s | by=%s",
             "clear" if body.clear else "set", len(rows), len(changed),
             cell_hours.fmt_pair(start, end) or "—", (caller or {}).get("sub"))
    if changed:
        units = sorted({unit_name(db, c.manager_id) for c in changed})
        alert_grant_use(
            db, caller, CAP_CELL_HOURS_MANAGE, action,
            details=[("cells", len(changed)),
                     ("cell", ", ".join(codes[:25]) + ("…" if len(codes) > 25 else "")),
                     ("unit", ", ".join(units[:10]) + ("…" if len(units) > 10 else ""))],
            # A bulk write has no single "before": the rows it touched held
            # different values (or none). The old side says so rather than
            # naming one of them and implying it was all of them.
            changes=[("hours", "—",
                      "—" if body.clear else cell_hours.fmt_pair(start, end))],
        )
    return {"updated": len(changed)}
