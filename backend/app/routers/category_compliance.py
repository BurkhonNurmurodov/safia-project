"""`/api/category-compliance` — «Toifaga muvofiqlik», the leaders'
category-compliance KPI, month by month from Verifix's HR journals and HR's
grade ladder.

Page key ``leaders-kpi`` — the «Muvofiqlik» tab of «Liderlar KPI»
(`/leaders-kpi`), ADMIN-ONLY until the operator opens it on the Access tab
(`permissions.DEFAULT_PAGE_ACCESS`). The month's figures ride the board
(`/api/leaders-kpi`, services/leaders_kpi); what stays here is the explain
dialog's people list, the read states, the Verifix read and the rule —
re-reading Verifix and editing the rule are admin-only in the endpoint,
whatever a UI draws. `services/category_compliance.py` is THE rule; this
module only parses, scopes and delivers.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, category_compliance as cc, category_sync, turnover

router = APIRouter(prefix="/api/category-compliance", tags=["category-compliance"])

# The page key of «Liderlar KPI» — the compliance tab of the merged page (2026-10-19).
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


def _who(payload: dict) -> str:
    return (payload.get("full_name") or payload.get("sub") or "admin")[:120]


@router.get("")
def month(
    month: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    managers: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE)),
):
    """Everything a page shows for one month, within the scope: the ranking
    (one row per owned cell, worst first), every cell, the totals, the
    notices (jobs with no ladder, the ambiguous ones, codes not on /cells,
    cells with no owner), the rule, and the state of both Verifix reads."""
    return cc.month_payload(db, _month(month), _scope(factory, shift, managers))


@router.get("/people")
def people(
    month: Optional[str] = Query(None),
    keys: str = Query(""),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE)),
):
    """Who was judged in these cells (by code key) and how — job, ladder,
    tenure, the expected and the actual category, the verdict. The explain
    dialog's list, asked only when it opens."""
    want = [k.strip() for k in keys.split(",") if k.strip()][:40]
    return cc.people_of(db, _month(month), want)


@router.get("/read")
def read_status(db: Session = Depends(get_db), _: dict = Depends(require_page(PAGE))):
    """The state of the journals read (this KPI's) and of the directory read
    (the turnover KPI's, which places people)."""
    return {"read": cc.read_info(db), "directory": turnover.read_info(db), "configured": cc._configured(db)}


@router.post("/read")
def read_now(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Start a read of the three HR journals in the background; the page
    polls `/read`."""
    if not category_sync.configured(db):
        raise HTTPException(status_code=409, detail={"code": "not_configured",
                                                     "message": "Verifix is not connected"})
    if category_sync.running(db):
        return {"started": False, "reason": "busy", **cc.read_info(db)}
    started = category_sync.start_read(f"admin:{_who(admin)}")
    return {"started": started, "reason": None if started else "busy", **cc.read_info(db)}


@router.get("/rule")
def get_rule(db: Session = Depends(get_db), _: dict = Depends(require_page(PAGE))):
    """The rule in force, HR's defaults, and what an admin stored (with the
    reason it is not in force, when it is not)."""
    stored, problem = cc.stored_rule(db)
    return {"rule": cc.rule(db), "default": cc.DEFAULT_RULE, "stored": stored, "problem": problem}


class RuleIn(BaseModel):
    # The override — any subset of the rule's keys; absent keys keep HR's
    # defaults. `reset` drops the override altogether.
    rule: Optional[dict[str, Any]] = None
    reset: bool = False


@router.put("/rule")
def put_rule(body: RuleIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Store the override (validated whole — a bad part refuses the save with
    its reason, nothing is written) or go back to the defaults."""
    try:
        r = cc.save_rule(db, None if body.reset else (body.rule or {}))
        db.commit()
    except cc.BadRule as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": "bad_rule", "message": str(exc)})
    changed = sorted((body.rule or {}).keys()) if not body.reset else ["reset"]
    action_log.enrich(target_kind="setting", target_id=cc.RULE_KEY, target_name="category_rule",
                      details=[("by", _who(admin)), ("keys", ", ".join(changed) or "—"),
                               ("mode", r["mode"]), ("weight", r["weight"]),
                               ("ladders", len(r["ladders"])), ("jobs", len(r["jobs"]))])
    return {"rule": r, "stored": None if body.reset else body.rule, "problem": None}
