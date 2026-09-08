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

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.identity import profile_display_name, viewer_profile_key
from app.models import (
    EducationLesson, EducationLessonTarget, EducationLessonView,
)
from app.permissions import require_page
from app.services import education_video
from app.services.action_log import enrich

router = APIRouter(prefix="/api/education", tags=["education"])

PAGE = "education"
# A lesson may be published to at most this many profiles at once. The plant has
# a few hundred; a cap that cannot be hit in normal use still stops a malformed
# client turning one press into an unbounded fan-out of DMs.
MAX_TARGETS = 600

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
                 admin: bool, seen: set[int], counts: dict[int, int],
                 target_map: dict[int, list[str]]) -> dict:
    media = education_video.rebuild(lesson.provider, lesson.video_id)
    targets = target_map.get(lesson.id, [])
    out = {
        "id": lesson.id,
        "title": lesson.title,
        "url": lesson.url,
        "provider": lesson.provider,
        "video_id": lesson.video_id,
        "embed": media["embed"],
        "thumb": media["thumb"],
        "watch": media["watch"],
        "description_html": lesson.description_html or "",
        "description_text": lesson.description_text or "",
        "author": lesson.created_by_name,
        "created_at": lesson.created_at.isoformat() if lesson.created_at else None,
        "updated_at": lesson.updated_at.isoformat() if lesson.updated_at else None,
        # "New" is a fact about the VIEWER, so an admin browsing the register
        # never sees a badge that belongs to somebody else's inbox.
        "seen": (lesson.id in seen) if viewer else True,
        "audience": len(targets),
    }
    if admin:
        # Only an admin is handed the audience itself: it names who has been
        # given which training, which is nobody else's business.
        out["targets"] = targets
        out["watched"] = counts.get(lesson.id, 0)
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

    q = db.query(EducationLesson)
    if not admin:
        ids = _visible_ids(db, viewer)
        if not ids:
            return {"lessons": [], "can_manage": False, "profile": viewer}
        q = q.filter(EducationLesson.id.in_(ids),
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

    return {
        "lessons": [_lesson_json(db, x, viewer=viewer, admin=admin, seen=seen,
                                 counts=counts, target_map=target_map)
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
        return {"ok": True, **education_video.parse(body.url)}
    except education_video.BadVideoUrl as e:
        return {"ok": False, "reason": str(e),
                "providers": list(education_video.PROVIDERS)}


# ── writes (admin only) ──────────────────────────────────────────────────────

def _notify_targets(db: Session, lesson: EducationLesson, keys: list[str],
                    *, actor: Optional[int]) -> int:
    """Tell each newly-addressed profile about the lesson. One bell row per
    profile plus a DM to every holder — `notify_profile` is the only correct
    way to reach a person here, and it queues for an unclaimed profile instead
    of dropping the news."""
    if not keys:
        return 0
    from app.config import settings
    from app.routers.staff import notify_profile

    url = f"{settings.webapp_url.rstrip('/')}/education"

    def markup_fn(lang: str):
        from telebot import types
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(
            _DM_BTN.get(lang) or _DM_BTN["uz"],
            web_app=types.WebAppInfo(url=url)))
        return kb

    params = {"title": lesson.title, "author": lesson.created_by_name or ""}
    dmed: set[int] = set()
    for key in keys:
        try:
            dmed |= notify_profile(db, key, "education_lesson_new", params,
                                   type="info", exclude_account=actor,
                                   skip_accounts=dmed, markup_fn=markup_fn)
        except Exception:
            # One unreachable profile must never cost the rest of the class its
            # notification — the lesson is already published either way.
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
    lesson = EducationLesson(
        title=body.title.strip(),
        url=body.url.strip(),
        provider=media["provider"],
        video_id=media["video_id"],
        description_html=(body.description_html or "").strip() or None,
        description_text=(body.description_text or "").strip() or None,
        created_by_profile=author_key,
        created_by_name=profile_display_name(db, author_key),
    )
    db.add(lesson)
    db.flush()
    for key in keys:
        db.add(EducationLessonTarget(lesson_id=lesson.id, profile_key=key))
    db.commit()

    _notify_targets(db, lesson, keys, actor=int(payload.get("sub") or 0) or None)
    db.commit()
    enrich(title=lesson.title, target_id=str(lesson.id),
           details={"provider": lesson.provider, "targets": len(keys)})
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
    _notify_targets(db, lesson, fresh, actor=int(payload.get("sub") or 0) or None)
    db.commit()
    enrich(title=lesson.title, target_id=str(lesson_id),
           details={"added": len(fresh), "removed": len(before - after),
                    "targets": len(after)})
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
    enrich(title=lesson.title, target_id=str(lesson_id))
    return {"ok": True}


@router.post("/lessons/{lesson_id}/restore")
def restore_lesson(lesson_id: int, db: Session = Depends(get_db),
                   payload: dict = Depends(require_page(PAGE))):
    _require_admin(payload)
    lesson = _load(db, lesson_id)
    lesson.archived = False
    lesson.updated_at = datetime.now(timezone.utc)
    db.commit()
    enrich(title=lesson.title, target_id=str(lesson_id))
    return {"ok": True}
