"""Shared logic for the in-bot leader daily checklist.

Used by both the bot flow (app/telegram_bot.py) and the API routers
(routers/leader_tasks.py, routers/leaders.py). The task catalog mirrors the
dashboard's historic 13 questions (Leaders.jsx TASK_DETAILS) and is seeded
lazily — no startup-mirror migration needed, the tables themselves come from
Base.metadata.create_all in both boot paths.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import AppSetting, LeaderTaskDef, LeaderTaskEntry, LeaderTaskSetting

CHANNEL_SETTING_KEY = "leader_tasks_channel"

# Tashkent has no DST; a fixed offset keeps the 09:00 boundary math trivial.
_TASHKENT = timezone(timedelta(hours=5))

# The historic 13 checklist questions, in sheet question order (index+1 = id).
# (name_uz, name_uz_cyrl, name_ru, name_en, note_uz, note_uz_cyrl, note_ru,
#  note_en, default_weight) — weights sum to 100.
_SEED = [
    ("Yacheykaning kunlik planini qayd qilish", "Ячейканинг кунлик планини қайд қилиш",
     "Фиксация ежедневной загрузки ячейки (план)", "Daily cell load fixation (plan)",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 10),
    ("Kaskad uchrashuv (ochilish – rejalashtirish)", "Каскад учрашув (очилиш – режалаштириш)",
     "Каскадная встреча (открытие - планерка)", "Cascade meeting (briefing)",
     "Foto hisobot. Zonalarni taqsimlash", "Фото ҳисобот. Зоналарни тақсимлаш",
     "Фотоотчет Распределение зон", "Photo report Zone distribution", 5),
    ("SOP standarti", "СОП стандарти", "СОП стандарт", "SOP Standard",
     "Foto hisobot. Qo'shni yacheykalarni qayd qilish", "Фото ҳисобот. Қўшни ячейкаларни қайд қилиш",
     "Фотоотчет Фиксация смежных ячеек", "Photo report adjacent cell fixation", 10),
    ("Obxod sexa (kuniga 3 marta)", "Обход цеха (кунига 3 марта)",
     "КРУ обход цеха (3 раза в день) (9:00 - 11:00 - 15:00)", "Workshop inspection (3x/day 9:00-11:00-15:00)",
     "Aylanib chiqish chek-listi", "Айланиб чиқиш чек-листи", "Чек лист обхода", "Inspection checklist", 15),
    ("Syryo qabul qilish (sovutgich, ombor)", "Сырьё қабул қилиш (совутгич, омбор)",
     "Прием сырья (холодильник, склад)", "Receiving raw materials",
     "Nazorat varaqasi", "Назорат варақаси", "Контрольный лист", "Control sheet", 5),
    ("O'z vaqtida yetkazib berishni nazorat qilish (ichki logistika)",
     "Ўз вақтида етказиб беришни назорат қилиш (ички логистика)",
     "Контроль своевременных поставок (внутреняя логистика)", "Internal logistics timing control",
     "Kirish taymingini qayd qilish", "Кириш таймингини қайд қилиш",
     "Фиксация Тайминга захода", "Arrival timing fixation", 5),
    ("Nazorat stendini to'ldirish (SAP)", "Назорат стендини тўлдириш (SAP)",
     "Заполнение контрольного стенда (САП)", "Control board filling (SAP)",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
    ("Obespokoennosti kiritish", "Обеспокоенности киритиш",
     "Заполнение обеспокоенности", "Concern reporting",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
    ("Smena davomida rejaning 50% ni qayd qilish", "Смена давомида режанинг 50% ни қайд қилиш",
     "Фиксация 50% плана в течении смены", "50% plan fixation during shift",
     "Brigadirga hisobot", "Бригадирга ҳисобот", "Отчет бригадиру", "Report to supervisor", 10),
    ("SAP rejasini yopish", "SAP режасини ёпиш", "Закрытие плана САП", "SAP plan closure",
     "Brigadir tasdig'i", "Бригадир тасдиғи", "Подтверждение бригадира", "Supervisor confirmation", 10),
    ("Ish jadvalini grafika tuzish", "Иш жадвалини графика тузиш",
     "Составление графика", "Scheduling",
     "Foto hisobot", "Фото ҳисобот", "Фотоотчет", "Photo report", 10),
    ("Zam lider ishini nazorat qilish", "Зам лидер ишини назорат қилиш",
     "Контроль работы зам лидера", "Assistant leader work control",
     "Chek-list foto hisoboti", "Чек-лист фото ҳисоботи",
     "Фотоотчет чек листа", "Checklist photo report", 5),
    ("Liderning smena hisoboti", "Лидернинг смена отчёти",
     "Сменный отчёт лидера", "Leader's shift report",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
]


def ensure_task_defs(db: Session) -> list[LeaderTaskDef]:
    """Return the catalog, seeding it on first touch."""
    defs = db.query(LeaderTaskDef).order_by(LeaderTaskDef.id).all()
    if defs:
        return defs
    for i, row in enumerate(_SEED, start=1):
        db.add(LeaderTaskDef(
            id=i,
            name_uz=row[0], name_uz_cyrl=row[1], name_ru=row[2], name_en=row[3],
            note_uz=row[4], note_uz_cyrl=row[5], note_ru=row[6], note_en=row[7],
            default_weight=row[8],
        ))
    db.commit()
    return db.query(LeaderTaskDef).order_by(LeaderTaskDef.id).all()


def task_name(td: LeaderTaskDef, lang: str) -> str:
    return {
        "uz": td.name_uz, "uz_cyrl": td.name_uz_cyrl,
        "ru": td.name_ru, "en": td.name_en,
    }.get(lang) or td.name_uz


def effective_settings(db: Session, manager_id: int) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight} for one supervisor: explicit
    rows over virtual defaults (enabled, 1 photo, the seeded weight)."""
    defs = ensure_task_defs(db)
    rows = {
        s.task_id: s
        for s in db.query(LeaderTaskSetting).filter_by(manager_id=manager_id).all()
    }
    out = {}
    for td in defs:
        s = rows.get(td.id)
        out[td.id] = {
            "enabled": s.enabled if s else True,
            "min_media": s.min_media if s else 1,
            "weight": s.weight if s else td.default_weight,
        }
    return out


def effective_date(now: datetime | None = None) -> str:
    """ISO date of the checklist day. A day runs 09:01 → 09:00 next morning
    Tashkent time: anything at or before 09:00 belongs to the previous date
    (the 21:00 night shift closes on its starting date)."""
    now = (now or datetime.now(timezone.utc)).astimezone(_TASHKENT)
    if (now.hour, now.minute) <= (9, 0):
        now -= timedelta(days=1)
    return now.strftime("%Y-%m-%d")


def compute_completion(settings: dict[int, dict], entries: list[LeaderTaskEntry]) -> float:
    """Weighted score over the ENABLED tasks: done earns its weight, not-done
    and unanswered earn 0."""
    enabled = {tid: s for tid, s in settings.items() if s["enabled"]}
    total = sum(s["weight"] for s in enabled.values())
    if total <= 0:
        return 0.0
    done = sum(
        enabled[e.task_id]["weight"]
        for e in entries
        if e.done and e.task_id in enabled
    )
    return round(done / total * 100, 2)


def channel_chat_id(db: Session) -> str | None:
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    return row.value.strip() if row and row.value and row.value.strip() else None
