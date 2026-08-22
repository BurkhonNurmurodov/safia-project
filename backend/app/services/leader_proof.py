"""In-app camera proofs — the roll, the stamp, and the entry it becomes.

Why this exists: leaders were editing the timestamp a third-party camera app
wrote onto their proof photos. A clock the phone authors proves nothing, so for
tasks configured `proof_kind == "camera"` the photo is taken in OUR camera page
and stamped HERE, on the server, with a time the phone never gets to write.

Three rules hold the proof together, and each one is load-bearing:

1. **The clock is ours.** `captured_at` reaches us from the page, but the page
   derives it from the server time it was handed at open, advanced by a
   MONOTONIC counter — never from `Date.now()`. Changing the phone's clock
   mid-shift moves nothing. What the phone's clock *said* arrives separately as
   `skew_s`, recorded and never judged.
2. **Nothing may be uploaded.** A camera task has no file-picker path anywhere:
   the bot refuses a photo sent to the chat for one, and this module is reached
   only by the camera page. The moment an upload is accepted "just this once",
   the feature is back to trusting a file the leader produced.
3. **The roll survives the app.** Photos are stored per (day, task, slot) the
   moment they land, not when the task is answered — a leader who shoots two of
   three and closes Telegram comes back to two, not to nothing.

The roll becomes an ordinary checklist answer as soon as it reaches
`min_media`: `sync_entry` writes the LeaderTaskEntry and mirrors the photos into
`leader_task_media` in slot order, which is what keeps every existing reader —
dashboard rows, the media proxy, the AI reviewer, the day report — working
without knowing this module exists.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from io import BytesIO

from PIL import Image, ImageDraw, ImageOps
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    LeaderTaskDay,
    LeaderTaskEntry,
    LeaderTaskMedia,
    LeaderTaskPhoto,
    Manager,
    RoleProfile,
)
from app.services import leader_ai, leader_tasks
# ONE font resolver for the whole platform. The downtime card already searches
# every plausible font directory and caches what it finds; a second copy here
# would be a second thing to fix the day a box ships without DejaVu.
from app.services.downtime_card import _font as _ttf

logger = logging.getLogger(__name__)

# Tashkent has no DST — the same fixed offset the checklist day boundary uses.
TASHKENT = timezone(timedelta(hours=5))

# How many shots a task's roll may hold: the required ones, plus a few angles.
# Capped twice on purpose — `min_media + EXTRA_SLOTS` is the intent, `HARD_CAP`
# is what stops a task configured with min_media 20 from turning the roll into
# an album nobody reviews (the AI reads the first MAX_IMAGES anyway).
EXTRA_SLOTS = 3
HARD_CAP = 6

# How far a shot's own clock may lag the moment its bytes arrive before the row
# is marked `deferred`. Anything under this is an ordinary upload on a working
# connection; anything over it was taken with no signal and flushed from the
# page's offline queue later — a fact worth showing a reviewer, never a fault.
DEFERRED_AFTER_S = 90

# Long edge of what is stored. Above this a modern phone camera produces 4-8 MB
# per shot for detail no reviewer or model uses (services/gemini shrinks to
# 1280 before the call), and every one of those bytes crosses the archive
# channel and comes back on every review.
MAX_EDGE = 1600
JPEG_QUALITY = 88

# The stamp, in proportions of the image rather than pixels, so a 720p phone and
# a 4K one get a mark that reads the same size. Both are shares of the SHORT
# edge, and that is the fix for the mark that used to run off the picture: a
# phone shoots portrait, so height is the LONG edge, and a size taken from it
# put a ~950 px-wide stamp on a 900 px-wide photo — the seconds fell off the
# right side of every proof. The short edge is the one both orientations share.
_STAMP_H = 0.036          # cap height as a share of the image's SHORT edge
_STAMP_PAD = 0.028        # inset from the bottom-left corner
_STAMP_MIN_PX = 16


class ProofError(ValueError):
    """A refusal the leader should be able to read and act on."""


# ── the stamp ────────────────────────────────────────────────────────────────

def stamp_text(when: datetime) -> str:
    """What is burnt into the picture, and the ONLY spelling of it.

    Prefixed with the company name because a reviewer scanning a day's proofs
    has to be able to tell an in-app shot from a photo of somebody else's camera
    app at a glance — the mark is the difference between "this time is ours" and
    "this time is whatever the phone said".
    """
    return f"Safia · {when.astimezone(TASHKENT).strftime('%d.%m.%Y  %H:%M:%S')}"


def _fit_font(draw: ImageDraw.ImageDraw, text: str, w: int, h: int, pad: int):
    """The stamp's font and its text box: a share of the SHORT edge, and never
    wider than the picture it is drawn on.

    Two rules, and the second is what makes the first safe. Sizing off the short
    edge gives a portrait shot and a landscape one the same-looking mark.
    Measuring the result and shrinking to fit is the guarantee: whatever font
    the box happens to ship, however wide the date renders, the plate is drawn
    INSIDE the photo — a stamp with its seconds cut off by the edge is a
    timestamp nobody can read, which is the one thing this whole feature exists
    to produce.
    """
    size = max(_STAMP_MIN_PX, int(min(w, h) * _STAMP_H))
    avail = max(1, w - 2 * pad)
    font = _ttf(size, bold=True)
    box = draw.textbbox((0, 0), text, font=font)
    for _ in range(4):                     # proportional guess, then a nudge
        tw = box[2] - box[0]
        if tw <= avail or size <= _STAMP_MIN_PX:
            break
        size = max(_STAMP_MIN_PX, min(size - 1, int(size * avail / tw)))
        font = _ttf(size, bold=True)
        box = draw.textbbox((0, 0), text, font=font)
    return font, box


def _luma(img: Image.Image, box: tuple[int, int, int, int]) -> float:
    """Mean brightness (0-255) of the patch the stamp will cover."""
    try:
        return sum(img.crop(box).convert("L").resize((8, 8)).getdata()) / 64.0
    except Exception:                      # a degenerate crop must never lose the photo
        return 0.0


def burn(data: bytes, when: datetime) -> tuple[bytes, str]:
    """Return (stamped JPEG bytes, the text burnt in).

    The mark is drawn ON the photo and blacks out none of it — no plate, no
    box, by the operator's call (2026-08-19). Two layers carry it instead, and
    both read what is underneath:

    * a contrasting OUTLINE thick enough to hold the glyphs together over noise
      — gravel, mesh, a stack of crates — and across a hard edge running right
      under the stamp, half on a white wall, half on a dark machine;
    * a FILL picked from what is actually behind it: white over a dim workshop,
      near-black over a lit panel or a sheet of paper.

    Between them "visible on any background" stays a property of the drawing
    rather than a hope about the photo, without a slab of black over the corner
    of every proof.
    """
    try:
        img = Image.open(BytesIO(data))
        img = ImageOps.exif_transpose(img)  # canvas grabs carry none; a paste might
        img = img.convert("RGB")
    except Exception as exc:
        raise ProofError("invalid_image") from exc

    if max(img.size) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)

    w, h = img.size
    text = stamp_text(when)
    draw = ImageDraw.Draw(img)
    pad = int(min(w, h) * _STAMP_PAD)
    try:
        font, (l, t, r, b) = _fit_font(draw, text, w, h, pad)
    except Exception as exc:
        # No font ⇒ no stamp ⇒ NOTHING is stored. An unstamped camera photo is
        # indistinguishable from the third-party shots this feature exists to
        # replace, so a box that cannot draw the mark must refuse the proof
        # loudly rather than keep a picture nobody can date.
        logger.error("proof stamp unavailable: %s", exc)
        raise ProofError("stamp_unavailable") from exc

    tw, th = r - l, b - t
    x, y = pad, h - pad - th
    # Sample a little wider than the glyphs: the outline and the eye both spill
    # past the text box, and a patch measured too tightly picks the wrong side
    # of a hard edge running right under the stamp.
    m = max(2, th // 3)
    box = (max(0, x - m), max(0, y - m), min(w, x + tw + m), min(h, y + th + m))
    bright = _luma(img, box) > 140
    fill = (17, 17, 17) if bright else (255, 255, 255)
    halo = (255, 255, 255) if bright else (0, 0, 0)

    # Heavier than it would need to be behind a plate: with nothing between the
    # glyphs and the photo, the outline IS the legibility, so it is sized off
    # the text rather than left at a token two pixels.
    draw.text((x - l, y - t), text, font=font, fill=fill,
              stroke_width=max(2, th // 7), stroke_fill=halo)

    out = BytesIO()
    img.save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return out.getvalue(), text


# ── the day and the roll ─────────────────────────────────────────────────────

def leader_shift(db: Session, prof: RoleProfile) -> int:
    mgr = db.query(Manager).filter_by(id=prof.manager_id).first()
    return mgr.shift if (mgr and mgr.shift in (1, 2)) else 1


def open_day(db: Session, prof: RoleProfile, *, create: bool) -> LeaderTaskDay | None:
    """The leader's CURRENT checklist day, or None when it is already closed.

    `create=False` for reads, so merely opening the camera page never leaves a
    day row behind for a leader who looked and left.
    """
    shift = leader_shift(db, prof)
    date = leader_tasks.effective_date(shift)
    leader_tasks.promote_due(db, shift, date)  # staged config due at this boundary
    day = db.query(LeaderTaskDay).filter_by(leader_id=prof.id, date=date).first()
    if day and day.closed_at:
        return None
    if not day and create:
        day = LeaderTaskDay(leader_id=prof.id, manager_id=prof.manager_id, date=date)
        db.add(day)
        db.flush()
    return day


def roll(db: Session, day_id: int, task_id: int) -> list[LeaderTaskPhoto]:
    return (db.query(LeaderTaskPhoto)
            .filter_by(day_id=day_id, task_id=task_id)
            .order_by(LeaderTaskPhoto.slot).all())


def counts(db: Session, day_id: int | None, task_ids: list[int]) -> dict[int, int]:
    """task_id → shots on the roll. One query for the whole menu: the bot draws
    a progress marker on every camera task it lists, and a per-task count would
    be one round trip per row every time the menu is re-rendered."""
    if not day_id or not task_ids:
        return {}
    out: dict[int, int] = {}
    for p in (db.query(LeaderTaskPhoto.task_id)
              .filter(LeaderTaskPhoto.day_id == day_id,
                      LeaderTaskPhoto.task_id.in_(task_ids)).all()):
        out[p.task_id] = out.get(p.task_id, 0) + 1
    return out


def max_slots(min_media: int) -> int:
    """How many shots this task's roll may hold in total."""
    return max(1, min(HARD_CAP, max(1, int(min_media or 1)) + EXTRA_SLOTS))


# ── writing ──────────────────────────────────────────────────────────────────

def _task_locked(db: Session, day: LeaderTaskDay, task_id: int) -> bool:
    """Has this task already been SUBMITTED on a per-task unit?

    Checked on every write into the roll, not just when the page opens: the
    whole promise of per-task submission is that a closed task cannot be
    revised, and the camera page may have been sitting open since before the
    close. Imported inside the call — leader_close reads this module.
    """
    from app.services.leader_close import locked
    entry = (db.query(LeaderTaskEntry)
             .filter_by(day_id=day.id, task_id=task_id).first())
    return locked(entry, day)




def save_photo(db: Session, *, prof: RoleProfile, task_id: int, cfg: dict,
               data: bytes, captured_at: datetime, slot: int | None,
               skew_s: int | None, relay,
               client_key: str | None = None) -> LeaderTaskPhoto:
    """Stamp one shot, archive it, and put it on the roll.

    `relay(bytes) -> (file_id, message_id)` is the archive-channel upload,
    injected because it belongs to the bot process and this module is imported
    by the API. Nothing is written when the relay fails: a row pointing at a
    file nobody can fetch is a proof that renders as a broken image forever.

    `slot=None` appends; a slot already on the roll is REPLACED, which is the
    retake. The replaced row goes, the channel post stays — the archive is the
    audit trail, exactly as it is for the bot's own reset.

    **`client_key` makes this idempotent, and it has to be.** The page cannot
    tell a request that never arrived from one that arrived and whose answer
    died on the way back — both look like a dropped connection — so it re-sends
    from the offline queue, and the same photo used to land twice on the roll
    (same picture, same burnt second, two slots). The key is the page's own id
    for that SHOT, minted once before the first attempt and kept with the blob,
    so a replay is recognised here and answered with the row the first attempt
    wrote. Checked before anything is burnt or relayed: a replay must not cost a
    second channel post either. A row whose key was already consumed and then
    deleted (a retake, `clear_roll`) is a miss and writes a new row — the same
    thing that happens with no key at all, which is the honest floor.
    """
    if client_key:
        seen = (db.query(LeaderTaskPhoto)
                .filter_by(leader_id=prof.id, task_id=task_id,
                           client_key=client_key)
                .first())
        if seen:
            logger.info("camera proof replay ignored: leader=%s task=%s key=%s",
                        prof.id, task_id, client_key)
            return seen

    day = open_day(db, prof, create=True)
    if day is None:
        raise ProofError("day_closed")
    if _task_locked(db, day, task_id):
        raise ProofError("task_closed")

    need = int(cfg.get("min_media") or 1)
    cap = max_slots(need)
    current = roll(db, day.id, task_id)
    taken = {p.slot for p in current}

    if slot is None:
        slot = next((i for i in range(cap) if i not in taken), None)
        if slot is None:
            raise ProofError("roll_full")
    elif slot < 0 or slot >= cap:
        raise ProofError("bad_slot")

    stamped, text = burn(data, captured_at)
    relayed = relay(stamped)
    if not relayed:
        raise ProofError("relay_failed")
    file_id, message_id = relayed

    now = datetime.now(timezone.utc)
    win = cfg.get("window") or leader_ai.SHIFT_WINDOW[1]
    old = next((p for p in current if p.slot == slot), None)
    if old:
        db.delete(old)
        db.flush()
    row = LeaderTaskPhoto(
        day_id=day.id, leader_id=prof.id, task_id=task_id, slot=slot,
        file_id=file_id, message_id=message_id,
        captured_at=captured_at, received_at=now, stamp=text,
        late=is_late(captured_at, day.date, win, cfg),
        deferred=(now - captured_at).total_seconds() > DEFERRED_AFTER_S,
        skew_s=skew_s, client_key=client_key,
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        # Two copies of one shot in flight at the same time — the drain can be
        # started by the mount effect and by the `online` event within the same
        # second — so both missed the lookup above and both got here. The unique
        # index settles it; the loser answers with the winner's row rather than
        # failing a save the leader already made.
        db.rollback()
        seen = (db.query(LeaderTaskPhoto)
                .filter_by(leader_id=prof.id, task_id=task_id,
                           client_key=client_key)
                .first() if client_key else None)
        if seen:
            return seen
        raise
    sync_entry(db, day, task_id, need)
    db.commit()
    return row


def delete_photo(db: Session, *, prof: RoleProfile, photo: LeaderTaskPhoto,
                 cfg: dict) -> None:
    """Remove an EXTRA shot. A required slot is never deletable — it is retaken.

    That asymmetry is the poka-yoke: the only destructive tap available cannot
    leave a task with a hole in its evidence, so there is no state where a
    leader has to remember to re-shoot something they meant to replace.
    """
    day = db.query(LeaderTaskDay).filter_by(id=photo.day_id).first()
    if not day or day.closed_at:
        raise ProofError("day_closed")
    if _task_locked(db, day, photo.task_id):
        raise ProofError("task_closed")
    need = int(cfg.get("min_media") or 1)
    if photo.slot < need:
        raise ProofError("required_slot")
    db.delete(photo)
    db.flush()
    sync_entry(db, day, photo.task_id, need)
    db.commit()


def clear_roll(db: Session, day_id: int | None, task_id: int) -> int:
    """Drop a task's whole roll — the ONLY wholesale delete, and it belongs to
    the bot, not to the camera page.

    It exists because the roll and the checklist answer must never contradict
    each other. Answering «Yo'q» to a task, or resetting one, says the task was
    not done; leaving three shots behind would keep the menu showing «📷 3/3»
    for a task recorded as failed, and would re-attach those photos the moment
    the count was read again. The channel copies stay — the archive is the audit
    trail, exactly as it is for the bot's own reset.
    """
    if not day_id:
        return 0
    n = (db.query(LeaderTaskPhoto)
         .filter_by(day_id=day_id, task_id=task_id)
         .delete(synchronize_session=False))
    db.flush()
    return n


def sync_entry(db: Session, day: LeaderTaskDay, task_id: int,
               min_media: int) -> LeaderTaskEntry | None:
    """Make the checklist answer agree with the roll.

    At `min_media` shots the task IS done — there is nothing else to ask and no
    Save for the leader to forget, which is the whole reason the camera flow has
    no confirmation step. Below it, no entry exists: a half-shot roll is not an
    answer, and writing one would score a task nobody finished.

    The entry is updated in place rather than replaced (the bot's own save
    deletes and re-creates), because `LeaderAiReview.ref` is built from the
    entry id — a new id on every retake would orphan a verdict. Its media rows
    ARE rebuilt each time, in slot order, so what the reviewer fetches is always
    the current roll.
    """
    photos = roll(db, day.id, task_id)
    entry = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=task_id).first()
    if len(photos) < max(1, int(min_media or 1)):
        return entry
    if not entry:
        entry = LeaderTaskEntry(day_id=day.id, task_id=task_id, done=True)
        db.add(entry)
        db.flush()
    entry.done = True
    entry.reason = None
    db.query(LeaderTaskMedia).filter_by(entry_id=entry.id).delete()
    db.flush()
    for i, p in enumerate(photos):
        db.add(LeaderTaskMedia(entry_id=entry.id, file_id=p.file_id,
                               message_id=p.message_id, pos=i))
    db.flush()
    return entry


# ── judging ──────────────────────────────────────────────────────────────────

def is_late(when: datetime, date: str, win: tuple[str, str], cfg: dict) -> bool:
    """Was this shot taken outside the hours the task allows?

    Only asked in STRICT mode. With `time_check` off the window is explicitly
    not a rule (services/leader_ai.date_flags says so), and with `date_check`
    off nothing about when is asked at all — marking a photo late under either
    would print a verdict the platform has decided not to reach.
    """
    if not cfg.get("date_check", True) or not cfg.get("time_check", True):
        return False
    return clock_ok(when, date, win, cfg.get("shift")) is False


def clock_ok(when: datetime, date: str, win: tuple[str, str],
             shift: int | None = None) -> bool | None:
    """Does one server-recorded capture satisfy the window? Delegates to the
    reviewer's own comparison so a camera photo and a transcribed screenshot can
    never be judged by two different readings of the same hours.

    The shift travels with it for the same reason: it says which DAY the
    window's hours belong to (leader_ai.window_offset), and a night shift's
    01:41 shot marked late against the previous morning is the very bug that
    comparison was fixed for."""
    return leader_ai.clock_in_window([as_clock(when)], date, win, shift=shift)


def as_clock(when: datetime) -> dict:
    """One capture instant in the shape `LeaderAiReview.clocks` stores.

    Same shape as a clock the model transcribed, deliberately: everything
    downstream — `date_flags`, `sync_date_flags`, the triage card's date rows,
    the day report — then reads a camera proof through the code it already has.
    `source` says where the reading came from, so an admin looking at a verdict
    can tell a time we recorded from a time somebody's screen claimed.
    """
    loc = when.astimezone(TASHKENT)
    return {"raw": stamp_text(when), "month": loc.month, "day": loc.day,
            "time": loc.strftime("%H:%M"), "source": "app"}


def server_clocks(db: Session, entry_id: int) -> list[dict] | None:
    """The clocks for one bot entry when its photos were taken in our camera —
    None when they were not, which is every screenshot task and everything filed
    before this existed.

    This is what makes the AI a content judge for camera proofs: the reviewer
    stores these instead of what the model read off the picture, so the date
    verdict is arithmetic on a time the leader could not author, while the model
    is left to answer the only question it is better at — is the task actually
    done.
    """
    entry = db.query(LeaderTaskEntry).filter_by(id=entry_id).first()
    if not entry:
        return None
    photos = roll(db, entry.day_id, entry.task_id)
    if not photos:
        return None
    return [as_clock(p.captured_at) for p in photos]
