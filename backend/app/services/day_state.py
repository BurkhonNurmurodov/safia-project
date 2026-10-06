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

from app.models import DayApproval, EditRequest, HrDocument, LiveDeletion, LiveDocument
from app.services.live_day import LIVE_FROM

# The doc types that hold a day back — an explicit whitelist, deliberately
# spelled out here and imported from nowhere. This module is the leaf EVERY
# dashboard, KPI, heatmap and export passes through on its way to "may this day
# be shown", so it must not be able to fail because a module above it is
# missing or half-imported. The narrowing is the point and must stay: a
# doc_type nobody has thought about here defaults to being IGNORED, never to
# taking a live (manager, date) pair out of every number on the platform.
# Add a new attendance-touching type to this tuple by hand.
_REAL_DOC_TYPES = ("people_exchange", "role_change")


def pending_counts(db: Session, manager_id: int, d: date_t) -> dict:
    """Unprocessed requests blocking confirmation of this (manager, date)."""
    pending_requests = db.query(EditRequest).filter(
        EditRequest.manager_id == manager_id,
        EditRequest.date == d,
        EditRequest.status == "pending",
    ).count()
    # Only a document that actually rewrites attendance holds a day back:
    # anything else filed on a live (manager, date) pair would take that day out
    # of the загрузка, every KPI, every heatmap and every export.
    draft_docs = db.query(HrDocument).filter(
        HrDocument.manager_id == manager_id,
        HrDocument.date == d,
        HrDocument.status == "draft",
        HrDocument.doc_type.in_(_REAL_DOC_TYPES),
    ).count()
    # A LIVE day (from `live_day.LIVE_FROM`) files its requests in the live
    # tables — the same two kinds, the same meaning. Before the floor those
    # tables hold only /staff-live's test filings and are never read here.
    if d >= LIVE_FROM:
        pending_requests += db.query(LiveDeletion).filter(
            LiveDeletion.manager_id == manager_id,
            LiveDeletion.day == d,
            LiveDeletion.status == "pending",
        ).count()
        draft_docs += db.query(LiveDocument).filter(
            LiveDocument.manager_id == manager_id,
            LiveDocument.day == d,
            LiveDocument.status == "draft",
            LiveDocument.doc_type.in_(_REAL_DOC_TYPES),
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
    # Same rule as pending_counts, and for the same reason: a document outside
    # the whitelist must never subtract a (manager, date) pair from the set the
    # dashboards are computed over.
    drafts = db.query(HrDocument.manager_id, HrDocument.date).filter(
        HrDocument.status == "draft",
        HrDocument.date >= date_from,
        HrDocument.date <= date_to,
        HrDocument.doc_type.in_(_REAL_DOC_TYPES),
    ).distinct().all()
    held = set(pend) | set(drafts)
    if date_to >= LIVE_FROM:
        lo = max(date_from, LIVE_FROM)
        held |= set(db.query(LiveDeletion.manager_id, LiveDeletion.day).filter(
            LiveDeletion.status == "pending",
            LiveDeletion.day >= lo,
            LiveDeletion.day <= date_to,
        ).distinct().all())
        held |= set(db.query(LiveDocument.manager_id, LiveDocument.day).filter(
            LiveDocument.status == "draft",
            LiveDocument.day >= lo,
            LiveDocument.day <= date_to,
            LiveDocument.doc_type.in_(_REAL_DOC_TYPES),
        ).distinct().all())
    return closed - held
