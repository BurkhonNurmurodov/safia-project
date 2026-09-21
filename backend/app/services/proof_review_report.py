"""Every proof of 19 and 20 September, with what the AI made of each — DMed once.

The operator asked, on 2026-09-21, for all the proof photos of the checklist
days 19.09 and 20.09 (both shifts) as a ZIP, with a JSON file inside saying for
every proof: whose it is, which task, when it was filed, the text the AI judged
it against, what the AI decided and — where it flagged — why; which flagged
proofs an admin approved afterwards; and which objections were upheld. They are
the first two days of the new checklist rules (`leader_rules_sep19`) and 20.09
the first day of the automatic checks (`leader_auto`), so this is the evidence
of how the new texts are being judged. This platform has no shell, so the answer
is a boot job like every other one-off in `startup.py`.

It READS, and writes nothing but its own flag and its own progress row. Every
figure comes from the platform's own functions: a day's score and its overlays
from `leader_reports.day_report` (the day-report page's one read), and the text
the AI was given from `leader_ai.criteria_for` / `task_label` / `task_note` /
`date_rule_for`, called exactly as `leader_ai.review_one` calls them — so the
file cannot tell a different story from the pages it summarises.

**The criteria printed are TODAY's.** A verdict row stores no copy of the text
it was judged against, so what is printed is what the chain resolves to now.
Every `ltask.criteria_set` in the action register after a verdict was written is
named beside it (`criteria_edits_after_review`) — the only honest way to say
whether the two can differ.

**All of it, not a sample.** The operator named two days, which is the kind of
narrowing `proof_archive` says to ask for; on the 11 Sep copy a day is ~1,300
photos, so two are ~15 parts. `MAX_PARTS` stays as a ceiling against a runaway
and the run SAYS so if it stops there. Photos are fetched `FETCH_WORKERS` at a
time: the week-long run that flooded the chat on 2026-09-18 fetched them one by
one, which is what made every part take three minutes.

**A restart RESUMES, it never starts over.** Every push to `main` restarts the
unit, and a run this size spans minutes, so a deploy landing mid-run is likely —
and `_send_report_once` would then repeat the whole errand from part one. The
progress row (`PROGRESS_KEY`) records which photos have already gone out; the
next boot sends only the rest and numbers its parts on from where the last run
stopped.

The manifest is complete before the first byte is downloaded — a photo's path
in the zip is derived from the database alone, and `sendPhoto` re-encodes every
proof to JPEG — so an identical `report.json` rides in EVERY part: unzip all of
them into one folder and it is one tree with one report. No photo is resized or
re-encoded: the bytes are the archive channel's own.

Delete this module together with `startup.report_proof_review_sep19_20`,
`startup._proof_review_job` and the call in BOTH entrypoints once the files have
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
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    ActionLog, AppSetting, Cell, Factory, LeaderAiDispute, LeaderAiReview,
    LeaderLateProof, LeaderLateProofMedia, LeaderTaskDay, LeaderTaskDef,
    LeaderTaskEntry, LeaderTaskLeaderSetting, LeaderTaskMedia, LeaderTaskPhoto,
    LeaderTaskSetting, Manager, RoleProfile,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))            # the plant's wall clock
DATES = ("2026-09-19", "2026-09-20")         # the CHECKLIST days, both shifts
# Config edits are listed from the first moment either day could be judged.
SINCE = datetime(2026, 9, 19, tzinfo=TZ)

# Which photos have already gone out, so a restart resumes instead of repeating.
PROGRESS_KEY = "proof_review_sep19_20_2026_09_21_v1:progress"

# sendDocument refuses above 50 MB; the manifest rides in every part and the
# per-photo overhead is estimated, so the cap keeps a margin below it.
PART_BYTES = 45 * 1024 * 1024
# A ceiling on how much of the chat this errand may occupy — against a runaway,
# not a guess at the size (two days measure at ~15 parts).
MAX_PARTS = 30
PART_PAUSE_S = 3
SEND_RETRIES = 3

FETCH_WORKERS = 6        # Telegram downloads in flight at once
FETCH_WINDOW = 24        # photos held in memory between fetch and pack
FETCH_RETRIES = 4
FETCH_BACKOFF_S = 2

TEXT_MAX = 1500          # free text is cut, never dropped
ERRORS_NAMED = 20        # how many failed photos the closing message names

_API = "https://api.telegram.org"


# ── the words ────────────────────────────────────────────────────────────────
# The flag labels are the day report's own (components/leaders/DayReportView),
# with the sentence a reader needs when the label alone does not say what to do.

FLAG_TEXT = {
    "date_mismatch": {
        "uz": "Sana mos emas — rasm olingan vaqt ruxsat etilgan oraliqdan tashqarida.",
        "en": "Date does not match — the photo's time is outside the allowed window."},
    "no_date": {
        "uz": "Rasmda sana yo'q — qachon olingani tasdiqlanmadi.",
        "en": "No date on the photo — when it was taken could not be confirmed."},
    "off_topic": {
        "uz": "Rasm vazifaga mos emas — boshqa narsa suratga olingan.",
        "en": "Photo is not about this task — it shows something else."},
    "not_proven": {
        "uz": "Bajarilgani ko'rinmayapti — mezon (criteria) bo'yicha isbotlanmadi.",
        "en": "Does not show the work done — the criteria are not proven."},
    "unreadable": {
        "uz": "Rasm o'qilmadi.",
        "en": "Photo unreadable."},
}

STATUS_TEXT = {
    "ok": {"uz": "AI tekshirdi — belgi yo'q", "en": "Checked by the AI — no flag"},
    "flagged": {"uz": "AI belgi qo'ydi", "en": "Flagged by the AI"},
    "pending": {"uz": "AI navbatida", "en": "Queued for the AI"},
    "error": {"uz": "AI tekshira olmadi (texnik xato)", "en": "The AI could not check it (technical error)"},
    "skipped": {"uz": "O'tkazib yuborilgan", "en": "Skipped"},
    "not_reviewed": {"uz": "AI ga yuborilmagan", "en": "Never sent to the AI"},
}

FINAL_TEXT = {
    "passed_ai": {"uz": "AI tasdiqladi — hisobga olindi",
                  "en": "Passed the AI — counts"},
    "rejected_by_ai": {"uz": "AI belgi qo'ydi — vazifa bali olib tashlandi",
                       "en": "Flagged by the AI — the task lost its weight"},
    "flag_lifted_by_admin": {"uz": "AI belgi qo'ydi, keyin admin tasdiqladi — bal qaytarildi",
                             "en": "Flagged by the AI, approved by an admin afterwards — weight restored"},
    "rejected_by_admin": {"uz": "Admin rad etdi — bal olib tashlandi",
                          "en": "Rejected by an admin — the task lost its weight"},
    "admin_marked_done": {"uz": "Admin qo'lda «bajarildi» deb belgiladi",
                          "en": "An admin marked it done by hand"},
    "admin_marked_not_done": {"uz": "Admin qo'lda «bajarilmadi» deb belgiladi",
                              "en": "An admin marked it not done by hand"},
    "flagged_note_only": {"uz": "AI belgi qo'ydi, lekin bu kun avtomatik rejimda emas — bal olinmadi",
                          "en": "Flagged, but the day is outside the automatic regime — no deduction"},
    "awaiting_ai": {"uz": "Hali AI navbatida", "en": "Still queued for the AI"},
    "ai_error": {"uz": "AI tekshira olmadi — bal olinmaydi",
                 "en": "The AI could not check it — never counted against the leader"},
    "skipped": {"uz": "O'tkazib yuborilgan", "en": "Skipped"},
    "not_reviewed": {"uz": "AI ga yuborilmagan", "en": "Never sent to the AI"},
}

RESOLUTION_TEXT = {
    "approved": {"uz": "Admin: AI xato qildi — belgi olib tashlandi, bal qaytarildi",
                 "en": "Admin: the AI was wrong — flag lifted, weight restored"},
    "rejected": {"uz": "Admin: AI to'g'ri — vazifa hisobga olinmaydi",
                 "en": "Admin: the AI was right — the task does not count"},
    "requeried": {"uz": "Admin: qayta topshirish so'raldi (bal hali qaytmagan)",
                  "en": "Admin: asked for a re-filing (no weight restored yet)"},
}

OBJECTION_TEXT = {
    "supervisor": {"uz": "Brigadirda (1-bosqich)", "en": "With the brigadir (stage 1)"},
    "admin": {"uz": "Adminda (2-bosqich)", "en": "With the admins (stage 2)"},
    "approved": {"uz": "Qabul qilindi — bal qaytarildi", "en": "Upheld — weight restored"},
    "rejected": {"uz": "Rad etildi", "en": "Refused"},
    "cancelled": {"uz": "Qaror bekor qilindi", "en": "Ruling taken back"},
}

MODE_TEXT = {
    "strict": {"uz": "Sana VA soat ruxsat etilgan oraliqda bo'lishi kerak",
               "en": "Both the day and the hour must fall inside the window"},
    "date_only": {"uz": "Faqat sana tekshiriladi (soat emas)",
                  "en": "Only the day is checked, not the hour"},
    "time_only": {"uz": "Faqat soat tekshiriladi (sana emas)",
                  "en": "Only the hour is checked, not the day"},
    "not_checked": {"uz": "Sana ham, soat ham tekshirilmaydi",
                    "en": "Neither the day nor the hour is checked"},
}

LATE_TEXT = {
    "supervisor": {"uz": "Brigadirda", "en": "With the brigadir"},
    "admin": {"uz": "Adminda", "en": "With the admins"},
    "approved": {"uz": "Tasdiqlandi — to'liq bal", "en": "Approved — full weight"},
    "rejected": {"uz": "Rad etildi", "en": "Rejected"},
}

HOW_TO_READ = {
    "uz": ("Barcha ZIP qismlarini BITTA papkaga chiqaring — report.json har bir "
           "qismda bir xil. proofs[] — har bir isbot (bitta vazifaning javobi): "
           "kim (leader, unit = brigadir), qaysi vazifa (task), qachon (answer: "
           "filed_at — lider javob bergan, submitted_at — topshirilgan; rasmda "
           "ilova kamerasi bo'lsa photos[].captured_at — server vaqti), AI nimaga "
           "qarab tekshirgan (checked_against.criteria — AI ga berilgan mezon; "
           "leader_instruction — liderga ko'rsatilgan ko'rsatma, AI uni ko'rmaydi; "
           "date_rule — sana/soat qoidasi), AI natijasi (ai.status, ai.flags, "
           "ai.flag_reasons, ai.reason — AI ning o'z izohi, ai.date_reason — sana "
           "bo'yicha xulosa), admin qarori (admin_ruling), qo'lda belgi "
           "(manual_override), norozilik (objection) va yakun (result.final). "
           "photos[].file — ZIP ichidagi rasm yo'li. AI har vazifadan birinchi 4 "
           "ta rasmni ko'radi (photos[].sent_to_ai). photos[].same_photo_as — "
           "xuddi shu rasm boshqa vazifa isboti sifatida ham topshirilgan (ZIP da "
           "bir marta saqlangan). Mezon matni HOZIRGI "
           "sozlamadan olingan — tekshiruvdan keyin o'zgargan bo'lsa, "
           "criteria_edits_after_review da ko'rsatilgan. Qisqa ro'yxatlar: "
           "flagged (AI belgi qo'yganlar), flagged_then_admin_approved (belgi "
           "qo'yilib, keyin admin tasdiqlaganlar), objections_approved (qabul "
           "qilingan noroziliklar)."),
    "en": ("Unzip EVERY part into ONE folder — report.json is identical in each "
           "part. proofs[] = one proof (one task's answer): who (leader, unit = "
           "the brigadir), which task, when (answer.filed_at = when the leader "
           "answered, submitted_at = when it was submitted; for in-app camera "
           "shots photos[].captured_at is the server's clock), what the AI "
           "checked it against (checked_against.criteria = the text the AI was "
           "given; leader_instruction = what the leader is told, never shown to "
           "the AI; date_rule = the date/time rule), the AI's result (ai.status, "
           "ai.flags, ai.flag_reasons, ai.reason = the AI's own words, "
           "ai.date_reason = the date verdict), the admin's ruling "
           "(admin_ruling), a manual override, the objection and the final "
           "effect on the score (result.final). photos[].file is the path inside "
           "the zip. The AI sees the first 4 photos of a task "
           "(photos[].sent_to_ai). photos[].same_photo_as = the very same "
           "picture was also filed as another task's proof (stored once in the "
           "zip). The criteria are resolved from TODAY's "
           "configuration — any edit after the verdict is listed in "
           "criteria_edits_after_review. Short lists: flagged, "
           "flagged_then_admin_approved, objections_approved."),
}


# ── plain values ─────────────────────────────────────────────────────────────

def _t(v):
    """An instant on the plant's own clock; anything else unchanged."""
    if isinstance(v, datetime):
        return (v.astimezone(TZ) if v.tzinfo else v).isoformat(timespec="seconds")
    return v


def _cut(v):
    return v[:TEXT_MAX] if isinstance(v, str) else v


def _as_local(value: str | None):
    """A flag's stored UTC ISO stamp, restated on the plant's clock."""
    if not value:
        return None
    try:
        return _t(datetime.fromisoformat(value))
    except ValueError:
        return value


def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


_SLUG_DROP = re.compile(r"[^\w\-. ]", re.UNICODE)


def _slug(v, fallback: str = "-") -> str:
    """A path segment out of a person's or a unit's name — Cyrillic and Latin
    both survive (zip entry names are UTF-8); only what a path cannot carry is
    dropped, and the length is capped so the tree stays inside every
    filesystem's own limit."""
    s = _SLUG_DROP.sub("", str(v or "")).strip().replace(" ", "_")
    return s[:48] or fallback


def _mode(rule) -> str:
    """The date rule's four shapes, named — `leader_ai.expected_text`'s switch."""
    if not rule.checked or not (rule.dayed or rule.timed):
        return "not_checked"
    if rule.dayed and rule.timed:
        return "strict"
    return "date_only" if rule.dayed else "time_only"


def _count(bucket: dict, key) -> None:
    key = "none" if key is None else str(key)
    bucket[key] = bucket.get(key, 0) + 1


# ── the manifest ─────────────────────────────────────────────────────────────

def collect(db: Session) -> tuple[dict, list[dict]]:
    """(report, images) — built from the database alone.

    `report` is report.json. `images` is what the packer fetches, in zip order:
    one `{key, file_id, file}` per picture, where `key` is the stable row id the
    progress record remembers. Every row is copied into plain values first, so
    nothing assembled here is disturbed by a rollback inside a day report.
    """
    from app.services import (
        leader_ai, leader_bot, leader_dispute, leader_late_proof, leader_reports,
    )
    from app.services import leader_tasks as lt

    now = datetime.now(TZ)

    # ── lookups, by column ───────────────────────────────────────────────────
    units = {r.id: {"name": r.name, "shift": r.shift, "factory_id": r.factory_id}
             for r in db.query(Manager.id, Manager.name, Manager.shift,
                               Manager.factory_id).all()}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name).all())
    cells = dict(db.query(Cell.id, Cell.verifix_code).all())
    factories = {r.id: (r.name_uz or r.code)
                 for r in db.query(Factory.id, Factory.name_uz, Factory.code).all()}
    defs = {r.id: {"uz": r.name_uz, "ru": r.name_ru,
                   "weight": int(r.default_weight or 0)}
            for r in db.query(LeaderTaskDef.id, LeaderTaskDef.name_uz,
                              LeaderTaskDef.name_ru,
                              LeaderTaskDef.default_weight).all()}
    try:
        per_task = set(lt.per_task_units(db))
    except Exception:
        db.rollback()
        per_task = set()

    # ── the rows, copied into plain values ───────────────────────────────────
    days = [{"id": d.id, "leader_id": d.leader_id, "manager_id": d.manager_id,
             "date": d.date, "cell_id": d.cell_id, "closed_at": d.closed_at}
            for d in db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.date.in_(DATES)).all()]

    def _day_order(d: dict):
        u = units.get(d["manager_id"]) or {}
        return (d["date"], u.get("shift") or 9, str(u.get("name") or ""),
                str(leaders.get(d["leader_id"]) or ""),
                str(cells.get(d["cell_id"]) or ""), d["id"])
    days.sort(key=_day_order)
    day_by_id = {d["id"]: d for d in days}
    day_ids = list(day_by_id)

    entries: list[dict] = []
    media: dict[int, list[dict]] = {}
    shots: list[dict] = []
    lates: list[dict] = []
    late_media: dict[int, list[dict]] = {}
    if day_ids:
        entries = [{"id": e.id, "day_id": e.day_id, "task_id": e.task_id,
                    "done": bool(e.done), "reason": e.reason,
                    "saved_at": e.saved_at, "closed_at": e.closed_at}
                   for e in db.query(LeaderTaskEntry)
                   .filter(LeaderTaskEntry.day_id.in_(day_ids)).all()]
        if entries:
            for m in (db.query(LeaderTaskMedia)
                      .filter(LeaderTaskMedia.entry_id.in_([e["id"] for e in entries]))
                      .order_by(LeaderTaskMedia.entry_id, LeaderTaskMedia.pos,
                                LeaderTaskMedia.id).all()):
                media.setdefault(m.entry_id, []).append(
                    {"id": m.id, "file_id": m.file_id, "pos": m.pos})
        shots = [{"id": s.id, "day_id": s.day_id, "task_id": s.task_id,
                  "slot": s.slot, "file_id": s.file_id,
                  "captured_at": s.captured_at, "received_at": s.received_at,
                  "stamp": s.stamp, "late": bool(s.late),
                  "deferred": bool(s.deferred), "skew_s": s.skew_s}
                 for s in db.query(LeaderTaskPhoto)
                 .filter(LeaderTaskPhoto.day_id.in_(day_ids))
                 .order_by(LeaderTaskPhoto.day_id, LeaderTaskPhoto.task_id,
                           LeaderTaskPhoto.slot).all()]
        for lp in (db.query(LeaderLateProof)
                   .filter(LeaderLateProof.day_id.in_(day_ids))
                   .order_by(LeaderLateProof.id).all()):
            try:
                minutes = leader_late_proof.late_minutes(lp)
            except Exception:
                minutes = None
            lates.append({
                "id": lp.id, "day_id": lp.day_id, "task_id": lp.task_id,
                "status": lp.status, "reason": lp.reason, "deadline": lp.deadline,
                "due_at": lp.due_at, "created_at": lp.created_at,
                "late_minutes": minutes,
                "sup_action": lp.sup_action, "sup_note": lp.sup_note,
                "sup_by": lp.sup_by_name, "sup_at": lp.sup_at,
                "adm_action": lp.adm_action, "adm_note": lp.adm_note,
                "adm_by": lp.adm_by_name, "adm_at": lp.adm_at,
            })
        if lates:
            for lm in (db.query(LeaderLateProofMedia)
                       .filter(LeaderLateProofMedia.late_id.in_([x["id"] for x in lates]))
                       .order_by(LeaderLateProofMedia.late_id, LeaderLateProofMedia.pos,
                                 LeaderLateProofMedia.id).all()):
                late_media.setdefault(lm.late_id, []).append({
                    "id": lm.id, "file_id": lm.file_id, "pos": lm.pos,
                    "source": lm.source, "captured_at": lm.captured_at,
                    "received_at": lm.received_at, "stamp": lm.stamp})

    entry_by_ref = {leader_ai.bot_ref(e["id"]): e for e in entries}

    def _review(r: LeaderAiReview) -> dict:
        return {
            "id": r.id, "ref": r.ref, "source": r.source, "date": r.date,
            "task_id": r.task_id, "leader_id": r.leader_id,
            "manager_id": r.manager_id, "shift": r.shift, "status": r.status,
            "flags": list(r.flags or []), "image_date": r.image_date,
            "clocks": list(r.clocks or []),
            "reason": {"uz": r.reason_uz, "ru": r.reason_ru, "en": r.reason_en},
            "photos": r.photos, "model": r.model, "attempts": r.attempts,
            "error": r.error, "created_at": r.created_at,
            "reviewed_at": r.reviewed_at, "resolution": r.resolution,
            "resolved_by": r.resolved_by, "resolved_at": r.resolved_at,
            "resolution_note": r.resolution_note,
        }

    reviews = {r.ref: _review(r) for r in db.query(LeaderAiReview)
               .filter(LeaderAiReview.date.in_(DATES)).all()}
    # A verdict filed under one of these days' entries but dated otherwise is
    # still this report's business: the entry is what makes it a proof here.
    missing = [ref for ref in entry_by_ref if ref not in reviews]
    for i in range(0, len(missing), 500):
        for r in (db.query(LeaderAiReview)
                  .filter(LeaderAiReview.ref.in_(missing[i:i + 500])).all()):
            reviews[r.ref] = _review(r)

    disputes: list[dict] = []
    for d in (db.query(LeaderAiDispute)
              .filter(LeaderAiDispute.date.in_(DATES))
              .order_by(LeaderAiDispute.id).all()):
        disputes.append({
            "id": d.id, "ref": d.ref, "date": d.date, "task_id": d.task_id,
            "leader_id": d.leader_id, "leader_name": d.leader_name,
            "manager_id": d.manager_id, "status": d.status, "reason": d.reason,
            "requested_by_profile": d.requested_by_profile,
            "requested_by_name": d.requested_by_name,
            "requested_at": d.requested_at, "sup_action": d.sup_action,
            "sup_case": leader_dispute.sup_case(d), "sup_by": d.sup_by_name,
            "sup_at": d.sup_at, "decided_by": d.decided_by_name,
            "decided_at": d.decided_at, "decision_note": d.decision_note,
        })
    dispute_by_ref: dict[str, dict] = {}
    for d in disputes:
        dispute_by_ref[d["ref"]] = d            # newest wins, like the day report

    # ── the config edits since the rules, and when the rules landed ─────────
    config_changes: list[dict] = []
    criteria_edits: dict[int, list[tuple[datetime, int]]] = {}
    try:
        for a in (db.query(ActionLog)
                  .filter(ActionLog.category == "leader_config",
                          ActionLog.outcome == "done",
                          ActionLog.created_at >= SINCE)
                  .order_by(ActionLog.created_at, ActionLog.id).limit(2000).all()):
            config_changes.append({
                "log_id": a.id, "at": _t(a.created_at), "action": a.action,
                "actor": a.actor_name, "actor_role": a.actor_role,
                "source": a.source, "target_kind": a.target_kind,
                "target_id": a.target_id, "target_name": a.target_name,
                "unit": a.unit_name, "details": a.details, "changes": a.changes,
                "reason": _cut(a.reason)})
            if a.action == "ltask.criteria_set" and a.target_kind == "task":
                try:
                    tid = int(a.target_id)
                except (TypeError, ValueError):
                    continue
                criteria_edits.setdefault(tid, []).append((_aware(a.created_at), a.id))
    except Exception as exc:
        db.rollback()
        config_changes = [{"error": f"{type(exc).__name__}: {exc}"[:300]}]

    rules_in_force: dict = {}
    applied_at: dict[int, datetime] = {}
    try:
        from app import startup as S
        keys = {f"rules_19_09_shift{s}": k for s, k in S.LEADER_RULES_FLAGS.items()}
        keys["rules_19_09_global"] = S.LEADER_RULES_GLOBAL_FLAG
        keys.update({f"auto_checks_20_09_shift{s}": k
                     for s, k in S.LEADER_AUTO_FLAGS.items()})
        stored = {r.key: r.value for r in db.query(AppSetting)
                  .filter(AppSetting.key.in_(list(keys.values()))).all()}
        for name, key in keys.items():
            rules_in_force[name] = {"flag": key, "applied_at": _as_local(stored.get(key))}
        for s, key in S.LEADER_RULES_FLAGS.items():
            try:
                applied_at[s] = _aware(datetime.fromisoformat(stored[key]))
            except (KeyError, TypeError, ValueError):
                pass
    except Exception as exc:
        db.rollback()
        rules_in_force = {"error": f"{type(exc).__name__}: {exc}"[:300]}

    # ── what the AI was given, per (task, unit, leader, shift) ───────────────
    examples_cache: dict = {}
    against_cache: dict = {}

    def _against(task_id: int, mid, lid, shift) -> dict:
        k = (task_id, mid, lid, shift)
        hit = against_cache.get(k)
        if hit is not None:
            return hit
        own = (db.query(LeaderTaskLeaderSetting)
               .filter_by(leader_id=lid, task_id=task_id).first()) if lid else None
        sup = (db.query(LeaderTaskSetting)
               .filter_by(manager_id=mid, task_id=task_id).first()) if mid else None
        td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        criteria = leader_ai.criteria_for(db, task_id, mid, lid)
        level = next((name for name, row in (("leader", own), ("unit", sup),
                                             ("global", td))
                      if row is not None and (row.criteria or "").strip()), None)
        rule = leader_ai.date_rule_for(db, task_id, mid, lid, shift)
        ek = (mid, lid)
        if ek not in examples_cache:
            examples_cache[ek] = leader_ai.example_ids_map(
                db, manager_id=mid, leader_id=lid)
        hit = {
            "rule": rule,
            "out": {
                "task_name": leader_ai.task_label(db, task_id, mid, lid),
                "what_to_photograph": leader_ai.task_note(db, task_id) or None,
                "criteria": criteria or None,
                "criteria_level": level,
                "leader_instruction": lt._resolve_description(
                    (own, sup, td), criteria) or None,
                "example_photos_given_to_ai": len(
                    examples_cache[ek].get(task_id, [])),
                "date_rule": {
                    "mode": _mode(rule),
                    "mode_text": MODE_TEXT[_mode(rule)],
                    "window": list(rule.win),
                    "days_after_report_allowed": rule.plus,
                },
            },
        }
        against_cache[k] = hit
        return hit

    def _checked(date: str, task_id: int, mid, lid, shift) -> tuple[dict, object]:
        a = _against(task_id, mid, lid, shift)
        rule = a["rule"]
        expected = leader_ai.expected_text(
            date, shift, rule.win, check=rule.checked, days=rule.dayed,
            times=rule.timed, plus=rule.plus)
        out = dict(a["out"])
        out["date_rule"] = {**out["date_rule"], "expected": expected}
        return out, rule

    # ── the day reports: score, overlays, exclusions — the page's own read ──
    reports: dict[int, dict] = {}
    report_errors: dict[int, str] = {}
    for d in days:
        if d["closed_at"] is None:
            continue
        try:
            rep = leader_reports.day_report(db, leader_bot.day_uid(d["id"]))
        except Exception as exc:
            db.rollback()
            report_errors[d["id"]] = f"{type(exc).__name__}: {exc}"[:300]
            continue
        if rep:
            reports[d["id"]] = rep

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

    def _where(day: dict, task_id: int) -> dict:
        unit = units.get(day["manager_id"]) or {}
        td = defs.get(task_id) or {}
        uid = leader_bot.day_uid(day["id"])
        return {
            "date": day["date"],
            "shift": unit.get("shift"),
            "factory": factories.get(unit.get("factory_id")),
            "unit_id": day["manager_id"],
            "unit": unit.get("name"),
            "leader_id": day["leader_id"],
            "leader": leaders.get(day["leader_id"]),
            "cell_id": day["cell_id"],
            "cell_code": cells.get(day["cell_id"]) if day["cell_id"] else None,
            "task_id": task_id,
            "task": td.get("uz"),
            "task_ru": td.get("ru"),
            "day_id": day["id"],
            "report_url": leader_reports.report_url(uid),
        }

    def _path(w: dict, tail: str) -> str:
        """`proofs/<date>/smena<N>/<unit>/<leader>/<cell>/t<NN>_<tail>.jpg` —
        the tree answers "whose, which day, which task" on its own."""
        return "/".join((
            "proofs", w["date"], f"smena{w['shift'] or 0}",
            f"u{w['unit_id']}_{_slug(w['unit'])}",
            f"l{w['leader_id']}_{_slug(w['leader'])}",
            _slug(w["cell_code"], "yacheykasiz"),
            f"t{w['task_id']:02d}_{tail}.jpg",
        ))

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
            "brigadir": ({"action": d["sup_action"], "note": _cut(d["sup_case"]),
                          "by": d["sup_by"], "at": _t(d["sup_at"])}
                         if d["sup_action"] else None),
            "admin": ({"by": d["decided_by"], "at": _t(d["decided_at"]),
                       "note": _cut(d["decision_note"])}
                      if d["decided_at"] or d["decided_by"] else None),
        }

    images: list[dict] = []
    # file_id → (zip path, the proof that stored it). One picture is stored ONCE
    # — but a leader can file the same picture for two tasks, and each of those
    # proofs must still list it, so a repeat points at the stored copy and says
    # whose proof it came from.
    stored: dict[str, tuple[str, str]] = {}
    shot_by_file = {(s["day_id"], s["task_id"], s["file_id"]): s for s in shots}
    entries.sort(key=lambda e: (_day_order(day_by_id[e["day_id"]]), e["task_id"], e["id"]))

    proofs: list[dict] = []
    for e in entries:
        ms = media.get(e["id"]) or []
        if not ms:
            continue                       # no photo, no proof (auto tasks, «Yo'q»)
        day = day_by_id[e["day_id"]]
        w = _where(day, e["task_id"])
        ref = leader_ai.bot_ref(e["id"])
        rev = reviews.get(ref)
        # The verdict's OWN unit, leader and shift — exactly what review_one
        # handed the chain — and the day's where no verdict exists yet.
        if rev:
            mid, lid, shift = rev["manager_id"], rev["leader_id"], rev["shift"]
        else:
            mid, lid, shift = day["manager_id"], day["leader_id"], w["shift"]
        checked, rule = _checked(day["date"], e["task_id"], mid, lid, shift)

        rep = reports.get(day["id"])
        t = next((x for x in (rep.get("tasks") or []) if x.get("id") == e["task_id"]),
                 None) if rep else None

        photos: list[dict] = []
        for i, m in enumerate(ms):
            s = shot_by_file.get((day["id"], e["task_id"], m["file_id"]))
            reused = stored.get(m["file_id"])
            if reused:
                path = reused[0]
            else:
                path = _unique(_path(w, f"e{e['id']}_p{m['pos']}"))
                stored[m["file_id"]] = (path, f"e{e['id']}")
                images.append({"key": f"m{m['id']}", "file_id": m["file_id"], "file": path})
            photos.append({
                "file": path, "pos": m["pos"],
                "same_photo_as": reused[1] if reused else None,
                "source": "camera" if s else "telegram",
                "captured_at": _t(s["captured_at"]) if s else None,
                "received_at": _t(s["received_at"]) if s else None,
                "stamp": s["stamp"] if s else None,
                "late": s["late"] if s else None,
                "deferred": s["deferred"] if s else None,
                "sent_to_ai": bool(rev and rev["status"] in ("ok", "flagged")
                                   and i < leader_ai.MAX_IMAGES),
            })

        ai: dict = {"status": "not_reviewed", "status_text": STATUS_TEXT["not_reviewed"]}
        if rev:
            flags = rev["flags"]
            ai = {
                "status": rev["status"],
                "status_text": STATUS_TEXT.get(rev["status"]),
                "flags": flags,
                "flag_reasons": [{"flag": f, **FLAG_TEXT.get(f, {"uz": f, "en": f})}
                                 for f in flags],
                "reason": {l: _cut(v) for l, v in rev["reason"].items()},
                "clocks_read": rev["image_date"],
                "clocks": rev["clocks"],
                "photos_sent_to_ai": rev["photos"],
                "model": rev["model"],
                "queued_at": _t(rev["created_at"]),
                "reviewed_at": _t(rev["reviewed_at"]),
                "attempts": rev["attempts"],
                "error": _cut(rev["error"]),
                # Inside the automatic regime a flag costs the task its weight
                # with nobody pressing anything; outside it a flag is a note.
                "flags_cost_points": leader_ai.in_auto_regime(rev["date"], rev["shift"]),
            }
            if rev["status"] in ("ok", "flagged"):
                prose = leader_ai.date_prose(
                    rev["clocks"], rev["date"], rule.win, check=rule.checked,
                    days=rule.dayed, times=rule.timed, plus=rule.plus,
                    shift=rev["shift"])
                ai["date_reason"] = {l: prose.get(l) for l in ("uz", "ru", "en")}
            ra = _aware(rev["reviewed_at"])
            rules_at = applied_at.get(rev["shift"])
            ai["judged_before_19_09_rules_applied"] = (
                (ra < rules_at) if ra and rules_at else None)

        ruling = None
        if rev and rev["resolution"]:
            ruling = {"resolution": rev["resolution"],
                      "resolution_text": RESOLUTION_TEXT.get(rev["resolution"]),
                      "by": rev["resolved_by"], "at": _t(rev["resolved_at"]),
                      "note": _cut(rev["resolution_note"])}
        override = None
        if t and t.get("admin_done") is not None:
            override = {"done": bool(t["admin_done"]), "by": t.get("admin_by"),
                        "at": t.get("admin_at")}
        obj = _objection(dispute_by_ref.get(ref))

        # What the platform counts, off the day report's own overlays; the
        # admin's hand ruling wins over everything, as it does on the page.
        if t and t.get("admin_done") is not None:
            final = "admin_marked_done" if t["admin_done"] else "admin_marked_not_done"
        elif rev and rev["resolution"] == "rejected":
            final = "rejected_by_admin"
        elif (t and t.get("ai_rejected")) or (
                t is None and rev and rev["status"] == "flagged"
                and rev["resolution"] != "approved"
                and leader_ai.in_auto_regime(rev["date"], rev["shift"])):
            final = "rejected_by_ai"
        elif rev and rev["status"] == "flagged":
            final = ("flag_lifted_by_admin" if rev["resolution"] == "approved"
                     else "flagged_note_only")
        elif rev and rev["status"] == "ok":
            final = "passed_ai"
        elif rev and rev["status"] == "pending":
            final = "awaiting_ai"
        elif rev and rev["status"] == "error":
            final = "ai_error"
        elif rev and rev["status"] == "skipped":
            final = "skipped"
        else:
            final = "not_reviewed"
        if t is None:
            counts = None
        elif t.get("admin_done") is not None:
            counts = bool(t["admin_done"])
        else:
            counts = bool(t.get("done")) and not t.get("ai_rejected")

        ra = _aware(rev["reviewed_at"]) if rev else None
        edits = [log_id for at, log_id in criteria_edits.get(e["task_id"], [])
                 if ra and at and at > ra]

        proofs.append({
            "proof_id": f"e{e['id']}",
            "kind": "checklist",
            **w,
            "task_weight": (defs.get(e["task_id"]) or {}).get("weight"),
            "answer": {
                "done": e["done"],
                "filed_at": _t(e["saved_at"]),
                "submitted_at": _t(e["closed_at"] or day["closed_at"]),
                "task_closed_at": _t(e["closed_at"]),
                "day_closed_at": _t(day["closed_at"]),
                "unit_closes_per_task": day["manager_id"] in per_task,
            },
            "photos": photos,
            "checked_against": checked,
            "criteria_edits_after_review": edits,
            "ai": ai,
            "admin_ruling": ruling,
            "manual_override": override,
            "objection": obj,
            "result": {"final": final, "final_text": FINAL_TEXT[final],
                       "counts_in_score": counts},
        })

    # ── shots of a camera roll that never became an answer ───────────────────
    roll: dict[tuple, dict] = {}
    for s in shots:
        if s["file_id"] in stored:
            continue                       # mirrored into an answer — listed there
        day = day_by_id.get(s["day_id"])
        if not day:
            continue
        k = (s["day_id"], s["task_id"])
        if k not in roll:
            roll[k] = {"kind": "camera_roll", **_where(day, s["task_id"]), "photos": []}
        path = _unique(_path(roll[k], f"roll{s['id']}_s{s['slot']}"))
        stored[s["file_id"]] = (path, f"roll{s['id']}")
        images.append({"key": f"r{s['id']}", "file_id": s["file_id"], "file": path})
        roll[k]["photos"].append({
            "file": path, "slot": s["slot"], "source": "camera",
            "captured_at": _t(s["captured_at"]), "received_at": _t(s["received_at"]),
            "stamp": s["stamp"], "late": s["late"], "deferred": s["deferred"]})

    # ── late proofs — filed after the deadline, never sent to the AI ─────────
    late_out: list[dict] = []
    for lp in lates:
        day = day_by_id.get(lp["day_id"])
        if not day:
            continue
        w = _where(day, lp["task_id"])
        photos = []
        for lm in late_media.get(lp["id"]) or []:
            reused = stored.get(lm["file_id"])
            if reused:
                path = reused[0]
            else:
                path = _unique(_path(w, f"kech{lp['id']}_p{lm['pos']}"))
                stored[lm["file_id"]] = (path, f"kech{lp['id']}")
                images.append({"key": f"k{lm['id']}", "file_id": lm["file_id"],
                               "file": path})
            photos.append({
                "file": path, "pos": lm["pos"], "source": lm["source"] or "upload",
                "same_photo_as": reused[1] if reused else None,
                "captured_at": _t(lm["captured_at"]),
                "received_at": _t(lm["received_at"]), "stamp": lm["stamp"]})
        late_out.append({
            "late_proof_id": lp["id"], "kind": "late_proof", **w,
            "deadline": lp["deadline"], "due_at": _t(lp["due_at"]),
            "filed_at": _t(lp["created_at"]), "late_minutes": lp["late_minutes"],
            "leader_reason": _cut(lp["reason"]),
            "status": lp["status"], "status_text": LATE_TEXT.get(lp["status"]),
            "brigadir": ({"action": lp["sup_action"], "note": _cut(lp["sup_note"]),
                          "by": lp["sup_by"], "at": _t(lp["sup_at"])}
                         if lp["sup_action"] else None),
            "admin": ({"action": lp["adm_action"], "note": _cut(lp["adm_note"]),
                       "by": lp["adm_by"], "at": _t(lp["adm_at"])}
                      if lp["adm_action"] else None),
            "photos": photos,
            "note": "Kechikkan isbot AI ga yuborilmaydi — brigadir va admin hal qiladi.",
        })

    # ── verdicts whose entry no longer exists (a reset, an admin «Tozalash») ─
    orphans = []
    for ref, rev in sorted(reviews.items(), key=lambda kv: (kv[1]["date"], kv[0])):
        if ref in entry_by_ref:
            continue
        orphans.append({
            "ref": ref, "source": rev["source"], "date": rev["date"],
            "shift": rev["shift"], "task_id": rev["task_id"],
            "task": (defs.get(rev["task_id"]) or {}).get("uz"),
            "unit": (units.get(rev["manager_id"]) or {}).get("name"),
            "leader": leaders.get(rev["leader_id"]),
            "status": rev["status"], "flags": rev["flags"],
            "reviewed_at": _t(rev["reviewed_at"]),
            "resolution": rev["resolution"],
            "note": ("Google Form qatori — rasmlari Drive'da, bu arxivga kirmagan."
                     if rev["source"] == "sheet" else
                     "Bu hukm yozilgan javob endi mavjud emas — rasmlari yo'q."),
        })

    # ── the day table ────────────────────────────────────────────────────────
    proofs_per_day: dict[int, int] = {}
    flagged_per_day: dict[int, int] = {}
    for p in proofs:
        proofs_per_day[p["day_id"]] = proofs_per_day.get(p["day_id"], 0) + 1
        if p["ai"].get("flags"):
            flagged_per_day[p["day_id"]] = flagged_per_day.get(p["day_id"], 0) + 1
    day_out = []
    for d in days:
        rep = reports.get(d["id"])
        u = units.get(d["manager_id"]) or {}
        uid = leader_bot.day_uid(d["id"])
        day_out.append({
            "uid": uid, "report_url": leader_reports.report_url(uid),
            "date": d["date"], "shift": u.get("shift"), "unit_id": d["manager_id"],
            "unit": u.get("name"), "leader_id": d["leader_id"],
            "leader": leaders.get(d["leader_id"]),
            "cell_code": cells.get(d["cell_id"]) if d["cell_id"] else None,
            "closed_at": _t(d["closed_at"]),
            "score_submitted": rep.get("rawScore") if rep else None,
            "score_verified": rep.get("score") if rep else None,
            "task_counts": rep.get("counts") if rep else None,
            "excluded": rep.get("excluded") if rep else None,
            "voided": rep.get("voided") if rep else None,
            "proofs": proofs_per_day.get(d["id"], 0),
            "flagged": flagged_per_day.get(d["id"], 0),
            "error": report_errors.get(d["id"]) or (
                None if rep else "day not closed" if d["closed_at"] is None
                else "day report unavailable"),
        })

    # ── the short lists the operator asked for ───────────────────────────────
    def _brief(p: dict) -> dict:
        return {"proof_id": p["proof_id"], "date": p["date"], "shift": p["shift"],
                "unit": p["unit"], "leader": p["leader"], "cell_code": p["cell_code"],
                "task_id": p["task_id"], "task": p["task"],
                "flags": p["ai"].get("flags") or [],
                "files": [ph["file"] for ph in p["photos"]],
                "report_url": p["report_url"]}

    flagged = [{**_brief(p), "ai_reason_uz": (p["ai"].get("reason") or {}).get("uz"),
                "ai_reason_en": (p["ai"].get("reason") or {}).get("en"),
                "final": p["result"]["final"]}
               for p in proofs if p["ai"].get("flags")]

    approved_after_flag = []
    for p in proofs:
        if not p["ai"].get("flags"):
            continue
        ruling, ov, obj = p["admin_ruling"], p["manual_override"], p["objection"]
        how = by = at = note = None
        if ruling and ruling["resolution"] == "approved":
            how = ("objection_upheld" if obj and obj["status"] == "approved"
                   else "admin_ruling_in_ai_queue")
            by, at, note = ruling["by"], ruling["at"], ruling["note"]
        elif ov and ov["done"]:
            how, by, at = "manual_override", ov["by"], ov["at"]
        if how:
            approved_after_flag.append({**_brief(p), "approved": {
                "how": how, "by": by, "at": at, "note": note,
                "objection_id": obj["id"] if obj else None}})

    proof_by_ref = {leader_ai.bot_ref(int(p["proof_id"][1:])): p for p in proofs}
    objections = []
    for d in disputes:
        p = proof_by_ref.get(d["ref"])
        rev = reviews.get(d["ref"])
        u = units.get(d["manager_id"]) or {}
        objections.append({
            **(_objection(d) or {}),
            "proof_id": p["proof_id"] if p else None,
            "date": d["date"], "shift": u.get("shift"), "unit": u.get("name"),
            "leader": d["leader_name"] or leaders.get(d["leader_id"]),
            "cell_code": p["cell_code"] if p else None,
            "task_id": d["task_id"], "task": (defs.get(d["task_id"]) or {}).get("uz"),
            "ai_flags": rev["flags"] if rev else [],
            "files": [ph["file"] for ph in p["photos"]] if p else [],
            "report_url": p["report_url"] if p else None,
        })
    objections_approved = [o for o in objections if o["status"] == "approved"]

    # ── counts ───────────────────────────────────────────────────────────────
    by_date: dict = {}
    ai_status: dict = {}
    final_counts: dict = {}
    flag_counts: dict = {}
    by_task: dict = {}
    for p in proofs:
        bd = by_date.setdefault(p["date"], {"proofs": 0, "photos": 0, "flagged": 0})
        bd["proofs"] += 1
        bd["photos"] += len(p["photos"])
        _count(ai_status, p["ai"]["status"])
        _count(final_counts, p["result"]["final"])
        for f in p["ai"].get("flags") or []:
            _count(flag_counts, f)
        bt = by_task.setdefault(str(p["task_id"]), {
            "task": p["task"], "proofs": 0, "flagged": 0, "lost_weight": 0,
            "approved_after_flag": 0})
        bt["proofs"] += 1
        if p["ai"].get("flags"):
            bt["flagged"] += 1
            bd["flagged"] += 1
        if p["result"]["final"] in ("rejected_by_ai", "rejected_by_admin",
                                    "admin_marked_not_done"):
            bt["lost_weight"] += 1
    for a in approved_after_flag:
        by_task[str(a["task_id"])]["approved_after_flag"] += 1
    obj_counts: dict = {}
    for o in objections:
        _count(obj_counts, o["status"])
    late_counts: dict = {}
    for lp in late_out:
        _count(late_counts, lp["status"])
    kinds: dict = {}
    for im in images:
        _count(kinds, {"m": "checklist", "r": "camera_roll", "k": "late_proof"}[im["key"][0]])

    report = {
        "title": "Isbotlar va AI tekshiruvi — 19 va 20 sentabr 2026",
        "generated_at": _t(now),
        "dates": list(DATES),
        "how_to_read": HOW_TO_READ,
        "legend": {
            "flags": FLAG_TEXT, "ai_status": STATUS_TEXT, "final": FINAL_TEXT,
            "admin_resolution": RESOLUTION_TEXT, "objection_status": OBJECTION_TEXT,
            "date_rule_mode": MODE_TEXT, "late_proof_status": LATE_TEXT,
        },
        "rules_in_force": rules_in_force,
        "counts": {
            "leader_days": len(days),
            "leader_days_closed": sum(1 for d in days if d["closed_at"] is not None),
            "proofs": len(proofs),
            "photos": len(images),
            "photos_by_kind": kinds,
            # The same picture filed as the proof of more than one task.
            "photos_reused_across_proofs": sum(
                1 for p in proofs for ph in p["photos"] if ph.get("same_photo_as")),
            "by_date": by_date,
            "ai_status": ai_status,
            "final": final_counts,
            "flags": flag_counts,
            "by_task": by_task,
            "flagged": len(flagged),
            "flagged_then_admin_approved": len(approved_after_flag),
            "objections": obj_counts,
            "objections_approved": len(objections_approved),
            "late_proofs": late_counts,
            "unsubmitted_camera_shots": sum(len(r["photos"]) for r in roll.values()),
            "orphan_reviews": len(orphans),
        },
        "flagged": flagged,
        "flagged_then_admin_approved": approved_after_flag,
        "objections_approved": objections_approved,
        "objections": objections,
        "days": day_out,
        "proofs": proofs,
        "late_proofs": late_out,
        "unsubmitted_camera_shots": list(roll.values()),
        "orphan_reviews": orphans,
        "config_changes_since_19_09": config_changes,
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
    """One archived proof's bytes, with Telegram's own flood answer obeyed.

    Not `leader_ai.fetch_bot_image`: that opens a fresh client per call and gives
    up on the first 429, which a run fetching thousands of photos several at a
    time is certain to meet.
    """
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
        log.warning("proof review report: message failed", exc_info=True)


# ── progress ─────────────────────────────────────────────────────────────────

def _load_progress() -> dict:
    s = SessionLocal()
    try:
        row = s.query(AppSetting).filter_by(key=PROGRESS_KEY).first()
        return json.loads(row.value) if row and row.value else {}
    except Exception:
        log.warning("proof review report: progress unreadable", exc_info=True)
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
        log.warning("proof review report: progress not saved", exc_info=True)
    finally:
        s.close()


# ── delivery ─────────────────────────────────────────────────────────────────

def send(db: Session, chat_id: int, *_window) -> int:
    """Fetch every proof photo of the two days and DM them with the report.
    Returns how many ZIP parts have gone out, across every run.

    The window `_send_report_once` passes is ignored — the days are `DATES`. The
    read transaction is ended before the downloads begin: the manifest holds
    plain values by then, and a session left open across thousands of Telegram
    fetches is a connection held for nothing.
    """
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")

    prog = _load_progress()
    if prog.get("closed"):
        return int(prog.get("parts") or 0)

    report, images = collect(db)
    db.rollback()
    blob = json.dumps(report, ensure_ascii=False, indent=1, default=str).encode()
    # What the manifest costs inside a part once deflated, measured rather than
    # guessed: it rides in every part and counts against every part's cap.
    blob_z = len(zlib.compress(blob)) + 512
    c = report["counts"]

    sent_keys = set(prog.get("sent") or [])
    part_no = int(prog.get("parts") or 0)
    if not prog.get("started"):
        _say(chat_id, (
            f"19–20-sentabr isbotlari tayyorlanmoqda: {c['proofs']} ta isbot, "
            f"{c['photos']} ta rasm (AI belgi qo'ygan: {c['flagged']}). ZIP qismlar "
            f"ketma-ket keladi, har birida bir xil report.json bor; oxirida "
            f"yakuniy xabar keladi."))
        prog["started"] = _t(datetime.now(TZ))
        _save_progress(prog)

    todo = [im for im in images if im["key"] not in sent_keys]
    failed: dict[str, str] = {}
    stamp = "19-20-sentabr"
    tmp = os.path.join(tempfile.gettempdir(), "proof-review-sep19-20")
    shutil.rmtree(tmp, ignore_errors=True)
    os.makedirs(tmp, exist_ok=True)

    zf = None
    part_path = None
    part_size = 0
    part_keys: list[str] = []
    capped = False

    def _ship() -> None:
        nonlocal zf, part_keys
        zf.close()
        _send_file(chat_id, part_path, f"isbotlar-{stamp}-{part_no:02d}.zip",
                   f"19–20-sentabr isbotlari — {part_no}-qism. Ichida report.json "
                   f"(har qismda bir xil). Barcha qismlarni bitta papkaga chiqaring.")
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
                    failed[im["key"]] = f"{im['file']} — {err}"
                    continue
                # Checked BEFORE the photo goes in, so no part can grow past
                # the cap — a check after it lets the last photo carry a part
                # over Telegram's own limit, and the whole part is then refused.
                if zf is not None and part_size + len(data) > PART_BYTES:
                    _ship()
                if zf is None:
                    if part_no >= MAX_PARTS:
                        capped = True
                        break
                    part_no += 1
                    part_path = os.path.join(tmp, f"part-{part_no}.zip")
                    zf = zipfile.ZipFile(part_path, "w")
                    zf.writestr("report.json", blob, compress_type=zipfile.ZIP_DEFLATED)
                    part_size = blob_z
                zf.writestr(im["file"], data, compress_type=zipfile.ZIP_STORED)
                part_keys.append(im["key"])
                part_size += len(data) + 512
            if capped:
                break
        if zf is not None:
            _ship()
        # The report must reach the chat even when there was nothing to fetch,
        # or every fetch failed — the verdicts are half of what was asked for.
        if part_no == 0:
            part_no = 1
            part_path = os.path.join(tmp, "part-1.zip")
            zf = zipfile.ZipFile(part_path, "w")
            zf.writestr("report.json", blob, compress_type=zipfile.ZIP_DEFLATED)
            _ship()
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
        if zf is not None:
            zf.close()
        shutil.rmtree(tmp, ignore_errors=True)

    packed = sum(1 for im in images if im["key"] in sent_keys)
    st = c["ai_status"]
    lines = [
        "19–20-sentabr isbotlari — yuborildi.",
        f"Isbotlar: {c['proofs']} (AI: belgisiz {st.get('ok', 0)}, belgili "
        f"{st.get('flagged', 0)}, navbatda {st.get('pending', 0)}, xato "
        f"{st.get('error', 0)}, yuborilmagan {st.get('not_reviewed', 0)}).",
        f"AI belgi qo'yib, keyin admin tasdiqlagani: {c['flagged_then_admin_approved']}.",
        f"Qabul qilingan norozilik: {c['objections_approved']} "
        f"(jami norozilik: {sum(c['objections'].values())}).",
        f"Yuborildi: {packed} / {len(images)} ta rasm, {part_no} ta ZIP qism.",
        "Barcha qismlarni BITTA papkaga chiqaring — report.json har bir qismda bir xil; "
        "qisqa ro'yxatlar: flagged, flagged_then_admin_approved, objections_approved.",
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
