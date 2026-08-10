"""AI proof-review endpoints for the leader monitoring page.

**Admin-only, deliberately.** This is a pilot: every endpoint here is gated by
`verify_admin`, and the page asks for none of them unless the viewer is an
admin — so a supervisor, leader or top-manager sees the page exactly as it was.

Verdicts are read in three shapes:

* `overview` — flag counts per report uid, for the register's row badge. Small
  by design, so it stays cheap over years of reports.
* `report` — every verdict of ONE report, fetched when its detail modal opens.
* `queue` — the triage feed: one flat, severity-ordered list of everything a
  human still has to decide, with the photos, the window and the criteria all
  inlined. This is what makes review a queue instead of a hunt through the
  register, and it is the only read that carries enough to decide without a
  second request.

A verdict now has a TERMINAL state (`resolution`). Before that, "12 suspect"
meant "12 ever" — the admin re-read the same flags every session and the number
only grew. `resolve` is what empties the queue, and `rejected` is the one
decision that changes a score anywhere.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    LeaderAiReview, LeaderChecklist, LeaderTaskDay, LeaderTaskEntry,
    LeaderTaskMedia, Manager, RoleProfile,
)
from app.routers.admin import verify_admin
from app.services import gemini, leader_ai
from app.services.name_map import relabel_supervisor

router = APIRouter(prefix="/api/leader-ai", tags=["leader-ai"])
log = logging.getLogger(__name__)

# Newest flagged rows resolved into the register's badge map. A cap rather than
# a date filter because the page filters client-side and never tells the server
# its range; newest-first means the badge is always right where anyone is
# actually looking.
FLAG_MAP_CAP = 4000

# How much of the queue one read hands over. The triage screen shows ONE item at
# a time and the rail scrolls, so this is about how far ahead an admin can work
# before a refetch — not about what fits on screen. Generous enough that a day's
# flags always arrive whole; bounded so a first-ever backfill cannot ship
# thousands of rows with their photo lists attached.
QUEUE_CAP = 300


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
    #
    # UNRESOLVED only: once a human has ruled on a flag it stops badging the
    # register. A badge that survives its own decision is a badge that can never
    # reach zero, which is exactly what made the old counter meaningless.
    flagged = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.is_(None))
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
        # How often the human agreed with the machine. For a pilot this is the
        # actual deliverable: at 40% agreement on `not_proven` the criteria text
        # is wrong, not the leaders — and that is a conclusion no amount of
        # reading individual verdicts produces.
        "calibration": _calibration(db),
    }


def _calibration(db: Session) -> dict:
    """Human-vs-machine agreement, overall and per flag type.

    `agreed` = the reviewer confirmed the AI (rejected the proof or asked for a
    new one); `overruled` = the reviewer approved a photo the AI doubted. Only
    RESOLVED rows count — an unread flag is not evidence either way.
    """
    rows = (
        db.query(LeaderAiReview.flags, LeaderAiReview.resolution)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.isnot(None))
        .all()
    )
    per: dict[str, dict[str, int]] = {}
    agreed = 0
    for flags, res in rows:
        hit = res in ("rejected", "requeried")
        agreed += hit
        for f in (flags or ()):
            slot = per.setdefault(f, {"agreed": 0, "total": 0})
            slot["total"] += 1
            slot["agreed"] += hit
    return {
        "resolved": len(rows),
        "agreed": agreed,
        "rate": round(agreed / len(rows) * 100) if rows else None,
        "byFlag": {
            f: {**v, "rate": round(v["agreed"] / v["total"] * 100)}
            for f, v in per.items() if v["total"]
        },
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


@router.get("/queue")
def queue(limit: int = Query(QUEUE_CAP, ge=1, le=QUEUE_CAP),
          db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """The triage feed — everything still awaiting a human decision, ordered by
    how much that decision is worth, with enough context inlined to make it.

    One request, no follow-ups: the reviewer's whole job is "look at the photo,
    compare its clock to the window, decide", and every one of those needs to be
    on screen at once. Splitting the criteria or the leader's own answer into a
    second call is what turned the old flow into a hunt.
    """
    if not gemini.available():
        return {"enabled": False, "items": [], "buckets": {}}

    rows = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.is_(None))
        .order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.desc())
        .limit(FLAG_MAP_CAP)
        .all()
    )
    # Bucket tallies come from the WHOLE unresolved set, not the page — a tab
    # that says "3" must mean three, even when the cap trimmed the list.
    buckets: dict[str, int] = {b: 0 for b in leader_ai.BUCKETS}
    for r in rows:
        buckets[leader_ai.bucket_of(r.flags)] += 1

    # Stable sort: already newest-first, so ranking by severity keeps the newest
    # report at the head of each severity band.
    rows.sort(key=lambda r: leader_ai.severity(r.flags))
    rows = rows[:limit]

    return {
        "enabled": True,
        "items": _hydrate(db, rows),
        "buckets": buckets,
        "total": sum(buckets.values()),
        "capped": sum(buckets.values()) > len(rows),
    }


def _hydrate(db: Session, rows: list[LeaderAiReview]) -> list[dict]:
    """Attach names, photos and the leader's own answer to each verdict.

    Everything is batch-loaded: a 300-row queue that walked one query per row
    would be the slowest read on the platform.
    """
    if not rows:
        return []

    # ── names ────────────────────────────────────────────────────────────────
    prof_ids = {r.leader_id for r in rows if r.leader_id}
    profs = {p.id: p for p in db.query(RoleProfile)
             .filter(RoleProfile.id.in_(prof_ids)).all()} if prof_ids else {}
    mgr_ids = {r.manager_id for r in rows if r.manager_id}
    mgrs = {m.id: m for m in db.query(Manager)
            .filter(Manager.id.in_(mgr_ids)).all()} if mgr_ids else {}

    # ── the bot layer: entry → answer, and its media ids ─────────────────────
    entry_ids = {int(r.ref.split(":")[1]) for r in rows if r.ref.startswith("bot:")}
    entries = {e.id: e for e in db.query(LeaderTaskEntry)
               .filter(LeaderTaskEntry.id.in_(entry_ids)).all()} if entry_ids else {}
    media: dict[int, list[int]] = {}
    if entry_ids:
        for m in (db.query(LeaderTaskMedia)
                  .filter(LeaderTaskMedia.entry_id.in_(entry_ids))
                  .order_by(LeaderTaskMedia.pos).all()):
            media.setdefault(m.entry_id, []).append(m.id)
    day_ids = {e.day_id for e in entries.values()}
    days = {d.id: d for d in db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.id.in_(day_ids)).all()} if day_ids else {}

    # ── the sheet layer: one query for every date in the queue ───────────────
    sheet_rows: dict[tuple[str, str], LeaderChecklist] = {}
    by_submission: dict[str, LeaderChecklist] = {}
    dates = {r.date for r in rows if not r.ref.startswith("bot:")}
    if dates:
        for row in db.query(LeaderChecklist).filter(LeaderChecklist.date.in_(dates)).all():
            sheet_rows[(row.date, (row.leader or "").strip().lower()[:60])] = row
            if row.submission_id:
                by_submission[row.submission_id] = row

    out = []
    for rev in rows:
        leader = supervisor = None
        task: dict = {}
        photos: list[dict] = []
        uid = None

        if rev.ref.startswith("bot:"):
            entry = entries.get(int(rev.ref.split(":")[1]))
            if entry is not None:
                uid = f"bot-{entry.day_id}"
                task = {"done": bool(entry.done), "reason": entry.reason}
                photos = [{"kind": "bot", "id": mid} for mid in media.get(entry.id, [])]
                day = days.get(entry.day_id)
                if day is not None and day.leader_id in profs:
                    leader = profs[day.leader_id].name
        else:
            parts = rev.ref.split(":")
            row = (by_submission.get(parts[1]) if rev.ref.startswith("sheet:")
                   else sheet_rows.get((rev.date, parts[2] if len(parts) > 3 else "")))
            if row is not None:
                uid = leader_ai.row_uid(row)
                leader = row.leader
                supervisor = relabel_supervisor(row.supervisor)
                tk = next((t for t in (row.tasks or [])
                           if int(t.get("id") or 0) == rev.task_id), None)
                if tk:
                    task = {"done": bool(tk.get("done")), "reason": tk.get("reason")}
                    photos = [{"kind": "sheet", "url": p.strip()}
                              for p in (tk.get("photo") or "").split(",")
                              if "http" in p]

        if leader is None and rev.leader_id in profs:
            leader = profs[rev.leader_id].name
        if supervisor is None and rev.manager_id in mgrs:
            supervisor = relabel_supervisor(mgrs[rev.manager_id].name)

        lo, hi = leader_ai.date_window(rev.date, rev.shift)
        out.append({
            "ref": rev.ref,
            "uid": uid,
            "taskId": rev.task_id,
            "taskLabel": leader_ai.task_label(db, rev.task_id),
            "date": rev.date,
            "shift": rev.shift,
            "source": rev.source,
            "leader": leader or "—",
            "supervisor": supervisor or "—",
            "flags": rev.flags or [],
            "bucket": leader_ai.bucket_of(rev.flags),
            "imageDate": rev.image_date,
            "expected": f"{lo} — {hi}",
            "reason": {l: getattr(rev, f"reason_{l}") for l in leader_ai.LANGS},
            # The yardstick the verdict was measured against. Asking a reviewer
            # to agree with a judgment while hiding its criterion is the reason
            # the old card could only ever be taken on faith.
            "criteria": leader_ai.criteria_for(db, rev.task_id, rev.manager_id,
                                               rev.leader_id),
            "leaderDone": task.get("done"),
            "leaderReason": task.get("reason"),
            "photos": photos,
            "reviewedAt": rev.reviewed_at.isoformat() if rev.reviewed_at else None,
        })
    return out


RESOLUTIONS = ("approved", "rejected", "requeried")


class ResolveIn(BaseModel):
    ref: str
    resolution: str = Field(..., pattern="^(approved|rejected|requeried)$")
    note: str | None = None


@router.post("/resolve")
def resolve(body: ResolveIn, db: Session = Depends(get_db),
            admin: dict = Depends(verify_admin)):
    """Record the human decision that takes a flag out of the queue.

    Three outcomes, and only one of them costs anybody anything:
      approved   the AI was wrong — the flag retires, nothing else moves.
      rejected   the AI was right — the task stops counting toward the day
                 (applied as a read-time overlay in routers/leaders.py; the
                 leaders sheet is not ours to write) and the leader is told.
      requeried  the leader is asked to re-file. No penalty yet — this is the
                 humane default when a photo is merely unreadable.

    Idempotent per row: re-deciding overwrites the previous ruling and re-stamps
    the actor, so a correction is a normal action rather than a DB edit.
    """
    rev = db.query(LeaderAiReview).filter_by(ref=body.ref).first()
    if rev is None:
        raise HTTPException(status_code=404, detail="Unknown verdict")
    if rev.status != "flagged":
        raise HTTPException(status_code=400,
                            detail="Only a flagged verdict can be resolved")

    rev.resolution = body.resolution
    rev.resolved_by = (admin.get("full_name") or admin.get("username")
                       or str(admin.get("telegram_id") or "admin"))[:160]
    rev.resolved_at = datetime.now(timezone.utc)
    rev.resolution_note = (body.note or "").strip()[:1000] or None
    db.commit()
    log.info("leader-ai: %s ruled %s on %s", rev.resolved_by, rev.resolution, rev.ref)

    if body.resolution in ("rejected", "requeried"):
        _notify_leader(db, rev)
    return {"ok": True, "ref": rev.ref, "resolution": rev.resolution,
            "counts": leader_ai.counts(db)}


def _notify_leader(db: Session, rev: LeaderAiReview) -> None:
    """Tell the leader their proof did not stand — bell row + DM to every
    account holding the profile, each in its own language.

    A leader whose sheet name never resolved to a profile has nobody to tell;
    the ruling still stands. A failed DM must never roll back the decision,
    which is why this swallows everything.
    """
    if not rev.leader_id:
        return
    try:
        from app.routers.staff import notify_profile
        notify_profile(
            db, f"leader:{rev.leader_id}",
            nkey=("leader_proof_rejected" if rev.resolution == "rejected"
                  else "leader_proof_requeried"),
            params={
                "date": rev.date,
                "task": leader_ai.task_label(db, rev.task_id),
                "by": rev.resolved_by or "—",
            },
            type="warning",
        )
    except Exception:
        log.exception("leader-ai: could not notify leader profile %s", rev.leader_id)


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
        # Queue THIS report only: a full discover() walks every report ever
        # filed and would turn one button press into a half-minute request.
        leader_ai.queue_report(db, **_report_target(db, body.uid))
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


def _report_target(db: Session, uid: str) -> dict:
    """The report behind a uid, as kwargs for `leader_ai.queue_report`."""
    if uid.startswith("bot-"):
        try:
            return {"day": db.query(LeaderTaskDay).filter_by(id=int(uid[4:])).first()}
        except ValueError:
            return {}
    row = None
    if uid.startswith("row-"):
        try:
            row = db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
        except ValueError:
            row = None
    return {"row": row or db.query(LeaderChecklist).filter_by(submission_id=uid).first()}


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
        # The human ruling, so a task card can say "an admin already looked at
        # this and disagreed" instead of re-presenting a decided flag as open.
        "resolution": rev.resolution,
        "resolvedBy": rev.resolved_by,
        "resolvedAt": rev.resolved_at.isoformat() if rev.resolved_at else None,
        "resolutionNote": rev.resolution_note,
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
