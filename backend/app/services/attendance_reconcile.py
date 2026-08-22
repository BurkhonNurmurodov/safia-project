"""
Day reconciliation — does the platform still show everyone the file said worked?

THE question, asked per date and independent of cause:

    A = every worker in the day's uploaded batch whose cell is TICKED and
        routed to a supervisor (plus the cell-less brigadir rows the name
        matcher resolves), i.e. everyone the file says worked;
    B = every named attendance row for that date, on any supervisor.

    A − B is a loss.

Why it is defined this way rather than per feature. The narrow lost-worker
audit (`routers/exchange_audit`) only knows about workers an exchange document
NAMED, so it is blind to every other way a row can disappear — and there are
several, because `attendance_batch._sync_manager` wipes `(manager, date)`
wholesale and rebuilds it from one source while four things write into that
same scope:

  * an approved → supervisor exchange moves a row to a unit whose cells do not
    contain it, so the receiving unit's next save deletes it (traced 2026-08-22);
  * a cell UNTICKED after a day was saved takes its whole roster with it on the
    next re-sync — and since 2026-08-19 a tick persists into future days, so
    one untick keeps applying;
  * «delete supervisor day» removes a unit's rows outright;
  * a closed day is skipped by `_project`, so cells ticked afterwards never land.

Chasing each of those with its own detector is how the next one goes unnoticed
for fifty days. This asks the only question that matters to the person reading
the dashboard — is anybody missing — and answers it the same way whatever ate
the row.

Two exclusions, both because NULL is the right answer there and not a loss:

  * a worker a transfer-time split legitimately blanked (`task_blanked`: they
    cleared the minimum on neither side, so they are credited to nobody and
    their name is off the roster by design);
  * a cell the admin deliberately unticked — it is not in A at all, because A
    is "what the admin chose to count", not "every row in the file".

A cell still PENDING (staged, not yet projected) is reported but labelled
`not_saved` rather than `lost`: pressing Save fixes it, and a day whose
supervisor is closed will sit there until somebody re-opens it. Only `lost`
means a row the platform accepted and then dropped.

Nothing here writes. It is a read-only comparison used by the admin report and
by the nightly watch that DMs admins when the count is not zero.
"""
import logging
from datetime import date as date_t, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Attendance, AttendanceBatch, AttendanceBatchCell, AttendanceBatchRow,
    HrDocument, Manager,
)

log = logging.getLogger(__name__)


def _blanked_names(db: Session, d_from: date_t, d_to: date_t) -> set:
    """(date, name) pairs a split deliberately stripped of their name.

    Their row carries hours and no name on purpose, so the platform showing
    them nowhere is the rule working. Reporting them would train the reader to
    ignore the report.
    """
    out = set()
    docs = db.query(HrDocument).filter(
        HrDocument.doc_type == "people_exchange",
        HrDocument.status   == "approved",
        HrDocument.date     >= d_from,
        HrDocument.date     <= d_to,
    ).all()
    for doc in docs:
        for emp in (doc.payload or {}).get("employees") or []:
            if (emp or {}).get("applied", {}).get("task_blanked") and emp.get("worker_name"):
                out.add((doc.date, emp["worker_name"]))
    return out


def missing_for_day(db: Session, d: date_t, blanked: Optional[set] = None) -> list[dict]:
    """A − B for one date. Empty list when the day reconciles (or has no batch).

    A day with no batch reconciles vacuously: there is nothing to compare
    against, which is a different statement from "nobody is missing" and is
    deliberately NOT reported — a date the single-file flow never handled would
    otherwise alarm every night forever.
    """
    batch = db.query(AttendanceBatch).filter(AttendanceBatch.date == d).first()
    if batch is None:
        return []

    # ── A: the cells the admin chose to count, and who they route to ─────────
    routed, pending_codes = {}, set()
    for bc in batch.cells:
        if not bc.included or not bc.manager_id or not bc.verifix_code:
            continue
        routed[bc.verifix_code] = bc.manager_id
        if bc.pending:
            pending_codes.add(bc.verifix_code)
    if not routed:
        return []

    rows = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.verifix_code.in_(list(routed)),
    ).all()
    if not rows:
        return []

    # ── B: everyone the platform can still show for that date ────────────────
    present = {
        n for (n,) in db.query(Attendance.worker_name).filter(
            Attendance.date == d,
            Attendance.worker_name.isnot(None),
        ).distinct().all() if n
    }

    if blanked is None:
        blanked = _blanked_names(db, d, d)

    mgr_names = {
        m.id: m.name for m in db.query(Manager).filter(
            Manager.id.in_(set(routed.values())),
        ).all()
    }

    out, seen = [], set()
    for r in rows:
        name = (r.worker_name or "").strip()
        if not name or name in present or name in seen:
            continue
        if (d, name) in blanked:
            continue
        seen.add(name)
        mid = routed[r.verifix_code]
        out.append({
            "date":         d.isoformat(),
            "worker_name":  name,
            "job_title":    r.job_title,
            "verifix_code": r.verifix_code,
            "manager_id":   mid,
            "manager_name": mgr_names.get(mid, str(mid)),
            "clock_in_out": r.clock_in_out,
            "hours_worked": float(r.hours_worked) if r.hours_worked is not None else None,
            # Staged but never projected — Save (or re-opening a closed day)
            # writes it. Not the same failure as a row that WAS written and
            # then deleted, and mixing the two makes the alarm unreadable.
            "reason":       "not_saved" if r.verifix_code in pending_codes else "lost",
        })
    return out


def scan(db: Session, d_from: date_t, d_to: date_t) -> dict:
    """Reconcile every date in the range. Rows newest-first."""
    blanked = _blanked_names(db, d_from, d_to)
    rows: list[dict] = []
    d = d_from
    while d <= d_to:
        rows.extend(missing_for_day(db, d, blanked))
        d += timedelta(days=1)

    rows.sort(key=lambda r: (r["date"], r["manager_name"], r["worker_name"]), reverse=True)
    lost = [r for r in rows if r["reason"] == "lost"]
    return {
        "from": d_from.isoformat(),
        "to":   d_to.isoformat(),
        "rows": rows,
        "summary": {
            "total":     len(rows),
            "lost":      len(lost),
            "not_saved": len(rows) - len(lost),
            "days":      len({r["date"] for r in lost}),
            "units":     len({r["manager_id"] for r in lost}),
            "hours":     round(sum(r["hours_worked"] or 0 for r in lost), 2),
        },
    }
