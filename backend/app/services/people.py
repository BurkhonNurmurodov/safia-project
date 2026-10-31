"""«Xodim kartasi» — ONE person of the plant, everything the platform knows
about them (/people/:employee_id, routers/people.py).

Identity is the Verifix EMPLOYEE ID (`turnover_people.employee_id`, the id the
23:40 directory read keeps) — never a name: names collide (the «Suvonov
Elshod» pair; a common surname + first name + patronymic repeats).

Nothing here measures anything new. Every figure is read through the module
that already owns it: the directory (`turnover_people`, `turnover_leavers`),
the HR journals (`category_compliance.events_by_person`, its Ladder for the
category the tenure expects), attendance under /workers' own predicates
(`routers.workers._py_came` / `_py_on_leave` — imported, not re-spelled), the
cells register (`turnover.cell_map`), the exchange documents (`hr_documents`
and `live_documents`, the Movements tab's union), the «Ish grafigi» marks
(`kelish_marks`, keyed by `kelish.worker_key`), the cell concerns
(`leader_concerns.worker_name`) and a live day still being worked
(`live_staff.person` over the stored Verifix read).

ATTENDANCE IS NAME-KEYED, AND THAT IS STATED, NOT HIDDEN. An `attendance` row
carries the worker's name and no Verifix id — the Excel never had one, and the
close's copy of a live day keeps the shape. So a closed day is matched by the
folded name (`kelish.worker_key`, the «Ish grafigi» identity). Where the
directory holds a NAMESAKE (another employee id folding to the same key) a
name-matched row is attributed only when its cell is this person's own
placement that day — the live read's cell (`emps[eid].c`, id-keyed) from
`live_day.LIVE_FROM`, the HR journals' placement before it — and no namesake
stood there; anything else is WITHHELD and counted, never guessed. The day
still being worked is read by id from the stored live read.

Privacy: name, job, unit, cell, dates, category and attendance — nothing else.
Gender, birth month, address, phone, passport, PINFL, family and wages are not
read here at all.
"""
from __future__ import annotations

import logging
import re
import threading
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models import (
    Assessment, AssessmentCandidate, Attendance, Cell, EmployeeHonour, HrDocument,
    KelishMark, LeaderConcern, LiveDocument, Manager, RoleProfile, TurnoverLeaver,
    TurnoverPerson, TurnoverRead,
)
from app.services import turnover as tv
from app.services.kelish import worker_key
from app.services.live_day import LIVE_FROM
from app.translit import transliterate

log = logging.getLogger(__name__)

HONOUR_KINDS = ("monthly_best", "kaizen", "safety", "thanks", "other")
FEED_DAYS = 365          # «Oxirgi voqealar» looks this far back
FEED_MAX = 200           # …and lists at most this many
RUN_MIN = 3              # a cell run shorter than this is not «Yacheyka tarixi»
CELLS_FROM = date(2026, 8, 1)   # before it every attendance row is cell-less
SPARK_WEEKS = 7
TITLE_MAX = 160
NOTE_MAX = 1000

_CLOCK = re.compile(r"(\d{1,2}:\d{2})")


# ── the directory ─────────────────────────────────────────────────────────────

def fold_name(s: Optional[str]) -> str:
    """The search fold the assessment picker reads: Latin, lower case, no
    apostrophes, single spaces — so «карим» finds Karimov and «qochqorov»
    finds Qo'chqorov."""
    s = transliterate(s or "", "uz") or ""
    s = re.sub(r"[ʻʼ’'`‘]", "", s.lower())
    return re.sub(r"\s+", " ", s).strip()


_DIR: dict = {"at": 0.0, "read": -1, "data": None}
_DIR_TTL_S = 300
_dir_lock = threading.Lock()


def directory(db: Session) -> dict:
    """The Verifix directory as the last read gave it — every status (a
    dismissed person's card opens too) — folded once and kept `_DIR_TTL_S`, or
    until a newer complete read lands. {rows, by_id, by_key}."""
    last = (db.query(func.max(TurnoverRead.id)).filter(TurnoverRead.ok.is_(True)).scalar()) or 0
    now = time.monotonic()
    with _dir_lock:
        if _DIR["data"] is not None and _DIR["read"] == last and now - _DIR["at"] < _DIR_TTL_S:
            return _DIR["data"]
    rows, by_id, by_key = [], {}, defaultdict(list)
    for p in db.query(TurnoverPerson).all():
        r = {"employee_id": p.employee_id, "name": p.name, "folded": fold_name(p.name),
             "key": worker_key(p.name), "status": p.status, "hired": p.hired,
             "dismissed": p.dismissed, "code": p.code, "unit": p.unit_name, "job": p.job,
             "staff_id": p.staff_id}
        rows.append(r)
        by_id[p.employee_id] = r
        by_key[r["key"]].append(p.employee_id)
    rows.sort(key=lambda r: r["folded"])
    data = {"rows": rows, "by_id": by_id, "by_key": dict(by_key)}
    with _dir_lock:
        _DIR.update(at=now, read=last, data=data)
    return data


def namesakes(dirx: dict, eid: str) -> list[str]:
    p = dirx["by_id"].get(eid)
    if not p:
        return []
    return [e for e in dirx["by_key"].get(p["key"], []) if e != eid]


def directory_state(db: Session) -> dict:
    last = (db.query(TurnoverRead).filter(TurnoverRead.ok.is_(True))
            .order_by(TurnoverRead.id.desc()).first())
    return {"count": db.query(func.count(TurnoverPerson.employee_id))
            .filter(TurnoverPerson.status == "W").scalar() or 0,
            "read_at": tv.iso(last.finished_at) if last else None}


# ── who may read whom ─────────────────────────────────────────────────────────

class Scope:
    """A viewer's reach over people: everybody (`all`), the people whose cell
    stands in one of `units`, or (a leader) in one of `cells`."""

    def __init__(self, all_: bool = False, units: Iterable[int] = (), cells: Iterable[int] = ()):
        self.all = all_
        self.units = set(units)
        self.cells = set(cells)

    def covers(self, cell: Optional[dict]) -> bool:
        if self.all:
            return True
        if not cell:
            return False
        return (cell.get("manager_id") in self.units) or (cell.get("id") in self.cells)


def cell_of(cmap: dict, p: dict) -> Optional[dict]:
    """The /cells cell the directory puts a person in (their CURRENT org unit's
    code, `turnover.unit_code` for a unit whose code sits in its name)."""
    code = tv.unit_code(p.get("code"), p.get("unit"))
    k = tv.code_key(code) if code else None
    return cmap.get(k) if k else None


# ── attendance names (the table carries no employee id) ──────────────────────

_ATT: dict = {"max_id": 0, "by_key": {}}
_att_lock = threading.Lock()


def _att_names(db: Session) -> dict[str, set]:
    """{worker_key → every spelling the attendance table holds of it}. Read
    whole once, then only the rows added since (ids only grow; a name that no
    longer has rows simply finds none)."""
    with _att_lock:
        since = _ATT["max_id"]
    top = db.query(func.max(Attendance.id)).scalar() or 0
    if top > since:
        names = [n for (n,) in db.query(Attendance.worker_name).filter(
            Attendance.id > since, Attendance.worker_name.isnot(None)).distinct().all()]
        with _att_lock:
            by_key = _ATT["by_key"]
            for n in names:
                if n and n not in ("nan", "NaN"):
                    by_key.setdefault(worker_key(n), set()).add(n)
            _ATT["max_id"] = max(_ATT["max_id"], top)
    with _att_lock:
        return _ATT["by_key"]


def _clock(raw: Optional[str]) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """(in, out, mark) from a day cell: «08:01 - 17:13 (8.14)» → in, out;
    «08:01 -» → in only (no check-out); «X» / «О» / «—» → the mark."""
    s = str(raw or "").strip()
    times = _CLOCK.findall(s)
    if len(times) >= 2:
        return times[0].zfill(5), times[1].zfill(5), None
    if len(times) == 1:
        return times[0].zfill(5), None, None
    return None, None, (s.split()[0] if s else None)


# ── the person's own placement on a day (for namesakes) ──────────────────────

def _live_cells(db: Session, eids: list[str], days: list[date]) -> dict[tuple, Optional[str]]:
    """{(eid, day) → the cell key the live read filed them under that day} —
    `emps[eid].c`, id-keyed. One extraction per person over the days asked."""
    days = [d for d in days if d >= LIVE_FROM]
    if not eids or not days:
        return {}
    keys = [f"day:{d.isoformat()}" for d in sorted(set(days))]
    out: dict = {}
    sql = text("SELECT key, data #>> CAST(:path AS text[]) FROM live_verifix_reads WHERE key = ANY(:keys)")
    for eid in eids:
        for k, c in db.execute(sql, {"path": "{emps,%s,c}" % eid, "keys": keys}).all():
            out[(eid, date.fromisoformat(k[4:]))] = c
    return out


def _placements(db: Session, dirx: dict, eids: list[str], days: list[date], today: date) -> dict:
    """{(eid, day) → cell key}: the live read's own cell from LIVE_FROM, the HR
    journals' placement before it (`category_compliance.standing`)."""
    from app.services import category_compliance as cc
    live = _live_cells(db, eids, days)
    events = cc.events_by_person(db)
    out: dict = {}
    for eid in eids:
        p = dirx["by_id"].get(eid) or {}
        evs = events.get(eid, [])
        for d in set(days):
            c = live.get((eid, d))
            if c is None:
                st = cc.standing({"code": p.get("code"), "job": p.get("job")}, evs, d, today)
                c = tv.code_key(st["code"]) if st.get("code") else None
            out[(eid, d)] = c
    return out


def attributed_rows(db: Session, dirx: dict, eid: str, today: date):
    """Every attendance row of this person (all dates), and how many name-
    matched rows were WITHHELD because a namesake could have been them."""
    p = dirx["by_id"][eid]
    names = sorted(_att_names(db).get(p["key"], ()))
    if not names:
        return [], 0
    rows = (db.query(Attendance.id, Attendance.manager_id, Attendance.date, Attendance.worker_name,
                     Attendance.job_title, Attendance.schedule, Attendance.clock_in_out,
                     Attendance.hours_worked, Attendance.verifix_code, Attendance.is_supervisor,
                     Attendance.hc_weight, Attendance.split_of)
            .filter(Attendance.worker_name.in_(names))
            .order_by(Attendance.date, Attendance.id).all())
    others = namesakes(dirx, eid)
    if not others:
        return rows, 0
    days = sorted({r.date for r in rows})
    place = _placements(db, dirx, [eid] + others, days, today)
    kept, withheld = [], 0
    for r in rows:
        rc = tv.code_key(r.verifix_code) if r.verifix_code else None
        mine = place.get((eid, r.date))
        theirs = {place.get((o, r.date)) for o in others}
        if rc and rc == mine and rc not in theirs:
            kept.append(r)
        else:
            withheld += 1
    return kept, withheld


def by_day(rows, units: dict, confirmed: set) -> dict[date, dict]:
    """One worker-day from its rows (a split day is two rows, one person): came
    if any half came, hours summed, the cells listed — under /workers' own
    predicates. `closed` = the (unit, day) passed the day-close gate."""
    from app.routers.workers import _py_came, _py_on_leave
    out: dict = {}
    for r in rows:
        d = out.setdefault(r.date, {"date": r.date, "rows": [], "came": False, "leave": False,
                                    "hours": 0.0, "cells": [], "units": [], "closed": False,
                                    "in": None, "out": None, "mark": None, "no_out": False})
        h = float(r.hours_worked) if r.hours_worked is not None else None
        came = _py_came(h)
        cin, cout, mark = _clock(r.clock_in_out)
        d["rows"].append(r.id)
        if came:
            d["came"] = True
            d["hours"] += h
        elif _py_on_leave(h, r.clock_in_out):
            d["leave"] = True
        if cin and (d["in"] is None or cin < d["in"]):
            d["in"] = cin
        if cout and (d["out"] is None or cout > d["out"]):
            d["out"] = cout
        if cin and not cout:
            d["no_out"] = True
        if mark and not d["mark"]:
            d["mark"] = mark
        if r.verifix_code and r.verifix_code not in d["cells"]:
            d["cells"].append(r.verifix_code)
        u = units.get(r.manager_id)
        if u and u not in d["units"]:
            d["units"].append(u)
        if (r.manager_id, r.date) in confirmed:
            d["closed"] = True
    for d in out.values():
        if d["came"]:
            d["leave"] = False
            d["mark"] = None
        d["hours"] = round(d["hours"], 2)
    return out


# ── documents: exchanges and role changes ────────────────────────────────────

def documents(db: Session, dirx: dict, eid: str, names: Iterable[str], frm: date, to: date,
              place: Optional[dict] = None) -> list[dict]:
    """The APPROVED exchanges and role changes naming this person, from both
    registers (/workers' Movements union): a live day's by employee id, a file
    day's by name — attributed by its sending cell where a namesake exists."""
    p = dirx["by_id"][eid]
    has_twin = bool(namesakes(dirx, eid))
    units = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    out: list[dict] = []

    def emit(src, doc, d, emp):
        pl = doc.payload or {}
        out.append({
            "source": src, "id": doc.id, "date": d.isoformat(), "kind": doc.doc_type,
            "unit_id": doc.manager_id, "unit": units.get(doc.manager_id) or doc.supervisor_name,
            "to_unit": pl.get("target_manager_name") or units.get(pl.get("target_manager_id")),
            "to_unit_id": pl.get("target_manager_id"),
            "task": pl.get("task_name"), "target": pl.get("target_type"),
            "at": pl.get("transfer_time"), "back": pl.get("return_time"),
            "new_role": pl.get("new_role"), "old_role": emp.get("old_role"),
        })

    names = [n for n in names if n]
    if names:
        q = (db.query(HrDocument).filter(HrDocument.status == "approved",
                                         HrDocument.date >= frm, HrDocument.date <= to,
                                         HrDocument.doc_type.in_(("people_exchange", "role_change"))))
        for doc in q.all():
            for emp in (doc.payload or {}).get("employees") or []:
                if worker_key(emp.get("worker_name") or "") != p["key"]:
                    continue
                if has_twin:
                    code = tv.code_key(emp.get("old_verifix_code")) if emp.get("old_verifix_code") else None
                    if not code or not place or place.get((eid, doc.date)) != code:
                        continue
                emit("file", doc, doc.date, emp)
                break
    lo = max(frm, LIVE_FROM)
    if to >= lo:
        q = (db.query(LiveDocument).filter(LiveDocument.status == "approved",
                                           LiveDocument.day >= lo, LiveDocument.day <= to,
                                           LiveDocument.doc_type.in_(("people_exchange", "role_change"))))
        for doc in q.all():
            for emp in (doc.payload or {}).get("employees") or []:
                if str(emp.get("employee_id")) == str(eid):
                    emit("live", doc, doc.day, emp)
                    break
    out.sort(key=lambda x: (x["date"], x["id"]))
    return out


# ── «Ish grafigi» marks, concerns ────────────────────────────────────────────

def plan_marks(db: Session, key: str, frm: date, to: date, own_cells: Optional[set] = None) -> dict:
    """{day → "yes" | "no"} — what «Ish grafigi» said about this person. With
    namesakes only the marks on the person's own cells count."""
    q = (db.query(KelishMark.day, KelishMark.status, Cell.verifix_code)
         .join(Cell, Cell.id == KelishMark.cell_id)
         .filter(KelishMark.worker_key == key, KelishMark.day >= frm, KelishMark.day <= to))
    out = {}
    for d, st, code in q.all():
        if own_cells is not None and tv.code_key(code) not in own_cells:
            continue
        out[d] = st
    return out


_CN: dict = {"at": 0.0, "by_key": {}}
_cn_lock = threading.Lock()


def concerns(db: Session, dirx: dict, eid: str, place_fn=None) -> tuple[list[dict], int]:
    """The concerns THIS worker filed on /cell-concerns (`worker_name`, folded
    to the same key). Status is /leaders-kpi's bucket: escalated past the
    leader step «uplifted», else the row's own status."""
    p = dirx["by_id"][eid]
    now = time.monotonic()
    with _cn_lock:
        fresh = now - _CN["at"] < 120
        by_key = _CN["by_key"]
    if not fresh:
        by_key = defaultdict(set)
        for (n,) in db.query(LeaderConcern.worker_name).filter(
                LeaderConcern.worker_name.isnot(None)).distinct().all():
            by_key[worker_key(n)].add(n)
        with _cn_lock:
            _CN.update(at=now, by_key=dict(by_key))
    names = sorted(by_key.get(p["key"], ()))
    if not names:
        return [], 0
    rows = (db.query(LeaderConcern).filter(LeaderConcern.worker_name.in_(names))
            .order_by(LeaderConcern.entry_date.desc(), LeaderConcern.id.desc()).all())
    twin = bool(namesakes(dirx, eid))
    out, withheld = [], 0
    for c in rows:
        if twin:
            ck = tv.code_key(c.cell_code) if c.cell_code else None
            if not ck or not place_fn or place_fn(c.entry_date) != ck:
                withheld += 1
                continue
        level = c.level or "supervisor"
        bucket = "uplifted" if level != "leader" else (
            c.status if c.status in ("done", "doing") else "todo")
        out.append({
            "id": c.id, "seq": c.seq, "date": c.entry_date.isoformat() if c.entry_date else None,
            "code": c.cell_code, "text": c.concern_text, "status": c.status, "bucket": bucket,
            "level": level, "resolved_on": (c.completion_date.isoformat() if c.completion_date
                                            else (tv.local(c.done_at).date().isoformat() if c.done_at else None)),
            "leader": c.leader_name,
        })
    return out, withheld


# ── today, still being worked (id-keyed) ─────────────────────────────────────

def today_live(db: Session, eid: str, cell: Optional[dict]) -> Optional[dict]:
    """The person's shift-day still being worked, read BY ID off the stored live
    Verifix read (`live_staff.person`, every approved document laid over it) —
    never a Verifix call. None when the day is not live or not read."""
    from app.services import cell_hours, live_day, live_overview, live_staff, shift_report, verifix_live
    try:
        with db.begin_nested():
            day = shift_report.report_days(live_overview.now_local(), (cell or {}).get("shift"),
                                           cell_hours.defaults(db))[0]
            if not live_day.is_live(day):
                return None
            drow = verifix_live._row(db, "dir")
            row = verifix_live._row(db, verifix_live._day_key(day))
            store = ((row.data or {}).get("emps") or {}) if row else {}
            if not drow or not drow.data or eid not in store:
                return None
            ctx = live_staff.load(db, day, drow.data, store)
            w = live_staff.person(ctx, eid)
            pd = w.p
            unit = (w.current.unit if w.current else None) or w.home_unit
            came = pd["in"] is not None
            hours = pd.get("hours")          # so far while inside (`so_far` flags it)
            return {
                "date": day.isoformat(), "status": pd["status"],
                "in": pd["in"].strftime("%H:%M") if pd["in"] else None,
                "out": pd["out"].strftime("%H:%M") if pd["out"] else None,
                "hours": round(float(hours), 2) if (came and hours is not None) else None,
                "came": came, "mark": None if came else live_staff.day_mark(ctx, eid),
                "unit_id": unit, "unit": (ctx.units.get(unit) or {}).get("name") if unit else None,
                "cell": w.home_cell, "schedule": w.schedule or None,
                "read_at": (store.get(eid) or {}).get("at"),
            }
    except Exception:  # noqa: BLE001 — the live day, never the card
        log.exception("people: today's live read could not be folded for %s", eid)
        return None


# ── the career ────────────────────────────────────────────────────────────────

def career(db: Session, eid: str, p: dict) -> list[dict]:
    """Hirings, transfers, category changes (with the ladder step the tenure
    expected on that date), dismissals and re-hires — the HR journals, the
    leavers the turnover read kept, and the directory. Newest first."""
    from app.services import category_compliance as cc
    r = cc.rule(db)
    ladder = cc.Ladder(r)
    evs = cc.events_by_person(db).get(eid, [])
    out: list[dict] = []
    hire = None
    job = p.get("job")
    for d, d_end, kind, rank, ejob, code, unit in evs:
        if kind == "hire":
            hire = d
        if ejob:
            job = ejob
        item = {"date": d.isoformat(), "kind": kind, "until": d_end.isoformat() if d_end else None,
                "job": ejob, "unit": unit, "code": code, "rank": rank}
        if kind == "rank" and rank:
            lad = ladder.ladder_for(job)
            h = hire or p.get("hired")
            if lad and h:
                ten = cc.tenure_months(h, d)
                exp, _from = ladder.expected(lad, ten)
                item.update(tenure=ten, expected=exp,
                            verdict=cc.judge(rank, exp, ladder, r))
        out.append(item)
    for lv in db.query(TurnoverLeaver).filter(TurnoverLeaver.employee_id == eid).all():
        out.append({"date": lv.dismissed.isoformat(), "kind": "dismissed",
                    "unit": lv.unit_name, "code": lv.code, "job": lv.job, "reason": lv.reason,
                    "cancelled": bool(lv.cancelled_at),
                    "hired": lv.hired.isoformat() if lv.hired else None})
    known = {(o["kind"], o["date"]) for o in out}
    if p.get("hired") and ("hire", p["hired"].isoformat()) not in known:
        out.append({"date": p["hired"].isoformat(), "kind": "hire", "unit": p.get("unit"),
                    "code": p.get("code"), "job": p.get("job"), "from_directory": True})
    if p.get("status") == "D" and p.get("dismissed") and ("dismissed", p["dismissed"].isoformat()) not in known:
        out.append({"date": p["dismissed"].isoformat(), "kind": "dismissed", "unit": p.get("unit"),
                    "code": p.get("code"), "job": p.get("job"), "from_directory": True})
    out.sort(key=lambda x: x["date"], reverse=True)
    return out


def cell_runs(days: dict) -> list[dict]:
    """Which cells the person stood in and when — runs of one cell over the
    days they CAME, at least `RUN_MIN` days long, newest first. A gap of days
    off does not break a run; another cell does."""
    runs: list[dict] = []
    cur = None
    for d in sorted(days):
        day = days[d]
        if not day["came"] or not day["cells"]:
            continue
        code = day["cells"][0]
        if cur and cur["code"] == code:
            cur["to"], cur["days"] = d, cur["days"] + 1
        else:
            cur = {"code": code, "from": d, "to": d, "days": 1}
            runs.append(cur)
    out = [{"code": r["code"], "from": r["from"].isoformat(), "to": r["to"].isoformat(),
            "days": r["days"]} for r in runs if r["days"] >= RUN_MIN]
    out.reverse()
    return out


# ── honours ───────────────────────────────────────────────────────────────────

def honours(db: Session, eid: str) -> list[dict]:
    rows = (db.query(EmployeeHonour).filter(EmployeeHonour.employee_id == eid)
            .order_by(EmployeeHonour.given_on.desc(), EmployeeHonour.id.desc()).all())
    return [{"id": h.id, "title": h.title, "kind": h.kind, "date": h.given_on.isoformat(),
             "by": h.given_by_name, "note": h.note} for h in rows]


def candidate_ids(db: Session, eid: str) -> list[int]:
    return [cid for (cid,) in db.query(AssessmentCandidate.id)
            .filter(AssessmentCandidate.employee_id == eid).all()]


def assessments_brief(db: Session, eid: str) -> list[dict]:
    """The sittings of this person — date and id only (the feed). What a
    sitting SAYS is the assessment page's to decide (results_hidden)."""
    cids = candidate_ids(db, eid)
    if not cids:
        return []
    return [{"id": a.id, "date": (a.held_on or tv.local(a.created_at).date()).isoformat(), "status": a.status}
            for a in db.query(Assessment).filter(Assessment.candidate_id.in_(cids)).all()]


# ── leadership ties ───────────────────────────────────────────────────────────

def ties(db: Session, eid: str) -> dict:
    """The leader profiles and brigadir units the live sync tied to this
    Verifix person (`vfx_employee_id`) — the card's «Rahbarlik» tab."""
    profs = (db.query(RoleProfile).filter(RoleProfile.vfx_employee_id == str(eid),
                                          RoleProfile.role == "leader").all())
    units = (db.query(Manager).filter(Manager.vfx_employee_id == str(eid),
                                      Manager.archived.is_(False)).all())
    pids = [p.id for p in profs]
    runs, owns = defaultdict(list), defaultdict(list)
    if pids:
        for c in db.query(Cell).filter(Cell.archived_at.is_(None)).all():
            if c.leader_id in pids:
                runs[c.leader_id].append(c.verifix_code)
            if c.owner_id in pids:
                owns[c.owner_id].append(c.verifix_code)
    unit_names = {m.id: m.name for m in db.query(Manager.id, Manager.name).all()}
    cells_n = dict(db.query(Cell.manager_id, func.count(Cell.id))
                   .filter(Cell.archived_at.is_(None)).group_by(Cell.manager_id).all())
    return {
        "leaders": [{"id": p.id, "name": p.name, "unit_id": p.manager_id,
                     "unit": unit_names.get(p.manager_id), "kind": p.leader_kind,
                     "runs": sorted(c for c in runs.get(p.id, []) if c),
                     "owns": sorted(c for c in owns.get(p.id, []) if c)} for p in profs],
        "units": [{"id": m.id, "name": m.name, "shift": m.shift, "kind": m.supervisor_kind,
                   "cells": cells_n.get(m.id, 0)} for m in units],
    }


def clean_text(s, limit: int) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()[:limit]
