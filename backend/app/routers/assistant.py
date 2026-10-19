"""«Yordamchi» — the AI assistant's HTTP surface (services/assistant.py).

Who may use it: whoever holds the ``assistant`` page — admin-only by default,
opened per role on the Access tab when the operator decides (2026-10-05:
"only visible for admins for now") — plus any tab an admin opened AS somebody
else (the ``imp`` claim), which is how the operator tests it inside another
person's permissions. Never inside an exam: an assistant that can read every
page would sit the exam for the leader.

Chats belong to the acting PROFILE and, in an «open as» tab, to the admin who
opened it as well — so a test chat never appears in the real person's list.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import viewer_profile_key
from app.models import AssistantFile, AssistantMessage, AssistantRun, AssistantThread
from app.permissions import page_allowed
from app.security import require_auth
from app.services import action_log
from app.services import assistant as engine
from app.services import assistant_api
from app.services import assistant_files as files
from app.services import assistant_ai as ai

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

MAX_TEXT = 8000
MAX_CONTEXT = 8000
PER_OWNER_ACTIVE = 2
GLOBAL_ACTIVE = 8
MAX_AUDIO = 4 * 1024 * 1024


# ── who ──────────────────────────────────────────────────────────────────────

def _allowed(db: Session, payload: dict) -> bool:
    if payload.get("imp"):
        return True
    return page_allowed(db, payload, "assistant")


def _owner(db: Session, payload: dict) -> tuple[str, Optional[str]]:
    key = viewer_profile_key(db, payload) or f"tg:{payload.get('sub')}"
    imp = payload.get("imp") or {}
    opened_by = str(imp.get("sub")) if isinstance(imp, dict) and imp.get("sub") else None
    return key, opened_by


def _gate(request: Request, db: Session, payload: dict) -> tuple[str, Optional[str]]:
    if request.headers.get("X-Exam-Attempt"):
        raise HTTPException(status_code=403, detail="exam")
    if not _allowed(db, payload):
        raise HTTPException(status_code=403, detail="no_access")
    return _owner(db, payload)


def _ctx(request: Request, payload: dict, owner: str, opened_by: Optional[str]) -> engine.Ctx:
    headers = {}
    for h in assistant_api.FORWARD:
        v = request.headers.get(h)
        if v:
            headers[h] = v
    return engine.Ctx(payload, headers, owner, opened_by)


def _own_thread(db: Session, tid: int, owner: str, opened_by: Optional[str]) -> AssistantThread:
    t = db.get(AssistantThread, tid)
    if t is None or t.owner_key != owner or (t.opened_by or None) != (opened_by or None):
        raise HTTPException(status_code=404, detail="not_found")
    return t


def _iso(d: Optional[datetime]) -> Optional[str]:
    if d is None:
        return None
    return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()


def _msg_out(m: AssistantMessage) -> dict:
    return {"id": m.id, "role": m.role, "text": m.text or "", "data": m.data or {},
            "run_id": m.run_id, "created_at": _iso(m.created_at), "updated_at": _iso(m.updated_at)}


# ── reading ──────────────────────────────────────────────────────────────────

@router.get("/me")
def me(request: Request, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    allowed = _allowed(db, payload) and not request.headers.get("X-Exam-Attempt")
    return {
        "allowed": bool(allowed),
        "configured": ai.available(),
        "voice": ai.voice_available(),
        "model": ai.model_now(),
        "can_configure": payload.get("role") == "admin" and not payload.get("imp"),
        "impersonated": bool(payload.get("imp")),
        "web": bool(payload.get("web")),
    }


@router.get("/threads")
def threads(request: Request, db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    q = db.query(AssistantThread).filter(AssistantThread.owner_key == owner)
    q = q.filter(AssistantThread.opened_by == opened_by) if opened_by else \
        q.filter(AssistantThread.opened_by.is_(None))
    rows = q.order_by(AssistantThread.updated_at.desc()).limit(200).all()
    # A run nobody drives that can no longer be picked up is not «working».
    active = {r.thread_id for r in db.query(AssistantRun)
              .filter(AssistantRun.owner_key == owner,
                      AssistantRun.status.in_(("running", "executing", "awaiting_confirm"))).all()
              if r.status == "awaiting_confirm" or not engine.stale(r) or engine._resumable(r)}
    return [{"id": t.id, "title": t.title or "", "updated_at": _iso(t.updated_at),
             "active": t.id in active} for t in rows]


@router.get("/threads/{tid}")
def thread(tid: int, request: Request, db: Session = Depends(get_db),
           payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    t = _own_thread(db, tid, owner, opened_by)
    run = (db.query(AssistantRun).filter(AssistantRun.thread_id == t.id)
           .order_by(AssistantRun.id.desc()).first())
    if run is not None:
        # The chat polls this every second while a run works, so this is
        # where a run whose process went away (a deploy) is picked up again —
        # with the poller's own session, which is the run owner's.
        ctx = _ctx(request, payload, owner, opened_by)
        engine.revive(db, run, ctx, lambda coro: anyio.from_thread.run_sync(engine.spawn, coro))
    msgs = (db.query(AssistantMessage).filter(AssistantMessage.thread_id == t.id)
            .order_by(AssistantMessage.id.asc()).all())
    return {"thread": {"id": t.id, "title": t.title or "", "updated_at": _iso(t.updated_at)},
            "messages": [_msg_out(m) for m in msgs],
            "run": (_run_out(run, msgs) if run else None)}


def _run_out(run: AssistantRun, msgs: list) -> dict:
    out = {"id": run.id, "status": run.status, "elapsed_s": _elapsed(run, msgs)}
    if run.status in engine.ACTIVE:
        m = next((x for x in msgs if x.id == run.message_id), None)
        out.update(engine.live_state(run, (m.data or {}) if m is not None else {}))
    return out


def _elapsed(run: AssistantRun, msgs: list) -> Optional[int]:
    """How long the reply has been worked on, by the SERVER's clock — the
    page ticks it on from here, so a phone whose clock is off still counts
    right. From the run's start, or from the Confirm (`since`) once a plan
    was approved. None at rest."""
    if run.status not in ("running", "executing"):
        return None
    since = None
    m = next((x for x in msgs if x.id == run.message_id), None)
    raw = (m.data or {}).get("since") if m is not None else None
    if raw:
        try:
            since = datetime.fromisoformat(raw)
        except (TypeError, ValueError):
            since = None
    since = since or run.created_at
    if since is None:
        return None
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    return max(0, int((datetime.now(timezone.utc) - since).total_seconds()))


@router.delete("/threads/{tid}")
def delete_thread(tid: int, request: Request, db: Session = Depends(get_db),
                  payload: dict = Depends(require_auth)):
    """The author deletes their OWN chat. (Deleting records is off-limits to
    the ASSISTANT; a person clearing their own conversation is not that.)"""
    owner, opened_by = _gate(request, db, payload)
    t = _own_thread(db, tid, owner, opened_by)
    for r in db.query(AssistantRun).filter(AssistantRun.thread_id == t.id).all():
        r.cancel_asked = True
    db.query(AssistantFile).filter(AssistantFile.thread_id == t.id).delete(synchronize_session=False)
    db.delete(t)
    db.commit()
    return {"ok": True}


# ── talking ──────────────────────────────────────────────────────────────────

class MessageIn(BaseModel):
    thread_id: Optional[int] = None
    text: str = Field(default="", max_length=MAX_TEXT)
    attachments: list[int] = Field(default_factory=list)
    voice: Optional[dict] = None
    context: Optional[dict] = None


@router.post("/messages")
async def send(body: MessageIn, request: Request, db: Session = Depends(get_db),
               payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    if not ai.available():
        raise HTTPException(status_code=409, detail="not_configured")
    text = (body.text or "").strip()
    att_ids = [int(a) for a in body.attachments[:files.MAX_PER_MESSAGE]]
    if not text and not att_ids:
        raise HTTPException(status_code=400, detail="empty")
    context = body.context or {}
    if len(json.dumps(context, ensure_ascii=False, default=str)) > MAX_CONTEXT:
        context = {k: context.get(k) for k in ("path", "search", "title", "lang") if k in context}

    # A run whose process went away (a deploy) must not hold a slot forever:
    # the caller's own such runs are picked up again with their session, and
    # anybody else's is ended once it is past picking up. A stale run that
    # still waits for its owner holds no global slot meanwhile.
    ctx = _ctx(request, payload, owner, opened_by)
    for r in db.query(AssistantRun).filter(AssistantRun.status.in_(engine.ACTIVE)).all():
        th = db.get(AssistantThread, r.thread_id) if r.owner_key == owner else None
        if th is not None and (th.opened_by or None) == (opened_by or None):
            engine.revive(db, r, ctx, engine.spawn)  # only with the session it started in
        else:
            engine.heal(db, r)
    active = db.query(AssistantRun).filter(AssistantRun.status.in_(engine.ACTIVE)).all()
    busy_global = sum(1 for r in active if not engine.stale(r))
    busy_owner = sum(1 for r in active if r.owner_key == owner)
    if busy_owner >= PER_OWNER_ACTIVE or busy_global >= GLOBAL_ACTIVE:
        raise HTTPException(status_code=429, detail="busy")

    if body.thread_id:
        t = _own_thread(db, body.thread_id, owner, opened_by)
        last = (db.query(AssistantRun).filter(AssistantRun.thread_id == t.id)
                .order_by(AssistantRun.id.desc()).first())
        if last is not None:
            if last.status in engine.ACTIVE:
                raise HTTPException(status_code=409, detail="running")
            if last.status == "awaiting_confirm":
                engine.cancel_plan(db, last, "superseded")
    else:
        title = text or (f"#{att_ids[0]}" if att_ids else "")
        t = AssistantThread(owner_key=owner, opened_by=opened_by,
                            title=(title.splitlines()[0] if title else "")[:80])
        db.add(t)
        db.flush()

    att_rows = (db.query(AssistantFile)
                .filter(AssistantFile.id.in_(att_ids), AssistantFile.owner_key == owner).all()
                if att_ids else [])
    for f in att_rows:
        f.thread_id = t.id
    voice = None
    if isinstance(body.voice, dict):
        try:
            voice = {"seconds": max(0, min(int(body.voice.get("seconds") or 0), 600))}
        except (TypeError, ValueError):
            voice = {"seconds": 0}
    um = AssistantMessage(thread_id=t.id, role="user", text=text,
                          data={"attachments": [files.meta(f) for f in att_rows],
                                **({"voice": voice} if voice else {})})
    db.add(um)
    db.flush()
    am = AssistantMessage(thread_id=t.id, role="assistant", text="",
                          data={"status": "running", "thinking": True, "steps": []})
    db.add(am)
    db.flush()
    parts = engine.user_parts(db, text, [f.id for f in att_rows], owner, voice)
    contents = engine._history(db, t.id, um.id) + [{"role": "user", "parts": parts}]
    run = AssistantRun(thread_id=t.id, message_id=am.id, owner_key=owner, status="running",
                       contents=contents, context=context, usage={}, model=ai.model_now())
    db.add(run)
    db.flush()
    am.run_id = run.id
    t.updated_at = datetime.now(timezone.utc)
    db.commit()

    engine.spawn(engine.drive(run.id, ctx))
    return {"thread_id": t.id, "run_id": run.id,
            "user_message": _msg_out(um), "assistant_message": _msg_out(am)}


def _own_run(db: Session, rid: int, owner: str, opened_by: Optional[str]) -> AssistantRun:
    r = db.get(AssistantRun, rid)
    if r is None or r.owner_key != owner:
        raise HTTPException(status_code=404, detail="not_found")
    _own_thread(db, r.thread_id, owner, opened_by)
    return r


class ConfirmIn(BaseModel):
    approve: list[int] = Field(default_factory=list)


@router.post("/runs/{rid}/confirm")
async def confirm(rid: int, body: ConfirmIn, request: Request, db: Session = Depends(get_db),
                  payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    run = _own_run(db, rid, owner, opened_by)
    if run.status != "awaiting_confirm":
        raise HTTPException(status_code=409, detail="not_waiting")
    if not body.approve:
        engine.cancel_plan(db, run, "cancelled")
        return {"ok": True, "status": "cancelled"}
    lease = engine.begin_execute(db, run, body.approve)
    if not lease:  # a second tap, or another tab, already confirmed it
        raise HTTPException(status_code=409, detail="not_waiting")
    engine.spawn(engine.execute_and_resume(run.id, _ctx(request, payload, owner, opened_by), lease))
    return {"ok": True, "status": "executing"}


@router.post("/runs/{rid}/cancel")
def cancel(rid: int, request: Request, db: Session = Depends(get_db),
           payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    run = _own_run(db, rid, owner, opened_by)
    if run.status == "awaiting_confirm":
        engine.cancel_plan(db, run, "cancelled")
        return {"ok": True, "status": "cancelled"}
    if run.status in engine.ACTIVE:
        run.cancel_asked = True
        db.commit()
        # A run no process drives any more is recorded stopped right here.
        if engine.stale(run) and engine.end_stale(db, run, stopped=True):
            return {"ok": True, "status": "cancelled"}
        # Thinking: cut it now — the task would otherwise read the flag only
        # after the Gemini call it waits on came back, minutes later. Making
        # confirmed changes: never cut mid-change — it stops before the next.
        if run.status == "running":
            anyio.from_thread.run_sync(engine.stop_now, run.id)
        return {"ok": True, "status": "stopping"}
    return {"ok": True, "status": run.status}


# ── files ────────────────────────────────────────────────────────────────────

@router.post("/files")
async def upload(request: Request, file: UploadFile = File(...),
                 db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    data = await file.read(files.MAX_UPLOAD + 1)
    if len(data) > files.MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="too_large")
    if not data:
        raise HTTPException(status_code=400, detail="empty")
    mime = files.sniff(file.filename or "", data, file.content_type or "")
    if not mime:
        raise HTTPException(status_code=415, detail="unsupported")
    f = files.store(db, owner_key=owner, opened_by=opened_by, thread_id=None, kind="upload",
                    name=file.filename or "file", mime=mime, data=data)
    db.commit()
    return files.meta(f)


def _own_file(db: Session, fid: int, owner: str, opened_by: Optional[str]) -> AssistantFile:
    f = db.get(AssistantFile, fid)
    if f is None or f.owner_key != owner or (f.opened_by or None) != (opened_by or None):
        raise HTTPException(status_code=404, detail="not_found")
    return f


@router.get("/files/{fid}")
def download(fid: int, request: Request, inline: int = 0, db: Session = Depends(get_db),
             payload: dict = Depends(require_auth)):
    owner, opened_by = _gate(request, db, payload)
    f = _own_file(db, fid, owner, opened_by)
    disp = "inline" if (inline and f.mime.startswith("image/")) else "attachment"
    ascii_name = f.name.encode("ascii", "ignore").decode() or "file"
    return Response(content=bytes(f.data), media_type=f.mime, headers={
        "Content-Disposition": f"{disp}; filename=\"{ascii_name}\"; "
                               f"filename*=UTF-8''{quote(f.name)}",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
    })


@router.post("/files/{fid}/telegram")
def send_to_telegram(fid: int, request: Request, db: Session = Depends(get_db),
                     payload: dict = Depends(require_auth)):
    """Inside Telegram a web view cannot save a download — the bot DMs it."""
    owner, opened_by = _gate(request, db, payload)
    f = _own_file(db, fid, owner, opened_by)
    from app.telegram_bot import bot
    try:
        bot.send_document(chat_id=int(payload["sub"]), document=(f.name, bytes(f.data)))
    except Exception as exc:
        log.warning("assistant: DM of file %s failed: %s", fid, exc)
        raise HTTPException(status_code=502, detail="telegram_failed")
    return {"ok": True}


@router.post("/transcribe")
async def transcribe(request: Request, audio: UploadFile = File(...), lang: str = Form("uz"),
                     db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    _gate(request, db, payload)
    data = await audio.read(MAX_AUDIO + 1)
    if len(data) > MAX_AUDIO:
        raise HTTPException(status_code=413, detail="too_long")
    if len(data) < 2000:
        raise HTTPException(status_code=400, detail="too_short")
    mime = (audio.content_type or "audio/wav").split(";")[0]
    if not mime.startswith("audio/"):
        raise HTTPException(status_code=415, detail="unsupported")
    try:
        text = await ai.transcribe(data, mime, lang)
    except ai.AssistantAIError as exc:
        raise HTTPException(status_code=409 if exc.code == "no_key" else 502, detail=exc.code)
    return {"text": text}


# ── settings (admins) ────────────────────────────────────────────────────────
# The assistant's key and model are chosen on the admin «AI kalitlari» tab now
# (from 2026-10-19 — services/ai_features, features «assistant» and «voice»).
# `GET /settings` stays for a tab still open on an older bundle; the key door
# (`PUT /settings`) is gone with the card that used it.

def _admin_only(payload: dict) -> None:
    if payload.get("role") != "admin" or payload.get("imp"):
        raise HTTPException(status_code=403, detail="admin_only")


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    _admin_only(payload)
    a = ai.current()
    v = ai.voice_current()
    start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    runs = db.query(AssistantRun).filter(AssistantRun.created_at >= start).all()
    tokens = 0
    for r in runs:
        u = r.usage or {}
        tokens += int(u.get("prompt") or 0) + int(u.get("output") or 0) + int(u.get("thoughts") or 0)
    return {
        "key_source": "own" if a.key else "none",
        "own_preview": f"····{a.hint}" if a.hint else "",
        "model": a.model, "voice_model": v.model,
        "month": {"replies": len(runs),
                  "people": len({r.owner_key for r in runs}),
                  "tokens": tokens},
        "moved_to": "/admin/upload?tab=aikeys",
    }
