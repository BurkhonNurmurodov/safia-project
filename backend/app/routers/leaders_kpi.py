"""`/api/leaders-kpi` — «Liderlar KPI» (`/leaders-kpi`): the leaders' five
KPIs on one page, as a leaderboard, month by month.

Page key ``leaders-kpi`` — ADMIN-ONLY until the operator opens it on the Access
tab (`permissions.DEFAULT_PAGE_ACCESS`). ONE read serves every tab (the board,
each KPI's own month payload, the rules); the register of concerns is paged
from `/api/worker-concerns/list`, the turnover month's actions stay on
`/api/turnover/*` and the Quality refresh on `/api/foreign-objects/refresh` —
all three re-gated on this page key. `services/leaders_kpi.py` is THE rule;
this module only parses, scopes and delivers.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import action_log, leaders_kpi, turnover
from app.services.leaders_kpi_export import build_leaders_kpi_workbook
from app.xlsx_delivery import deliver_file

router = APIRouter(prefix="/api/leaders-kpi", tags=["leaders-kpi"])

PAGE = "leaders-kpi"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _month(raw: Optional[str]):
    if raw in (None, ""):
        return leaders_kpi.default_month()
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


def _scope(factory: Optional[int], shift: Optional[int], managers) -> dict:
    ids = _ids(managers) if isinstance(managers, str) or managers is None else {int(x) for x in managers}
    return {"factory": factory, "shift": shift if shift in (1, 2) else None, "managers": ids}


@router.get("")
def month(
    month: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    managers: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The leaderboard and every tab's month, within the scope — one request."""
    return leaders_kpi.board(db, payload, _month(month), _scope(factory, shift, managers))


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
    meta: list[dict] = []
    # The board's row keys (cell keys) in the screen's order.
    order: list[str] = []


@router.post("/export.xlsx")
def export_xlsx(
    request: Request,
    body: ExportIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The month as the page shows it — the leaderboard, the three live KPIs'
    rankings and their registers. A browser downloads it; inside Telegram it
    lands in the caller's chat (app/xlsx_delivery.py)."""
    m = _month(body.month)
    scope = _scope(body.factory, body.shift, body.managers)
    pay = leaders_kpi.board(db, payload, m, scope)
    if pay.get("state") in ("before", "future"):
        raise HTTPException(status_code=409, detail={"code": "no_month", "message": "nothing to export"})
    register = leaders_kpi.concerns_register(db, payload, m, scope)
    bio = build_leaders_kpi_workbook({
        "title": body.title or f"Liderlar KPI — {turnover.ym(m)}",
        "subtitle": body.subtitle, "lang": body.lang, "labels": body.labels,
        "meta": body.meta, "order": body.order, "payload": pay, "register": register,
    })
    fname = (body.filename or f"leaders-kpi-{turnover.ym(m)}").strip() or f"leaders-kpi-{turnover.ym(m)}"
    if not fname.endswith(".xlsx"):
        fname += ".xlsx"
    data = bio.read()
    resp = deliver_file(request, payload, fname, data, XLSX, body.caption or f"📊 {body.title or fname}")
    action_log.enrich(target_kind="report", target_id=fname, target_name=body.title or fname,
                      details=[("file", fname), ("month", turnover.ym(m)), ("size", len(data)),
                               ("cells", len(pay.get("rows") or [])),
                               ("concerns", len(register))])
    return resp
