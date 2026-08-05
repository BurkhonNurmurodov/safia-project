"""AI proof-review endpoints for the leader monitoring page.

**Admin-only, deliberately.** This is a pilot: every endpoint here is gated by
`verify_admin`, and the page asks for none of them unless the viewer is an
admin — so a supervisor, leader or top-manager sees the page exactly as it was.

Verdicts are read in two shapes: an `overview` the register uses to badge rows
(flag counts only, so the payload stays small over years of reports) and a
per-report `report` the detail modal fetches when it opens.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    LeaderAiReview, LeaderChecklist, LeaderTaskDay, LeaderTaskEntry,
)
from app.routers.admin import verify_admin
from app.services import gemini, leader_ai

router = APIRouter(prefix="/api/leader-ai", tags=["leader-ai"])
log = logging.getLogger(__name__)

# Newest flagged rows resolved into the register's badge map. A cap rather than
# a date filter because the page filters client-side and never tells the server
# its range; newest-first means the badge is always right where anyone is
# actually looking.
FLAG_MAP_CAP = 4000


def _bot_uid_map(db: Session, entry_ids: set[int]) -> dict[int, str]:
    """bot entry id → the uid /api/leaders prints for its day."""
    if not entry_ids:
        return {}
    entries = db.query(LeaderTaskEntry).filter(LeaderTaskEntry.id.in_(entry_ids)).all()
    return {e.id: f"bot-{e.day_id}" for e in entries}


def _sheet_uid_map(db: Session, refs: set[str]) -> dict[str, str]:
    """sheet ref → uid. A ref built on a submission id already IS the uid; one
    built on date+leader has to be resolved back to a live row, because the uid
    for those is the (recycled) row id."""
    out: dict[str, str] = {}
    dated = [r for r in refs if r.startswith("sheetd:")]
    for ref in refs:
        if ref.startswith("sheet:"):
            out[ref] = ref.split(":", 2)[1]
    if dated:
        dates = {r.split(":")[1] for r in dated}
        rows = db.query(LeaderChecklist).filter(LeaderChecklist.date.in_(dates)).all()
        by_key = {(r.date, (r.leader or "").strip().lower()[:60]): r for r in rows}
        for ref in dated:
            parts = ref.split(":")
            row = by_key.get((parts[1], parts[2] if len(parts) > 3 else ""))
            if row is not None:
                out[ref] = leader_ai.row_uid(row)
    return out


@router.get("/overview")
def overview(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Queue state + flag counts per report uid. Only reports that actually
    carry a flag are listed — a clean report contributes nothing to the map."""
    if not gemini.available():
        return {"enabled": False, "counts": {}, "flags": {}}

    # ONLY flagged rows are resolved to uids. The pending queue is a backfill of
    # everything ever filed — tens of thousands of rows — and loading it on
    # every page open would be the most expensive query on the page for a
    # number that `counts` already reports in one aggregate.
    flagged = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged")
        .order_by(LeaderAiReview.date.desc())
        .limit(FLAG_MAP_CAP)
        .all()
    )

    bot_uid = _bot_uid_map(
        db, {int(r.ref.split(":")[1]) for r in flagged if r.ref.startswith("bot:")}
    )
    sheet_uid = _sheet_uid_map(
        db, {r.ref for r in flagged if not r.ref.startswith("bot:")}
    )

    flags: dict[str, int] = {}
    for rev in flagged:
        uid = (bot_uid.get(int(rev.ref.split(":")[1]))
               if rev.ref.startswith("bot:") else sheet_uid.get(rev.ref))
        if uid:
            flags[uid] = flags.get(uid, 0) + 1

    return {
        "enabled": True,
        "model": settings.gemini_model,
        "counts": leader_ai.counts(db),
        "flags": flags,
    }


@router.get("/report")
def report(uid: str = Query(...), db: Session = Depends(get_db),
           _: dict = Depends(verify_admin)):
    """Every verdict for one report, keyed by task id — what the detail modal
    renders inside each task card."""
    if not gemini.available():
        return {"enabled": False, "tasks": {}}

    refs: dict[str, int] = {}  # ref → task_id
    if uid.startswith("bot-"):
        try:
            day_id = int(uid[4:])
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad uid")
        day = db.query(LeaderTaskDay).filter_by(id=day_id).first()
        if not day:
            return {"enabled": True, "tasks": {}}
        for e in db.query(LeaderTaskEntry).filter_by(day_id=day_id).all():
            refs[leader_ai.bot_ref(e.id)] = e.task_id
    else:
        row = None
        if uid.startswith("row-"):
            try:
                row = db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
            except ValueError:
                row = None
        if row is None:
            row = db.query(LeaderChecklist).filter_by(submission_id=uid).first()
        if row is None:
            return {"enabled": True, "tasks": {}}
        for tk in (row.tasks or []):
            tid = int(tk.get("id") or 0)
            refs[leader_ai.sheet_ref(row, tid)] = tid

    if not refs:
        return {"enabled": True, "tasks": {}}

    out = {}
    for rev in db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(refs.keys())).all():
        out[str(refs[rev.ref])] = {
            "status": rev.status,
            "flags": rev.flags or [],
            "imageDate": rev.image_date,
            "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
            "photos": rev.photos,
            "error": rev.error,
            "attempts": rev.attempts,
            "exhausted": (rev.attempts or 0) >= leader_ai.MAX_ATTEMPTS,
            "reviewedAt": rev.reviewed_at.isoformat() if rev.reviewed_at else None,
        }
    return {"enabled": True, "tasks": out}


@router.post("/run")
def run(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Queue anything new and start draining. Returns immediately — a backlog
    takes far longer than a request may — so the page polls `overview`."""
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")
    added = leader_ai.discover(db)
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "queued": added, "counts": leader_ai.counts(db)}


@router.post("/retry")
def retry(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Give exhausted rows their attempts back. The usual cause of a stuck row
    is a fixable server-side condition (photo permissions, a missing bot token),
    so there has to be a way to re-run them without touching the database."""
    n = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "error")
        .update({"attempts": 0, "status": "pending"}, synchronize_session=False)
    )
    db.commit()
    leader_ai.run_async(discover_first=False)
    return {"ok": True, "reset": n}
