"""Filing a leader's checklist — the cores BOTH doors write through.

A leader files the day's checklist in two places since 2026-09-28: the Telegram
bot (`/tasks`), which is where it has always happened, and the «Chek-list» tab
on `/leaders` (`routers/leader_checklist.py`). The operator's ruling was to keep
both: the bot works exactly as it did, and whatever is done in one door is what
the other one shows, because both write the same `LeaderTaskDay` /
`LeaderTaskEntry` rows.

That promise holds only if the WRITES have one spelling. Two copies of «save an
answer» or «close the day» would drift the first time either door changed —
one would clear the camera roll on «Yo'q» and the other would not, one would
drop the late drafts when the day closed and the other would strand them — and
a leader's record would then depend on which door they happened to use. So the
bodies live here, lifted verbatim out of `telegram_bot.py`, and the bot's own
`_lt_save_entry` and «KUNNI YOPISH» are thin calls into them.

What is deliberately NOT here:

  * **submitting one task** — that is `leader_close.close_task`, already the one
    core, and both doors call it;
  * **the per-task deadline sweeps** — `leader_close.autoclose_due` and
    `close_expired_days` own «what happens when nobody pressed anything»;
  * **logging** — the bot records itself (`_lt_log`, `record_bot`), the web door
    is recorded by the action-log middleware and enriched at its endpoint. A
    core that logged would log twice for the web and in the wrong shape for the
    bot.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import LeaderTaskDay, LeaderTaskEntry, LeaderTaskMedia, RoleProfile
from app.services import leader_ai, leader_close, leader_load, leader_proof, leader_tasks

log = logging.getLogger(__name__)


def current_day(db: Session, prof: RoleProfile, cell_id: int | None = None,
                *, create: bool = False) -> tuple[str, int, LeaderTaskDay | None]:
    """`(date, shift, day)` for the checklist this leader is filing RIGHT NOW.

    The date is the SHIFT's effective date and never the calendar day — a night
    belongs to the date its boundary opened — and staged config due at that
    boundary is promoted first, exactly as the bot menu does before it reads a
    single task. `cell_id` is matched with `IS NULL` for a cell-less day, because
    an equality test against NULL matches nothing.
    """
    shift = leader_proof.leader_shift(db, prof)
    date = leader_tasks.effective_date(shift)
    leader_tasks.promote_due(db, shift, date)
    q = db.query(LeaderTaskDay).filter_by(leader_id=prof.id, date=date)
    q = (q.filter(LeaderTaskDay.cell_id == cell_id) if cell_id
         else q.filter(LeaderTaskDay.cell_id.is_(None)))
    day = q.first()
    if day is None and create and not leader_load.exempt(db, prof, date):
        day = LeaderTaskDay(leader_id=prof.id, manager_id=prof.manager_id,
                            date=date, cell_id=cell_id)
        db.add(day)
        db.flush()
    return date, shift, day


def save_answer(db: Session, prof: RoleProfile, task_id: int, done: bool,
                reason: str | None, media: list[tuple[str, int]],
                cell_id: int | None = None) -> LeaderTaskEntry | None:
    """Persist one task's answer on today's checklist. None when it may no
    longer change — the day is closed, or the task was already submitted.

    THE writer, for the bot's «Ha»/«Yo'q» and for the tab alike. An existing
    answer is REPLACED, media and all, which is what editing a draft means;
    `leader_close.locked` is the one predicate that says whether that is still
    allowed. «Yo'q» retires whatever the camera collected for this task: the
    answer is now "not done", and a roll left behind would show up as progress
    on a task recorded as failed the next time anything counted it.

    `media` is `[(file_id, message_id), …]` — archive-channel copies, never the
    private-chat originals — in the order they will be shown and reviewed.
    """
    _date, _shift, day = current_day(db, prof, cell_id)
    if day and day.closed_at:
        return None
    if not day and leader_load.exempt(db, prof, _date):
        # No counted cell and nothing filed since 1 October: this leader owes
        # nothing, and a first answer would make them «filed in October» —
        # back on the hook for every day they were told they did not owe.
        return None
    if not day:
        day = LeaderTaskDay(leader_id=prof.id, manager_id=prof.manager_id,
                            date=_date, cell_id=cell_id)
        db.add(day)
        db.flush()
    old = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=task_id).first()
    if leader_close.locked(old, day):
        return None           # submitted on a per-task unit — nothing may edit it
    if old:
        db.query(LeaderTaskMedia).filter_by(entry_id=old.id).delete()
        db.delete(old)
        db.flush()
    if not done:
        leader_proof.clear_roll(db, day.id, task_id)
    entry = LeaderTaskEntry(day_id=day.id, task_id=task_id, done=done, reason=reason)
    db.add(entry)
    db.flush()
    for i, (fid, mid) in enumerate(media):
        db.add(LeaderTaskMedia(entry_id=entry.id, file_id=fid, message_id=mid, pos=i))
    db.commit()
    return entry


# The longest edge a picked image keeps. A proof here is most often a screenshot
# of this very dashboard, and its figures have to stay legible to the reviewer —
# Telegram itself stores photos at up to 2560 px, so nothing past that survives
# the archive anyway.
MAX_EDGE = 2560


def normalize_image(data: bytes) -> bytes:
    """One picked or pasted image, as the JPEG the archive channel will take.

    Every web upload goes through this before it is relayed: it proves the
    bytes really are a raster image (a file merely NAMED .png is refused), it
    turns the picture upright by its EXIF orientation — a phone photo otherwise
    reaches the reviewer on its side — flattens transparency onto white, caps
    the size, and re-encodes. Re-encoding through Pillow is also what
    neutralises a crafted payload, the same reason profile photos take this
    path. Raises ValueError("invalid_image") for anything it cannot read.
    """
    from io import BytesIO
    from PIL import Image, ImageOps
    try:
        img = Image.open(BytesIO(data))
        fmt = img.format
        img.load()
    except Exception as exc:                    # noqa: BLE001 - any unreadable file
        raise ValueError("invalid_image") from exc
    if fmt not in ("JPEG", "MPO", "PNG", "WEBP", "GIF", "HEIF", "HEIC"):
        raise ValueError("invalid_image")
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        if img.mode in ("RGBA", "LA", "P", "PA"):
            rgba = img.convert("RGBA")
            flat = Image.new("RGB", rgba.size, (255, 255, 255))
            flat.paste(rgba, mask=rgba.split()[-1])
            img = flat
        else:
            img = img.convert("RGB")
    if max(img.size) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    out = BytesIO()
    img.save(out, "JPEG", quality=90, optimize=True)
    return out.getvalue()


def missing_tasks(db: Session, day: LeaderTaskDay | None, cfg: dict) -> list[int]:
    """Enabled tasks with no answer yet — what stands between a day-close unit
    and «KUNNI YOPISH». Both doors refuse the close while this is non-empty."""
    have = ({e.task_id for e in db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
            if day else set())
    return [t for t, s in cfg.items() if s.get("enabled") and t not in have]


def close_day(db: Session, day: LeaderTaskDay, cfg: dict,
              actor_name: str | None = None) -> float:
    """Close a DAY-mode checklist by hand — the leader's «KUNNI YOPISH».

    The caller has checked that every enabled task is answered
    (`missing_tasks`) and that the day is still open. Returns the completion
    written, which is the number both doors tell the leader.

    The third door that closes a day, beside `leader_close.maybe_close_day`
    (per-task units, when the last task is submitted) and
    `leader_close.close_expired_days` (the deadline). The late door shuts with
    the day, so a draft still staged could never be submitted by anybody again,
    and is dropped here exactly as the other two drop it.

    The day's photos are then queued for review directly — `queue_report`
    matches this one report and honours the review floor, where `discover()`
    would walk every report ever filed — and the drain is kicked on a daemon
    thread, because the person who pressed the button is waiting. An AI hiccup
    must never leave the day looking unclosed to them: the 20-minute drain
    picks up anything this misses.
    """
    from app.services import leader_late_proof   # cycle: it imports leader_close
    entries = db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()
    leader_late_proof.drop_drafts(db, day.id)
    day.closed_at = datetime.now(timezone.utc)
    day.completion = leader_tasks.compute_completion(cfg, entries)
    db.commit()
    try:
        n = leader_ai.queue_report(db, day=day)
        if n:
            leader_ai.note_auto_run(db, n, actor_name or f"leader {day.leader_id}")
    except Exception:
        log.exception("leader-tasks: could not queue day %s for AI review", day.id)
        db.rollback()
    leader_ai.run_async(discover_first=False)
    return float(day.completion or 0)
