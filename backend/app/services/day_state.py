"""
Day-close state for a (manager, date) pair.

  OPEN      → no DayApproval row. The supervisor is still working on the day;
              nothing is calculated or shown anywhere. Requests may be created.
  CLOSED    → a DayApproval row exists (the supervisor closed the day) but the
              date still has pending EditRequests or draft HrDocuments awaiting
              review. Data stays hidden everywhere ("wait for confirmation").
  CONFIRMED → closed and every request for the date has been processed
              (approved or rejected — both count). Only confirmed days feed
              the dashboards and aggregates.
"""
from datetime import date as date_t
from typing import Iterable, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models import DayApproval, EditRequest, HrDocument


def pending_counts(db: Session, manager_id: int, d: date_t) -> dict:
    """Unprocessed requests blocking confirmation of this (manager, date)."""
    pending_requests = db.query(EditRequest).filter(
        EditRequest.manager_id == manager_id,
        EditRequest.date == d,
        EditRequest.status == "pending",
    ).count()
    draft_docs = db.query(HrDocument).filter(
        HrDocument.manager_id == manager_id,
        HrDocument.date == d,
        HrDocument.status == "draft",
    ).count()
    return {"pending_requests": pending_requests, "draft_docs": draft_docs}


def day_state(db: Session, manager_id: int, d: date_t):
    """Returns (state, closure_row_or_None, counts)."""
    closure = db.query(DayApproval).filter_by(manager_id=manager_id, date=d).first()
    counts = pending_counts(db, manager_id, d)
    if not closure:
        return "open", None, counts
    if counts["pending_requests"] or counts["draft_docs"]:
        return "closed", closure, counts
    return "confirmed", closure, counts


def confirmed_pairs(
    db: Session,
    date_from: date_t,
    date_to: date_t,
    manager_ids: Optional[Iterable[int]] = None,
) -> Set[Tuple[int, date_t]]:
    """The (manager_id, date) pairs whose data may be calculated/shown."""
    q = db.query(DayApproval.manager_id, DayApproval.date).filter(
        DayApproval.date >= date_from,
        DayApproval.date <= date_to,
    )
    if manager_ids:
        q = q.filter(DayApproval.manager_id.in_(list(manager_ids)))
    closed = set(q.all())
    if not closed:
        return closed

    pend = db.query(EditRequest.manager_id, EditRequest.date).filter(
        EditRequest.status == "pending",
        EditRequest.date >= date_from,
        EditRequest.date <= date_to,
    ).distinct().all()
    drafts = db.query(HrDocument.manager_id, HrDocument.date).filter(
        HrDocument.status == "draft",
        HrDocument.date >= date_from,
        HrDocument.date <= date_to,
    ).distinct().all()
    return closed - set(pend) - set(drafts)
