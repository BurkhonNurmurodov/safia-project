"""The dashboard exam — the leader's endpoints (`/api/exam/…`) and the admin's
(`/admin/exam/…`). The lifecycle lives in services/exam.py, the checkers in
services/exam_check.py, the sandbox in routers/exam_sandbox.py.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.capabilities import CAP_EXAM_MANAGE, require_cap
from app.database import get_db
from app.identity import profile_holders, viewer_profile_key
from app.models import ExamAttempt, ExamEvent, ExamTaskResult, Manager, RoleProfile
from app.security import require_auth
from app.services import action_log, exam, exam_bank, exam_check, exam_sandbox as sb
from app.services.ojidaniya_matrix import today_local

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/exam", tags=["exam"])
admin_router = APIRouter(prefix="/admin/exam", tags=["exam-admin"])

EXAM_ROLES = ("leader",)       # who sits it; supervisors read their unit


# ── helpers ───────────────────────────────────────────────────────────────────

def _me(db: Session, payload: dict) -> str:
    key = viewer_profile_key(db, payload)
    if not key:
        raise HTTPException(status_code=403, detail="No profile on this session")
    return key


def _attempt(db: Session, payload: dict, attempt_id: int) -> ExamAttempt:
    at = db.query(ExamAttempt).filter_by(id=attempt_id).first()
    if at is None:
        raise HTTPException(status_code=404, detail="No such exam attempt")
    if at.profile_key != _me(db, payload):
        raise HTTPException(status_code=403, detail="Not your exam attempt")
    return at


def _running(db: Session, payload: dict, attempt_id: int) -> ExamAttempt:
    at = _attempt(db, payload, attempt_id)
    if at.status != "running":
        raise HTTPException(status_code=409, detail="This exam attempt is not running")
    return at


def _app_version(request: Request, body: Optional[dict] = None) -> str:
    return str((body or {}).get("app_version") or request.headers.get("x-app-version") or "")


def _lang(payload: dict, body: Optional[dict] = None, q: Optional[str] = None) -> str:
    l = (body or {}).get("lang") or q or payload.get("language") or "uz"
    return l if l in sb.LANGS else "uz"


def _unit_rows(db: Session, manager_id: int) -> list[dict]:
    out = []
    profs = db.query(RoleProfile).filter_by(role="leader", manager_id=manager_id).order_by(RoleProfile.name).all()
    for p in profs:
        at = exam.latest_exam(db, f"leader:{p.id}")
        out.append({
            "profile_key": f"leader:{p.id}", "leader": p.name,
            "attempt": ({"id": at.id, "status": at.status, "score_pct": at.score_pct, "passed": at.passed,
                         "deadline": at.deadline.isoformat() if at.deadline else None,
                         "submitted_at": at.submitted_at.isoformat() if at.submitted_at else None}
                        if at else None),
        })
    return out


def _badge(db: Session, key: str) -> Optional[dict]:
    if not exam.badge_on(db):
        return None
    at = (db.query(ExamAttempt)
          .filter(ExamAttempt.profile_key == key, ExamAttempt.kind == "exam", ExamAttempt.passed.is_(True))
          .order_by(ExamAttempt.submitted_at.desc()).first())
    if at is None:
        return None
    return {"date": at.submitted_at.date().isoformat() if at.submitted_at else None, "score_pct": at.score_pct}


# ── /api/exam/me ──────────────────────────────────────────────────────────────

@router.get("/me")
def me(db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    role = payload.get("role")
    key = viewer_profile_key(db, payload)
    out: dict[str, Any] = {
        "role": role, "profile_key": key, "can_sit": role in EXAM_ROLES,
        "sandbox_prefixes": sb.SANDBOX_PREFIXES, "parked_keys": sb.PARKED_KEYS,
        "pass_mark": exam.pass_mark(db), "badge": None, "attempt": None, "practice": None, "unit": None,
        "task_count": len(exam_bank.enabled_tasks(exam.disabled_tasks(db))),
    }
    if key:
        at = exam.latest_exam(db, key)
        out["attempt"] = exam.attempt_json(db, at) if at else None
        pr = exam.open_attempt(db, key, "practice")
        out["practice"] = exam.attempt_json(db, pr) if pr else None
        out["badge"] = _badge(db, key)
    if role == "supervisor" and payload.get("role_id"):
        out["unit"] = _unit_rows(db, int(payload["role_id"]))
    return out


# ── attempts ──────────────────────────────────────────────────────────────────

@router.post("/attempts/{attempt_id}/start")
def start(attempt_id: int, request: Request, body: dict = Body(default={}),
          db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    at = _attempt(db, payload, attempt_id)
    if at.status not in exam.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="This exam attempt is closed")
    if at.deadline and at.deadline < today_local():
        exam.expire_overdue(db, today_local())
        db.commit()
        raise HTTPException(status_code=409, detail="The deadline has passed")
    was = at.status
    exam.start(db, at, payload, _app_version(request, body))
    db.commit()
    if was == "assigned":
        action_log.enrich(target_kind="exam", target_id=at.id, target_name=at.profile_key,
                          details=[("kind", at.kind), ("tasks", at.task_count)])
    return exam.attempt_json(db, at)


class CurrentIn(BaseModel):
    task_key: Optional[str] = None
    path: Optional[str] = None
    ui: Optional[dict] = None


@router.post("/live/{attempt_id}/current")
def set_current(attempt_id: int, body: CurrentIn, db: Session = Depends(get_db),
                payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    if body.task_key is not None:
        if body.task_key not in exam.result_map(db, at.id):
            raise HTTPException(status_code=404, detail="No such task on this attempt")
        exam.reopen(db, at, body.task_key)
    exam.set_current(db, at, body.task_key)
    if body.ui is not None:
        db.add(ExamEvent(attempt_id=at.id, kind="ui", path=body.path, payload={"ui": body.ui}))
    db.commit()
    return {"ok": True, "current_task": at.current_task}


class EventIn(BaseModel):
    kind: str
    path: Optional[str] = None
    ui: Optional[dict] = None


@router.post("/live/{attempt_id}/events")
def events(attempt_id: int, body: EventIn, db: Session = Depends(get_db),
           payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    if body.kind not in ("visit", "ui", "mode"):
        raise HTTPException(status_code=400, detail="Unknown event kind")
    db.add(ExamEvent(attempt_id=at.id, kind=body.kind, path=(body.path or "")[:300],
                     payload={"ui": body.ui} if body.ui is not None else None))
    exam.touch(db, at)
    db.commit()
    return {"ok": True}


@router.post("/live/{attempt_id}/check")
def check(attempt_id: int, request: Request, body: dict = Body(default={}),
          db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    key = body.get("task_key") or at.current_task
    if not key:
        return {"passed": False, "status": None, "counts": exam.counts(exam.results(db, at.id))}
    if body.get("ui") is not None:
        db.add(ExamEvent(attempt_id=at.id, kind="ui", path=body.get("path"), payload={"ui": body["ui"]}))
        db.flush()
    res = exam.check(db, at, key, payload, answer=body.get("answer"),
                     app_version=_app_version(request, body), lang=_lang(payload, body))
    nxt = None
    if res.get("passed") and at.current_task == key:
        nxt = exam.next_open(exam.results(db, at.id), key)
    db.commit()
    return {**res, "task_key": key, "next": nxt, "counts": exam.counts(exam.results(db, at.id))}


@router.post("/live/{attempt_id}/skip")
def skip(attempt_id: int, body: dict = Body(default={}), db: Session = Depends(get_db),
         payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    key = body.get("task_key") or at.current_task
    if not key or key not in exam.result_map(db, at.id):
        raise HTTPException(status_code=404, detail="No such task on this attempt")
    nxt = exam.skip(db, at, key)
    db.commit()
    return {"ok": True, "next": nxt, "counts": exam.counts(exam.results(db, at.id))}


@router.post("/live/{attempt_id}/pause")
def pause(attempt_id: int, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    exam.touch(db, at)
    at.current_since = None      # time stops until the mode is turned on again
    db.add(ExamEvent(attempt_id=at.id, kind="mode", path="off"))
    db.commit()
    return {"ok": True}


@router.post("/live/{attempt_id}/resume")
def resume(attempt_id: int, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    if at.current_task and at.current_since is None:
        at.current_since = datetime.now(timezone.utc)
    at.last_active_at = datetime.now(timezone.utc)
    db.add(ExamEvent(attempt_id=at.id, kind="mode", path="on"))
    db.commit()
    return {"ok": True}


@router.post("/attempts/{attempt_id}/submit")
def submit(attempt_id: int, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    at = _running(db, payload, attempt_id)
    exam.finish(db, at, "submitted")
    db.commit()
    action_log.enrich(target_kind="exam", target_id=at.id, target_name=at.profile_key,
                      details=[("kind", at.kind), ("score", at.score_pct), ("passed", at.passed)])
    return exam.attempt_json(db, at)


@router.get("/attempts/{attempt_id}/tasks/{task_key}")
def task_detail(attempt_id: int, task_key: str, request: Request, lang: Optional[str] = None,
                db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    """The answer sheet for one task: its type and, for a choice, the list —
    built from the same source the check reads and never cached."""
    at = _running(db, payload, attempt_id)
    task = exam_bank.BY_KEY.get(task_key)
    r = exam.result_map(db, at.id).get(task_key)
    if task is None or r is None:
        raise HTTPException(status_code=404, detail="No such task on this attempt")
    out = {**exam_bank.public(task), "status": r.status, "reason": r.reason, "options": None}
    if task["kind"] in ("answer", "visit_answer") and r.status != "unavailable":
        try:
            e = exam_check.expected(db, at, task, app_version=_app_version(request), lang=_lang(payload, None, lang))
            out["options"] = e.options
        except exam_check.NoData:
            r.status = "unavailable"
            r.reason = "no_data"
            db.commit()
            out.update({"status": "unavailable", "reason": "no_data"})
    return out


# ── practice ──────────────────────────────────────────────────────────────────

@router.post("/practice/start")
def practice_start(request: Request, body: dict = Body(default={}), db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    key = _me(db, payload)
    at = exam.open_attempt(db, key, "practice")
    if at is None:
        at = ExamAttempt(profile_key=key, kind="practice", status="running")
        db.add(at)
        db.flush()
    exam.start(db, at, payload, _app_version(request, body))
    db.commit()
    return exam.attempt_json(db, at)


@router.post("/practice/reset")
def practice_reset(request: Request, body: dict = Body(default={}), db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    key = _me(db, payload)
    at = exam.open_attempt(db, key, "practice")
    if at is None:
        return practice_start(request, body, db, payload)
    exam.restart_practice(db, at, payload, _app_version(request, body))
    db.commit()
    return exam.attempt_json(db, at)


# ── admin ─────────────────────────────────────────────────────────────────────

_admin = Depends(require_cap(CAP_EXAM_MANAGE))


def _leader_payload(db: Session, p: RoleProfile) -> dict:
    holders = profile_holders(db, f"leader:{p.id}")
    return {"sub": holders[0] if holders else 0, "role": "leader", "role_id": p.manager_id,
            "full_name": p.name, "profile_key": f"leader:{p.id}"}


def _missing_pages(db: Session, p: RoleProfile) -> list[str]:
    from app.permissions import page_allowed
    payload = _leader_payload(db, p)
    pages = sorted({t["page"] for t in exam_bank.TASKS if t["page"]})
    out = []
    for page in pages:
        try:
            if not page_allowed(db, payload, page):
                out.append(page)
        except Exception:  # noqa: BLE001
            out.append(page)
    return out


@admin_router.get("/leaders")
def admin_leaders(db: Session = Depends(get_db), _: dict = _admin):
    """Every leader with their unit, shift, plant, any open attempt and the
    exam pages they cannot open — what the assign tree is built from."""
    units = {m.id: m for m in db.query(Manager).all()}
    open_by: dict[str, ExamAttempt] = {}
    for at in (db.query(ExamAttempt).filter(ExamAttempt.kind == "exam",
                                            ExamAttempt.status.in_(exam.OPEN_STATUSES)).all()):
        open_by[at.profile_key] = at
    disabled = exam.disabled_tasks(db)
    enabled = exam_bank.enabled_tasks(disabled)
    out = []
    for p in db.query(RoleProfile).filter_by(role="leader").order_by(RoleProfile.name).all():
        m = units.get(p.manager_id) if p.manager_id else None
        if m is not None and m.archived:
            continue
        key = f"leader:{p.id}"
        missing = _missing_pages(db, p)
        at = open_by.get(key)
        out.append({
            "profile_key": key, "name": p.name, "manager_id": p.manager_id,
            "unit": m.name if m else None, "shift": m.shift if m else None,
            "factory_id": m.factory_id if m else None,
            "open_attempt": {"id": at.id, "status": at.status} if at else None,
            "missing_pages": missing,
            "unavailable": sum(1 for t in enabled if t["page"] in missing),
        })
    return {"leaders": out, "task_count": len(enabled)}


class AssignIn(BaseModel):
    profile_keys: list[str]
    deadline: date
    note: Optional[str] = None


@admin_router.post("/assign")
def admin_assign(body: AssignIn, db: Session = Depends(get_db), caller: dict = _admin):
    keys = [k for k in body.profile_keys if k.startswith("leader:")]
    if not keys:
        raise HTTPException(status_code=400, detail="Pick at least one leader")
    if body.deadline < today_local():
        raise HTTPException(status_code=400, detail="The deadline is in the past")
    asg, made, skipped = exam.assign(db, viewer_profile_key(db, caller), keys, body.deadline, body.note)
    db.commit()
    action_log.enrich(target_kind="exam_assignment", target_id=asg.id,
                      details=[("leaders", len(made)), ("skipped", len(skipped)),
                               ("deadline", body.deadline.isoformat())])
    return {"assignment_id": asg.id, "assigned": [a.profile_key for a in made], "skipped": skipped}


@admin_router.post("/attempts/{attempt_id}/cancel")
def admin_cancel(attempt_id: int, db: Session = Depends(get_db), caller: dict = _admin):
    at = db.query(ExamAttempt).filter_by(id=attempt_id, kind="exam").first()
    if at is None:
        raise HTTPException(status_code=404, detail="No such exam attempt")
    if at.status not in exam.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="This attempt is already closed")
    exam.cancel(db, at, viewer_profile_key(db, caller))
    db.commit()
    action_log.enrich(target_kind="exam", target_id=at.id, target_name=at.profile_key)
    return {"ok": True}


def _result_row(db: Session, at: ExamAttempt, units: dict, profs: dict) -> dict:
    role, _, ref = at.profile_key.partition(":")
    p = profs.get(int(ref)) if ref.isdigit() else None
    m = units.get(p.manager_id) if (p and p.manager_id) else None
    res = exam.results(db, at.id)
    c = exam.counts(res)
    return {
        "id": at.id, "profile_key": at.profile_key, "leader": p.name if p else at.profile_key,
        "manager_id": m.id if m else None, "unit": m.name if m else None,
        "shift": m.shift if m else None, "factory_id": m.factory_id if m else None,
        "assigned_at": at.created_at.isoformat() if at.created_at else None,
        "deadline": at.deadline.isoformat() if at.deadline else None,
        "status": at.status, "score_pct": at.score_pct, "passed": at.passed,
        "pass_mark_pct": at.pass_mark_pct,
        "started_at": at.started_at.isoformat() if at.started_at else None,
        "submitted_at": at.submitted_at.isoformat() if at.submitted_at else None,
        "seconds": exam.seconds_total(res), "counts": c, "note": at.note,
    }


@admin_router.get("/results")
def admin_results(db: Session = Depends(get_db), _: dict = _admin):
    units = {m.id: m for m in db.query(Manager).all()}
    profs = {p.id: p for p in db.query(RoleProfile).filter_by(role="leader").all()}
    rows = [_result_row(db, at, units, profs)
            for at in db.query(ExamAttempt).filter(ExamAttempt.kind == "exam")
            .order_by(ExamAttempt.id.desc()).all()]
    return {"rows": rows, "pass_mark": exam.pass_mark(db), "badge": exam.badge_on(db)}


@admin_router.get("/results/{attempt_id}")
def admin_result(attempt_id: int, db: Session = Depends(get_db), _: dict = _admin):
    at = db.query(ExamAttempt).filter_by(id=attempt_id, kind="exam").first()
    if at is None:
        raise HTTPException(status_code=404, detail="No such exam attempt")
    units = {m.id: m for m in db.query(Manager).all()}
    profs = {p.id: p for p in db.query(RoleProfile).filter_by(role="leader").all()}
    res = exam.results(db, at.id)
    tasks = []
    for k in exam.task_order(res):
        r = next(x for x in res if x.task_key == k)
        t = exam_bank.public(exam_bank.BY_KEY[k])
        t.update({"status": r.status, "reason": r.reason, "checks": r.checks, "seconds": r.seconds,
                  "answer": r.answer,
                  "opened_at": r.opened_at.isoformat() if r.opened_at else None,
                  "passed_at": r.passed_at.isoformat() if r.passed_at else None})
        tasks.append(t)
    # What the leader wrote, for the admin to read: the rows they created.
    written = []
    if at.purged_at is None:
        for r in sb.rows(db, at.id, "concern"):
            if not r.data.get("fx"):
                written.append({"kind": "concern", "text": r.data.get("concern_text"),
                                "worker": r.data.get("worker_name"), "at": r.created_at.isoformat() if r.created_at else None})
        for kind, field in (("concern_comment", "text"), ("task_comment", "text"), ("concern_move", "reason"),
                            ("dispute", "reason"), ("idle", "note")):
            for r in sb.rows(db, at.id, kind):
                if r.data.get("fx") or r.data.get("author_profile") not in (None, at.profile_key):
                    continue
                if kind in ("concern_comment", "task_comment") and r.data.get("author_profile") != at.profile_key:
                    continue
                written.append({"kind": kind, "text": r.data.get(field),
                                "at": r.created_at.isoformat() if r.created_at else None})
    row = _result_row(db, at, units, profs)
    return {**row, "tasks": tasks, "written": written, "purged": at.purged_at is not None}


@admin_router.get("/tasks")
def admin_tasks(db: Session = Depends(get_db), _: dict = _admin):
    off = exam.disabled_tasks(db)
    return {
        "areas": [{"key": k, "letter": l, "color": c} for k, l, c in exam_bank.AREAS],
        "tasks": [{**exam_bank.public(t), "enabled": t["key"] not in off} for t in exam_bank.TASKS],
        "pass_mark": exam.pass_mark(db), "badge": exam.badge_on(db),
    }


class TasksIn(BaseModel):
    disabled: list[str]


@admin_router.put("/tasks")
def admin_tasks_put(body: TasksIn, db: Session = Depends(get_db), _: dict = _admin):
    before = exam.disabled_tasks(db)
    exam.set_disabled_tasks(db, set(body.disabled))
    db.commit()
    after = exam.disabled_tasks(db)
    action_log.enrich(target_kind="exam_bank", details=[("disabled", len(after))],
                      changes=[("disabled", sorted(before), sorted(after))])
    return {"ok": True, "disabled": sorted(after)}


@admin_router.post("/results.xlsx")
def admin_results_xlsx(request: Request, body: dict = Body(default={}),
                       db: Session = Depends(get_db), caller: dict = _admin):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    from app.xlsx_delivery import deliver_xlsx
    units = {m.id: m for m in db.query(Manager).all()}
    profs = {p.id: p for p in db.query(RoleProfile).filter_by(role="leader").all()}
    rows = [_result_row(db, at, units, profs)
            for at in db.query(ExamAttempt).filter(ExamAttempt.kind == "exam").order_by(ExamAttempt.id.desc()).all()]
    ids = body.get("ids")
    if isinstance(ids, list) and ids:
        want = {int(i) for i in ids if str(i).isdigit()}
        rows = [r for r in rows if r["id"] in want]
    labels = body.get("labels") or {}
    cols = body.get("columns") or ["leader", "unit", "shift", "assigned_at", "deadline", "status",
                                   "score_pct", "passed", "seconds", "submitted_at"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Imtihon"
    ws.append([labels.get(c, c) for c in cols])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    status_labels = body.get("status_labels") or {}
    for r in rows:
        line = []
        for c in cols:
            v = r.get(c)
            if c == "status":
                v = status_labels.get(v, v)
            elif c == "passed":
                v = "" if v is None else (labels.get("yes", "ha") if v else labels.get("no", "yo'q"))
            elif c == "seconds":
                v = round((v or 0) / 60)
            elif c in ("assigned_at", "submitted_at", "started_at") and v:
                v = str(v)[:16].replace("T", " ")
            line.append(v)
        ws.append(line)
    for col in ws.columns:
        width = max(10, min(48, max(len(str(c.value or "")) for c in col) + 2))
        ws.column_dimensions[col[0].column_letter].width = width
    buf = io.BytesIO()
    wb.save(buf)
    fname = f"imtihon_{today_local().isoformat()}.xlsx"
    action_log.enrich(target_kind="exam_export", details=[("rows", len(rows))])
    return deliver_xlsx(request, caller, fname, buf.getvalue())
