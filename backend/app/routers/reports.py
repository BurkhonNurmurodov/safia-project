"""`/api/reports` — «Hisobotlar» (/reports): the platform's period report.

Page key ``reports`` — ADMIN-ONLY until the operator opens it on the Access tab
(`permissions.DEFAULT_PAGE_ACCESS`), the rule /ontime, /live and /leaders-kpi
already keep.

ONE read serves every section (`GET /api/reports`), and `POST
/api/reports/export.{fmt}` hands the same thing over as a document — pdf, docx
or xlsx — laid out by `services/assistant_documents.py`, the house document
builder. The WORDS come from the screen (the client posts the labels it
printed, in the reader's language), the FIGURES are rebuilt here from each
page's own code: `services/grid_export.py`'s rule, so the file can never name
or state something the page it was pressed on does not.

This module does the FETCHING — every figure through the page that owns it,
never a query of its own for a measure — and `services/reports.py` does the
folding. The split is `ojidaniya_deck`'s: nothing in `services/` imports a
router.

Two VIEWER facts narrow a build beside the plant lock, and both ride the kept
answer's key (`_key`): the «Kutish mas'uli» CATEGORY lock (`services/idle_scope`,
applied to the «Kutish» section exactly as /downtime applies it) and whether
the «Xarajat» section is this viewer's at all (`downtime.COST_ROLES`). One
viewer's build is never served to another — the `leaders_kpi._board_key` rule.
"""
from __future__ import annotations

import logging
from copy import deepcopy
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.permissions import require_page
from app.services import (
    action_log, assistant_documents, brigadir_board as bb, idle_scope, idle_share,
    ojidaniya_cost, plan_fulfillment, quality_attribution, reports, turnover, wage_rate,
)
from app.services.factory_scope import empty_scope, scoped_manager_ids
from app.services import verifix_month_kinds
from app.services.gc_pause import paused as gc_paused
from app.services.kept_answer import KeptAnswers
from app.xlsx_delivery import deliver_file

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])

PAGE = "reports"

# A build is every figure of three months over every unit — the загрузка
# engine, the plan lines, the attendance rows, the ojidaniya union and its
# pricing. Served as built for 2 min, then up to 10 while one new build runs
# behind it; a viewer who wrote since never gets an older answer. The
# /leaders-kpi keep, with its own numbers.
_KEPT = KeptAnswers("reports", ttl=120, stale=600, max_keys=24, writer_waits=True)

FORMATS = ("pdf", "docx", "xlsx")


def _month(raw: Optional[str]) -> date:
    if raw in (None, ""):
        return reports.month_start(turnover.local(turnover.now_aware()).date())
    m = turnover.parse_month(raw)
    if m is None:
        raise HTTPException(status_code=400,
                            detail={"code": "bad_month", "message": "month must be YYYY-MM"})
    return m


def _ids(raw) -> list[int]:
    if isinstance(raw, (list, tuple, set)):
        return sorted({int(x) for x in raw})
    out: set[int] = set()
    for part in str(raw or "").split(","):
        part = part.strip()
        if part.isdigit():
            out.add(int(part))
    return sorted(out)


def _quality_rows(db: Session, d_from: date, d_to: date, skip=bb.SKIP_CATEGORY):
    """The Quality register over the window, WITHOUT the hair category (unless
    `skip` is None — the complaint COUNT counts hair too), each
    record credited by `quality_attribution` — the /leaderboard reading, which
    is itself the shift dashboard's and the Quality page's own:
    (unit id, status, date, count). The upper bound is exclusive on the day
    after `d_to`, because `date` is an ISO string a row may carry a time on."""
    return quality_attribution.unit_rows(db, d_from.isoformat(),
                                         (d_to + timedelta(days=1)).isoformat(),
                                         skip)


def _idle_by_month(db: Session, payload: dict, months: list[dict], shift, mids, factory,
                   unit_ids: set[int]) -> dict:
    """Per month: the plant's waiting and its causes — through
    `routers/downtime._downtime`, which IS the /downtime page's computation
    (the headcount-weighted mean of a unit's cells, the platform's one
    ojidaniya reading). `kpi_only=True` is what every consumer other than the
    Ojidaniya page itself must pass.

    The viewer's CATEGORY lock is applied to the finished answer, exactly as
    /downtime applies it — `idle_scope.narrow_downtime` over `_downtime`'s
    output, never a filter pushed into the query: a «Kutish mas'uli» reads
    their own causes here as on every other ojidaniya surface, and an admin's
    answer is byte-identical to the unnarrowed one. A narrowed month carries NO
    flag count (the 50-minute flag is a whole-day fact a slice cannot
    re-derive — `idle_scope`'s rule, so it prints «—», never 0), and an owner
    whose categories were all re-assigned reads «—» in every row, never the
    whole plant (`empty_scope`, the `_cost_by_month` convention)."""
    from app.routers.downtime import _downtime

    cats = idle_scope.resolve_cats(db, payload, [])
    lock = idle_scope.viewer_categories(db, payload)
    if idle_scope.empty_scope(cats):
        return {m["ym"]: {} for m in months}
    locked = lock is not None

    out: dict[str, dict] = {}
    for m in months:
        dt = idle_scope.narrow_downtime(
            _downtime(db, payload, m["from"], m["to"], shift, mids, True, factory),
            cats, lock=lock)
        by_cat: dict[str, float] = {}
        total = 0.0
        flagged = 0
        unit_days = 0
        for r in dt.get("rows") or []:
            if unit_ids and r["manager_id"] not in unit_ids:
                continue
            total += float(r["total"] or 0)
            unit_days += 1
            if r.get("flagged"):
                flagged += 1
            for c, v in (r.get("by_category") or {}).items():
                by_cat[c] = by_cat.get(c, 0.0) + float(v or 0)
        out[m["ym"]] = {
            "total": total, "flagged": None if locked else flagged,
            "unit_days": unit_days, "by_cat": by_cat,
        }
    return out


def _idle_share_by_month(db: Session, payload: dict, months: list[dict],
                         ids: list[int]) -> dict:
    """Per month: idle time as a share of worked time — `idle_share.build`,
    Σ(N·T) person-minutes over the Verifix worked minutes of the same cells,
    Tozalash left out (the operator's rulings of 2026-10-31).

    Read ONCE over the whole window and bucketed by month. The viewer's
    category lock narrows the numerator as it narrows the rest of the «Kutish»
    section; a lock that matches nothing reads «—», never the whole plant. A
    month with no worked minutes is None, so its cells print «—», never 0%. A
    fault costs these rows, never the report."""
    out: dict[str, Optional[dict]] = {m["ym"]: None for m in months}
    cats = idle_scope.resolve_cats(db, payload, [])
    if not ids or idle_scope.empty_scope(cats):
        return out
    try:
        per = idle_share.build(db, ids, months[0]["from"], months[-1]["to"], cats)
    except Exception:
        log.exception("reports: idle share failed")
        return out
    for m in months:
        lo, hi = m["from"].isoformat(), m["to"].isoformat()
        idle = worked = 0.0
        cells = 0
        for (_u, day), (pm, w, c) in per.items():
            if lo <= day <= hi:
                idle += pm
                worked += w
                cells += c
        if worked > 0:
            out[m["ym"]] = {"idle": idle, "worked": worked, "cell_days": cells}
    return out


def _sees_cost(payload: dict) -> bool:
    """Whether the «Xarajat» section is this viewer's — `/downtime/cost`'s own
    rule (`downtime.COST_ROLES`: admins and shift managers, the operator's
    ruling of 2026-10-04), imported rather than re-spelled, so the report and
    the tab can never answer «who may read what waiting cost» two ways. For
    anybody else the section is not in the payload at all, as the tab is not
    on /downtime for them."""
    from app.routers.downtime import COST_ROLES
    return payload.get("role") in COST_ROLES


def _cost_by_month(db: Session, payload: dict, months: list[dict], ids: list[int]) -> dict:
    """Per month: what the waiting cost in wages — `ojidaniya_cost.build`, the
    «Xarajat» tab's own tree, at the rate in force on each day.

    The PRE-FLOOR half (days before `zagruzka_source.ZAGRUZKA_FROM`, priced per
    brigadir rather than per cell) is deliberately not fetched: this report's
    months are the plant's KPI months, all of them after that floor, and
    reaching for it would mean a second scope resolution for days no column
    here can hold."""
    rates = wage_rate.resolver(wage_rate.load(db))
    lock = idle_scope.viewer_categories(db, payload)
    cats = idle_scope.resolve_cats(db, payload, [])
    out: dict[str, dict] = {}
    for m in months:
        if not ids or idle_scope.empty_scope(cats):
            out[m["ym"]] = {"totals": {}, "cat_rows": []}
            continue
        built = ojidaniya_cost.build(db, ids, m["from"], m["to"], list(cats or []),
                                     rates, cat_lock=lock)
        out[m["ym"]] = {"totals": built.get("totals") or {},
                        "cat_rows": built.get("cat_rows") or []}
    return out


def _plan_by_month(db: Session, units: list, months: list[dict]) -> dict:
    """Per month: `plan_fulfillment.build`'s own minute totals (the /plan
    page's figure)."""
    totals: dict[str, dict] = {}
    if not units:
        return {m["ym"]: {} for m in months}
    cells, leaders = plan_fulfillment.registry(
        db, [m.id for m in units], months[0]["from"], months[-1]["to"])
    for m in months:
        built = plan_fulfillment.build(db, units, m["from"], m["to"],
                                       cells=cells, leader_names=leaders, compare=False)
        totals[m["ym"]] = built.get("totals") or {}
    return totals


def _turnover_by_month(db: Session, months: list[dict], scope: dict) -> dict:
    """Per month: the turnover KPI's own figures. A month the register cannot
    answer for (before its first, still running with nothing taken, never
    computed) comes back None and the section leaves its block out — never a
    zero that reads as «nobody left»."""
    out: dict[str, Optional[dict]] = {}
    for m in months:
        try:
            pay = turnover.month_payload(db, m["from"], scope)
        except Exception:                       # a register fault costs the block, never the report
            log.exception("reports: turnover %s failed", m["ym"])
            out[m["ym"]] = None
            continue
        out[m["ym"]] = pay.get("totals") if pay.get("state") not in (
            "before", "future", "past") else None
    return out


def _build(db: Session, payload: dict, m: date, factory, shift, mids: list[int]) -> dict:
    """The whole report for one month, within one scope.

    Every figure comes from the page that owns it, through that page's own
    code — `build_metrics_list` (the загрузка engine) read by
    `brigadir_board`'s heatmap twins, `/api/workers/headcount` itself,
    `plan_fulfillment.build`, `routers/downtime._downtime`, `idle_share.build`,
    `ojidaniya_cost.build`, the Quality register as the shift dashboard reads
    it, the /concerns register as the leaders' KPI counts it, and
    `turnover.month_payload`. Nothing is measured in this file or in
    `services/reports.py`, which only folds what is handed to it.

    The unit scope is resolved ONCE, here: the viewer's plant lock
    (`scoped_manager_ids` — `?factory=` cannot widen a locked viewer), the
    shift, the brigadir pick, and `board_units`' own rule (non-archived units
    that take part in the загрузка). Everything downstream is given that set,
    the turnover half included, so no half can read wider than the page.
    """
    today = turnover.local(turnover.now_aware()).date()
    months = reports.months_for(m, today, bb.data_floor(db))
    scoped = scoped_manager_ids(db, payload, factory, mids)
    units = [] if empty_scope(scoped) else bb.board_units(db, scoped, shift)
    ids = {u.id for u in units}
    d_from, d_to = months[0]["from"], months[-1]["to"]
    n = len(months)

    eff: dict = {}
    sload: dict = {}
    att: dict = {}
    xav: dict = {}
    qual: dict = {}
    qual_n: dict = {}
    plan_tot: dict = {m0["ym"]: {} for m0 in months}
    idle = {m0["ym"]: {} for m0 in months}
    idle_pct = {m0["ym"]: None for m0 in months}
    vkinds: dict = {}
    # None = not this viewer's section (`_sees_cost`), and `services/reports`
    # then leaves «Xarajat» out of the payload; {} per month = theirs, empty.
    cost: Optional[dict] = {m0["ym"]: {} for m0 in months} if _sees_cost(payload) else None
    turn = {m0["ym"]: None for m0 in months}
    if ids:
        from app.routers.brigadirs import build_metrics_list
        from app.routers.workers import get_headcount

        metrics = build_metrics_list(db, d_from, d_to, None, sorted(ids), require_closed=True)
        eff = bb.efficiency(metrics, ids, months)
        sload = bb.shift_load(metrics, ids, months)
        head = get_headcount(date_from=d_from, date_to=d_to, shift=None,
                             manager_id=sorted(ids), factory=None, db=db, payload=payload)
        att = bb.attendance(head, ids, months)
        # Verifix's time kinds (Явка, Отсутствие, Сверхурочные…), STORED by a
        # background read (`services/verifix_month_kinds.py`); a month never
        # read is asked for in the background and prints «—» until it lands.
        vkinds = verifix_month_kinds.totals(db, [m0["ym"] for m0 in months], ids)
        verifix_month_kinds.want([m0["ym"] for m0 in months])
        xav = bb.concerns(db, ids, months)
        qual = bb.quality(_quality_rows(db, d_from, d_to), ids, months)
        # The complaint COUNT includes hair (the operator, 2026-11-02: «the
        # number should be the with hair complaints»); the closure rate beside
        # it stays hair aside, as on the Quality page.
        qual_n = bb.quality_filed(_quality_rows(db, d_from, d_to, skip=None), ids, months)
        plan_tot = _plan_by_month(db, units, months)
        idle = _idle_by_month(db, payload, months, shift, sorted(ids), factory, ids)
        idle_pct = _idle_share_by_month(db, payload, months, sorted(ids))
        if cost is not None:
            cost = _cost_by_month(db, payload, months, sorted(ids))
        # The SCOPED units, never the raw pick: turnover applies the scope it
        # is handed and knows nothing of the viewer's lock, so handing it
        # `mids` would let a locked viewer read the whole plant's turnover.
        turn = _turnover_by_month(db, months, {"factory": factory, "shift": shift,
                                               "managers": set(ids)})

    out = reports.compose({
        "months": months,
        "unit_ids": ids,
        "plan": plan_tot,
        "eff": eff, "sload": sload, "att": att, "vkinds": vkinds,
        "turnover": turn, "idle": idle, "idle_share": idle_pct, "cost": cost,
        "qual": qual, "qual_n": qual_n, "xav": xav,
        # How many cells carried a stoppage is read per MONTH inside
        # `compose`, out of each month's «Xarajat» totals.
        "scope": {"factory": factory, "shift": shift, "managers": mids,
                  "units": len(units)},
    })
    out["today"] = today.isoformat()
    out["built_at"] = turnover.local(turnover.now_aware()).isoformat(timespec="seconds")
    # The LOCK, never a pick — what the page prints as «you are seeing only …»
    # (`CatLockNotice`) and the document names in its subtitle; null for every
    # viewer who can widen. `idle_scope.narrow_downtime`'s own rule.
    out["cat_locked"] = idle_scope.viewer_categories(db, payload)
    out["options"] = {
        "shifts": sorted({u.shift for u in units if u.shift in (1, 2)}) or [1, 2],
        "brigadirs": [{"id": u.id, "name": u.name, "shift": u.shift,
                       "factory_id": u.factory_id} for u in units],
    }
    return out


def _key(db: Session, payload: dict, m: date, factory, shift, mids) -> tuple:
    """Everything a build reads off the VIEWER, beside the scope it asked for:
    the plant lock (the scoped units), the category lock and whether the cost
    section is theirs. A fact the build depends on and the key does not carry
    is a build served to a viewer it was never narrowed for — the
    `leaders_kpi._board_key` rule. Any narrowing added to `_build` later goes
    in here too."""
    units = scoped_manager_ids(db, payload, factory, mids)
    lock = idle_scope.viewer_categories(db, payload)
    return (reports.ym(m), turnover.local(turnover.now_aware()).date().isoformat(),
            factory, shift, tuple(mids),
            None if units is None else tuple(sorted(units)),
            None if lock is None else tuple(sorted(lock)),
            _sees_cost(payload))


@router.get("")
def get_report(
    month: Optional[str] = Query(None),
    factory: Optional[int] = Query(None),
    shift: Optional[int] = Query(None),
    managers: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """Every section of the report for one month, within the scope."""
    m = _month(month)
    if shift not in (None, 1, 2):
        raise HTTPException(status_code=400, detail="shift must be 1 or 2")
    return _report(db, payload, m, factory, shift, _ids(managers))


def _report(db: Session, payload: dict, m: date, factory, shift, mids: list[int]) -> dict:
    """The build, kept. The GET and the export both come through here, so the
    file a reader downloads is the very build their screen is showing."""
    key = _key(db, payload, m, factory, shift, mids)

    def run(s: Session) -> dict:
        with gc_paused():          # a build's objects die by refcount; a full GC is pure GIL
            return _build(s, payload, m, factory, shift, mids)

    return _KEPT.get(db, payload, key, run)


class ExportIn(BaseModel):
    month: str = ""
    factory: Optional[int] = None
    shift: Optional[int] = None
    managers: list[int] = []
    fmt: str = "pdf"
    lang: str = "uz"
    title: str = ""
    subtitle: str = ""
    filename: str = ""
    caption: str = ""
    # Only the sections the reader has on screen, in the screen's order; empty
    # = every one of them.
    sections: list[str] = []
    # What the screen PRINTED, in the reader's language — see
    # `services/reports.doc_blocks`.
    words: dict = {}
    # Each block's cells as the page formatted them, keyed
    # "<section>.<block>.<row key>". A figure the page prints «—» is «—» in the
    # file: one number, two places, never two spellings of it.
    display: dict = {}
    # Each table's rows in the order the reader put them on screen, keyed
    # "<section>.<block>" → [row key, …]. Absent (an older tab) = the
    # server's order.
    order: dict = {}
    # Each row's change cell as the page printed it, keyed like `display`.
    deltas: dict = {}


@router.post("/export.{fmt}")
def export_report(
    fmt: str,
    request: Request,
    body: ExportIn,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page(PAGE)),
):
    """The report as a document — a browser downloads it, inside Telegram it
    lands in the caller's chat (app/xlsx_delivery.py).

    The figures are REBUILT here through each page's own code; the client sends
    the words and how it printed each cell. A format the builder does not know
    is refused rather than quietly swapped for another."""
    fmt = (fmt or body.fmt or "pdf").lower().strip()
    if fmt not in FORMATS:
        raise HTTPException(status_code=400,
                            detail={"code": "bad_format",
                                    "message": f"format must be one of {', '.join(FORMATS)}"})
    m = _month(body.month)
    if body.shift not in (None, 1, 2):
        raise HTTPException(status_code=400, detail="shift must be 1 or 2")
    mids = _ids(body.managers)
    # The KEPT build — the one the screen is showing — then a DEEP COPY of the
    # sections wanted, because the document's own formatting is written onto
    # the rows and the kept answer is shared with every other reader.
    kept = _report(db, payload, m, body.factory, body.shift, mids)
    want = [s for s in (body.sections or []) if s in reports.SECTIONS]
    order = {k: i for i, k in enumerate(want)} if want else None
    secs = [s for s in kept.get("sections") or []
            if order is None or s["key"] in order]
    if order is not None:
        secs.sort(key=lambda s: order[s["key"]])
    pay = {**kept, "sections": deepcopy(secs)}
    _apply_display(pay, body.display)
    _apply_order(pay, body.order)
    if isinstance(body.deltas, dict) and body.deltas:
        pay["_deltas"] = {str(k): str(v)[:40] for k, v in body.deltas.items()}

    title = (body.title or f"Hisobot — {reports.ym(m)}").strip()
    blocks = reports.doc_blocks(pay, body.words or {})
    if not blocks:
        raise HTTPException(status_code=409,
                            detail={"code": "empty", "message": "nothing to export"})
    try:
        ext, mime, data = assistant_documents.build(fmt, title, body.subtitle, blocks, body.lang)
    except assistant_documents.DocError as exc:
        raise HTTPException(status_code=500,
                            detail={"code": "build_failed", "message": str(exc)})

    stem = (body.filename or f"hisobot-{reports.ym(m)}").strip() or f"hisobot-{reports.ym(m)}"
    fname = assistant_documents.safe_filename(stem)
    if not fname.lower().endswith("." + ext):
        fname = f"{fname}.{ext}"
    resp = deliver_file(request, payload, fname, data, mime,
                        body.caption or f"📄 {title}")
    action_log.enrich(target_kind="report", target_id=fname, target_name=title,
                      details=[("file", fname), ("format", fmt), ("month", reports.ym(m)),
                               ("size", len(data)),
                               ("sections", len(pay.get("sections") or []))])
    return resp


def _apply_order(pay: dict, order: dict) -> None:
    """Lay each table's rows out in the order the reader chose on screen. A row
    the list does not name keeps its place after the named ones, so a figure is
    never dropped from the file for being missing from a stale order."""
    if not isinstance(order, dict) or not order:
        return
    for sec in pay.get("sections") or []:
        for b in sec.get("blocks") or []:
            keys = order.get(f"{sec['key']}.{b['key']}")
            if not isinstance(keys, list) or not keys:
                continue
            pos = {str(k): i for i, k in enumerate(keys)}
            rows = b.get("rows") or []
            named = sorted((r for r in rows if str(r.get("key")) in pos),
                           key=lambda r: pos[str(r.get("key"))])
            b["rows"] = named + [r for r in rows if str(r.get("key")) not in pos]


def _apply_display(pay: dict, display: dict) -> None:
    """Put the page's own formatting on each row, so the document prints the
    cells the reader saw. A key the client did not send keeps the raw figures
    — the file is then still right, only less prettily spelled."""
    if not display:
        return
    for sec in pay.get("sections") or []:
        for b in sec.get("blocks") or []:
            for r in b.get("rows") or []:
                got = display.get(f"{sec['key']}.{b['key']}.{r['key']}")
                if isinstance(got, list):
                    r["display"] = got
