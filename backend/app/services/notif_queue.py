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
live documents (draft)    ``staff_live._scope_docs`` ∩ ``_can_approve`` — /staff-live's
deletion requests         admin + shift-manager, ``_scope_deletion_requests``
live deletion batches     admin + shift-manager, ``staff_live._scope_deletions``
edit requests             admin + shift-manager covering the unit
late checklist days       admin (``leaders._may_decide``)
objections, late proofs   the brigadir at stage 1 (own unit), admins at stage 2
concerns                  status «todo» at the viewer's own level and holder
tasks                     status «todo», assigned to the viewer
========================  ======================================================

An ADMIN's turn on objections and late proofs is the admin stage only, the
reading the queue tabs on /leaders badge — an admin CAN rule stage 1, but a row
sitting with a brigadir is not waiting on an admin.

The two LIVE sources (the «Verifix to'g'irlash» page over the live Verifix
read, /staff-live) are /staff's twins read off ``routers.staff_live``'s own
scope and rights helpers, and they are listed only for a viewer who can OPEN
that page (``live_staff.can_open`` — an admin always, anybody else once the
operator has opened it to their role or granted it to them): a decision whose
link lands on «no access» is worse than none.

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
    "hr_doc": 0, "live_doc": 0, "edit_batch": 0, "live_batch": 0, "edit_request": 0,
    "late_day": 0, "dispute": 0, "late_proof": 0, "concern": 1, "task": 1,
}
# The order the page lists its sections in — each live twin right after the
# /staff kind it mirrors (notifMeta.QUEUE_KINDS is the client copy).
KIND_ORDER = ("hr_doc", "live_doc", "edit_batch", "live_batch", "edit_request", "late_day",
              "dispute", "late_proof", "concern", "task")

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


def _live_open(db: Session, payload: dict) -> bool:
    """The viewer can open /staff-live — the one gate both live sources sit
    behind. An admin always may; anybody else only once the page is opened to
    their PROFILE (`live_staff.can_open`: their role on the Access tab, or a
    grant, and no personal deny), which is the same test the page's own bell
    rows are addressed by. Resolved from the JWT the way every permission check
    is (`identity.viewer_profile_key`)."""
    if payload.get("role") == "admin":
        return True
    from app.identity import viewer_profile_key
    from app.permissions import get_page_access
    from app.services import live_staff
    key = viewer_profile_key(db, payload)
    return bool(key) and live_staff.can_open(db, key, get_page_access(db))


def _live_docs(db: Session, payload: dict) -> list[dict]:
    """`_hr_docs` over the live page's documents (`LiveDocument`, /staff-live):
    the same scope, rights and stale rule, read off `routers.staff_live`'s own
    helpers and never re-spelled, so the queue offers exactly what that page's
    approve door accepts."""
    if not _live_open(db, payload):
        return []
    from app.models import LiveDocument
    from app.routers import staff_live as sl
    q = sl._scope_docs(db.query(LiveDocument).filter(LiveDocument.status == "draft"), payload, db)
    docs = q.order_by(LiveDocument.created_at.desc()).limit(_CAP).all()
    if not docs:
        return []
    units = _unit_names(db, [d.manager_id for d in docs])
    out = []
    for doc in docs:
        if not sl._can_approve(doc, payload, db):
            continue   # visible is not decidable: a supervisor sees own drafts
        s = sl._serialize(doc, units.get(doc.manager_id))
        # The live approve door refuses a draft older than STALE_APPROVE_DAYS
        # (`staff_live._approve`, on the document's day) — no Approve button
        # that can only fail; the row says why and Reject is what is left.
        age = (date.today() - doc.day).days if doc.day else 0
        stale = age > sl.STALE_APPROVE_DAYS
        actions = [] if stale else [
            _action("approve", f"/api/staff-live/documents/{doc.id}/approve", tone="success",
                    undo={"method": "post", "url": f"/api/staff-live/documents/{doc.id}/cancel"}),
        ]
        if sl._may_reject(doc, payload, db):
            actions.append(_action("reject", f"/api/staff-live/documents/{doc.id}/reject",
                                   tone="danger", confirm=True))
        # «09:30» or «09:30–12:00» — a move with a clock; blank = the whole day.
        time = s.get("transfer_time") or ""
        if time and s.get("return_time"):
            time += f"–{s['return_time']}"
        out.append({
            "key": f"live_doc:{doc.id}", "kind": "live_doc", "id": doc.id,
            "since": _iso(doc.created_at),
            "link": "/staff-live?tab=requests",
            "fields": {
                "doc_type": doc.doc_type,
                "count": s["employee_count"],
                "new_role": s["new_role"],
                "target": s["target_manager_name"],
                "task": s["task_name"],
                "unit": s["supervisor_name"],
                "date": s["date"],
                "time": time or None,
                "by": doc.created_by_name,
                "stale_days": age if stale else None,
                "stale_max": sl.STALE_APPROVE_DAYS,
            },
            "actions": actions,
        })
    return out


def _live_batches(db: Session, payload: dict) -> list[dict]:
    """`_edit_batches` over the live page's deletion requests (`LiveDeletion`,
    pending rows grouped by batch) — admin and shift-manager, the two roles
    `staff_live._decide_deletions` admits by role."""
    if payload.get("role") not in ("admin", "shift-manager"):
        return []
    if not _live_open(db, payload):
        return []
    from app.routers import staff_live as sl
    rows = [r for r in sl._scope_deletions(payload, db) if r.status == "pending"]
    if not rows:
        return []
    batches: dict[str, list] = {}
    for r in rows:
        token = r.batch_id or f"solo-{r.id}"
        batches.setdefault(token, []).append(r)
    units = _unit_names(db, [r.manager_id for r in rows])
    out = []
    for token, reqs in batches.items():
        first = min(reqs, key=lambda r: r.created_at or r.id)
        names = [r.worker_name for r in reqs if r.worker_name]
        out.append({
            "key": f"live_batch:{token}", "kind": "live_batch", "id": token,
            "since": _iso(first.created_at),
            "link": "/staff-live?tab=requests",
            "fields": {
                "count": len(reqs),
                "workers": names[:6],
                "unit": units.get(first.manager_id) or first.supervisor_name,
                "date": first.day.isoformat() if first.day else None,
                "by": first.supervisor_name,
            },
            # Approving takes the workers off the unit's day; rejecting ends
            # the request. Neither has a way back from here, so both ask first.
            "actions": [
                _action("approve", f"/api/staff-live/requests/batch/{token}/approve",
                        tone="success", confirm=True, body={}),
                _action("reject", f"/api/staff-live/requests/batch/{token}/reject",
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


_SOURCES = (_hr_docs, _live_docs, _edit_batches, _live_batches, _edit_requests,
            _late_days, _disputes, _late_proofs, _concerns, _tasks)


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
