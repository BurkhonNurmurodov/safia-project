"""«Ta'lim» (/education) — video lessons published to PROFILES.

An admin publishes a lesson (link + title + an optional formatted description)
and names its audience; everybody named gets a bell row, a Telegram DM and the
lesson on their own /education page. Nobody else can see it — not in the list,
not by guessing an id.

Three rules this module is built on, each of which is a rule the platform
already keeps somewhere else:

* **The audience is a set of PROFILES, never of accounts.** `notify_profile` is
  THE way to reach a person (one bell row per profile, a DM to every holder, and
  a row that waits in the bell for an unclaimed profile), and the target rows
  use the same `identity.profile_key` currency. A lesson belongs to the POST, so
  a handover carries it.

* **Reads are scoped server-side.** `?id=` is typeable, so the single-lesson
  door re-checks the audience rather than trusting the list to have hidden it.

* **The embed is REBUILT on read** from the stored `provider`/`video_id`
  (`services/education_video`), never stored, so a player-parameter change
  reaches every lesson ever published.

Page key ``education``. Publishing is ADMIN-ONLY and not grantable: a lesson
DMs a chosen slice of the plant, which is the broadcast tab's blast radius, and
the endpoints are reachable without the UI — so every writer re-checks the role
itself rather than relying on a hidden button.
"""
from __future__ import annotations

import logging

from datetime import datetime, timezone
from html import escape
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import profile_display_name, viewer_profile_key
from app.models import (
    EducationLesson, EducationLessonProgress, EducationLessonTarget,
    EducationLessonView,
)
from app.permissions import require_page
from app.services import education_progress, education_video
from app.xlsx_delivery import deliver_xlsx
from app.services.action_log import enrich

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/education", tags=["education"])

PAGE = "education"
# A lesson may be published to at most this many profiles at once. The plant has
# a few hundred; a cap that cannot be hit in normal use still stops a malformed
# client turning one press into an unbounded fan-out of DMs.
MAX_TARGETS = 600

# One flush may carry at most this many play-spans. An honest player produces a
# handful (one per continuous run between seeks); the cap is what stops a
# malformed client turning a single POST into an unbounded merge.
MAX_SPANS_IN = 500
# A reported duration outside this is not believed. Nothing on this platform is
# a twelve-hour video, and a player reporting `Infinity` for a stream that has
# not loaded would otherwise become a denominator nobody could ever satisfy.
MAX_DURATION_S = 12 * 3600

# How long a description excerpt may run inside the card. Long enough to say
# what the lesson is about, short enough that the DM stays a nudge rather than
# becoming the lesson — the page is where it gets read.
EXCERPT_MAX = 180

# The rich DM card, per language. Backend strings live in the module (there is
# no server-side t()), the same shape as the ojidaniya card's own table.
_CARD_L = {
    "uz": {
        "title": "Yangi video dars",
        "intro_who": "<b>{who}</b> sizga yangi video dars qo'shdi:",
        "intro": "Sizga yangi video dars biriktirildi:",
        "src": "Manba",
        "hint": "Ko'rish uchun quyidagi tugmani bosing.",
    },
    "uz_cyrl": {
        "title": "Янги видео дарс",
        "intro_who": "<b>{who}</b> сизга янги видео дарс қўшди:",
        "intro": "Сизга янги видео дарс бириктирилди:",
        "src": "Манба",
        "hint": "Кўриш учун қуйидаги тугмани босинг.",
    },
    "ru": {
        "title": "Новый видеоурок",
        "intro_who": "<b>{who}</b> добавил(а) для вас новый видеоурок:",
        "intro": "Вам назначен новый видеоурок:",
        "src": "Источник",
        "hint": "Нажмите кнопку ниже, чтобы посмотреть.",
    },
    "en": {
        "title": "New video lesson",
        "intro_who": "<b>{who}</b> added a new video lesson for you:",
        "intro": "A new video lesson has been assigned to you:",
        "src": "Source",
        "hint": "Press the button below to watch it.",
    },
}


def excerpt(text: Optional[str], limit: int = EXCERPT_MAX) -> str:
    """A one-paragraph taste of the description for the card and the bell row.

    Cuts on a WORD boundary — a card that stops mid-word reads as broken rather
    than as abbreviated — and collapses the newlines the classic Telegram
    serializer emits, because a card is not the place to reproduce the lesson's
    own line breaks. Returns "" for nothing, which is what makes the row it
    fills drop out whole instead of leaving a dangling label.
    """
    flat = " ".join((text or "").split())
    if len(flat) <= limit:
        return flat
    cut = flat[:limit]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > limit * 0.6 else cut).rstrip(" ,.;:—-") + "…"


# The DM's one button, per language. A backend string lives in the module (there
# is no server-side t()) — same shape as the ojidaniya card's own label table.
_DM_BTN = {
    "uz": "Darsni ochish",
    "uz_cyrl": "Дарсни очиш",
    "ru": "Открыть урок",
    "en": "Open the lesson",
}


# ── request bodies ───────────────────────────────────────────────────────────

class LessonIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    url: str = Field(min_length=1)
    description_html: Optional[str] = None
    description_text: Optional[str] = None
    targets: list[str] = Field(default_factory=list)


class ResolveIn(BaseModel):
    url: str = ""


# ── helpers ──────────────────────────────────────────────────────────────────

def _is_admin(payload: dict) -> bool:
    return payload.get("role") == "admin"


def _require_admin(payload: dict) -> None:
    if not _is_admin(payload):
        raise HTTPException(status_code=403, detail="admin_only")


def _clean_targets(raw: list[str]) -> list[str]:
    """De-duplicated, order-preserving, "role:id"-shaped keys only.

    A malformed key is DROPPED rather than stored: a target row nothing can
    resolve is an audience member no admin can see and no reader can be."""
    out, seen = [], set()
    for k in raw or []:
        key = str(k).strip()
        if not key or ":" not in key or key in seen:
            continue
        role, _, ref = key.partition(":")
        if not role or not ref.isdigit():
            continue
        seen.add(key)
        out.append(key)
    return out[:MAX_TARGETS]


def _lesson_json(db: Session, lesson: EducationLesson, *, viewer: Optional[str],
                 admin: bool, seen: set[int], mine: set[int],
                 counts: dict[int, int],
                 target_map: dict[int, list[str]],
                 progress: Optional[dict[int, dict]] = None,
                 done_counts: Optional[dict[int, int]] = None) -> dict:
    media = education_video.rebuild(lesson.provider, lesson.video_id)
    # The stored poster is the resolved one (Loom/Vimeo carry an unguessable
    # hash); rebuild() can only derive YouTube's. Either may legitimately be
    # None, and the card draws its own poster then.
    thumb = lesson.thumb_url or media["thumb"]
    targets = target_map.get(lesson.id, [])
    out = {
        "id": lesson.id,
        "title": lesson.title,
        "url": lesson.url,
        "provider": lesson.provider,
        "video_id": lesson.video_id,
        "embed": media["embed"],
        "thumb": thumb,
        "watch": media["watch"],
        "description_html": lesson.description_html or "",
        "description_text": lesson.description_text or "",
        "author": lesson.created_by_name,
        "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
        "updated_at": lesson.updated_at.isoformat() if lesson.updated_at else None,
        # Two separate facts, because an ADMIN sees every lesson including the
        # ones addressed to other people. "Assigned to me" is what makes a
        # lesson mine; "seen" is whether I have opened it. The «Yangi» badge is
        # the AND of them, so an admin never carries an unread mark for a class
        # they were never in — and never loses one for a class they were.
        "assigned": (lesson.id in mine) if viewer else False,
        "seen": (lesson.id in seen) if viewer else True,
        "audience": len(targets),
        # How long the video is, once any player has said. NULL is ordinary —
        # nobody has opened it yet — and the card prints no duration for it
        # rather than a zero that reads as an empty video.
        "duration_s": lesson.duration_s,
    }
    # The viewer's OWN coverage, so a card can show how far through they are and
    # the lesson page can resume. Absent for a viewer with no profile.
    mine_prog = (progress or {}).get(lesson.id)
    out["progress"] = mine_prog or {
        "pct": 0.0, "covered_s": 0, "complete": False}
    if admin:
        # Only an admin is told the video is unviewable: it is a fact about the
        # publishing, not about the lesson, and the person who can fix it is the
        # one who shared the video.
        out["access"] = lesson.access
        # Only an admin is handed the audience itself: it names who has been
        # given which training, which is nobody else's business.
        out["targets"] = targets
        out["watched"] = counts.get(lesson.id, 0)
        # Two different facts and the register keeps them apart: `watched` is
        # how many OPENED it, `completed` how many watched every second of it.
        # Only 100% counts as watched (services/education_progress), so the gap
        # between these two numbers is the whole point of the feature.
        out["completed"] = (done_counts or {}).get(lesson.id, 0)
        out["archived"] = bool(lesson.archived)
    return out


def _visible_ids(db: Session, viewer: Optional[str]) -> set[int]:
    if not viewer:
        return set()
    rows = db.query(EducationLessonTarget.lesson_id).filter(
        EducationLessonTarget.profile_key == viewer).all()
    return {r[0] for r in rows}


def _load(db: Session, lesson_id: int) -> EducationLesson:
    lesson = db.query(EducationLesson).filter(EducationLesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="lesson_not_found")
    return lesson


# ── reads ────────────────────────────────────────────────────────────────────

@router.get("/lessons")
def list_lessons(db: Session = Depends(get_db),
                 payload: dict = Depends(require_page(PAGE))):
    """The viewer's own lessons, newest first. An admin gets every lesson (the
    register they publish from), everyone else exactly what is addressed to
    their active profile."""
    admin = _is_admin(payload)
    viewer = viewer_profile_key(db, payload)

    mine = _visible_ids(db, viewer)
    q = db.query(EducationLesson)
    if not admin:
        if not mine:
            return {"lessons": [], "can_manage": False, "profile": viewer}
        q = q.filter(EducationLesson.id.in_(mine),
                     EducationLesson.archived.is_(False))
    lessons = q.order_by(EducationLesson.created_at.desc().nullslast(),
                         EducationLesson.id.desc()).all()

    ids = [x.id for x in lessons]
    target_map: dict[int, list[str]] = {}
    counts: dict[int, int] = {}
    seen: set[int] = set()
    if ids:
        for lid, key in db.query(EducationLessonTarget.lesson_id,
                                 EducationLessonTarget.profile_key).filter(
                EducationLessonTarget.lesson_id.in_(ids)).all():
            target_map.setdefault(lid, []).append(key)
        if admin:
            for lid, n in db.query(EducationLessonView.lesson_id,
                                   func.count(EducationLessonView.id)).filter(
                    EducationLessonView.lesson_id.in_(ids)).group_by(
                    EducationLessonView.lesson_id).all():
                counts[lid] = n
        if viewer:
            seen = {r[0] for r in db.query(EducationLessonView.lesson_id).filter(
                EducationLessonView.lesson_id.in_(ids),
                EducationLessonView.profile_key == viewer).all()}

    progress: dict[int, dict] = {}
    done_counts: dict[int, int] = {}
    if ids:
        if viewer:
            for row in db.query(EducationLessonProgress).filter(
                    EducationLessonProgress.lesson_id.in_(ids),
                    EducationLessonProgress.profile_key == viewer).all():
                progress[row.lesson_id] = {
                    "pct": round(float(row.pct or 0), 4),
                    "covered_s": int(row.covered_s or 0),
                    "complete": row.completed_at is not None,
                }
        if admin:
            for lid, n in db.query(
                    EducationLessonProgress.lesson_id,
                    func.count(EducationLessonProgress.id)).filter(
                    EducationLessonProgress.lesson_id.in_(ids),
                    EducationLessonProgress.completed_at.isnot(None)).group_by(
                    EducationLessonProgress.lesson_id).all():
                done_counts[lid] = n

    return {
        "lessons": [_lesson_json(db, x, viewer=viewer, admin=admin, seen=seen,
                                 mine=mine, counts=counts, target_map=target_map,
                                 progress=progress, done_counts=done_counts)
                    for x in lessons],
        "can_manage": admin,
        "profile": viewer,
    }


# Path shape matters: the action-log's telemetry exclusion list matches by
# PREFIX, and "/lessons/{id}/seen" has its variable in the middle. Every viewer
# opening a lesson would otherwise write a register row.
@router.post("/seen/{lesson_id}")
def mark_seen(lesson_id: int, db: Session = Depends(get_db),
              payload: dict = Depends(require_page(PAGE))):
    """The viewer opened this lesson. Idempotent — the row records the FIRST
    time, so a re-watch never rewrites when they were taught."""
    lesson = _load(db, lesson_id)
    viewer = viewer_profile_key(db, payload)
    if not viewer:
        return {"ok": True}
    if not _is_admin(payload) and lesson.id not in _visible_ids(db, viewer):
        raise HTTPException(status_code=403, detail="not_your_lesson")
    row = db.query(EducationLessonView).filter(
        EducationLessonView.lesson_id == lesson_id,
        EducationLessonView.profile_key == viewer).first()
    if not row:
        db.add(EducationLessonView(lesson_id=lesson_id, profile_key=viewer))
        db.commit()
    return {"ok": True}


@router.get("/recipients")
def recipients(db: Session = Depends(get_db),
               payload: dict = Depends(require_page(PAGE))):
    """The role ▸ [shift ▸ supervisor] ▸ profile tree the audience is picked
    from — the SAME structure the broadcast picker is built on, so the two
    pickers can never disagree about who exists. Reused rather than re-spelled:
    a second org walk is a second answer to "who works here"."""
    _require_admin(payload)
    from app.routers.broadcast import _profile_holders

    blocks = _profile_holders(db)
    tree = [{
        "role": b["role"],
        "profiles": [{
            "key": p["key"],
            "name": p["name"],
            "shift": p.get("shift"),
            "unit": p.get("unit"),
            "unit_id": p.get("unit_id"),
            # The audience is profiles, so the accounts underneath are not the
            # target — but the COUNT is worth showing: a profile nobody holds
            # gets the lesson and no DM until somebody claims it, and an admin
            # picking an audience should be able to see that.
            "users": [{"telegram_id": t} for t in p.get("user_ids", [])],
        } for p in b["profiles"]],
    } for b in blocks]
    return {"tree": tree}


@router.post("/resolve")
def resolve(body: ResolveIn, payload: dict = Depends(require_page(PAGE))):
    """Parse a pasted link for the wizard's live preview. The SAME parser the
    writers use, asked over the wire, so the preview and the stored lesson can
    never be two different readings of one URL."""
    _require_admin(payload)
    try:
        info = education_video.parse(body.url)
        # The probe is what makes the preview worth having: it is the only
        # moment the platform can tell the admin that the video they are about
        # to assign is private, while they can still fix the sharing setting.
        return {"ok": True, **info,
                **education_video.probe(info["provider"], info["video_id"])}
    except education_video.BadVideoUrl as e:
        return {"ok": False, "reason": str(e),
                "providers": list(education_video.PROVIDERS)}


# ── writes (admin only) ──────────────────────────────────────────────────────

def _notify_targets(db: Session, lesson: EducationLesson, keys: list[str]) -> int:
    """Tell each newly-addressed profile about the lesson. One bell row per
    profile plus a DM to every holder — `notify_profile` is the only correct
    way to reach a person here, and it queues for an unclaimed profile instead
    of dropping the news.

    The publisher is NOT excluded. `notify_profile`'s `exclude_account` exists
    to spare somebody the "you did this" buzz for an event they caused
    incidentally — closing a day, approving a request. Naming yourself in a
    lesson's audience is not that: it is an explicit statement that this lesson
    is for you, and an admin who ticks their own profile and then receives
    nothing has been shown the feature failing."""
    if not keys:
        return 0
    from app.config import settings
    from app.routers.staff import notify_profile

    # Straight at the LESSON, not at the page. A notification whose whole point
    # is "go and watch this" should not land somebody on a grid they then have
    # to search — and the watch page is a real route precisely so it can.
    url = f"{settings.webapp_url.rstrip('/')}/education/{lesson.id}"

    def markup_fn(lang: str):
        from telebot import types
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(
            _DM_BTN.get(lang) or _DM_BTN["uz"],
            web_app=types.WebAppInfo(url=url)))
        return kb

    who = lesson.created_by_name or ""
    snippet = excerpt(lesson.description_text)
    params = {
        "title": lesson.title,
        "author": who,
        "provider": education_video.label(lesson.provider),
        "excerpt": snippet,
    }

    def rich_fn(lang: str) -> str:
        """The card. Tried FIRST by notify_profile and degrading to the classic
        HTML DM (the `_NOTIF_TG_ICON` promotion of the bell row) when the client
        or the API refuses it — so a recipient on an old Telegram is never worse
        off than before this existed.

        Everything interpolated is admin-typed free text, so every value is
        escaped: a lesson titled with an ampersand must not break the card, and
        a title field is not a place to inject markup."""
        c = _CARD_L.get(lang) or _CARD_L["uz"]
        intro = (c["intro_who"].format(who=escape(who)) if who else c["intro"])
        parts = [
            f"<h4>\U0001F393 {escape(c['title'])}</h4>",
            f"<p>{intro}</p>",
            # The lesson's NAME is the one thing the reader must come away with,
            # so it is the only thing in a quote block.
            f"<blockquote><b>{escape(lesson.title)}</b></blockquote>",
        ]
        if snippet:
            parts.append(f"<p>\U0001F4DD {escape(snippet)}</p>")
        parts.append(
            f"<p>\u25B6\uFE0F <b>{escape(c['src'])}:</b> "
            f"{escape(education_video.label(lesson.provider))}</p>")
        parts.append(f"<p><i>{escape(c['hint'])}</i></p>")
        return "".join(parts)

    dmed: set[int] = set()
    for key in keys:
        try:
            dmed |= notify_profile(db, key, "education_lesson_new", params,
                                   type="info",
                                   skip_accounts=dmed, markup_fn=markup_fn,
                                   rich_fn=rich_fn)
        except Exception:
            # One unreachable profile must never cost the rest of the class its
            # notification — the lesson is already published either way. LOGGED,
            # though: a silently swallowed failure here is indistinguishable
            # from "nobody was in the audience".
            logger.exception("education: notifying %s about lesson %s failed",
                             key, lesson.id)
            continue
    return len(keys)


@router.post("/lessons")
def create_lesson(body: LessonIn, db: Session = Depends(get_db),
                  payload: dict = Depends(require_page(PAGE))):
    _require_admin(payload)
    try:
        media = education_video.parse(body.url)
    except education_video.BadVideoUrl:
        raise HTTPException(status_code=422, detail="bad_video_url")

    keys = _clean_targets(body.targets)
    author_key = viewer_profile_key(db, payload)
    # ONE probe: the poster and whether the video is viewable by anyone but the
    # publisher. Both are facts about this video at this moment, so they are
    # asked and stored together.
    probe = education_video.probe(media["provider"], media["video_id"])
    lesson = EducationLesson(
        title=body.title.strip(),
        url=body.url.strip(),
        provider=media["provider"],
        video_id=media["video_id"],
        description_html=(body.description_html or "").strip() or None,
        description_text=(body.description_text or "").strip() or None,
        created_by_profile=author_key,
        created_by_name=profile_display_name(db, author_key),
        thumb_url=probe["thumb"],
        access=probe["access"],
    )
    db.add(lesson)
    db.flush()
    for key in keys:
        db.add(EducationLessonTarget(lesson_id=lesson.id, profile_key=key))
    db.commit()

    _notify_targets(db, lesson, keys)
    db.commit()
    enrich(target_kind="lesson", target_id=str(lesson.id),
           target_name=lesson.title,
           details=[("provider", lesson.provider), ("targets", len(keys))])
    return {"ok": True, "id": lesson.id, "notified": len(keys)}


@router.put("/lessons/{lesson_id}")
def update_lesson(lesson_id: int, body: LessonIn, db: Session = Depends(get_db),
                  payload: dict = Depends(require_page(PAGE))):
    """Edit a lesson, its audience included.

    Only the profiles ADDED by this edit are notified. Re-announcing a lesson to
    the people who already had it — every time a typo in the title is fixed —
    is how a notification channel stops being read."""
    _require_admin(payload)
    lesson = _load(db, lesson_id)
    try:
        media = education_video.parse(body.url)
    except education_video.BadVideoUrl:
        raise HTTPException(status_code=422, detail="bad_video_url")

    before = {r.profile_key for r in db.query(EducationLessonTarget).filter(
        EducationLessonTarget.lesson_id == lesson_id).all()}
    keys = _clean_targets(body.targets)
    after = set(keys)

    changed = (lesson.provider, lesson.video_id) != (media["provider"], media["video_id"])
    if changed or not lesson.thumb_url or not lesson.access:
        # Re-probe when the video changed, and also when a previous look-up came
        # back empty — a lesson published before this existed, or one whose
        # sharing setting has since been FIXED, gets its answer on any edit.
        p = education_video.probe(media["provider"], media["video_id"])
        lesson.thumb_url = p["thumb"] or (None if changed else lesson.thumb_url)
        lesson.access = p["access"]
    lesson.title = body.title.strip()
    lesson.url = body.url.strip()
    lesson.provider = media["provider"]
    lesson.video_id = media["video_id"]
    lesson.description_html = (body.description_html or "").strip() or None
    lesson.description_text = (body.description_text or "").strip() or None
    lesson.updated_at = datetime.now(timezone.utc)

    for gone in before - after:
        db.query(EducationLessonTarget).filter(
            EducationLessonTarget.lesson_id == lesson_id,
            EducationLessonTarget.profile_key == gone).delete()
    for added in after - before:
        db.add(EducationLessonTarget(lesson_id=lesson_id, profile_key=added))
    db.commit()

    fresh = [k for k in keys if k not in before]
    _notify_targets(db, lesson, fresh)
    db.commit()
    enrich(target_kind="lesson", target_id=str(lesson_id),
           target_name=lesson.title,
           details=[("added", len(fresh)), ("removed", len(before - after)),
                    ("targets", len(after))])
    return {"ok": True, "id": lesson_id, "notified": len(fresh)}


@router.delete("/lessons/{lesson_id}")
def archive_lesson(lesson_id: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_page(PAGE))):
    """Retire a lesson. SOFT — the views recorded against it are the record of
    who was taught what, so the row stays and only stops being served."""
    _require_admin(payload)
    lesson = _load(db, lesson_id)
    lesson.archived = True
    lesson.updated_at = datetime.now(timezone.utc)
    db.commit()
    enrich(target_kind="lesson", target_id=str(lesson_id), target_name=lesson.title)
    return {"ok": True}


@router.post("/lessons/{lesson_id}/restore")
def restore_lesson(lesson_id: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_page(PAGE))):
    _require_admin(payload)
    lesson = _load(db, lesson_id)
    lesson.archived = False
    lesson.updated_at = datetime.now(timezone.utc)
    db.commit()
    enrich(target_kind="lesson", target_id=str(lesson_id), target_name=lesson.title)
    return {"ok": True}


# ── watching ─────────────────────────────────────────────────────────────────

class ProgressIn(BaseModel):
    lesson_id: int
    # Minted by the player on mount. Only a flush CONTINUING the same session
    # earns wall-clock credit against `education_progress.allowance`, so a fresh
    # page cannot bank time it never spent.
    session: str = ""
    # What the player says the video's length is. Believed only in so far as it
    # RAISES the lesson's stored duration — see models.EducationLesson.
    duration: Optional[float] = None
    # Play-spans in seconds, floats, unordered, overlaps allowed. The union is
    # taken server-side; a client is never trusted to have taken it.
    spans: list[list[float]] = Field(default_factory=list)


@router.post("/progress")
def record_progress(body: ProgressIn, db: Session = Depends(get_db),
                    payload: dict = Depends(require_page(PAGE))):
    """A flush from a player: these are the parts of the lesson just watched.

    Called every few seconds while a lesson plays, so it is deliberately cheap
    and deliberately quiet — no action-log enrichment, no notification, no
    cascade. All the arithmetic lives in ``services/education_progress``; this
    endpoint's own job is authorisation, the shared denominator, and the
    wall-clock credit that bounds what a client may claim.
    """
    lesson = _load(db, body.lesson_id)
    viewer = viewer_profile_key(db, payload)
    if not viewer:
        return {"ok": True, "pct": 0.0, "complete": False}
    assigned = lesson.id in _visible_ids(db, viewer)
    if not assigned and not _is_admin(payload):
        raise HTTPException(status_code=403, detail="not_your_lesson")

    now = datetime.now(timezone.utc)

    # The denominator is the LESSON's, and it only ever grows. A client
    # under-reporting the length of the video it is watching cannot shrink its
    # own target; one that reports a longer duration than we knew has simply
    # loaded metadata a previous viewer never did.
    reported = body.duration
    if reported and 0 < float(reported) <= MAX_DURATION_S:
        secs = int(round(float(reported)))
        if not lesson.duration_s or secs > lesson.duration_s:
            lesson.duration_s = secs
    total = education_progress.total_buckets(lesson.duration_s)

    # An ADMIN previewing somebody else's lesson is not a member of the class
    # and must not appear in its figures — the rule `mark_seen` already applies.
    if not assigned:
        return {"ok": True, "pct": 0.0, "covered_s": 0, "total_s": total,
                "complete": False, "tracked": False}

    row = db.query(EducationLessonProgress).filter(
        EducationLessonProgress.lesson_id == lesson.id,
        EducationLessonProgress.profile_key == viewer).first()
    if not row:
        row = EducationLessonProgress(
            lesson_id=lesson.id, profile_key=viewer, spans=[], covered_s=0,
            pct=0.0, watch_time_s=0.0, session_id=body.session or None,
            anomalies=0, first_at=now)
        db.add(row)
        db.flush()

    same_session = bool(body.session) and body.session == (row.session_id or "")
    elapsed = (now - row.last_at).total_seconds() if row.last_at else 0.0
    row.watch_time_s = float(row.watch_time_s or 0) + education_progress.credit(
        elapsed, same_session)

    result = education_progress.apply(
        row.spans or [], (body.spans or [])[:MAX_SPANS_IN], total,
        row.watch_time_s)

    if result["throttled"]:
        row.anomalies = int(row.anomalies or 0) + 1
    else:
        # JSONB wants plain lists; a tuple round-trips as one but compares
        # unequal on the way back in, which would re-merge identical spans
        # forever.
        row.spans = [[a, b] for a, b in result["spans"]]
        row.covered_s = result["covered_s"]
        row.pct = result["pct"]
        if result["complete"] and not row.completed_at:
            row.completed_at = now
    row.session_id = body.session or row.session_id
    row.last_at = now

    # Watching is opening. A lesson played from a DM link without the grid ever
    # rendering would otherwise be complete and still unseen.
    if not db.query(EducationLessonView).filter(
            EducationLessonView.lesson_id == lesson.id,
            EducationLessonView.profile_key == viewer).first():
        db.add(EducationLessonView(lesson_id=lesson.id, profile_key=viewer))

    db.commit()
    return {
        "ok": True,
        "pct": round(float(row.pct or 0), 4),
        "covered_s": int(row.covered_s or 0),
        "total_s": total,
        "complete": row.completed_at is not None,
        "throttled": result["throttled"],
        "tracked": True,
    }


@router.get("/media/{lesson_id}")
def lesson_media(lesson_id: int, db: Session = Depends(get_db),
                 payload: dict = Depends(require_page(PAGE))):
    """The direct MP4 for a LOOM lesson, so the app can play it in its own
    ``<video>`` and measure what was watched.

    Loom's embed SDK exposes no playback events at all — no position, no seek,
    no progress — so an iframe can be shown and cannot be measured. YouTube and
    Vimeo both answer postMessage, which is why only this provider needs a door
    of its own.

    **Nothing is downloaded and nothing is stored.** The answer is a short-lived
    signed URL on Loom's own CDN that the viewer's browser streams directly, so
    no video bytes cross this server. It is resolved per request rather than
    cached because the signature expires within minutes; a cached one would fail
    mid-lesson for the next person.
    """
    lesson = _load(db, lesson_id)
    viewer = viewer_profile_key(db, payload)
    if not _is_admin(payload) and (
            not viewer or lesson.id not in _visible_ids(db, viewer)):
        raise HTTPException(status_code=403, detail="not_your_lesson")
    if lesson.provider != "loom":
        raise HTTPException(status_code=404, detail="not_loom")

    import httpx
    url = (f"https://www.loom.com/api/campaigns/sessions/"
           f"{lesson.video_id}/transcoded-url")
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.post(url, json={}, headers={"Accept": "application/json"})
        r.raise_for_status()
        src = (r.json() or {}).get("url")
    except Exception as exc:                       # noqa: BLE001 — see below
        # Any failure here is the same fact to the reader — the video cannot be
        # played right now — and the player falls back to Loom's own iframe, so
        # the lesson is still watchable even though it stops being measurable.
        logger.warning("loom transcoded-url failed for %s: %s", lesson.video_id, exc)
        raise HTTPException(status_code=502, detail="loom_unavailable")
    if not src:
        raise HTTPException(status_code=502, detail="loom_unavailable")
    return {"url": src, "provider": "loom"}


# ── the register: who watched, and how much ──────────────────────────────────

def _profile_index(db: Session) -> dict[str, dict]:
    """profile_key → ``{name, role, unit, shift}``, off the SAME org walk the
    audience picker is built from (`recipients`). Reused rather than re-spelled:
    a second walk is a second answer to "who works here", and the register would
    then be able to name somebody the picker cannot offer."""
    from app.routers.broadcast import _profile_holders
    out: dict[str, dict] = {}
    for block in _profile_holders(db):
        for p in block.get("profiles", []):
            out[p["key"]] = {
                "name": p.get("name") or "",
                "role": block.get("role") or "",
                "unit": p.get("unit") or "",
                "shift": p.get("shift"),
            }
    return out


def _report(db: Session, lesson_id: Optional[int] = None) -> dict:
    """THE report computation, shared by the page and the workbook so the file
    an admin forwards and the screen they read it off cannot disagree.

    **The roster is the AUDIENCE, never the progress table.** Somebody who never
    opened a lesson leaves no progress row at all, so a report built from what
    was watched can only ever list the people who watched — which is precisely
    the half an admin does not need. Every target is a row here, and the ones
    with nothing behind them are the answer to "who has not done this".
    """
    q = db.query(EducationLesson).filter(EducationLesson.archived.is_(False))
    if lesson_id:
        q = q.filter(EducationLesson.id == lesson_id)
    lessons = q.order_by(EducationLesson.created_at.desc().nullslast(),
                         EducationLesson.id.desc()).all()
    ids = [x.id for x in lessons]
    if not ids:
        return {"lessons": [], "rows": []}

    targets: dict[int, list[str]] = {}
    for lid, key in db.query(EducationLessonTarget.lesson_id,
                             EducationLessonTarget.profile_key).filter(
            EducationLessonTarget.lesson_id.in_(ids)).all():
        targets.setdefault(lid, []).append(key)

    opened: dict[tuple[int, str], datetime] = {}
    for lid, key, at in db.query(
            EducationLessonView.lesson_id, EducationLessonView.profile_key,
            EducationLessonView.first_seen_at).filter(
            EducationLessonView.lesson_id.in_(ids)).all():
        opened[(lid, key)] = at

    prog: dict[tuple[int, str], EducationLessonProgress] = {}
    for row in db.query(EducationLessonProgress).filter(
            EducationLessonProgress.lesson_id.in_(ids)).all():
        prog[(row.lesson_id, row.profile_key)] = row

    people = _profile_index(db)
    out_lessons, out_rows = [], []
    for lesson in lessons:
        keys = targets.get(lesson.id, [])
        total = education_progress.total_buckets(lesson.duration_s)
        pcts, n_opened, n_done = [], 0, 0
        for key in keys:
            who = people.get(key) or {}
            row = prog.get((lesson.id, key))
            seen_at = opened.get((lesson.id, key))
            pct_v = round(float(row.pct or 0), 4) if row else 0.0
            pcts.append(pct_v)
            if seen_at:
                n_opened += 1
            if row and row.completed_at:
                n_done += 1
            out_rows.append({
                "lesson_id": lesson.id,
                "lesson": lesson.title,
                "profile_key": key,
                # A target whose profile the org walk cannot resolve is still a
                # row: it is an audience member somebody chose, and dropping it
                # would quietly shrink the denominator of the whole report.
                "name": who.get("name") or key,
                "role": who.get("role") or "",
                "unit": who.get("unit") or "",
                "shift": who.get("shift"),
                "opened_at": seen_at.isoformat() if seen_at else None,
                "pct": pct_v,
                "covered_s": int(row.covered_s or 0) if row else 0,
                "complete": bool(row and row.completed_at),
                "completed_at": (row.completed_at.isoformat()
                                 if row and row.completed_at else None),
                "last_at": (row.last_at.isoformat()
                            if row and row.last_at else None),
                # Flushes the wall-clock bound refused. Not a verdict — a
                # dropped line replaying its buffer lands here too — but a row
                # carrying several is worth an admin's eye.
                "anomalies": int(row.anomalies or 0) if row else 0,
            })
        out_lessons.append({
            "id": lesson.id,
            "title": lesson.title,
            "provider": lesson.provider,
            "duration_s": lesson.duration_s,
            "total_s": total,
            "audience": len(keys),
            "opened": n_opened,
            "completed": n_done,
            # The mean over the WHOLE audience, so somebody who never opened it
            # counts as the 0% they are. A mean over viewers only would climb as
            # fewer people watched.
            "mean_pct": round(sum(pcts) / len(pcts), 4) if pcts else 0.0,
            "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
        })
    return {"lessons": out_lessons, "rows": out_rows,
            "generated_at": datetime.now(timezone.utc).isoformat()}


@router.get("/report")
def watch_report(lesson_id: Optional[int] = None, db: Session = Depends(get_db),
                 payload: dict = Depends(require_page(PAGE))):
    """Who was given which lesson, who opened it, and how much of it they
    actually watched.

    **Admin only**, the same rule that keeps `targets` off everybody else's
    payload: this names who has been given which training and how they did,
    which is nobody else's business. Checked here and not merely by hiding the
    tab, because the endpoint is reachable without the UI.
    """
    _require_admin(payload)
    return _report(db, lesson_id)


class ReportExportIn(BaseModel):
    lesson_id: Optional[int] = None
    # The viewer's own words for the sheet, so the file speaks the language the
    # person who asked for it was reading. The server sends no figure it did not
    # compute and the client sends no figure at all.
    labels: dict = Field(default_factory=dict)


@router.post("/report.xlsx")
def watch_report_xlsx(body: ReportExportIn, request: Request,
                      db: Session = Depends(get_db),
                      payload: dict = Depends(require_page(PAGE))):
    """The register as a workbook — three sheets, one question each: the
    lessons, every person against every lesson, and the people who have not
    finished. Delivered by `xlsx_delivery`, so a browser downloads it and
    Telegram gets a DM."""
    _require_admin(payload)
    from app.services import education_export
    data = _report(db, body.lesson_id)
    wb = education_export.build_workbook(data, body.labels or {})
    enrich(target_kind="report", target_id=str(body.lesson_id or "all"),
           details=[("lessons", len(data["lessons"])),
                    ("rows", len(data["rows"]))])
    return deliver_xlsx(request, payload, "talim-hisobot.xlsx", wb.getvalue(),
                        caption=(body.labels or {}).get("caption", ""))
