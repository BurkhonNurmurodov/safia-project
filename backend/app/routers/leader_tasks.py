"""In-bot leader daily-checklist config + media.

Admin side (/admin/leader-tasks/*): the supervisors × tasks config matrix
(enabled / min photos / weight per cell, column-wide overwrite, per-language
task names) and the archive-channel setting, driving the bot's /tasks flow.

Viewer side (/api/leader-tasks/media/…): streams a proof photo from Telegram
for the /leaders detail modal — page-access gated with the same row scoping as
/api/leaders (supervisor → own unit, leader → own rows).
"""
import logging
import re
from datetime import datetime, timezone
from io import BytesIO

import requests
from fastapi import (APIRouter, Depends, File, Form, HTTPException, Query,
                     Response, UploadFile)
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all
from app.config import settings
from app.database import get_db
from app.models import (
    AppSetting, Cell, LeaderAiReview, LeaderChecklist, LeaderDaySource,
    LeaderLateProof, LeaderLateProofMedia, LeaderLateProofShot, LeaderTaskDay,
    LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskExample, LeaderTaskLeaderSetting, LeaderTaskMedia,
    LeaderTaskPhoto, LeaderTaskSetting, Manager, RoleProfile,
)
from app.permissions import page_allowed, require_page
from app.security import require_auth
from app.upload_guard import validate_avatar
from app.routers.admin import _TG_API, _tg_file_meta, verify_admin
from app.services import (
    action_log, leader_ai, leader_bot, leader_cells, leader_close,
    leader_reports)
from app.services.leader_tasks import (
    CAMERA_IS_PILOT, CHANNEL_SETTING_KEY, PROOF_KINDS, audit_list, cancel_pending, channel_chat_id,
    effective_date, effective_leader_config, effective_settings, ensure_task_defs,
    expired_through, leader_overrides,
    next_effective_date, pending_list, promote_all_shifts, requirements_for,
    per_task_units, revert_audit, set_criteria, set_date_check, set_deadline,
    set_proof_kind, set_unit_settings, unit_bot_from_map,
    set_time_check, set_window, window_shift_problems,
    write_change,
)
from app.services.name_map import (
    leader_match, relabel_supervisor, supervisor_match)

router = APIRouter(tags=["leader-tasks"])
log = logging.getLogger(__name__)

_LANGS = ("uz", "uz_cyrl", "ru", "en")


# ── Admin: config matrix ──────────────────────────────────────────────────────

def _actor(admin: dict) -> str | None:
    return admin.get("profile_key") or admin.get("name") or admin.get("sub")


# ── the action register ───────────────────────────────────────────────────────
# Every write in this file lands somewhere on the global → supervisor → leader
# chain, so WHICH LEVEL was written is the fact that makes a row readable: the
# same field means three different things at the three levels, and "criteria
# set" on its own cannot tell an admin whether one leader or the whole platform
# just changed. The two `_need_*` helpers exist so the name comes off the lookup
# the validation ALREADY makes — the register never buys a name with a query.

def _need_manager(db: Session, mid: int | None) -> Manager | None:
    if mid is None:
        return None
    row = db.query(Manager).filter_by(id=mid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    return row


def _need_leader(db: Session, lid: int | None) -> RoleProfile | None:
    if lid is None:
        return None
    row = db.query(RoleProfile).filter_by(id=lid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Unknown leader")
    return row


def _log_cfg(*, task_id: int, level: str, mgr=None, lead=None,
             count: int | None = None, task_name: str | None = None,
             extra=()) -> None:
    """One register line for a config write onto the chain."""
    lines: list[tuple] = [("level", level), ("task", task_id)]
    if mgr is not None:
        lines.append(("unit", mgr.name))
    if lead is not None:
        lines.append(("leader", lead.name))
    if count is not None:
        lines.append(("count", count))
    lines.extend(extra)
    action_log.enrich(
        target_kind="task", target_id=task_id, target_name=task_name,
        unit_id=(mgr.id if mgr is not None
                 else (lead.manager_id if lead is not None else None)),
        unit_name=mgr.name if mgr is not None else None,
        details=lines,
    )


def _applied(out: dict) -> list[tuple]:
    """«now» or «next_day» (+ the day it flips) — a staged write has not landed
    yet, and a register that did not say so would read as though it had."""
    lines = [("mode", out.get("applied"))]
    if out.get("effective_date"):
        lines.append(("date", out["effective_date"]))
    return lines


@router.get("/admin/leader-tasks/config")
def get_config(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    promote_all_shifts(db)  # apply anything now due before showing live state
    defs = ensure_task_defs(db)
    managers = (
        db.query(Manager)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    leaders = (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "leader", RoleProfile.manager_id.isnot(None))
        .order_by(RoleProfile.name)
        .all()
    )
    overrides = leader_overrides(db, [p.id for p in leaders])
    per_task = per_task_units(db)
    bot_from = unit_bot_from_map(db)
    cell_from = leader_cells.floors(db)
    # How many checklists a unit would produce once switched — the count the
    # enrolment confirm names, so nobody turns a unit on without seeing that it
    # goes from 6 submissions a night to 11.
    cell_n: dict[int, int] = {}
    lead_n: dict[int, int] = {}
    for mid, lid, n in (db.query(RoleProfile.manager_id, RoleProfile.id,
                                 func.count(Cell.id))
                        .outerjoin(Cell, Cell.leader_id == RoleProfile.id)
                        .filter(RoleProfile.role == "leader",
                                RoleProfile.manager_id.isnot(None))
                        .group_by(RoleProfile.manager_id, RoleProfile.id).all()):
        cell_n[mid] = cell_n.get(mid, 0) + int(n or 0)
        lead_n[mid] = lead_n.get(mid, 0) + 1
    # Example-proof photo ids per task — ids only, the bytes stream from
    # /admin/leader-tasks/examples/{id} when the modal actually shows them.
    # Split by LEVEL, exactly as `criteria` is: the global list per task, then
    # the supervisor and leader overrides SPARSELY, keyed "<row id>:<task id>"
    # like the matrix's other per-row maps. Sparse because almost no row has
    # one — a dense map would be 13 tasks × 120 rows of empty lists on every
    # config load — and split rather than pre-resolved because this payload
    # feeds an EDITOR: the modal has to be able to tell an example the level
    # owns from one it merely inherits, which is the whole distinction a
    # flattened list destroys.
    ex_global: dict[int, list[int]] = {}
    ex_sup: dict[str, list[int]] = {}
    ex_lead: dict[str, list[int]] = {}
    for eid, tid, mid, lid in (
        db.query(LeaderTaskExample.id, LeaderTaskExample.task_id,
                 LeaderTaskExample.manager_id, LeaderTaskExample.leader_id)
        .order_by(LeaderTaskExample.id).all()
    ):
        if lid:
            ex_lead.setdefault(f"{lid}:{tid}", []).append(eid)
        elif mid:
            ex_sup.setdefault(f"{mid}:{tid}", []).append(eid)
        else:
            ex_global.setdefault(tid, []).append(eid)
    examples = ex_global
    return {
        "tasks": [
            {
                "id": td.id,
                "name": {l: getattr(td, f"name_{l}") for l in _LANGS},
                "note": {l: getattr(td, f"note_{l}") for l in _LANGS},
                # Global "definition of done" for the AI proof reviewer;
                # supervisors and leaders may override it in their own cells.
                "criteria": td.criteria or "",
                # Global proof-photo window; blank at either end = that end
                # falls through to the shift default, which the UI shows as the
                # placeholder rather than pretending the field is empty.
                "win_from": td.win_from or "",
                "win_to": td.win_to or "",
                # Global submission deadline (informational, shown to leaders
                # on /leaders «Vazifalar»); blank = none, the tab shows the
                # day's filing deadline instead.
                "deadline": td.deadline or "",
                # Global "is the date checked at all" and "is the CLOCK checked
                # too". Never null at this level — it is the floor of the chain
                # (startup.add_leader_task_date_check / _time_check fill them),
                # so the UI shows a plain three-mode pick here and a fourth
                # "inherit" state at the levels below.
                "date_check": td.date_check is not False,
                "time_check": td.time_check is not False,
                # HOW the proof is collected. Never null at this level either —
                # it is the floor of the chain — so the matrix shows a plain
                # two-way pick here and an "inherit" state below.
                "proof_kind": td.proof_kind or "screenshot",
                "examples": examples.get(td.id, []),
                "default_weight": td.default_weight,
            }
            for td in defs
        ],
        "managers": [{"id": m.id, "name": m.name, "shift": m.shift,
                      "per_task_close": m.id in per_task,
                      # "" = no rehearsal window; before it the unit's bot days
                      # are practice and its sheet row is what the register shows.
                      "bot_from": bot_from.get(m.id) or "",
                      # "" = not switched. From this day the unit's leaders file
                      # ONE CHECKLIST PER CELL; days before it are untouched.
                      "cell_from": cell_from.get(m.id) or "",
                      "leaders_n": lead_n.get(m.id, 0),
                      "cells_n": cell_n.get(m.id, 0)} for m in managers],
        "settings": {
            str(m.id): {str(t): s for t, s in effective_settings(db, m.id).items()}
            for m in managers
        },
        "leaders": [
            {"id": p.id, "name": p.name, "manager_id": p.manager_id} for p in leaders
        ],
        # Sparse RAW per-leader overrides (null field = inherit from the
        # supervisor's effective value) — the matrix resolves the chain itself.
        "leader_settings": {
            str(lid): {str(t): s for t, s in by_task.items()}
            for lid, by_task in overrides.items()
        },
        # Sparse per-level example ids, "<manager|leader id>:<task id>" →
        # [example id]. Absent key = this level has none of its own and
        # inherits the level above; the modal says which of the two it is
        # showing rather than letting an inherited photo look owned.
        "example_sup": ex_sup,
        "example_lead": ex_lead,
        "channel": {"chat_id": channel_chat_id(db) or ""},
        # What a BLANK window end falls back to, per shift — sent rather than
        # duplicated in the UI so the placeholder can never disagree with the
        # hours the reviewer actually judges against.
        "shift_windows": {str(s): list(w) for s, w in leader_ai.SHIFT_WINDOW.items()},
        # Staging: what's queued for a future day + the dates "next day"
        # resolves to per shift (so the UI can label "applies from …").
        "pending": pending_list(db),
        "next_dates": {"1": next_effective_date(1), "2": next_effective_date(2)},
    }


# Each config write takes an optional `when`: "now" (default, live) or
# "next_day" (staged to the target's next shift boundary).

class CellIn(BaseModel):
    manager_id: int
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    # Per-supervisor rename: value = override, "" or missing lang = inherit
    # the global name. None = leave the stored names untouched.
    names: dict[str, str | None] | None = None
    when: str = "now"


def _clamp(cell) -> tuple[int, int]:
    return max(0, min(20, int(cell.min_media))), max(0, min(100, int(cell.weight)))


def _upsert(db: Session, manager_id: int, task_id: int,
            enabled: bool, min_media: int, weight: int) -> LeaderTaskSetting:
    row = db.query(LeaderTaskSetting).filter_by(
        manager_id=manager_id, task_id=task_id).first()
    if not row:
        row = LeaderTaskSetting(manager_id=manager_id, task_id=task_id)
        db.add(row)
    row.enabled = enabled
    row.min_media = min_media
    row.weight = weight
    return row


@router.put("/admin/leader-tasks/cell")
def put_cell(cell: CellIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    mgr = db.query(Manager).filter_by(id=cell.manager_id).first()
    if not mgr:
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    td = db.query(LeaderTaskDef).filter_by(id=cell.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    payload = {"manager_id": cell.manager_id, "cells": [{
        "task_id": cell.task_id, "enabled": cell.enabled,
        "min_media": cell.min_media, "weight": cell.weight, "names": cell.names,
    }]}
    out = write_change(db, "supervisor", payload, cell.when, _actor(admin))
    _log_cfg(task_id=cell.task_id, level="unit", mgr=mgr, task_name=td.name_uz,
             extra=[("enabled", cell.enabled), ("min_media", cell.min_media),
                    ("weight", cell.weight)] + _applied(out))
    return out


class LeaderCellIn(BaseModel):
    """Per-leader override. Null config field = inherit from the supervisor's
    effective value; `names` values: "" = inherit, None/omitted dict = keep the
    stored names untouched (same semantics as CellIn); reset=True drops the
    whole override row."""
    leader_id: int
    task_id: int
    enabled: bool | None = None
    min_media: int | None = None
    weight: int | None = None
    names: dict[str, str | None] | None = None
    reset: bool = False
    when: str = "now"


@router.put("/admin/leader-tasks/leader-cell")
def put_leader_cell(cell: LeaderCellIn, db: Session = Depends(get_db),
                    admin: dict = Depends(verify_admin)):
    lead = db.query(RoleProfile).filter_by(id=cell.leader_id, role="leader").first()
    if not lead:
        raise HTTPException(status_code=404, detail="Unknown leader")
    td = db.query(LeaderTaskDef).filter_by(id=cell.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    payload = {
        "leader_id": cell.leader_id, "task_id": cell.task_id,
        "enabled": cell.enabled, "min_media": cell.min_media, "weight": cell.weight,
        "names": cell.names, "reset": cell.reset,
    }
    out = write_change(db, "leader", payload, cell.when, _actor(admin))
    # A null field means «inherit», which is not the same statement as a value —
    # only what the request actually pinned is recorded.
    fields = [(k, v) for k, v in (("enabled", cell.enabled),
                                  ("min_media", cell.min_media),
                                  ("weight", cell.weight)) if v is not None]
    if cell.reset:
        fields = [("override", "cleared")]
    _log_cfg(task_id=cell.task_id, level="leader", lead=lead,
             task_name=td.name_uz, extra=fields + _applied(out))
    return out


class TaskCellIn(BaseModel):
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    names: dict[str, str | None] | None = None


class SupervisorBatchIn(BaseModel):
    """All of one supervisor's task cells saved together (the batch editor) —
    one apply, one audited change."""
    manager_id: int
    cells: list[TaskCellIn]
    when: str = "now"


@router.put("/admin/leader-tasks/supervisor-batch")
def put_supervisor_batch(body: SupervisorBatchIn, db: Session = Depends(get_db),
                         admin: dict = Depends(verify_admin)):
    mgr = db.query(Manager).filter_by(id=body.manager_id).first()
    if not mgr:
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    payload = {"manager_id": body.manager_id, "cells": [
        {"task_id": c.task_id, "enabled": c.enabled, "min_media": c.min_media,
         "weight": c.weight, "names": c.names}
        for c in body.cells
    ]}
    out = write_change(db, "supervisor", payload, body.when, _actor(admin))
    # One apply, one row: the batch editor writes the unit's whole column, so
    # the register names the unit and counts the cells rather than the task.
    action_log.enrich(
        target_kind="unit", target_id=body.manager_id, target_name=mgr.name,
        unit_id=mgr.id, unit_name=mgr.name,
        details=[("level", "unit"), ("unit", mgr.name),
                 ("tasks", len(body.cells))] + _applied(out),
    )
    return out


class TaskIn(BaseModel):
    """Global task definition edit — names / notes / default weight. Touches
    only LeaderTaskDef, never a supervisor row (decoupled from the bulk push).

    `manager_ids` / `leader_ids` turn it into a SCOPED rename: the global
    definition is left alone and the name lands as a per-row override on
    exactly those rows. Without this a filtered matrix could still rename the
    task for the shifts it had filtered out — the global name is what every
    row without an override displays. An empty list is rejected."""
    task_id: int
    names: dict[str, str | None] | None = None
    note: dict[str, str | None] | None = None
    default_weight: int | None = None
    when: str = "now"
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


def _scoped_rename(db: Session, body: "TaskIn", actor: str) -> dict:
    """Write the name as a per-row override on the filtered rows. The numeric
    config rides along UNCHANGED — both writers take a whole cell, and a
    rename must never silently reset a row's weight or photo count."""
    if body.leader_ids is not None:
        ids = [i for (i,) in db.query(RoleProfile.id).filter(
            RoleProfile.id.in_(body.leader_ids), RoleProfile.role == "leader").all()]
        if not ids:
            raise HTTPException(status_code=400, detail="no_rows")
        cur = {r.leader_id: r for r in db.query(LeaderTaskLeaderSetting).filter(
            LeaderTaskLeaderSetting.leader_id.in_(ids),
            LeaderTaskLeaderSetting.task_id == body.task_id).all()}
        for lid in ids:
            row = cur.get(lid)
            write_change(db, "leader", {
                "leader_id": lid, "task_id": body.task_id,
                "enabled": row.enabled if row else None,
                "min_media": row.min_media if row else None,
                "weight": row.weight if row else None,
                "names": body.names, "reset": False,
            }, body.when, actor)
        return {"ok": True, "count": len(ids), "level": "leader",
                "applied": body.when}

    ids = [i for (i,) in db.query(Manager.id).filter(
        Manager.id.in_(body.manager_ids), Manager.archived.is_(False)).all()]
    if not ids:
        raise HTTPException(status_code=400, detail="no_rows")
    for mid in ids:
        eff = effective_settings(db, mid).get(body.task_id, {})
        write_change(db, "supervisor", {"manager_id": mid, "cells": [{
            "task_id": body.task_id,
            "enabled": eff.get("enabled", True),
            "min_media": eff.get("min_media", 1),
            "weight": eff.get("weight", 0),
            "names": body.names,
        }]}, body.when, actor)
    return {"ok": True, "count": len(ids), "level": "supervisor",
            "applied": body.when}


@router.put("/admin/leader-tasks/task")
def put_task(body: TaskIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    new_name = next((v for v in ((body.names or {}).get(l) for l in _LANGS) if v), None)
    if body.manager_ids is not None or body.leader_ids is not None:
        out = _scoped_rename(db, body, _actor(admin))
        _log_cfg(task_id=body.task_id, task_name=td.name_uz,
                 level="unit" if out["level"] == "supervisor" else "leader",
                 count=out["count"],
                 extra=([("name", new_name)] if new_name else []) + _applied(out))
        return out
    payload = {"task_id": body.task_id, "names": body.names, "note": body.note,
               "default_weight": body.default_weight}
    # The definition's own name is the one previous value this file has in hand
    # before the write, so it is the one field recorded as an old→new pair.
    old_name = td.name_uz
    out = write_change(db, "global_task", payload, body.when, _actor(admin))
    extra = _applied(out)
    if body.default_weight is not None:
        extra.append(("weight", body.default_weight))
    action_log.enrich(
        target_kind="task", target_id=body.task_id, target_name=old_name,
        details=[("level", "global"), ("task", body.task_id)] + extra,
        changes=([("name", old_name, new_name)]
                 if new_name and new_name != old_name else None),
    )
    return out


class ApplyAllIn(BaseModel):
    """Column push. With neither id list the target is EVERY supervisor (the
    historic behaviour); `manager_ids` / `leader_ids` narrow it to exactly the
    rows the admin filtered the matrix down to, so the button can never write
    more than the screen shows. An EMPTY list is a real answer ("nothing
    matches") and is rejected — it must never widen back to everyone."""
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    when: str = "now"
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/apply-all")
def put_apply_all(body: ApplyAllIn, db: Session = Depends(get_db),
                  admin: dict = Depends(verify_admin)):
    """Push one task's enabled/photos/weight to the targeted rows. Decomposed
    into one change per row (shift-tagged) so a staged push flips at each
    unit's own boundary.

    Supervisor level leaves leader overrides untouched. Leader level is what a
    leader-filtered matrix asks for: writing the parent supervisors instead
    would move every OTHER leader under them, which is precisely the rows the
    admin filtered out."""
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    actor = _actor(admin)
    pushed = [("enabled", body.enabled), ("min_media", body.min_media),
              ("weight", body.weight)]

    if body.leader_ids is not None:
        ids = [i for (i,) in db.query(RoleProfile.id).filter(
            RoleProfile.id.in_(body.leader_ids), RoleProfile.role == "leader").all()]
        if not ids:
            raise HTTPException(status_code=400, detail="no_rows")
        for lid in ids:
            payload = {"leader_id": lid, "task_id": body.task_id,
                       "enabled": body.enabled, "min_media": body.min_media,
                       "weight": body.weight, "names": None, "reset": False}
            write_change(db, "leader", payload, body.when, actor)
        out = {"ok": True, "count": len(ids), "level": "leader",
               "applied": body.when}
        _log_cfg(task_id=body.task_id, level="leader", count=len(ids),
                 task_name=td.name_uz, extra=pushed + _applied(out))
        return out

    q = db.query(Manager).filter(Manager.archived.is_(False))
    if body.manager_ids is not None:
        q = q.filter(Manager.id.in_(body.manager_ids))
    managers = q.all()
    if not managers:
        raise HTTPException(status_code=400, detail="no_rows")
    for m in managers:
        payload = {"manager_id": m.id, "cells": [{
            "task_id": body.task_id, "enabled": body.enabled,
            "min_media": body.min_media, "weight": body.weight, "names": None,
        }]}
        write_change(db, "supervisor", payload, body.when, actor)
    out = {"ok": True, "count": len(managers), "level": "supervisor",
           "applied": body.when}
    # Narrowed to the filtered rows, or every unit on the platform — the count
    # is the only thing that separates the two, so it is never left out.
    _log_cfg(task_id=body.task_id, level="unit", count=len(managers),
             task_name=td.name_uz,
             extra=pushed + [("scope", "filtered" if body.manager_ids is not None
                              else "all")] + _applied(out))
    return out


# Legacy column overwrite (old matrix UI). Retained so a stale client keeps
# working; the current UI uses /task + /apply-all instead. Live-only, unaudited.
class ColumnIn(BaseModel):
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    names: dict[str, str | None] | None = None  # optional per-language rename


@router.put("/admin/leader-tasks/column")
def put_column(col: ColumnIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    td = db.query(LeaderTaskDef).filter_by(id=col.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    if col.names:
        for l in _LANGS:
            v = (col.names.get(l) or "").strip()
            if v:
                setattr(td, f"name_{l}", v)
    mm, w = _clamp(col)
    managers = db.query(Manager).filter(Manager.archived.is_(False)).all()
    for m in managers:
        _upsert(db, m.id, col.task_id, col.enabled, mm, w)
    db.commit()
    _log_cfg(task_id=col.task_id, level="global", count=len(managers),
             task_name=td.name_uz,
             extra=[("enabled", col.enabled), ("min_media", mm), ("weight", w)])
    return {"ok": True}


class CriteriaIn(BaseModel):
    """One level of the definition-of-done chain. `manager_id`/`leader_id`
    absent = the global (column) level, which every unit inherits.

    `manager_ids`/`leader_ids` write the same text onto each of those rows
    instead of the global level — the scoped twin of the column edit, for a
    matrix that has been filtered down. An empty list is rejected."""
    task_id: int
    criteria: str = ""
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/criteria")
def put_criteria(body: CriteriaIn, db: Session = Depends(get_db),
                 _: dict = Depends(verify_admin)):
    """Set what the AI must see before it calls this task done. Applies at once
    (see services.leader_tasks.set_criteria for why it never stages), and the
    next drain re-reads it — verdicts already written are NOT recomputed."""
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    # The definition of done is prose an admin may paste a paragraph of; the
    # register keeps the head of it, which is what makes two edits tellable
    # apart without turning every row into a wall of text.
    shown = [("criteria", (body.criteria or "")[:200] or "—")]
    # Scoped fan-out: the filtered rows each get their own copy of the text,
    # leaving the global level (and therefore every row outside the filter)
    # exactly as it was.
    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                set_criteria(db, task_id=body.task_id, criteria=body.criteria,
                             leader_id=lid)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                set_criteria(db, task_id=body.task_id, criteria=body.criteria,
                             manager_id=mid)
        _log_cfg(task_id=body.task_id, task_name=td.name_uz, count=len(ids),
                 level="leader" if body.leader_ids is not None else "unit",
                 extra=shown)
        return {"ok": True, "count": len(ids)}
    mgr = _need_manager(db, body.manager_id)
    lead = _need_leader(db, body.leader_id)
    set_criteria(db, task_id=body.task_id, criteria=body.criteria,
                 manager_id=body.manager_id, leader_id=body.leader_id)
    _log_cfg(task_id=body.task_id, task_name=td.name_uz, mgr=mgr, lead=lead,
             level=("leader" if lead is not None
                    else "unit" if mgr is not None else "global"),
             extra=shown)
    return {"ok": True}


class WindowIn(BaseModel):
    """The clock a proof photo for this task must carry. Same four-way
    addressing as CriteriaIn — global (both ids absent), one supervisor, one
    leader, or a scoped fan-out over a filtered matrix.

    Either end may be blank: that end inherits the level above, and at the
    global level the shift default (07:00–20:00 / 17:00–09:00)."""
    task_id: int
    win_from: str = ""
    win_to: str = ""
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/window")
def put_window(body: WindowIn, db: Session = Depends(get_db),
               _: dict = Depends(verify_admin)):
    """Set when a proof photo for this task may have been taken.

    Applies at once and — unlike criteria — verdicts ALREADY written are
    re-derived from the clock each one stored (services.leader_tasks.set_window
    → leader_ai.sync_date_flags). No Gemini call, no quota: the model no longer
    judges the date at all — it transcribes the clock and the backend compares
    it, so the
    date question was reading the photo, and that answer is on the row.
    """
    for v in (body.win_from, body.win_to):
        if v.strip() and leader_ai.hhmm(v) is None:
            raise HTTPException(status_code=400, detail="bad_time")
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    # A window a leader cannot work is REFUSED, not stored (the operator's
    # ruling, 2026-08-27). This is the source of the 26 Aug night: «08:00 —
    # 10:00» is an ordinary shift-1 morning and, inherited by a shift-2 unit,
    # an hour that never arrives — the platform then recorded the leaders as
    # having failed it. Checked here rather than in `set_window` so a fan-out
    # is refused WHOLE: half a matrix written and half rejected is a state
    # nobody can read off the screen.
    bad = window_shift_problems(
        db, leader_ai.hhmm(body.win_from), leader_ai.hhmm(body.win_to),
        manager_id=body.manager_id, leader_id=body.leader_id,
        manager_ids=body.manager_ids, leader_ids=body.leader_ids)
    if bad:
        shift, lo, hi = bad[0]
        s_lo, s_hi = leader_ai.shift_window(shift)
        raise HTTPException(
            status_code=400,
            detail=f"window_outside_shift|{shift or '?'}|{lo}-{hi}|{s_lo}-{s_hi}")
    win = {"win_from": body.win_from, "win_to": body.win_to}
    # A blank end INHERITS the level above; «—» says so, where a blank cell in
    # the register would read as "no window at all".
    shown = [("window", f"{body.win_from.strip() or '—'} — "
                        f"{body.win_to.strip() or '—'}")]
    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                set_window(db, task_id=body.task_id, leader_id=lid,
                           rejudge=False, **win)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                set_window(db, task_id=body.task_id, manager_id=mid,
                           rejudge=False, **win)
        # Once, after the whole fan-out — the re-derivation is per task, not per
        # row written, so running it inside the loop would rescan N times.
        leader_ai.sync_date_flags(db, [body.task_id])
        _log_cfg(task_id=body.task_id, task_name=td.name_uz, count=len(ids),
                 level="leader" if body.leader_ids is not None else "unit",
                 extra=shown)
        return {"ok": True, "count": len(ids)}
    mgr = _need_manager(db, body.manager_id)
    lead = _need_leader(db, body.leader_id)
    set_window(db, task_id=body.task_id, manager_id=body.manager_id,
               leader_id=body.leader_id, **win)
    _log_cfg(task_id=body.task_id, task_name=td.name_uz, mgr=mgr, lead=lead,
             level=("leader" if lead is not None
                    else "unit" if mgr is not None else "global"),
             extra=shown)
    return {"ok": True}


class DeadlineIn(BaseModel):
    """By when the task should be submitted ("HH:MM", blank = clear this level).
    Same four-way addressing as WindowIn. Informational: it is what the
    /leaders «Vazifalar» tab tells the leader; nothing scores against it."""
    task_id: int
    deadline: str = ""
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/deadline")
def put_deadline(body: DeadlineIn, db: Session = Depends(get_db),
                 _: dict = Depends(verify_admin)):
    if body.deadline.strip() and leader_ai.hhmm(body.deadline) is None:
        raise HTTPException(status_code=400, detail="bad_time")
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    shown = [("deadline", body.deadline.strip() or "—")]
    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                set_deadline(db, task_id=body.task_id, deadline=body.deadline,
                             leader_id=lid)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                set_deadline(db, task_id=body.task_id, deadline=body.deadline,
                             manager_id=mid)
        _log_cfg(task_id=body.task_id, task_name=td.name_uz, count=len(ids),
                 level="leader" if body.leader_ids is not None else "unit",
                 extra=shown)
        return {"ok": True, "count": len(ids)}
    mgr = _need_manager(db, body.manager_id)
    lead = _need_leader(db, body.leader_id)
    set_deadline(db, task_id=body.task_id, deadline=body.deadline,
                 manager_id=body.manager_id, leader_id=body.leader_id)
    _log_cfg(task_id=body.task_id, task_name=td.name_uz, mgr=mgr, lead=lead,
             level=("leader" if lead is not None
                    else "unit" if mgr is not None else "global"),
             extra=shown)
    return {"ok": True}


class DateCheckIn(BaseModel):
    """Is the proof photo's DATE judged for this task? Same four-way addressing
    as WindowIn — global (both ids absent), one supervisor, one leader, or a
    scoped fan-out over a filtered matrix.

    `date_check` is a TRI-STATE and must stay one: True judge, False exempt,
    null inherit the level above (at the global level null means True, the
    chain's floor). A plain bool would make "inherit" unexpressible and every
    save would pin an answer at whatever level the modal happened to be open on.
    """
    task_id: int
    date_check: bool | None = None
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/date-check")
def put_date_check(body: DateCheckIn, db: Session = Depends(get_db),
                   _: dict = Depends(verify_admin)):
    """Exempt a task from the date question, or put it back under it.

    Applies at once and — exactly like the window — re-derives the verdicts
    ALREADY written for the task from the clocks each one stored
    (services.leader_tasks.set_date_check → leader_ai.sync_date_flags). No
    Gemini call and no quota: unticking clears the `no_date`/`date_mismatch`
    flags off existing reports (and, in the automatic regime, the deductions
    they caused), ticking it back on restores them. Nothing is destroyed either
    way, because the clock the model read stays on the row.
    """
    return _write_date_rule(db, body, setter=set_date_check, kw="date_check",
                            value=body.date_check)


class TimeCheckIn(BaseModel):
    """And is the CLOCK judged for this task, or is the day enough? The other
    half of the date rule, addressed and staged exactly like `DateCheckIn` —
    global, one supervisor, one leader, or a scoped fan-out.

    `time_check` is the same TRI-STATE: True compare the hour to the window,
    False judge the DAY alone (the window stops being a rule), null inherit the
    level above. It only means anything where `date_check` is True; False there
    already answers the whole question.
    """
    task_id: int
    time_check: bool | None = None
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/time-check")
def put_time_check(body: TimeCheckIn, db: Session = Depends(get_db),
                   _: dict = Depends(verify_admin)):
    """Judge a task by the DAY alone, or put its hours back under the window.

    The middle setting of the date rule, and the answer to the proof that has a
    date on screen but no clock — a screenshot of this dashboard, an in-app
    register, a printed report. With it on, the reviewer may read the date
    printed INSIDE the app (strict mode forbids that, because in-app text does
    not say when a photo was taken), the day must be the report's day, and the
    hour is never compared to anything.

    Applies at once and re-derives the verdicts ALREADY written from their stored
    clocks, exactly like the window and the date check — no Gemini call, no
    quota. Switching it on drops the `no_date` flags (and the deductions they
    caused in the automatic regime) from reports whose photos never carried a
    clock; switching it back off restores the strict answer. One asymmetry worth
    knowing: rows judged BEFORE the switch were reviewed under the strict prompt,
    which was told not to read in-app dates, so a re-derive can only clear their
    flags — it cannot discover a date nobody was asked to transcribe. Newly
    reviewed rows get the full benefit, and «Qayta tekshirish» is what re-reads
    old photos if that matters for a particular day.
    """
    return _write_date_rule(db, body, setter=set_time_check, kw="time_check",
                            value=body.time_check)


def _write_date_rule(db: Session, body, *, setter, kw: str,
                     value: bool | None) -> dict:
    """The four-way write both halves of the date rule share — global, one
    supervisor, one leader, or a fan-out over a filtered matrix — with ONE
    re-derivation at the end.

    Shared rather than copied because the two halves are read as one rule
    (`leader_ai.date_rule_for`): a fan-out that validated ids differently, or
    skipped the single `sync_date_flags`, would leave the pair enforced on
    different sets of rows, which is invisible until somebody's score moves.
    """
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    # TRI-STATE, and the register has to keep it one: null is «inherit the level
    # above», which is a different instruction from False.
    shown = [(kw, "inherit" if value is None else value)]
    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                setter(db, task_id=body.task_id, **{kw: value},
                       leader_id=lid, rejudge=False)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                setter(db, task_id=body.task_id, **{kw: value},
                       manager_id=mid, rejudge=False)
        # Once, after the whole fan-out — the re-derivation is per task, not per
        # row written (same reason as put_window).
        leader_ai.sync_date_flags(db, [body.task_id])
        _log_cfg(task_id=body.task_id, task_name=td.name_uz, count=len(ids),
                 level="leader" if body.leader_ids is not None else "unit",
                 extra=shown)
        return {"ok": True, "count": len(ids)}
    mgr = _need_manager(db, body.manager_id)
    lead = _need_leader(db, body.leader_id)
    setter(db, task_id=body.task_id, **{kw: value},
           manager_id=body.manager_id, leader_id=body.leader_id)
    _log_cfg(task_id=body.task_id, task_name=td.name_uz, mgr=mgr, lead=lead,
             level=("leader" if lead is not None
                    else "unit" if mgr is not None else "global"),
             extra=shown)
    return {"ok": True}


class ProofKindIn(BaseModel):
    """Where this task's proof comes from — a file the leader sends to the bot
    chat ("screenshot"), or a shot taken in the mini-app camera ("camera").

    Addressed four ways like the date rule: global, one supervisor, one leader,
    or a fan-out over the ids the matrix currently shows. `proof_kind` null
    clears an override level and falls back to the one above; at the global
    level it stores "screenshot", which is the chain's floor.
    """
    task_id: int
    proof_kind: str | None = None
    manager_id: int | None = None
    leader_id: int | None = None
    manager_ids: list[int] | None = None
    leader_ids: list[int] | None = None


@router.put("/admin/leader-tasks/proof-kind")
def put_proof_kind(body: ProofKindIn, db: Session = Depends(get_db),
                   _: dict = Depends(verify_admin)):
    """Switch a task between chat uploads and the in-app camera.

    Applies AT ONCE and stages nothing, unlike enabled/min_media/weight: this is
    the one field that changes what the leader is asked to DO, and a staged
    version would leave the bot offering an upload for a task whose proofs are
    supposed to be shot in the app — or a camera button for a task the config
    says is a screenshot — for a whole shift.

    Nothing is re-judged and nothing is destroyed. Photos already collected keep
    the clocks they were judged by; only shots taken after the switch get a
    server clock. Switching a task BACK to screenshots leaves any camera roll
    where it is — an answered task keeps its evidence — but the bot stops
    offering the camera and starts accepting files again.

    While in-app capture is a pilot, enrolment must name a SUPERVISOR or a
    LEADER: the global level is what every unit inherits, and writing camera
    there is how one test unit's setting reached every leader on the platform.
    """
    if body.proof_kind is not None and body.proof_kind not in PROOF_KINDS:
        raise HTTPException(status_code=400, detail="unknown_proof_kind")
    td = db.query(LeaderTaskDef).filter_by(id=body.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    shown = [("proof_kind", body.proof_kind or "inherit")]
    # Enrolment must NAME a unit. See services.leader_tasks.CAMERA_IS_PILOT: a
    # global camera is what every leader on the platform inherits, and that is
    # not something a pilot gets to do by accident.
    if (CAMERA_IS_PILOT and body.proof_kind == "camera"
            and body.manager_id is None and body.leader_id is None
            and body.manager_ids is None and body.leader_ids is None):
        raise HTTPException(status_code=400, detail="camera_needs_a_unit")

    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                set_proof_kind(db, task_id=body.task_id,
                               proof_kind=body.proof_kind, leader_id=lid)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                set_proof_kind(db, task_id=body.task_id,
                               proof_kind=body.proof_kind, manager_id=mid)
        _log_cfg(task_id=body.task_id, task_name=td.name_uz, count=len(ids),
                 level="leader" if body.leader_ids is not None else "unit",
                 extra=shown)
        return {"ok": True, "count": len(ids)}

    mgr = _need_manager(db, body.manager_id)
    lead = _need_leader(db, body.leader_id)
    set_proof_kind(db, task_id=body.task_id, proof_kind=body.proof_kind,
                   manager_id=body.manager_id, leader_id=body.leader_id)
    _log_cfg(task_id=body.task_id, task_name=td.name_uz, mgr=mgr, lead=lead,
             level=("leader" if lead is not None
                    else "unit" if mgr is not None else "global"),
             extra=shown)
    return {"ok": True}


class UnitIn(BaseModel):
    """Settings for ONE supervisor's unit — the whole row, in one request.

    Addressed by supervisor and nothing else: no task id, no global level. These
    are properties of the unit, and the two things this feature has gone wrong
    on so far were both a setting reaching a level that means "everybody".

    Both fields ride together because they are the same DB row: sent as two
    requests to a unit that has never been edited, they race its primary key
    and one of them dies while the panel reports success.
    """
    manager_id: int
    per_task_close: bool
    # "YYYY-MM-DD", or "" for no rehearsal window.
    bot_from: str = ""


class CellFromRow(BaseModel):
    manager_id: int
    # "" / null = clear the floor, i.e. the unit goes back to one checklist a
    # day from its next effective date. That IS the rollback, so it has to stay
    # expressible and cannot mean "leave alone".
    cell_from: str | None = ""


class CellFromIn(BaseModel):
    rows: list[CellFromRow]


@router.put("/admin/leader-tasks/cell-from")
def put_cell_from(body: CellFromIn, db: Session = Depends(get_db),
                  _: dict = Depends(verify_admin)):
    """Switch units to filing ONE CHECKLIST PER CELL, from a date.

    A LIST, always — one row toggled and a bulk press over a selection are the
    same call and the same transaction. Two parallel single writes would race
    the `leader_unit_settings` primary key, which is the trap the five ltasks
    task fields fell into (2026-08-19) and the reason `set_unit_settings` is
    that row's one writer.

    **Nothing is switched by default and nothing is backfilled.** A unit files
    per cell only because an admin set its date here, and days before that date
    keep the shape they were filed in — `services/leader_cells.py` compares the
    floor against the SHIFT's effective date on every read, so history is not
    rewritten and no score anybody has been told moves. Clearing the date is
    the rollback: new days are cell-less again and the per-cell days already
    filed stay readable and scored, with no migration either way.

    Refused for a unit whose leaders own NO cells — every one of them would
    file nothing (`leader_cells.expected_days` answers `[]`), which is a unit
    switched into silence. The count is named so the refusal says what to fix.
    """
    if not body.rows:
        return {"ok": True, "changed": 0}
    if len(body.rows) > 200:
        raise HTTPException(status_code=400, detail="too many units in one call")

    ids = [r.manager_id for r in body.rows]
    mgrs = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(ids)).all()}
    # Leaders per unit and cells per leader, in two queries rather than per row.
    owned: dict[int, int] = {}
    have: dict[int, int] = {}
    for mid, n in (db.query(RoleProfile.manager_id, func.count(Cell.id))
                   .outerjoin(Cell, Cell.leader_id == RoleProfile.id)
                   .filter(RoleProfile.role == "leader",
                           RoleProfile.manager_id.in_(ids))
                   .group_by(RoleProfile.manager_id).all()):
        owned[mid] = int(n or 0)
    for mid, n in (db.query(RoleProfile.manager_id, func.count(RoleProfile.id))
                   .filter(RoleProfile.role == "leader",
                           RoleProfile.manager_id.in_(ids))
                   .group_by(RoleProfile.manager_id).all()):
        have[mid] = int(n or 0)

    changed, lines = 0, []
    for r in body.rows:
        mgr = mgrs.get(r.manager_id)
        if not mgr:
            raise HTTPException(status_code=404,
                                detail=f"unit {r.manager_id} not found")
        val = (r.cell_from or "").strip()
        if val and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", val):
            raise HTTPException(status_code=400,
                                detail="cell_from must be YYYY-MM-DD")
        if val and not owned.get(mgr.id):
            raise HTTPException(
                status_code=400,
                detail=(f"«{mgr.name}»: no cell is assigned to any of its "
                        f"{have.get(mgr.id, 0)} leader(s), so every one of them "
                        f"would have nothing to file. Assign cells on /cells first."))
        set_unit_settings(db, manager_id=mgr.id,
                          per_task_close=mgr.id in per_task_units(db),
                          bot_from=unit_bot_from_map(db).get(mgr.id),
                          cell_from=val or None)
        changed += 1
        lines.append((mgr.name, val or "off"))

    action_log.enrich(
        target_kind="unit", target_id=body.rows[0].manager_id,
        target_name=(mgrs.get(body.rows[0].manager_id).name
                     if mgrs.get(body.rows[0].manager_id) else None),
        details=[("units", changed)] + lines[:20],
    )
    return {"ok": True, "changed": changed}


@router.put("/admin/leader-tasks/unit")
def put_unit(body: UnitIn, db: Session = Depends(get_db),
             _: dict = Depends(verify_admin)):
    """Write a unit's own settings: day-vs-task submission, and the day its bot
    filings start counting.

    `per_task_close` applies at once. Switching ON mid-day is safe: answers
    already given stay drafts and can still be closed one by one, and the day
    will close itself when the last of them is. Switching OFF returns the unit
    to «Kunni yopish» with those drafts intact. What no switch ever undoes is a
    task the leader already closed — that lock is final by design, and a config
    change that reopened submitted work would be exactly the hole per-task
    submission exists to close.

    `bot_from` opens a REHEARSAL window: until that day the unit's leaders file
    in the bot to learn it while the register, the score and the day report keep
    reading its Google-Form sheet row, and NOTHING from those days is sent to
    the AI. It only moves which layer is read, so it can be set, moved or
    cleared at any time — and clearing it puts the days back in `discover()`'s
    reach, since a ref is what makes a row known.

    Anything already queued for the days the window now covers is dropped on the
    way out: a unit is usually enrolled in the morning and declared a rehearsal
    once somebody sees how the first tasks went, so by then the morning's proofs
    are sitting `pending`. Only never-judged rows go — the same rule the
    paused-shift purge follows.

    Refused for a shift-2 unit, because shift 2 files ONLY in the bot: there is
    no sheet row underneath it, so a rehearsal window there would not fall back
    to the fill-out — it would empty the register. Checked here as well as in
    the panel, since the endpoint is reachable without it.
    """
    mgr = db.query(Manager).filter_by(id=body.manager_id).first()
    if not mgr:
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    bot_from = (body.bot_from or "").strip()
    if bot_from and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", bot_from):
        raise HTTPException(status_code=400, detail="bot_from must be YYYY-MM-DD")
    if bot_from and mgr.shift == leader_bot.MERGE_SHIFT:
        raise HTTPException(
            status_code=400,
            detail="Shift 2 files only in the bot — it has no fill-out to fall "
                   "back to, so a rehearsal window would leave it with no data.")
    set_unit_settings(db, manager_id=body.manager_id,
                      per_task_close=bool(body.per_task_close),
                      bot_from=bot_from)
    dropped = leader_ai.drop_rehearsal_pending(db, body.manager_id, bot_from)
    lines = [("level", "unit"), ("unit", mgr.name),
             ("mode", "per_task" if body.per_task_close else "per_day"),
             ("from_date", bot_from or "—")]
    if dropped:
        # Queued AI work the rehearsal window just took back — the one visible
        # consequence of this save that the two fields do not state.
        lines.append(("removed", dropped))
    action_log.enrich(
        target_kind="unit", target_id=body.manager_id, target_name=mgr.name,
        unit_id=mgr.id, unit_name=mgr.name, details=lines,
    )
    return {"ok": True, "dropped": dropped}


# ── Admin: example proof photos (AI reference images) ────────────────────────
# Optional per-task EXAMPLES of a correct proof, shown to the AI reviewer
# beside the written criteria (services/leader_ai.py sends them in front of the
# proof photos) AND to leaders on the /leaders «Vazifalar» tab (the viewer
# endpoint further down). Global per task like note_*, and — like criteria —
# they apply at once: nothing here stages.

_EXAMPLE_MAX_BYTES = 10 * 1024 * 1024
_EXAMPLES_PER_TASK = 3
# How many rows ONE upload may fan out to. An example is stored bytes, so a
# fan-out is a copy per target; this is generous enough for a unit's leaders
# (the largest carries far fewer) and small enough that nobody can put a
# hundred copies of one screenshot into every database dump by mis-clicking a
# filter.
_EXAMPLES_FANOUT_MAX = 40
# Matches services/gemini's request-side shrink, so what is stored is exactly
# what the model receives — keeping more would be dead weight in every dump.
_EXAMPLE_EDGE = 1280


@router.get("/admin/leader-tasks/examples/{example_id}")
def get_example(example_id: int, db: Session = Depends(get_db),
                _: dict = Depends(verify_admin)):
    row = db.query(LeaderTaskExample).filter_by(id=example_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No example")
    # Rows are insert/delete only, so a given id's bytes never change.
    return Response(
        content=row.data,
        media_type=row.mime or "image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )


@router.post("/admin/leader-tasks/examples")
def post_example(task_id: int = Form(...), file: UploadFile = File(...),
                 manager_ids: list[int] = Form([]),
                 leader_ids: list[int] = Form([]),
                 level: str = Form(""),
                 db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Store one example photo at ONE level of the chain, or fan it out across
    the rows a filtered matrix is showing.

    Naming NEITHER list writes the GLOBAL level — which is what this endpoint
    has always done and what a tab open on an earlier bundle still sends, so
    nothing about that case moves. Naming leaders (or supervisors) writes one
    row EACH: an example is bytes, not a pointer, so "these two leaders" is two
    rows, exactly as the criteria fan-out beside it is two rows. That is also
    why the breadth is capped — a careless fan-out across every leader would
    put a hundred copies of one screenshot in the database and in every dump.

    `leader_ids` wins over `manager_ids` when both arrive, the same precedence
    `colScope()` applies on the client: a leader filter means the admin is
    looking at leader rows, and writing the parents would reach every OTHER
    leader under them — precisely the rows they filtered away.

    `level` STATES the intent instead of leaving it to be inferred from an
    empty list, and exists because those two cases are indistinguishable on the
    wire and mean opposite things: a filter matching no row must write NOTHING,
    while naming no rows at all means "global". Inferred, a caller whose filter
    emptied would silently write the global level — the exact accident this
    scoping was built to end. Blank = infer, which is what a tab open on an
    earlier bundle sends and what has always meant global.
    """
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")

    lead_ids = sorted({int(i) for i in (leader_ids or []) if i})
    mgr_ids = sorted({int(i) for i in (manager_ids or []) if i})
    if lead_ids:
        mgr_ids = []
    want = (level or "").strip().lower()
    if want == "global":
        lead_ids, mgr_ids = [], []
    elif want == "leader" and not lead_ids:
        raise HTTPException(status_code=400, detail="no_targets")
    elif want == "supervisor" and not mgr_ids:
        raise HTTPException(status_code=400, detail="no_targets")
    if len(lead_ids) + len(mgr_ids) > _EXAMPLES_FANOUT_MAX:
        raise HTTPException(status_code=400, detail="examples_too_many_targets")
    # An id that names nothing is refused rather than skipped: a row written
    # against a leader who does not exist is a row no reader can ever resolve,
    # and a silently shortened fan-out reports success for photos it did not
    # store.
    if lead_ids:
        known = {p.id for p in db.query(RoleProfile.id)
                 .filter(RoleProfile.id.in_(lead_ids),
                         RoleProfile.role == "leader").all()}
        if len(known) != len(lead_ids):
            raise HTTPException(status_code=400, detail="unknown_leader")
    if mgr_ids:
        known = {m.id for m in db.query(Manager.id)
                 .filter(Manager.id.in_(mgr_ids)).all()}
        if len(known) != len(mgr_ids):
            raise HTTPException(status_code=400, detail="unknown_manager")

    # One (task, level) target holds at most _EXAMPLES_PER_TASK photos. Checked
    # for EVERY target before anything is written, so a fan-out is refused
    # whole rather than landing on the rows that happened to have room — the
    # same all-or-nothing rule `window_shift_problems` applies to its own
    # fan-out.
    targets: list[tuple[int | None, int | None]] = (
        [(None, lid) for lid in lead_ids] if lead_ids
        else [(mid, None) for mid in mgr_ids] if mgr_ids
        else [(None, None)]
    )
    for mid, lid in targets:
        q = db.query(LeaderTaskExample).filter(LeaderTaskExample.task_id == task_id)
        q = (q.filter(LeaderTaskExample.leader_id == lid) if lid
             else q.filter(LeaderTaskExample.leader_id.is_(None)))
        q = (q.filter(LeaderTaskExample.manager_id == mid) if mid
             else q.filter(LeaderTaskExample.manager_id.is_(None)))
        if q.count() >= _EXAMPLES_PER_TASK:
            raise HTTPException(status_code=400, detail="examples_full")

    content = file.file.read(_EXAMPLE_MAX_BYTES + 1)
    if len(content) > _EXAMPLE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="photo_too_large")
    validate_avatar(file, content)
    try:
        img = Image.open(BytesIO(content))
        img = ImageOps.exif_transpose(img)
        img = img.convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="invalid_image")
    # Downscale only — no square crop, unlike avatars: examples are screenshots
    # and wide shop-floor photos, and cropping is exactly how a corner clock or
    # a table edge would go missing from the reference.
    img.thumbnail((_EXAMPLE_EDGE, _EXAMPLE_EDGE), Image.Resampling.LANCZOS)
    buf = BytesIO()
    img.save(buf, "JPEG", quality=85)
    blob = buf.getvalue()
    rows = [LeaderTaskExample(task_id=task_id, manager_id=mid, leader_id=lid,
                              mime="image/jpeg", data=blob)
            for mid, lid in targets]
    for row in rows:
        db.add(row)
    db.commit()
    level = ("leader" if lead_ids else "supervisor" if mgr_ids else "global")
    action_log.enrich(
        target_kind="example", target_id=rows[0].id, target_name=td.name_uz,
        # The COUNT, never the id list: the register rides in every db-dump, so
        # anything unbounded belongs here as a number.
        details=[("level", level), ("task", task_id), ("size", len(blob)),
                 ("targets", len(rows))],
    )
    # `id` is kept beside `ids` for a tab open on an earlier bundle.
    return {"ok": True, "id": rows[0].id, "ids": [r.id for r in rows],
            "n": len(rows), "level": level}


@router.delete("/admin/leader-tasks/examples/{example_id}")
def delete_example(example_id: int, db: Session = Depends(get_db),
                   _: dict = Depends(verify_admin)):
    row = db.query(LeaderTaskExample).filter_by(id=example_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No example")
    task_id = row.task_id
    # The level is read off the ROW, never assumed: an admin taking back a
    # wrongly-global photo and one tidying a single leader's are two different
    # acts, and the register is where the difference has to survive.
    level = leader_ai.example_level(row)
    db.delete(row)
    db.commit()
    action_log.enrich(
        target_kind="example", target_id=example_id,
        details=[("level", level), ("task", task_id)],
    )
    return {"ok": True}


# ── Admin: staged changes + config audit ─────────────────────────────────────

@router.get("/admin/leader-tasks/pending")
def get_pending(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    promote_all_shifts(db)
    return {"pending": pending_list(db)}


class CancelIn(BaseModel):
    pending_id: int


@router.post("/admin/leader-tasks/pending/cancel")
def post_cancel(body: CancelIn, db: Session = Depends(get_db),
                admin: dict = Depends(verify_admin)):
    if not cancel_pending(db, body.pending_id, _actor(admin)):
        raise HTTPException(status_code=404, detail="Unknown pending change")
    action_log.enrich(target_kind="setting", target_id=body.pending_id,
                      details=[("id", body.pending_id)])
    return {"ok": True}


@router.get("/admin/leader-tasks/audit")
def get_audit(limit: int = 200, db: Session = Depends(get_db),
              _: dict = Depends(verify_admin)):
    return {"audit": audit_list(db, min(500, max(1, limit)))}


class RevertIn(BaseModel):
    audit_id: int


@router.post("/admin/leader-tasks/revert")
def post_revert(body: RevertIn, db: Session = Depends(get_db),
                admin: dict = Depends(verify_admin)):
    if not revert_audit(db, body.audit_id, _actor(admin)):
        raise HTTPException(status_code=400, detail="Nothing to revert")
    action_log.enrich(target_kind="setting", target_id=body.audit_id,
                      details=[("id", body.audit_id)])
    return {"ok": True}


# ── Admin: archive channel ────────────────────────────────────────────────────

class ChannelIn(BaseModel):
    chat_id: str


@router.put("/admin/leader-tasks/channel")
def put_channel(body: ChannelIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    chat_id = body.chat_id.strip()
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    # The one setting in this file whose previous value is already in hand, so
    # the archive channel is the one that gets a real old→new pair.
    old = (row.value or "") if row else ""
    if not chat_id:  # clear
        if row:
            db.delete(row)
            db.commit()
        action_log.enrich(target_kind="setting", target_id=CHANNEL_SETTING_KEY,
                          changes=[("value", old or "—", "—")])
        return {"ok": True, "chat_id": ""}

    # Verify before storing: the bot must be able to post (and clean up) there.
    from app.telegram_bot import bot  # lazy — keeps router import light
    try:
        probe = bot.send_message(chat_id, "✅ Safia leader-tasks archive check")
        try:
            bot.delete_message(chat_id, probe.message_id)
        except Exception:
            pass
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bot can't post to this channel: {e}")

    if not row:
        row = AppSetting(key=CHANNEL_SETTING_KEY, value=chat_id)
        db.add(row)
    else:
        row.value = chat_id
    db.commit()
    action_log.enrich(target_kind="setting", target_id=CHANNEL_SETTING_KEY,
                      changes=[("value", old or "—", chat_id)])
    return {"ok": True, "chat_id": chat_id}


# ── Admin: bot-submission register + clear tool ───────────────────────────────
# The dashboard itself reads bot days through /api/leaders (merged with the
# sheet). These two endpoints exist for the «Tozalash» tab on the Shift 2
# monitoring page: they list the raw submissions and delete the ones the admin
# picked — test runs, wrong-day answers, a leader who filed for someone else.
#
# The LIST also carries OPEN days, and that is the tab's second job. Every read
# surface on the platform serves a closed day — the register (`leader_bot`), the
# score, the day report, the AI queue, and this tab until 2026-08-21 — so a
# checklist the leader filled but never closed was visible NOWHERE, and read
# exactly like a leader who filed nothing at all. That state is reachable
# without anyone doing anything wrong: `lt:cconf` refuses to close a day while
# one enabled task has no answer, and a camera task writes its answer only once
# the roll reaches `min_media`, so a leader one shot short of a three-photo task
# is holding a day nothing will accept and nothing will show.
#
# DELETION stays closed-only regardless of what this lists: `delete_submissions`
# re-filters `closed_at IS NOT NULL` itself, so an open day cannot be selected,
# armed or dropped — pulling the table out from under a running /tasks flow
# would strand the leader in it. A bygone open day auto-closes on that leader's
# next /tasks (`_lt_autoclose`) and becomes deletable then.

@router.get("/admin/leader-tasks/submissions")
def list_submissions(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Every bot day plus what deleting it would take away (task answers, proof
    photos), and the units/leaders that actually filed — so the tab's pickers
    only ever offer values that match something.

    A row is `open` when the leader has not submitted it. Those carry what the
    day is still WAITING for — how many enabled tasks are answered, which ones
    are not, and how many photos are already on the server for the unanswered
    ones — because that last number is the whole difference between "they never
    filed" and "they filed and the app is holding it".
    """
    closed = leader_bot.closed_days(db, merged=False)
    open_days = (db.query(LeaderTaskDay)
                 .filter(LeaderTaskDay.closed_at.is_(None)).all())
    days = closed + open_days
    profs = {
        p.id: p
        for p in db.query(RoleProfile)
        .filter(RoleProfile.id.in_({d.leader_id for d in days}))
        .all()
    } if days else {}
    mgrs = {m.id: m for m in db.query(Manager).all()}

    by_day = leader_bot.entries_of(db, days)
    entry_ids = [e.id for es in by_day.values() for e in es]
    media_by_entry = leader_bot.media_of(db, entry_ids)
    # Cell codes for the rows on this page — one query, not one per row.
    _cids = {d.cell_id for d in days if d.cell_id}
    sub_cells = {c.id: c.verifix_code
                 for c in db.query(Cell).filter(Cell.id.in_(_cids)).all()} \
        if _cids else {}

    # ── what each OPEN day is still waiting for ──────────────────────────────
    # The camera roll is read straight from `leader_task_photos`, not through
    # the entries: a task short of `min_media` has no entry, and its shots are
    # precisely the evidence that the leader did the work.
    per_task = per_task_units(db)
    # Which layer counts for each (leader, day) — the SAME computation the
    # fill-out register runs, so the two tabs can never print different answers
    # about one day.
    counted, picks, sheet_pairs, pick_by = _pair_state(db)
    open_ids = [d.id for d in open_days]
    roll: dict[tuple[int, int], int] = {}
    if open_ids:
        for day_id, task_id in db.query(
                LeaderTaskPhoto.day_id, LeaderTaskPhoto.task_id).filter(
                LeaderTaskPhoto.day_id.in_(open_ids)).all():
            roll[(day_id, task_id)] = roll.get((day_id, task_id), 0) + 1
    # Config resolution is per LEADER, not per day: a leader who stopped using
    # the bot leaves one open day per date behind them, and re-resolving the
    # whole global → supervisor → leader chain for each would walk the override
    # tables once per row.
    cfg_cache: dict[int, dict] = {}

    rows = []
    for d in days:
        prof = profs.get(d.leader_id)
        mgr = mgrs.get(d.manager_id)
        entries = by_day.get(d.id, [])
        row = {
            "id": d.id,
            # The report handle, so a row on the admin tab can open the very
            # report the leader and the brigadir were shown. Same spelling as
            # the dashboard feed, from the same function.
            "uid": leader_bot.day_uid(d.id),
            "date": d.date,
            # The cell this checklist was filed FOR, by verifix CODE. Absent on
            # a day filed before its unit was switched — several rows can share
            # one (leader, date) now, and this is what tells them apart.
            "cell_id": d.cell_id,
            "cell": sub_cells.get(d.cell_id),
            "leader_id": d.leader_id,
            "leader": prof.name if prof else f"#{d.leader_id}",
            "manager_id": d.manager_id,
            "supervisor": mgr.name if mgr else "N/A",
            "shift": mgr.shift if mgr else None,
            "tasks": len(entries),
            "done": sum(1 for e in entries if e.done),
            # The tasks an admin can take back: one entry is one lock, and the
            # panel must not offer a button for a task that is not locked.
            "locked_tasks": sorted(e.task_id for e in entries
                                   if leader_close.locked(e, d)),
            "media": sum(len(media_by_entry.get(e.id, [])) for e in entries),
            "completion": float(d.completion or 0),
            "closed_at": d.closed_at.isoformat() if d.closed_at else None,
            "open": d.closed_at is None,
            # Which submission the register serves for this (leader, day), and
            # the admin's choice if somebody made one. An OPEN day is in neither
            # — it is not a submission yet.
            "counted": counted.get((d.leader_id, str(d.date))),
            "pick": picks.get((d.leader_id, str(d.date))),
            # A Google-Form row for the same person and day: only then is there
            # anything to CHOOSE between, and only then is the choice offered.
            "has_sheet": (d.leader_id, str(d.date)) in sheet_pairs,
            "pick_by": pick_by.get((d.leader_id, str(d.date))),
        }
        if d.closed_at is None:
            shift = mgr.shift if mgr else None
            if prof is not None and prof.id not in cfg_cache:
                cfg_cache[prof.id] = effective_leader_config(db, prof, shift)
            cfg = cfg_cache.get(d.leader_id) or {}
            want = sorted(t for t, s in cfg.items() if s.get("enabled"))
            answered = {e.task_id for e in entries}
            missing = [t for t in want if t not in answered]
            row.update({
                "enabled": len(want),
                "answered": sum(1 for t in want if t in answered),
                "missing": missing,
                # Shots already on the server for a task with no answer — a
                # camera roll short of its minimum. Non-zero here means the
                # leader filed and the platform is sitting on it.
                "pending_media": sum(n for (di, ti), n in roll.items()
                                     if di == d.id and ti in missing),
                "per_task": d.manager_id in per_task,
                "tasks_closed": sum(1 for e in entries if e.closed_at is not None),
                # Past its own filing window: this one will auto-close (and go
                # to the AI) the moment its leader next opens /tasks, so it is
                # stuck rather than in progress.
                "expired": str(d.date) <= expired_through(shift),
            })
        rows.append(row)
    rows.sort(key=lambda r: (str(r["date"]), r["leader"]), reverse=True)

    # Pickers, built from what's actually in the register.
    sup_ids = {r["manager_id"] for r in rows}
    lead_ids = {r["leader_id"] for r in rows}
    return {
        "rows": rows,
        "open_count": sum(1 for r in rows if r["open"]),
        "supervisors": sorted(
            ({"id": i, "name": mgrs[i].name if i in mgrs else f"#{i}",
              "shift": mgrs[i].shift if i in mgrs else None} for i in sup_ids),
            key=lambda s: s["name"],
        ),
        "leaders": sorted(
            ({"id": i, "name": profs[i].name if i in profs else f"#{i}"} for i in lead_ids),
            key=lambda l: l["name"],
        ),
    }


class DeleteSubmissions(BaseModel):
    ids: list[int]


@router.post("/admin/leader-tasks/submissions/delete")
def delete_submissions(
    body: DeleteSubmissions,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_admin),
):
    """Permanently drop the picked bot days — the day rows, their task answers
    and the media ROWS. The photos themselves stay in the archive channel: that
    channel is the audit trail, and Telegram refuses deletes past 48h anyway,
    so a half-succeeding sweep would be worse than none."""
    ids = [int(i) for i in (body.ids or [])]
    if not ids:
        raise HTTPException(status_code=400, detail="Nothing selected")

    days = (
        db.query(LeaderTaskDay)
        .filter(LeaderTaskDay.id.in_(ids), LeaderTaskDay.closed_at.isnot(None))
        .all()
    )
    if not days:
        raise HTTPException(status_code=404, detail="No matching closed days")

    day_ids = [d.id for d in days]
    # Read off the rows while they still exist: after the bulk delete + commit
    # every one of these instances is expired, and touching an attribute would
    # go looking for a row that is gone.
    unit_ids = sorted({d.manager_id for d in days if d.manager_id is not None})
    dates = sorted({str(d.date) for d in days})
    entries = db.query(LeaderTaskEntry).filter(LeaderTaskEntry.day_id.in_(day_ids)).all()
    entry_ids = [e.id for e in entries]
    n_media = 0
    if entry_ids:
        n_media = (
            db.query(LeaderTaskMedia)
            .filter(LeaderTaskMedia.entry_id.in_(entry_ids))
            .delete(synchronize_session=False)
        )
    n_entries = (
        db.query(LeaderTaskEntry)
        .filter(LeaderTaskEntry.day_id.in_(day_ids))
        .delete(synchronize_session=False)
    )
    # Late proofs and their draft shots hang off the DAY by a non-nullable FK,
    # so they have to go before it or the whole batch dies on a foreign-key
    # violation and the admin is given a 500 with no reason. A late proof is
    # written while the day is open and is deliberately never deleted anywhere
    # else, so a deleted day is the one thing that can strand one — and its
    # photos are the day's photos, which is exactly what this tool removes.
    late_ids = [r[0] for r in db.query(LeaderLateProof.id)
                .filter(LeaderLateProof.day_id.in_(day_ids)).all()]
    if late_ids:
        db.query(LeaderLateProofMedia).filter(
            LeaderLateProofMedia.late_id.in_(late_ids)
        ).delete(synchronize_session=False)
        db.query(LeaderLateProof).filter(
            LeaderLateProof.id.in_(late_ids)
        ).delete(synchronize_session=False)
    db.query(LeaderLateProofShot).filter(
        LeaderLateProofShot.day_id.in_(day_ids)
    ).delete(synchronize_session=False)
    n_days = (
        db.query(LeaderTaskDay)
        .filter(LeaderTaskDay.id.in_(day_ids))
        .delete(synchronize_session=False)
    )
    # The AI verdicts of those entries go with them. A review points at its
    # entry by id (`bot:<entry_id>`), so one left behind is a queue card with no
    # photo, no answer and no report to open — it reads as "the leader filed
    # nothing" when what happened is that an admin deleted the day underneath a
    # finished verdict. Nothing else in the app deletes a LeaderAiReview, and
    # discovery cannot re-create these (their source is gone), so this is the
    # only place the orphan can be prevented.
    n_rev = 0
    if entry_ids:
        n_rev = (
            db.query(LeaderAiReview)
            .filter(LeaderAiReview.ref.in_([leader_ai.bot_ref(i) for i in entry_ids]))
            .delete(synchronize_session=False)
        )
    db.commit()
    log.info(
        "leader-tasks: %s deleted %d bot day(s), %d entries, %d media rows, "
        "%d AI verdict(s) (ids=%s)",
        _actor(admin), n_days, n_entries, n_media, n_rev, day_ids,
    )
    # Irreversible and plural: WHICH units lost days, HOW MANY, and over what
    # dates are the three things nobody can reconstruct afterwards. Names would
    # cost a query the delete does not otherwise make, so the units are their
    # ids — the day rows already carry them.
    lines = [("count", n_days), ("tasks", n_entries), ("photos", n_media),
             ("verdict", n_rev)]
    if unit_ids:
        lines.append(("unit", ", ".join(str(i) for i in unit_ids)))
    if dates:
        lines.append(("period", dates[0] if len(dates) == 1
                      else f"{dates[0]} … {dates[-1]}"))
    action_log.enrich(
        target_kind="day",
        unit_id=unit_ids[0] if len(unit_ids) == 1 else None,
        day=dates[0] if len(dates) == 1 else None,
        details=lines,
    )
    return {"days": n_days, "entries": n_entries, "media": n_media, "reviews": n_rev}


# ── Admin: the fill-out (Google Form) register ────────────────────────────────
# The bot half above has had an admin register since the «Tozalash» tab; the
# sheet half never did. /api/leaders serves the MERGED register — a sheet row
# replaced by a bot day is simply not in it — so a leader who filed through both
# doors left one submission an admin could open and one they could not see at
# all. This lists the sheet layer WHOLE, exactly as `closed_days(merged=False)`
# lists the bot layer whole, and says of every day which of the two counts.
#
# READ-ONLY, deliberately. `leader_checklists` is wiped and reloaded on every
# sheet Refresh (`sheets_sync.sync_leaders_sheet`), so a delete here would
# reappear on the next sync — a button that lies about what it did. The sheet is
# the source of truth for this layer, and a row is removed there.

def _sheet_pairs(db: Session, rows=None) -> set[tuple[int, str]]:
    """(leader profile id, day) for every Google-Form row that RESOLVED to a
    leader profile.

    Matched the register's own way — `supervisor_match` then `leader_match` —
    because that pair is the register's dedupe key. A second, looser matcher
    here would join rows /api/leaders never joins, and the source choice would
    then act on a pair that does not exist anywhere else.

    A row whose leader resolves to nobody is deliberately absent: it belongs to
    no profile, so no bot day can be its twin.
    """
    from app.routers.leaders import _relabel

    rows = db.query(LeaderChecklist).all() if rows is None else rows
    sup = supervisor_match(db.query(Manager).all(),
                           {_relabel(r.supervisor) for r in rows if r.supervisor})
    lead = leader_match(
        db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
        {(r.leader, (sup.get(_relabel(r.supervisor)) or {}).get("id"))
         for r in rows if r.leader},
    )
    out = set()
    for r in rows:
        pid = (lead.get((r.leader, (sup.get(_relabel(r.supervisor)) or {}).get("id"))) or {}).get("id")
        if pid:
            out.add((pid, str(r.date)))
    return out


def _pair_state(db: Session, *, want_sheet: bool = True):
    """Everything both registers need to say which submission counts, in one
    read: `(counted, picks, sheet_pairs, pick_by)`.

    `want_sheet=False` skips the sheet pass for a caller that already resolved
    the sheet layer itself (`list_fillout` does). The fuzzy name matchers are
    the expensive half of this, and running them twice for one page load buys
    nothing — the caller's own answer is the same answer.

    `counted` — (leader profile id, day) → the layer in force, for every pair
    that holds a CLOSED bot day. `picks` — the admin overrides. `sheet_pairs` —
    the pairs the Google-Form layer holds. `pick_by` — who ruled.

    ONE computation shared by both registers and by the writer below, so the
    fill-out tab, the bot tab and the endpoint that changes the answer can never
    disagree about the same day — including about whether there are two
    submissions to choose between at all.
    """
    days = leader_bot.closed_days(db, merged=False)
    shifts = {m.id: m.shift for m in db.query(Manager).all()}
    cams = leader_bot.camera_units(db)
    floors = leader_bot.bot_from_floors(db)
    picks = leader_bot.source_overrides(db)
    # WHO ruled, so a row can say that the answer beside it was a person's and
    # name them. A choice presented as an unattributed fact is one nobody can
    # ask about.
    by = {(int(l), str(d)): (who or "")
          for l, d, who in db.query(LeaderDaySource.leader_profile_id,
                                    LeaderDaySource.date,
                                    LeaderDaySource.set_by).all()}
    counted: dict[tuple[int, str], str] = {}
    for d in days:
        counted[(d.leader_id, str(d.date))] = "bot" if leader_bot.merges(
            shifts.get(d.manager_id), d.manager_id, d.date, cams, floors,
            leader_id=d.leader_id, overrides=picks,
            per_cell=d.cell_id is not None) else "sheet"
    return counted, picks, (_sheet_pairs(db) if want_sheet else set()), by


@router.get("/admin/leader-tasks/fillout")
def list_fillout(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Every Google-Form checklist row the platform holds, resolved to the same
    people and units the dashboard resolves them to.

    The matchers are the register's own (`supervisor_match` + `leader_match`),
    not a second spelling of them: a row this tab attributed to a different
    person than /api/leaders did would make the source choice below act on a
    pair the register never joins.
    """
    from app.routers.leaders import _photo_count, _relabel

    rows = (db.query(LeaderChecklist)
            .order_by(LeaderChecklist.date.desc(), LeaderChecklist.id.desc()).all())
    managers = db.query(Manager).all()
    sup = supervisor_match(managers, {_relabel(r.supervisor) for r in rows if r.supervisor})
    lead = leader_match(
        db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
        {(r.leader, (sup.get(_relabel(r.supervisor)) or {}).get("id"))
         for r in rows if r.leader},
    )
    counted, picks, _, pick_by = _pair_state(db, want_sheet=False)

    out = []
    for r in rows:
        name = _relabel(r.supervisor)
        info = sup.get(name) or {}
        prof = lead.get((r.leader, info.get("id"))) or {}
        tasks = r.tasks or []
        lid = prof.get("id")
        key = (lid, str(r.date)) if lid else None
        has_bot = key in counted if key else False
        out.append({
            # The form's own id where it has one — it survives the wipe-and-
            # reload of every refresh, unlike the row id.
            "uid": r.submission_id or f"row-{r.id}",
            "id": r.id,
            "date": r.date,
            "leader_id": lid,
            "leader": prof.get("name") or r.leader,
            "manager_id": info.get("id"),
            "supervisor": name,
            "shift": info.get("shift"),
            "tasks": len(tasks),
            "done": sum(1 for t in tasks if t.get("done")),
            "media": sum(_photo_count(t.get("photo")) for t in tasks),
            "completion": float(r.completion or 0),
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            # The pair also holds a closed bot day, so somebody may have to
            # choose between them — and until they do, `counted` says which one
            # the rule picked.
            "has_bot": has_bot,
            "counted": counted.get(key, "sheet") if key else "sheet",
            "pick": picks.get(key) if key else None,
            "pick_by": pick_by.get(key) if key else None,
        })

    sup_ids = {r["manager_id"] for r in out if r["manager_id"]}
    return {
        "rows": out,
        "both_count": sum(1 for r in out if r["has_bot"]),
        "supervisors": sorted(
            ({"id": i, "name": next((r["supervisor"] for r in out if r["manager_id"] == i), f"#{i}"),
              "shift": next((r["shift"] for r in out if r["manager_id"] == i), None)}
             for i in sup_ids), key=lambda x: x["name"]),
    }


# ── Admin: which layer counts for one (leader, day) ──────────────────────────

class DaySource(BaseModel):
    leader_id: int
    date: str
    source: str | None = None      # "bot" | "sheet" | null = back to the rule


@router.post("/admin/leader-tasks/day-source")
def set_day_source(
    body: DaySource,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_admin),
):
    """Pick the submission that COUNTS for one leader-day, or hand the day back
    to the rule.

    **The bound is ASYMMETRIC, because the two directions carry opposite risk**,
    and it is enforced here rather than guarded in the UI — the endpoint is
    reachable without it.

      * «bot» needs only the closed bot day. Choosing it can add a day to the
        register that the rule was hiding (a shift-1 unit outside the camera
        pilot, a day below a unit's rehearsal floor) and can never take one
        away: the sheet row it displaces, where there is one, is displaced
        exactly as an ordinary merge displaces it. Requiring a sheet twin here
        was the first cut of this rule and it was wrong — it refused the one
        thing an admin looking at a finished, scored, unshown bot day actually
        wants to do.
      * «sheet» needs BOTH. Shift 2 files only in the bot, so forcing one of its
        days to the sheet when no sheet row exists would delete the day from
        every surface at once — register, score, report, AI queue — without
        deleting anything.

    Clearing DELETES the row: "no opinion" is the absence of a record, not a
    third value every reader would have to spell out.
    """
    src = (body.source or "").strip().lower() or None
    if src not in (None, "bot", "sheet"):
        raise HTTPException(status_code=400, detail="source must be 'bot' or 'sheet'")
    date = (body.date or "").strip()[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise HTTPException(status_code=400, detail="Bad date")

    prof = db.query(RoleProfile).filter_by(id=body.leader_id).first()
    if prof is None or prof.role != "leader":
        raise HTTPException(status_code=404, detail="No such leader")

    row = (db.query(LeaderDaySource)
           .filter_by(leader_profile_id=body.leader_id, date=date).first())
    old = row.source if row else None

    if src is not None:
        # Checked through the same `_pair_state` the two registers are drawn
        # from — a choice offered by one computation and validated by another is
        # a choice that can be offered and then refused.
        counted, _, sheet_pairs, _by = _pair_state(db, want_sheet=(src == "sheet"))
        key = (body.leader_id, date)
        if key not in counted:
            raise HTTPException(
                status_code=409,
                detail="This day has no closed bot submission — nothing to choose")
        if src == "sheet" and key not in sheet_pairs:
            raise HTTPException(
                status_code=409,
                detail="This day has no fill-out submission — choosing it would "
                       "leave the day counted nowhere")

    if src is None:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(LeaderDaySource(leader_profile_id=body.leader_id, date=date,
                               source=src, set_by=_actor(admin),
                               set_at=datetime.now(timezone.utc)))
    else:
        row.source = src
        row.set_by = _actor(admin)
        row.set_at = datetime.now(timezone.utc)
    db.commit()
    log.info("leader-tasks: %s set the counted source for leader %s on %s to %s",
             _actor(admin), body.leader_id, date, src or "the rule")
    action_log.enrich(
        target_kind="day", target_id=str(body.leader_id), target_name=prof.name,
        unit_id=prof.manager_id, day=date,
        changes=[("source", old or "auto", src or "auto")])
    return {"leader_id": body.leader_id, "date": date, "source": src}


# ── Admin: ONE day, finished or not ──────────────────────────────────────────
# The register above says a day is unfinished and what it is waiting for; this
# says WHAT IS IN IT. Until now an open day had no detail anywhere on the
# platform — `build_report_row` serves closed days only, by the rule that an
# open day is a leader mid-checklist and not a submission — so the proofs a
# leader had already uploaded were, for an unfinished day, visible to nobody.
#
# A CLOSED day is still served by `leader_reports.day_report`, verbatim: this
# endpoint delegates rather than re-deriving, so the admin, the leader and the
# brigadir go on reading ONE answer. What is added on top is per-task state the
# report has no reason to carry — whether the task is locked, when it was
# submitted, and the camera roll of a task that never produced an entry.

def _roll_wire(p: LeaderTaskPhoto) -> dict:
    """One camera-roll shot, as the admin modal shows it. Deliberately the same
    facts `leader_proof._photo_wire` gives the leader's own page — the stamp
    burnt into the image, whether it was captured outside the window, whether it
    arrived from the offline queue — because a reviewer and a filer looking at
    one photo must not be told different things about it."""
    return {
        "id": p.id, "slot": p.slot,
        "capturedAt": p.captured_at.isoformat() if p.captured_at else None,
        "stamp": p.stamp, "late": bool(p.late), "deferred": bool(p.deferred),
    }


@router.get("/admin/leader-tasks/day/{day_id}")
def admin_day_detail(day_id: int, db: Session = Depends(get_db),
                     _: dict = Depends(verify_admin)):
    day = db.query(LeaderTaskDay).filter_by(id=day_id).first()
    if day is None:
        raise HTTPException(status_code=404, detail="No such day")

    prof = db.query(RoleProfile).filter_by(id=day.leader_id).first()
    mgr = db.query(Manager).filter_by(id=day.manager_id).first()
    shift = mgr.shift if mgr else None
    entries = {e.task_id: e for e in db.query(LeaderTaskEntry)
               .filter_by(day_id=day.id).all()}
    media = leader_bot.media_of(db, [e.id for e in entries.values()])
    roll: dict[int, list] = {}
    for p in (db.query(LeaderTaskPhoto).filter_by(day_id=day.id)
              .order_by(LeaderTaskPhoto.task_id, LeaderTaskPhoto.slot).all()):
        roll.setdefault(p.task_id, []).append(p)
    revs = {}
    if entries:
        refs = {leader_ai.bot_ref(e.id): e.task_id for e in entries.values()}
        revs = {refs[r.ref]: r for r in db.query(LeaderAiReview)
                .filter(LeaderAiReview.ref.in_(refs.keys())).all() if r.ref in refs}

    # Per-task state every branch needs: it is the SAME question on a finished
    # day and an unfinished one, so it is answered once, above the split.
    per_task = day.manager_id in per_task_units(db)

    def _state(task_id: int) -> dict:
        e = entries.get(task_id)
        return {
            "state": leader_close.task_state(
                e, revs.get(task_id), bool(media.get(e.id)) if e else False, day),
            "locked": leader_close.locked(e, day),
            "closedAt": e.closed_at.isoformat() if e is not None and e.closed_at else None,
            "roll": [_roll_wire(p) for p in roll.get(task_id, [])],
        }

    if day.closed_at is not None:
        row = leader_reports.day_report(db, leader_bot.day_uid(day.id))
        if row is None:
            raise HTTPException(status_code=404, detail="No such report")
        for tk in row.get("tasks") or []:
            tk.update(_state(int(tk.get("id") or 0)))
        row["open"] = False
        row["perTask"] = per_task
        return row

    # ── the unfinished day ───────────────────────────────────────────────────
    # Built from the CONFIG, not from the entries, so a task the leader has not
    # reached yet is listed as unanswered instead of being absent — "which
    # tasks have nothing on them" is most of what this view is for.
    # Verdict shaping is the AI router's — imported here rather than re-spelled,
    # so an open day's verdict card and a closed one's come out identical.
    from app.routers.leader_ai import (
        _as_verdict, _date_check, _task_cfg, _time_check, _window)

    cfg = effective_leader_config(db, prof, shift) if prof is not None else {}
    defs = {td.id: td for td in db.query(LeaderTaskDef).all()}
    names = leader_reports._name_chain(db, day.manager_id, day.leader_id, defs)
    win_cfg = _task_cfg(db, list(revs.values())) if revs else None

    tasks = []
    for tid in sorted(t for t, c in cfg.items() if c.get("enabled")):
        e = entries.get(tid)
        rev = revs.get(tid)
        tasks.append({
            "id": tid,
            "name": names.get(tid) or {l: f"#{tid}" for l in leader_ai.LANGS},
            "weight": (cfg.get(tid) or {}).get("weight") or 0,
            "minMedia": int((cfg.get(tid) or {}).get("min_media") or 0),
            "proofKind": (cfg.get(tid) or {}).get("proof_kind"),
            "answered": e is not None,
            "done": bool(e.done) if e is not None else False,
            "reason": (e.reason if e is not None else "") or "",
            "media": media.get(e.id, []) if e is not None else [],
            "photo": "",
            "review": _as_verdict(rev, _window(win_cfg, rev), _date_check(win_cfg, rev),
                                  _time_check(win_cfg, rev)) if rev is not None else None,
            "queued": bool(rev is not None and rev.status == "pending"),
            "ai_rejected": False,
            "dispute": None,
            **_state(tid),
        })

    answered = sum(1 for t in tasks if t["answered"])
    closed_n = sum(1 for t in tasks if t["closedAt"])
    return {
        "uid": leader_bot.day_uid(day.id),
        "open": True,
        "perTask": per_task,
        "date": day.date,
        "shift": shift,
        "source": "bot",
        "submittedAt": None,
        "leader": prof.name if prof else f"#{day.leader_id}",
        "leaderId": day.leader_id,
        "supervisor": mgr.name if mgr else "N/A",
        "managerId": day.manager_id,
        "voided": False,
        "lateState": None,
        # An unfinished day has NO score, and must not print one: `completion`
        # is written when the day closes, and a running total shown as the
        # result is a number the leader can still move.
        "score": None,
        "rawScore": None,
        "progress": {
            "enabled": len(tasks),
            "answered": answered,
            "closed": closed_n,
            # Shots sitting on the server for a task with NO answer — a camera
            # roll short of its minimum. This is the number that separates
            # "they never filed" from "they filed and we are holding it".
            "pendingMedia": sum(len(t["roll"]) for t in tasks if not t["answered"]),
            "expired": str(day.date) <= expired_through(shift),
        },
        "counts": {"total": len(tasks), "checked": 0, "rejected": 0,
                   "errors": 0, "pending": sum(1 for t in tasks if t["queued"])},
        "tasks": tasks,
    }


@router.get("/admin/leader-tasks/roll-photo/{photo_id}")
def admin_roll_photo(photo_id: int, db: Session = Depends(get_db),
                     _: dict = Depends(verify_admin)):
    """One camera-roll shot, for the admin day detail.

    A door of its own rather than a widening of `/api/leader-proof/photo/{id}`,
    which answers only for a photo belonging to a leader profile the CALLER
    holds and says in its own docstring that it must never widen into anything
    else. These shots hang off no entry — the task is still short of
    `min_media` — so the register's media proxy cannot reach them either.
    """
    row = db.query(LeaderTaskPhoto).filter_by(id=photo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Photo not found")
    return _stream_tg_file(row.file_id)


# ── Admin: taking ONE submitted task back ────────────────────────────────────
# The bot already offers this on its locked-task screen; this is the same core
# reached from the panel, for an admin at a desk rather than in the chat. It is
# admin-only in `verify_admin` AND in `reopen_task`'s own contract — «closing is
# final» is a rule, not a layout.

class ReopenTask(BaseModel):
    day_id: int
    task_id: int
    wipe: bool = False             # reopen AND empty it


@router.post("/admin/leader-tasks/task/reopen")
def reopen_submitted_task(
    body: ReopenTask,
    db: Session = Depends(get_db),
    admin: dict = Depends(verify_admin),
):
    """Unlock one submitted task, optionally emptying it.

    Both halves are the shared cores — `leader_close.reopen_task` and
    `leader_close.reset_task` — so a task taken back from the panel and one
    taken back from the bot end in exactly the same state. Reopen lifts the
    entry's lock AND the day's, drops the AI verdict (a review row left behind
    would let the re-close pass silently, the old verdict standing over new
    photos) and cancels live objections to it; the day's report is not recalled
    — a DM cannot be — it corrects itself when the task closes again.
    """
    day = db.query(LeaderTaskDay).filter_by(id=body.day_id).first()
    if day is None:
        raise HTTPException(status_code=404, detail="No such day")
    entry = (db.query(LeaderTaskEntry)
             .filter_by(day_id=day.id, task_id=body.task_id).first())
    if not leader_close.locked(entry, day):
        raise HTTPException(status_code=409, detail="This task is not locked")

    prof = db.query(RoleProfile).filter_by(id=day.leader_id).first()
    actor = _actor(admin)
    lifted = leader_close.reopen_task(db, day=day, task_id=body.task_id,
                                      entry=entry, actor=actor)
    emptied = leader_close.reset_task(db, day, body.task_id) if body.wipe else False
    log.info("leader-tasks: %s %s task %s of day %s (%s) — %s",
             actor, "emptied" if body.wipe else "reopened", body.task_id,
             day.id, day.date, lifted)
    action_log.enrich(
        target_kind="task", target_id=str(body.task_id),
        unit_id=day.manager_id, day=str(day.date),
        details=[("leader", prof.name if prof else f"#{day.leader_id}"),
                 ("day_reopened", bool(lifted["day"])),
                 ("verdict_dropped", bool(lifted["verdict"])),
                 ("disputes_cancelled", lifted["disputes"]),
                 ("emptied", bool(emptied))],
        changes=[("status", "closed", "empty" if body.wipe else "draft")])
    return {**lifted, "emptied": emptied}


def _stream_tg_file(file_id: str) -> StreamingResponse:
    """Pipe one archive-channel file back to the browser.

    THE streamer, shared by the two doors that serve a proof photo — the
    register's media proxy and the admin roll reader below. They differ only in
    WHO may ask; how the bytes travel is one answer, and duplicating it is how
    one of them ends up without the no-store header or the close-on-finish.
    """
    meta = _tg_file_meta(file_id)
    url = f"{_TG_API}/file/bot{settings.telegram_bot_token}/{meta['file_path']}"
    try:
        upstream = requests.get(url, stream=True, timeout=60)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Telegram unreachable: {e}")
    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(status_code=404, detail="File no longer available")

    def _chunks():
        try:
            yield from upstream.iter_content(chunk_size=64 * 1024)
        finally:
            upstream.close()

    headers = {"Content-Disposition": f'inline; filename="{meta["file_name"]}"',
               "Cache-Control": "no-store"}
    if meta["file_size"]:
        headers["Content-Length"] = str(meta["file_size"])
    return StreamingResponse(_chunks(), media_type=meta["mime_type"], headers=headers)


# ── Viewer: proof-photo streaming for the /leaders detail modal ───────────────
# Was admin-only while bot data lived on its own admin page. Shift-2 rows now
# merge into /api/leaders for every role, so the photos have to open with them —
# gated by the page and then re-checked per photo against the row it belongs to,
# because a media id is a bare integer anyone with the page could enumerate.

@router.get("/api/leader-tasks/media/{media_id}")
def leader_task_media(
    media_id: int,
    uid: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    m = db.query(LeaderTaskMedia).filter_by(id=media_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")

    entry = db.query(LeaderTaskEntry).filter_by(id=m.entry_id).first()
    day = db.query(LeaderTaskDay).filter_by(id=entry.day_id).first() if entry else None
    if not day:
        raise HTTPException(status_code=404, detail="Media not found")

    # Two doors, matching the two surfaces that show these photos. The register's
    # detail modal comes through the `leaders` page, as it always did. The day
    # report is AUTH-ONLY by design — the brigadir it is written for often holds
    # no page grant — and passes its `uid`, which authorises the photo against
    # that report's own row scope. Without the second door the report renders its
    # verdicts and 403s every piece of evidence behind them.
    from app.routers.leaders import photo_scope_ok
    ok = page_allowed(db, payload, "leaders") and leader_bot.visible_day(
        db, day, payload, sees_all=page_scope_is_all(db, payload, "leaders")
    )
    if not ok:
        ok = photo_scope_ok(db, payload, uid, lambda row: any(
            media_id in (t.get("media") or []) for t in (row.get("tasks") or [])))
    if not ok:
        # 404, not 403: whether a photo exists is itself somebody else's data.
        raise HTTPException(status_code=404, detail="Media not found")

    return _stream_tg_file(m.file_id)


# ── Viewer: the «Vazifalar» tab of /leaders ───────────────────────────────────
# What each daily task REQUIRES — name, proof type, the definition of done the
# reviewer judges by, weight, min photos, the photo window, the submission
# deadline and the example photos — for the subject the viewer may look at.
# Reference material, not a record: it takes the page grant and resolves WHOSE
# chain to read the same way /api/leaders scopes rows (a leader → their own,
# a supervisor → their unit, everyone else → whatever the page filters name),
# so nobody reads another unit's overrides through a typeable id.

@router.get("/api/leader-tasks/requirements")
def leader_task_requirements(
    leader_id: int | None = Query(None),
    supervisor: str | None = Query(None, max_length=200),
    shift: int | None = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    role = payload.get("role")
    sees_all = page_scope_is_all(db, payload, "leaders")

    def _leader(pid: int | None):
        if pid is None:
            return None
        return db.query(RoleProfile).filter_by(id=pid, role="leader").first()

    if role == "leader" and not sees_all:
        # Own chain only, from any of this person's logins. No resolvable
        # profile ⇒ the global catalog rather than a guess at somebody else's.
        prof = _leader(identity.viewer_leader_profile_id(db, payload))
        return requirements_for(db, prof=prof, shift=shift)

    if role == "supervisor" and not sees_all:
        mid = payload.get("role_id")
        manager = db.query(Manager).filter_by(id=mid).first() if mid else None
        prof = _leader(leader_id)
        # A leader picked from outside the unit is silently the unit's own
        # view — the row scoping the register applies, not a 403 that would
        # confirm the id exists.
        if prof is not None and manager is not None and prof.manager_id == manager.id:
            return requirements_for(db, prof=prof, manager=manager, shift=shift)
        return requirements_for(db, manager=manager, shift=shift)

    # Admin / top-manager / a "see all" grant: the page filters decide.
    prof = _leader(leader_id)
    if prof is not None:
        return requirements_for(db, prof=prof, shift=shift)
    manager = None
    if supervisor:
        # The filter carries the register's (relabelled) sheet spelling of the
        # unit; the same fuzzy matcher /api/leaders uses bridges it to the row.
        managers = db.query(Manager).all()
        hit = supervisor_match(managers, {relabel_supervisor(supervisor)})
        mid = (hit.get(relabel_supervisor(supervisor)) or {}).get("id")
        manager = next((m for m in managers if m.id == mid), None) if mid else None
    return requirements_for(db, manager=manager, shift=shift)


@router.get("/api/leader-tasks/examples/{example_id}")
def leader_task_example(example_id: int, db: Session = Depends(get_db),
                        _: dict = Depends(require_page("leaders"))):
    """An example proof photo for the «Vazifalar» tab. Page-gated only.

    An example may now sit at a supervisor's or a leader's level of the chain,
    but it stays what it always was: an ADMIN-authored picture of what a
    correct proof looks like, carrying nobody's data and proving nothing about
    anybody's day — so there is still no row to scope it to, unlike the media
    streamer above, which serves a leader's own evidence. Which ids a reader is
    handed is already decided for them by `requirements_for`, which resolves
    their own chain."""
    row = db.query(LeaderTaskExample).filter_by(id=example_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No example")
    return Response(
        content=row.data,
        media_type=row.mime or "image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
