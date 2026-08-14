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
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import escape, unescape
from html.parser import HTMLParser
from typing import Annotated

import jwt
import requests
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from jwt import PyJWTError as JWTError
from sqlalchemy import text as sa_text
from sqlalchemy.orm import Session
from telebot.apihelper import ApiTelegramException

from app.config import settings
from app.database import SessionLocal, get_db
from app.models import (
    Admin, Broadcast, BroadcastDraft, CustomEmoji, Manager, RoleProfile,
    TelegramUser, TelegramUserRole,
)
from pydantic import BaseModel
from app.routers.admin import oauth2_scheme, verify_admin
from app.scheduler import schedule_at, schedule_interval, unschedule
from app.upload_guard import validate_broadcast_media

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
        elif tag == "tg-emoji":
            # Premium (custom) emoji — kept in classic HTML mode too, not just
            # rich. Telegram's HTML parse mode renders <tg-emoji emoji-id="…">
            # for Premium users and the inner fallback char for everyone else.
            eid = (attrs.get("emoji-id") or "").strip()
            if eid.isdigit():
                self.html_out.append(f'<tg-emoji emoji-id="{escape(eid, quote=True)}">')
                self.stack.append("tg-emoji")
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
            tag if tag in ("a", "pre", "blockquote", "tg-emoji") else
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


# ── Resumable sender infrastructure ──────────────────────────────────────────
# Passenger recycles app processes within SECONDS on the shared host (see the
# constant per-request "Running startup migrations..." churn in its log), so a
# daemon thread never survives a full fan-out. All progress therefore lives on
# the Broadcast row — recipients / send_cursor / harvested media ids — and is
# committed after every recipient. resume_stuck_broadcasts() (called from both
# startup entrypoints, i.e. from every fresh process) claims any 'sending' row
# whose worker heartbeat went stale and continues it from the cursor.

# A worker that hasn't flushed progress for this long is presumed dead and its
# row can be claimed by another process. Must exceed the worst single-recipient
# stall: one send (~45s of telebot connect+read timeouts) + one flood-wait
# retry (≤46s) + a second send ≈ 140s.
_CLAIM_STALE = "180 seconds"

_RETRY_AFTER_RE = re.compile(r"retry after (\d+)", re.IGNORECASE)


def _flood_wait_seconds(exc: Exception) -> int | None:
    """Seconds Telegram asked us to back off (429), else None. Covers both
    telebot's typed exception (normal mode) and the raw RuntimeError carrying
    the API description that _tg_api raises (rich mode)."""
    if isinstance(exc, ApiTelegramException):
        if exc.error_code != 429:
            return None
        params = (exc.result_json or {}).get("parameters") or {}
        ra = params.get("retry_after")
        if isinstance(ra, int):
            return ra
        m = _RETRY_AFTER_RE.search(str(exc.description or ""))
        return int(m.group(1)) if m else 30
    m = _RETRY_AFTER_RE.search(str(exc))
    return int(m.group(1)) if m else None


_DESC_RE = re.compile(r"Description:\s*(.+)", re.IGNORECASE | re.DOTALL)

# Reason recorded for recipients skipped because the media died with the process
# that held it. Not a Telegram error — a stable sentinel, so the record page can
# say something true about a recipient nobody ever tried to reach.
MEDIA_LOST_REASON = "Attachment was lost when the sending process restarted"


def _failure_reason(exc: Exception) -> str:
    """One failed DM reduced to the sentence an admin can act on.

    Telegram's own description ("Forbidden: bot was blocked by the user") is the
    part that decides whether retrying can achieve anything, so it is lifted out
    of telebot's wrapper prose; everything else falls back to the exception text.
    Capped at 200 chars — this ends up in a table cell, not a log."""
    if isinstance(exc, ApiTelegramException):
        desc = str(exc.description or "").strip()
        if desc:
            return desc[:200]
    m = _DESC_RE.search(str(exc))
    if m:
        return m.group(1).strip()[:200]
    return (str(exc).strip() or exc.__class__.__name__)[:200]


def _send_once(send):
    """Run one Telegram send, waiting out a single flood-wait pause. Without
    this, one 429 makes every following recipient fail instantly inside the
    same flood window and the whole tail of the list burns as 'failed'. Any
    other error propagates — the caller counts the recipient and moves on."""
    try:
        return send()
    except Exception as e:
        wait = _flood_wait_seconds(e)
        if wait is None:
            raise
        time.sleep(min(wait, 45) + 1)
        return send()


class _BroadcastIO:
    """DB side of one sender run. Every flush writes ABSOLUTE values, so a
    failed commit loses nothing: the session is rebuilt and the next flush
    lands the same state. If the DB stays unreachable the runner exits and a
    later process resumes from the last committed cursor — a DB hiccup must
    never kill the fan-out (that is exactly what stranded a run at 20/55)."""

    def __init__(self, bid: int):
        self.bid = bid
        self.db = SessionLocal()
        self.row: Broadcast | None = None

    def claim(self, pre_claimed: bool = False) -> bool:
        """Atomically take ownership of the row. The launching request
        pre-claims (claimed_at set at INSERT) so a concurrently booting
        process's resume sweep cannot steal a brand-new broadcast away from
        the only process holding its in-memory attachment bytes."""
        try:
            if not pre_claimed:
                res = self.db.execute(sa_text(
                    "UPDATE broadcasts SET claimed_at = NOW() "
                    "WHERE id = :bid AND status = 'sending' "
                    "AND (claimed_at IS NULL OR claimed_at < NOW() - CAST(:stale AS interval)) "
                    "RETURNING id"
                ), {"bid": self.bid, "stale": _CLAIM_STALE})
                got = res.first() is not None
                self.db.commit()
                if not got:
                    return False
            self.row = self.db.query(Broadcast).filter_by(id=self.bid).first()
            return self.row is not None and self.row.status == "sending"
        except Exception:
            logger.exception("Broadcast %s: claim failed", self.bid)
            return False

    def _reopen(self):
        try:
            self.db.close()
        except Exception:
            pass
        try:
            self.db = SessionLocal()
            self.row = self.db.query(Broadcast).filter_by(id=self.bid).first()
        except Exception:
            logger.exception("Broadcast %s: could not reopen a DB session", self.bid)
            self.row = None

    def flush(self, fields: dict, final: bool = False) -> bool:
        """Persist progress (and the heartbeat). Retries once on a rebuilt
        session; False means the DB is unreachable and the caller should bail
        out, leaving the row for a later process."""
        for _ in range(2):
            if self.row is None:
                return False
            for k, v in fields.items():
                setattr(self.row, k, v)
            self.row.claimed_at = None if final else datetime.now(timezone.utc)
            if final:
                self.row.status = "done"
                self.row.finished_at = datetime.now(timezone.utc)
            try:
                self.db.commit()
                return True
            except Exception:
                try:
                    self.db.rollback()
                except Exception:
                    pass
                logger.warning("Broadcast %s: progress flush failed", self.bid, exc_info=True)
                self._reopen()
        return False

    def close(self):
        try:
            self.db.close()
        except Exception:
            pass


def _run_broadcast_rich(bid: int, media_items: list[dict] | None = None,
                        claimed: bool = False):
    """Rich-mode delivery: sendRichMessage per recipient, resumable. The first
    successful send uploads the embedded media via attach://; its response is
    mined for file_ids which are PERSISTED (media_specs) so any process — not
    just this one — can finish the fan-out reusing them."""
    from app.telegram_bot import strip_custom_emoji
    io = _BroadcastIO(bid)
    try:
        if not io.claim(pre_claimed=claimed):
            return
        row = io.row
        recipients = row.recipients or []
        html = row.text_html
        reusable: list[dict] | None = row.media_specs
        needs_media = bool(row.media_names)
        stripped_html = strip_custom_emoji(html)
        cur_html = html  # downgrades to stripped_html on the first premium-emoji rejection
        sent = row.sent_count or 0
        failed = row.failed_count or 0
        failed_names = list(row.failed_names or [])
        failures = list(row.failures or [])
        i = row.send_cursor or 0
        total = len(recipients)

        def _fields():
            f = {"sent_count": sent, "failed_count": failed,
                 "failed_names": list(failed_names), "failures": list(failures),
                 "send_cursor": i}
            if reusable:
                f["media_specs"] = reusable
            return f

        if needs_media and reusable is None and media_items is None and i < total:
            # The media bytes lived only in the process that died before the
            # first successful send harvested reusable file_ids. Nothing to
            # resume from — record the loss honestly instead of spinning.
            skipped = [name for _, name in recipients[i:]]
            failed += len(skipped)
            failed_names.extend(skipped)
            failures.extend([[tid, nm, MEDIA_LOST_REASON] for tid, nm in recipients[i:]])
            i = total
            logger.warning("Rich broadcast %s: media lost with its original process "
                           "before any send succeeded — %s recipient(s) marked failed",
                           bid, len(skipped))
            io.flush(_fields(), final=True)
            return

        while i < total and io.row is not None:
            tid, name = recipients[i]
            try:
                files = None
                if media_items and reusable is None:
                    specs = [{"id": m["id"], "media": {"type": m["kind"], "media": f"attach://f{n}"}}
                             for n, m in enumerate(media_items)]
                    files = {f"f{n}": (m["filename"], m["data"]) for n, m in enumerate(media_items)}
                else:
                    specs = reusable or []

                def _send(h):
                    # is_rtl pinned False: with mixed-direction content (Arabic
                    # inside tables) Telegram otherwise mirrors table columns
                    rich: dict = {"html": h, "is_rtl": False}
                    if specs:
                        rich["media"] = specs
                    return _tg_api("sendRichMessage",
                                   {"chat_id": tid, "rich_message": json.dumps(rich)}, files)

                try:
                    result = _send_once(lambda: _send(cur_html))
                except Exception:
                    # Premium emoji rejected (bot lacks a Fragment username) →
                    # retry degraded to fallback chars and latch it for the rest.
                    if cur_html == stripped_html:
                        raise
                    result = _send_once(lambda: _send(stripped_html))
                    cur_html = stripped_html
                if media_items and reusable is None:
                    reusable = _harvest_file_ids(result, media_items)
                sent += 1
            except Exception as e:
                failed += 1
                failed_names.append(name)
                failures.append([tid, name, _failure_reason(e)])
                logger.warning("Rich broadcast %s → %s (%s) failed: %s", bid, tid, name, e)
            i += 1
            if not io.flush(_fields()):
                return  # DB unreachable — a later process resumes from the cursor
            time.sleep(0.05)
        io.flush(_fields(), final=True)
    except Exception:
        logger.exception("Rich broadcast %s thread crashed", bid)
    finally:
        io.close()


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
    empty ``user_ids`` (the UI shows it disabled as "no registered users").

    Each profile also carries the org-chart position the picker groups by —
    ``shift`` for shift-managers and supervisors, ``unit``/``unit_id`` (their
    supervisor) for leaders. A leader has no shift of its own, so it INHERITS
    the shift of its supervisor's unit and the picker can nest shift ▸
    supervisor. They stay structured, never a pre-joined caption, so the
    frontend renders them through t()/tl() in the viewer's language."""

    def approved(role: str, role_id: int) -> list[int]:
        return _uniq([
            r.telegram_id for r in db.query(TelegramUserRole)
            .filter_by(role=role, role_id=role_id, status="approved").all()
            if r.telegram_id
        ])

    mgr_rows = db.query(Manager).all()
    mgr_names = {m.id: m.name for m in mgr_rows}
    mgr_shifts = {m.id: m.shift for m in mgr_rows}
    blocks: list[dict] = []
    for role in ("top-manager", "shift-manager", "supervisor", "leader", "admin", "guest"):
        profiles: list[dict] = []
        if role == "supervisor":
            for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all():
                profiles.append({"key": f"supervisor:{m.id}", "name": m.name,
                                 "shift": m.shift,
                                 "user_ids": approved("supervisor", m.id)})
        elif role == "leader":
            for p in db.query(RoleProfile).filter_by(role="leader").order_by(RoleProfile.name).all():
                ids = _uniq([
                    r.telegram_id for r in db.query(TelegramUserRole)
                    .filter_by(role="leader", role_id=p.manager_id, status="approved").all()
                    if r.telegram_id and r.full_name == p.name
                ])
                profiles.append({"key": f"leader:{p.id}", "name": p.name,
                                 "shift": mgr_shifts.get(p.manager_id),
                                 "unit_id": p.manager_id,
                                 "unit": mgr_names.get(p.manager_id),
                                 "user_ids": ids})
        elif role == "admin":
            for p in db.query(RoleProfile).filter_by(role="admin").order_by(RoleProfile.name).all():
                ids = _uniq([a.telegram_id for a in db.query(Admin).filter_by(profile_id=p.id).all()
                             if a.telegram_id])
                profiles.append({"key": f"admin:{p.id}", "name": p.name, "user_ids": ids})
        else:  # top-manager, shift-manager, guest — RoleProfile keyed by its own id
            for p in db.query(RoleProfile).filter_by(role=role).order_by(RoleProfile.name).all():
                profiles.append({"key": f"{role}:{p.id}", "name": p.name,
                                 "shift": p.shift if role == "shift-manager" else None,
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
        # copyMessages requires the ids in strictly increasing order.
        _tg_api("copyMessages",
                {"chat_id": chat_id, "from_chat_id": from_chat_id,
                 "message_ids": json.dumps(sorted(set(message_ids)))})


# ── Background sender ─────────────────────────────────────────────────────────

def _run_broadcast(bid: int, data: bytes | None = None, filename: str | None = None,
                   claimed: bool = False):
    """Deliver sequentially, resumable. Recipients, cursor and counters are
    read from and committed back to the row after every send. After the first
    successful media upload the returned file_id is PERSISTED so the file is
    uploaded to Telegram exactly once and any later process can finish the
    fan-out without the original bytes."""
    from app.telegram_bot import bot, strip_custom_emoji
    io = _BroadcastIO(bid)
    try:
        if not io.claim(pre_claimed=claimed):
            return
        row = io.row
        recipients = row.recipients or []
        html = row.text_html
        kind = row.attachment_kind
        filename = filename or row.attachment_name
        file_id: str | None = row.attachment_file_id
        stripped_html = strip_custom_emoji(html)
        cur_html = html  # downgrades to stripped_html on the first premium-emoji rejection
        sent = row.sent_count or 0
        failed = row.failed_count or 0
        failed_names = list(row.failed_names or [])
        failures = list(row.failures or [])
        i = row.send_cursor or 0
        total = len(recipients)

        def _fields():
            f = {"sent_count": sent, "failed_count": failed,
                 "failed_names": list(failed_names), "failures": list(failures),
                 "send_cursor": i}
            if file_id:
                f["attachment_file_id"] = file_id
            return f

        if kind and data is None and not file_id and i < total:
            # The attachment bytes lived only in the process that died before
            # the first successful send harvested a file_id. Nothing to resume
            # from — record the loss honestly instead of spinning.
            skipped = [name for _, name in recipients[i:]]
            failed += len(skipped)
            failed_names.extend(skipped)
            failures.extend([[tid, nm, MEDIA_LOST_REASON] for tid, nm in recipients[i:]])
            i = total
            logger.warning("Broadcast %s: attachment lost with its original process "
                           "before any send succeeded — %s recipient(s) marked failed",
                           bid, len(skipped))
            io.flush(_fields(), final=True)
            return

        while i < total and io.row is not None:
            tid, name = recipients[i]

            def _send(h):
                nonlocal file_id
                if kind == "photo":
                    msg = bot.send_photo(tid, file_id or data, caption=h, parse_mode="HTML")
                    file_id = file_id or msg.photo[-1].file_id
                elif kind == "video":
                    msg = bot.send_video(tid, file_id or data, caption=h, parse_mode="HTML")
                    file_id = file_id or msg.video.file_id
                elif kind == "document":
                    msg = bot.send_document(tid, document=file_id or (filename, data),
                                            caption=h, parse_mode="HTML")
                    file_id = file_id or msg.document.file_id
                else:
                    bot.send_message(tid, h, parse_mode="HTML")

            try:
                try:
                    _send_once(lambda: _send(cur_html))
                except Exception:
                    # Premium emoji rejected (bot lacks a Fragment username) →
                    # retry degraded to fallback chars and latch it for the rest.
                    if cur_html == stripped_html:
                        raise
                    _send_once(lambda: _send(stripped_html))
                    cur_html = stripped_html
                sent += 1
            except Exception as e:
                failed += 1
                failed_names.append(name)
                failures.append([tid, name, _failure_reason(e)])
                logger.warning("Broadcast %s → %s (%s) failed: %s", bid, tid, name, e)
            i += 1
            if not io.flush(_fields()):
                return  # DB unreachable — a later process resumes from the cursor
            time.sleep(0.05)  # stay well under Telegram's ~30 msg/s ceiling
        io.flush(_fields(), final=True)
    except Exception:
        logger.exception("Broadcast %s thread crashed", bid)
    finally:
        io.close()


def resume_stuck_broadcasts() -> None:
    """Re-attach a sender to every broadcast orphaned by a process restart.

    Called from BOTH startup entrypoints (FastAPI lifespan and
    passenger_wsgi), i.e. from every fresh Passenger process — which on this
    host means every few seconds, so an interrupted fan-out picks back up
    almost immediately. The atomic claim in _BroadcastIO keeps concurrently
    booting processes off the same row; rows whose worker is still alive
    (fresh claimed_at heartbeat) are skipped."""
    def _worker():
        try:
            with SessionLocal() as db:
                rows = db.query(Broadcast.id, Broadcast.mode).filter(
                    Broadcast.status == "sending",
                    Broadcast.recipients.isnot(None),
                ).all()
            for bid, mode in rows:
                if mode == "rich":
                    _run_broadcast_rich(bid)
                else:
                    _run_broadcast(bid)
        except Exception:
            logger.exception("Broadcast resume sweep failed")
    threading.Thread(target=_worker, daemon=True).start()


# ── Scheduled broadcasts ─────────────────────────────────────────────────────
# A scheduled broadcast is NOT a different kind of send. /send resolves it
# completely — recipients, sanitized HTML, and for media the Telegram file_id
# harvested up front — then parks the row at status 'scheduled' instead of
# spawning a runner. Firing it is a guarded status flip into the very same
# resumable fan-out, so a scheduled send inherits the resume, retry and
# progress machinery for free and depends on nothing held by the process that
# composed it.
#
# app/scheduler.py keeps the timer in memory; THIS table is the truth. Every
# boot re-arms the pending rows, and a 5-minute sweep catches anything whose
# timer was lost, so the worst case is a late send, never a silent one.

# Guard rails on how far out a send may be parked. The upper bound is not
# paranoia: the harvested Telegram file_id is the only copy of the attachment
# left, and file_ids are not guaranteed forever.
MIN_SCHEDULE_LEAD = timedelta(seconds=30)
MAX_SCHEDULE_DAYS = 180

_SWEEP_JOB_ID = "broadcast-schedule-sweep"


def _job_id(bid: int) -> str:
    return f"broadcast-send-{bid}"


def _as_utc(dt: datetime | None) -> datetime | None:
    """Postgres hands back tz-aware values, but a column added mid-flight can
    still yield naive ones on a stale connection. Read naive as UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def _preflight_media(sender_tid: int, mode: str, html: str, kind: str | None,
                     data: bytes | None, filename: str | None,
                     media_items: list[dict]) -> tuple[str | None, list[dict] | None]:
    """Upload a scheduled broadcast's media to Telegram NOW and return its
    reusable ids as (attachment_file_id, media_specs).

    An immediate broadcast carries its bytes in the sending thread and harvests
    a file_id off the first successful DM. A scheduled one has no such thread:
    by the time it fires the request that uploaded the file is long gone and
    the runner's media-lost path would mark every recipient failed. So the file
    is uploaded once, here, to the SENDER's own chat — the message is deleted
    immediately afterwards, and Telegram keeps a file_id valid after the
    message carrying it is gone.

    Raises HTTPException so the admin learns at schedule time that the media
    could not be prepared, rather than finding an all-failed broadcast in the
    morning. Sent with premium emoji already stripped: this upload only exists
    to mint ids, and a bot without a Fragment username would fail the whole
    preflight on markup the real send degrades gracefully.
    """
    from app.telegram_bot import bot, strip_custom_emoji

    plain_html = strip_custom_emoji(html)
    probe_id = None
    try:
        if mode == "rich":
            specs = [{"id": m["id"], "media": {"type": m["kind"], "media": f"attach://f{n}"}}
                     for n, m in enumerate(media_items)]
            files = {f"f{n}": (m["filename"], m["data"]) for n, m in enumerate(media_items)}
            result = _tg_api(
                "sendRichMessage",
                {"chat_id": sender_tid,
                 "rich_message": json.dumps({"html": plain_html, "is_rtl": False, "media": specs})},
                files,
            )
            # Only used to delete the probe afterwards, so a shape surprise
            # must not fail a preflight that already minted the ids.
            _probe = result[0] if isinstance(result, list) and result else result
            probe_id = _probe.get("message_id") if isinstance(_probe, dict) else None
            reusable = _harvest_file_ids(result, media_items)
            if reusable is None:
                raise RuntimeError("could not match uploaded media back to the message")
            return None, reusable

        if kind == "photo":
            msg = bot.send_photo(sender_tid, data)
            probe_id, fid = msg.message_id, msg.photo[-1].file_id
        elif kind == "video":
            msg = bot.send_video(sender_tid, data)
            probe_id, fid = msg.message_id, msg.video.file_id
        else:
            msg = bot.send_document(sender_tid, document=(filename, data))
            probe_id, fid = msg.message_id, msg.document.file_id
        return fid, None
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Scheduled broadcast media preflight failed for %s: %s", sender_tid, exc)
        raise HTTPException(
            status_code=502,
            detail="Could not prepare the attachment for a scheduled send. "
                   "Open a chat with the bot and try again, or send now instead.",
        ) from exc
    finally:
        # Best effort: the ids are already minted and stay valid, so a message
        # left behind is cosmetic — never a reason to fail the schedule.
        if probe_id:
            try:
                bot.delete_message(sender_tid, probe_id)
            except Exception:
                logger.info("Scheduled broadcast preflight message %s left in chat %s",
                            probe_id, sender_tid)


def fire_scheduled_broadcast(bid: int) -> None:
    """Hand a scheduled row to the normal fan-out.

    The status flip is guarded on 'scheduled', so the timer and the safety-net
    sweep racing on the same row can only ever produce ONE runner — the loser's
    update matches no row. claimed_at is pre-set exactly as /send does it, so a
    concurrent resume sweep can't steal the row before the thread starts."""
    try:
        with SessionLocal() as db:
            row = db.query(Broadcast.mode).filter_by(id=bid, status="scheduled").first()
            if not row:
                return
            mode = row[0]
            updated = db.query(Broadcast).filter_by(id=bid, status="scheduled").update({
                "status": "sending",
                "claimed_at": datetime.now(timezone.utc),
            })
            db.commit()
        if not updated:
            return
        logger.info("Scheduled broadcast %s firing", bid)
        runner = _run_broadcast_rich if mode == "rich" else _run_broadcast
        threading.Thread(target=runner, args=(bid,), kwargs={"claimed": True},
                         daemon=True).start()
    except Exception:
        logger.exception("Scheduled broadcast %s failed to fire", bid)


def sweep_due_broadcasts() -> None:
    """Safety net: send anything already due that no live timer covers.

    The timers live in memory, so they are lost on every restart and on any
    failed re-arm. This runs every few minutes and after each boot, which turns
    the worst failure mode from "the broadcast never went out" into "it went
    out a few minutes late"."""
    try:
        now = datetime.now(timezone.utc)
        with SessionLocal() as db:
            due = [r[0] for r in db.query(Broadcast.id).filter(
                Broadcast.status == "scheduled",
                Broadcast.scheduled_at.isnot(None),
                Broadcast.scheduled_at <= now,
            ).all()]
        for bid in due:
            fire_scheduled_broadcast(bid)
    except Exception:
        logger.exception("Scheduled-broadcast sweep failed")


def register_scheduled_broadcasts() -> None:
    """Rebuild every pending timer from the table, and install the sweep.

    Called from both startup entrypoints. Overdue rows (the service was down
    across their time, or a deploy landed on it) go out immediately rather than
    being dropped — a broadcast that missed its slot is still wanted; one that
    silently vanishes is not."""
    try:
        with SessionLocal() as db:
            rows = db.query(Broadcast.id, Broadcast.scheduled_at).filter(
                Broadcast.status == "scheduled",
                Broadcast.scheduled_at.isnot(None),
            ).all()
        now = datetime.now(timezone.utc)
        armed = 0
        for bid, when in rows:
            when = _as_utc(when)
            if when <= now:
                fire_scheduled_broadcast(bid)
            elif schedule_at(_job_id(bid), when, fire_scheduled_broadcast, (bid,)):
                armed += 1
        schedule_interval(_SWEEP_JOB_ID, sweep_due_broadcasts, minutes=5)
        if armed:
            logger.info("Re-armed %s scheduled broadcast(s)", armed)
    except Exception:
        logger.exception("Could not register scheduled broadcasts")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/send")
async def send_broadcast(
    text: str = Form(...),
    targets: str = Form(...),
    mode: str = Form("normal"),
    media_meta: str = Form("[]"),
    scheduled_at: str = Form(""),
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

    # Deferred send. Parsed before any upload is read so a bad time costs
    # nothing; empty means send now, which is every caller that predates this.
    when: datetime | None = None
    if scheduled_at.strip():
        try:
            when = datetime.fromisoformat(scheduled_at.strip().replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="scheduled_at must be an ISO-8601 datetime")
        when = _as_utc(when)
        now = datetime.now(timezone.utc)
        if when < now + MIN_SCHEDULE_LEAD:
            # A time in the past is a mistake (a mistyped date, a stale form),
            # not an instruction to send immediately — say so instead of
            # blasting a mass DM the admin did not just ask for.
            raise HTTPException(status_code=422, detail="scheduled_at must be in the future")
        if when > now + timedelta(days=MAX_SCHEDULE_DAYS):
            raise HTTPException(
                status_code=422,
                detail=f"scheduled_at cannot be more than {MAX_SCHEDULE_DAYS} days out")

    html, plain, kind, data, filename, media_items = await _parse_message(
        text, mode, media_meta, file, media_files)

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

    # A scheduled send has no thread to hold the uploaded bytes until its time
    # comes, so the media is turned into reusable Telegram ids right now. This
    # can fail (the bot cannot DM the admin, Telegram rejects the file) and
    # deliberately fails the whole request: better a red error on the compose
    # screen than a broadcast that fires at 06:00 and fails every recipient.
    pre_file_id: str | None = None
    pre_specs: list[dict] | None = None
    if when and (kind or media_items):
        pre_file_id, pre_specs = _preflight_media(
            sender_tid, mode, html, kind, data, filename, media_items)

    row = Broadcast(
        sender_telegram_id=sender_tid,
        sender_name=admin_profile_name(sender_tid),
        mode=mode,
        text_html=html, text_plain=plain,
        attachment_kind=kind, attachment_name=filename,
        media_names=[m["filename"] for m in media_items],
        target_keys=keys, recipient_total=len(recipients),
        sent_count=0, failed_count=0, failed_names=[], failures=[],
        status="scheduled" if when else "sending",
        scheduled_at=when,
        # Resumable fan-out state: the resolved list + cursor live on the row.
        # claimed_at is set NOW so a concurrently booting process's resume
        # sweep can't steal the row from the only process holding the
        # in-memory attachment bytes. A scheduled row claims nothing — it is
        # not sending yet, and the resume sweep only looks at 'sending'.
        recipients=[[tid, name] for tid, name in sorted(recipients.items())],
        send_cursor=0,
        claimed_at=None if when else datetime.now(timezone.utc),
        attachment_file_id=pre_file_id,
        media_specs=pre_specs,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    if when:
        # The row is already the durable record; the timer is a convenience
        # rebuilt at every boot. If arming fails the send is still covered by
        # the 5-minute sweep, so this is logged, not raised.
        schedule_at(_job_id(row.id), when, fire_scheduled_broadcast, (row.id,))
        logger.info("Broadcast %s scheduled for %s (%s recipients)",
                    row.id, when.isoformat(), len(recipients))
        return {"id": row.id, "recipients": len(recipients),
                "scheduled_at": when.isoformat()}

    if mode == "rich":
        threading.Thread(
            target=_run_broadcast_rich,
            args=(row.id, media_items), kwargs={"claimed": True},
            daemon=True,
        ).start()
    else:
        threading.Thread(
            target=_run_broadcast,
            args=(row.id, data, filename), kwargs={"claimed": True},
            daemon=True,
        ).start()
    return {"id": row.id, "recipients": len(recipients)}


async def _parse_message(
    text: str, mode: str, media_meta: str,
    file: UploadFile | None, media_files: list[UploadFile] | None,
) -> tuple[str, str, str | None, bytes | None, str | None, list[dict]]:
    """Sanitize and validate one composed message → (html, plain, attachment
    kind, bytes, filename, rich media items).

    Shared by /send and /test on purpose: a rehearsal that went through a
    different sanitizer, a different length cap or a different media binding
    would not be a rehearsal of the thing that ships.
    """
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
            validate_broadcast_media(f)   # extension whitelist (400 on disallowed type)
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
            validate_broadcast_media(file)   # extension whitelist (400 on disallowed type)
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

    return html, plain, kind, data, filename, media_items


@router.post("/test")
async def test_broadcast(
    text: str = Form(...),
    mode: str = Form("normal"),
    media_meta: str = Form("[]"),
    file: UploadFile | None = File(None),
    media_files: list[UploadFile] | None = File(None),
    payload: dict = Depends(verify_admin),
):
    """DM the composed message to the composer, and to nobody else.

    The only honest preview of a Telegram message is a Telegram message: the
    composer's bubble approximates entities, rich mode renders differently per
    client, and premium emoji survive or degrade depending on the bot's own
    username. So this goes through _parse_message and the same send calls the
    fan-out uses — what arrives is what the recipients would get.

    Writes NO Broadcast row: a rehearsal is not a broadcast, and putting one in
    the history would make the register lie about what was sent to whom.
    ``degraded`` reports that premium emoji had to fall back, which is one of
    the things being rehearsed.
    """
    if mode not in ("normal", "rich"):
        raise HTTPException(status_code=422, detail="mode must be normal or rich")
    html, _plain, kind, data, filename, media_items = await _parse_message(
        text, mode, media_meta, file, media_files)

    sender_tid = int(payload.get("sub", 0) or 0)
    if not sender_tid:
        raise HTTPException(status_code=401, detail="Unknown sender")

    from app.telegram_bot import bot, strip_custom_emoji
    stripped = strip_custom_emoji(html)

    def _deliver(h: str):
        if mode == "rich":
            specs = [{"id": m["id"], "media": {"type": m["kind"], "media": f"attach://f{n}"}}
                     for n, m in enumerate(media_items)]
            files = {f"f{n}": (m["filename"], m["data"]) for n, m in enumerate(media_items)}
            rich: dict = {"html": h, "is_rtl": False}
            if specs:
                rich["media"] = specs
            _tg_api("sendRichMessage",
                    {"chat_id": sender_tid, "rich_message": json.dumps(rich)}, files or None)
        elif kind == "photo":
            bot.send_photo(sender_tid, data, caption=h, parse_mode="HTML")
        elif kind == "video":
            bot.send_video(sender_tid, data, caption=h, parse_mode="HTML")
        elif kind == "document":
            bot.send_document(sender_tid, document=(filename, data), caption=h, parse_mode="HTML")
        else:
            bot.send_message(sender_tid, h, parse_mode="HTML")

    degraded = False
    try:
        try:
            _send_once(lambda: _deliver(html))
        except Exception:
            # Same degradation ladder as the real fan-out: premium emoji
            # rejected → retry with fallback characters, and SAY so.
            if html == stripped:
                raise
            _send_once(lambda: _deliver(stripped))
            degraded = True
    except Exception as exc:
        logger.warning("Broadcast test send to %s failed: %s", sender_tid, exc)
        raise HTTPException(status_code=502, detail=_failure_reason(exc)) from exc

    logger.info("BROADCAST test sent to %s (mode=%s, degraded=%s)", sender_tid, mode, degraded)
    return {"ok": True, "degraded": degraded}


def _retryable(r: Broadcast) -> bool:
    """A finished row whose failed recipients can actually be re-sent. Needs
    the resolved recipient list (copy-mode and legacy rows have none) and, if
    media was attached, a persisted file_id / media_specs — without those the
    runner would instantly re-fail everyone through its media-lost path."""
    if r.status != "done" or not (r.failed_count or 0) or not r.recipients:
        return False
    if r.mode == "rich":
        return not r.media_names or bool(r.media_specs)
    if r.mode == "copy":
        return False
    return not r.attachment_kind or bool(r.attachment_file_id)


@router.post("/{bid}/retry")
def retry_broadcast(bid: int, db: Session = Depends(get_db),
                    _: dict = Depends(verify_admin)):
    """Re-send only to the recipients whose DM failed. The failed subset is
    rebuilt by matching failed_names back against the resolved recipient list
    (names are counted, so duplicate names claim one recipient each); the row
    is then reset to 'sending' over that subset and re-enters the normal
    resumable fan-out. sent_count keeps accumulating toward recipient_total,
    and the persisted attachment file_id / media_specs are reused, so nothing
    is re-uploaded and a mid-retry process death resumes like any broadcast."""
    row = db.query(Broadcast).filter_by(id=bid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Broadcast not found")
    if row.status == "sending":
        raise HTTPException(status_code=409, detail="Broadcast is still sending")
    if not _retryable(row):
        raise HTTPException(status_code=409, detail="Nothing to retry for this broadcast")

    remaining = Counter(row.failed_names or [])
    failed_subset = []
    for tid, name in row.recipients:
        if remaining.get(name):
            remaining[name] -= 1
            failed_subset.append([tid, name])
    if not failed_subset:
        raise HTTPException(status_code=409, detail="Failed recipients could not be resolved")

    # Atomic flip guarded on status so two admins clicking Retry at once can't
    # both spawn a runner for the same row; claimed_at pre-claims as /send does.
    updated = db.query(Broadcast).filter_by(id=bid, status="done").update({
        "recipients": failed_subset,
        "send_cursor": 0,
        "failed_count": 0,
        "failed_names": [],
        # Cleared with the names: the reasons describe the attempt being
        # replaced, and leaving them would report a recipient as both retried
        # and still-blocked on the record page.
        "failures": [],
        "status": "sending",
        "finished_at": None,
        "claimed_at": datetime.now(timezone.utc),
    })
    db.commit()
    if not updated:
        raise HTTPException(status_code=409, detail="Broadcast is still sending")

    runner = _run_broadcast_rich if row.mode == "rich" else _run_broadcast
    threading.Thread(target=runner, args=(bid,), kwargs={"claimed": True},
                     daemon=True).start()
    return {"id": bid, "retrying": len(failed_subset)}


@router.post("/{bid}/cancel")
def cancel_scheduled_broadcast(bid: int, db: Session = Depends(get_db),
                               _: dict = Depends(verify_admin)):
    """Call off a broadcast that has not fired yet.

    Guarded on 'scheduled', so this loses cleanly against a send that started a
    moment ago: the update matches no row and the admin is told it is already
    going out rather than being shown a cancel that did nothing. The row is
    kept as 'canceled' instead of deleted — a mass DM that was planned and
    called off is exactly the kind of thing the history is for."""
    row = db.query(Broadcast).filter_by(id=bid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    updated = db.query(Broadcast).filter_by(id=bid, status="scheduled").update({
        "status": "canceled",
        "finished_at": datetime.now(timezone.utc),
    })
    db.commit()
    if not updated:
        raise HTTPException(status_code=409,
                            detail="This broadcast is no longer scheduled")
    # Drop the timer only after the row says canceled: if this process dies in
    # between, the fired job finds a non-'scheduled' row and does nothing.
    unschedule(_job_id(bid))
    logger.info("Scheduled broadcast %s canceled", bid)
    return {"id": bid, "status": "canceled"}


@router.get("/history")
def broadcast_history(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    rows = db.query(Broadcast).order_by(Broadcast.id.desc()).limit(50).all()
    # Finalize rows orphaned by a mid-send process restart so the UI never
    # shows an eternal spinner. Rows with a persisted recipient list are
    # RESUMABLE — resume_stuck_broadcasts() in the next process boot continues
    # them, so declaring those "done" here would abandon undelivered
    # recipients; only legacy rows (no list) finalize at 15 min, with a 6-hour
    # hard cap catching anything truly wedged.
    now = datetime.now(timezone.utc)
    cutoff = now - STALE_SENDING
    hard_cutoff = now - timedelta(hours=6)
    dirty = False
    for r in rows:
        created = r.created_at
        if created is not None and created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if r.status != "sending" or created is None:
            continue
        if (r.recipients is None and created < cutoff) or created < hard_cutoff:
            r.status = "done"
            r.finished_at = now
            dirty = True
    if dirty:
        db.commit()
    return [_row_summary(r) for r in rows]


def _row_summary(r: Broadcast) -> dict:
    """The shape of one broadcast in the history table AND in the header of its
    record page. One builder so the two can never disagree about what a row
    says — the page is reached by clicking the row it must match."""
    return {
        "id": r.id,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
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
        "can_retry": _retryable(r),
        "scheduled_at": r.scheduled_at.isoformat() if r.scheduled_at else None,
        "can_cancel": r.status == "scheduled",
    }


# ── /broadcast mini-app: recipient tree + draft send ──────────────────────────

@router.get("/recipients")
def broadcast_recipients(db: Session = Depends(get_db),
                         _: dict = Depends(verify_broadcast_admin)):
    """role → profile → Telegram-user tree for the picker (both the admin tab
    and the /broadcast mini-app). Each user's name is the CURRENT full name
    from a live getChat, falling back to the stored name when Telegram doesn't
    answer. Empty profiles are kept (rendered disabled) so the admin sees them."""
    blocks = _profile_holders(db)
    all_ids = _uniq([tid for b in blocks for p in b["profiles"] for tid in p["user_ids"]])
    stored = _stored_names(db, blocks)
    live = _live_names(all_ids)

    def uinfo(tid: int) -> dict:
        full, uname = live.get(tid, (None, None))
        return {"telegram_id": tid, "name": full or stored.get(tid) or str(tid), "username": uname}

    tree = [{
        "role": b["role"],
        "profiles": [{
            "key": p["key"],
            "name": p["name"],
            # Grouping metadata: shift (shift-managers, supervisors) or the
            # owning supervisor (leaders). Absent on roles that aren't grouped.
            "shift": p.get("shift"),
            "unit": p.get("unit"),
            "unit_id": p.get("unit_id"),
            "users": [uinfo(t) for t in p["user_ids"]],
        } for p in b["profiles"]],
    } for b in blocks]
    return {"tree": tree, "total_users": len(all_ids)}


@router.post("/send-draft")
def send_draft(
    token: str = Form(...),
    targets: str = Form(...),
    payload: dict = Depends(verify_broadcast_admin),
    db: Session = Depends(get_db),
):
    """Send a /broadcast draft: copy the admin's stored message(s) to every
    selected telegram_id. Runs synchronously (recipient counts are tens) and
    returns final {sent, failed, total, failed_names} so the mini-app can show
    an accurate result modal. Also logs a history row and edits the bot's
    picker message into a 'sent X/Y' summary."""
    admin_tid = int(payload.get("sub", 0) or 0)
    draft = db.query(BroadcastDraft).filter_by(token=token).first()
    if not draft or draft.admin_telegram_id != admin_tid:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status == "sent":
        raise HTTPException(status_code=409, detail="This broadcast was already sent")
    message_ids = list(draft.message_ids or [])
    if not message_ids:
        raise HTTPException(status_code=422, detail="Draft has no message")

    try:
        keys = json.loads(targets)
        assert isinstance(keys, list)
    except Exception:
        raise HTTPException(status_code=422, detail="targets must be a JSON list")

    blocks = _profile_holders(db)
    deliverable = _deliverable(blocks)
    names = _stored_names(db, blocks)
    want = _uniq([int(x) for x in keys if str(x).lstrip("-").isdigit()])
    recipients = {tid: names.get(tid, str(tid)) for tid in want if tid in deliverable}
    if not recipients:
        raise HTTPException(status_code=422, detail="No deliverable recipients selected")

    from_chat_id = draft.from_chat_id
    sent = 0
    failed_names: list[str] = []
    failures: list[list] = []
    for tid, name in recipients.items():
        try:
            _tg_copy(tid, from_chat_id, message_ids)
            sent += 1
        except Exception as e:
            failed_names.append(name)
            failures.append([tid, name, _failure_reason(e)])
            logger.warning("Draft broadcast %s → %s (%s) failed: %s", draft.id, tid, name, e)
        time.sleep(0.05)  # stay under Telegram's ~30 msg/s ceiling

    total = len(recipients)
    failed = len(failed_names)

    from app.telegram_bot import admin_profile_name, notify_broadcast_result
    row = Broadcast(
        sender_telegram_id=admin_tid,
        sender_name=admin_profile_name(admin_tid),
        mode="copy",
        text_html="", text_plain=(draft.preview_text or "")[:200],
        attachment_kind=None, attachment_name=None,
        media_names=[],
        target_keys=want, recipient_total=total,
        sent_count=sent, failed_count=failed, failed_names=failed_names,
        failures=failures,
        # Persisted so a bot-composed broadcast opens the same per-recipient
        # record page as a panel-composed one. Safe on a row created 'done':
        # the resume sweep only claims 'sending' rows, and _retryable() refuses
        # copy-mode outright, so this list is read by the record page alone.
        recipients=[[tid, name] for tid, name in recipients.items()],
        send_cursor=total,
        status="done", finished_at=datetime.now(timezone.utc),
    )
    db.add(row)
    draft.status = "sent"
    db.commit()

    # Edit the bot's picker message into a final summary (best-effort).
    if draft.warn_message_id:
        try:
            notify_broadcast_result(admin_tid, draft.warn_message_id, sent, total, failed)
        except Exception:
            logger.warning("Broadcast result edit failed for admin %s", admin_tid, exc_info=True)

    return {"sent": sent, "failed": failed, "total": total, "failed_names": failed_names}


# ── Custom (premium) emoji palette ────────────────────────────────────────────
# A small reusable library for the composer. Each entry is a numeric
# custom_emoji_id + a plain fallback char; the editor inserts them as
# <tg-emoji emoji-id="…">fallback</tg-emoji>. Admin-managed — add each one once
# (grab the id by forwarding the emoji to the bot, which echoes it back).

class _EmojiIn(BaseModel):
    emoji_id: str
    fallback: str
    label: str | None = None


def _emoji_dict(e: CustomEmoji) -> dict:
    return {"id": e.id, "emoji_id": e.emoji_id, "fallback": e.fallback, "label": e.label or ""}


@router.get("/emojis")
def list_custom_emojis(db: Session = Depends(get_db),
                       _: dict = Depends(verify_broadcast_admin)):
    rows = db.query(CustomEmoji).order_by(CustomEmoji.id).all()
    return [_emoji_dict(e) for e in rows]


@router.post("/emojis")
def add_custom_emoji(body: _EmojiIn, db: Session = Depends(get_db),
                     payload: dict = Depends(verify_broadcast_admin)):
    """Add (or update) a saved premium emoji. Keyed by emoji_id, so re-adding
    the same id just refreshes its fallback/label."""
    eid = (body.emoji_id or "").strip()
    fallback = (body.fallback or "").strip()
    if not eid.isdigit():
        raise HTTPException(status_code=422, detail="emoji_id must be a numeric custom_emoji_id")
    if not fallback or len(fallback) > 16:
        raise HTTPException(status_code=422, detail="A single fallback emoji is required")
    label = ((body.label or "").strip() or None)
    if label and len(label) > 40:
        label = label[:40]
    row = db.query(CustomEmoji).filter_by(emoji_id=eid).first()
    if row:
        row.fallback = fallback
        row.label = label
    else:
        row = CustomEmoji(emoji_id=eid, fallback=fallback, label=label,
                          created_by=int(payload.get("sub", 0) or 0))
        db.add(row)
    db.commit()
    db.refresh(row)
    return _emoji_dict(row)


@router.delete("/emojis/{emoji_row_id}")
def delete_custom_emoji(emoji_row_id: int, db: Session = Depends(get_db),
                        _: dict = Depends(verify_broadcast_admin)):
    row = db.query(CustomEmoji).filter_by(id=emoji_row_id).first()
    if row:
        db.delete(row)
        db.commit()
    return {"ok": True}


# ── One broadcast's record ────────────────────────────────────────────────────
# Declared LAST on purpose: "/{bid}" would otherwise shadow every literal GET
# path on this router (/history, /recipients, /emojis), which FastAPI resolves
# in declaration order.

@router.get("/{bid}")
def broadcast_record(bid: int, db: Session = Depends(get_db),
                     _: dict = Depends(verify_admin)):
    """One broadcast plus its per-recipient delivery list — the payload behind
    /broadcast/:id, which replaces the old history modal.

    Per-recipient status is DERIVED, never stored twice: the resolved recipient
    list is ordered and `send_cursor` says how far the fan-out got, so anyone
    before the cursor was attempted and anyone after it has not been. Whether an
    attempted recipient succeeded comes from `failures` (keyed by telegram_id,
    carrying the reason). Rows written before that column exists only have
    `failed_names`, so those are matched back positionally exactly the way
    /retry rebuilds its subset — one name claims one slot — and report no
    reason rather than a guessed one.
    """
    r = db.query(Broadcast).filter_by(id=bid).first()
    if not r:
        raise HTTPException(status_code=404, detail="Broadcast not found")

    recipients = r.recipients or []
    cursor = r.send_cursor or 0

    reasons: dict[int, str | None] = {}
    for f in (r.failures or []):
        if isinstance(f, (list, tuple)) and len(f) >= 2:
            try:
                reasons[int(f[0])] = (f[2] if len(f) > 2 else None)
            except (TypeError, ValueError):
                continue
    legacy = None if reasons else Counter(r.failed_names or [])

    # Nothing was attempted for these: 'scheduled' has not fired, 'canceled'
    # never will. Both must read differently from "delivered", and from each
    # other — a canceled row saying "pending" promises a send that is not coming.
    unattempted = r.status in ("scheduled", "canceled")

    people = []
    for i, entry in enumerate(recipients):
        if isinstance(entry, (list, tuple)) and len(entry) >= 2:
            tid, name = entry[0], entry[1]
        else:
            tid, name = entry, None
        if unattempted or i >= cursor:
            people.append({"telegram_id": tid, "name": name,
                           "status": "canceled" if r.status == "canceled" else "pending",
                           "error": None})
            continue
        failed, reason = False, None
        if reasons:
            try:
                failed = int(tid) in reasons
            except (TypeError, ValueError):
                failed = False
            reason = reasons.get(int(tid)) if failed else None
        elif legacy and legacy.get(name):
            legacy[name] -= 1
            failed = True
        people.append({"telegram_id": tid, "name": name,
                       "status": "failed" if failed else "delivered",
                       "error": reason})

    out = _row_summary(r)
    out.update({
        "people": people,
        # A retry REPLACES the row's recipient list with the failed subset, so
        # the table can legitimately be shorter than recipient_total. Saying so
        # beats silently showing 12 rows under a total of 337.
        "partial_list": bool(people) and len(people) < (r.recipient_total or 0),
        "target_keys": r.target_keys or [],
        # copy-mode content lives in the sender's own Telegram chat, not here —
        # there is nothing to prefill a new composer with.
        "can_duplicate": (r.mode or "normal") != "copy" and bool(r.target_keys),
        "has_media": bool(r.attachment_kind or r.media_names),
    })
    return out
