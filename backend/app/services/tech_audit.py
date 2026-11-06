"""«Texnologlar auditi» — the leaders' technologists'-audit KPI. THE rule.

The 5th of HR's five leaders' KPIs (weight 0.1, scored 0–3). Until 2026-11-06 the
platform had no source for it and it counted 0 for every cell. Its source is
`public.audit` — a table this codebase does NOT create or write: something
outside it (owner `safia_prod_rw`) appends one row per audit of a workshop:

    date · type_name · factory_id (THEIR workshop id, not our plant)
    division_name («7213 Медовые коржи») · division_group_name · foreman · avg_rating (0–100)

Two kinds of audit live there; this KPI reads `type_name` «Технический аудит»
alone (`AUDIT_TYPE`). The other, «КРУ Производство», is the KRU audit the
brigadirs' KPI waits for — not read here.

The operator's rulings (2026-11-06, asked one by one):

* **A cell's month is the AVERAGE of that month's audits** — every audit row of
  the cell dated in the month, each counted once, mean of `avg_rating`.
* **A 0.00 rating is a real 0** — it is averaged in like any other.
* **A cell with no audit in the month has no figure** («—», 0 in the total —
  how every KPI treats a missing figure).
* **Which cell**: the code `division_name` starts with (3–5 digits —
  `turnover.unit_code`'s reading, the Verifix org-unit names' own shape), else
  the four digits it ends with, else the whole name; resolved through
  `turnover.code_key` («0028» and «28» are one cell) against the month's cell
  map. A division that names no cell of ours counts toward nobody and is NAMED.
* **Credited like every leaders' KPI**: one row per cell with an OWNER («Egasi»)
  on the month's last day, standing on it (`turnover.cell_map` + `owned`).
* **HR's bands on the mean, ONE decimal, judged as printed** (the turnover and
  compliance rule): above 90 % → 3, above 80 % → 2, above 70 % → 1, else 0.
  `audit_rule` in app_settings overrides it (weight, bands, worst); a malformed
  override never blanks a score.

Read-only, in a savepoint: a table that is missing, unreadable (no GRANT) or
broken leaves the KPI NOT live (`source.ok` False — the board then counts it 0
and says so), never a failed board. Nothing is stored; a month is re-read as the
table stands.
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime
from typing import Optional

from sqlalchemy import text as sql
from sqlalchemy.orm import Session

from app.models import AppSetting
from app.services.turnover import (
    PAST_FROM, cell_map, code_key, last_day, local, now_aware, options, owned, unit_code, ym,
)

AUDIT_TYPE = "Технический аудит"
TABLE = "public.audit"
RULE_KEY = "audit_rule"
DEFAULT_RULE = {
    "weight": 0.1,
    # «above N%» → score, HR's IFS(>90%,3, >80%,2, >70%,1, else 0).
    "bands": [{"above": 90, "score": 3}, {"above": 80, "score": 2}, {"above": 70, "score": 1}],
    "worst": 0,
    "max_score": 3,
}
_TAIL4 = re.compile(r"(?<!\d)(\d{4})\s*$")


# ── the rule ──────────────────────────────────────────────────────────────────

def rule(db: Session) -> dict:
    """The rule in force: the admin override when it is well-formed, else HR's."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if row and row.value:
        try:
            r = json.loads(row.value)
            bands = sorted(({"above": float(b["above"]), "score": int(b["score"])} for b in r["bands"]),
                           key=lambda b: -b["above"])
            w = float(r.get("weight", 0.1))
            worst = int(r.get("worst", 0))
            top = max([b["score"] for b in bands] + [worst])
            if bands and 0 <= w <= 1 and all(0 <= b["score"] <= 5 and 0 <= b["above"] <= 100 for b in bands) \
                    and 0 <= worst <= 5:
                return {"weight": w, "bands": bands, "worst": worst, "max_score": top}
        except (ValueError, TypeError, KeyError):
            pass
    return json.loads(json.dumps(DEFAULT_RULE))


def score_of(pct: Optional[float], r: dict) -> Optional[int]:
    """The ONE-decimal mean, judged as printed. None = no audit, no score."""
    if pct is None:
        return None
    for b in sorted(r["bands"], key=lambda b: -float(b["above"])):
        if pct > float(b["above"]):
            return int(b["score"])
    return int(r["worst"])


def points_of(score: Optional[int], r: dict) -> Optional[float]:
    if score is None:
        return None
    return round(score * float(r["weight"]), 2)


def mean1(vals: list[float]) -> Optional[float]:
    """The month's average to one decimal, half up (as printed)."""
    if not vals:
        return None
    m = sum(vals) / len(vals)
    return float(int(m * 10 + 0.5 + 1e-9)) / 10


# ── the source ────────────────────────────────────────────────────────────────

def _probe(db: Session) -> dict:
    """Whether the table exists and this app may read it — off the catalog."""
    rows = db.execute(sql(
        "SELECT to_regclass(:t) IS NOT NULL AS present, "
        "CASE WHEN to_regclass(:t) IS NULL THEN false "
        "     ELSE has_table_privilege(to_regclass(:t), 'SELECT') END AS readable"), {"t": TABLE}).first()
    return {"present": bool(rows and rows.present), "readable": bool(rows and rows.readable)}


def read_month(db: Session, m: date) -> tuple[dict, list[dict]]:
    """(source, the month's technical audits as stored). Never raises: a table
    that cannot be read returns `source.ok` False and no rows."""
    src: dict = {"ok": False, "why": None, "type": AUDIT_TYPE, "first": None, "last": None, "total": 0}
    rows: list[dict] = []
    try:
        with db.begin_nested():
            p = _probe(db)
            if not p["present"]:
                src["why"] = "missing"
                return src, rows
            if not p["readable"]:
                src["why"] = "no_read"
                return src, rows
            span = db.execute(sql(
                "SELECT count(*) AS n, min(date) AS first, max(date) AS last FROM public.audit "
                "WHERE btrim(type_name) = :t"), {"t": AUDIT_TYPE}).first()
            src.update(ok=True, total=int(span.n or 0),
                       first=span.first.isoformat() if span.first else None,
                       last=span.last.isoformat() if span.last else None)
            res = db.execute(sql(
                "SELECT date, division_name, foreman, avg_rating FROM public.audit "
                "WHERE btrim(type_name) = :t AND date >= :a AND date <= :b AND avg_rating IS NOT NULL "
                "ORDER BY date DESC, division_name"),
                {"t": AUDIT_TYPE, "a": m, "b": last_day(m)})
            for r in res:
                rows.append({"date": r.date.isoformat() if r.date else None,
                             "division": (r.division_name or "").strip(),
                             "foreman": (r.foreman or "").strip() or None,
                             "rating": float(r.avg_rating)})
    except Exception as exc:  # noqa: BLE001 — a broken source must not break the board
        src.update(ok=False, why="error", error=f"{type(exc).__name__}: {str(exc).splitlines()[0][:200]}")
        rows = []
    return src, rows


def division_key(name: str, cmap: dict) -> Optional[str]:
    """The cell code key a division name names, if it names one of `cmap`."""
    for code in (unit_code(None, name), (_TAIL4.search(name or "") or [None, None])[1], name):
        k = code_key(code) if code else None
        if k and k in cmap:
            return k
    return None


# ── the month ─────────────────────────────────────────────────────────────────

def _in_scope(cell: dict, scope: dict) -> bool:
    if scope.get("factory") is not None and cell.get("factory_id") != scope["factory"]:
        return False
    if scope.get("shift") is not None and cell.get("shift") != scope["shift"]:
        return False
    if scope.get("managers") and cell.get("manager_id") not in scope["managers"]:
        return False
    return True


def aggregate(audits: list[dict], cmap: dict[str, dict], r: dict, scope: Optional[dict] = None) -> dict:
    """The month's figures from its audits and the cell map. ONE function for
    the board, the tab, the explain dialog and the workbook."""
    scope = scope or {}
    any_scope = bool(scope.get("factory") is not None or scope.get("shift") is not None
                     or scope.get("managers"))
    per: dict[str, list[float]] = defaultdict(list)
    unreg: dict[str, dict] = {}
    out: list[dict] = []
    tot = {"audits": 0, "owner": 0, "no_owner": 0, "no_cell": 0}
    for a in audits:
        k = division_key(a["division"], cmap)
        c = cmap.get(k) if k else None
        if any_scope and (c is None or not _in_scope(c, scope)):
            continue           # a division on no cell belongs to no plant, shift or unit
        if c is None:
            counted = "no_cell"
            u = unreg.setdefault(a["division"], {"division": a["division"], "count": 0, "ratings": []})
            u["count"] += 1
            u["ratings"].append(a["rating"])
        else:
            counted = "owner" if owned(c) else "no_owner"
            per[k].append(a["rating"])
        tot["audits"] += 1
        tot[counted] += 1
        out.append({**a, "key": k, "code": (c or {}).get("code"), "cell_id": (c or {}).get("id"),
                    "counted": counted, "owner": (c or {}).get("owner"), "brigadir": (c or {}).get("brigadir")})

    ranking = []
    for k, c in cmap.items():
        if not owned(c) or (any_scope and not _in_scope(c, scope)):
            continue
        vals = per.get(k) or []
        pct = mean1(vals)
        sc = score_of(pct, r)
        ranking.append({
            "key": k, "id": c.get("id"), "code": c.get("code"), "owner_id": c.get("owner_id"),
            "owner": c.get("owner"), "brigadir": c.get("brigadir"), "manager_id": c.get("manager_id"),
            "shift": c.get("shift"), "factory_id": c.get("factory_id"),
            "audits": len(vals), "pct": pct,
            "min": min(vals) if vals else None, "max": max(vals) if vals else None,
            "score": sc, "points": points_of(sc, r),
        })
    # Worst first: no audit last, then the lowest mean, then the code.
    ranking.sort(key=lambda x: (x["pct"] is None, x["pct"] if x["pct"] is not None else 0, x["code"] or ""))
    scored = [x for x in ranking if x["pct"] is not None]
    pooled = [v for x in ranking for v in per.get(x["key"]) or []]
    by_score: dict[str, int] = {}
    for x in scored:
        by_score[str(x["score"])] = by_score.get(str(x["score"]), 0) + 1
    return {
        "totals": {
            **tot, "owners": len({x["owner_id"] for x in ranking}), "owned_cells": len(ranking),
            "scored_cells": len(scored), "no_audit_cells": len(ranking) - len(scored),
            # The month over the ranking's cells: the mean of every audit they had.
            "pct": mean1(pooled), "ranked_audits": len(pooled), "by_score": by_score,
        },
        "ranking": ranking,
        "audits": out,
        "unregistered": [] if any_scope else sorted(
            ({"division": u["division"], "count": u["count"], "pct": mean1(u["ratings"])}
             for u in unreg.values()), key=lambda u: (-u["count"], u["division"])),
    }


def month_payload(db: Session, m: date, scope: Optional[dict] = None,
                  at: Optional[datetime] = None, cmap: Optional[dict] = None) -> dict:
    """Everything the tab shows for month `m`, within `scope`."""
    at = at or now_aware()
    now = local(at)
    d = last_day(m)
    cur = date(now.year, now.month, 1)
    state = "before" if m < PAST_FROM else "future" if m > cur else "open" if m == cur else "ended"
    r = rule(db)
    base = {"month": ym(m), "state": state, "rule": r,
            "period": {"from": m.isoformat(), "to": d.isoformat()}}
    if state in ("before", "future"):
        return {**base, "source": {"ok": False, "why": None}}
    src, audits = read_month(db, m)
    base["source"] = src
    if not src["ok"]:
        return base
    cmap = cmap if cmap is not None else cell_map(db, d)
    return {**base, **aggregate(audits, cmap, r, scope), "options": options(cmap)}
