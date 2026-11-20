"""«Konteyner berish» — the container flow's API (services/container_flow.py,
docs/containers-flow.md). Two doors:

- `PAGE` (page key `container-flow`) is AXO: a REQUEST to a logistics person
  (or to all of them), changing or cancelling one while it waits, the stock,
  a brigadir's extra. First holder: Fozilova Dilafruz.
- `LOGI` (page key `container-logistics`) is Logistics: splitting a request
  addressed to them (or to everybody) across brigadirs. Nuriddin aka and
  Yusuf aka.
- `ANY` (either key): reading the requests, the analytics, the report.
  Both keys are admin-only until granted.
- The automatic batches («Partiyalar») and their doors (`/board`, `/issue`,
  `/batches/…`, `/teams`) were removed on 2026-11-18.
- `container-watch` (shift- and top-managers by default, 2026-11-15) reads
  everything the page shows — it joins `ANY`, `WHO` and the receipts' `RECW`
  — and writes nothing.
- `RECV` (page key `container-receive`): a brigadir confirming what reached
  their line — only their own unit; admins any. Admin-only until granted.
- `ADMIN` (an admin or `page.admin.container-flow`): the settings, deleting
  a request outright. That grant is an admin's whole reach on the page — every
  door above admits it (`_or_admin`), every unit, every tab.
- AXO's stock (2026-11-17): `GET /stock` is `ANY`'s, `POST /stock` — a count
  or an addition — is `PAGE`'s.
- A brigadir's EXTRA request (2026-11-18): `EXT` (page key `container-extra`,
  admin-only until the operator opens it) asks and withdraws — a brigadir for
  their own unit only; AXO (`PAGE`) approves or rejects; `EXTR` reads.
- «Jo'natish» (2026-11-19): the dispatch areas' schedule (`/send-areas`) is
  read by `ANY` and kept by AXO and the admins (`PAGE`); a request FOR an area
  (`area_id`) is made like any other, and the logistics person DELIVERS it
  (`/requests/{id}/deliver`, `LOGI`) instead of splitting it.

The messages: a new / cancelled request to its logistics person
(`flow.notify_later`), and a split request to each of its brigadirs with
«Hammasi keldi» in the bot (`flow.notify_split_later`) — each only while its
«Sozlamalar» switch is on."""
from __future__ import annotations

import io
from datetime import date
from typing import Annotated, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Manager
from app.capabilities import page_admin, require_page_admin
from app.permissions import _oauth2, require_page
from app.services import action_log, container_flow as flow
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/container-flow", tags=["container-flow"])

ADMIN_PAGE = "container-flow"
ADMIN = require_page_admin(ADMIN_PAGE)


def _or_admin(*pages: str):
    """`require_page(*pages)`, also passing a holder of the page's admin grant —
    the logistics / receipt / extra doors sit on page keys of their own, and an
    admin's reach on this page spans them all."""
    gate = require_page(*pages)

    def _dep(token: Annotated[str, Depends(_oauth2)], db: Session = Depends(get_db)):
        try:
            return gate(token, db)
        except HTTPException as denied:
            if denied.status_code != 403:
                raise
            try:
                return ADMIN(token, db)
            except HTTPException:
                raise denied from None
    return _dep


PAGE = require_page("container-flow")
LOGI = _or_admin("container-logistics")
ANY = require_page("container-flow", "container-logistics", "container-watch")
RECV = _or_admin("container-receive")
RECW = _or_admin("container-receive", "container-watch")
EXT = _or_admin("container-extra")
EXTR = require_page("container-extra", "container-flow", "container-logistics", "container-watch")
WHO = require_page("container-flow", "container-logistics", "container-receive", "container-watch",
                   "container-extra")


def _roles(db: Session, payload: dict) -> dict:
    """What the viewer is on this page — the page's tabs and buttons follow it."""
    from app.capabilities import capability_pages, caller_denied_pages
    from app.permissions import get_page_access, role_can_access
    if page_admin(db, payload, ADMIN_PAGE):
        return {"admin": True, "axo": True, "logistics": True, "receive": True, "watch": True,
                "extra": True, "unit": None}
    access, caps, denied = get_page_access(db), capability_pages(db, payload), caller_denied_pages(db, payload)
    can = lambda k: role_can_access(payload.get("role"), [k], access, caps, denied)  # noqa: E731
    return {"admin": False, "axo": can("container-flow"), "logistics": can("container-logistics"),
            "receive": can("container-receive"), "watch": can("container-watch"),
            "extra": can("container-extra"), "unit": _my_unit(payload)}


def _my_unit(payload: dict) -> Optional[int]:
    """The brigadir's own unit (a supervisor's role_id IS the manager id)."""
    if payload.get("role") == "supervisor" and str(payload.get("role_id") or "").isdigit():
        return int(payload["role_id"])
    return None


def _me(db: Session, payload: dict) -> Optional[str]:
    from app.identity import viewer_profile_key
    return viewer_profile_key(db, payload)

def _actor(payload: dict) -> str:
    return payload.get("full_name") or str(payload.get("sub") or "admin")


class NoteBody(BaseModel):
    note: str = ""



def _units(db: Session) -> list:
    from app.routers import production
    configured = production._configured_manager_ids(db)
    return [{"id": m.id, "name": m.name, "shift": m.shift}
            for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all()
            if m.id in configured]


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), payload: dict = Depends(WHO)):
    """Read by every holder (the viewer's roles, the switches); written by
    admins only."""
    return {**flow.settings(db), "reasons": list(flow.REASONS), "extra_reasons": list(flow.EXTRA_REASONS),
            "lead_min": flow.LEAD_MIN, **_roles(db, payload)}


class SettingsBody(BaseModel):
    # an older tab still sends `units` / `topup_min` (the removed batches'):
    # they are ignored, never refused
    notify: Optional[bool] = None   # absent = unchanged
    notify_brigadirs: Optional[bool] = None
    notify_axo: Optional[bool] = None
    notify_managers: Optional[bool] = None
    notify_extra: Optional[bool] = None


@router.put("/settings")
def put_settings(body: SettingsBody, db: Session = Depends(get_db),
                 payload: dict = Depends(ADMIN)):
    was = flow.settings(db)
    out = flow.save_settings(db, body.notify, body.notify_brigadirs, body.notify_axo,
                             body.notify_managers, body.notify_extra)
    action_log.enrich(changes=[("notify", was["notify"], out["notify"]),
                               ("notify_brigadirs", was["notify_brigadirs"], out["notify_brigadirs"]),
                               ("notify_axo", was["notify_axo"], out["notify_axo"]),
                               ("notify_managers", was["notify_managers"], out["notify_managers"]),
                               ("notify_extra", was["notify_extra"], out["notify_extra"])])
    return out


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
    return {"requests": flow.requests_report(db, date_from, date_to),
            "sending": flow.sending_report(db, date_from, date_to)}


@router.get("/analytics")
def get_analytics(date_from: date = Query(...), date_to: date = Query(...),
                  db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    """«Tahlil»: the period's requests per day, hour, container type and
    brigadir — what the charts draw."""
    _span(date_from, date_to)
    return flow.analytics(db, date_from, date_to)


@router.get("/stock")
def get_stock(date_from: date = Query(...), date_to: date = Query(...),
              db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    """AXO's stock of containers: now, what today still takes from it, and the
    period day by day (`flow.stock`). Read by everybody the page is open to."""
    _span(date_from, date_to)
    return flow.stock(db, date_from, date_to)


class StockBody(BaseModel):
    kind: str
    counts: Dict[str, int]
    note: str = ""


@router.post("/stock")
def post_stock(body: StockBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """AXO states its stock: a count (every type) or an addition (what came
    back or was bought). AXO's door — the watchers read, never write."""
    try:
        m = flow.record_stock(db, body.kind, body.counts, body.note, _actor(payload), _me(db, payload))
        kind, counts, mid = m.kind, dict(m.counts or {}), m.id
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    note = (body.note or "").strip()
    action_log.enrich(target_kind="container_stock", target_id=mid,
                      details=[("kind", kind), ("counts", flow.counts_text(counts) or "0")]
                      + ([("note", note)] if note else []))
    return {"ok": True, "id": mid}


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
    # one row per day, as the page's table
    rq = flow.requests_report(db, body.date_from, body.date_to)
    # `given` is both sides together, then the brigadirs' and the dispatch areas' (2026-11-19)
    rcols = ["day", "requests", "asked", "given", "in_given", "send_given", "received", "missing", "late",
             "overdue", "short"]
    wb = Workbook()
    ws2 = wb.active
    ws2.title = "Requests"
    ws2.append([body.headers.get(f"rq_{c}", c) for c in rcols])
    for c in ws2[1]:
        c.font = Font(bold=True)
    for d in rq["days"]:
        ws2.append([d["day"], d["requests"], d["asked"], d["given"], d["in_given"], d["send_given"],
                    d["received"], d["sent_confirmed"] - d["received"], d["late"], d["overdue"], d["short"]])
    sm = rq["summary"]
    ws2.append([body.headers.get("total", "Total"), sm["requests"], sm["asked"], sm["given"], sm["in_given"],
                sm["send_given"], sm["received"], sm["missing"], sm["late"], sm["overdue"], sm["short"]])
    for c in ws2[ws2.max_row]:
        c.font = Font(bold=True)
    for i, w in enumerate([12, 10, 12, 12, 14, 14, 12, 12, 10, 12, 10]):
        ws2.column_dimensions[chr(65 + i)].width = w
    ws2.freeze_panes = "A2"
    # «Jo'natish»: per dispatch area — the schedule's need, asked, delivered
    snd = flow.sending_report(db, body.date_from, body.date_to)
    ws3 = wb.create_sheet(body.headers.get("snd_sheet", "Sending")[:31])
    tn = lambda k: body.types.get(k, k)                                        # noqa: E731
    hdr = lambda k: body.headers.get(f"snd_{k}", k)                            # noqa: E731
    # per area its need; what was asked and given exists only in all (the split names no area)
    ws3.append([hdr("area"), hdr("shift")]
               + [f"{hdr(f)} · {tn(k)}" for f in ("need", "asked", "given") for k in flow.SEND_KEYS]
               + [hdr("pct")])
    for c in ws3[1]:
        c.font = Font(bold=True)
    for a in snd["areas"]:
        ws3.append([a["area"], body.headers.get(f"shift_{a['shift']}", a["shift"] or "")]
                   + [a["need"][k] for k in flow.SEND_KEYS])
    tot = snd["total"]
    ws3.append([body.headers.get("total", "Total"), ""]
               + [tot[f][k] for f in ("need", "asked", "given") for k in flow.SEND_KEYS] + [tot["pct"]])
    for c in ws3[ws3.max_row]:
        c.font = Font(bold=True)
    for i, w in enumerate([26, 10, 14, 14, 14, 14, 14, 14, 8]):
        ws3.column_dimensions[chr(65 + i)].width = w
    ws3.freeze_panes = "A2"
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
    me = _me(db, payload)
    mine = None if (r["admin"] or r["axo"] or r["watch"]) else (me or "—")
    # `logistics`: the viewer is one of the people a request «to everybody»
    # goes to — such a request is new and theirs to split, as their own is
    return {"day": day.isoformat(), "requests": flow.requests_of(db, day, mine), "me": me,
            "logistics": bool(me) and me in {p["key"] for p in flow.logistics_people(db)}}


@router.post("/seen/{request_id}")
def post_seen(request_id: int, db: Session = Depends(get_db), payload: dict = Depends(LOGI)):
    """The addressee opened a request — it stops being marked new for them."""
    changed = flow.mark_seen(db, request_id, _me(db, payload))
    if changed:
        db.commit()
    return {"ok": True, "changed": changed}


@router.get("/hour-need")
def get_hour_need(day: date = Query(...), db: Session = Depends(get_db),
                  payload: dict = Depends(ANY)):
    """The plant's containers per hour on `day` — the «Konteynerlar» page's
    figures — so a new request starts from the hour's number; `send` is each
    dispatch area's hours by «Jo'natish jadvali» (2026-11-19)."""
    hours = flow.plant_hours(db, day)
    send = {str(aid): {str(h): c for h, c in sorted(hm.items())} for aid, hm in flow.send_hours(db).items()}
    return {"day": day.isoformat(), "hours": {str(h): c for h, c in sorted(hours.items())}, "send": send}


# ── «Jo'natish jadvali» — the dispatch areas (2026-11-19) ───────────────────

@router.get("/send-areas")
def get_send_areas(db: Session = Depends(get_db), payload: dict = Depends(ANY)):
    """The dispatch areas on the schedule, each with its hours — a round's
    share whole at the hour it starts (`round_hours`)."""
    return {"areas": [flow.area_out(a) for a in flow.send_areas(db)]}


class AreaBody(BaseModel):
    name: str
    shift: int
    send: int = 0
    lid: int = 0
    rounds: List[List[str]]


def _area_log(a, changes=None) -> None:
    action_log.enrich(target_kind="container_send_area", target_id=a.id, target_name=a.name,
                      details=[("shift", a.shift), ("send", a.send), ("lid", a.lid),
                               ("rounds", " · ".join(f"{x[0]}–{x[1]}" for x in a.rounds or []))],
                      **({"changes": changes} if changes else {}))


@router.post("/send-areas")
def post_send_area(body: AreaBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    try:
        a = flow.save_area(db, None, body.name, body.shift, body.send, body.lid, body.rounds, _actor(payload))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    _area_log(a)
    return flow.area_out(a)


@router.put("/send-areas/{area_id}")
def put_send_area(area_id: int, body: AreaBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    try:
        a = flow._area(db, area_id)
        was = (a.name, a.shift, a.send, a.lid, " · ".join(f"{x[0]}–{x[1]}" for x in a.rounds or []))
        a = flow.save_area(db, area_id, body.name, body.shift, body.send, body.lid, body.rounds, _actor(payload))
        now_ = (a.name, a.shift, a.send, a.lid, " · ".join(f"{x[0]}–{x[1]}" for x in a.rounds or []))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    _area_log(a, [(f, o, n) for f, o, n in zip(("name", "shift", "send", "lid", "rounds"), was, now_) if o != n])
    return flow.area_out(a)


@router.delete("/send-areas/{area_id}")
def delete_send_area(area_id: int, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Off the schedule — archived; its requests keep their name and figures."""
    try:
        a = flow.remove_area(db, area_id, _actor(payload))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    _area_log(a)
    return {"ok": True}


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
    area_id: Optional[int] = None     # a dispatch area's request (2026-11-19)


def _req_out(db: Session, r, day: date) -> dict:
    out = next((x for x in flow.requests_of(db, day) if x["id"] == r.id), {"id": r.id})
    action_log.enrich(target_kind="container_request", target_id=r.id, day=day,
                      target_name=r.logistics_name,
                      details=[("hour", f"{r.hour % 24:02d}:00"), ("status", r.status)]
                      + ([("area", r.area_name)] if r.area_id is not None else []))
    return out


@router.post("/requests")
def post_request(body: RequestBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    try:
        r = flow.create_request(db, body.day, body.hour, body.logistics_key, body.counts, body.note,
                                _actor(payload), _me(db, payload), area_id=body.area_id)
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    flow.notify_later(r.id, "new")
    return _req_out(db, r, body.day)


class EditBody(BaseModel):
    hour: int
    logistics_key: str
    counts: Dict[str, int]
    note: str = ""
    area_id: Optional[int] = None     # a dispatch area's request may move to another area


@router.put("/requests/{request_id}")
def put_request(request_id: int, body: EditBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """AXO changes a request while it waits — the hour, the counts, whom it
    goes to, the note. Whoever it reaches is told: the same people «changed»,
    a new addressee «new», the one it left «moved»."""
    try:
        r, changes, old_key = flow.edit_request(db, request_id, body.hour, body.logistics_key, body.counts,
                                                body.note, area_id=body.area_id)
        new_key, rid, day = r.logistics_key, r.id, r.day
        gone = [k for k in flow.addressees(db, old_key) if k not in flow.addressees(db, new_key)]
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    if changes:
        if old_key == new_key:
            flow.notify_later(rid, "edited")
        else:
            flow.notify_later(rid, "new")
            if gone:
                flow.notify_later(rid, "moved", gone)
    action_log.enrich(changes=changes)
    return _req_out(db, r, day)


@router.get("/requests/prepared")
def get_prepared(day: date = Query(...), db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """The day's hours still ahead with what each needs — «Konteynerlar» and
    «Jo'natish jadvali» together, one item per hour (2026-11-19) — less what
    was already asked; AXO sends the picked ones in one go."""
    # `send` stays (empty) for a tab of the day before: the areas' hours are inside `hours` now
    return {"day": day.isoformat(), "hours": flow.prepared(db, day), "send": []}


class BulkItem(BaseModel):
    hour: int
    counts: Dict[str, int]
    area_id: Optional[int] = None


class BulkBody(BaseModel):
    day: date
    logistics_key: str
    items: List[BulkItem]
    note: str = ""


@router.post("/requests/bulk")
def post_requests_bulk(body: BulkBody, db: Session = Depends(get_db), payload: dict = Depends(PAGE)):
    """Several hours' requests to one logistics person — all or nothing; the
    addressee gets ONE message for the lot."""
    try:
        rs = flow.create_requests(db, body.day, body.logistics_key, [i.model_dump() for i in body.items],
                                  body.note, _actor(payload), _me(db, payload))
        ids = [r.id for r in rs]
        name = rs[0].logistics_name if rs else None
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    flow.notify_requests_later(ids)
    action_log.enrich(target_kind="container_request", day=body.day, target_name=name,
                      details=[("requests", len(ids)),
                               ("hours", ", ".join(f"{i.hour % 24:02d}:00" for i in body.items))])
    return {"ok": True, "ids": ids}


class PartBody(BaseModel):
    manager_id: int
    counts: Dict[str, int]


class AssignBody(BaseModel):
    parts: List[PartBody] = Field(default_factory=list)
    reason: Optional[str] = None
    comment: Optional[str] = None
    dispatch: Optional[Dict[str, int]] = None   # ONE amount to the dispatch areas (2026-11-19)


@router.post("/requests/{request_id}/assign")
def post_assign(request_id: int, body: AssignBody, db: Session = Depends(get_db),
                payload: dict = Depends(LOGI)):
    try:
        r = flow.assign_request(db, request_id, [p.model_dump() for p in body.parts], body.reason,
                                body.comment, _actor(payload), _me(db, payload),
                                page_admin(db, payload, ADMIN_PAGE), dispatch=body.dispatch)
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    flow.notify_split_later(r.id)
    flow.alert_later("short_split", r.id)        # tells AXO only when the split fell short
    return _req_out(db, r, r.day)


class DeliverBody(BaseModel):
    counts: Dict[str, int]
    reason: Optional[str] = None
    comment: Optional[str] = None


@router.post("/requests/{request_id}/deliver")
def post_deliver(request_id: int, body: DeliverBody, db: Session = Depends(get_db),
                 payload: dict = Depends(LOGI)):
    """The logistics person delivered a dispatch area's request (2026-11-19)."""
    try:
        r = flow.deliver_request(db, request_id, body.counts, body.reason, body.comment, _actor(payload),
                                 _me(db, payload), page_admin(db, payload, ADMIN_PAGE))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    flow.alert_later("short_split", r.id)        # tells AXO only when fewer were delivered
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
    flow.notify_later(r.id, "cancelled")
    flow.notify_split_cancelled_later(r.id)     # tells the brigadirs only if it had been split
    return _req_out(db, r, r.day)


@router.delete("/requests/{request_id}")
def delete_request(request_id: int, db: Session = Depends(get_db), payload: dict = Depends(ADMIN)):
    """Admins only: the request and its split, gone — any state."""
    try:
        r = flow.delete_request(db, request_id)
        snap = {"day": r.day, "hour": r.hour, "status": r.status, "lines": dict(r.lines or {}),
                "to": r.logistics_name}
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=404 if e.code == "gone" else 409, detail=e.code)
    action_log.enrich(target_kind="container_request", target_id=request_id, day=snap["day"],
                      target_name=snap["to"],
                      details=[("hour", f"{snap['hour'] % 24:02d}:00"), ("status", snap["status"]),
                               ("counts", ", ".join(f"{k} {n}" for k, n in snap["lines"].items()))])
    return {"ok": True, "id": request_id}


@router.get("/requests/{request_id}/split-hint")
def get_split_hint(request_id: int, db: Session = Depends(get_db), payload: dict = Depends(LOGI)):
    """Where the request's containers would go by each brigadir's own hour on
    «Konteynerlar» — the split dialog starts from it."""
    from app.models import ContainerRequest
    r = db.get(ContainerRequest, request_id)
    if r is None:
        raise HTTPException(status_code=404, detail="gone")
    extra = flow.extra_unit_of(db, r.id)
    if extra is not None:
        # a brigadir's approved extra: all of it to that unit — the one row, and
        # the one «limit», which is what AXO approved
        m = db.get(Manager, extra)
        counts = dict(r.lines or {})
        return {"extra_for": extra,
                "rows": [{"manager_id": extra, "unit": getattr(m, "name", None), "shift": getattr(m, "shift", None),
                          "counts": counts, "need": {}}],
                "limits": {str(extra): {"limit": counts, "given": {}, "left": counts}},
                "cells": {str(m): e for m, e in flow.cell_weights(db, r.day, r.hour, r.id).items()
                          if m == extra}}
    limits = flow.unit_limits(db, r.day, r.hour, r.id)
    return {"rows": flow.split_hint(db, r, limits), "extra_for": None,
            # to which cell how many: each brigadir's count is shared by these
            # weights (`cell_split`, the dialog's `cellSplit`), the split stores it
            "cells": {str(m): e for m, e in flow.cell_weights(db, r.day, r.hour, r.id).items()},
            # each brigadir's limit for the hour: the dialog caps every count at `left`
            "limits": {str(m): u for m, u in limits.items()},
            # the dispatch amount starts as every dispatch container and lid asked
            "dispatch": {k: n for k, n in (r.lines or {}).items() if k in flow.SEND_KEYS}}


@router.get("/receipts")
def get_receipts(day: date = Query(...), db: Session = Depends(get_db), payload: dict = Depends(RECW)):
    """The day's split requests per brigadir: a brigadir sees their own unit,
    everybody else (admins, the managers watching) every unit."""
    mine = None if page_admin(db, payload, ADMIN_PAGE) else _my_unit(payload)
    return {"day": day.isoformat(), "unit": mine, "receipts": flow.receipts_of(db, day, mine)}


# ── a brigadir's EXTRA request (2026-11-18) ─────────────────────────────────
def _extra_out(db: Session, e) -> dict:
    out = next((x for x in flow.extras_of(db, e.day, e.manager_id) if x["id"] == e.id), {"id": e.id})
    action_log.enrich(target_kind="container_extra", target_id=e.id, unit_id=e.manager_id,
                      unit_name=out.get("unit"), day=e.day,
                      details=[("hour", f"{e.hour % 24:02d}:00"), ("status", e.status),
                               ("counts", flow.counts_text(e.approved or e.lines or {}) or "0")])
    return out


@router.get("/extras")
def get_extras(day: date = Query(...), db: Session = Depends(get_db), payload: dict = Depends(EXTR)):
    """The day's asks: a brigadir reads their own unit's, AXO, logistics, the
    managers watching and admins every unit's."""
    mine = (_my_unit(payload) if payload.get("role") == "supervisor"
            and not page_admin(db, payload, ADMIN_PAGE) else None)
    return {"day": day.isoformat(), "unit": mine, "extras": flow.extras_of(db, day, mine)}


class ExtraBody(BaseModel):
    day: date
    hour: int
    counts: Dict[str, int]
    reason: str
    comment: str = ""
    manager_id: Optional[int] = None     # an admin names the unit; a brigadir's is their own


@router.post("/extras")
def post_extra(body: ExtraBody, db: Session = Depends(get_db), payload: dict = Depends(EXT)):
    admin = page_admin(db, payload, ADMIN_PAGE)
    # an admin names the unit; a grantee who is a brigadir may leave it to theirs
    mid = (body.manager_id or _my_unit(payload)) if admin else _my_unit(payload)
    if mid is None:
        raise HTTPException(status_code=409, detail="unit")
    try:
        e = flow.ask_extra(db, body.day, body.hour, mid, body.counts, body.reason, body.comment,
                           _actor(payload), _me(db, payload))
        db.commit()
    except flow.FlowError as ex:
        db.rollback()
        raise HTTPException(status_code=409, detail=ex.code)
    if payload.get("role") != "admin":
        flow.extra_later("new", e.id)       # an admin's own (test) ask never reaches AXO
    return _extra_out(db, e)


@router.post("/extras/{extra_id}/cancel")
def post_extra_cancel(extra_id: int, db: Session = Depends(get_db), payload: dict = Depends(EXT)):
    admin = page_admin(db, payload, ADMIN_PAGE)
    mid = None if admin else _my_unit(payload)
    if not admin and mid is None:
        raise HTTPException(status_code=409, detail="unit")
    try:
        e = flow.cancel_extra(db, extra_id, mid, _actor(payload))
        db.commit()
    except flow.FlowError as ex:
        db.rollback()
        raise HTTPException(status_code=409, detail=ex.code)
    return _extra_out(db, e)


class ApproveBody(BaseModel):
    counts: Dict[str, int]
    logistics_key: str
    note: str = ""


@router.post("/extras/{extra_id}/approve")
def post_extra_approve(extra_id: int, body: ApproveBody, db: Session = Depends(get_db),
                       payload: dict = Depends(PAGE)):
    """AXO allows a brigadir's ask — all or fewer — and sends it to a logistics
    person, who splits it to that unit only."""
    try:
        e, r = flow.approve_extra(db, extra_id, body.counts, body.logistics_key, body.note,
                                  _actor(payload), _me(db, payload))
        rid = r.id
        db.commit()
    except flow.FlowError as ex:
        db.rollback()
        raise HTTPException(status_code=409, detail=ex.code)
    flow.notify_later(rid, "new")              # the logistics person, behind their switch
    flow.extra_later("decided", e.id)          # the brigadir, behind theirs
    return _extra_out(db, e)


@router.post("/extras/{extra_id}/reject")
def post_extra_reject(extra_id: int, body: NoteBody, db: Session = Depends(get_db),
                      payload: dict = Depends(PAGE)):
    try:
        e = flow.reject_extra(db, extra_id, body.note, _actor(payload), _me(db, payload))
        db.commit()
    except flow.FlowError as ex:
        db.rollback()
        raise HTTPException(status_code=409, detail=ex.code)
    flow.extra_later("decided", e.id)
    return _extra_out(db, e)


class ReceiveBody(BaseModel):
    manager_id: int
    counts: Optional[Dict[str, int]] = None   # None = everything as sent
    reason: Optional[str] = None
    comment: Optional[str] = None


@router.post("/requests/{request_id}/receive")
def post_receive(request_id: int, body: ReceiveBody, db: Session = Depends(get_db),
                 payload: dict = Depends(RECV)):
    """A brigadir confirms what reached their line; an admin may for any unit."""
    if not page_admin(db, payload, ADMIN_PAGE) and _my_unit(payload) != body.manager_id:
        raise HTTPException(status_code=409, detail="not_yours")
    try:
        r = flow.receive(db, request_id, body.manager_id, body.counts, body.reason, body.comment,
                         _actor(payload))
        db.commit()
    except flow.FlowError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=e.code)
    out = _req_out(db, r, r.day)
    action_log.enrich(unit_id=body.manager_id)
    flow.alert_later("short_receipt", r.id, body.manager_id)   # tells AXO only when fewer arrived
    return out
