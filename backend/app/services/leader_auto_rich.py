"""The «an automatic check is coming» DM, as a Rich message.

`leader_auto._warn` tells a leader, ~30 minutes ahead, that the platform is
about to decide one of their tasks by itself. The first cut was four lines
naming the task and the hour, and it left every question open: WHAT is read,
WHERE it is typed, HOW FAR the leader is from the mark right now, and what
happens if the hour passes. A warning that raises questions is a warning that
gets ignored, so this module answers all of them on the card:

    ⏰ header      the hour, and how many minutes are left
    table          task · hour · WHERE on the platform · who checks (the system)
    📊 state       the leader's LIVE figures — what the check would read now
    ✅ steps       what to do, page by page, in the order it is done
    quote          the rule: no photo, the platform reads the page, late = not done
    button         the page itself (web_app, so the WebView carries the identity)

**Nothing here is a second measurement.** The state block is `leader_auto`'s
own `_Ctx` + runner — the very code that decides the task at the hour — so the
number on the warning and the number in the verdict are one computation. This
module only adds words around it.

**The warning states the JOB, never the pass mark** (the operator's standing
rule, CLAUDE.md «Tasks the PLATFORM answers»): task 9 is printed as «50%» while
its check passes at 30, so `TARGET_PCT` here is the instruction's figure and
the check's `target` fact is deliberately not printed. The state block
therefore carries no pass/fail verdict — it shows the figure and the goal, and
the verdict comes at the hour.

Wiring: `body` / `classic` / `markup` are pure; `snapshot` reads. `send_preview`
is the boot one-shot's sender (`startup.preview_leader_auto_soon_rich`) — the
operator's own test copy, rendered from a real leader's day.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from html import escape

from sqlalchemy.orm import Session

from app.config import settings
from app.models import Cell, LeaderTaskDef, Manager, RoleProfile
from app.services import leader_auto, leader_tasks
from app.services.leader_auto import TASHKENT

logger = logging.getLogger(__name__)

# The instruction's figure for task 9 — what the leader is TOLD (see module doc).
TARGET_PCT = 50

# Which page each check is answered on. `plan_staffing` and `plan_pct` are read
# off the leader's own /production page; `concerns` off the concerns register.
PAGE = {
    "plan_staffing": "/production",
    "plan_pct": "/production",
    "concerns": "/concerns",
}

_WD = {
    "uz": ["dushanba", "seshanba", "chorshanba", "payshanba", "juma",
           "shanba", "yakshanba"],
    "uz_cyrl": ["душанба", "сешанба", "чоршанба", "пайшанба", "жума",
                "шанба", "якшанба"],
    "ru": ["понедельник", "вторник", "среда", "четверг", "пятница",
           "суббота", "воскресенье"],
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
           "Saturday", "Sunday"],
}

# ── the words ────────────────────────────────────────────────────────────────
# Every check has its own WHERE, its own state rows, its own steps: three
# different jobs share a frame, not a text. Keys used by all three sit under
# "common"; per-check keys under the check's name.

L: dict[str, dict] = {
    "uz": {
        "common": {
            "title": "Avtomatik tekshiruv: {time}",
            "h3": "⏰ {time} da avtomatik tekshiruv",
            "left": "{mins} daqiqa qoldi",
            "task": "Vazifa",
            "when": "Tekshiruv vaqti",
            "where": "Qayerda",
            "who": "Kim tekshiradi",
            "who_v": "Tizim o'zi — rasm kerak emas",
            "state": "📊 Hozirgi holat",
            "todo": "✅ Nima qilish kerak",
            "quote": ("{time} da tizim sahifadagi ma'lumotni o'zi o'qiydi va "
                      "natijani sizga yozadi. Rasm yoki skrinshot yuborilmaydi — "
                      "bot qabul qilmaydi. Vaqtida kiritilmagan ma'lumot = "
                      "bajarilmagan vazifa{pts}."),
            "pts": " (−{w} ball)",
            "min": "daq",
            "pcs": "ta",
            "btn_production": "Zagruzka faylini ochish",
            "btn_concerns": "Xavotir yozish",
            "preview": "🧪 Sinov nusxasi · {leader} · {unit} · {date}",
            "no_data": "Ma'lumot o'qilmadi — sahifani o'zingiz tekshiring.",
            "no_sap": "Yacheykangizda SAP kodi yo'q — tizim rejani o'qiy olmaydi. Brigadiringizga yoki adminga ayting: kod /cells reyestrida kiritiladi.",
        },
        "plan_pct": {
            "where": "«Zagruzka fayli» → «Позиции»",
            "plan": "Reja (trudoyomkost)",
            "fact": "Fakt (trudoyomkost)",
            "pct": "Bajarish",
            "need": "kerak: {t}%",
            "nofact": "Fakt kiritilmagan pozitsiyalar",
            "of": "{n} ta ({total} tadan)",
            "gap_under": ("{t}% ga yetish uchun yana ≈ {need} daq fakt "
                          "kiritilishi kerak."),
            "gap_ok": "{t}% ga yetilgan — {time} gacha shu darajada qoling.",
            "gap_noplan": ("Bugunga reja kiritilmagan. Rejasiz vazifa bajarilmagan "
                           "hisoblanadi — avval reja (№1 vazifa) kiritilsin."),
            "steps": [
                "«Zagruzka fayli» sahifasini oching → «Позиции» jadvali.",
                ("Har bir pozitsiyaning ФАКТ katagiga hozirgacha ishlab "
                 "chiqarilgan miqdorni kiriting. SAP fayli tushgan bo'lsa raqam "
                 "o'zi turadi — to'g'riligini tekshiring."),
                "Sahifa tepasidagi «Bajarish %» {t}% dan kam bo'lmasin.",
                ("Hammasini {time} gacha kiriting — tizim shu vaqtda "
                 "sahifadagi raqamni o'qiydi."),
            ],
        },
        "plan_staffing": {
            "where": "«Zagruzka fayli» → «Позиции» va «Odamlar soni»",
            "lines": "Reja kiritilgan pozitsiyalar",
            "people": "Odam soni («Bugungi fakt»)",
            "people_ok": "✅ hamma yacheykada kiritilgan",
            "people_missing": "kiritilmagan: {codes}",
            "cells": "Yacheykalaringiz",
            "gap_noplan": ("Bugunga birorta pozitsiyada reja yo'q. SAP fayli "
                           "tushmagan bo'lsa brigadirga ayting yoki ПЛАН ni "
                           "qo'lda kiriting."),
            "gap_untyped": "{n} ta yacheykada odam soni yo'q: {codes}.",
            "gap_ok": "Ikkalasi ham joyida — {time} gacha shunday qolsin.",
            "steps": [
                ("«Zagruzka fayli» → «Позиции»: bugungi pozitsiyalarda ПЛАН "
                 "0 dan katta bo'lsin."),
                ("«Odamlar soni» → har bir yacheykangizning «Bugungi fakt» "
                 "katagiga bugun ishlayotgan odam sonini kiriting. 0 ham javob — "
                 "bo'sh katak emas."),
                "Ikkalasi ham {time} gacha.",
            ],
        },
        "concerns": {
            "where": "«Xavotirlar» sahifasi",
            "found": "Bugun yozilgan xavotirlar",
            "window": "Hisob oynasi",
            "gap_none": "Hozircha bitta ham xavotir yo'q.",
            "gap_ok": "✅ Xavotir yozilgan — {time} da hisobga olinadi.",
            "steps": [
                "«Xavotirlar» sahifasini oching → «Yangi xavotir».",
                ("Yacheykada ishga to'sqinlik qilayotgan narsani yozing: uskuna, "
                 "xom ashyo, kutish, sifat. Aniq va qisqa."),
                ("Xodimingiz botda sizning yacheykangizga yozgan xavotir ham "
                 "hisobga olinadi."),
                "{time} gacha.",
            ],
        },
    },
    "uz_cyrl": {
        "common": {
            "title": "Автоматик текширув: {time}",
            "h3": "⏰ {time} да автоматик текширув",
            "left": "{mins} дақиқа қолди",
            "task": "Вазифа",
            "when": "Текширув вақти",
            "where": "Қаерда",
            "who": "Ким текширади",
            "who_v": "Тизим ўзи — расм керак эмас",
            "state": "📊 Ҳозирги ҳолат",
            "todo": "✅ Нима қилиш керак",
            "quote": ("{time} да тизим саҳифадаги маълумотни ўзи ўқийди ва "
                      "натижани сизга ёзади. Расм ёки скриншот юборилмайди — "
                      "бот қабул қилмайди. Вақтида киритилмаган маълумот = "
                      "бажарилмаган вазифа{pts}."),
            "pts": " (−{w} балл)",
            "min": "дақ",
            "pcs": "та",
            "btn_production": "Загрузка файлини очиш",
            "btn_concerns": "Хавотир ёзиш",
            "preview": "🧪 Синов нусхаси · {leader} · {unit} · {date}",
            "no_data": "Маълумот ўқилмади — саҳифани ўзингиз текширинг.",
            "no_sap": "Ячейкангизда SAP коди йўқ — тизим режани ўқий олмайди. Бригадирингизга ёки админга айтинг: код /cells реестрида киритилади.",
        },
        "plan_pct": {
            "where": "«Загрузка файли» → «Позиции»",
            "plan": "Режа (трудоёмкость)",
            "fact": "Факт (трудоёмкость)",
            "pct": "Бажариш",
            "need": "керак: {t}%",
            "nofact": "Факт киритилмаган позициялар",
            "of": "{n} та ({total} тадан)",
            "gap_under": ("{t}% га етиш учун яна ≈ {need} дақ факт "
                          "киритилиши керак."),
            "gap_ok": "{t}% га етилган — {time} гача шу даражада қолинг.",
            "gap_noplan": ("Бугунга режа киритилмаган. Режасиз вазифа бажарилмаган "
                           "ҳисобланади — аввал режа (№1 вазифа) киритилсин."),
            "steps": [
                "«Загрузка файли» саҳифасини очинг → «Позиции» жадвали.",
                ("Ҳар бир позициянинг ФАКТ катагига ҳозиргача ишлаб чиқарилган "
                 "миқдорни киритинг. SAP файли тушган бўлса рақам ўзи туради — "
                 "тўғрилигини текширинг."),
                "Саҳифа тепасидаги «Бажариш %» {t}% дан кам бўлмасин.",
                ("Ҳаммасини {time} гача киритинг — тизим шу вақтда саҳифадаги "
                 "рақамни ўқийди."),
            ],
        },
        "plan_staffing": {
            "where": "«Загрузка файли» → «Позиции» ва «Одамлар сони»",
            "lines": "Режа киритилган позициялар",
            "people": "Одам сони («Бугунги факт»)",
            "people_ok": "✅ ҳамма ячейкада киритилган",
            "people_missing": "киритилмаган: {codes}",
            "cells": "Ячейкаларингиз",
            "gap_noplan": ("Бугунга бирорта позицияда режа йўқ. SAP файли тушмаган "
                           "бўлса бригадирга айтинг ёки ПЛАН ни қўлда киритинг."),
            "gap_untyped": "{n} та ячейкада одам сони йўқ: {codes}.",
            "gap_ok": "Иккаласи ҳам жойида — {time} гача шундай қолсин.",
            "steps": [
                ("«Загрузка файли» → «Позиции»: бугунги позицияларда ПЛАН "
                 "0 дан катта бўлсин."),
                ("«Одамлар сони» → ҳар бир ячейкангизнинг «Бугунги факт» "
                 "катагига бугун ишлаётган одам сонини киритинг. 0 ҳам жавоб — "
                 "бўш катак эмас."),
                "Иккаласи ҳам {time} гача.",
            ],
        },
        "concerns": {
            "where": "«Хавотирлар» саҳифаси",
            "found": "Бугун ёзилган хавотирлар",
            "window": "Ҳисоб ойнаси",
            "gap_none": "Ҳозирча битта ҳам хавотир йўқ.",
            "gap_ok": "✅ Хавотир ёзилган — {time} да ҳисобга олинади.",
            "steps": [
                "«Хавотирлар» саҳифасини очинг → «Янги хавотир».",
                ("Ячейкада ишга тўсқинлик қилаётган нарсани ёзинг: ускуна, "
                 "хом ашё, кутиш, сифат. Аниқ ва қисқа."),
                ("Ходимингиз ботда сизнинг ячейкангизга ёзган хавотир ҳам "
                 "ҳисобга олинади."),
                "{time} гача.",
            ],
        },
    },
    "ru": {
        "common": {
            "title": "Автоматическая проверка: {time}",
            "h3": "⏰ Автоматическая проверка в {time}",
            "left": "осталось {mins} мин",
            "task": "Задача",
            "when": "Время проверки",
            "where": "Где",
            "who": "Кто проверяет",
            "who_v": "Система сама — фото не нужно",
            "state": "📊 Текущее состояние",
            "todo": "✅ Что сделать",
            "quote": ("В {time} система сама прочитает данные со страницы и "
                      "напишет вам результат. Фото и скриншоты не отправляются — "
                      "бот их не примет. Данные, не внесённые вовремя = "
                      "невыполненная задача{pts}."),
            "pts": " (−{w} балл.)",
            "min": "мин",
            "pcs": "шт",
            "btn_production": "Открыть файл загрузки",
            "btn_concerns": "Написать обеспокоенность",
            "preview": "🧪 Тестовая копия · {leader} · {unit} · {date}",
            "no_data": "Данные не прочитались — проверьте страницу сами.",
            "no_sap": "У вашей ячейки нет кода SAP — система не может прочитать план. Скажите бригадиру или админу: код вносится в реестре /cells.",
        },
        "plan_pct": {
            "where": "«Файл загрузки» → «Позиции»",
            "plan": "План (трудоёмкость)",
            "fact": "Факт (трудоёмкость)",
            "pct": "Выполнение",
            "need": "нужно: {t}%",
            "nofact": "Позиции без факта",
            "of": "{n} из {total}",
            "gap_under": ("До {t}% не хватает ≈ {need} мин факта."),
            "gap_ok": "{t}% достигнуто — удержите уровень до {time}.",
            "gap_noplan": ("На сегодня план не внесён. Без плана задача считается "
                           "невыполненной — сначала внесите план (задача №1)."),
            "steps": [
                "Откройте «Файл загрузки» → таблица «Позиции».",
                ("В ячейку ФАКТ каждой позиции внесите объём, произведённый к "
                 "этому часу. Если файл SAP загружен, цифра уже стоит — "
                 "проверьте её."),
                "«Выполнение %» вверху страницы должно быть не ниже {t}%.",
                ("Всё внести до {time} — в этот час система читает цифру со "
                 "страницы."),
            ],
        },
        "plan_staffing": {
            "where": "«Файл загрузки» → «Позиции» и «Кол-во людей»",
            "lines": "Позиций с планом",
            "people": "Кол-во людей («Факт на сегодня»)",
            "people_ok": "✅ внесено по всем ячейкам",
            "people_missing": "не внесено: {codes}",
            "cells": "Ваши ячейки",
            "gap_noplan": ("Ни у одной позиции нет плана на сегодня. Если файл SAP "
                           "не загружен — скажите бригадиру или внесите ПЛАН вручную."),
            "gap_untyped": "Нет кол-ва людей в {n} ячейк.: {codes}.",
            "gap_ok": "Оба поля на месте — так и держите до {time}.",
            "steps": [
                ("«Файл загрузки» → «Позиции»: у сегодняшних позиций ПЛАН "
                 "должен быть больше 0."),
                ("«Кол-во людей» → в «Факт на сегодня» каждой вашей ячейки "
                 "внесите число работающих сегодня. 0 — тоже ответ, пустая "
                 "клетка — нет."),
                "Оба поля — до {time}.",
            ],
        },
        "concerns": {
            "where": "Страница «Обеспокоенности»",
            "found": "Обеспокоенностей за сегодня",
            "window": "Учитываемое окно",
            "gap_none": "Пока ни одной обеспокоенности.",
            "gap_ok": "✅ Обеспокоенность записана — учтётся в {time}.",
            "steps": [
                "Откройте «Обеспокоенности» → «Новая обеспокоенность».",
                ("Опишите, что мешает работе в ячейке: оборудование, сырьё, "
                 "ожидание, качество. Коротко и конкретно."),
                ("Обеспокоенность, которую ваш работник написал в боте на вашу "
                 "ячейку, тоже учитывается."),
                "До {time}.",
            ],
        },
    },
    "en": {
        "common": {
            "title": "Automatic check at {time}",
            "h3": "⏰ Automatic check at {time}",
            "left": "{mins} min left",
            "task": "Task",
            "when": "Check time",
            "where": "Where",
            "who": "Who checks",
            "who_v": "The system itself — no photo needed",
            "state": "📊 Current state",
            "todo": "✅ What to do",
            "quote": ("At {time} the system reads the page itself and sends you "
                      "the result. No photo or screenshot — the bot will not "
                      "accept one. Data not entered in time = task not done{pts}."),
            "pts": " (−{w} pts)",
            "min": "min",
            "pcs": "",
            "btn_production": "Open the load file",
            "btn_concerns": "Write a concern",
            "preview": "🧪 Test copy · {leader} · {unit} · {date}",
            "no_data": "The data could not be read — check the page yourself.",
            "no_sap": "Your cell has no SAP code — the system cannot read the plan. Tell your brigadir or an admin: the code is set in the /cells register.",
        },
        "plan_pct": {
            "where": "«Load file» → «Positions»",
            "plan": "Plan (labour minutes)",
            "fact": "Actual (labour minutes)",
            "pct": "Completion",
            "need": "needed: {t}%",
            "nofact": "Positions with no actual",
            "of": "{n} of {total}",
            "gap_under": "≈ {need} more minutes of actual to reach {t}%.",
            "gap_ok": "{t}% reached — hold it until {time}.",
            "gap_noplan": ("No plan entered for today. Without a plan the task "
                           "counts as not done — enter the plan first (task №1)."),
            "steps": [
                "Open the «Load file» page → the «Positions» table.",
                ("In each position's ACTUAL cell enter the quantity produced so "
                 "far. If the SAP file is loaded the figure is already there — "
                 "check it."),
                "«Completion %» at the top of the page must be at least {t}%.",
                "Enter everything by {time} — that is when the system reads it.",
            ],
        },
        "plan_staffing": {
            "where": "«Load file» → «Positions» and «Headcount»",
            "lines": "Positions with a plan",
            "people": "Headcount («Today's actual»)",
            "people_ok": "✅ entered for every cell",
            "people_missing": "missing: {codes}",
            "cells": "Your cells",
            "gap_noplan": ("No position has a plan today. If the SAP file is not "
                           "loaded, tell your brigadir or enter the PLAN by hand."),
            "gap_untyped": "No headcount on {n} cell(s): {codes}.",
            "gap_ok": "Both are in place — keep them so until {time}.",
            "steps": [
                ("«Load file» → «Positions»: today's positions must have a PLAN "
                 "above 0."),
                ("«Headcount» → in «Today's actual» of each of your cells enter "
                 "the people working today. 0 is an answer; an empty cell is not."),
                "Both by {time}.",
            ],
        },
        "concerns": {
            "where": "The «Concerns» page",
            "found": "Concerns written today",
            "window": "Counted window",
            "gap_none": "No concern yet.",
            "gap_ok": "✅ A concern is written — it counts at {time}.",
            "steps": [
                "Open «Concerns» → «New concern».",
                ("Write what is holding up work in the cell: equipment, raw "
                 "material, waiting, quality. Short and specific."),
                ("A concern your worker wrote to your cell in the bot counts "
                 "as well."),
                "By {time}.",
            ],
        },
    },
}


def _esc(v) -> str:
    """Element content only; `quote=False` keeps Uzbek apostrophes literal
    (the `forecast_rich._esc` rule). Every attribute here is a literal."""
    return escape(str(v), quote=False)


def _t(lang: str) -> dict:
    return L.get(lang) or L["uz"]


def _fmt_min(v) -> str:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return "—"
    return f"{n:,}".replace(",", " ")


# ── the live state ───────────────────────────────────────────────────────────

def snapshot(db: Session, prof: RoleProfile, manager: Manager, check: str,
             target: float | None, due: datetime, now: datetime,
             date: str | None = None, cell: Cell | None = None) -> dict:
    """What the check would read RIGHT NOW — `leader_auto`'s own context and
    runner, never a second computation. `{"facts": …, "code": …}` plus, for
    `plan_pct`, the positions that carry a plan and no actual yet. Never
    raises: a data error is `{"error": …}` and the card says so."""
    date = date or leader_tasks.effective_date(manager.shift, now)
    out: dict = {"check": check, "facts": {}, "code": None}
    runner = leader_auto._RUNNERS.get(check)
    if runner is None:
        out["error"] = f"unknown check {check}"
        return out
    ctx = leader_auto._Ctx(db, prof, manager, manager.shift, date, cell, due, now)
    try:
        v = runner(ctx, target)
        out["facts"], out["code"] = dict(v.facts or {}), v.code
        if check == "plan_pct" and ctx.pairs:
            rows = ctx.dashboard.get("rows") or []
            planned = [r for r in rows if float(r.get("plan_qty") or 0) > 0]
            out["positions"] = len(planned)
            out["no_fact"] = sum(1 for r in planned
                                 if float(r.get("actual_qty") or 0) <= 0)
    except Exception as exc:                        # noqa: BLE001 - see doc
        logger.exception("auto-soon snapshot %s failed for leader %s",
                         check, getattr(prof, "id", None))
        out["error"] = str(exc)[:200]
    return out


# ── the card ─────────────────────────────────────────────────────────────────

def _state_rows(check: str, snap: dict, t: dict, c: dict, hhmm: str
                ) -> tuple[list[tuple[str, str]], str]:
    """`([(label, value)…], gap sentence)` for the state block."""
    f, code = snap.get("facts") or {}, snap.get("code")
    if snap.get("error"):
        return [], c["no_data"]
    if code == "no_sap_code":
        # A register error, not the leader's: nothing on the page can fix it,
        # so the card names the fix and who makes it instead of "enter the plan".
        return [], c["no_sap"]
    if check == "plan_pct":
        if code == "no_plan" or float(f.get("plan_min") or 0) <= 0:
            return [(t["plan"], f"0 {c['min']}")], t["gap_noplan"]
        plan, fact = float(f.get("plan_min") or 0), float(f.get("fact_min") or 0)
        pct = f.get("pct", 0)
        rows = [
            (t["plan"], f"{_fmt_min(plan)} {c['min']}"),
            (t["fact"], f"{_fmt_min(fact)} {c['min']}"),
            (t["pct"], f"<b>{pct}%</b> · {t['need'].format(t=TARGET_PCT)}"),
        ]
        if snap.get("positions") is not None:
            rows.append((t["nofact"], t["of"].format(
                n=snap.get("no_fact", 0), total=snap.get("positions", 0))))
        if float(pct) >= TARGET_PCT:
            return rows, t["gap_ok"].format(t=TARGET_PCT, time=hhmm)
        need = max(0.0, plan * TARGET_PCT / 100.0 - fact)
        return rows, t["gap_under"].format(t=TARGET_PCT, need=_fmt_min(need))
    if check == "plan_staffing":
        untyped = list(f.get("untyped") or [])
        codes = ", ".join(str(x) for x in untyped[:8])
        if len(untyped) > 8:
            codes += " …"
        rows = [(t["lines"], f"{f.get('with_plan', 0)} / {f.get('lines', 0)}"),
                (t["people"], (t["people_missing"].format(codes=codes)
                               if untyped else t["people_ok"])),
                (t["cells"], f"{f.get('cells', 0)} {c['pcs']}".strip())]
        if code == "no_plan" or int(f.get("with_plan") or 0) == 0:
            return rows, t["gap_noplan"]
        if untyped:
            return rows, t["gap_untyped"].format(n=len(untyped), codes=codes)
        return rows, t["gap_ok"].format(time=hhmm)
    if check == "concerns":
        n = int(f.get("found") or 0)
        rows = [(t["found"], f"<b>{n}</b> {c['pcs']}".strip())]
        if f.get("from") and f.get("to"):
            rows.append((t["window"], f"{f['from']} → {f['to']}"))
        return rows, (t["gap_ok"].format(time=hhmm) if n else t["gap_none"])
    return [], ""


def _steps(check: str, t: dict, hhmm: str) -> list[str]:
    return [s.format(t=TARGET_PCT, time=hhmm) for s in t["steps"]]


def _when(due: datetime, hhmm: str, lang: str) -> str:
    from app.routers.staff import _fmt_date
    d = due.astimezone(TASHKENT).date()
    return f"{hhmm} · {_fmt_date(d, lang)}, {_WD.get(lang, _WD['uz'])[d.weekday()]}"


def _mins_left(due: datetime, now: datetime) -> int:
    return max(0, int(round((due - now).total_seconds() / 60)))


def body(check: str, *, task_id: int, task_name: str, due: datetime,
         hhmm: str, now: datetime, snap: dict, lang: str = "uz",
         weight=None, preview: str | None = None) -> str:
    """The Rich-HTML body for ONE recipient language."""
    lt = _t(lang)
    c, t = lt["common"], lt[check]
    rows, gap = _state_rows(check, snap, t, c, hhmm)
    pts = c["pts"].format(w=weight) if weight else ""
    parts = [
        f"<h3>{_esc(c['h3'].format(time=hhmm))}</h3>",
        f"<p><b>{_esc(c['left'].format(mins=_mins_left(due, now)))}</b></p>",
        "<table bordered striped>\n"
        f"<tr><td>📋 {_esc(c['task'])}</td><td>№{task_id} · {_esc(task_name)}</td></tr>\n"
        f"<tr><td>🕐 {_esc(c['when'])}</td><td><b>{_esc(_when(due, hhmm, lang))}</b></td></tr>\n"
        f"<tr><td>📍 {_esc(c['where'])}</td><td>{_esc(t['where'])}</td></tr>\n"
        f"<tr><td>🤖 {_esc(c['who'])}</td><td>{_esc(c['who_v'])}</td></tr>\n"
        "</table>",
        f"<h4>{_esc(c['state'])}</h4>",
    ]
    if rows:
        parts.append(
            "<table bordered striped>\n"
            + "\n".join(f"<tr><td>{_esc(k)}</td><td align=\"right\">{v}</td></tr>"
                        for k, v in rows)
            + "\n</table>")
    if gap:
        parts.append(f"<p>{_esc(gap)}</p>")
    parts.append(f"<h4>{_esc(c['todo'])}</h4>\n<ol>\n"
                 + "\n".join(f"<li>{_esc(s)}</li>" for s in _steps(check, t, hhmm))
                 + "\n</ol>")
    parts.append(f"<blockquote>{_esc(c['quote'].format(time=hhmm, pts=pts))}"
                 "</blockquote>")
    if preview:
        parts.append(f"<p>{_esc(preview)}</p>")
    return "\n".join(parts)


def classic(check: str, *, task_id: int, task_name: str, due: datetime,
            hhmm: str, now: datetime, snap: dict, lang: str = "uz",
            weight=None, preview: str | None = None) -> tuple[str, str]:
    """`(title, html)` — the same card as plain Telegram HTML, for a client that
    refuses rich messages. Same words, same order, one message."""
    lt = _t(lang)
    c, t = lt["common"], lt[check]
    rows, gap = _state_rows(check, snap, t, c, hhmm)
    pts = c["pts"].format(w=weight) if weight else ""
    title = c["title"].format(time=hhmm)
    lines = [f"<b>⏰ {_esc(title)}</b> · {_esc(c['left'].format(mins=_mins_left(due, now)))}",
             f"📋 {_esc(c['task'])}: №{task_id} · {_esc(task_name)}",
             f"🕐 {_esc(c['when'])}: <b>{_esc(_when(due, hhmm, lang))}</b>",
             f"📍 {_esc(c['where'])}: {_esc(t['where'])}",
             f"🤖 {_esc(c['who'])}: {_esc(c['who_v'])}",
             "",
             f"<b>{_esc(c['state'])}</b>"]
    lines += [f"• {_esc(k)}: {v}" for k, v in rows]
    if gap:
        lines.append(_esc(gap))
    lines += ["", f"<b>{_esc(c['todo'])}</b>"]
    lines += [f"{i}. {_esc(s)}" for i, s in enumerate(_steps(check, t, hhmm), 1)]
    lines += ["", f"<blockquote>{_esc(c['quote'].format(time=hhmm, pts=pts))}</blockquote>"]
    if preview:
        lines.append(_esc(preview))
    return title, "\n".join(lines)


def markup(check: str, lang: str = "uz"):
    """The web_app button onto the page the check reads — a plain URL button
    would open a browser with no identity (`leader_reports._button_markup`)."""
    from telebot import types
    c = _t(lang)["common"]
    page = PAGE.get(check, "/production")
    label = c["btn_concerns"] if page == "/concerns" else c["btn_production"]
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        label, web_app=types.WebAppInfo(url=f"{settings.webapp_url.rstrip('/')}{page}")))
    return kb


# ── the operator's test copy ─────────────────────────────────────────────────

_PREVIEW_TASKS = ((1, "plan_staffing"), (9, "plan_pct"), (8, "concerns"))
_PREVIEW_SCAN = 12          # dashboard builds the leader search may spend


def _pick_leader(db: Session, now: datetime, defs: dict):
    """A leader with SAP-coded cells whose page carries a plan today — the
    first one found, so the preview shows real figures rather than the no-plan
    branch. Falls back to the first leader with cells at all."""
    units = leader_tasks.per_task_units(db)
    managers = (db.query(Manager)
                .filter(Manager.id.in_(list(units)) if units else False,
                        Manager.archived.is_(False))
                .order_by(Manager.shift, Manager.id).all())
    fallback = None
    tried = 0
    for m in managers:
        date = leader_tasks.effective_date(m.shift, now)
        due_by = leader_auto._unit_due(db, m, defs, date)
        if 9 not in due_by:
            continue
        leaders = (db.query(RoleProfile)
                   .join(Cell, Cell.leader_id == RoleProfile.id)
                   .filter(RoleProfile.role == "leader",
                           RoleProfile.manager_id == m.id,
                           Cell.sap_code.isnot(None))
                   .distinct().order_by(RoleProfile.name).all())
        for prof in leaders[:3]:
            if fallback is None:
                fallback = (m, prof, date, due_by, None)
            snap = snapshot(db, prof, m, "plan_pct", 30.0, due_by[9][0], now,
                            date=date)
            tried += 1
            if float((snap.get("facts") or {}).get("plan_min") or 0) > 0:
                return (m, prof, date, due_by, snap)
            if tried >= _PREVIEW_SCAN:
                return fallback
    return fallback


def send_preview(db: Session, chat_id: int, date_from=None, date_to=None,
                 lang: str = "uz") -> int:
    """DM `chat_id` the three warnings as one real leader would receive them
    today — the `_send_report_once` sender shape. Returns messages sent."""
    from app.telegram_bot import send_tg_notification
    from app.translit import transliterate

    now = datetime.now(timezone.utc).astimezone(TASHKENT)
    defs = {td.id: td for td in db.query(LeaderTaskDef)
            .filter(LeaderTaskDef.id.in_([tid for tid, _ in _PREVIEW_TASKS])).all()}
    picked = _pick_leader(db, now, defs)
    if picked is None:
        raise RuntimeError("no leader with SAP-coded cells on a per-task unit")
    m, prof, date, due_by, snap9 = picked
    cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
    who = _t(lang)["common"]["preview"].format(
        leader=transliterate(prof.name, lang) or prof.name,
        unit=transliterate(m.name, lang) or m.name, date=date)
    sent = 0
    for tid, check in _PREVIEW_TASKS:
        td = defs.get(tid)
        if td is None or tid not in due_by:
            continue
        due, hhmm = due_by[tid]
        # A check whose hour is already past today still previews as the
        # warning would have looked ~28 minutes before it.
        shown_now = now if now < due - timedelta(minutes=5) else due - timedelta(minutes=28)
        target = 30.0 if check == "plan_pct" else None
        snap = snap9 if (check == "plan_pct" and snap9) else snapshot(
            db, prof, m, check, target, due, now, date=date)
        weight = (cfg.get(tid) or {}).get("weight")
        kw = dict(task_id=tid, task_name=leader_auto._task_name(td, lang),
                  due=due, hhmm=hhmm, now=shown_now, snap=snap, lang=lang,
                  weight=weight, preview=who)
        title, html = classic(check, **kw)
        if send_tg_notification(chat_id, title, html, html=html,
                                markup=markup(check, lang),
                                rich=body(check, **kw)):
            sent += 1
    return sent
