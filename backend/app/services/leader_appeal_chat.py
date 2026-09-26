"""The conversation around an objection or a late proof — THE definition.

From 2026-09-26 (the operator's directive) both appeal flows are argued as a
CHAT: an objection to an automatic AI rejection (`leader_dispute`) and a proof
filed after its task's deadline (`leader_late_proof`). The chain itself did not
change — leader files, the unit's brigadir refuses it or passes it up, an admin
rules — but every step of it now happens inside ONE thread the three parties
share, and between the steps anybody in it may ask and answer:

    filed        the leader's own account (required) — the thread's first entry
    message      free chat, with any files attached, from any of the three
    sup_rejected the brigadir refused it   — REQUIRED comment (2026-09-26)
    uplifted     the brigadir passed it up — REQUIRED comment
    approved     an admin upheld it        — optional comment
    rejected     an admin refused it       — REQUIRED comment
    undone       an admin took a ruling back — the thread REOPENS at the stage
                 that ruling was made at, with its buttons back

The ruling columns on the appeal row (`status`, `sup_*`, `decided_*` / `adm_*`)
still say where the appeal stands NOW, and every other reader of those rows —
the day report, the register, the weekly deck, the Telegram notices — goes on
reading them. The rows here say how it GOT there, which after an undo is the
only place that history survives.

Who takes part is fixed and per ROW, never per page: the leader the appeal is
about, the brigadir of the unit it belongs to, and the admins. All three read
everything and are told about everything (`fanout`) — every admin, for every
message, by the operator's ruling. Writing stops the moment a ruling is final
(`is_open`): the reason that ended it is the last word, until an undo reopens
it. Shift and top managers may read, as they already read both queues; they
never write.

Files are the ARCHIVE-CHANNEL copy, as every proof on this platform is: any
type, at most 20 MB each (the most the bot API hands back), never stored in the
database. `relay_file` is the one way in.
"""
from __future__ import annotations

import io
import logging
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Admin, LeaderAppealFile, LeaderAppealMessage, LeaderAppealRead,
)

logger = logging.getLogger(__name__)

DISPUTE = "dispute"
LATE = "late"
THREADS = (DISPUTE, LATE)

MESSAGE = "message"
FILED = "filed"
SUP_REJECTED = "sup_rejected"
UPLIFTED = "uplifted"
APPROVED = "approved"
REJECTED = "rejected"
UNDONE = "undone"
# Everything but free chat is the record of a step and can never be edited or
# deleted — the ruling columns and the notices quote these words.
FIXED_KINDS = (FILED, SUP_REJECTED, UPLIFTED, APPROVED, REJECTED, UNDONE)

TEXT_MAX = 2000
MAX_FILES = 10
MAX_FILE_BYTES = 20 * 1024 * 1024
# Types a browser may RENDER from our origin. Everything else — HTML, SVG, PDF,
# a script — is served as a download, so a file somebody attached can never run
# inside the dashboard's own origin.
INLINE_MIME = frozenset({"image/jpeg", "image/png", "image/gif", "image/webp"})


class ChatError(Exception):
    """A write the chat refuses — the message is the reason, in English."""


# ── writing ──────────────────────────────────────────────────────────────────

def add(db: Session, thread: str, thread_id: int, *, kind: str = MESSAGE,
        text: str | None = None, author_profile: str | None = None,
        author_name: str | None = None, author_role: str | None = None,
        author_telegram: int | None = None, files: list[dict] | tuple = (),
        at: datetime | None = None) -> LeaderAppealMessage:
    """One entry, with its files. Does not commit — the caller's commit
    carries it, so a filing and its first message land together or not at all.

    `files` are already-relayed dicts: {name, mime, size, file_id, message_id}.
    """
    m = LeaderAppealMessage(
        thread=thread, thread_id=int(thread_id), kind=kind,
        text=((text or "").strip()[:TEXT_MAX] or None),
        author_profile=author_profile,
        author_name=(author_name or "")[:160] or None,
        author_role=author_role, author_telegram=author_telegram,
    )
    if at is not None:
        m.created_at = at
    db.add(m)
    db.flush()
    for f in files or ():
        db.add(LeaderAppealFile(
            message_id=m.id, name=str(f.get("name") or "file")[:255],
            mime=(f.get("mime") or None), size=f.get("size"),
            file_id=f["file_id"], tg_message_id=f.get("message_id")))
    db.flush()
    return m


def role_of(db: Session, telegram_id: int | None, fallback: str | None) -> str | None:
    """Which hat an actor wore, when the door that ruled did not say.

    The web endpoints know the caller's role; a Telegram capture that was
    already in flight when this shipped knows only an account. An admin acting
    at the brigadir's stage is still an admin in the thread.
    """
    if telegram_id:
        try:
            if db.query(Admin).filter_by(telegram_id=int(telegram_id)).first():
                return "admin"
        except Exception:
            pass
    return fallback


def ruling(db: Session, thread: str, thread_id: int, kind: str, *,
           note: str | None, actor_name: str | None,
           actor_telegram: int | None, actor_profile: str | None = None,
           actor_role: str | None = None,
           fallback_role: str | None = None) -> LeaderAppealMessage:
    """Record one step of the chain as a thread entry. Called from INSIDE the
    service cores (`leader_dispute`, `leader_late_proof`), so every door that
    rules — the page, a Telegram capture still in flight — writes it."""
    return add(db, thread, thread_id, kind=kind, text=note,
               author_profile=actor_profile, author_name=actor_name,
               author_role=actor_role or role_of(db, actor_telegram, fallback_role),
               author_telegram=actor_telegram)


def carry(db: Session, thread: str, old_ids: list[int], new_id: int) -> None:
    """Re-point an earlier appeal's conversation onto the row that replaces it.

    A refused objection may be filed again (`leader_dispute.create` replaces the
    old row for the same verdict), and deleting the conversation with it would
    throw away exactly what the second filing is answering. One verdict, one
    thread."""
    ids = [int(i) for i in old_ids if i and int(i) != int(new_id)]
    if not ids:
        return
    (db.query(LeaderAppealMessage)
     .filter(LeaderAppealMessage.thread == thread,
             LeaderAppealMessage.thread_id.in_(ids))
     .update({LeaderAppealMessage.thread_id: int(new_id)},
             synchronize_session=False))
    (db.query(LeaderAppealRead)
     .filter(LeaderAppealRead.thread == thread,
             LeaderAppealRead.thread_id.in_(ids))
     .delete(synchronize_session=False))
    db.flush()


def edit(db: Session, m: LeaderAppealMessage, text: str) -> None:
    text = (text or "").strip()
    if m.kind != MESSAGE:
        raise ChatError("This entry is a record of the ruling and cannot be edited")
    if not text and not files_of(db, [m.id]).get(m.id):
        raise ChatError("A message cannot be empty")
    m.text = text[:TEXT_MAX] or None
    m.edited_at = datetime.now(timezone.utc)
    db.flush()


def delete(db: Session, m: LeaderAppealMessage) -> None:
    if m.kind != MESSAGE:
        raise ChatError("This entry is a record of the ruling and cannot be deleted")
    db.query(LeaderAppealFile).filter_by(message_id=m.id).delete()
    db.delete(m)
    db.flush()


# ── reading ──────────────────────────────────────────────────────────────────

def messages(db: Session, thread: str, thread_id: int) -> list[LeaderAppealMessage]:
    """The thread in the order things HAPPENED. By time, then id: an entry a
    backfill wrote carries its original instant but a later id."""
    return (db.query(LeaderAppealMessage)
            .filter(LeaderAppealMessage.thread == thread,
                    LeaderAppealMessage.thread_id == int(thread_id))
            .order_by(LeaderAppealMessage.created_at, LeaderAppealMessage.id).all())


def files_of(db: Session, message_ids: list[int]) -> dict[int, list[LeaderAppealFile]]:
    if not message_ids:
        return {}
    out: dict[int, list[LeaderAppealFile]] = {}
    for f in (db.query(LeaderAppealFile)
              .filter(LeaderAppealFile.message_id.in_(list(message_ids)))
              .order_by(LeaderAppealFile.id).all()):
        out.setdefault(f.message_id, []).append(f)
    return out


def file_wire(f: LeaderAppealFile) -> dict:
    return {"id": f.id, "name": f.name, "mime": f.mime, "size": f.size,
            "image": (f.mime or "") in INLINE_MIME}


def summaries(db: Session, thread: str, ids: list[int]) -> dict[int, dict]:
    """Per appeal: how many entries its thread holds and the newest one — what
    a card previews. Newest by TIME (a backfilled entry has a late id and an
    early instant). Two queries for the whole page, never one per card."""
    ids = [int(i) for i in ids]
    if not ids:
        return {}
    rows = (db.query(LeaderAppealMessage)
            .filter(LeaderAppealMessage.thread == thread,
                    LeaderAppealMessage.thread_id.in_(ids)).all())
    by: dict[int, list] = {}
    for m in rows:
        by.setdefault(m.thread_id, []).append(m)
    lasts = {tid: max(ms, key=lambda m: (m.created_at or datetime.min.replace(tzinfo=timezone.utc), m.id))
             for tid, ms in by.items()}
    last_ids = [m.id for m in lasts.values()]
    nfiles = dict(
        db.query(LeaderAppealFile.message_id, func.count(LeaderAppealFile.id))
        .filter(LeaderAppealFile.message_id.in_(last_ids))
        .group_by(LeaderAppealFile.message_id).all()) if last_ids else {}
    out = {}
    for i in ids:
        m = lasts.get(i)
        out[i] = {
            "count": len(by.get(i, [])),
            "last": ({
                "kind": m.kind, "author": m.author_name,
                "role": m.author_role, "text": (m.text or "")[:200],
                "files": int(nfiles.get(m.id, 0)),
                "at": m.created_at.isoformat() if m.created_at else None,
            } if m else None),
        }
    return out


def unread(db: Session, thread: str, ids: list[int],
           profile: str | None) -> dict[int, int]:
    """Entries in each thread this PERSON has not seen, their own excluded."""
    ids = [int(i) for i in ids]
    if not ids or not profile:
        return {}
    seen = dict(
        db.query(LeaderAppealRead.thread_id, LeaderAppealRead.last_read_id)
        .filter(LeaderAppealRead.thread == thread,
                LeaderAppealRead.thread_id.in_(ids),
                LeaderAppealRead.profile_key == profile).all())
    out: dict[int, int] = {}
    rows = (db.query(LeaderAppealMessage.thread_id, LeaderAppealMessage.id,
                     LeaderAppealMessage.author_profile)
            .filter(LeaderAppealMessage.thread == thread,
                    LeaderAppealMessage.thread_id.in_(ids)).all())
    for tid, mid, author in rows:
        if author == profile:
            continue
        if mid > int(seen.get(tid, 0) or 0):
            out[tid] = out.get(tid, 0) + 1
    return out


def mark_read(db: Session, thread: str, thread_id: int, profile: str | None,
              upto: int | None) -> None:
    if not profile or not upto:
        return
    row = (db.query(LeaderAppealRead)
           .filter_by(thread=thread, thread_id=int(thread_id), profile_key=profile)
           .first())
    if row is None:
        db.add(LeaderAppealRead(thread=thread, thread_id=int(thread_id),
                                profile_key=profile, last_read_id=int(upto)))
    elif int(row.last_read_id or 0) < int(upto):
        row.last_read_id = int(upto)
    try:
        db.commit()
    except Exception:
        # Two tabs of one person marking the same thread at once race the
        # unique key; whichever lost has nothing left to record.
        db.rollback()


# ── files ────────────────────────────────────────────────────────────────────

def relay_file(data: bytes, name: str) -> tuple[str, int | None] | None:
    """Store one attachment in the archive channel; (file_id, message_id).

    Sent as a DOCUMENT with content-type detection off, so a photo keeps its
    full resolution and a video is not re-encoded — the file that comes back is
    the file that went in. None when there is no channel or Telegram refused;
    the caller refuses the whole message rather than posting half of it.
    """
    try:
        from app.database import SessionLocal
        from app.services.leader_tasks import channel_chat_id
        from app.telegram_bot import bot
        with SessionLocal() as s:
            chan = channel_chat_id(s)
        if not chan:
            return None
        sent = bot.send_document(chan, io.BytesIO(data),
                                 visible_file_name=(name or "file")[:120],
                                 disable_content_type_detection=True)
        for attr in ("document", "animation", "video", "audio", "voice"):
            obj = getattr(sent, attr, None)
            if obj is not None and getattr(obj, "file_id", None):
                return obj.file_id, sent.message_id
        if getattr(sent, "photo", None):
            return max(sent.photo, key=lambda p: p.file_size or 0).file_id, sent.message_id
    except Exception:
        logger.warning("appeal file relay failed", exc_info=True)
    return None


def safe_name(name: str | None) -> str:
    """A file name fit for a header and a chat: no path, no control chars."""
    n = str(name or "").replace("\\", "/").split("/")[-1]
    n = "".join(ch for ch in n if ch >= " " and ch not in '"<>')
    return (n.strip() or "file")[:255]


# ── who is told ──────────────────────────────────────────────────────────────

def chat_url(thread: str, thread_id: int) -> str:
    from app.config import settings
    return f"{settings.webapp_url.rstrip('/')}/leaders/appeal/{thread}/{int(thread_id)}"


def open_chat_markup(thread: str, thread_id: int, lang: str):
    """THE Telegram keyboard for anything about an appeal: one button, onto its
    chat. Rulings are made in the chat, where the required comment is — the
    operator's ruling, 2026-09-26 — so no card carries a ruling button any more."""
    from telebot import types
    from app.telegram_bot import _lt
    label = _lt(lang, "btn_open_chat")
    if label == "btn_open_chat":
        label = "\U0001F4AC Chat"
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        label, web_app=types.WebAppInfo(url=chat_url(thread, thread_id))))
    return kb


def fanout(db: Session, thread: str, row, nkey: str, params: dict, *,
           author_profile: str | None = None, author_telegram: int | None = None,
           tone: str = "info", skip_dm: set[int] | None = None) -> set[int]:
    """Tell all three parties — the leader, the unit's brigadir and EVERY admin
    (the operator's ruling) — each with the button onto the chat.

    The author is told nothing about their own words: no bell row on their
    profile and no DM to their account. `skip_dm` are accounts that already got
    a card about this same event (the brigadir's filing card, the admins'
    uplift card): they keep the bell row and are spared a second DM.

    Never fatal, and never raises into a ruling somebody already made.
    """
    from app.identity import profile_key
    from app.routers.staff import notify_profile
    dmed: set[int] = set(skip_dm or ())
    if author_telegram:
        dmed.add(int(author_telegram))
    told: set[int] = set()

    def markup(lang):
        return open_chat_markup(thread, row.id, lang)

    targets = []
    if getattr(row, "leader_id", None):
        targets.append(profile_key("leader", int(row.leader_id)))
    if getattr(row, "manager_id", None):
        targets.append(profile_key("supervisor", int(row.manager_id)))
    try:
        admins = db.query(Admin).all()
    except Exception:
        admins = []
    admin_profiles = sorted({a.profile_id for a in admins if a.profile_id})
    targets += [profile_key("admin", pid) for pid in admin_profiles]

    for key in targets:
        if not key or key == author_profile:
            continue
        try:
            got = notify_profile(db, key, nkey, params, type=tone,
                                 skip_accounts=dmed, markup_fn=markup) or set()
            dmed |= got
            told |= got
        except Exception:
            logger.warning("appeal notice to %s failed", key, exc_info=True)

    # An admin whose account carries no profile has no profile to address.
    for a in admins:
        if a.profile_id or not a.telegram_id or a.telegram_id in dmed:
            continue
        try:
            _notify_account(db, int(a.telegram_id), nkey, params, tone, markup)
            dmed.add(int(a.telegram_id))
            told.add(int(a.telegram_id))
        except Exception:
            logger.warning("appeal notice to admin %s failed", a.telegram_id,
                           exc_info=True)
    try:
        db.commit()
    except Exception:
        db.rollback()
    return told


def _notify_account(db: Session, tid: int, nkey: str, params: dict, tone: str,
                    markup_fn) -> None:
    """Bell row + DM for one ACCOUNT, with the chat button — the admin-without-
    a-profile case `notify_profile` cannot address."""
    from app.notify_ctx import notifications_suppressed
    from app.routers.staff import _get_user_lang, _mk_notif, _mk_notif_tg, _notify
    if notifications_suppressed():
        return
    _notify(db, tid, nkey=nkey, params=params, type=tone, dm=False)
    from app.telegram_bot import send_tg_notification
    lang = _get_user_lang(db, tid)
    title, body = _mk_notif(nkey, params, lang)
    send_tg_notification(tid, title, body, html=_mk_notif_tg(nkey, params, lang),
                         markup=markup_fn(lang))


def notice_text(text: str | None, limit: int = 400) -> str:
    t = " ".join(str(text or "").split())
    return (t[:limit - 1] + "…") if len(t) > limit else t
