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
months' key (`_report`'s `scope_key`): the «Kutish mas'uli» CATEGORY lock
(`services/idle_scope`, applied to the «Kutish» section exactly as /downtime applies it) and whether
the «Xarajat» section is this viewer's at all (`downtime.COST_ROLES`). One
viewer's build is never served to another — the `leaders_kpi._board_key` rule.
"""
from __future__ import annotations

import logging
import time
from contextlib import contextmanager
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
    idle_source, ojidaniya_cost, plan_fulfillment, quality_attribution, reports, turnover,
    wage_rate,
)
from app.services.factory_scope import empty_scope, resolve_factory, scoped_manager_ids
from app.services import verifix_month_kinds, verifix_scope
from app.services.gc_pause import paused as gc_paused
from app.services.kept_answer import KeptAnswers
from app.xlsx_delivery import deliver_file

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reports", tags=["reports"])

PAGE = "reports"

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


def _quality_rows(db: Session, d_from: date, d_to: date) -> tuple[list, list]:
    """The Quality register over the window, (every record, the records WITHOUT
    the hair category) — the complaint COUNT counts hair, the closure rate does
    not — each record credited by `quality_attribution`, the /leaderboard
    reading, which is itself the shift dashboard's and the Quality page's own:
    (unit id, status, date, count). One read for both
    (`quality_attribution.unit_rows_both`). The upper bound is exclusive on the
    day after `d_to`, because `date` is an ISO string a row may carry a time
    on."""
    return quality_attribution.unit_rows_both(db, d_from.isoformat(),
                                              (d_to + timedelta(days=1)).isoformat(),
                                              bb.SKIP_CATEGORY)


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


def _ontime_by_month(db: Session, months: list[dict]) -> dict:
    """Per month: the /ontime page's headline — Σ delivered on time ÷ Σ
    ordered, every group with a window, one decimal — through `ontime.build`,
    the page's own computation (its cache shared). The logistics sheet names
    no brigade, so this is the whole plant's; None where nothing was ordered
    (the sheet not connected, a month before its data). A read that fails
    costs this figure, never the report."""
    from app.services import ontime
    out: dict = {}
    for m0 in months:
        try:
            tot = (ontime.build(db, m0["from"], m0["to"]).get("totals") or {})
            dem = float(tot.get("demand") or 0)
            out[m0["ym"]] = round(float(tot.get("ontime") or 0) / dem * 100, 1) if dem > 0 else None
        except Exception:  # noqa: BLE001
            db.rollback()
            log.exception("reports: on-time %% for %s failed", m0["ym"])
            out[m0["ym"]] = None
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
    page's figure) — asked for the totals alone (`totals_only`): no cell or
    product pick, so no share rule and none of the page's row lists."""
    totals: dict[str, dict] = {}
    if not units:
        return {m["ym"]: {} for m in months}
    for m in months:
        built = plan_fulfillment.build(db, units, m["from"], m["to"], cells=[],
                                       leader_names={}, compare=False, totals_only=True)
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


class _Clock:
    """How long each part of ONE build took — carried on the payload as
    `timings` and logged once, so «why does the report take so long to open»
    is answered by the report itself rather than guessed at. A part met twice
    (two months) adds up."""

    def __init__(self):
        self.t0 = time.perf_counter()
        self.parts: dict[str, float] = {}

    @contextmanager
    def __call__(self, name: str):
        t = time.perf_counter()
        try:
            yield
        finally:
            self.parts[name] = self.parts.get(name, 0.0) + (time.perf_counter() - t)

    def out(self) -> dict:
        return {"total_ms": round((time.perf_counter() - self.t0) * 1000),
                "parts": {k: round(v * 1000) for k, v in
                          sorted(self.parts.items(), key=lambda kv: -kv[1])}}


def _month_part(db: Session, payload: dict, mo: dict, factory, shift, mids: list[int]) -> dict:
    """Every figure of ONE month of the report, within one scope — the inputs
    `services/reports.compose` folds, each keyed by that month alone (a
    per-unit list of one, or {ym: …}).

    Every figure comes from the page that owns it, through that page's own
    code — `build_metrics_list` (the загрузка engine) read by
    `brigadir_board`'s heatmap twins, `/api/workers/headcount` itself,
    `plan_fulfillment.build`, `routers/downtime._downtime`, `idle_share.build`,
    `ojidaniya_cost.build`, the Quality register as the shift dashboard reads
    it, the /concerns register as the leaders' KPI counts it, and
    `turnover.month_payload`. Nothing is measured in this file or in
    `services/reports.py`, which only folds what is handed to it.

    A month is built ON ITS OWN (2026-11-05), so a finished one is computed
    once and shared by every report that shows it: each of these readers
    buckets by day, so one month read alone gives the very figures it gives
    read beside its neighbour.

    The unit scope is the viewer's plant lock (`scoped_manager_ids` —
    `?factory=` cannot widen a locked viewer), the shift, the brigadir pick,
    and `board_units`' own rule (non-archived units that take part in the
    загрузка). Everything downstream is given that set, the turnover half
    included, so no half can read wider than the page.
    """
    clock = _Clock()
    today = turnover.local(turnover.now_aware()).date()
    months = [mo]
    with clock("scope"):
        scoped = scoped_manager_ids(db, payload, factory, mids)
        units = [] if empty_scope(scoped) else bb.board_units(db, scoped, shift)
    ids = {u.id for u in units}
    d_from, d_to = mo["from"], mo["to"]

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
    ontime_pct: dict = {}
    # None = not this viewer's section (`_sees_cost`), and `services/reports`
    # then leaves «Xarajat» out of the payload; {} per month = theirs, empty.
    cost: Optional[dict] = {m0["ym"]: {} for m0 in months} if _sees_cost(payload) else None
    turn = {m0["ym"]: None for m0 in months}
    if ids:
        from app.routers.brigadirs import build_metrics_list
        from app.routers.workers import get_headcount

        with clock("zagruzka"):
            metrics = build_metrics_list(db, d_from, d_to, None, sorted(ids), require_closed=True)
            eff = bb.efficiency(metrics, ids, months)
            sload = bb.shift_load(metrics, ids, months)
        with clock("attendance"):
            head = get_headcount(date_from=d_from, date_to=d_to, shift=None,
                                 manager_id=sorted(ids), factory=None, db=db, payload=payload)
            att = bb.attendance(head, ids, months)
        # Verifix's overtime («Сверхурочные», direct / indirect), STORED by a
        # background read (`services/verifix_month_kinds.py`); a month never
        # read is asked for in the background and prints «—» until it lands.
        with clock("overtime"):
            vkinds = verifix_month_kinds.totals(db, [m0["ym"] for m0 in months], ids)
        # On-time delivery (the operator, 2026-11-02) — the logistics sheet
        # names no brigade, so it is printed only while the report reads the
        # whole plant (no plant, shift or brigadir narrowing), «—» otherwise.
        if factory is None and shift is None and not mids:
            with clock("ontime"):
                ontime_pct = _ontime_by_month(db, months)
        verifix_month_kinds.want([m0["ym"] for m0 in months])
        with clock("concerns"):
            xav = bb.concerns(db, ids, months)
        # The complaint COUNT includes hair (the operator, 2026-11-02: «the
        # number should be the with hair complaints»); the closure rate beside
        # it stays hair aside, as on the Quality page.
        with clock("quality"):
            q_all, q_kept = _quality_rows(db, d_from, d_to)
            qual = bb.quality(q_kept, ids, months)
            qual_n = bb.quality_filed(q_all, ids, months)
        with clock("plan"):
            plan_tot = _plan_by_month(db, units, months)
        with clock("idle"):
            idle = _idle_by_month(db, payload, months, shift, sorted(ids), factory, ids)
        with clock("idle_share"):
            idle_pct = _idle_share_by_month(db, payload, months, sorted(ids))
        if cost is not None:
            with clock("cost"):
                cost = _cost_by_month(db, payload, months, sorted(ids))
        # The SCOPED units, never the raw pick: turnover applies the scope it
        # is handed and knows nothing of the viewer's lock, so handing it
        # `mids` would let a locked viewer read the whole plant's turnover.
        with clock("turnover"):
            turn = _turnover_by_month(db, months, {"factory": factory, "shift": shift,
                                                   "managers": set(ids)})

    # Verifix's own count of cells, shift-managers, brigadirs and leaders
    # (`services/verifix_scope.py`): the cells — and the brigadirs over them,
    # the leaders seated in them — of the units above (the загрузка's, in the
    # viewer's scope); shift managers by the plant alone, so a shift or
    # brigadir pick leaves that row «—».
    vfx_scope = None
    try:
        with db.begin_nested(), clock("verifix_scope"):
            vfx_scope = verifix_scope.counts(
                db, months, today, ids, resolve_factory(db, payload, factory),
                shift_managers=shift is None and not mids)
    except Exception:  # noqa: BLE001 — four «—» rows, never a failed report
        log.exception("reports: the Verifix scope counts failed")

    built_at = turnover.local(turnover.now_aware()).isoformat(timespec="seconds")
    timings = clock.out()
    log.info("reports: built %s (%d units) in %.1f s — %s", mo["ym"], len(ids),
             timings["total_ms"] / 1000,
             ", ".join(f"{k} {v / 1000:.1f}" for k, v in timings["parts"].items()))
    return {
        "ym": mo["ym"], "built_at": built_at, "timings": timings,
        "plan": plan_tot, "eff": eff, "sload": sload, "att": att, "vkinds": vkinds,
        "ontime": ontime_pct, "turnover": turn, "idle": idle, "idle_share": idle_pct,
        "cost": cost, "qual": qual, "qual_n": qual_n, "xav": xav, "vfx_scope": vfx_scope,
    }


# What `compose` reads per UNIT (unit → {field: [one figure per month]}) and
# per MONTH ({ym: …}) — how two months built apart become one input.
_BY_UNIT = ("eff", "sload", "att", "xav", "qual", "qual_n")
_BY_MONTH = ("plan", "idle", "idle_share", "vkinds", "ontime", "turnover", "vfx_scope")


def _merge(parts: list[dict]) -> dict:
    """The months' parts as the one input `compose` reads. A unit a month has
    no row for reads None in that month's place, which every fold skips exactly
    as it skips the zero the unit would have carried read beside it — so the
    sums, means and pooled shares are the ones a single build gave. Nothing in
    a part is changed: they are kept and shared between readers."""
    n = len(parts)
    out: dict = {}
    for f in _BY_UNIT:
        acc: dict = {}
        for i, p in enumerate(parts):
            for uid, row in (p.get(f) or {}).items():
                slot = acc.setdefault(uid, {})
                for k, vals in row.items():
                    slot.setdefault(k, [None] * n)[i] = vals[0] if vals else None
        out[f] = acc
    for f in _BY_MONTH:
        acc = {}
        for p in parts:
            acc.update(p.get(f) or {})
        out[f] = acc
    # None = not this viewer's section (`_sees_cost`) — the same in every part,
    # since it is on the key.
    out["cost"] = None if any(p.get("cost") is None for p in parts) else {
        k: v for p in parts for k, v in p["cost"].items()}
    return out


# Each MONTH is kept on its own, so the October report and the November one
# share October. A FINISHED month moves only with a late edit (a day reopened,
# a complaint closed, the turnover month closing on the 5th): kept 30 min as
# built, then served up to 12 h while a new build runs behind the reader. The
# month still running: 2 min, then up to 1 h the same way. A viewer who
# changed something since is served the kept month too, with a build that
# started after their write running behind it (`writers_refresh`) — the page
# reads `state` «refreshing» and asks again until it lands. Before 2026-11-05
# the whole report was one kept build (2 min / 10 min, and a writer waited):
# 5–11 s on every open a deploy, a pause or any write had emptied.
_FINISHED = KeptAnswers("reports-month", ttl=1800, stale=43200, max_keys=48,
                        writer_waits=True, writers_refresh=True)
_RUNNING = KeptAnswers("reports-running", ttl=120, stale=3600, max_keys=24,
                       writer_waits=True, writers_refresh=True)


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
    """The report, assembled from its months' kept parts. The GET and the
    export both come through here, so the file a reader downloads is built
    from the very parts their screen is showing.

    A part's key is everything it reads off the VIEWER beside the scope it was
    asked for: the plant lock (the scoped units), the category lock and whether
    the cost section is theirs. A fact a build depends on and the key does not
    carry is a build served to a viewer it was never narrowed for — the
    `leaders_kpi._board_key` rule. Any narrowing added to `_month_part` later
    goes in here too."""
    today = turnover.local(turnover.now_aware()).date()
    months = reports.months_for(m, today, bb.data_floor(db))
    scoped = scoped_manager_ids(db, payload, factory, mids)
    units = [] if empty_scope(scoped) else bb.board_units(db, scoped, shift)
    lock = idle_scope.viewer_categories(db, payload)
    scope_key = (factory, shift, tuple(mids),
                 None if scoped is None else tuple(sorted(scoped)),
                 None if lock is None else tuple(sorted(lock)),
                 _sees_cost(payload))

    parts: list[dict] = []
    states: list[str] = []
    for mo in months:
        def run(s: Session, mo=mo) -> dict:
            # A build's objects die by refcount (a full GC is pure GIL), and
            # its four readers of the cell weights share one computation.
            with gc_paused(), idle_source.reuse_weights(s):
                return _month_part(s, payload, mo, factory, shift, mids)

        kept = _RUNNING if mo["partial"] else _FINISHED
        part, state = kept.lookup(db, payload, (mo["ym"], mo["to"].isoformat()) + scope_key, run)
        parts.append(part)
        states.append(state)

    ids = {u.id for u in units}
    out = reports.compose({
        "months": months,
        "unit_ids": ids,
        **_merge(parts),
        "scope": {"factory": factory, "shift": shift, "managers": mids,
                  "units": len(units)},
    })
    out["today"] = today.isoformat()
    # The OLDEST month's build time — what the figures on screen are as of.
    out["built_at"] = min(p["built_at"] for p in parts)
    # «refreshing»: some month was served as kept while a newer build runs —
    # the page asks again shortly and the new figures replace these.
    out["state"] = ("refreshing" if "refreshing" in states
                    else "built" if "built" in states else "kept")
    out["timings"] = {p["ym"]: p["timings"] for p in parts}
    # The LOCK, never a pick — what the page prints as «you are seeing only …»
    # (`CatLockNotice`) and the document names in its subtitle; null for every
    # viewer who can widen. `idle_scope.narrow_downtime`'s own rule.
    out["cat_locked"] = lock
    out["options"] = {
        "shifts": sorted({u.shift for u in units if u.shift in (1, 2)}) or [1, 2],
        "brigadirs": [{"id": u.id, "name": u.name, "shift": u.shift,
                       "factory_id": u.factory_id} for u in units],
    }
    return out


WARM_DELAY_S = 120


def warm() -> None:
    """Build the report an admin opens first — this month and the one before,
    the whole plant — on a thread of its own, two minutes after a process
    starts (after the trudoyomkost store has warmed, `labor_kept.warm`), so the
    first open after a deploy is not the one that waits. Read-only; a failure
    costs the warm-up, never the page."""
    import threading

    def go():
        time.sleep(WARM_DELAY_S)
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            t0 = time.monotonic()
            _report(db, {"role": "admin"}, _month(None), None, None, [])
            db.rollback()
            print(f"[reports] warmed the default report in {time.monotonic() - t0:.1f} s",
                  flush=True)
        except Exception:  # noqa: BLE001
            log.exception("reports: warm-up failed")
        finally:
            db.close()

    threading.Thread(target=go, name="reports-warm", daemon=True).start()


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
