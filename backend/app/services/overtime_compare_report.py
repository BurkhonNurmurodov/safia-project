"""TEMPORARY, READ-ONLY (2026-11-02): overtime two ways, DMed once to Abbos.

The operator asked «what is gonna be the number with Сверхурочно column and
with the way you did» about «Hisobotlar»' new «Overtime hours». For September
and October 2026, over the production brigades (`brigadir_board.board_units`,
the report's own set), it prints:

  A  the report's figure — `routers/reports._overtime_by_month`, called as the
     report calls it: per closed unit-day row, effective hours (early arrival
     not counted) minus «Явка», the in-schedule hours in the clock's brackets;
  B  Verifix's own «Сверхурочно» time kind, read from `core/timesheet$export`
     for the whole month, for the people whose CURRENT org unit is a cell of a
     production brigade (Verifix keeps only today's placement), every day of
     the month (closed or not);

plus the month's totals of every Verifix time kind those people carry, so the
two can be read against «Явка» and «Свободное время». Writes nothing but its
flag. Delete this module, `startup.report_overtime_compare` /
`_overtime_compare_job` and both entrypoint calls once it has been sent.
"""
from __future__ import annotations

import time
from collections import defaultdict
from datetime import date

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell
from app.services import brigadir_board as bb
from app.services import verifix
from app.services.verifix_attendance import ID_CHUNK, _day, _directory

_API = "https://api.telegram.org"
MONTHS = [("2026-09", date(2026, 9, 1), date(2026, 9, 30)),
          ("2026-10", date(2026, 10, 1), date(2026, 10, 31))]
BUDGET_S = 900.0


def _num(v) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _is_overtime(name: str) -> bool:
    n = (name or "").lower()
    return "сверхуроч" in n or "overtime" in n


def collect(db: Session) -> dict:
    from app.routers.reports import _overtime_by_month

    units = bb.board_units(db, None, None)
    names = {u.id: u.name for u in units}
    ids = set(names)
    months = [{"ym": ym, "from": a, "to": b} for ym, a, b in MONTHS]

    # A — the report's own figure, whole and per brigade.
    a_total = _overtime_by_month(db, months, ids)
    a_unit = {mid: _overtime_by_month(db, months, {mid}) for mid in ids}

    # B — Verifix «Сверхурочно» for the people standing in production cells.
    cfg = verifix.config(db, with_password=True)
    if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
        raise RuntimeError("Verifix is not configured")
    deadline = time.monotonic() + BUDGET_S
    code_unit = {verifix._code_key(c.verifix_code): c.manager_id
                 for c in db.query(Cell.verifix_code, Cell.manager_id).all()
                 if c.manager_id in ids}
    kinds: dict[str, str] = {}
    with verifix.client(cfg) as cl:
        for page in verifix.each_page(cl, "core/time_kind$list", {"time_kind_ids": []},
                                      limit=verifix.LIMIT_LIST, deadline=deadline):
            for k in page:
                kid = str(k.get("time_kind_id") or "")
                if kid:
                    kinds[kid] = k.get("name") or kid
    ot_ids = {k for k, n in kinds.items() if _is_overtime(n)}

    directory = _directory(cfg, deadline)
    org_code, emps = directory["units"], directory["emps"]
    by_kind = {ym: defaultdict(float) for ym, _a, _b in MONTHS}   # minutes
    b_unit = {ym: defaultdict(float) for ym, _a, _b in MONTHS}    # overtime minutes
    b_days = {ym: 0 for ym, _a, _b in MONTHS}
    people = {}
    partial = []
    with verifix.client(cfg) as cl:
        for ym, first, last in MONTHS:
            who: dict[int, int] = {}
            for eid, (unit, hired, dismissed, *_r) in emps.items():
                mid = code_unit.get(org_code.get(unit, ""))
                if mid is None or not eid.isdigit():
                    continue
                if (hired and hired > last) or (dismissed and dismissed < first):
                    continue
                who[int(eid)] = mid
            people[ym] = len(who)
            chunks = [sorted(who)[i:i + ID_CHUNK] for i in range(0, len(who), ID_CHUNK)]
            try:
                for chunk in chunks:
                    body = {"period_begin_date": verifix._dmy(first),
                            "period_end_date": verifix._dmy(last),
                            "division_ids": [], "employee_ids": chunk}
                    for page in verifix.each_page(cl, "core/timesheet$export", body,
                                                  limit=verifix.LIMIT_TIMESHEET,
                                                  deadline=deadline):
                        for rec in page:
                            eid = str(rec.get("employee_id") or "")
                            mid = who.get(int(eid)) if eid.isdigit() else None
                            if mid is None:
                                continue
                            for d in rec.get("days") or []:
                                day = _day(d.get("date"))
                                if day is None or not (first <= day <= last):
                                    continue
                                had = False
                                for f in d.get("facts") or []:
                                    k = str(f.get("time_kind_id") or "")
                                    v = _num(f.get("fact_value"))
                                    if not k or not v:
                                        continue
                                    by_kind[ym][k] += v
                                    if k in ot_ids:
                                        b_unit[ym][mid] += v
                                        had = True
                                if had:
                                    b_days[ym] += 1
            except verifix.VerifixError as exc:
                partial.append(f"{ym}: {exc}")

    return {"names": names, "a_total": a_total, "a_unit": a_unit, "kinds": kinds,
            "ot_ids": ot_ids, "by_kind": by_kind, "b_unit": b_unit, "b_days": b_days,
            "people": people, "partial": partial}


def _n(v: float) -> str:
    return f"{v:,.0f}".replace(",", " ")


def _h(minutes: float) -> str:
    return _n(minutes / 60)


def text(rep: dict) -> str:
    yms = [ym for ym, _a, _b in MONTHS]
    a = rep["a_total"]
    ot = rep["ot_ids"]
    L = ["Overtime hours — two ways (production brigades)", ""]
    L.append("A = the report («Overtime hours»): effective hours (early arrival not "
             "counted) minus «Явка», closed days only.")
    names = ", ".join(f"{rep['kinds'][k]} (id {k})" for k in sorted(ot)) or "NONE FOUND"
    L.append(f"B = Verifix «Сверхурочно» time kind — {names}; people whose current "
             "org unit is a production cell, every day of the month.")
    L.append("")
    for ym in yms:
        b = sum(rep["b_unit"][ym].values())
        L.append(f"{ym}:  A = {_n(a[ym]['hours'])} h ({_n(a[ym]['days'])} person-days)  ·  "
                 f"B = {_h(b)} h ({_n(rep['b_days'][ym])} person-days, "
                 f"{_n(rep['people'][ym])} people read)")
    if rep["partial"]:
        L.append("⚠ Verifix read cut short: " + "; ".join(rep["partial"]))
    L += ["", "Per brigade (A / B, hours):"]
    for mid, name in sorted(rep["names"].items(), key=lambda kv: kv[1]):
        cells = []
        for ym in yms:
            av = rep["a_unit"][mid][ym]["hours"]
            bv = rep["b_unit"][ym].get(mid, 0.0)
            cells.append(f"{ym[5:]}: {_n(av)} / {_h(bv)}")
        L.append(f"· {name} — " + " · ".join(cells))
    L += ["", "Every Verifix time kind these people carry (hours = minutes ÷ 60):"]
    allk = set()
    for ym in yms:
        allk |= set(rep["by_kind"][ym])
    for k in sorted(allk, key=lambda k: -rep["by_kind"][yms[-1]].get(k, 0)):
        vals = " · ".join(f"{ym[5:]}: {_h(rep['by_kind'][ym].get(k, 0.0))}" for ym in yms)
        L.append(f"· {rep['kinds'].get(k, k)} (id {k}) — {vals}")
    return "\n".join(L)


def _post(method: str, data: dict) -> None:
    last = ""
    for attempt in range(1, 4):
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, timeout=60)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
        except Exception as exc:
            last = type(exc).__name__
        time.sleep(3 * attempt)
    raise RuntimeError(f"telegram {method} failed: {last}")


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    body = text(collect(db))
    db.rollback()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks)
