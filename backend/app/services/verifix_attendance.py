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

**A read names its cells** (the picker, 2026-10-04): the button opens a plant →
shift → brigadir → cell tree of the counted cells (`pick`), and the read asks
Verifix about the ticked ones only. It replaces THOSE cells' rows and leaves
every other cell already read for the day as it was, so one cell can be read
again without reading the plant. `cell_reads` says when each cell was last
read and whether that read ran out of time — the day is partial while any
cell is.
"""
from __future__ import annotations

import logging
import re
import time as _time
from collections import Counter, defaultdict
from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    AttendanceBatch, AttendanceBatchRow, Cell, EditRequest, Factory, HrDocument, Manager,
    RoleProfile, VerifixAttendanceDay, VerifixAttendanceRow,
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

# «07:55 - 17:02 (8.4)» / «08:00 - xx:xx» → the two sides, a missing one as None.
_PAIR_RE = re.compile(r"(\d{1,2}:\d{2}|xx:xx)\s*[-–—]\s*(\d{1,2}:\d{2}|xx:xx)")
# A day cell that is a MARK — «X», «О», or «О (07:59 - 17:07)», an absence the
# export printed over the clocks (and counted no hours for).
_MARK_RE = re.compile(r"^\s*(?!xx:)([^\d\s(]+)")


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


def _reads(vday: Optional[VerifixAttendanceDay]) -> dict[str, dict]:
    """code key → {code, at, by, partial}: when each cell of the day was last
    read. A day read before cells could be picked carries no `cell_reads` —
    every code it asked about was read then, in that one pass."""
    if vday is None:
        return {}
    if vday.cell_reads is not None:
        return {verifix._code_key(k): dict(v) for k, v in vday.cell_reads.items()}
    at = vday.fetched_at.isoformat() if vday.fetched_at else None
    return {verifix._code_key(c): {"code": c, "at": at, "by": vday.fetched_by_name,
                                   "partial": bool(vday.partial)}
            for c in (vday.codes or [])}


def pick(db: Session, reads: dict[str, dict]) -> dict:
    """What the «Verifix'dan olish» picker offers: every cell counted in the
    загрузка, with the plant, shift and brigadir it nests under (a cell follows
    its brigadir's unit, the platform's one rule for the plant) and when it was
    last read for the day on screen."""
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
    return {"cells": cells, "factories": factories}


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


def fetch_day(db: Session, day: date, by: str = "", codes: Optional[list] = None) -> dict:
    """Read one day from Verifix for the picked cells — every counted cell when
    `codes` is None — and store them, replacing what an earlier read stored for
    THOSE cells; the day's other cells stay. Raises NotConfigured / NoCells /
    verifix.VerifixError."""
    cfg = verifix.config(db, with_password=True)
    if not (cfg["login"] and cfg.get("password") and cfg["filial_id"]):
        raise NotConfigured()
    counted = _counted(db)
    if codes is None:
        asked = counted
    else:
        want = {verifix._code_key(c) for c in codes if str(c or "").strip()}
        asked = {k: v for k, v in counted.items() if k in want}
    if not asked:
        raise NoCells()
    rule = hours_rule(db)
    # One budget for the whole request, so it answers inside Cloudflare's 100 s.
    deadline = _time.monotonic() + verifix.BUDGET_S

    rows: list[dict] = []
    returned: set[int] = set()
    partial = False
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
                                rows.append({"code": asked[key][0], "employee_id": eid,
                                             **_row(rec, d, rule)})
    except verifix.VerifixError as exc:
        # Out of time with rows in hand: keep them and say the day is partial.
        if exc.code != "slow" or not rows:
            raise
        partial = True
    # Out of time, a cell is judged by its own people: all of them came back →
    # read whole; some → read PARTIALLY; none (time ran out before its page) →
    # not read at all, and whatever an earlier read stored for it stays.
    untouched: set[str] = set()
    partial_keys: set[str] = set()
    if partial:
        people: dict[str, set[int]] = defaultdict(set)
        for eid, key in ids.items():
            people[key].add(eid)
        untouched = {k for k, e in people.items() if not (e & returned)}
        partial_keys = {k for k, e in people.items() if e - returned} - untouched
    done = {k: v for k, v in asked.items() if k not in untouched}

    now = datetime.now(timezone.utc)
    vday = db.query(VerifixAttendanceDay).filter(VerifixAttendanceDay.date == day).first()
    if vday is None:
        vday = VerifixAttendanceDay(date=day)
        db.add(vday)
        db.flush()
    # Read before anything moves: a day stored before cells could be picked is
    # seeded from its own columns.
    reads = _reads(vday)
    stored = set(reads)
    # The cells read now lose their earlier rows; every other cell's stay.
    stale = [rid for rid, code in (db.query(VerifixAttendanceRow.id, VerifixAttendanceRow.verifix_code)
                                   .filter(VerifixAttendanceRow.day_id == vday.id).all())
             if code and verifix._code_key(code) in done]
    if stale:
        db.query(VerifixAttendanceRow).filter(VerifixAttendanceRow.id.in_(stale)).delete(
            synchronize_session=False)
    for key, (code, _cid) in done.items():
        reads[key] = {"code": code, "at": now.isoformat(), "by": by or None,
                      "partial": key in partial_keys}
    vday.cell_reads = reads
    vday.codes = sorted({r["code"] for r in reads.values() if r.get("code")})
    vday.partial = any(r.get("partial") for r in reads.values())
    vday.fetched_at = now
    vday.fetched_by_name = by or None
    vday.hours_rule = rule
    vday.notes = {**(vday.notes or {}),
                  **_file_only_notes(db, day, done, counted, stored, rows, directory)}
    for r in rows:
        db.add(VerifixAttendanceRow(
            day_id=vday.id, verifix_code=r["code"], employee_id=r["employee_id"],
            worker_name=r["worker_name"], job_title=r["job_title"], schedule=r["schedule"],
            clock_in_out=r["clock_in_out"], hours_worked=r["hours_worked"],
            early_arrival_min=r["early_arrival_min"], effective_hours=r["effective_hours"],
            status=r["status"],
        ))
    db.commit()
    return {"cells": len(done), "rows": len(rows), "partial": partial,
            "partial_cells": len(partial_keys), "unread_cells": len(untouched)}


def _file_only_notes(db: Session, day: date, asked: dict, counted: dict, stored: set,
                     rows: list, directory: Optional[dict]) -> dict:
    """Why the read did not return somebody the uploaded Excel has in a cell it
    asked about: where Verifix placed them at the read. Folded name →
    {why, code, date}. `stored` = the cells read for the day before this read."""
    if not directory:
        return {}
    frows = _file_side(db, day, set(asked)) or []
    got_full = {verifix_parity._keys(r["worker_name"])[0] for r in rows}
    got_two = Counter(verifix_parity._keys(r["worker_name"])[1] for r in rows)
    units, emps = directory["units"], directory["emps"]
    by_full: dict[str, list] = defaultdict(list)
    by_two: dict[str, list] = defaultdict(list)
    for eid, e in emps.items():
        by_full[e[3]].append(eid)
        by_two[e[4]].append(eid)
    registry = {verifix._code_key(c): c for (c,) in db.query(Cell.verifix_code).all() if c}
    out: dict[str, dict] = {}
    for f in frows:
        full, two = verifix_parity._keys(f.worker_name or "")
        if full in got_full or got_two.get(two) == 1:
            continue
        cands = by_full.get(full) or []
        if len(cands) != 1:
            alt = by_two.get(two) or []
            cands = alt if not cands or len(alt) == 1 else cands
        if len(cands) != 1:
            out[full] = {"why": "vfx_missing" if not cands else "vfx_ambiguous"}
            continue
        unit, hired, dismissed, _f, _t, _st = emps[cands[0]]
        key = units.get(unit)
        note: dict = {}
        if dismissed and dismissed < day:
            note = {"why": "vfx_dismissed", "date": dismissed.isoformat()}
        elif hired and hired > day:
            note = {"why": "vfx_hired_later", "date": hired.isoformat()}
        elif key is None:
            note = {"why": "vfx_no_cell"}
        elif key not in counted:
            note = {"why": "vfx_other_cell", "code": registry.get(key, key)}
        elif key not in asked and key not in stored:
            # A counted cell nobody has read for this day: reading it finds them.
            note = {"why": "vfx_unread_cell", "code": registry.get(key, key)}
        else:
            note = {"why": "vfx_no_day"}
        out[full] = note
    return out


def _events(db: Session, day: date) -> dict:
    """The platform's own changes to that day, by folded worker name: approved
    people exchanges and role changes (/staff documents) and approved edit
    requests. They change `attendance` — never the uploaded rows this page
    compares with — and are shown beside a difference for that reason."""
    names = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    out: dict[str, list] = defaultdict(list)
    docs = (db.query(HrDocument)
            .filter(HrDocument.date == day, HrDocument.status == "approved",
                    HrDocument.doc_type.in_(("people_exchange", "role_change"))).all())
    for doc in docs:
        p = doc.payload or {}
        for e in p.get("employees") or []:
            full = verifix_parity._keys(e.get("worker_name") or "")[0]
            if doc.doc_type == "people_exchange":
                task = p.get("target_type") == "task"
                out[full].append({"kind": "exchange", "doc": doc.id, "task": task,
                                  "to": p.get("task_name") if task else p.get("target_manager_name"),
                                  "from": names.get(e.get("old_manager_id")),
                                  "time": p.get("transfer_time")})
            else:
                out[full].append({"kind": "role", "doc": doc.id,
                                  "role": p.get("new_role"), "old": e.get("old_role")})
    for er in (db.query(EditRequest)
               .filter(EditRequest.date == day, EditRequest.status == "approved").all()):
        full = verifix_parity._keys(er.worker_name or "")[0]
        out[full].append({"kind": "edit", "id": er.id, "fields": sorted((er.changes or {}).keys())})
    return out


def _sides(clock: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    m = _PAIR_RE.search(clock or "")
    if not m:
        return None, None
    return tuple(None if x == "xx:xx" else x for x in (m.group(1), m.group(2)))


def _mark_of(clock: Optional[str]) -> Optional[str]:
    """The mark a day cell carries («X», «О»…), None for a clock."""
    m = _MARK_RE.match(clock or "")
    return m.group(1) if m else None


def _reasons(v: dict, f: dict) -> list:
    """What differs between a Verifix row and the Excel row it was matched to."""
    out: list = []
    if f.get("cell"):
        out.append(["moved", f["cell"]])
    if f.get("manual"):
        out.append(["manual", None])
    elif f.get("edited"):
        out.append(["edited", None])
    if not _same(v, f):
        vin, vout = _sides(v["clock_in_out"])
        fin, fout = _sides(f["clock"])
        v_any, f_any = bool(vin or vout), bool(fin or fout)
        v_full, f_full = bool(vin and vout), bool(fin and fout)
        vm, fm = _mark_of(v["clock_in_out"]), _mark_of(f["clock"])
        if vm != fm:
            out.append(["mark", f"{fm or '—'} → {vm or '—'}"])
        elif v_any != f_any:
            out.append(["came", None])
        elif v_full and not f_full:
            out.append(["filled", None])
        elif f_full and not v_full:
            out.append(["unfilled", None])
        elif v_full and (vin, vout) != (fin, fout):
            out.append(["clock", None])
        elif v_full:
            out.append(["hours", None])
        else:
            out.append(["mark", None])
    return out or [["unknown", None]]


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
                         "cell": f["code"] if f["key"] != v["key"] else None,
                         "edited": f["edited"], "manual": f["manual"]}
            v["same"] = _same(v, v["file"]) and f["key"] == v["key"]
    for i in sorted(free):
        frows[i]["_unmatched"] = True


def payload(db: Session, day: date) -> dict:
    counted_now = _counted(db)
    cfg = verifix.config(db)
    vday = db.query(VerifixAttendanceDay).filter(VerifixAttendanceDay.date == day).first()
    reads = _reads(vday)
    base = {
        "date": day.isoformat(),
        "configured": bool(cfg["login"] and cfg["password_set"] and cfg["filial_id"]),
        "cells_counted": len(counted_now),
        "pick": pick(db, reads),
    }
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
        "edited": bool(r.edited), "manual": bool(r.manual),
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
        c["read"] = reads.get(key)
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

    # Every person on whom the two sides disagree, with what differs and the
    # platform's own changes to that person's day.
    diffs: list = []
    if file_rows is not None:
        events = _events(db, day)
        notes = vday.notes or {}
        # Where the Excel has somebody it does not put in a counted cell.
        elsewhere: dict[str, str] = {}
        batch = db.query(AttendanceBatch.id).filter(AttendanceBatch.date == day).first()
        if batch:
            for name, code in (db.query(AttendanceBatchRow.worker_name, AttendanceBatchRow.verifix_code)
                               .filter(AttendanceBatchRow.batch_id == batch[0]).all()):
                if (verifix._code_key(code) if code else None) not in keys:
                    elsewhere.setdefault(verifix_parity._keys(name or "")[0], code or "—")

        def show(key: str, code: str) -> str:
            reg = registry.get(key)
            return reg.verifix_code if reg else code

        for v in vrows:
            if v["file"] is None:
                other = elsewhere.get(v["_full"])
                why = [["excel_other", other]] if other else [["not_in_excel", None]]
            elif v["same"]:
                continue
            else:
                why = _reasons(v, v["file"])
            f = v["file"]
            diffs.append({
                "id": v["id"], "worker_name": v["worker_name"], "code": show(v["key"], v["code"]),
                "vfx": {"clock": v["clock_in_out"], "hours": v["hours_worked"], "status": v["status"]},
                "excel": ({"clock": f["clock"], "hours": f["hours"], "status": f["status"],
                           "code": f["cell"]} if f else None),
                "why": why, "events": events.get(v["_full"], []),
            })
        for f in frows:
            if not f.get("_unmatched"):
                continue
            n = notes.get(f["_full"])
            # «In a cell nobody has read» stops being true once that cell is read.
            if n and n.get("why") == "vfx_unread_cell" and verifix._code_key(n.get("code")) in reads:
                n = {"why": "vfx_no_day"}
            diffs.append({
                "id": f["id"], "worker_name": f["worker_name"], "code": show(f["key"], f["code"]),
                "vfx": None,
                "excel": {"clock": f["clock"], "hours": f["hours"], "status": f["status"], "code": None},
                "why": [[n["why"], n.get("code") or n.get("date")]] if n else [["vfx_unknown", None]],
                "events": events.get(f["_full"], []),
            })
        diffs.sort(key=lambda d: (str(d["code"] or ""), (d["worker_name"] or "").lower()))

    matched = [v for v in vrows if v["file"] is not None]
    return {
        **base,
        "status": "partial" if vday.partial else "fetched",
        "fetched_at": vday.fetched_at.isoformat() if vday.fetched_at else None,
        "fetched_by": vday.fetched_by_name,
        "cells_asked": len(keys),
        # The cells whose last read ran out of time — what «read them again» picks.
        "partial_codes": sorted(r["code"] for r in reads.values() if r.get("partial") and r.get("code")),
        "hours_rule": vday.hours_rule,
        "excel": file_rows is not None,
        "sections": out_sections,
        "unassigned": unassigned,
        "diffs": diffs,
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
