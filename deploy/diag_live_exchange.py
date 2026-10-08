"""⚠ TEMPORARY (2026-10-08): the live-day exchange REPORT, printed into the
deploy job's log — the one window onto production a cloud session can read.

Every live unit-day from `live_day.LIVE_FROM` to the plant's today: the stored
Verifix read behind it, every live document (any status) with its history,
the engine's reading of every worker a people-exchange names (stints, the
unit holding the NAME, the hours per unit, the move's time against the
worker's own clock-in / clock-out TO THE SECOND), the deletions, placements
and clock fixes, the close and the copy the close wrote into `attendance`
(and whether that copy still equals what the engine answers now), plus an
anomaly scan and the file-flow baseline — for the operator's retrace of
«workers given away still count on the sender's load» (the exchange dialog
put a live day's move at the worker's EXIT minute until v4.259.1).

Run by `.gitea/workflows/deploy.yaml` after the health check, from
`backend/` as `python ../deploy/diag_live_exchange.py`. READ-ONLY: it calls
no Verifix, writes nothing and rolls the session back. NO WORKER NAMES in the
log: every worker is a pseudonym («W1», «W2» …) stable within one run; units,
brigadirs and admins are named. Lives under deploy/ so that adding it does
not restart the backend. Delete it with its workflow step.
"""
from __future__ import annotations

import json
import os
import re
import sys
import traceback
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Attendance, DayApproval, HrDocument, LiveClockFix, LiveDayClose, LiveDeletion,
    LiveDocument, LiveDocumentHistory, LivePlacement, LiveProjection,
)
from app.services import live_day, live_projection, live_staff, verifix_live  # noqa: E402
from app.services.idle_source import _counted_hc  # noqa: E402
from app.version import APP_VERSION, current_commit  # noqa: E402

# v4.259.1 — the exchange dialog opens on a whole-day move again — landed on
# production at this moment (the deploy job of commit 6b1714f6fc).
FIX_AT = datetime(2026, 10, 8, 5, 26, 47, tzinfo=timezone.utc)
FILE_FROM, FILE_TO = date(2026, 9, 15), date(2026, 10, 5)   # the file-flow baseline
DOC_KEYS = {"target_type", "target_manager_id", "target_manager_name", "task_name",
            "transfer_time", "return_time", "employees"}

_names: dict[str, str] = {}


def pseud(name) -> str | None:
    """A worker's pseudonym — the same person is the same «W<n>» throughout
    one run, so the live rows (keyed by employee id) and the copy's rows (by
    name) meet. Never the name itself."""
    if not name:
        return None
    k = re.sub(r"\s+", " ", str(name)).strip().lower()
    if not k:
        return None
    if k not in _names:
        _names[k] = f"W{len(_names) + 1}"
    return _names[k]


def rec(_kind: str, **obj) -> None:
    print("REC " + _kind + " " + json.dumps(obj, default=str, sort_keys=True))


def iso(dt) -> str | None:
    return dt.isoformat(timespec="seconds") if dt else None


def loc(ts) -> str | None:
    return iso(verifix_live._local(ts)) if ts else None


def minutes(a, b) -> float | None:
    return round((b - a).total_seconds() / 60.0, 2) if (a and b) else None


def classify(T, p: dict) -> str:
    """Where the move's moment sits on the worker's own day."""
    if T is None:
        return "whole_day"
    C, O = p.get("in"), p.get("out")
    if C is None:
        return "no_clock_in"
    if T < C:
        return "before_in"
    if O is not None:
        if T >= O:
            return "at_or_after_exit"          # the engine drops it: «never happened»
        if T.replace(second=0, microsecond=0) == O.replace(second=0, microsecond=0):
            return "exit_minute"               # the bug's signature: T = the exit, cut to the minute
        return "before_midpoint" if T < C + (O - C) / 2 else "after_midpoint"
    return "inside_no_exit"


def stints(w) -> list:
    return [[iso(s.start), iso(s.end), s.unit, s.task,
             round(s.hours, 3) if s.hours is not None else None] for s in w.stints]


def copy_row(a, counted: bool) -> dict:
    return {"worker": pseud(a.worker_name), "job": a.job_title, "clock": a.clock_in_out,
            "hours": float(a.hours_worked) if a.hours_worked is not None else None,
            "early": float(a.early_arrival_min) if a.early_arrival_min is not None else None,
            "eff": float(a.effective_hours) if a.effective_hours is not None else None,
            "code": a.verifix_code, "hc_weight": a.hc_weight, "split_of": a.split_of,
            "supervisor": bool(a.is_supervisor), "counted": counted}


def engine_row(r: dict) -> dict:
    return {"worker": pseud(r.get("worker_name")), "job": r.get("job_title"), "clock": r.get("clock_in_out"),
            "hours": r.get("hours_worked"), "early": r.get("early_arrival_min"),
            "eff": r.get("effective_hours"), "code": r.get("verifix_code"),
            "hc_weight": r.get("hc_weight"), "split_ix": r.get("split_ix")}


def live_row(r: dict) -> dict:
    return {"worker": pseud(r.get("worker_name")), "status": r.get("status"), "job": r.get("job_title"),
            "clock": r.get("clock_in_out"), "in_at": r.get("in_at"), "out_at": r.get("out_at"),
            "hours": r.get("hours_worked"), "early": r.get("early_arrival_min"),
            "eff": r.get("effective_hours"), "code": r.get("verifix_code"),
            "hc_weight": r.get("hc_weight"), "split_of": r.get("split_of"),
            "moved": r.get("moved"), "on_task": r.get("on_task"), "here": r.get("here"),
            "so_far": r.get("so_far"), "missing": r.get("missing"), "held": r.get("held"),
            "in_src": r.get("in_src"), "out_src": r.get("out_src"),
            "pending": [p.get("doc_type") for p in (r.get("pending") or [])]}


def do_day(db, day: date, directory: dict, now: datetime) -> None:
    row = verifix_live._row(db, verifix_live._day_key(day))
    data = (row.data or {}) if row else {}
    store = data.get("emps") or {}
    rec("day", day=str(day), has_read=bool(row), read_at=loc(row.read_at) if row else None,
        read_ms=row.ms if row else None, error=(row.error if row else None),
        error_at=loc(row.error_at) if row else None, v=data.get("v"), all_at=data.get("all_at"),
        units_stamped=len(data.get("units") or {}), people=len(store))
    ctx = live_staff.load(db, day, directory, store, now)
    units = ctx.units

    docs_all = (db.query(LiveDocument).filter(LiveDocument.day == day)
                .order_by(LiveDocument.id).all())
    hist: dict = defaultdict(list)
    if docs_all:
        for h in (db.query(LiveDocumentHistory)
                  .filter(LiveDocumentHistory.document_id.in_([d.id for d in docs_all]))
                  .order_by(LiveDocumentHistory.id).all()):
            hist[h.document_id].append(h)
    dels = db.query(LiveDeletion).filter(LiveDeletion.day == day).order_by(LiveDeletion.id).all()
    pls = db.query(LivePlacement).filter(LivePlacement.day == day).order_by(LivePlacement.id).all()
    fixes = db.query(LiveClockFix).filter(LiveClockFix.day == day).order_by(LiveClockFix.id).all()
    closes = {c.manager_id: c for c in db.query(LiveDayClose).filter(LiveDayClose.day == day).all()}
    appr = {a.manager_id: a for a in db.query(DayApproval).filter(DayApproval.date == day).all()}
    projs = {p.manager_id: p for p in db.query(LiveProjection).filter(LiveProjection.day == day).all()}
    att: dict = defaultdict(list)
    for a in db.query(Attendance).filter(Attendance.date == day).order_by(Attendance.id).all():
        att[a.manager_id].append(a)
    for h in db.query(HrDocument).filter(HrDocument.date == day).all():
        pl = h.payload or {}
        rec("hr_doc_on_live_day", day=str(day), id=h.id, type=h.doc_type, status=h.status,
            unit=h.manager_id, transfer_time=pl.get("transfer_time"),
            n=len(pl.get("employees") or []), created_at=iso(h.created_at))

    involved: set = set()
    for d in docs_all:
        pl = d.payload or {}
        involved.add(d.manager_id)
        if pl.get("target_manager_id"):
            involved.add(pl.get("target_manager_id"))
    involved |= {x.manager_id for x in dels} | {x.manager_id for x in pls} | {x.manager_id for x in fixes}
    with_cells = {c["manager_id"] for c in ctx.cells.values() if c["manager_id"]}

    def uname(mid):
        return (units.get(mid) or {}).get("name") if mid else None

    for mid in sorted(set(units) | involved):
        if mid not in with_cells and mid not in involved and mid not in att:
            continue
        try:
            unit_report(db, ctx, data, day, mid, uname, involved, closes, appr, projs, att)
        except Exception as exc:  # noqa: BLE001 — one unit must not hide the others
            rec("error", day=str(day), unit=mid, where="unit", msg=repr(exc),
                trace=traceback.format_exc()[-600:])

    for d in docs_all:
        try:
            doc_report(ctx, day, d, hist.get(d.id) or [], uname, att)
        except Exception as exc:  # noqa: BLE001
            rec("error", day=str(day), doc=d.id, where="doc", msg=repr(exc),
                trace=traceback.format_exc()[-600:])

    for x in dels:
        rec("deletion", day=str(day), id=x.id, batch=x.batch_id, unit=x.manager_id, unit_name=uname(x.manager_id),
            worker=pseud(x.worker_name), status=x.status, initiated_by=x.initiated_by,
            created_at=loc(x.created_at), processed_at=loc(x.processed_at),
            processed_by=x.processed_by_name)
    for x in pls:
        rec("placement", day=str(day), id=x.id, unit=x.manager_id, unit_name=uname(x.manager_id),
            worker=pseud((live_staff.person(ctx, str(x.employee_id)).name)),
            code=x.verifix_code, second_code=x.second_code, split_at=x.split_at,
            updated_by=x.updated_by, updated_at=loc(x.updated_at))
    for x in fixes:
        rec("clockfix", day=str(day), id=x.id, unit=x.manager_id, unit_name=uname(x.manager_id),
            worker=pseud(x.worker_name), action=x.action, out_time=x.out_time,
            created_by=x.created_by, created_at=loc(x.created_at))

    # Anomalies over the day's copies.
    named_units: dict = defaultdict(set)
    for mid, rows in att.items():
        for a in rows:
            if a.worker_name and not a.split_of:
                named_units[pseud(a.worker_name)].add(mid)
            h = float(a.hours_worked or 0)
            if h > 14:
                rec("anomaly", day=str(day), kind="hours_over_14", unit=mid, unit_name=uname(mid),
                    worker=pseud(a.worker_name), hours=h, clock=a.clock_in_out)
    for w, ms in named_units.items():
        if len(ms) > 1:
            rec("anomaly", day=str(day), kind="named_on_two_units", worker=w,
                units=sorted(ms), unit_names=[uname(m) for m in sorted(ms)])
    for d in docs_all:
        pl = d.payload or {}
        if d.doc_type != "people_exchange" or d.status != "approved":
            continue
        tgt = pl.get("target_manager_id") if pl.get("target_type") == "supervisor" else None
        for e in pl.get("employees") or []:
            w = live_staff.person(ctx, str(e.get("employee_id")))
            on_sender = [a for a in att.get(d.manager_id, []) if a.worker_name == w.name]
            on_target = [a for a in att.get(tgt, [])] if tgt else []
            on_target_named = [a for a in on_target if a.worker_name == w.name]
            if on_sender and any(float(a.hours_worked or 0) > 0 for a in on_sender):
                rec("anomaly", day=str(day), kind="sender_still_named", doc=d.id,
                    worker=pseud(w.name), sender=d.manager_id, sender_name=uname(d.manager_id),
                    target=tgt, target_name=uname(tgt), transfer_time=pl.get("transfer_time"),
                    sender_hours=[float(a.hours_worked or 0) for a in on_sender],
                    sender_counted=[_counted_hc(a) for a in on_sender],
                    target_named_hours=[float(a.hours_worked or 0) for a in on_target_named],
                    target_nameless=[float(a.hours_worked or 0) for a in on_target if not a.worker_name],
                    cls=classify(live_staff._at(ctx, (units.get(d.manager_id) or {}).get("shift"),
                                                pl.get("transfer_time")) if pl.get("transfer_time") else None,
                                 w.p))


def unit_report(db, ctx, data, day, mid, uname, involved, closes, appr, projs, att) -> None:
    ids = live_staff.unit_ids(ctx, mid)
    covered = verifix_live._covered_at(data, mid, ids)
    ud = live_staff.unit_day(ctx, mid)
    rows, extras = ud["workers"], ud["extras"]
    try:
        eng_rows = live_projection.rows_for(ctx, mid)
        eng_digest = live_projection._digest(eng_rows)
    except Exception as exc:  # noqa: BLE001
        eng_rows, eng_digest = None, f"ERR {exc!r}"
    cp = att.get(mid, [])
    counted = [a for a in cp if _counted_hc(a)]
    hc = sum(1.0 if a.hc_weight is None else float(a.hc_weight) for a in counted)
    proj, cl, ap = projs.get(mid), closes.get(mid), appr.get(mid)
    shift = (ctx.units.get(mid) or {}).get("shift")
    rec("unitday", day=str(day), unit=mid, unit_name=uname(mid), shift=shift,
        archived=mid not in ctx.units, has_cells=any(c["manager_id"] == mid for c in ctx.cells.values()),
        people=len(ids), covered=iso(covered), involved=mid in involved,
        counts=ud["counts"], extra_hours=ud["extra_hours"], extras=len(extras),
        closed_at=loc(cl.closed_at) if cl else None, closed_by=cl.closed_by_name if cl else None,
        approval=bool(ap), approval_by=ap.approved_by_name if ap else None,
        proj_rows=proj.rows if proj else None, proj_copied_at=loc(proj.copied_at) if proj else None,
        proj_digest=(proj.digest or "")[:10] if proj else None,
        engine_digest=(eng_digest or "")[:10], copy_current=(proj.digest == eng_digest) if proj else None,
        engine_rows=len(eng_rows) if eng_rows is not None else None,
        copy_rows=len(cp), copy_named=sum(1 for a in cp if a.worker_name),
        copy_nameless=sum(1 for a in cp if not a.worker_name),
        copy_came=sum(1 for a in cp if float(a.hours_worked or 0) > 0 and a.worker_name and not a.split_of),
        copy_hc=round(hc, 3), copy_direct_hours=round(sum(float(a.hours_worked or 0) for a in counted), 2),
        copy_nameless_hours=round(sum(float(a.hours_worked or 0) for a in cp if not a.worker_name), 2),
        copy_statuses=dict(Counter("named" if a.worker_name else "nameless" for a in cp)))
    full = mid in involved
    for r in rows:
        if full or r.get("status") in ("moved_out", "on_task") or r.get("moved") or r.get("hc_weight") is not None:
            rec("row", day=str(day), unit=mid, **live_row(r))
    for x in extras:
        rec("extra", day=str(day), unit=mid, worker=pseud(x.get("worker_name")), hours=x.get("hours"),
            hours_worked=x.get("hours_worked"), early=x.get("early_arrival_min"), eff=x.get("effective_hours"),
            named_at=x.get("named_at_id"), named_at_name=x.get("named_at"), reason=x.get("reason"),
            here=x.get("here"), status=x.get("status"), code=x.get("verifix_code"),
            clock_in=x.get("clock_in"), clock_out=x.get("clock_out"), in_at=x.get("in_at"), out_at=x.get("out_at"))
    for a in cp:
        cr = copy_row(a, a in counted)
        odd = (not a.worker_name or a.hc_weight is not None or a.split_of
               or float(a.hours_worked or 0) > 14 or "xx:xx" in (a.clock_in_out or ""))
        if full or odd:
            rec("copyrow", day=str(day), unit=mid, id=a.id, **cr)
    if full and eng_rows is not None and (proj is None or proj.digest != eng_digest):
        for r in eng_rows:
            rec("engrow", day=str(day), unit=mid, **engine_row(r))


def doc_report(ctx, day, d, history, uname, att) -> None:
    pl = d.payload or {}
    emps = pl.get("employees") or []
    tgt = pl.get("target_manager_id") if pl.get("target_type") == "supervisor" else None
    shift = (ctx.units.get(d.manager_id) or {}).get("shift")
    T = live_staff._at(ctx, shift, pl.get("transfer_time")) if pl.get("transfer_time") else None
    R = live_staff._at(ctx, shift, pl.get("return_time")) if (pl.get("transfer_time") and pl.get("return_time")) else None
    rec("doc", day=str(day), id=d.id, type=d.doc_type, status=d.status,
        sender=d.manager_id, sender_name=uname(d.manager_id), sender_shift=shift,
        target_type=pl.get("target_type"), target=tgt, target_name=uname(tgt), task=pl.get("task_name"),
        transfer_time=pl.get("transfer_time"), return_time=pl.get("return_time"),
        T=iso(T), R=iso(R), n=len(emps), workers=[pseud(e.get("worker_name")) for e in emps],
        new_role=pl.get("new_role"), payload_keys=sorted(k for k in pl if k not in DOC_KEYS),
        created_at=iso(d.created_at), created_local=loc(d.created_at),
        created_by=d.created_by_name, created_by_role=d.created_by_role,
        approved_at=iso(d.approved_at), approved_local=loc(d.approved_at), approved_by=d.approved_by_name,
        updated_at=iso(d.updated_at),
        after_fix=(d.created_at > FIX_AT) if d.created_at else None,
        history=[[h.action, h.actor_name, loc(h.created_at), sorted((h.detail or {}).keys())
                  if isinstance(h.detail, dict) else type(h.detail).__name__] for h in history])
    if d.doc_type != "people_exchange":
        return
    for e in emps:
        eid = str(e.get("employee_id"))
        w = live_staff.person(ctx, eid)
        p = w.p
        on_sender = [a for a in att.get(d.manager_id, []) if a.worker_name == w.name]
        on_target = [a for a in att.get(tgt, []) if a.worker_name == w.name] if tgt else []
        rec("check", day=str(day), doc=d.id, doc_status=d.status, applied=d.status == "approved",
            worker=pseud(w.name), known=(eid in ctx.store), home=w.home_unit, home_name=uname(w.home_unit),
            sender=d.manager_id, target=tgt, task=pl.get("task_name"),
            T=iso(T), R=iso(R), cls=classify(T, p),
            filed_clock_in=e.get("clock_in"), filed_clock_out=e.get("clock_out"), filed_in_at=e.get("in_at"),
            in_at=iso(p.get("in")), out_at=iso(p.get("out")), status_now=p.get("status"),
            hours_now=p.get("hours"), so_far=p.get("so_far"), in_src=p.get("in_src"), out_src=p.get("out_src"),
            min_after_in=minutes(p.get("in"), T), min_before_out=minutes(T, p.get("out")),
            engine={"moved": w.moved, "winner": w.winner, "winner_name": uname(w.winner), "reason": w.reason,
                    "first_unit": w.first_unit, "current_unit": (w.current.unit if w.current else None),
                    "current_task": (w.current.task if w.current else None),
                    "unit_hours": {str(k): (round(v, 3) if v is not None else None) for k, v in w.unit_hours.items()},
                    "task_hours": {str(k): round(v, 3) for k, v in w.task_hours.items()},
                    "stints": stints(w), "early_min": w.early_min},
            copy_sender=[[float(a.hours_worked or 0), a.hc_weight, a.verifix_code, a.clock_in_out, _counted_hc(a)]
                         for a in on_sender],
            copy_target=[[float(a.hours_worked or 0), a.hc_weight, a.verifix_code, a.clock_in_out, _counted_hc(a)]
                         for a in on_target])


def file_baseline(db) -> None:
    per_day: dict = defaultdict(Counter)
    last: list = []
    for d in (db.query(HrDocument).filter(HrDocument.doc_type == "people_exchange",
                                           HrDocument.date >= FILE_FROM, HrDocument.date <= FILE_TO)
              .order_by(HrDocument.id).all()):
        pl = d.payload or {}
        per_day[d.date][f"{'timed' if pl.get('transfer_time') else 'whole'}:{d.status}"] += 1
        last.append({"id": d.id, "date": str(d.date), "unit": d.manager_id, "status": d.status,
                     "target_type": pl.get("target_type"), "transfer_time": pl.get("transfer_time"),
                     "return_time": pl.get("return_time"), "n": len(pl.get("employees") or []),
                     "created_by_role": d.created_by_role})
    for day in sorted(per_day):
        rec("filebase", day=str(day), counts=dict(per_day[day]))
    for x in last[-12:]:
        rec("filedoc", **x)
    n_pre = db.query(LiveDocument).filter(LiveDocument.day < live_day.LIVE_FROM).count()
    rec("live_prefloor_docs", n=n_pre)


def main() -> None:
    db = SessionLocal()
    try:
        now = verifix_live.now_local()
        rec("meta", version=APP_VERSION, commit=(current_commit() or "")[:12], now_local=iso(now),
            now_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            live_from=live_day.iso(), fix_at=FIX_AT.isoformat(), file_base=[str(FILE_FROM), str(FILE_TO)])
        for shift in (1, 2):
            try:
                rec("frame", shift=shift, frame=verifix_live.day_frame(db, shift))
            except Exception as exc:  # noqa: BLE001
                rec("error", where="frame", shift=shift, msg=repr(exc))
        drow = verifix_live._row(db, "dir")
        directory = (drow.data or {}) if drow else {}
        rec("dir", has_read=bool(drow), read_at=loc(drow.read_at) if drow else None,
            emps=len(directory.get("emps") or {}), divs=len(directory.get("divs") or {}),
            error=(drow.error if drow else None))
        day = live_day.LIVE_FROM
        while day <= now.date():
            try:
                do_day(db, day, directory, now)
            except Exception as exc:  # noqa: BLE001
                rec("error", day=str(day), where="day", msg=repr(exc), trace=traceback.format_exc()[-800:])
            finally:
                db.rollback()
            day += timedelta(days=1)
        try:
            file_baseline(db)
        except Exception as exc:  # noqa: BLE001
            rec("error", where="filebase", msg=repr(exc))
        rec("done", workers_pseudonymised=len(_names))
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
