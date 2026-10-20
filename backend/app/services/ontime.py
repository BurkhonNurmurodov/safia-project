"""«O'z vaqtida yetkazish» (/ontime) — the on-time delivery report, computed
from what `services/ontime_sync.py` read out of the logistics team's sheet.

THE SHEET'S ARITHMETIC, exactly (the operator's call, 2026-10-20 — every figure
on the page equals the sheet's for the same day). Per order day d, per
material, per wave its group has a window for in «заход» («свод» rows):

    D_w   ordered quantity («потребность»)
    P_1   received on d inside wave 1's window [start, end]
    P_2   received on d inside wave 2's window
    P_3   received on d+1 from 00:00:01 to wave 3's end (wave 3 runs after
          midnight; the sheet reads no start for it)

    H_1 = P_1
    H_2 = max(P_2 if wave 1 was fully covered else P_2 − (D_1 − H_1), 0)
    H_3 = P_3
    on time_1 = min(1, H_1 / D_1)
    on time_2 = min(1, (H_2 + max(H_1 − D_1, 0)) / D_2)
    on time_3 = min(1, (H_3 + max(H_1 + H_2 − D_1 − D_2, 0)) / D_3)

A wave nobody ordered has no figure («Нет заявки»). Two consequences of copying
the sheet, both deliberate and said on the page: windows that overlap (meat and
«Мини Кухня NEW» carry 10:00–22:00 for waves 1 AND 2) count that production for
both waves; and wave 3 reads only what was posted after midnight.

Aggregation, as the sheet aggregates:
- the DAY (and any period / wave / selection) — on-time quantity ÷ ordered
  quantity, i.e. Σ on time_w × D_w ÷ Σ D_w («средний on time», свод row 3);
- a GROUP × wave — the plain mean of its products' on-time («on time по
  заходам» on «свод по группам»); a GROUP on a day — the mean of its waves
  («средний on time»); a group over a period — the mean of its days.

Nothing is stored here: every figure is derived per request from the stored
read, and kept in memory per read until the next read lands (`forget`).
"""
from __future__ import annotations

import bisect
import threading
from collections import OrderedDict, defaultdict
from datetime import date, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import OntimeDemand, OntimeMaterial, OntimeReceipt, OntimeWindow
from app.services import ontime_sync

WAVE3_FROM = 1               # 00:00:01 — the sheet's own lower bound for wave 3
MAX_DAYS = 400
_CACHE_MAX = 24

_cache: "OrderedDict[tuple, dict]" = OrderedDict()
_cache_lock = threading.Lock()


def forget() -> None:
    with _cache_lock:
        _cache.clear()


def _fold(s: Optional[str]) -> str:
    return (s or "").strip().casefold()


# ── the stored read ──────────────────────────────────────────────────────────

def load_windows(db: Session) -> dict:
    """{group fold: {"name": str, "waves": {w: (start_s, end_s)}, "pos": int}}"""
    out: dict = {}
    for w in db.query(OntimeWindow).order_by(OntimeWindow.pos, OntimeWindow.id).all():
        g = out.setdefault(_fold(w.grp), {"name": w.grp, "waves": {}, "pos": w.pos or 0})
        g["waves"][w.wave] = (w.start_s, w.end_s)
    return out


def overlapping(windows: dict) -> list[str]:
    """Groups whose wave 1 and wave 2 windows share time — the sheet counts that
    production for both waves."""
    out = []
    for g in windows.values():
        a, b = g["waves"].get(1), g["waves"].get(2)
        if a and b and a[0] <= b[1] and b[0] <= a[1]:
            out.append(g["name"])
    return out


class _Posts:
    """One material's receipts on one day, as a sorted timeline with prefix
    sums, so a window's quantity is two bisects."""
    __slots__ = ("secs", "cum")

    def __init__(self, pairs: list[tuple[int, float]]):
        pairs.sort()
        self.secs = [p[0] for p in pairs]
        self.cum = [0.0]
        for _, q in pairs:
            self.cum.append(self.cum[-1] + q)

    def between(self, lo: int, hi: int) -> float:
        """Σ quantity with lo ≤ sec ≤ hi (both ends included, as SUMIFS)."""
        if hi < lo:
            return 0.0
        i = bisect.bisect_left(self.secs, lo)
        j = bisect.bisect_right(self.secs, hi)
        return self.cum[j] - self.cum[i]


def _posts(db: Session, d0: date, d1: date, materials: Optional[set] = None) -> dict:
    q = db.query(OntimeReceipt.day, OntimeReceipt.material, OntimeReceipt.sec, OntimeReceipt.qty) \
        .filter(OntimeReceipt.day >= d0, OntimeReceipt.day <= d1)
    if materials:
        q = q.filter(OntimeReceipt.material.in_(list(materials)))
    raw: dict = defaultdict(list)
    for day, mat, sec, qty in q:
        raw[(day, mat)].append((sec, qty or 0.0))
    return {k: _Posts(v) for k, v in raw.items()}


def _demand(db: Session, d0: date, d1: date, materials: Optional[set] = None) -> dict:
    """{(day, material): {"grp": str, "waves": {w: qty}}}"""
    q = db.query(OntimeDemand.day, OntimeDemand.material, OntimeDemand.wave,
                 OntimeDemand.qty, OntimeDemand.grp) \
        .filter(OntimeDemand.day >= d0, OntimeDemand.day <= d1)
    if materials:
        q = q.filter(OntimeDemand.material.in_(list(materials)))
    out: dict = {}
    for day, mat, wave, qty, grp in q:
        e = out.setdefault((day, mat), {"grp": grp or "", "waves": {}})
        e["waves"][wave] = e["waves"].get(wave, 0.0) + (qty or 0.0)
        if not e["grp"] and grp:
            e["grp"] = grp
    return out


def data_days(db: Session) -> list[str]:
    """Every order day the stored read holds — the days the page can show."""
    return [d.isoformat() for (d,) in db.query(OntimeDemand.day).distinct().order_by(OntimeDemand.day)]


def product_options(db: Session, d0: date, d1: date) -> list[dict]:
    """Every material ordered in the period — the product filter's list, drawn
    before any product pick so a pick never shortens the list it came from."""
    mats = materials(db)
    seen = [m for (m,) in db.query(OntimeDemand.material)
            .filter(OntimeDemand.day >= d0, OntimeDemand.day <= d1).distinct()]
    out = [{"material": m, "name": mats.get(m, ("", ""))[0], "grp": mats.get(m, ("", ""))[1]} for m in seen]
    out.sort(key=lambda x: (x["name"] or x["material"]).casefold())
    return out


def materials(db: Session) -> dict:
    return {m.material: (m.name or "", m.grp or "") for m in db.query(OntimeMaterial).all()}


# ── the sheet's row arithmetic ───────────────────────────────────────────────

def evaluate(D: dict, posts_d: Optional[_Posts], posts_next: Optional[_Posts], wins: dict) -> dict:
    """One material on one order day → {wave: row} for every wave its group
    has a window for. A row: D (ordered), P (received in the window), H (what
    the sheet counts for the wave), c (on-time share, None = nothing ordered),
    covered (= c × D)."""
    P: dict = {}
    for w, (s, e) in wins.items():
        if w == 3:
            P[w] = posts_next.between(WAVE3_FROM, e) if posts_next else 0.0
        elif e < s:   # a window across midnight — none today; read both halves
            P[w] = (posts_d.between(s, 86_399) if posts_d else 0.0) + \
                   (posts_next.between(WAVE3_FROM, e) if posts_next else 0.0)
        else:
            P[w] = posts_d.between(s, e) if posts_d else 0.0

    d1, d2, d3 = D.get(1, 0.0), D.get(2, 0.0), D.get(3, 0.0)
    rows: dict = {}
    c1 = None
    h1 = h2 = 0.0
    if 1 in wins:
        h1 = P[1]
        c1 = min(1.0, h1 / d1) if d1 > 0 else None
        rows[1] = (d1, P[1], h1, c1)
    if 2 in wins:
        p2 = P[2]
        h2 = max(p2 if c1 == 1.0 else p2 - (d1 - h1), 0.0) if 1 in wins else max(p2, 0.0)
        surplus1 = max(h1 - d1, 0.0) if 1 in wins else 0.0
        c2 = min(1.0, (h2 + surplus1) / d2) if d2 > 0 else None
        rows[2] = (d2, p2, h2, c2)
    if 3 in wins:
        h3 = P[3]
        before_h = (h1 if 1 in wins else 0.0) + (h2 if 2 in wins else 0.0)
        before_d = (d1 if 1 in wins else 0.0) + (d2 if 2 in wins else 0.0)
        c3 = min(1.0, (h3 + max(before_h - before_d, 0.0)) / d3) if d3 > 0 else None
        rows[3] = (d3, P[3], h3, c3)
    return {w: {"D": r[0], "P": r[1], "H": r[2], "c": r[3],
                "covered": (r[3] * r[0]) if r[3] is not None else 0.0}
            for w, r in rows.items()}


def _mean(xs: Iterable[float]) -> Optional[float]:
    xs = [x for x in xs if x is not None]
    return sum(xs) / len(xs) if xs else None


# ── the page ─────────────────────────────────────────────────────────────────

def _days(d0: date, d1: date) -> list[date]:
    return [d0 + timedelta(days=i) for i in range((d1 - d0).days + 1)]


def _rows(db: Session, d0: date, d1: date, wins_by_grp: dict, mats: dict,
          sel_mats: Optional[set] = None):
    """Every (day, material, wave) row of the period, the sheet's way, plus what
    could not be evaluated (a wave its group has no window for)."""
    demand = _demand(db, d0, d1, sel_mats)
    posts = _posts(db, d0, d1 + timedelta(days=1), sel_mats)
    rows = []
    no_window: dict = defaultdict(lambda: {"qty": 0.0, "materials": set()})
    for (day, mat), e in demand.items():
        grp = e["grp"] or mats.get(mat, ("", ""))[1]
        g = wins_by_grp.get(_fold(grp))
        wins = g["waves"] if g else {}
        for w, q in e["waves"].items():
            if w not in wins and q > 0:
                nw = no_window[grp or "—"]
                nw["qty"] += q
                nw["materials"].add(mat)
        if not wins:
            continue
        ev = evaluate(e["waves"], posts.get((day, mat)), posts.get((day + timedelta(days=1), mat)), wins)
        gname = g["name"]
        for w, r in ev.items():
            if r["D"] <= 0 and r["P"] <= 0:
                continue
            rows.append((day, mat, gname, w, r))
    return rows, no_window


def build(db: Session, d0: date, d1: date, groups: Optional[set] = None,
          waves: Optional[set] = None, sel_mats: Optional[set] = None) -> dict:
    rd = ontime_sync.last_read(db, ok_only=True)
    stamp = rd.id if rd else 0
    key = (stamp, d0, d1, tuple(sorted(groups or ())), tuple(sorted(waves or ())),
           tuple(sorted(sel_mats or ())))
    with _cache_lock:
        hit = _cache.get(key)
        if hit is not None:
            _cache.move_to_end(key)
            return hit
    out = _build(db, d0, d1, groups, waves, sel_mats, rd)
    with _cache_lock:
        _cache[key] = out
        while len(_cache) > _CACHE_MAX:
            _cache.popitem(last=False)
    return out


def _build(db, d0, d1, groups, waves, sel_mats, rd) -> dict:
    wins = load_windows(db)
    mats = materials(db)
    gsel = {_fold(g) for g in groups} if groups else None
    wsel = set(waves) if waves else None
    days = _days(d0, d1)
    di = {d: i for i, d in enumerate(days)}

    rows, no_window = _rows(db, d0, d1, wins, mats, sel_mats)
    keep = [r for r in rows
            if (gsel is None or _fold(r[2]) in gsel) and (wsel is None or r[3] in wsel)]

    # Totals and the daily trend — on-time quantity ÷ ordered quantity.
    tot = {"demand": 0.0, "ontime": 0.0, "posted": 0.0}
    trend = [{"date": d.isoformat(), "demand": 0.0, "ontime": 0.0,
              "waves": {}} for d in days]
    wave_acc: dict = defaultdict(lambda: {"demand": 0.0, "ontime": 0.0, "cs": []})
    gw_day: dict = defaultdict(list)          # (grp, wave, day) → [c, …]  the sheet's AVERAGEIFS
    grp_acc: dict = defaultdict(lambda: {"demand": 0.0, "ontime": 0.0, "materials": set(),
                                         "late_materials": set()})
    prod: dict = {}
    for day, mat, grp, w, r in keep:
        D, C = r["D"], r["covered"]
        tot["demand"] += D
        tot["ontime"] += C
        tot["posted"] += r["P"]
        t = trend[di[day]]
        t["demand"] += D
        t["ontime"] += C
        tw = t["waves"].setdefault(w, [0.0, 0.0])
        tw[0] += D
        tw[1] += C
        wa = wave_acc[w]
        wa["demand"] += D
        wa["ontime"] += C
        if r["c"] is not None:
            wa["cs"].append(r["c"])
            gw_day[(grp, w, day)].append(r["c"])
        ga = grp_acc[grp]
        ga["demand"] += D
        ga["ontime"] += C
        if D > 0:
            ga["materials"].add(mat)
            if C < D - 1e-9:
                ga["late_materials"].add(mat)
        p = prod.get(mat)
        if p is None:
            name, mgrp = mats.get(mat, ("", ""))
            p = prod[mat] = {"material": mat, "name": name, "grp": grp, "demand": 0.0,
                             "ontime": 0.0, "posted": 0.0, "waves": {},
                             "dd": defaultdict(lambda: [0.0, 0.0])}
        p["demand"] += D
        p["ontime"] += C
        p["posted"] += r["P"]
        pw = p["waves"].setdefault(w, [0.0, 0.0])
        pw[0] += D
        pw[1] += C
        pdd = p["dd"][day]
        pdd[0] += D
        pdd[1] += C

    # The sheet's group figures: group × wave × day = mean of products; group ×
    # day = mean of its waves; over the period = mean of its days.
    grp_wave_day: dict = defaultdict(dict)    # grp → {(w, day): mean}
    for (g, w, day), cs in gw_day.items():
        grp_wave_day[g][(w, day)] = sum(cs) / len(cs)
    groups_out = []
    for g, ga in grp_acc.items():
        by_day: dict = defaultdict(list)
        by_wave: dict = defaultdict(list)
        cells = grp_wave_day.get(g, {})
        for (w, dd), v in cells.items():
            by_day[dd].append(v)
            by_wave[w].append(v)
        daily = [_mean(by_day.get(d, ())) for d in days]
        waves_out = {w: _mean(by_wave[w]) for w in sorted(by_wave)}
        wave_daily = {str(w): [None if cells.get((w, d)) is None else round(cells[(w, d)], 4) for d in days]
                      for w in sorted(by_wave)}
        gw = wins.get(_fold(g), {"waves": {}, "pos": 0})
        groups_out.append({
            "grp": g, "demand": round(ga["demand"], 3), "ontime": round(ga["ontime"], 3),
            "late": round(ga["demand"] - ga["ontime"], 3),
            "mean": _mean(daily),
            "daily": [None if v is None else round(v, 4) for v in daily],
            "waves": {str(w): (None if v is None else round(v, 4)) for w, v in waves_out.items()},
            "wave_daily": wave_daily,
            "windows": {str(w): list(v) for w, v in gw["waves"].items()},
            "materials": len(ga["materials"]), "late_materials": len(ga["late_materials"]),
            "pos": gw.get("pos", 0),
        })
    groups_out.sort(key=lambda x: (-(x["late"] or 0), x["grp"]))

    products_out = []
    for p in prod.values():
        dd = p.pop("dd")
        daily = []
        for d in days:
            v = dd.get(d)
            daily.append(None if not v or v[0] <= 0 else round(100 * v[1] / v[0]))
        products_out.append({
            **{k: v for k, v in p.items() if k not in ("waves",)},
            "demand": round(p["demand"], 3), "ontime": round(p["ontime"], 3),
            "posted": round(p["posted"], 3),
            "late": round(p["demand"] - p["ontime"], 3),
            "waves": {str(w): [round(v[0], 3), round(v[1], 3)] for w, v in sorted(p["waves"].items())},
            "daily": daily,
        })
    products_out.sort(key=lambda x: (-x["late"], x["name"] or x["material"]))

    waves_out = [{"wave": w, "demand": round(a["demand"], 3), "ontime": round(a["ontime"], 3),
                  "late": round(a["demand"] - a["ontime"], 3), "mean": _mean(a["cs"]),
                  "rows": len(a["cs"])}
                 for w, a in sorted(wave_acc.items())]

    for t in trend:
        t["demand"] = round(t["demand"], 3)
        t["ontime"] = round(t["ontime"], 3)
        t["waves"] = {str(w): [round(v[0], 3), round(v[1], 3)] for w, v in sorted(t["waves"].items())}

    # The same totals over the period just before, for the KPI's change.
    n = len(days)
    p0, p1 = d0 - timedelta(days=n), d0 - timedelta(days=1)
    prev = None
    first = rd.first_day if rd else None
    if first is None or p0 >= first:
        prow, _ = _rows(db, p0, p1, wins, mats, sel_mats)
        pd = pc = 0.0
        for _, _, grp, w, r in prow:
            if (gsel is None or _fold(grp) in gsel) and (wsel is None or w in wsel):
                pd += r["D"]
                pc += r["covered"]
        if pd > 0:
            prev = {"date_from": p0.isoformat(), "date_to": p1.isoformat(),
                    "demand": round(pd, 3), "ontime": round(pc, 3)}

    # The option lists: every group with a window (the sheet's order), waves.
    opt_groups = [g["name"] for g in sorted(wins.values(), key=lambda g: (g["pos"], g["name"]))]
    notes = {
        "overlap": overlapping(wins),
        "no_window": sorted(
            [{"grp": g, "qty": round(v["qty"], 3), "materials": len(v["materials"])}
             for g, v in no_window.items()],
            key=lambda x: -x["qty"])[:12],
    }
    return {
        "date_from": d0.isoformat(), "date_to": d1.isoformat(),
        "days": [d.isoformat() for d in days],
        "totals": {"demand": round(tot["demand"], 3), "ontime": round(tot["ontime"], 3),
                   "late": round(tot["demand"] - tot["ontime"], 3), "posted": round(tot["posted"], 3),
                   "products": sum(1 for p in products_out if p["demand"] > 0),
                   "days": sum(1 for t in trend if t["demand"] > 0)},
        "prev": prev,
        "trend": trend,
        "waves": waves_out,
        "groups": groups_out,
        "products": products_out,
        "options": {"groups": opt_groups, "waves": sorted({w for g in wins.values() for w in g["waves"]})},
        "windows": [{"grp": g["name"], "waves": {str(w): list(v) for w, v in g["waves"].items()}}
                    for g in sorted(wins.values(), key=lambda g: (g["pos"], g["name"]))],
        "notes": notes,
    }


def product(db: Session, material: str, d0: date, d1: date) -> dict:
    """One material, day by day and wave by wave, with the times production
    posted it — the working behind every figure the product shows."""
    wins = load_windows(db)
    mats = materials(db)
    demand = _demand(db, d0, d1, {material})
    posts = _posts(db, d0, d1 + timedelta(days=1), {material})
    name, mgrp = mats.get(material, ("", ""))
    grp = mgrp
    for e in demand.values():
        if e["grp"]:
            grp = e["grp"]
            break
    g = wins.get(_fold(grp))
    w_of = g["waves"] if g else {}
    days_out = []
    for d in _days(d0, d1):
        e = demand.get((d, material))
        pd, pn = posts.get((d, material)), posts.get((d + timedelta(days=1), material))
        if not e and not pd:
            continue
        ev = evaluate(e["waves"] if e else {}, pd, pn, w_of) if w_of else {}
        # A receipt in the small hours of d (up to wave 3's end) belongs to
        # the PREVIOUS order day's wave 3, so it is not listed under d.
        w3_end = w_of[3][1] if 3 in w_of else -1
        today = [[s, round(pd.cum[i + 1] - pd.cum[i], 3)] for i, s in enumerate(pd.secs)
                 if s > w3_end] if pd else []
        night = [[s, round(pn.cum[i + 1] - pn.cum[i], 3)] for i, s in enumerate(pn.secs)
                 if s <= w3_end] if pn else []
        days_out.append({
            "date": d.isoformat(),
            "waves": {str(w): {"D": round(r["D"], 3), "P": round(r["P"], 3), "H": round(r["H"], 3),
                               "c": None if r["c"] is None else round(r["c"], 4),
                               "covered": round(r["covered"], 3)}
                      for w, r in ev.items()},
            "no_window": {str(w): round(q, 3) for w, q in (e["waves"] if e else {}).items()
                          if w not in w_of and q > 0},
            "posts": today, "posts_next": night,
        })
    return {"material": material, "name": name, "grp": grp or None,
            "windows": {str(w): list(v) for w, v in w_of.items()},
            "days": days_out}
