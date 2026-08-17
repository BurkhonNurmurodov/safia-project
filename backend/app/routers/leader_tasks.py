"""In-bot leader daily-checklist config + media.

Admin side (/admin/leader-tasks/*): the supervisors × tasks config matrix
(enabled / min photos / weight per cell, column-wide overwrite, per-language
task names) and the archive-channel setting, driving the bot's /tasks flow.

Viewer side (/api/leader-tasks/media/…): streams a proof photo from Telegram
for the /leaders detail modal — page-access gated with the same row scoping as
/api/leaders (supervisor → own unit, leader → own rows).
"""
import logging
from io import BytesIO

import requests
from fastapi import (APIRouter, Depends, File, Form, HTTPException, Query,
                     Response, UploadFile)
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all
from app.config import settings
from app.database import get_db
from app.models import (
    AppSetting, LeaderAiReview, LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskExample, LeaderTaskLeaderSetting, LeaderTaskMedia,
    LeaderTaskSetting, Manager, RoleProfile,
)
from app.permissions import page_allowed, require_page
from app.security import require_auth
from app.upload_guard import validate_avatar
from app.routers.admin import _TG_API, _tg_file_meta, verify_admin
from app.services import leader_ai, leader_bot
from app.services.leader_tasks import (
    CHANNEL_SETTING_KEY, audit_list, cancel_pending, channel_chat_id,
    effective_date, effective_settings, ensure_task_defs, leader_overrides,
    next_effective_date, pending_list, promote_all_shifts, requirements_for,
    revert_audit, set_criteria, set_date_check, set_deadline, set_window,
    write_change,
)
from app.services.name_map import relabel_supervisor, supervisor_match

router = APIRouter(tags=["leader-tasks"])
log = logging.getLogger(__name__)

_LANGS = ("uz", "uz_cyrl", "ru", "en")


# ── Admin: config matrix ──────────────────────────────────────────────────────

def _actor(admin: dict) -> str | None:
    return admin.get("profile_key") or admin.get("name") or admin.get("sub")


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
    # Example-proof photo ids per task — ids only, the bytes stream from
    # /admin/leader-tasks/examples/{id} when the modal actually shows them.
    examples: dict[int, list[int]] = {}
    for eid, tid in (db.query(LeaderTaskExample.id, LeaderTaskExample.task_id)
                     .order_by(LeaderTaskExample.id).all()):
        examples.setdefault(tid, []).append(eid)
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
                # Global "is the date checked at all". Never null at this level —
                # it is the floor of the chain (startup.add_leader_task_date_check
                # fills it), so the UI shows a two-way toggle here and a
                # three-way one (inherit) at the levels below.
                "date_check": td.date_check is not False,
                "examples": examples.get(td.id, []),
                "default_weight": td.default_weight,
            }
            for td in defs
        ],
        "managers": [{"id": m.id, "name": m.name, "shift": m.shift} for m in managers],
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
    if not db.query(Manager).filter_by(id=cell.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if not db.query(LeaderTaskDef).filter_by(id=cell.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    payload = {"manager_id": cell.manager_id, "cells": [{
        "task_id": cell.task_id, "enabled": cell.enabled,
        "min_media": cell.min_media, "weight": cell.weight, "names": cell.names,
    }]}
    return write_change(db, "supervisor", payload, cell.when, _actor(admin))


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
    if not db.query(RoleProfile).filter_by(id=cell.leader_id, role="leader").first():
        raise HTTPException(status_code=404, detail="Unknown leader")
    if not db.query(LeaderTaskDef).filter_by(id=cell.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    payload = {
        "leader_id": cell.leader_id, "task_id": cell.task_id,
        "enabled": cell.enabled, "min_media": cell.min_media, "weight": cell.weight,
        "names": cell.names, "reset": cell.reset,
    }
    return write_change(db, "leader", payload, cell.when, _actor(admin))


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
    if not db.query(Manager).filter_by(id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    payload = {"manager_id": body.manager_id, "cells": [
        {"task_id": c.task_id, "enabled": c.enabled, "min_media": c.min_media,
         "weight": c.weight, "names": c.names}
        for c in body.cells
    ]}
    return write_change(db, "supervisor", payload, body.when, _actor(admin))


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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    if body.manager_ids is not None or body.leader_ids is not None:
        return _scoped_rename(db, body, _actor(admin))
    payload = {"task_id": body.task_id, "names": body.names, "note": body.note,
               "default_weight": body.default_weight}
    return write_change(db, "global_task", payload, body.when, _actor(admin))


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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    actor = _actor(admin)

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
        return {"ok": True, "count": len(ids), "level": "leader",
                "applied": body.when}

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
    return {"ok": True, "count": len(managers), "level": "supervisor",
            "applied": body.when}


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
    for m in db.query(Manager).filter(Manager.archived.is_(False)).all():
        _upsert(db, m.id, col.task_id, col.enabled, mm, w)
    db.commit()
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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
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
        return {"ok": True, "count": len(ids)}
    if body.manager_id is not None and not db.query(Manager).filter_by(
            id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if body.leader_id is not None and not db.query(RoleProfile).filter_by(
            id=body.leader_id).first():
        raise HTTPException(status_code=404, detail="Unknown leader")
    set_criteria(db, task_id=body.task_id, criteria=body.criteria,
                 manager_id=body.manager_id, leader_id=body.leader_id)
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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    win = {"win_from": body.win_from, "win_to": body.win_to}
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
        return {"ok": True, "count": len(ids)}
    if body.manager_id is not None and not db.query(Manager).filter_by(
            id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if body.leader_id is not None and not db.query(RoleProfile).filter_by(
            id=body.leader_id).first():
        raise HTTPException(status_code=404, detail="Unknown leader")
    set_window(db, task_id=body.task_id, manager_id=body.manager_id,
               leader_id=body.leader_id, **win)
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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
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
        return {"ok": True, "count": len(ids)}
    if body.manager_id is not None and not db.query(Manager).filter_by(
            id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if body.leader_id is not None and not db.query(RoleProfile).filter_by(
            id=body.leader_id).first():
        raise HTTPException(status_code=404, detail="Unknown leader")
    set_deadline(db, task_id=body.task_id, deadline=body.deadline,
                 manager_id=body.manager_id, leader_id=body.leader_id)
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
    if not db.query(LeaderTaskDef).filter_by(id=body.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    if body.leader_ids is not None or body.manager_ids is not None:
        if body.leader_ids is not None:
            ids = [i for (i,) in db.query(RoleProfile.id).filter(
                RoleProfile.id.in_(body.leader_ids),
                RoleProfile.role == "leader").all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for lid in ids:
                set_date_check(db, task_id=body.task_id, date_check=body.date_check,
                               leader_id=lid, rejudge=False)
        else:
            ids = [i for (i,) in db.query(Manager.id).filter(
                Manager.id.in_(body.manager_ids),
                Manager.archived.is_(False)).all()]
            if not ids:
                raise HTTPException(status_code=400, detail="no_rows")
            for mid in ids:
                set_date_check(db, task_id=body.task_id, date_check=body.date_check,
                               manager_id=mid, rejudge=False)
        # Once, after the whole fan-out — the re-derivation is per task, not per
        # row written (same reason as put_window).
        leader_ai.sync_date_flags(db, [body.task_id])
        return {"ok": True, "count": len(ids)}
    if body.manager_id is not None and not db.query(Manager).filter_by(
            id=body.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if body.leader_id is not None and not db.query(RoleProfile).filter_by(
            id=body.leader_id).first():
        raise HTTPException(status_code=404, detail="Unknown leader")
    set_date_check(db, task_id=body.task_id, date_check=body.date_check,
                   manager_id=body.manager_id, leader_id=body.leader_id)
    return {"ok": True}


# ── Admin: example proof photos (AI reference images) ────────────────────────
# Optional per-task EXAMPLES of a correct proof, shown to the AI reviewer
# beside the written criteria (services/leader_ai.py sends them in front of the
# proof photos) AND to leaders on the /leaders «Vazifalar» tab (the viewer
# endpoint further down). Global per task like note_*, and — like criteria —
# they apply at once: nothing here stages.

_EXAMPLE_MAX_BYTES = 10 * 1024 * 1024
_EXAMPLES_PER_TASK = 3
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
                 db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    if db.query(LeaderTaskExample).filter_by(task_id=task_id).count() >= _EXAMPLES_PER_TASK:
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
    row = LeaderTaskExample(task_id=task_id, mime="image/jpeg", data=buf.getvalue())
    db.add(row)
    db.commit()
    return {"ok": True, "id": row.id}


@router.delete("/admin/leader-tasks/examples/{example_id}")
def delete_example(example_id: int, db: Session = Depends(get_db),
                   _: dict = Depends(verify_admin)):
    row = db.query(LeaderTaskExample).filter_by(id=example_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No example")
    db.delete(row)
    db.commit()
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
    return {"ok": True}


# ── Admin: archive channel ────────────────────────────────────────────────────

class ChannelIn(BaseModel):
    chat_id: str


@router.put("/admin/leader-tasks/channel")
def put_channel(body: ChannelIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    chat_id = body.chat_id.strip()
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    if not chat_id:  # clear
        if row:
            db.delete(row)
            db.commit()
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
    return {"ok": True, "chat_id": chat_id}


# ── Admin: bot-submission register + clear tool ───────────────────────────────
# The dashboard itself reads bot days through /api/leaders (merged with the
# sheet). These two endpoints exist for the «Tozalash» tab on the Shift 2
# monitoring page: they list the raw submissions and delete the ones the admin
# picked — test runs, wrong-day answers, a leader who filed for someone else.
#
# CLOSED days only, deliberately: an open day is a leader mid-checklist, and
# pulling the table out from under a running /tasks flow would strand them. A
# bygone open day auto-closes on that leader's next /tasks and becomes
# deletable then.

@router.get("/admin/leader-tasks/submissions")
def list_submissions(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Every closed bot day plus what deleting it would take away (task
    answers, proof photos), and the units/leaders that actually filed — so the
    tab's pickers only ever offer values that match something."""
    days = leader_bot.closed_days(db, shift=None)
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

    rows = []
    for d in days:
        prof = profs.get(d.leader_id)
        mgr = mgrs.get(d.manager_id)
        entries = by_day.get(d.id, [])
        rows.append({
            "id": d.id,
            "date": d.date,
            "leader_id": d.leader_id,
            "leader": prof.name if prof else f"#{d.leader_id}",
            "manager_id": d.manager_id,
            "supervisor": mgr.name if mgr else "N/A",
            "shift": mgr.shift if mgr else None,
            "tasks": len(entries),
            "done": sum(1 for e in entries if e.done),
            "media": sum(len(media_by_entry.get(e.id, [])) for e in entries),
            "completion": float(d.completion or 0),
            "closed_at": d.closed_at.isoformat() if d.closed_at else None,
        })
    rows.sort(key=lambda r: (str(r["date"]), r["leader"]), reverse=True)

    # Pickers, built from what's actually in the register.
    sup_ids = {r["manager_id"] for r in rows}
    lead_ids = {r["leader_id"] for r in rows}
    return {
        "rows": rows,
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
    return {"days": n_days, "entries": n_entries, "media": n_media, "reviews": n_rev}


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

    meta = _tg_file_meta(m.file_id)
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
    """An example proof photo for the «Vazifalar» tab. Page-gated only — the
    examples are global per task and carry nobody's data, so there is no row to
    scope them to (unlike the media streamer above)."""
    row = db.query(LeaderTaskExample).filter_by(id=example_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="No example")
    return Response(
        content=row.data,
        media_type=row.mime or "image/jpeg",
        headers={"Cache-Control": "private, max-age=31536000, immutable"},
    )
