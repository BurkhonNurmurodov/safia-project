"""The appeal chat — one conversation per objection or late proof.

From 2026-09-26 (the operator's directive) both appeal queues on /leaders open
into a thread: the ruling buttons of whoever may rule at that stage, then the
evidence (the proof photos and the AI's reason — or, for a late proof, its
photos and how late it was), then the chat. `services/leader_appeal_chat.py`
is the definition of the conversation; this module is its HTTP surface:

    GET    /leaders/{disputes|late-proofs}/{id}/thread          the card + rights
    GET    /leaders/{disputes|late-proofs}/{id}/messages        the thread
    POST   /leaders/{disputes|late-proofs}/{id}/messages        text + files
    PUT    /leaders/{disputes|late-proofs}/{id}/messages/{mid}  edit own
    DELETE /leaders/{disputes|late-proofs}/{id}/messages/{mid}  delete own
    GET    /leaders/{disputes|late-proofs}/{id}/files/{fid}     one attachment

The paths sit under the two queues' own prefixes on purpose: the exam sandbox
rewrites every request under `/api/leaders/disputes` and `/api/leaders/late-
proofs`, so an examinee opening a fixture's chat can never read — let alone
write into — a real one.

Authority is per ROW, never per page. READING follows the queues' own scope
(admin all; a brigadir their unit; a leader their own; shift / top managers and
a «see all» page grant read). WRITING is the three parties only — the leader,
the unit's brigadir, an admin — and only while a ruling is still to be made.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import page_scope_is_all
from app.database import get_db
from app.models import (
    LeaderAiDispute, LeaderAppealFile, LeaderAppealMessage, LeaderLateProof,
    Manager,
)
from app.routers.leaders import (
    _attach_chat, _dispute_items, _dispute_stage_rights, _lp_item,
    _lp_stage_rights, appeal_body, relay_uploads,
)
from app.security import require_auth
from app.services import (
    action_log, leader_appeal_chat as chat, leader_dispute, leader_late_proof,
    leader_reports,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["leader-appeals"])


# ── the row and who may do what with it ──────────────────────────────────────

def _row(db: Session, thread: str, rid: int):
    model = LeaderAiDispute if thread == chat.DISPUTE else LeaderLateProof
    row = db.query(model).filter_by(id=rid).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    return row


def _open(thread: str, row) -> bool:
    states = (leader_dispute.OPEN_STATES if thread == chat.DISPUTE
              else leader_late_proof.OPEN_STATES)
    return row.status in states


def _is_unit_sup(payload: dict, row) -> bool:
    return (payload.get("role") == "supervisor" and row.manager_id is not None
            and int(payload.get("role_id") or 0) == int(row.manager_id))


def _is_leader(db: Session, payload: dict, row) -> bool:
    return (payload.get("role") == "leader" and row.leader_id is not None
            and int(row.leader_id) in set(
                identity.viewer_leader_profile_ids(db, payload) or []))


def _can_read(db: Session, payload: dict, row) -> bool:
    role = payload.get("role")
    if role == "admin" or role in ("shift-manager", "top-manager"):
        return True
    if page_scope_is_all(db, payload, "leaders"):
        return True
    return _is_unit_sup(payload, row) or _is_leader(db, payload, row)


def _party(db: Session, payload: dict, row) -> bool:
    """One of the three people the chat belongs to."""
    return (payload.get("role") == "admin" or _is_unit_sup(payload, row)
            or _is_leader(db, payload, row))


def _readable(db: Session, payload: dict, thread: str, rid: int):
    row = _row(db, thread, rid)
    if not _can_read(db, payload, row):
        # 404, not 403: an id nobody may read is an id that does not exist.
        raise HTTPException(status_code=404, detail="Not found")
    return row


def _rights(db: Session, payload: dict, thread: str, row) -> dict:
    """What THIS caller may do on THIS row — the buttons the page draws, off
    the very predicates every write re-checks."""
    if thread == chat.DISPUTE:
        sup_ok, adm_ok = _dispute_stage_rights(payload, row)
        back = leader_dispute.reopen_stage(row)
    else:
        sup_ok, adm_ok = _lp_stage_rights(db, payload, row)
        back = leader_late_proof.reopen_stage(row)
    return {
        "canWrite": _open(thread, row) and _party(db, payload, row),
        # stage 1: Refuse / Pass to the admins — both with a required comment
        "canSupervise": row.status == "supervisor" and sup_ok,
        # stage 2: Refuse (required comment) / Approve (optional comment)
        "canDecide": row.status == "admin" and adm_ok,
        "canUndo": payload.get("role") == "admin" and back is not None,
        "open": _open(thread, row),
    }


def _viewer(db: Session, payload: dict) -> tuple[str | None, int | None, str, str | None]:
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    return (identity.viewer_profile_key(db, payload), tid,
            payload.get("full_name") or payload.get("username") or "—",
            payload.get("role"))


# ── the card the chat leads with ─────────────────────────────────────────────

def _dispute_photos(db: Session, uid: str | None, task_id: int) -> list[dict]:
    """The proofs the AI refused, exactly as the day report shows them — the
    bot's archive copies (with the in-app capture stamp where there is one) or
    the Google-Form links. Streamed through the report's own photo doors with
    its `uid`, which is what authorises them for whoever can read the report."""
    if not uid:
        return []
    try:
        rep = leader_reports.day_report(db, uid)
    except Exception:
        logger.warning("appeal: day report %s unreadable", uid, exc_info=True)
        return []
    t = next((t for t in (rep or {}).get("tasks") or []
              if int(t.get("id") or 0) == int(task_id)), None)
    if not t:
        return []
    media = t.get("media") or []
    if media:
        cams = t.get("cam") or []
        return [{"kind": "bot", "id": mid, "cam": cams[i] if i < len(cams) else None}
                for i, mid in enumerate(media)]
    return [{"kind": "sheet", "url": u.strip()}
            for u in str(t.get("photo") or "").split(",") if "http" in u]


def _late_item(db: Session, payload: dict, row) -> dict:
    names = leader_reports.names_for_pairs(db, {(row.manager_id, row.leader_id)}, {})
    mgr = (db.query(Manager).filter_by(id=row.manager_id).first()
           if row.manager_id else None)
    sup_ok, adm_ok = _lp_stage_rights(db, payload, row)
    can_act = ((row.status == leader_late_proof.SUPERVISOR and sup_ok)
               or (row.status == leader_late_proof.ADMIN and adm_ok))
    item = _lp_item(db, row, names, {row.manager_id: mgr.name} if mgr else {},
                    can_act)
    _attach_chat(db, payload, chat.LATE, [item])
    return item


def _thread(db: Session, payload: dict, thread: str, rid: int) -> dict:
    row = _readable(db, payload, thread, rid)
    if thread == chat.DISPUTE:
        item = _dispute_items(db, payload, [row])[0]
        item["photos"] = _dispute_photos(db, item.get("uid"), row.task_id)
    else:
        item = _late_item(db, payload, row)
    return {"thread": thread, "item": item, **_rights(db, payload, thread, row)}


@router.get("/leaders/disputes/{rid}/thread")
def dispute_thread(rid: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    return _thread(db, payload, chat.DISPUTE, rid)


@router.get("/leaders/late-proofs/{rid}/thread")
def late_thread(rid: int, db: Session = Depends(get_db),
                payload: dict = Depends(require_auth)):
    return _thread(db, payload, chat.LATE, rid)


# ── the messages ─────────────────────────────────────────────────────────────

def _wire(m: LeaderAppealMessage, files: list[LeaderAppealFile],
          viewer: str | None, tid: int | None, writable: bool,
          seen_upto: int = 0, photos: dict | None = None) -> dict:
    """One entry in the shape `CommentsThread` reads. Ownership is decided
    HERE, by PROFILE — a message belongs to the person, and one account can
    hold several profiles — with the account as the floor for the few entries
    a door wrote without one.

    `author_key` + `author_photo` let the bubble's avatar show the author's
    photo (`ProfileAvatar`); `seen` rides only on the reader's OWN messages —
    has any other party opened the chat since (`chat.seen_upto`) — and is the
    whole of what the ✓ / ✓✓ beside the clock says."""
    if m.author_profile and viewer:
        own = m.author_profile == viewer
    else:
        own = bool(m.author_telegram and tid and int(m.author_telegram) == int(tid))
    return {
        "id": m.id, "kind": m.kind, "text": m.text or "",
        "author_name": m.author_name or "—", "author_role": m.author_role,
        "author_key": m.author_profile,
        "author_photo": (photos or {}).get(m.author_profile) if m.author_profile else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "edited_at": m.edited_at.isoformat() if m.edited_at else None,
        "is_own": bool(own),
        "seen": (m.id <= seen_upto) if own else None,
        "can_edit": bool(own and writable and m.kind == chat.MESSAGE),
        "files": [chat.file_wire(f) for f in files],
    }


def _list(db: Session, payload: dict, thread: str, rid: int) -> list[dict]:
    row = _readable(db, payload, thread, rid)
    viewer, tid, _n, _r = _viewer(db, payload)
    writable = _open(thread, row) and _party(db, payload, row)
    msgs = chat.messages(db, thread, rid)
    files = chat.files_of(db, [m.id for m in msgs])
    if msgs:
        chat.mark_read(db, thread, rid, viewer, msgs[-1].id)
    upto = chat.seen_upto(db, thread, rid, row, viewer)
    photos = identity.photo_versions(db, [m.author_profile for m in msgs])
    return [_wire(m, files.get(m.id, []), viewer, tid, writable, upto, photos)
            for m in msgs]


@router.get("/leaders/disputes/{rid}/messages")
def dispute_messages(rid: int, db: Session = Depends(get_db),
                     payload: dict = Depends(require_auth)):
    return _list(db, payload, chat.DISPUTE, rid)


@router.get("/leaders/late-proofs/{rid}/messages")
def late_messages(rid: int, db: Session = Depends(get_db),
                  payload: dict = Depends(require_auth)):
    return _list(db, payload, chat.LATE, rid)


def _post(db: Session, payload: dict, thread: str, rid: int, parsed: dict) -> dict:
    row = _readable(db, payload, thread, rid)
    if not _party(db, payload, row):
        raise HTTPException(status_code=403, detail="Only the leader, their brigadir "
                                                    "and the admins write here")
    if not _open(thread, row):
        raise HTTPException(status_code=409,
                            detail="This conversation is closed — the ruling is final")
    fields = parsed.get("fields") or {}
    uploads = parsed.get("files") or []
    text = str(fields.get("text") or "").strip()
    if not text and not uploads:
        raise HTTPException(status_code=400, detail="Write a message or attach a file")
    if len(text) > chat.TEXT_MAX:
        raise HTTPException(status_code=400, detail="The message is too long")
    stored = relay_uploads(uploads)
    viewer, tid, name, role = _viewer(db, payload)
    m = chat.add(db, thread, rid, kind=chat.MESSAGE, text=text,
                 author_profile=viewer, author_name=name, author_role=role,
                 author_telegram=tid, files=stored)
    db.commit()
    chat.mark_read(db, thread, rid, viewer, m.id)
    if thread == chat.DISPUTE:
        leader_dispute.notify_message(db, row, m, len(stored))
    else:
        leader_late_proof.notify_message(db, row, m, len(stored))
    action_log.enrich(
        target_kind="dispute" if thread == chat.DISPUTE else "task",
        target_id=rid, target_name=row.leader_name, unit_id=row.manager_id,
        day=row.date, reason=(text[:200] or None),
        details=[("leader", row.leader_name), ("task", row.task_id),
                 ("files", len(stored))],
    )
    return _wire(m, chat.files_of(db, [m.id]).get(m.id, []), viewer, tid, True)


@router.post("/leaders/disputes/{rid}/messages")
def dispute_post(rid: int, parsed: dict = Depends(appeal_body),
                 db: Session = Depends(get_db),
                 payload: dict = Depends(require_auth)):
    return _post(db, payload, chat.DISPUTE, rid, parsed)


@router.post("/leaders/late-proofs/{rid}/messages")
def late_post(rid: int, parsed: dict = Depends(appeal_body),
              db: Session = Depends(get_db),
              payload: dict = Depends(require_auth)):
    return _post(db, payload, chat.LATE, rid, parsed)


def _own_message(db: Session, payload: dict, thread: str, rid: int, mid: int):
    row = _readable(db, payload, thread, rid)
    m = (db.query(LeaderAppealMessage)
         .filter_by(id=mid, thread=thread, thread_id=rid).first())
    if m is None:
        raise HTTPException(status_code=404, detail="Not found")
    viewer, tid, _n, _r = _viewer(db, payload)
    own = (m.author_profile == viewer if (m.author_profile and viewer)
           else bool(m.author_telegram and tid and int(m.author_telegram) == int(tid)))
    if not own:
        raise HTTPException(status_code=403, detail="Only its author may change a message")
    if not _open(thread, row):
        raise HTTPException(status_code=409,
                            detail="This conversation is closed — the ruling is final")
    return row, m, viewer, tid


def _put(db: Session, payload: dict, thread: str, rid: int, mid: int, body: dict):
    row, m, viewer, tid = _own_message(db, payload, thread, rid, mid)
    text = str((body or {}).get("text") or "")
    if len(text.strip()) > chat.TEXT_MAX:
        raise HTTPException(status_code=400, detail="The message is too long")
    try:
        chat.edit(db, m, text)
    except chat.ChatError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    return _wire(m, chat.files_of(db, [m.id]).get(m.id, []), viewer, tid, True)


def _delete(db: Session, payload: dict, thread: str, rid: int, mid: int):
    _row_, m, _v, _t = _own_message(db, payload, thread, rid, mid)
    try:
        chat.delete(db, m)
    except chat.ChatError as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    return {"ok": True}


@router.put("/leaders/disputes/{rid}/messages/{mid}")
def dispute_put(rid: int, mid: int, body: dict = Body(...),
                db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    return _put(db, payload, chat.DISPUTE, rid, mid, body)


@router.put("/leaders/late-proofs/{rid}/messages/{mid}")
def late_put(rid: int, mid: int, body: dict = Body(...),
             db: Session = Depends(get_db), payload: dict = Depends(require_auth)):
    return _put(db, payload, chat.LATE, rid, mid, body)


@router.delete("/leaders/disputes/{rid}/messages/{mid}")
def dispute_delete(rid: int, mid: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    return _delete(db, payload, chat.DISPUTE, rid, mid)


@router.delete("/leaders/late-proofs/{rid}/messages/{mid}")
def late_delete(rid: int, mid: int, db: Session = Depends(get_db),
                payload: dict = Depends(require_auth)):
    return _delete(db, payload, chat.LATE, rid, mid)


# ── one attachment ───────────────────────────────────────────────────────────

def _file(db: Session, payload: dict, thread: str, rid: int, fid: int):
    _readable(db, payload, thread, rid)
    f = (db.query(LeaderAppealFile)
         .join(LeaderAppealMessage, LeaderAppealMessage.id == LeaderAppealFile.message_id)
         .filter(LeaderAppealFile.id == fid,
                 LeaderAppealMessage.thread == thread,
                 LeaderAppealMessage.thread_id == rid).first())
    if f is None:
        # Checked against THIS thread: a readable chat must not become a
        # fetcher for any attachment on the platform.
        raise HTTPException(status_code=404, detail="Not found")
    from app.routers.leader_tasks import _stream_tg_file
    image = (f.mime or "") in chat.INLINE_MIME
    return _stream_tg_file(f.file_id, name=f.name,
                           mime=f.mime or "application/octet-stream",
                           download=not image)


@router.get("/leaders/disputes/{rid}/files/{fid}")
def dispute_file(rid: int, fid: int, db: Session = Depends(get_db),
                 payload: dict = Depends(require_auth)):
    return _file(db, payload, chat.DISPUTE, rid, fid)


@router.get("/leaders/late-proofs/{rid}/files/{fid}")
def late_file(rid: int, fid: int, db: Session = Depends(get_db),
              payload: dict = Depends(require_auth)):
    return _file(db, payload, chat.LATE, rid, fid)


def _send_file(db: Session, payload: dict, thread: str, rid: int, fid: int) -> dict:
    """Put one attachment into the CALLER's own Telegram chat.

    A mini-app WebView has no downloads folder worth the name — the platform
    already DMs an Excel export instead of downloading it there — and the file
    is already in the archive channel, so the bot re-sends it by its file_id in
    one call, with the name it was attached under. A browser session downloads
    through `/files/{id}` instead.
    """
    _readable(db, payload, thread, rid)
    f = (db.query(LeaderAppealFile)
         .join(LeaderAppealMessage, LeaderAppealMessage.id == LeaderAppealFile.message_id)
         .filter(LeaderAppealFile.id == fid,
                 LeaderAppealMessage.thread == thread,
                 LeaderAppealMessage.thread_id == rid).first())
    if f is None:
        raise HTTPException(status_code=404, detail="Not found")
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    if not tid:
        raise HTTPException(status_code=400, detail="No Telegram chat to send to")
    try:
        from app.telegram_bot import bot
        bot.send_document(tid, f.file_id, visible_file_name=f.name)
    except Exception:
        logger.warning("appeal file %s to %s failed", fid, tid, exc_info=True)
        raise HTTPException(status_code=502,
                            detail="Telegram did not accept the file — open the bot and try again")
    return {"ok": True}


@router.post("/leaders/disputes/{rid}/files/{fid}/send")
def dispute_file_send(rid: int, fid: int, db: Session = Depends(get_db),
                      payload: dict = Depends(require_auth)):
    return _send_file(db, payload, chat.DISPUTE, rid, fid)


@router.post("/leaders/late-proofs/{rid}/files/{fid}/send")
def late_file_send(rid: int, fid: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_auth)):
    return _send_file(db, payload, chat.LATE, rid, fid)
