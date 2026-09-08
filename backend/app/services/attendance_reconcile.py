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

THREE reasons, deliberately separated, because they need three different
actions and one number lumping them together hides the only one an operator can
act on:

  ``lost``       the row was written and then dropped. The real alarm, and the
                 only reason the repair below will put back.
  ``not_saved``  the cell is staged and never projected (usually a closed day).
                 Pressing Save, or re-opening the day, writes it — so a repair
                 here would write behind the two-phase flow's back and the next
                 Save would rewrite it anyway.
  ``deleted``    somebody removed this worker-day ON PURPOSE — an admin's direct
                 delete, or a supervisor's delete request an admin approved.
                 Both leave an approved ``EditRequest`` carrying
                 ``changes._action == "delete"``, which is the whole record that
                 this absence was a decision. Reporting it as `lost` made an
                 alarm that no repair may clear and no operator can act on, and
                 a repair that could not tell the two apart would silently
                 resurrect exactly the rows somebody chose to remove.

Nothing here writes. It is a read-only comparison used by the admin report, by
the nightly watch that DMs admins when the count is not zero, and — through
``restore_plan`` — by the repair endpoint, which does the writing itself.
"""
import logging
from datetime import date as date_t, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Attendance, AttendanceBatch, AttendanceBatchCell, AttendanceBatchRow,
    EditRequest, HrDocument, Manager,
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


def _deleted_names(db: Session, d_from: date_t, d_to: date_t) -> set:
    """(date, name) pairs somebody deliberately removed and nobody restored.

    Every deliberate deletion on this platform lands as an ``EditRequest``
    carrying ``changes._action == "delete"`` — an admin's direct delete is
    written pre-approved by ``staff._log_admin_action``, and a supervisor's
    request becomes one when an admin approves it. A row put back afterwards
    turns that request ``undone``, so ``approved`` is exactly "still deleted on
    purpose".

    Keyed on (date, name) and NOT on the unit, because that is how the
    comparison above defines presence: B is every named row on that date on ANY
    supervisor, so the exclusion has to be asked the same way or a worker
    deleted from the unit they had been moved to would read as lost.
    """
    return {
        (d, n) for d, n in db.query(
            EditRequest.date, EditRequest.worker_name,
        ).filter(
            EditRequest.status == "approved",
            EditRequest.changes["_action"].astext == "delete",
            EditRequest.date >= d_from,
            EditRequest.date <= d_to,
        ).distinct().all() if n
    }


def routing(batch: AttendanceBatch) -> tuple[dict, set]:
    """``{verifix_code: manager_id}`` for the cells the admin chose to count,
    plus the codes still staged.

    Set A is defined here and read twice — once to find who is missing, once to
    work out what putting them back would write. Two spellings of "which cells
    count" is how the report and the repair would end up disagreeing about the
    same day.
    """
    routed, pending_codes = {}, set()
    for bc in batch.cells:
        if not bc.included or not bc.manager_id or not bc.verifix_code:
            continue
        routed[bc.verifix_code] = bc.manager_id
        if bc.pending:
            pending_codes.add(bc.verifix_code)
    return routed, pending_codes


def restore_plan(db: Session, d: date_t, names) -> list[tuple]:
    """The rows a re-projection WOULD write for these workers on this date, as
    ``[(AttendanceBatchRow, manager_id)]``. Still read-only — the caller writes.

    It is the batch row itself, not a re-derivation of it: ``_sync_manager``
    copies those columns straight across, and a restored row has to be
    indistinguishable from a projected one or the day it lands on stops adding
    up. A worker who appears in two ticked cells gets both rows back, because
    that is what the projection puts there.

    PENDING codes are excluded on purpose. Those rows are `not_saved`, and Save
    is their door: writing one here would go behind the two-phase flow, leave
    the cell still staged on the tab, and be rewritten by the next Save anyway.
    """
    names = [n for n in (names or []) if n]
    if not names:
        return []
    batch = db.query(AttendanceBatch).filter(AttendanceBatch.date == d).first()
    if batch is None:
        return []
    routed, pending_codes = routing(batch)
    live = [c for c in routed if c not in pending_codes]
    if not live:
        return []
    rows = db.query(AttendanceBatchRow).filter(
        AttendanceBatchRow.batch_id == batch.id,
        AttendanceBatchRow.verifix_code.in_(live),
        AttendanceBatchRow.worker_name.in_(names),
    ).all()
    return [(r, routed[r.verifix_code]) for r in rows]


def missing_for_day(db: Session, d: date_t, blanked: Optional[set] = None,
                    deleted: Optional[set] = None) -> list[dict]:
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
    routed, pending_codes = routing(batch)
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
    if deleted is None:
        deleted = _deleted_names(db, d, d)

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
            # Three different absences, three different actions — see the
            # module docstring. Deliberate first: a worker somebody removed on
            # purpose is not a loss whatever else is true of their cell.
            "reason":       ("deleted"   if (d, name) in deleted else
                             "not_saved" if r.verifix_code in pending_codes else
                             "lost"),
        })
    return out


def scan(db: Session, d_from: date_t, d_to: date_t) -> dict:
    """Reconcile every date in the range. Rows newest-first."""
    blanked = _blanked_names(db, d_from, d_to)
    deleted = _deleted_names(db, d_from, d_to)
    rows: list[dict] = []
    d = d_from
    while d <= d_to:
        rows.extend(missing_for_day(db, d, blanked, deleted))
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
            "not_saved": len([r for r in rows if r["reason"] == "not_saved"]),
            "deleted":   len([r for r in rows if r["reason"] == "deleted"]),
            "days":      len({r["date"] for r in lost}),
            "units":     len({r["manager_id"] for r in lost}),
            "hours":     round(sum(r["hours_worked"] or 0 for r in lost), 2),
        },
    }
