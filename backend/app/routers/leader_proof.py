"""The in-app camera the leader shoots proofs with (`proof_kind == "camera"`).

Everything here serves ONE page — `/proof/camera` in the mini-app — and one
rule: the time on a proof photo comes from this server and nowhere else. The
leader's phone never authors it, so editing the phone's clock (which is what
this feature exists to stop) changes nothing anybody is judged by.

Scoping is the leader's OWN roll and nothing else. `?leader=` is typeable, so it
is checked against the leader profiles the calling account actually holds — the
same binding the bot's /tasks flow uses — rather than trusted because the bot
put it in a link. Everything past that check is scoped by the resolved profile,
never by the parameter.
"""
import logging
import re
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app import identity
from app.config import settings
from app.database import get_db
from app.models import (
    LeaderLateProofShot, LeaderTaskDay, LeaderTaskEntry, LeaderTaskPhoto,
    RoleProfile, TelegramUserRole,
)
from app.security import require_auth
from app.routers.admin import _TG_API, _tg_file_meta
from app.services import (
    action_log, leader_close, leader_late_proof, leader_proof, leader_tasks,
)
from app.services.leader_tasks import (
    channel_chat_id, config_name, effective_leader_config,
)

router = APIRouter(tags=["leader-proof"])
log = logging.getLogger(__name__)

# A phone camera at full resolution, before we shrink it. Anything larger than
# this is not a photo from the page — the page encodes what it grabbed off the
# video track — so the cap is a guard against a hand-made request, not a limit
# a leader can hit by taking a picture.
_MAX_UPLOAD = 12 * 1024 * 1024
_JPEG_MAGIC = b"\xff\xd8\xff"

# The page's per-shot idempotency key. Opaque, but bounded and charset-checked
# before it reaches a query — it is client-supplied text going into a lookup and
# a unique index, and nothing here has any use for a key that is not one.
_KEY_OK = re.compile(r"[A-Za-z0-9_.-]+")


# ── who the caller is allowed to be ──────────────────────────────────────────

def _own_leader(db: Session, payload: dict, leader_id: int | None) -> RoleProfile:
    """The leader profile this request may act as, or 404.

    An account can hold SEVERAL leader profiles (the platform's identity rule:
    the profile is the person, and one person may be held by several accounts —
    and one account may hold several profiles). The bot names which one in the
    link; this re-derives the set that account really holds and refuses anything
    outside it. 404 and not 403: whether a leader profile exists is somebody
    else's data.
    """
    held: list[RoleProfile] = []
    for r in (db.query(TelegramUserRole)
              .filter_by(telegram_id=payload.get("sub"), role="leader",
                         status="approved").all()):
        p = (db.query(RoleProfile)
             .filter_by(role="leader", manager_id=r.role_id, name=r.full_name)
             .first())
        if p and p not in held:
            held.append(p)
    # A browser session carries no Telegram role rows of its own; it resolves to
    # the very same profile through the identity module, so the wallet's login
    # reaches the same roll as the bot does.
    if not held:
        pid = identity.viewer_leader_profile_id(db, payload)
        if pid:
            p = db.query(RoleProfile).filter_by(id=pid).first()
            if p:
                held.append(p)
    if not held:
        raise HTTPException(status_code=404, detail="not_a_leader")
    if leader_id is None:
        return held[0]
    for p in held:
        if p.id == leader_id:
            return p
    raise HTTPException(status_code=404, detail="not_a_leader")


def _camera_cfg(db: Session, prof: RoleProfile, task_id: int) -> tuple[dict, dict]:
    """(the whole leader config, this task's entry) — refusing anything that is
    not an ENABLED camera task.

    Checked on every write and not just when the page opens: a task switched
    back to screenshots mid-shift must stop accepting camera shots immediately,
    or the register would carry proofs collected under a rule that no longer
    applies to them.
    """
    cfg = effective_leader_config(db, prof, leader_proof.leader_shift(db, prof))
    entry = cfg.get(task_id)
    if not entry or not entry.get("enabled"):
        raise HTTPException(status_code=404, detail="unknown_task")
    if entry.get("proof_kind") != "camera":
        raise HTTPException(status_code=409, detail="not_a_camera_task")
    return cfg, entry


def _relay(data: bytes):
    """Upload the stamped photo to the archive channel; (file_id, message_id).

    The same bytes round-trip the bot's own proof relay does, and for the same
    reason — the channel copy is the durable one, and the private-chat original
    is never what gets stored. Imported here rather than at module load: the API
    and the bot share a process today, and a top-level import would make this
    router depend on that staying true.
    """
    chan = None
    try:
        from app.database import SessionLocal
        from app.telegram_bot import bot
        with SessionLocal() as s:
            chan = channel_chat_id(s)
        if not chan:
            return None
        sent = bot.send_photo(chan, data)
        fid = max(sent.photo, key=lambda p: p.file_size or 0).file_id
        return fid, sent.message_id
    except Exception:
        log.warning("camera proof relay failed", exc_info=True)
        return None


# ── the clock the page runs on ───────────────────────────────────────────────

@router.get("/api/leader-proof/time")
def proof_time(_: dict = Depends(require_auth)):
    """The server's clock. The page asks for it on open and every few minutes,
    and advances it between answers with a MONOTONIC counter — so a shot's time
    is ours even when it was taken with no signal and the phone's own clock has
    been moved since."""
    now = datetime.now(timezone.utc)
    return {"iso": now.isoformat(), "ms": int(now.timestamp() * 1000)}


# ── what the page opens on ───────────────────────────────────────────────────

def _photo_wire(p: LeaderTaskPhoto) -> dict:
    return {
        "id": p.id, "slot": p.slot,
        "captured_at": p.captured_at.isoformat() if p.captured_at else None,
        "stamp": p.stamp, "late": bool(p.late), "deferred": bool(p.deferred),
    }


@router.get("/api/leader-proof/session")
def proof_session(leader: int | None = Query(None), task: int = Query(...),
                  late: int = Query(0),
                  db: Session = Depends(get_db),
                  payload: dict = Depends(require_auth)):
    """Everything the camera page needs in ONE read: the clock, the task's rule,
    the roll so far, and the leader's other camera tasks.

    The siblings are here rather than behind a second call because they are what
    makes the page finishable: a leader who has just filled one roll should be
    able to start the next task without going back to Telegram and finding the
    right button again.
    """
    prof = _own_leader(db, payload, leader)
    cfg, entry = _camera_cfg(db, prof, task)
    lang = (payload.get("language") or "uz")
    shift = leader_proof.leader_shift(db, prof)
    day = leader_proof.open_day(db, prof, create=False)

    from app.services.leader_tasks import effective_date
    date = effective_date(shift)
    # `open_day` answers None for BOTH "no day yet" and "already closed", so the
    # closed state is read separately — the page must be able to say which.
    stored = (db.query(LeaderTaskDay)
              .filter_by(leader_id=prof.id, date=date).first())
    closed = bool(stored and stored.closed_at)

    photos = leader_proof.roll(db, day.id, task) if day else []
    need = int(entry.get("min_media") or 1)
    # Per-task submission: a SUBMITTED task is as shut as a closed day, and the
    # page has to say which of the two it is — «kun yopilgan» on a task the
    # leader closed themselves an hour ago reads as a bug.
    from app.models import LeaderTaskEntry
    from app.services.leader_close import locked as _locked
    task_entry = (db.query(LeaderTaskEntry)
                  .filter_by(day_id=day.id, task_id=task).first()) if day else None
    task_closed = bool(day and task_entry and task_entry.closed_at)
    cam_ids = [tid for tid, s in cfg.items()
               if s.get("enabled") and s.get("proof_kind") == "camera"]
    have = leader_proof.counts(db, day.id if day else None, cam_ids)
    now = datetime.now(timezone.utc)

    # ── late mode ────────────────────────────────────────────────────────────
    # `?late=1` is a REQUEST, never the authority: the server decides, because
    # the parameter is typeable and because the ordinary payload must stay
    # byte-identical for the camera pilot running right now. When the answer is
    # no, `mode` is absent and the page falls straight through to the ordinary
    # refusal it already renders for a closed task.
    if late:
        lday, lshift, ok = _late_ctx(db, prof, task, entry)
        if ok and lday is not None:
            shots = leader_late_proof.draft_shots(db, lday.id, task)
            return {
                "mode": "late",
                "server": {"iso": now.isoformat(), "ms": int(now.timestamp() * 1000)},
                "leader": {"id": prof.id, "name": prof.name},
                "day": {"date": lday.date, "closed": False, "shift": lshift},
                "task_closed": False,
                "task": {
                    "id": task,
                    "name": config_name(entry, lang),
                    "criteria": entry.get("criteria") or "",
                    # A late filing has no min_media contract — one photo is
                    # enough and the submit refuses none. Serving 1 keeps every
                    # arithmetic the page already does valid (slot 0 is
                    # retake-only, everything above it is an extra) without
                    # forking the roll UI.
                    "min_media": 1,
                    "max_slots": leader_proof.max_slots(
                        int(entry.get("min_media") or 1)),
                    "window": list(entry.get("window") or ()),
                    "date_check": False,
                    "time_check": False,
                    "deadline": leader_close.task_deadline(entry, lshift),
                },
                "photos": [_shot_wire(p) for p in shots],
                "complete": len(shots) >= 1,
                # No siblings: a late filing is one task's errand, and offering
                # to hop to the next camera task from inside it would leave the
                # first one's reason unwritten and its shots unsubmitted.
                "siblings": [],
            }

    return {
        "server": {"iso": now.isoformat(), "ms": int(now.timestamp() * 1000)},
        "leader": {"id": prof.id, "name": prof.name},
        "day": {"date": date, "closed": closed, "shift": shift},
        "task_closed": task_closed,
        "task": {
            "id": task,
            "name": config_name(entry, lang),
            "criteria": entry.get("criteria") or "",
            "min_media": need,
            "max_slots": leader_proof.max_slots(need),
            "window": list(entry.get("window") or ()),
            "date_check": bool(entry.get("date_check", True)),
            "time_check": bool(entry.get("time_check", True)),
        },
        "photos": [_photo_wire(p) for p in photos],
        "complete": len(photos) >= need,
        # Ordered like the bot menu (task id) so the two lists never disagree
        # about which task is "the next one".
        "siblings": [
            {"id": tid, "name": config_name(cfg[tid], lang),
             "min_media": int(cfg[tid].get("min_media") or 1),
             "have": have.get(tid, 0)}
            for tid in sorted(cam_ids)
        ],
    }


# ── writing a shot ───────────────────────────────────────────────────────────

@router.post("/api/leader-proof/photo")
async def post_photo(
    leader: int = Form(...),
    task: int = Form(...),
    captured_ms: int = Form(...),
    phone_ms: int | None = Form(None),
    slot: int | None = Form(None),
    client_key: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Stamp one shot with the server's clock and put it on the roll.

    `captured_ms` is the page's server-derived instant, not `Date.now()` — see
    services/leader_proof. It is clamped to "not in the future" and "not before
    the checklist day began", so a hand-made request cannot back-date a proof
    into a window that has closed or forward-date one into a window that has not
    opened yet. `phone_ms` is what the DEVICE thought the time was, recorded as
    a diagnostic and judged by nothing.

    `slot` present = retake that slot; absent = the next free one.

    `client_key` is the page's id for the SHOT and makes this POST idempotent:
    re-sending one the server already stored answers with the row it wrote
    instead of adding a twin to the roll. Required in practice by the offline
    queue, which cannot tell "never arrived" from "arrived, answer lost" and
    must re-send either way. It is opaque here — never parsed, never trusted
    for anything but equality.
    """
    prof = _own_leader(db, payload, leader)
    _, entry = _camera_cfg(db, prof, task)

    key = (client_key or "").strip()
    if key and (len(key) > 64 or not _KEY_OK.fullmatch(key)):
        raise HTTPException(status_code=400, detail="bad_key")

    data = await file.read()
    if not data or len(data) > _MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="bad_size")
    if not data.startswith(_JPEG_MAGIC):
        # The page encodes exactly one thing. Anything else reaching this
        # endpoint is not a photo it took.
        raise HTTPException(status_code=400, detail="invalid_image")

    now = datetime.now(timezone.utc)
    captured = datetime.fromtimestamp(max(0, int(captured_ms)) / 1000, timezone.utc)
    if captured > now:
        captured = now                      # never ahead of the server's own clock
    day_floor = _day_floor(db, prof)
    if day_floor and captured < day_floor:
        captured = day_floor
    skew = None
    if phone_ms:
        skew = int((int(phone_ms) - int(captured_ms)) / 1000)

    try:
        row = leader_proof.save_photo(
            db, prof=prof, task_id=task, cfg=entry, data=data,
            captured_at=captured, slot=slot, skew_s=skew, relay=_relay,
            client_key=key or None,
        )
    except leader_proof.ProofError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    day = db.query(LeaderTaskDay).filter_by(id=row.day_id).first()
    photos = leader_proof.roll(db, row.day_id, task)
    need = int(entry.get("min_media") or 1)
    _nudge_bot(db, prof, task)

    lines = [("leader", prof.name), ("task", task), ("slot", row.slot),
             ("photos", f"{len(photos)}/{need}")]
    if row.late:
        lines.append(("late", True))
    if row.deferred:
        lines.append(("deferred", True))
    action_log.enrich(
        target_kind="photo", target_id=row.id, target_name=prof.name,
        unit_id=prof.manager_id, day=day.date if day else None, details=lines,
    )
    return {"photo": _photo_wire(row),
            "photos": [_photo_wire(p) for p in photos],
            "complete": len(photos) >= need,
            "day": {"date": day.date if day else None, "closed": False}}


@router.delete("/api/leader-proof/photo/{photo_id}")
def drop_photo(photo_id: int, db: Session = Depends(get_db),
               payload: dict = Depends(require_auth)):
    """Remove an EXTRA shot. A required slot is retaken, never emptied."""
    row = db.query(LeaderTaskPhoto).filter_by(id=photo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    prof = _own_leader(db, payload, row.leader_id)
    _, entry = _camera_cfg(db, prof, row.task_id)
    # Snapshotted before the delete: the row is gone by the time we enrich.
    day_id, task_id, slot = row.day_id, row.task_id, row.slot
    try:
        leader_proof.delete_photo(db, prof=prof, photo=row, cfg=entry)
    except leader_proof.ProofError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    photos = leader_proof.roll(db, day_id, task_id)
    _nudge_bot(db, prof, task_id)
    need = int(entry.get("min_media") or 1)
    action_log.enrich(
        target_kind="photo", target_id=photo_id, target_name=prof.name,
        unit_id=prof.manager_id,
        details=[("leader", prof.name), ("task", task_id), ("slot", slot),
                 ("photos", f"{len(photos)}/{need}")],
    )
    return {"photos": [_photo_wire(p) for p in photos],
            "complete": len(photos) >= need}


@router.get("/api/leader-proof/photo/{photo_id}")
def get_photo(photo_id: int, db: Session = Depends(get_db),
              payload: dict = Depends(require_auth)):
    """Stream one of the caller's OWN shots back — the roll's thumbnails and the
    full-size look before a retake.

    Deliberately narrower than /api/leader-tasks/media/{id}: that one serves
    reviewers and carries the register's whole scoping apparatus. This one only
    ever answers for a photo belonging to a leader profile the caller holds, so
    it needs no page grant and can never widen into one.
    """
    row = db.query(LeaderTaskPhoto).filter_by(id=photo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    _own_leader(db, payload, row.leader_id)
    return _stream_shot(row.file_id)


# ── helpers ──────────────────────────────────────────────────────────────────

def _day_floor(db: Session, prof: RoleProfile) -> datetime | None:
    """The earliest instant the CURRENT checklist day can contain.

    Shift 1's day is the calendar day in Tashkent; shift 2's opens at 17:00 the
    evening before. Used only to clamp a claimed capture time, so a request that
    tried to date a photo into a day that is already scored is pulled back into
    the day it was actually filed against.
    """
    from app.services.leader_tasks import effective_date
    shift = leader_proof.leader_shift(db, prof)
    date = effective_date(shift)
    try:
        start = datetime.strptime(date, "%Y-%m-%d").replace(
            tzinfo=leader_proof.TASHKENT)
    except ValueError:
        return None
    if shift == 2:
        start = start.replace(hour=17)
    return start.astimezone(timezone.utc)


def _nudge_bot(db: Session, prof: RoleProfile, task_id: int) -> None:
    """Re-draw the bot's waiting camera prompt with the new count.

    The leader's attention is in the mini-app, but the message they came FROM is
    still on screen behind it, and the moment they close the camera it is what
    they read. Leaving it saying «0/3» after three shots is the single most
    confusing thing this flow could do, so the counter follows the roll. Best
    effort by design — a failed edit must never fail the save that produced it.
    """
    try:
        from app.telegram_bot import refresh_camera_prompt
        refresh_camera_prompt(db, prof.id, task_id)
    except Exception:
        log.debug("camera prompt refresh skipped", exc_info=True)


def _stream_shot(file_id: str) -> StreamingResponse:
    """Stream one archive-channel photo back to the page.

    Lifted out of `get_photo` when the late door needed the identical thing:
    two copies of "fetch a file_id through the token-hiding proxy" is two places
    to get the caching, the timeout and the 404 wrong.
    """
    meta = _tg_file_meta(file_id)
    url = f"{_TG_API}/file/bot{settings.telegram_bot_token}/{meta['file_path']}"
    try:
        upstream = requests.get(url, stream=True, timeout=60)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Telegram unreachable: {e}")
    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(status_code=404, detail="not_found")

    def _chunks():
        try:
            yield from upstream.iter_content(chunk_size=64 * 1024)
        finally:
            upstream.close()

    # A stored shot never changes — a retake writes a NEW row — so the page may
    # cache it hard, which is what keeps the roll's thumbnails instant.
    return StreamingResponse(
        _chunks(), media_type=meta["mime_type"],
        headers={"Cache-Control": "private, max-age=86400"})


# ── the late door ────────────────────────────────────────────────────────────
#
# A task whose deadline has gone by is LOCKED, so `leader_proof.save_photo`
# refuses it and must go on refusing it — that predicate is the one answer to
# "is this editable" and punching a mode-shaped hole through it would reach far
# past this feature. The late door is therefore a door of its own, sharing
# exactly the parts that must not have a second spelling: `_own_leader` for who
# may act, `_camera_cfg` for whether this unit is enrolled in camera capture,
# `_relay` for the archive copy, `leader_proof.burn` for the stamp, and
# `leader_late_proof.eligible` for whether a late filing is open at all.


def _shot_wire(sh: LeaderLateProofShot) -> dict:
    """A draft shot in the shape the camera page already renders a roll in.

    `late` is TRUE by construction here — that is what this filing IS — and it
    is reported for display only: no deduction hangs off it, because a late
    proof scores nothing until a person says otherwise.
    """
    return {
        "id": sh.id, "slot": sh.slot,
        "captured_at": sh.captured_at.isoformat() if sh.captured_at else None,
        "stamp": sh.stamp, "late": True, "deferred": False,
        "source": sh.source,
    }


def _late_ctx(db: Session, prof: RoleProfile, task_id: int, entry: dict):
    """`(day, shift, open)` for a late filing on this task.

    `open` is TWO conditions and both are needed. `leader_late_proof.eligible`
    is the rule every other door reads. The task being LOCKED is what keeps
    this door from opening in the sliver between the deadline passing and
    `autoclose_due` closing the task — in that gap `eligible` already answers
    True (it permits a task with no entry yet), but the leader can still file
    NORMALLY and their shots still count, so sending them down the late path
    would cost them the point for nothing.
    """
    shift = leader_proof.leader_shift(db, prof)
    day = leader_proof.open_day(db, prof, create=False)
    if day is None:
        return None, shift, False
    task_entry = (db.query(LeaderTaskEntry)
                  .filter_by(day_id=day.id, task_id=task_id).first())
    locked = leader_close.locked(task_entry, day)
    ok = locked and leader_late_proof.eligible(
        db, day=day, task_id=task_id, cfg_entry=entry, shift=shift,
        per_task=leader_tasks.per_task_close(db, prof.manager_id))
    return day, shift, bool(ok)


@router.post("/api/leader-proof/late-photo")
async def post_late_photo(
    leader: int = Form(...),
    task: int = Form(...),
    captured_ms: int = Form(...),
    phone_ms: int | None = Form(None),
    slot: int | None = Form(None),
    client_key: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """One shot for a LATE filing — same stamp, same archive, different home.

    Every guard `post_photo` applies applies here too, in the same order and
    for the same reasons; what differs is only the destination and the fact
    that nothing here ever calls `sync_entry`. That last point is the whole
    safety argument: `sync_entry` at `min_media` writes a DONE entry and
    rebuilds the media the AI reads, so a late shot reaching it would award the
    point with no ruling and send the proof to Gemini.
    """
    prof = _own_leader(db, payload, leader)
    _, entry = _camera_cfg(db, prof, task)
    day, shift, ok = _late_ctx(db, prof, task, entry)
    if not ok:
        raise HTTPException(status_code=409, detail="late_gone")

    key = (client_key or "").strip()
    if key and (len(key) > 64 or not _KEY_OK.fullmatch(key)):
        raise HTTPException(status_code=400, detail="bad_key")

    data = await file.read()
    if not data or len(data) > _MAX_UPLOAD:
        raise HTTPException(status_code=400, detail="bad_size")
    if not data.startswith(_JPEG_MAGIC):
        raise HTTPException(status_code=400, detail="invalid_image")

    now = datetime.now(timezone.utc)
    captured = datetime.fromtimestamp(max(0, int(captured_ms)) / 1000, timezone.utc)
    if captured > now:
        captured = now
    floor = _day_floor(db, prof)
    if floor and captured < floor:
        captured = floor
    skew = int((int(phone_ms) - int(captured_ms)) / 1000) if phone_ms else None

    try:
        row = leader_late_proof.save_shot(
            db, prof=prof, day=day, task_id=task,
            cap=leader_proof.max_slots(int(entry.get("min_media") or 1)),
            data=data, captured_at=captured, slot=slot, skew_s=skew,
            relay=_relay, source="camera", client_key=key or None)
    except (leader_late_proof.ShotError, leader_proof.ProofError) as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    db.commit()

    shots = leader_late_proof.draft_shots(db, day.id, task)
    _nudge_late_bot(db, prof, task)
    action_log.enrich(
        target_kind="photo", target_id=row.id, target_name=prof.name,
        unit_id=prof.manager_id, day=day.date,
        details=[("leader", prof.name), ("task", task), ("slot", row.slot),
                 ("late_shots", len(shots)), ("source", "camera")],
    )
    return {"photo": _shot_wire(row),
            "photos": [_shot_wire(p) for p in shots],
            "complete": len(shots) >= 1,
            "day": {"date": day.date, "closed": False}}


@router.delete("/api/leader-proof/late-photo/{shot_id}")
def drop_late_photo(shot_id: int, db: Session = Depends(get_db),
                    payload: dict = Depends(require_auth)):
    """Drop one draft shot.

    Unlike the on-time roll there is no required slot to protect: a late filing
    has no `min_media` contract, so any shot may go — and the submit refuses an
    empty roll, which is the only floor that matters.
    """
    row = db.query(LeaderLateProofShot).filter_by(id=shot_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    prof = _own_leader(db, payload, row.leader_id)
    _, entry = _camera_cfg(db, prof, row.task_id)
    day, _shift, ok = _late_ctx(db, prof, row.task_id, entry)
    if not ok or day is None or day.id != row.day_id:
        raise HTTPException(status_code=409, detail="late_gone")
    day_id, task_id, slot = row.day_id, row.task_id, row.slot
    leader_late_proof.delete_shot(db, row)
    db.commit()
    shots = leader_late_proof.draft_shots(db, day_id, task_id)
    _nudge_late_bot(db, prof, task_id)
    action_log.enrich(
        target_kind="photo", target_id=shot_id, target_name=prof.name,
        unit_id=prof.manager_id,
        details=[("leader", prof.name), ("task", task_id), ("slot", slot),
                 ("late_shots", len(shots))],
    )
    return {"photos": [_shot_wire(p) for p in shots],
            "complete": len(shots) >= 1}


@router.get("/api/leader-proof/late-photo/{shot_id}")
def get_late_photo(shot_id: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    """Stream back one of the caller's OWN draft shots — same narrow scope as
    `get_photo`: a photo belonging to a leader profile this account holds."""
    row = db.query(LeaderLateProofShot).filter_by(id=shot_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="not_found")
    _own_leader(db, payload, row.leader_id)
    return _stream_shot(row.file_id)


def _nudge_late_bot(db: Session, prof: RoleProfile, task_id: int) -> None:
    """Re-draw the bot's late screen with the new count.

    Deliberately NOT a widening of `refresh_camera_prompt`'s `stage="camera"`
    filter: that one re-renders the ordinary task view, which for a LOCKED task
    takes the early-return locked branch and would repaint the outcome screen
    over the late one the leader is working in.
    """
    try:
        from app.telegram_bot import refresh_late_screen
        refresh_late_screen(db, prof.id, task_id)
    except Exception:
        log.debug("late screen refresh skipped", exc_info=True)
