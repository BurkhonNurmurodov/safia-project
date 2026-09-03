"""The prose half of the weekly Ojidaniya deck, written by Gemini.

Nine slots on eight slides are prose by nature — an executive summary, a
week-over-week read, the «asosiy dard» under each brigadir, the «ildiz» under
each category, the recommendations and the conclusion. No query produces those
sentences, and a deck without them is a stack of bar charts.

Three rules the whole module is built on:

**Gemini never rewrites a note.** A leader's note is the recorded evidence of
what happened on a shift; a paraphrase of it is something the register does not
say, and somebody acts on the paraphrase. So the notes go in as read-only
material and the model's job is the SYNTHESIS around them — what these events
have in common, what the root cause is, what to do. Where it points at one
event it quotes the note verbatim, and the schema says so.

**Every figure comes from the caller, never from the model.** An LLM asked to
add up minutes will do it, plausibly and wrongly. The prompt carries the totals
already computed by `_downtime()` and the model is told to reuse them as given;
the slides that carry numbers get them from the data, not from this file.

**A failure here must not cost the operator the deck.** `write()` returns None
on any failure — no key, a quota wall, a malformed answer — and the renderer
prints a plain "AI izohi mavjud emas" line in the slot. The numbers, tables and
charts are the report; the prose is the commentary on it.
"""
import json
import logging

from app.services import gemini
from app.translit import transliterate

log = logging.getLogger(__name__)

# Every prose slot the deck has, in one schema, so one call fills the whole
# file. Slot by slot would be nine calls, nine failure modes and nine chances
# for the model to contradict itself between slides.
_SCHEMA = {
    "type": "object",
    "properties": {
        "summary_headline": {"type": "string"},
        "summary_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
                "required": ["title", "body"],
            },
        },
        "compare_better": {"type": "string"},
        "compare_worse": {"type": "string"},
        "supervisor_pains": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "pain": {"type": "string"}},
                "required": ["name", "pain"],
            },
        },
        "category_roots": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"cat": {"type": "string"}, "root": {"type": "string"}},
                "required": ["cat", "root"],
            },
        },
        "others_note": {"type": "string"},
        "daily_note": {"type": "string"},
        "cells_note": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"cat": {"type": "string"}, "text": {"type": "string"}},
                "required": ["cat", "text"],
            },
        },
        "conclusion_headline": {"type": "string"},
        "conclusion_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "body": {"type": "string"}},
                "required": ["title", "body"],
            },
        },
    },
    "required": [
        "summary_headline", "summary_points", "compare_better", "compare_worse",
        "supervisor_pains", "category_roots", "others_note", "daily_note",
        "cells_note", "actions", "conclusion_headline", "conclusion_points",
    ],
}

# The plant's own words. Given to the model explicitly because a general Uzbek
# model reaches for dictionary synonyms — «hujayra» for a yacheyka, «ombor
# bo'limi» for the sklad — and a report that renames the shopfloor reads as
# though it were written by somebody who has never been on it.
_VOCAB = """\
Zavodning O'Z atamalari — ayni shu so'zlarni ishlat, sinonim izlama:
  yacheyka (bo'lim emas, hujayra emas) · smena · brigadir · lider
  sklad (ombor emas) · bozorlik · zayavka · dop zayavka · postavka
  otdel · plan otdel · texnolog · razrabotka · nachinka · krem · korj
  biskvit · xamir · list · vagonetka · konteyner · kutish (ojidaniya)
  1-smena / 2-smena · smena topshiruvi · SAP · texkarta"""

_STYLE = """\
TIL VA USLUB — bu eng muhim talab:
  • Matn ONA TILI SOHIBI yozganday TABIIY o'zbek tilida bo'lsin. Rus yoki
    ingliz tilidan so'zma-so'z tarjima qilingandek eshitilmasin. Agar biror
    jumla g'alati yoki sun'iy tuyulsa, uni o'zbekcha odatiy gapiriladigan
    shaklga keltir.
  • Zavod odamlari kundalik ishda qanday gapirsa, shunday yoz. Rasmiy hisobot
    uslubi kerak, lekin quruq kanselyarizm emas.
  • Qisqa yoz. Bitta jumla — bitta fikr. Uzun ergash gaplardan qoch.
  • «Amalga oshirilishi lozim», «tashkil etilgan holda», «hisoblanadi» kabi
    og'ir qurilmalarni ishlatma — «qilish kerak», «bo'ldi», «-dir» yetadi.
  • Lotin alifbosida yoz. Kirill harflar ishlatma.
  • Emoji ishlatma."""

_RULES = """\
QAT'IY QOIDALAR:
  1. RAQAM O'YLAB TOPMA. Quyida berilgan raqamlardan boshqa hech qanday
     daqiqa, foiz yoki hodisa soni yozma. Bergan raqamimni o'zgartirmasdan
     ishlat. Hisob-kitob qilma — men allaqachon hisoblab berdim.
  2. LIDER YOZUVINI QAYTA YOZMA. Agar biror hodisaga ishora qilsang, uning
     izohini AYNAN qo'shtirnoq ichida keltir. O'z so'zing bilan qayta bayon
     qilma — bu yozuv jurnaldagi dalil, uni o'zgartirish mumkin emas.
  3. Ismlarni men berganday yoz, o'zgartirma.
  4. Faqat berilgan ma'lumotdan xulosa chiqar. Bilmagan narsangni taxmin
     qilma; ma'lumot yetarli bo'lmasa, shuni ayt."""


def _brief(data: dict) -> str:
    """The week, as compact text. Aggregates first (they are what the model may
    quote as figures), then the events with their notes as evidence."""
    d = data
    lines: list[str] = []
    add = lines.append

    add(f"DAVR: {d['period']}   (o'tgan davr: {d['prev_period']})")
    add(f"ZAVOD: {d['factory']}")
    add("")
    add("== UMUMIY RAQAMLAR (faqat shularni ishlat) ==")
    add(f"Jami kutish (to'xtagan): {d['total']:.0f} daqiqa "
        f"= {d['total'] / 60:.1f} soat; o'tgan davr {d['prev_total']:.0f} daqiqa; "
        f"o'zgarish {d['delta_pct']:+.0f}%")
    if not d.get("comparable"):
        # Without this the model states the fall as an achievement — it did,
        # on the first run against real data («to'xtashlar 65% ga kamayib»),
        # because a percentage with no caveat attached reads as one.
        add("  !! MUHIM: o'tgan davr raqami YACHEYKALARDAN emas, «Smena "
            "hisoboti» satridan olingan — bu boshqa o'lchov. Shuning uchun "
            "yuqoridagi foizni YAXSHILANISH deb ATAMA va uni yutuq sifatida "
            "ko'rsatma. Faqat 'o'lchov usuli o'zgargani uchun raqamlarni "
            "to'g'ridan-to'g'ri solishtirib bo'lmaydi' deb yoz. "
            "compare_better va compare_worse maydonlarida ham shu qoidaga "
            "amal qil: umumiy foizni emas, TOIFALAR ichidagi o'zgarishlarni "
            "va shu haftaning o'z holatini tasvirla.")
    add(f"To'xtatmagan kutishlar: {d['total_ns']:.0f} daqiqa, {d['events_ns']} hodisa")
    add(f"Hodisalar soni (to'xtagan): {d['events']}")
    add(f"O'rtacha bitta hodisa: {d['avg_event']:.0f} daqiqa")
    add(f"Jurnal yuritgan brigadirlar: {d['sup_count']}")
    add(f"Kutish bo'lgan yacheykalar: {d['cell_count']}")
    add("")

    add("== TOIFALAR BO'YICHA (to'xtagan, daqiqa) ==")
    for c in d["categories"]:
        prev = c.get("prev", 0.0)
        move = f"; o'tgan davr {prev:.0f}" if prev else "; o'tgan davr 0"
        add(f"  {c['code']} — {c['label']}: {c['minutes']:.0f} daqiqa, "
            f"{c['events']} hodisa, ulushi {c['share']:.0f}%{move}")
    add("")

    add("== BRIGADIRLAR BO'YICHA (daqiqa) ==")
    for s in d["supervisors"]:
        add(f"  {s['name']} (smena {s['shift'] or '—'}): {s['minutes']:.0f} daqiqa, "
            f"ulushi {s['share']:.0f}%, 50 daqiqadan oshgan kunlar: {s['flagged_days']}")
    add("")

    add("== KUNLAR BO'YICHA (daqiqa) ==")
    add("  " + " · ".join(f"{x['label']} {x['minutes']:.0f}" for x in d["daily"]))
    add("")

    add("== ENG KO'P TO'XTAGAN YACHEYKALAR ==")
    for c in d["cells"][:12]:
        add(f"  {c['code']} ({c['leader'] or '—'}, {c['supervisor']}): "
            f"{c['minutes']:.0f} daqiqa, {c['events']} hodisa")
    add("")

    add("== HODISALAR VA LIDERLAR YOZUVLARI (dalil — qayta yozma, faqat "
        "qo'shtirnoqda keltir) ==")
    # `events` is the COUNT; `events_on` is the list. The notes go in
    # transliterated, because roughly a third of them are typed in Cyrillic and
    # the deck is Latin — the model must not be the thing that converts them,
    # or "quote verbatim" and "write in Latin" become contradictory orders.
    for e in d["events_on"]:
        mark = "" if e["stopped"] else " [to'xtatmagan]"
        add(f"  {e['date']} {e['start']}-{e['end']} {e['cell']} "
            f"({e['supervisor']}) {e['category']} {e['minutes']:.0f}daq{mark}: "
            f"\"{transliterate((e['note'] or '').strip(), 'uz')}\"")

    return "\n".join(lines)


def _prompt(data: dict) -> str:
    top_cats = ", ".join(c["code"] for c in data["categories"][:3])
    top_sups = ", ".join(s["name"] for s in data["supervisors"][:3])
    return f"""\
Sen non-shirinlik zavodining ishlab chiqarish tahlilchisisan. Quyida bir
haftalik «yacheykalardagi kutish vaqtlari» ma'lumoti berilgan. Shu ma'lumot
asosida rahbariyat uchun haftalik hisobot taqdimotining MATNLARINI yoz.

{_STYLE}

{_VOCAB}

{_RULES}

QUYIDAGI MAYDONLARNI TO'LDIR:
  summary_headline — butun hafta haqida BITTA jumlalik asosiy xulosa.
  summary_points — 3 ta blok: eng katta uchta muammo. Har birida qisqa
      sarlavha (title) va 2-3 jumlalik izoh (body). Muammoning ILDIZINI ayt,
      shunchaki raqamni takrorlama.
  compare_better — o'tgan hafta bilan solishtirganda nima yaxshilangani.
  compare_worse — nima yomonlashgani yoki diqqat talab qilishi.
  supervisor_pains — eng ko'p kutish bo'lgan 3 brigadir ({top_sups}) uchun
      "asosiy dard" — bitta jumla, aynan shu brigadirda nima takrorlanayotgani.
  category_roots — eng katta 3 toifa ({top_cats}) uchun "ildiz" — bitta
      jumla, bu toifadagi kutishlar NEGA yuz berayotgani.
  others_note — qolgan toifalar haqida 1-2 jumla.
  daily_note — hafta dinamikasi haqida 1-2 jumla: qaysi kun eng og'ir bo'lgani
      va nima uchun.
  cells_note — eng ko'p to'xtagan yacheykalar haqida 1-2 jumla.
  actions — 3-4 ta aniq chora. Har biri qaysi toifaga qarshi ekanini (cat) va
      chora matnini (text) ko'rsat. Chora BAJARILADIGAN bo'lsin: kim nima
      qilishi aniq bo'lsin, «yaxshilash kerak» kabi umumiy gap bo'lmasin.
  conclusion_headline — yakuniy bitta jumla.
  conclusion_points — 3 ta yakuniy nuqta: title + body, keyingi hafta uchun.

MA'LUMOT:
{_brief(data)}
"""


def write(data: dict) -> dict | None:
    """The deck's prose, or None if Gemini could not produce it.

    Never raises: the caller ships the deck either way, with the slots marked
    unavailable. A deck that fails to download because a third-party API had a
    bad minute is a worse outcome than a deck with plain commentary.
    """
    if not gemini.available():
        log.warning("DECK narrative skipped — no Gemini key configured")
        return None
    try:
        out = gemini.generate_json(_prompt(data), [], _SCHEMA)
    except Exception as exc:                        # quota, network, bad JSON
        log.warning("DECK narrative failed: %s", exc)
        return None
    if not isinstance(out, dict) or not out.get("summary_headline"):
        log.warning("DECK narrative returned nothing usable: %s",
                    json.dumps(out, ensure_ascii=False)[:300])
        return None
    return out
