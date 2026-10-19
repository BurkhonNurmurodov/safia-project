"""«Tugmalar sinovi» — the three messages with buttons inside them, sent to ONE
admin, so the operator can see on a real phone that Telegram takes them
(2026-10-19, after Phase 2 shipped untested against Telegram).

Sent through the very builders and the very send path the real DMs use:

1. the brigadir's day digest — the most recent unit-day a digest went out for,
   rebuilt now (`leader_unit_report.build`), so its «Ochish» buttons open real
   day reports;
2. the auto-check warning — task 9's card, with sample figures, its «Ochish»
   inside the first step;
3. the call forecast — a real unit's forecast for its next shift-day, on a TEST
   notice (`forecast_answer.TEST_SENDER`): its «Tasdiqlash» / «O'zgartirish»
   work end to end, but the notice is invisible to the «Smenaga chaqirish»
   modal and the 19:00 / 06:00 send, the brigadir is never told, and no
   «Jurnal» row is written.

Nobody but the tester receives anything. After the three, a summary says for
each one which shape Telegram accepted: buttons inside the message, or the
fallback with the buttons under it — the answer the test exists for.

Two doors: `/buttontest` in the bot (admins), and a one-shot at deploy to the
operator (`startup.send_button_test`).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal

logger = logging.getLogger(__name__)

W = {
    "uz": {
        "intro": ("🧪 Tugmalar sinovi — quyida 3 ta xabar. Hammasi sinov: "
                  "brigadirlar hech narsa olmaydi, javoblaringiz hech qayerda "
                  "hisobga kirmaydi."),
        "digest": "1) Brigadirning kunlik hisoboti — har lider qatorida «Ochish»",
        "warn": "2) Avtomatik tekshiruv ogohlantirishi — 1-qadamda «Ochish»",
        "forecast": "3) Chaqiruv prognozi — «Tasdiqlash» va «O'zgartirish» (bosib ko'ring)",
        "inside": "✅ tugmalar xabar ichida",
        "below": "⚠️ Telegram xabar ichidagi tugmalarni qabul qilmadi — tugmalar ostida",
        "photo": "⚠️ rasm sifatida, tugmalar ostida",
        "text": "⚠️ oddiy matn, tugmalar ostida",
        "failed": "❌ yuborilmadi",
        "none": "— ma'lumot yo'q, yuborilmadi",
        "summary": "Natija:",
    },
    "uz_cyrl": {
        "intro": ("🧪 Тугмалар синови — қуйида 3 та хабар. Ҳаммаси синов: "
                  "бригадирлар ҳеч нарса олмайди, жавобларингиз ҳеч қаерда "
                  "ҳисобга кирмайди."),
        "digest": "1) Бригадирнинг кунлик ҳисоботи — ҳар лидер қаторида «Очиш»",
        "warn": "2) Автоматик текширув огоҳлантириши — 1-қадамда «Очиш»",
        "forecast": "3) Чақирув прогнози — «Тасдиқлаш» ва «Ўзгартириш» (босиб кўринг)",
        "inside": "✅ тугмалар хабар ичида",
        "below": "⚠️ Telegram хабар ичидаги тугмаларни қабул қилмади — тугмалар остида",
        "photo": "⚠️ расм сифатида, тугмалар остида",
        "text": "⚠️ оддий матн, тугмалар остида",
        "failed": "❌ юборилмади",
        "none": "— маълумот йўқ, юборилмади",
        "summary": "Натижа:",
    },
    "ru": {
        "intro": ("🧪 Проверка кнопок — ниже 3 сообщения. Всё тестовое: "
                  "бригадиры ничего не получат, ваши ответы нигде не учитываются."),
        "digest": "1) Дневной отчёт бригадира — «Открыть» в строке каждого лидера",
        "warn": "2) Предупреждение об автопроверке — «Открыть» в 1-м шаге",
        "forecast": "3) Прогноз вызова — «Подтвердить» и «Изменить» (нажмите)",
        "inside": "✅ кнопки внутри сообщения",
        "below": "⚠️ Telegram не принял кнопки внутри сообщения — кнопки под ним",
        "photo": "⚠️ как фото, кнопки под ним",
        "text": "⚠️ обычный текст, кнопки под ним",
        "failed": "❌ не отправлено",
        "none": "— нет данных, не отправлено",
        "summary": "Итог:",
    },
    "en": {
        "intro": ("🧪 Button test — 3 messages below. All of it is a test: no "
                  "supervisor receives anything and your answers count nowhere."),
        "digest": "1) Supervisor's day digest — «Open» on each leader's row",
        "warn": "2) Auto-check warning — «Open» in step 1",
        "forecast": "3) Call forecast — «Confirm» and «Change» (tap them)",
        "inside": "✅ buttons inside the message",
        "below": "⚠️ Telegram refused buttons inside the message — buttons under it",
        "photo": "⚠️ as a photo, buttons under it",
        "text": "⚠️ plain text, buttons under it",
        "failed": "❌ not sent",
        "none": "— no data, not sent",
        "summary": "Result:",
    },
}


def _w(lang: str) -> dict:
    return W.get(lang) or W["uz"]


class _Shape:
    """Which shape reached the tester — `send_tg_notification`'s on_sent."""

    def __init__(self):
        self.kind, self.index, self.result = None, None, None

    def __call__(self, kind, index, result):
        self.kind, self.index, self.result = kind, index, result

    def word(self, w: dict, ok: bool) -> str:
        if not ok or self.kind is None:
            return w["failed"]
        if self.kind == "rich":
            return w["inside"] if self.index == 0 else w["below"]
        return w["photo"] if self.kind == "photo" else w["text"]


def _digest(tid: int, lang: str, w: dict) -> str:
    from app.models import LeaderUnitReport
    from app.services import leader_reports, leader_unit_rich
    from app.services.leader_unit_report import build, unit_url
    from app.routers.staff import _mk_notif, _mk_notif_tg
    from app.telegram_bot import RichTry, send_tg_notification

    with SessionLocal() as db:
        led = (db.query(LeaderUnitReport)
               .filter(LeaderUnitReport.sends > 0)
               .order_by(LeaderUnitReport.last_sent_at.desc()).first())
        p = build(db, led.manager_id, led.date) if led is not None else None
    if not p or not p.get("rows"):
        return w["none"]
    counts = p["counts"]
    params = {
        "date": p["date"], "shift": p["shift"] if p["shift"] is not None else "—",
        "supervisor": p["supervisor"] or "—",
        "score": f"{p['unitScore']}%" if p["unitScore"] is not None else "—",
        "submitted": p["submitted"], "owed": p["owed"],
        "rejected": counts["rejected"], "missing": counts["missing"] + counts["open"],
        "lines": leader_unit_rich.classic_lines(p), "changes": "—", "changes_lines": "—",
    }
    url = unit_url(p["managerId"], p["date"])
    unit_kb = leader_reports._button_markup(url)(lang)
    fallback = leader_unit_rich.fallback_markup(
        p, lang, url, leader_reports._BTN.get(lang) or leader_reports._BTN["ru"])
    title, body = _mk_notif("leader_unit_report", params, lang)
    shape = _Shape()
    ok = send_tg_notification(
        tid, title, body, html=_mk_notif_tg("leader_unit_report", params, lang),
        markup=fallback,
        rich=[RichTry(leader_unit_rich.body(p, lang, None, buttons=True), unit_kb,
                      label="test digest buttons"),
              RichTry(leader_unit_rich.body(p, lang), fallback)],
        on_sent=shape)
    return shape.word(w, ok)


def _warning(tid: int, lang: str, w: dict) -> str:
    from app.models import LeaderTaskDef
    from app.services import leader_auto_rich as card
    from app.services.leader_auto import TASHKENT, _task_name
    from app.routers.staff import _mk_notif
    from app.telegram_bot import RichTry, send_tg_notification

    check = "plan_pct"
    with SessionLocal() as db:
        td = (db.query(LeaderTaskDef)
              .filter(LeaderTaskDef.auto_check.like("plan_pct%")).first())
        tid_task = td.id if td is not None else 9
        name = _task_name(td, lang) if td is not None else "Kunlik plan"
    now = datetime.now(timezone.utc)
    due = now + timedelta(minutes=30)
    hhmm = due.astimezone(TASHKENT).strftime("%H:%M")
    args = dict(task_id=tid_task, task_name=name, due=due, hhmm=hhmm, now=now,
                snap={"facts": {"plan_min": 4200, "fact_min": 1100, "pct": 26}},
                lang=lang, weight=10)
    title, body = _mk_notif("leader_auto_soon_plan_pct",
                            {"task": name, "time": hhmm,
                             "date": due.astimezone(TASHKENT).strftime("%d.%m.%Y")},
                            lang)
    shape = _Shape()
    ok = send_tg_notification(
        tid, title, body, html=card.classic(check, **args),
        markup=card.markup(check, lang),
        rich=[RichTry(card.body(check, **args, button=True), None,
                      label="test step button"),
              RichTry(card.body(check, **args))],
        on_sent=shape)
    return shape.word(w, ok)


def _forecast(tid: int, lang: str, w: dict) -> str:
    from app.models import ForecastCallNotice, Manager
    from app.routers.production import FORECAST_WEEKS, _call_rows
    from app.routers.staff import _mk_notif, _mk_notif_tg
    from app.services import forecast_answer, forecast_autocall, forecast_rich
    from app.telegram_bot import RichTry, send_tg_notification

    with SessionLocal() as db:
        eff_pct = forecast_autocall.settings(db)["capacity_pct"]
        eff = int(round(eff_pct))
        row = target = None
        for shift in (1, 2):
            day = forecast_autocall.target_date(shift)
            rows = [r for r in _call_rows(db, day, eff_pct, shift)
                    if r["forecast"] is not None]
            if rows:
                row, target = rows[0], day
                break
        if row is None:
            return w["none"]
        mgr = db.get(Manager, row["manager_id"])
        count = row["forecast"]
        mx = row["band_hi"] if row["band_hi"] is not None else count
        n = ForecastCallNotice(manager_id=mgr.id, for_date=target, workers=count,
                               sent_by=forecast_answer.TEST_SENDER)
        db.add(n)
        db.flush()
        nid = n.id
        tpl, photo = forecast_rich.card(row, target, lang, eff, FORECAST_WEEKS,
                                        count=count, max_count=mx,
                                        buttons_html=forecast_rich.TOKEN)
        params = {"name": mgr.name, "date": target, "eff": eff,
                  "count": count, "max": mx}
        title, body = _mk_notif("call_forecast", params, lang)
        html = _mk_notif_tg("call_forecast", params, lang)
        track = forecast_answer.Tracker()
        rich = None
        if tpl is not None:
            track.bodies[lang] = tpl
            rich = [RichTry(tpl.replace(forecast_rich.TOKEN,
                                        forecast_rich.button_row(nid, None, lang)),
                            None, label="test forecast buttons"),
                    RichTry(tpl.replace(forecast_rich.TOKEN, ""))]
        shape = _Shape()

        def sent(kind, index, result):
            shape(kind, index, result)
            track.sent(tid, lang, kind, index, result)

        ok = send_tg_notification(
            tid, title, body, html=html,
            markup=forecast_rich.keyboard(nid, None, lang),
            rich=rich, photo=photo, on_sent=sent)
        n.tg_messages = track.messages or None
        n.tg_bodies = track.bodies or None
        db.commit()
    return shape.word(w, ok)


def run(tid: int, lang: str = "uz") -> str:
    """Send the three test messages to ONE account; returns the summary text,
    which is also sent to them last."""
    from app.telegram_bot import bot

    w = _w(lang)
    try:
        bot.send_message(tid, w["intro"])
    except Exception:
        logger.exception("button test: intro failed for %s", tid)
    lines = []
    for key, fn in (("digest", _digest), ("warn", _warning),
                    ("forecast", _forecast)):
        try:
            res = fn(tid, lang, w)
        except Exception:
            logger.exception("button test: %s failed for %s", key, tid)
            res = w["failed"]
        lines.append(f"{w[key]}\n   {res}")
    summary = w["summary"] + "\n\n" + "\n\n".join(lines)
    try:
        bot.send_message(tid, summary)
    except Exception:
        logger.exception("button test: summary failed for %s", tid)
    return summary
