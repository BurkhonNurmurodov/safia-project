"""The prose half of the weekly Concerns deck, written by Gemini.

The twin of `services/deck_narrative.py` (the Ojidaniya deck's prose) and built
on the same three rules, restated here because they carry the weight:

**Gemini never rewrites a concern.** A concern and its closing note are what a
leader, a worker or a brigadir actually wrote down; a paraphrase is something
the register does not say. They go in as read-only evidence, quoted verbatim
where the model points at one, and its job is the SYNTHESIS around them — which
problems keep coming back, why, and what to do.

**Every figure comes from the caller, never from the model.** The prompt
carries the numbers `concerns_deck.collect` already computed and forbids any
other. The one place the model does name concerns in bulk — the recurring
problems — it names them by NUMBER (`nums`), and the deck counts those numbers
itself; a number the week does not hold is dropped rather than believed.

**A failure here must not cost the operator the deck.** `write()` returns None
on anything — no key, quota, malformed answer — and every prose slot falls back
to a plain statement of its own numbers.

Workers' names never reach it: the router does not hand them to the deck at
all, so there is nothing here to leak.
"""
import concurrent.futures
import json
import logging

from app.services import gemini
from app.services.concerns_deck import LEVEL_LABEL, days1
# The plant's own words and the house writing style — ONE definition for every
# generated report, so the two decks cannot drift into two voices.
from app.services.deck_narrative import _STYLE, _VOCAB

log = logging.getLogger(__name__)

_POINTS = {"type": "array", "items": {
    "type": "object",
    "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
    "required": ["title", "body"],
}}

# Every prose slot in one schema, so one call fills the whole file.
_SCHEMA = {
    "type": "object",
    "properties": {
        "summary_headline": {"type": "string"},
        "summary_points": _POINTS,
        "themes": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body": {"type": "string"},
                "cat": {"type": "string"},
                "nums": {"type": "array", "items": {"type": "integer"}},
            },
            "required": ["title", "body", "cat", "nums"],
        }},
        "categories_note": {"type": "string"},
        "category_roots": {"type": "array", "items": {
            "type": "object",
            "properties": {"cat": {"type": "string"}, "root": {"type": "string"}},
            "required": ["cat", "root"],
        }},
        "units_note": {"type": "string"},
        "oldest_note": {"type": "string"},
        "moves_note": {"type": "string"},
        "daily_note": {"type": "string"},
        "actions": {"type": "array", "items": {
            "type": "object",
            "properties": {"cat": {"type": "string"}, "text": {"type": "string"}},
            "required": ["cat", "text"],
        }},
        "conclusion_headline": {"type": "string"},
        "conclusion_points": _POINTS,
    },
    "required": [
        "summary_headline", "summary_points", "themes", "categories_note",
        "category_roots", "units_note", "oldest_note", "moves_note", "daily_note",
        "actions", "conclusion_headline", "conclusion_points",
    ],
}

_WORDS = """\
Xavotirlar reyestrining so'zlari — shularni ishlat:
  xavotir · bo'lim · yangi (kiritilgan) · yopildi · ochiq · muddati o'tgan
  yuqoriga ko'tarish · pastga qaytarish · yechim · brigadir · lider
  smena menejeri · top-menejment · ishchi"""

_RULES = """\
QAT'IY QOIDALAR:
  1. RAQAM O'YLAB TOPMA. Quyida berilgan raqamlardan boshqa hech qanday son,
     foiz yoki kun yozma. Bergan raqamimni o'zgartirmasdan ishlat. Hisob-kitob
     qilma — men allaqachon hisoblab berdim.
  2. XAVOTIR MATNINI QAYTA YOZMA. Biror xavotirga ishora qilsang, uning matnini
     AYNAN qo'shtirnoq ichida keltir yoki uni raqami bilan ayt (masalan
     «№1234»). O'z so'zing bilan qayta bayon qilma — bu yozuv reyestrdagi
     dalil. Yechim matnlari ham xuddi shunday.
  3. Ismlarni men berganday yoz, o'zgartirma. Menda bo'lmagan ismni yozma.
  4. Faqat berilgan ma'lumotdan xulosa chiqar. Bilmagan narsangni taxmin
     qilma; ma'lumot yetarli bo'lmasa, shuni ayt.
  5. Bo'lim haqida yozganda (cat maydoni) bo'limning KODINI yoz — masalan
     «warehouse», «technologist» — ro'yxatdagidek, o'zgartirmasdan.
  6. «nums» ro'yxatiga faqat quyidagi ro'yxatda BOR xavotir raqamlarini yoz
     (№ belgisisiz, faqat son)."""

# The model reads at most this many concerns and this much of each — enough
# for a week (roughly 500–700 filings plus the open backlog) while keeping the
# answer inside the proxy's time limit.
MAX_LINES = 900
MAX_TEXT = 220

# How long the deck waits for the model. The WHOLE request has to come back
# inside Cloudflare's 100-second limit, or the browser gets an error and no
# file at all — so past this the deck ships with its plain fallbacks instead,
# which is the outcome `write()` already promises for any other failure.
BUDGET_S = 70


def _clip(s: str, n: int) -> str:
    s = " ".join((s or "").split())
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def _brief(d: dict) -> str:
    """The week as compact text: aggregates first (the only figures the model
    may quote), then every concern as evidence."""
    lines: list[str] = []
    add = lines.append
    add(f"DAVR: {d['period']}   (o'tgan davr: {d['prev_period']})")
    add(f"ZAVODLAR: {d['plants']}")
    add("")
    add("== UMUMIY RAQAMLAR (faqat shularni ishlat) ==")
    add(f"Yangi xavotirlar (shu davrda kiritilgan): {d['filed']}; o'tgan davr {d['prev_filed']}")
    add(f"Yopilgan (shu davrda): {d['closed']}; o'tgan davr {d['prev_closed']}; "
        f"o'rtacha yopilish {days1(d['avg_close'])} kun "
        f"(o'tgan davr {days1(d['prev_avg_close'])} kun)")
    add(f"Davr oxirida ochiq: {d['open_end']} (shundan oldingi haftalardan qolgan: "
        f"{d['backlog_older']}); o'tgan davr oxirida {d['prev_open_end']}")
    add(f"Davr oxirida muddati o'tgan: {d['overdue_end']}; o'tgan davr oxirida "
        f"{d['prev_overdue_end']}")
    add(f"Shu davrda kelganlardan davr oxirigacha yopilgani: {d['filed_closed']}")
    add(f"Yuqoriga ko'tarilgan: {len(d['ups'])}; pastga qaytarilgan: {len(d['downs'])}")
    add("")

    add("== BO'LIMLAR (kod — nomi: yangi; o'tgan davr; shulardan yopildi; davr oxirida "
        "ochiq; muddati o'tgan) ==")
    for c in d["categories"]:
        add(f"  {c['key']} — {c['label']}: {c['filed']}; {c['prev_filed']}; "
            f"{c['filed_closed']}; {c['open']}; {c['overdue']}")
    add("")

    add("== BRIGADIRLAR (yangi; yopildi; ochiq; muddati o'tgan; o'rtacha yopilish kun) ==")
    for u in d["units"]:
        shift = f"{u['shift']}-smena" if u["shift"] else "smena —"
        add(f"  {u['name']} ({shift}): {u['filed']}; {u['closed']}; {u['open']}; "
            f"{u['overdue']}; {days1(u['avg_close'])}")
    add("")

    add("== KUNLAR (yangi / yopildi) ==")
    add("  " + " · ".join(f"{x['label']} {x['filed']}/{x['closed']}" for x in d["daily"]))
    add("")

    add("== OCHIQLAR DAVR OXIRIDA QAYERDA ==")
    add("  " + " · ".join(f"{LEVEL_LABEL[k]} {v}" for k, v in d["open_by_level"].items()))
    add("")

    add("== ZANJIR BO'YLAB KO'CHIRISHLAR (sababi bilan) ==")
    for m in d["ups"] + d["downs"]:
        add(f"  №{m['no']} {m['day'].strftime('%d.%m')} {m['from_level']} → {m['to_level']}: "
            f"\"{_clip(m['reason_l'], MAX_TEXT)}\"")
    add("")

    add("== XAVOTIRLAR (dalil — qayta yozma, faqat qo'shtirnoqda yoki raqami bilan "
        "keltir) ==")
    for r in d["brief"][:MAX_LINES]:
        if r["open_end"]:
            state = f"ochiq {r['age']} kun"
            if r["overdue_end"]:
                state += f", muddati {r['over_days']} kun o'tgan"
        else:
            state = f"{r['to_close']} kunda yopildi"
        worker = " [ishchi]" if r.get("worker") else ""
        line = (f"  №{r['no']} [{r['category'] or '—'}] {r['cell'] or '—'} ({r['unit']}) "
                f"{r['entry'].strftime('%d.%m')} {state}{worker}: "
                f"\"{_clip(r['text_l'], MAX_TEXT)}\"")
        if r["resolution_l"] and not r["open_end"]:
            line += f" | yechim: \"{_clip(r['resolution_l'], 140)}\""
        add(line)
    if len(d["brief"]) > MAX_LINES:
        add(f"  … yana {len(d['brief']) - MAX_LINES} ta xavotir ro'yxatga sig'madi")
    return "\n".join(lines)


def _prompt(d: dict) -> str:
    top = ", ".join(c["key"] for c in [c for c in d["categories"] if c["filed"]][:3])
    return f"""\
Sen non-shirinlik zavodining ishlab chiqarish tahlilchisisan. Quyida bir
haftalik «xavotirlar» reyestri berilgan: liderlar, ishchilar va brigadirlar
yozgan muammolar, ularning holati va yopilganda yozilgan yechimlar. Shu
ma'lumot asosida rahbariyat uchun haftalik hisobot taqdimotining MATNLARINI yoz.

{_STYLE}

{_VOCAB}

{_WORDS}

{_RULES}

QUYIDAGI MAYDONLARNI TO'LDIR:
  summary_headline — butun hafta haqida BITTA jumlalik asosiy xulosa.
  summary_points — 3 ta blok: haftaning eng muhim uchta masalasi. Har birida
      qisqa sarlavha (title) va 2-3 jumlalik izoh (body). Muammoning ILDIZINI
      ayt, shunchaki raqamni takrorlama.
  themes — 3-5 ta TAKRORLANAYOTGAN muammo: bir xil narsa haqida bir necha
      xavotir yozilgan holatlar. title — muammo nomi (qisqa), body — 1-2 jumla,
      cat — asosan qaysi bo'limga tegishli (kod), nums — shu muammoga tegishli
      BARCHA xavotirlarning raqamlari. Eng ko'p takrorlanganidan boshla.
  categories_note — bo'limlar haqida 1-2 jumla: qaysi bo'limga xavotir ko'p
      tushyapti va qayerda yopilmay qolyapti.
  category_roots — eng ko'p xavotir tushgan 3 bo'lim ({top}) uchun "ildiz" —
      bitta jumla, bu bo'limdagi xavotirlar NEGA takrorlanayotgani.
  units_note — brigadirlar haqida 1 jumla: muddati o'tgan xavotirlar kimda
      to'planib qolgan.
  oldest_note — eng uzoq ochiq turgan xavotirlar haqida 1 jumla.
  moves_note — zanjir bo'ylab ko'chirishlar haqida 2-3 jumla: nima yuqoriga
      chiqdi va nega (sabablarga tayangan holda).
  daily_note — hafta dinamikasi haqida 1-2 jumla.
  actions — 3-4 ta aniq chora. Har biri qaysi bo'limga qarshi ekanini (cat,
      kod) va chora matnini (text) ko'rsat. Chora BAJARILADIGAN bo'lsin: kim
      nima qilishi aniq bo'lsin, «yaxshilash kerak» kabi umumiy gap bo'lmasin.
  conclusion_headline — yakuniy bitta jumla.
  conclusion_points — 3 ta yakuniy nuqta: title + body, keyingi hafta uchun.

MA'LUMOT:
{_brief(d)}
"""


def write(d: dict) -> dict | None:
    """The deck's prose, or None if Gemini could not produce it. Never raises:
    the deck ships either way, with the slots stating their own numbers."""
    if not gemini.available():
        log.warning("CONCERNS DECK narrative skipped — no Gemini key configured")
        return None
    prompt = _prompt(d)
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    job = pool.submit(gemini.generate_json, prompt, [], _SCHEMA)
    try:
        out = job.result(timeout=BUDGET_S)
    except concurrent.futures.TimeoutError:
        log.warning("CONCERNS DECK narrative took over %ss — shipped without it", BUDGET_S)
        return None
    except Exception as exc:                        # quota, network, bad JSON
        log.warning("CONCERNS DECK narrative failed: %s", exc)
        return None
    finally:
        # Never wait for a call that overran: it ends on its own at the
        # client's timeout, and the deck has already moved on.
        pool.shutdown(wait=False)
    if not isinstance(out, dict) or not out.get("summary_headline"):
        log.warning("CONCERNS DECK narrative returned nothing usable: %s",
                    json.dumps(out, ensure_ascii=False)[:300])
        return None
    return out
