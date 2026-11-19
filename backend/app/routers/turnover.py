"""`/api/turnover` — «Kadrlar qo'nimsizligi», the leaders' turnover KPI, month
by month from October 2026 — the «Qo'nimsizlik» tab of «Liderlar KPI»
(`/leaders-kpi`, 2026-10-19; the page `/turnover` is retired behind a redirect).

Page key ``leaders-kpi`` — ADMIN-ONLY until the operator opens it on the Access
tab (`permissions.DEFAULT_PAGE_ACCESS`). The month's figures ride the board
(`/api/leaders-kpi`, services/leaders_kpi); what stays here is the explain
dialog's people list and the «Sabablar» dialog. Reading Verifix, closing and
computing a month belong to «Qayta hisoblash» (`services/kpi_recalc.py`); the
old `/read`, `/close`, `/reopen` and `/compute` doors were removed on
2026-11-16, their buttons long gone. The workbook is the merged page's
(`/api/leaders-kpi/export.xlsx`). `services/turnover.py` is THE rule; this
module only parses, scopes and delivers.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.capabilities import require_page_admin
from app.services import action_log, kept_answer, turnover

router = APIRouter(prefix="/api/turnover", tags=["turnover"])

# The page key of «Liderlar KPI» — the turnover tab of the merged page (2026-10-19).
PAGE = "leaders-kpi"


def _month(raw: Optional[str]):
    if raw in (None, ""):
        today = turnover.local(turnover.now_aware()).date()
        return max(turnover.month_start(today), turnover.START_MONTH)
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
    """Everything the page shows for one month, within the scope."""
    return turnover.month_payload(db, _month(month), _scope(factory, shift, managers))


@router.get("/people")
def people(
    month: Optional[str] = Query(None),
    keys: str = Query(""),
    db: Session = Depends(get_db),
    _: dict = Depends(require_page(PAGE)),
):
    """Who was counted as working in these cells (by code key) — the explain
    dialog's list, asked only when it opens."""
    want = [k.strip() for k in keys.split(",") if k.strip()][:40]
    return turnover.people_of(db, _month(month), want)


# ── the dismissal reasons that do not count (admin) ───────────────────────────

@router.get("/exclusions")
def exclusions(month: Optional[str] = Query(None), db: Session = Depends(get_db),
               _: dict = Depends(require_page_admin("leaders-kpi"))):
    """Every reason Verifix has given for a dismissal, with how many left for it
    in this month and whether it is excluded — the «Sabablar» dialog's list."""
    return turnover.reasons_seen(db, _month(month))


@router.get("/exclusions/preview")
def exclusions_preview(month: Optional[str] = Query(None), reasons: list[str] = Query(default=[]),
                       db: Session = Depends(get_db), _: dict = Depends(require_page_admin("leaders-kpi"))):
    """What the plant's rate and the cells' scores would be with this list —
    nothing is stored. A closed or saved month keeps its own list (`applies`
    false)."""
    return turnover.exclusion_preview(db, _month(month), reasons)


class ExclusionsIn(BaseModel):
    reasons: list[str] = []
    month: Optional[str] = None     # the month the dialog was opened on


@router.put("/exclusions")
def save_exclusions(body: ExclusionsIn, db: Session = Depends(get_db), admin: dict = Depends(require_page_admin("leaders-kpi"))):
    """Set the reasons whose leavers are not counted. It reaches the open month
    and the ones after it. A CLOSED month the dialog was opened on is closed
    again with the new list in the same save (2026-11-16: October kept counting
    «Учёба» for days because the save never reached the closed month it was
    made on); other closed or saved months keep their own list until
    «Qayta hisoblash» is pressed on them."""
    if len(body.reasons) > turnover.MAX_EXCLUDED:
        raise HTTPException(status_code=400, detail={"code": "too_many",
                                                     "message": f"at most {turnover.MAX_EXCLUDED} reasons"})
    before = turnover.clean_reasons(turnover.rule(db).get("exclude_reasons"))
    saved = turnover.save_exclusions(db, body.reasons)
    m = _month(body.month) if body.month else None
    refrozen = None
    if m is not None and turnover.month_state(db, m)[0] == "closed":
        turnover.refreeze(db, m, _who(admin))
        refrozen = turnover.ym(m)
    db.commit()
    kept_answer.forget_all()
    was = {turnover.norm_reason(x) for x in before}
    now = {turnover.norm_reason(x) for x in saved}
    action_log.enrich(target_kind="setting", target_id=turnover.RULE_KEY, target_name="turnover_rule",
                      details=[("by", _who(admin)),
                               ("added", "; ".join(x for x in saved if turnover.norm_reason(x) not in was) or "—"),
                               ("removed", "; ".join(x for x in before if turnover.norm_reason(x) not in now) or "—"),
                               ("total", len(saved)), ("refrozen", refrozen or "—")])
    return {"exclude_reasons": saved, "refrozen": refrozen}
