"""TEMPORARY, READ-ONLY: the on-time sheet's own summary tabs set against the
page's arithmetic, answered as JSON (`GET /api/ontime/sheet-check`, admin).

Asked for on 2026-11-03: «the on-time page does not show the same results as
the sheet». Only production holds the Google service account, so this opens
the sheet set on «Ma'lumotlar», reads «заход», the formulas on top of
«заявки» / «свод» / «свод по группам» / «средний on time», and the newest
dated day blocks of «свод» and «свод по группам», and compares them with
`ontime.evaluate` over the STORED read (the raw tabs are not read again).
Writes nothing.

Delete this module and its route in `routers/ontime.py` once answered.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import OntimeDemand, OntimeMaterial, OntimeReceipt, OntimeWindow
from app.services import ontime, ontime_sync
from app.services import ontime_sheet_report as rep

SVOD, SVOD_GROUPS, SREDNIY = "свод", "свод по группам", "средний on time"
MAX_DIFFS = 400
MAX_LIST = 250


def _tab(tabs: list, name: str) -> Optional[dict]:
    want = ontime_sync._norm(name)
    return next((t for t in tabs if ontime_sync._norm(t["title"]) == want), None)


def _get(ws, rng: str, formula: bool = False) -> list:
    return ontime_sync._call(
        ws.get, rng,
        value_render_option="FORMULA" if formula else "UNFORMATTED_VALUE",
        date_time_render_option="SERIAL_NUMBER") or []


def _formulas(ws, rng: str) -> list:
    out = []
    try:
        vals = _get(ws, rng, formula=True)
    except Exception as exc:  # noqa: BLE001
        return [["error", str(exc)[:200]]]
    start_col = ontime_sync._norm(rng.split(":")[0]).rstrip("0123456789").upper()
    c0 = 0
    for ch in start_col:
        c0 = c0 * 26 + (ord(ch) - 64)
    c0 -= 1
    r0 = int("".join(ch for ch in rng.split(":")[0] if ch.isdigit()) or 1)
    for ri, r in enumerate(vals):
        for ci, v in enumerate(r):
            if isinstance(v, str) and v.startswith("="):
                out.append([f"{ontime_sync._col(c0 + ci)}{r0 + ri}", v[:1200]])
    return out


def _sparse(ws, nrows: int, label_cols: int, blocks: list[tuple[int, int]]) -> list[list]:
    """Rows 1..nrows with the label columns A.. and the given column spans
    filled at their own indices (everything else None)."""
    width = max([label_cols] + [b + n for b, n in blocks])
    grid = [[None] * width for _ in range(nrows)]
    labels = _get(ws, f"A1:{ontime_sync._col(label_cols - 1)}{nrows}")
    for ri, r in enumerate(labels[:nrows]):
        for ci, v in enumerate(r[:label_cols]):
            grid[ri][ci] = v
    # contiguous spans read once
    spans: list[list[int]] = []
    for b, n in sorted(blocks):
        if spans and b <= spans[-1][1] + 1:
            spans[-1][1] = max(spans[-1][1], b + n - 1)
        else:
            spans.append([b, b + n - 1])
    for lo, hi in spans:
        vals = _get(ws, f"{ontime_sync._col(lo)}1:{ontime_sync._col(hi)}{nrows}")
        for ri, r in enumerate(vals[:nrows]):
            for ci, v in enumerate(r):
                if lo + ci < width:
                    grid[ri][lo + ci] = v
        time.sleep(0.4)
    return grid


def _stored(db: Session, days: set) -> dict:
    """The stored read in the shape `ontime_sync.read_*` hands back."""
    d0, d1 = min(days), max(days) + timedelta(days=1)
    demand: dict = {}
    for d, m, w, q, g, ln in db.query(OntimeDemand.day, OntimeDemand.material, OntimeDemand.wave,
                                      OntimeDemand.qty, OntimeDemand.grp, OntimeDemand.lines) \
            .filter(OntimeDemand.day >= min(days), OntimeDemand.day <= max(days)):
        demand[(d, m, w)] = [q or 0.0, ln or 0, g or ""]
    rec: dict = {}
    for d, s, m, q in db.query(OntimeReceipt.day, OntimeReceipt.sec, OntimeReceipt.material,
                               OntimeReceipt.qty) \
            .filter(OntimeReceipt.day >= d0, OntimeReceipt.day <= d1):
        rec[(d, s, m)] = rec.get((d, s, m), 0.0) + (q or 0.0)
    mats = {m.material: (m.name or "", m.grp or "") for m in db.query(OntimeMaterial).all()}
    windows = [{"grp": w.grp, "wave": w.wave, "start_s": w.start_s, "end_s": w.end_s, "pos": w.pos or 0}
               for w in db.query(OntimeWindow).all()]
    return {"demand": demand, "rec": rec, "mats": mats, "windows": windows}


# One run at a time, in the background: the report door gives a GET 50 s, and
# the Sheets reads alone can pass that when the API is throttled.
_state: dict = {"state": "idle"}
_lock = threading.Lock()


def start(days_wanted: int, full: bool) -> None:
    with _lock:
        if _state.get("state") == "running":
            return
        _state.clear()
        _state.update(state="running", started=time.time(), days=days_wanted, full=full)

    def _go():
        from app.database import SessionLocal
        db = SessionLocal()
        try:
            res = run(db, days_wanted, full)
            with _lock:
                _state.update(state="done", result=res, finished=time.time())
        except Exception as exc:  # noqa: BLE001 — a check must report, not die
            with _lock:
                _state.update(state="failed", error=f"{type(exc).__name__}: {exc}"[:500],
                              finished=time.time())
        finally:
            db.close()

    threading.Thread(target=_go, name="ontime-sheet-check", daemon=True).start()


def state(wait_s: float = 0.0) -> dict:
    end = time.monotonic() + wait_s
    while True:
        with _lock:
            st = dict(_state)
        if st.get("state") != "running" or time.monotonic() >= end:
            return st
        time.sleep(1.0)


def run(db: Session, days_wanted: int = 6, full: bool = True) -> dict:
    t0 = time.monotonic()
    out: dict = {"timing": {}}
    sid = ontime_sync.sheet_id(db)
    out["sheet"] = sid
    rd = ontime_sync.last_read(db, ok_only=True)
    last_day = rd.last_day if rd else None
    out["stored_last_day"] = last_day.isoformat() if last_day else None
    db.rollback()
    from app.services.sheets_reader import get_client
    sh = ontime_sync._call(get_client().open_by_key, sid)
    meta = ontime_sync._call(sh.fetch_sheet_metadata)
    tabs = rep._tabs(meta)
    out["tabs"] = [{k: t[k] for k in ("title", "rows", "cols", "hidden")} for t in tabs]
    ws_by_id = {ws.id: ws for ws in ontime_sync._call(sh.worksheets)}

    def ws_of(name):
        t = _tab(tabs, name)
        return (ws_by_id.get(t["gid"]), t) if t else (None, None)

    # «заход» — values and formulas, the whole top of the tab
    ws, t = ws_of(ontime_sync.TAB_WAVES)
    if ws is not None and full:
        out["zakhod"] = _get(ws, "A1:N80")
        out["zakhod_f"] = _formulas(ws, "A1:N80")
    ws, t = ws_of(ontime_sync.TAB_ORDERS)
    if ws is not None and full:
        out["orders_head"] = _get(ws, "A1:AD2")
        out["orders_f"] = _formulas(ws, "A1:AD3")
    out["timing"]["small_s"] = round(time.monotonic() - t0, 1)

    # «свод»: its dated day blocks (G on, 4 columns each: D · H · I · row-3 mean)
    ws, t = ws_of(SVOD)
    svod_grid = None
    chosen: list = []
    if ws is not None:
        head = _get(ws, f"A1:{ontime_sync._col((t['cols'] or 1) - 1)}3")
        row1 = head[0] if head else []
        dated = rep._dated_cols(row1, 6)
        out["svod_header_days"] = [[ontime_sync._col(c), d.isoformat()] for c, d in dated]
        usable = [(c, d) for c, d in dated if last_day is None or d <= last_day]
        chosen = usable[-days_wanted:]
        if chosen:
            nrows = t["rows"] or 1
            svod_grid = _sparse(ws, nrows, 6, [(c, 4) for c, _d in chosen])
            for i, r in enumerate(head[:3]):
                for ci, v in enumerate(r):
                    if ci < len(svod_grid[i]):
                        svod_grid[i][ci] = v
            c_last = chosen[-1][0]
            out["svod_f"] = [] if not full else None
            if full:
                out["svod_f"] = _formulas(ws, "A1:F8") + _formulas(
                ws, f"{ontime_sync._col(c_last)}1:{ontime_sync._col(c_last + 3)}8")
    out["timing"]["svod_s"] = round(time.monotonic() - t0, 1)

    # «свод по группам»: blocks from C (+2 group-wave mean, +3 group mean)
    ws, t = ws_of(SVOD_GROUPS)
    grp_grid, grp_chosen = None, []
    if ws is not None:
        head = _get(ws, f"A1:{ontime_sync._col((t['cols'] or 1) - 1)}2")
        dated = rep._dated_cols(head[0] if head else [], 2)
        want = {d for _c, d in chosen}
        grp_chosen = [(c, d) for c, d in dated if d in want] or dated[-days_wanted:]
        out["groups_header_days"] = [[ontime_sync._col(c), d.isoformat()] for c, d in dated][-40:]
        if grp_chosen:
            grp_grid = _sparse(ws, t["rows"] or 1, 2, [(c, 4) for c, _d in grp_chosen])
            out["groups_f"] = [] if not full else _formulas(ws, "A1:B6") + _formulas(
                ws, f"{ontime_sync._col(grp_chosen[-1][0])}1:{ontime_sync._col(grp_chosen[-1][0] + 3)}6")
    # «средний on time»: small — read whole (bounded)
    ws, t = ws_of(SREDNIY)
    if ws is not None and full:
        rows = min(t["rows"] or 1, 120)
        cols = min(t["cols"] or 1, 40)
        out["sredniy"] = _get(ws, f"A1:{ontime_sync._col(cols - 1)}{rows}")
        out["sredniy_f"] = _formulas(ws, f"A1:{ontime_sync._col(cols - 1)}8")
    out["timing"]["sheet_s"] = round(time.monotonic() - t0, 1)

    # the page's arithmetic over the stored read, on the same days
    days = {d for _c, d in chosen} | {d for _c, d in grp_chosen}
    if days:
        data = _stored(db, days)
        model = rep._Model(data, days)
        if svod_grid is not None:
            sv = rep._compare_svod(svod_grid, model, chosen)
            svod_mats = {(ontime_sync._text(rep._at(r, 0)), ontime_sync.parse_wave(rep._at(r, 3)))
                         for r in svod_grid[3:]}
            for d in sv["days"]:
                d["day"] = d["day"].isoformat()
            for x in sv["diffs"]:
                x["day"] = x["day"].isoformat()
            # what the diffs are made of, per kind
            kinds: dict = defaultdict(lambda: {"n": 0, "sD": 0.0, "oD": 0.0})
            for x in sv["diffs"]:
                k = kinds[(x["grp"], x["wave"], x["what"])]
                k["n"] += 1
                k["sD"] += x["sD"] or 0.0
                k["oD"] += x["oD"] or 0.0
            out["svod"] = {
                "rows": sv["rows"], "days": sv["days"],
                "diff_kinds": sorted(([g, w, what, v["n"], round(v["sD"], 1), round(v["oD"], 1)]
                                      for (g, w, what), v in kinds.items()), key=lambda x: -x[3])[:MAX_LIST],
                "diffs": sv["diffs"][:MAX_DIFFS],
                "win_diff": sv["win_diff"][:MAX_LIST], "win_diff_n": len(sv["win_diff"]),
                "grp_diff": sv["grp_diff"][:MAX_LIST], "grp_diff_n": len(sv["grp_diff"]),
            }
            # the page counts what «свод» has no row for, and the reverse
            page_only: dict = defaultdict(float)
            for d in days:
                for m, g, w, r in model.day_rows(d):
                    if (m, w) not in svod_mats and r["D"] > 0:
                        page_only[(g, w)] += r["D"]
            out["page_only"] = sorted(([g, w, round(q, 1)] for (g, w), q in page_only.items()),
                                      key=lambda x: -x[2])
            sheet_only: dict = defaultdict(lambda: [0, 0.0])
            for rr in svod_grid[3:]:
                m = ontime_sync._text(rep._at(rr, 0))
                w = ontime_sync.parse_wave(rep._at(rr, 3))
                g = ontime_sync._text(rep._at(rr, 2))
                if not m or w is None:
                    continue
                for c, d in chosen:
                    sD = rep._num(rep._at(rr, c))
                    if not sD:
                        continue
                    _grp, _wins, ev = model.ev(d, m)
                    if w not in ev:
                        sheet_only[(g, w)][0] += 1
                        sheet_only[(g, w)][1] += sD
            out["sheet_only"] = sorted(([g, w, n, round(q, 1)] for (g, w), (n, q) in sheet_only.items()),
                                       key=lambda x: -x[3])
        if grp_grid is not None:
            gp = rep._compare_groups(grp_grid, model, grp_chosen, svod_mats if svod_grid is not None else set())
            bad = [x for x in gp["list"] if not x["ok"]]
            for x in gp["list"]:
                x["day"] = x["day"].isoformat()
            out["groups"] = {"rows": gp["rows"], "cells": gp["cells"], "same": gp["same"],
                             "bad": bad[:MAX_LIST], "ok_sample": [x for x in gp["list"] if x["ok"]][:20]}
    # the PAGE itself (`ontime.build`, its own scope) against the sheet
    if days:
        b = ontime.build(db, min(days), max(days))
        di = {d: i for i, d in enumerate(b["days"])}
        page_gw = {}
        for g in b["groups"]:
            for w, arr in (g.get("wave_daily") or {}).items():
                for d, v in zip(b["days"], arr):
                    page_gw[(ontime._fold(g["grp"]), int(w), d)] = v
        cells, same, bad = 0, 0, []
        if grp_grid is not None:
            for ri, r in enumerate(grp_grid):
                grp = ontime_sync._text(rep._at(r, 0))
                w = ontime_sync.parse_wave(rep._at(r, 1))
                if not grp or w is None or ri < 1:
                    continue
                for c, d in grp_chosen:
                    s = rep._num(rep._at(r, c + 2))
                    p = page_gw.get((ontime._fold(grp), w, d.isoformat()))
                    if s is None and p is None:
                        continue
                    cells += 1
                    ok = (s is None) == (p is None) and (p is None or abs(p - s) <= 1e-4)
                    same += ok
                    if not ok:
                        bad.append([d.isoformat(), ri + 1, grp, w, s, p])
        totals = []
        if svod_grid is not None:
            for d in out.get("svod", {}).get("days", []):
                t = b["trend"][di[d["day"]]] if d["day"] in di else None
                pv = (t["ontime"] / t["demand"]) if t and t["demand"] else None
                totals.append([d["day"], d["sheet_w"], pv, d["row3"]])
        out["page"] = {"tracked": b["notes"].get("tracked"), "tracked_rows": b["notes"].get("tracked_rows"),
                       "cells": cells, "same": same, "bad": bad[:MAX_LIST],
                       "totals": totals, "not_tracked": b["notes"].get("not_tracked"),
                       "no_window": b["notes"].get("no_window")}
    out["timing"]["total_s"] = round(time.monotonic() - t0, 1)
    return _plain(out)


def _plain(v: Any) -> Any:
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple, set)):
        return [_plain(x) for x in v]
    if isinstance(v, date):
        return v.isoformat()
    return v
