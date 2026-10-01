"""«Sizdan kutilmoqda» — what is waiting on THIS viewer right now (2026-10-01).

The queue half of the notification centre (``services.notification_center``
holds the feed half). It is read from the LIVE records on every request and
never from bell rows, which is the whole point: a bell row announcing «Karimova
sent a role change» is true forever, while the document it names is decided
within hours. An item here leaves the moment ANYBODY deals with it — the viewer
from the bell, a colleague from the bot, an admin from /staff.

Each source asks the question the page that owns the record already asks, so
the queue can never offer a decision the endpoint behind it refuses:

========================  ======================================================
source                    whose turn
========================  ======================================================
HR documents (draft)      ``staff._scope_documents`` ∩ ``_can_approve_doc``
deletion requests         admin + shift-manager, ``_scope_deletion_requests``
edit requests             admin + shift-manager covering the unit
late checklist days       admin (``leaders._may_decide``)
objections, late proofs   the brigadir at stage 1 (own unit), admins at stage 2
concerns                  status «todo» at the viewer's own level and holder
tasks                     status «todo», assigned to the viewer
========================  ======================================================

An ADMIN's turn on objections and late proofs is the admin stage only, the
reading the queue tabs on /leaders badge — an admin CAN rule stage 1, but a row
sitting with a brigadir is not waiting on an admin.

Inline actions are DESCRIBED here (method + url + whether it needs a confirm +
how to undo it) and executed by the client against the very endpoints /staff
and /leaders call, so the rights stay where they are enforced. Only decisions
the bot already makes in one tap are offered inline; anything that needs
reading or a comment (an objection, a late proof, taking a concern into work
with a deadline) is a link.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import (
    EditRequest, HrDocument, LeaderAiDispute, LeaderConcern, LeaderLateProof,
    LeaderLateRequest, LeaderTask, LeaderTaskDef, Manager,
)

logger = logging.getLogger(__name__)

# Decisions somebody else is blocked on rank above the viewer's own work list,
# so one objection is never buried under ninety concerns.
_RANK = {
    "hr_doc": 0, "edit_batch": 0, "edit_request": 0, "late_day": 0,
    "dispute": 0, "late_proof": 0, "concern": 1, "task": 1,
}
# The order the page lists its sections in.
KIND_ORDER = ("hr_doc", "edit_batch", "edit_request", "late_day", "dispute",
              "late_proof", "concern", "task")

_CAP = 300   # per source — a register, not a dump; the page says when it is cut


def _iso(ts) -> Optional[str]:
    return ts.isoformat() if ts is not None else None


def _unit_names(db: Session, ids) -> dict[int, str]:
    ids = {int(i) for i in ids if i}
    if not ids:
        return {}
    return {m.id: m.name for m in db.query(Manager.id, Manager.name).filter(Manager.id.in_(ids)).all()}


def _task_names(db: Session, ids) -> dict[int, dict]:
    ids = {int(i) for i in ids if i}
    if not ids:
        return {}
    out = {}
    for d in db.query(LeaderTaskDef).filter(LeaderTaskDef.id.in_(ids)).all():
        out[d.id] = {"uz": d.name_uz, "uz_cyrl": d.name_uz_cyrl, "ru": d.name_ru, "en": d.name_en}
    return out


def _action(aid: str, url: str, *, tone: str, confirm: bool = False,
            body: Optional[dict] = None, undo: Optional[dict] = None) -> dict:
    return {"id": aid, "method": "post", "url": url, "tone": tone,
            "confirm": confirm, "body": body, "undo": undo}


# ── sources ───────────────────────────────────────────────────────────────────

def _hr_docs(db: Session, payload: dict) -> list[dict]:
    from app.routers import staff
    q = staff._scope_documents(
        staff._real_docs(db).filter(HrDocument.status == "draft"), payload, db)
    docs = q.order_by(HrDocument.created_at.desc()).limit(_CAP).all()
    if not docs:
        return []
    units = _unit_names(db, [d.manager_id for d in docs])
    out = []
    for doc in docs:
        approve = staff._can_approve_doc(doc, payload, db)
        if not approve:
            continue   # visible is not decidable: a supervisor sees own drafts
        s = staff._serialize_doc(doc, units.get(doc.manager_id))
        # Past STALE_APPROVE_DAYS a draft can no longer be posted — the approve
        # door refuses it — so the queue offers no Approve button that can only
        # fail; it says why, and Reject is what is left.
        age = (date.today() - doc.date).days if doc.date else 0
        stale = age > staff.STALE_APPROVE_DAYS
        actions = [] if stale else [
            _action("approve", f"/api/staff/documents/{doc.id}/approve", tone="success",
                    undo={"method": "post", "url": f"/api/staff/documents/{doc.id}/cancel"}),
        ]
        if staff._may_reject_doc(doc, payload, db):
            # A rejected document can never be posted again — so it asks first.
            actions.append(_action("reject", f"/api/staff/documents/{doc.id}/reject",
                                   tone="danger", confirm=True))
        out.append({
            "key": f"hr_doc:{doc.id}", "kind": "hr_doc", "id": doc.id,
            "since": _iso(doc.created_at),
            "link": "/staff?tab=requests",
            "fields": {
                "doc_type": doc.doc_type,
                "count": s["employee_count"],
                "new_role": s["new_role"],
                "target": s["target_manager_name"],
                "task": s["task_name"],
                "unit": s["supervisor_name"],
                "date": s["date"],
                "by": doc.created_by_name,
                "stale_days": age if stale else None,
                "stale_max": staff.STALE_APPROVE_DAYS,
            },
            "actions": actions,
        })
    return out


def _edit_batches(db: Session, payload: dict) -> list[dict]:
    from app.routers import staff
    if payload.get("role") not in ("admin", "shift-manager"):
        return []   # ``_process_batch`` admits these two roles and nobody else
    rows = [r for r in staff._scope_deletion_requests(payload, db) if r.status == "pending"]
    if not rows:
        return []
    batches: dict[str, list[EditRequest]] = {}
    for r in rows:
        token = r.batch_id or f"solo-{r.id}"
        batches.setdefault(token, []).append(r)
    units = _unit_names(db, [r.manager_id for r in rows])
    out = []
    for token, reqs in batches.items():
        first = min(reqs, key=lambda r: r.created_at or r.id)
        names = [r.worker_name for r in reqs if r.worker_name]
        out.append({
            "key": f"edit_batch:{token}", "kind": "edit_batch", "id": token,
            "since": _iso(first.created_at),
            "link": "/staff?tab=requests",
            "fields": {
                "count": len(reqs),
                "workers": names[:6],
                "unit": units.get(first.manager_id) or first.supervisor_name,
                "date": first.date.isoformat() if first.date else None,
                "by": first.supervisor_name,
            },
            # Approving deletes attendance rows; rejecting ends the request.
            # Neither has a way back from here, so both ask first.
            "actions": [
                _action("approve", f"/api/staff/requests/batch/{token}/approve",
                        tone="success", confirm=True, body={}),
                _action("reject", f"/api/staff/requests/batch/{token}/reject",
                        tone="danger", confirm=True),
            ],
        })
    return out[:_CAP]


def _edit_requests(db: Session, payload: dict) -> list[dict]:
    from app.services import shift_scope
    role = payload.get("role")
    if role not in ("admin", "shift-manager"):
        return []
    q = db.query(EditRequest).filter(
        EditRequest.status == "pending",
        or_(EditRequest.changes["_action"].astext.is_(None),
            EditRequest.changes["_action"].astext != "delete"),
    )
    if role == "shift-manager":
        units = shift_scope.unit_ids(db, payload.get("role_id"))
        if not units:
            return []
        q = q.filter(EditRequest.manager_id.in_(units))
    reqs = q.order_by(EditRequest.created_at.desc()).limit(_CAP).all()
    units = _unit_names(db, [r.manager_id for r in reqs])
    out = []
    for r in reqs:
        changes = {k: v for k, v in (r.changes or {}).items() if not str(k).startswith("_")}
        out.append({
            "key": f"edit_request:{r.id}", "kind": "edit_request", "id": r.id,
            "since": _iso(r.created_at),
            "link": None,
            "fields": {
                "worker": r.worker_name,
                "unit": units.get(r.manager_id) or r.supervisor_name,
                "date": r.date.isoformat() if r.date else None,
                "by": r.supervisor_name,
                "fields": sorted(changes.keys())[:6],
            },
            "actions": [
                _action("approve", f"/api/staff/requests/{r.id}/approve", tone="success",
                        undo={"method": "post", "url": f"/api/staff/requests/{r.id}/undo"}),
                _action("reject", f"/api/staff/requests/{r.id}/reject", tone="danger",
                        confirm=True),
            ],
        })
    return out


def _late_days(db: Session, payload: dict) -> list[dict]:
    if payload.get("role") != "admin":
        return []
    reqs = db.query(LeaderLateRequest).filter(LeaderLateRequest.status == "pending") \
        .order_by(LeaderLateRequest.requested_at.desc()).limit(_CAP).all()
    units = _unit_names(db, [r.manager_id for r in reqs])
    return [{
        "key": f"late_day:{r.id}", "kind": "late_day", "id": r.id,
        "since": _iso(r.requested_at),
        "link": None,
        "fields": {
            "leader": r.leader_name,
            "unit": units.get(r.manager_id),
            "date": r.date,
            "reason": r.reason,
            "by": r.requested_by_name,
        },
        "actions": [
            _action("approve", f"/api/leaders/late/{r.id}/decide", tone="success",
                    body={"status": "approved"}),
            _action("reject", f"/api/leaders/late/{r.id}/decide", tone="danger",
                    confirm=True, body={"status": "rejected"}),
        ],
    } for r in reqs]


def _appeal_rows(db: Session, payload: dict, model):
    role = payload.get("role")
    if role == "admin":
        return db.query(model).filter(model.status == "admin")
    if role == "supervisor" and payload.get("role_id"):
        return db.query(model).filter(model.status == "supervisor",
                                      model.manager_id == int(payload["role_id"]))
    return None


def _disputes(db: Session, payload: dict) -> list[dict]:
    q = _appeal_rows(db, payload, LeaderAiDispute)
    if q is None:
        return []
    rows = q.order_by(LeaderAiDispute.id.desc()).limit(_CAP).all()
    units = _unit_names(db, [r.manager_id for r in rows])
    tasks = _task_names(db, [r.task_id for r in rows])
    return [{
        "key": f"dispute:{r.id}", "kind": "dispute", "id": r.id,
        # It started waiting on THIS stage when the brigadir passed it up.
        "since": _iso(r.sup_at if r.status == "admin" and r.sup_at else r.requested_at),
        "link": f"/leaders/appeal/dispute/{r.id}",
        "fields": {
            "stage": r.status,
            "leader": r.leader_name,
            "unit": units.get(r.manager_id),
            "date": r.date,
            "task": tasks.get(r.task_id),
            "task_id": r.task_id,
            "reason": r.reason,
            "by": r.sup_by_name if r.status == "admin" else r.requested_by_name,
        },
        "actions": [],
    } for r in rows]


def _late_proofs(db: Session, payload: dict) -> list[dict]:
    q = _appeal_rows(db, payload, LeaderLateProof)
    if q is None:
        return []
    rows = q.order_by(LeaderLateProof.id.desc()).limit(_CAP).all()
    units = _unit_names(db, [r.manager_id for r in rows])
    tasks = _task_names(db, [r.task_id for r in rows])
    out = []
    for r in rows:
        late = None
        if r.due_at is not None and r.created_at is not None:
            mins = int((r.created_at - r.due_at).total_seconds() // 60)
            late = mins if mins >= 0 else None
        out.append({
            "key": f"late_proof:{r.id}", "kind": "late_proof", "id": r.id,
            "since": _iso(r.sup_at if r.status == "admin" and r.sup_at else r.created_at),
            "link": f"/leaders/appeal/late/{r.id}",
            "fields": {
                "stage": r.status,
                "leader": r.leader_name,
                "unit": units.get(r.manager_id),
                "date": r.date,
                "task": tasks.get(r.task_id),
                "task_id": r.task_id,
                "late_min": late,
                "reason": r.reason,
            },
            "actions": [],
        })
    return out


def _concerns(db: Session, payload: dict) -> list[dict]:
    from app.identity import viewer_leader_profile_id
    role, rid = payload.get("role"), payload.get("role_id")
    level = func.coalesce(func.nullif(LeaderConcern.level, ""), "supervisor")
    q = db.query(LeaderConcern).filter(LeaderConcern.status == "todo")
    if role == "supervisor" and rid:
        q = q.filter(level == "supervisor", LeaderConcern.brigadir_manager_id == int(rid))
    elif role == "shift-manager" and rid:
        q = q.filter(level == "shift-manager", LeaderConcern.shift_manager_profile_id == int(rid))
    elif role == "top-manager" and rid:
        q = q.filter(level == "top-manager", LeaderConcern.top_manager_profile_id == int(rid))
    elif role == "leader":
        pid = viewer_leader_profile_id(db, payload)
        if not pid:
            return []
        q = q.filter(level == "leader", LeaderConcern.leader_profile_id == pid)
    else:
        return []   # an admin rules on concerns from the register; no turn here
    rows = q.order_by(func.coalesce(LeaderConcern.level_since, LeaderConcern.created_at).desc()) \
        .limit(_CAP).all()
    return [{
        "key": f"concern:{c.id}", "kind": "concern", "id": c.id,
        "since": _iso(c.level_since or c.created_at),
        "link": f"/concerns?open={c.id}",
        "fields": {
            "no": c.seq or c.id,
            "text": c.concern_text,
            "leader": c.leader_name,
            "owner": c.concern_owner or c.worker_name,
            "cell": c.cell_code,
            "date": c.entry_date.isoformat() if c.entry_date else None,
        },
        "actions": [],
    } for c in rows]


def _tasks(db: Session, payload: dict) -> list[dict]:
    from app.identity import viewer_leader_profile_id
    role, rid = payload.get("role"), payload.get("role_id")
    q = db.query(LeaderTask).filter(LeaderTask.status == "todo")
    if role == "supervisor" and rid:
        q = q.filter(LeaderTask.assignee_kind == "supervisor",
                     LeaderTask.supervisor_manager_id == int(rid))
    elif role == "leader":
        pid = viewer_leader_profile_id(db, payload)
        if not pid:
            return []
        q = q.filter(func.coalesce(LeaderTask.assignee_kind, "leader") == "leader",
                     LeaderTask.leader_profile_id == pid)
    else:
        return []
    rows = q.order_by(LeaderTask.created_at.desc()).limit(_CAP).all()
    return [{
        "key": f"task:{t.id}", "kind": "task", "id": t.id,
        "since": _iso(t.created_at),
        "link": f"/tasks?open={t.id}",
        "fields": {
            "text": t.task_text,
            "due": t.due_date.isoformat() if t.due_date else None,
            "by": t.created_by_name,
            "urgent": t.priority == 1,
        },
        "actions": [],
    } for t in rows]


_SOURCES = (_hr_docs, _edit_batches, _edit_requests, _late_days, _disputes,
            _late_proofs, _concerns, _tasks)


def build(db: Session, payload: dict) -> list[dict]:
    """Every item waiting on the viewer — decisions first, then each group
    newest first. A source that fails costs its own items, never the queue:
    each runs inside a SAVEPOINT, so a broken query cannot abort the rest."""
    items: list[dict] = []
    for source in _SOURCES:
        try:
            with db.begin_nested():
                items.extend(source(db, payload))
        except Exception:
            logger.exception("notification queue: %s failed", source.__name__)
    items.sort(key=lambda i: i.get("since") or "", reverse=True)
    items.sort(key=lambda i: _RANK.get(i["kind"], 9))
    return items


def count(db: Session, payload: dict) -> int:
    return len(build(db, payload))
