"""«Brigadirlar reytingi» (/leaderboard) — the board's real figures.

The rule lives in `services/brigadir_board.py`; this door decides the scope
(plant lock, shift, the viewer's reach — `scoped_manager_ids`), keeps one
answer per scope for `_TTL` seconds, and adds the checklist pool «Lider
nazorati» is scored from in the browser (`checklist_pool`). Admin-only until
the operator opens the page on the Access tab (`DEFAULT_PAGE_ACCESS`).
"""
from __future__ import annotations

import threading
from datetime import date, datetime
from io import BytesIO
from time import monotonic
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services import action_log, brigadir_board as bb
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.ojidaniya_matrix import TZ, today_local
from app.services.shared_build import SharedBuild
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

PAGE = "leaderboard"

# One answer per (grain, period, scope) is kept this long. A build reads the
# загрузка and the attendance of every unit over the whole history (8 weeks,
# 8 months, up to 4 years), so it is the price of one /zagruzka of that span;
# a ranking that moves once a day can be a couple of minutes old.
_TTL = 120.0
_cache: dict = {}
_cache_lock = threading.Lock()
_SHARED = SharedBuild()


def _iso(d: date) -> str:
    return d.isoformat()


def checklist_pool(db: Session, units: dict[int, str], d_from: date, d_to: date) -> dict:
    """The /leaders standing pool, windowed to the history and cut to the
    board's units, in the wire shape `/api/leaders/standing` uses — so the
    browser scores it with the same functions the /leaders brigadir ranking
    is scored with.

    Every LEADER is an opaque code (`leaders._pool_codes`, drawn afresh per
    build): the board ranks units, and a leader's daily score is not what it
    is for. A unit is its manager id. `units` = id → the label the register
    groups that unit's rows under."""
    from app.routers import leaders as lr        # lazily: a router's pool

    pool = lr._standing_pool(db)
    by_label: dict[str, int] = {}
    for mid, (label, _shift) in (pool.get("units") or {}).items():
        if mid in units and label and label not in by_label:
            by_label[label] = mid
    lo, hi = _iso(d_from), _iso(d_to)
    rows = [r for r in pool["rows"] if lo <= r[0] <= hi and r[3] in by_label]
    roster = [p for p in pool["roster"] if p[2] in by_label]
    names = {r[1] for r in rows} | {p[1] for p in roster} | set(pool["cutoffs"])
    name_of, _ = lr._pool_codes(names, set())
    unit_key = lambda label: str(by_label[label])  # noqa: E731
    return {
        "rows": [[r[0], name_of.get(r[1], r[1]), r[2], unit_key(r[3]), r[4], r[5], r[6], r[7], r[8]]
                 for r in rows],
        "roster": [[name_of.get(p[1], p[1]), unit_key(p[2]), p[3], p[4], p[5], p[6],
                    1 if p[1] in pool["filed"] else 0, p[7],
                    p[8] if len(p) > 8 else None, p[9] if len(p) > 9 else None]
                   for p in roster],
        "cutoffs": {name_of[k]: {"from": v} for k, v in pool["cutoffs"].items() if k in name_of},
        "cutUnits": {unit_key(k): {"from": v} for k, v in pool["cutUnits"].items() if k in by_label},
    }


def _build(db: Session, payload: dict, grain: str, anchor: date, scoped, shift) -> dict:
    today = today_local()
    # Nothing ever closed: the picked period alone, never four empty years.
    pers = bb.periods(grain, anchor, today, bb.data_floor(db) or today)
    managers = bb.board_units(db, scoped, shift)
    ids = {m.id for m in managers}
    d_from, d_to = pers[0]["from"], pers[-1]["to"]

    eff = att = xav = {}
    pool = {"rows": [], "roster": [], "cutoffs": {}, "cutUnits": {}}
    if ids:
        metrics = build_metrics_list(db, d_from, d_to, None, sorted(ids), require_closed=True)
        eff = bb.efficiency(metrics, ids, pers)
        from app.routers.workers import get_headcount   # the page's own figure
        head = get_headcount(date_from=d_from, date_to=d_to, shift=None, manager_id=sorted(ids),
                             factory=None, db=db, payload=payload)
        att = bb.attendance(head, ids, pers)
        xav = bb.concerns(db, ids, pers)
        pool = checklist_pool(db, {m.id: m.name for m in managers}, d_from, d_to)

    keys = {m.id: identity.profile_key("supervisor", m.id) for m in managers}
    photos = identity.photo_versions(db, keys.values())
    factories = bb.factory_names(db)
    return {
        "grain": grain,
        "today": _iso(today),
        "periods": [{"from": _iso(p["from"]), "to": _iso(p["to"]), "end": _iso(p["end"]),
                     "partial": p["partial"]} for p in pers],
        "units": [{
            "id": m.id, "name": m.name, "shift": m.shift,
            "factory_id": m.factory_id,
            "factory": factories.get(m.factory_id) if m.factory_id else None,
            "profile_key": keys[m.id], "photo_ver": photos.get(keys[m.id]),
        } for m in managers],
        "figures": {str(mid): {"eff": eff.get(mid), "att": att.get(mid), "xav": xav.get(mid)}
                    for mid in ids},
        "checklist": pool,
        "kaizen": {"live": False},
        "built_at": datetime.now(TZ).isoformat(timespec="seconds"),
    }


@router.get("")
def get_leaderboard(
    grain: str = Query(default="week"),
    anchor: Optional[date] = Query(default=None),
    factory: Optional[int] = Query(default=None),
    shift: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The board for one period and the history of periods ending with it.

    `grain` week | month | year, `anchor` any day of the period (today when
    omitted, never later). Scoped like /zagruzka: a supervisor or leader is
    locked to their plant, `factory` narrows the rest."""
    if grain not in bb.GRAINS:
        raise HTTPException(status_code=400, detail="grain must be week, month or year")
    if shift not in (None, 1, 2):
        raise HTTPException(status_code=400, detail="shift must be 1 or 2")
    today = today_local()
    anchor = min(anchor or today, today)
    scoped = scoped_manager_ids(db, payload, factory, [])
    if empty_scope(scoped):
        scoped = []
    start = bb.period_of(grain, anchor)[0]
    key = (grain, start, today, None if scoped is None else tuple(sorted(scoped)), shift)
    now = monotonic()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and now - hit[0] < _TTL:
            return hit[1]

    def build():
        out = _build(db, payload, grain, anchor, scoped, shift)
        with _cache_lock:
            for k in [k for k, (at, _) in _cache.items() if monotonic() - at >= _TTL]:
                _cache.pop(k, None)
            _cache[key] = (monotonic(), out)
        return out

    return _SHARED.run(key, build, before_wait=db.rollback)


# ── Excel ───────────────────────────────────────────────────────────────────
class ExportRow(BaseModel):
    place: Optional[int] = None
    move: Optional[int] = None
    name: str
    shift: Optional[int] = None
    factory: Optional[str] = None
    score: Optional[float] = None
    values: dict[str, Optional[float]] = {}


class ExportIn(BaseModel):
    title: str = "Brigadirlar reytingi"
    period: str = ""
    scope: str = ""
    filename: Optional[str] = None
    caption: Optional[str] = None
    columns: list[dict[str, Any]] = []     # [{key, label}] in screen order
    labels: dict[str, str] = {}            # place, brigadir, shift, factory, score, move, generated, weights
    weights: str = ""
    rows: list[ExportRow] = []


def _band(v: Optional[float]) -> Optional[str]:
    """The page's own band rule (80 / 65) — the colours the board paints."""
    from app.services.quality_export import AMBER, GREEN, RED
    if v is None:
        return None
    return GREEN if v >= 80 else AMBER if v >= 65 else RED


def build_workbook(body: ExportIn) -> BytesIO:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font
    from app.services.quality_export import (
        BOX, FONT, INK, INK_SOFT, LEFT, TINT, _banner, _block, _fill, _head_row, _meta_strip, _sheet,
    )

    lb = body.labels
    cols = [c for c in body.columns if c.get("key")]
    head = [lb.get("place", "O'rin"), lb.get("brigadir", "Brigadir"), lb.get("shift", "Smena"),
            lb.get("factory", "Zavod"), lb.get("score", "Umumiy ball")] + [c.get("label") or c["key"] for c in cols]
    n = len(head)
    widths = {2: 8, 3: 30, 4: 8, 5: 14, 6: 12}
    for i in range(len(cols)):
        widths[7 + i] = 13
    wb = Workbook()
    wb.remove(wb.active)
    ws = _sheet(wb, lb.get("sheet", "Reyting"), widths, landscape=True)
    row = _banner(ws, 1, 2, 1 + n, body.title, body.period)
    meta = [{"label": lb.get("periodLabel", "Davr"), "value": body.period},
            {"label": lb.get("scopeLabel", "Doira"), "value": body.scope or "—"},
            {"label": lb.get("generated", "Tayyorlandi"), "value": datetime.now(TZ).strftime("%d.%m.%Y %H:%M")}]
    if body.weights:
        meta.append({"label": lb.get("weightsLabel", "Vaznlar"), "value": body.weights})
    row = _meta_strip(ws, row, 2, 1 + n, meta)
    _head_row(ws, row, 2, head)
    ws.freeze_panes = ws.cell(row + 1, 4)
    row += 1
    for r in body.rows:
        ws.row_dimensions[row].height = 18
        cells = [r.place, r.name, f"S{r.shift}" if r.shift else "—", r.factory or "—",
                 round(r.score, 1) if r.score is not None else "—"]
        for i, v in enumerate(cells):
            c = 2 + i
            _block(ws, row, c, row, c, v, border=BOX,
                   font=Font(name=FONT, size=10, bold=i in (0, 4), color=INK),
                   align=LEFT if i == 1 else Alignment(horizontal="center", vertical="center"),
                   fmt="0.0" if i == 4 and isinstance(v, float) else None,
                   fill=_fill(TINT[_band(r.score)]) if i == 4 and _band(r.score) else None)
        for j, col in enumerate(cols):
            v = r.values.get(col["key"])
            tone = _band(min(v, 100) if v is not None else None)
            _block(ws, row, 7 + j, row, 7 + j, v if v is not None else "—", border=BOX,
                   font=Font(name=FONT, size=10, color=INK if v is not None else INK_SOFT),
                   align=Alignment(horizontal="center", vertical="center"),
                   fmt='0"%"' if v is not None else None,
                   fill=_fill(TINT[tone]) if tone else None)
        row += 1
    if cols and lb.get("note"):
        _block(ws, row + 1, 2, row + 1, 1 + n, lb["note"],
               font=Font(name=FONT, size=9, color=INK_SOFT),
               align=Alignment(horizontal="left", vertical="top", wrap_text=True, indent=1))
        ws.row_dimensions[row + 1].height = 30
    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)
    return bio


@router.post("/export.xlsx")
def export_xlsx(
    request: Request,
    body: ExportIn,
    payload: dict = Depends(require_page(PAGE)),
):
    """The board as the page ranks it — the browser sends the rows it drew
    (every figure came from `GET /api/leaderboard`; «Lider nazorati» and the
    composite are scored there), the server lays them out. A browser
    downloads it; inside Telegram it lands in the caller's chat."""
    if len(body.rows) > 400 or len(body.columns) > 12:
        raise HTTPException(status_code=400, detail="too many rows")
    fname = (body.filename or "brigadirlar-reytingi").strip() or "brigadirlar-reytingi"
    if not fname.endswith(".xlsx"):
        fname += ".xlsx"
    data = build_workbook(body).read()
    resp = deliver_xlsx(request, payload, fname, data, body.caption or f"📊 {body.title}")
    action_log.enrich(target_kind="report", target_id=fname, target_name=body.title,
                      details=[("file", fname), ("period", body.period), ("rows", len(body.rows)),
                               ("size", len(data))])
    return resp
