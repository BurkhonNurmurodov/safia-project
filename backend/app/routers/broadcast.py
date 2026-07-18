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
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import escape, unescape
from html.parser import HTMLParser
from typing import Annotated

import jwt
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from jwt import PyJWTError as JWTError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import (
    Admin, Broadcast, BroadcastDraft, Manager, RoleProfile, TelegramUser,
    TelegramUserRole,
)
from app.routers.admin import oauth2_scheme, verify_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/broadcast", tags=["broadcast"])


def verify_broadcast_admin(token: Annotated[str, Depends(oauth2_scheme)]) -> dict:
    """Authorize by ADMIN MEMBERSHIP (admins table) of the token's subject,
    not by the active-role claim like ``verify_admin``. The /broadcast mini-app
    is opened straight from the bot, where the admin's active profile may be a
    non-admin role — but they're still an admin and may broadcast. Used by the
    recipient tree and the draft-send endpoint."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    sub = int(payload.get("sub", 0) or 0)
    with SessionLocal() as db:
        if not db.query(Admin).filter_by(telegram_id=sub).first():
            raise HTTPException(status_code=403, detail="Admin access required")
    return payload

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


# ── Rich-HTML sanitizer (sendRichMessage, Bot API 10.1+) ─────────────────────
# Whitelists the documented Rich HTML dialect (see Bot API "Rich HTML style"):
# tag → allowed attributes. Boolean attributes are emitted bare; unknown tags
# are dropped with their text kept; media src must be an http(s) URL or a
# tg://photo|video|audio?id=… reference into InputRichMessage.media.

_RICH_TAGS: dict[str, tuple[str, ...]] = {
    "b": (), "strong": (), "i": (), "em": (), "u": (), "ins": (),
    "s": (), "strike": (), "del": (), "code": ("class",), "mark": (),
    "sub": (), "sup": (), "tg-spoiler": (), "cite": (),
    "a": ("href", "name"), "tg-reference": ("name",),
    "tg-emoji": ("emoji-id",), "tg-time": ("unix", "format"),
    "tg-math": (), "tg-math-block": (),
    "h1": (), "h2": (), "h3": (), "h4": (), "h5": (), "h6": (),
    "p": (), "pre": (), "footer": (), "blockquote": (), "aside": (),
    "ul": (), "ol": ("start", "type", "reversed"), "li": ("value", "type"),
    "table": ("bordered", "striped"), "caption": (), "tr": (),
    "th": ("colspan", "rowspan", "align", "valign"),
    "td": ("colspan", "rowspan", "align", "valign"),
    "details": ("open",), "summary": (),
    "figure": (), "figcaption": (),
    "video": ("src", "tg-spoiler"), "audio": ("src",),
    "tg-collage": (), "tg-slideshow": (),
}
_RICH_VOID = {
    "br": (), "hr": (),
    "img": ("src", "alt", "tg-spoiler"),
    "input": ("type", "checked"),
    "tg-map": ("lat", "long", "zoom"),
}
_RICH_BOOL_ATTRS = {"checked", "reversed", "open", "bordered", "striped", "tg-spoiler"}
_MEDIA_SRC_RE = re.compile(r"^tg://(photo|video|audio)\?id=([A-Za-z0-9_-]{1,64})$")


class _RichSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html_out: list[str] = []
        self.plain_out: list[str] = []
        self.stack: list[str] = []
        self.media_ids: list[str] = []  # tg:// ids in document order, with kind
        self.media_kinds: list[str] = []

    def _attrs_str(self, tag: str, attrs: dict, allowed: tuple[str, ...]) -> str | None:
        """None → drop the element (invalid src)."""
        parts = []
        for k in allowed:
            v = attrs.get(k)
            if k in _RICH_BOOL_ATTRS:
                if v is not None or k in attrs:
                    parts.append(k)
                continue
            if v is None:
                continue
            if k == "src":
                m = _MEDIA_SRC_RE.match(v.strip())
                if m:
                    self.media_kinds.append(m.group(1))
                    self.media_ids.append(m.group(2))
                elif not v.strip().lower().startswith(("http://", "https://")) and tag != "img":
                    return None
                elif tag == "img" and not (m or v.strip().lower().startswith(("http://", "https://", "tg://emoji"))):
                    return None
            if k == "href":
                ok = v.strip().lower().startswith(("http://", "https://", "mailto:", "tel:", "tg://user?id=", "#"))
                if not ok:
                    continue
            parts.append(f'{k}="{escape(v, quote=True)}"')
        return (" " + " ".join(parts)) if parts else ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "span" and "tg-spoiler" in (attrs.get("class") or ""):
            tag = "tg-spoiler"
        if tag in _RICH_VOID:
            if tag == "input" and (attrs.get("type") or "").lower() != "checkbox":
                return
            a = self._attrs_str(tag, attrs, _RICH_VOID[tag])
            if a is None:
                return
            self.html_out.append(f"<{tag}{a}/>")
            if tag == "br":
                self.plain_out.append("\n")
            return
        if tag not in _RICH_TAGS:
            return  # unknown wrapper — keep its text
        a = self._attrs_str(tag, attrs, _RICH_TAGS[tag])
        if a is None:
            return
        self.html_out.append(f"<{tag}{a}>")
        self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "span":
            tag = "tg-spoiler"
        if tag in _RICH_VOID or tag not in _RICH_TAGS:
            return
        if tag in self.stack:
            while self.stack:
                top = self.stack.pop()
                self.html_out.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data):
        self.html_out.append(escape(data))
        self.plain_out.append(data)

    def close(self):
        super().close()
        while self.stack:
            self.html_out.append(f"</{self.stack.pop()}>")


def sanitize_rich_html(raw: str) -> tuple[str, str, list[tuple[str, str]]]:
    """Returns (rich_html, plain_text, [(kind, media_id), …] in document order)."""
    p = _RichSanitizer()
    p.feed(raw or "")
    p.close()
    plain = unescape("".join(p.plain_out)).strip()
    return "".join(p.html_out).strip(), plain, list(zip(p.media_kinds, p.media_ids))


# ── Raw Bot API access ────────────────────────────────────────────────────────
# sendRichMessage postdates the pinned pyTelegramBotAPI (4.25 < 4.35), so rich
# sends go straight to the HTTP API — no dependency bump needed on prod.

def _tg_api(method: str, data: dict, files: dict | None = None) -> dict:
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
        data=data, files=files or None, timeout=180,
    )
    j = r.json()
    if not j.get("ok"):
        raise RuntimeError(j.get("description") or f"HTTP {r.status_code}")
    return j["result"]


def _harvest_file_ids(result: dict, media_items: list[dict]) -> list[dict] | None:
    """Best-effort: walk the returned Message for uploaded media file_ids so
    every later recipient reuses them instead of re-uploading. Collects
    (kind, file_id) in document order and matches them per-kind against our
    media list; any mismatch → None (callers keep re-uploading, just slower)."""
    found: dict[str, list[str]] = {"photo": [], "video": [], "audio": []}

    def walk(obj):
        if isinstance(obj, list):
            # a list of PhotoSize dicts is ONE photo — take the largest size
            if obj and all(isinstance(x, dict) and "file_id" in x and "width" in x
                           and "duration" not in x for x in obj):
                found["photo"].append(obj[-1]["file_id"])
                return
            for x in obj:
                walk(x)
        elif isinstance(obj, dict):
            if "file_id" in obj and "duration" in obj:
                found["video" if "width" in obj else "audio"].append(obj["file_id"])
                return
            for v in obj.values():
                walk(v)

    walk(result)
    queues = {k: list(v) for k, v in found.items()}
    specs = []
    for m in media_items:
        bucket = "video" if m["kind"] in ("video", "animation") else \
                 "audio" if m["kind"] in ("audio", "voice") else "photo"
        if not queues.get(bucket):
            return None
        specs.append({"id": m["id"], "media": {"type": m["kind"], "media": queues[bucket].pop(0)}})
    return specs


def _run_broadcast_rich(bid: int, recipients: list[tuple[int, str]], html: str,
                        media_items: list[dict]):
    """Rich-mode delivery: sendRichMessage per recipient. The first successful
    send uploads the embedded media via attach://; its response is mined for
    file_ids so the rest of the fan-out reuses them."""
    db = SessionLocal()
    reusable: list[dict] | None = None
    try:
        row = db.query(Broadcast).filter_by(id=bid).first()
        for tid, name in recipients:
            try:
                files = None
                if media_items and reusable is None:
                    specs = [{"id": m["id"], "media": {"type": m["kind"], "media": f"attach://f{i}"}}
                             for i, m in enumerate(media_items)]
                    files = {f"f{i}": (m["filename"], m["data"]) for i, m in enumerate(media_items)}
                else:
                    specs = reusable or []
                # is_rtl pinned False: with mixed-direction content (Arabic
                # inside tables) Telegram otherwise mirrors table columns
                rich: dict = {"html": html, "is_rtl": False}
                if specs:
                    rich["media"] = specs
                result = _tg_api("sendRichMessage",
                                 {"chat_id": tid, "rich_message": json.dumps(rich)}, files)
                if media_items and reusable is None:
                    reusable = _harvest_file_ids(result, media_items)
                row.sent_count += 1
            except Exception as e:
                row.failed_count += 1
                row.failed_names = (row.failed_names or []) + [name]
                logger.warning("Rich broadcast %s → %s (%s) failed: %s", bid, tid, name, e)
            db.commit()
            time.sleep(0.05)
        row.status = "done"
        row.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        logger.exception("Rich broadcast %s thread crashed", bid)
    finally:
        db.close()


# ── Recipient resolution ──────────────────────────────────────────────────────
# The picker is a role → profile → Telegram-user tree. A person may hold several
# profiles, so the same telegram_id can appear under many profiles; the frontend
# keys leaves by telegram_id, so selecting a user toggles it everywhere at once.
# What actually gets sent is a set of telegram_ids, validated here against the
# deliverable set (every APPROVED holder) before any copy goes out.


def _uniq(seq: list[int]) -> list[int]:
    """Order-preserving de-dupe."""
    seen: set[int] = set()
    out: list[int] = []
    for x in seq:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def _profile_holders(db: Session) -> list[dict]:
    """The full role → profile → holder-telegram-ids structure, in the same
    role order the admin panel uses. A profile with no approved holder keeps an
    empty ``user_ids`` (the UI shows it disabled as "no registered users")."""

    def approved(role: str, role_id: int) -> list[int]:
        return _uniq([
            r.telegram_id for r in db.query(TelegramUserRole)
            .filter_by(role=role, role_id=role_id, status="approved").all()
            if r.telegram_id
        ])

    blocks: list[dict] = []
    for role in ("top-manager", "shift-manager", "supervisor", "leader", "admin", "guest"):
        profiles: list[dict] = []
        if role == "supervisor":
            for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all():
                profiles.append({"key": f"supervisor:{m.id}", "name": m.name,
                                 "user_ids": approved("supervisor", m.id)})
        elif role == "leader":
            for p in db.query(RoleProfile).filter_by(role="leader").order_by(RoleProfile.name).all():
                ids = _uniq([
                    r.telegram_id for r in db.query(TelegramUserRole)
                    .filter_by(role="leader", role_id=p.manager_id, status="approved").all()
                    if r.telegram_id and r.full_name == p.name
                ])
                profiles.append({"key": f"leader:{p.id}", "name": p.name, "user_ids": ids})
        elif role == "admin":
            for p in db.query(RoleProfile).filter_by(role="admin").order_by(RoleProfile.name).all():
                ids = _uniq([a.telegram_id for a in db.query(Admin).filter_by(profile_id=p.id).all()
                             if a.telegram_id])
                profiles.append({"key": f"admin:{p.id}", "name": p.name, "user_ids": ids})
        else:  # top-manager, shift-manager, guest — RoleProfile keyed by its own id
            for p in db.query(RoleProfile).filter_by(role=role).order_by(RoleProfile.name).all():
                profiles.append({"key": f"{role}:{p.id}", "name": p.name,
                                 "user_ids": approved(role, p.id)})
        if profiles:
            blocks.append({"role": role, "profiles": profiles})
    return blocks


def _stored_names(db: Session, blocks: list[dict]) -> dict[int, str]:
    """Best stored display name per telegram_id — the Telegram account name
    (telegram_users.tg_name) if known, else the first profile they hold. Used
    for history / failed-name rows (the live getChat name is only for the UI)."""
    pname: dict[int, str] = {}
    for b in blocks:
        for p in b["profiles"]:
            for tid in p["user_ids"]:
                pname.setdefault(tid, p["name"])
    ids = list(pname.keys())
    tg = {u.telegram_id: u for u in
          db.query(TelegramUser).filter(TelegramUser.telegram_id.in_(ids)).all()} if ids else {}
    return {
        tid: (tg[tid].tg_name if tid in tg and tg[tid].tg_name else None) or pname[tid] or str(tid)
        for tid in ids
    }


def _live_names(ids: list[int]) -> dict[int, tuple[str | None, str | None]]:
    """Current (full_name, username) per telegram_id via Telegram getChat,
    fetched concurrently. Any id that fails (rate-limited, never started the
    bot) yields (None, None) so callers fall back to the stored name."""
    if not ids:
        return {}
    from app.telegram_bot import bot

    def fetch(tid: int):
        try:
            c = bot.get_chat(tid)
            full = " ".join(x for x in (getattr(c, "first_name", None),
                                        getattr(c, "last_name", None)) if x).strip()
            return tid, (full or None, getattr(c, "username", None))
        except Exception:
            return tid, (None, None)

    out: dict[int, tuple[str | None, str | None]] = {}
    with ThreadPoolExecutor(max_workers=min(10, len(ids))) as ex:
        for tid, res in ex.map(fetch, ids):
            out[tid] = res
    return out


def _deliverable(blocks: list[dict]) -> set[int]:
    return {tid for b in blocks for p in b["profiles"] for tid in p["user_ids"]}


def _tg_copy(chat_id: int, from_chat_id: int, message_ids: list[int]):
    """Copy the admin's original message(s) to one recipient — copyMessages for
    an album (>1 id), copyMessage for a single message. A clean copy (no
    'forwarded from' header), preserving text/media/entities exactly."""
    if len(message_ids) == 1:
        _tg_api("copyMessage",
                {"chat_id": chat_id, "from_chat_id": from_chat_id, "message_id": message_ids[0]})
    else:
        _tg_api("copyMessages",
                {"chat_id": chat_id, "from_chat_id": from_chat_id,
                 "message_ids": json.dumps(message_ids)})


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
    mode: str = Form("normal"),
    media_meta: str = Form("[]"),
    file: UploadFile | None = File(None),
    media_files: list[UploadFile] | None = File(None),
    payload: dict = Depends(verify_admin),
    db: Session = Depends(get_db),
):
    try:
        keys = json.loads(targets)
        assert isinstance(keys, list)
    except Exception:
        raise HTTPException(status_code=422, detail="targets must be a JSON list")
    if mode not in ("normal", "rich"):
        raise HTTPException(status_code=422, detail="mode must be normal or rich")

    kind = data = filename = None
    media_items: list[dict] = []

    if mode == "rich":
        html, plain, referenced = sanitize_rich_html(text)
        if not plain and not referenced:
            raise HTTPException(status_code=422, detail="Message text is empty")
        if _utf16_len(plain) > MAX_RICH_TEXT_LEN:
            raise HTTPException(status_code=422, detail=f"Message exceeds {MAX_RICH_TEXT_LEN} characters")
        # Bind uploaded files to the tg://…?id= references, in document order.
        try:
            meta = json.loads(media_meta)
            assert isinstance(meta, list)
        except Exception:
            raise HTTPException(status_code=422, detail="media_meta must be a JSON list")
        uploads = [f for f in (media_files or []) if f.filename]
        if len(uploads) != len(meta):
            raise HTTPException(status_code=422, detail="media_meta and media_files mismatch")
        if len(uploads) > MAX_RICH_MEDIA:
            raise HTTPException(status_code=422, detail=f"At most {MAX_RICH_MEDIA} media files")
        by_id = {}
        for m, f in zip(meta, uploads):
            blob = await f.read()
            limit = MAX_PHOTO_BYTES if m.get("kind") == "photo" else MAX_FILE_BYTES
            if len(blob) > limit:
                raise HTTPException(status_code=413, detail=f"{f.filename} is too large")
            by_id[str(m.get("id"))] = {"id": str(m.get("id")), "kind": m.get("kind"),
                                       "filename": f.filename, "data": blob}
        # keep only media the markup actually references, in document order
        for _, mid in referenced:
            if mid in by_id and by_id[mid] not in media_items:
                media_items.append(by_id[mid])
        missing = [mid for _, mid in referenced if mid not in by_id]
        if missing:
            raise HTTPException(status_code=422, detail=f"Missing media upload(s): {', '.join(missing)}")
    else:
        html, plain = sanitize_telegram_html(text)
        if not plain:
            raise HTTPException(status_code=422, detail="Message text is empty")
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

    # `targets` is now a list of telegram_ids (the picker keys leaves by
    # telegram_id). Validate each against the deliverable set before sending.
    blocks = _profile_holders(db)
    deliverable = _deliverable(blocks)
    names = _stored_names(db, blocks)
    want = _uniq([int(x) for x in keys if str(x).lstrip("-").isdigit()])
    recipients = {tid: names.get(tid, str(tid)) for tid in want if tid in deliverable}
    if not recipients:
        raise HTTPException(status_code=422, detail="No deliverable recipients selected")

    from app.telegram_bot import admin_profile_name
    sender_tid = int(payload.get("sub", 0) or 0)
    row = Broadcast(
        sender_telegram_id=sender_tid,
        sender_name=admin_profile_name(sender_tid),
        mode=mode,
        text_html=html, text_plain=plain,
        attachment_kind=kind, attachment_name=filename,
        media_names=[m["filename"] for m in media_items],
        target_keys=keys, recipient_total=len(recipients),
        sent_count=0, failed_count=0, failed_names=[], status="sending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if mode == "rich":
        threading.Thread(
            target=_run_broadcast_rich,
            args=(row.id, sorted(recipients.items()), html, media_items),
            daemon=True,
        ).start()
    else:
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
        "mode": r.mode or "normal",
        "media_names": r.media_names or [],
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
