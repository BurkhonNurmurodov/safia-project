"""«Brigadirlar KPI» (`/brigadirs-kpi`) — HR's monthly brigadir KPI, the
criteria the platform can answer computed, the rest left as places to fill
(2026-11-02, the operator: «Build for first 2 KPI categories and leave space
for the remaining 3. For the brigadirs which are not on our IMS, check our
resources Verifix and sheets for their data to load»).

HR's July 2026 workbook is the specification: four pass / fail criteria at
25% each, the score = criteria passed ÷ 4, the payout = passed × a per-person
amount. What this module answers:

* **Qo'nimsizlik (Текучесть)** — LIVE. Per cell: the month's leavers ÷ the
  people working on its last day × 12 (`turnover.month_payload`, the leaders'
  turnover KPI's own month, never re-measured). A brigadir's figure is the
  MEAN of their cells' rates (HR's AVERAGEIFS; `method: "pooled"` in the rule
  is the alternative) over the cells with somebody working — a cell with nobody
  on its list has no rate, and HR's IFERROR → 0 was not carried over. Passes
  when the figure, rounded to the decimal printed, is BELOW `turnover.max`
  (60), strict, as HR's file compares.
* **OKK tuzatuvchi choralar (ОКК корректирующие меры)** — LIVE. The month's
  quality-register records the brigadir answers for («Отв. бригадир», matched
  by `name_map.supervisor_match`, the Quality page's own rule), the statuses
  that describe work (`shift_report.ACTIONABLE`): resolved ÷ all. The hair
  category is left out by default (`okk.skip_hair`, the platform's reading
  since 2026-09-18). Passes when the resolved share, rounded to the decimal
  printed, is ABOVE `okk.min` (90), strict. A month with no record has no
  figure and does not pass (HR's #DIV/0! → blank, `okk.no_records`).
* **Murabbiylik**, **KRU** and **To'lov** — PLACES: the platform has no
  source for the attestation result, the KRU department's audit score, or the
  rates and allowances the payout multiplies (Verifix's payroll lists are
  closed since 2026-10-03). Each is null on every row and says why.

**Who is a brigadir here** — HR's list is wider than the platform's units:
it carries the washing, kitchen, supply, Keles and logistics brigadirs too.
Every non-archived unit with a cell or a quality record is a row, AND every
WORKING Verifix brigadir (`verifix_org.brigadirs_over`, a brigadir's job) who
answers for cells or records but is tied to no unit here — keyed `v:<id>`,
named as Verifix spells them. A cell is credited by the cells register on the
month's last day (`turnover.cell_map`); a cell with no brigadir there, or a
Verifix subdivision /cells does not carry, by the Verifix brigadir standing
over it — HR's own reading («Руководитель» in the directory). A quality
spelling is matched against the units AND those Verifix brigadirs together, so
a Verifix brigadir's records reach their row.

Nothing is stored; every figure is derived per request (and kept for a minute
by the router).
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime
from types import SimpleNamespace
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, Factory, Manager, QualityComplaint
from app.services import foreign_objects, shift_report, turnover, verifix_org
from app.services.name_map import register_brigadir, supervisor_match
from app.translit import transliterate
from app.services.turnover import (PAST_FROM, last_day, local, month_start, next_month, now_aware,
                                   round1, ym)

KPI_KEYS = ("turnover", "okk", "mentoring", "kru")
LIVE = ("turnover", "okk")
CRITERIA = len(KPI_KEYS)
RULE_KEY = "brigadir_kpi_rule"
DEFAULT_RULE = {
    # HR's July file: «Текучесть ниже 60%», strict.
    "turnover": {"max": 60.0, "method": "mean"},
    # «ОКК Корректирующие меры 90%», strict; a month with no record does not pass.
    "okk": {"min": 90.0, "skip_hair": True, "no_records": "fail"},
    # The two criteria with no source yet — their thresholds, printed on the tab.
    "mentoring": {"min": 80.0},
    "kru": {"min": 90.0},
}
RESOLVED = "done"
UNRESOLVED = ("open", "waiting")
REPEAT = "repeat"


# ── the rule ──────────────────────────────────────────────────────────────────

def rule(db: Session) -> dict:
    """The rule in force: HR's, with whatever an admin set in app_settings
    (`brigadir_kpi_rule`, written through `PUT /admin/settings`) laid over it
    field by field. A value that is not a number is ignored, never a blank."""
    out = json.loads(json.dumps(DEFAULT_RULE))
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if not row or not row.value:
        return out
    try:
        given = json.loads(row.value)
    except (ValueError, TypeError):
        return out
    if not isinstance(given, dict):
        return out
    for k, defaults in DEFAULT_RULE.items():
        part = given.get(k)
        if not isinstance(part, dict):
            continue
        for f, dv in defaults.items():
            v = part.get(f)
            if isinstance(dv, bool):
                if isinstance(v, bool):
                    out[k][f] = v
            elif isinstance(dv, float):
                try:
                    if v is not None and 0 <= float(v) <= 1000:
                        out[k][f] = float(v)
                except (TypeError, ValueError):
                    pass
            elif f == "method" and v in ("mean", "pooled"):
                out[k][f] = v
            elif f == "no_records" and v in ("fail", "pass"):
                out[k][f] = v
    return out


def default_month(now: Optional[datetime] = None) -> date:
    now = now or local(now_aware())
    return month_start(now.date())


# ── who answers for a cell ────────────────────────────────────────────────────

class _Verifix:
    """The stored Verifix org, asked «which brigadir stands over this cell»."""

    def __init__(self, db: Session, units: list[Manager]):
        self.plants = _plants(db)
        self.org, self.at = verifix_org.stored(db)
        self.ok = bool(self.org) and verifix_org.guard(self.org) is None
        self.units = units
        self.brigadirs: dict[str, dict] = {}     # vfx id → {id, name}
        if not self.ok:
            return
        divs, emps, jobs = self.org.get("divs") or {}, self.org.get("emps") or {}, self.org.get("jobs") or {}
        self.cn = verifix_org.cell_nodes(divs, emps, jobs)
        by_vfx: dict = defaultdict(list)
        for u in units:
            if u.vfx_employee_id:
                by_vfx[u.vfx_employee_id].append(u.id)
        self.over = verifix_org.brigadirs_over(divs, emps, jobs, {k: tuple(v) for k, v in by_vfx.items()})
        # Every working Verifix brigadir tied to no unit here and spelled like
        # none of them — the candidates a quality spelling may name.
        tied = set(by_vfx)
        for e in emps.values():
            if (e.get("status") or "W") != "W" or e["id"] in tied:
                continue
            if not verifix_org.is_supervisor_job(verifix_org.job_name(self.org, e.get("job"))):
                continue
            if self._unit_named(e.get("name") or "") is not None:
                continue
            self.brigadirs[e["id"]] = {"id": e["id"], "name": e.get("name") or f"#{e['id']}"}

    def plant_of(self, vfx_id: str) -> Optional[int]:
        """The plant a Verifix brigadir works in: the first division above
        their own whose name names a plant («Келес …»), else the platform's
        first plant — where `startup.migrate_factories` puts every unit nobody
        assigned. A brigadir with no plant would show only under «All
        factories», i.e. not on the tab the page opens on."""
        fallback = self.plants[0][0] if self.plants else None
        if not self.ok:
            return fallback
        divs = self.org.get("divs") or {}
        cur = ((self.org.get("emps") or {}).get(vfx_id) or {}).get("unit")
        for _ in range(12):
            d = divs.get(cur or "")
            if not d:
                break
            folded = _fold(d.get("name"))
            for fid, words in self.plants:
                if any(w in folded for w in words):
                    return fid
            cur = d.get("parent")
        return fallback

    def _unit_named(self, name: str) -> Optional[int]:
        hits = [u.id for u in self.units if verifix_org.same_person(u.name or "", name)]
        return hits[0] if len(hits) == 1 else None

    def credit(self, key: str) -> tuple[Optional[str], str]:
        """(row key, how) — `m:<unit id>` or `v:<Verifix id>`, else None with why."""
        if not self.ok:
            return None, "no_org"
        node = self.cn["nodes"].get(key)
        if not node:
            return None, "no_node"
        bs = self.over(node["id"])
        if not bs:
            return None, "no_brigadir"
        if len(bs) > 1:
            return None, "several"
        b = bs[0]
        if len(b["unit"]) == 1:
            return f"m:{b['unit'][0]}", "verifix_unit"
        if len(b["unit"]) > 1:
            return None, "several_units"
        uid = self._unit_named(b["name"])
        if uid is not None:
            return f"m:{uid}", "verifix_unit"
        self.brigadirs.setdefault(b["id"], {"id": b["id"], "name": b["name"]})
        return f"v:{b['id']}", "verifix"


def _fold(v: Optional[str]) -> str:
    return transliterate(v or "", "uz").casefold()


def _plants(db: Session) -> list[tuple[int, set]]:
    """(plant id, the words that name it) — live plants, the first by id
    first (the plant unassigned units are attached to)."""
    out = []
    for f in db.query(Factory).filter(Factory.archived.is_(False)).order_by(Factory.id).all():
        words = {_fold(v).strip() for v in (f.code, f.name_uz, f.name_uz_cyrl, f.name_ru, f.name_en) if v}
        out.append((f.id, {w for w in words if len(w) >= 4}))
    return out


# ── the two live criteria ─────────────────────────────────────────────────────

def _turnover_of(cells: list[dict], mult: float, r: dict) -> dict:
    """A brigadir's turnover from their credited cells."""
    rated = [c for c in cells if c["working"] > 0]
    working = sum(c["working"] for c in cells)
    left = sum(c["left"] for c in cells)
    value = None
    if rated:
        if r["method"] == "pooled":
            value = round1(sum(c["left"] for c in rated) / sum(c["working"] for c in rated) * mult * 100)
        else:
            value = round1(sum(c["left"] / c["working"] * mult * 100 for c in rated) / len(rated))
    return {
        "value": value, "working": working, "left": left, "cells": len(cells), "rated": len(rated),
        "left_unrated": sum(c["left"] for c in cells if c["working"] == 0),
        "pass": None if value is None else value < r["max"],
    }


def _okk_of(counts: dict, r: dict) -> dict:
    total = counts.get("total", 0)
    done = counts.get("done", 0)
    pct = round1(done / total * 100) if total else None
    if pct is None:
        ok = True if r["no_records"] == "pass" else None
    else:
        ok = pct > r["min"]
    return {"total": total, "done": done, "unresolved": counts.get("unresolved", 0),
            "repeat": counts.get("repeat", 0), "not_required": counts.get("not_required", 0),
            "hair": counts.get("hair", 0), "pct": pct, "pass": ok}


def _quality_rows(db: Session, m: date) -> list:
    return (db.query(QualityComplaint.id, QualityComplaint.date, QualityComplaint.ref_no,
                     QualityComplaint.brigadir, QualityComplaint.place, QualityComplaint.status,
                     QualityComplaint.ctype, QualityComplaint.category, QualityComplaint.product,
                     QualityComplaint.description, QualityComplaint.action)
            .filter(QualityComplaint.date >= m.isoformat(),
                    QualityComplaint.date < next_month(m).isoformat())
            .order_by(QualityComplaint.date, QualityComplaint.id)
            .all())


def _cut(s: Optional[str], n: int) -> Optional[str]:
    s = (s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


# ── the month ─────────────────────────────────────────────────────────────────

def board(db: Session, m: date, scope: dict, lock: Optional[list], at: Optional[datetime] = None) -> dict:
    """Every row and every tab of month `m`. `scope` = {factory, shift,
    managers}; `lock` = the units the viewer may see (None = every unit; an
    EMPTY list is a real answer — nobody). `scope["units"]` is the plant +
    brigadir narrowing already resolved (`scoped_manager_ids`)."""
    at = at or now_aware()
    now = local(at)
    d = last_day(m)
    r = rule(db)
    state = foreign_objects.month_state(m, now)     # before · future · open · ended
    kpis = [{"key": k, "live": k in LIVE} for k in KPI_KEYS]
    base = {
        "month": ym(m), "past_from": ym(PAST_FROM), "state": state,
        "period": {"from": m.isoformat(), "to": d.isoformat()},
        "as_of": (min(now.date(), d) if state == "open" else d).isoformat(),
        "now": now.isoformat(timespec="minutes"),
        "criteria": CRITERIA, "kpis": kpis, "rule": r,
        "quality_sync": foreign_objects.sync_info(db),
    }
    if state in ("before", "future"):
        return {**base, "rows": [], "turnover": None, "okk": None, "notes": {},
                "options": {"shifts": [], "brigadirs": []}}

    units = db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all()
    unit_by_id = {u.id: u for u in units}
    vfx = _Verifix(db, units)

    # ── turnover: every cell of the month, credited ─────────────────────────
    tv = turnover.month_payload(db, m, None, at)
    tstate = tv.get("state")
    have_tv = tstate not in ("before", "future", "past")
    mult = float((tv.get("rule") or turnover.rule(db)).get("multiplier") or 12)
    cells_of: dict[str, list] = defaultdict(list)
    cell_rows: list[dict] = []
    uncredited: list[dict] = []
    via_verifix = 0
    if have_tv:
        for c in tv.get("cells") or []:
            if c["working"] == 0 and c["left"] == 0:
                continue
            mid = c.get("manager_id")
            if mid and mid in unit_by_id:
                bkey, how = f"m:{mid}", "register"
            else:
                bkey, how = vfx.credit(c["key"])
                if bkey:
                    via_verifix += 1
            x = {"key": c["key"], "code": c.get("code"), "id": c.get("id"), "unit": None,
                 "working": c["working"], "left": c["left"], "how": how, "brigadir": bkey,
                 "registered": True}
            (cells_of[bkey].append(x) if bkey else uncredited.append({**x, "why": how}))
            cell_rows.append(x)
        for u in tv.get("unregistered") or []:
            bkey, how = vfx.credit(u["key"])
            x = {"key": u["key"], "code": u.get("code"), "id": None, "unit": u.get("unit"),
                 "working": u["working"], "left": u["left"], "how": how, "brigadir": bkey,
                 "registered": False}
            if bkey:
                via_verifix += 1
                cells_of[bkey].append(x)
            else:
                uncredited.append({**x, "why": how})
            cell_rows.append(x)
        for c in cell_rows:
            c["rate"] = round1(c["left"] / c["working"] * mult * 100) if c["working"] else None
    cell_owner = {c["key"]: c["brigadir"] for c in cell_rows}
    leavers_of: dict[str, list] = defaultdict(list)
    for p in tv.get("leavers") or []:
        bkey = cell_owner.get(p.get("cell_key"))
        if bkey:
            leavers_of[bkey].append({"name": p["name"], "code": p.get("code"), "job": p.get("job"),
                                     "hired": p.get("hired"), "left": p.get("left"),
                                     "days": p.get("days"), "reason": p.get("reason")})

    # ── OKK: the month's quality register, matched ──────────────────────────
    qrows = _quality_rows(db, m)
    pseudo = [SimpleNamespace(id=f"v:{b['id']}", name=b["name"], shift=None) for b in vfx.brigadirs.values()]
    spellings = {register_brigadir(q.place, q.brigadir) for q in qrows} - {None, ""}
    match = supervisor_match(list(units) + pseudo, spellings)
    okk_counts: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    records_of: dict[str, list] = defaultdict(list)
    spelled_by: dict[str, dict] = defaultdict(lambda: defaultdict(int))
    nobody: dict[str, int] = defaultdict(int)
    no_brigadir = 0
    for q in qrows:
        name = register_brigadir(q.place, q.brigadir)
        if not name:
            no_brigadir += 1
            continue
        hit = match.get(name)
        if not hit:
            nobody[name] += 1
            continue
        hid = hit["id"]
        bkey = hid if isinstance(hid, str) else f"m:{hid}"
        acc = okk_counts[bkey]
        hair = q.category == shift_report.SKIP_CATEGORY
        if hair and r["okk"]["skip_hair"]:
            acc["hair"] += 1
            continue
        spelled_by[bkey][name] += 1
        if q.status == "not_required":
            acc["not_required"] += 1
        elif q.status in shift_report.ACTIONABLE:
            acc["total"] += 1
            if q.status == RESOLVED:
                acc["done"] += 1
            elif q.status == REPEAT:
                acc["repeat"] += 1
            else:
                acc["unresolved"] += 1
        else:
            acc["other"] += 1
        records_of[bkey].append({
            "id": q.id, "date": q.date, "ref": q.ref_no, "status": q.status, "ctype": q.ctype,
            "category": q.category, "product": _cut(q.product, 80), "place": _cut(q.place, 60),
            "description": _cut(q.description, 220), "action": _cut(q.action, 220),
        })

    # ── the rows ────────────────────────────────────────────────────────────
    live_cells = defaultdict(int)
    for c in turnover.cell_map(db, d).values():
        if c.get("manager_id") and not c.get("archived"):
            live_cells[f"m:{c['manager_id']}"] += 1
    keys = set(cells_of) | set(okk_counts) | {k for k in live_cells if int(k[2:]) in unit_by_id}
    # A plant pick narrows every row, a Verifix brigadir's by the plant
    # `plant_of` reads; a shift or a brigadir pick (units here) leaves them out
    # — Verifix gives them neither. What counts for nobody is said only on the
    # unnarrowed view (it belongs to no shift and no brigadir).
    narrowed = scope.get("shift") is not None or bool(scope.get("managers"))
    units_ok = scope.get("units")
    plant_of: dict[str, Optional[int]] = {}

    def in_scope(bkey: str) -> bool:
        if bkey.startswith("v:"):
            if lock is not None or narrowed:
                return False
            if bkey not in plant_of:
                plant_of[bkey] = vfx.plant_of(bkey[2:])
            return scope.get("factory") is None or plant_of[bkey] == scope["factory"]
        uid = int(bkey[2:])
        u = unit_by_id.get(uid)
        if u is None:
            return False
        if lock is not None and uid not in lock:
            return False
        if units_ok is not None and uid not in units_ok:
            return False
        if scope.get("shift") is not None and u.shift != scope["shift"]:
            return False
        return True

    rows = []
    for bkey in keys:
        if not in_scope(bkey):
            continue
        if bkey.startswith("v:"):
            b = vfx.brigadirs.get(bkey[2:]) or {"id": bkey[2:], "name": bkey}
            ident = {"kind": "verifix", "id": None, "vfx_id": b["id"],
                     "name": verifix_org.profile_name(b["name"]), "shift": None,
                     "factory_id": plant_of.get(bkey)}
        else:
            u = unit_by_id[int(bkey[2:])]
            ident = {"kind": "unit", "id": u.id, "vfx_id": u.vfx_employee_id, "name": u.name,
                     "shift": u.shift, "factory_id": u.factory_id}
        tvr = _turnover_of(cells_of.get(bkey, []), mult, r["turnover"]) if have_tv else None
        okr = _okk_of(okk_counts.get(bkey, {}), r["okk"])
        passed = sum(1 for x in (tvr, okr) if x and x["pass"])
        rows.append({
            "key": bkey, **ident,
            "cell_count": live_cells.get(bkey, 0),
            "turnover": tvr, "okk": okr, "mentoring": None, "kru": None,
            "passed": passed, "of": CRITERIA, "pct": round(passed / CRITERIA * 100),
            "payout": None,
        })
    rows.sort(key=lambda x: (-x["passed"], (x["name"] or "").casefold()))
    shown = {x["key"] for x in rows}

    def by_score(key: str) -> dict:
        vals = [x[key] for x in rows if x[key]]
        return {"passed": sum(1 for v in vals if v["pass"]),
                "failed": sum(1 for v in vals if v["pass"] is False),
                "blank": sum(1 for v in vals if v["pass"] is None) + sum(1 for x in rows if x[key] is None)}

    return {
        **base,
        "rows": rows,
        "totals": {"brigadirs": len(rows), "turnover": by_score("turnover"), "okk": by_score("okk"),
                   "by_passed": {str(n): sum(1 for x in rows if x["passed"] == n) for n in range(0, len(LIVE) + 1)}},
        "turnover": {
            "state": tstate, "read": tv.get("read"), "multiplier": mult,
            "as_of": tv.get("as_of"), "source": tv.get("roster_source"),
            "cells": [c for c in cell_rows if c["brigadir"] in shown],
            "leavers": {k: v for k, v in leavers_of.items() if k in shown},
        } if have_tv else {"state": tstate, "read": tv.get("read")},
        "okk": {
            "records": {k: v for k, v in records_of.items() if k in shown},
            "spellings": {k: dict(v) for k, v in spelled_by.items() if k in shown},
        },
        "notes": {
            "uncredited": [] if narrowed or lock is not None else sorted(
                uncredited, key=lambda c: -(c["working"] + c["left"])),
            "via_verifix": via_verifix,
            "nobody": [] if narrowed or lock is not None else sorted(
                ({"name": k, "count": v} for k, v in nobody.items()), key=lambda x: -x["count"]),
            "no_brigadir": 0 if narrowed or lock is not None else no_brigadir,
            "org": {"ok": vfx.ok, "at": local(vfx.at).isoformat(timespec="minutes") if vfx.at else None},
        },
        "options": {
            "shifts": sorted({u.shift for u in units if u.shift in (1, 2)}),
            "brigadirs": [{"id": u.id, "name": u.name, "shift": u.shift, "factory_id": u.factory_id}
                          for u in units if f"m:{u.id}" in keys
                          and (lock is None or u.id in lock)],
        },
    }
