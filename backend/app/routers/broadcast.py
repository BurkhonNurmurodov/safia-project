"""Admin broadcast — free-form formatted Telegram DMs to selected profiles.

The admin panel's Broadcast tab composes Telegram-flavoured HTML (only the
entities Telegram's Bot API accepts), picks recipients from the role→profile
tree, and POSTs here. Sends run in a background thread so a big recipient
list never times out the request — the history row is updated as deliveries
progress and the frontend polls GET /history while status is 'sending'.

Recipients are PROFILES (same keys as GET /api/profiles/admin/list); they
resolve to the approved holders' Telegram accounts and are deduped per
account, so a person holding several selected profiles gets one message.
"""
import json
import logging
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from html import escape, unescape
from html.parser import HTMLParser

import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import Admin, Broadcast, Manager, RoleProfile, TelegramUserRole
from app.routers.admin import verify_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/broadcast", tags=["broadcast"])

# Telegram Bot API text/caption limits, counted in UTF-16 code units of the
# PLAIN text (entities excluded) — mirrored by the frontend's live counter.
MAX_TEXT_LEN = 4096
MAX_CAPTION_LEN = 1024
MAX_PHOTO_BYTES = 10 * 1024 * 1024
MAX_FILE_BYTES = 50 * 1024 * 1024

# Rich message limits (Bot API 10.1+): 32768 UTF-8 chars of text, up to 50
# embedded media. Blocks/nesting caps (500/16) are far beyond what the editor
# can produce, so only the two user-reachable ones are enforced here.
MAX_RICH_TEXT_LEN = 32768
MAX_RICH_MEDIA = 50

# A 'sending' row older than this is considered interrupted (e.g. a Passenger
# restart mid-broadcast) and is finalized at read time so it never spins forever.
STALE_SENDING = timedelta(minutes=15)


# ── Telegram-HTML sanitizer ───────────────────────────────────────────────────
# Whitelists exactly the entities Telegram's HTML parse mode accepts and drops
# everything else while keeping the text. The editor already emits this subset;
# sanitizing again server-side keeps pasted/handcrafted payloads safe.

_INLINE_MAP = {
    "b": "b", "strong": "b",
    "i": "i", "em": "i",
    "u": "u", "ins": "u",
    "s": "s", "strike": "s", "del": "s",
    "code": "code",
    "tg-spoiler": "tg-spoiler",
}
_ALLOWED_SCHEMES = ("http://", "https://", "tg://")


class _TgSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_out: list[str] = []
        self.plain_out: list[str] = []
        self.stack: list[str] = []  # emitted output tags, for balanced closing

    def _newline(self):
        if self.html_out and not "".join(self.html_out[-1:]).endswith("\n"):
            self.html_out.append("\n")
            self.plain_out.append("\n")

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("div", "p"):
            self._newline()
            return
        if tag == "br":
            self.html_out.append("\n")
            self.plain_out.append("\n")
            return
        out = None
        if tag in _INLINE_MAP:
            out = _INLINE_MAP[tag]
        elif tag == "span" and "tg-spoiler" in (attrs.get("class") or ""):
            out = "tg-spoiler"
        elif tag == "a":
            href = (attrs.get("href") or "").strip()
            if href.lower().startswith(_ALLOWED_SCHEMES):
                self.html_out.append(f'<a href="{escape(href, quote=True)}">')
                self.stack.append("a")
            return
        elif tag == "pre":
            self._newline()
            out = "pre"
        elif tag == "blockquote":
            self._newline()
            if "expandable" in attrs:
                self.html_out.append("<blockquote expandable>")
                self.stack.append("blockquote")
                return
            out = "blockquote"
        if out:
            self.html_out.append(f"<{out}>")
            self.stack.append(out)

    def handle_endtag(self, tag):
        out = _INLINE_MAP.get(tag) or (
            tag if tag in ("a", "pre", "blockquote") else
            "tg-spoiler" if tag == "span" else None
        )
        if tag in ("div", "p"):
            self._newline()
            return
        if out and out in self.stack:
            # close nested tags down to the matching one to stay well-formed
            while self.stack:
                top = self.stack.pop()
                self.html_out.append(f"</{top}>")
                if top == out:
                    break
            if out in ("pre", "blockquote"):
                self._newline()

    def handle_data(self, data):
        self.html_out.append(escape(data))
        self.plain_out.append(data)

    def close(self):
        super().close()
        while self.stack:
            self.html_out.append(f"</{self.stack.pop()}>")


def sanitize_telegram_html(raw: str) -> tuple[str, str]:
    """Returns (telegram_html, plain_text), both stripped of leading/trailing
    blank space. Unknown tags are dropped, their text kept."""
    p = _TgSanitizer()
    p.feed(raw or "")
    p.close()
    return "".join(p.html_out).strip(), unescape("".join(p.plain_out)).strip()


def _utf16_len(s: str) -> int:
    return len(s.encode("utf-16-le")) // 2


# ── Target resolution ─────────────────────────────────────────────────────────

def _resolve_targets(db: Session, keys: list[str]) -> dict[int, str]:
    """Profile keys ("role:id", ids per /api/profiles/admin/list) → deduped
    {telegram_id: profile-name} of every APPROVED holder."""
    recipients: dict[int, str] = {}

    def add(tid: int | None, name: str):
        if tid and tid not in recipients:
            recipients[tid] = name

    for key in keys:
        try:
            role, sid = key.rsplit(":", 1)
            pid = int(sid)
        except (ValueError, AttributeError):
            continue
        if role == "supervisor":
            mgr = db.query(Manager).filter_by(id=pid).first()
            for r in db.query(TelegramUserRole).filter_by(
                    role="supervisor", role_id=pid, status="approved").all():
                add(r.telegram_id, mgr.name if mgr else r.full_name)
        elif role == "admin":
            prof = db.query(RoleProfile).filter_by(id=pid, role="admin").first()
            a = db.query(Admin).filter_by(profile_id=pid).first()
            if a:
                add(a.telegram_id, prof.name if prof else "Admin")
        elif role == "leader":
            prof = db.query(RoleProfile).filter_by(id=pid, role="leader").first()
            if not prof:
                continue
            for r in db.query(TelegramUserRole).filter_by(
                    role="leader", role_id=prof.manager_id, status="approved").all():
                if r.full_name == prof.name:
                    add(r.telegram_id, prof.name)
        elif role in ("top-manager", "shift-manager", "guest"):
            prof = db.query(RoleProfile).filter_by(id=pid, role=role).first()
            if not prof:
                continue
            for r in db.query(TelegramUserRole).filter_by(
                    role=role, role_id=pid, status="approved").all():
                add(r.telegram_id, prof.name)
    return recipients


# ── Background sender ─────────────────────────────────────────────────────────

def _run_broadcast(bid: int, recipients: list[tuple[int, str]], html: str,
                   kind: str | None, data: bytes | None, filename: str | None):
    """Deliver sequentially, updating the history row as it goes. After the
    first successful media upload the returned file_id is reused so the file
    is uploaded to Telegram exactly once."""
    from app.telegram_bot import bot
    db = SessionLocal()
    file_id: str | None = None
    try:
        row = db.query(Broadcast).filter_by(id=bid).first()
        for tid, name in recipients:
            try:
                if kind == "photo":
                    msg = bot.send_photo(tid, file_id or data, caption=html, parse_mode="HTML")
                    file_id = file_id or msg.photo[-1].file_id
                elif kind == "video":
                    msg = bot.send_video(tid, file_id or data, caption=html, parse_mode="HTML")
                    file_id = file_id or msg.video.file_id
                elif kind == "document":
                    msg = bot.send_document(tid, document=file_id or (filename, data),
                                            caption=html, parse_mode="HTML")
                    file_id = file_id or msg.document.file_id
                else:
                    bot.send_message(tid, html, parse_mode="HTML")
                row.sent_count += 1
            except Exception as e:
                row.failed_count += 1
                row.failed_names = (row.failed_names or []) + [name]
                logger.warning("Broadcast %s → %s (%s) failed: %s", bid, tid, name, e)
            db.commit()
            time.sleep(0.05)  # stay well under Telegram's ~30 msg/s ceiling
        row.status = "done"
        row.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.exception("Broadcast %s thread crashed", bid)
    finally:
        db.close()


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_broadcast(
    text: str = Form(...),
    targets: str = Form(...),
    file: UploadFile | None = File(None),
    payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    try:
        keys = json.loads(targets)
        assert isinstance(keys, list)
    except Exception:
        raise HTTPException(status_code=422, detail="targets must be a JSON list")

    html, plain = sanitize_telegram_html(text)
    if not plain:
        raise HTTPException(status_code=422, detail="Message text is empty")

    kind = data = filename = None
    if file is not None and file.filename:
        data = await file.read()
        ct = (file.content_type or "").lower()
        kind = "photo" if ct.startswith("image/") else \
               "video" if ct.startswith("video/") else "document"
        limit = MAX_PHOTO_BYTES if kind == "photo" else MAX_FILE_BYTES
        if len(data) > limit:
            raise HTTPException(status_code=413, detail="Attachment too large")
        filename = file.filename

    max_len = MAX_CAPTION_LEN if kind else MAX_TEXT_LEN
    if _utf16_len(plain) > max_len:
        raise HTTPException(status_code=422, detail=f"Message exceeds {max_len} characters")

    recipients = _resolve_targets(db, keys)
    if not recipients:
        raise HTTPException(status_code=422, detail="No deliverable recipients selected")

    from app.telegram_bot import admin_profile_name
    sender_tid = int(payload.get("sub", 0) or 0)
    row = Broadcast(
        sender_telegram_id=sender_tid,
        sender_name=admin_profile_name(sender_tid),
        text_html=html, text_plain=plain,
        attachment_kind=kind, attachment_name=filename,
        target_keys=keys, recipient_total=len(recipients),
        sent_count=0, failed_count=0, failed_names=[], status="sending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    threading.Thread(
        target=_run_broadcast,
        args=(row.id, sorted(recipients.items()), html, kind, data, filename),
        daemon=True,
    ).start()
    return {"id": row.id, "recipients": len(recipients)}


@router.get("/history")
def broadcast_history(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    rows = db.query(Broadcast).order_by(Broadcast.id.desc()).limit(50).all()
    # Finalize rows orphaned by a mid-send process restart so the UI never
    # shows an eternal spinner.
    cutoff = datetime.now(timezone.utc) - STALE_SENDING
    dirty = False
    for r in rows:
        created = r.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if r.status == "sending" and created is not None and created < cutoff:
            r.status = "done"
            r.finished_at = datetime.now(timezone.utc)
            dirty = True
    if dirty:
        db.commit()
    return [{
        "id": r.id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "sender_name": r.sender_name,
        "text_plain": r.text_plain,
        "text_html": r.text_html,
        "attachment_kind": r.attachment_kind,
        "attachment_name": r.attachment_name,
        "profile_count": len(r.target_keys or []),
        "recipient_total": r.recipient_total,
        "sent_count": r.sent_count,
        "failed_count": r.failed_count,
        "failed_names": r.failed_names or [],
        "status": r.status,
    } for r in rows]
