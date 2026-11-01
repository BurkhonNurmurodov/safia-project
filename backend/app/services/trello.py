"""THE Trello client — reads boards through Trello's REST API, read-only.

The «Trello» page (/trello) shows a Trello board's analytics. Trello is
somebody else's system, so the platform keeps its own copy of what it read:
ONE compact snapshot per board in ``trello_boards.data`` (lists, labels,
members, every card — archived ones included — and each card's list moves out
of the board's action history), replaced whole by each read. The figures are
computed from that snapshot per request (``services/trello_analytics.py``);
nothing here writes to Trello.

**How it logs in.** A Trello API key (a Power-Up's, made at
trello.com/power-ups/admin) plus a user TOKEN that key issues — the token
acts as the Trello member who authorised it, so it reads exactly the boards
that member may open. Both travel in an ``Authorization: OAuth …`` header,
never in the URL, so no access log or httpx line carries them. The token is
asked for with ``scope=read``: it cannot change a board even if it leaks.

**Where they live.** ``app_settings``: the key as plain text (it names the
Power-Up), the token SEALED with ``web_auth.seal_password`` — the Verifix
password's rule. Neither is ever returned by an endpoint, logged or written
to the action register (which records only that the token changed).

**The host is fixed** (``api.trello.com``): the header is the credential, so
there is no host field to point it anywhere else.
"""
from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import AppSetting, TrelloBoard

log = logging.getLogger(__name__)

API = "https://api.trello.com/1/"

K_KEY = "trello_api_key"
K_TOKEN = "trello_token"            # SEALED — web_auth.seal_password
K_LAST_TEST = "trello_last_test"    # JSON: ok, who, at, error

_KEY_RE = re.compile(r"^[0-9a-fA-F]{32}$")
_TOKEN_RE = re.compile(r"^[A-Za-z0-9]{32,128}$")

CALL_TIMEOUT_S = 25.0
ACTION_PAGE = 1000          # Trello's maximum per page of actions
MAX_ACTION_PAGES = 20       # 20,000 moves — far more than a working board makes
MAX_BOARDS = 12

SYNC_MINUTES = "*/15"
BOOT_DELAY_S = 120
BOOT_IF_OLDER = timedelta(minutes=15)

# The action types that say WHERE a card is: born on the board, moved between
# lists, archived or brought back.
_ACTION_FILTER = ",".join((
    "createCard", "copyCard", "convertToCardFromCheckItem", "moveCardToBoard",
    "updateCard:idList", "updateCard:closed",
))

_CARD_FIELDS = "name,idList,idLabels,idMembers,closed,dateLastActivity,due,dueComplete,shortUrl,idShort"

_lock = threading.Lock()


class TrelloError(Exception):
    def __init__(self, code: str, message: str = "", status: Optional[int] = None):
        super().__init__(message or code)
        self.code = code
        self.message = message
        self.status = status


def now_aware() -> datetime:
    return datetime.now(timezone.utc)


# ── the stored credential ─────────────────────────────────────────────────────

def _get(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSetting).filter_by(key=key).first()
    return row.value if row else None


def _put(db: Session, key: str, value: Optional[str]) -> None:
    """Upsert, or delete when ``value`` is None. The caller commits."""
    row = db.query(AppSetting).filter_by(key=key).first()
    if value is None:
        if row is not None:
            db.delete(row)
        return
    if row is None:
        db.add(AppSetting(key=key, value=value))
    else:
        row.value = value


def credentials(db: Session) -> tuple[Optional[str], Optional[str]]:
    """(key, token) — the token opened. Only the client asks for it."""
    from app.web_auth import open_password
    sealed = _get(db, K_TOKEN)
    return (_get(db, K_KEY) or None), (open_password(sealed) if sealed else None)


def configured(db: Session) -> bool:
    key, token = credentials(db)
    return bool(key and token)


def config(db: Session) -> dict:
    """What the admin card shows — never the token."""
    from app.web_auth import open_password
    sealed = _get(db, K_TOKEN)
    return {
        "key": _get(db, K_KEY) or "",
        "token_set": bool(sealed),
        "token_readable": bool(sealed and open_password(sealed)),
        "last_test": last_test(db),
    }


def last_test(db: Session) -> Optional[dict]:
    raw = _get(db, K_LAST_TEST)
    try:
        return json.loads(raw) if raw else None
    except ValueError:
        return None


def save(db: Session, *, key: Optional[str], token: Optional[str], clear_token: bool = False) -> dict:
    """Store what changed. A blank token keeps the stored one. Returns
    {field: (old, new)} for the register — the token as its length only."""
    changed: dict = {}
    if key is not None:
        key = key.strip()
        if key and not _KEY_RE.match(key):
            raise ValueError("the API key is 32 letters and digits")
        old = _get(db, K_KEY) or ""
        if key != old:
            _put(db, K_KEY, key or None)
            changed["key"] = (old, key)
    if clear_token:
        if _get(db, K_TOKEN):
            _put(db, K_TOKEN, None)
            changed["token"] = "cleared"
    elif token:
        token = token.strip()
        if not _TOKEN_RE.match(token):
            raise ValueError("the token is 32–128 letters and digits")
        from app.web_auth import seal_password
        _put(db, K_TOKEN, seal_password(token))
        changed["token"] = len(token)
    if changed:
        # A new credential makes the last test's verdict about another one.
        _put(db, K_LAST_TEST, None)
    db.commit()
    return changed


# ── the HTTP client ──────────────────────────────────────────────────────────

def _client(key: str, token: str) -> httpx.Client:
    return httpx.Client(
        base_url=API, timeout=CALL_TIMEOUT_S, follow_redirects=False,
        headers={
            "Authorization": f'OAuth oauth_consumer_key="{key}", oauth_token="{token}"',
            "Accept": "application/json",
        })


def _call(c: httpx.Client, path: str, params: Optional[dict] = None):
    try:
        r = c.get(path, params=params or {})
    except httpx.TimeoutException as exc:
        raise TrelloError("timeout", str(exc)) from exc
    except httpx.HTTPError as exc:
        raise TrelloError("network", str(exc)) from exc
    if r.status_code == 200:
        try:
            return r.json()
        except ValueError as exc:
            raise TrelloError("bad_response", r.text[:200], 200) from exc
    text = (r.text or "").strip()[:200]
    if r.status_code in (401, 403):
        # Trello answers 401 both for a bad key/token and for a board the
        # token's member may not open; the caller knows which it asked.
        raise TrelloError("unauthorized", text, r.status_code)
    if r.status_code == 404 or (r.status_code == 400 and "invalid id" in text.lower()):
        raise TrelloError("not_found", text, r.status_code)
    if r.status_code == 429:
        raise TrelloError("rate_limited", text, 429)
    raise TrelloError("http", f"{r.status_code} {text}", r.status_code)


def _need_client(db: Session) -> httpx.Client:
    key, token = credentials(db)
    if not (key and token):
        raise TrelloError("not_configured")
    return _client(key, token)


def run_test(db: Session) -> dict:
    """Who the token belongs to — the whole connection test. Stored, so the
    card shows the last verdict on its next visit."""
    out: dict = {"at": now_aware().isoformat()}
    try:
        with _need_client(db) as c:
            me = _call(c, "members/me", {"fields": "username,fullName"})
        out.update(ok=True, who=me.get("fullName") or me.get("username"),
                   username=me.get("username"))
    except TrelloError as exc:
        out.update(ok=False, error=exc.code, detail=exc.message[:200])
    _put(db, K_LAST_TEST, json.dumps(out, ensure_ascii=False))
    db.commit()
    return out


# ── which board a pasted link names ─────────────────────────────────────────

_SHORT_RE = re.compile(r"trello\.com/[bc]/([A-Za-z0-9]{8})")
_INVITE_RE = re.compile(r"trello\.com/invite/b/([0-9a-fA-F]{24})")


def board_ref(raw: str) -> Optional[str]:
    """A board link (``trello.com/b/<short>/…``), an invite link
    (``trello.com/invite/b/<id>/…``), a short link or an id → what the API
    takes. None for anything else."""
    s = (raw or "").strip()
    m = _INVITE_RE.search(s)
    if m:
        return m.group(1).lower()
    m = _SHORT_RE.search(s)
    if m:
        return m.group(1)
    if re.fullmatch(r"[0-9a-fA-F]{24}", s):
        return s.lower()
    if re.fullmatch(r"[A-Za-z0-9]{8}", s):
        return s
    return None


def resolve_board(db: Session, raw: str) -> dict:
    ref = board_ref(raw)
    if not ref:
        raise TrelloError("bad_link")
    with _need_client(db) as c:
        try:
            b = _call(c, f"boards/{ref}", {"fields": "name,url,shortLink,closed"})
        except TrelloError as exc:
            if exc.code == "unauthorized" and configured(db):
                # The credential opens (or the test would say so); the board
                # is one the token's member is not on.
                raise TrelloError("no_access", exc.message, exc.status) from exc
            raise
    return {"id": b["id"], "name": b.get("name"), "url": b.get("url"), "short_link": b.get("shortLink")}


# ── reading one board ────────────────────────────────────────────────────────

def _compact_moves(actions: list) -> dict:
    """Per card, oldest first: [iso, "n", list] born · [iso, "m", list] moved
    · [iso, "c", 1|0] archived / brought back."""
    out: dict[str, list] = {}
    for a in actions:
        d = a.get("data") or {}
        card = (d.get("card") or {}).get("id")
        when = a.get("date")
        if not card or not when:
            continue
        t = a.get("type")
        if t in ("createCard", "copyCard", "convertToCardFromCheckItem"):
            lid = (d.get("list") or {}).get("id")
            out.setdefault(card, []).append([when, "n", lid])
        elif t == "moveCardToBoard":
            lid = (d.get("list") or {}).get("id")
            out.setdefault(card, []).append([when, "m", lid])
        elif t == "updateCard":
            if d.get("listAfter"):
                out.setdefault(card, []).append([when, "m", d["listAfter"].get("id")])
            elif "closed" in (d.get("old") or {}):
                out.setdefault(card, []).append([when, "c", 1 if (d.get("card") or {}).get("closed") else 0])
    for seq in out.values():
        seq.sort(key=lambda x: x[0])
    return out


def read_board(c: httpx.Client, board_id: str) -> dict:
    b = _call(c, f"boards/{board_id}", {
        "fields": "name,url,shortLink,closed",
        "lists": "all", "list_fields": "name,closed,pos",
        "labels": "all", "label_fields": "name,color",
        "members": "all", "member_fields": "fullName,username",
        "cards": "all", "card_fields": _CARD_FIELDS,
    })
    actions: list = []
    before = None
    truncated = False
    for page in range(MAX_ACTION_PAGES):
        params = {"filter": _ACTION_FILTER, "fields": "type,date,data", "limit": ACTION_PAGE,
                  "memberCreator": "false", "member": "false"}
        if before:
            params["before"] = before
        got = _call(c, f"boards/{board_id}/actions", params)
        actions.extend(got)
        if len(got) < ACTION_PAGE:
            break
        before = got[-1]["id"]
        if page == MAX_ACTION_PAGES - 1:
            truncated = True
    oldest = min((a["date"] for a in actions if a.get("date")), default=None)
    return {
        "board": {"id": b["id"], "name": b.get("name"), "url": b.get("url"),
                  "short_link": b.get("shortLink"), "closed": bool(b.get("closed"))},
        "lists": [{"id": l["id"], "name": l.get("name") or "", "pos": l.get("pos") or 0,
                   "closed": bool(l.get("closed"))} for l in b.get("lists") or []],
        "labels": [{"id": l["id"], "name": l.get("name") or "", "color": l.get("color")}
                   for l in b.get("labels") or []],
        "members": [{"id": m["id"], "name": m.get("fullName") or m.get("username") or ""}
                    for m in b.get("members") or []],
        "cards": [{
            "id": k["id"], "n": k.get("name") or "", "l": k.get("idList"),
            "lb": k.get("idLabels") or [], "m": k.get("idMembers") or [],
            "c": bool(k.get("closed")), "a": k.get("dateLastActivity"),
            "d": k.get("due"), "dc": bool(k.get("dueComplete")),
            "u": k.get("shortUrl"), "s": k.get("idShort"),
        } for k in b.get("cards") or []],
        "moves": _compact_moves(actions),
        "actions": len(actions),
        "actions_truncated": truncated,
        "history_from": oldest,
    }


def _read_row(db: Session, c: httpx.Client, row: TrelloBoard) -> None:
    row.tried_at = now_aware()
    try:
        data = read_board(c, row.id)
    except TrelloError as exc:
        row.error = exc.code + (f": {exc.message}" if exc.message else "")
        db.commit()
        raise
    row.data = data
    row.name = data["board"]["name"] or row.name
    row.url = data["board"]["url"] or row.url
    row.short_link = data["board"]["short_link"] or row.short_link
    row.read_at = row.tried_at
    row.error = None
    db.commit()


def running() -> bool:
    return _lock.locked()


def run_sync(trigger: str, board_id: Optional[str] = None) -> dict:
    """Read every board (or one). Never raises; one board failing never stops
    the others. Refuses while another sync runs in this process."""
    if not _lock.acquire(blocking=False):
        return {"started": False, "reason": "busy"}
    db = SessionLocal()
    ok, failed = 0, []
    try:
        q = db.query(TrelloBoard)
        if board_id:
            q = q.filter(TrelloBoard.id == board_id)
        rows = q.order_by(TrelloBoard.position, TrelloBoard.created_at).all()
        if not rows:
            return {"started": True, "ok": 0, "failed": []}
        try:
            client = _need_client(db)
        except TrelloError as exc:
            return {"started": False, "reason": exc.code}
        with client as c:
            for row in rows:
                try:
                    _read_row(db, c, row)
                    ok += 1
                except TrelloError as exc:
                    failed.append({"board": row.name or row.id, "error": exc.code})
                    log.warning("trello: board %s not read: %s %s", row.id, exc.code, exc.message[:120])
                    # Every further board would fail the same way: the network,
                    # the rate limit, or a credential that opened nothing yet.
                    if exc.code in ("network", "timeout", "rate_limited") or (
                            exc.code == "unauthorized" and not ok):
                        break
                except Exception as exc:  # noqa: BLE001 — a background read reports, never dies
                    db.rollback()
                    log.exception("trello: board %s read crashed", row.id)
                    try:
                        row.tried_at = now_aware()
                        row.error = f"error: {type(exc).__name__}"[:300]
                        db.commit()
                    except Exception:  # noqa: BLE001
                        db.rollback()
                    failed.append({"board": row.name or row.id, "error": "error"})
        if trigger != "schedule" or failed:
            from app.services import action_log
            action_log.record_system("sync_export", "sync.trello_read", db=None, details=[
                ("trigger", trigger), ("boards", ok), ("failed", len(failed)),
            ] + [("error", f"{f['board']}: {f['error']}") for f in failed[:5]])
        return {"started": True, "ok": ok, "failed": failed}
    finally:
        db.close()
        _lock.release()


def start_sync(trigger: str, board_id: Optional[str] = None) -> bool:
    if _lock.locked():
        return False
    threading.Thread(target=run_sync, args=(trigger, board_id), name="trello-read", daemon=True).start()
    return True


def _scheduled() -> None:
    db = SessionLocal()
    try:
        due = configured(db) and db.query(TrelloBoard.id).first() is not None
    finally:
        db.close()
    if due:
        run_sync("schedule")


def _boot() -> None:
    db = SessionLocal()
    try:
        if not configured(db):
            return
        rows = db.query(TrelloBoard.read_at).all()
        cut = now_aware() - BOOT_IF_OLDER
        due = any(r.read_at is None or r.read_at < cut for r in rows)
    finally:
        db.close()
    if due:
        run_sync("boot")


def register_jobs() -> None:
    """Every 15 minutes, and a catch-up read two minutes after boot when a
    board's last read is older than that. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        get_scheduler().add_job(
            _scheduled, trigger=CronTrigger(minute=SYNC_MINUTES, timezone=SCHEDULER_TZ),
            id="trello-read", replace_existing=True)
        schedule_at("trello-boot", now_aware() + timedelta(seconds=BOOT_DELAY_S), _boot)
        log.info("trello: jobs registered (every 15 min)")
    except Exception:  # noqa: BLE001
        log.exception("trello: could not register the jobs")
