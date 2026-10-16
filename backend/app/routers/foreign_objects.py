"""`/api/foreign-objects` — «Yot jismlar» (`/foreign-objects`), the leaders'
foreign-objects KPI, month by month from the Quality register.

Page key ``foreign-objects`` — ADMIN-ONLY until the operator opens it on the
Access tab (HR is who it is for; `permissions.DEFAULT_PAGE_ACCESS`). Reads go
through the page key; re-pulling the Quality register from its sheet is
admin-only in the endpoint, whatever the UI draws. `services/foreign_objects.py`
is THE rule; this module only parses, scopes and delivers.
"""
from __future__ import annotations

from typing import Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.routers.quality import refresh_quality
from app.services import action_log, foreign_objects, turnover
from app.services.foreign_objects_export import build_foreign_workbook
from app.xlsx_delivery import deliver_file

router = APIRouter(prefix="/api/foreign-objects", tags=["foreign-objects"])

PAGE = "foreign-objects"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _month(raw: Optional[str]):
    if raw in (None, ""):
        today = turnover.local(turnover.now_aware()).date()
        return turnover.month_start(today)
    m = turnover.parse_month(raw)
    if m is None:
        raise HTTPException(status_code=400, detail={"code": "bad_month", "message": "month must be YYYY-MM"})
    return m


def _ids(raw: Optional[str]) -> set[int]:
    out: set[int] = set()
    for part in (raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.add(int(part))
    return out


def _scope(factory: Optional[int], shift: Optional[int], managers: Optional[str]) -> dict:
    return {"factory": factory, "shift": shift if shift in (1, 2) else None, "managers": _ids(managers)}


@router.get("")
def month(
    month: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    managers: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE)),
):
    """Everything the page shows for one month, within the scope."""
    return foreign_objects.month_payload(db, _month(month), _scope(factory, shift, managers))


@router.post("/refresh")
def refresh(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Re-pull the Quality register from its Google Sheet — the Quality page's
    own refresh, offered here to an admin so the month can be brought up to
    date without leaving the page."""
    out = refresh_quality(db=db, payload=admin)
    return {**out, "sync": foreign_objects.sync_info(db)}


class ExportIn(BaseModel):
    month: str
    factory: Optional[int] = None
    shift: Optional[int] = None
    managers: list[int] = []
    lang: str = "uz"
    title: str = ""
    subtitle: str = ""
    filename: str = ""
    caption: str = ""
    labels: dict = {}
    hints: dict = {}
    meta: list[dict] = []
    # The ranking's row keys (cell keys) in the screen's order.
    order: list[Union[int, str]] = []


@router.post("/export.xlsx")
def export_xlsx(
    request: Request,
    body: ExportIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The month as the page shows it, in four tabs. A browser downloads it;
    inside Telegram it lands in the caller's chat (app/xlsx_delivery.py)."""
    m = _month(body.month)
    scope = {"factory": body.factory, "shift": body.shift if body.shift in (1, 2) else None,
             "managers": {int(x) for x in body.managers}}
    pay = foreign_objects.month_payload(db, m, scope)
    if pay.get("state") in ("before", "future"):
        raise HTTPException(status_code=409, detail={"code": "no_month", "message": "nothing to export"})
    bio = build_foreign_workbook({
        "title": body.title or f"Yot jismlar — {turnover.ym(m)}",
        "subtitle": body.subtitle, "lang": body.lang, "labels": body.labels, "hints": body.hints,
        "meta": body.meta, "order": body.order, "payload": pay,
    })
    fname = (body.filename or f"foreign-objects-{turnover.ym(m)}").strip() or f"foreign-objects-{turnover.ym(m)}"
    if not fname.endswith(".xlsx"):
        fname += ".xlsx"
    data = bio.read()
    resp = deliver_file(request, payload, fname, data, XLSX, body.caption or f"📊 {body.title or fname}")
    action_log.enrich(target_kind="report", target_id=fname, target_name=body.title or fname,
                      details=[("file", fname), ("month", turnover.ym(m)), ("size", len(data)),
                               ("cells", len(pay.get("ranking") or [])),
                               ("complaints", len(pay.get("complaints") or []))])
    return resp
