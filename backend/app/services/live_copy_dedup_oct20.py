"""TEMPORARY one-shot (2026-10-20): the live copies that were written twice.

`live_projection.write` deleted a unit-day's `attendance` and inserted the copy
with no lock. When two copies of one unit-day ran at once (the minute job, a
decision's `_recopy`, a close), each one deleted only the rows its own snapshot
could see, and BOTH inserted. Yog'mirov Feruz's 18.10 was re-copied on 20.10 at
17:51 into 130 rows for 65 people. Every row was there twice, identical, while
`live_projections.rows` said 65, and his «To'liq hisob» A fell from 144% to
66%. `live_projection.lock` closes the race; this pass mends what it left.

It looks only at live unit-days (from `live_day.LIVE_FROM`) whose `attendance`
holds MORE rows than the copy wrote (`live_projections.rows`). A day that was
not written twice is never touched, however alike two of its rows look. Inside
such a day, holding the copy's own lock, it deletes the EXACT duplicates: rows
equal in every column but the id, keeping the lowest ids. A group of k equal
rows keeps k ÷ (how many copies landed: the row count over `rows` when that
divides evenly, else two), rounded up. So a pair of identical rows that the copy
itself wrote stays a pair. Split halves are never touched: a row with a
`split_of`, a row with an `hc_weight`, or a row a second half points at. Rows
still over `rows` afterwards are listed in the DM, so that day can be reopened
and closed again. The DM carries each unit-day's rows before → after, its
`rows`, and its «To'liq hisob» P / A before and after (Feruz's 18.10 should
come back to about 122% / 144%).

The record (app setting `RECORD`) is written in the same transaction as each
unit-day's delete. A restart part-way through resumes from it, and a DM that
failed is re-sent from it; the pass itself runs once. Delete this module,
`startup.repair_live_copy_dupes`, both entrypoint calls and
`tests/test_live_copy_dedup_oct20.py` once the DM has landed.
"""
from __future__ import annotations

import json
import logging
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Optional

import requests
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Attendance, LiveProjection, Manager
from app.services import action_log, live_projection
from app.services.live_day import LIVE_FROM

log = logging.getLogger(__name__)

RECORD = "live_copy_dedup_2026_10_20_record"
REASON = "live_copy_dedup_2026_10_20"

# Every column of a row but its id: two rows equal in all of these are one row
# written twice. `hc_weight` and `split_of` are not here because the rows that
# carry them are never touched.
_COLS = ("worker_name", "job_title", "schedule", "clock_in_out", "hours_worked",
         "early_arrival_min", "effective_hours", "verifix_code", "is_supervisor")


def _setting(db: Session, key: str) -> Optional[AppSetting]:
    return db.query(AppSetting).filter_by(key=key).first()


def _put(db: Session, key: str, value: str) -> None:
    row = _setting(db, key)
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def _candidates(db: Session) -> list[tuple[int, date]]:
    """Every live unit-day holding more rows than its copy wrote."""
    q = text("""
        SELECT a.manager_id, a.date
        FROM attendance a
        JOIN live_projections lp ON lp.manager_id = a.manager_id AND lp.day = a.date
        WHERE a.date >= :lo
        GROUP BY a.manager_id, a.date, lp.rows
        HAVING count(*) > lp.rows
        ORDER BY a.date, a.manager_id
    """)
    return [(r.manager_id, r.date) for r in db.execute(q, {"lo": LIVE_FROM})]


def plan(rows: list, copy_rows: int) -> tuple[list[int], int, int]:
    """(the ids to delete, how many copies landed, the split rows left alone)
    for one unit-day's rows. `rows` carry `id`, `hc_weight`, `split_of` and
    every column of `_COLS`."""
    n = len(rows)
    copies = n // copy_rows if copy_rows and n % copy_rows == 0 and n // copy_rows >= 2 else 2
    pointed = {r.split_of for r in rows if r.split_of is not None}
    groups: dict[tuple, list[int]] = defaultdict(list)
    split_rows = 0
    for r in rows:
        if r.split_of is not None or r.hc_weight is not None or r.id in pointed:
            split_rows += 1
            continue
        groups[tuple(getattr(r, c) for c in _COLS)].append(r.id)
    drop: list[int] = []
    for ids in groups.values():
        if len(ids) < 2:
            continue
        ids.sort()
        keep = -(-len(ids) // copies)          # rounded up
        drop += ids[keep:]
    return sorted(drop), copies, split_rows


def _fix(db: Session, mid: int, day: date, names: dict) -> Optional[dict]:
    """One unit-day, under the copy's lock. None = it is no longer over (a
    re-copy rewrote it meanwhile). The caller commits."""
    live_projection.lock(db, mid, day)
    lp = (db.query(LiveProjection.rows, LiveProjection.copied_at)
          .filter(LiveProjection.manager_id == mid, LiveProjection.day == day).first())
    rows = (db.query(Attendance.id, Attendance.hc_weight, Attendance.split_of,
                     *[getattr(Attendance, c) for c in _COLS])
            .filter(Attendance.manager_id == mid, Attendance.date == day).all())
    if lp is None or len(rows) <= lp.rows:
        return None
    drop, copies, split_rows = plan(rows, lp.rows)
    if drop:
        db.query(Attendance).filter(Attendance.id.in_(drop)).delete(synchronize_session=False)
    return {"unit_id": mid, "unit": names.get(mid) or str(mid), "day": day.isoformat(),
            "before": len(rows), "after": len(rows) - len(drop), "copy_rows": lp.rows,
            "deleted": len(drop), "copies": copies, "split_rows": split_rows,
            "copied_at": lp.copied_at.isoformat(timespec="seconds") if lp.copied_at else None}


def _pa(db: Session, mid: int, day: date) -> Optional[list]:
    """The unit-day's «To'liq hisob» [P, A] — `baseline_util` / `net_util`, what
    /zagruzka's first comparison table prints — read on a session of its own
    and rolled back. None when it cannot be read: the DM must not depend on it."""
    try:
        from app.routers.brigadirs import build_metrics_list
        with Session(bind=db.get_bind()) as s:
            try:
                for m in build_metrics_list(s, day, day, None, [mid], require_closed=False):
                    if m.manager_id == mid:
                        return [m.baseline_util, m.net_util]
            finally:
                s.rollback()
    except Exception:  # noqa: BLE001
        log.warning("live copy dedup: P/A of unit %s on %s not read", mid, day, exc_info=True)
    return None


def run(db: Session) -> dict:
    """The pass. Runs once: a finished record is handed back as it stands."""
    r = _setting(db, RECORD)
    rec = json.loads(r.value) if r is not None and r.value else None
    if rec and rec.get("done"):
        return rec
    rec = rec or {"at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "days": []}
    seen = {(d["unit_id"], d["day"]) for d in rec["days"]}
    names = {m.id: m.name for m in db.query(Manager.id, Manager.name)}
    for mid, day in _candidates(db):
        if (mid, day.isoformat()) in seen:
            continue
        pa_before = _pa(db, mid, day)
        try:
            entry = _fix(db, mid, day, names)
            if entry is None:
                db.rollback()
                continue
            entry["pa_before"] = pa_before
            rec["days"].append(entry)
            _put(db, RECORD, json.dumps(rec, default=str))
            db.commit()
        except Exception as exc:  # noqa: BLE001 — one unit-day must not stop the rest
            db.rollback()
            rec.setdefault("errors", []).append(
                {"unit_id": mid, "unit": names.get(mid), "day": day.isoformat(),
                 "error": f"{type(exc).__name__}: {exc}"[:300]})
            log.exception("live copy dedup: unit %s on %s failed", mid, day)
            continue
        if entry["deleted"]:
            action_log.record(
                db, category="attendance", action="lab.live_copy_deduplicated",
                source="system", actor_name="system", actor_role="system",
                target_kind="day", target_id=f"{mid}:{day.isoformat()}",
                unit_id=mid, unit_name=entry["unit"], day=day,
                details=[("rows_before", entry["before"]), ("rows_after", entry["after"]),
                         ("copy_rows", entry["copy_rows"]), ("deleted", entry["deleted"])],
                changes=[("rows", entry["before"], entry["after"])], reason=REASON)
        entry["pa_after"] = _pa(db, mid, day)
        _put(db, RECORD, json.dumps(rec, default=str))
        db.commit()
    rec["done"] = True
    _put(db, RECORD, json.dumps(rec, default=str))
    db.commit()
    return rec


def _pct(v) -> str:
    return "—" if v is None else f"{round(v * 100)}%"


def _pa_text(pa) -> str:
    return f"{_pct(pa[0])} / {_pct(pa[1])}" if pa else "—"


def summary(rec: dict) -> str:
    days = rec.get("days") or []
    fixed = [d for d in days if d["deleted"]]
    lines = ["🔧 Live copies written twice — the repair (2026-10-20)", "",
             f"Live unit-days from {LIVE_FROM:%d.%m} with more attendance rows than the copy "
             f"wrote: {len(days)}",
             f"Fixed: {len(fixed)}, {sum(d['deleted'] for d in fixed)} duplicate rows deleted", ""]
    for d in days:
        line = (f"• {d['unit']} · {d['day'][8:]}.{d['day'][5:7]}: {d['before']} → {d['after']} rows"
                f" (copy {d['copy_rows']})")
        over = d["after"] - d["copy_rows"]
        if over > 0:
            line += f" — still {over} over"
            if d["split_rows"]:
                line += f", split halves {d['split_rows']} untouched"
        lines.append(line)
        if d.get("pa_before") or d.get("pa_after"):
            lines.append(f"   To'liq hisob P / A: {_pa_text(d.get('pa_before'))} → "
                         f"{_pa_text(d.get('pa_after'))}")
    if not days:
        lines.append("Nothing was doubled.")
    for e in rec.get("errors") or []:
        lines.append(f"⚠️ {e.get('unit') or e['unit_id']} · {e['day']}: {e['error']}")
    lines += ["", "Cause: two copies of one unit-day ran at once and both inserted. From "
                  "this deploy every copy of a unit-day takes one lock "
                  "(live_projection.lock)."]
    return "\n".join(lines)


def _post(chat_id: int, body: str) -> None:
    r = requests.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
                      data={"chat_id": chat_id, "text": body}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError(f"telegram answered {r.status_code}: {r.text[:200]}")


def send(db: Session, chat_id: int, *_window) -> int:
    """`startup._send_report_once`'s sender: the pass (once), then its record
    as a DM. Returns the messages sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    body = summary(run(db))
    print("[startup] " + body.replace("\n", "\n[startup] "))
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post(chat_id, c)
    return len(chunks)
