"""The call forecast as a Rich-HTML body (sendRichMessage), with the card as
its figure.

The twin of services/ojidaniya_svodka next door, for the «Smenaga chaqirish»
message: same dialect, same figure mechanism (``tg://photo?id=…`` resolved
against the media attached to the send), same degrade-to-the-classic-DM
contract. Where the plain DM is five labelled lines, this lays the same facts
out as a table and embeds the PNG — so the chart, and with it the history the
recommendation was averaged over, arrives as part of the message instead of as
an attachment beside it.

Three rules, and the first two are what stop this becoming a second answer:

* **The title and the disclaimer are the NOTIFICATION's own.** Both are read
  out of ``_NOTIF_STRINGS["call_forecast"]`` — the template the bell row and
  the classic DM already render — and the disclaimer is simply everything
  after the field block, which carries no placeholders in any of the four
  languages. A brigadir must not be told one thing by the rich message and
  another by the plain one that replaces it when their client cannot render
  rich; copying that wording into this module is how the two would drift, and
  the wording is the part that matters most.

* **Every other word is the CARD's vocabulary** (``forecast_card.L``), so the
  table and the picture beside it name the same figures identically.

* **It computes nothing.** Like the card, it is handed one ``_call_rows`` row.

``with_image`` is False when there is no PNG to attach — the body is then
complete on its own rather than referencing a figure that will not resolve.
"""
from __future__ import annotations

import logging
from datetime import date
from html import escape
from zoneinfo import ZoneInfo

from app.services.forecast_card import _RU_WD_NOM, _fmt_min, _t, basis_line

# The media id the figure resolves against; the sender attaches the PNG under
# it. Must match the ``id`` in the sendRichMessage media array.
PHOTO_ID = "fc1"

# Where the card's own buttons go in its body (Bot API 10.3, `<tg-button-row>`):
# the sender stores the body with this token and swaps in the row for the
# notice's state — unanswered, answered, superseded — so an answer re-draws
# every copy without rendering anything again (services/forecast_answer).
TOKEN = "[[fc-buttons]]"

# The brigadir's answer — the buttons, their outcomes and the bot's replies.
A = {
    "uz": {
        "ok": "✅ Tasdiqlash", "change": "✏️ O'zgartirish",
        "done_ok": "✅ Tasdiqlandi · {n} {p} · {t}",
        "done_own": "✏️ O'zgartirildi: {n} {p} · {t}",
        "stale": "🔄 Bu kun uchun yangi prognoz yuborilgan",
        "ask": ("{day} uchun nechta odam chaqirasiz?\n"
                "Prognoz: {n} {p}.\n\nFaqat raqam yozing — masalan, {n}."),
        "bad": "Faqat butun son yozing, 0 dan {max} gacha — masalan, {n}.",
        "saved_ok": "✅ Qabul qilindi: {day} uchun {n} {p} chaqirasiz.",
        "saved_own": "✏️ Qabul qilindi: {day} uchun {n} {p} (prognoz {f}).",
        "toast_ok": "✅ Tasdiqlandi",
        "cancel": "✖️ Bekor qilish",
        "cancelled": "Bekor qilindi — hech narsa o'zgarmadi.",
        "newer": "Bu kun uchun yangi prognoz yuborilgan — o'shanga javob bering.",
        "past": "Bu kun o'tib ketgan — javob qabul qilinmaydi.",
        "not_yours": "Faqat shu brigadaning brigadiri javob bera oladi.",
        "gone": "Prognoz topilmadi.",
        "failed": "Saqlab bo'lmadi — birozdan keyin qayta urinib ko'ring.",
    },
    "uz_cyrl": {
        "ok": "✅ Тасдиқлаш", "change": "✏️ Ўзгартириш",
        "done_ok": "✅ Тасдиқланди · {n} {p} · {t}",
        "done_own": "✏️ Ўзгартирилди: {n} {p} · {t}",
        "stale": "🔄 Бу кун учун янги прогноз юборилган",
        "ask": ("{day} учун нечта одам чақирасиз?\n"
                "Прогноз: {n} {p}.\n\nФақат рақам ёзинг — масалан, {n}."),
        "bad": "Фақат бутун сон ёзинг, 0 дан {max} гача — масалан, {n}.",
        "saved_ok": "✅ Қабул қилинди: {day} учун {n} {p} чақирасиз.",
        "saved_own": "✏️ Қабул қилинди: {day} учун {n} {p} (прогноз {f}).",
        "toast_ok": "✅ Тасдиқланди",
        "cancel": "✖️ Бекор қилиш",
        "cancelled": "Бекор қилинди — ҳеч нарса ўзгармади.",
        "newer": "Бу кун учун янги прогноз юборилган — ўшанга жавоб беринг.",
        "past": "Бу кун ўтиб кетган — жавоб қабул қилинмайди.",
        "not_yours": "Фақат шу бригаданинг бригадири жавоб бера олади.",
        "gone": "Прогноз топилмади.",
        "failed": "Сақлаб бўлмади — бироздан кейин қайта уриниб кўринг.",
    },
    "ru": {
        "ok": "✅ Подтвердить", "change": "✏️ Изменить",
        "done_ok": "✅ Подтверждено · {n} {p} · {t}",
        "done_own": "✏️ Изменено: {n} {p} · {t}",
        "stale": "🔄 На этот день отправлен новый прогноз",
        "ask": ("Сколько людей вы вызовете на {day}?\n"
                "Прогноз: {n} {p}\n\nНапишите только число — например, {n}."),
        "bad": "Напишите целое число от 0 до {max} — например, {n}.",
        "saved_ok": "✅ Принято: на {day} вы вызываете {n} {p}",
        "saved_own": "✏️ Принято: на {day} — {n} {p} (прогноз {f}).",
        "toast_ok": "✅ Подтверждено",
        "cancel": "✖️ Отмена",
        "cancelled": "Отменено — ничего не изменилось.",
        "newer": "На этот день отправлен новый прогноз — ответьте на него.",
        "past": "Этот день уже прошёл — ответ не принимается.",
        "not_yours": "Ответить может только бригадир этой бригады.",
        "gone": "Прогноз не найден.",
        "failed": "Не удалось сохранить — попробуйте чуть позже.",
    },
    "en": {
        "ok": "✅ Confirm", "change": "✏️ Change",
        "done_ok": "✅ Confirmed · {n} {p} · {t}",
        "done_own": "✏️ Changed: {n} {p} · {t}",
        "stale": "🔄 A newer forecast was sent for this day",
        "ask": ("How many people will you call for {day}?\n"
                "Forecast: {n} {p}.\n\nType a number only — e.g. {n}."),
        "bad": "Type a whole number from 0 to {max} — e.g. {n}.",
        "saved_ok": "✅ Noted: you are calling {n} {p} for {day}.",
        "saved_own": "✏️ Noted: {n} {p} for {day} (forecast {f}).",
        "toast_ok": "✅ Confirmed",
        "cancel": "✖️ Cancel",
        "cancelled": "Cancelled — nothing changed.",
        "newer": "A newer forecast was sent for this day — answer that one.",
        "past": "This day has passed — no answer is taken.",
        "not_yours": "Only this unit's supervisor can answer.",
        "gone": "Forecast not found.",
        "failed": "Could not save — try again in a moment.",
    },
}


def a(lang: str) -> dict:
    return A.get(lang) or A["uz"]


def day_label(target: date, lang: str) -> str:
    """«21.10.2026 (Seshanba)» — the day in the card's own words."""
    t = _t(lang)
    wd = target.weekday()
    name = _RU_WD_NOM[wd] if lang == "ru" else t["wd"][wd]
    return f"{target:%d.%m.%Y} ({name})"


def outcome(state: dict, lang: str) -> str:
    """The text of an answered card's disabled button."""
    w = a(lang)
    at = state.get("at")
    hhmm = at.astimezone(_TASHKENT).strftime("%H:%M") if at else ""
    key = "done_ok" if state.get("answer") == "ok" else "done_own"
    out = w[key].format(n=state.get("count"), p=_t(lang)["people"], t=hhmm)
    return out.rstrip(" ·")


def button_row(notice_id: int | None, state: dict | None, lang: str,
               *, stale: bool = False, preview: bool = False) -> str:
    """The card's buttons, as `<tg-button-row>` blocks inside its body.

    Unanswered: «✅ Tasdiqlash» (green) and «✏️ O'zgartirish». Answered: the
    outcome as a disabled button, then «O'zgartirish» on a row of its own —
    the latest answer wins, so it stays live. Superseded by a newer notice:
    one disabled line saying so. `preview` (the bot's /forecast test door)
    draws both buttons disabled — the layout, with nothing behind it."""
    w = a(lang)

    def row(*buttons) -> str:
        return '<tg-button-row align="left">' + "".join(buttons) + "</tg-button-row>"

    def off(text: str) -> str:
        return f'<tg-button type="disabled">{_esc(text)}</tg-button>'

    if preview:
        return row(off(w["ok"]), off(w["change"]))
    if stale:
        return row(off(w["stale"]))
    change = (f'<tg-button type="callback_data" data="fa:ch:{int(notice_id)}">'
              f"{_esc(w['change'])}</tg-button>")
    if state is None:
        return row(f'<tg-button type="callback_data" style="success" '
                   f'data="fa:ok:{int(notice_id)}">{_esc(w["ok"])}</tg-button>',
                   change)
    return row(off(outcome(state, lang))) + "\n" + row(change)


def keyboard(notice_id: int, state: dict | None, lang: str, *,
             stale: bool = False):
    """The same buttons as an inline keyboard — for a copy sent without
    buttons in its body (the photo and classic fallbacks, or a rich body
    Telegram refused with them)."""
    from telebot import types
    from app import tg_buttons

    w = a(lang)
    kb = types.InlineKeyboardMarkup()
    if stale:
        kb.add(tg_buttons.disabled(w["stale"]))
        return kb
    change = tg_buttons.Button(w["change"], callback_data=f"fa:ch:{int(notice_id)}")
    if state is None:
        kb.row(tg_buttons.approve(w["ok"], f"fa:ok:{int(notice_id)}"), change)
    else:
        kb.add(tg_buttons.disabled(outcome(state, lang)))
        kb.add(change)
    return kb

logger = logging.getLogger(__name__)
_TASHKENT = ZoneInfo("Asia/Tashkent")


def _esc(v) -> str:
    """Escape for element CONTENT — `&`, `<`, `>` and nothing else.

    ``quote=False`` is load-bearing, not a shortcut: Uzbek Latin is full of
    apostrophes (yo'q, ko'rish, o'rtacha) and the default would turn every one
    of them into `&#x27;`. The shipped classic DM escapes only the interpolated
    values and leaves its own text raw, so escaping quotes here would make the
    rich message and the plain one it degrades to look different in exactly the
    language most of the plant reads. Nothing on this body is built into an
    ATTRIBUTE — every attribute is a literal — so quotes need no escaping.
    """
    return escape(str(v), quote=False)


def _notif(lang: str) -> tuple[str, str]:
    """(title, disclaimer) straight from the notification template, so the rich
    message and the classic DM it degrades to say the same thing."""
    # function-level import: staff.py is heavy and importing it at module level
    # would close a circle through the routers.
    from app.routers.staff import _NOTIF_STRINGS

    strings = _NOTIF_STRINGS["call_forecast"]
    title, body = strings.get(lang) or strings["en"]
    parts = body.split("\n\n", 1)
    return title, (parts[1] if len(parts) > 1 else "")


def body(row: dict, target: date, lang: str = "ru", eff: int = 100,
         weeks: int = 3, with_image: bool = True, count=None,
         max_count=None, buttons_html: str | None = None) -> str:
    """The Rich-HTML body for ONE brigadir's call forecast. ``count`` /
    ``max_count`` are the numbers the message states — see
    ``forecast_card.collect``. ``buttons_html`` (``button_row``, or ``TOKEN``
    for the stored copy) goes straight under the facts table, beside the
    count it answers."""
    from app.services.forecast_card import collect

    t = _t(lang)
    data = collect(row, target, weeks, count, max_count)
    title, disclaimer = _notif(lang)
    wd = target.weekday()
    wd_name = _RU_WD_NOM[wd] if lang == "ru" else t["wd"][wd]
    name = _esc(data["name"])
    fc, plan = data["forecast"], data["plan_mean"]
    rec, mx = data["count"], data["max_count"]
    people = _esc(t["people"])

    parts = [f"<h3>{_esc(title)}</h3>"]
    if with_image:
        parts.append(
            f'<figure><img src="tg://photo?id={PHOTO_ID}"/>'
            f'<figcaption>{name} · {_esc(wd_name)}, {target:%d.%m.%Y}'
            f'<cite>Safia IMS</cite></figcaption></figure>')

    parts.append(
        '<table bordered striped>\n'
        f'<tr><td>👤 {_esc(t["sup"])}</td><td align="right"><b>{name}</b></td></tr>\n'
        f'<tr><td>📅 {_esc(t["day"])}</td><td align="right">{target:%d.%m.%Y}</td></tr>\n'
        f'<tr><td>📊 {_esc(t["load"])}</td><td align="right">{eff}%</td></tr>\n'
        f'<tr><td>🧑‍🍳 {_esc(t["rec"])}</td><td align="right">'
        f'<b>{rec if rec is not None else "—"} {people}</b></td></tr>\n'
        f'<tr><td>⚠️ {_esc(t["max"])}</td><td align="right">'
        f'{mx if mx is not None else "—"} {people}</td></tr>\n'
        # The plan the count is for, in the plant's own unit. Brigadirs read
        # trudoyomkost all day on «Zagruzka fayli»; the count alone made them
        # take the minutes on trust.
        f'<tr><td>📄 {_esc(t["plan"])}</td><td align="right">'
        f'{_fmt_min(plan) if plan is not None else "—"} {_esc(t["min"])}</td></tr>\n'
        '</table>')
    if buttons_html:
        parts.append(buttons_html)

    if fc is None:
        # No history, so there is no table to show and no average to explain —
        # say why the figures above are blank instead of leaving them bare.
        parts.append(f"<p>{_esc(t['none'])}</p>")
    else:
        # The week-by-week history is NOT repeated as a table here (the
        # operator's call, 2026-09-09): the figure above already draws those
        # points, labelled with both the worker count and the minutes, so a
        # table of the same three rows made the message long enough to bury
        # the one line that matters — the count to call. The basis sentence
        # below still says how many weeks it was averaged over, which is what
        # a reader needs in order to weigh it.
        conf = t["conf"].get(data["confidence"], data["confidence"])
        parts.append(f"<p>{_esc(basis_line(data, t))} · "
                     f"<b>{_esc(conf)}</b></p>")

    if disclaimer:
        parts.append("<blockquote>"
                     + _esc(disclaimer).replace("\n", "<br/>")
                     + "</blockquote>")
    return "\n".join(parts)


def card(row: dict, target: date, lang: str = "ru", eff: int = 100,
         weeks: int = 3, count=None, max_count=None,
         buttons_html: str | None = None):
    """``(rich body, photo)`` for ONE recipient language — THE builder behind
    the real call DM (``production._send_call_notice``, so the clock AND the
    modal) and behind ``/forecast``, the bot's test door, so what a test shows
    and what a brigadir receives are the output of one function.

    Never raises. The PNG is rendered FIRST because the body points at it: a
    card that fails to render (no font on the box — ``CardError``) yields a body
    built WITHOUT the figure rather than one referencing media that was never
    attached, and a body that fails yields None, so the sender degrades to the
    photo or to the classic DM. A broken card must cost the reader the CARD,
    never the message.

    ``photo`` is ``{"id", "name", "data"}``: ``id`` is what the body's
    ``tg://photo?id=…`` resolves against, ``name`` / ``data`` are the upload.
    """
    from app.services.forecast_card import render_forecast_card

    photo = None
    try:
        png = render_forecast_card(row, target, lang, eff, weeks,
                                   count=count, max_count=max_count)
        photo = {"id": PHOTO_ID, "data": png,
                 "name": f"forecast-{row.get('manager_id', 'x')}-{target:%Y%m%d}.png"}
    except Exception:
        logger.exception("forecast card: render failed for %s on %s",
                         row.get("name"), target)
    try:
        rich = body(row, target, lang, eff, weeks, with_image=photo is not None,
                    count=count, max_count=max_count, buttons_html=buttons_html)
    except Exception:
        logger.exception("forecast card: rich body failed for %s on %s",
                         row.get("name"), target)
        rich = None
    return rich, photo
