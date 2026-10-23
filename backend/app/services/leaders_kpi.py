"""«Liderlar KPI» (`/leaders-kpi`) — the leaders' five KPIs on ONE page, as a
leaderboard. THE rule for the board; each KPI's own rule stays in its module.

From 2026-10-19 (the operator: «merge the 3 KPI pages into one Leaders' KPI
page … like a leaderboard … 5 categories and one leaderboard on different
tabs») the three KPI pages — «Ishchi havotirlari», «Kadrlar qo'nimsizligi»
and «Yot jismlar» — are tabs of one page, with two more tabs holding the place
of the KPIs the platform has no source for yet. HR's July 2026 file is the
model: five KPIs per cell, each scored 1–5 and weighted, the total = Σ score
× weight:

    Obespokoennost (concerns)          0.25    live — this platform's /cell-concerns
    Tekuchest (turnover)               0.20    live — Verifix
    Inorodnye predmety (foreign obj.)  0.25    live — the Quality register
    Sootvetstvie kategorii             0.20    live — Verifix's HR journals + HR's ladder (2026-10-19)
    Audit tekhnologov                  0.10    NOT on the platform (HR holds one % per cell)

and a SIXTH, not one of HR's (2026-10-23, the operator: «can you also add Plan
Fulfillment»):

    Plan bajarish (plan fulfilment)    0.00    live — the /plan page's own per-cell minutes

Its weight is 0 until the operator names one, so HR's total out of 5.0 does not
move: the KPI is shown (a tab, a board column, a radar spoke, the dialogs) and
scored, and adds no points. `plan_rule` (app_settings) holds its weight and
bands; a weight given there joins the total at once — the other weights should
then be lowered so they still add to 1.0, or a total can pass 5.0.

The operator's rulings (2026-10-19, asked one by one):

* **One row per CELL, its owner named** — the reading all three pages shared
  since 2026-10-14 (`turnover.cell_map` + `turnover.owned`: an owner on the
  month's last day, standing on it). An owner of three cells is three rows.
* **One MONTH for every tab.** The concerns KPI is re-read by calendar month
  (its free date range went with the page); the current month reads «so far».
* **The total is out of 5.0 and a missing KPI counts 0** — honest about what
  is missing, so a perfect leader today reads 4.5 / 5 (90%) with the audit
  still to come. When a KPI arrives its points simply join the sum — the
  category-compliance KPI did on the day the page shipped.
* **Admin-only until the operator opens it on the Access tab** (page key
  `leaders-kpi`; the roles /worker-concerns had are NOT carried — the
  operator's call).
* **The concerns KPI's score is HR's bands on the page's own %**: resolved ÷
  rated, escalated («Ko'tarilgan») concerns out of the % (the 4 Oct ruling);
  above 95% → 5, above 90% → 4, above 80% → 3, above 70% → 2, else 1; weight
  0.25. `concerns_rule` is admin-editable (`concerns_rule` in app_settings,
  the shape of `turnover_rule` / `foreign_rule`).
* **A cell with NO concern in the month has no concerns score** («—», 0 in
  the total — like a missing KPI), as has a cell whose every concern was
  escalated (no %). HR's file gives such a cell no figure either.
* **Each category tab has ONE shape**: a ranking table (cell · owner · the
  figure · score · points, worst first) and the register behind a toggle
  (leavers · complaints · the concerns list); a row opens its working.
* **The two missing KPIs are an empty state with HR's rule printed.**

Nothing is re-measured here: the turnover, foreign-object and compliance
figures are the three modules' own month payloads (`turnover.month_payload`,
`foreign_objects.month_payload`, `category_compliance.month_payload`), the
concerns counts the worker-concerns
router's own aggregation (`_aggregate` / `_figures` — the very rows
/cell-concerns holds). This module only joins them per cell, scores the
concerns KPI and ranks. The board is derived per request; nothing is stored.
"""
from __future__ import annotations

import json
import threading
import time
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, Manager
from app.services import category_compliance as cc, foreign_objects, turnover
from app.services.turnover import (
    PAST_FROM, cell_map, last_day, local, month_start, now_aware, options, owned, ym,
)

MAX_POINTS = 5.0

# The six, in the page's order — the platform's own numbering (concerns 1st,
# turnover 2nd, foreign objects 3rd, then the two HR still counts by hand), and
# plan fulfilment last: it is not one of HR's five, so it keeps their numbers.
KPI_KEYS = ("concerns", "turnover", "foreign", "compliance", "audit", "plan")
LIVE = {"concerns", "turnover", "foreign", "compliance", "plan"}

# HR's July 2026 rules for the two KPIs the platform cannot compute yet — printed
# on their tabs so the reader knows what will come; nothing scores by them.
def _slim_cc_rule(r: dict) -> dict:
    """The compliance rule's SCORING part for the board: weight, mode, how a
    person with no category counts, the score at 100 %, the bands (rate
    strictly above → score) and the worst score. The ladders, levels and the
    job map stay on the tab's own payload (`category_compliance.rule`)."""
    return {"weight": float(r.get("weight", 0.2)), "mode": r.get("mode", "at_least"),
            "no_category": r.get("no_category", "fail"), "full": int(r.get("full", 5)),
            "bands": [{"above": float(b["above"]), "score": int(b["score"])} for b in (r.get("bands") or [])],
            "worst": int(r.get("worst", 1)), "max_score": 5}
AUDIT_RULE = {"weight": 0.1, "max_score": 3,
              "bands": [["> 90%", 3], ["> 80%", 2], ["> 70%", 1], ["≤ 70%", 0]]}

CONCERNS_RULE_KEY = "concerns_rule"
DEFAULT_CONCERNS_RULE = {
    "weight": 0.25,
    # «above N%» → score, HR's IFS(J>95%,5, J>90%,4, J>80%,3, J>70%,2, J>=0%,1).
    "bands": [{"over": 95, "score": 5}, {"over": 90, "score": 4},
              {"over": 80, "score": 3}, {"over": 70, "score": 2}],
    "worst": 1,
}


# ── the concerns rule ─────────────────────────────────────────────────────────

def concerns_rule(db: Session) -> dict:
    """The rule in force: the admin override when it is well-formed, else HR's.
    A malformed override can never blank a score."""
    row = db.query(AppSetting).filter(AppSetting.key == CONCERNS_RULE_KEY).first()
    if row and row.value:
        try:
            r = json.loads(row.value)
            bands = sorted(({"over": float(b["over"]), "score": int(b["score"])} for b in r["bands"]),
                           key=lambda b: -b["over"])
            if bands and all(1 <= b["score"] <= 5 and 0 <= b["over"] <= 100 for b in bands):
                return {"weight": float(r.get("weight", 0.25)), "bands": bands,
                        "worst": int(r.get("worst", 1))}
        except (ValueError, TypeError, KeyError):
            pass
    return json.loads(json.dumps(DEFAULT_CONCERNS_RULE))


def concerns_score(pct0: Optional[int], r: dict) -> Optional[int]:
    """The WHOLE percent the page prints (`whole_pct`, half up), judged as
    printed — the platform's rule for every graded figure. None = no %."""
    if pct0 is None:
        return None
    for b in sorted(r["bands"], key=lambda b: -float(b["over"])):
        if pct0 > float(b["over"]):
            return int(b["score"])
    return int(r["worst"])


# ── the plan-fulfilment rule ──────────────────────────────────────────────────
# Fakt minutes ÷ Reja minutes, the WHOLE percent judged as printed: at least
# 95 → 5, 90 → 4, 80 → 3, 70 → 2, else 1. Weight 0 — see the module docstring.
PLAN_RULE_KEY = "plan_rule"
DEFAULT_PLAN_RULE = {
    "weight": 0.0,
    "bands": [{"min": 95, "score": 5}, {"min": 90, "score": 4},
              {"min": 80, "score": 3}, {"min": 70, "score": 2}],
    "worst": 1,
}


def plan_rule(db: Session) -> dict:
    """The rule in force: the admin override (`plan_rule` in app_settings) when
    it is well-formed, else the default. A malformed one never blanks a score."""
    row = db.query(AppSetting).filter(AppSetting.key == PLAN_RULE_KEY).first()
    if row and row.value:
        try:
            r = json.loads(row.value)
            bands = sorted(({"min": float(b["min"]), "score": int(b["score"])} for b in r["bands"]),
                           key=lambda b: -b["min"])
            w = float(r.get("weight", 0.0))
            if bands and 0 <= w <= 1 and all(1 <= b["score"] <= 5 and 0 <= b["min"] <= 1000 for b in bands):
                return {"weight": w, "bands": bands, "worst": int(r.get("worst", 1))}
        except (ValueError, TypeError, KeyError):
            pass
    return json.loads(json.dumps(DEFAULT_PLAN_RULE))


def plan_score(pct0: Optional[int], r: dict) -> Optional[int]:
    if pct0 is None:
        return None
    for b in sorted(r["bands"], key=lambda b: -float(b["min"])):
        if pct0 >= float(b["min"]):
            return int(b["score"])
    return int(r["worst"])


def _pct_half_up(part: float, whole: float) -> Optional[int]:
    """The whole percent, half up — `whole_pct`'s rule over minutes."""
    return int((200 * part + whole) // (2 * whole)) if whole > 0 else None


# The plan half is the heaviest part of a board build (every unit, every day of
# the month so far), and it reads none of what a board key changes on — a
# Verifix read finishing, another viewer's lock. So it is kept a few minutes
# per (month, days, units), never for a viewer who wrote since it was built.
# Read-only once kept: the board hands its day strips on unchanged.
_PLAN_TTL_S = 180
_PLAN_MAX = 32
_plan_kept: dict = {}            # (m, lo, hi, units) → (monotonic() the build STARTED, answer)
_plan_lock = threading.Lock()


def _plan_by_cell(db: Session, m: date, d: date, cmap: dict, scope: dict, today: date,
                  fresh_after: float = 0.0) -> dict:
    """cell id → the month's plan and fact minutes, through the /plan page's
    own computation (`plan_fulfillment.build` — `pp_calc.line_minutes` line by
    line, a cell's part by `wc_group.share`, a unit-day counted only once both
    halves are in). Read over the units the board's in-scope owned cells stand
    in; nothing before `zagruzka_source.ZAGRUZKA_FROM` (the data starts there).
    `fresh_after` — `monotonic()` of the viewer's last write; a kept answer
    built before it is not served."""
    from app.services import plan_fulfillment as pf

    lo, hi = max(m, pf.FLOOR), min(d, today)
    if hi < lo:
        return {}
    mids = sorted({c["manager_id"] for c in cmap.values()
                   if c.get("manager_id") and owned(c) and _scope_ok(c, scope)})
    if not mids:
        return {}
    key = (m, lo, hi, tuple(mids))
    with _plan_lock:
        hit = _plan_kept.get(key)
    if hit is not None and time.monotonic() - hit[0] < _PLAN_TTL_S and hit[0] > fresh_after:
        return hit[1]
    t0 = time.monotonic()
    managers = db.query(Manager).filter(Manager.id.in_(mids)).all()
    cells, names = pf.registry(db, mids, since=lo, until=hi)
    out = pf.build(db, managers, lo, hi, cells=cells, leader_names=names, compare=False)
    res = {r["cell_id"]: r for r in out.get("cell_rows") or [] if r.get("cell_id") is not None}
    with _plan_lock:
        old = _plan_kept.get(key)
        if old is None or old[0] < t0:
            now = time.monotonic()
            for k in [k for k, (t, _v) in list(_plan_kept.items()) if now - t > _PLAN_TTL_S]:
                _plan_kept.pop(k, None)
            while len(_plan_kept) >= _PLAN_MAX:
                _plan_kept.pop(next(iter(_plan_kept)), None)
            _plan_kept[key] = (t0, res)
    return res


def _plan_row(cr: Optional[dict], rule: dict) -> dict:
    """One cell's plan-fulfilment figure. No plan minutes on a counted day =
    no % and no score («—», 0 in the total — like a missing KPI)."""
    daily = (cr or {}).get("daily") or []
    plan = float((cr or {}).get("plan") or 0)
    actual = float((cr or {}).get("actual") or 0)
    pct0 = _pct_half_up(actual, plan)
    score = plan_score(pct0, rule)
    return {"plan": round(plan), "actual": round(actual), "short": round(float((cr or {}).get("short") or 0)),
            "pct0": pct0, "days": sum(1 for v in daily if isinstance(v, list)),
            "no_fact": sum(1 for v in daily if v == "nf"),
            "score": score, "points": points_of(score, rule["weight"])}


def points_of(score: Optional[int], weight: float) -> Optional[float]:
    if score is None:
        return None
    return round(score * float(weight), 2)


# ── the month ─────────────────────────────────────────────────────────────────

def default_month(now: Optional[datetime] = None) -> date:
    """The month the page opens on — the one running («so far»), the
    operator's call."""
    now = now or local(now_aware())
    return month_start(now.date())


def _scope_ok(cell: dict, scope: dict) -> bool:
    if scope.get("factory") is not None and cell.get("factory_id") != scope["factory"]:
        return False
    if scope.get("shift") is not None and cell.get("shift") != scope["shift"]:
        return False
    if scope.get("managers") and cell.get("manager_id") not in scope["managers"]:
        return False
    return True


def _concerns_by_cell(db: Session, payload: dict, m: date, d: date, scope: dict) -> dict[str, dict]:
    """cell code → the month's concern counts, through the worker-concerns
    router's OWN filter and aggregation (the viewer lock included), so the
    board and /cell-concerns can never count one filing two ways. Imported
    lazily: a service reaching into a router, on purpose (the precedent is
    `leader_tasks` → `routers.leaders`)."""
    from app.routers import worker_concerns as wc
    from app.services.factory_scope import scoped_manager_ids

    lock = wc._viewer_lock(db, payload)
    managers = sorted(scope.get("managers") or [])
    units = scoped_manager_ids(db, payload, scope.get("factory"), managers)
    rows = (wc._apply_scope_and_filters(
        db, payload, date_from=m, date_to=d, factory=scope.get("factory"),
        manager_id=managers, leader_id=[], cell=[], status=[], lock=lock, units=units)
        .with_entities(*wc._agg_cols(db, d)).all())
    agg = wc._aggregate(db, rows, m, d, d)
    return agg["cells"]


def _concerns_row(counts: dict, rule: dict) -> dict:
    from app.routers import worker_concerns as wc

    v = {s: int(counts.get(s, 0) or 0) for s in wc.STATUSES}
    f = wc._figures(v)
    total = sum(v.values())
    score = concerns_score(f["pct0"], rule) if total and f["rated"] else None
    return {**v, "total": total, "rated": f["rated"], "open": f["open"],
            "pct": f["pct"], "pct0": f["pct0"], "score": score,
            "points": points_of(score, rule["weight"])}


def _rank(rows: list[dict]) -> None:
    """Best total first; a tie shares its place (1, 2, 2, 4)."""
    rows.sort(key=lambda r: (-r["total"], -(r["concerns"].get("score") or 0), r["code"] or ""))
    place, prev = 0, None
    for i, r in enumerate(rows, 1):
        if r["total"] != prev:
            place, prev = i, r["total"]
        r["rank"] = place


def board(db: Session, payload: dict, m: date, scope: Optional[dict] = None,
          at: Optional[datetime] = None) -> dict:
    """Everything the page shows for month `m`, within `scope`: the
    leaderboard rows, each KPI's month payload for its own tab, the rules."""
    from app.identity import photo_versions

    scope = scope or {}
    at = at or now_aware()
    now = local(at)
    d = last_day(m)
    tv = turnover.month_payload(db, m, scope, at)
    fo = foreign_objects.month_payload(db, m, scope, at)
    cp = cc.month_payload(db, m, scope, at)
    rules = {
        "concerns": concerns_rule(db),
        "turnover": tv.get("rule") or turnover.rule(db),
        "foreign": fo.get("rule") or foreign_objects.rule(db),
        # The scoring part alone: the ladders and the job map ride the tab's
        # own half (`compliance.rule`), the board's rule dialog needs the bands.
        "compliance": _slim_cc_rule(cp.get("rule") or cc.rule(db)),
        "audit": json.loads(json.dumps(AUDIT_RULE)),
        "plan": plan_rule(db),
    }
    kpis = [{"key": k, "live": k in LIVE,
             "weight": float(rules[k]["weight"]),
             "max_points": round(float(rules[k]["weight"]) * (rules[k].get("max_score") or 5), 2)}
            for k in KPI_KEYS]
    state = fo.get("state")      # before · future · open · ended (the calendar month)
    # The tabs read their own payloads; the old-bundle shapes nobody draws any
    # more are dropped here, not re-sent on every poll.
    for key in ("leaders", "cells"):
        tv.pop(key, None)
    fo.pop("cells", None)
    cp.pop("cells", None)
    base = {
        "month": ym(m), "past_from": ym(PAST_FROM), "state": state,
        "period": {"from": m.isoformat(), "to": d.isoformat()},
        "as_of": fo.get("as_of") or (min(now.date(), d) if state == "open" else d).isoformat(),
        "now": now.isoformat(timespec="minutes"),
        "max_points": MAX_POINTS, "kpis": kpis, "rules": rules,
        "turnover": tv, "foreign": fo, "compliance": cp,
    }
    if state in ("before", "future"):
        return {**base, "rows": [], "totals": None, "concerns": None, "plan": None,
                "options": {"shifts": [], "brigadirs": []}}

    cmap = cell_map(db, d)
    per_cell = _concerns_by_cell(db, payload, m, d, scope)
    from app.services import leader_register
    plan_cells = _plan_by_cell(db, m, d, cmap, scope, now.date(),
                               fresh_after=leader_register.last_write(payload))
    trank = {x["key"]: x for x in tv.get("ranking") or []}
    frank = {x["key"]: x for x in fo.get("ranking") or []}
    crank = {x["key"]: x for x in cp.get("ranking") or []}
    w_t = float(rules["turnover"]["weight"])
    w_f = float(rules["foreign"]["weight"])
    w_c = float(rules["compliance"]["weight"])

    rows: list[dict] = []
    for k, c in cmap.items():
        if not owned(c) or not _scope_ok(c, scope):
            continue
        t = trank.get(k)
        f = frank.get(k)
        concerns = _concerns_row(per_cell.get(c.get("code")) or {}, rules["concerns"])
        turn = None
        if t is not None:
            turn = {"working": t.get("working", 0), "left": t.get("left", 0), "rate": t.get("rate"),
                    "score": t.get("score"), "points": points_of(t.get("score"), w_t)}
        foreign = None
        if f is not None:
            foreign = {"count": f.get("count", 0), "all": f.get("all", 0), "kinds": f.get("kinds") or {},
                       "score": f.get("score"), "points": points_of(f.get("score"), w_f)}
        cm = crank.get(k)
        compliance = None
        if cm is not None:
            compliance = {"all": cm.get("all", 0), "counted": cm.get("counted", 0),
                          "compliant": cm.get("compliant", 0), "rate": cm.get("rate"), "pct0": cm.get("pct0"),
                          "score": cm.get("score"), "points": points_of(cm.get("score"), w_c)}
        plan = _plan_row(plan_cells.get(c.get("id")), rules["plan"])
        parts = [concerns.get("points"), (turn or {}).get("points"), (foreign or {}).get("points"),
                 (compliance or {}).get("points"), plan.get("points")]
        total = round(sum(p for p in parts if p is not None), 2)
        rows.append({
            "key": k, "id": c.get("id"), "code": c.get("code"),
            "owner_id": c.get("owner_id"), "owner": c.get("owner"), "owner_kind": c.get("owner_kind"),
            "owner_key": f"leader:{c['owner_id']}" if c.get("owner_id") else None,
            "leader_id": c.get("leader_id"), "leader": c.get("leader"),
            "manager_id": c.get("manager_id"), "brigadir": c.get("brigadir"),
            "shift": c.get("shift"), "factory_id": c.get("factory_id"),
            "concerns": concerns, "turnover": turn, "foreign": foreign,
            "compliance": compliance, "audit": None, "plan": plan,
            "_plan_daily": (plan_cells.get(c.get("id")) or {}).get("daily") or [],
            "total": total, "pct": int(round(total / MAX_POINTS * 100)),
        })
    _rank(rows)

    photos = photo_versions(db, [r["owner_key"] for r in rows])
    for r in rows:
        r["photo_ver"] = photos.get(r["owner_key"]) if r["owner_key"] else None

    def avg(vals: list) -> Optional[float]:
        vals = [v for v in vals if v is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    totals = {
        "owners": len({r["owner_id"] for r in rows}), "cells": len(rows),
        "avg_total": avg([r["total"] for r in rows]),
        "best": max((r["total"] for r in rows), default=None),
        "by_kpi": {
            "concerns": {"scored": sum(1 for r in rows if r["concerns"]["score"] is not None),
                         "avg_score": avg([r["concerns"]["score"] for r in rows])},
            "turnover": {"scored": sum(1 for r in rows if (r["turnover"] or {}).get("score") is not None),
                         "avg_score": avg([(r["turnover"] or {}).get("score") for r in rows])},
            "foreign": {"scored": sum(1 for r in rows if (r["foreign"] or {}).get("score") is not None),
                        "avg_score": avg([(r["foreign"] or {}).get("score") for r in rows])},
            "compliance": {"scored": sum(1 for r in rows if (r["compliance"] or {}).get("score") is not None),
                           "avg_score": avg([(r["compliance"] or {}).get("score") for r in rows])},
            "plan": {"scored": sum(1 for r in rows if r["plan"]["score"] is not None),
                     "avg_score": avg([r["plan"]["score"] for r in rows])},
        },
    }
    # The concerns tab's own headline: the month's filings over the rows.
    c_sum = {s: sum(r["concerns"][s] for r in rows) for s in ("done", "doing", "todo", "uplifted")}
    c_total = sum(c_sum.values())
    c_rated = c_total - c_sum["uplifted"]
    concerns = {**c_sum, "total": c_total, "rated": c_rated, "open": c_sum["doing"] + c_sum["todo"],
                "pct0": cc.whole_pct(c_sum["done"], c_rated),
                "no_concern_cells": sum(1 for r in rows if r["concerns"]["total"] == 0),
                "no_pct_cells": sum(1 for r in rows if r["concerns"]["total"] and not r["concerns"]["rated"])}
    return {**base, "rows": rows, "totals": totals, "concerns": concerns,
            "plan": _plan_half(rows, m, d, now.date()), "options": options(cmap)}


def _plan_half(rows: list[dict], m: date, d: date, today: date) -> dict:
    """The plan tab's own half: the month's figure over the rows, the days the
    figures run over, and each cell's day strip (taken off the board rows, so
    the rows the page polls stay small)."""
    from app.services import plan_fulfillment as pf

    lo, hi = max(m, pf.FLOOR), min(d, today)
    days = [(lo + timedelta(days=i)).isoformat() for i in range((hi - lo).days + 1)] if hi >= lo else []
    daily = {}
    for r in rows:
        strip = r.pop("_plan_daily", None) or []
        if any(v is not None for v in strip):
            daily[r["key"]] = strip
    plan = sum(r["plan"]["plan"] for r in rows)
    actual = sum(r["plan"]["actual"] for r in rows)
    return {
        "floor": pf.FLOOR.isoformat(), "before_floor": d < pf.FLOOR, "clamped": m < pf.FLOOR <= d,
        "days": days, "daily": daily,
        "plan": plan, "actual": actual, "short": sum(r["plan"]["short"] for r in rows),
        "pct0": _pct_half_up(actual, plan),
        "no_plan_cells": sum(1 for r in rows if r["plan"]["pct0"] is None),
        "no_fact_days": sum(r["plan"]["no_fact"] for r in rows),
    }


def concerns_register(db: Session, payload: dict, m: date, scope: Optional[dict] = None,
                      limit: int = 5000) -> list[dict]:
    """The month's concern filings in the scope, newest first — the workbook's
    register sheet (the page reads the same rows paged from
    `/api/worker-concerns/list`)."""
    from app.models import LeaderConcern
    from app.routers import worker_concerns as wc
    from app.services.factory_scope import scoped_manager_ids

    scope = scope or {}
    d = last_day(m)
    managers = sorted(scope.get("managers") or [])
    units = scoped_manager_ids(db, payload, scope.get("factory"), managers)
    query = wc._apply_scope_and_filters(
        db, payload, date_from=m, date_to=d, factory=scope.get("factory"),
        manager_id=managers, leader_id=[], cell=[], status=[], units=units)
    items = (query.with_entities(LeaderConcern, wc.BUCKET, wc._owner(db, d))
             .order_by(*wc._ORDER["date_desc"]).limit(limit).all())
    rows = wc._register_rows(db, items)
    if scope.get("shift") is not None:
        shifts = {c.get("code"): c.get("shift") for c in cell_map(db, d).values()}
        rows = [r for r in rows if shifts.get(r.get("cell")) == scope["shift"]]
    return rows
