"""`/api/brigadirs-kpi` — «Brigadirlar KPI» (`/brigadirs-kpi`): HR's monthly
brigadir KPI, the two criteria the platform answers (turnover, OKK) computed
and the three it has no source for (mentoring, KRU, payout) left as places.

Page key ``brigadirs-kpi`` — ADMIN-ONLY until the operator opens it on the
Access tab (`permissions.DEFAULT_PAGE_ACCESS`). `services/brigadirs_kpi.py`
is THE rule; this module only parses, scopes, keeps and delivers.

The month is KEPT a minute (`services/kept_answer.py`, the /api/leaders-kpi
keep): keyed by the month, the plant's date, the scope, the viewer's lock,
the last turnover read, the Quality sync and the stored Verifix org — so a read
or a sync that lands is a new key. A viewer who changed something since the
kept answer was built always gets a new one.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LiveVerifixRead, QualitySyncMeta
from app.permissions import require_page
from app.services import action_log, brigadirs_kpi, turnover, verifix_org
from app.capabilities import page_scope_is_all
from app.services.factory_scope import resolve_factory, scoped_manager_ids
from app.services.kept_answer import KeptAnswers
from app.xlsx_delivery import deliver_file

router = APIRouter(prefix="/api/brigadirs-kpi", tags=["brigadirs-kpi"])

PAGE = "brigadirs-kpi"
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

_KEPT = KeptAnswers("brigadirs-kpi", ttl=60, stale=300, max_keys=24, writer_waits=True)


def _month(raw: Optional[str]):
    if raw in (None, ""):
        return brigadirs_kpi.default_month()
    m = turnover.parse_month(raw)
    if m is None:
        raise HTTPException(status_code=400, detail={"code": "bad_month", "message": "month must be YYYY-MM"})
    return m


def _ids(raw) -> list[int]:
    if raw is None:
        return []
    if isinstance(raw, (list, tuple, set)):
        return sorted({int(x) for x in raw})
    return sorted({int(p) for p in str(raw).split(",") if p.strip().isdigit()})


def _lock(db: Session, payload: dict) -> Optional[list]:
    """The units this viewer may see — None = every unit, an EMPTY list =
    nobody. A brigadir's KPI is theirs and their managers'; a leader reads none."""
    from app.routers.concerns import _shift_unit_ids

    role = payload.get("role")
    if role in ("admin", "top-manager"):
        return None
    if page_scope_is_all(db, payload, PAGE):
        return None
    if role == "supervisor":
        return [payload.get("role_id")]
    if role == "shift-manager":
        return _shift_unit_ids(db, payload.get("role_id"))
    return []


def _scope(db: Session, payload: dict, factory: Optional[int], shift: Optional[int], managers) -> dict:
    ids = _ids(managers)
    # The plant as resolved for this viewer (a locked one reads their own,
    # whatever `factory` says) — what a Verifix brigadir's row is judged by.
    return {"factory": resolve_factory(db, payload, factory), "shift": shift if shift in (1, 2) else None,
            "managers": ids, "units": scoped_manager_ids(db, payload, factory, ids)}


def _key(db: Session, m, scope: dict, lock) -> tuple:
    now = turnover.now_aware()
    tread = turnover.last_read(db)
    tstate, _row = turnover.month_state(db, m, turnover.local(now))
    qs = db.query(QualitySyncMeta.last_synced).filter(QualitySyncMeta.id == 1).scalar()
    org_at = (db.query(LiveVerifixRead.read_at)
              .filter(LiveVerifixRead.key == verifix_org.ORG_KEY).scalar())
    return (turnover.ym(m), turnover.local(now).date().isoformat(),
            scope.get("factory"), scope.get("shift"), tuple(scope.get("managers") or ()),
            None if scope.get("units") is None else tuple(sorted(scope["units"])),
            None if lock is None else tuple(sorted(x for x in lock if x is not None)),
            (tread.id, tread.finished_at.isoformat() if tread and tread.finished_at else None) if tread else None,
            tstate, qs.isoformat() if qs else None, org_at.isoformat() if org_at else None)


@router.get("")
def month(
    month: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    managers: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The month's brigadir KPI within the scope — every tab from one request."""
    m = _month(month)
    scope = _scope(db, payload, factory, shift, managers)
    lock = _lock(db, payload)
    key = _key(db, m, scope, lock)
    return _KEPT.get(db, payload, key, lambda s: brigadirs_kpi.board(s, m, scope, lock))


class ExportIn(BaseModel):
    month: str
    factory: Optional[int] = None
    shift: Optional[int] = None
    managers: list[int] = []
    title: str = ""
    subtitle: str = ""
    filename: str = ""
    caption: str = ""
    labels: dict = {}
    order: list[str] = []


@router.post("/export.xlsx")
def export_xlsx(
    request: Request,
    body: ExportIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The month as the page shows it — the board, the turnover cells and the
    OKK records — in the reader's words. A browser downloads it; inside
    Telegram it lands in the caller's chat (app/xlsx_delivery.py)."""
    from app.services.brigadirs_kpi_export import build_workbook

    m = _month(body.month)
    scope = _scope(db, payload, body.factory, body.shift, body.managers)
    pay = brigadirs_kpi.board(db, m, scope, _lock(db, payload))
    if pay.get("state") in ("before", "future"):
        raise HTTPException(status_code=409, detail={"code": "no_month", "message": "nothing to export"})
    bio = build_workbook({"title": body.title or f"Brigadirlar KPI — {turnover.ym(m)}",
                          "subtitle": body.subtitle, "labels": body.labels, "order": body.order,
                          "payload": pay})
    fname = (body.filename or f"brigadirs-kpi-{turnover.ym(m)}").strip() or f"brigadirs-kpi-{turnover.ym(m)}"
    if not fname.endswith(".xlsx"):
        fname += ".xlsx"
    data = bio.read()
    resp = deliver_file(request, payload, fname, data, XLSX, body.caption or f"📊 {body.title or fname}")
    action_log.enrich(target_kind="report", target_id=fname, target_name=body.title or fname,
                      details=[("file", fname), ("month", turnover.ym(m)), ("size", len(data)),
                               ("brigadirs", len(pay.get("rows") or []))])
    return resp
