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
    Sootvetstvie kategorii             0.20    NOT on the platform (HR holds one % per cell)
    Audit tekhnologov                  0.10    NOT on the platform (HR holds one % per cell)

The operator's rulings (2026-10-19, asked one by one):

* **One row per CELL, its owner named** — the reading all three pages shared
  since 2026-10-14 (`turnover.cell_map` + `turnover.owned`: an owner on the
  month's last day, standing on it). An owner of three cells is three rows.
* **One MONTH for every tab.** The concerns KPI is re-read by calendar month
  (its free date range went with the page); the current month reads «so far».
* **The total is out of 5.0 and the two missing KPIs count 0** — honest about
  what is missing, so a perfect leader today reads 3.5 / 5 (70%). When a KPI
  arrives its points simply join the sum.
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

Nothing is re-measured here: the turnover and foreign-object figures are the
two modules' own month payloads (`turnover.month_payload`,
`foreign_objects.month_payload`), the concerns counts the worker-concerns
router's own aggregation (`_aggregate` / `_figures` — the very rows
/cell-concerns holds). This module only joins them per cell, scores the
concerns KPI and ranks. The board is derived per request; nothing is stored.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting
from app.services import foreign_objects, turnover
from app.services.turnover import (
    PAST_FROM, cell_map, last_day, local, month_start, now_aware, options, owned, ym,
)

MAX_POINTS = 5.0

# The five, in the page's order — the platform's own numbering (concerns 1st,
# turnover 2nd, foreign objects 3rd, then the two HR still counts by hand).
KPI_KEYS = ("concerns", "turnover", "foreign", "compliance", "audit")
LIVE = {"concerns", "turnover", "foreign"}

# HR's July 2026 rules for the two KPIs the platform cannot compute yet — printed
# on their tabs so the reader knows what will come; nothing scores by them.
COMPLIANCE_RULE = {"weight": 0.2, "max_score": 5,
                   "bands": [["= 100%", 5], ["> 70%", 3], ["> 65%", 2], ["> 0%", 1]]}
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
    rules = {
        "concerns": concerns_rule(db),
        "turnover": tv.get("rule") or turnover.rule(db),
        "foreign": fo.get("rule") or foreign_objects.rule(db),
        "compliance": json.loads(json.dumps(COMPLIANCE_RULE)),
        "audit": json.loads(json.dumps(AUDIT_RULE)),
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
    base = {
        "month": ym(m), "past_from": ym(PAST_FROM), "state": state,
        "period": {"from": m.isoformat(), "to": d.isoformat()},
        "as_of": fo.get("as_of") or (min(now.date(), d) if state == "open" else d).isoformat(),
        "now": now.isoformat(timespec="minutes"),
        "max_points": MAX_POINTS, "kpis": kpis, "rules": rules,
        "turnover": tv, "foreign": fo,
    }
    if state in ("before", "future"):
        return {**base, "rows": [], "totals": None, "concerns": None, "options": {"shifts": [], "brigadirs": []}}

    cmap = cell_map(db, d)
    per_cell = _concerns_by_cell(db, payload, m, d, scope)
    trank = {x["key"]: x for x in tv.get("ranking") or []}
    frank = {x["key"]: x for x in fo.get("ranking") or []}
    w_t = float(rules["turnover"]["weight"])
    w_f = float(rules["foreign"]["weight"])

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
        parts = [concerns.get("points"), (turn or {}).get("points"), (foreign or {}).get("points")]
        total = round(sum(p for p in parts if p is not None), 2)
        rows.append({
            "key": k, "id": c.get("id"), "code": c.get("code"),
            "owner_id": c.get("owner_id"), "owner": c.get("owner"), "owner_kind": c.get("owner_kind"),
            "owner_key": f"leader:{c['owner_id']}" if c.get("owner_id") else None,
            "leader_id": c.get("leader_id"), "leader": c.get("leader"),
            "manager_id": c.get("manager_id"), "brigadir": c.get("brigadir"),
            "shift": c.get("shift"), "factory_id": c.get("factory_id"),
            "concerns": concerns, "turnover": turn, "foreign": foreign,
            "compliance": None, "audit": None,
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
        },
    }
    # The concerns tab's own headline: the month's filings over the rows.
    c_sum = {s: sum(r["concerns"][s] for r in rows) for s in ("done", "doing", "todo", "uplifted")}
    c_total = sum(c_sum.values())
    c_rated = c_total - c_sum["uplifted"]
    concerns = {**c_sum, "total": c_total, "rated": c_rated, "open": c_sum["doing"] + c_sum["todo"],
                "no_concern_cells": sum(1 for r in rows if r["concerns"]["total"] == 0),
                "no_pct_cells": sum(1 for r in rows if r["concerns"]["total"] and not r["concerns"]["rated"])}
    return {**base, "rows": rows, "totals": totals, "concerns": concerns, "options": options(cmap)}


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
