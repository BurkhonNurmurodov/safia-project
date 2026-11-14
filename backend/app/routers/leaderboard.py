"""«Brigadirlar reytingi» (/leaderboard) — the board's real figures.

The rule lives in `services/brigadir_board.py`; this door builds the WHOLE
board of a period — every unit, both shifts — keeps it (`_KEPT`: served at
once, recalculated behind the answer when it is not fresh, stored across
deploys), cuts it to the viewer's reach and filters (`cut`: plant lock, plant,
shift — `scoped_manager_ids`), and adds the checklist pool «Lider nazorati» is
scored from in the browser (`checklist_pool`). Admin-only until the operator
opens the page on the Access tab (`DEFAULT_PAGE_ACCESS`).
"""
from __future__ import annotations

import json
import threading
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.permissions import require_page
from app.routers.brigadirs import build_metrics_list
from app.services import action_log, brigadir_board as bb, gc_pause, kept_store, quality_attribution
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services.kept_answer import KeptAnswers
from app.services.ojidaniya_matrix import TZ, today_local
from app.xlsx_delivery import deliver_xlsx

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

PAGE = "leaderboard"

# The board is KEPT (2026-11-13 — the operator: «this screen is taking too much
# time to load and open»). A build reads the загрузка and the attendance of
# every unit over the whole history (8 weeks, 8 months, up to 4 years):
# measured on production that day, 3.4–3.8 s for the week and 10.1 s for the
# month — against 0.34 s when the answer was already in memory, which it
# rarely was. It lived ten minutes in a cache of this module, one entry per
# (period, plant filter, shift filter); the page is opened a few times a day
# and a backend deploy empties the process 5–24 times a day, so nearly every
# open, every step ‹ back and every filter was a whole recalculation.
#
# Now `KeptAnswers` + its store (services/kept_answer.py, kept_store.py — the
# rule «Hisobotlar» runs on) keep ONE answer per period: a unit's figures do
# not depend on who is looking or which plant and shift they picked, so the
# whole board is built once and each request is cut to its viewer (`cut`).
#   - Ten minutes as built (the old cache's own age — a ranking of closed
#     days moves once a day).
#   - Past that, and for a viewer who changed something since, served AT ONCE
#     while one build runs behind the answer; the answer says `refreshing` and
#     the page asks again every few seconds until the new board is in.
#   - A board ANOTHER process built (the worker before a deploy) is served at
#     once from the store, however old, and rebuilt behind the reader.
# So a request waits for a build only when a period was never built at all —
# `stale` is as long as a stored row lives.
#
# What is kept is the answer ENCODED, as text (`_encode`): returned as a dict
# it was walked and encoded again on every request, 0.1–0.2 s of the event
# loop each time for a board nothing had changed in.
#
# FORMAT is the SHAPE of the payload `_build` returns, as the page reads it.
# It rides the key, so a stored board of another shape is never served: bump
# it whenever a release renames or re-shapes a field of that payload.
FORMAT = 1
_KEEP_DAYS = 45
_KEPT = KeptAnswers("leaderboard", ttl=600, stale=_KEEP_DAYS * 86400, max_keys=12,
                    writers_refresh=True,
                    store=kept_store.DbStore("leaderboard", max_age_days=_KEEP_DAYS))
# ONE build at a time across every key (2026-10-23). A build is seconds of
# Python over the whole history, holding the GIL while it runs; three grains
# opened together ran three of them side by side and lifted every other
# request's latency with them. Queued, the server pays one build's worth at a
# time — a background rebuild takes the same turn; the request waiting holds no
# DB connection (it hands it back first), and gives up with a 503 after
# BUILD_WAIT_S.
_ONE_BUILD = threading.Semaphore(1)
BUILD_WAIT_S = 90.0

# Who a build reads as: nobody. What is kept is the whole board and each
# request is cut to its viewer afterwards (`cut`), so a build must never be
# narrowed by whoever happened to ask first — a locked viewer's plant, say.
_SYSTEM: dict = {"role": None}

# Put in front of the kept answer while a newer one is being calculated: the
# page asks again every few seconds for as long as it reads this.
_REFRESHING = '{"refreshing":true,'


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
    # A leader who MOVED is on the board while any of their spans is
    # (`leader_follow`) — the span on another unit leaves with that unit.
    spans = lambda p: (p[10] or []) if len(p) > 10 else []  # noqa: E731
    roster = [p for p in pool["roster"]
              if p[2] in by_label or any(u[0] in by_label for u in spans(p))]
    names = {r[1] for r in rows} | {p[1] for p in roster} | set(pool["cutoffs"])
    name_of, _ = lr._pool_codes(names, set())
    unit_key = lambda label: str(by_label[label])  # noqa: E731

    def unit_of(label):
        # A moved leader's current unit may be off the board: no key at all.
        return unit_key(label) if label in by_label else ""
    return {
        "rows": [[r[0], name_of.get(r[1], r[1]), r[2], unit_key(r[3]), r[4], r[5], r[6], r[7], r[8]]
                 for r in rows],
        "roster": [[name_of.get(p[1], p[1]), unit_of(p[2]), p[3], p[4], p[5], p[6],
                    1 if p[1] in pool["filed"] else 0, p[7],
                    p[8] if len(p) > 8 else None, p[9] if len(p) > 9 else None,
                    [[unit_key(u[0]), u[1], u[2], u[3]] for u in spans(p) if u[0] in by_label]
                    or None if spans(p) else None]
                   for p in roster],
        "cutoffs": {name_of[k]: {"from": v} for k, v in pool["cutoffs"].items() if k in name_of},
        "cutUnits": {unit_key(k): {"from": v} for k, v in pool["cutUnits"].items() if k in by_label},
    }


def _quality_rows(db: Session, d_from: date, d_to: date) -> list[tuple]:
    """(unit id, status, date, count) over the history window, the HAIR
    category left out, each record credited by `quality_attribution` — the
    Quality page's and the shift dashboard's own rule — and bucketed by day
    here because this board's periods are not its one month.

    The upper bound is EXCLUSIVE on the day after `d_to`: `date` is an ISO
    string, so a row that ever carries a time («2026-10-23T10:00») survives a
    `< "2026-10-24"` that a `<= "2026-10-23"` would silently drop."""
    return quality_attribution.unit_rows(db, _iso(d_from), _iso(d_to + timedelta(days=1)),
                                         bb.SKIP_CATEGORY)


def _build(db: Session, grain: str, anchor: date, today: date) -> dict:
    """The WHOLE board of the period holding `anchor`: every unit on the
    board, both shifts, read as nobody (`_SYSTEM`)."""
    # Nothing ever closed: the picked period alone, never four empty years.
    pers = bb.periods(grain, anchor, today, bb.data_floor(db) or today)
    managers = bb.board_units(db, None, None)
    ids = {m.id for m in managers}
    d_from, d_to = pers[0]["from"], pers[-1]["to"]

    eff = plan = att = xav = qual = {}
    pool = {"rows": [], "roster": [], "cutoffs": {}, "cutUnits": {}}
    if ids:
        metrics = build_metrics_list(db, d_from, d_to, None, sorted(ids), require_closed=True)
        eff = bb.efficiency(metrics, ids, pers)
        plan = bb.fulfillment(metrics, ids, pers)
        from app.routers.workers import headcount       # the page's own figure
        head = headcount(db, _SYSTEM, d_from, d_to, None, sorted(ids), None, daily_only=True)
        att = bb.attendance(head, ids, pers)
        xav = bb.concerns(db, ids, pers)
        qrows = _quality_rows(db, d_from, d_to)
        qual = bb.quality(qrows, ids, pers)
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
        "figures": {str(mid): {"eff": eff.get(mid), "plan": plan.get(mid), "att": att.get(mid),
                               "xav": xav.get(mid), "qual": qual.get(mid)}
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
    # One answer per PERIOD — never per viewer, plant or shift (`cut` below).
    key = (FORMAT, grain, start.isoformat())
    body, state = _KEPT.lookup(db, payload, key, lambda own: _calculate(own, grain, start))
    return _answer(body, scoped, shift, state == "refreshing")


def _calculate(db: Session, grain: str, start: date) -> str:
    """One build in its turn (`_ONE_BUILD`): the encoded board of the period
    starting on `start`. `db` is the request's session, or a session of the
    rebuild's own when it runs behind an answer."""
    db.rollback()                         # wait for the turn without a pooled connection
    if not _ONE_BUILD.acquire(timeout=BUILD_WAIT_S):
        raise HTTPException(status_code=503, headers={"Retry-After": "60"},
                            detail="The ranking is still being calculated — open it again in a minute.")
    try:
        with gc_pause.paused():           # its objects die by refcount; a full GC is pure GIL
            return _encode(_build(db, grain, start, today_local()))
    finally:
        _ONE_BUILD.release()


def _dumps(out) -> str:
    # `JSONResponse.render`'s own call, so the bytes are the ones FastAPI sent.
    return json.dumps(out, ensure_ascii=False, allow_nan=False, indent=None,
                      separators=(",", ":"))


def _encode(out: dict) -> str:
    """The answer as FastAPI itself would send it, encoded ONCE per build."""
    return _dumps(jsonable_encoder(out))


def cut(pay: dict, ids: Optional[set], shift: Optional[int]) -> dict:
    """The whole board cut to the units in `ids` (None = every unit) on
    `shift` (None = both) — the answer a build scoped to them gave until
    2026-11-13, when every scope was a build of its own.

    The checklist pool is cut by `checklist_pool`'s own rule: a unit's rows;
    the leaders on it, or with a span on it; a span on a unit outside the cut
    dropped, and a current unit outside it blanked. Every cutoff stays, as a
    scoped build kept them all."""
    units = [u for u in pay.get("units") or []
             if (ids is None or u["id"] in ids) and (shift is None or u.get("shift") == shift)]
    keep = {str(u["id"]) for u in units}
    pool = pay.get("checklist") or {}
    roster = []
    for p in pool.get("roster") or []:
        spans = (p[10] or []) if len(p) > 10 else []
        if p[1] not in keep and not any(u[0] in keep for u in spans):
            continue
        p = list(p)
        if p[1] not in keep:
            p[1] = ""
        if len(p) > 10:
            p[10] = [u for u in spans if u[0] in keep] or None
        roster.append(p)
    out = dict(pay)
    out["units"] = units
    out["figures"] = {k: v for k, v in (pay.get("figures") or {}).items() if k in keep}
    out["checklist"] = {
        "rows": [r for r in pool.get("rows") or [] if r[3] in keep],
        "roster": roster,
        "cutoffs": pool.get("cutoffs") or {},
        "cutUnits": {k: v for k, v in (pool.get("cutUnits") or {}).items() if k in keep},
    }
    return out


def _answer(body: str, scoped: Optional[list], shift: Optional[int], refreshing: bool) -> Response:
    """The kept answer as it is for a viewer who reaches every unit and asked
    for no filter (the page filters plant and shift itself); cut to the rest
    otherwise — a locked viewer's plant, a bundle from before 2026-11-13 still
    sending `factory` / `shift`."""
    if scoped is None and shift is None:
        out = _REFRESHING + body[1:] if refreshing else body
    else:
        pay = cut(json.loads(body), None if scoped is None else set(scoped), shift)
        if refreshing:
            pay["refreshing"] = True
        out = _dumps(pay)
    return Response(content=out, media_type="application/json")


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
