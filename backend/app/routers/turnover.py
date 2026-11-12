"""`/api/turnover` — «Kadrlar qo'nimsizligi», the leaders' turnover KPI, month
by month from October 2026 — the «Qo'nimsizlik» tab of «Liderlar KPI»
(`/leaders-kpi`, 2026-10-19; the page `/turnover` is retired behind a redirect).

Page key ``leaders-kpi`` — ADMIN-ONLY until the operator opens it on the Access
tab (`permissions.DEFAULT_PAGE_ACCESS`). The month's figures ride the board
(`/api/leaders-kpi`, services/leaders_kpi); what stays here is the explain
dialog's people list and the month's actions — refreshing from Verifix,
closing, reopening and computing a past month are admin-only in the endpoint,
whatever the UI draws. The workbook is the merged page's
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
from app.routers.admin import verify_admin
from app.services import action_log, kept_answer, turnover, turnover_sync

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


@router.get("/read")
def read_status(db: Session = Depends(get_db), _: dict = Depends(require_page(PAGE))):
    return turnover.read_info(db)


@router.post("/read")
def read_now(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Start a read of Verifix in the background; the page polls `/read`."""
    if not turnover_sync.configured(db):
        raise HTTPException(status_code=409, detail={"code": "not_configured",
                                                     "message": "Verifix is not connected"})
    if turnover_sync.running(db):
        return {"started": False, "reason": "busy", **turnover.read_info(db)}
    started = turnover_sync.start_read(f"admin:{_who(admin)}")
    return {"started": started, "reason": None if started else "busy", **turnover.read_info(db)}


class MonthIn(BaseModel):
    month: str


@router.post("/close")
def close_month(body: MonthIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    m = _month(body.month)
    try:
        out = turnover.close(db, m, _who(admin))
        db.commit()
    except turnover.Refused as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message})
    action_log.enrich(target_kind="month", target_id=turnover.ym(m), target_name=turnover.ym(m),
                      details=[("leavers", out["leavers"])])
    return out


@router.post("/reopen")
def reopen_month(body: MonthIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    m = _month(body.month)
    try:
        out = turnover.reopen(db, m, _who(admin))
        db.commit()
    except turnover.Refused as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message})
    action_log.enrich(target_kind="month", target_id=turnover.ym(m), target_name=turnover.ym(m))
    return out


@router.post("/compute")
def compute_month(body: MonthIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """A PAST month (before the automatic start): read Verifix now, compute
    the month and save it — «Hisoblash» the first time, «Yangilash» after."""
    m = _month(body.month)
    if not (turnover.PAST_FROM <= m < turnover.START_MONTH):
        raise HTTPException(status_code=409, detail={"code": "not_past",
                                                     "message": "only months before the automatic start"})
    if not turnover_sync.configured(db):
        raise HTTPException(status_code=409, detail={"code": "not_configured",
                                                     "message": "Verifix is not connected"})
    if turnover_sync.running(db):
        return {"started": False, "reason": "busy", **turnover.read_info(db)}
    started = turnover_sync.start_read(f"compute:{turnover.ym(m)}", month=m, by=_who(admin))
    action_log.enrich(target_kind="month", target_id=turnover.ym(m), target_name=turnover.ym(m))
    return {"started": started, "reason": None if started else "busy", **turnover.read_info(db)}


# ── the dismissal reasons that do not count (admin) ───────────────────────────

@router.get("/exclusions")
def exclusions(month: Optional[str] = Query(None), db: Session = Depends(get_db),
               _: dict = Depends(verify_admin)):
    """Every reason Verifix has given for a dismissal, with how many left for it
    in this month and whether it is excluded — the «Sabablar» dialog's list."""
    return turnover.reasons_seen(db, _month(month))


@router.get("/exclusions/preview")
def exclusions_preview(month: Optional[str] = Query(None), reasons: list[str] = Query(default=[]),
                       db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """What the plant's rate and the cells' scores would be with this list —
    nothing is stored. A closed or saved month keeps its own list (`applies`
    false)."""
    return turnover.exclusion_preview(db, _month(month), reasons)


class ExclusionsIn(BaseModel):
    reasons: list[str] = []


@router.put("/exclusions")
def save_exclusions(body: ExclusionsIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Set the reasons whose leavers are not counted. It reaches the open month
    and the ones after it; a month that is already closed (or saved) keeps the
    list it was closed with until «Qayta hisoblash» is pressed on it."""
    if len(body.reasons) > turnover.MAX_EXCLUDED:
        raise HTTPException(status_code=400, detail={"code": "too_many",
                                                     "message": f"at most {turnover.MAX_EXCLUDED} reasons"})
    before = turnover.clean_reasons(turnover.rule(db).get("exclude_reasons"))
    saved = turnover.save_exclusions(db, body.reasons)
    db.commit()
    kept_answer.forget_all()
    was = {turnover.norm_reason(x) for x in before}
    now = {turnover.norm_reason(x) for x in saved}
    action_log.enrich(target_kind="setting", target_id=turnover.RULE_KEY, target_name="turnover_rule",
                      details=[("by", _who(admin)),
                               ("added", "; ".join(x for x in saved if turnover.norm_reason(x) not in was) or "—"),
                               ("removed", "; ".join(x for x in before if turnover.norm_reason(x) not in now) or "—"),
                               ("total", len(saved))])
    return {"exclude_reasons": saved}
