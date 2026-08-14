"""Day verification reports — the ledger, the DMs and the page payload.

When the automatic regime (shift 1, from `leader_ai.AUTO_FROM`) finishes every
task of one leader-day, two people are told: the unit's brigadir, because the
score they are measured on just became final, and the leader, because points
came off without anyone asking them. A deduction nobody is told about is the
fastest way to lose a workforce's trust in an automated system — they discover
it at the end of the month, in a number they cannot reconstruct.

Both messages carry a button onto ONE page (`/leaders/report/<uid>`) that shows
every task, its proof photos, the AI verdict and the window it was judged
against. The DM says what happened; the page says why. Neither re-derives the
score — `routers.leaders.build_report_row` is the single source, so the
register, the page and the message cannot print three different numbers for one
day.
"""

import logging
from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    LeaderAiDispute, LeaderAiReview, LeaderChecklist, LeaderDayReport,
    LeaderTaskDef, LeaderTaskEntry, LeaderTaskLeaderSetting, LeaderTaskSetting,
    Manager, RoleProfile,
)
from app.services import leader_ai

log = logging.getLogger(__name__)

# The label on the DM's «open the report» button, in the four UI languages.
# Kept here rather than borrowed from a notification template: it is a control,
# not a message, and a button that names an action has to survive any rewording
# of the sentence above it.
_BTN = {
    "uz": "Hisobotni ochish",
    "uz_cyrl": "Ҳисоботни очиш",
    "ru": "Открыть отчёт",
    "en": "Open the report",
}


# ── identity ─────────────────────────────────────────────────────────────────

def uid_of_key(db: Session, key: str) -> str | None:
    """`leader_ai.report_key()` → the uid `/api/leaders` prints for that report.

    The queue groups by report key; every other surface addresses a report by
    uid. One translation, here, rather than a second key form travelling into
    the page and the DM link.
    """
    if key.startswith("bot:"):
        try:
            return f"bot-{int(key.split(':')[1])}"
        except (IndexError, ValueError):
            return None
    if key.startswith("sheet:"):
        return key.split(":", 1)[1]
    if key.startswith("sheetd:"):
        parts = key.split(":")
        if len(parts) < 3:
            return None
        rows = (db.query(LeaderChecklist)
                .filter(LeaderChecklist.date == parts[1]).all())
        for row in rows:
            if (row.leader or "").strip().lower()[:60] == parts[2]:
                return leader_ai.row_uid(row)
    return None


def key_of_uid(db: Session, uid: str) -> str | None:
    """The inverse — used when a human ruling on one task has to find the day
    report that ruling belongs to."""
    if uid.startswith("bot-"):
        return f"bot:{uid[4:]}"
    row = (db.query(LeaderChecklist).filter_by(id=int(uid[4:])).first()
           if uid.startswith("row-") and uid[4:].isdigit()
           else db.query(LeaderChecklist).filter_by(submission_id=uid).first())
    if row is None:
        return None
    return leader_ai.report_key(leader_ai.sheet_ref(row, 0))


def ref_of_task(db: Session, uid: str, task_id: int) -> str | None:
    """The verdict ref for one task of one report — the durable key a dispute
    hangs off. Resolved through the same `_refs_for_uid` the verdict list uses,
    so a dispute can never be filed against a ref the page did not show."""
    from app.routers.leader_ai import _refs_for_uid
    for ref, tid in _refs_for_uid(db, uid).items():
        if tid == task_id:
            return ref
    return None


def uid_of_ref(db: Session, ref: str) -> str | None:
    return uid_of_key(db, leader_ai.report_key(ref, _day_of(db, [ref])))


def uids_of_refs(db: Session, refs: list[str]) -> dict[str, str]:
    """ref → report uid, in one pass. The dispute list needs a link per row and
    would otherwise walk the bot-entry table once per dispute."""
    if not refs:
        return {}
    day_of = _day_of(db, refs)
    out: dict[str, str] = {}
    for ref in set(refs):
        uid = uid_of_key(db, leader_ai.report_key(ref, day_of))
        if uid:
            out[ref] = uid
    return out


def _day_of(db: Session, refs: list[str]) -> dict[int, int]:
    ids = {int(r.split(":")[1]) for r in refs if r.startswith("bot:")}
    if not ids:
        return {}
    return {e.id: e.day_id for e in db.query(LeaderTaskEntry)
            .filter(LeaderTaskEntry.id.in_(ids)).all()}


# ── the page payload ─────────────────────────────────────────────────────────

def day_report(db: Session, uid: str) -> dict | None:
    """Everything the day-report page shows, in one read.

    One request on purpose: the page is opened from a Telegram DM, on a phone,
    by someone who wants to know why a number moved. A payload assembled from
    four round-trips renders in four steps, and the first three of them show a
    half-built answer to a question about fairness.
    """
    from app.routers.leaders import build_report_row
    from app.routers.leader_ai import _as_verdict, _refs_for_uid, _task_cfg, _window

    row = build_report_row(db, uid)
    if row is None:
        return None

    refs = _refs_for_uid(db, uid)                      # ref → task_id
    revs = (db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(refs.keys())).all()
            if refs else [])
    cfg = _task_cfg(db, revs) if revs else None
    by_task = {refs[r.ref]: r for r in revs if r.ref in refs}
    verdicts = {refs[r.ref]: _as_verdict(r, _window(cfg, r)) for r in revs
                if r.ref in refs}

    # Live disputes, so a task the brigadir already objected to offers the
    # state of that objection instead of the button that files another one.
    disputes: dict[int, LeaderAiDispute] = {}
    if refs:
        for d in (db.query(LeaderAiDispute)
                  .filter(LeaderAiDispute.ref.in_(refs.keys()))
                  .order_by(LeaderAiDispute.id).all()):
            tid = refs.get(d.ref)
            if tid is not None:
                disputes[tid] = d           # newest wins, exactly like late requests

    defs = {td.id: td for td in db.query(LeaderTaskDef).all()}
    names = _name_chain(db, row.get("manager_id"), row.get("leader_id"), defs)
    auto = leader_ai.in_auto_regime(row["date"], row.get("shift"))

    tasks = []
    for tk in (row.get("tasks") or []):
        tid = int(tk.get("id") or 0)
        td = defs.get(tid)
        rev = by_task.get(tid)
        d = disputes.get(tid)
        tasks.append({
            "id": tid,
            "name": names.get(tid) or {l: f"#{tid}" for l in leader_ai.LANGS},
            "note": {l: getattr(td, f"note_{l}", None) if td else None
                     for l in leader_ai.LANGS},
            "weight": (td.default_weight or 0) if td else 0,
            "answered": tk.get("answered") is not False,
            "done": bool(tk.get("done")),
            "reason": tk.get("reason") or "",
            "photo": tk.get("photo") or "",
            "media": tk.get("media") or [],
            # What the overlays did to this task, already computed by the same
            # code the register runs — never re-derived here.
            "ai_rejected": bool(tk.get("ai_rejected")),
            "admin_done": tk.get("admin_done"),
            "admin_by": tk.get("admin_by"),
            "admin_at": tk.get("admin_at"),
            "review": verdicts.get(tid),
            "queued": bool(rev and rev.status == "pending"),
            "dispute": _dispute_out(d) if d is not None else None,
        })

    total, checked, rejected, errored, pending = _tally(tasks)
    return {
        "uid": row["uid"],
        "date": row["date"],
        "shift": row.get("shift"),
        "source": row.get("source"),
        "submittedAt": row.get("submitted_at"),
        "leader": row.get("leader"),
        "leaderId": row.get("leader_id"),
        "supervisor": row.get("supervisor"),
        "managerId": row.get("manager_id"),
        # Voided by the filing-window rule — the day scores 0 for a reason that
        # has nothing to do with the photos, and the page has to say so or the
        # verified score below reads as a contradiction of the register.
        "voided": bool(row.get("rejected")),
        "lateState": row.get("late_state"),
        "lateBy": row.get("late_by"),
        "lateReason": row.get("late_reason"),
        "auto": auto,
        "autoFrom": leader_ai.AUTO_FROM,
        "score": round(float(row.get("completion") or 0)),
        "rawScore": round(float(row.get("raw_completion")
                                if row.get("raw_completion") is not None
                                else row.get("completion") or 0)),
        "counts": {"total": total, "checked": checked, "rejected": rejected,
                   "errors": errored, "pending": pending},
        "tasks": tasks,
    }


def _name_chain(db: Session, manager_id: int | None, leader_id: int | None,
                defs: dict) -> dict[int, dict[str, str]]:
    """task id → its name in all four languages, resolved leader → supervisor
    → global.

    **Precedence is LEVEL first, then language** — the same rule the triage
    queue uses. Resolving language-first lets a global `name_ru` beat the
    supervisor's own `name_uz`, so a task renamed for one unit would show its
    old wording to exactly the people who renamed it.

    One preload for the whole report: the per-row form costs three queries a
    task, which is thirty-nine for a page nobody is waiting on twice.
    """
    own = {r.task_id: r for r in db.query(LeaderTaskLeaderSetting)
           .filter_by(leader_id=leader_id).all()} if leader_id else {}
    sup = {r.task_id: r for r in db.query(LeaderTaskSetting)
           .filter_by(manager_id=manager_id).all()} if manager_id else {}

    def pick(src, lang: str) -> str | None:
        if src is None:
            return None
        vals = {l: (getattr(src, f"name_{l}", None) or "").strip()
                for l in leader_ai.LANGS}
        if not any(vals.values()):
            return None                      # level says nothing → fall through
        return (vals.get(lang) or vals.get("ru") or vals.get("uz")
                or vals.get("en") or None)

    out: dict[int, dict[str, str]] = {}
    for tid in set(defs) | set(own) | set(sup):
        row: dict[str, str] = {}
        for lang in leader_ai.LANGS:
            row[lang] = (pick(own.get(tid), lang) or pick(sup.get(tid), lang)
                         or pick(defs.get(tid), lang) or f"#{tid}")
        out[tid] = row
    return out


def _dispute_out(d) -> dict:
    return {
        "id": d.id, "status": d.status, "reason": d.reason,
        "by": d.requested_by_name,
        "at": d.requested_at.isoformat() if d.requested_at else None,
        "decidedBy": d.decided_by_name,
        "decidedAt": d.decided_at.isoformat() if d.decided_at else None,
        "note": d.decision_note,
    }


def _tally(tasks: list[dict]) -> tuple[int, int, int, int, int]:
    """total answered · verdicts written · rejected · technical errors · queued.

    An `error` row is counted apart from a rejection on purpose: it is the
    platform failing to fetch a photo, not a leader failing to take one, and
    the two must never be added into one number a person is judged by.
    """
    total = checked = rejected = errored = pending = 0
    for t in tasks:
        if not t["answered"]:
            continue
        total += 1
        rev = t.get("review")
        if t["ai_rejected"]:
            rejected += 1
        if rev and rev["status"] in ("ok", "flagged"):
            checked += 1
        elif rev and rev["status"] == "error":
            errored += 1
        elif t.get("queued"):
            pending += 1
    return total, checked, rejected, errored, pending


# ── the report DM ────────────────────────────────────────────────────────────

def report_url(uid: str) -> str:
    """The mini-app URL for one day report. The uid is quoted: it is a form
    submission id we did not mint, and one stray character in a Telegram
    web_app URL is a button that opens a 404 instead of the report."""
    return f"{settings.webapp_url.rstrip('/')}/leaders/report/{quote(uid, safe='')}"


def _button_markup(url: str):
    """A per-language «open the report» button factory for notify_profile.

    A web_app button, not a plain URL one: the page is inside the mini-app and
    needs the initData the WebView supplies. A t.me link would open a browser
    session with no identity and land the brigadir on a login screen.
    """
    from telebot import types

    def make(lang: str):
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(
            _BTN.get(lang) or _BTN["ru"],
            web_app=types.WebAppInfo(url=url),
        ))
        return kb
    return make


def maybe_send_report(db: Session, key: str) -> bool:
    """DM one finished day report — if it is due. Returns whether one was sent.

    Due means: the automatic regime covers this day, and either nothing has
    been sent for it yet, or the score has MOVED since the last send. A
    re-review that confirms what everyone already read is not news; a score
    that changed after the fact is exactly what a correction exists for, and
    silently letting a stale number stand is what makes people stop believing
    the first message.
    """
    uid = uid_of_key(db, key)
    if not uid:
        return False
    return send_for_uid(db, uid, key=key)


# A ledger row that stands for "this day will not be reported, and here is
# why" — score `PARKED` (no real score can be negative) and `sends = 0`.
PARKED = -1


def _park(db: Session, key: str | None, uid: str, why: str) -> None:
    """Record that a finished day is deliberately NOT being reported.

    Without this the sweep starves. A key leaves its candidate set only when a
    ledger row exists, so every report that can never be sent — a
    filing-window-voided day above all, and those accumulate daily — stays in
    the set forever, sorts ahead of newer keys and eats the whole per-pass
    budget. The safety net would then quietly stop reaching the reports it
    exists for.

    A park is NOT a send: `sends = 0` keeps it distinguishable, and `PARKED`
    can never equal a real score, so if the reason later goes away (a voided
    day gets opened) the very next pass sends the report as a FIRST one rather
    than as a correction. Never overwrites a real send.
    """
    if not key:
        return
    led = db.query(LeaderDayReport).filter_by(report_key=key).first()
    if led is not None:
        return
    db.add(LeaderDayReport(report_key=key, uid=uid, date="", score_sent=PARKED,
                           rejected_sent=0, tasks_total=0, sends=0))
    db.commit()
    log.info("leader-ai: day report parked (%s) for %s", why, uid)


def send_for_uid(db: Session, uid: str, key: str | None = None) -> bool:
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    from app.routers.leaders import build_report_row
    from app.routers.staff import notify_profile

    # Ghost Mode: an admin testing the platform must not blast day reports at
    # every brigadir and leader. Returns BEFORE anything is written and does
    # NOT park — this is transient, and the sweep must come back for it once
    # the toggle is off.
    if notifications_suppressed():
        return False

    # The caller's key wins. The sweep found this report under a key it read
    # off the verdicts; re-deriving one from the row can land on a different
    # spelling (a `sheetd:` ref whose row later gained a submission id), and
    # the ledger would then be written under a key the sweep never looks up —
    # so the report would be re-sent on every pass, forever.
    key = key or key_of_uid(db, uid)

    row = build_report_row(db, uid)
    if row is None:
        _park(db, key, uid, "report no longer exists")
        return False
    date, shift = row["date"], row.get("shift")
    if not leader_ai.in_auto_regime(date, shift):
        _park(db, key, uid, "outside the automatic regime")
        return False
    # A day the filing-window rule already voided scores 0 for a reason that
    # outranks anything the photos say. Reporting a verified 62% on it would
    # contradict the register in the one message meant to explain the register.
    # It stays fully visible on the page, and if the day is later OPENED the
    # park lifts and this fires with the real number.
    if row.get("rejected"):
        _park(db, key, uid, "voided by the filing window")
        return False

    if not key:
        return False

    report = day_report(db, uid)
    if report is None:
        return False
    counts = report["counts"]
    score, raw = report["score"], report["rawScore"]
    # Task NUMBERS, not names: the DM is read in four languages and a name list
    # would have to be resolved per recipient, while «№3, №7» is the same
    # reference the leader sees on their own checklist. The names are one tap
    # away, on the page the button opens.
    numbers = ", ".join(f"№{t['id']}" for t in report["tasks"] if t["ai_rejected"])

    led = db.query(LeaderDayReport).filter_by(report_key=key).first()
    # A PARKED row is a placeholder, not a send: a day that was voided and has
    # since been opened gets its FIRST report now, not a "score updated"
    # correction announcing a number nobody was ever told.
    first = led is None or (led.sends or 0) == 0
    if not first and led.score_sent == score and led.rejected_sent == counts["rejected"]:
        return False

    mgr = (db.query(Manager).filter_by(id=row["manager_id"]).first()
           if row.get("manager_id") else None)
    leader_profile = (
        db.query(RoleProfile).filter_by(id=row["leader_id"]).first()
        if row.get("leader_id") else None
    )
    params = {
        "date": date,
        "leader": row.get("leader") or "—",
        "supervisor": row.get("supervisor") or (mgr.name if mgr else "—"),
        "score": score,
        "raw": raw,
        "rejected": counts["rejected"],
        "checked": counts["checked"],
        "total": counts["total"],
        "tasks": numbers or "—",
        # Only ever read by the "corrected" templates, which `first` rules out
        # — so a PARKED sentinel can never reach a message.
        "before": score if first else led.score_sent,
    }
    markup = _button_markup(report_url(uid))
    tone = "warning" if counts["rejected"] else "success"

    # ── the brigadir: the unit's number just became final ────────────────────
    if row.get("manager_id"):
        nkey = ("leader_day_report_corrected" if not first
                else "leader_day_report_flagged" if counts["rejected"]
                else "leader_day_report_clean")
        notify_profile(db, profile_key("supervisor", row["manager_id"]),
                       nkey, params, type=tone, markup_fn=markup)

    # ── the leader: never lose points silently (user, 2026-08-14) ────────────
    # Clean days are DMed too — the receipt is what makes the flagged one
    # readable as a verdict rather than as an accusation out of nowhere.
    if leader_profile is not None:
        nkey = ("leader_day_corrected" if not first
                else "leader_day_flagged" if counts["rejected"]
                else "leader_day_clean")
        notify_profile(db, profile_key("leader", leader_profile.id),
                       nkey, params, type=tone, markup_fn=markup)

    now = datetime.now(timezone.utc)
    if led is None:
        led = LeaderDayReport(report_key=key, first_sent_at=now)
        db.add(led)
    led.uid = uid
    led.date = date
    led.shift = shift
    led.leader_id = row.get("leader_id")
    led.leader_name = (row.get("leader") or "")[:160] or None
    led.manager_id = row.get("manager_id")
    led.score_sent = score
    led.rejected_sent = counts["rejected"]
    led.tasks_total = counts["total"]
    led.sends = (led.sends or 0) + 1
    led.last_sent_at = now
    db.commit()
    log.info("leader-ai: day report %s for %s (%s) score=%s rejected=%s",
             "sent" if first else "corrected", row.get("leader"), date,
             score, counts["rejected"])
    return True


def resend_if_changed(db: Session, uid: str) -> bool:
    """Re-run the report for one day after a human ruling. Safe to call for any
    report: it does nothing outside the automatic regime, nothing before the
    first report was sent, and nothing when the score did not move."""
    key = key_of_uid(db, uid)
    if not key:
        return False
    if db.query(LeaderDayReport).filter_by(report_key=key).first() is None:
        # Never reported. A ruling on an unfinished day must not jump the
        # queue and announce a score half the tasks have not been checked
        # against yet — the drain sends it when the day is done.
        return False
    try:
        return send_for_uid(db, uid)
    except Exception:
        log.exception("leader-ai: correction report failed for %s", uid)
        return False
