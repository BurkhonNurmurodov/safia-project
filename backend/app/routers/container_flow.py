"""«Konteyner berish» — the container flow's API (services/container_flow.py,
docs/containers-flow.md). Two doors:

- `PAGE` (page key `container-flow`) is AXO: issuing an hour, a REQUEST to a
  logistics person, cancelling one, settling a dispute. First holder: Fozilova
  Dilafruz.
- `LOGI` (page key `container-logistics`) is Logistics: splitting a request
  addressed to them across brigadirs, confirming / sending back a batch.
  First holder: Nuriddin aka.
- `ANY` (either key): reading the board, the requests, the history, the
  report. Both keys are admin-only until granted.
- `verify_admin`: a leader's answer, a forced close, the settings.

Nothing here sends a message to anybody."""
from __future__ import annotations

import io
import threading
import time
from datetime import date
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, container_flow as flow
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/container-flow", tags=["container-flow"])

PAGE = require_page("container-flow")
LOGI = require_page("container-logistics")
ANY = require_page("container-flow", "container-logistics")


def _roles(db: Session, payload: dict) -> dict:
    """What the viewer is on this page — the page's tabs and buttons follow it."""
    from app.capabilities import capability_pages, caller_denied_pages
    from app.permissions import get_page_access, role_can_access
    if payload.get("role") == "admin":
        return {"admin": True, "axo": True, "logistics": True}
    access, caps, denied = get_page_access(db), capability_pages(db, payload), caller_denied_pages(db, payload)
    can = lambda k: role_can_access(payload.get("role"), [k], access, caps, denied)  # noqa: E731
    return {"admin": False, "axo": can("container-flow"), "logistics": can("container-logistics")}


def _me(db: Session, payload: dict) -> Optional[str]:
    from app.identity import viewer_profile_key
    return viewer_profile_key(db, payload)

_draft_lock = threading.Lock()
_drafted_at = 0.0
_DRAFT_EVERY_S = 60


def _actor(payload: dict) -> str:
    return payload.get("full_name") or str(payload.get("sub") or "admin")


def _draft_now(db: Session) -> None:
    """A board read brings the drafts up to date too (at most once a minute per
    process), so a unit enrolled a moment ago shows its hours without waiting
    for the clock's next pass."""
    global _drafted_at
    with _draft_lock:
        if time.monotonic() - _drafted_at < _DRAFT_EVERY_S:
            return
        _drafted_at = time.monotonic()
    try:
        flow.draft_due(db)
    except Exception:
        db.rollback()


def _step(db: Session, fn, *args) -> dict:
    """Run one step, commit, answer the batch — a refused step is a 409 whose
    `detail` is the code the page words."""
    try:
        b = fn(db, *args)
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    out = flow.one(db, b)
    action_log.enrich(target_kind="container_batch", target_id=b.id, unit_id=b.manager_id,
                      unit_name=out.get("unit"), day=b.day,
                      details=[("hour", f"{b.hour % 24:02d}:00"), ("kind", b.kind), ("status", b.status)])
    return out


@router.get("/board")
def get_board(day: date = Query(...), db: Session = Depends(get_db),
              payload: dict = Depends(ANY)):
    _draft_now(db)
    return flow.board(db, day)


class IssueItem(BaseModel):
    batch_id: int
    counts: Dict[str, int] = Field(default_factory=dict)


class IssueBody(BaseModel):
    items: List[IssueItem]
    reason: Optional[str] = None
    comment: Optional[str] = None


@router.post("/issue")
def post_issue(body: IssueBody, db: Session = Depends(get_db),
               payload: dict = Depends(PAGE)):
    """AXO issues an HOUR: several batches in one press, all or nothing."""
    if not body.items:
        raise HTTPException(status_code=422, detail="no batches")
    actor = _actor(payload)
    try:
        done = [flow.issue(db, it.batch_id, it.counts, body.reason, body.comment, actor)
                for it in body.items]
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    action_log.enrich(target_kind="container_batch", day=done[0].day,
                      details=[("batches", len(done)), ("hour", f"{done[0].hour % 24:02d}:00")])
    return {"issued": [b.id for b in done]}


class CountsBody(BaseModel):
    counts: Optional[Dict[str, int]] = None
    reason: Optional[str] = None
    comment: Optional[str] = None


@router.post("/batches/{batch_id}/deliver")
def post_deliver(batch_id: int, body: CountsBody, db: Session = Depends(get_db),
                 payload: dict = Depends(LOGI)):
    return _step(db, flow.deliver, batch_id, body.counts, body.reason, body.comment, _actor(payload))


class NoteBody(BaseModel):
    note: str = ""


@router.post("/batches/{batch_id}/return")
def post_return(batch_id: int, body: NoteBody, db: Session = Depends(get_db),
                payload: dict = Depends(LOGI)):
    return _step(db, flow.send_back, batch_id, body.note, _actor(payload))


class AnswerBody(CountsBody):
    team: str
    mode: str


@router.post("/batches/{batch_id}/answer")
def post_answer(batch_id: int, body: AnswerBody, db: Session = Depends(get_db),
                payload: dict = Depends(verify_admin)):
    return _step(db, flow.answer, batch_id, body.team, body.mode, body.counts, body.reason,
                 body.comment, _actor(payload))


@router.post("/batches/{batch_id}/settle")
def post_settle(batch_id: int, body: NoteBody, db: Session = Depends(get_db),
                payload: dict = Depends(PAGE)):
    return _step(db, flow.settle, batch_id, body.note, _actor(payload))


@router.post("/batches/{batch_id}/close")
def post_close(batch_id: int, body: NoteBody, db: Session = Depends(get_db),
               payload: dict = Depends(verify_admin)):
    return _step(db, flow.force_close, batch_id, body.note, _actor(payload))


@router.get("/batches/{batch_id}/history")
def get_history(batch_id: int, db: Session = Depends(get_db),
                payload: dict = Depends(ANY)):
    return {"events": flow.history(db, batch_id)}


@router.get("/teams")
def get_teams(manager_id: int = Query(...), day: date = Query(...),
              db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    """A unit's teams for the manual request's picker — every work centre of
    its «Zagruzka fayli» and each group of it, whether the hours see it or not."""
    from app.routers import production
    try:
        dash = production._build_dashboard(db, manager_id, day)
    except HTTPException:
        return {"teams": []}
    out = []
    for w in dash.get("work_centers") or []:
        code = str(w.get("work_center") or "").strip().upper()
        if not code:
            continue
        groups = [g for g in (w.get("groups") or []) if not g.get("orphan")]
        if not groups:
            cell = w.get("cell") or {}
            out.append({"work_center": code, "group": "", "cell_code": cell.get("verifix_code"),
                        "leader": cell.get("leader")})
        for g in groups:
            cell = g.get("cell") or w.get("cell") or {}
            out.append({"work_center": code, "group": g.get("group") or "",
                        "cell_code": cell.get("verifix_code"), "leader": cell.get("leader")})
    return {"teams": out}


def _units(db: Session) -> list:
    from app.routers import production
    configured = production._configured_manager_ids(db)
    return [{"id": m.id, "name": m.name, "shift": m.shift}
            for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all()
            if m.id in configured]


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    """Read by every holder (the manual request's unit picker, «is anything
    enrolled»); written by admins only."""
    return {**flow.settings(db), "all_units": _units(db), "reasons": list(flow.REASONS),
            "draft_min": flow.DRAFT_MIN, "lead_min": flow.LEAD_MIN, **_roles(db, payload)}


class SettingsBody(BaseModel):
    units: List[int]
    topup_min: int = Field(ge=1, le=1000)


@router.put("/settings")
def put_settings(body: SettingsBody, db: Session = Depends(get_db),
                 payload: dict = Depends(verify_admin)):
    was = flow.settings(db)
    out = flow.save_settings(db, body.units, body.topup_min)
    action_log.enrich(changes=[("units", len(was["units"]), len(out["units"])),
                               ("topup_min", was["topup_min"], out["topup_min"])])
    global _drafted_at
    _drafted_at = 0.0   # the next board read drafts for a unit just enrolled
    return {**out, "all_units": _units(db)}


@router.get("/readiness")
def get_readiness(day: date = Query(...), db: Session = Depends(get_db),
                  payload: dict = Depends(ANY)):
    return {"day": day.isoformat(), "units": flow.readiness(db, day)}


def _span(d_from: date, d_to: date) -> None:
    if d_to < d_from or (d_to - d_from).days > 366:
        raise HTTPException(status_code=422, detail="bad period")


@router.get("/report")
def get_report(date_from: date = Query(...), date_to: date = Query(...),
               db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    _span(date_from, date_to)
    return flow.report(db, date_from, date_to)


class ReportXlsxBody(BaseModel):
    date_from: date
    date_to: date
    # the page's own headers and container names, in the reader's language
    headers: Dict[str, str] = Field(default_factory=dict)
    types: Dict[str, str] = Field(default_factory=dict)


@router.post("/report.xlsx")
def post_report_xlsx(body: ReportXlsxBody, request: Request, db: Session = Depends(get_db),
                     payload: dict = Depends(ANY)):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    _span(body.date_from, body.date_to)
    rep = flow.report(db, body.date_from, body.date_to)
    cols = ["day", "unit", "ctype", "need", "issued", "delivered", "accepted",
            "gap_axo", "gap_logistics", "gap_dispute", "surplus"]
    wb = Workbook()
    ws = wb.active
    ws.title = "Containers"
    ws.append([body.headers.get(c, c) for c in cols])
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in rep["rows"]:
        ws.append([r["day"], r["unit"] or "—", body.types.get(r["ctype"], r["ctype"])]
                  + [r[c] for c in cols[3:]])
    ws.append([body.headers.get("total", "Total"), "", ""] + [rep["totals"][c] for c in cols[3:]])
    for c in ws[ws.max_row]:
        c.font = Font(bold=True)
    for i, w in enumerate([12, 30, 22, 10, 10, 12, 12, 10, 12, 10, 10]):
        ws.column_dimensions[chr(65 + i)].width = w
    ws.freeze_panes = "A2"
    buf = io.BytesIO()
    wb.save(buf)
    return deliver_xlsx(request, payload, f"containers-{body.date_from}_{body.date_to}.xlsx", buf.getvalue())


# ── requests: AXO → a logistics person → brigadirs ──────────────────────────

@router.get("/requests")
def get_requests(day: date = Query(...), db: Session = Depends(get_db),
                 payload: dict = Depends(ANY)):
    """The day's requests. AXO and admins see every one; a logistics person
    who is not AXO sees only those addressed to them."""
    r = _roles(db, payload)
    mine = None if (r["admin"] or r["axo"]) else (_me(db, payload) or "—")
    return {"day": day.isoformat(), "requests": flow.requests_of(db, day, mine), "me": _me(db, payload)}


@router.get("/logistics")
def get_logistics(db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Who a request can be addressed to."""
    return {"people": flow.logistics_people(db)}


@router.get("/units")
def get_all_units(db: Session = Depends(get_db), payload: dict = Depends(LOGI)):
    """Every brigadir a request can be split to (not archived)."""
    return {"units": [{"id": m.id, "name": m.name, "shift": m.shift}
                      for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all()]}


class RequestBody(BaseModel):
    day: date
    hour: int
    logistics_key: str
    counts: Dict[str, int]
    note: str = ""


def _req_out(db: Session, r, day: date) -> dict:
    out = next((x for x in flow.requests_of(db, day) if x["id"] == r.id), {"id": r.id})
    action_log.enrich(target_kind="container_request", target_id=r.id, day=day,
                      target_name=r.logistics_name,
                      details=[("hour", f"{r.hour % 24:02d}:00"), ("status", r.status)])
    return out


@router.post("/requests")
def post_request(body: RequestBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    try:
        r = flow.create_request(db, body.day, body.hour, body.logistics_key, body.counts, body.note,
                                _actor(payload), _me(db, payload))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    return _req_out(db, r, body.day)


class PartBody(BaseModel):
    manager_id: int
    counts: Dict[str, int]


class AssignBody(BaseModel):
    parts: List[PartBody]
    reason: Optional[str] = None
    comment: Optional[str] = None


@router.post("/requests/{request_id}/assign")
def post_assign(request_id: int, body: AssignBody, db: Session = Depends(get_db),
                payload: dict = Depends(LOGI)):
    try:
        r = flow.assign_request(db, request_id, [p.model_dump() for p in body.parts], body.reason,
                                body.comment, _actor(payload), _me(db, payload),
                                payload.get("role") == "admin")
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    return _req_out(db, r, r.day)


@router.post("/requests/{request_id}/cancel")
def post_cancel(request_id: int, body: NoteBody, db: Session = Depends(get_db),
                payload: dict = Depends(PAGE)):
    try:
        r = flow.cancel_request(db, request_id, body.note, _actor(payload))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    return _req_out(db, r, r.day)
