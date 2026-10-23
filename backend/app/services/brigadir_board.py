"""«Brigadirlar reytingi» (/leaderboard) — the figures each brigadir is ranked by.

THE rule for the board's data, from 2026-10-23 (the operator: «make it real
now … put Efficiency percentage instead of Zagruzka percentage»). Until then
the page was a deterministic mock.

**Nothing is measured here.** Every figure is one another page already prints,
read through that page's own code:

* **Samaradorlik** (replaces Zagruzka) — the «Samaradorlik» heatmap on
  /zagruzka: per closed unit-day `effUtil` of `utils/formulas.js`
  (TRUDOYOMKOST ÷ (VERIFIX MINUTES × 0.9 − HISOBOTDAGI XODIMLAR × (ojidaniya +
  early arrival + 10))), off `build_metrics_list` — the very metrics that page
  reads — and a period's figure is that heatmap's AVG column: each day rounded
  to a whole percent first, then the mean, rounded (`HeatmapChart.rowStat`).
  `eff_util` below is the Python twin of `effUtil`; keep the two in step.
* **Plan bajarish** (from 2026-10-23, the operator: «why no plan fulfillment
  as I said») — the «Reja bajarilishi» heatmap on /zagruzka: per closed
  unit-day `fulfilUtil` (TRUDOYOMKOST ÷ ISHLAB CHIQARISH PLANI, i.e.
  prod_actual ÷ prod_plan) off the same metrics, blank without a ФАКТ, a plan
  or a typed headcount (that heatmap marks such a day 👥 and prints nothing),
  and a period's figure is its AVG column, exactly as Samaradorlik's.
  `fulfil_util` below is the Python twin of `fulfilUtil`; keep them in step.
* **Davomat** — /workers' attendance rate: (came + on leave) ÷ on the list,
  summed over the period's days first (`att_rate` of `/api/workers/headcount`,
  whose own function is called). Closed days only: the live day /workers shows
  «so far» is left out, as every other figure here counts closed days.
* **Xavotirlar yopilishi** — of the /concerns register's concerns filed with
  the unit in the period (`entry_date`; leader → brigadir ones, never a
  worker's, which are the leader's), the share resolved (status done). One
  handed ABOVE the brigadir (it sits with a shift- or top-manager now) is out
  of the count — the leaders' concerns KPI rule. Read as the register stands,
  so a recent period reads lower than an old one: its concerns have had less
  time.
* **Sifat shikoyatlari** (from 2026-10-23, the operator: «add also Quality
  Complaints Resolved percentage (without hair)») — the shift dashboard's
  «Bartaraf etilgan %», which is the Quality page's own closure rate: of the
  period's complaints whose status describes WORK (`shift_report.ACTIONABLE`,
  the twin of Quality.jsx's — «не требуется мера» is not a failure to fix and
  never enters it), the share resolved, with the HAIR category left out
  (`SKIP_CATEGORY`, the operator's call of 2026-09-18 — the Quality page itself
  opens «Sochsiz»). Attributed as that page attributes it: «Отв. бригадир»
  resolved against EVERY live unit (`name_map.supervisor_match`; a subset lets
  the fuzzy matcher hand a row to the wrong unit), so a spelling that names no
  unit — technologists, IT, the stores — is nobody's row here either. Bucketed
  by the complaint's own date. Not gated on the day close, as the concerns
  beside it are not: a complaint is filed against a date, not against a shift
  somebody closed. Read as the register stands, so a recent period reads lower
  than an old one — its complaints have had less time to be resolved.
* **Lider nazorati** — computed in the BROWSER from the checklist pool
  (`routers/leaderboard.checklist_pool`), through the very functions the
  /leaders brigadir ranking is scored with (`utils/leaderBoard.js`), so the
  figure here IS that ranking's «Reyting» for the same window.
* **Kaizen** — not measured yet (the operator, 2026-10-23: hide it, share its
  weight out over the others); the Notion task list names Notion people, not
  profiles.

Periods are a WEEK (Mon–Sun), a MONTH or a YEAR (the operator: «pick year,
month, or certain week, not certain date-to-date»). The history is the
`HISTORY[grain]` periods of the same grain ending with the picked one, never
reaching before the first closed day the platform holds.
"""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import DayApproval, Factory, LeaderConcern, Manager
from app.services import shift_report
from app.services.kpi_calculator import VERIFIX_EFFICIENCY

# «Sifat shikoyatlari» reads the shift dashboard's own rule — never a second
# spelling of it. ACTIONABLE is itself the twin of Quality.jsx's, and
# SKIP_CATEGORY is the hair category the operator took out on 2026-09-18, which
# the Quality page also opens without; a board counting them would state a
# closure rate neither page shows.
QUALITY_ACTIONABLE = shift_report.ACTIONABLE
QUALITY_RESOLVED = shift_report.RESOLVED
SKIP_CATEGORY = shift_report.SKIP_CATEGORY

GRAINS = ("week", "month", "year")
HISTORY = {"week": 8, "month": 8, "year": 4}

# `utils/formulas.js` — PRODUCTIVE_SHARE, KAIZEN_BUFFER. The 0.85 is only the
# factor the payload's `verifix_labor` was stored with, divided back out.
PRODUCTIVE_SHARE = 0.9
KAIZEN_BUFFER = 10

# Concern levels above the brigadir: a concern sitting there is not theirs to
# close any more (routers/concerns.LEVELS).
ABOVE_BRIGADIR = ("shift-manager", "top-manager")


# ── periods ─────────────────────────────────────────────────────────────────
def period_of(grain: str, day: date) -> tuple[date, date]:
    """The whole period of `grain` that holds `day`."""
    if grain == "week":
        start = day - timedelta(days=day.weekday())
        return start, start + timedelta(days=6)
    if grain == "month":
        start = day.replace(day=1)
        nxt = (start.replace(day=28) + timedelta(days=4)).replace(day=1)
        return start, nxt - timedelta(days=1)
    return date(day.year, 1, 1), date(day.year, 12, 31)


def _before(grain: str, start: date) -> date:
    """A day of the period right before the one starting on `start`."""
    return start - timedelta(days=1)


def periods(grain: str, anchor: date, today: date, floor: Optional[date]) -> list[dict]:
    """Oldest → newest, the last being the period that holds `anchor`.

    A period after today is never served (the anchor is clamped to today), the
    period still running ends at today and says so (`partial`), and a period
    that ends before the platform's first closed day is dropped — it could
    only ever read «—»."""
    if anchor > today:
        anchor = today
    out: list[dict] = []
    start, end = period_of(grain, anchor)
    for _ in range(HISTORY[grain]):
        if floor and end < floor and out:
            break
        out.append({
            "from": start, "to": min(end, today), "end": end,
            "partial": end > today,
        })
        start, end = period_of(grain, _before(grain, start))
    out.reverse()
    return out


def data_floor(db: Session) -> Optional[date]:
    """The first day any unit closed — nothing before it can carry a figure."""
    return db.query(func.min(DayApproval.date)).scalar()


# ── units ───────────────────────────────────────────────────────────────────
def board_units(db: Session, scoped: Optional[list[int]], shift: Optional[int]) -> list[Manager]:
    """The units on the board: non-archived supervisor units that take part in
    the загрузка (`managers.zagruzka_on` — the production units; a unit
    switched off is in no figure the загрузка pages print, so it is on no
    ranking built from them), in the viewer's scope."""
    q = db.query(Manager).filter(Manager.archived.is_(False), Manager.zagruzka_on.is_(True))
    if shift:
        q = q.filter(Manager.shift == shift)
    if scoped is not None:
        if not scoped:
            return []
        q = q.filter(Manager.id.in_(scoped))
    return q.order_by(Manager.name).all()


def factory_names(db: Session) -> dict[int, dict]:
    """id → the names in `factoryName`'s shape (FactoryContext.jsx)."""
    return {f.id: {"code": f.code, "name_ru": f.name_ru, "name_uz": f.name_uz,
                   "name_uz_cyrl": f.name_uz_cyrl, "name_en": f.name_en}
            for f in db.query(Factory).all()}


# ── Samaradorlik ────────────────────────────────────────────────────────────
def eff_util(m) -> Optional[float]:
    """THE Python twin of `effUtil` (utils/formulas.js). None = a blank cell:
    no ФАКТ, no attendance minutes, no typed headcount, or a capacity the
    deductions ate."""
    a = float(m.prod_actual or 0)
    if not a > 0:
        return None
    vl = float(m.verifix_labor or 0)
    hc = float(m.official_hc or 0)
    if not vl > 0 or not hc > 0:
        return None
    raw = vl / VERIFIX_EFFICIENCY
    idle = float(m.equip_downtime or 0)
    early = float(m.avg_early_arrival or 0)
    cap = raw * PRODUCTIVE_SHARE - hc * (idle + early + KAIZEN_BUFFER)
    return a / cap if cap > 0 else None


def _iso_of(ddmmyyyy: str) -> Optional[date]:
    try:
        d, m, y = ddmmyyyy.split(".")
        return date(int(y), int(m), int(d))
    except (ValueError, AttributeError):
        return None


def _bucket(pers: list[dict], day: date) -> Optional[int]:
    for i, p in enumerate(pers):
        if p["from"] <= day <= p["to"]:
            return i
    return None


def fulfil_util(m) -> Optional[float]:
    """THE Python twin of `fulfilUtil` (utils/formulas.js), as the «Reja
    bajarilishi» heatmap prints it: None without a ФАКТ or a plan, and None
    on a day with no typed headcount — /api/heatmap swaps such a day for its
    👥 marker, so the heatmap shows (and averages) nothing there."""
    a = float(m.prod_actual or 0)
    p = float(m.prod_plan or 0)
    if not a > 0 or not p > 0 or not float(m.official_hc or 0) > 0:
        return None
    return a / p


def _round(x: float) -> int:
    """`Math.round` — half UP, as the heatmap rounds (Python's `round` sends
    a half to the even neighbour: 97.5 → 98 but 96.5 → 96)."""
    return math.floor(x + 0.5)


def _heatmap_avg(metrics: Iterable, unit_ids: set[int], pers: list[dict], read) -> dict[int, dict]:
    """unit → {"v": [period figure | None], "days": [days counted]} — a
    /zagruzka heatmap's AVG column over each period's closed days: each day
    rounded to a whole percent first, then the mean, rounded
    (`HeatmapChart.rowStat`). `read` is the heatmap's own cell reader."""
    acc: dict[int, list[list[int]]] = {}
    for m in metrics:
        if m.manager_id not in unit_ids:
            continue
        d = _iso_of(m.date)
        i = _bucket(pers, d) if d else None
        if i is None:
            continue
        v = read(m)
        if v is None:
            continue
        acc.setdefault(m.manager_id, [[] for _ in pers])[i].append(_round(v * 100))
    out = {}
    for mid, per in acc.items():
        out[mid] = {
            "v": [_round(sum(x) / len(x)) if x else None for x in per],
            "days": [len(x) for x in per],
        }
    return out


def efficiency(metrics: Iterable, unit_ids: set[int], pers: list[dict]) -> dict[int, dict]:
    """Samaradorlik per period — the «Samaradorlik» heatmap's AVG."""
    return _heatmap_avg(metrics, unit_ids, pers, eff_util)


def fulfillment(metrics: Iterable, unit_ids: set[int], pers: list[dict]) -> dict[int, dict]:
    """Plan bajarish per period — the «Reja bajarilishi» heatmap's AVG."""
    return _heatmap_avg(metrics, unit_ids, pers, fulfil_util)


# ── Davomat ─────────────────────────────────────────────────────────────────
def attendance(headcount: list[dict], unit_ids: set[int], pers: list[dict]) -> dict[int, dict]:
    """unit → {"v": [(came + on leave) ÷ list, %], "days": [...]} from the rows
    `/api/workers/headcount` returns, its own `att_rate` arithmetic per period."""
    out: dict[int, dict] = {}
    for m in headcount or []:
        mid = m.get("manager_id")
        if mid not in unit_ids:
            continue
        sums = [[0, 0, 0] for _ in pers]          # roster, came, on leave
        days = [0 for _ in pers]
        for cell in m.get("daily") or []:
            if cell.get("live"):
                continue
            d = _iso_of(cell.get("date"))
            i = _bucket(pers, d) if d else None
            if i is None:
                continue
            sums[i][0] += cell.get("roster") or 0
            sums[i][1] += cell.get("came") or 0
            sums[i][2] += cell.get("on_leave") or 0
            days[i] += 1
        out[mid] = {
            "v": [round((c + lv) / r * 100) if r else None for r, c, lv in sums],
            "days": days,
        }
    return out


# ── Xavotirlar yopilishi ────────────────────────────────────────────────────
def concerns(db: Session, unit_ids: set[int], pers: list[dict]) -> dict[int, dict]:
    """unit → {"v": [resolved %], "n": [counted], "done": [resolved], "up": [handed above]}."""
    if not unit_ids or not pers:
        return {}
    rows = (
        db.query(LeaderConcern.brigadir_manager_id, LeaderConcern.entry_date,
                 LeaderConcern.level, LeaderConcern.status)
        .filter(LeaderConcern.brigadir_manager_id.in_(list(unit_ids)))
        .filter(LeaderConcern.worker_name.is_(None))
        .filter(LeaderConcern.entry_date >= pers[0]["from"],
                LeaderConcern.entry_date <= pers[-1]["to"])
        .all()
    )
    acc: dict[int, list[list[int]]] = {}
    for mid, d, level, status in rows:
        i = _bucket(pers, d)
        if i is None:
            continue
        slot = acc.setdefault(mid, [[0, 0, 0] for _ in pers])[i]   # counted, done, above
        if level in ABOVE_BRIGADIR:
            slot[2] += 1
            continue
        slot[0] += 1
        if status == "done":
            slot[1] += 1
    out = {}
    for mid, per in acc.items():
        out[mid] = {
            "v": [round(dn / n * 100) if n else None for n, dn, _ in per],
            "n": [n for n, _, _ in per],
            "done": [dn for _, dn, _ in per],
            "up": [up for _, _, up in per],
        }
    return out


# ── Sifat shikoyatlari ──────────────────────────────────────────────────────
def _iso_date(raw) -> Optional[date]:
    """A `QualityComplaint.date` — an ISO "YYYY-MM-DD" STRING — as a date.

    Sliced to ten characters so a row that ever carries a time survives, and
    None for a row with no readable date: one no period can place, which the
    shift dashboard's own window drops the same way."""
    try:
        return date.fromisoformat(str(raw)[:10])
    except (TypeError, ValueError):
        return None


def quality(rows: Iterable[tuple], unit_ids: set[int], pers: list[dict],
            match: dict) -> dict[int, dict]:
    """unit → {"v": [resolved %], "n": [actionable], "done": [resolved]}.

    `rows` is (register brigadir spelling, status, date, count) — the router's
    query, already cut to the history window and already WITHOUT the hair
    category (this module never queries); `match` is `supervisor_match` over
    every live unit. A period a unit filed nothing in — or nothing but records
    whose status describes no work — gets None, never 0%: «nothing filed» and
    «nothing resolved» are different facts, and the board prints the first as
    «—». `n` and `done` ride along because «0% of one» and «0% of forty» are
    different facts too, and the row's breakdown says which."""
    if not unit_ids or not pers:
        return {}
    acc: dict[int, list[list[int]]] = {}
    for name, status, raw, n in rows:
        if status not in QUALITY_ACTIONABLE:
            continue
        unit = match.get(name)
        if not unit or unit["id"] not in unit_ids:
            continue
        d = _iso_date(raw)
        i = _bucket(pers, d) if d else None
        if i is None:
            continue
        slot = acc.setdefault(unit["id"], [[0, 0] for _ in pers])[i]   # actionable, done
        slot[0] += int(n)
        if status == QUALITY_RESOLVED:
            slot[1] += int(n)
    return {
        mid: {
            "v": [_round(dn / n * 100) if n else None for n, dn in per],
            "n": [n for n, _ in per],
            "done": [dn for _, dn in per],
        }
        for mid, per in acc.items()
    }
