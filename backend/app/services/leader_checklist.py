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
from app.services import (leader_ai, leader_close, leader_load, leader_owes, leader_proof,
                          leader_tasks)

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
    if day is None and create and not leader_load.exempt(db, prof, date) \
            and leader_owes.owes(prof, date):
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
    if not day and not leader_owes.owes(prof, _date):
        # A profile the Verifix sync created and nobody claimed yet, or a day
        # before the profile was claimed / picked / existed (`leader_owes`).
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


# ── a day the leader never filed, and objecting to it (2026-11-02) ───────────
#
# The operator (2026-11-02, asked «per task or one for the whole day»: «Per
# task»): a leader who never opened the checklist that day may object to each
# of its tasks, exactly as to a task the platform closed when its hour ran out.
#
# Such a day has NOTHING stored — a bot checklist exists only from the first
# task a leader answers — and every objection hangs off one stored answer
# (`ref` = `bot:<entry id>`), whose approval writes its grant beside it. So the
# FIRST objection creates the day the platform would have closed had the
# leader opened it: closed, every enabled task recorded not-done with the
# missed-deadline sentinel (an automatic task with its own), completion 0 —
# the score the register already gave the missing day. From then on it is an
# ordinary «Muddat o'tib ketdi» day: the same chain, chat, rulings and grant
# (`leader_dispute.KIND_DEADLINE` / `KIND_AUTO`). Nothing is created unless an
# objection is actually filed.
#
# Until then the tab names the day by a stand-in uid (`unfiled_uid`), which
# `routers.leaders.file_dispute` turns into the real day at the moment of
# filing (`materialize_unfiled_day`), inside the filing's own transaction.

UNFILED_PREFIX = "unfiled-"


def unfiled_uid(leader_id: int, date: str, cell_id: int | None) -> str:
    """The stand-in for a day nobody filed — `unfiled-<profile>-<date>[-<cell>]`."""
    tail = f"-{int(cell_id)}" if cell_id else ""
    return f"{UNFILED_PREFIX}{int(leader_id)}-{date}{tail}"


def parse_unfiled_uid(uid: str | None) -> tuple[int, str, int | None] | None:
    """`(profile id, date, cell id)` out of `unfiled_uid`, or None."""
    s = str(uid or "")
    if not s.startswith(UNFILED_PREFIX):
        return None
    parts = s[len(UNFILED_PREFIX):].split("-")
    # id · YYYY · MM · DD [· cell]
    if len(parts) not in (4, 5) or not all(p.isdigit() for p in parts):
        return None
    try:
        date = datetime.strptime("-".join(parts[1:4]), "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None
    cell = int(parts[4]) if len(parts) == 5 and int(parts[4]) > 0 else None
    return int(parts[0]), date, cell


def _day_row(db: Session, leader_id: int, date: str,
             cell_id: int | None) -> LeaderTaskDay | None:
    q = db.query(LeaderTaskDay).filter_by(leader_id=leader_id, date=date)
    q = (q.filter(LeaderTaskDay.cell_id == cell_id) if cell_id
         else q.filter(LeaderTaskDay.cell_id.is_(None)))
    return q.first()


def _shifts(db: Session, prof: RoleProfile, date: str) -> tuple[int, int]:
    """(the unit's shift, the shift this leader's checklist ran on that day)."""
    from app.services import leader_shift
    unit_sh = leader_shift.unit_shift(db, prof.manager_id)
    return unit_sh, leader_shift.shift_on(db, prof.id, date, unit_sh)


def unfiled_objectable(db: Session, prof: RoleProfile, date: str,
                       cell_id: int | None) -> bool:
    """May this never-filed leader-day be objected to? Every condition under
    which a day that DID exist could have been — and that the day the first
    objection creates would then COUNT:

      * on or after `leader_dispute.APPEALS_FROM`, and its filing window shut
        (a day still being filed is filed, not argued);
      * owed: not exempt (`leader_load`), owed by this profile (`leader_owes`),
        and this cell one the leader owed a checklist for (`expected_days`);
      * nothing stored for it — no bot day, no Google-Form row;
      * a bot day for it would be the RECORD (`leader_bot.merges`, not a
        rehearsal day): created where it does not count, an approved objection
        would give back a weight the register never reads;
      * not out of the results already (a day exclusion or a cutoff —
        `leader_exclusions.excluded` answers both): it costs nobody anything.

    Who may file is the caller's question (`routers.leaders._may_dispute_for`).
    """
    from app.services import leader_bot, leader_cells, leader_dispute, leader_exclusions
    if prof is None or prof.role != "leader" or not prof.manager_id:
        return False
    if not leader_dispute.appealable(date):
        return False
    unit_sh, shift = _shifts(db, prof, date)
    if date > leader_tasks.expired_through(shift):
        return False
    if leader_load.exempt(db, prof, date) or not leader_owes.owes(prof, date):
        return False
    if cell_id not in leader_cells.expected_days(db, prof, date):
        return False
    if _day_row(db, prof.id, date, cell_id) is not None:
        return False
    per_cell = cell_id is not None
    overrides = leader_bot.source_overrides(db)
    floors = leader_bot.bot_from_floors(db)
    if not leader_bot.merges(unit_sh, prof.manager_id, date,
                             leader_bot.camera_units(db), floors,
                             leader_id=prof.id, overrides=overrides,
                             per_cell=per_cell):
        return False
    if leader_bot.training(unit_sh, prof.manager_id, date, floors,
                           leader_id=prof.id, overrides=overrides,
                           per_cell=per_cell):
        return False
    if leader_exclusions.excluded(db, prof.id, date, leader_name=prof.name):
        return False
    if not per_cell:
        # A Form row is a filing. Per-cell days never had one (the Form has no
        # cell column), so only a cell-less day asks.
        from app.routers.leader_checklist import _sheet_uid   # cycle
        if _sheet_uid(db, prof, date):
            return False
    return True


def materialize_unfiled_day(db: Session, prof: RoleProfile, date: str,
                            cell_id: int | None) -> LeaderTaskDay:
    """Create the closed, unfiled day an objection hangs off. FLUSHES, never
    commits: the filing that called it commits both or neither.

    The day `leader_close.close_expired_days` / `autoclose_due` would have left
    behind had the leader opened it and walked away: every enabled task of
    THAT day's checklist recorded not-done — `__missed__|HH:MM` with the task's
    own closing hour on a unit that submits task by task, the day's filing
    deadline on one that closes whole days; an automatic task `__auto__` with
    what its check found at the hour when that was a failure, else
    `not_checked` (never a pass: the day is created at the score the register
    already gave it, 0, and moves only by a ruling). Completion 0.

    `closed_at` is the moment the leader's time ran out that day
    (`leader_unit_report._time_up_at`), never now: the brigadir's digest went
    out after that moment, and a close stamped later would read as a checklist
    filed after the digest — an update DM about a day nobody filed. A day that
    already exists (two objections racing, a stale tab) is returned as it is.
    """
    from sqlalchemy.exc import IntegrityError
    from app.services import leader_auto, leader_unit_report

    day = _day_row(db, prof.id, date, cell_id)
    if day is not None:
        return day
    _unit_sh, shift = _shifts(db, prof, date)
    per_task = leader_tasks.per_task_close(db, prof.manager_id)
    cfg = leader_tasks.effective_leader_config(db, prof, shift, day=date)
    try:
        with db.begin_nested():
            day = LeaderTaskDay(leader_id=prof.id, manager_id=prof.manager_id,
                                date=date, cell_id=cell_id)
            db.add(day)
            db.flush()
    except IntegrityError:
        # Another filing created it a moment ago — `uq_ltask_day` waited for
        # that transaction and refused this one. Its day is the day.
        got = _day_row(db, prof.id, date, cell_id)
        if got is None:
            raise
        return got
    for tid, s in cfg.items():
        if not s.get("enabled"):
            continue
        hhmm = leader_close.task_deadline(s, shift)
        if leader_auto.owns(s, date):
            got = leader_auto.measured(db, prof.id, date, tid, cell_id)
            code = (got.code if got is not None and got.outcome == leader_auto.FAILED
                    and got.code else "not_checked")
            reason = leader_tasks.auto_reason(hhmm, code)
        else:
            reason = leader_tasks.missed_reason(shift, hhmm if per_task else None)
        db.add(LeaderTaskEntry(day_id=day.id, task_id=tid, done=False, reason=reason))
    db.flush()
    day.closed_at = (leader_unit_report._time_up_at(db, prof, shift, date, per_task)
                     or datetime.now(timezone.utc))
    day.completion = leader_tasks.compute_completion(
        cfg, db.query(LeaderTaskEntry).filter_by(day_id=day.id).all())
    db.flush()
    log.info("leader-checklist: unfiled day %s created for leader %s (%s, cell %s) "
             "to carry an objection", day.id, prof.id, date, cell_id)
    return day
