"""«Oshxona» (/kitchen) — the people at work in the factory right now, read from
Verifix (`services/kitchen.py`). Counts and department names only. Gated on the
`kitchen` page key: admin-only until the operator opens it on the Access tab.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import kitchen, verifix

router = APIRouter(prefix="/api/kitchen", tags=["kitchen"])


# A plain `def`: the first read of a snapshot waits on Verifix (threadpool).
@router.get("/now", dependencies=[Depends(require_page("kitchen"))])
def now(db: Session = Depends(get_db)):
    try:
        return kitchen.headcount(db)
    except verifix.VerifixError as exc:
        raise HTTPException(status_code=502, detail={"code": exc.code, "message": exc.message})
