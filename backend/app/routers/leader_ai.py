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

    refs = _refs_for_uid(db, uid)
    if not refs:
        return {"enabled": True, "tasks": {}}

    out = {}
    for rev in db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(refs.keys())).all():
        out[str(refs[rev.ref])] = _as_verdict(rev)
    return {"enabled": True, "tasks": out}


class ReviewNowIn(BaseModel):
    uid: str
    task_id: int


@router.post("/review-now")
def review_now(body: ReviewNowIn, db: Session = Depends(get_db),
               _: dict = Depends(verify_admin)):
    """Review ONE task's photos right now and return the verdict.

    Deliberately synchronous and deliberately per-task. A whole report is up to
    13 calls, and the free tier's per-MINUTE cap means that would be a
    minute-long request that mostly 429s — whereas one task is a single call an
    admin waits about three seconds for, which is what makes the wait feel like
    an action instead of a queue.
    """
    if not gemini.available():
        raise HTTPException(status_code=400,
                            detail="GEMINI_API_KEY is not set on the server")

    refs = _refs_for_uid(db, body.uid)
    ref = next((r for r, tid in refs.items() if tid == body.task_id), None)
    if ref is None:
        raise HTTPException(status_code=404, detail="Unknown report or task")

    rev = db.query(LeaderAiReview).filter_by(ref=ref).first()
    if rev is None:
        # Never queued — the usual case before the first Refresh has run.
        # Discovery is what decides whether this task is reviewable at all
        # (answered yes, has photos), so let it make that call rather than
        # duplicating the rule here.
        leader_ai.discover(db)
        rev = db.query(LeaderAiReview).filter_by(ref=ref).first()
    if rev is None:
        raise HTTPException(status_code=404, detail="Nothing to review for this task")
    if rev.status in ("ok", "flagged"):
        return {"ok": True, "task": _as_verdict(rev)}  # already judged; never re-spend

    # An admin asking again IS the retry — give a burned-out row its attempts back.
    rev.attempts = 0
    try:
        leader_ai.review_one(db, rev)
    except gemini.GeminiQuotaError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
    db.refresh(rev)
    return {"ok": True, "task": _as_verdict(rev)}


def _refs_for_uid(db: Session, uid: str) -> dict[str, int]:
    """ref → task_id for every task of one report, whichever layer filed it."""
    refs: dict[str, int] = {}
    if uid.startswith("bot-"):
        try:
            day_id = int(uid[4:])
        except ValueError:
            raise HTTPException(status_code=400, detail="Bad uid")
        if not db.query(LeaderTaskDay).filter_by(id=day_id).first():
            return refs
        for e in db.query(LeaderTaskEntry).filter_by(day_id=day_id).all():
            refs[leader_ai.bot_ref(e.id)] = e.task_id
        return refs

    row = None
    if uid.startswith("row-"):
        try:
            row = db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
        except ValueError:
            row = None
    if row is None:
        row = db.query(LeaderChecklist).filter_by(submission_id=uid).first()
    if row is None:
        return refs
    for tk in (row.tasks or []):
        tid = int(tk.get("id") or 0)
        refs[leader_ai.sheet_ref(row, tid)] = tid
    return refs


def _as_verdict(rev: LeaderAiReview) -> dict:
    lo, hi = leader_ai.date_window(rev.date, rev.shift)
    return {
        "status": rev.status,
        "flags": rev.flags or [],
        "imageDate": rev.image_date,
        # The window the verdict was measured against, from the SAME function
        # the checker used — a date flag is only actionable if you can see what
        # the photo was supposed to fall inside, and a second copy of the shift
        # rule in the client would eventually disagree with the backend.
        "expected": f"{lo} — {hi}",
        "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
        "photos": rev.photos,
        "error": rev.error,
        "attempts": rev.attempts,
        "exhausted": (rev.attempts or 0) >= leader_ai.MAX_ATTEMPTS,
        "reviewedAt": rev.reviewed_at.isoformat() if rev.reviewed_at else None,
    }


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
