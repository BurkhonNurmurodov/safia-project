"""The «Davomat» day read from Verifix — the source of the admin «Davomat» tab
from 2026-10-04 (the operator: «no more Excel documents for the загрузка»).

The tab used to take the day's «Отчёт по посещениям сотрудников» Excel. Its one
button now reads Verifix's API — `core/timesheet$export`, the very report that
Excel was exported from — for the cells picked in a plant → shift → brigadir →
cell tree (`pick`) of the cells counted in the загрузка («Zagruzkada
hisoblanadi», `cells.in_load`), and hands back rows in the SHAPE the Excel
parser produced (`attendance_sheet.parse_attendance_workbook`). The router
(`routers/attendance_batch.py`, `POST /verifix`) merges them into the day's
batch exactly as it merged a file, so routing, ticks, admin edits, the per-read
undo and Save are the file flow's own and did not change.

**A row is built the way the parser built one** (`attendance_sheet`):

* placed in a cell by the employee's CURRENT org unit («отдел»), whose code is
  the cell's verifix code (the connection test, 2026-10-01) — the Excel was an
  export taken the next morning, so it placed people the same way;
* the day cell = the report's `input_time` – `output_time` with «Явка» in
  brackets, «08:01 - 17:13 (8.14)», exactly as the export prints it; «xx:xx»
  stands for a missing side, and such a row has no hours, as in the file;
* hours = «Отработано» = «Явка» + «Свободное время» in minutes (the 1 Oct dump:
  exact for 1,155 of 1,156 worked rows), unless the parity check found a rule
  of its own (`verifix_live._formula`);
* nobody clocked → the day cell's mark: the absence kind's letter («О» =
  «Отгул»), «X» for a plain «Отсутствие»;
* early arrival and effective hours by `clock_metrics`, the parser's own.

Who is asked about: every employee — any status — whose org unit names a picked
cell and who was hired by the day and not dismissed before it, so a past day
still finds the people who have left since.

**Out of time** (`verifix.BUDGET_S`), a cell counts as read only when every
person asked about in it came back. A cell Verifix did not finish is NOT read:
the rows that did come for it are dropped and the day keeps whatever it already
held for that cell — this is real attendance, and a cell holding half its
people would reach the supervisor's numbers on the next Save. The tab names
those cells and offers them again in one press.

Proven against the uploaded Excel before the switch, on the «Davomat
(Verifix)» test tab (1–4 Oct 2026, removed with the switch): 1,470 of 1,475
people identical on the 1 Oct dump, 1,486 of 1,497 on the first production
read; every difference left was Verifix being newer than the export (a moved
department, a mark removed after it was taken).
"""
from __future__ import annotations

import logging
import time as _time
from collections import defaultdict
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import Cell, Factory, Manager, RoleProfile
from app.services import verifix, verifix_live, verifix_parity
from app.services.attendance_sheet import clock_metrics

log = logging.getLogger(__name__)

# Divisions + employees: several days are often read one after another.
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


class NotConfigured(Exception):
    """No Verifix login on the admin «Verifix» card."""


class NoCells(Exception):
    """The read names no cell that is counted in the загрузка."""


# ── small helpers ─────────────────────────────────────────────────────────────

def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


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


def counted(db: Session) -> dict[str, tuple[str, int]]:
    """code key → (verifix code, cell id) of every cell counted in the загрузка
    — the cells the tab offers and reads."""
    out: dict[str, tuple[str, int]] = {}
    for cid, code in db.query(Cell.id, Cell.verifix_code).filter(Cell.in_load.is_(True)).all():
        if code:
            out[verifix._code_key(code)] = (code, cid)
    return out


def configured(db: Session) -> bool:
    cfg = verifix.config(db)
    return bool(cfg["login"] and cfg["password_set"] and cfg["filial_id"])


def hours_rule(db: Session) -> dict:
    """The parity check's rule when it found one good enough, else the default."""
    f = verifix_live._formula(db)
    if f:
        return {"kinds": f["kinds"], "names": f["names"], "div": f["div"], "source": "parity"}
    return dict(DEFAULT_RULE)


def pick(db: Session, reads: dict[str, dict]) -> dict:
    """What the «Verifix'dan olish» picker offers: every cell counted in the
    загрузка, with the plant, shift and brigadir it nests under (a cell follows
    its brigadir's unit, the platform's one rule for the plant) and `read` —
    when the day on screen last took it in (code key → {at, source}), handed in
    by the router off the day's batch."""
    managers = {m.id: m for m in db.query(Manager).all()}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name)
                   .filter(RoleProfile.role == "leader").all())
    cells = []
    for c in db.query(Cell).filter(Cell.in_load.is_(True)).order_by(Cell.verifix_code).all():
        if not c.verifix_code:
            continue
        m = managers.get(c.manager_id)
        cells.append({
            "code": c.verifix_code,
            "manager_id": m.id if m else None,
            "manager_name": m.name if m else None,
            "shift": m.shift if m else None,
            "factory_id": m.factory_id if m else None,
            "leader": leaders.get(c.leader_id),
            "archived": c.archived_at is not None,
            "read": reads.get(verifix._code_key(c.verifix_code)),
        })
    factories = [{"id": f.id, "code": f.code, "name_uz": f.name_uz, "name_uz_cyrl": f.name_uz_cyrl,
                  "name_ru": f.name_ru, "name_en": f.name_en}
                 for f in db.query(Factory).order_by(Factory.sort_order, Factory.id).all()]
    return {"configured": configured(db), "cells": cells, "factories": factories}


# ── reading Verifix ───────────────────────────────────────────────────────────

def _directory(cfg: dict, deadline: float) -> dict:
    """Org units carrying a code, and every employee's org unit, dates, folded
    name keys and status — (unit, hired, dismissed, full, two, status)."""
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
                        name = " ".join(str(x).strip() for x in (
                            e.get("last_name"), e.get("first_name"), e.get("middle_name")) if x)
                        full, two = verifix_parity._keys(name)
                        emps[eid] = (str(e.get("org_unit_id") or ""),
                                     _day(e.get("hiring_date")), _day(e.get("dismissal_date")),
                                     full, two, str(e.get("status") or ""))
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


def read_day(db: Session, day: date, codes: Optional[list] = None) -> dict:
    """Read one day from Verifix for the picked cells — every counted cell when
    `codes` is None. Raises NotConfigured / NoCells / verifix.VerifixError.

    Returns {rows, read, unread, rule, asked}: `rows` in the Excel parser's
    shape (each with its `verifix_code`), for the `read` cells only; `read` =
    the codes Verifix answered for in full — what the caller replaces, empty
    cells included; `unread` = the codes a read out of time did not finish,
    which the caller must leave exactly as they are."""
    cfg = verifix.config(db, with_password=True)
    if not (cfg["login"] and cfg.get("password") and cfg["filial_id"]):
        raise NotConfigured()
    cells = counted(db)
    if codes is None:
        asked = cells
    else:
        want = {verifix._code_key(c) for c in codes if str(c or "").strip()}
        asked = {k: v for k, v in cells.items() if k in want}
    if not asked:
        raise NoCells()
    rule = hours_rule(db)
    # One budget for the whole request, so it answers inside Cloudflare's 100 s.
    deadline = _time.monotonic() + verifix.BUDGET_S

    directory = _directory(cfg, deadline)
    units, emps = directory["units"], directory["emps"]
    ids: dict[int, str] = {}
    for eid, (unit, hired, dismissed, *_rest) in emps.items():
        key = units.get(unit)
        if key not in asked or not eid.isdigit():
            continue
        if (hired and hired > day) or (dismissed and dismissed < day):
            continue
        ids[int(eid)] = key

    rows: dict[str, list[dict]] = defaultdict(list)
    returned: set[int] = set()
    partial = False
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
                        returned.add(int(eid))
                        for d in rec.get("days") or []:
                            if _day(d.get("date")) == day:
                                rows[key].append({"verifix_code": asked[key][0], **_row(rec, d, rule)})
    except verifix.VerifixError as exc:
        # Out of time with rows in hand: keep the cells it finished, name the rest.
        if exc.code != "slow" or not rows:
            raise
        partial = True

    # Out of time, a cell is read only if every person asked about came back
    # (see the docstring) — a cell nobody stands in is read, and empty.
    unread: set[str] = set()
    if partial:
        people: dict[str, set[int]] = defaultdict(set)
        for eid, key in ids.items():
            people[key].add(eid)
        unread = {k for k, e in people.items() if e - returned}
    done = set(asked) - unread
    return {
        "rows": [r for k in done for r in rows.get(k, [])],
        "read": sorted(asked[k][0] for k in done),
        "unread": sorted(asked[k][0] for k in unread),
        "rule": rule,
        "asked": len(asked),
    }
