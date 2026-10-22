"""⚠ TEMPORARY (2026-10-22): the «everybody left» notice REPORT, printed into
the deploy job's log — the one window onto production a cloud session can read.

For every `live_all_left_notices` row of the last 21 days: the unit, the day,
what the notice was sent with (came · missing · last exit · sent at), and the
unit-day as the engine reads it TWICE from the stored Verifix read — at the
moment the notice was sent and now. For every worker who was not «left» at the
send (no check-out, inside, on a break …): their schedule, clock-in, the
check-out the report holds now, their marks after the schedule's end, and
where they stand now — so «15 people still at work» can be placed: overtime,
a schedule ending early, a forgotten check-out, or something else.

Run by `.gitea/workflows/deploy.yaml` from `backend/`. READ-ONLY: no Verifix
call, nothing written, the session rolled back. NO WORKER NAMES: pseudonyms
(«W1» …) stable within one run; units are named. Delete with its step.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from collections import Counter
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.normpath(os.path.join(HERE, "..", "backend")))

from app.database import SessionLocal  # noqa: E402
from app.models import LiveAllLeftNotice, LiveDayClose, Manager  # noqa: E402
from app.services import live_staff, verifix_live  # noqa: E402
from app.version import APP_VERSION, current_commit  # noqa: E402

DAYS_BACK = 21
_ps: dict[str, str] = {}


def ps(eid) -> str:
    k = str(eid)
    if k not in _ps:
        _ps[k] = f"W{len(_ps) + 1}"
    return _ps[k]


def rec(kind: str, **kw) -> None:
    print("ALLLEFT " + json.dumps({"k": kind, **kw}, ensure_ascii=False, default=str), flush=True)


def loc(dt):
    if dt is None:
        return None
    if dt.tzinfo is not None:
        dt = verifix_live._local(dt)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def marks_of(store: dict, eid: str):
    out = []
    for x in (store.get(eid) or {}).get("m") or []:
        try:
            out.append((datetime.fromisoformat(x[0]), x[1]))
        except Exception:  # noqa: BLE001
            continue
    return sorted(out)


def _ok_before(s, sent) -> bool:
    try:
        return datetime.fromisoformat(s) <= sent
    except Exception:  # noqa: BLE001
        return False


def report_of(store: dict, eid: str) -> dict:
    ts = (store.get(eid) or {}).get("ts") or {}
    days = ts.get("days") or []
    d = days[0] if days else {}
    return {"input": d.get("input_time"), "output": d.get("output_time"),
            "begin": d.get("begin_time"), "end": d.get("end_time"),
            "schedule": ts.get("schedule") or (store.get(eid) or {}).get("sch")}


def rows_by_eid(ud: dict) -> dict:
    out = {}
    for r in ud["workers"]:
        if r.get("split_of") is None:
            out[str(r.get("employee_id") or r.get("id"))] = ("named", r)
    for x in ud.get("extras") or []:
        out.setdefault(str(x.get("employee_id")), ("extra", x))
    return out


def do_notice(db, n: LiveAllLeftNotice, directory: dict, now: datetime) -> None:
    unit = db.get(Manager, n.manager_id)
    sent = verifix_live._local(n.sent_at) if n.sent_at else None
    rec("notice", id=n.id, unit=n.manager_id, unit_name=unit.name if unit else None,
        shift=unit.shift if unit else None, day=str(n.day), came=n.came, missing=n.missing,
        pending=n.pending, last_out=loc(n.last_out), sent=loc(sent))
    row = verifix_live._row(db, verifix_live._day_key(n.day))
    store = ((row.data or {}).get("emps") or {}) if row else {}
    rec("read", unit=n.manager_id, day=str(n.day), has_read=bool(row),
        read_at=loc(row.read_at) if row else None, emps=len(store))
    if not store or sent is None:
        return
    at_send = live_staff.unit_day(live_staff.load(db, n.day, directory, store, sent), n.manager_id)
    # The read AS IT STOOD at the send: marks up to it, the report's check-out
    # dropped where it lands after it (Verifix fills check-outs in late).
    trunc = {}
    for eid, e in store.items():
        e2 = dict(e)
        e2["m"] = [x for x in (e.get("m") or []) if _ok_before(x[0], sent)]
        ts = e.get("ts")
        if ts and ts.get("days"):
            d0 = dict(ts["days"][0])
            od = verifix_live._dt(d0.get("output_time")) if d0.get("output_time") else None
            if od and od > sent:
                d0["output_time"] = None
                d0["facts"] = []
            e2["ts"] = {**ts, "days": [d0] + list(ts["days"][1:])}
        trunc[eid] = e2
    real = live_staff.unit_day(live_staff.load(db, n.day, directory, trunc, sent), n.manager_id)
    cl_real = live_staff.close_state(real, n.day, None, None, 0)
    rr = rows_by_eid(real)
    stayed = []
    for eid in rr:
        o = report_of(store, eid).get("output")
        od = verifix_live._dt(o) if o else None
        if od and od > sent:
            stayed.append(eid)
    rec("replay", unit=n.manager_id, day=str(n.day), state=cl_real["state"],
        counts={k: real["counts"][k] for k in ("came", "inside", "left", "no_out", "not_yet", "missing")},
        stayed_later=len(stayed),
        stayed_read_as=dict(Counter((rr.get(e, (None, {}))[1].get("status"),
                                     rr.get(e, (None, {}))[1].get("out_src")) for e in stayed)))
    at_now = live_staff.unit_day(live_staff.load(db, n.day, directory, store, now), n.manager_id)
    rec("counts", unit=n.manager_id, day=str(n.day), at_send=at_send["counts"], now=at_now["counts"])
    then, later = rows_by_eid(at_send), rows_by_eid(at_now)
    rec("statuses", unit=n.manager_id, day=str(n.day),
        at_send=dict(Counter(r["status"] for _, r in then.values())),
        now=dict(Counter(r["status"] for _, r in later.values())))
    at_work = Counter()
    for eid, (rk, r) in then.items():
        rp = report_of(store, eid)
        end = verifix_live._dt(rp.get("end")) if rp.get("end") else None
        out_dt = verifix_live._dt(rp.get("output")) if rp.get("output") else None
        mk = marks_of(store, eid)
        after_send = [(t.strftime("%m-%d %H:%M"), ty) for t, ty in mk if t > sent]
        later_out = bool(out_dt and out_dt > sent)
        # Still at work when the notice went: clocked in, and Verifix saw them
        # after it (a mark, or the report's check-out falling later).
        if not (r.get("clock_in") and (after_send or later_out)):
            continue
        at_work[r["status"]] += 1
        after_end = [(t.strftime("%m-%d %H:%M"), ty) for t, ty in mk if end and t > end]
        nk, nr = later.get(eid, (None, {}))
        rec("worker", unit=n.manager_id, day=str(n.day), w=ps(eid), row_kind=rk,
            report_out_after_send=later_out, marks_after_send=after_send[:8],
            job=r.get("job_title"), cell=r.get("verifix_code"),
            schedule=r.get("schedule"), sched_begin=r.get("begin"), sched_end=r.get("end"),
            status_at_send=r["status"], missing=r.get("missing"),
            clock_in=r.get("clock_in"), clock_out_at_send=r.get("clock_out"),
            in_src=r.get("in_src"), out_src=r.get("out_src"), held=r.get("held"),
            report=rp, marks_total=len(mk), marks_after_schedule_end=after_end[-12:],
            last_mark=(mk[-1][0].strftime("%m-%d %H:%M"), mk[-1][1]) if mk else None,
            status_now=nr.get("status"), clock_out_now=nr.get("clock_out"),
            out_src_now=nr.get("out_src"))
    rec("at_work_at_send", unit=n.manager_id, day=str(n.day), n=sum(at_work.values()),
        by_status_now_read=dict(at_work))
    cl = db.query(LiveDayClose).filter(LiveDayClose.manager_id == n.manager_id,
                                       LiveDayClose.day == n.day).first()
    rec("close", unit=n.manager_id, day=str(n.day),
        closed_at=loc(cl.closed_at) if cl else None, by=cl.closed_by_name if cl else None)


def main() -> None:
    db = SessionLocal()
    try:
        now = verifix_live.now_local()
        rec("meta", version=APP_VERSION, commit=(current_commit() or "")[:12], now_local=loc(now),
            now_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            missing_after_min=verifix_live.MISSING_AFTER_MIN,
            notice_window_min=verifix_live.NOTICE_WINDOW_MIN)
        drow = verifix_live._row(db, "dir")
        directory = (drow.data or {}) if drow else {}
        since = now.date() - timedelta(days=DAYS_BACK)
        notices = (db.query(LiveAllLeftNotice).filter(LiveAllLeftNotice.day >= since)
                   .order_by(LiveAllLeftNotice.missing.desc().nullslast(),
                             LiveAllLeftNotice.day.desc()).all())
        rec("summary", notices=len(notices),
            with_missing=sum(1 for n in notices if (n.missing or 0) > 0),
            missing_ge_10=[(n.manager_id, str(n.day), n.missing) for n in notices
                           if (n.missing or 0) >= 10])
        for n in notices:
            try:
                do_notice(db, n, directory, now)
            except Exception as exc:  # noqa: BLE001
                rec("error", unit=n.manager_id, day=str(n.day), msg=repr(exc),
                    trace=traceback.format_exc()[-900:])
            finally:
                db.rollback()
        rec("done", workers=len(_ps))
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
