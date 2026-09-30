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
    Admin, LeaderAppealFile, LeaderAppealMember, LeaderAppealMessage,
    LeaderAppealRead, Manager, RoleProfile,
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
# An admin @mentioned somebody new and brought them into the chat — written by
# the server, never typed, its text the names of the people added.
INVITED = "invited"
# Everything but free chat is the record of a step and can never be edited or
# deleted — the ruling columns and the notices quote these words.
FIXED_KINDS = (FILED, SUP_REJECTED, UPLIFTED, APPROVED, REJECTED, UNDONE, INVITED)

# Who an admin may bring in: every profile on the platform (the operator's
# ruling, 2026-09-26 — guests included). Admins are parties already.
MEMBER_ROLES = ("shift-manager", "top-manager", "supervisor", "leader",
                "idle-owner", "guest")

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
    # The people an admin brought in come along with the conversation they
    # were brought into — one per person, whichever earlier row held them.
    have = member_keys(db, thread, new_id)
    for mb in (db.query(LeaderAppealMember)
               .filter(LeaderAppealMember.thread == thread,
                       LeaderAppealMember.thread_id.in_(ids))
               .order_by(LeaderAppealMember.id).all()):
        if mb.profile_key in have:
            db.delete(mb)
        else:
            mb.thread_id = int(new_id)
            have.add(mb.profile_key)
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


# ── the people an admin brought in ───────────────────────────────────────────
#
# The operator's rulings (2026-09-26): only an ADMIN can bring a NEW person in,
# by @mentioning them; the list offers everybody on the platform, the unit's
# own shift-manager first; the person brought in writes like the three parties
# and is told about every entry, but never rules; the leader and the brigadir
# get no @ list at all; and nobody is ever taken back out.

def members(db: Session, thread: str, thread_id: int) -> list[LeaderAppealMember]:
    return (db.query(LeaderAppealMember)
            .filter_by(thread=thread, thread_id=int(thread_id))
            .order_by(LeaderAppealMember.id).all())


def member_keys(db: Session, thread: str, thread_id: int) -> set[str]:
    return {k for (k,) in db.query(LeaderAppealMember.profile_key)
            .filter_by(thread=thread, thread_id=int(thread_id)).all()}


def is_member(db: Session, thread: str, thread_id: int, profile: str | None) -> bool:
    if not profile:
        return False
    return db.query(LeaderAppealMember.id).filter_by(
        thread=thread, thread_id=int(thread_id), profile_key=profile).first() is not None


def member_threads(db: Session, thread: str, profile: str | None) -> list[int]:
    """The appeals of one kind this PERSON was brought into."""
    if not profile:
        return []
    return [i for (i,) in db.query(LeaderAppealMember.thread_id)
            .filter_by(thread=thread, profile_key=profile).all()]


def party_keys(row) -> set[str]:
    """The leader and the brigadir the appeal row names — the two parties that
    are profiles of their own (the admins are a ROLE, not a list)."""
    from app.identity import profile_key
    return {k for k in (
        profile_key("leader", int(row.leader_id)) if getattr(row, "leader_id", None) else None,
        profile_key("supervisor", int(row.manager_id)) if getattr(row, "manager_id", None) else None,
    ) if k}


def people(db: Session, row, exclude: str | None = None) -> list[dict]:
    """Everybody an admin may @mention in this appeal's chat — every profile on
    the platform, guests included — in the order the list is read: the unit's
    own shift-managers first, then by role, then by name. `in_chat` marks the
    people who are in it already (the leader, the brigadir, the admins and
    whoever was brought in), so naming them adds nobody."""
    from app.identity import photo_versions, profile_key
    from app.services import shift_scope
    try:
        own_sm = set(shift_scope.role_ids_for_unit(db, getattr(row, "manager_id", None)))
    except Exception:
        own_sm = set()
    units = {m.id: m for m in db.query(Manager).all()}
    inside = party_keys(row) | member_keys(db, _thread_of(row), row.id)
    out: list[dict] = []
    for m in units.values():
        if m.archived:
            continue
        out.append({"key": profile_key("supervisor", m.id), "name": m.name,
                    "role": "supervisor", "sub": None})
    for p in db.query(RoleProfile).all():
        if p.role not in MEMBER_ROLES and p.role != "admin":
            continue
        unit = units.get(p.manager_id) if p.manager_id else None
        if p.role == "leader" and unit is not None and unit.archived:
            continue
        out.append({"key": profile_key(p.role, p.id), "name": p.name, "role": p.role,
                    "sub": unit.name if (p.role == "leader" and unit) else None,
                    "own": p.role == "shift-manager" and p.id in own_sm})
    order = {r: i for i, r in enumerate(
        ("shift-manager", "top-manager", "supervisor", "admin", "leader",
         "idle-owner", "guest"))}
    out = [o for o in out if o["key"] and o["key"] != exclude and (o["name"] or "").strip()]
    photos = photo_versions(db, [o["key"] for o in out])
    for o in out:
        o["own"] = bool(o.get("own"))
        o["in_chat"] = o["key"] in inside or o["role"] == "admin"
        o["photo"] = photos.get(o["key"])
    out.sort(key=lambda o: (not o["own"], order.get(o["role"], 99),
                            (o["name"] or "").casefold()))
    return out


def _thread_of(row) -> str:
    from app.models import LeaderAiDispute
    return DISPUTE if isinstance(row, LeaderAiDispute) else LATE


def invite(db: Session, thread: str, row, keys, *, by_profile: str | None,
           by_name: str | None, by_role: str | None, by_telegram: int | None,
           message_id: int | None, at: datetime | None = None) -> list[str]:
    """Bring the named people into one chat; the keys actually ADDED.

    A key that names nobody real, an admin (a party already), the leader or
    the brigadir, or somebody brought in before, adds nothing — a mention of
    them is only a mention. One «invited» entry records the step, naming the
    people added, right after the message that named them. Does not commit."""
    from app.identity import parse_profile_key, profile_key
    have = party_keys(row) | member_keys(db, thread, row.id)
    added: list[tuple[str, str]] = []
    for raw in list(keys or [])[:20]:
        role, ref = parse_profile_key(str(raw or "").strip())
        if role not in MEMBER_ROLES or not ref:
            continue
        key = profile_key(role, ref)
        if key in have or key == by_profile:
            continue
        if role == "supervisor":
            m = db.query(Manager).filter_by(id=ref).first()
            name = m.name if (m and not m.archived) else None
        else:
            p = db.query(RoleProfile).filter_by(id=ref, role=role).first()
            name = p.name if p else None
        if not name:
            continue
        db.add(LeaderAppealMember(
            thread=thread, thread_id=int(row.id), profile_key=key, name=name[:160],
            invited_by_profile=by_profile, invited_by_name=(by_name or "")[:160] or None,
            message_id=message_id))
        have.add(key)
        added.append((key, name))
    if added:
        db.flush()
        add(db, thread, row.id, kind=INVITED,
            text=", ".join(n for _k, n in added),
            author_profile=by_profile, author_name=by_name, author_role=by_role,
            author_telegram=by_telegram, at=at)
    return [k for k, _n in added]


def member_wire(db: Session, thread: str, thread_id: int) -> list[dict]:
    from app.identity import photo_versions
    ms = members(db, thread, thread_id)
    photos = photo_versions(db, [m.profile_key for m in ms])
    out = []
    for m in ms:
        role, _ref = m.profile_key.split(":", 1) if ":" in m.profile_key else (None, None)
        out.append({"key": m.profile_key, "name": m.name, "role": role,
                    "photo": photos.get(m.profile_key),
                    "by": m.invited_by_name,
                    "at": m.created_at.isoformat() if m.created_at else None})
    return out


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


def seen_upto(db: Session, thread: str, thread_id: int, row,
              reader: str | None) -> int:
    """How far the OTHER parties of one chat have read — the highest message id
    any of them has opened, which is what a sender's ✓✓ is drawn from.

    Parties only — the appeal's leader, its unit's brigadir, any admin, and
    whoever an admin brought in (they can answer): a shift or top manager
    merely reading along is not somebody who can answer, so their read must
    not tell the sender they have been heard. `reader` (the person asking,
    whose own messages carry the ticks) is never counted.
    """
    party = party_keys(row) | member_keys(db, thread, thread_id)
    best = 0
    for key, upto in (db.query(LeaderAppealRead.profile_key, LeaderAppealRead.last_read_id)
                      .filter_by(thread=thread, thread_id=int(thread_id)).all()):
        if not key or key == reader:
            continue
        if key in party or key.startswith("admin:"):
            best = max(best, int(upto or 0))
    return best


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
           tone: str = "info", skip_dm: set[int] | None = None,
           skip_profiles: set[str] | None = None) -> set[int]:
    """Tell all three parties — the leader, the unit's brigadir and EVERY admin
    (the operator's ruling) — and everybody an admin brought in, each with the
    button onto the chat.

    The author is told nothing about their own words: no bell row on their
    profile and no DM to their account. `skip_dm` are accounts that already got
    a card about this same event (the brigadir's filing card, the admins'
    uplift card): they keep the bell row and are spared a second DM.
    `skip_profiles` are people told about this event some other way — the ones
    a message has just brought in, who get the invitation instead.

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
    try:
        targets += [k for k in sorted(member_keys(db, thread, row.id)) if k not in targets]
    except Exception:
        logger.warning("appeal members unreadable for %s/%s", thread, row.id, exc_info=True)
    skip = set(skip_profiles or ())

    for key in targets:
        if not key or key == author_profile or key in skip:
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


def notify_invited(db: Session, thread: str, row, keys: list[str], nkey: str,
                   params: dict, *, author_telegram: int | None = None) -> None:
    """Tell each person an admin has just brought in that they are in — with
    the message that named them and the button onto the chat. Never fatal."""
    from app.routers.staff import notify_profile
    dmed: set[int] = {int(author_telegram)} if author_telegram else set()
    for key in keys:
        try:
            dmed |= notify_profile(
                db, key, nkey, params, type="info", skip_accounts=dmed,
                markup_fn=lambda lang: open_chat_markup(thread, row.id, lang)) or set()
        except Exception:
            logger.warning("appeal invite notice to %s failed", key, exc_info=True)
    try:
        db.commit()
    except Exception:
        db.rollback()


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
