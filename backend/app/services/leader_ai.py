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
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse

import httpx
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    AppSetting,
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

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "image_date": {"type": "STRING"},
        "date_ok": {"type": "BOOLEAN"},
        "matches_task": {"type": "BOOLEAN"},
        "proves_done": {"type": "BOOLEAN"},
        "readable": {"type": "BOOLEAN"},
        "reason_uz": {"type": "STRING"},
        "reason_uz_cyrl": {"type": "STRING"},
        "reason_ru": {"type": "STRING"},
        "reason_en": {"type": "STRING"},
    },
    "required": ["image_date", "date_ok", "matches_task", "proves_done",
                 "readable",
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


# ── the expected date window ─────────────────────────────────────────────────

def date_window(date: str, shift: int | None) -> tuple[str, str]:
    """(from, to) as "YYYY-MM-DD HH:MM" for the checklist day.

    Shift 2 leaders submit between 21:00 and 09:00 the next morning, so their
    window is that submission window — NOT the full 17:00 → 16:59 day that
    services/leader_tasks.effective_date attributes a submission to. The
    attribution day is deliberately the wider of the two: a 21:00 or an 02:00
    photo lands on the same checklist date either way, but only the narrower
    window is what a leader was actually asked to file inside.

    An unknown shift is treated as shift 1: the strict reading, and
    unknown-shift rows are rare.
    """
    if shift == 2:
        try:
            nxt = (datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            nxt = date
        return f"{date} 21:00", f"{nxt} 09:00"
    return f"{date} 00:00", f"{date} 23:59"


def _prompt(*, task: str, note: str, criteria: str, date: str, shift: int | None,
            n_images: int, omitted: int, n_examples: int = 0) -> str:
    lo, hi = date_window(date, shift)
    # Shift 2's window crosses midnight, so it is spelled out as two concrete
    # dated halves rather than left as a range. Given only "21:00 → 09:00 next
    # day" the model has to reason across midnight while HISOBOT SANASI sits
    # directly above it — it anchors on the report date, reads the next
    # calendar date as a mismatch, and flags a correct 02:00 photo every night.
    # Both permitted dates are named, with in-window and out-of-window examples.
    nxt = hi.split(" ")[0]
    lo_t, hi_t = lo.split(" ")[1], hi.split(" ")[1]
    shift_note = (
        f"Bu 2-smena: hisobot soat {lo_t} dan ertasi kuni {hi_t} gacha "
        f"topshiriladi. Shuning uchun RUXSAT ETILGAN IKKITA SANA bor:\n"
        f"   a) {date} — vaqti {lo_t} yoki undan KEYIN bo'lsa TO'G'RI;\n"
        f"   b) {nxt} (ertasi kun) — vaqti {hi_t} yoki undan OLDIN bo'lsa TO'G'RI.\n"
        f"Rasmdagi sana {nxt} bo'lishi, ya'ni HISOBOT SANASIDAN boshqa bo'lishi, "
        f"KAMCHILIK EMAS. {nxt} 00:30, {nxt} 02:00, {nxt} 07:30 — bularning "
        f"hammasi oyna ICHIDA: date_ok=true qo'y, sana nomuvofiqligi deb BELGILAMA. "
        f"date_ok=false faqat shu ikki oraliqdan TASHQARIDA bo'lganda "
        f"(masalan {date} 14:00 yoki {nxt} 11:00)."
        if shift == 2 else
        f"Bu 1-smena: ish kuni oddiy kalendar kuni — rasmdagi sana {date} "
        f"bo'lishi kerak."
    )
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
    return f"""Sen zavod liderlarining kunlik hisobotlarini tekshiruvchi auditorsan.
{intro}

VAZIFA: {task}
{note_line}HISOBOT SANASI: {date}
{shift_note}
RUXSAT ETILGAN VAQT OYNASI: {lo} dan {hi} gacha.{omit}

Quyidagi savollarga javob ber:

1) SANA. Sen rasm QACHON OLINGANINI tekshirasan. Buning uchun FAQAT quyidagi
uch manbadan biri hisobga olinadi:
   a) SKRINSHOT — operatsion tizim soati skrinshot ichida ko'rinadi:
      Windows'da pastki o'ng burchakda (masalasi panelida), macOS'da yuqori
      o'ng burchakda (menyu satrida);
   b) MONITOR SURATI — o'sha operatsion tizim soati monitor ekranida ko'rinadi
      (Windows — pastki o'ng, macOS — yuqori o'ng);
   c) KAMERA MUHRI — kamera rasmga avtomatik bosgan sana-vaqt yozuvi.

MUHIM: hujjatning O'Z ICHIDAGI sana — masalan jadval katagidagi sana, «Период»
yoki «Sana» ustuni, blank/shakl sarlavhasidagi sana, qo'lda yozilgan sana —
rasm qachon olinganini BILDIRMAYDI. Uni sana sifatida ISHLATMA. U to'g'ri
ko'rinsa ham, yuqoridagi uch manbadan biri bo'lmasa — sana tasdiqlanmagan
hisoblanadi.

Topgan sana-vaqtni image_date ga QANDAY YOZILGAN bo'lsa shundayligicha ko'chir
(bir nechta rasm bo'lsa vergul bilan). Mahalliy format KUN.OY.YIL, ya'ni
04.08.2026 = 2026-yil 4-avgust (4-yanvar emas).

YIL haqida: bu manbalar ko'pincha yilni umuman ko'rsatmaydi — macOS menyu satri
odatda faqat «Sesh 4 Avg 14:22» deb yozadi, Windows va kamera esa to'liq sana
beradi. Yil ko'rinmasligi KAMCHILIK EMAS: bunday holda faqat KUN va OYni
solishtir va ular yuqorida RUXSAT ETILGAN sanalardan biriga to'g'ri kelsa
date_ok=true qo'y (hisobot sanasining o'ziga emas). Yil ko'rsatilmagani
uchun date_ok=false qilma. Oy nomi qisqartma bo'lishi mumkin (Avg / Авг / Aug —
avgust).

- Uch manbadan hech biri ko'rinmasa (yoki faqat hujjat ichidagi sana bo'lsa) —
  image_date="" va date_ok=false.
- Faqat SOAT ko'rinib, kun ham oy ham ko'rinmasa — image_date ga o'sha soatni
  yoz, lekin date_ok=false: qaysi kun ekanini tasdiqlab bo'lmaydi.
- Biror rasmning sana-vaqti yuqorida ruxsat etilgan oraliqlardan tashqarida
  bo'lsa — date_ok=false.
- Hammasi ruxsat etilgan oraliqlar ichida bo'lsa — date_ok=true, sanasi hisobot
  sanasidan farq qilgan taqdirda ham.{ex_date}

Sababda sanani QAYERDAN o'qiganingni ayt (masalan: «Windows soati», «macOS
menyu satri», «kamera muhri»).

{match_block}

{done_block}

4) O'QILISHI. Rasm juda xira, qorong'i yoki kesilgan bo'lib, hech narsani
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


def floor_date(db: Session) -> str | None:
    """The first date AI review covers ("YYYY-MM-DD"), or None for everything.

    Reports dated BEFORE the floor are out of scope: neither `discover()` nor
    `queue_report()` will queue them. This is what makes a purge of old
    verdicts permanent — discovery back-fills "everything ever filed", so
    without the floor the next pass would re-insert every deleted row as
    `pending` and the drain would re-spend the quota re-judging history nobody
    wants judged. Set by the one-shot purge in app/startup.py.
    """
    row = db.query(AppSetting).filter_by(key=FLOOR_SETTING).first()
    return row.value if row is not None and row.value else None


def discover(db: Session) -> int:
    """Insert `pending` rows for every reviewable (report, task) not yet known.
    Reviewable = the leader answered YES and attached at least one photo; a
    "no" with a written reason has no image to judge."""
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


def queue_report(db: Session, *, day: LeaderTaskDay | None = None,
                 row: LeaderChecklist | None = None) -> int:
    """Queue ONE report's reviewable tasks, by the same rule as `discover()`.

    Exists for the per-task "check now" button: that press must not pay for a
    scan of every report ever filed, which is what `discover()` does and what
    the background drain is for. Matching is done for this row alone — a single
    fuzzy match is cheap, it is the batch of thousands that is not.
    """
    # Reports before the review floor are out of scope — see floor_date().
    floor = floor_date(db)
    when = day.date if day is not None else (row.date if row is not None else None)
    if floor and when and when < floor:
        return 0

    added = 0
    if day is not None:
        mgr = db.query(Manager).filter_by(id=day.manager_id).first()
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
    prompt = _prompt(
        task=task_label(db, rev.task_id, rev.manager_id, rev.leader_id),
        note=task_note(db, rev.task_id),
        criteria=criteria_for(db, rev.task_id, rev.manager_id, rev.leader_id),
        date=rev.date, shift=rev.shift,
        n_images=len(images), omitted=omitted, n_examples=len(examples),
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
    seen = (out.get("image_date") or "").strip()
    if not seen:
        flags.append("no_date")
    elif not out.get("date_ok", False):
        flags.append("date_mismatch")
    # Ordered strongest-claim first: "this photo is about something else" is a
    # bigger statement than "it doesn't finish the job", and the chip row reads
    # in this order.
    if not out.get("matches_task", True):
        flags.append("off_topic")
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
    return "done"


# ── the active run's dates: what confines the drain ──────────────────────────
# The record is WRITTEN by the /leader-ai/recheck endpoint, which owns its
# shape; the drain only ever reads the range off it. The key lives here rather
# than in the router because the dependency runs router → service.
RUN_SETTING = "leader_ai_run"


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


def _release_run(db: Session) -> None:
    """Mark the run's range drained so it stops confining the queue.

    THE stall guard. `/progress` retires a finished run, but only while somebody
    has the page open — and nobody watches a backfill overnight. A record left
    behind by a closed tab would otherwise pin the drain to a range with nothing
    in it forever, which is the entire periodic backfill dying silently.

    The row SURVIVES: deleting it here would rob `/progress` of the one poll
    that reports the run finished. It just stops meaning "confine to this".
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


def drain(db: Session, limit: int | None = None) -> dict:
    """Review up to `limit` pending rows, newest report first. Returns counts;
    `quota` marks a run cut short by the free tier so the UI can say so.

    Confined to the active run's slice when there is one (`_active_run_scope`)
    — dates and, since the modal offers them, shift / brigadir / leader. EVERY
    caller drains through here, the timer included: a periodic firing that
    ignored the confinement would undo it twenty minutes into the run.
    """
    if not gemini.available():
        return {"ok": False, "reason": "no_key", "done": 0, "flagged": 0, "errors": 0}
    limit = limit or settings.gemini_batch_size
    q = (
        db.query(LeaderAiReview)
        .filter(LeaderAiReview.status.in_(("pending", "error")),
                LeaderAiReview.attempts < MAX_ATTEMPTS)
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
    rows = (
        q.order_by(LeaderAiReview.date.desc(), LeaderAiReview.id.asc())
        .limit(limit)
        .all()
    )
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
    aborted = None
    streak = 0  # consecutive API-level failures
    for rev in rows:
        try:
            outcome = review_one(db, rev)
        except gemini.GeminiQuotaError as exc:
            log.warning("leader-ai: quota reached, stopping drain (%s)", exc)
            quota = True
            break
        done += 1
        if rev.status == "flagged":
            flagged += 1
        elif rev.status == "error":
            errors += 1
        # A retired model, a revoked key or a dead network fails EVERY row
        # identically. Without this the drain would walk the whole batch
        # burning each row's retries on a fault that has nothing to do with it.
        streak = streak + 1 if outcome == "model" else 0
        if streak >= _ERROR_STREAK_ABORT:
            aborted = rev.error
            log.error("leader-ai: %s consecutive API failures, aborting drain (%s)",
                      streak, aborted)
            break
    return {"ok": True, "done": done, "flagged": flagged, "errors": errors,
            "quota": quota, "aborted": aborted}


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


def rejected_by_uid(db: Session, dates: set[str] | None = None) -> dict[str, set[int]]:
    """report uid → the task ids whose proof a human REJECTED.

    The leaders sheet is a read-only source we cannot write back to, and a bot
    day is closed and immutable, so a rejection can never be an edit — it is an
    overlay applied at read time by routers/leaders.py. That also means a
    rejection is reversible by re-ruling the verdict, which is the behaviour you
    want from a judgement call.
    """
    q = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.resolution == "rejected"))
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
        log.debug("leader-ai: drain already running in this worker, skipping kick")
        return

    def _work():
        if not _lock.acquire(blocking=False):
            return
        db = SessionLocal()
        holding = False
        try:
            holding = _try_db_lock(db)
            if not holding:
                log.debug("leader-ai: another worker is draining, skipping kick")
                return
            if discover_first:
                discover(db)
            res = drain(db)
            log.info("leader-ai: drain finished %s", res)
        except Exception:
            log.exception("leader-ai: drain crashed")
        finally:
            # Explicit unlock: db.close() only returns the connection to the
            # pool, and the session outlives it — so an advisory lock left
            # behind would ride that pooled connection and block every future
            # drain in this worker.
            if holding:
                _db_unlock(db)
            db.close()
            _lock.release()

    threading.Thread(target=_work, name="leader-ai-drain", daemon=True).start()


# Every this many minutes the queue drains itself. Chosen against the free
# tier's per-DAY cap rather than latency: a batch of `gemini_batch_size` every
# 20 minutes is ~72 batches a day, which keeps a normal day's photos judged
# within the hour without racing the quota to zero by lunchtime.
DRAIN_EVERY_MIN = 20


def register_drain_job() -> None:
    """Put the drain on the scheduler at boot.

    Until the platform grew a scheduler this feature had NO periodic trigger:
    the queue only moved when somebody hit the sheet Refresh or a leader closed
    a bot day, so a report nobody touched stayed unreviewed indefinitely and
    "N pending" was a number that could sit still for a week. That gap was known
    and accepted at the time; it does not have to be any more.

    Safe as an in-process timer for the same reason the broadcast fan-out is:
    the drain claims a Postgres advisory lock before doing any work, so even if
    the unit ever moves off `--workers 1` the extra firings no-op instead of
    double-spending quota.
    """
    if not gemini.available():
        log.info("leader-ai: no API key, periodic drain not scheduled")
        return
    from app.scheduler import schedule_interval
    schedule_interval("leader-ai-drain", lambda: run_async(discover_first=True),
                      minutes=DRAIN_EVERY_MIN)
    log.info("leader-ai: periodic drain scheduled every %s min", DRAIN_EVERY_MIN)
