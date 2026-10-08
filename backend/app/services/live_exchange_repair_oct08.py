"""TEMPORARY one-shot (2026-10-08) — the live-day exchange repair.

The operator's «fix them on your own» after the 8 Oct retrace. Three people-
exchanges filed on 6–7 Oct with the OLD «now» default landed in the very
minute the workers clocked out (№21 and №23 on 6 Oct, №70 on 7 Oct — four
worker-days), and the engine read each as forty seconds on the receiver: the
sender kept the name and the hours, the receiver got a 0.01 h nameless row.
They were filed at the shift's end, after the workers had gone, as whole-day
gifts — so here they BECOME whole-day moves. A document is rewritten only
while it still is what the retrace found (approved, to a brigadir, that very
time) and only while the stored read still proves every worker's move void
(at or after their own exit minute); anything else is left and named.

The other thirteen worker-days — moves timed before the worker's own clock-in
— need no rewrite: `live_staff.person` now lands such a move at the arrival,
so the re-copy of every CLOSED unit of 6 and 7 Oct puts them right by itself.
That re-copy is `live_projection.refresh` over the stored read, the same call
a decision on a document makes (`staff_live._recopy`); a unit whose rows did
not move is not rewritten.

One transaction for the document writes and the flag; the re-copies commit
per unit; the record (app setting ``live_exchange_repair_2026_10_08``) is what
the DM is sent from, so a DM that fails is re-sent at the next boot and the
repair is never re-run. Delete this module, ``startup.repair_live_exchanges_oct08``
and both entrypoint calls once the flag reads «done» and the DM flag is set.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.config import settings
from app.models import AppSetting, Attendance, LiveDayClose, LiveDocument, LiveDocumentHistory, Manager
from app.services import action_log, live_projection, live_staff, verifix_live
from app.services.kpi_calculator import is_direct_role

log = logging.getLogger(__name__)

FLAG = "live_exchange_repair_2026_10_08_v1"
RECORD = "live_exchange_repair_2026_10_08"
DM_FLAG = FLAG + "_dm"
ACTOR = "Tizim · 2026-10-08 tuzatish"

# (document id, its day, the transfer time the retrace found) — the exit-minute
# moves to a brigadir. The task moves at the exit minute (№19, №35, №55) stay:
# «sent home at 10:14» after two hours on the sender is the honest record.
DOCS = ((21, date(2026, 10, 6), "17:01"),
        (23, date(2026, 10, 6), "17:00"),
        (70, date(2026, 10, 7), "17:01"))
DAYS = (date(2026, 10, 6), date(2026, 10, 7))


def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _hms(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%H:%M:%S") if dt else None


def _ctx(db: Session, reads: dict, mid: int, day: date):
    """The unit-day's engine context over the STORED read (no Verifix call, no
    commit, no rollback — `staff_live._ctx_for`'s rule), cached per day."""
    if day in reads:
        return reads[day]
    rd = verifix_live.day_read(db, mid, day, stored_only=True)
    ctx = None
    if not rd.get("error"):
        ctx = live_staff.load(db, rd["day"], rd["directory"], rd["store"], rd["now"])
    reads[day] = ctx
    return ctx


def _void(ctx, doc: LiveDocument) -> tuple[bool, list]:
    """Is every worker's move void — timed at or after their own exit minute?"""
    pl = doc.payload or {}
    shift = (ctx.units.get(doc.manager_id) or {}).get("shift")
    T = live_staff._at(ctx, shift, pl.get("transfer_time"))
    notes, all_void = [], True
    for e in pl.get("employees") or []:
        eid = str(e.get("employee_id"))
        p = live_staff.person(ctx, eid).p if (eid in ctx.store or eid in ctx.homes) else None
        out = p["out"] if p else None
        void = bool(p and out is not None and T is not None
                    and T >= out.replace(second=0, microsecond=0))
        all_void = all_void and void
        notes.append({"worker": e.get("worker_name"), "in": _hms(p["in"]) if p else None,
                      "out": _hms(out), "move": pl.get("transfer_time"), "void": void})
    return all_void, notes


def _unit_summary(db: Session, mid: int, day: date) -> dict:
    """What the unit's copy in `attendance` says: named direct heads (the
    загрузка's `verifix_hc` rule, `hc_weight` summed), direct hours, nameless rows."""
    rows = db.query(Attendance).filter(Attendance.manager_id == mid, Attendance.date == day).all()
    hc = hours = 0.0
    nameless = 0
    for r in rows:
        if not is_direct_role(r.job_title, r.hours_worked, bool(r.is_supervisor)):
            continue
        hours += float(r.hours_worked or 0)
        if (r.worker_name or "").strip():
            w = getattr(r, "hc_weight", None)
            hc += float(w) if w is not None else 1.0
        else:
            nameless += 1
    return {"rows": len(rows), "hc": round(hc, 2), "hours": round(hours, 2), "nameless": nameless}


def run(db: Session, docs=DOCS, days=DAYS) -> Optional[dict]:
    """One pass. None = already done. Writes the documents, the flag and the
    record in one transaction, then re-copies the closed units of `days`."""
    f = _setting(db, FLAG)
    if f is not None and (f.value or "") == "done":
        return None
    units = {m.id: m.name for m in db.query(Manager).all()}
    rec: dict = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "docs": [], "days": {}}
    reads: dict = {}
    for doc_id, day, ttime in docs:
        entry: dict = {"id": doc_id, "day": day.isoformat(), "expected_time": ttime}
        d = db.get(LiveDocument, doc_id)
        pl = dict(d.payload or {}) if d is not None else {}
        if d is None:
            entry["result"] = "missing"
        elif (d.day != day or d.doc_type != "people_exchange" or d.status != "approved"
              or pl.get("target_type") != "supervisor" or pl.get("transfer_time") != ttime):
            entry["result"] = "skipped_changed"
            entry["found"] = {"day": d.day.isoformat() if d.day else None, "type": d.doc_type,
                              "status": d.status, "target_type": pl.get("target_type"),
                              "transfer_time": pl.get("transfer_time")}
        else:
            entry.update(sender=units.get(d.manager_id) or d.supervisor_name,
                         target=pl.get("target_manager_name") or units.get(pl.get("target_manager_id")),
                         n=len(pl.get("employees") or []))
            ctx = _ctx(db, reads, d.manager_id, d.day)
            if ctx is None:
                entry["result"] = "no_read"
            else:
                all_void, notes = _void(ctx, d)
                entry["workers"] = notes
                if not all_void:
                    entry["result"] = "skipped_not_void"
                else:
                    pl["transfer_time"] = None
                    pl["return_time"] = None
                    d.payload = pl
                    flag_modified(d, "payload")
                    db.add(LiveDocumentHistory(
                        document_id=d.id, action="edited", actor_telegram_id=None, actor_name=ACTOR,
                        detail={"repair": FLAG, "transfer_time": [ttime, None],
                                "why": "a move timed in the minute the workers clocked out "
                                       "(void) read as a whole-day move"}))
                    entry["result"] = "whole_day"
        rec["docs"].append(entry)
    _put(db, FLAG, "done")
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    # The contexts above were built BEFORE the documents moved, and `person`
    # is memoised per context: the re-copy must read fresh ones, or it copies
    # the day the retrace found rather than the day as repaired.
    reads.clear()
    for entry in rec["docs"]:
        if entry["result"] == "whole_day":
            action_log.record_system(
                "documents", "lab.live_document_edited", target_kind="live_doc",
                target_id=entry["id"], unit_name=entry.get("sender"), day=entry["day"],
                details=[("target", entry.get("target")), ("employee_count", entry.get("n"))],
                changes=[("transfer_time", entry["expected_time"], None)], reason=FLAG)

    for day in days:
        closed = [m for (m,) in db.query(LiveDayClose.manager_id).filter(LiveDayClose.day == day)]
        info: dict = {"closed": len(closed), "rewritten": 0, "units": [], "error": None}
        rec["days"][day.isoformat()] = info
        if not closed:
            continue
        before = {m: _unit_summary(db, m, day) for m in closed}
        ctx = None
        for m in closed:
            ctx = _ctx(db, reads, m, day)
            if ctx is not None:
                break
        if ctx is None:
            info["error"] = "no stored read"
            continue
        try:
            info["rewritten"] = live_projection.refresh(db, ctx, closed)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            info["error"] = f"{type(exc).__name__}: {exc}"[:300]
            log.exception("live exchange repair: re-copying %s failed", day)
            continue
        for m in closed:
            b, a = before[m], _unit_summary(db, m, day)
            if b != a:
                info["units"].append({"id": m, "name": units.get(m), "before": b, "after": a})
        action_log.record_system(
            "attendance", "live.day_recopied", target_kind="day", target_id=day.isoformat(),
            day=day.isoformat(), details=[("closed_units", len(closed)),
                                         ("rewritten", info["rewritten"])], reason=FLAG)
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    return rec


def summary(rec: dict) -> str:
    lines = ["🔧 Live-day exchange repair (2026-10-08)", ""]
    lines.append("Documents:")
    for e in rec.get("docs") or []:
        head = f"№{e['id']} {e['day'][8:]}.{e['day'][5:7]}"
        if e.get("sender"):
            head += f" {e['sender']} → {e.get('target')} ({e.get('n')} w.)"
        if e["result"] == "whole_day":
            lines.append(f"• {head}: {e['expected_time']} → whole day ✓")
        elif e["result"] == "skipped_not_void":
            bad = [w["worker"] for w in e.get("workers") or [] if not w["void"]]
            lines.append(f"• {head}: LEFT — not void for {', '.join(map(str, bad))}")
        else:
            lines.append(f"• {head}: LEFT — {e['result']} {json.dumps(e.get('found') or {}, ensure_ascii=False)}")
    for day, info in (rec.get("days") or {}).items():
        lines.append("")
        lines.append(f"{day[8:]}.{day[5:7]}: {info['closed']} closed units, {info['rewritten']} copies rewritten"
                     + (f" — {info['error']}" if info.get("error") else ""))
        for u in info.get("units") or []:
            b, a = u["before"], u["after"]
            lines.append(f"  • {u['name']}: named heads {b['hc']} → {a['hc']}, direct hours {b['hours']} → {a['hours']}"
                         f", nameless rows {b['nameless']} → {a['nameless']}")
        if not info.get("units") and not info.get("error"):
            lines.append("  (no copy changed)")
    lines.append("")
    lines.append("Engine: a move timed before the worker's clock-in now counts from their arrival; "
                 "a move in the minute they clocked out is void and is refused at filing.")
    return "\n".join(lines)


def send_dm(db: Session, chat_id: int) -> None:
    """The record as a DM to the operator, once; a failure is retried at the next boot."""
    f = _setting(db, DM_FLAG)
    if f is not None and (f.value or "") == "done":
        return
    r = _setting(db, RECORD)
    if r is None or not r.value:
        return
    text = summary(json.loads(r.value))
    print("[startup] " + text.replace("\n", "\n[startup] "))
    try:
        import requests
        resp = requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            data={"chat_id": chat_id, "text": text[:4000]}, timeout=20)
        if resp.status_code != 200:
            raise RuntimeError(f"telegram answered {resp.status_code}")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] live exchange repair DM failed: {exc}")
        return
    _put(db, DM_FLAG, "done")
    db.commit()
