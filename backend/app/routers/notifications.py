from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import date
from typing import Annotated, Optional
import jwt
from jwt import PyJWTError as JWTError

from app.config import settings
from app.database import get_db
from app.identity import viewer_profile_key
from app.models import Notification
from app.security import require_auth
from app.services import action_log
from app.services import notif_queue
from app.services import notification_center as center
from app.translit import transliterate_text
# Notification text is template-based: rows store a template key + raw params and
# the renderer lives with the templates in routers.staff. Importing it here lets
# us render each row in the *viewer's* current language at request time.
# _viewer_profile_key resolves the caller's ACTIVE profile — profile-addressed
# rows are delivered per-profile, not per-account.
from app.routers.staff import _mk_notif, _get_user_lang, _viewer_profile_key

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp", auto_error=False)


def _decode_token(token: str | None) -> dict | None:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        return None


def _require_admin(token: Annotated[str | None, Depends(_oauth2)]):
    payload = _decode_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return payload


class NotificationCreate(BaseModel):
    title: str
    body: str
    type: str = "info"
    recipient_telegram_id: Optional[int] = None


def _row(r, lang: str):
    """Serialise a row, rendering its template in ``lang`` at view time. Template
    rows (nkey set) re-render in any language from their stored params; free-form
    rows (admin broadcast / legacy) keep their stored text but are transliterated
    to match the viewer's script (Cyrillic→Latin for uz/en), like the dashboard."""
    if r.nkey:
        try:
            title, body = _mk_notif(r.nkey, r.params or {}, lang)
        except Exception:
            title, body = r.title or r.nkey, r.body or ""
    else:
        title = transliterate_text(r.title or "", lang)
        body  = transliterate_text(r.body or "", lang)
    return {
        "id":         r.id,
        "title":      title,
        "body":       body,
        "type":       r.type,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_notifications(
    lang: Optional[str] = None,
    token: Annotated[str | None, Depends(_oauth2)] = None,
    db: Session = Depends(get_db),
):
    """LEGACY — the bell before the notification centre (2026-10-01). Kept for
    a tab still open on an older bundle, which reads exactly this array; the
    current bundle reads /center, /feed and /queue below.

    Returns notifications relevant to the caller:
    - broadcast (no recipient at all)
    - addressed to their ACTIVE profile (recipient_profile)
    - legacy account-keyed rows addressed to their telegram account

    Profile-addressed rows never leak across the account's other profiles:
    switching roles re-issues the JWT, and the filter matches the profile the
    caller is currently switched into.

    Each row is rendered in ``lang`` (the viewer's current UI language). When it
    is omitted, the caller's saved language is used; otherwise Uzbek.
    """
    payload = _decode_token(token)
    telegram_id = int(payload["sub"]) if payload else None
    view_lang = lang or (_get_user_lang(db, telegram_id) if telegram_id else None) or "uz"

    q = db.query(Notification).order_by(Notification.created_at.desc())

    if telegram_id:
        # Broadcast + own legacy rows. Profile-addressed rows (recipient_profile
        # set) are excluded here even when recipient_telegram_id matches — they
        # belong to exactly one profile.
        conds = [
            and_(
                Notification.recipient_profile == None,               # noqa: E711
                or_(
                    Notification.recipient_telegram_id == None,       # noqa: E711
                    Notification.recipient_telegram_id == telegram_id,
                ),
            )
        ]
        profile_key = _viewer_profile_key(db, payload)
        if profile_key:
            conds.append(Notification.recipient_profile == profile_key)
        q = q.filter(or_(*conds))
    else:
        q = q.filter(
            Notification.recipient_telegram_id == None,   # noqa: E711
            Notification.recipient_profile == None,       # noqa: E711
        )

    rows = q.limit(50).all()
    return [_row(r, view_lang) for r in rows]


@router.post("", status_code=201)
def create_notification(
    body: NotificationCreate,
    admin=Depends(_require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only — create a broadcast or targeted notification."""
    n = Notification(
        title=body.title,
        body=body.body,
        type=body.type,
        recipient_telegram_id=body.recipient_telegram_id,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    action_log.enrich(
        target_kind="notification", target_id=n.id, target_name=n.title,
        details=[
            ("title", n.title), ("type", n.type), ("text", n.body),
            ("audience", "everyone" if n.recipient_telegram_id is None
                         else f"tg:{n.recipient_telegram_id}"),
        ],
    )
    return {"id": n.id, "title": n.title}


@router.delete("/{notif_id}", status_code=204)
def delete_notification(
    notif_id: int,
    admin=Depends(_require_admin),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter(Notification.id == notif_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    nid, ntitle, ntype = n.id, n.title, n.type
    naudience = ("everyone" if n.recipient_telegram_id is None
                 else f"tg:{n.recipient_telegram_id}")
    db.delete(n)
    db.commit()
    action_log.enrich(
        target_kind="notification", target_id=nid, target_name=ntitle,
        details=[("title", ntitle), ("type", ntype), ("audience", naudience)],
    )


# ── the notification centre (2026-10-01) ──────────────────────────────────────
# services/notification_center is THE definition of the feed, read state and
# delivery settings; services/notif_queue of «Sizdan kutilmoqda». These
# endpoints only decide the language, the paging and the commit.

_LANGS = ("uz", "uz_cyrl", "ru", "en")
# The bell shows this many queue items; «barchasini ko'rish» shows them all.
QUEUE_PREVIEW = 3


def _lang(db: Session, payload: dict, lang: Optional[str]) -> str:
    if lang in _LANGS:
        return lang
    return _get_user_lang(db, int(payload["sub"])) or "uz"


def _top_id(db: Session, payload: dict) -> int:
    return center.top_id(db, payload)


def _commit_retrying(db: Session, write) -> object:
    """Run ``write`` and commit, once more on a unique-key race: two tabs of
    one person marking the same row read at the same moment both INSERT, and
    the loser must re-read the winner's mark rather than fail the tap."""
    try:
        out = write()
        db.commit()
        return out
    except IntegrityError:
        db.rollback()
        out = write()
        db.commit()
        return out


@router.get("/summary")
def summary(payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """What the header bell polls: how much is waiting on the viewer (the red
    number), whether anything arrived since they last opened it (the dot), and
    the newest row id — the Android app's phone notifications start counting
    from it while the app is on screen (utils/androidPush.js)."""
    return {"queue": notif_queue.count(db, payload), **center.counts(db, payload),
            "latest": _top_id(db, payload)}


@router.get("/center")
def get_center(lang: Optional[str] = None, payload: dict = Depends(require_auth),
               db: Session = Depends(get_db)):
    """Everything the opened bell draws in one request: the head of the queue,
    the newest feed entries, and the id the «seen» mark moves to."""
    lang = _lang(db, payload, lang)
    items = notif_queue.build(db, payload)
    feed = center.feed(db, payload, lang, days=3, min_entries=8, max_windows=6)
    return {
        "queue": {"total": len(items), "items": items[:QUEUE_PREVIEW]},
        "feed": feed,
        "top_id": _top_id(db, payload),
        **center.counts(db, payload),
    }


@router.get("/queue")
def get_queue(payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """The whole «Sizdan kutilmoqda» list, for the notifications page."""
    items = notif_queue.build(db, payload)
    return {"total": len(items), "items": items, "kinds": list(notif_queue.KIND_ORDER)}


@router.get("/feed")
def get_feed(
    lang: Optional[str] = None,
    before: Optional[str] = None,
    cats: Optional[str] = None,
    q: Optional[str] = None,
    unread: bool = False,
    payload: dict = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """One page of history, folded, over whole days ending before ``before``."""
    lang = _lang(db, payload, lang)
    before_d = None
    if before:
        try:
            before_d = date.fromisoformat(before[:10])
        except ValueError:
            raise HTTPException(status_code=400, detail="before must be YYYY-MM-DD")
    cat_set = {c for c in (cats or "").split(",") if c in center.CATEGORIES} or None
    out = center.feed(db, payload, lang, before=before_d, cats=cat_set,
                      q=(q or "")[:120], unread_only=unread)
    out["top_id"] = _top_id(db, payload)
    return out


class _Ids(BaseModel):
    ids: list[int] = []


@router.post("/read")
def mark_read(body: _Ids, payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Mark rows read — the ones a tap opened, or a folded line's whole set."""
    n = _commit_retrying(db, lambda: center.mark_read(db, payload, body.ids[:500]))
    return {"ok": True, "marked": n, **center.counts(db, payload)}


@router.post("/read-all")
def mark_all_read(payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """«Hammasini o'qildi» — one watermark, not one mark per row."""
    upto = _commit_retrying(db, lambda: center.mark_all_read(db, payload))
    return {"ok": True, "upto": upto, **center.counts(db, payload)}


class _Seen(BaseModel):
    upto: int


@router.post("/seen")
def mark_seen(body: _Seen, payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """The bell was opened with rows up to ``upto`` on screen."""
    _commit_retrying(db, lambda: center.mark_seen(db, payload, body.upto))
    return {"ok": True, **center.counts(db, payload)}


@router.get("/prefs")
def get_prefs(payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Per category: does Telegram DM it as well (``prefs``), and does the
    Android app show it as a phone notification (``push``)."""
    profile = viewer_profile_key(db, payload)
    return {
        "editable": bool(profile),
        "reason": None if profile else "no_profile",
        "categories": list(center.CATEGORIES),
        "prefs": center.prefs_for(db, profile),
        "push": center.prefs_for(db, profile, "push"),
    }


class _Prefs(BaseModel):
    prefs: dict[str, bool] = {}
    # Absent from a tab on an older bundle — and then left exactly as it is.
    push: Optional[dict[str, bool]] = None


@router.put("/prefs")
def put_prefs(body: _Prefs, payload: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Save the viewer's own switches. A profile-less session has nobody to
    save them for — the notices it reads are not addressed to a person."""
    profile = viewer_profile_key(db, payload)
    if not profile:
        raise HTTPException(status_code=409, detail="This session has no profile to save settings for")
    before = center.prefs_for(db, profile)
    before_push = center.prefs_for(db, profile, "push")

    def write():
        center.set_prefs(db, profile, body.prefs)
        if body.push is not None:
            center.set_prefs(db, profile, body.push, "push")

    _commit_retrying(db, write)
    after = center.prefs_for(db, profile)
    after_push = center.prefs_for(db, profile, "push")
    changed = [(c, ("telegram" if after[c] else "app only")) for c in center.CATEGORIES
               if before.get(c) != after.get(c)]
    changed += [(c, ("phone" if after_push[c] else "no phone")) for c in center.CATEGORIES
                if before_push.get(c) != after_push.get(c)]
    action_log.enrich(target_kind="notification_prefs", target_id=profile,
                      details=changed or [("unchanged", "")])
    return {"editable": True, "categories": list(center.CATEGORIES),
            "prefs": after, "push": after_push}
