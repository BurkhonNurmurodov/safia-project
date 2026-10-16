"""«Yot jismlar» — the leaders' foreign-objects KPI (`/foreign-objects`). THE rule.

The 3rd of the leaders' five KPIs (the operator, 2026-10-16: «build the foreign
objects KPI from the Quality register»). HR's July 2026 file scored it per cell:

    count of the month's complaints of type «инородный предмет»
    in which the cell was AT FAULT («Есть ли вина цеха/магазина» = да)

    0 → 5 · 1 → 4 · 2–3 → 3 · 4–5 → 2 · 6 and more → 1,   KPI points = score × 0.25

(the file's own SUMIFS was broken — it summed the code column where the yes/no
flag equalled the code — so every count in it was typed by hand, and all 44 of
them matched a manual count of HR's complaints sheet, which is a copy of the
Quality register's «инородный предмет» rows.) The platform reads the register
itself — `quality_complaints`, the «для свода» tab the Quality page syncs —
and keeps HR's arithmetic:

* **A complaint counts** when its type is `foreign`, the cell IS at fault
  (`fault` True), its date falls in the month and its «Номер виновного цеха»
  resolves to a /cells cell (`cell_lookup`'s rule — '0028' and '28' are one
  cell). One not at the cell's fault, or with the flag left blank, is LISTED
  and never counted; a code on no cell counts toward nobody and is named.
* **The KPI is the CELL's, credited to its OWNER** («Egasi», `cells.owner_id`)
  on the month's last day, **one ranking row per OWNED cell** — the operator's
  rulings of 2026-10-13/14, read through `turnover.cell_map` + `turnover.owned`,
  the very reading /turnover and /worker-concerns list by, so for one month
  the three KPI pages name the same owners and the same cells. A cell with no
  owner counts toward nobody; an owned cell with no complaint scores 5.
* **Nothing is frozen.** The register is a dated log the sync reloads whole,
  so a month is re-read from the register as it stands now (the page prints
  the sync time; a month changes when the register does — a complaint
  re-attributed in the sheet moves its month on the next sync). HR's figures
  were a snapshot; this is the register.
* Before `LINKS_FROM` (the dated cell links, 2026-10-12) the owner map has no
  history, so an older month is credited by the owners in force at the first
  dated day — said so on the page (`approx_owners`).
* **The rule is admin-editable** (`foreign_rule` in app_settings, the shape
  of `turnover_rule`); a malformed override can never blank a score.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, QualityComplaint, QualitySyncMeta
from app.services.turnover import (   # the shared month arithmetic and cell reading
    PAST_FROM, START_MONTH, cell_map, code_key, last_day, local, month_start,
    now_aware, options, owned, ym,
)

LINKS_FROM = date(2026, 10, 12)   # the dated cell links begin here (cell_links)
CTYPE = "foreign"                 # sheets_reader._Q_TYPE: «инородный предмет»

RULE_KEY = "foreign_rule"
DEFAULT_RULE = {
    "weight": 0.25,
    "bands": [{"max": 0, "score": 5}, {"max": 1, "score": 4},
              {"max": 3, "score": 3}, {"max": 5, "score": 2}],
    "worst": 1,
}


# ── the rule ──────────────────────────────────────────────────────────────────

def rule(db: Session) -> dict:
    """The rule in force: the admin override when it is well-formed, else HR's."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if row and row.value:
        try:
            r = json.loads(row.value)
            bands = sorted(({"max": int(b["max"]), "score": int(b["score"])} for b in r["bands"]),
                           key=lambda b: b["max"])
            if bands and all(1 <= b["score"] <= 5 and b["max"] >= 0 for b in bands):
                return {"weight": float(r.get("weight", 0.25)), "bands": bands,
                        "worst": int(r.get("worst", 1))}
        except (ValueError, TypeError, KeyError):
            pass
    return json.loads(json.dumps(DEFAULT_RULE))


def score_of(count: int, r: dict) -> int:
    for b in sorted(r["bands"], key=lambda b: b["max"]):
        if count <= int(b["max"]):
            return int(b["score"])
    return int(r["worst"])


def points_of(score: Optional[int], r: dict) -> Optional[float]:
    if score is None:
        return None
    return round(score * float(r["weight"]), 2)


# ── a month's state ───────────────────────────────────────────────────────────

def month_state(m: date, now: Optional[datetime] = None) -> str:
    """before · future · open (the month running — «so far») · ended."""
    now = now or local(now_aware())
    cur = month_start(now.date())
    if m < PAST_FROM:
        return "before"
    if m > cur:
        return "future"
    return "open" if m == cur else "ended"


def sync_info(db: Session) -> dict:
    """When the Quality register was last pulled from its sheet, and how it went."""
    meta = db.query(QualitySyncMeta).filter_by(id=1).first()
    return {
        "at": meta.last_synced.isoformat(timespec="minutes") if meta and meta.last_synced else None,
        "ok": meta.ok if meta else None,
        "message": (meta.message or "")[:300] if meta else "",
    }


# ── the register ──────────────────────────────────────────────────────────────

def complaints_of(db: Session, m: date) -> list[dict]:
    """Every foreign-object complaint dated inside month `m`, as stored."""
    a, b = m.isoformat(), last_day(m).isoformat()
    rows = (db.query(QualityComplaint)
            .filter(QualityComplaint.ctype == CTYPE,
                    QualityComplaint.date >= a, QualityComplaint.date <= b)
            .order_by(QualityComplaint.date.desc(), QualityComplaint.id.desc())
            .all())
    return [{
        "id": r.id, "date": r.date, "raw_code": (r.fault_code or "").strip(),
        "fault": r.fault, "kind": r.category or None, "source": r.source, "place": r.place,
        "product": r.product, "description": r.description, "status": r.status,
        "ref_no": r.ref_no, "sheet_brigadir": r.brigadir, "cell_name": r.cell_name,
    } for r in rows]


def _in_scope(cell: dict, scope: dict) -> bool:
    if scope.get("factory") is not None and cell.get("factory_id") != scope["factory"]:
        return False
    if scope.get("shift") is not None and cell.get("shift") != scope["shift"]:
        return False
    if scope.get("managers") and cell.get("manager_id") not in scope["managers"]:
        return False
    return True


_CELL_FIELDS = ("id", "code", "archived", "manager_id", "brigadir", "shift", "factory_id",
                "leader_id", "leader", "leader_kind", "owner_id", "owner", "owner_kind")


def aggregate(rows: list[dict], cmap: dict[str, dict], r: dict, scope: Optional[dict] = None) -> dict:
    """The month's figures from its complaints and the cell map. ONE function
    for the page, the explain dialog and the workbook, so none can state a
    second answer."""
    scope = scope or {}
    any_scope = bool(scope.get("factory") is not None or scope.get("shift") is not None
                     or scope.get("managers"))

    # Per cell: counted (at fault), listed (every foreign complaint on it), kinds.
    per: dict[str, dict] = defaultdict(lambda: {"count": 0, "all": 0, "kinds": defaultdict(int)})
    unreg: dict[str, dict] = {}
    out_rows: list[dict] = []
    tot = {"complaints": 0, "fault": 0, "fault_owner": 0, "fault_no_owner": 0, "fault_no_cell": 0,
           "not_fault": 0, "unknown": 0}
    by_kind: dict[str, int] = defaultdict(int)
    by_source: dict[str, int] = defaultdict(int)

    for x in rows:
        k = code_key(x["raw_code"])
        c = cmap.get(k) if k else None
        if c is not None and any_scope and not _in_scope(c, scope):
            continue
        if c is None and any_scope:
            continue          # a code on no cell belongs to no plant, shift or unit
        at_fault = x["fault"] is True
        if c is not None:
            per[k]["all"] += 1
        if not at_fault:
            counted = "not_fault" if x["fault"] is False else "unknown"
            tot["not_fault" if x["fault"] is False else "unknown"] += 1
        elif c is None:
            counted = "no_cell"
            tot["fault"] += 1
            tot["fault_no_cell"] += 1
            u = unreg.setdefault(k or "", {"key": k or "", "code": x["raw_code"] or None,
                                            "cell_name": x.get("cell_name") or None, "count": 0})
            u["count"] += 1
        else:
            counted = "owner" if owned(c) else "no_owner"
            tot["fault"] += 1
            tot["fault_owner" if counted == "owner" else "fault_no_owner"] += 1
            per[k]["count"] += 1
            per[k]["kinds"][x["kind"] or "other"] += 1
            by_kind[x["kind"] or "other"] += 1
        tot["complaints"] += 1
        by_source[x["source"] or "other"] += 1
        out_rows.append({
            "id": x["id"], "date": x["date"], "cell_key": k or None,
            "code": (c or {}).get("code") or x["raw_code"] or None, "cell_id": (c or {}).get("id"),
            "kind": x["kind"], "source": x["source"], "place": x["place"], "product": x["product"],
            "description": x["description"], "status": x["status"], "ref_no": x["ref_no"],
            "sheet_brigadir": x["sheet_brigadir"], "fault": x["fault"], "counted": counted,
            "owner_id": (c or {}).get("owner_id"), "owner": (c or {}).get("owner"),
            "leader": (c or {}).get("leader"), "brigadir": (c or {}).get("brigadir"),
            "manager_id": (c or {}).get("manager_id"), "shift": (c or {}).get("shift"),
        })

    def cell_row(k: str, c: dict) -> dict:
        p = per.get(k) or {"count": 0, "all": 0, "kinds": {}}
        sc = score_of(p["count"], r)
        return {"key": k, **{f: c.get(f) for f in _CELL_FIELDS},
                "count": p["count"], "all": p["all"], "kinds": dict(p["kinds"]),
                "score": sc, "points": points_of(sc, r)}

    # The ranking: one row per OWNED cell (an owner on the month's last day,
    # standing on it) — the operator, 2026-10-14. Worst first: the most
    # complaints, then the code, the order HR reads it in.
    ranking = []
    for k, c in cmap.items():
        if not owned(c) or (any_scope and not _in_scope(c, scope)):
            continue
        ranking.append(cell_row(k, c))
    ranking.sort(key=lambda x: (-x["count"], x["code"] or ""))

    # Every cell standing on the day, plus an archived one a complaint names.
    cells = []
    for k, c in cmap.items():
        if any_scope and not _in_scope(c, scope):
            continue
        if c.get("archived") and not per.get(k):
            continue
        cells.append(cell_row(k, c))
    cells.sort(key=lambda x: (-x["count"], -x["all"], x["code"] or ""))

    by_score = {str(s): 0 for s in range(1, 6)}
    for x in ranking:
        by_score[str(x["score"])] += 1
    owners = {x["owner_id"] for x in ranking}
    return {
        "totals": {
            **tot,
            "owners": len(owners), "owned_cells": len(ranking),
            "clean_cells": sum(1 for x in ranking if x["count"] == 0),
            "by_score": by_score,
            "by_kind": dict(sorted(by_kind.items(), key=lambda kv: -kv[1])),
            "by_source": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        },
        "ranking": ranking, "cells": cells, "complaints": out_rows,
        "unregistered": [] if any_scope else sorted(unreg.values(), key=lambda u: -u["count"]),
    }


def month_payload(db: Session, m: date, scope: Optional[dict] = None,
                  at: Optional[datetime] = None) -> dict:
    """Everything the page shows for month `m`, within `scope`."""
    at = at or now_aware()
    now = local(at)
    state = month_state(m, now)
    d = last_day(m)
    base = {
        "month": ym(m), "start": ym(START_MONTH), "past_from": ym(PAST_FROM), "state": state,
        "period": {"from": m.isoformat(), "to": d.isoformat()},
        "as_of": (min(now.date(), d) if state == "open" else d).isoformat(),
        "now": now.isoformat(timespec="minutes"),
        "sync": sync_info(db),
        "rule": rule(db),
        # Owners read by the dated links; a month that ended before they
        # existed is credited by the earliest owners they know — approximate.
        "approx_owners": d < LINKS_FROM,
    }
    if state in ("before", "future"):
        return base
    cmap = cell_map(db, d)
    agg = aggregate(complaints_of(db, m), cmap, base["rule"], scope)
    return {**base, **agg, "options": options(cmap)}
