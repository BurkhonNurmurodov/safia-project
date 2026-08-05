"""AI review of leader-checklist proof photos.

Two questions per task, both asked of the image itself:

1. **Is the photo from the right day?** Every proof photo carries a drawn-on
   date-time. The expected window is the checklist day as the LEADER's shift
   defines it — shift 1 is the plain calendar day, shift 2 runs 17:00 → 16:59
   next morning, so a 02:00 photo carries tomorrow's calendar date and is still
   on time. Judging shift 2 against a bare calendar date would flag a correct
   photo every single night.
2. **Does the photo actually show the task done?** Measured against the written
   criteria an admin sets per task (global → supervisor → leader, the same
   chain as name/weight/min_media). With no criteria written yet, only question
   1 is asked — the feature is useful before anyone fills the text in, and gets
   stricter as they do.

The queue IS the `leader_ai_reviews` table: discovery inserts `pending` rows,
a drain turns them into verdicts. Both collection layers feed it — bot entries
and Google-Form rows — keyed by a `ref` that survives the leaders sheet's
wipe-and-reload re-sync (see LeaderAiReview).

There is no scheduler on this host, so a drain is kicked by the two events that
create work: the leaders-sheet Refresh and a leader closing their bot day.
"""
import logging
import re
import threading
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    LeaderAiReview,
    LeaderChecklist,
    LeaderTaskDay,
    LeaderTaskDef,
    LeaderTaskEntry,
    LeaderTaskLeaderSetting,
    LeaderTaskMedia,
    LeaderTaskSetting,
    Manager,
    RoleProfile,
)
from app.services import gemini
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

_TIMEOUT = httpx.Timeout(60.0, connect=15.0)
_TG_API = "https://api.telegram.org"

# One drain at a time per process. Refresh and day-close both kick a drain, and
# two of them would race for the same pending rows and double-spend quota.
_lock = threading.Lock()

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "image_date": {"type": "STRING"},
        "date_ok": {"type": "BOOLEAN"},
        "proves_done": {"type": "BOOLEAN"},
        "readable": {"type": "BOOLEAN"},
        "reason_uz": {"type": "STRING"},
        "reason_uz_cyrl": {"type": "STRING"},
        "reason_ru": {"type": "STRING"},
        "reason_en": {"type": "STRING"},
    },
    "required": ["image_date", "date_ok", "proves_done", "readable",
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
    who = (row.leader or "").strip().lower()[:60]
    return f"sheetd:{row.date}:{who}:{task_id}"


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


def task_label(db: Session, task_id: int) -> str:
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        return f"#{task_id}"
    return td.name_ru or td.name_uz or td.name_en or f"#{task_id}"


# ── the expected date window ─────────────────────────────────────────────────

def date_window(date: str, shift: int | None) -> tuple[str, str]:
    """(from, to) as "YYYY-MM-DD HH:MM" for the checklist day.

    Mirrors services/leader_tasks.effective_date — shift 2's day starts at
    17:00 and ends 16:59 the next morning. An unknown shift is treated as
    shift 1: the strict reading, and unknown-shift rows are rare.
    """
    if shift == 2:
        try:
            nxt = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            nxt = date
        return f"{date} 17:00", f"{nxt} 16:59"
    return f"{date} 00:00", f"{date} 23:59"


def _prompt(*, task: str, criteria: str, date: str, shift: int | None,
            n_images: int, omitted: int) -> str:
    lo, hi = date_window(date, shift)
    shift_note = (
        "Bu 2-smena: ish kuni soat 17:00 da boshlanib, ertasi kuni 16:59 da "
        "tugaydi. Shuning uchun rasmdagi sana ERTANGI kalendar sanasi bo'lishi "
        "mumkin va bu TO'G'RI — muhimi vaqt oynadan chiqib ketmasligi."
        if shift == 2 else
        "Bu 1-smena: ish kuni oddiy kalendar kuni."
    )
    done_block = (
        "2) ISBOT. Quyida vazifa qanday bajarilgan hisoblanishi yozilgan. "
        "Rasm(lar) shu talabni bajarilganini KO'RSATyaptimi?\n"
        f"TALAB: {criteria}\n"
        "Agar rasm talabga aloqador bo'lmasa, yarim bajarilgan bo'lsa, bo'sh "
        "shakl/jadval ko'rsatsa yoki talabni tasdiqlamasa — proves_done=false."
        if criteria else
        "2) ISBOT. Bu vazifa uchun yozma talab kiritilmagan, shuning uchun "
        "mazmunini BAHOLAMA: rasm umuman o'qib bo'lmaydigan yoki bo'sh "
        "bo'lmasa — proves_done=true qo'y."
    )
    omit = (f"\nEslatma: bu vazifada ko'proq rasm bor, faqat birinchi "
            f"{n_images} tasi yuborildi ({omitted} tasi yuborilmadi).") if omitted else ""
    return f"""Sen zavod liderlarining kunlik hisobotlarini tekshiruvchi auditorsan.
Senga bitta vazifa uchun {n_images} ta isbot rasmi berilgan.

VAZIFA: {task}
HISOBOT SANASI: {date}
{shift_note}
RUXSAT ETILGAN VAQT OYNASI: {lo} dan {hi} gacha.{omit}

Ikkita savolga javob ber:

1) SANA. Har bir rasmda sana-vaqt yozuvi bor (ekran, kamera yoki dastur
chiqargan). Uni o'qi va image_date ga QANDAY YOZILGAN bo'lsa shundayligicha
ko'chir (bir nechta rasm bo'lsa vergul bilan). Agar rasmda hech qanday sana
ko'rinmasa — image_date="" va date_ok=false. Agar biror rasmning vaqti yuqoridagi
oynadan tashqarida bo'lsa — date_ok=false. Hammasi oyna ichida bo'lsa — date_ok=true.

{done_block}

3) O'QILISHI. Rasm juda xira, qorong'i yoki kesilgan bo'lib, hech narsani
aniqlab bo'lmasa — readable=false.

Sabablarni TO'RT tilda yoz (reason_uz — o'zbek lotin, reason_uz_cyrl — o'zbek
kirill alifbosida, reason_ru — rus, reason_en — ingliz). Har biri 1-2 qisqa jumla, oddiy
matn, markdown ishlatma. Muammo bo'lsa — aynan nima noto'g'ri ekanini va rasmda
ko'rgan sanani yoz. Muammo bo'lmasa — qisqa tasdiq yoz."""


# ── image fetching ───────────────────────────────────────────────────────────

_DRIVE_ID = re.compile(r"(?:/file/d/|/d/|[?&]id=)([A-Za-z0-9_-]{16,})")


def _looks_like_image(content: bytes, ctype: str) -> bool:
    if (ctype or "").lower().startswith("image/"):
        return True
    # Drive hands back an HTML interstitial with a 200 for anything it will not
    # serve directly; sniffing the magic bytes is what catches that.
    return content[:3] == b"\xff\xd8\xff" or content[:8] == b"\x89PNG\r\n\x1a\n" \
        or content[:4] == b"RIFF" or content[:2] == b"BM"


def fetch_sheet_image(url: str) -> tuple[bytes, str]:
    """Bytes for one Google-Form photo URL. Drive links are rewritten to a
    direct-content host first — the share URL the form writes returns an HTML
    viewer page, not the image."""
    candidates = [url]
    m = _DRIVE_ID.search(url or "")
    if m and "drive.google.com" in url:
        fid = m.group(1)
        candidates = [f"https://lh3.googleusercontent.com/d/{fid}=w1600",
                      f"https://drive.google.com/uc?export=download&id={fid}",
                      url]
    last = ""
    with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
        for cand in candidates:
            try:
                res = client.get(cand)
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


def discover(db: Session) -> int:
    """Insert `pending` rows for every reviewable (report, task) not yet known.
    Reviewable = the leader answered YES and attached at least one photo; a
    "no" with a written reason has no image to judge."""
    known = _existing_refs(db)
    added = 0

    # ── bot layer ────────────────────────────────────────────────────────────
    days = {d.id: d for d in db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.closed_at.isnot(None)).all()}
    if days:
        shifts = {m.id: m.shift for m in db.query(Manager).all()}
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
            db.add(LeaderAiReview(
                ref=ref, source="bot", date=d.date, task_id=e.task_id,
                leader_id=d.leader_id, manager_id=d.manager_id,
                shift=shifts.get(d.manager_id), status="pending", flags=[],
            ))
            known.add(ref)
            added += 1

    # ── sheet layer ──────────────────────────────────────────────────────────
    if added < DISCOVER_CAP:
        rows = db.query(LeaderChecklist).order_by(LeaderChecklist.date.desc()).all()
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
                for tk in (r.tasks or []):
                    if not tk.get("done") or not _sheet_photos(tk):
                        continue
                    ref = sheet_ref(r, int(tk.get("id") or 0))
                    if ref in known:
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

    if added:
        db.commit()
        log.info("leader-ai: queued %s new review(s)", added)
    return added


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

    prompt = _prompt(
        task=task_label(db, rev.task_id),
        criteria=criteria_for(db, rev.task_id, rev.manager_id, rev.leader_id),
        date=rev.date, shift=rev.shift,
        n_images=len(images), omitted=omitted,
    )
    try:
        out = gemini.generate_json(prompt, images, _SCHEMA)
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
    seen = (out.get("image_date") or "").strip()
    if not seen:
        flags.append("no_date")
    elif not out.get("date_ok", False):
        flags.append("date_mismatch")
    if not out.get("proves_done", True):
        flags.append("not_proven")

    rev.flags = flags
    rev.status = "flagged" if flags else "ok"
    rev.image_date = seen[:200] or None
    for l in LANGS:
        setattr(rev, f"reason_{l}", (out.get(f"reason_{l}") or "").strip()[:1500] or None)
    rev.photos = len(images)
    rev.model = settings.gemini_model
    rev.error = None
    rev.reviewed_at = datetime.now(timezone.utc)
    db.commit()


def drain(db: Session, limit: int | None = None) -> dict:
    """Review up to `limit` pending rows, newest report first. Returns counts;
    `quota` marks a run cut short by the free tier so the UI can say so."""
    if not gemini.available():
        return {"ok": False, "reason": "no_key", "done": 0, "flagged": 0, "errors": 0}
    limit = limit or settings.gemini_batch_size
    rows = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < MAX_ATTEMPTS)
        .order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.asc())
        .limit(limit)
        .all()
    )
    done = flagged = errors = 0
    quota = False
    for rev in rows:
        try:
            review_one(db, rev)
        except gemini.GeminiQuotaError as exc:
            log.warning("leader-ai: quota reached, stopping drain (%s)", exc)
            quota = True
            break
        done += 1
        if rev.status == "flagged":
            flagged += 1
        elif rev.status == "error":
            errors += 1
    return {"ok": True, "done": done, "flagged": flagged, "errors": errors,
            "quota": quota}


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
    return out


# ── background kick ──────────────────────────────────────────────────────────

def run_async(discover_first: bool = True) -> None:
    """Fire a discovery + drain on a daemon thread.

    Called from the sheet Refresh and from the bot's day-close, neither of
    which may block on a minutes-long queue. Passenger can reap the process
    mid-drain; that costs nothing, because unfinished rows are still `pending`
    and the next kick picks them up.
    """
    if not gemini.available():
        return
    if _lock.locked():
        log.debug("leader-ai: drain already running, skipping kick")
        return

    def _work():
        if not _lock.acquire(blocking=False):
            return
        db = SessionLocal()
        try:
            if discover_first:
                discover(db)
            res = drain(db)
            log.info("leader-ai: drain finished %s", res)
        except Exception:
            log.exception("leader-ai: drain crashed")
        finally:
            db.close()
            _lock.release()

    threading.Thread(target=_work, name="leader-ai-drain", daemon=True).start()
