"""Per Verifix cell over a period: how many people worked there, and their
hours (2026-11-17, asked for the «Yacheyka effektivnost» table — Q3 2025
against Q3 2026).

  WHERE a person-day sits in the org unit in force THAT day: the latest posted
        hiring or transfer (`pro/hiring$list`, `pro/transfer$list`) dated on
        or before it. Someone with no journal at all sits in their CURRENT org
        unit (`employee$list`). Days of someone whose journals all start later
        are counted as `unknown`, never guessed into a cell.
  HOURS «Отработано» exactly as «Davomat» stores a row
        (`verifix_attendance._row`, the parity rule).
  PEOPLE distinct employees with hours > 0 in the cell over the WHOLE period —
        a person who worked in two cells counts once in each.

Keyed by every Verifix node that carries a code (not only our `cells`), so a
code the platform does not hold still gets its figures. Read on a background
thread (minutes: a month at a time, 800 people per request); the result is
stored under app setting `vfx_cell_hours:<begin>:<end>`. A read cut short is
stored with `partial: true` and must not be used as the whole.
`GET /api/verifix-test/cell-hours` (admin-only) starts it and returns it.
"""
from __future__ import annotations

import bisect
import json
import logging
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from app.database import SessionLocal
from app.models import AppSetting

log = logging.getLogger(__name__)

BUDGET_S = 3600.0
JOURNAL_PAGES = 3000          # each_page's 60-page cap is for a request; this is a background read
MAX_SPAN_DAYS = 200

_lock = threading.Lock()
_state: dict = {}             # the read in progress: key, stage, pages, started


def _key(begin: date, end: date) -> str:
    return f"vfx_cell_hours:{begin.isoformat()}:{end.isoformat()}"


def stored(db, begin: date, end: date):
    row = db.query(AppSetting).filter_by(key=_key(begin, end)).first()
    try:
        return json.loads(row.value) if row and row.value else None
    except ValueError:
        return None


def ask(db, begin: date, end: date, force: bool = False) -> dict:
    """The stored result, else start a read (one at a time) and say so."""
    from app.services import verifix
    from app.services.verifix_live import now_local
    if begin > end or end >= now_local().date():
        raise ValueError("the period must end before today")
    if (end - begin).days > MAX_SPAN_DAYS:
        raise ValueError(f"at most {MAX_SPAN_DAYS} days")
    if not verifix.config(db).get("login"):
        from app.services.verifix_explore import NotConfigured
        raise NotConfigured()
    have = stored(db, begin, end)
    if have and not force:
        return have
    if _lock.locked():
        return {"loading": True, "running": dict(_state)}
    threading.Thread(target=_guarded, args=(begin, end), name="verifix-cell-hours",
                     daemon=True).start()
    return {"loading": True, "started": True, "previous": have}


def _guarded(begin: date, end: date) -> None:
    if not _lock.acquire(blocking=False):
        return
    try:
        _state.clear()
        _state.update(key=_key(begin, end), stage="start", pages=0,
                      started=datetime.now(timezone.utc).isoformat(timespec="seconds"))
        _read(begin, end)
    except Exception as exc:  # noqa: BLE001 — the state says why; the next ask retries
        log.exception("verifix cell hours %s..%s failed", begin, end)
        _state.update(stage="failed", error=str(exc)[:300])
    finally:
        _lock.release()


def _months(begin: date, end: date):
    d = begin
    while d <= end:
        nxt = date(d.year + (d.month == 12), d.month % 12 + 1, 1)
        yield d, min(end, nxt - timedelta(days=1))
        d = nxt


def _events(cl, deadline: float, last: date, stats: dict) -> dict[str, list]:
    """employee_id → sorted [(date, org_unit_id)] from posted hirings and transfers."""
    from app.services import verifix
    from app.services.verifix_attendance import _day
    ev: dict[str, list] = defaultdict(list)
    for path, child, day_key, body in (
            ("pro/hiring$list", "hirings", "hiring_date",
             {"journal_ids": [], "journal_begin_date": "01.01.2000",
              "journal_end_date": verifix._dmy(last)}),
            ("pro/transfer$list", "transfers", "transfer_begin", {"journal_ids": []})):
        for page in verifix.each_page(cl, path, body, limit=100, deadline=deadline,
                                      max_pages=JOURNAL_PAGES):
            _state["pages"] = _state.get("pages", 0) + 1
            for j in page or []:
                if str(j.get("journal_posted") or "Y").upper() != "Y":
                    stats["unposted"] += 1
                    continue
                for x in j.get(child) or []:
                    eid, unit = str(x.get("employee_id") or ""), str(x.get("org_unit_id") or "")
                    d = _day(x.get(day_key))
                    if not (eid and unit and d):
                        continue
                    ev[eid].append((d, unit))
                    stats[child] += 1
                    if child == "transfers":
                        until = _day(x.get("transfer_end"))
                        if until and until > d:
                            stats["transfers_with_end"] += 1
    for lst in ev.values():
        lst.sort()
    return ev


def _read(begin: date, end: date) -> None:
    from app.services import verifix
    from app.services.verifix_attendance import ID_CHUNK, _day, _directory, _row, hours_rule
    started = time.monotonic()
    deadline = started + BUDGET_S
    db = SessionLocal()
    try:
        cfg = verifix.config(db, with_password=True)
        rule = hours_rule(db)
    finally:
        db.close()

    stats: dict = defaultdict(int)
    _state["stage"] = "directory"
    directory = _directory(cfg, deadline)
    unit_code, emps = directory["units"], directory["emps"]
    partial = False
    hours: dict[str, float] = defaultdict(float)
    people: dict[str, set] = defaultdict(set)
    pdays: dict[str, int] = defaultdict(int)
    with verifix.client(cfg) as cl:
        _state["stage"] = "journals"
        ev = _events(cl, deadline, end, stats)
        # Only people who sat in a coded node at some time can land in one.
        who = sorted(eid for eid, (unit, _h, dismissed, *_r) in emps.items()
                     if eid.isdigit() and not (dismissed and dismissed < begin)
                     and (unit in unit_code or any(u in unit_code for _d, u in ev.get(eid, ()))))
        stats["employees_asked"] = len(who)
        try:
            for lo, hi in _months(begin, end):
                _state["stage"] = f"timesheet {lo.isoformat()[:7]}"
                ids = [e for e in who if not (emps[e][2] and emps[e][2] < lo)]
                for i in range(0, len(ids), ID_CHUNK):
                    body = {"period_begin_date": verifix._dmy(lo), "period_end_date": verifix._dmy(hi),
                            "division_ids": [], "employee_ids": [int(e) for e in ids[i:i + ID_CHUNK]]}
                    for page in verifix.each_page(cl, "core/timesheet$export", body,
                                                  limit=verifix.LIMIT_TIMESHEET, deadline=deadline,
                                                  max_pages=JOURNAL_PAGES):
                        _state["pages"] = _state.get("pages", 0) + 1
                        for rec in page or []:
                            eid = str(rec.get("employee_id") or "")
                            if eid not in emps:
                                continue
                            mine = ev.get(eid)
                            dates = [d for d, _u in mine] if mine else None
                            for d in rec.get("days") or []:
                                day = _day(d.get("date"))
                                if day is None or not (lo <= day <= hi):
                                    continue
                                h = _row(rec, d, rule)["hours_worked"] or 0.0
                                if h <= 0:
                                    continue
                                if mine:
                                    k = bisect.bisect_right(dates, day) - 1
                                    if k < 0:
                                        stats["days_unknown"] += 1
                                        continue
                                    unit = mine[k][1]
                                    stats["days_by_journal"] += 1
                                else:
                                    unit = emps[eid][0]
                                    stats["days_by_current"] += 1
                                code = unit_code.get(unit)
                                if not code:
                                    stats["days_uncoded"] += 1
                                    continue
                                hours[code] += h
                                people[code].add(eid)
                                pdays[code] += 1
        except verifix.VerifixError as exc:
            if exc.code != "slow":
                raise
            partial = True

    out = {
        "begin": begin.isoformat(), "end": end.isoformat(), "partial": partial,
        "read_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "seconds": round(time.monotonic() - started, 1), "pages": _state.get("pages", 0),
        "rule": {"kinds": rule.get("kinds"), "source": rule.get("source")},
        "stats": dict(stats),
        "cells": {c: {"people": len(people[c]), "hours": round(hours[c], 2), "person_days": pdays[c]}
                  for c in sorted(hours)},
    }
    db = SessionLocal()
    try:
        row = db.query(AppSetting).filter_by(key=_key(begin, end)).first()
        if row is None:
            db.add(AppSetting(key=_key(begin, end), value=json.dumps(out)))
        else:
            row.value = json.dumps(out)
        db.commit()
    finally:
        db.close()
    _state.update(stage="done", partial=partial)
    log.info("verifix cell hours %s..%s: %s cells, %s people asked%s", begin, end,
             len(out["cells"]), stats["employees_asked"], " (PARTIAL)" if partial else "")
