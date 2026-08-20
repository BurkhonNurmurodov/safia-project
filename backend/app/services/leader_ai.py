"""AI review of leader-checklist proof photos.

Three questions per task, all asked of the image itself:

1. **Is the photo from the right day?** Every proof photo carries a drawn-on
   date-time. The expected window is the LEADER's shift submission window —
   shift 1 is the plain calendar day, shift 2 runs 21:00 → 09:00 next morning,
   so a 02:00 photo carries tomorrow's calendar date and is still on time.
   Judging shift 2 against a bare calendar date would flag a correct photo
   every single night.
2. **Is the photo even about this task?** Measured against the task's own name
   and its `note_*` description — the line the leader is shown in the bot for
   what to photograph ("Aylanib chiqish chek-listi", "Nazorat varaqasi"). This
   question needs nothing authored: every task already has a description, so a
   photo filed under the wrong task is caught on day one. It is deliberately
   biased toward "yes" — a related photo that is merely poor is question 3's
   problem, not this one's, and a relevance check that fires on doubt turns the
   queue back into noise.
3. **Does the photo actually show the task done?** Measured against the written
   criteria an admin sets per task (global → supervisor → leader, the same
   chain as name/weight/min_media). With no criteria written yet this question
   is skipped — but 1 and 2 still run, so the feature is useful before anyone
   fills the text in and gets stricter as they do.

The queue IS the `leader_ai_reviews` table: discovery inserts `pending` rows,
a drain turns them into verdicts. Both collection layers feed it — bot entries
and Google-Form rows — keyed by a `ref` that survives the leaders sheet's
wipe-and-reload re-sync (see LeaderAiReview).

A drain is kicked by the two events that create work — the leaders-sheet
Refresh and a leader closing their bot day — and, since the platform grew a
scheduler, by a periodic job as well (`register_drain_job`). Before that timer
existed a report nobody happened to refresh stayed unreviewed indefinitely.
"""
import ipaddress
import logging
import re
import socket
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy import and_, false, func, or_, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    AppSetting,
    LeaderAiDispute,
    LeaderAiReview,
    LeaderChecklist,
    LeaderTaskDay,
    LeaderTaskDef,
    LeaderTaskEntry,
    LeaderTaskExample,
    LeaderTaskLeaderSetting,
    LeaderTaskMedia,
    LeaderTaskSetting,
    Manager,
    RoleProfile,
)
from app.services import gemini, leader_bot
from app.services.name_map import leader_match, relabel_supervisor, supervisor_match

log = logging.getLogger(__name__)

LANGS = ("uz", "uz_cyrl", "ru", "en")

# Images sent per task. Nearly every task asks for 1–2 photos; the cap stops a
# min_media-of-20 task from spending a whole day's free quota in one request.
MAX_IMAGES = 4
# New pending rows written per discovery pass. "Everything ever filed" is the
# chosen backfill, so the first pass over years of history is sliced rather
# than done in one transaction.
DISCOVER_CAP = 5000
# A row that keeps failing (unreachable photo, model refusal) stops being
# retried, else the queue head never clears and blocks fresh reports behind it.
MAX_ATTEMPTS = 3
# Consecutive API-level failures that end a drain. Anything the model itself
# rejects (retired model id, revoked key) fails identically for every row, so
# walking the rest of the batch only spends their retries on someone else's bug.
_ERROR_STREAK_ABORT = 5

_TIMEOUT = httpx.Timeout(60.0, connect=15.0)
_TG_API = "https://api.telegram.org"

# One drain at a time per process (cheap early-out); `_DRAIN_LOCK_KEY` extends
# that across Passenger's worker processes. Refresh and day-close both kick a
# drain, and two racing for the same rows would double-spend the free quota.
_lock = threading.Lock()
_DRAIN_LOCK_KEY = 8_140_573_112_004_331  # arbitrary, must not collide app-wide

# The model TRANSCRIBES clocks; it does not judge them (user, 2026-08-14).
#
# It used to answer `date_ok`, which made the date verdict a frozen opinion:
# changing a window could not correct it, only a paid re-check could. Now it
# returns one entry per proof photo — the clock as READ, in numbers — and the
# window comparison happens in `date_flags()` on data we own. Consequences worth
# knowing: the prompt no longer mentions the report date, the window or the
# shift at all (nothing to anchor a "helpful" reading on), and the whole
# two-permitted-dates block that flagged correct overnight photos is gone.
#
# `day`/`month` are 0 and `time` "" when that part is not visible — the schema
# has no nulls, and "not visible" is a real answer the backend must see, not an
# absence to guess at. `raw` is what was on screen, verbatim, so an admin can
# still judge the judge; `source` is where it was read (Windows tray, macOS menu
# bar, PHONE status bar, camera stamp), which is the provenance note that says it
# read the right thing rather than a date printed inside the document.
#
# The phone status bar was missing from that list until 2026-08-14, and its
# absence was not cosmetic: the prompt enumerates the permitted sources and then
# says "no entry if none of them is visible", so the model dutifully returned no
# clock for every screenshot taken on a phone — which is what most proofs are —
# and `date_flags()` turned that into `no_date`, i.e. an automatic rejection of a
# photo whose date was sitting in plain sight at the top of the image.
#
# The SAME failure returned in a second guise (user, 2026-08-17), and the fix is
# the third state of the date rule rather than another source in the list. A task
# whose proof is a screenshot of THIS dashboard has its day printed inside the
# app — a date filter, a dated register row — and the prompt bans reading exactly
# that, because in-app text does not say when a photo was TAKEN. True, and
# irrelevant on a task the operator judges by the day alone: there the ban left no
# date at all, so an honest filing came back `no_date` = rejected. So a task may
# now be judged by the DAY only (`time_check` False), which flips two things
# together — the model may read a date off the screen, and `date_flags` compares
# days and never hours. Read `resolve_time_check` and `date_flags` as one rule.
_CLOCK_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "raw": {"type": "STRING"},
        "day": {"type": "INTEGER"},
        "month": {"type": "INTEGER"},
        "time": {"type": "STRING"},
        "source": {"type": "STRING"},
    },
    "required": ["raw", "day", "month", "time"],
}

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "clocks": {"type": "ARRAY", "items": _CLOCK_SCHEMA},
        "matches_task": {"type": "BOOLEAN"},
        "proves_done": {"type": "BOOLEAN"},
        "readable": {"type": "BOOLEAN"},
        "reason_uz": {"type": "STRING"},
        "reason_uz_cyrl": {"type": "STRING"},
        "reason_ru": {"type": "STRING"},
        "reason_en": {"type": "STRING"},
    },
    "required": ["clocks", "matches_task", "proves_done", "readable",
                 "reason_uz", "reason_uz_cyrl", "reason_ru", "reason_en"],
}


# ── refs ─────────────────────────────────────────────────────────────────────
# A ref identifies one (report, task) across re-syncs. Bot entries have a
# durable id. Sheet rows do NOT: `leader_checklists` is wiped and reloaded on
# every Refresh, so its row ids are recycled — the form's submission id is the
# stable handle, and a date+leader composite is the fallback when the form
# never wrote one.

def bot_ref(entry_id: int) -> str:
    return f"bot:{entry_id}"


def sheet_ref(row: LeaderChecklist, task_id: int) -> str:
    if row.submission_id:
        return f"sheet:{row.submission_id}:{task_id}"
    # The date fallback is for rows the form never gave a submission id. It is
    # the one ref that moves when a night row is re-dated to the shift it
    # reports on (services/leader_tasks.filed_date) — such a row is reviewed
    # once more under its new key. Rows carrying a submission id, which is all
    # of them since the form grew the column, are unaffected.
    who = (row.leader or "").strip().lower()[:60]
    return f"sheetd:{row.date}:{who}:{task_id}"


def report_key(ref: str, day_of: dict[int, int] | None = None) -> str:
    """The REPORT a `(report, task)` ref belongs to.

    A ref names one task's photos; a report is a leader's day, which is the unit
    the register lists and the unit the range summary counts in. Sheet refs
    carry the report in the ref itself (drop the trailing task id); a bot ref
    names an ENTRY, whose report is that entry's day — hence `day_of`, a bulk
    `entry_id → day_id` lookup the caller does once.

    ONE definition because two surfaces group by it — the reviews already
    written and the census of what was never queued — and they are merged into
    a single tally. Two spellings of "same report" would count one report twice.
    """
    if ref.startswith("bot:"):
        day = (day_of or {}).get(int(ref.split(":")[1]))
        return f"bot:{day}" if day else ref     # orphan entry: its own report
    parts = ref.split(":")
    return ":".join(parts[:-1]) if len(parts) > 2 else ref


def row_uid(row: LeaderChecklist) -> str:
    """The uid /api/leaders prints for this sheet row — the key the page groups
    its verdicts by. Must stay in step with routers/leaders.py."""
    return row.submission_id or f"row-{row.id}"


# ── criteria chain ───────────────────────────────────────────────────────────

def criteria_for(db: Session, task_id: int, manager_id: int | None,
                 leader_id: int | None) -> str:
    """Effective "what makes this task truly done", resolved leader → supervisor
    → global. Blank at every level = no written definition (date check only)."""
    if leader_id:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if row and (row.criteria or "").strip():
            return row.criteria.strip()
    if manager_id:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if row and (row.criteria or "").strip():
            return row.criteria.strip()
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    return (td.criteria or "").strip() if td and td.criteria else ""


def task_label(db: Session, task_id: int, manager_id: int | None = None,
               leader_id: int | None = None) -> str:
    """The task's name, resolved leader → supervisor → global when the caller
    knows whose report this is.

    A supervisor may rename a task for their own leaders, and the renamed text
    is what the leader was actually shown in the bot. Describing the photo to
    the model under the GLOBAL name would judge it against a wording nobody
    involved ever read. Callers that only have a task id (queue listings) pass
    neither and get the global name, which is right for a register column.
    """
    if leader_id:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if row and (row.name_ru or row.name_uz or row.name_en):
            return row.name_ru or row.name_uz or row.name_en
    if manager_id:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if row and (row.name_ru or row.name_uz or row.name_en):
            return row.name_ru or row.name_uz or row.name_en
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        return f"#{task_id}"
    return td.name_ru or td.name_uz or td.name_en or f"#{task_id}"


def task_note(db: Session, task_id: int) -> str:
    """What the leader is told to photograph — «Foto hisobot», «Nazorat
    varaqasi», «Aylanib chiqish chek-listi».

    Global only: `note_*` lives on LeaderTaskDef alone, unlike name/criteria,
    so there is no chain to walk. This is the description the relevance
    question is judged against, and it exists for every seeded task — which is
    why that question works without an admin writing a single criterion.
    """
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        return ""
    return (td.note_ru or td.note_uz or td.note_en or "").strip()


def task_examples(db: Session, task_id: int) -> list[tuple[bytes, str]]:
    """Admin-uploaded EXAMPLE proof photos — "a correct proof looks like this".

    Global per task, like `note_*`. Already stored at the edge size the Gemini
    request shrinks to, so sending them costs no extra processing. They ride in
    FRONT of the proof photos on every review of the task; the prompt tells the
    model they are reference-only (see `_prompt`), most importantly that their
    own — old by definition — timestamps are exempt from the date question.
    """
    rows = (db.query(LeaderTaskExample).filter_by(task_id=task_id)
            .order_by(LeaderTaskExample.id).all())
    return [(r.data, r.mime or "image/jpeg") for r in rows]


# ── the expected photo window ────────────────────────────────────────────────
#
# When a proof photo may have been TAKEN. Deliberately not the same thing as
# routers/leaders.WINDOW, which judges when the REPORT was filed and can void a
# whole day: this one only ever decides one `date_ok`, so it is safe to make it
# narrow and safe to make it per task.
#
# The shift defaults are the hours the crew is actually on the floor (user,
# 2026-08-14). Shift 2's used to open at 21:00 — copied from the filing window —
# which date-flagged every correct photo taken in the first four hours of the
# night, the exact hours a start-of-shift task is photographed in.
SHIFT_WINDOW = {
    1: ("07:00", "20:00"),   # same day
    2: ("17:00", "09:00"),   # crosses midnight
}
# An unknown shift is treated as shift 1: the stricter reading, and unknown-shift
# rows are rare (an unmatched supervisor name).
DEFAULT_WINDOW = SHIFT_WINDOW[1]


def hhmm(v: str | None) -> str | None:
    """Normalise a stored/typed clock to "HH:MM", or None if it is not one.
    Blank means "inherit", never "midnight"."""
    s = str(v or "").strip()
    if not s:
        return None
    m = re.match(r"^(\d{1,2})[:.\s]?(\d{2})$", s)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def shift_window(shift: int | None) -> tuple[str, str]:
    return SHIFT_WINDOW.get(shift or 0, DEFAULT_WINDOW)


def resolve_window(shift: int | None, *levels) -> tuple[str, str]:
    """The effective (from, to) for one task, given the chain's raw rows ordered
    NARROWEST FIRST (leader, supervisor, global).

    Each end resolves on its own — that is what makes both inputs optional in
    the admin form. A supervisor who sets only a closing time keeps the global
    (or shift-default) opening; a task that fills neither is judged by its
    shift's hours exactly as before this existed.
    """
    lo = hi = None
    for row in levels:
        if row is None:
            continue
        lo = lo or hhmm(getattr(row, "win_from", None))
        hi = hi or hhmm(getattr(row, "win_to", None))
    d_lo, d_hi = shift_window(shift)
    return lo or d_lo, hi or d_hi


def resolve_date_check(*levels) -> bool:
    """Is the DATE question asked for this task? The chain's rows narrowest first
    (leader, supervisor, global), same order as `resolve_window`.

    True = judge the clock against the window, which is what every task did
    before this flag existed. False = the proof does not have to prove WHEN it
    was taken, so `date_flags` returns nothing at all for it (see there).

    NULL means inherit, and NULL everywhere means checked: a box whose migration
    has not run, a row written before the column existed and a level nobody has
    touched all read as the old behaviour rather than as a silent exemption.
    Note this cannot use `resolve_deadline`'s "first non-blank" test — the value
    being resolved is FALSE at its most meaningful, and `if v` would skip it.
    """
    for row in levels:
        if row is None:
            continue
        v = getattr(row, "date_check", None)
        if v is not None:
            return bool(v)
    return True


def resolve_time_check(*levels) -> bool:
    """Given the date question IS asked, must the CLOCK be proven too? The
    chain's rows narrowest first, same order and same NULL-inherit rule as
    `resolve_date_check` — which it composes with, never replaces:

        date_check False              → nothing is asked (this answer is moot)
        date_check True  + True here  → strict: a system clock, inside the window
        date_check True  + False here → DATE ONLY: the day is judged, the hour
                                        is not, and the window is not a rule

    Read it with `resolve_date_check`, never alone: on its own, False says
    "hours are not judged", which is also true of a fully exempt task, so a
    surface that reads only this one cannot tell "the day must match" from "we
    do not ask". Every caller here resolves the pair (see `date_rule_for`).

    Defaults True for the same reason as its twin: NULL is inherit, NULL all the
    way up is the behaviour that predates this column, and a migration that has
    not run must never read as a silent relaxation.
    """
    for row in levels:
        if row is None:
            continue
        v = getattr(row, "time_check", None)
        if v is not None:
            return bool(v)
    return True


MAX_DATE_PLUS = 7          # a week; past that the report day means nothing


def resolve_date_plus(*levels) -> int:
    """How many days AFTER the report day this task's proof may also be dated.
    The chain's rows narrowest first, same order and same NULL-inherit rule as
    its two neighbours; NULL everywhere is 0, i.e. only the report day — what
    every task did before this existed.

    It answers a question the other two cannot: `date_check` decides whether the
    day is asked about and `time_check` whether the hour is, but both then
    compare against exactly one day. A proof dated by what it is ABOUT rather
    than by when it was made — a work schedule filed the day before it applies —
    fails that comparison on every honest filing, and the only escapes were
    exempting the date entirely or writing a fake overnight window, which is the
    same relaxation hidden inside a field that means something else.

    Cannot use `resolve_deadline`'s "first non-blank" test either, for the twin
    of `resolve_date_check`'s reason: the value at its most meaningful is 0, and
    `if v` would skip an override that deliberately says "only the report day".
    Clamped, because the number widens what passes and arrives from an endpoint
    reachable without the UI.
    """
    for row in levels:
        if row is None:
            continue
        v = getattr(row, "date_plus", None)
        if v is not None:
            try:
                return max(0, min(MAX_DATE_PLUS, int(v)))
            except (TypeError, ValueError):
                return 0
    return 0


def date_rule_for(db: Session, task_id: int, manager_id: int | None,
                  leader_id: int | None,
                  shift: int | None) -> tuple[tuple[str, str], bool, bool, int]:
    """The whole date rule for one row — (window, checked, timed, plus) — in ONE
    chain walk, resolved leader → supervisor → global → shift default.

    The four facts always travel together: a window nobody compares against is
    just a label, a comparison with no window has nothing to compare to, a
    window shown for a task whose hours are not judged is a rule the reader
    cannot tell is dead, and a day shown without its tolerance names one day
    where two or more actually pass. The per-row form; bulk readers preload the
    three config tables and call `resolve_window`/`resolve_date_check`/
    `resolve_time_check`/`resolve_date_plus` directly (see routers/leader_ai
    `_hydrate` — this walk costs three queries a row).
    """
    own = sup = None
    if leader_id:
        own = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
    if manager_id:
        sup = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    return (resolve_window(shift, own, sup, td),
            resolve_date_check(own, sup, td),
            resolve_time_check(own, sup, td),
            resolve_date_plus(own, sup, td))


def overnight(win: tuple[str, str]) -> bool:
    """Does this window cross midnight? A close at or before the open is the
    only thing that can mean it (17:00 → 09:00); a window is never 24h."""
    return win[1] <= win[0]


def date_window(date: str, shift: int | None,
                win: tuple[str, str] | None = None,
                plus: int = 0) -> tuple[str, str]:
    """(from, to) as "YYYY-MM-DD HH:MM" — the window pinned onto a real day.

    `win` is the task's effective clock pair; without one the shift default is
    used, which is what every caller that only knows the shift wants. A window
    that crosses midnight closes on the NEXT date, so both halves of a night are
    inside it — that is the whole reason the reviewer is shift-aware, since a
    bare calendar-date check flags a correct 02:00 photo every night.

    `plus` (the task's date tolerance) moves the CLOSING date that many days on,
    so the pair still spans everything that can pass. It is an outline, not the
    rule: with a tolerance the accepted set is the window repeated on each
    allowed day, not one continuous stretch — which is why every sentence that
    prints a tolerated window also prints the day list beside it (`date_days`).
    """
    lo, hi = win or shift_window(shift)
    span = max(0, int(plus or 0)) + (1 if overnight((lo, hi)) else 0)
    if not span:
        return f"{date} {lo}", f"{date} {hi}"
    try:
        end = (datetime.strptime(str(date)[:10], "%Y-%m-%d")
               + timedelta(days=span)).strftime("%Y-%m-%d")
    except ValueError:
        end = date
    return f"{date} {lo}", f"{end} {hi}"


def date_days(date: str, plus: int = 0) -> list[str]:
    """The days a proof for `date` may be dated — the report day, then one per
    day of the task's tolerance. ONE definition, so the judgement
    (`clock_in_window`), the sentence (`date_prose`) and what the card prints as
    expected can never name different days."""
    try:
        day = datetime.strptime(str(date)[:10], "%Y-%m-%d")
    except ValueError:
        return [str(date)[:10]]
    return [(day + timedelta(days=k)).strftime("%Y-%m-%d")
            for k in range(max(0, int(plus or 0)) + 1)]


def _prompt(*, task: str, note: str, criteria: str,
            n_images: int, omitted: int, n_examples: int = 0,
            screen_dates: bool = False) -> str:
    # NOTE the parameters that are gone: date, shift, win. The model is not told
    # which day the report is for, which hours are allowed, or that shifts
    # exist. It transcribes clocks; `date_flags()` compares them. Two whole
    # classes of bug went with them — a model that anchored its READING on the
    # report date printed above it, and an overnight window it had to reason
    # across midnight about (which flagged a correct 02:00 photo every night).
    #
    # `screen_dates` is the ONE thing about the rule the model is now told, and
    # it is a question of what may be READ, never of what passes: with it, a date
    # printed inside the app or document counts as a date worth transcribing.
    # It rides on `time_check` being off (see `resolve_time_check`) because the
    # two are the same fact from either end — a task judged by the day alone is
    # exactly a task whose proof carries a day and no clock, and telling the
    # model to ignore that day left `date_flags` with nothing to judge, which is
    # how an honest dashboard screenshot became `no_date`. The model still is not
    # told WHICH day is expected, so it cannot anchor on one.
    # Relevance is asked against the task name plus its `note_*` description —
    # the same line the leader reads in the bot for what to photograph. It is
    # deliberately lenient: the failure it exists to catch is a photo about
    # something else entirely (yesterday's screenshot, a different form, a
    # personal picture), not a weak photo of the right thing. A strict reading
    # would double-flag every `not_proven` row and make the chip meaningless.
    what = f"«{task}»" + (f" — {note}" if note else "")
    note_line = f"TALAB QILINGAN ISBOT: {note}\n" if note else ""
    match_block = (
        "2) MAVZU MOSLIGI. Bu vazifa uchun aynan nima suratga olinishi kerakligi "
        f"yuqorida yozilgan: {what}.\n"
        "Rasm(lar) shu narsani ko'rsatyaptimi?\n"
        "- Ha, ya'ni rasm shu vazifaga aloqador — matches_task=true.\n"
        "- Yo'q, ya'ni rasm butunlay boshqa narsa: boshqa hujjat yoki shakl, "
        "boshqa jarayon, shaxsiy surat, tasodifiy ekran, vazifaga hech qanday "
        "aloqasi yo'q rasm — matches_task=false.\n"
        "MUHIM: ikkilansang matches_task=true qo'y. Rasm mavzuga aloqador "
        "bo'lsa-yu sifatsiz, chala yoki to'liq bo'lmasa — bu MAVZU muammosi "
        "EMAS, buni keyingi savolda ayt."
    )
    if criteria:
        done_block = (
            "3) ISBOT. Quyida vazifa qanday bajarilgan hisoblanishi yozilgan. "
            "Rasm(lar) shu talabni bajarilganini KO'RSATyaptimi?\n"
            f"TALAB: {criteria}\n"
            "Agar rasm talabga aloqador bo'lmasa, yarim bajarilgan bo'lsa, bo'sh "
            "shakl/jadval ko'rsatsa yoki talabni tasdiqlamasa — proves_done=false."
        )
    elif n_examples:
        # No written requirement, but examples exist — they ARE the requirement:
        # an admin who uploaded a reference photo without authoring text has
        # still said what done looks like, and the question can run against it.
        done_block = (
            "3) ISBOT. Bu vazifa uchun yozma talab kiritilmagan, lekin NAMUNA "
            "rasm(lar) berilgan. Tekshirilayotgan rasm(lar) namunadagidek "
            "bajarilgan ishni ko'rsatsa — proves_done=true; bo'sh, chala yoki "
            "namunadagidan butunlay boshqa holat ko'rinsa — proves_done=false."
        )
    else:
        done_block = (
            "3) ISBOT. Bu vazifa uchun yozma talab kiritilmagan, shuning uchun "
            "BAJARILGANLIK darajasini baholama: yuqoridagi mavzu mosligi tekshiruvi "
            "o'tgan bo'lsa — proves_done=true qo'y."
        )
    # Example reference images ride in FRONT of the proof photos. The model has
    # to be told the order and — critically — that an example's own timestamp is
    # exempt from question 1: an example is an old photo by definition, and
    # without the carve-out the date check would flag every proof against the
    # example's clock.
    if n_examples:
        intro = (
            f"Senga avval {n_examples} ta NAMUNA rasm, keyin {n_images} ta "
            f"TEKSHIRILADIGAN isbot rasmi berilgan.\n"
            f"NAMUNA rasmlar — to'g'ri topshirilgan isbot qanday ko'rinishini "
            f"ko'rsatadigan eski misollar. Ular BAHOLANMAYDI: ulardagi sana, soat "
            f"va qiymatlar tekshirilmaydi (eski bo'lishi tabiiy), ular faqat "
            f"taqqoslash uchun berilgan. Quyidagi BARCHA savollar FAQAT oxirgi "
            f"{n_images} ta TEKSHIRILADIGAN rasmga tegishli."
        )
        ex_date = ("\n- NAMUNA rasmlardagi sana-vaqtni image_date ga YOZMA va "
                   "tekshiruvda ishlatma — faqat TEKSHIRILADIGAN rasmlarnikini o'qi.")
        match_block += (
            "\nNAMUNA rasm(lar) shu vazifa uchun to'g'ri isbot qanday "
            "ko'rinishini ko'rsatadi — tekshirilayotgan rasmni ularga solishtir: "
            "mazmuni o'xshash bo'lishi kutiladi, sanasi va qiymatlari farq "
            "qilishi tabiiy.")
    else:
        intro = f"Senga bitta vazifa uchun {n_images} ta isbot rasmi berilgan."
        ex_date = ""
    omit = (f"\nEslatma: bu vazifada ko'proq rasm bor, faqat birinchi "
            f"{n_images} tasi yuborildi ({omitted} tasi yuborilmadi).") if omitted else ""
    # Question 1, in its two forms — which SOURCES may be read, and when to add
    # no entry at all. Everything after it (the field list, the day-first format,
    # the discarded year) is shared, because those are facts about transcription
    # and not about the rule.
    #
    # Strict: only a system clock or a camera stamp, and an in-app date is
    # explicitly BANNED — it does not say when a photo was taken, which is the
    # question that mode asks.
    #
    # Date-only: the same sources PLUS the date printed on screen, and EVERY
    # visible date is listed rather than one per photo. Both follow from the
    # judgement: `clock_in_window(times=False)` passes on ANY matching day
    # because one screen legitimately shows several (a register filtered to
    # today still lists last week's rows), so the model must hand over all of
    # them; withholding the one the filter shows was what left an honest proof
    # with no readable date at all.
    if screen_dates:
        date_block = """1) SANA. Sen rasmda KO'RINGAN SANANI O'QIYSAN. Bu vazifada rasm QACHON
(soat necha) olingani tekshirilmaydi — soat ko'rinmasa, bu muammo emas. Sana
quyidagilarning HAR BIRIDAN o'qilishi mumkin:
   a) TIZIM SOATI — Windows'da pastki o'ng burchakda, macOS'da yuqori o'ng
      burchakda, telefonda eng yuqori holat satridagi sana-vaqt;
   b) KAMERA MUHRI — kamera rasmga bosgan sana-vaqt yozuvi;
   c) EKRANDAGI, ya'ni ILOVA yoki HUJJAT ICHIDAGI SANA — bu vazifada BU HAM
      TO'LIQ HISOBGA OLINADI: ilovadagi sana filtri («17-avgust, 2026» kabi),
      jadval yoki ro'yxat qatoridagi sana, hujjat/shakl sarlavhasidagi sana,
      qo'lda yozilgan sana.

Ekranda BIR NECHTA sana bo'lsa — masalan yuqorida filtr sanasi, pastda
qatorlarning sanalari — HAMMASINI yoz, har biri uchun alohida yozuv qo'sh (eng
ko'p 8 ta: avval filtr yoki sarlavha sanasi, keyin qatorlardagi sanalar).
Qaysi biri to'g'ri kelishini tizim o'zi hisoblaydi.

Sen sanani BAHOLAMAYSAN — faqat O'QIYSAN va yozasan. Qaysi sana kutilayotgani
senga aytilmagan; taxmin qilma va o'zingdan sana qo'shma."""
    else:
        date_block = """1) SOAT. Sen rasm QACHON OLINGANINI O'QIYSAN. Buning uchun FAQAT quyidagi
manbalardan biri hisobga olinadi:
   a) KOMPYUTER SKRINSHOTI — operatsion tizim soati skrinshot ichida ko'rinadi:
      Windows'da pastki o'ng burchakda (masalalar panelida), macOS'da yuqori
      o'ng burchakda (menyu satrida);
   b) TELEFON SKRINSHOTI — telefonning O'Z holat satridagi (status bar) soat:
      rasmning eng yuqori chekkasidagi, batareya, signal va Wi-Fi belgilari
      turgan ingichka satr. Android'da soat va sana odatda chap tomonda
      («15:10 pay, 13 avg» yoki «15:10 чт, 13 авг»), iPhone'da chap yuqorida.
      Bu satr juda KICHIK yozilgan bo'ladi — uni diqqat bilan o'qi; u rasmda
      bor ekan, «soat ko'rinmadi» deb yozma;
   c) EKRAN SURATI — o'sha kompyuter yoki telefon soati kamera bilan olingan
      ekran suratida ko'rinadi;
   d) KAMERA MUHRI — kamera rasmga avtomatik bosgan sana-vaqt yozuvi.

MUHIM: ILOVA yoki HUJJAT ICHIDAGI vaqt — masalan ro'yxatdagi «14:30 - 15:30»
kabi jadval vaqtlari, jadval katagidagi sana, «Период» yoki «Sana» ustuni,
blank/shakl sarlavhasidagi sana, qo'lda yozilgan sana — rasm qachon olinganini
BILDIRMAYDI. Uni sana sifatida ISHLATMA. U to'g'ri ko'rinsa ham, yuqoridagi
manbalardan biri bo'lmasa — sana tasdiqlanmagan hisoblanadi. Ya'ni soat FAQAT
ekranning eng chekkasidagi tizim satridan yoki kamera muhridan o'qiladi.

Sen sanani BAHOLAMAYSAN — faqat O'QIYSAN va yozasan. To'g'ri yoki noto'g'ri
ekanini keyin tizim o'zi hisoblaydi. Qaysi sana kutilayotgani senga aytilmagan;
taxmin qilma va hisobot sanasiga moslashtirma."""
    # The "add no entry" rules, per mode: what counts as nothing to transcribe
    # differs exactly as the source list does.
    empty_rules = ("""
- Rasmda hech qanday sana ko'rinmasa — o'sha rasm uchun yozuv QO'SHMA. Hech
  qaysi rasmda sana bo'lmasa, clocks bo'sh ro'yxat bo'ladi. O'ylab yoki taxmin
  qilib sana YOZMA.
- Sana ko'rinib, soati ko'rinmasa — yozuvni qo'sh, day va month ni to'ldir,
  time ni "" qoldir. Bu vazifada bu KAMCHILIK emas."""
                   if screen_dates else """
- Yuqoridagi manbalardan hech biri ko'rinmasa (yoki faqat ilova/hujjat ichidagi
  vaqt bo'lsa) — o'sha rasm uchun yozuv QO'SHMA. Hech qaysi rasmda soat
  bo'lmasa, clocks bo'sh ro'yxat bo'ladi.
- Faqat SOAT ko'rinib, kun ham oy ham ko'rinmasa — yozuvni qo'sh, time ni to'ldir,
  day=0 va month=0 qoldir.""")
    entry_line = ("Topilgan HAR BIR sana uchun clocks ro'yxatiga bitta yozuv qo'sh:"
                  if screen_dates
                  else "Har bir TEKSHIRILADIGAN rasm uchun clocks ro'yxatiga bitta yozuv qo'sh:")
    source_line = ("  source — qayerdan o'qiding: «windows», «macos», «telefon», "
                   "«camera», «ekran» (ilova ichidagi sana)."
                   if screen_dates else
                   "  source — qayerdan o'qiding: «windows», «macos», «telefon», «camera».")
    return f"""Sen zavod liderlarining kunlik hisobotlarini tekshiruvchi auditorsan.
{intro}

VAZIFA: {task}
{note_line}{omit}

Quyidagi savollarga javob ber:

{date_block}

{entry_line}
  raw    — ekranda qanday yozilgan bo'lsa shundayligicha, butun satr (masalan
           «04.08.2026 14:22» yoki «15:10 чт, 13 авг.»);
  day    — kun raqami (1-31), ko'rinmasa 0;
  month  — oy raqami (1-12), ko'rinmasa 0;
  time   — soat «SS:DD» ko'rinishida (24 soatlik), ko'rinmasa "";
{source_line}

Mahalliy format KUN.OY.YIL, ya'ni 04.08.2026 = 4-avgust (4-yanvar emas), demak
day=4, month=8. Oy nomi qisqartma bo'lishi mumkin (Avg / Авг / Aug = 8).

YIL kerak emas — uni yozma. Bu manbalar ko'pincha yilni ko'rsatmaydi (macOS
menyu satri odatda faqat «Sesh 4 Avg 14:22» deb yozadi), va yil hisobga
olinmaydi.
{empty_rules}{ex_date}

{match_block}

{done_block}

4) O'QILISHI. Rasm juda xira, qorong'i yoki kesilgan bo'lib, hech narsani
aniqlab bo'lmasa — readable=false.

Sabablarni TO'RT tilda yoz (reason_uz — o'zbek lotin, reason_uz_cyrl — o'zbek
kirill alifbosida, reason_ru — rus, reason_en — ingliz). Har biri 1-2 qisqa jumla, oddiy
matn, markdown ishlatma. Sababda MAVZU va ISBOT haqida yoz — sana to'g'ri yoki
noto'g'ri ekani haqida HECH NARSA yozma (buni tizim o'zi hisoblaydi va o'zi
yozadi). Soatni qayerdan o'qiganingni ayta olasan («Windows soati», «macOS menyu
satri», «kamera muhri»). Muammo bo'lmasa — qisqa tasdiq yoz."""


# ── image fetching ───────────────────────────────────────────────────────────

_DRIVE_ID = re.compile(r"(?:/file/d/|/d/|[?&]id=)([A-Za-z0-9_-]{16,})")


def _looks_like_image(content: bytes, ctype: str) -> bool:
    if (ctype or "").lower().startswith("image/"):
        return True
    # Drive hands back an HTML interstitial with a 200 for anything it will not
    # serve directly; sniffing the magic bytes is what catches that.
    return content[:3] == b"\xff\xd8\xff" or content[:8] == b"\x89PNG\r\n\x1a\n" \
        or content[:4] == b"RIFF" or content[:2] == b"BM"


def _host_is_public(host: str) -> bool:
    """False if the host resolves to any private / loopback / link-local /
    reserved address — the targets an SSRF would use to reach internal services
    or a cloud metadata endpoint. Every resolved address must be public."""
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        try:
            addr = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            return False
    return True


def _ssrf_safe_get(client: httpx.Client, url: str, max_redirects: int = 5) -> httpx.Response:
    """GET that follows redirects manually, re-checking at EVERY hop that the
    scheme is http(s) and the host resolves only to public addresses. httpx's
    built-in follow_redirects can't gate the intermediate request to an internal
    host after a redirect; this does. Raises httpx.HTTPError on a blocked hop."""
    current = url
    for _ in range(max_redirects + 1):
        parsed = urlparse(current)
        if parsed.scheme not in ("http", "https"):
            raise httpx.HTTPError(f"blocked URL scheme: {parsed.scheme or 'none'}")
        if not _host_is_public(parsed.hostname or ""):
            raise httpx.HTTPError("blocked non-public host")
        res = client.get(current, follow_redirects=False)
        if res.is_redirect and res.headers.get("location"):
            current = urljoin(current, res.headers["location"])
            continue
        return res
    raise httpx.HTTPError("too many redirects")


def fetch_sheet_image(url: str) -> tuple[bytes, str]:
    """Bytes for one Google-Form photo URL. Drive links are rewritten to a
    direct-content host first — the share URL the form writes returns an HTML
    viewer page, not the image.

    The URL comes from a spreadsheet/Form cell, so it is untrusted: every fetch
    goes through _ssrf_safe_get, which blocks non-http(s) schemes and any host
    resolving to an internal address at every redirect hop."""
    candidates = [url]
    m = _DRIVE_ID.search(url or "")
    if m and "drive.google.com" in url:
        fid = m.group(1)
        candidates = [f"https://lh3.googleusercontent.com/d/{fid}=w1600",
                      f"https://drive.google.com/uc?export=download&id={fid}",
                      url]
    last = ""
    with httpx.Client(timeout=_TIMEOUT) as client:
        for cand in candidates:
            try:
                res = _ssrf_safe_get(client, cand)
            except httpx.HTTPError as exc:
                last = str(exc)
                continue
            if res.status_code != 200:
                last = f"HTTP {res.status_code}"
                continue
            ctype = res.headers.get("content-type", "")
            if _looks_like_image(res.content, ctype):
                return res.content, (ctype.split(";")[0] or "image/jpeg")
            last = "not an image (Drive permissions?)"
    raise ValueError(f"photo unreachable: {last or 'unknown'}")


def fetch_bot_image(file_id: str) -> tuple[bytes, str]:
    """Bytes for one archived Telegram proof photo."""
    token = settings.telegram_bot_token
    if not token:
        raise ValueError("telegram bot token not configured")
    with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
        meta = client.get(f"{_TG_API}/bot{token}/getFile", params={"file_id": file_id})
        if meta.status_code != 200:
            raise ValueError(f"getFile HTTP {meta.status_code}")
        path = ((meta.json().get("result") or {}).get("file_path")) or ""
        if not path:
            raise ValueError("file no longer on Telegram")
        res = client.get(f"{_TG_API}/file/bot{token}/{path}")
        if res.status_code != 200:
            raise ValueError(f"download HTTP {res.status_code}")
        return res.content, res.headers.get("content-type", "image/jpeg").split(";")[0]


# ── discovery ────────────────────────────────────────────────────────────────

def _existing_refs(db: Session) -> set[str]:
    return {r[0] for r in db.query(LeaderAiReview.ref).all()}


FLOOR_SETTING = "leader_ai_floor"

# Where AI review begins when nobody has moved it. The startup migration pins
# this; the admin «Tarixni tozalash» form can move it afterwards.
#
# **Deliberately the same day as `AUTO_FROM`** (user, 2026-08-14: "It should be
# 13.08, we don't need the reports from 11.08"). It sat at 11 Aug — the day the
# reworked criteria came in — which left the platform stating two different
# start dates: the activity strip said review began on the 11th while every
# scoring surface said the 13th, and nothing on screen explained that they
# answer different questions. One date now means one thing.
#
# Raising it was moved through the flag-guarded purge below rather than typed
# into the DB, so the 11–12 Aug verdicts go with it — a floor above verdicts
# that still show in the triage queue is the same contradiction in a new place.
DEFAULT_FLOOR = "2026-08-13"


def floor_date(db: Session) -> str | None:
    """The first date AI review covers ("YYYY-MM-DD"), or None for everything.

    Reports dated BEFORE the floor are out of scope: neither `discover()` nor
    `queue_report()` will queue them. This is what makes a purge of old
    verdicts permanent — discovery back-fills "everything ever filed", so
    without the floor the next pass would re-insert every deleted row as
    `pending` and the drain would re-spend the quota re-judging history nobody
    wants judged. Set by the one-shot purge in app/startup.py and, since the
    history can now be cleared from the page, by `set_floor` below.
    """
    row = db.query(AppSetting).filter_by(key=FLOOR_SETTING).first()
    return row.value if row is not None and row.value else None


def set_floor(db: Session, date: str | None) -> str | None:
    """Move (or lift) the review floor. Returns what it now is.

    Deliberately allows LOWERING it as well as raising it: an operator who
    cleared too much has to be able to widen the window again, and the only
    cost of a lower floor is that discovery re-finds the reports below it —
    which is exactly what they would be asking for.
    """
    row = db.query(AppSetting).filter_by(key=FLOOR_SETTING).first()
    value = (date or "").strip()
    if not value:
        if row is not None:
            db.delete(row)
            db.commit()
        return None
    if row is None:
        db.add(AppSetting(key=FLOOR_SETTING, value=value))
    else:
        row.value = value
    db.commit()
    log.info("leader-ai: review floor set to %s", value)
    return value


def discover(db: Session) -> int:
    """Insert `pending` rows for every reviewable (report, task) not yet known.
    Reviewable = the leader answered YES and attached at least one photo; a
    "no" with a written reason has no image to judge.

    A paused shift (`REVIEW_PAUSED_SHIFTS`) is not reviewable while the pause
    holds — skipped here rather than filtered at the drain, so the queue never
    fills with rows nothing will ever take out of it and the «N queued» figure
    on the page keeps meaning what it says. A REHEARSAL day
    (`LeaderUnitSetting.bot_from`) is skipped for the same reason and one more:
    its photos are a unit learning the buttons, they cost a Gemini call each,
    and nothing on the platform will ever show what the model said about them."""
    known = _existing_refs(db)
    floor = floor_date(db)
    added = 0

    # ── bot layer ────────────────────────────────────────────────────────────
    days_q = db.query(LeaderTaskDay).filter(LeaderTaskDay.closed_at.isnot(None))
    if floor:
        days_q = days_q.filter(LeaderTaskDay.date >= floor)
    days = {d.id: d for d in days_q.all()}
    if days:
        shifts = {m.id: m.shift for m in db.query(Manager).all()}
        rehearsing = leader_bot.bot_from_floors(db)
        with_media = {r[0] for r in db.query(LeaderTaskMedia.entry_id).distinct().all()}
        entries = (
            db.query(LeaderTaskEntry)
            .filter(LeaderTaskEntry.day_id.in_(days.keys()),
                    LeaderTaskEntry.done.is_(True))
            .all()
        )
        for e in entries:
            if added >= DISCOVER_CAP:
                break
            ref = bot_ref(e.id)
            if ref in known or e.id not in with_media:
                continue
            d = days[e.day_id]
            if review_paused(shifts.get(d.manager_id)):
                continue
            if leader_bot.training(shifts.get(d.manager_id), d.manager_id,
                                   d.date, rehearsing):
                continue
            db.add(LeaderAiReview(
                ref=ref, source="bot", date=d.date, task_id=e.task_id,
                leader_id=d.leader_id, manager_id=d.manager_id,
                shift=shifts.get(d.manager_id), status="pending", flags=[],
            ))
            known.add(ref)
            added += 1

    # ── sheet layer ──────────────────────────────────────────────────────────
    # A review's date and shift are a SNAPSHOT of its source row taken when it
    # was first seen, and both can move underneath it: the leaders sheet re-dates
    # a night row to the shift it reports on (services/leader_tasks.filed_date),
    # and a unit can be switched between shifts in the Profiles tab. Either one
    # leaves the verdict being judged against the wrong window — a shift-2 row
    # stranded on tomorrow is checked against a window that has not opened, so
    # every real photo in it reads as the wrong date. Re-stamping known refs
    # below is what keeps the queue in step; verdicts already written are left
    # alone (the recheck modal re-runs any slice on purpose).
    drift = {
        ref: (rid, date, sh) for rid, ref, date, sh in db.query(
            LeaderAiReview.id, LeaderAiReview.ref,
            LeaderAiReview.date, LeaderAiReview.shift,
        ).filter(LeaderAiReview.source == "sheet").all()
    }
    fixed = 0
    if added < DISCOVER_CAP:
        rows_q = db.query(LeaderChecklist)
        if floor:
            rows_q = rows_q.filter(LeaderChecklist.date >= floor)
        rows = rows_q.order_by(LeaderChecklist.date.desc()).all()
        if rows:
            managers = db.query(Manager).all()
            # Relabel BEFORE matching, exactly as /api/leaders does: the unit
            # decides the shift, and the shift decides which timestamps count
            # as on time. A mismatched unit would judge every night photo of a
            # relabeled row against the wrong window.
            sup = supervisor_match(
                managers, {relabel_supervisor(r.supervisor) for r in rows if r.supervisor}
            )
            lead = leader_match(
                db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
                {(r.leader, (sup.get(relabel_supervisor(r.supervisor)) or {}).get("id"))
                 for r in rows if r.leader},
            )
            for r in rows:
                if added >= DISCOVER_CAP:
                    break
                info = sup.get(relabel_supervisor(r.supervisor)) or {}
                who = lead.get((r.leader, info.get("id"))) or {}
                # Paused shifts queue nothing — but their KNOWN refs still get
                # the drift re-stamp below, so a row that moved day or unit is
                # accurate the moment the pause lifts instead of carrying a
                # stale window into its first verdict.
                paused = review_paused(info.get("shift"))
                for tk in (r.tasks or []):
                    if not tk.get("done") or not _sheet_photos(tk):
                        continue
                    ref = sheet_ref(r, int(tk.get("id") or 0))
                    if ref in known:
                        # Known ref: nothing to queue, but re-stamp it if its
                        # source row has moved day or unit shift since. Only
                        # while the row still RESOLVES to a unit — a transient
                        # name-matching miss must never rewrite a review's shift
                        # to "unknown", which would re-judge a night photo
                        # against shift 1's calendar day.
                        was = drift.get(ref)
                        if was and info.get("id") and (
                                was[1] != r.date or was[2] != info.get("shift")):
                            db.query(LeaderAiReview).filter_by(id=was[0]).update(
                                {"date": r.date, "shift": info.get("shift")})
                            fixed += 1
                        continue
                    if paused:
                        continue
                    db.add(LeaderAiReview(
                        ref=ref, source="sheet", date=r.date,
                        task_id=int(tk.get("id") or 0),
                        leader_id=who.get("id"), manager_id=info.get("id"),
                        shift=info.get("shift"), status="pending", flags=[],
                    ))
                    known.add(ref)
                    added += 1
                    if added >= DISCOVER_CAP:
                        break

    if added or fixed:
        db.commit()
    if added:
        log.info("leader-ai: queued %s new review(s)", added)
    if fixed:
        log.info("leader-ai: re-stamped %s review(s) whose source row changed "
                 "day or shift", fixed)
        # A re-stamped row is judged against a different day — and, if its unit
        # moved shift, a different window. Both are inputs to the date verdict,
        # so it is recomputed here rather than left as an artifact that used to
        # need a paid re-check to clear.
        sync_date_flags(db)
    return added


def restamp(db: Session) -> int:
    """Re-point EXISTING sheet verdicts at the day and shift their source row
    now has, then re-derive the date flags. Returns how many moved.

    Queues NOTHING — that is the entire reason it exists as its own function.
    The sheet Refresh must be able to correct verdicts it invalidated without
    calling `discover()`, which is the one door allowed to hand new reports to
    the AI (see the «Tekshirish» rule): a Refresh that also queued would be a
    bulk auto-trigger nobody asked for.

    Why it is needed at all: `sheets_sync` re-dates a night row onto the night
    it reports on (`leader_tasks.filed_date`), and a unit can be moved between
    shifts. Both change which window a photo is judged against, and until now a
    verdict stranded on the old day stayed wrong until someone paid for a
    re-check.
    """
    known = {ref: (rid, date, sh) for rid, ref, date, sh in db.query(
        LeaderAiReview.id, LeaderAiReview.ref,
        LeaderAiReview.date, LeaderAiReview.shift,
    ).filter(LeaderAiReview.source == "sheet").all()}
    if not known:
        return 0
    floor = floor_date(db)
    rows_q = db.query(LeaderChecklist)
    if floor:
        rows_q = rows_q.filter(LeaderChecklist.date >= floor)
    rows = rows_q.all()
    if not rows:
        return 0
    managers = db.query(Manager).all()
    # Relabel BEFORE matching, exactly as /api/leaders and discover() do: the
    # unit decides the shift and the shift decides the window, so a mismatched
    # unit would re-stamp a night row onto shift 1's calendar day.
    sup = supervisor_match(
        managers, {relabel_supervisor(r.supervisor) for r in rows if r.supervisor})
    fixed = 0
    for r in rows:
        info = sup.get(relabel_supervisor(r.supervisor)) or {}
        if not info.get("id"):
            # A transient name-matching miss must never rewrite a shift to
            # "unknown" — that alone would re-judge every night photo on the row
            # against shift 1's hours.
            continue
        for tk in (r.tasks or []):
            was = known.get(sheet_ref(r, int(tk.get("id") or 0)))
            if was and (was[1] != r.date or was[2] != info.get("shift")):
                db.query(LeaderAiReview).filter_by(id=was[0]).update(
                    {"date": r.date, "shift": info.get("shift")})
                fixed += 1
    if fixed:
        db.commit()
        log.info("leader-ai: re-stamped %s verdict(s) after a sheet refresh", fixed)
    sync_date_flags(db)
    return fixed


# Source rows walked by the census below. Every other number in the range
# summary is an exact aggregate over `leader_ai_reviews`; this one reads the two
# COLLECTION layers, and the sheet layer keeps its tasks in JSON, so it is
# bounded and says when the bound was hit rather than becoming the slowest read
# on the platform.
CENSUS_CAP = 20000


def undiscovered(db: Session, *, date_from: str | None = None,
                 date_to: str | None = None) -> dict:
    """Reviewable proof rows that have NEVER been queued, one tuple each.

    Discovery is deliberately not automatic (see `register_drain_job`): a report
    only gets a `leader_ai_reviews` row when somebody presses something. So the
    work that has never been checked is precisely the work that has no row at
    all — and a summary reading only that table answers "no proof photos in this
    range" for the exact range «Tekshirilmagan» exists to fix. That answer is
    never true, and it is the one the operator sees when they most need a
    number.

    This finds what `discover()` WOULD insert without inserting it: the same
    reviewability rule (the leader answered yes and attached a photo), the same
    floor, the same unit/leader resolution. A census taken by a looser rule
    would promise rows the button then never queues.

    Narrowed by DATE only. Each row comes back carrying its own
    `(report_key, shift, manager_id, leader_id)`, so the caller narrows by WHO
    in memory and tallies the very same rows per dimension for the pickers —
    one scan, and no way for the summary and the option lists to disagree about
    what is out there.

    Returns `{"rows": [(key, shift, manager_id, leader_id), …], "approx": bool}`.
    """
    floor = floor_date(db)
    known = _existing_refs(db)
    out: list[tuple[str, int | None, int | None, int | None]] = []
    approx = False

    # ── bot layer ────────────────────────────────────────────────────────────
    # Unit and leader are stamped on the day row, so nothing here needs matching.
    days_q = db.query(LeaderTaskDay.id, LeaderTaskDay.manager_id,
                      LeaderTaskDay.leader_id, LeaderTaskDay.date).filter(
        LeaderTaskDay.closed_at.isnot(None))
    if floor:
        days_q = days_q.filter(LeaderTaskDay.date >= floor)
    if date_from:
        days_q = days_q.filter(LeaderTaskDay.date >= date_from)
    if date_to:
        days_q = days_q.filter(LeaderTaskDay.date <= date_to)
    days = {d: (m, l, dt) for d, m, l, dt in days_q.all()}

    if days:
        # A day's shift is its unit's shift — the rule discovery stamps with.
        shifts = dict(db.query(Manager.id, Manager.shift).all())
        # Rehearsal days are what `discover()` refuses to queue, so a census
        # that counted them would promise «N unchecked» rows the button then
        # never takes — and the figure would never come down.
        rehearsing = leader_bot.bot_from_floors(db)
        entries = (
            db.query(LeaderTaskEntry.id, LeaderTaskEntry.day_id)
            .filter(LeaderTaskEntry.day_id.in_(
                        days_q.with_entities(LeaderTaskDay.id).scalar_subquery()),
                    LeaderTaskEntry.done.is_(True),
                    LeaderTaskEntry.id.in_(
                        db.query(LeaderTaskMedia.entry_id).scalar_subquery()))
            .limit(CENSUS_CAP + 1).all()
        )
        if len(entries) > CENSUS_CAP:
            approx = True
            entries = entries[:CENSUS_CAP]
        for eid, day_id in entries:
            if bot_ref(eid) in known:
                continue
            mgr, ldr, when = days.get(day_id, (None, None, None))
            if leader_bot.training(shifts.get(mgr), mgr, when, rehearsing):
                continue
            out.append((f"bot:{day_id}", shifts.get(mgr), mgr, ldr))

    # ── sheet layer ──────────────────────────────────────────────────────────
    rows_q = db.query(LeaderChecklist)
    if floor:
        rows_q = rows_q.filter(LeaderChecklist.date >= floor)
    if date_from:
        rows_q = rows_q.filter(LeaderChecklist.date >= date_from)
    if date_to:
        rows_q = rows_q.filter(LeaderChecklist.date <= date_to)
    rows = (rows_q.order_by(LeaderChecklist.date.desc())
            .limit(CENSUS_CAP + 1).all())
    if len(rows) > CENSUS_CAP:
        approx = True
        rows = rows[:CENSUS_CAP]

    if rows:
        # WHO on a sheet row is a NAME. Matched once for the whole scan, and
        # relabelled BEFORE matching exactly as discovery does it: the unit
        # decides the shift, so a mismatched unit files the row under the wrong
        # one. A name that matches nothing carries NULL and belongs to no unit
        # and no leader — reachable under «All» and nowhere else, which is the
        # honest answer rather than padding it onto somebody who may not own it.
        sup = supervisor_match(
            db.query(Manager).all(),
            {relabel_supervisor(r.supervisor) for r in rows if r.supervisor},
        )
        lead = leader_match(
            db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
            {(r.leader, (sup.get(relabel_supervisor(r.supervisor)) or {}).get("id"))
             for r in rows if r.leader},
        )
        for r in rows:
            info = sup.get(relabel_supervisor(r.supervisor)) or {}
            who = lead.get((r.leader, info.get("id"))) or {}
            for tk in (r.tasks or []):
                if not tk.get("done") or not _sheet_photos(tk):
                    continue
                ref = sheet_ref(r, int(tk.get("id") or 0))
                if ref in known:
                    continue
                out.append((report_key(ref), info.get("shift"),
                            info.get("id"), who.get("id")))

    return {"rows": out, "approx": approx}


def queue_report(db: Session, *, day: LeaderTaskDay | None = None,
                 row: LeaderChecklist | None = None, force: bool = False) -> int:
    """Queue ONE report's reviewable tasks, by the same rule as `discover()`.

    Exists for the per-task "check now" button: that press must not pay for a
    scan of every report ever filed, which is what `discover()` does and what
    the background drain is for. Matching is done for this row alone — a single
    fuzzy match is cheap, it is the batch of thousands that is not.

    `force` overrides the shift pause (`REVIEW_PAUSED_SHIFTS`) and the rehearsal
    window (`LeaderUnitSetting.bot_from`), and is passed by exactly one caller:
    the admin's per-task «check now», where a person is waiting on the answer
    for a photo they picked. Every other caller is the system deciding by itself
    that a report should be judged — the bot's day close, its auto-close of
    bygone days — and those are what both bounds exist to stop.
    """
    # Reports before the review floor are out of scope — see floor_date().
    floor = floor_date(db)
    when = day.date if day is not None else (row.date if row is not None else None)
    if floor and when and when < floor:
        return 0

    added = 0
    if day is not None:
        mgr = db.query(Manager).filter_by(id=day.manager_id).first()
        if not force and review_paused(mgr.shift if mgr else None):
            return 0
        # A rehearsal day: the unit is learning the bot while its fill-out row
        # is still the record. Nothing displays a verdict on it, so buying one
        # is a Gemini call spent on a photo nobody will ever be shown.
        if not force and leader_bot.training(
                mgr.shift if mgr else None, day.manager_id, day.date,
                leader_bot.bot_from_floors(db)):
            return 0
        entries = db.query(LeaderTaskEntry).filter_by(
            day_id=day.id, done=True).all()
        with_media = {
            r[0] for r in db.query(LeaderTaskMedia.entry_id)
            .filter(LeaderTaskMedia.entry_id.in_([e.id for e in entries] or [0]))
            .distinct().all()
        }
        for e in entries:
            ref = bot_ref(e.id)
            if e.id not in with_media or db.query(LeaderAiReview).filter_by(ref=ref).first():
                continue
            db.add(LeaderAiReview(
                ref=ref, source="bot", date=day.date, task_id=e.task_id,
                leader_id=day.leader_id, manager_id=day.manager_id,
                shift=mgr.shift if mgr else None, status="pending", flags=[],
            ))
            added += 1
    elif row is not None:
        name = relabel_supervisor(row.supervisor)
        info = (supervisor_match(db.query(Manager).all(), {name}) or {}).get(name) or {}
        if not force and review_paused(info.get("shift")):
            return 0
        who = {}
        if row.leader:
            who = (leader_match(
                db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
                {(row.leader, info.get("id"))},
            ) or {}).get((row.leader, info.get("id"))) or {}
        for tk in (row.tasks or []):
            if not tk.get("done") or not _sheet_photos(tk):
                continue
            tid = int(tk.get("id") or 0)
            ref = sheet_ref(row, tid)
            if db.query(LeaderAiReview).filter_by(ref=ref).first():
                continue
            db.add(LeaderAiReview(
                ref=ref, source="sheet", date=row.date, task_id=tid,
                leader_id=who.get("id"), manager_id=info.get("id"),
                shift=info.get("shift"), status="pending", flags=[],
            ))
            added += 1
    if added:
        db.commit()
    return added


def drop_rehearsal_pending(db: Session, manager_id: int, bot_from: str | None) -> int:
    """Take a newly-declared rehearsal window's work back OUT of the queue.

    Closing the doors (`discover`, `queue_report`, `queue_task`) stops NEW rows;
    it does nothing about the ones queued in the hours before an admin opened
    the window — and those are precisely the ones this exists for, because a
    unit is usually enrolled in the morning and declared a rehearsal once
    somebody sees how the first tasks went. Left alone they would be spent on
    Gemini and then displayed nowhere, which is the whole thing the window is
    for.

    **Only never-judged rows go**, the same rule as the paused-shift purge:
    `reviewed_at IS NULL AND resolution IS NULL`. A verdict already written is
    an answer somebody may have acted on, and a human ruling is that row's
    terminal state. Nothing is lost either way — `discover()` re-finds every
    one of these refs the moment the window is cleared or moved back.
    """
    if not bot_from:
        return 0
    n = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.source == "bot",
                 LeaderAiReview.manager_id == manager_id,
                 LeaderAiReview.date < bot_from,
                 LeaderAiReview.reviewed_at.is_(None),
                 LeaderAiReview.resolution.is_(None))
         .delete(synchronize_session=False))
    db.commit()
    if n:
        log.info("leader-ai: dropped %s queued row(s) for unit %s rehearsing "
                 "until %s", n, manager_id, bot_from)
    return int(n or 0)


def queue_task(db: Session, day: LeaderTaskDay, entry: LeaderTaskEntry, *,
               force: bool = False) -> int:
    """Queue ONE task's proofs for review — the per-task submission door.

    The whole-day `queue_report` cannot serve this: it queues every reviewable
    task of a day at once, and the point of per-task submission is that a task
    closed at 08:00 is judged at 08:00 while the rest of the day is still being
    worked. Same rules as its sibling, deliberately — the review floor, the
    shift pause, the rehearsal window, and "a task with no photos is not
    reviewable" all decide the same way here, or a unit would be judged by two
    different definitions of what counts as a submission.
    """
    floor = floor_date(db)
    if floor and day.date < floor:
        return 0
    if not entry.done:
        return 0                       # «Yo'q» has no proof to look at
    mgr = db.query(Manager).filter_by(id=day.manager_id).first()
    if not force and review_paused(mgr.shift if mgr else None):
        return 0
    if not force and leader_bot.training(
            mgr.shift if mgr else None, day.manager_id, day.date,
            leader_bot.bot_from_floors(db)):
        return 0                       # rehearsal — see queue_report
    if not db.query(LeaderTaskMedia).filter_by(entry_id=entry.id).first():
        return 0
    ref = bot_ref(entry.id)
    if db.query(LeaderAiReview).filter_by(ref=ref).first():
        return 0
    db.add(LeaderAiReview(
        ref=ref, source="bot", date=day.date, task_id=entry.task_id,
        leader_id=day.leader_id, manager_id=day.manager_id,
        shift=mgr.shift if mgr else None, status="pending", flags=[],
    ))
    return 1


def verdicts_for(db: Session, day: LeaderTaskDay) -> dict[int, LeaderAiReview]:
    """task_id → the verdict on this day's entries, for the surfaces that print
    a running score while the day is still open (the bot's per-task menu).

    Keyed by task rather than by ref so the caller never has to know how a ref
    is built; one query for the whole menu, because the alternative is thirteen.
    """
    entries = {e.id: e.task_id for e in
               db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
    if not entries:
        return {}
    refs = {bot_ref(eid): tid for eid, tid in entries.items()}
    out: dict[int, LeaderAiReview] = {}
    for rev in db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(list(refs))).all():
        tid = refs.get(rev.ref)
        if tid is not None:
            out[tid] = rev
    return out


def _sheet_photos(task: dict) -> list[str]:
    return [p.strip() for p in (task.get("photo") or "").split(",")
            if "http" in p]


# ── the drain ────────────────────────────────────────────────────────────────

def _images_for(db: Session, rev: LeaderAiReview) -> tuple[list[tuple[bytes, str]], int]:
    """(images, omitted). Raises ValueError when nothing could be fetched."""
    urls: list[str] = []
    file_ids: list[str] = []
    if rev.source == "bot":
        entry_id = int(rev.ref.split(":")[1])
        file_ids = [m.file_id for m in db.query(LeaderTaskMedia)
                    .filter_by(entry_id=entry_id)
                    .order_by(LeaderTaskMedia.pos).all()]
        total = len(file_ids)
        file_ids = file_ids[:MAX_IMAGES]
    else:
        row = _sheet_row(db, rev)
        if row is None:
            raise ValueError("form row is no longer in the sheet")
        task = next((t for t in (row.tasks or [])
                     if int(t.get("id") or 0) == rev.task_id), None)
        if not task:
            raise ValueError("task is no longer on the form")
        urls = _sheet_photos(task)
        total = len(urls)
        urls = urls[:MAX_IMAGES]

    out: list[tuple[bytes, str]] = []
    errs: list[str] = []
    for fid in file_ids:
        try:
            out.append(fetch_bot_image(fid))
        except Exception as exc:
            errs.append(str(exc))
    for u in urls:
        try:
            out.append(fetch_sheet_image(u))
        except Exception as exc:
            errs.append(str(exc))
    if not out:
        raise ValueError("; ".join(errs)[:300] or "no photos could be fetched")
    return out, max(0, total - len(out))


def _sheet_row(db: Session, rev: LeaderAiReview) -> LeaderChecklist | None:
    """Re-find the form row behind a sheet ref. Row ids are recycled by the
    wipe-and-reload sync, so the lookup goes through the durable handle the ref
    was built from — the submission id, or the date + leader spelling."""
    parts = rev.ref.split(":")
    if rev.ref.startswith("sheet:"):
        return db.query(LeaderChecklist).filter_by(submission_id=parts[1]).first()
    who = parts[2] if len(parts) > 3 else ""
    return next(
        (r for r in db.query(LeaderChecklist).filter_by(date=rev.date).all()
         if (r.leader or "").strip().lower()[:60] == who),
        None,
    )


def review_one(db: Session, rev: LeaderAiReview) -> str:
    """Turn one pending row into a verdict.

    Returns what happened, so the drain can tell a per-row problem from a
    systemic one: "done" | "image" (this report's photos are unreachable) |
    "model" (the API rejected the call — every other row will fail the same
    way). Raises GeminiQuotaError upward so the caller stops entirely.
    """
    rev.attempts = (rev.attempts or 0) + 1
    try:
        images, omitted = _images_for(db, rev)
    except Exception as exc:
        rev.status = "error"
        rev.error = str(exc)[:500]
        db.commit()
        return "image"

    examples = task_examples(db, rev.task_id)
    # Resolved BEFORE the call, not just after it: the rule decides what the
    # model is asked to read (a date-only task's date lives inside the app, and
    # the strict prompt forbids reading it), and the same values then judge what
    # came back. One walk, one answer, no chance of asking one question and
    # grading another.
    win, checked, timed, plus = date_rule_for(db, rev.task_id, rev.manager_id,
                                              rev.leader_id, rev.shift)
    prompt = _prompt(
        task=task_label(db, rev.task_id, rev.manager_id, rev.leader_id),
        note=task_note(db, rev.task_id),
        criteria=criteria_for(db, rev.task_id, rev.manager_id, rev.leader_id),
        n_images=len(images), omitted=omitted, n_examples=len(examples),
        screen_dates=checked and not timed,
    )
    try:
        out = gemini.generate_json(prompt, examples + images, _SCHEMA)
    except gemini.GeminiQuotaError:
        # Leave it pending and give the attempt back — the row never got a
        # verdict, and a capped queue head would strand the whole backlog.
        rev.attempts = max(0, (rev.attempts or 1) - 1)
        db.commit()
        raise
    except gemini.GeminiError as exc:
        rev.status = "error"
        rev.error = str(exc)[:500]
        db.commit()
        return "model"

    flags: list[str] = []
    if not out.get("readable", True):
        flags.append("unreadable")
    # Ordered strongest-claim first: "this photo is about something else" is a
    # bigger statement than "it doesn't finish the job", and the chip row reads
    # in this order.
    if not out.get("matches_task", True):
        flags.append("off_topic")
    if not out.get("proves_done", True):
        flags.append("not_proven")

    # The model no longer answers the date question; it hands over what it READ
    # and the window comparison happens here, on our own data.
    #
    # For a proof shot in OUR camera the reading is not needed at all: the
    # capture instant is the server's, recorded when the shutter fired, so the
    # clocks are substituted rather than transcribed and the model is left
    # judging only what it is better at — whether the task is actually done.
    # They go into the SAME field in the same shape, deliberately: every date
    # surface downstream (`date_flags` here, `sync_date_flags` on a window edit,
    # the triage card's date rows, the day report) then reads a camera proof
    # through the code it already has, and an admin who widens a window still
    # gets every affected verdict re-derived for free.
    served = _camera_clocks(db, rev)
    rev.clocks = served if served is not None else _clean_clocks(out.get("clocks"))
    flags += date_flags(rev.clocks, rev.date, win, check=checked, times=timed,
                        plus=plus)
    flags = [f for f in _FLAG_ORDER if f in set(flags)]

    rev.flags = flags
    rev.status = "flagged" if flags else "ok"
    rev.image_date = clocks_text(rev.clocks)[:200] or None
    for l in LANGS:
        setattr(rev, f"reason_{l}", (out.get(f"reason_{l}") or "").strip()[:1500] or None)
    rev.photos = len(images)
    rev.model = gemini.active_model()
    rev.error = None
    rev.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    return "done"


# ── the active run's dates: what confines the drain ──────────────────────────
# The record is WRITTEN by the /leader-ai/recheck endpoint, which owns its
# shape; the drain only ever reads the range off it. The key lives here rather
# than in the router because the dependency runs router → service.
RUN_SETTING = "leader_ai_run"


# ── the drain's heartbeat: how "slow" is told apart from "dead" ──────────────
# A queue that is not moving looks IDENTICAL from the page whether the drain is
# grinding through a forty-photo batch, was skipped because another worker holds
# the lock, or broke on the first 429 of the day. The progress bar could only
# ever report the queue's SIZE, so "0 of 49" a minute in was consistent with all
# three — and the operator has no shell to go and read the log with, which is
# the whole reason the re-check button exists at all.
#
# So the drain leaves a note: what it is doing, since when, how far it got and
# why it stopped. ONE app_settings row, REPLACED whole on every write — a merge
# would carry a stale `quota: true` into the next healthy run and permanently
# accuse a working feature. Written cheaply enough to fire after every single
# verdict, because the timestamp IS the pulse: a number that ticks is the only
# evidence of life a bar at 0% can offer.
HEARTBEAT_SETTING = "leader_ai_drain"


def _beat(db: Session, **fields) -> None:
    """Record what the drain is doing. Never raises — a note about the work is
    not worth losing the work over, and this runs inside the drain loop."""
    import json

    try:
        payload = json.dumps({"at": datetime.now(timezone.utc).isoformat(),
                              **fields})
        row = db.query(AppSetting).filter_by(key=HEARTBEAT_SETTING).first()
        if row is None:
            db.add(AppSetting(key=HEARTBEAT_SETTING, value=payload))
        else:
            row.value = payload
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        log.debug("leader-ai: heartbeat write failed", exc_info=True)


def _read_beat(db: Session) -> dict | None:
    """The stored heartbeat, or None. Never raises — every caller is deciding
    whether to do something extra, and a missing note is not a reason to fail."""
    import json

    try:
        row = db.query(AppSetting).filter_by(key=HEARTBEAT_SETTING).first()
        return json.loads(row.value) if row and row.value else None
    except Exception:
        return None


def _note_refused(db: Session, state: str) -> None:
    """Record a kick that lost the race WITHOUT erasing the run that won it.

    `_beat` replaces the row whole, and that is correct for the drain's own
    writes. It was wrong here. A losing kick wrote `state="busy"` over the live
    drain's `running`, over its `done`, its `errors` and its pulse timestamp —
    so pressing "Start now" during a run destroyed the only record of that run,
    and the strip could then answer only "another review is running", with no
    numbers, no age and no owner. Pressing the button for information was the
    one action that removed it, until the winner's next per-verdict beat
    rebuilt it up to three minutes later.

    So: merge the refusal in BESIDE the live record. Only the refusal keys
    move; the winner keeps `at`, and with it the seconds-since counter that is
    the strip's only proof of life. The next real beat replaces the row whole
    and drops the note, which is right — a refusal is news for one pulse.
    """
    import json

    try:
        row = db.query(AppSetting).filter_by(key=HEARTBEAT_SETTING).first()
        cur: dict = {}
        if row is not None:
            try:
                cur = json.loads(row.value) or {}
            except Exception:
                cur = {}
        now = datetime.now(timezone.utc).isoformat()
        # Nothing live to protect: the lock is held by a drain this process
        # never saw — another worker, or one whose record predates it. Then the
        # refusal IS the whole story and stands on its own.
        if cur.get("state") != "running":
            _beat(db, state=state, startedAt=now)
            return
        cur["refusedAt"] = now
        cur["refusedState"] = state
        row.value = json.dumps(cur)
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        log.debug("leader-ai: refusal note failed", exc_info=True)


def _active_run_scope(db: Session) -> dict | None:
    """The slice an operator-started run is waiting on, or None for "anywhere".

    An operator who picks one day — or one brigadir, or shift 2 — is asking for
    that. Until this existed the pickers narrowed the progress bar's denominator
    and NOTHING else: the drain took the newest pending row anywhere, so a
    one-day run quietly walked backwards through the whole corpus spending quota
    on dates nobody asked about, while the bar read "5 of 222 · 2%" beside
    "19,998 left". The who-filters would land in exactly the same trap.

    Returns `{"date_from","date_to","shift","manager_id","leader_id"}` with the
    keys that are set, None for a run carrying no narrowing at all (that IS the
    whole corpus) and for one already drained, so a confinement can never
    outlive its work.
    """
    import json

    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is None:
        return None
    try:
        run = json.loads(row.value)
    except Exception:
        return None            # a corrupt record is /progress's to clean up
    if run.get("drained_at"):
        return None
    # Records written before the who-filters existed carry only the dates; the
    # missing keys read as "no narrowing", which is exactly what they meant.
    scope = {
        "date_from": run.get("from"), "date_to": run.get("to"),
        "shift": run.get("shift"), "manager_id": run.get("manager"),
        "leader_id": run.get("leader"),
    }
    return scope if any(v is not None and v != "" for v in scope.values()) else None


def note_auto_run(db: Session, queued: int, by: str) -> bool:
    """Record an AUTOMATIC queueing as a run, so the progress strip shows it.

    Shift 1's proofs enter the platform on the sheet Refresh and shift 2's when
    a leader closes their bot day. Both have always kicked a drain, and both did
    it invisibly: the rows were queued, the quota was spent, and the page showed
    nothing until somebody opened the AI tab. A hand-off nobody can see is one
    nobody trusts — the operator's only evidence was that a number eventually
    changed.

    Writing the same record `_start_run` writes gives those events the bar, the
    ETA, the Stop button and the detail view for free, because everything that
    reads progress reads this one row.

    **Never displaces a live run.** An operator-started re-check owns the strip
    and, through `_active_run_scope`, the drain's confinement: overwriting it
    would silently widen a run somebody deliberately narrowed to one brigadir.
    A finished record (`drained_at`) is fair game — that run is over, and the
    drain marks it so itself the moment it empties the queue (`drain()` →
    `_release_run`), so "finished" does not depend on a `/progress` poll that
    only happens while somebody has the page open.

    Rows queued INTO a live run need no record of their own. `/progress`
    re-derives that run's total as `done + left` on every poll and reports the
    growth as `grew`, so the bar covers them and says they joined — refusing
    here costs the strip nothing. Before that held, a refusal meant the rows
    were worked under a bar sized for somebody else's 13, which read as
    «13 of 13 · 100%» beside «1,222 left».

    Carries no narrowing on purpose, so the drain stays unconfined and works the
    whole queue, oldest debt included.
    """
    import json

    if queued <= 0:
        return False
    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is not None:
        try:
            cur = json.loads(row.value) or {}
        except Exception:
            # A record that cannot be read protects nothing — `/progress`
            # deletes it on sight, and until then it must not hold the strip.
            cur = {}
        if cur and not cur.get("drained_at"):
            return False
    # The bar measures the whole QUEUE, not just the rows this event added: the
    # run carries no narrowing, so the drain works through everything waiting
    # and ends only when nothing is left. A total of "12 new" beside a drain
    # chewing through 500 is a bar that hits 100% and keeps going.
    total = max(queued, (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < MAX_ATTEMPTS,
                # Count what the drain will actually work through — a bar whose
                # denominator includes paused rows stops short of 100% forever.
                ~paused_clause())
        .count()
    ))
    payload = json.dumps({
        "started_at": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "scope": "unchecked",
        "from": None, "to": None,
        "shift": None, "manager": None, "leader": None,
        "narrow": [], "by": (by or "")[:120] or None,
    })
    if row is None:
        db.add(AppSetting(key=RUN_SETTING, value=payload))
    else:
        row.value = payload
    db.commit()
    return True


def _release_run(db: Session) -> None:
    """Mark the run drained: it stops confining the queue, and it stops owning
    the strip.

    THE stall guard. `/progress` retires a finished run, but only while somebody
    has the page open — and nobody watches a backfill overnight. A record left
    behind by a closed tab would otherwise pin the drain to a range with nothing
    in it forever, which is the entire periodic backfill dying silently.

    Called for a NARROWED run when its slice is exhausted, and for an
    UN-NARROWED one when the whole queue is — the second matters because
    `note_auto_run` will not overwrite a record that is not drained, so an
    un-retired auto run swallowed every later automatic queueing into a bar
    sized for the first one.

    The row SURVIVES: deleting it here would rob `/progress` of the one poll
    that reports the run finished. It just stops meaning "confine to this" and
    "this is the run in progress".
    """
    import json

    row = db.query(AppSetting).filter_by(key=RUN_SETTING).first()
    if row is None:
        return
    try:
        run = json.loads(row.value)
    except Exception:
        return
    if run.get("drained_at"):
        return
    run["drained_at"] = datetime.now(timezone.utc).isoformat()
    row.value = json.dumps(run)
    db.commit()


def drain(db: Session, limit: int | None = None, beat=None) -> dict:
    """Review up to `limit` pending rows, newest report first. Returns counts;
    `quota` marks a run cut short by the free tier so the UI can say so.

    Confined to the active run's slice when there is one (`_active_run_scope`)
    — dates and, since the modal offers them, shift / brigadir / leader. EVERY
    caller drains through here, the timer included: a periodic firing that
    ignored the confinement would undo it twenty minutes into the run.

    `beat(done, errors)` — optional, called after every row so a watcher can
    prove the drain is alive. One verdict can legitimately take two minutes
    (image fetch plus a thinking model), and without a per-row pulse a bar
    sitting at 0% cannot say whether the first row is slow or the drain never
    started. The web kick passes it; the backfill CLI has its own progress bar.
    """
    if not gemini.available():
        return {"ok": False, "reason": "no_key", "done": 0, "flagged": 0, "errors": 0}
    limit = limit or settings.gemini_batch_size
    q = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < MAX_ATTEMPTS,
                # The pause, enforced where the quota is actually spent. The
                # queue doors already refuse a paused shift, so this is the
                # backstop for rows that got in another way — a re-check aimed
                # at them, or a sheet row whose unit was moved to shift 2 after
                # it was queued. Never spend on a shift nobody is reviewing.
                ~paused_clause())
    )
    scope = _active_run_scope(db)
    if scope:
        if scope["date_from"]:
            q = q.filter(LeaderAiReview.date >= scope["date_from"])
        if scope["date_to"]:
            q = q.filter(LeaderAiReview.date <= scope["date_to"])
        if scope["shift"] is not None:
            q = q.filter(LeaderAiReview.shift == scope["shift"])
        if scope["manager_id"] is not None:
            q = q.filter(LeaderAiReview.manager_id == scope["manager_id"])
        if scope["leader_id"] is not None:
            q = q.filter(LeaderAiReview.leader_id == scope["leader_id"])
    # The automatic regime goes FIRST, and in the order the user asked for:
    # oldest day first, one leader finished before the next is started, tasks in
    # catalog order. It is not cosmetic — a day's report DM is sent when its
    # last task is judged, so interleaving leaders would leave every day
    # half-checked for the whole batch and send every report at the end. Walking
    # them in order means each leader's supervisor hears as that leader lands.
    #
    # The backfill's own order (newest report first) is unchanged behind it: a
    # queue nobody is waiting on is best read from the end people remember.
    auto = (
        q.filter(_auto_clause())
        .order_by(LeaderAiReview.date.asc(),
                  LeaderAiReview.manager_id.asc().nullslast(),
                  LeaderAiReview.leader_id.asc().nullslast(),
                  LeaderAiReview.task_id.asc(),
                  LeaderAiReview.id.asc())
        .limit(limit)
        .all()
    )
    rows = auto
    if len(rows) < limit:
        rest = (
            q.filter(~_auto_clause())
            .order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.asc())
            .limit(limit - len(rows))
            .all()
        )
        rows = rows + rest
    if scope and not rows:
        # The run's slice is done. Release the confinement and stop for THIS
        # pass rather than rolling straight on: it leaves `/progress` a poll in
        # which to report the run finished, instead of the operator's one-day
        # run becoming twenty thousand rows in the same breath.
        _release_run(db)
        log.info("leader-ai: run slice %s drained, backfill resumes next kick",
                 " ".join(f"{k}={v}" for k, v in scope.items() if v is not None)
                 or "*")
        return {"ok": True, "done": 0, "flagged": 0, "errors": 0,
                "quota": False, "aborted": None, "runFinished": True}
    done = flagged = errors = 0
    quota = False
    quota_msg = None
    aborted = None
    streak = 0  # consecutive API-level failures
    # Reports the automatic regime touched this pass — each is checked for
    # completion below, and the finished ones DM their supervisor and leader.
    touched: set[str] = set()
    day_of = _day_of_map(db, [r.ref for r in rows])
    for rev in rows:
        if in_auto_regime(rev.date, rev.shift):
            touched.add(report_key(rev.ref, day_of))
        try:
            outcome = review_one(db, rev)
        except gemini.GeminiQuotaError as exc:
            log.warning("leader-ai: quota reached, stopping drain (%s)", exc)
            quota = True
            # Google's own words. A 429 is per-minute, per-day AND spend-cap all
            # at once, and they want opposite things done about them: the first
            # clears itself in a minute, the last does not clear this month. A
            # label we author here has to guess which; this does not.
            quota_msg = str(exc)[:300]
            break
        done += 1
        if rev.status == "flagged":
            flagged += 1
        elif rev.status == "error":
            errors += 1
        if beat:
            beat(done, errors)
        # A retired model, a revoked key or a dead network fails EVERY row
        # identically. Without this the drain would walk the whole batch
        # burning each row's retries on a fault that has nothing to do with it.
        streak = streak + 1 if outcome == "model" else 0
        if streak >= _ERROR_STREAK_ABORT:
            aborted = rev.error
            log.error("leader-ai: %s consecutive API failures, aborting drain (%s)",
                      streak, aborted)
            break
    reported = report_finished(db, touched) if touched else 0
    # …and the safety net behind that hook: anything whose one completion
    # attempt was swallowed (Ghost Mode, a Telegram outage, a restart between
    # the verdict and the DM) is picked up here instead of being lost silently.
    try:
        reported += sweep_unreported(db)
    except Exception:
        log.exception("leader-ai: report sweep failed")
    # An UN-NARROWED run — an automatic queueing's, or an operator's over the
    # whole corpus — has no slice to run out of: it is over when the queue is.
    # Retire it HERE, in the pass that emptied the queue, not in a `/progress`
    # poll that only happens while somebody has the page open. Left un-drained,
    # the record stayed «live» by the one test `note_auto_run` applies, so the
    # next automatic queueing — a leader's day-close, a sheet Refresh — was
    # refused and its rows drained under a run they had nothing to do with: a
    # strip reading «13 of 13 · 100%» beside «1,222 left», started by a leader
    # who had closed one day. A narrowed run releases at the top of the NEXT
    # pass instead (above), for the reason given there.
    if scope is None and q.with_entities(LeaderAiReview.id).first() is None:
        _release_run(db)
    return {"ok": True, "done": done, "flagged": flagged, "errors": errors,
            "quota": quota, "quotaMsg": quota_msg, "aborted": aborted,
            "reported": reported}


def _day_of_map(db: Session, refs: list[str]) -> dict[int, int]:
    """entry_id → day_id for the bot refs in `refs`, so `report_key` can group
    them. One lookup for the whole batch; `report_key` needs it per ref."""
    ids = {int(r.split(":")[1]) for r in refs if r.startswith("bot:")}
    if not ids:
        return {}
    return {e.id: e.day_id for e in db.query(LeaderTaskEntry)
            .filter(LeaderTaskEntry.id.in_(ids)).all()}


def unfinished_reports(db: Session, keys: set[str]) -> set[str]:
    """Which of these reports still have a task the drain will come back to.

    A report is FINISHED when nothing is left queued — every task carries a
    verdict, or has burned its retries. Deliberately not "no errors": a photo
    the platform cannot fetch is never going to resolve itself, and holding a
    day's report hostage to it would mean the one failure mode nobody can fix
    from the app is also the one that silences the whole notification.
    """
    if not keys:
        return set()
    # One column, and only the rolling window — this is asked after every drain
    # pass. Loading whole ORM rows (with their JSONB flags and clocks) to read
    # one string off each was the same query five times more expensive.
    rows = (db.query(LeaderAiReview.ref)
            .filter(_auto_clause(),
                    LeaderAiReview.date >= auto_window_start(),
                    LeaderAiReview.status.in_(("pending", "error")),
                    LeaderAiReview.attempts < MAX_ATTEMPTS)
            .all())
    if not rows:
        return set()
    refs = [r[0] for r in rows]
    day_of = _day_of_map(db, refs)
    return {report_key(ref, day_of) for ref in refs} & keys


def report_finished(db: Session, keys: set[str]) -> int:
    """DM the day report for every finished report among `keys`. Returns how
    many were sent. Never raises into the drain — a Telegram outage must not
    cost the verdicts of the batch it fired on."""
    from app.services import leader_reports
    pending = unfinished_reports(db, keys)
    sent = 0
    for key in sorted(keys - pending):
        try:
            if leader_reports.maybe_send_report(db, key):
                sent += 1
        except Exception:
            log.exception("leader-ai: day report failed for %s", key)
    return sent


REPORT_SWEEP_CAP = 40


def sweep_unreported(db: Session, limit: int = REPORT_SWEEP_CAP) -> int:
    """Send the day reports that finished but never went out.

    The completion hook fires exactly once per report — on the drain pass that
    judged its last task. Anything that swallowed that one attempt loses the
    notification for good: Ghost Mode was on, Telegram was down, the worker was
    restarted between the verdict and the DM. Nobody would ever know, because
    the evidence of a report that should have been sent is its absence.

    So completion is a TRIGGER, not the only route. This sweeps for
    automatic-regime reports whose tasks are all judged and which have no
    ledger row, and sends them. Idempotent by construction — the ledger is
    written when the DM goes out, so a swept report is never swept twice.

    Capped per pass, and it only ever looks at the automatic window, so the
    worst case is one shift's backlog rather than a walk of the archive.
    """
    from app.models import LeaderDayReport
    from app.services import leader_reports

    rows = (db.query(LeaderAiReview.ref, LeaderAiReview.status,
                     LeaderAiReview.attempts)
            .filter(_auto_clause(),
                    # Rolling window: this fires on every drain tick, and the
                    # failures it exists to heal are minutes-to-hours old. A
                    # sweep bounded only by AUTO_FROM would re-read the whole
                    # regime every twenty minutes, forever.
                    LeaderAiReview.date >= auto_window_start())
            .all())
    if not rows:
        return 0
    day_of = _day_of_map(db, [r.ref for r in rows])
    open_keys: set[str] = set()
    all_keys: set[str] = set()
    for ref, status, attempts in rows:
        key = report_key(ref, day_of)
        all_keys.add(key)
        if status in ("pending", "error") and (attempts or 0) < MAX_ATTEMPTS:
            open_keys.add(key)
    done_keys = all_keys - open_keys
    if not done_keys:
        return 0
    known = {r[0] for r in db.query(LeaderDayReport.report_key)
             .filter(LeaderDayReport.report_key.in_(done_keys)).all()}
    # Newest first: if the budget ever binds, the report someone is actually
    # waiting on is today's, not a fortnight-old one nobody asked about.
    todo = sorted(done_keys - known, reverse=True)[:limit]
    sent = 0
    for key in todo:
        try:
            if leader_reports.maybe_send_report(db, key):
                sent += 1
        except Exception:
            log.exception("leader-ai: swept day report failed for %s", key)
    if sent:
        log.info("leader-ai: swept %s unsent day report(s)", sent)
    return sent


def counts(db: Session) -> dict:
    """Queue state for the admin strip."""
    out = {"pending": 0, "ok": 0, "flagged": 0, "error": 0}
    for status, n in (db.query(LeaderAiReview.status, func.count(LeaderAiReview.id))
                      .group_by(LeaderAiReview.status).all()):
        out[status] = n
    # Rows that burned their retries: they will never drain on their own, so
    # the strip has to say so rather than showing a queue that looks alive.
    out["stuck"] = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "error",
                LeaderAiReview.attempts >= MAX_ATTEMPTS)
        .count()
    )
    # What is actually LEFT to look at. `flagged` is a lifetime total and only
    # ever grows; the triage tab badges this instead, so the number goes to zero
    # when the work is done.
    out["open"] = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status == "flagged",
                LeaderAiReview.resolution.is_(None))
        .count()
    )
    for res, n in (db.query(LeaderAiReview.resolution, func.count(LeaderAiReview.id))
                   .filter(LeaderAiReview.resolution.isnot(None))
                   .group_by(LeaderAiReview.resolution).all()):
        out[res] = n
    return out


# ── triage buckets ───────────────────────────────────────────────────────────
# A flag list is not equally actionable in every combination, and the queue is
# ordered by how much a human decision is worth — not by date.
#
#   forged   a photo that is BOTH off-window and does not show the work: the
#            only combination that looks like a fabricated proof rather than a
#            mistake, so it is triaged first.
#   undone   the work is not visible, but the timestamp is fine — usually a
#            criteria argument, not a discipline one.
#   date     right work, wrong day (or no readable clock at all).
#   tech     `unreadable`, and every `error` row. NOT a person's problem: a dead
#            Drive permission or a revoked bot token. It is bucketed away from
#            the behavioural queue on purpose — technical noise mixed into a
#            discipline queue is what makes a reviewer stop trusting the queue.
BUCKETS = ("forged", "undone", "date", "tech")
_DATE_FLAGS = ("date_mismatch", "no_date")
# Both say "the picture does not back this claim" — one because it is about
# something else, one because it does not go far enough — so they bucket
# identically. Wrong subject AND wrong day is the forgery signature either way.
_CONTENT_FLAGS = ("off_topic", "not_proven")


# ── re-judging the DATE question from stored data ────────────────────────────
#
# A verdict records `image_date` — the clock the model actually read off the
# photo, verbatim — which is the expensive half of the date question. So when
# the WINDOW moves, the answer can be recomputed from the row itself: no image
# fetch, no Gemini call, no quota, no re-check run. That is what makes an
# editable window safe; without it every window change would silently leave
# every earlier verdict judged against hours nobody uses any more.
#
# Strictly bounded: it moves `date_mismatch` and nothing else. `no_date`,
# `off_topic`, `not_proven` and `unreadable` are answers to other questions and
# are never touched, a row whose stored clock will not parse is left exactly as
# it is rather than guessed at, and a row a human has already ruled on is left
# alone entirely — re-flagging under a decision would rewrite what they decided.

_MONTHS: dict[str, int] = {}
for _i, _names in enumerate((
    ("yan", "jan", "янв"), ("fev", "feb", "фев"), ("mar", "мар"),
    ("apr", "апр"), ("may", "мая", "май"), ("iyn", "jun", "июн"),
    ("iyl", "jul", "июл"), ("avg", "aug", "авг"), ("sen", "sep", "сен"),
    ("okt", "oct", "окт"), ("noy", "nov", "ноя"), ("dek", "dec", "дек"),
), start=1):
    for _n in _names:
        _MONTHS[_n] = _i

# Canonical flag order — the chip row reads strongest-claim-first, and every
# writer rebuilds through this so a recomputed verdict is byte-identical to a
# freshly written one carrying the same flags.
_FLAG_ORDER = ("unreadable", "no_date", "date_mismatch", "off_topic", "not_proven")
# The two the BACKEND owns. Stripped before the derived answer is added back, so
# a recompute can never leave both a stale and a fresh date flag on one row.
_OWNED_FLAGS = ("no_date", "date_mismatch")

# A clock is recognised ONLY with a colon. Every source the prompt allows —
# Windows tray, macOS menu bar, phone status bar, camera stamp — writes one,
# while the dot form is indistinguishable from a day.month date: "14.08" is both
# a valid 14:08 and a valid 14 August, and reading it wrong flips the verdict
# either way. No colon ⇒ undecidable ⇒ the row is left as the model judged it.
_TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):([0-5]\d)\b")
_ISO_DATE_RE = re.compile(r"\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b")
_NUM_DATE_RE = re.compile(r"\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b")
_TEXT_DATE_RE = re.compile(r"\b(\d{1,2})\s*[-\s]\s*([A-Za-zА-Яа-яЁё]{3,})", re.UNICODE)
# The mirror form — "Aug 13", "Thu, Aug 13", "авг. 13" — which an English-locale
# Android and iOS write. Only ever accepted when the word IS a month name, so a
# label like "Смена 2" can never be read as a date.
_TEXT_DATE_RE2 = re.compile(r"\b([A-Za-zА-Яа-яЁё]{3,})\.?\s+(\d{1,2})\b", re.UNICODE)


def _one_clock(part: str) -> tuple[int, int, int, int] | None:
    """(month, day, hour, minute) out of one transcribed stamp, or None."""
    month = day = None
    rest = part
    m = _ISO_DATE_RE.search(rest)
    if m:
        month, day = int(m.group(2)), int(m.group(3))
        rest = rest[:m.start()] + " " + rest[m.end():]
    else:
        # Day-first, exactly as the prompt states the local format: 04.08 is
        # 4 August, never 8 April. Scanned rather than first-matched so a
        # nonsense pair (a dot-form time read as 18.32) is skipped, not accepted.
        for m in _NUM_DATE_RE.finditer(rest):
            d, mo = int(m.group(1)), int(m.group(2))
            if 1 <= mo <= 12 and 1 <= d <= 31:
                month, day = mo, d
                rest = rest[:m.start()] + " " + rest[m.end():]
                break
    t = _TIME_RE.search(rest)
    if not t:
        return None
    hh, mi = int(t.group(1)), int(t.group(2))
    if month is None:
        # No numeric date — try the written form macOS uses ("Sesh 14 Avg").
        rest = rest[:t.start()] + " " + rest[t.end():]
        for m in _TEXT_DATE_RE.finditer(rest):
            mo = _MONTHS.get(m.group(2)[:3].lower())
            if mo and 1 <= int(m.group(1)) <= 31:
                month, day = mo, int(m.group(1))
                break
        if month is None:
            for m in _TEXT_DATE_RE2.finditer(rest):
                mo = _MONTHS.get(m.group(1)[:3].lower())
                if mo and 1 <= int(m.group(2)) <= 31:
                    month, day = mo, int(m.group(2))
                    break
    if month is None or day is None:
        return None
    return month, day, hh, mi


def _date_only(s: str) -> tuple[int, int] | None:
    """(month, day) out of a stamp that carries NO clock — "17-avgust, 2026",
    "2026-08-17", "17.08" — or None.

    The date-only mode's counterpart to `_one_clock`, which by design returns
    None without a time: there, a date with no clock is undecidable, so it must
    not be read. Here the date IS the answer, and leaving it unparsed would send
    the entry through as silence — the verdict would come back "no date visible"
    on a screenshot whose date the model transcribed perfectly.

    Same rules as `_one_clock`'s date half: day-first local format, month names
    accepted abbreviated, the year read and discarded. Deliberately called only
    where the model itself said the string is a date.
    """
    m = _ISO_DATE_RE.search(s)
    if m:
        mo, d = int(m.group(2)), int(m.group(3))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return mo, d
    for m in _NUM_DATE_RE.finditer(s):
        d, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return mo, d
    for m in _TEXT_DATE_RE.finditer(s):
        mo = _MONTHS.get(m.group(2)[:3].lower())
        if mo and 1 <= int(m.group(1)) <= 31:
            return mo, int(m.group(1))
    for m in _TEXT_DATE_RE2.finditer(s):
        mo = _MONTHS.get(m.group(1)[:3].lower())
        if mo and 1 <= int(m.group(2)) <= 31:
            return mo, int(m.group(2))
    return None


def _stamps(s: str) -> list[str]:
    """Split a transcription into one string per CLOCK.

    The comma separates PHOTOS — but it also sits inside a single phone status
    bar in most locales ("15:10 чт, 13 авг."), and splitting there leaves a time
    with no date beside a date with no time, so a perfectly readable stamp comes
    back unparseable. A clock is anchored by its time, so fragments are merged
    until every group holds exactly one.
    """
    groups: list[str] = []
    for part in (p for p in s.split(",") if p.strip()):
        if groups and not (_TIME_RE.search(groups[-1]) and _TIME_RE.search(part)):
            groups[-1] += "," + part
        else:
            groups.append(part)
    return groups


def parse_clock(raw: str | None) -> list[tuple[int, int, int, int]] | None:
    """Every (month, day, hour, minute) the model transcribed, or None if any
    part of the string cannot be read that completely.

    `image_date` is deliberately verbatim and holds whatever the screen showed —
    "04.08.2026 14:22", "Sesh 4 Avg 14:22", "2026-08-04 14:22", or a bare
    "14:22" — comma-separated when a report carried several photos. None means
    "do not touch this row": a time with no day (which the model is told to flag
    on its own) and an unreadable transcription are both undecidable here, and
    the honest move is to leave the verdict the model gave.

    The YEAR is read but discarded, exactly as the prompt instructs: macOS never
    prints one, so demanding it would re-flag every macOS screenshot.
    """
    s = (raw or "").strip()
    if not s:
        return None
    out: list[tuple[int, int, int, int]] = []
    for part in _stamps(s):
        one = _one_clock(part)
        if one is None:
            return None
        out.append(one)
    return out or None


def clock_in_window(clocks: list[dict] | None,
                    date: str, win: tuple[str, str],
                    *, times: bool = True, plus: int = 0) -> bool | None:
    """Are ALL of a report's photo clocks inside the window? None = undecidable
    (no clock was read at all — that is `no_date`, a different answer).

    Compares month + day only, never the year: these sources often do not print
    one (macOS never does), so demanding it would flag every macOS screenshot.
    Known, accepted loophole — a screenshot from exactly one year earlier passes.

    A clock missing its day or month is NOT inside the window: the hour may look
    right but which day it belongs to cannot be proven, and the user's rule is
    that an unprovable day is flagged (2026-08-14). One bad photo fails the
    report, which is how a multi-photo answer is read everywhere else too.

    `times=False` — the task's chain says the DAY is enough (`resolve_time_check`)
    — answers a deliberately different question, in three ways:

    * the hour is not read at all, so `win` only still decides whether the day
      after also counts (an overnight shift's morning half). Nothing else about
      the window is applied — it is not a rule in this mode;
    * ANY entry carrying the right day passes, where the strict form needs EVERY
      entry to. In this mode the dates come off the SCREEN, and one screen
      legitimately shows many: a register filtered to today still lists rows
      from last week. The user's rule is exactly this — "if at least one date in
      the screenshot is the submitted day, the task is done" (2026-08-17);
    * an entry with no day at all is not a failure, it is silence — it just
      cannot vote. All of them silent ⇒ None, and `date_flags` turns THAT into
      no flag rather than `no_date`.

    `plus` (the task's date tolerance, `resolve_date_plus`) widens WHICH day
    counts and nothing else: the report day plus that many days after it, each
    judged by the very same hour rule. 0 — the default everywhere until an admin
    says otherwise — leaves the two sets exactly the single days this compared
    before it existed, which is what makes the field free to add.
    """
    if not clocks:
        return None
    try:
        day = datetime.strptime(str(date)[:10], "%Y-%m-%d")
    except ValueError:
        return None
    lo, hi = win
    span = max(0, int(plus or 0))
    # The days a proof may carry, and — for an overnight window — the mornings
    # that belong to them. Sets, not two values: with no tolerance they hold one
    # day each and this is the comparison it always was.
    d0s = {((day + timedelta(days=k)).month, (day + timedelta(days=k)).day)
           for k in range(span + 1)}
    d1s = {((day + timedelta(days=k + 1)).month, (day + timedelta(days=k + 1)).day)
           for k in range(span + 1)}
    over = overnight(win)
    if not times:
        days = [(int(c.get("month") or 0), int(c.get("day") or 0)) for c in clocks]
        seen = [d for d in days if 0 not in d]
        if not seen:
            return None          # nothing dated anything — nobody voted
        return any(d in d0s or (over and d in d1s) for d in seen)
    for c in clocks:
        got = (int(c.get("month") or 0), int(c.get("day") or 0))
        clock = hhmm(c.get("time"))
        if not clock or got == (0, 0) or 0 in got:
            return False          # day unconfirmed — cannot be proven in-window
        ok = (((got in d0s and clock >= lo) or (got in d1s and clock <= hi))
              if over else (got in d0s and lo <= clock <= hi))
        if not ok:
            return False
    return True


def date_flags(clocks: list[dict] | None, date: str,
               win: tuple[str, str], *, check: bool = True,
               times: bool = True, plus: int = 0) -> list[str]:
    """THE date verdict. Derived, never stored — so it is always the answer for
    the window in force RIGHT NOW, and an admin who edits a window has every
    affected report corrected before the page finishes loading.

    This is the whole point of making the model a transcriber: a stored verdict
    was a frozen opinion that only a paid AI re-check could revise.

    `check=False` — the task's chain says its proof does not have to prove WHEN
    it was taken (`resolve_date_check`) — returns NO flags rather than a passing
    one: this function owns both `no_date` and `date_mismatch` (`_OWNED_FLAGS`),
    so an empty answer is what clears an earlier verdict's date flag when the
    exemption is switched on, exactly as a widened window does. The clocks are
    still stored and still shown; only the judgement is withheld, so switching
    the exemption back off re-decides every affected row with no AI call.

    `times=False` — the chain says the DAY is enough — keeps `date_mismatch` and
    drops `no_date` entirely. That asymmetry is the whole point of the mode and
    is deliberate on both halves:

    * a proof whose visible date is the WRONG day is still a rejection. That is
      the failure this question exists for — yesterday's screenshot re-filed
      today — and it is provable from the screen without any clock;
    * a proof with no visible date is NOT a rejection. Here the day is meant to
      come off the screen, and "the screen does not show one" is a fact about the
      screen, not misconduct. Flagging it is exactly the complaint that created
      this mode: a Xavotirlar screenshot showing «17-avgust, 2026» in the app but
      no OS clock was answered `no_date`, i.e. rejected, on a task whose own
      written rule said the time is not required (user, 2026-08-17).

    Which also makes the mode switch FREE in both directions on already-judged
    rows, like a window edit: turning it on can only clear flags from stored
    clocks, and turning it back off re-derives the strict answer from the same
    data. No Gemini call, no quota, no re-check run.

    `plus` — the task's date tolerance — is the fourth input and the only one
    that widens rather than narrows: the day may also be up to that many days
    after the report's, for a proof dated by what it is ABOUT (a schedule filed
    the day before it applies). It composes with both modes above, because it
    changes WHICH day counts and never whether the question is asked.

    All three keywords default to the old behaviour — checked, timed, no
    tolerance — deliberately: the three callers (`review_one`, `sync_date_flags`,
    `date_prose`) all pass them explicitly, and a fourth one added without them
    should keep judging dates and clocks rather than quietly relax every task on
    the platform.
    """
    if not check:
        return []
    ok = clock_in_window(clocks, date, win, times=times, plus=plus)
    if ok is None:
        return ["no_date"] if times else []
    return [] if ok else ["date_mismatch"]


def _camera_clocks(db: Session, rev: LeaderAiReview) -> list[dict] | None:
    """Server-recorded capture times for a bot entry shot in the mini-app
    camera — None for everything else, which is every sheet row, every
    screenshot task and everything filed before the camera existed.

    Imported inside the call because services/leader_proof imports this module
    for the window comparison; the dependency only ever runs one way at import
    time.
    """
    if rev.source != "bot":
        return None
    try:
        from app.services.leader_proof import server_clocks
        return server_clocks(db, int(rev.ref.split(":")[1]))
    except Exception:
        return None


def clocks_text(clocks: list[dict] | None) -> str:
    """The clocks as the admin should read them — verbatim as they appeared on
    screen. What `image_date` used to hold, rebuilt from the structured form so
    the two can never disagree."""
    return ", ".join(
        (c.get("raw") or "").strip() for c in (clocks or []) if (c.get("raw") or "").strip()
    )


def _clean_clocks(raw) -> list[dict]:
    """Normalise what the model returned. A generative model fills a schema
    approximately: it will send 32 for a day, "14:22:05" or "2:22 PM" for a
    time, and occasionally a whole entry of nothing. Everything is squeezed into
    the three shapes `clock_in_window` understands — a complete clock; a date
    with an empty time (all a date-only task's proof carries, and undecidable in
    strict mode, which is exactly how each reads it); or an entry with day/month
    0 meaning "seen, but the day cannot be proven" — because a silently malformed
    entry would otherwise read as an in-window pass.
    """
    out: list[dict] = []
    for c in (raw or []):
        if not isinstance(c, dict):
            continue
        try:
            day, month = int(c.get("day") or 0), int(c.get("month") or 0)
        except (TypeError, ValueError):
            day = month = 0
        if not (1 <= month <= 12 and 1 <= day <= 31):
            day = month = 0
        t = hhmm(c.get("time")) or ""
        if not t:
            # A time it could not normalise may still be readable in `raw`;
            # 12-hour and with-seconds forms are the common ones.
            got = parse_clock(str(c.get("raw") or ""))
            if got:
                m2, d2, hh, mi = got[0]
                t = f"{hh:02d}:{mi:02d}"
                if not month:
                    month, day = m2, d2
            elif not month:
                # No clock anywhere in it — but a DATE may still be in there, and
                # on a date-only task that is the whole answer. `parse_clock`
                # cannot see it: it is anchored on a time by design.
                if d := _date_only(str(c.get("raw") or "")):
                    month, day = d
        entry = {"raw": str(c.get("raw") or "").strip()[:120],
                 "month": month, "day": day, "time": t}
        if src := str(c.get("source") or "").strip()[:16]:
            entry["source"] = src
        if entry["raw"] or t:
            out.append(entry)
    return out


def clocks_from_text(raw: str | None) -> list[dict]:
    """Legacy `image_date` free text → the structured form, for rows judged
    before the model started returning it.

    A clock we cannot read completely becomes an entry with day/month 0, i.e.
    "day unconfirmed" — the user's ruling for exactly this case. Deliberately
    NOT an empty list: that means "no clock at all", and a row whose model wrote
    «Сегодня 14:22» plainly had one.
    """
    s = (raw or "").strip()
    if not s:
        return []
    parsed = parse_clock(s)
    if parsed:
        return [{"raw": r.strip(), "month": m, "day": d, "time": f"{hh:02d}:{mi:02d}"}
                for r, (m, d, hh, mi) in zip(_stamps(s), parsed)]
    return [{"raw": s, "month": 0, "day": 0, "time": ""}]


# The date sentence, written HERE rather than by the model (user, 2026-08-14).
# The model no longer knows what the window is, so it cannot describe the
# verdict — and prose it wrote once would go stale the moment a window changed,
# which is precisely the staleness this whole change removes. One template per
# language, filled from the same three values the verdict is computed from.
_DATE_PROSE = {
    "no_date": {
        "uz": "Rasmda olingan vaqtini ko'rsatuvchi soat topilmadi, shuning uchun qachon olingani tasdiqlanmadi.",
        "uz_cyrl": "Расмда олинган вақтини кўрсатувчи соат топилмади, шунинг учун қачон олингани тасдиқланмади.",
        "ru": "На фото не найдены часы, показывающие время съёмки, поэтому подтвердить, когда оно снято, невозможно.",
        "en": "No clock showing when the photo was taken was found, so its time could not be confirmed.",
    },
    "unconfirmed": {
        "uz": "Rasmdagi soat ({seen}) o'qildi, lekin kun va oy ko'rinmagani uchun qaysi kunga tegishli ekanini tasdiqlab bo'lmadi. Ruxsat etilgan vaqt: {lo} — {hi}.",
        "uz_cyrl": "Расмдаги соат ({seen}) ўқилди, лекин кун ва ой кўринмагани учун қайси кунга тегишли эканини тасдиқлаб бўлмади. Рухсат этилган вақт: {lo} — {hi}.",
        "ru": "Время на фото ({seen}) прочитано, но день и месяц не видны, поэтому нельзя подтвердить, к какому дню оно относится. Допустимое время: {lo} — {hi}.",
        "en": "The clock on the photo ({seen}) was read, but the day and month are not visible, so which day it belongs to could not be confirmed. Allowed: {lo} — {hi}.",
    },
    "date_mismatch": {
        "uz": "Rasm {seen} da olingan — ruxsat etilgan {lo} — {hi} oralig'idan tashqarida.",
        "uz_cyrl": "Расм {seen} да олинган — рухсат этилган {lo} — {hi} оралиғидан ташқарида.",
        "ru": "Фото снято {seen} — вне допустимого интервала {lo} — {hi}.",
        "en": "The photo was taken {seen} — outside the allowed {lo} — {hi}.",
    },
    "ok": {
        "uz": "Rasm {seen} da olingan — ruxsat etilgan {lo} — {hi} oralig'ida.",
        "uz_cyrl": "Расм {seen} да олинган — рухсат этилган {lo} — {hi} оралиғида.",
        "ru": "Фото снято {seen} — в пределах допустимого интервала {lo} — {hi}.",
        "en": "The photo was taken {seen} — within the allowed {lo} — {hi}.",
    },
    # Strict mode, and the screen showed a DATE but no clock — which is what a
    # dashboard screenshot looks like once a date-only task is switched back to
    # strict. Without its own sentence it fell into `date_mismatch`, i.e. "the
    # photo was taken {a date with no time} — outside the allowed window", which
    # states a time comparison that never happened.
    "no_time": {
        "uz": "Rasmda sana ({seen}) ko'rinadi, lekin qachon olinganini ko'rsatuvchi soat topilmadi. Bu vazifada ruxsat etilgan vaqt: {lo} — {hi}.",
        "uz_cyrl": "Расмда сана ({seen}) кўринади, лекин қачон олинганини кўрсатувчи соат топилмади. Бу вазифада рухсат этилган вақт: {lo} — {hi}.",
        "ru": "На фото видна дата ({seen}), но часов, показывающих время съёмки, нет. Допустимое время для этой задачи: {lo} — {hi}.",
        "en": "The photo shows a date ({seen}) but no clock telling when it was taken. Allowed for this task: {lo} — {hi}.",
    },
    # ── date-only mode: the day is judged, the hour is not ───────────────────
    # Each of the three says WHICH question was asked, because the same row in
    # strict mode would have been answered differently — an admin comparing two
    # cards must be able to see that, not infer it from a missing window line.
    "day_ok": {
        "uz": "Rasmdagi sana ({seen}) hisobot kuniga ({day}) to'g'ri keladi. Bu vazifada olingan vaqt tekshirilmaydi.",
        "uz_cyrl": "Расмдаги сана ({seen}) ҳисобот кунига ({day}) тўғри келади. Бу вазифада олинган вақт текширилмайди.",
        "ru": "Дата на фото ({seen}) совпадает с днём отчёта ({day}). Время съёмки в этой задаче не проверяется.",
        "en": "The date on the photo ({seen}) matches the report day ({day}). The time is not checked for this task.",
    },
    "day_bad": {
        "uz": "Rasmdagi sana ({seen}) hisobot kuniga ({day}) to'g'ri kelmaydi.",
        "uz_cyrl": "Расмдаги сана ({seen}) ҳисобот кунига ({day}) тўғри келмайди.",
        "ru": "Дата на фото ({seen}) не совпадает с днём отчёта ({day}).",
        "en": "The date on the photo ({seen}) does not match the report day ({day}).",
    },
    "day_none": {
        "uz": "Rasmda sana ko'rinmadi. Bu vazifada sana majburiy emas, shuning uchun bunga belgi qo'yilmadi.",
        "uz_cyrl": "Расмда сана кўринмади. Бу вазифада сана мажбурий эмас, шунинг учун бунга белги қўйилмади.",
        "ru": "На фото не видно даты. В этой задаче дата не обязательна, поэтому метка не ставится.",
        "en": "No date is visible on the photo. It is not mandatory for this task, so nothing was flagged for it.",
    },
    # The exemption says so IN WORDS. A card that simply omitted the date line
    # would read as "not checked yet"; one that printed the "ok" sentence would
    # claim a window was verified when nothing compared anything to it. What was
    # READ is still stated, because it is still on the row and an admin looking
    # at a suspicious proof should see it.
    "not_required": {
        "uz": "Bu vazifa uchun sana tekshirilmaydi. Rasmdan o'qilgani: {seen}.",
        "uz_cyrl": "Бу вазифа учун сана текширилмайди. Расмдан ўқилгани: {seen}.",
        "ru": "Для этой задачи дата не проверяется. Прочитано на фото: {seen}.",
        "en": "The date is not checked for this task. Read off the photo: {seen}.",
    },
}


def date_prose(clocks: list[dict] | None, date: str,
               win: tuple[str, str], *, check: bool = True,
               times: bool = True, plus: int = 0) -> dict[str, str]:
    """The date verdict as a sentence per language. Derived like the flag
    itself, so the two can never disagree — which is why the tolerance is here
    too: a sentence naming one day for a task that accepts three contradicts the
    very flag it exists to explain. `{day}` is therefore the day LIST
    (`date_days`), which with no tolerance is the single day it always was."""
    if not check:
        key = "not_required"
    elif not times:
        # Date-only: three outcomes, and "no flag" covers two of them — the day
        # matched, or nothing on the screen was dated. They must not share a
        # sentence: one says the proof was verified, the other says the question
        # went unanswered and was let go.
        got = clock_in_window(clocks, date, win, times=False, plus=plus)
        key = "day_none" if got is None else ("day_ok" if got else "day_bad")
    elif not date_flags(clocks, date, win, check=check, times=times, plus=plus):
        key = "ok"
    elif clock_in_window(clocks, date, win, plus=plus) is None:
        key = "no_date"
    elif any(not (c.get("day") and c.get("month")) for c in (clocks or [])):
        # "Read a clock but not a day" reads very differently from "wrong day",
        # and one sentence for both is what made a flagged card unactionable.
        key = "unconfirmed"
    elif any(not hhmm(c.get("time")) for c in (clocks or [])):
        key = "no_time"          # dated, but nothing says when it was taken
    else:
        key = "date_mismatch"
    lo, hi = date_window(date, None, win, plus)
    seen = clocks_text(clocks) or "—"
    return {l: t.format(seen=seen, lo=lo, hi=hi,
                        day=", ".join(date_days(date, plus)))
            for l, t in _DATE_PROSE[key].items()}


def sync_date_flags(db: Session, task_ids: list[int] | None = None) -> int:
    """Re-derive every written verdict's DATE flags from its stored clocks and
    the window in force now. Returns how many rows changed; commits once.

    The date verdict has exactly SIX inputs — the clocks (frozen at review
    time), the report's day, the task's window, whether the task's chain asks the
    date question at all, whether it asks about the CLOCK or only the day, and
    the tolerance widening WHICH day counts — and this runs whenever any of them
    can have moved: at boot, after a window edit, after a date-check, time-check
    or tolerance edit, after a sheet Refresh or a discover (both re-stamp
    `date`), and when the AI overview is opened. There is no seventh input, so
    there is no trigger left to forget.

    It is kept a WRITE rather than a read-time overlay because `status`/`flags`
    are what ~20 queue, count, re-check and progress queries filter on in SQL;
    deriving them per read would move all of that into memory for a number that
    changes a few times a year. The pass itself is a scan plus three small
    config tables and writes only rows whose answer actually moved — normally
    none.

    Rows a human has ruled on are skipped: re-flagging under a decision would
    rewrite what they decided and pollute the calibration stats.
    """
    q = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.reviewed_at.isnot(None),
                 LeaderAiReview.resolution.is_(None)))
    if task_ids:
        q = q.filter(LeaderAiReview.task_id.in_(task_ids))
    rows = q.all()
    if not rows:
        return 0

    # Preloaded like routers/leader_ai._hydrate: the per-row chain walk is three
    # queries, which over a full corpus is thousands of round trips at boot.
    defs = {t.id: t for t in db.query(LeaderTaskDef).all()}
    mgr_ids = {r.manager_id for r in rows if r.manager_id}
    lead_ids = {r.leader_id for r in rows if r.leader_id}
    sup_cfg = {(s.manager_id, s.task_id): s for s in db.query(LeaderTaskSetting)
               .filter(LeaderTaskSetting.manager_id.in_(mgr_ids)).all()} if mgr_ids else {}
    own_cfg = {(o.leader_id, o.task_id): o for o in db.query(LeaderTaskLeaderSetting)
               .filter(LeaderTaskLeaderSetting.leader_id.in_(lead_ids)).all()} if lead_ids else {}

    changed = 0
    for rev in rows:
        levels = (own_cfg.get((rev.leader_id, rev.task_id)),
                  sup_cfg.get((rev.manager_id, rev.task_id)),
                  defs.get(rev.task_id))
        win = resolve_window(rev.shift, *levels)
        kept = [f for f in (rev.flags or ()) if f not in _OWNED_FLAGS]
        want = set(kept) | set(date_flags(
            rev.clocks, rev.date, win, check=resolve_date_check(*levels),
            times=resolve_time_check(*levels),
            plus=resolve_date_plus(*levels)))
        flags = [f for f in _FLAG_ORDER if f in want]
        if flags == list(rev.flags or ()):
            continue
        rev.flags = flags
        rev.status = "flagged" if flags else "ok"
        changed += 1
    if changed:
        db.commit()
    return changed


def bucket_of(flags: list[str] | None) -> str:
    f = set(flags or ())
    if "unreadable" in f:
        return "tech"
    bad_date = bool(f & set(_DATE_FLAGS))
    if f & set(_CONTENT_FLAGS):
        return "forged" if bad_date else "undone"
    return "date" if bad_date else "undone"


# Lower sorts first. Within a bucket the newest report wins — an admin acts on
# yesterday's fake before last month's. DERIVED from BUCKETS rather than written
# out again: the tuple above is already declared in severity order, and a second
# hand-kept table is one edit away from disagreeing with it.
_BUCKET_RANK = {b: i for i, b in enumerate(BUCKETS)}


def bucket_rank(bucket: str) -> int:
    """Severity of a bucket NAME — for callers that have already bucketed."""
    return _BUCKET_RANK.get(bucket, 9)


def severity(flags: list[str] | None) -> int:
    return bucket_rank(bucket_of(flags))


def uid_map(db: Session, revs: list) -> dict[str, str]:
    """ref → the uid /api/leaders prints for that verdict's report.

    THE resolver. The register badge, the triage queue and the score overlay all
    have to agree about which report a verdict belongs to; two copies of this
    would drift the first time a ref form changed, and the symptom would be a
    badge on the wrong row rather than an error.

    A `sheet:` ref already carries the submission id, which IS the uid. A
    `sheetd:` ref predates submission ids and has to be resolved back to a live
    row, because the uid for those is the (recycled) row id.
    """
    out: dict[str, str] = {}

    bot_entry_ids = {int(r.ref.split(":")[1]) for r in revs if r.ref.startswith("bot:")}
    if bot_entry_ids:
        by_id = {e.id: e for e in db.query(LeaderTaskEntry)
                 .filter(LeaderTaskEntry.id.in_(bot_entry_ids)).all()}
        for r in revs:
            if r.ref.startswith("bot:"):
                e = by_id.get(int(r.ref.split(":")[1]))
                if e is not None:
                    out[r.ref] = f"bot-{e.day_id}"

    dated = [r.ref for r in revs if r.ref.startswith("sheetd:")]
    for r in revs:
        if r.ref.startswith("sheet:"):
            out[r.ref] = r.ref.split(":", 2)[1]
    if dated:
        dates = {ref.split(":")[1] for ref in dated}
        rows = db.query(LeaderChecklist).filter(LeaderChecklist.date.in_(dates)).all()
        by_key = {(row.date, (row.leader or "").strip().lower()[:60]): row for row in rows}
        for ref in dated:
            parts = ref.split(":")
            row = by_key.get((parts[1], parts[2] if len(parts) > 3 else ""))
            if row is not None:
                out[ref] = row_uid(row)
    return out


# ── the automatic regime ─────────────────────────────────────────────────────
# From 13 Aug 2026, shift 1 does not wait for a human to agree with the AI: a
# flagged proof marks its task not-done immediately, the whole day is checked
# without anyone pressing anything, and the unit's brigadir and the leader are
# told the verified score. Everything outside this window — every earlier day,
# and shift 2 for good — keeps the original regime, where a flag is a note and
# only a human `rejected` moves a number.
#
# ONE predicate, because five surfaces have to agree about which reports it
# covers (the score overlay, discovery, the drain's ordering, the report DM and
# the day-report page). A second spelling of "is this automatic" would show a
# leader a red badge on a day their score never moved, or the reverse.
AUTO_FROM = "2026-08-13"        # first REPORTED day judged automatically
AUTO_SHIFTS = (1,)              # shift 2 stays manual (user, 2026-08-14) — and
                                # since the same day is not reviewed at all,
                                # see REVIEW_PAUSED_SHIFTS below

# How far back the two RECURRING passes look — the Refresh's discovery and the
# drain's report sweep. `AUTO_FROM` alone is a floor, not a window: it never
# moves, so a pass bounded only by it re-reads every automatic day ever filed,
# and both of these run on a timer or on a button people press all day. A month
# in, that is a growing full scan every twenty minutes for work that is always
# a day or two old.
#
# Catching up on something older than this is a deliberate errand, not a
# background one — «Tekshirish» with scope «unchecked» does it over a stated
# count. Generous enough (a fortnight) that a week-long outage still heals
# itself.
AUTO_LOOKBACK_DAYS = 14


def auto_window_start() -> str:
    """The oldest report date the recurring passes will touch. Never earlier
    than AUTO_FROM, so the regime's own floor still holds."""
    back = (datetime.now(timezone.utc) - timedelta(days=AUTO_LOOKBACK_DAYS)).date()
    return max(AUTO_FROM, back.isoformat())


def in_auto_regime(date: str | None, shift: int | None) -> bool:
    """Is this report judged automatically? Narrow on purpose: an unmatched
    unit carries a null shift, and a name-matching miss must never be what
    costs a leader their score."""
    return bool(date) and shift in AUTO_SHIFTS and str(date)[:10] >= AUTO_FROM


def _auto_clause():
    """The same predicate in SQL, for the queries that cannot walk rows.

    **`coalesce` is load-bearing, not tidiness.** `shift` is nullable — an
    unmatched supervisor name leaves it NULL — and `shift IN (1)` on a NULL
    yields NULL, not FALSE. The drain splits its queue into `_auto_clause()`
    and `~_auto_clause()`, and under three-valued logic a NULL-shift row dated
    on or after AUTO_FROM satisfies NEITHER: `NOT(TRUE AND NULL)` is NULL, so
    it drops out of both. Such a row would sit `pending` forever — no verdict,
    no error, no retry, and invisible to every branch that looks for it.
    Folding NULL to a shift that is never automatic makes the complement total.
    """
    return and_(LeaderAiReview.date >= AUTO_FROM,
                func.coalesce(LeaderAiReview.shift, -1).in_(AUTO_SHIFTS))


# ── the shift-2 pause ────────────────────────────────────────────────────────
# Shift 2 is not reviewed by the machine AT ALL: nothing queues it, the drain
# never picks it up, no Gemini quota is spent on it (user, 2026-08-14: "stop any
# kind of auto ai review for the 2nd shift for now").
#
# This is NOT a second spelling of `AUTO_SHIFTS`, and the pair is exactly why it
# needed its own name: `AUTO_SHIFTS` says whose flags COST points, this says
# whose photos are LOOKED AT. Shift 2 was already outside the automatic regime —
# a flag on it was a note nobody's score felt — but closing a shift-2 day in the
# bot still queued every proof that day carried, and the drain still paid for a
# verdict on each. "Not consequential" was never "not running", and it is the
# second one the user asked to stop.
#
# ONE door stays open on purpose: the admin's per-task «Tekshirish» button
# (`review_now`), which is a person pointing at one photo and waiting for the
# answer. It reviews that row directly and never goes through the queue, so it
# is not the machine working on its own — it is the only way to get a shift-2
# verdict while the pause holds.
#
# Un-pausing is this tuple going back to `()`. The pause destroys nothing:
# verdicts already written stand, and the queue rows it drops were never judged,
# so `discover()` re-finds every one of them.
REVIEW_PAUSED_SHIFTS = (2,)


def review_paused(shift: int | None) -> bool:
    """Is this shift's proof review paused?

    A NULL shift — an unmatched supervisor name — is NOT paused. It belongs to
    no shift at all, and the pause must never become a second way for a
    name-matching miss to make somebody's work quietly disappear.
    """
    return shift in REVIEW_PAUSED_SHIFTS


def paused_clause():
    """The same predicate in SQL, for the queries that cannot walk rows. Public
    — unlike `_auto_clause()` — because the endpoints that COUNT drainable work
    live in routers/leader_ai.py, and a queue figure the drain will never work
    through is the one number a progress bar must not print. Callers spell the
    other polarity `~paused_clause()`.

    `coalesce` for the same reason `_auto_clause()` needs it: `shift IN (2)` is
    NULL for a NULL shift, so `~paused_clause()` would drop every unmatched row
    out of the drain's queue and strand it `pending` forever — no verdict, no
    error, no retry. Folding NULL to a shift nobody paused keeps the complement
    total.
    """
    if not REVIEW_PAUSED_SHIFTS:
        return false()
    return func.coalesce(LeaderAiReview.shift, -1).in_(REVIEW_PAUSED_SHIFTS)


def rejected_by_uid(db: Session, dates: set[str] | None = None) -> dict[str, set[int]]:
    """report uid → the task ids whose proof does not count.

    Two ways a task lands here, and they are deliberately different questions:

      * a human ruled `rejected` — in EVERY regime, on any day, unchanged;
      * the report is in the automatic regime and its verdict is flagged, with
        no human `approved` to lift it. Every flag counts, `unreadable`
        included (the user's ruling): a proof nobody can read is not a proof.

    A technical `error` row is NOT a flag and never appears here. A failed
    Drive fetch or a dead bot token is the platform's fault, and a rule that
    let an outage mass-fail a shift would be indefensible the first time it
    fired.

    `requeried` does not lift an automatic rejection either: it means "re-file
    this", not "the machine was wrong", so the day stands scored until someone
    approves the replacement. Only `approved` restores the weight.

    The leaders sheet is a read-only source we cannot write back to, and a bot
    day is closed and immutable, so a rejection can never be an edit — it is an
    overlay applied at read time by routers/leaders.py. That also means a
    rejection is reversible by re-ruling the verdict, which is the behaviour you
    want from a judgement call.
    """
    q = (db.query(LeaderAiReview)
         .filter(or_(
             LeaderAiReview.resolution == "rejected",
             and_(_auto_clause(),
                  LeaderAiReview.status == "flagged",
                  or_(LeaderAiReview.resolution.is_(None),
                      LeaderAiReview.resolution != "approved")),
         )))
    if dates:
        q = q.filter(LeaderAiReview.date.in_(dates))
    revs = q.all()
    if not revs:
        return {}
    uids = uid_map(db, revs)
    out: dict[str, set[int]] = {}
    for rev in revs:
        uid = uids.get(rev.ref)
        if uid:
            out.setdefault(uid, set()).add(rev.task_id)
    return out


def auto_discover(db: Session) -> int:
    """Queue every never-seen report the automatic regime covers. Returns how
    many task-verdicts were queued.

    This is the second door into `discover()`'s territory, and it is bounded so
    it can never become the bulk auto-trigger the user banned three times: the
    regime predicate pins it to shift 1 from one fixed date, so the corpus it
    can reach is this week's reports, not the archive. It queues; the scheduled
    drain spends.

    Sheet layer only, and that is not an oversight: a bot day is queued for
    review by the close that ends it (`queue_report`), so it never needs
    discovering. This pass exists for the FORM, whose rows arrive by sync with
    nothing to trigger on.
    """
    known = _existing_refs(db)
    floor = floor_date(db)
    # The rolling window, not the fixed floor: this runs on every Refresh press,
    # and reading every automatic day ever filed to find yesterday's rows would
    # get slower every day it works correctly. See AUTO_LOOKBACK_DAYS.
    start = auto_window_start()
    if floor:
        start = max(start, floor)

    rows = (db.query(LeaderChecklist)
            .filter(LeaderChecklist.date >= start)
            .order_by(LeaderChecklist.date.asc(), LeaderChecklist.id.asc())
            .all())
    if not rows:
        return 0

    managers = db.query(Manager).all()
    sup_match = supervisor_match(
        managers, {relabel_supervisor(r.supervisor) for r in rows if r.supervisor})
    profiles = db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
    lead_match = leader_match(profiles, {
        (r.leader, (sup_match.get(relabel_supervisor(r.supervisor)) or {}).get("id"))
        for r in rows if r.leader
    })

    added = 0
    for row in rows:
        info = sup_match.get(relabel_supervisor(row.supervisor)) or {}
        if not in_auto_regime(row.date, info.get("shift")):
            continue
        who = lead_match.get((row.leader, info.get("id"))) or {}
        for tk in (row.tasks or []):
            if added >= DISCOVER_CAP:
                break
            if not tk.get("done") or not _sheet_photos(tk):
                continue
            tid = int(tk.get("id") or 0)
            ref = sheet_ref(row, tid)
            if ref in known:
                continue
            db.add(LeaderAiReview(
                ref=ref, source="sheet", date=row.date, task_id=tid,
                leader_id=who.get("id"), manager_id=info.get("id"),
                shift=info.get("shift"), status="pending", flags=[],
            ))
            known.add(ref)
            added += 1
    if added:
        db.commit()
        log.info("leader-ai: auto-discovery queued %s task(s) from %s", added, start)
    return added


def stats_by_uid(db: Session, dates: set[str] | None = None) -> dict[str, dict[str, int]]:
    """report uid → what the reviewer has actually done to THAT report.

    The register header used to print platform-wide totals beside a filtered
    table: «101 flagged · 888 queued» never moved when the filter did, and read
    as a description of rows it had nothing to do with. Per-report counts let
    the client sum exactly the rows on screen, which is the only figure a
    reader can check against what they can see.

    Aggregated in SQL and scoped to the dates the register is shipping, so this
    map can never outgrow the row set it annotates. The pending queue is a
    backfill of everything ever filed — it must never be walked row by row for
    a header.
    """
    if dates is not None and not dates:
        return {}
    q = (db.query(LeaderAiReview.ref.label("ref"),
                  LeaderAiReview.status.label("status"),
                  LeaderAiReview.resolution.label("resolution"),
                  func.count(LeaderAiReview.id).label("n"))
         .group_by(LeaderAiReview.ref, LeaderAiReview.status,
                   LeaderAiReview.resolution))
    if dates is not None:
        q = q.filter(LeaderAiReview.date.in_(dates))
    rows = q.all()
    if not rows:
        return {}

    uids = uid_map(db, rows)                # Row carries `.ref`, like a verdict
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        uid = uids.get(r.ref)
        if not uid:
            continue
        s = out.setdefault(uid, {"checked": 0, "flagged": 0, "open": 0,
                                 "pending": 0, "error": 0, "disputed": 0})
        if r.status in ("ok", "flagged"):
            # A verdict exists either way — "checked" is the machine's work,
            # not its opinion, so a clean pass counts exactly like a flag.
            s["checked"] += r.n
        if r.status == "flagged":
            s["flagged"] += r.n
            # Still owed a human decision. `flagged` only grows; this is the
            # one that can reach zero, so it is what the header calls a to-do.
            if r.resolution is None:
                s["open"] += r.n
        elif r.status == "pending":
            s["pending"] += r.n
        elif r.status == "error":
            s["error"] += r.n

    # Live objections, so the register can say a rejection is being argued
    # rather than settled. Without this the «Norozilik» filter would be an
    # option that can never match anything — worse than not offering it.
    dq = (db.query(LeaderAiDispute.ref, func.count(LeaderAiDispute.id))
          .filter(LeaderAiDispute.status == "pending"))
    if dates is not None:
        dq = dq.filter(LeaderAiDispute.date.in_(dates))
    drows = dq.group_by(LeaderAiDispute.ref).all()
    if drows:
        duids = uid_map(db, [_RefOnly(ref) for ref, _ in drows])
        for ref, n in drows:
            uid = duids.get(ref)
            if uid and uid in out:
                out[uid]["disputed"] += n
    return out


class _RefOnly:
    """A ref in the shape `uid_map` reads (`.ref`) — it resolves verdicts and
    dispute rows through one function so both can never disagree about which
    report a ref belongs to."""
    __slots__ = ("ref",)

    def __init__(self, ref: str):
        self.ref = ref


def task_weights(db: Session) -> dict[int, int]:
    """task_id → the catalog weight, for the rejection deduction.

    Deliberately the GLOBAL catalog, not the per-supervisor override chain: the
    deduction is a task's share of its own report (weight ÷ the weights actually
    on that report), and both collection layers seed from this one set. Reading
    the override chain here would mean resolving a supervisor per row for a
    number that moves a percentage by a point or two.
    """
    return {td.id: (td.default_weight or 0) for td in db.query(LeaderTaskDef).all()}


# ── background kick ──────────────────────────────────────────────────────────

def _try_db_lock(db: Session) -> bool:
    """Claim the platform-wide drain slot via a Postgres advisory lock.

    The in-process lock below is not enough on its own: Passenger runs several
    worker processes, and a Refresh landing on one while a bot day-close lands
    on another would have both drain the SAME pending rows — paying twice for
    one verdict out of a quota that is the whole constraint here. The advisory
    lock is held on this session's connection and released in `_work`'s finally;
    if the process dies outright the connection dies with it and Postgres drops
    the lock, so a crash can never strand the queue.
    """
    try:
        return bool(db.execute(
            text("SELECT pg_try_advisory_lock(:k)"), {"k": _DRAIN_LOCK_KEY}
        ).scalar())
    except Exception as exc:  # non-Postgres dev DB — fall back to the process lock
        log.debug("leader-ai: advisory lock unavailable (%s)", exc)
        return True


def _db_unlock(db: Session) -> None:
    try:
        db.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _DRAIN_LOCK_KEY})
        db.commit()
    except Exception:
        log.debug("leader-ai: advisory unlock failed", exc_info=True)


# A drain pass stops after `gemini_batch_size` rows. It used to wait for the
# 20-minute timer to take the next bite, which is why a queue appeared to stop
# dead at an arbitrary row and sit there — the batch cap is invisible, so what
# the operator saw was "it gave up". Pacing the whole queue against the free
# tier's daily cap was the reason, but it paced by STALLING, and a plant
# waiting on today's verdicts cannot tell a deliberate pause from a dead drain.
#
# So a pass that leaves work behind now chains straight into the next one after
# this many seconds (user, 2026-08-14). The timer stays exactly as it was: the
# fallback for a queue nobody kicked, not the thing that advances a live one.
DRAIN_CONTINUE_S = 5

# Backstop only. The queue strictly shrinks — a row goes pending → ok/flagged/
# error and errors burn `attempts` — so a chain ends on its own. This is here
# so that if that ever stops being true, the loop is bounded and says so in the
# log instead of spinning quota forever.
DRAIN_MAX_CHAIN = 500


def _should_chain(db: Session, res: dict) -> bool:
    """Is there more to do, and is it safe to go straight on?

    Three reasons never to chain, all of them cases where continuing makes
    things worse rather than slower:
      * `quota`  — a 429. Hammering it every five seconds is how a per-minute
                   limit turns into a per-day one.
      * `aborted` — consecutive API-level failures (retired model, revoked
                   key). The next pass fails identically; the operator has to
                   fix something first.
      * nothing left queued.
    """
    if not res.get("ok") or res.get("quota") or res.get("aborted"):
        return False
    return bool(
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < MAX_ATTEMPTS,
                # Same filter as the drain's own queue, and load-bearing here:
                # "work left" that the drain cannot take would chain a new pass
                # every 5 seconds, around the clock, to find nothing to do.
                ~paused_clause())
        .first()
    )


def run_async(discover_first: bool = False, _chain: int = 0) -> None:
    """Fire a drain — and, only if asked, a discovery first — on a daemon thread.

    Called from request paths and bot callbacks, none of which may block on a
    minutes-long queue. Passenger can reap the process mid-drain; that costs
    nothing, because unfinished rows are still `pending` and the next kick picks
    them up.

    `discover_first` DEFAULTS TO FALSE, and the default is the point. Discovery
    walks the corpus and submits every unreviewed report to the AI; that is a
    decision with a quota bill behind it, and it was removed from the sheet
    Refresh, the periodic drain and the key form precisely so it stops happening
    to people. A caller that wants it says so out loud — forgetting the kwarg
    now costs nothing instead of silently reinstating a bulk submit.
    """
    if not gemini.available():
        return

    def _work():
        # The "already draining in this worker" check lives INSIDE the thread
        # now. As a pre-check it returned before anything could be written down,
        # so the single most confusing outcome — a kick that did nothing because
        # the previous one is still going — was the one outcome that left no
        # trace anywhere. A thread that exits after two cheap statements costs
        # nothing next to the batch it is guarding.
        db = SessionLocal()
        started = datetime.now(timezone.utc).isoformat()
        got = holding = False
        chain = False
        try:
            got = _lock.acquire(blocking=False)
            if not got:
                log.debug("leader-ai: drain already running in this worker")
                _note_refused(db, "busy")
                return
            holding = _try_db_lock(db)
            if not holding:
                log.debug("leader-ai: another worker is draining, skipping kick")
                _note_refused(db, "locked")
                return
            _beat(db, state="running", startedAt=started, done=0, errors=0)
            if discover_first:
                discover(db)
            res = drain(db, beat=lambda d, e: _beat(
                db, state="running", startedAt=started, done=d, errors=e))
            log.info("leader-ai: drain finished %s", res)
            chain = _chain < DRAIN_MAX_CHAIN and _should_chain(db, res)
            if _chain >= DRAIN_MAX_CHAIN:
                log.warning("leader-ai: drain chain hit %s passes, stopping — "
                            "the timer takes it from here", DRAIN_MAX_CHAIN)
            # `running` while another pass is already booked, so the strip does
            # not blink through "idle" between bites of one continuous drain —
            # an idle state the operator can catch is what "it stopped" looks
            # like, and that is the whole complaint this chaining answers.
            _beat(db, state="running" if chain else "idle", startedAt=started,
                  done=res.get("done", 0), errors=res.get("errors", 0),
                  quota=bool(res.get("quota")), quotaMsg=res.get("quotaMsg"),
                  aborted=res.get("aborted"), reason=res.get("reason"))
        except Exception as exc:
            log.exception("leader-ai: drain crashed")
            # A crash used to be a log line on a box nobody can open. It is the
            # state most worth showing: everything else eventually retries.
            _beat(db, state="crashed", startedAt=started, error=str(exc)[:300])
        finally:
            # Explicit unlock: db.close() only returns the connection to the
            # pool, and the session outlives it — so an advisory lock left
            # behind would ride that pooled connection and block every future
            # drain in this worker.
            if holding:
                _db_unlock(db)
            db.close()
            # Guarded: this thread may have exited because it never got the
            # lock, and releasing one it does not hold both raises and frees
            # the drain that DOES hold it.
            if got:
                _lock.release()

        # AFTER the finally, so both locks are already released — the next pass
        # has to be able to claim them, and a chain that handed itself a lock it
        # still held would deadlock on its own success.
        if chain:
            time.sleep(DRAIN_CONTINUE_S)
            run_async(discover_first=False, _chain=_chain + 1)

    threading.Thread(target=_work, name="leader-ai-drain", daemon=True).start()


# The FALLBACK heartbeat — not the thing that advances a live queue. A pass
# with work left chains itself (`DRAIN_CONTINUE_S`), so this exists for the
# queue nobody kicked: rows left `pending` by a restart, a swallowed kick, a
# chain cut short by quota. Twenty minutes is right for that job and wrong as a
# step size, which is what it used to be.
#
# It is deliberately NOT five seconds. A timer that short fires a thread, takes
# two locks and writes a heartbeat around the clock to discover an empty queue
# — churn the chaining already makes unnecessary.
DRAIN_EVERY_MIN = 20


def register_drain_job() -> None:
    """Put the drain on the scheduler at boot.

    It DRAINS ONLY — `discover_first=False`. The timer used to walk the whole
    corpus every 20 minutes, which made it a bulk submitter: any report that
    reached the platform, from any source, was queued and judged without anyone
    asking for it. Submission is now a decision somebody makes (the sheet
    Refresh, a bot day-close, the re-check modal, «Tekshirish»), and this job
    only finishes work those actions already queued.

    That still closes the gap it was built for. A drain can die mid-batch —
    Passenger reaps the process, the unit restarts, a kick is swallowed — and
    its unfinished rows stay `pending` with nothing behind them; without a timer
    they wait for the next person to press something. What the timer no longer
    does is decide, on its own, that a report should be reviewed at all.

    Safe as an in-process timer for the same reason the broadcast fan-out is:
    the drain claims a Postgres advisory lock before doing any work, so even if
    the unit ever moves off `--workers 1` the extra firings no-op instead of
    double-spending quota.
    """
    if not gemini.available():
        log.info("leader-ai: no API key, periodic drain not scheduled")
        return
    from app.scheduler import schedule_interval
    schedule_interval("leader-ai-drain", lambda: run_async(discover_first=False),
                      minutes=DRAIN_EVERY_MIN)
    log.info("leader-ai: periodic drain scheduled every %s min", DRAIN_EVERY_MIN)
    resume_after_boot()


def resume_after_boot() -> None:
    """Pick the queue back up NOW, instead of leaving it for the timer.

    **A restart is the normal case, not the rare one.** Every push to `main`
    deploys and restarts this unit, which kills whatever drain thread was
    running — and until now nothing at boot did anything about that: the rows
    stayed `pending`, no chain was in flight to resume them, and the queue sat
    still until the 20-minute timer came round. Deploy twice in an afternoon
    and the reviewer looks like it stops dead at arbitrary rows and sulks,
    which is exactly what it looked like.

    Two things to put right, both of which only a boot can know:

    * **A `running` heartbeat cannot have survived.** The thread that wrote it
      is gone with the old process, so the strip goes on showing a live drain
      and then a "stalled" one — the one state that makes an operator wait
      rather than act. At boot it is a lie by construction, so it is cleared.
    * **Queued work has nobody behind it.** A kick costs nothing when the queue
      is empty and saves up to twenty minutes when it is not. It only ever
      DRAINS — never discovers — so this can add no work of its own.
    """
    db = SessionLocal()
    try:
        beat = _read_beat(db)
        if (beat or {}).get("state") == "running":
            log.info("leader-ai: clearing a drain heartbeat left running by a "
                     "previous process")
            _beat(db, state="idle", reason="restarted")
        n = (db.query(LeaderAiReview)
             .filter(LeaderAiReview.status.in_(("pending", "error")),
                     LeaderAiReview.attempts < MAX_ATTEMPTS)
             .count())
        if n:
            log.info("leader-ai: %s row(s) still queued at boot, resuming now", n)
            run_async(discover_first=False)
    except Exception:
        log.exception("leader-ai: boot resume failed")   # never block startup
    finally:
        db.close()
