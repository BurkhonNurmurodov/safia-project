"""The appeal notices — an objection or a late proof filed, ruled on, taken
back, discussed — as ONE Rich-message card (2026-11-03, the operator:
«restyle the notification, you might use rich message»).

Until then every notice `leader_appeal_chat.fanout` sent was the bell row's
own template read out as a DM: «Sana: 20 oktabr 2026 | Vazifa: … | Hal qildi:
… | Vazifa bajarilmagan bo'lib qoladi. Sabab: …» — one pipe-separated line
with the outcome in the title alone, the consequence buried in the middle of
it and the reason indistinguishable from the facts around it. The card reads
top to bottom in the order a reader needs it:

    h3        the OUTCOME, with a glyph that says it without colour
              (📝 filed · 📤 passed up · ❌ refused · ✅ upheld · ↩️ undone ·
              💬 a message · 👥 brought in)
    bold line what it MEANS for the score, or whose turn it is now — the one
              sentence the reader acts on
    table     the facts: the leader (to everybody but the leader themself),
              the day, the task by number and name, who ruled and in what
              role, or the deadline a late proof missed
    h4+quote  the words — the ruling's reason or comment, the leader's own
              account, the chat message — as a quote carrying its author
    button    «Chatni ochish» INSIDE the body (Bot API 10.3, `<tg-button>`),
              tried first; the same card without it over the ordinary
              keyboard when Telegram refuses buttons in a body (`RichTry`)

**One recipe for every key** the fan-out sends — the four filing kinds, the
rulings at both stages, the undo, the free chat message and the invitation,
for objections and late proofs alike — so the whole chain reads the same.
The TITLE is the template's own (`_mk_notif`), the values are the bell
row's own (`_notif_values`: dates in the reader's language, names through
the name convention, DB text through `transliterate_text`), and the
consequence sentences below are the templates' own words lifted out of the
pipe line — so the bell, the rich DM and the classic DM can never disagree
about an outcome. `classic` is the same card as plain Telegram HTML, for a
client that refuses rich messages (`notify_profile(html_fn=…)`).

The bell row is untouched: it still renders the `_NOTIF_STRINGS` template at
view time, as every bell row does.
"""
from __future__ import annotations

import logging
from html import escape

logger = logging.getLogger(__name__)

# ── which card a key is ──────────────────────────────────────────────────────

FILED, RULING, UNDONE, MESSAGE, INVITED = "filed", "ruling", "undone", "message", "invited"

FAMILY = {
    "leader_dispute_filed": FILED,
    "leader_dispute_filed_auto": FILED,
    "leader_dispute_filed_admin": FILED,
    "leader_dispute_filed_deadline": FILED,
    "late_proof_filed": FILED,
    "leader_dispute_uplifted": RULING,
    "leader_dispute_sup_rejected": RULING,
    "leader_dispute_sup_rejected_auto": RULING,
    "leader_dispute_sup_rejected_admin": RULING,
    "leader_dispute_sup_rejected_deadline": RULING,
    "leader_dispute_approved": RULING,
    "leader_dispute_rejected": RULING,
    "late_proof_uplifted": RULING,
    "late_proof_approved": RULING,
    "late_proof_rejected": RULING,
    "leader_dispute_undone": UNDONE,
    "leader_dispute_undone_sup": UNDONE,
    "late_proof_undone": UNDONE,
    "late_proof_undone_sup": UNDONE,
    "leader_dispute_message": MESSAGE,
    "late_proof_message": MESSAGE,
    "leader_dispute_invited": INVITED,
    "late_proof_invited": INVITED,
}

# The glyph says the outcome without colour — Telegram paints nothing.
GLYPH = {
    FILED: "📝", UNDONE: "↩️", MESSAGE: "💬", INVITED: "👥",
    "leader_dispute_uplifted": "📤", "late_proof_uplifted": "📤",
    "leader_dispute_approved": "✅", "late_proof_approved": "✅",
}
_REFUSED = "❌"

# A ruling whose words are a REQUIRED reason, not an optional comment: an
# admin's refusal (the end of the chain) and a late proof refused. The
# heading over the quote says which (`Sabab` / `Izoh` — the templates' rule).
REASON_KEYS = frozenset({"leader_dispute_rejected", "late_proof_rejected"})

# The consequence sentence of a ruling or an undo — the templates' own words.
_AFTER_KEYS = (
    "leader_dispute_uplifted", "leader_dispute_sup_rejected",
    "leader_dispute_sup_rejected_auto", "leader_dispute_sup_rejected_admin",
    "leader_dispute_sup_rejected_deadline", "leader_dispute_approved",
    "leader_dispute_rejected", "leader_dispute_undone",
    "leader_dispute_undone_sup", "late_proof_uplifted", "late_proof_approved",
    "late_proof_rejected", "late_proof_undone", "late_proof_undone_sup",
)

L = {
    "uz": {
        "leader": "Lider", "date": "Sana", "task": "Vazifa", "due": "Muddat",
        "ruled": "Qaror", "undone_by": "Bekor qildi", "turn": "Navbat",
        "turn_sup": "brigadir ko'rib chiqadi",
        "turn_adm": "adminlar qarori kutilmoqda",
        "role_sup": "brigadir", "role_adm": "admin",
        "reason": "Sabab", "comment": "Izoh", "leader_note": "Lider izohi",
        "late_why": "Kechikish sababi", "files": "Fayllar",
        "invited_note": "Chatda yozishingiz mumkin, har bir xabar haqida xabar olasiz.",
        "after": dict(zip(_AFTER_KEYS, (
            "Endi adminlar qarorini kutmoqda.",
            "AI qarori kuchida qoladi.",
            "Avtomatik tekshiruv natijasi kuchida qoladi.",
            "Admin qarori kuchida qoladi.",
            "Vazifa bajarilmagan bo'lib qoladi.",
            "Vazifa yana bajarilgan deb hisoblanadi.",
            "Vazifa bajarilmagan bo'lib qoladi.",
            "Norozilik yana adminlar qarorini kutmoqda, chat qayta ochildi.",
            "Norozilik yana brigadir ko'rib chiqishini kutmoqda, chat qayta ochildi.",
            "Endi adminlar qarorini kutmoqda.",
            "Vazifa to'liq ballini oldi.",
            "Bu vazifa uchun ball berilmaydi.",
            "Yana adminlar qarorini kutmoqda, chat qayta ochildi.",
            "Yana brigadir ko'rib chiqishini kutmoqda, chat qayta ochildi.",
        ))),
    },
    "uz_cyrl": {
        "leader": "Лидер", "date": "Сана", "task": "Вазифа", "due": "Муддат",
        "ruled": "Қарор", "undone_by": "Бекор қилди", "turn": "Навбат",
        "turn_sup": "бригадир кўриб чиқади",
        "turn_adm": "админлар қарори кутилмоқда",
        "role_sup": "бригадир", "role_adm": "админ",
        "reason": "Сабаб", "comment": "Изоҳ", "leader_note": "Лидер изоҳи",
        "late_why": "Кечикиш сабаби", "files": "Файллар",
        "invited_note": "Чатда ёзишингиз мумкин, ҳар бир хабар ҳақида хабар оласиз.",
        "after": dict(zip(_AFTER_KEYS, (
            "Энди админлар қарорини кутмоқда.",
            "AI қарори кучида қолади.",
            "Автоматик текширув натижаси кучида қолади.",
            "Админ қарори кучида қолади.",
            "Вазифа бажарилмаган бўлиб қолади.",
            "Вазифа яна бажарилган деб ҳисобланади.",
            "Вазифа бажарилмаган бўлиб қолади.",
            "Норозилик яна админлар қарорини кутмоқда, чат қайта очилди.",
            "Норозилик яна бригадир кўриб чиқишини кутмоқда, чат қайта очилди.",
            "Энди админлар қарорини кутмоқда.",
            "Вазифа тўлиқ баллини олди.",
            "Бу вазифа учун балл берилмайди.",
            "Яна админлар қарорини кутмоқда, чат қайта очилди.",
            "Яна бригадир кўриб чиқишини кутмоқда, чат қайта очилди.",
        ))),
    },
    "ru": {
        "leader": "Лидер", "date": "Дата", "task": "Задача", "due": "Срок",
        "ruled": "Решение", "undone_by": "Отменил(а)", "turn": "Очередь",
        "turn_sup": "рассматривает бригадир",
        "turn_adm": "ждёт решения администраторов",
        "role_sup": "бригадир", "role_adm": "администратор",
        "reason": "Причина", "comment": "Комментарий",
        "leader_note": "Комментарий лидера", "late_why": "Причина задержки",
        "files": "Файлы",
        "invited_note": "Вы можете писать в чате и будете получать уведомления о каждом сообщении.",
        "after": dict(zip(_AFTER_KEYS, (
            "Теперь ждёт решения администраторов.",
            "Решение ИИ остаётся в силе.",
            "Результат автоматической проверки остаётся в силе.",
            "Решение администратора остаётся в силе.",
            "Задача остаётся невыполненной.",
            "Задача снова засчитана как выполненная.",
            "Задача остаётся незачтённой.",
            "Возражение снова ждёт решения администраторов, чат открыт заново.",
            "Возражение снова у бригадира, чат открыт заново.",
            "Теперь ждёт решения администраторов.",
            "Задача получила полный балл.",
            "Балл за эту задачу не начислен.",
            "Снова ждёт решения администраторов, чат открыт заново.",
            "Снова у бригадира, чат открыт заново.",
        ))),
    },
    "en": {
        "leader": "Leader", "date": "Date", "task": "Task", "due": "Due",
        "ruled": "Ruling", "undone_by": "Undone by", "turn": "Next",
        "turn_sup": "the brigadir reviews it",
        "turn_adm": "waiting on the admins",
        "role_sup": "brigadir", "role_adm": "admin",
        "reason": "Reason", "comment": "Comment",
        "leader_note": "The leader's note", "late_why": "Why it is late",
        "files": "Files",
        "invited_note": "You can write in the chat and will hear about every message.",
        "after": dict(zip(_AFTER_KEYS, (
            "Now waiting on the admins.",
            "The AI ruling stands.",
            "The automatic check result stands.",
            "The admin's ruling stands.",
            "The task stays not done.",
            "The task counts as done again.",
            "The task stays not done.",
            "The objection is waiting on the admins again and its chat is open.",
            "The objection is back with the brigadir and its chat is open.",
            "Now waiting on the admins.",
            "The task got its full weight.",
            "No point is given for this task.",
            "It is waiting on the admins again and its chat is open.",
            "It is back with the brigadir and its chat is open.",
        ))),
    },
}


def _esc(v) -> str:
    """Element content only; `quote=False` keeps Uzbek apostrophes literal
    (the `forecast_rich._esc` rule). The one attribute, the button's URL, is
    escaped on its own."""
    return escape(str(v), quote=False)


def _t(lang: str) -> dict:
    return L.get(lang) or L["uz"]


def covers(nkey: str) -> bool:
    """Whether this module draws a card for the key — a key it does not know
    keeps the plain template DM."""
    return nkey in FAMILY


# ── the card's content, decided once per (reader, language) ─────────────────

def _spec(thread: str, row, nkey: str, params: dict, lang: str, *,
          stage: str | None, to_leader: bool) -> dict:
    """Everything a rendering needs, in words: the title, the consequence
    line, the fact rows, the quote and its author, the trailing lines."""
    from app.routers.staff import _mk_notif, _notif_values
    fam = FAMILY[nkey]
    t = _t(lang)
    vals = _notif_values(params, lang)
    title = _mk_notif(nkey, params, lang)[0]
    glyph = GLYPH.get(nkey) or GLYPH.get(fam) or _REFUSED

    rows: list[tuple[str, str, str]] = []
    if not to_leader and vals.get("leader"):
        rows.append(("👤", t["leader"], str(vals["leader"])))
    if vals.get("date"):
        rows.append(("📅", t["date"], str(vals["date"])))
    task = str(vals.get("task") or "—")
    task_id = getattr(row, "task_id", None)
    if task_id:
        task = f"№{int(task_id)} · {task}"
    rows.append(("📋", t["task"], task))
    if fam == FILED:
        if thread == "late" and vals.get("deadline"):
            rows.append(("🕐", t["due"], str(vals["deadline"])))
        turn = (t["turn_sup"] if getattr(row, "status", None) == "supervisor"
                else t["turn_adm"])
        rows.append(("⏳", t["turn"], turn))
    elif fam == RULING:
        role = t["role_sup"] if stage == "supervisor" else t["role_adm"]
        rows.append(("⚖️", t["ruled"], f"{vals.get('by') or '—'} · {role}"))
    elif fam == UNDONE:
        rows.append(("↩️", t["undone_by"], str(vals.get("by") or "—")))

    head = quote = cite = None
    if fam == FILED:
        quote, cite = vals.get("reason"), vals.get("leader")
        head = t["late_why"] if thread == "late" else t["leader_note"]
    elif fam == RULING:
        quote, cite = vals.get("note"), vals.get("by")
        head = t["reason"] if nkey in REASON_KEYS else t["comment"]
    elif fam in (MESSAGE, INVITED):
        quote, cite = vals.get("text"), vals.get("author")
    quote = str(quote).strip() if quote else ""

    after = t["after"].get(nkey, "")
    tail: list[str] = []
    files = vals.get("files")
    if fam in (MESSAGE, INVITED) and files:
        tail.append(f"📎 {t['files']}: {files}")
    if fam == INVITED:
        tail.append(t["invited_note"])
    return {"glyph": glyph, "title": title, "after": after, "rows": rows,
            "head": head, "quote": quote, "cite": cite or "", "tail": tail}


def _button(thread: str, row, lang: str) -> tuple[str, str]:
    from app.services.leader_appeal_chat import chat_url
    from app.telegram_bot import _lt
    label = _lt(lang, "btn_open_chat")
    if label == "btn_open_chat":
        label = "\U0001F4AC Chat"
    return escape(chat_url(thread, row.id), quote=True), label


# ── the two renderings ───────────────────────────────────────────────────────

def body(thread: str, row, nkey: str, params: dict, lang: str, *,
         stage: str | None = None, to_leader: bool = False,
         button: bool = False) -> str:
    """The Rich-HTML body for ONE reader in ONE language. `button` puts the
    chat button inside the body (the first try); without it the keyboard
    carries the way in."""
    s = _spec(thread, row, nkey, params, lang, stage=stage, to_leader=to_leader)
    parts = [f"<h3>{s['glyph']} {_esc(s['title'])}</h3>"]
    if s["after"]:
        parts.append(f"<p><b>{_esc(s['after'])}</b></p>")
    parts.append(
        "<table bordered striped>\n"
        + "\n".join(f"<tr><td>{g} {_esc(k)}</td><td>{_esc(v)}</td></tr>"
                    for g, k, v in s["rows"])
        + "\n</table>")
    if s["quote"]:
        if s["head"]:
            parts.append(f"<h4>{_esc(s['head'])}</h4>")
        cite = f"<br><cite>{_esc(s['cite'])}</cite>" if s["cite"] else ""
        parts.append(f"<blockquote>{_esc(s['quote'])}{cite}</blockquote>")
    for line in s["tail"]:
        parts.append(f"<p>{_esc(line)}</p>")
    if button:
        url, label = _button(thread, row, lang)
        parts.append(f'<p><tg-button type="web_app" url="{url}">'
                     f"{_esc(label)}</tg-button></p>")
    return "\n".join(parts)


def classic(thread: str, row, nkey: str, params: dict, lang: str, *,
            stage: str | None = None, to_leader: bool = False) -> str:
    """The same card as plain Telegram HTML, for a client that refuses rich
    messages: same words, same order, its own title line (the HTML send path
    has no separate title), the keyboard under it carrying the button."""
    s = _spec(thread, row, nkey, params, lang, stage=stage, to_leader=to_leader)
    lines = [f"<b>{s['glyph']} {_esc(s['title'])}</b>"]
    if s["after"]:
        lines.append(f"<b>{_esc(s['after'])}</b>")
    lines.append("")
    lines += [f"{g} <b>{_esc(k)}:</b> {_esc(v)}" for g, k, v in s["rows"]]
    if s["quote"]:
        lines.append("")
        if s["head"]:
            lines.append(f"<b>{_esc(s['head'])}</b>")
        cite = f"\n— {_esc(s['cite'])}" if s["cite"] else ""
        lines.append(f"<blockquote>{_esc(s['quote'])}{cite}</blockquote>")
    for line in s["tail"]:
        lines.append(_esc(line))
    return "\n".join(lines)


def fns(thread: str, row, nkey: str, params: dict, *, stage: str | None = None,
        to_leader: bool = False):
    """`(rich_fn, html_fn)` for `notify_profile` — `(None, None)` for a key
    this module does not draw, so that key keeps its plain DM. `rich_fn`
    returns the two tries: the card with the button in its body and no
    keyboard, then the same card without it over the ordinary keyboard."""
    if not covers(nkey):
        return None, None
    from app.telegram_bot import RichTry

    def rich(lang: str) -> list:
        return [RichTry(body(thread, row, nkey, params, lang, stage=stage,
                             to_leader=to_leader, button=True),
                        markup=None, label="appeal button"),
                RichTry(body(thread, row, nkey, params, lang, stage=stage,
                             to_leader=to_leader))]

    def html(lang: str) -> str:
        return classic(thread, row, nkey, params, lang, stage=stage,
                       to_leader=to_leader)

    return rich, html
