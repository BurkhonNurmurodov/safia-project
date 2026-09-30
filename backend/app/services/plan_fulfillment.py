"""«Reja bajarilishi» — how much of the plan was made, and where it was not
(/plan, redesigned 2026-09-30 on the operator's directive: management must see
WHICH products, WHICH cells and WHICH brigadirs fall short, how often, and how
it moves over time).

THE computation behind `GET /api/plan-fulfillment/analysis`. It measures
nothing of its own:

* **The minutes are the «Zagruzka fayli» page's own, line by line** —
  `zagruzka_source.line_facts`, which is `pp_calc.line_minutes`' loop with a
  callback. So a unit-day here is the Positions table's «Bajarish %»
  (Σ Fakt trud. ÷ Σ Umumiy trud.), the shift report's «Plan bajarish %» and the
  загрузка's Трудоёмкость to the float, and the products of a unit-day add up
  to exactly that unit-day. Fulfilment is always MINUTES-weighted: a product is
  its own Fakt ÷ Reja (its quantity ratio), and everything above a product is
  Σ Fakt minutes ÷ Σ Reja minutes — a big line weighs what it weighs on the
  Production page.
* **A CELL's part of a work centre is `wc_group.share`'s rule**: the lines of
  its own group letter whole, an unclaimed line (no letter, or a letter no cell
  carries) evenly between every cell standing at that work centre. The split
  `zagruzka_source.cell_labor`, `/zagruzka-cell`, «Xarajat» and the ojidaniya
  weight already make — so Σ over the cells of a work centre is the work
  centre, and a cell here reads what it reads everywhere else.

**The data starts at `zagruzka_source.ZAGRUZKA_FROM`** (2 Sep 2026). Before it
the platform's plan and fact were ONE number per brigadir per day from the
«Минут» sheet, which knows no product and no cell. A range reaching further back
is clamped and the payload says so (`clamped`), rather than mixing two sources
under one set of charts.

**A unit-day counts only once BOTH halves are in** — plan minutes AND fact
minutes. The SAP file often lands the plan first and the «Поставлено» later, so
a day with a plan and no fact is «fakt kiritilmagan» (`nf`), never «0%, behind»
— the rule `/live` and «Smena hisoboti» (`no_fact`) already follow. A day with
fact and no plan is `np`. Neither enters a percentage; both are counted and
shown. The test is taken on the WHOLE unit, before any cell or product
narrowing: a cell that made nothing on a day its unit did report is a real 0.

**Shortfall is taken line-day by line-day** (Σ max(0, Reja − Fakt)): one
product made twice over does not repay another that was not made at all, which
is the question «which products are not fulfilled» asks. The net figure is
Reja − Fakt; `short` and `over` are its two halves and are both served.

Filters: the ROUTER resolves the unit scope (plant lock, shift, brigadir) and
turns a leader / cell pick into a set of cells; this module narrows the lines
to those cells by the share rule above and to the picked SKUs. The option lists
it serves are computed one level up from the pick they feed — the cells and
leaders over the unit scope, the products over the cell scope — so a pick never
shortens the list it was made from.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import Cell, RoleProfile
from app.services import wc_group, zagruzka_source
from app.services.pp_calc import is_local_key

# THE floor, and not a second one: the day the production page became the
# source of plan and fact (zagruzka_source is its one definition).
FLOOR = zagruzka_source.ZAGRUZKA_FROM

# The widest period one request may ask for. A product row carries one entry per
# day, so the payload grows with the period; four months of the fleet is still a
# few hundred KB before the edge compresses it.
MAX_DAYS = 124


def _name_key(name) -> str:
    return " ".join(str(name or "").split()).lower()


def _r1(v: float):
    """One decimal, and a whole number printed as one (the payload carries a
    few thousand of these, and «2933.0» says nothing «2933» does not)."""
    r = round(float(v or 0.0), 1)
    return int(r) if r == int(r) else r


class _Acc:
    """Plan / fact minutes and the two halves of their difference."""
    __slots__ = ("plan", "actual", "short", "over")

    def __init__(self):
        self.plan = self.actual = self.short = self.over = 0.0

    def add(self, p: float, a: float) -> None:
        self.plan += p
        self.actual += a
        if p > a:
            self.short += p - a
        else:
            self.over += a - p

    def out(self) -> dict:
        return {"plan": _r1(self.plan), "actual": _r1(self.actual),
                "short": _r1(self.short), "over": _r1(self.over)}


class _Series:
    """An entity's figures over the period plus its per-day plan / fact — the
    heatmap row and the day strip. `nf` / `np` mark the days its unit had only
    one of the two halves."""
    __slots__ = ("tot", "day", "nf", "np")

    def __init__(self):
        self.tot = _Acc()
        self.day: dict[int, list] = {}
        self.nf: set[int] = set()
        self.np: set[int] = set()

    def add(self, i: int, p: float, a: float) -> None:
        self.tot.add(p, a)
        d = self.day.get(i)
        if d is None:
            d = self.day[i] = [0.0, 0.0]
        d[0] += p
        d[1] += a

    def daily(self, n: int) -> list:
        """One entry per day: [plan, fact] minutes on a counted day, "nf" / "np"
        on a day its unit reported one half only, None on a day with nothing.
        A counted day on which this entity had fact but no plan of its own (a
        product narrowing, an unplanned line) reads "np" too."""
        out: list = []
        for i in range(n):
            d = self.day.get(i)
            if d is not None and d[0] > 0:
                out.append([round(d[0]), round(d[1])])
            elif d is not None and d[1] > 0:
                out.append("np")
            elif i in self.nf:
                out.append("nf")
            elif i in self.np:
                out.append("np")
            else:
                out.append(None)
        return out


def window(date_from: date, date_to: date) -> dict:
    """The period actually answered: clamped to the floor and to MAX_DAYS, and
    the equally long period just before it for the comparison (itself clamped
    to the floor — `prev_partial` when that cut it short, None when nothing of
    it is left)."""
    lo, hi = date_from, date_to
    if lo > hi:
        lo, hi = hi, lo
    capped = False
    if (hi - lo).days + 1 > MAX_DAYS:
        lo = hi - timedelta(days=MAX_DAYS - 1)
        capped = True
    clamped = lo < FLOOR
    lo = max(lo, FLOOR)
    if hi < FLOOR:
        return {"lo": None, "hi": None, "clamped": True, "capped": capped,
                "prev_lo": None, "prev_hi": None, "prev_partial": False}
    n = (hi - lo).days + 1
    prev_hi = lo - timedelta(days=1)
    prev_lo = prev_hi - timedelta(days=n - 1)
    if prev_hi < FLOOR:
        p_lo = p_hi = None
        partial = False
    else:
        partial = prev_lo < FLOOR
        p_lo, p_hi = max(prev_lo, FLOOR), prev_hi
    return {"lo": lo, "hi": hi, "clamped": clamped, "capped": capped,
            "prev_lo": p_lo, "prev_hi": p_hi, "prev_partial": partial}


def registry(db: Session, manager_ids: Iterable[int]) -> tuple[list, dict]:
    """Every cell of the units in scope (the option lists and the share rule
    both need ALL of them — a split is over every cell at a work centre) and
    {leader profile id: name}."""
    ids = sorted({int(m) for m in manager_ids})
    if not ids:
        return [], {}
    cells = (db.query(Cell).filter(Cell.manager_id.in_(ids))
             .order_by(Cell.verifix_code, Cell.id).all())
    lids = sorted({c.leader_id for c in cells if c.leader_id})
    names = ({r.id: r.name for r in db.query(RoleProfile.id, RoleProfile.name)
              .filter(RoleProfile.id.in_(lids)).all()} if lids else {})
    return cells, names


def build(db: Session, managers: list, date_from: date, date_to: date, *,
          cells: list, leader_names: dict,
          cell_ids: Optional[set] = None,
          skus: Optional[set] = None) -> dict:
    """The whole payload for one scope.

    `managers` — the units whose lines are read (already narrowed by the
    router: plant lock, shift, brigadir, and — under a cell pick — the units
    the picked cells stand in). `cells` / `leader_names` — `registry()` over
    the unit scope BEFORE any cell pick. `cell_ids` — the picked cells (a
    leader pick arrives here as that leader's cells), None = no narrowing.
    `skus` — the picked products (`pp_daily.sap_code`, i.e. `daily_key`),
    None = every product."""
    win = window(date_from, date_to)
    base = {
        "floor": FLOOR.isoformat(),
        "date_from": win["lo"].isoformat() if win["lo"] else None,
        "date_to": win["hi"].isoformat() if win["hi"] else None,
        "clamped": win["clamped"],
        "capped": win["capped"],
        "max_days": MAX_DAYS,
        "cells": [_cell_out(c, leader_names) for c in cells],
    }
    unit_meta = [{"manager_id": m.id, "name": m.name, "shift": m.shift,
                  "factory_id": m.factory_id} for m in managers]
    if win["lo"] is None or not managers:
        return {**base, "days": [], "totals": _totals_out(_Acc(), 0, 0, 0),
                "prev": None, "trend": [],
                "units": [{**u, **_Acc().out(), "daily": [], "no_data": True,
                           "prev_plan": None, "prev_actual": None}
                          for u in unit_meta],
                "cell_rows": [], "products": [], "product_options": []}

    lo, hi = win["lo"], win["hi"]
    p_lo, p_hi = win["prev_lo"], win["prev_hi"]
    n = (hi - lo).days + 1
    days = [lo + timedelta(days=i) for i in range(n)]
    read_lo = p_lo or lo
    mids = [m.id for m in managers]

    # ── the lines, and each (unit, day)'s WHOLE total — the gate ──────────
    unit_day: dict[tuple, list] = {}
    recs: list = []

    def emit(mid, line, wc, key, _lk, d, qp, qa, pv, av):
        if not (qp or qa):
            return
        u = unit_day.get((mid, d))
        if u is None:
            u = unit_day[(mid, d)] = [0.0, 0.0]
        u[0] += pv
        u[1] += av
        recs.append((mid, d, line, wc, key, qp, qa, pv, av))

    zagruzka_source.line_facts(db, mids, read_lo, hi, emit)

    def state(mid, d) -> Optional[str]:
        p, a = unit_day.get((mid, d), (0.0, 0.0))
        if p > 0 and a > 0:
            return "ok"
        if p > 0:
            return "nf"
        if a > 0:
            return "np"
        return None

    # ── who makes a line: THE share rule (wc_group.share), cached per
    #    (unit, work centre, letter) ──────────────────────────────────────
    by_wc = wc_group.cells_by_wc(cells)
    share_cache: dict[tuple, list] = {}
    norm_cache: dict = {}

    def norm(mid, wc) -> str:
        k = norm_cache.get(wc)
        if k is None:
            k = norm_cache[wc] = wc_group.wc_key(mid, wc)[1]
        return k

    def owners(mid, wc, grp) -> list:
        k = (mid, wc, grp)
        got = share_cache.get(k)
        if got is None:
            cs = by_wc.get(wc_group.wc_key(mid, wc)) or []
            mine = [c for c in cs if grp and (c.wc_group or None) == grp]
            if mine:
                got = [(c, 1.0 / len(mine)) for c in mine]
            elif cs:
                got = [(c, 1.0 / len(cs)) for c in cs]
            else:
                got = []
            share_cache[k] = got
        return got

    # ── accumulate ────────────────────────────────────────────────────────
    total = _Acc()
    prev_total = _Acc()
    prev_units: dict[int, _Acc] = defaultdict(_Acc)
    trend = [_Acc() for _ in range(n)]
    t_units: list[set] = [set() for _ in range(n)]
    t_nf: list[set] = [set() for _ in range(n)]
    t_np: list[set] = [set() for _ in range(n)]
    units: dict[int, _Series] = defaultdict(_Series)
    cell_s: dict[str, _Series] = defaultdict(_Series)
    cell_prod: dict[str, dict] = defaultdict(lambda: defaultdict(float))
    prods: dict[tuple, dict] = {}
    sku_opt: dict[str, dict] = {}

    for (mid, d, line, wc, key, qp, qa, pv, av) in recs:
        st = state(mid, d)
        cur = lo <= d <= hi
        if not cur and not (p_lo is not None and p_lo <= d <= p_hi):
            continue
        grp = ((getattr(line, "wc_group", None) or None) if line is not None else None)
        parts = owners(mid, wc, grp)
        if cell_ids is not None:
            parts = [(c, w) for c, w in parts if c.id in cell_ids]
            w = sum(cw for _c, cw in parts)
            if w <= 0:
                continue
        else:
            w = 1.0
        name = (getattr(line, "name", None) or "") if line is not None else ""

        # the product list is built over the cell scope, BEFORE the product
        # pick, so picking one never shortens the list it was picked from
        if cur and st == "ok" and pv > 0:
            o = sku_opt.get(key)
            if o is None:
                o = sku_opt[key] = {"sku": key, "plan": 0.0, "names": defaultdict(float)}
            o["plan"] += w * pv
            o["names"][name] += w * pv
        if skus is not None and key not in skus:
            continue

        wp, wa = w * pv, w * av
        if not cur:
            if st == "ok":
                prev_total.add(wp, wa)
                prev_units[mid].add(wp, wa)
            continue

        i = (d - lo).days
        pk = (mid, norm(mid, wc), key, _name_key(name))
        pr = prods.get(pk)
        if pr is None:
            pr = prods[pk] = {
                "manager_id": mid, "name": name, "sku": key, "wc": wc or "",
                "group": grp, "cells": [c.id for c, _w in parts], "share": w,
                "n_cells": len(owners(mid, wc, grp)),
                "s": _Series(), "pq": 0.0, "aq": 0.0, "sq": 0.0, "dq": {},
            }
        pr["name"] = name or pr["name"]
        pr["group"] = grp
        pr["share"] = max(pr["share"], w)

        if st == "ok":
            total.add(wp, wa)
            trend[i].add(wp, wa)
            if wp > 0:
                t_units[i].add(mid)
            units[mid].add(i, wp, wa)
            pr["s"].add(i, wp, wa)
            pr["pq"] += w * qp
            pr["aq"] += w * qa
            if qp > qa:
                pr["sq"] += w * (qp - qa)
            dq = pr["dq"].get(i)
            if dq is None:
                dq = pr["dq"][i] = [0.0, 0.0]
            dq[0] += w * qp
            dq[1] += w * qa
            if parts:
                for c, cw in parts:
                    cell_s[str(c.id)].add(i, cw * pv, cw * av)
                    if pv > av:
                        cell_prod[str(c.id)][pk] += cw * (pv - av)
            elif cell_ids is None:
                nk = f"none:{mid}"
                cell_s[nk].add(i, pv, av)
                if pv > av:
                    cell_prod[nk][pk] += pv - av
        elif st == "nf" and wp > 0:
            t_nf[i].add(mid)
            units[mid].nf.add(i)
            pr["s"].nf.add(i)
            for c, _cw in parts:
                cell_s[str(c.id)].nf.add(i)
            if not parts and cell_ids is None:
                cell_s[f"none:{mid}"].nf.add(i)
        elif st == "np" and wa > 0:
            t_np[i].add(mid)
            units[mid].np.add(i)
            for c, _cw in parts:
                cell_s[str(c.id)].np.add(i)
            if not parts and cell_ids is None:
                cell_s[f"none:{mid}"].np.add(i)

    # ── out ───────────────────────────────────────────────────────────────
    # A product row's `id` is its place in the served order — short, and all
    # a `worst` reference needs; `pid` maps the internal key onto it.
    prod_rows = []
    worst_of_unit: dict[int, tuple] = {}
    for pk, pr in prods.items():
        s = pr["s"]
        # a line that only ever sat on days its unit had not reported the fact
        # for has no figure yet — it arrives with the fact
        if s.tot.plan <= 0 and s.tot.actual <= 0:
            continue
        daily = []
        for j in range(n):
            dq = pr["dq"].get(j)
            dm = s.day.get(j)
            if dm is not None and dm[0] > 0:
                daily.append(int(round(100.0 * dm[1] / dm[0])))
            elif j in s.nf:
                daily.append("nf")
            elif dq is not None and dq[1] > 0:
                daily.append("np")
            else:
                daily.append(None)
        sku = pr["sku"]
        row = {
            "_pk": pk,
            "manager_id": pr["manager_id"], "name": pr["name"],
            "code": None if is_local_key(sku) else sku,
            "wc": pr["wc"], "cells": pr["cells"],
            "plan_qty": _r1(pr["pq"]), "actual_qty": _r1(pr["aq"]),
            "short_qty": _r1(pr["sq"]),
            "plan": _r1(s.tot.plan), "actual": _r1(s.tot.actual), "short": _r1(s.tot.short),
            "daily": daily,
        }
        # present only where they say something (absent = no group / one
        # owning cell / the whole line)
        if pr["group"]:
            row["group"] = pr["group"]
        if pr["n_cells"] > 1:
            row["n_cells"] = pr["n_cells"]
        if pr["share"] < 0.9999:
            row["share"] = round(pr["share"], 4)
        prod_rows.append(row)
        best = worst_of_unit.get(pr["manager_id"])
        if s.tot.short > 0 and (best is None or s.tot.short > best[0]):
            worst_of_unit[pr["manager_id"]] = (s.tot.short, pk)
    prod_rows.sort(key=lambda r: (-r["short"], -r["plan"], r["name"]))
    pid: dict[tuple, int] = {}
    for i, row in enumerate(prod_rows, start=1):   # never 0: an id is truthy
        pid[row.pop("_pk")] = i
        row["id"] = i

    unit_rows = []
    for u in unit_meta:
        s = units.get(u["manager_id"])
        pa = prev_units.get(u["manager_id"])
        worst = worst_of_unit.get(u["manager_id"])
        unit_rows.append({
            **u,
            **(s.tot.out() if s else _Acc().out()),
            "daily": s.daily(n) if s else [None] * n,
            "no_data": s is None,
            "prev_plan": _r1(pa.plan) if pa else None,
            "prev_actual": _r1(pa.actual) if pa else None,
            "worst": pid.get(worst[1]) if worst else None,
        })

    cell_rows = []
    for ck, s in cell_s.items():
        worst = max(cell_prod.get(ck, {}).items(), key=lambda kv: kv[1], default=None)
        none = ck.startswith("none:")
        cell_rows.append({
            "key": ck,
            "cell_id": None if none else int(ck),
            "manager_id": int(ck.split(":", 1)[1]) if none else None,
            **s.tot.out(),
            "daily": s.daily(n),
            "worst": pid.get(worst[0]) if worst and worst[1] > 0 else None,
        })
    cell_rows.sort(key=lambda r: (-r["short"], -r["plan"]))

    options = []
    for o in sku_opt.values():
        name = max(o["names"].items(), key=lambda kv: kv[1])[0] if o["names"] else ""
        options.append({"sku": o["sku"], "name": name, "plan": round(o["plan"])})
    options.sort(key=lambda o: (-o["plan"], o["name"]))

    trend_rows = [{
        "date": days[i].isoformat(),
        **trend[i].out(),
        "units": len(t_units[i]),
        "no_fact": len(t_nf[i] - t_units[i]),
        "no_plan": len(t_np[i] - t_units[i]),
    } for i in range(n)]

    counted_days = sum(1 for i in range(n) if t_units[i])
    nf_ud = sum(len(t_nf[i]) for i in range(n))
    np_ud = sum(len(t_np[i]) for i in range(n))
    prev = None
    if p_lo is not None:
        prev = {"date_from": p_lo.isoformat(), "date_to": p_hi.isoformat(),
                "partial": win["prev_partial"], **prev_total.out()}

    return {
        **base,
        "days": [d.isoformat() for d in days],
        "totals": {**_totals_out(total, counted_days, nf_ud, np_ud),
                   "unit_days": sum(len(s) for s in t_units)},
        "prev": prev,
        "trend": trend_rows,
        "units": unit_rows,
        "cell_rows": cell_rows,
        "products": prod_rows,
        "product_options": options,
    }


def _totals_out(acc: _Acc, days: int, nf: int, np_: int) -> dict:
    return {**acc.out(), "days": days, "no_fact": nf, "no_plan": np_}


def _cell_out(c, leader_names: dict) -> dict:
    return {"id": c.id, "code": c.verifix_code, "sap": c.sap_code,
            "group": c.wc_group or None, "manager_id": c.manager_id,
            "leader_id": c.leader_id,
            "leader": leader_names.get(c.leader_id) if c.leader_id else None}
