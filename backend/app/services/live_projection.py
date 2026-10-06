"""The COPY of a closed live day into `attendance` (from 2026-10-06).

The operator's ruling 1 (2026-10-06): on a live day the stored Verifix read and
the live documents ARE the day; the moment the brigadir closes it, the day is
copied ONCE into `attendance` + `DayApproval`, so every reader the загрузка,
`day_state` / `idle_lock`, `/workers`, the heatmap and the gap reports already
has keeps working unchanged. A reopen deletes the copy, the next close copies
again — so a placement or an exchange can never be wiped the way the Davomat
re-save wiped them (`attendance_batch._sync_manager`).

Ruling 13: after the close the copy FOLLOWS Verifix until the unit's next
shift-day opens — late check-outs and HR edits reach `attendance` by
themselves, nobody edits anything — and any decision on a document of the day
re-copies the units it touches. A re-copy writes only when something moved
(`digest`).

The rows reproduce the file flow's shape (`verifix_attendance._row`, what the
admin «Davomat» Save wrote): «HH:MM - HH:MM (Явка)», «Отработано» hours,
early arrival by `clock_metrics`, the cell's code, the absence mark of a day
nobody clocked. What only the live day has rides along: the split halves
(`hc_weight` + `split_of`), and a nameless hours-only row for the hours an
exchange left here under another unit's name — the shape /staff's exchange
apply has always written.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import replace
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Attendance, DayApproval, LiveDayClose, LiveProjection
from app.services import live_day, live_staff, verifix_attendance

log = logging.getLogger(__name__)


def _two(v: Optional[float]) -> Optional[float]:
    """Two decimals, half up — how the export prints «Отработано»."""
    return float(verifix_attendance._two(float(v))) if v is not None else None


def _clock(ctx: live_staff.Ctx, eid: str, r: dict, whole: bool) -> str:
    """The day cell as the file printed it. A whole, unmoved, unsplit day keeps
    Verifix's own «(Явка)»; a stint, a half or a brigadir's exit prints the
    row's own hours there — `clock_metrics` reads the bracket as the day's."""
    ts = (ctx.store.get(eid) or {}).get("ts") or {}
    days = ts.get("days") or []
    d = days[0] if days else {}
    if not r.get("clock_in"):
        facts = {}
        for f in d.get("facts") or []:
            k = str(f.get("time_kind_id") or "")
            try:
                facts[k] = facts.get(k, 0.0) + float(f.get("fact_value") or 0)
            except (TypeError, ValueError):
                continue
        return verifix_attendance._mark(facts, d) if d else "X"
    t_in, t_out = r["clock_in"], r.get("clock_out")
    if not t_out:
        return f"{t_in} - xx:xx"
    if whole and r.get("out_src") == "report" and d:
        yavka = 0.0
        for f in d.get("facts") or []:
            if str(f.get("time_kind_id") or "") == verifix_attendance.ON_TIME_KIND:
                try:
                    yavka += float(f.get("fact_value") or 0)
                except (TypeError, ValueError):
                    pass
        div = (ctx.formula or verifix_attendance.DEFAULT_RULE).get("div") or 60
        return f"{t_in} - {t_out} ({verifix_attendance._two(yavka / div)})"
    return f"{t_in} - {t_out} ({verifix_attendance._two(r.get('hours_worked') or 0)})"


def rows_for(ctx: live_staff.Ctx, mid: int) -> list[dict]:
    """The unit-day's `attendance` rows, in a stable order. A split's second
    half names its primary by `split_ix` (its index here) — the real id exists
    only once the primary is written."""
    ud = live_staff.unit_day(ctx, mid)
    out: list[dict] = []
    first_ix: dict[str, int] = {}
    for r in ud["workers"]:
        if r["status"] == "not_yet":
            continue
        eid = r["employee_id"]
        w = live_staff.person(ctx, eid)
        whole = not w.moved and not r.get("split_of") and r.get("hc_weight") is None
        timed = bool(r.get("clock_in") and r.get("clock_out"))
        early = float(r["early_arrival_min"] or 0) if r.get("clock_in") else 0.0
        hours = _two(r["hours_worked"]) if timed and r.get("hours_worked") is not None else None
        if whole and hours is not None:
            eff = round(hours - early / 60.0, 4)       # the file's own arithmetic
        else:
            eff = (round(float(r["effective_hours"]), 4)
                   if timed and r.get("effective_hours") is not None else None)
        clock = _clock(ctx, eid, r, whole)
        if r["status"] == "on_task":
            # Sent to a task for the day: /staff's exchange apply zeroes it.
            clock, hours, eff = "X", 0.0, 0.0
        row = {
            "worker_name": r["worker_name"],
            "job_title": r["job_title"],
            "schedule": r["schedule"],
            "clock_in_out": clock,
            "hours_worked": hours,
            "early_arrival_min": early,
            "effective_hours": eff,
            "verifix_code": r.get("verifix_code"),
            "hc_weight": r.get("hc_weight"),
            "split_ix": first_ix.get(eid) if r.get("split_of") else None,
        }
        if not r.get("split_of"):
            first_ix[eid] = len(out)
        out.append(row)
    for x in ud["extras"]:
        if not x.get("hours"):
            continue
        code = x.get("verifix_code")
        if not code:
            # The hours a move left on the worker's OWN unit were worked in
            # their own cell — the day opened there; an arrival's are placed
            # by the receiving brigadir (a placement), or stay cell-less.
            w = live_staff.person(ctx, x["employee_id"])
            if w.home_unit == mid and w.first_unit == mid and w.home_cell in ctx.cells:
                code = ctx.cells[w.home_cell]["code"]
        out.append({
            "worker_name": None,
            "job_title": x.get("job_title"),
            "schedule": x.get("schedule"),
            "clock_in_out": (f"{x['clock_in']} - {x['clock_out']} ({verifix_attendance._two(x['hours_worked'] or 0)})"
                             if x.get("clock_in") and x.get("clock_out") else None),
            "hours_worked": _two(x.get("hours_worked")),
            "early_arrival_min": float(x.get("early_arrival_min") or 0),
            "effective_hours": round(float(x["effective_hours"]), 4) if x.get("effective_hours") is not None else None,
            "verifix_code": code,
            "hc_weight": None,
            "split_ix": None,
        })
    return out


def _original(ctx: live_staff.Ctx, mid: int) -> list[dict]:
    """The days the exchanged workers would have had with no exchange at all —
    on the unit they STARTED on — for /workers' original-brigadir charts
    (`exchange_rewind`): one per worker an approved people-exchange of the day
    moves into or out of this unit. `seats` are the units the copy may have put
    their row on."""
    moves = [d for d in ctx.docs if d.doc_type == "people_exchange"]
    if not moves:
        return []
    bare = replace(ctx, docs=[d for d in ctx.docs if d.doc_type != "people_exchange"], _persons={})
    out = []
    for eid in live_staff.unit_ids(ctx, mid, include_drafts=False):
        if eid not in ctx.store and eid not in ctx.homes:
            continue
        w = live_staff.person(ctx, eid)
        if not w.moved and not w.whole_task:
            continue
        seats = {s.unit for s in w.stints if s.unit is not None} | {w.home_unit}
        if mid not in seats:
            continue
        w0 = live_staff.person(bare, eid)
        p = w0.p
        hours = p["hours"] if p["in"] is not None and p["out"] is not None else None
        clock = (f"{p['in'].strftime('%H:%M')} - {p['out'].strftime('%H:%M')} ({verifix_attendance._two(hours or 0)})"
                 if hours is not None else ("X" if p["in"] is None else None))
        out.append({"manager_id": w0.home_unit, "worker_name": w.name, "job_title": w0.role,
                    "hours_worked": _two(hours), "clock_in_out": clock,
                    "seats": sorted(s for s in seats if s is not None)})
    return out


def _roster(ctx: live_staff.Ctx, mid: int) -> list[list]:
    """Everybody the read filed under the unit's cells — [name, cell code, job,
    came] — the «Ish grafigi» list's source for a live day (`kelish`): what the
    Davomat file's rows were for the days before (Verifix's own filing, never
    an exchange)."""
    out = []
    for eid, (m, key) in ctx.homes.items():
        if m != mid:
            continue
        ts = (ctx.store.get(eid) or {}).get("ts") or {}
        emp = (ctx.directory.get("emps") or {}).get(eid) or {}
        name = ts.get("name") or emp.get("name")
        cell = ctx.cells.get(key)
        if not (name and cell):
            continue
        came = live_staff.person(ctx, eid).p["in"] is not None
        out.append([name, cell["code"], ts.get("job") or emp.get("job") or "", came])
    return sorted(out)


def _digest(rows: list[dict]) -> str:
    return hashlib.sha1(json.dumps(rows, sort_keys=True, default=str).encode()).hexdigest()


def write(db: Session, mid: int, ctx: live_staff.Ctx, force: bool = False) -> Optional[int]:
    """Copy the unit-day into `attendance` when it changed (always with
    `force`). Returns the rows written, or None when nothing moved. The caller
    commits."""
    day = ctx.day
    rows = rows_for(ctx, mid)
    digest = _digest(rows)
    rec = db.query(LiveProjection).filter(LiveProjection.manager_id == mid,
                                          LiveProjection.day == day).first()
    if rec is not None and rec.digest == digest and not force:
        return None
    db.query(Attendance).filter(Attendance.manager_id == mid,
                                Attendance.date == day).delete(synchronize_session=False)
    written: list[Attendance] = []
    for r in rows:
        a = Attendance(
            manager_id=mid, date=day, worker_name=r["worker_name"], job_title=r["job_title"],
            schedule=r["schedule"], clock_in_out=r["clock_in_out"], hours_worked=r["hours_worked"],
            early_arrival_min=r["early_arrival_min"], effective_hours=r["effective_hours"],
            verifix_code=r["verifix_code"], hc_weight=r["hc_weight"], is_supervisor=False,
        )
        if r["split_ix"] is not None:
            db.flush()
            a.split_of = written[r["split_ix"]].id
        db.add(a)
        written.append(a)
    if rec is None:
        rec = LiveProjection(manager_id=mid, day=day)
        db.add(rec)
    rec.digest = digest
    rec.rows = len(rows)
    rec.original = _original(ctx, mid)
    rec.roster = _roster(ctx, mid)
    rec.copied_at = datetime.now(timezone.utc)
    return len(rows)


def close(db: Session, mid: int, ctx: live_staff.Ctx, closer_tg: Optional[int],
          closer_name: Optional[str]) -> int:
    """The close's half: `DayApproval` (what every reader asks «is this day
    closed») and the copy. The caller has written `LiveDayClose` and commits."""
    if not db.query(DayApproval).filter_by(manager_id=mid, date=ctx.day).first():
        db.add(DayApproval(manager_id=mid, date=ctx.day,
                           approved_by_telegram_id=int(closer_tg or 0),
                           approved_by_name=closer_name or "",
                           approved_at=datetime.now(timezone.utc)))
    return write(db, mid, ctx, force=True) or 0


def unproject(db: Session, mid: int, day: date) -> int:
    """A reopen: the copy and the `DayApproval` go (ruling 1); the next close
    copies again. Returns the attendance rows removed. The caller commits."""
    n = db.query(Attendance).filter(Attendance.manager_id == mid,
                                    Attendance.date == day).delete(synchronize_session=False)
    db.query(LiveProjection).filter(LiveProjection.manager_id == mid,
                                    LiveProjection.day == day).delete(synchronize_session=False)
    db.query(DayApproval).filter(DayApproval.manager_id == mid,
                                 DayApproval.date == day).delete(synchronize_session=False)
    return n


def refresh(db: Session, ctx: live_staff.Ctx, units=None) -> int:
    """Re-copy every CLOSED live unit-day of `ctx.day` (or of `units`) whose
    rows moved since the last copy. Returns how many units were rewritten.
    Commits."""
    if not live_day.is_live(ctx.day):
        return 0
    q = db.query(LiveDayClose.manager_id).filter(LiveDayClose.day == ctx.day)
    if units is not None:
        units = [u for u in units if u]
        if not units:
            return 0
        q = q.filter(LiveDayClose.manager_id.in_(units))
    done = 0
    for (mid,) in q.all():
        try:
            if write(db, mid, ctx) is not None:
                db.commit()
                done += 1
                log.info("live copy: unit %s on %s re-copied", mid, ctx.day)
        except Exception:  # noqa: BLE001 — one unit must not stop the others
            db.rollback()
            log.exception("live copy: re-copying unit %s on %s failed", mid, ctx.day)
    return done
