"""`/api/leaders-kpi` — «Liderlar KPI» (`/leaders-kpi`): the leaders' five
KPIs on one page, as a leaderboard, month by month.

Page key ``leaders-kpi`` — ADMIN-ONLY until the operator opens it on the Access
tab (`permissions.DEFAULT_PAGE_ACCESS`). ONE read serves every tab (the board,
each KPI's own month payload, the rules); the register of concerns is paged
from `/api/worker-concerns/list`, the turnover month's actions stay on
`/api/turnover/*` and the Quality refresh on `/api/foreign-objects/refresh` —
all three re-gated on this page key. `services/leaders_kpi.py` is THE rule;
this module only parses, scopes, keeps and delivers.

The board is KEPT between requests (2026-10-24, `services/kept_answer.py`, the
/api/heatmap keep): one build is every KPI of the month — the plan half alone
is `plan_fulfillment.build` over every unit for every day so far — and the
page used to ask for it every 4 s for as long as a Verifix read ran. Keyed by
everything the answer depends on: the month, the plant's date, the scope
(plant · shift · brigadirs), the viewer's lock (the concerns half is counted
inside it) and the state of the two Verifix reads, so a read that starts or
finishes is a new key and is never answered from before it. A viewer who
changed something since the kept answer was built always gets a new one.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import action_log, category_compliance as cc, leaders_kpi, turnover
from app.services.factory_scope import scoped_manager_ids
from app.services.kept_answer import KeptAnswers
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


# Served as built for 60 s, then up to 5 min while one new build runs behind
# it; a viewer who wrote since never gets an older answer (`writer_waits`).
_KEPT = KeptAnswers("leaders-kpi", ttl=60, stale=300, max_keys=32, writer_waits=True)


def _ids_key(ids) -> Optional[tuple]:
    """None (not narrowed) stays None; a list — an EMPTY one is a real
    answer — becomes a sorted tuple."""
    return None if ids is None else tuple(sorted(ids))


def _read_stamp(row, stale_after, now) -> Optional[tuple]:
    """The last Verifix read, as the board's `read` half sees it: which read,
    whether it finished, whether it still counts as running."""
    if row is None:
        return None
    running = bool(row.finished_at is None and row.started_at is not None
                   and now - row.started_at < stale_after)
    return (row.id, row.finished_at.isoformat() if row.finished_at else None, running)


def _board_key(db: Session, payload: dict, m, scope: dict) -> tuple:
    # The concerns half applies the viewer lock and the plant lock
    # (`leaders_kpi._concerns_by_cell`); every other half is the scope alone.
    from app.routers import worker_concerns as wc

    lock_units, lock_leaders = wc._viewer_lock(db, payload)
    managers = sorted(scope.get("managers") or [])
    units = scoped_manager_ids(db, payload, scope.get("factory"), managers)
    now = turnover.now_aware()
    return (turnover.ym(m), turnover.local(now).date().isoformat(),
            scope.get("factory"), scope.get("shift"), tuple(managers),
            _ids_key(lock_units), _ids_key(lock_leaders), _ids_key(units),
            _read_stamp(turnover.last_read(db), turnover.READ_STALE, now),
            _read_stamp(cc.last_read(db), cc.READ_STALE, now))


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
    m = _month(month)
    scope = _scope(factory, shift, managers)
    key = _board_key(db, payload, m, scope)
    return _KEPT.get(db, payload, key, lambda s: leaders_kpi.board(s, payload, m, scope))


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
