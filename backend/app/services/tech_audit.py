"""«Texnologlar auditi» — the leaders' technologists'-audit KPI. THE rule.

The 5th of HR's five leaders' KPIs (weight 0.1, scored 0–3). **Its source is
panel.safiabakery.uz's «По дням» report** (2026-11-21, the technologists: «take
the avg for the cell from this link» — `/task-factory-reports/days?…&type=16`):
a workshop × day grid of every technical audit's rating, 100 % ones included,
kept in `panel_audit_days` by `panel_audits.refresh` (every two hours for the
current month, and by «Qayta hisoblash» for the month on screen). From
2026-11-06 to 2026-11-21 it read `public.audit`, whose division names turned
out to sit on the wrong workshops (docs/kpi.md); that table is no longer read
here (`drop_older_loads` still cleans it for the «Audit jadvali» screen).

The operator's rulings (2026-11-06, asked one by one):

* **A cell's month is the AVERAGE of that month's audits** — every audit row of
  the cell dated in the month, each counted once, mean of `avg_rating`.
* **A 0.00 rating is a real 0** — it is averaged in like any other.
* **A cell with no audit in the month has no figure** («—», 0 in the total —
  how every KPI treats a missing figure).
* **Which cell**: every code the panel workshop's name carries (3–5 digits, or
  «A» + 4), resolved through `turnover.code_key` («0028» and «28» are one cell)
  against the month's cell map — so a workshop naming two cells («8911 бисконти,
  7411 - Цех Пирог и печенье») counts for both, and several workshops carrying
  one code all count for it (2026-11-21, chosen when the operator left both
  questions open; HR's VLOOKUP took only the first). A workshop the panel still
  names by an OLD code is placed by its panel id (`PANEL_WORKSHOP_CELL`). A
  workshop that names no cell of ours counts toward nobody and is NAMED.
* **Credited like every leaders' KPI**: one row per cell with an OWNER («Egasi»)
  on the month's last day, standing on it (`turnover.cell_map` + `owned`).
* **HR's bands on the mean as the panel prints it — TWO decimals** (2026-11-21:
  «the avg from this link»; until then one decimal, which moved no October
  band): above 90 % → 3, above 80 % → 2, above 70 % → 1, else 0.
  `audit_rule` in app_settings overrides it (weight, bands, worst); a malformed
  override never blanks a score.

A month the panel was never read for, a missing or refused login, or a failed
read of «По дням» leaves the KPI NOT live (`source.ok` False — the board then
counts it 0 and says so), never a failed board.
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
    PAST_FROM, cell_map, code_key, last_day, local, now_aware, options, owned, ranked, unit_code, ym,
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
_CODES = re.compile(r"(?<![\d.])(\d{3,5})(?![\d.])")   # «самса,9122» is a code; «2.1» is not
# Panel workshops still named by a code the cell no longer has → today's cell.
# HR's own notes in its October file (column O of «Аудит Техн»), confirmed by the
# technologists on 21 Nov for 2322, 4324 and 8921 («7424 - Цех Печенье 4» is
# 8921 in the Tasker); and 0611, which Verifix itself names A0061. 8917 «Цех
# Печенье7» waits for them.
# shortcut: a constant, changed in code — make it an admin list when it moves often.
PANEL_WORKSHOP_CELL = {11: "7315", 176: "A0061", 122: "7414", 39: "7223", 129: "7424"}


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
    """The mean as the panel prints it. None = no audit, no score."""
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
    """The month's average as the panel prints it: two decimals, half up."""
    if not vals:
        return None
    m = sum(vals) / len(vals)
    return float(int(m * 100 + 0.5 + 1e-9)) / 100


# ── the source ────────────────────────────────────────────────────────────────

def _probe(db: Session) -> dict:
    """Whether the table exists and this app may read it — off the catalog."""
    rows = db.execute(sql(
        "SELECT to_regclass(:t) IS NOT NULL AS present, "
        "CASE WHEN to_regclass(:t) IS NULL THEN false "
        "     ELSE has_table_privilege(to_regclass(:t), 'SELECT') END AS readable"), {"t": TABLE}).first()
    return {"present": bool(rows and rows.present), "readable": bool(rows and rows.readable)}


_COLS = "date, type_name, factory_id, division_name, division_group_name, foreman, avg_rating"
# shortcut: loads are told apart by xmin read as a plain number — right until
# the server's transaction counter wraps (4 billion; it stood at 5 million).
_LOAD = "xmin::text::bigint"
_MISSING = f"""
    WITH n AS (SELECT max({_LOAD}) AS m FROM public.audit),
    old AS (SELECT {_COLS}, {_LOAD} AS x, count(*) AS c FROM public.audit, n
            WHERE {_LOAD} < n.m GROUP BY {_COLS}, {_LOAD}),
    new AS (SELECT {_COLS}, count(*) AS c FROM public.audit, n
            WHERE {_LOAD} = n.m GROUP BY {_COLS}),
    missing AS (SELECT count(*) AS k FROM old o WHERE NOT EXISTS (
        SELECT 1 FROM new w WHERE w.c >= o.c AND ({", ".join("w." + c for c in _COLS.split(", "))})
            IS NOT DISTINCT FROM ({", ".join("o." + c for c in _COLS.split(", "))})))
"""


def drop_older_loads(db: Session) -> tuple[int, int]:
    """(rows deleted, older rows the newest load lacks). The outside writer
    appends a FULL copy of the history on every load; this keeps the newest
    load and deletes the older ones — and deletes NOTHING unless every older
    row has an identical twin in the newest load (all seven columns, as many
    times as it stands in its own load). One statement, so the check and the
    delete see the same rows. The caller commits."""
    missing = int(db.execute(sql(_MISSING + "SELECT k FROM missing")).scalar() or 0)
    done = db.execute(sql(
        _MISSING + f"DELETE FROM public.audit a USING n, missing "
                   f"WHERE a.{_LOAD} < n.m AND missing.k = 0"))
    return int(done.rowcount or 0), missing


def read_month(db: Session, m: date) -> tuple[dict, list[dict]]:
    """(source, month `m`'s technical audits from the panel's «По дням» as last
    read). Never raises: a month never read, a login that cannot be used or a
    failed read returns `source.ok` False and no rows."""
    from app.services import panel_audits

    src: dict = {"ok": False, "why": None, "type": AUDIT_TYPE, "first": None, "last": None, "total": 0}
    rows: list[dict] = []
    try:
        with db.begin_nested():
            slot, days = panel_audits.days_of(db, "tech", m)
            if slot is None:
                login = panel_audits.configured(db)
                bad = not login["configured"] or login["refused"] or login["readable"] is False
                src["why"] = "no_read" if bad else "missing"
                return src, rows
            src.update(ok=True, total=len(days), read_at=slot.get("days_at"),
                       stale=slot.get("days_error"),
                       first=min(d.day for d in days).isoformat() if days else None,
                       last=max(d.day for d in days).isoformat() if days else None)
            rows = [{"date": d.day.isoformat(), "division": (d.workshop or "").strip(),
                     "workshop_id": d.workshop_id, "foreman": None, "rating": float(d.rating)}
                    for d in days]
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


def division_keys(a: dict, cmap: dict) -> list[str]:
    """Every cell of `cmap` a panel workshop counts for (the module notes)."""
    to = PANEL_WORKSHOP_CELL.get(a.get("workshop_id"))
    name = a.get("division") or ""
    codes = [to] if to else (_CODES.findall(name) or [division_key(name, cmap)])
    keys: list[str] = []
    for c in codes:
        k = code_key(c) if c else None
        if k and k in cmap and k not in keys:
            keys.append(k)
    return keys


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
        cells = [(k, cmap[k]) for k in division_keys(a, cmap)]
        if any_scope:
            cells = [(k, c) for k, c in cells if _in_scope(c, scope)]
            if not cells:
                continue       # a workshop on no cell belongs to no plant, shift or unit
        tot["audits"] += 1
        if not cells:
            tot["no_cell"] += 1
            u = unreg.setdefault(a["division"], {"division": a["division"], "count": 0, "ratings": []})
            u["count"] += 1
            u["ratings"].append(a["rating"])
            out.append({**a, "key": None, "code": None, "cell_id": None, "counted": "no_cell",
                        "owner": None, "brigadir": None})
            continue
        for k, c in cells:     # one row per cell the audit counts for
            counted = "owner" if owned(c) else "no_owner"
            per[k].append(a["rating"])
            tot[counted] += 1
            out.append({**a, "key": k, "code": c.get("code"), "cell_id": c.get("id"), "counted": counted,
                        "owner": c.get("owner"), "brigadir": c.get("brigadir")})

    ranking = []
    for k, c in cmap.items():
        if not ranked(c) or (any_scope and not _in_scope(c, scope)):
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
            **tot, "owners": len({x["owner_id"] for x in ranking if x["owner_id"]}), "owned_cells": len(ranking),
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
