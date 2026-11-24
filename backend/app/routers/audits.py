"""«Auditlar» (/audits) — the KRU and technical audits read from
panel.safiabakery.uz (services/panel_audits.py, docs/audits.md).

Page key `audits`: admins always, anybody else by a role tick or a personal
grant on the Permissions tab. «Yangilash» reads the panel with the login stored
on the «Panel: audit minuslari» card; the login itself stays on that card.
"""
import logging
import threading
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.routers.verifix import _who
from app.services import action_log, panel_audits as pa, sd_panel
from app.services.verifix import TZ

router = APIRouter(prefix="/api/audits", tags=["audits"])
log = logging.getLogger(__name__)


def _kind(kind: str) -> str:
    if kind not in pa.KINDS:
        raise HTTPException(status_code=400, detail="kind must be kru or tech")
    return kind


def _period(date_from: Optional[str], date_to: Optional[str]) -> tuple[date, date]:
    today = datetime.now(TZ).date()
    try:
        d2 = date.fromisoformat(date_to) if date_to else today
        d1 = date.fromisoformat(date_from) if date_from else pa.first_of(d2)
    except ValueError:
        raise HTTPException(status_code=400, detail="dates are YYYY-MM-DD")
    if d1 > d2:
        d1, d2 = d2, d1
    return max(d1, date(2015, 1, 1)), d2


def _filters(workshop: list[str], inspector: list[str], task: list[str],
             question: Optional[str], top: bool, photo: Optional[str] = None) -> dict:
    return {"workshop": [w for w in workshop if w], "inspector": [i for i in inspector if i],
            "task": [t for t in task if t], "question": question or None, "top": top,
            "photo": photo if photo in ("yes", "no") else None}


@router.get("/meta")
def meta(kind: str = "tech", date_from: Optional[str] = None, date_to: Optional[str] = None,
         db: Session = Depends(get_db), _: dict = Depends(require_page("audits"))):
    k = _kind(kind)
    d1, d2 = _period(date_from, date_to)
    return {**pa.configured(db), "coverage": pa.coverage(db, k, d1, d2), "facets": pa.facets(db, k, d1, d2),
            "first_day": pa.first_day(db, k)}


@router.get("/rows")
def rows(kind: str = "tech", date_from: Optional[str] = None, date_to: Optional[str] = None,
         workshop: list[str] = Query(default=[]), inspector: list[str] = Query(default=[]),
         task: list[str] = Query(default=[]), question: Optional[str] = None, top: bool = False,
         photo: Optional[str] = None, q: str = "", sort: str = "day", dir: str = "desc", page: int = 1,
         size: int = Query(default=50, ge=10, le=200),
         db: Session = Depends(get_db), _: dict = Depends(require_page("audits"))):
    k = _kind(kind)
    d1, d2 = _period(date_from, date_to)
    return pa.rows(db, k, d1, d2, _filters(workshop, inspector, task, question, top, photo), q=q[:200],
                   sort=sort, desc=dir != "asc", page=page, size=size)


@router.get("/analysis")
def analysis(kind: str = "tech", date_from: Optional[str] = None, date_to: Optional[str] = None,
             workshop: list[str] = Query(default=[]), inspector: list[str] = Query(default=[]),
             task: list[str] = Query(default=[]), question: Optional[str] = None, top: bool = False,
             photo: Optional[str] = None,
             db: Session = Depends(get_db), _: dict = Depends(require_page("audits"))):
    k = _kind(kind)
    d1, d2 = _period(date_from, date_to)
    return pa.analysis(db, k, d1, d2, _filters(workshop, inspector, task, question, top, photo))


@router.get("/photo/{path:path}")
def photo(path: str, s: Optional[int] = None, db: Session = Depends(get_db),
          _: dict = Depends(require_page("audits"))):
    """One audit photo, fetched from the panel — only a file some section
    page linked (`panel_audit_photos`), never any other address. ``s`` is the
    size the tile draws at: up to PHOTO_SIDE it is scaled down to that, else
    (or without it) the panel's own file. The URL is the panel's file name,
    which never changes content, so the browser keeps the answer
    (app/browser_cache.py)."""
    p = "/" + path.lstrip("/")
    if not sd_panel.PHOTO_PATH.fullmatch(p) or not pa.photo_known(db, p):
        raise HTTPException(status_code=404, detail="No photo")
    db.rollback()  # hand the connection back for the network wait
    try:
        data, mime = pa.photo_bytes(p, pa.PHOTO_SIDE if s and s <= pa.PHOTO_SIDE else None)
    except sd_panel.PanelError as e:
        log.info("audits: photo %s not given — %s %s", p, e.code, e.status or "")
        raise HTTPException(status_code=502, detail="The panel did not give the photo")
    return Response(content=data, media_type=mime,
                    headers={"Cache-Control": "private, max-age=31536000, immutable"})


class RefreshIn(BaseModel):
    kind: Optional[str] = None       # None = both
    date_from: Optional[str] = None
    date_to: Optional[str] = None


@router.post("/refresh")
def refresh(body: RefreshIn, db: Session = Depends(get_db), who: dict = Depends(require_page("audits"))):
    kinds = [_kind(body.kind)] if body.kind else list(pa.KINDS)
    d1, d2 = _period(body.date_from, body.date_to)
    # The newest months first: a press over «Barcha vaqt» reads the last six.
    months = pa.months_between(d1, d2)[-pa.MAX_MONTHS:]
    res = pa.refresh(db, kinds, months, actor=_who(who))
    if res.get("results"):  # the months just read get their photos too, off the request
        threading.Thread(target=pa.photos_job, name="audit-photos", daemon=True).start()
    action_log.enrich(target_kind="setting", target_id="panel_audits", target_name="Auditlar",
                      details=[("kinds", ",".join(kinds)), ("months", len(months)),
                               ("result", "ok" if res.get("ok") else res.get("code") or "partial")])
    return res
