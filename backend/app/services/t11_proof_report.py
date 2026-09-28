"""Task 11's proofs of 21–27 September, with the AI's verdict and the admin's
ruling on each — DMed once as a zipped folder.

The operator asked, on 2026-09-28, for the last seven days of AI proofs of
checklist task 11 («Ish jadvalini grafika tuzish» — the staff schedule
screenshot) as a zipped folder, with a JSON file inside saying for every proof
whose it is, when it was taken, whether the AI rejected it, why, and whether
the operator approved it. This platform has no shell, so the answer is a boot
job like every other one-off in `startup.py`.

**The window is the seven COMPLETE checklist days, 21.09 → 27.09, both
shifts.** The request came on the 28th at 10:00, when that day's shift 1 was
still filing and its shift 2 had not begun; a «last 7 days» that took the 28th
in would list a day of unfinished work and drop a finished one.

It READS, and writes nothing but its own flag and its own progress row. The
verdict, its flags and every ruling are the rows the AI queue, the day report
and the objection chain themselves read (`leader_ai_reviews`,
`leader_ai_disputes`, `leader_task_overrides`); the date sentence is
`leader_ai.date_prose` under the rule `leader_ai.date_rule_for` resolves, as the
day report computes it.

**«Did I approve it» is answered by the Telegram id, not by a name.** A ruling
stores only its actor's display name and six admins can rule, so the name alone
cannot say whose it was. The objection row keeps its ruler's id
(`decided_by_telegram`); the action register keeps the actor's id for every
AI-queue ruling (`ai.verdict_resolved`, target = the verdict ref) and every
manual override (`ltask.task_overridden`, the report uid in its details). The
operator is the chat this report goes to — a private chat's id IS the person's
Telegram id — so `by_you` compares against that. A ruling no record places is
answered by NAME only where the name is unambiguous: the operator's own admin
profile, or a name a ruling proven by id carries. Never the names on the
operator's register rows at large — an admin who «opens as» a profile acts under
that profile's name, so those rows name brigadirs, leaders and other admins.
Anything else stays `null`: approved, but whose ruling it was is not known.

**When it was taken** has an exact answer only for an in-app camera shot
(`captured_at`, the server's clock). A photo sent to the bot is re-encoded by
Telegram, which strips the picture's own time, so what the file offers instead
is when the leader SENT it (the answer's `saved_at`) and the date the AI READ on
the screenshot (`clocks`), each named as what it is.

The photo bytes are the archive channel's own, never re-encoded. The manifest is
complete before the first download, so an identical JSON rides in every ZIP
part: unzip them all into one directory and it is ONE folder. A restart resumes
from the progress row instead of sending the parts again.

Delete this module together with `startup.report_t11_proofs`,
`startup._t11_proofs_job` and the call in BOTH entrypoints once the files have
landed — a call left behind imports a deleted module at boot, and a failed boot
rolls the deploy back.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import threading
import time
import zipfile
import zlib
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    ActionLog, Admin, AppSetting, Cell, Factory, LeaderAiDispute, LeaderAiReview,
    LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry, LeaderTaskMedia,
    LeaderTaskOverride, LeaderTaskPhoto, Manager, RoleProfile,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))            # the plant's wall clock
TASK_ID = 11
DATE_FROM = date(2026, 9, 21)                # the CHECKLIST days, both shifts
DATE_TO = date(2026, 9, 27)
DATES = tuple((DATE_FROM + timedelta(days=i)).isoformat()
              for i in range((DATE_TO - DATE_FROM).days + 1))

# The folder every part unpacks into, and the manifest inside it.
ROOT = "T11-isbotlar-21-27-sentabr"
MANIFEST = f"{ROOT}/t11-proofs.json"

# Which photos have already gone out, so a restart resumes instead of repeating.
PROGRESS_KEY = "t11_proofs_sep21_27_2026_09_28_v1:progress"

# The 26 Sep criteria revision (`leader_rules_sep26`) rewrote task 11's AI text
# once per shift; each flag holds the UTC instant its shift's text landed, which
# is what tells a verdict judged under the 19 Sep text from one judged under the
# new one. Read as data keys, so this report does not import the rules module.
RULES26_FLAGS = {1: "leader_rules_2026_09_26_shift1_v1",
                 2: "leader_rules_2026_09_26_shift2_v1"}

# A ruling and the record naming its actor are written seconds apart; anything
# further than this apart describes a different ruling.
EVIDENCE_SLACK = timedelta(minutes=10)

# sendDocument refuses above 50 MB; the manifest rides in every part and the
# per-photo overhead is estimated, so the cap keeps a margin below it.
PART_BYTES = 45 * 1024 * 1024
# A ceiling on how much of the chat this errand may occupy — against a runaway,
# not a guess at the size (~630 photos measure at three or four parts).
MAX_PARTS = 10
PART_PAUSE_S = 3
SEND_RETRIES = 3

FETCH_WORKERS = 6        # Telegram downloads in flight at once
FETCH_WINDOW = 24        # photos held in memory between fetch and pack
FETCH_RETRIES = 4
FETCH_BACKOFF_S = 2

TEXT_MAX = 2000          # free text is cut, never dropped
ERRORS_NAMED = 20        # how many failed photos the closing message names

_API = "https://api.telegram.org"


# ── the words ────────────────────────────────────────────────────────────────
# The flag labels are the day report's own (components/leaders/DayReportView).

FLAG_TEXT = {
    "date_mismatch": {
        "uz": "Sana mos emas — jadvaldagi sana hisobot kuniga (yoki ertasiga) to'g'ri kelmaydi.",
        "en": "Date does not match — the date on the list is neither the report day nor the next day."},
    "no_date": {
        "uz": "Rasmda sana yo'q — qaysi kun uchun ekani tasdiqlanmadi.",
        "en": "No date on the photo — which day it is for could not be confirmed."},
    "off_topic": {
        "uz": "Rasm vazifaga mos emas — boshqa narsa yuborilgan.",
        "en": "Photo is not about this task — it shows something else."},
    "not_proven": {
        "uz": "Mezon bo'yicha isbotlanmadi — jadvalda talab qilingan narsa ko'rinmaydi.",
        "en": "Not proven against the criteria — the list does not show what is required."},
    "unreadable": {
        "uz": "Rasm o'qilmadi.",
        "en": "Photo unreadable."},
}

VERDICT_TEXT = {
    "passed": {"uz": "AI o'tkazdi — belgi yo'q", "en": "Passed by the AI — no flag"},
    "rejected": {"uz": "AI rad etdi", "en": "Rejected by the AI"},
    "pending": {"uz": "Hali AI navbatida", "en": "Still queued for the AI"},
    "error": {"uz": "AI tekshira olmadi (texnik xato) — liderga bal olinmaydi",
              "en": "The AI could not check it (technical error) — never counted against the leader"},
    "skipped": {"uz": "O'tkazib yuborilgan", "en": "Skipped"},
    "not_reviewed": {"uz": "AI ga yuborilmagan", "en": "Never sent to the AI"},
}

DECISION_TEXT = {
    "approved": {"uz": "Admin tasdiqladi — AI xato qildi, bal qaytarildi",
                 "en": "Approved by an admin — the AI was wrong, weight restored"},
    "rejected": {"uz": "Admin rad etdi — vazifa hisobga olinmaydi",
                 "en": "Rejected by an admin — the task does not count"},
    "requeried": {"uz": "Admin qayta topshirishni so'radi (bal hali qaytmagan)",
                  "en": "An admin asked for a re-filing (no weight restored yet)"},
}

HOW_TEXT = {
    "ai_queue": {"uz": "«AI tekshiruvi» navbatida hal qilingan",
                 "en": "Ruled in the «AI tekshiruvi» queue"},
    "objection": {"uz": "Lider noroziligi bo'yicha hal qilingan",
                  "en": "Ruled on the leader's objection"},
    "manual_override": {"uz": "Qo'lda «bajarildi / bajarilmadi» belgisi",
                        "en": "A manual done / not-done mark"},
}

OBJECTION_TEXT = {
    "supervisor": {"uz": "Brigadirda (1-bosqich)", "en": "With the brigadir (stage 1)"},
    "admin": {"uz": "Adminda (2-bosqich)", "en": "With the admins (stage 2)"},
    "approved": {"uz": "Qabul qilindi — bal qaytarildi", "en": "Upheld — weight restored"},
    "rejected": {"uz": "Rad etildi", "en": "Refused"},
    "cancelled": {"uz": "Qaror bekor qilindi", "en": "Ruling taken back"},
}

CRITERIA_TEXT = {
    "19-sep": {"uz": "19-sentabr mezoni bo'yicha tekshirilgan (26-sentabrgacha amal qilgan matn)",
               "en": "Judged against the 19 Sep criteria (the text in force until 26 Sep)"},
    "26-sep": {"uz": "26-sentabr mezoni bo'yicha tekshirilgan (hozirgi matn)",
               "en": "Judged against the 26 Sep criteria (the current text)"},
}

HOW_TO_READ = {
    "uz": ("Barcha ZIP qismlarini BITTA papkaga chiqaring — t11-proofs.json har bir "
           "qismda bir xil. proofs[] — har bir isbot (bitta lider, bitta kun, bitta "
           "yacheyka): kim (leader; brigadir — uning brigadasi; cell — yacheyka "
           "kodi), qachon (when.taken_at — rasm olingan vaqt, faqat ilova "
           "kamerasida bor; Telegram orqali yuborilgan rasmda Telegram rasmning "
           "o'z vaqtini o'chiradi, shuning uchun when.sent_at — lider botga "
           "yuborgan vaqt va when.date_on_photo — AI rasmdan o'qigan sana), AI "
           "natijasi (ai.verdict: passed / rejected / pending / error / "
           "not_reviewed; ai.rejected — rad etilganmi), sababi (ai.reasons — "
           "belgi va uning izohi, ai.comment — AI ning o'z so'zlari, "
           "ai.date_check — sana bo'yicha xulosa), admin qarori (decision: kim, "
           "qachon, qanday; decision.by_you — siz qilganmisiz), you_approved — "
           "siz tasdiqlaganmisiz (true / false), objection — lider noroziligi, "
           "outcome.counts — vazifa hisobga olinganmi. photos[].file — papka "
           "ichidagi rasm yo'li; fayl nomining oxiri AI natijasini aytadi "
           "(AI-OK, AI-REJ, AI-REJ_APPROVED …). photos[].same_picture_as — "
           "xuddi shu rasm boshqa isbotda ham topshirilgan (o'sha isbot raqami). "
           "leader_cells — liderning hozirgi yacheykalari. ai.criteria — qaysi "
           "mezon matni bilan tekshirilgani (19-sentabr yoki 26-sentabr). "
           "you_approved: null — tasdiqlangan, lekin kim tasdiqlagani "
           "aniqlanmadi (decision.by da ism bor)."),
    "en": ("Unzip EVERY part into ONE folder — t11-proofs.json is identical in "
           "each part. proofs[] = one proof (one leader, one day, one cell): who "
           "(leader; brigadir = their unit; cell = the cell code), when "
           "(when.taken_at = when the photo was taken, known only for in-app "
           "camera shots; Telegram strips a sent photo's own time, so "
           "when.sent_at = when the leader sent it to the bot and "
           "when.date_on_photo = the date the AI read off the picture), the AI "
           "result (ai.verdict: passed / rejected / pending / error / "
           "not_reviewed; ai.rejected), the reason (ai.reasons = the flag and "
           "what it means, ai.comment = the AI's own words, ai.date_check = the "
           "date verdict), the admin ruling (decision: who, when, how; "
           "decision.by_you = whether it was you), you_approved = whether you "
           "approved it (true / false), objection = the leader's objection, "
           "outcome.counts = whether the task counts. photos[].file is the "
           "picture's path inside the folder; the end of the file name repeats "
           "the result (AI-OK, AI-REJ, AI-REJ_APPROVED …). "
           "photos[].same_picture_as = the very same picture was also filed in "
           "another proof (its id). leader_cells = the leader's cells today. "
           "ai.criteria = which criteria text it was judged against (19 Sep or "
           "26 Sep). you_approved: null = approved, but whose ruling it was "
           "could not be told (decision.by carries the name)."),
}


# ── plain values ─────────────────────────────────────────────────────────────

def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _t(v):
    """An instant on the plant's own clock; anything else unchanged."""
    if isinstance(v, datetime):
        return _aware(v).astimezone(TZ).isoformat(timespec="seconds")
    return v


def _cut(v):
    return v[:TEXT_MAX] if isinstance(v, str) else v


_SLUG_DROP = re.compile(r"[^\w\-. ]", re.UNICODE)


def _slug(v, fallback: str = "-") -> str:
    """A path segment out of a person's or a unit's name — Cyrillic and Latin
    both survive (zip entry names are UTF-8); only what a path cannot carry is
    dropped, and the length is capped so the tree stays inside every
    filesystem's own limit."""
    s = _SLUG_DROP.sub("", str(v or "")).strip().replace(" ", "_")
    return s[:48] or fallback


def _count(bucket: dict, key) -> None:
    key = "none" if key is None else str(key)
    bucket[key] = bucket.get(key, 0) + 1


def _nearest(events: list[tuple], at: datetime | None):
    """The event closest in time to a ruling, when it is close enough to be the
    same act. `events` are `(at, telegram_id, name)`."""
    at = _aware(at)
    best = None
    for ev in events or ():
        ev_at = _aware(ev[0])
        if at is None or ev_at is None:
            continue
        gap = abs(ev_at - at)
        if gap <= EVIDENCE_SLACK and (best is None or gap < best[0]):
            best = (gap, ev)
    return best[1] if best else None


# ── the manifest ─────────────────────────────────────────────────────────────

def collect(db: Session, you: int) -> tuple[dict, list[dict]]:
    """(report, images) — built from the database alone.

    `report` is t11-proofs.json. `images` is what the packer fetches, in zip
    order: one `{key, file_id, file}` per picture, where `key` is the stable row
    id the progress record remembers. `you` is the operator's Telegram id.
    """
    from app.services import leader_ai, leader_bot, leader_dispute, leader_reports

    now = datetime.now(TZ)

    # ── lookups ──────────────────────────────────────────────────────────────
    units = {r.id: {"name": r.name, "shift": r.shift, "factory_id": r.factory_id}
             for r in db.query(Manager.id, Manager.name, Manager.shift,
                               Manager.factory_id).all()}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name).all())
    cells = dict(db.query(Cell.id, Cell.verifix_code).all())
    factories = {r.id: (r.name_uz or r.code)
                 for r in db.query(Factory.id, Factory.name_uz, Factory.code).all()}
    td = db.query(LeaderTaskDef).filter_by(id=TASK_ID).first()
    task = {"id": TASK_ID,
            "name_uz": td.name_uz if td else None,
            "name_ru": td.name_ru if td else None,
            "weight": int(td.default_weight or 0) if td else None}

    # ── the rows, copied into plain values ───────────────────────────────────
    days = [{"id": d.id, "leader_id": d.leader_id, "manager_id": d.manager_id,
             "date": d.date, "cell_id": d.cell_id, "closed_at": d.closed_at}
            for d in db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.date.in_(DATES)).all()]
    day_by_id = {d["id"]: d for d in days}

    entries: list[dict] = []
    media: dict[int, list[dict]] = {}
    shot_by_file: dict[tuple, dict] = {}
    if day_by_id:
        ids = list(day_by_id)
        for i in range(0, len(ids), 1000):
            entries += [{"id": e.id, "day_id": e.day_id, "done": bool(e.done),
                         "saved_at": e.saved_at, "closed_at": e.closed_at}
                        for e in db.query(LeaderTaskEntry)
                        .filter(LeaderTaskEntry.task_id == TASK_ID,
                                LeaderTaskEntry.day_id.in_(ids[i:i + 1000])).all()]
            for s in (db.query(LeaderTaskPhoto)
                      .filter(LeaderTaskPhoto.task_id == TASK_ID,
                              LeaderTaskPhoto.day_id.in_(ids[i:i + 1000])).all()):
                shot_by_file[(s.day_id, s.file_id)] = {
                    "captured_at": s.captured_at, "received_at": s.received_at,
                    "stamp": s.stamp, "late": bool(s.late)}
    entry_ids = [e["id"] for e in entries]
    for i in range(0, len(entry_ids), 1000):
        for m in (db.query(LeaderTaskMedia)
                  .filter(LeaderTaskMedia.entry_id.in_(entry_ids[i:i + 1000]))
                  .order_by(LeaderTaskMedia.entry_id, LeaderTaskMedia.pos,
                            LeaderTaskMedia.id).all()):
            media.setdefault(m.entry_id, []).append(
                {"id": m.id, "file_id": m.file_id, "pos": m.pos})

    def _review(r: LeaderAiReview) -> dict:
        return {
            "ref": r.ref, "source": r.source, "date": r.date,
            "leader_id": r.leader_id, "manager_id": r.manager_id,
            "shift": r.shift, "status": r.status, "flags": list(r.flags or []),
            "image_date": r.image_date, "clocks": list(r.clocks or []),
            "reason": {"uz": r.reason_uz, "ru": r.reason_ru, "en": r.reason_en},
            "photos": r.photos, "model": r.model, "error": r.error,
            "created_at": r.created_at, "reviewed_at": r.reviewed_at,
            "resolution": r.resolution, "resolved_by": r.resolved_by,
            "resolved_at": r.resolved_at, "resolution_note": r.resolution_note,
        }

    entry_refs = {leader_ai.bot_ref(eid): eid for eid in entry_ids}
    reviews = {r.ref: _review(r) for r in db.query(LeaderAiReview)
               .filter(LeaderAiReview.task_id == TASK_ID,
                       LeaderAiReview.date.in_(DATES)).all()}
    # A verdict filed under one of these entries but dated otherwise is still
    # this report's business: the entry is what makes it a proof here.
    missing = [ref for ref in entry_refs if ref not in reviews]
    for i in range(0, len(missing), 500):
        for r in (db.query(LeaderAiReview)
                  .filter(LeaderAiReview.ref.in_(missing[i:i + 500])).all()):
            reviews[r.ref] = _review(r)

    # The newest objection per verdict — what the day report shows.
    dispute_by_ref: dict[str, dict] = {}
    for d in (db.query(LeaderAiDispute)
              .filter(LeaderAiDispute.task_id == TASK_ID,
                      LeaderAiDispute.date.in_(DATES))
              .order_by(LeaderAiDispute.id).all()):
        dispute_by_ref[d.ref] = {
            "id": d.id, "status": d.status, "reason": d.reason,
            "requested_by_name": d.requested_by_name,
            "requested_by_profile": d.requested_by_profile,
            "requested_at": d.requested_at,
            # The brigadir's own case — `sup_case` drops an uplift note that
            # only echoes the filing, as every objection card does.
            "sup_action": d.sup_action, "sup_note": leader_dispute.sup_case(d),
            "sup_by": d.sup_by_name, "sup_at": d.sup_at,
            "decided_by": d.decided_by_name,
            "decided_by_telegram": d.decided_by_telegram,
            "decided_at": d.decided_at, "decision_note": d.decision_note,
        }

    override_by_uid = {o.uid: {"done": bool(o.done), "by": o.set_by, "at": o.set_at}
                       for o in db.query(LeaderTaskOverride)
                       .filter(LeaderTaskOverride.task_id == TASK_ID,
                               LeaderTaskOverride.date.in_(DATES)).all()}

    # ── who ruled: the action register's actor ids ───────────────────────────
    resolve_ev: dict[str, list[tuple]] = {}
    refs = list(reviews)
    for i in range(0, len(refs), 500):
        for a in (db.query(ActionLog.created_at, ActionLog.target_id,
                           ActionLog.actor_telegram_id, ActionLog.actor_name)
                  .filter(ActionLog.action == "ai.verdict_resolved",
                          ActionLog.outcome == "done",
                          ActionLog.target_id.in_(refs[i:i + 500])).all()):
            resolve_ev.setdefault(a.target_id, []).append(
                (a.created_at, a.actor_telegram_id, a.actor_name))
    override_ev: dict[str, list[tuple]] = {}
    for a in (db.query(ActionLog.created_at, ActionLog.details,
                       ActionLog.actor_telegram_id, ActionLog.actor_name)
              .filter(ActionLog.action == "ltask.task_overridden",
                      ActionLog.outcome == "done",
                      ActionLog.target_id == str(TASK_ID),
                      ActionLog.day >= DATE_FROM, ActionLog.day <= DATE_TO).all()):
        uid = next((p[1] for p in (a.details or [])
                    if isinstance(p, (list, tuple)) and len(p) >= 2
                    and p[0] == "report"), None)
        if uid:
            override_ev.setdefault(str(uid), []).append(
                (a.created_at, a.actor_telegram_id, a.actor_name))
    # The operator's own admin profile — its name is what a ruling made from
    # their own session carries (rulings take `full_name` off the payload). NOT
    # every name their register rows carry: an admin who «opens as» a profile
    # acts under that profile's name, so those rows name brigadirs, leaders and
    # other admins, and a fallback built on them would credit the operator with
    # somebody else's ruling.
    adm = db.query(Admin.profile_id).filter(Admin.telegram_id == you).first()
    your_admin_name = leaders.get(adm.profile_id) if adm and adm.profile_id else None
    owned_cells: dict[int, list[str]] = {}
    for c in db.query(Cell.leader_id, Cell.verifix_code).filter(
            Cell.leader_id.isnot(None)).all():
        if c.verifix_code:
            owned_cells.setdefault(c.leader_id, []).append(c.verifix_code)

    # ── when the 26 Sep text landed, per shift ───────────────────────────────
    rules26_at: dict[int, datetime] = {}
    for s, key in RULES26_FLAGS.items():
        row = db.query(AppSetting).filter_by(key=key).first()
        try:
            rules26_at[s] = _aware(datetime.fromisoformat(row.value))
        except (AttributeError, TypeError, ValueError):
            pass

    # ── the date rule, per (unit, leader, shift) ─────────────────────────────
    rule_cache: dict = {}

    def _rule(mid, lid, shift):
        k = (mid, lid, shift)
        if k not in rule_cache:
            rule_cache[k] = leader_ai.date_rule_for(db, TASK_ID, mid, lid, shift)
        return rule_cache[k]

    # ── one ruling, with whose it was ────────────────────────────────────────
    def _who(tg) -> bool | None:
        """Whose ruling, by Telegram id. None where no record names the id —
        the names pass after the loop answers those it can."""
        return None if tg is None else int(tg) == int(you)

    def _decision(uid: str, rev: dict | None, disp: dict | None) -> dict | None:
        """The admin's standing ruling on one proof — the manual override first
        (it wins on the page), then the verdict's resolution."""
        ov = override_by_uid.get(uid)
        if ov is not None:
            ev = _nearest(override_ev.get(uid), ov["at"])
            tg = ev[1] if ev else None
            return {"status": "approved" if ov["done"] else "rejected",
                    "status_text": DECISION_TEXT["approved" if ov["done"] else "rejected"],
                    "how": "manual_override", "how_text": HOW_TEXT["manual_override"],
                    "by": ov["by"], "by_telegram_id": tg, "by_you": _who(tg),
                    "attributed_by": "telegram_id" if tg is not None else None,
                    "at": _t(ov["at"]), "note": None}
        if not rev or not rev["resolution"]:
            return None
        how, tg = "ai_queue", None
        if (disp and disp["status"] in ("approved", "rejected")
                and disp["decided_at"] is not None
                and _nearest([(disp["decided_at"], disp["decided_by_telegram"],
                               disp["decided_by"])], rev["resolved_at"])):
            how, tg = "objection", disp["decided_by_telegram"]
        else:
            ev = _nearest(resolve_ev.get(rev["ref"]), rev["resolved_at"])
            tg = ev[1] if ev else None
        return {"status": rev["resolution"],
                "status_text": DECISION_TEXT.get(rev["resolution"]),
                "how": how, "how_text": HOW_TEXT[how],
                "by": rev["resolved_by"], "by_telegram_id": tg, "by_you": _who(tg),
                "attributed_by": "telegram_id" if tg is not None else None,
                "at": _t(rev["resolved_at"]), "note": _cut(rev["resolution_note"])}

    def _objection(d: dict | None) -> dict | None:
        if d is None:
            return None
        return {
            "id": d["id"], "status": d["status"],
            "status_text": OBJECTION_TEXT.get(d["status"]),
            "filed_by": d["requested_by_name"],
            "filed_by_role": (str(d["requested_by_profile"] or "").split(":")[0] or None),
            "filed_at": _t(d["requested_at"]),
            "reason": _cut(d["reason"]),
            "brigadir": ({"action": d["sup_action"], "note": _cut(d["sup_note"]),
                          "by": d["sup_by"], "at": _t(d["sup_at"])}
                         if d["sup_action"] else None),
            "admin": ({"by": d["decided_by"], "at": _t(d["decided_at"]),
                       "note": _cut(d["decision_note"]),
                       "by_telegram_id": d["decided_by_telegram"],
                       "by_you": _who(d["decided_by_telegram"])}
                      if d["decided_at"] else None),
        }

    # ── the zip tree ─────────────────────────────────────────────────────────
    taken: set[str] = set()

    def _unique(path: str) -> str:
        """A path no other picture has — two entries at one name unpack to ONE
        file, and a proof would go missing with the manifest still naming it."""
        if path not in taken:
            taken.add(path)
            return path
        stem, _, ext = path.rpartition(".")
        for n in range(2, 1000):
            alt = f"{stem}-{n}.{ext}"
            if alt not in taken:
                taken.add(alt)
                return alt
        taken.add(path)
        return path

    def _order(e: dict):
        d = day_by_id[e["day_id"]]
        u = units.get(d["manager_id"]) or {}
        return (d["date"], u.get("shift") or 9, str(u.get("name") or ""),
                str(leaders.get(d["leader_id"]) or ""),
                str(cells.get(d["cell_id"]) or ""), e["id"])
    entries.sort(key=_order)

    images: list[dict] = []
    # file_id → the proof that filed this very picture first. Every proof gets
    # its OWN copy under its own leader's name — a leader of two cells may file
    # one screenshot for both, and two leaders have filed the identical one —
    # so the folder reads right on its own, and `same_picture_as` says so.
    first_filed: dict[str, str] = {}
    proofs: list[dict] = []
    for e in entries:
        ms = media.get(e["id"]) or []
        if not ms:
            continue                        # no photo, no proof
        day = day_by_id[e["day_id"]]
        unit = units.get(day["manager_id"]) or {}
        uid = leader_bot.day_uid(day["id"])
        ref = leader_ai.bot_ref(e["id"])
        rev = reviews.get(ref)
        disp = dispute_by_ref.get(ref)
        cell = cells.get(day["cell_id"]) if day["cell_id"] else None
        shift = rev["shift"] if rev else unit.get("shift")

        # ── the AI's verdict ─────────────────────────────────────────────────
        if not rev:
            verdict = "not_reviewed"
        elif rev["status"] == "flagged":
            verdict = "rejected"
        elif rev["status"] == "ok":
            verdict = "passed"
        elif rev["status"] in ("pending", "error", "skipped"):
            verdict = rev["status"]
        else:
            verdict = "not_reviewed"
        ai: dict = {"verdict": verdict, "verdict_text": VERDICT_TEXT[verdict],
                    "rejected": (verdict == "rejected") if verdict in
                    ("passed", "rejected") else None}
        if rev:
            flags = rev["flags"]
            rule = _rule(rev["manager_id"], rev["leader_id"], rev["shift"])
            ra = _aware(rev["reviewed_at"])
            at26 = rules26_at.get(rev["shift"])
            criteria = None
            if ra is not None and rev["shift"] in RULES26_FLAGS:
                criteria = "26-sep" if at26 is not None and ra >= at26 else "19-sep"
            ai.update({
                "reasons": [{"flag": f, **FLAG_TEXT.get(f, {"uz": f, "en": f})}
                            for f in flags],
                "comment": {l: _cut(v) for l, v in rev["reason"].items()},
                "date_check": None,
                "accepted_dates": leader_ai.expected_text(
                    rev["date"], rev["shift"], rule.win, check=rule.checked,
                    days=rule.dayed, times=rule.timed, plus=rule.plus),
                "dates_read_on_photo": [
                    {"raw": c.get("raw"), "where": c.get("source")}
                    for c in rev["clocks"] if isinstance(c, dict)],
                "criteria": criteria,
                "criteria_text": CRITERIA_TEXT.get(criteria),
                "model": rev["model"],
                "photos_sent_to_ai": rev["photos"],
                "queued_at": _t(rev["created_at"]),
                "reviewed_at": _t(rev["reviewed_at"]),
                "error": _cut(rev["error"]),
                # Inside the automatic regime a flag costs the task its weight
                # with nobody pressing anything; outside it a flag is a note.
                "flag_costs_points": leader_ai.in_auto_regime(rev["date"], rev["shift"]),
            })
            if rev["status"] in ("ok", "flagged"):
                prose = leader_ai.date_prose(
                    rev["clocks"], rev["date"], rule.win, check=rule.checked,
                    days=rule.dayed, times=rule.timed, plus=rule.plus,
                    shift=rev["shift"])
                ai["date_check"] = {l: prose.get(l) for l in ("uz", "ru", "en")}

        decision = _decision(uid, rev, disp)

        # ── what the task ends up counting as (the page's precedence) ────────
        if decision and decision["how"] == "manual_override":
            counts = decision["status"] == "approved"
        elif rev and rev["resolution"] == "rejected":
            counts = False
        elif (rev and rev["status"] == "flagged" and rev["resolution"] != "approved"
              and leader_ai.in_auto_regime(rev["date"], rev["shift"])):
            counts = False
        elif rev and rev["status"] == "pending":
            counts = None
        else:
            counts = bool(e["done"])

        # ── the photos ───────────────────────────────────────────────────────
        tag = {"passed": "AI-OK", "rejected": "AI-REJ", "pending": "AI-PENDING",
               "error": "AI-ERROR", "skipped": "AI-SKIPPED"}.get(verdict, "AI-NONE")
        if decision:
            tag += {"approved": "_APPROVED", "rejected": "_ADMIN-REJ",
                    "requeried": "_REQUERIED"}.get(decision["status"], "")
        photos: list[dict] = []
        for m in ms:
            s = shot_by_file.get((day["id"], m["file_id"]))
            first = first_filed.setdefault(m["file_id"], f"e{e['id']}")
            name = "__".join(x for x in (
                _slug(leaders.get(day["leader_id"])), _slug(cell, "") or None,
                f"e{e['id']}_p{m['pos']}", tag) if x)
            path = _unique("/".join((
                ROOT, "photos", day["date"], f"smena{shift or 0}",
                _slug(unit.get("name"), "brigadasiz"), f"{name}.jpg")))
            images.append({"key": f"m{m['id']}", "file_id": m["file_id"],
                           "file": path})
            photos.append({
                "file": path[len(ROOT) + 1:],
                "source": "camera" if s else "telegram",
                "taken_at": _t(s["captured_at"]) if s else None,
                "stamp": s["stamp"] if s else None,
                "same_picture_as": first if first != f"e{e['id']}" else None,
            })

        proofs.append({
            "proof_id": f"e{e['id']}",
            "date": day["date"],
            "shift": shift,
            "factory": factories.get(unit.get("factory_id")),
            "brigadir": unit.get("name"),
            "unit_id": day["manager_id"],
            "leader": leaders.get(day["leader_id"]),
            "leader_id": day["leader_id"],
            "cell": cell,
            "leader_cells": sorted(owned_cells.get(day["leader_id"]) or []),
            "photos": photos,
            "when": {
                "taken_at": next((p["taken_at"] for p in photos if p["taken_at"]), None),
                "sent_at": _t(e["saved_at"]),
                "submitted_at": _t(e["closed_at"] or day["closed_at"]),
                "date_on_photo": (rev or {}).get("image_date") or None,
            },
            "ai": ai,
            "decision": decision,
            "you_approved": None,               # settled after the names pass
            "objection": _objection(disp),
            "outcome": {
                "counts": counts,
                "text": ({"uz": "Hisobga olindi", "en": "Counts"} if counts is True
                         else {"uz": "Hisobga olinmadi", "en": "Does not count"}
                         if counts is False
                         else {"uz": "Hali hal bo'lmagan", "en": "Not settled yet"}),
            },
            "report_url": leader_reports.report_url(uid),
        })

    # ── rulings no record names by id: answered by name, where one can ──────
    # A name counts as yours only if a ruling proven yours by Telegram id — or
    # your own admin profile — carries it, and as somebody else's only if one
    # proven THEIRS does; anything else stays null rather than being guessed.
    you_names: set[str] = {your_admin_name} if your_admin_name else set()
    other_names: set[str] = set()
    rulings = [r for p in proofs for r in (p["decision"],
                                           (p["objection"] or {}).get("admin")) if r]
    for r in rulings:
        if r.get("by") and r.get("by_you") is not None:
            (you_names if r["by_you"] else other_names).add(r["by"])
    for r in rulings:
        if r.get("by_you") is None and r.get("by"):
            if r["by"] in you_names and r["by"] not in other_names:
                r["by_you"] = True
            elif r["by"] in other_names and r["by"] not in you_names:
                r["by_you"] = False
            if r["by_you"] is not None and "attributed_by" in r:
                r["attributed_by"] = "name"
    for p in proofs:
        d = p["decision"]
        if d and d["status"] == "approved":
            p["you_approved"] = d["by_you"]     # True · False · None = unknown
        else:
            p["you_approved"] = False

    # ── verdicts with no photo left (an entry reset since, a sheet row) ──────
    no_photo = []
    for ref, rev in sorted(reviews.items(), key=lambda kv: (kv[1]["date"], kv[0])):
        if ref in entry_refs and media.get(entry_refs[ref]):
            continue
        no_photo.append({
            "ref": ref, "source": rev["source"], "date": rev["date"],
            "shift": rev["shift"],
            "brigadir": (units.get(rev["manager_id"]) or {}).get("name"),
            "leader": leaders.get(rev["leader_id"]),
            "verdict": {"ok": "passed", "flagged": "rejected"}.get(rev["status"],
                                                                  rev["status"]),
            "flags": rev["flags"],
            "reviewed_at": _t(rev["reviewed_at"]),
            "resolution": rev["resolution"], "resolved_by": rev["resolved_by"],
        })

    # ── counts ───────────────────────────────────────────────────────────────
    by_date: dict = {}
    verdicts: dict = {}
    flag_counts: dict = {}
    by_criteria: dict = {}
    by_model: dict = {}
    decisions = {"approved_by_you": 0, "approved_by_other_admin": 0,
                 "approved_by_unknown": 0, "admin_rejected": 0, "requeried": 0}
    rejected_standing = 0
    for p in proofs:
        v = p["ai"]["verdict"]
        bd = by_date.setdefault(p["date"], {"proofs": 0, "ai_rejected": 0,
                                            "approved_after_rejection": 0})
        bd["proofs"] += 1
        _count(verdicts, v)
        for f in p["ai"].get("reasons") or []:
            _count(flag_counts, f["flag"])
        for bucket, key in ((by_criteria, p["ai"].get("criteria")),
                            (by_model, p["ai"].get("model"))):
            if v in ("passed", "rejected"):
                b = bucket.setdefault(str(key), {"judged": 0, "rejected": 0})
                b["judged"] += 1
                b["rejected"] += v == "rejected"
        dec = p["decision"]
        if v == "rejected":
            bd["ai_rejected"] += 1
            if dec and dec["status"] == "approved":
                bd["approved_after_rejection"] += 1
            elif p["outcome"]["counts"] is False:
                rejected_standing += 1
        if dec:
            if dec["status"] == "approved":
                key = ("approved_by_you" if dec["by_you"] is True
                       else "approved_by_other_admin" if dec["by_you"] is False
                       else "approved_by_unknown")
                decisions[key] += 1
            elif dec["status"] == "rejected":
                decisions["admin_rejected"] += 1
            elif dec["status"] == "requeried":
                decisions["requeried"] += 1
    for b in list(by_criteria.values()) + list(by_model.values()):
        b["rejected_pct"] = round(100 * b["rejected"] / b["judged"], 1) if b["judged"] else None
    obj_counts: dict = {}
    for p in proofs:
        if p["objection"]:
            _count(obj_counts, p["objection"]["status"])

    def _brief(p: dict) -> dict:
        return {"proof_id": p["proof_id"], "date": p["date"], "shift": p["shift"],
                "brigadir": p["brigadir"], "leader": p["leader"], "cell": p["cell"],
                "flags": [r["flag"] for r in p["ai"].get("reasons") or []],
                "ai_comment_uz": (p["ai"].get("comment") or {}).get("uz"),
                "decision": (p["decision"] or {}).get("status"),
                "decided_by": (p["decision"] or {}).get("by"),
                "by_you": (p["decision"] or {}).get("by_you"),
                "files": [ph["file"] for ph in p["photos"]]}

    criteria_texts: dict = {"19-sep": None, "26-sep": None}
    try:
        from app.services import leader_rules_sep19
        criteria_texts["19-sep"] = leader_rules_sep19.CRITERIA.get(TASK_ID)
    except Exception:
        pass
    try:
        from app.services import leader_rules_sep26
        criteria_texts["26-sep"] = leader_rules_sep26.CRITERIA.get(TASK_ID)
    except Exception:
        pass

    report = {
        "title": "T11 isbotlari va AI tekshiruvi — 21–27 sentabr 2026",
        "task": task,
        "dates": list(DATES),
        "window_note": {
            "uz": "Oxirgi 7 ta TO'LIQ chek-list kuni, ikkala smena. 28-sentabr "
                  "kiritilmagan — so'rov paytida u hali tugamagan edi.",
            "en": "The last 7 COMPLETE checklist days, both shifts. 28 Sep is "
                  "not included — it was still in progress when this was asked."},
        "generated_at": _t(now),
        "you": {"telegram_id": you, "names": sorted(you_names)},
        "how_to_read": HOW_TO_READ,
        "legend": {"flags": FLAG_TEXT, "verdict": VERDICT_TEXT,
                   "decision": DECISION_TEXT, "decision_how": HOW_TEXT,
                   "objection_status": OBJECTION_TEXT, "criteria": CRITERIA_TEXT},
        "criteria_texts": criteria_texts,
        "criteria_26_sep_landed_at": {str(s): _t(v) for s, v in rules26_at.items()},
        "counts": {
            "proofs": len(proofs),
            "photos": len(images),
            "ai_verdict": verdicts,
            "ai_rejected": verdicts.get("rejected", 0),
            "ai_rejection_reasons": flag_counts,
            "admin_decisions": decisions,
            "ai_rejected_and_still_not_counted": rejected_standing,
            "you_approved": sum(1 for p in proofs if p["you_approved"] is True),
            "objections": obj_counts,
            "by_date": by_date,
            "by_criteria_text": by_criteria,
            "by_ai_model": by_model,
            "verdicts_without_photo": len(no_photo),
        },
        "ai_rejected": [_brief(p) for p in proofs if p["ai"]["verdict"] == "rejected"],
        "you_approved": [_brief(p) for p in proofs if p["you_approved"] is True],
        "proofs": proofs,
        "verdicts_without_photo": no_photo,
    }
    return report, images


# ── Telegram ─────────────────────────────────────────────────────────────────

_tls = threading.local()


def _session() -> requests.Session:
    s = getattr(_tls, "s", None)
    if s is None:
        s = _tls.s = requests.Session()
    return s


def _clean(text: str) -> str:
    """An error message with the bot token taken out — Telegram's URLs carry it,
    and a message may reach the chat, the log and the manifest."""
    token = settings.telegram_bot_token or ""
    return text.replace(token, "***") if token else text


class _Gone(Exception):
    """A file Telegram will never serve — retrying cannot help."""


def _fetch(file_id: str) -> bytes:
    """One archived proof's bytes, with Telegram's own flood answer obeyed."""
    token = settings.telegram_bot_token
    last = "fetch failed"
    for attempt in range(1, FETCH_RETRIES + 1):
        wait = FETCH_BACKOFF_S * attempt
        try:
            s = _session()
            r = s.get(f"{_API}/bot{token}/getFile", params={"file_id": file_id},
                      timeout=60)
            body = r.json()
            if body.get("ok"):
                path = (body.get("result") or {}).get("file_path") or ""
                if not path:
                    raise _Gone("file no longer on Telegram")
                res = s.get(f"{_API}/file/bot{token}/{path}", timeout=180)
                if res.status_code == 200 and res.content:
                    return res.content
                last = f"download HTTP {res.status_code}"
            else:
                last = body.get("description") or f"getFile HTTP {r.status_code}"
                if body.get("error_code") == 400:
                    raise _Gone(last)
                wait = max(wait, int((body.get("parameters") or {}).get("retry_after") or 0))
        except _Gone:
            raise
        except Exception as exc:
            last = type(exc).__name__
        if attempt < FETCH_RETRIES:
            time.sleep(wait)
    raise RuntimeError(last)


def _fetch_safe(file_id: str) -> tuple[bytes | None, str | None]:
    try:
        return _fetch(file_id), None
    except Exception as exc:
        return None, _clean(f"{type(exc).__name__}: {exc}")[:300]


def _send_file(chat_id: int, path: str, name: str, caption: str) -> None:
    """One part, with Telegram's flood answer obeyed and a retry on a transient
    failure — losing a part loses the photos in it, and the manifest names them."""
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            with open(path, "rb") as fh:
                r = requests.post(
                    f"{_API}/bot{settings.telegram_bot_token}/sendDocument",
                    data={"chat_id": chat_id, "caption": caption[:1000]},
                    files={"document": (name, fh, "application/zip")},
                    timeout=900)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = _clean(f"{type(exc).__name__}: {exc}")
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, PART_PAUSE_S * attempt))
    raise RuntimeError(_clean(last or "sendDocument failed")[:300])


def _say(chat_id: int, text: str) -> None:
    try:
        requests.post(f"{_API}/bot{settings.telegram_bot_token}/sendMessage",
                      data={"chat_id": chat_id, "text": text[:4000]}, timeout=60)
    except Exception:
        log.warning("t11 proof report: message failed", exc_info=True)


# ── progress ─────────────────────────────────────────────────────────────────

def _load_progress() -> dict:
    s = SessionLocal()
    try:
        row = s.query(AppSetting).filter_by(key=PROGRESS_KEY).first()
        return json.loads(row.value) if row and row.value else {}
    except Exception:
        log.warning("t11 proof report: progress unreadable", exc_info=True)
        return {}
    finally:
        s.close()


def _save_progress(prog: dict) -> None:
    """Its own short session: the caller's is idle for the whole run and must
    stay that way."""
    s = SessionLocal()
    try:
        value = json.dumps(prog, separators=(",", ":"))
        row = s.query(AppSetting).filter_by(key=PROGRESS_KEY).first()
        if row:
            row.value = value
        else:
            s.add(AppSetting(key=PROGRESS_KEY, value=value))
        s.commit()
    except Exception:
        s.rollback()
        log.warning("t11 proof report: progress not saved", exc_info=True)
    finally:
        s.close()


# ── delivery ─────────────────────────────────────────────────────────────────

def send(db: Session, chat_id: int, *_window) -> int:
    """Fetch every T11 proof photo of the window and DM them with the manifest.
    Returns how many ZIP parts have gone out, across every run.

    The window `_send_report_once` passes is ignored — the days are `DATES`. The
    read transaction is ended before the downloads begin: the manifest holds
    plain values by then, and a session left open across hundreds of Telegram
    fetches is a connection held for nothing.
    """
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")

    prog = _load_progress()
    if prog.get("closed"):
        return int(prog.get("parts") or 0)

    report, images = collect(db, chat_id)
    db.rollback()
    blob = json.dumps(report, ensure_ascii=False, indent=1, default=str).encode()
    # What the manifest costs inside a part once deflated, measured rather than
    # guessed: it rides in every part and counts against every part's cap.
    blob_z = len(zlib.compress(blob)) + 512
    c = report["counts"]
    v = c["ai_verdict"]

    sent_keys = set(prog.get("sent") or [])
    part_no = int(prog.get("parts") or 0)
    if not prog.get("started"):
        _say(chat_id, (
            f"T11 isbotlari (21–27-sentabr) tayyorlanmoqda: {c['proofs']} ta isbot, "
            f"{c['photos']} ta rasm (AI rad etgan: {v.get('rejected', 0)}). ZIP "
            f"qismlar ketma-ket keladi, har birida bir xil t11-proofs.json bor; "
            f"oxirida yakuniy xabar keladi."))
        prog["started"] = _t(datetime.now(TZ))
        _save_progress(prog)

    todo = [im for im in images if im["key"] not in sent_keys]
    failed: dict[str, str] = {}
    tmp = os.path.join(tempfile.gettempdir(), "t11-proofs-sep21-27")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)

    zf = None
    part_path = None
    part_size = 0
    part_keys: list[str] = []
    capped = False

    def _open_part() -> None:
        nonlocal zf, part_path, part_size, part_no
        part_no += 1
        part_path = os.path.join(tmp, f"part-{part_no}.zip")
        zf = zipfile.ZipFile(part_path, "w")
        zf.writestr(MANIFEST, blob, compress_type=zipfile.ZIP_DEFLATED)
        part_size = blob_z

    def _ship() -> None:
        nonlocal zf, part_keys
        zf.close()
        _send_file(chat_id, part_path, f"{ROOT}-{part_no:02d}.zip",
                   f"T11 isbotlari, 21–27-sentabr — {part_no}-qism. Ichida "
                   f"{ROOT}/t11-proofs.json (har qismda bir xil). Barcha "
                   f"qismlarni bitta joyga chiqaring — bitta papka bo'ladi.")
        os.remove(part_path)
        sent_keys.update(part_keys)
        prog["parts"] = part_no
        prog["sent"] = sorted(sent_keys)
        _save_progress(prog)
        zf, part_keys = None, []
        time.sleep(PART_PAUSE_S)

    pool = ThreadPoolExecutor(max_workers=FETCH_WORKERS)
    try:
        for start in range(0, len(todo), FETCH_WINDOW):
            batch = todo[start:start + FETCH_WINDOW]
            results = list(pool.map(_fetch_safe, [im["file_id"] for im in batch]))
            for im, (data, err) in zip(batch, results):
                if err is not None:
                    failed[im["key"]] = f"{im['file'][len(ROOT) + 1:]} — {err}"
                    continue
                # Checked BEFORE the photo goes in, so no part can grow past
                # the cap and be refused whole by Telegram.
                if zf is not None and part_size + len(data) > PART_BYTES:
                    _ship()
                if zf is None:
                    if part_no >= MAX_PARTS:
                        capped = True
                        break
                    _open_part()
                zf.writestr(im["file"], data, compress_type=zipfile.ZIP_STORED)
                part_keys.append(im["key"])
                part_size += len(data) + 512
            if capped:
                break
        if zf is not None:
            _ship()
        # The manifest must reach the chat even when there was nothing to fetch,
        # or every fetch failed — the verdicts are half of what was asked for.
        if part_no == 0:
            _open_part()
            _ship()
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        if zf is not None:
            zf.close()
        shutil.rmtree(tmp, ignore_errors=True)

    packed = sum(1 for im in images if im["key"] in sent_keys)
    dec = c["admin_decisions"]
    lines = [
        "T11 isbotlari (21–27-sentabr) — yuborildi.",
        f"Isbotlar: {c['proofs']} (AI o'tkazdi {v.get('passed', 0)}, AI rad etdi "
        f"{v.get('rejected', 0)}, navbatda {v.get('pending', 0)}, xato "
        f"{v.get('error', 0)}, AI ga yuborilmagan {v.get('not_reviewed', 0)}).",
        f"Admin tasdiqlagan: siz {dec['approved_by_you']}, boshqa admin "
        f"{dec['approved_by_other_admin']}"
        + (f", aniqlanmagan {dec['approved_by_unknown']}"
           if dec["approved_by_unknown"] else "")
        + f". Admin rad etgan: {dec['admin_rejected']}.",
        f"AI rad etgan va hanuz hisobga olinmagan: "
        f"{c['ai_rejected_and_still_not_counted']}.",
        f"Yuborildi: {packed} / {len(images)} ta rasm, {part_no} ta ZIP qism.",
        "Barcha qismlarni BITTA joyga chiqaring — t11-proofs.json har qismda bir "
        "xil; qisqa ro'yxatlar: ai_rejected, you_approved.",
    ]
    if capped:
        lines.append(f"⚠ TO'LIQ EMAS — {MAX_PARTS} ta qismdan keyin to'xtatildi "
                     f"({len(images) - packed} ta rasm yuborilmadi).")
    if failed:
        lines.append(f"Olib bo'lmadi: {len(failed)} ta rasm.")
        lines += [f"  · {f}" for f in list(failed.values())[:ERRORS_NAMED]]
        if len(failed) > ERRORS_NAMED:
            lines.append(f"  · …va yana {len(failed) - ERRORS_NAMED} ta.")
    _say(chat_id, "\n".join(lines))
    _save_progress({"closed": True, "parts": part_no, "started": prog.get("started"),
                    "photos_sent": packed, "photos_failed": len(failed)})
    return part_no
