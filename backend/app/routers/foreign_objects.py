"""`/api/foreign-objects` — «Yot jismlar», the leaders' foreign-objects KPI,
month by month from the Quality register — the «Yot jismlar» tab of «Liderlar
KPI» (`/leaders-kpi`, 2026-10-19; the page `/foreign-objects` is retired
behind a redirect).

Page key ``leaders-kpi`` — ADMIN-ONLY until the operator opens it on the Access
tab (`permissions.DEFAULT_PAGE_ACCESS`). The month's figures ride the board
(`/api/leaders-kpi`, services/leaders_kpi); what stays here is the month read
for a tab on an older bundle and the Quality refresh, admin-only in the
endpoint, whatever the UI draws. The workbook is the merged page's
(`/api/leaders-kpi/export.xlsx`). `services/foreign_objects.py` is THE rule;
this module only parses, scopes and delivers.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.routers.quality import refresh_quality
from app.services import action_log, foreign_objects, turnover

router = APIRouter(prefix="/api/foreign-objects", tags=["foreign-objects"])

# The page key of «Liderlar KPI» — the foreign-objects tab of the merged page (2026-10-19).
PAGE = "leaders-kpi"


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
