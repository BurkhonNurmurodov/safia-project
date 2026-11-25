"""«Oshxona» (/kitchen) — the people at work in the factory right now, read from
Verifix (`services/kitchen.py`). Counts and department names only. Gated on the
`kitchen` page key: admin-only until the operator opens it on the Access tab.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import kitchen, verifix, verifix_live

router = APIRouter(prefix="/api/kitchen", tags=["kitchen"])


# A plain `def`: the first read of a snapshot waits on Verifix (threadpool).
# `day`: a past day, or tomorrow's forecast — never further ahead.
@router.get("/now", dependencies=[Depends(require_page("kitchen"))])
def now(day: Optional[date] = None, db: Session = Depends(get_db)):
    today = verifix_live.now_local().date()
    if day and day > today + timedelta(days=1):
        raise HTTPException(status_code=400, detail={"code": "future"})
    if day and day != today:
        try:
            return kitchen.other_day(db, day)
        except TimeoutError:                         # another day's read holds the line: ask again
            raise HTTPException(status_code=424, detail={"code": "busy"})
        except verifix.VerifixError as exc:          # 424, never 502: the client reads that as a restart
            raise HTTPException(status_code=424, detail={"code": exc.code, "message": exc.message})
    try:
        return kitchen.headcount(db)
    except verifix.VerifixError as exc:
        raise HTTPException(status_code=502, detail={"code": exc.code, "message": exc.message})
