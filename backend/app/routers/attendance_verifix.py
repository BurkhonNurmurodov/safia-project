"""«Davomat (Verifix)» — the admin tab that reads the «Davomat» day from
Verifix instead of an Excel file (TEST, from 2026-10-04).
`services/verifix_attendance.py` is the whole of it; nothing else reads what
it stores. Admin-only, like the Verifix card: it reads every counted cell's
attendance with the platform's Verifix login.

Errors are answers, the «Verifix (test)» convention: 409 ``not_configured``
(no login on the card) and 424 ``{code, message, status}`` when Verifix
refused or failed — never 502/503, which the client reads as a restart.
"""
from datetime import date as date_t, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.services import action_log, verifix
from app.services import verifix_attendance as va

router = APIRouter(prefix="/api/attendance-verifix", tags=["attendance-verifix"])


def _parse_date(s: str) -> date_t:
    try:
        return datetime.strptime((s or "").strip(), "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date (expected YYYY-MM-DD)")


@router.get("")
def get_day(date: str = Query(...), db: Session = Depends(get_db),
            _: dict = Depends(verify_admin)):
    return va.payload(db, _parse_date(date))


class FetchBody(BaseModel):
    date: str


@router.post("/fetch")
def fetch_day(body: FetchBody, db: Session = Depends(get_db),
              payload: dict = Depends(verify_admin)):
    """Read the day from Verifix (the counted cells only) and store it apart,
    replacing an earlier read of the same day. Up to ~70 s."""
    d = _parse_date(body.date)
    if d > datetime.now(verifix.TZ).date():
        raise HTTPException(status_code=400, detail={
            "code": "future", "message": "A day that has not come yet has nothing to read"})
    try:
        res = va.fetch_day(db, d, by=payload.get("full_name") or "")
    except va.NotConfigured:
        raise HTTPException(status_code=409, detail={
            "code": "not_configured", "message": "No Verifix login on the admin «Verifix» card"})
    except verifix.VerifixError as exc:
        raise HTTPException(status_code=424, detail={
            "code": exc.code, "message": (exc.message or exc.code)[:500], "status": exc.status})
    details = [("cells", res["cells"]), ("workers", res["rows"])]
    if res["partial"]:
        details.append(("partial", True))
    action_log.enrich(day=d, details=details)
    return va.payload(db, d)
