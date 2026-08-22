"""
Document history audit — «Hujjatlar tarixi», the cross-document view of who
changed which HR document, when, and whether anything moved that should not
have.

`GET /api/staff/documents/{id}/history` has always existed, but ONE document at
a time: to answer "did anything rejected get approved" you had to open every
document in the register and read its timeline. That is not a check anybody
performs, which is why a backlog of June drafts could be posted in a single
burst on 2026-08-22 and the only trace was eleven Telegram notifications.

This reads `HrDocumentHistory` across every document at once and flags three
shapes. None of them is an error by itself; each is a question worth asking:

  ``revived``   a `rejected` entry followed LATER by an `approved` one. This
                should be IMPOSSIBLE — `_approve_doc` raises on a rejected
                document and the bulk action skips it before calling — so a hit
                here means a guard was bypassed and is the one row to act on.
  ``stale``     posted more than `staff.STALE_APPROVE_DAYS` after its own date.
                Approving a document APPLIES it, so a stale post rewrites a day
                whose attendance was uploaded and confirmed weeks ago. This is
                what happened in June's case, and is now refused outright at
                `_approve_doc` — so new ones cannot appear; the flag exists to
                surface the ones already in the data.
  ``flapped``   approved THREE or more times. A single cancel-and-re-post is
                ordinary — it is how an operator forces a re-apply — so the bar
                is deliberately high: at two, this flagged every document in the
                register and drowned the two flags that mean something.

Read-only. It writes nothing and changes no document: it answers what happened,
and the decision about any row stays a separate, deliberate act.
"""
import logging
from collections import defaultdict
from datetime import date as date_t, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import HrDocument, HrDocumentHistory, Manager
from app.routers.admin import verify_admin

router = APIRouter(prefix="/api/admin/doc-audit", tags=["doc-audit"])

log = logging.getLogger(__name__)

DEFAULT_DAYS = 180


def _parse_date(s: Optional[str]) -> Optional[date_t]:
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid date: {s}")


@router.get("")
def audit(
    date_from: Optional[str] = Query(None, alias="from"),
    date_to:   Optional[str] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin),
):
    """Every HR document in the window whose history carries a flag.

    The window is on the ACTION, not the document's date: the question is what
    somebody did recently, and a June document posted in August is exactly the
    case this exists to surface — bounding on the document's own date would
    hide it.
    """
    from app.routers.staff import STALE_APPROVE_DAYS

    d_to   = _parse_date(date_to) or date_t.today()
    d_from = _parse_date(date_from) or (d_to - timedelta(days=DEFAULT_DAYS))
    if d_from > d_to:
        raise HTTPException(status_code=400, detail="from is after to")

    # History rows are timestamped; the bounds are dates, so take the whole of
    # the closing day rather than cutting it off at midnight.
    hist = db.query(HrDocumentHistory).filter(
        HrDocumentHistory.created_at >= datetime.combine(d_from, datetime.min.time()),
        HrDocumentHistory.created_at <  datetime.combine(d_to + timedelta(days=1), datetime.min.time()),
    ).order_by(HrDocumentHistory.created_at.asc()).all()
    if not hist:
        return _empty(d_from, d_to)

    by_doc: dict[int, list] = defaultdict(list)
    for h in hist:
        by_doc[h.document_id].append(h)

    docs = {
        d.id: d for d in db.query(HrDocument).filter(
            HrDocument.id.in_(list(by_doc)),
        ).all()
    }
    mgr_names = {
        m.id: m.name for m in db.query(Manager).filter(
            Manager.id.in_({d.manager_id for d in docs.values() if d.manager_id}),
        ).all()
    }

    rows = []
    counts = defaultdict(int)
    for doc_id, entries in by_doc.items():
        doc = docs.get(doc_id)
        if doc is None:                       # deleted since — nothing to show
            continue
        actions = [(h.action, h.created_at, h.actor_name) for h in entries]

        flags = []
        seen_reject = False
        for action, _ts, _who in actions:
            if action == "rejected":
                seen_reject = True
            elif action == "approved" and seen_reject:
                flags.append("revived")
                break

        approvals = [(ts, who) for a, ts, who in actions if a == "approved"]
        stale_by = None
        if doc.date and approvals:
            first_ts, _who = approvals[0]
            age = (first_ts.date() - doc.date).days
            if age > STALE_APPROVE_DAYS:
                flags.append("stale")
                stale_by = age

        # A single cancel-and-re-post is ORDINARY here: it is how operators force
        # a document to re-apply, and the 19.08 exchange in the original report
        # shows the pattern four seconds apart. Flagging it marked 158 documents
        # out of 158 — an alarm that fires on normal work teaches people to
        # ignore the two flags that matter. Only a document rewritten its day
        # THREE times or more is worth a second look.
        if len(approvals) >= 3:
            flags.append("flapped")

        if not flags:
            continue
        for f in flags:
            counts[f] += 1

        last = actions[-1]
        rows.append({
            "doc_id":       doc_id,
            "doc_type":     doc.doc_type,
            "date":         doc.date.isoformat() if doc.date else None,
            "status":       doc.status,
            "unit":         mgr_names.get(doc.manager_id, str(doc.manager_id)),
            "created_by":   doc.created_by_name,
            "approved_by":  approvals[0][1] if approvals else None,
            "approved_at":  approvals[0][0].isoformat() if approvals else None,
            "age_days":     stale_by,
            "workers":      len((doc.payload or {}).get("employees") or []),
            "last_action":  last[0],
            "last_at":      last[1].isoformat() if last[1] else None,
            "flags":        flags,
            "timeline":     [{"action": a,
                              "at": ts.isoformat() if ts else None,
                              "by": who} for a, ts, who in actions],
        })

    rows.sort(key=lambda r: (r["last_at"] or "", r["doc_id"]), reverse=True)
    return {
        "from": d_from.isoformat(),
        "to":   d_to.isoformat(),
        "docs_scanned": len(by_doc),
        "rows": rows,
        "summary": {
            "flagged": len(rows),
            "revived": counts["revived"],
            "stale":   counts["stale"],
            "flapped": counts["flapped"],
            "max_age_days": STALE_APPROVE_DAYS,
        },
    }


def _empty(d_from, d_to):
    from app.routers.staff import STALE_APPROVE_DAYS
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "docs_scanned": 0,
            "rows": [], "summary": {"flagged": 0, "revived": 0, "stale": 0,
                                    "flapped": 0, "max_age_days": STALE_APPROVE_DAYS}}
