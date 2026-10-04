"""«Davomat (Verifix)» — the «Davomat» upload's twin, read from Verifix (TEST).

The admin «Davomat» tab takes the day's «Отчёт по посещениям сотрудников»
Excel. This tab (2026-10-04, the operator's request) shows the same day in the
same shape with a BUTTON instead of the file: it reads Verifix's API —
`core/timesheet$export`, the very report the Excel is exported from — for the
cells counted in the загрузка («Zagruzkada hisoblanadi», `cells.in_load`), and
for nothing else.

**A TEST, saved apart.** The rows land in `vfx_attendance_days` /
`vfx_attendance_rows` and nothing else on the platform reads them:
`attendance`, the «Davomat» batches, the загрузка and every figure stay the
file's. A re-read replaces the day. Beside each person the page puts what the
Excel said for them that day (`attendance_batch_rows`), so a past day can be
checked against the file it would replace.

**A row is built the way the Excel parser builds one** (`attendance_sheet`):

* placed in a cell by the employee's CURRENT org unit («отдел»), whose code is
  the cell's verifix code (the connection test, 2026-10-01) — so a person moved
  since that day lands in today's cell, and the comparison shows it;
* the day cell = the report's `input_time` – `output_time` with «Явка» in
  brackets, «08:01 - 17:13 (8.14)», exactly as the export prints it; «xx:xx»
  stands for a missing side, and such a row has no hours, as in the file;
* hours = «Отработано» = «Явка» + «Свободное время» in minutes (the 1 Oct dump:
  exact for 1,155 of 1,156 worked rows), unless the parity check found a rule
  of its own (`verifix_live._formula`);
* nobody clocked → the day cell's mark: the absence kind's letter («О» =
  «Отгул»), «X» for a plain «Отсутствие»;
* early arrival and effective hours by `clock_metrics`, the parser's own.

Who is asked about: every employee — any status — whose org unit names a
counted cell and who was hired by the day and not dismissed before it, so a
past day still finds the people who have left since.
"""
from __future__ import annotations

import logging
import time as _time
from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    AttendanceBatch, AttendanceBatchRow, Cell, Manager,
    VerifixAttendanceDay, VerifixAttendanceRow,
)
from app.services import verifix, verifix_live, verifix_parity
from app.services.attendance_sheet import clock_metrics
from app.services.day_state import day_state
from app.services.kpi_calculator import is_direct_role

log = logging.getLogger(__name__)

# Divisions + employees: several past days are usually read one after another.
DIR_TTL = 600
# The report is asked about this many employees per request.
ID_CHUNK = 800

# «Отработано» in minutes (see the module docstring).
DEFAULT_RULE = {"kinds": ["23", "27"], "names": ["Явка", "Свободное время"],
                "div": 60.0, "source": "default"}
# «Явка» — the number the export prints in the day cell's brackets.
ON_TIME_KIND = "23"
ABSENT_KIND = "26"
# The day cell's mark for a day nobody clocked, by absence kind (Safia's
# Verifix time kinds, `time_kind$list`): the export prints the kind's letter,
# and «X» for a plain «Отсутствие».
ABSENCE_MARK = {"26": "X", "28": "ПО", "29": "В", "30": "Б", "31": "О",
                "32": "К", "33": "ОТ", "221": "НО"}

# The file prints hours to two decimals (the parity check's tolerance).
EXACT_H = 0.011


class NotConfigured(Exception):
    """No Verifix login on the admin «Verifix» card."""


# ── small helpers ─────────────────────────────────────────────────────────────

def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _fnum(v: Any) -> Optional[float]:
    return None if v is None else float(v)


def _day(raw: Any) -> Optional[date]:
    try:
        return datetime.strptime(str(raw or "").strip()[:10], "%d.%m.%Y").date()
    except ValueError:
        return None


def _hhmm(raw: Any) -> Optional[str]:
    dt = verifix_live._dt(raw)
    return dt.strftime("%H:%M") if dt else None


def _two(v: float) -> str:
    """8.135 → «8.14»: the export rounds half up."""
    return str(Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _counted(db: Session) -> dict[str, tuple[str, int]]:
    """code key → (verifix code, cell id) of every cell counted in the загрузка."""
    out: dict[str, tuple[str, int]] = {}
    for cid, code in db.query(Cell.id, Cell.verifix_code).filter(Cell.in_load.is_(True)).all():
        if code:
            out[verifix._code_key(code)] = (code, cid)
    return out


def hours_rule(db: Session) -> dict:
    """The parity check's rule when it found one good enough, else the default."""
    f = verifix_live._formula(db)
    if f:
        return {"kinds": f["kinds"], "names": f["names"], "div": f["div"], "source": "parity"}
    return dict(DEFAULT_RULE)


# ── reading Verifix ───────────────────────────────────────────────────────────

def _directory(cfg: dict, deadline: float) -> dict:
    """Org units carrying a code, and every employee's org unit + dates."""
    key = ("vfx-attendance-dir", cfg["host"], cfg["filial_id"])

    def load() -> dict:
        units: dict[str, str] = {}
        emps: dict[str, tuple[str, Optional[date], Optional[date]]] = {}
        with verifix.client(cfg) as cl:
            for page in verifix.each_page(cl, "core/division$list", {"division_ids": []},
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for d in page:
                    code = str(d.get("code") or "").strip()
                    if code:
                        units[str(d.get("division_id") or "")] = verifix._code_key(code)
            body = {"employee_ids": [], "statuses": [], "npins": []}
            for page in verifix.each_page(cl, "core/employee$list", body,
                                          limit=verifix.LIMIT_LIST, deadline=deadline):
                for e in page:
                    eid = str(e.get("employee_id") or "")
                    if eid:
                        emps[eid] = (str(e.get("org_unit_id") or ""),
                                     _day(e.get("hiring_date")), _day(e.get("dismissal_date")))
        return {"units": units, "emps": emps}

    return verifix_live._cached(key, DIR_TTL, load)[0]


def _mark(facts: dict, d: dict) -> str:
    """The day cell's mark for a day nobody clocked."""
    other = [(v, k) for k, v in facts.items() if k in ABSENCE_MARK and k != ABSENT_KIND and v > 0]
    if other:
        return ABSENCE_MARK[max(other)[1]]
    if facts.get(ABSENT_KIND) or (d.get("day_kind") or "W") == "W":
        return "X"
    return "—"


def _row(rec: dict, d: dict, rule: dict) -> dict:
    """One report day → the fields the Excel parser stores for a worker."""
    schedule = rec.get("schedule_name") or ""
    facts: dict[str, float] = {}
    for f in d.get("facts") or []:
        k = str(f.get("time_kind_id") or "")
        v = _num(f.get("fact_value"))
        if k and v:
            facts[k] = facts.get(k, 0.0) + v
    t_in, t_out = _hhmm(d.get("input_time")), _hhmm(d.get("output_time"))
    hours = effective = None
    early = 0.0
    if t_in and t_out:
        clock = f"{t_in} - {t_out} ({_two(facts.get(ON_TIME_KIND, 0.0) / rule['div'])})"
        # Two decimals, as the export prints «Отработано».
        hours = float(_two(sum(facts.get(k, 0.0) for k in rule["kinds"]) / rule["div"]))
        status = "worked"
        early = clock_metrics(schedule, clock)[3]
        effective = round(hours - early / 60, 4)
    elif t_in or t_out:
        clock = status = f"{t_in or 'xx:xx'} - {t_out or 'xx:xx'}"
    else:
        clock = status = _mark(facts, d)
    return {
        "worker_name": rec.get("employee_name") or "",
        "job_title": rec.get("job_name") or "",
        "schedule": schedule,
        "clock_in_out": clock,
        "hours_worked": hours,
        "early_arrival_min": early,
        "effective_hours": effective,
        "status": status,
    }


def fetch_day(db: Session, day: date, by: str = "") -> dict:
    """Read one day from Verifix for the counted cells and store it, replacing
    what an earlier read stored. Raises NotConfigured / verifix.VerifixError."""
    cfg = verifix.config(db, with_password=True)
    if not (cfg["login"] and cfg.get("password") and cfg["filial_id"]):
        raise NotConfigured()
    counted = _counted(db)
    rule = hours_rule(db)
    # One budget for the whole request, so it answers inside Cloudflare's 100 s.
    deadline = _time.monotonic() + verifix.BUDGET_S

    rows: list[dict] = []
    partial = False
    if counted:
        directory = _directory(cfg, deadline)
        units, emps = directory["units"], directory["emps"]
        ids: dict[int, str] = {}
        for eid, (unit, hired, dismissed) in emps.items():
            key = units.get(unit)
            if key not in counted or not eid.isdigit():
                continue
            if (hired and hired > day) or (dismissed and dismissed < day):
                continue
            ids[int(eid)] = key
        # An empty employee filter means EVERYBODY — never send one.
        chunks = [sorted(ids)[i:i + ID_CHUNK] for i in range(0, len(ids), ID_CHUNK)]
        try:
            with verifix.client(cfg) as cl:
                for chunk in chunks:
                    body = {"period_begin_date": verifix._dmy(day),
                            "period_end_date": verifix._dmy(day),
                            "division_ids": [], "employee_ids": chunk}
                    for page in verifix.each_page(cl, "core/timesheet$export", body,
                                                  limit=verifix.LIMIT_TIMESHEET, deadline=deadline):
                        for rec in page:
                            eid = str(rec.get("employee_id") or "")
                            key = ids.get(int(eid)) if eid.isdigit() else None
                            if key is None:
                                continue
                            for d in rec.get("days") or []:
                                if _day(d.get("date")) == day:
                                    rows.append({"code": counted[key][0], "employee_id": eid,
                                                 **_row(rec, d, rule)})
        except verifix.VerifixError as exc:
            # Out of time with rows in hand: keep them and say the day is partial.
            if exc.code != "slow" or not rows:
                raise
            partial = True

    vday = db.query(VerifixAttendanceDay).filter(VerifixAttendanceDay.date == day).first()
    if vday is None:
        vday = VerifixAttendanceDay(date=day)
        db.add(vday)
        db.flush()
    else:
        db.query(VerifixAttendanceRow).filter(VerifixAttendanceRow.day_id == vday.id).delete(
            synchronize_session=False)
    vday.fetched_at = datetime.now(timezone.utc)
    vday.fetched_by_name = by or None
    vday.partial = partial
    vday.codes = sorted(code for code, _ in counted.values())
    vday.hours_rule = rule
    for r in rows:
        db.add(VerifixAttendanceRow(
            day_id=vday.id, verifix_code=r["code"], employee_id=r["employee_id"],
            worker_name=r["worker_name"], job_title=r["job_title"], schedule=r["schedule"],
            clock_in_out=r["clock_in_out"], hours_worked=r["hours_worked"],
            early_arrival_min=r["early_arrival_min"], effective_hours=r["effective_hours"],
            status=r["status"],
        ))
    db.commit()
    return {"cells": len(counted), "rows": len(rows), "partial": partial}


# ── the page's payload ────────────────────────────────────────────────────────

def _file_side(db: Session, day: date, keys: set) -> Optional[list]:
    """The «Davomat» rows of the day in these cells, or None when the day has no
    uploaded file at all (nothing to compare with)."""
    batch = db.query(AttendanceBatch.id).filter(AttendanceBatch.date == day).first()
    if batch is None:
        return None
    out = []
    for r in db.query(AttendanceBatchRow).filter(AttendanceBatchRow.batch_id == batch[0]).all():
        k = verifix._code_key(r.verifix_code) if r.verifix_code else None
        if k in keys:
            out.append(r)
    return out


def _same(v: dict, f: dict) -> bool:
    vh, fh = v["hours_worked"], f["hours"]
    if vh is None or fh is None:
        return vh is None and fh is None and (v["status"] or "") == (f["status"] or "")
    return abs(vh - fh) <= EXACT_H


def _match(vrows: list[dict], frows: list[dict]) -> None:
    """Pair each Verifix row with the file's row for the same person — in the
    same cell first, then anywhere in the day (a person whose org unit moved) —
    by folded full name, else surname + first name when exactly one answers."""
    for v in vrows:
        v["_full"], v["_two"] = verifix_parity._keys(v["worker_name"])
    for f in frows:
        f["_full"], f["_two"] = verifix_parity._keys(f["worker_name"])
    free = set(range(len(frows)))

    def pick(v: dict, pool: list[int]) -> Optional[int]:
        hits = [i for i in pool if frows[i]["_full"] == v["_full"]]
        if len(hits) != 1:
            alt = [i for i in pool if frows[i]["_two"] == v["_two"]]
            hits = alt if not hits or len(alt) == 1 else hits
        return hits[0] if len(hits) == 1 else None

    by_cell: dict[str, list[int]] = defaultdict(list)
    for i, f in enumerate(frows):
        by_cell[f["key"]].append(i)
    for anywhere in (False, True):
        for v in vrows:
            if v.get("file") is not None:
                continue
            pool = [i for i in (range(len(frows)) if anywhere else by_cell.get(v["key"], []))
                    if i in free]
            i = pick(v, pool)
            if i is None:
                continue
            free.discard(i)
            f = frows[i]
            v["file"] = {"hours": f["hours"], "clock": f["clock"], "status": f["status"],
                         "cell": f["code"] if f["key"] != v["key"] else None}
            v["same"] = _same(v, v["file"]) and f["key"] == v["key"]
    for i in sorted(free):
        frows[i]["_unmatched"] = True


def payload(db: Session, day: date) -> dict:
    counted_now = _counted(db)
    cfg = verifix.config(db)
    base = {
        "date": day.isoformat(),
        "configured": bool(cfg["login"] and cfg["password_set"] and cfg["filial_id"]),
        "cells_counted": len(counted_now),
    }
    vday = db.query(VerifixAttendanceDay).filter(VerifixAttendanceDay.date == day).first()
    if vday is None:
        return {**base, "status": "none"}

    keys = {verifix._code_key(c) for c in (vday.codes or [])}
    registry = {verifix._code_key(c.verifix_code): c
                for c in db.query(Cell).filter(Cell.verifix_code.isnot(None)).all()}
    vrows = [{
        "id": r.id, "key": verifix._code_key(r.verifix_code), "code": r.verifix_code,
        "worker_name": r.worker_name, "job_title": r.job_title, "schedule": r.schedule,
        "clock_in_out": r.clock_in_out, "hours_worked": _fnum(r.hours_worked),
        "early_arrival_min": _fnum(r.early_arrival_min),
        "effective_hours": _fnum(r.effective_hours), "status": r.status,
        "counted": is_direct_role(r.job_title, r.hours_worked),
        "file": None, "same": None,
    } for r in vday.rows]
    file_rows = _file_side(db, day, keys)
    frows = [{
        "id": f"f{r.id}", "key": verifix._code_key(r.verifix_code), "code": r.verifix_code,
        "worker_name": r.worker_name, "job_title": r.job_title, "schedule": r.schedule,
        "clock": r.clock_in_out, "hours": _fnum(r.hours_worked), "status": r.status,
    } for r in (file_rows or [])]
    if file_rows is not None:
        _match(vrows, frows)

    def counted(job, hours) -> bool:
        return is_direct_role(job, hours)

    by_key: dict[str, dict] = {}

    def cell_of(key: str, code: str) -> dict:
        c = by_key.get(key)
        if c is None:
            reg = registry.get(key)
            c = by_key[key] = {
                "verifix_code": reg.verifix_code if reg else code,
                "cell_id": reg.id if reg else None,
                "manager_id": reg.manager_id if reg else None,
                "included": True, "moved": False, "pending": False, "conflicts": 0,
                "rows": [], "file_rows": [],
            }
        return c

    for v in vrows:
        cell_of(v["key"], v["code"])["rows"].append(v)
    for f in frows:
        if f.get("_unmatched"):
            cell_of(f["key"], f["code"])["file_rows"].append(f)

    def strip(r: dict) -> dict:
        return {k: v for k, v in r.items() if not k.startswith("_") and k != "key"}

    cells = []
    for key, c in by_key.items():
        vr = c["rows"]
        on = [r for r in vr if r["counted"]]
        c["workers"], c["present"] = len(vr), len(on)
        c["hours"] = round(sum(r["hours_worked"] or 0 for r in on), 2)
        if file_rows is None:
            c["excel"] = None
        else:
            fr = [f for f in frows if f["key"] == key]
            fon = [f for f in fr if counted(f["job_title"], f["hours"])]
            c["excel"] = {"workers": len(fr), "present": len(fon),
                          "hours": round(sum(f["hours"] or 0 for f in fon), 2)}
        c["differ"] = sum(1 for r in vr if r["same"] is False or (file_rows is not None and r["file"] is None))
        c["differ"] += len(c["file_rows"])
        c["rows"] = [strip(r) for r in sorted(vr, key=lambda r: (r["worker_name"] or "").lower())]
        c["file_rows"] = [strip({**f, "file_only": True})
                          for f in sorted(c["file_rows"], key=lambda r: (r["worker_name"] or "").lower())]
        cells.append(c)
    cells.sort(key=lambda c: str(c["verifix_code"] or "zzz"))

    managers = {m.id: m for m in db.query(Manager).all()}
    sections: dict[int, list] = defaultdict(list)
    unassigned = []
    for c in cells:
        if c["manager_id"] in managers:
            sections[c["manager_id"]].append(c)
        else:
            c["manager_id"] = None
            unassigned.append(c)

    def totals(cs: list) -> dict:
        return {"cells": len(cs), "included": len(cs),
                "workers": sum(c["workers"] for c in cs),
                "present": sum(c["present"] for c in cs),
                "hours": round(sum(c["hours"] for c in cs), 2), "pending": 0}

    out_sections = []
    for mid, cs in sections.items():
        m = managers[mid]
        state, _closure, _counts = day_state(db, mid, day)
        out_sections.append({"manager_id": mid, "manager_name": m.name, "shift": m.shift,
                             "archived": bool(m.archived), "day_state": state,
                             "cells": cs, "totals": totals(cs)})
    out_sections.sort(key=lambda s: (s["manager_name"] or "").lower())

    matched = [v for v in vrows if v["file"] is not None]
    return {
        **base,
        "status": "partial" if vday.partial else "fetched",
        "fetched_at": vday.fetched_at.isoformat() if vday.fetched_at else None,
        "fetched_by": vday.fetched_by_name,
        "cells_asked": len(keys),
        "hours_rule": vday.hours_rule,
        "excel": file_rows is not None,
        "sections": out_sections,
        "unassigned": unassigned,
        "totals": {
            **totals(cells),
            "supervisors": len(out_sections), "unassigned": len(unassigned),
            "counted": sum(c["present"] for c in cells),
            "excel_workers": len(frows) if file_rows is not None else None,
            "excel_counted": (sum(1 for f in frows if counted(f["job_title"], f["hours"]))
                              if file_rows is not None else None),
            "excel_hours": (round(sum(f["hours"] or 0 for f in frows
                                      if counted(f["job_title"], f["hours"])), 2)
                            if file_rows is not None else None),
            "matched": len(matched),
            "same": sum(1 for v in matched if v["same"]),
            "only_verifix": (sum(1 for v in vrows if v["file"] is None)
                             if file_rows is not None else None),
            "only_excel": (sum(1 for f in frows if f.get("_unmatched"))
                           if file_rows is not None else None),
        },
    }
