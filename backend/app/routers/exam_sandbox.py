"""The exam sandbox API — `/api/exam/sandbox/…`.

While the exam mode is on, the client rewrites every request to a sandboxed
resource (services/exam_sandbox.SANDBOX_PREFIXES) onto this router and sends
`X-Exam-Attempt: <id>`. Each endpoint here answers the SAME shape the real
page reads, over the attempt's own rows in `exam_sandbox_rows`, and nothing
else: no plant scoping, no DMs, no action-log enrich, no real table. The real
routers are byte-for-byte untouched.

Rights mirror what a LEADER holds on the real pages (the contract maps in
docs/plan-dashboard-exam.md): a leader never flames a task, never edits a
brigadir's task, never deletes or sends back a concern, never edits an
ojidaniya row once saved, never rules on an objection. Refusals carry the real
endpoints' own messages, so the pages' error handling reads the same.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_profile_key
from app.models import ExamAttempt
from app.security import require_auth
from app.services import exam, exam_sandbox as sb
from app.services.ojidaniya_matrix import today_local
# The appeal writes' body parser (JSON or multipart) — ONE parser for the real
# endpoints and their sandbox twins, so the composer's request reads the same.
from app.routers.leaders import appeal_body

router = APIRouter(prefix="/api/exam/sandbox", tags=["exam-sandbox"])


# ── the gate ──────────────────────────────────────────────────────────────────

def _gate(request: Request, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    raw = request.headers.get("x-exam-attempt") or ""
    if not raw.isdigit():
        raise HTTPException(status_code=400, detail="No exam attempt on this request")
    at = db.query(ExamAttempt).filter_by(id=int(raw)).first()
    if at is None:
        raise HTTPException(status_code=404, detail="No such exam attempt")
    if at.profile_key != viewer_profile_key(db, payload):
        raise HTTPException(status_code=403, detail="Not your exam attempt")
    if at.status != "running":
        raise HTTPException(status_code=409, detail="This exam attempt is not running")
    ctx = sb.ctx_for(db, at, payload.get("full_name") or "")
    return at, ctx


def _touch(db: Session, at: ExamAttempt) -> None:
    exam.touch(db, at)
    db.commit()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _blank(s: Optional[str]) -> bool:
    return not (s or "").strip()


# ── /tasks ────────────────────────────────────────────────────────────────────

class StatusIn(BaseModel):
    status: str


class CommentIn(BaseModel):
    text: str


@router.get("/tasks/board")
def tasks_board(g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    counts = sb.task_comment_counts(db, at.id)
    rows = [sb.task_row(ctx, r, counts.get(r.id, 0)) for r in sb.rows(db, at.id, "task")]
    return {"role": "leader", "can_create_leader": False, "can_create_brigadir": False, "data": rows}


@router.get("/tasks/leaders")
def tasks_leaders(g=Depends(_gate)):
    return []


@router.get("/brigadir-tasks/brigadirs")
def tasks_brigadirs(g=Depends(_gate)):
    return []


@router.post("/tasks")
def tasks_create(g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Only a supervisor or admin can create a task")


@router.put("/tasks/{task_id}")
def tasks_edit(task_id: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Not your task to edit")


@router.delete("/tasks/{task_id}", status_code=204)
def tasks_delete(task_id: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Not your task to delete")


@router.patch("/tasks/{task_id}/status")
def tasks_status(task_id: int, body: StatusIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if body.status not in ("todo", "doing", "done"):
        raise HTTPException(status_code=400, detail="Invalid status")
    r = sb.get_row(db, at.id, "task", task_id)
    if r is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if r.data.get("status") != body.status:
        changes = {"status": body.status}
        if body.status == "done":
            changes["completed_at"] = _now().isoformat()
            changes["completed_at_days"] = None
        elif r.data.get("status") == "done":
            changes["completed_at"] = None
            changes["completed_at_days"] = None
        sb.put(r, **changes)
    _touch(db, at)
    return sb.task_narrow(ctx, r, sb.task_comment_counts(db, at.id).get(r.id, 0))


@router.patch("/tasks/{task_id}/priority")
def tasks_priority(task_id: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Only a supervisor or admin can change urgency")


def _task_comments(db, at, ctx, task_id):
    return [sb.comment_json(ctx, c, "task_id") for c in sb.rows(db, at.id, "task_comment")
            if c.data.get("task_id") == task_id]


@router.get("/tasks/{task_id}/comments")
def tasks_comments(task_id: int, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if sb.get_row(db, at.id, "task", task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return _task_comments(db, at, ctx, task_id)


@router.post("/tasks/{task_id}/comments")
def tasks_comment_add(task_id: int, body: CommentIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if sb.get_row(db, at.id, "task", task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if _blank(body.text):
        raise HTTPException(status_code=400, detail="Comment text is required")
    c = sb.add(db, at.id, "task_comment", {
        "task_id": task_id, "author_name": ctx.leader_name, "author_profile": ctx.profile_key,
        "text": body.text.strip(), "created_at": _now().isoformat(),
    })
    _touch(db, at)
    return sb.comment_json(ctx, c, "task_id")


def _own_comment(db, at, ctx, kind, parent_key, parent_id, cid):
    c = sb.get_row(db, at.id, kind, cid)
    if c is None or c.data.get(parent_key) != parent_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.data.get("author_profile") != ctx.profile_key:
        raise HTTPException(status_code=403, detail="Only the author profile can modify a comment")
    return c


@router.put("/tasks/{task_id}/comments/{cid}")
def tasks_comment_edit(task_id: int, cid: int, body: CommentIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if _blank(body.text):
        raise HTTPException(status_code=400, detail="Comment text is required")
    c = _own_comment(db, at, ctx, "task_comment", "task_id", task_id, cid)
    sb.put(c, text=body.text.strip(), edited_at=_now().isoformat())
    _touch(db, at)
    return sb.comment_json(ctx, c, "task_id")


@router.delete("/tasks/{task_id}/comments/{cid}", status_code=204)
def tasks_comment_delete(task_id: int, cid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    c = _own_comment(db, at, ctx, "task_comment", "task_id", task_id, cid)
    db.delete(c)
    _touch(db, at)
    return None


# ── /concerns ─────────────────────────────────────────────────────────────────

class ConcernIn(BaseModel):
    cell_code: Optional[str] = None
    category: Optional[str] = None
    concern_owner: Optional[str] = None
    concern_text: str
    status: str = "todo"
    deadline_days: Optional[int] = None
    entry_date: Optional[date] = None
    completion_date: Optional[date] = None
    solution: Optional[str] = None
    leader_profile_id: Optional[int] = None
    leader_ref: Optional[int] = None
    level: Optional[str] = None
    top_manager_profile_id: Optional[int] = None
    shift_manager_profile_id: Optional[int] = None


class EscalateIn(BaseModel):
    direction: str
    reason: str
    top_manager_profile_id: Optional[int] = None
    shift_manager_profile_id: Optional[int] = None


def _concern(db, at, cid):
    r = sb.get_row(db, at.id, "concern", cid)
    if r is None:
        raise HTTPException(status_code=404, detail="Concern not found")
    return r


def _validate_concern(status: str, text: str) -> None:
    if status not in sb.CONCERN_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if _blank(text):
        raise HTTPException(status_code=400, detail="Concern text is required")


def _next_seq(db, at) -> int:
    return max([int(r.data.get("seq") or 0) for r in sb.rows(db, at.id, "concern")] + [0]) + 1


@router.get("/concerns")
def concerns_list(g=Depends(_gate), db: Session = Depends(get_db),
                  status: Optional[str] = None, q: Optional[str] = None):
    at, ctx = g
    counts = sb.concern_counts(db, at.id)
    rows = [sb.concern_row(ctx, r, counts.get(r.id, 0)) for r in sb.rows(db, at.id, "concern")]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if q:
        needle = q.strip().lower()
        rows = [r for r in rows if needle in " ".join(
            str(r.get(k) or "") for k in ("concern_text", "concern_owner", "cell_code")).lower()]
    rows.sort(key=lambda r: (r["entry_date"] or "", r["id"]), reverse=True)
    return {"role": "leader", "picker": None, "read_only": False, "can_pick_leader": False, "data": rows}


@router.get("/concerns/shift-managers")
def concerns_sms(g=Depends(_gate)):
    return []


@router.get("/concerns/top-managers")
def concerns_tms(g=Depends(_gate)):
    return []


@router.get("/concerns/cells")
def concerns_cells(g=Depends(_gate)):
    at, ctx = g
    return [{"cell": c["code"], "leader": ctx.leader_name, "supervisor_id": sb.UNIT_ID,
             "supervisor": sb.BRIGADIR, "supervisor_shift": ctx.shift} for c in sb.CELLS]


@router.post("/concerns/export.xlsx")
def concerns_export(g=Depends(_gate)):
    raise HTTPException(status_code=400, detail="Exports are off in the exam")


@router.post("/concerns")
def concerns_create(body: ConcernIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    _validate_concern(body.status, body.concern_text)
    code = (body.cell_code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="A cell is required")
    if body.category not in sb.CONCERN_CATEGORIES:
        raise HTTPException(status_code=400, detail="A category is required")
    entry = body.entry_date or today_local()
    r = sb.add(db, at.id, "concern", {
        "seq": _next_seq(db, at), "concern_text": body.concern_text.strip(), "status": "todo",
        "level": "supervisor", "category": body.category, "cell_code": code, "worker_name": None,
        "entry_date": entry.isoformat(), "created_at": _now().isoformat(),
        "level_since": _now().isoformat(), "deadline_days": None, "deadline_from": None,
        "completion_date": None, "done_at": None, "escalation_count": 0, "solution": None,
    })
    _touch(db, at)
    return sb.concern_row(ctx, r, 0)


@router.put("/concerns/{cid}")
def concerns_update(cid: int, body: ConcernIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    r = _concern(db, at, cid)
    d = r.data
    rights = sb.concern_rights(d)
    if not rights["can_edit"]:
        raise HTTPException(status_code=403, detail="You can't edit this concern")
    _validate_concern(body.status, body.concern_text)
    was = d.get("status")
    if body.status != was and not rights["can_set_status"]:
        raise HTTPException(status_code=403, detail="Only the responsible person can change the status")
    # The receiver's deadline (2026-09-23): required on the flip INTO doing,
    # movable by the holder while in work, an unchanged value always passes.
    old_days = d.get("deadline_days")
    new_days = body.deadline_days
    into_doing = body.status == "doing" and was != "doing"
    changes: dict = {}
    if into_doing:
        if new_days is None:
            raise HTTPException(status_code=400, detail="Set a deadline to take the concern into work")
        if not 0 <= new_days <= sb.MAX_DEADLINE_DAYS:
            raise HTTPException(status_code=400, detail=f"The deadline must be 0–{sb.MAX_DEADLINE_DAYS} days")
        changes["deadline_from"] = today_local().isoformat()
        changes["deadline_from_days"] = None
    elif new_days != old_days:
        if (d.get("level") or "supervisor") != "leader":
            raise HTTPException(status_code=403, detail="Only the person holding the concern sets its deadline")
        if body.status != "doing":
            raise HTTPException(status_code=400, detail="A deadline is set when the concern is taken into work")
        if new_days is not None and not 0 <= new_days <= sb.MAX_DEADLINE_DAYS:
            raise HTTPException(status_code=400, detail=f"The deadline must be 0–{sb.MAX_DEADLINE_DAYS} days")
    closing = body.status == "done" and was != "done"
    note = (body.solution or "").strip()
    if closing and not note:
        raise HTTPException(status_code=400, detail="A resolution note is required")
    if body.cell_code:
        changes["cell_code"] = body.cell_code.strip()
    if body.category:
        if body.category not in sb.CONCERN_CATEGORIES:
            raise HTTPException(status_code=400, detail="Invalid category")
        changes["category"] = body.category
    changes["concern_text"] = body.concern_text.strip()
    changes["status"] = body.status
    changes["deadline_days"] = new_days
    if body.entry_date:
        changes["entry_date"] = body.entry_date.isoformat()
        changes["entry_date_days"] = None
    if body.status == "done":
        existing = sb.rel_date(d, "completion_date")
        comp = body.completion_date or existing or today_local()
        changes["completion_date"] = comp.isoformat()
        changes["completion_date_days"] = None
        if was != "done":
            changes["done_at"] = _now().isoformat()
            changes["done_at_days"] = None
    else:
        changes.update({"completion_date": None, "completion_date_days": None,
                        "done_at": None, "done_at_days": None})
    if closing:
        changes["solution"] = None
        sb.add(db, at.id, "concern_comment", {
            "concern_id": r.id, "author_name": ctx.leader_name, "author_profile": ctx.profile_key,
            "text": note, "kind": "resolution", "created_at": _now().isoformat(),
        })
    sb.put(r, **changes)
    _touch(db, at)
    return sb.concern_row(ctx, r, sb.concern_counts(db, at.id).get(r.id, 0))


@router.delete("/concerns/{cid}", status_code=204)
def concerns_delete(cid: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Leaders cannot delete concerns")


@router.post("/concerns/{cid}/escalate")
def concerns_escalate(cid: int, body: EscalateIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    r = _concern(db, at, cid)
    d = r.data
    level = d.get("level") or "supervisor"
    if not (level == "leader" and body.direction == "up"):
        raise HTTPException(status_code=403, detail="Leaders can only send back a concern held at their level")
    if not sb.concern_rights(d)["can_edit"]:
        raise HTTPException(status_code=403, detail="You can't edit this concern")
    if _blank(body.reason):
        raise HTTPException(status_code=400, detail="A reason is required")
    if d.get("status") == "done":
        raise HTTPException(status_code=400, detail="A resolved concern cannot be escalated")
    sb.add(db, at.id, "concern_move", {
        "concern_id": r.id, "direction": "up", "from_level": "leader", "to_level": "supervisor",
        "from_name": ctx.leader_name, "target_name": sb.BRIGADIR, "reason": body.reason.strip(),
        "actor_name": ctx.leader_name, "actor_role": "leader", "created_at": _now().isoformat(),
    })
    sb.put(r, level="supervisor", level_since=_now().isoformat(), level_since_days=None,
           escalation_count=int(d.get("escalation_count") or 0) + 1)
    _touch(db, at)
    return sb.concern_row(ctx, r, sb.concern_counts(db, at.id).get(r.id, 0))


@router.get("/concerns/{cid}/history")
def concerns_history(cid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.concern_history(ctx, db, _concern(db, at, cid))


@router.get("/concerns/{cid}/comments")
def concerns_comments(cid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    _concern(db, at, cid)
    return [sb.comment_json(ctx, c, "concern_id") for c in sb.rows(db, at.id, "concern_comment")
            if c.data.get("concern_id") == cid]


@router.post("/concerns/{cid}/comments")
def concerns_comment_add(cid: int, body: CommentIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    _concern(db, at, cid)
    if _blank(body.text):
        raise HTTPException(status_code=400, detail="Comment text is required")
    c = sb.add(db, at.id, "concern_comment", {
        "concern_id": cid, "author_name": ctx.leader_name, "author_profile": ctx.profile_key,
        "text": body.text.strip(), "kind": None, "created_at": _now().isoformat(),
    })
    _touch(db, at)
    return sb.comment_json(ctx, c, "concern_id")


@router.put("/concerns/{cid}/comments/{ccid}")
def concerns_comment_edit(cid: int, ccid: int, body: CommentIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if _blank(body.text):
        raise HTTPException(status_code=400, detail="Comment text is required")
    c = _own_comment(db, at, ctx, "concern_comment", "concern_id", cid, ccid)
    sb.put(c, text=body.text.strip(), edited_at=_now().isoformat())
    _touch(db, at)
    return sb.comment_json(ctx, c, "concern_id")


@router.delete("/concerns/{cid}/comments/{ccid}", status_code=204)
def concerns_comment_delete(cid: int, ccid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    c = sb.get_row(db, at.id, "concern_comment", ccid)
    if c is None or c.data.get("concern_id") != cid:
        raise HTTPException(status_code=404, detail="Comment not found")
    if c.data.get("kind") == "resolution":
        raise HTTPException(status_code=400, detail="The resolution note cannot be deleted")
    if c.data.get("author_profile") != ctx.profile_key:
        raise HTTPException(status_code=403, detail="Only the author profile can modify a comment")
    db.delete(c)
    _touch(db, at)
    return None


# ── /cell-concerns ────────────────────────────────────────────────────────────

class WorkerConcernIn(BaseModel):
    cell_code: str
    worker_name: str
    category: str
    concern_text: str
    deadline_days: Optional[int] = None


@router.get("/cell-concerns/meta")
def cc_meta(g=Depends(_gate)):
    at, ctx = g
    return {
        "cells": [{"code": c["code"], "cell_id": c["cell_id"], "leader_profile_id": ctx.leader_profile_id,
                   "leader_name": ctx.leader_name, "manager_id": sb.UNIT_ID, "brigadir_name": sb.BRIGADIR}
                  for c in sb.CELLS],
        "categories": sorted(sb.CONCERN_CATEGORIES), "role": "leader",
    }


def _worker_rows(db, at, ctx, date_from=None, date_to=None, cell=None, category=None, status=None):
    counts = sb.concern_counts(db, at.id)
    out = []
    for r in sb.rows(db, at.id, "concern"):
        if not sb.is_worker_row(r.data):
            continue
        row = sb.concern_row(ctx, r, counts.get(r.id, 0))
        if date_from and (row["entry_date"] or "") < date_from:
            continue
        if date_to and (row["entry_date"] or "") > date_to:
            continue
        if cell and row["cell_code"] != cell:
            continue
        if category and row["category"] != category:
            continue
        if status and row["status"] != status:
            continue
        out.append(row)
    out.sort(key=lambda r: (r["entry_date"] or "", r["seq"] or 0, r["id"]), reverse=True)
    return out


@router.get("/cell-concerns")
def cc_list(g=Depends(_gate), db: Session = Depends(get_db),
            date_from: Optional[str] = None, date_to: Optional[str] = None,
            cell: Optional[str] = None, category: Optional[str] = None, status: Optional[str] = None):
    at, ctx = g
    rows = _worker_rows(db, at, ctx, date_from, date_to, cell, category, status)
    return {"rows": rows, "cells": [c["code"] for c in sb.CELLS]}


@router.get("/cell-concerns/stats")
def cc_stats(g=Depends(_gate), db: Session = Depends(get_db),
             date_from: Optional[str] = None, date_to: Optional[str] = None,
             cell: Optional[str] = None, category: Optional[str] = None):
    at, ctx = g
    rows = _worker_rows(db, at, ctx, date_from, date_to, cell, category, None)
    today = today_local().isoformat()
    by_status = {"todo": 0, "doing": 0, "done": 0}
    overdue = 0
    days: list[int] = []
    by_cat: dict[str, int] = {}
    by_cell: dict[str, dict] = {}
    by_worker: dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        if r["status"] != "done" and r["due_date"] and r["due_date"] < today:
            overdue += 1
        if r["status"] == "done" and r["resolution_days"] is not None:
            days.append(r["resolution_days"])
        by_cat[r["category"]] = by_cat.get(r["category"], 0) + 1
        c = by_cell.setdefault(r["cell_code"], {"code": r["cell_code"], "todo": 0, "doing": 0, "done": 0, "n": 0})
        c[r["status"]] += 1
        c["n"] += 1
        by_worker[r["worker_name"]] = by_worker.get(r["worker_name"], 0) + 1
    total = len(rows)
    end = date.fromisoformat(date_to) if date_to else today_local()
    trend = []
    for i in range(13, -1, -1):
        d = (end - timedelta(days=i)).isoformat()
        trend.append({"d": d, "filed": sum(1 for r in rows if r["entry_date"] == d),
                      "done": sum(1 for r in rows if r["completion_date"] == d)})
    return {
        "total": total, "by_status": by_status, "overdue": overdue,
        "avg_days": (round(sum(days) / len(days), 1) if days else None),
        "resolved_pct": (round(by_status["done"] * 100 / total) if total else 0),
        "workers": len(by_worker),
        "by_category": sorted([{"key": k, "n": n} for k, n in by_cat.items()], key=lambda x: -x["n"]),
        "by_cell": sorted(by_cell.values(), key=lambda x: -x["n"]),
        "by_worker": sorted([{"name": k, "n": n} for k, n in by_worker.items()], key=lambda x: -x["n"]),
        "trend": trend,
    }


@router.post("/cell-concerns")
def cc_create(body: WorkerConcernIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    worker = " ".join((body.worker_name or "").split())[:120]
    text = (body.concern_text or "").strip()
    if not worker:
        raise HTTPException(status_code=400, detail="Ismingizni yozing")
    if not text:
        raise HTTPException(status_code=400, detail="Havotiringizni yozing")
    if len(text) > 4000:
        raise HTTPException(status_code=400, detail="Havotir matni juda uzun")
    if body.category not in sb.CONCERN_CATEGORIES:
        raise HTTPException(status_code=400, detail="Bo'limni tanlang")
    code = (body.cell_code or "").strip()
    if code not in {c["code"] for c in sb.CELLS}:
        raise HTTPException(status_code=400, detail="Yacheyka tanlanmagan yoki sizga tegishli emas")
    r = sb.add(db, at.id, "concern", {
        "seq": _next_seq(db, at), "concern_text": text, "status": "todo", "level": "leader",
        "category": body.category, "cell_code": code, "worker_name": worker,
        "entry_date": today_local().isoformat(), "created_at": _now().isoformat(),
        "level_since": _now().isoformat(), "deadline_days": None, "deadline_from": None,
        "completion_date": None, "done_at": None, "escalation_count": 0, "solution": None,
    })
    _touch(db, at)
    return sb.concern_row(ctx, r, 0)


# ── /idle-cell ────────────────────────────────────────────────────────────────

class IntervalIn(BaseModel):
    cell_id: int
    date: str
    category: str
    start: str
    end: str
    stopped: bool = True
    note: str
    client_key: Optional[str] = None


_DAY = {"state": "open", "closed": False, "closed_by": None, "closed_at": None,
        "can_reopen": False, "can_write": True}


@router.get("/idle-cell/supervisors")
def idle_supervisors(g=Depends(_gate)):
    at, ctx = g
    return [{"id": sb.UNIT_ID, "name": sb.UNIT_NAME, "shift": ctx.shift}]


@router.get("/idle-cell/cells")
def idle_cells(supervisor_id: int = Query(...), day_iso: str = Query(..., alias="date"),
               g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    if supervisor_id != sb.UNIT_ID:
        return {"cells": []}
    try:
        day = date.fromisoformat(day_iso)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    return {"day": dict(_DAY), "cells": [sb.cell_json(ctx, db, c, day) for c in sb.CELLS],
            "cat_locked": None}



@router.get("/idle-cell/day-summary")
def idle_day_summary(g=Depends(_gate)):
    return {"entries": [], "leader_entries": [], "cells": []}


@router.post("/idle-cell/intervals")
def idle_create(body: IntervalIn, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    try:
        day = date.fromisoformat(body.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date")
    if body.category not in sb.IDLE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    if _blank(body.note):
        raise HTTPException(status_code=400, detail="A reason is required")
    s, e = sb._to_min(body.start), sb._to_min(body.end)
    if s is None or e is None:
        raise HTTPException(status_code=400, detail="Invalid time")
    if s == e:
        raise HTTPException(status_code=400, detail="The end must differ from the start")
    if day > today_local():
        raise HTTPException(status_code=400, detail="Cannot file a future date")
    if body.cell_id not in {c["cell_id"] for c in sb.CELLS}:
        raise HTTPException(status_code=403, detail="This cell is not in your scope")
    stopped = True if body.category in sb.ALWAYS_STOPPED else bool(body.stopped)
    r = sb.add(db, at.id, "idle", {
        "cell_id": body.cell_id, "date": day.isoformat(), "category": body.category,
        "start": f"{s // 60:02d}:{s % 60:02d}", "end": f"{e // 60:02d}:{e % 60:02d}",
        "stopped": stopped, "note": body.note.strip(), "created_at": _now().isoformat(),
        "entered_by": ctx.profile_key, "entered_by_name": ctx.leader_name,
    })
    _touch(db, at)
    return sb.interval_json(r)


@router.put("/idle-cell/intervals/{iid}")
def idle_edit(iid: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Only the unit's brigadir may edit this entry")


@router.delete("/idle-cell/intervals/{iid}", status_code=204)
def idle_delete(iid: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Only the unit's brigadir may delete this entry")


@router.delete("/idle-cell/{eid}", status_code=204)
def idle_delete_legacy(eid: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Only the unit's brigadir may retire a legacy row")


# ── /leaders — the register, verdicts, report · objections · late proofs ────

@router.get("/leaders")
def leaders_register(g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.register_payload(ctx, db)


@router.get("/leader-ai/report")
def leaders_ai_report(uid: str = Query(...), g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.ai_report(ctx, db, uid)


@router.get("/leaders/report/{uid}")
def leaders_report(uid: str, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.day_report(ctx, db, sb.report_days_ago(uid))


@router.post("/leaders/report/{uid}/dispute")
def leaders_dispute(uid: str, parsed: dict = Depends(appeal_body), g=Depends(_gate),
                    db: Session = Depends(get_db)):
    """The objection is the opening message of its chat (2026-09-26): JSON from
    an older bundle, multipart from the chat composer. Files are not kept in
    the exam — the sandbox stores no bytes."""
    at, ctx = g
    body = parsed.get("fields") or {}
    if parsed.get("files"):
        raise HTTPException(status_code=400, detail="Files cannot be attached during the exam")
    reason = str(body.get("reason") or "").strip()
    tid = body.get("task_id")
    if not isinstance(tid, int):
        try:
            tid = int(tid)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="task_id must be an integer")
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="A reason is required")
    if len(reason) > 1000:
        raise HTTPException(status_code=400, detail="Reason is too long")
    if not 1 <= tid <= 13:
        raise HTTPException(status_code=404, detail="No such task on this report")
    if tid != sb.REPORT_REJECTED_TASK:
        raise HTTPException(status_code=409, detail="This task was not rejected")
    if any(r.data.get("task_id") == tid and r.data.get("status") in ("supervisor", "admin")
           for r in sb.leader_dispute_rows(db, at.id)):
        raise HTTPException(status_code=409, detail="Already awaiting a decision")
    row = sb.add(db, at.id, "dispute", {
        "task_id": tid, "status": "supervisor", "reason": reason, "byRole": "leader",
        "created_at": _now().isoformat(), "date_days": 1, "sup": None,
        "decidedBy": None, "decidedAt": None, "note": "",
    })
    _touch(db, at)
    return {"ok": True, "status": "supervisor", "id": row.id, "report": sb.day_report(ctx, db)}


@router.get("/leaders/disputes")
def leaders_disputes(g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.disputes_payload(ctx, db)


@router.post("/leaders/disputes/{did}/decide")
@router.post("/leaders/disputes/{did}/undo")
def leaders_dispute_rule(did: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Not yours to decide")


@router.get("/leaders/late-proofs")
def leaders_late_proofs(g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    return sb.late_proofs_payload(ctx, db)


@router.post("/leaders/late-proofs/{lid}/decide")
@router.post("/leaders/late-proofs/{lid}/undo")
def leaders_late_proof_rule(lid: int, g=Depends(_gate)):
    raise HTTPException(status_code=403, detail="Not yours to decide")


# ── the appeal chat (2026-09-26) ─────────────────────────────────────────────
# The fixture objections and the fixture late proof open into a chat exactly as
# the real ones do. Their filing and rulings are entries synthesised from the
# fixture's own fields (negative ids — never a stored row); what the examinee
# writes is an `appeal_msg` row of this attempt. A leader is a party, so they
# may write while the item is still with somebody; nobody else is here to
# answer, and no file is ever stored.

_OPEN = ("supervisor", "admin")


def _appeal_item(ctx, db: Session, thread: str, rid: int) -> dict:
    items = (sb.disputes_payload(ctx, db) if thread == "dispute"
             else sb.late_proofs_payload(ctx, db))["items"]
    it = next((i for i in items if int(i.get("id") or 0) == int(rid)), None)
    if it is None:
        raise HTTPException(status_code=404, detail="Not found")
    return it


def _appeal_rows(db: Session, at, thread: str, rid: int):
    return [r for r in sb.rows(db, at.id, "appeal_msg")
            if r.data.get("thread") == thread and int(r.data.get("thread_id") or 0) == int(rid)]


def _appeal_wire(r, ctx, writable: bool) -> dict:
    d = r.data
    return {"id": r.id, "kind": "message", "text": d.get("text") or "",
            "author_name": ctx.leader_name, "author_role": "leader",
            "created_at": sb.iso(sb.rel_dt(d, "created_at")),
            "edited_at": d.get("edited_at"), "is_own": True,
            "can_edit": writable, "files": []}


def _appeal_synth(it: dict, ctx, thread: str) -> list[dict]:
    out = [{"id": -1, "kind": "filed", "text": it.get("reason") or "",
            "author_name": ctx.leader_name, "author_role": "leader",
            "created_at": it.get("at"), "edited_at": None, "is_own": True,
            "can_edit": False, "files": []}]
    sup = it.get("sup")
    if sup and sup.get("action"):
        out.append({"id": -2, "kind": "uplifted" if sup["action"] == "uplifted" else "sup_rejected",
                    "text": sup.get("note") or "", "author_name": sup.get("by") or sb.BRIGADIR,
                    "author_role": "supervisor", "created_at": sup.get("at"),
                    "edited_at": None, "is_own": False, "can_edit": False, "files": []})
    if thread == "dispute" and it.get("status") in ("approved", "rejected") and it.get("decidedBy"):
        out.append({"id": -3, "kind": it["status"], "text": it.get("note") or "",
                    "author_name": it.get("decidedBy"), "author_role": "admin",
                    "created_at": it.get("decidedAt"), "edited_at": None,
                    "is_own": False, "can_edit": False, "files": []})
    return out


def _appeal_thread(thread: str, rid: int, g, db: Session):
    at, ctx = g
    it = _appeal_item(ctx, db, thread, rid)
    if thread == "dispute":
        it = {**it, "photos": []}
    n = len(_appeal_rows(db, at, thread, rid))
    it["chat"] = {"count": n + len(_appeal_synth(it, ctx, thread)), "last": None, "unread": 0}
    return {"thread": thread, "item": it, "canWrite": it.get("status") in _OPEN,
            "canSupervise": False, "canDecide": False, "canUndo": False,
            "open": it.get("status") in _OPEN}


def _appeal_list(thread: str, rid: int, g, db: Session):
    at, ctx = g
    it = _appeal_item(ctx, db, thread, rid)
    writable = it.get("status") in _OPEN
    return (_appeal_synth(it, ctx, thread)
            + [_appeal_wire(r, ctx, writable) for r in _appeal_rows(db, at, thread, rid)])


def _appeal_post(thread: str, rid: int, parsed: dict, g, db: Session):
    at, ctx = g
    it = _appeal_item(ctx, db, thread, rid)
    if it.get("status") not in _OPEN:
        raise HTTPException(status_code=409, detail="This conversation is closed — the ruling is final")
    if parsed.get("files"):
        raise HTTPException(status_code=400, detail="Files cannot be attached during the exam")
    text = str((parsed.get("fields") or {}).get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Write a message or attach a file")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="The message is too long")
    r = sb.add(db, at.id, "appeal_msg", {"thread": thread, "thread_id": int(rid), "text": text,
                                          "created_at": _now().isoformat()})
    _touch(db, at)
    return _appeal_wire(r, ctx, True)


def _appeal_own(thread: str, rid: int, mid: int, g, db: Session):
    at, ctx = g
    it = _appeal_item(ctx, db, thread, rid)
    r = next((x for x in _appeal_rows(db, at, thread, rid) if x.id == mid), None)
    if r is None:
        raise HTTPException(status_code=404, detail="Not found")
    if it.get("status") not in _OPEN:
        raise HTTPException(status_code=409, detail="This conversation is closed — the ruling is final")
    return at, ctx, r


@router.get("/leaders/disputes/{rid}/thread")
def sb_dispute_thread(rid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    return _appeal_thread("dispute", rid, g, db)


@router.get("/leaders/late-proofs/{rid}/thread")
def sb_late_thread(rid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    return _appeal_thread("late", rid, g, db)


@router.get("/leaders/disputes/{rid}/messages")
def sb_dispute_messages(rid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    return _appeal_list("dispute", rid, g, db)


@router.get("/leaders/late-proofs/{rid}/messages")
def sb_late_messages(rid: int, g=Depends(_gate), db: Session = Depends(get_db)):
    return _appeal_list("late", rid, g, db)


@router.post("/leaders/disputes/{rid}/messages")
def sb_dispute_post(rid: int, parsed: dict = Depends(appeal_body), g=Depends(_gate),
                    db: Session = Depends(get_db)):
    return _appeal_post("dispute", rid, parsed, g, db)


@router.post("/leaders/late-proofs/{rid}/messages")
def sb_late_post(rid: int, parsed: dict = Depends(appeal_body), g=Depends(_gate),
                 db: Session = Depends(get_db)):
    return _appeal_post("late", rid, parsed, g, db)


@router.put("/leaders/disputes/{rid}/messages/{mid}")
@router.put("/leaders/late-proofs/{rid}/messages/{mid}")
def sb_appeal_put(request: Request, rid: int, mid: int, body: dict = Body(...), g=Depends(_gate),
                  db: Session = Depends(get_db)):
    thread = "dispute" if "/disputes/" in request.url.path else "late"
    at, ctx, r = _appeal_own(thread, rid, mid, g, db)
    text = str(body.get("text") or "").strip()
    if not text:
        raise HTTPException(status_code=409, detail="A message cannot be empty")
    sb.put(r, text=text[:2000], edited_at=_now().isoformat())
    _touch(db, at)
    return _appeal_wire(r, ctx, True)


@router.delete("/leaders/disputes/{rid}/messages/{mid}")
@router.delete("/leaders/late-proofs/{rid}/messages/{mid}")
def sb_appeal_delete(request: Request, rid: int, mid: int, g=Depends(_gate),
                     db: Session = Depends(get_db)):
    thread = "dispute" if "/disputes/" in request.url.path else "late"
    at, ctx, r = _appeal_own(thread, rid, mid, g, db)
    db.delete(r)
    _touch(db, at)
    return {"ok": True}


@router.get("/leaders/disputes/{rid}/files/{fid}")
@router.get("/leaders/late-proofs/{rid}/files/{fid}")
@router.post("/leaders/disputes/{rid}/files/{fid}/send")
@router.post("/leaders/late-proofs/{rid}/files/{fid}/send")
def sb_appeal_file(rid: int, fid: int, g=Depends(_gate)):
    raise HTTPException(status_code=404, detail="Not found")


# ── the bell ──────────────────────────────────────────────────────────────────

@router.get("/notifications")
def notifications(lang: Optional[str] = None, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    l = lang if lang in sb.LANGS else "uz"
    rows = [sb.notification_json(r, l) for r in sb.rows(db, at.id, "notification")]
    rows.sort(key=lambda r: r["created_at"] or "", reverse=True)
    return rows


# ── ui-prefs ──────────────────────────────────────────────────────────────────

@router.get("/ui-prefs/{pref_key}")
def ui_pref_get(pref_key: str, g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    for r in sb.rows(db, at.id, "ui_pref"):
        if r.data.get("key") == pref_key:
            return {"value": r.data.get("value")}
    return {"value": None}


@router.put("/ui-prefs/{pref_key}")
def ui_pref_put(pref_key: str, body: dict = Body(...), g=Depends(_gate), db: Session = Depends(get_db)):
    at, ctx = g
    row = next((r for r in sb.rows(db, at.id, "ui_pref") if r.data.get("key") == pref_key), None)
    if row is None:
        sb.add(db, at.id, "ui_pref", {"key": pref_key, "value": body.get("value")})
    else:
        sb.put(row, value=body.get("value"))
    db.commit()
    return {"ok": True}
