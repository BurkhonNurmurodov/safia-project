"""«O'z vaqtida yetkazish» (/ontime) — the on-time delivery report.

Every figure comes from `services/ontime.py` over what
`services/ontime_sync.py` read out of the logistics team's sheet. Reads are
gated on the `ontime` page (admin-only until the operator opens it on the
Access tab); starting a read of the sheet is the admin's.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import action_log, ontime, ontime_sync

router = APIRouter(prefix="/api/ontime", tags=["ontime"])


def _window(db: Session, date_from: Optional[date], date_to: Optional[date]) -> tuple[date, date]:
    """The period asked for; with none, the last 14 days the stored read holds
    (ending on its newest order day) — a page opened today must not land on
    two empty weeks because nobody has pasted today's orders yet."""
    if date_to is None:
        rd = ontime_sync.last_read(db, ok_only=True)
        date_to = (rd.last_day if rd and rd.last_day else None) or (ontime_sync.now_aware().date())
    if date_from is None:
        date_from = date_to - timedelta(days=13)
    if date_from > date_to:
        raise HTTPException(status_code=422, detail={"code": "range_reversed"})
    if (date_to - date_from).days + 1 > ontime.MAX_DAYS:
        date_from = date_to - timedelta(days=ontime.MAX_DAYS - 1)
    return date_from, date_to


@router.get("/analysis")
def get_analysis(
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    group: List[str] = Query(default=[]),
    wave: List[int] = Query(default=[]),
    material: List[str] = Query(default=[]),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("ontime")),
):
    """The /ontime page, whole: KPIs, the daily trend, the waves, the groups
    (the sheet's own averages) and every product of the period."""
    d0, d1 = _window(db, date_from, date_to)
    out = dict(ontime.build(db, d0, d1, set(group) or None, set(wave) or None, set(material) or None))
    state = ontime_sync.read_state(db)
    ok = state["ok"] or {}
    out["data_from"] = ok.get("first_day")
    out["data_to"] = ok.get("last_day")
    out["data_days"] = ontime.data_days(db)
    out["product_options"] = ontime.product_options(db, d0, d1)
    out["read"] = state
    out["is_admin"] = payload.get("role") == "admin"
    return out


@router.get("/product")
def get_product(
    material: str = Query(...),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page("ontime")),
):
    """One product, day by day and wave by wave — the working behind its row."""
    d0, d1 = _window(db, date_from, date_to)
    return ontime.product(db, material.strip(), d0, d1)


@router.get("/read")
def get_read(db: Session = Depends(get_db), _: dict = Depends(require_page("ontime"))):
    return ontime_sync.read_state(db)


@router.post("/read")
def start_read(db: Session = Depends(get_db), payload: dict = Depends(require_page("ontime"))):
    """Read the sheet now (admin). Runs on a thread of its own and answers at
    once; the page polls `GET /read` until it lands."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    if not ontime_sync.sheet_id(db):
        raise HTTPException(status_code=409, detail={"code": "not_configured"})
    who = payload.get("full_name") or payload.get("sub") or "admin"
    started = ontime_sync.start_read(f"admin:{who}")
    action_log.enrich(details=[("started", started)])
    return {"started": started, "read": ontime_sync.read_state(db)}
