"""Shared logic for the in-bot leader daily checklist.

Used by both the bot flow (app/telegram_bot.py) and the API routers
(routers/leader_tasks.py, routers/leaders.py). The task catalog mirrors the
dashboard's historic 13 questions (Leaders.jsx TASK_DETAILS) and is seeded
lazily — no startup-mirror migration needed, the tables themselves come from
Base.metadata.create_all in both boot paths.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    LeaderUnitSetting,
    AppSetting, LeaderTaskConfigAudit, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskExample, LeaderTaskLeaderSetting, LeaderTaskPendingChange,
    LeaderTaskSetting, Manager, RoleProfile,
)
# The photo window's shape, defaults and re-derivation live with the reviewer
# that reads them — this module only stores and displays them. Safe as a
# top-level import: leader_ai names this module in comments only.
from app.services import leader_ai

CHANNEL_SETTING_KEY = "leader_tasks_channel"

_LANGS = ("uz", "uz_cyrl", "ru", "en")

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


def _row_names(row) -> dict[str, str | None]:
    """The per-language name_* columns of a settings row as a dict."""
    return {l: getattr(row, f"name_{l}") for l in _LANGS}


def config_name(entry: dict, lang: str) -> str:
    """Display name out of an effective-config entry's resolved `names`."""
    names = entry.get("names") or {}
    return names.get(lang) or names.get("uz") or ""


def effective_settings(db: Session, manager_id: int) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight, names} for one supervisor:
    explicit rows over virtual defaults (enabled, 1 photo, the seeded weight).
    `names` are the RAW per-supervisor rename overrides (None = the global
    LeaderTaskDef name) — the admin matrix needs the raw layer to show
    divergence, so resolution stays with the caller."""
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
            "names": _row_names(s) if s else {l: None for l in _LANGS},
            # RAW like `names`: None = inherit the global definition-of-done.
            # The AI reviewer reads this chain (services/leader_ai.criteria_for).
            "criteria": (s.criteria if s else None) or None,
            # RAW too, and each end on its own: None = inherit, and at the
            # global level that lands on the shift default.
            "win_from": (s.win_from if s else None) or None,
            "win_to": (s.win_to if s else None) or None,
            # RAW: None = inherit the global submission deadline (informational).
            "deadline": (s.deadline if s else None) or None,
            # RAW tri-state, and `or None` would destroy it: None = inherit,
            # False = this unit's filings are exempt from the date question.
            "date_check": s.date_check if s else None,
            # Same tri-state, same trap: None = inherit, False = this unit is
            # judged by the DAY alone (the hour is not compared to the window).
            "time_check": s.time_check if s else None,
            # RAW: None = inherit the global collection mode. "camera" here is
            # what enrols a whole unit in in-app capture.
            "proof_kind": (s.proof_kind if s else None) or None,
        }
    return out


def leader_overrides(db: Session, leader_ids: list[int]) -> dict[int, dict[int, dict]]:
    """leader_id → task_id → RAW override {enabled, min_media, weight, names}
    (every field nullable; absent task = full inherit). Sparse — only stored
    rows are returned."""
    out: dict[int, dict[int, dict]] = {}
    if not leader_ids:
        return out
    rows = (
        db.query(LeaderTaskLeaderSetting)
        .filter(LeaderTaskLeaderSetting.leader_id.in_(leader_ids))
        .all()
    )
    for r in rows:
        out.setdefault(r.leader_id, {})[r.task_id] = {
            "enabled": r.enabled,
            "min_media": r.min_media,
            "weight": r.weight,
            "names": _row_names(r),
            "criteria": r.criteria or None,
            "win_from": r.win_from or None,
            "win_to": r.win_to or None,
            "deadline": r.deadline or None,
            "date_check": r.date_check,
            "time_check": r.time_check,
            "proof_kind": r.proof_kind or None,
        }
    return out


def resolve_deadline(*levels) -> str | None:
    """The submission deadline in force — first non-blank "HH:MM" walking the
    levels narrowest-first (leader row, supervisor row, global def; any may be
    None). No shift default on purpose: blank everywhere means "no task-specific
    deadline", and the tab then shows the DAY's filing deadline, labelled as the
    day's, rather than inventing one here."""
    for row in levels:
        if row is None:
            continue
        v = leader_ai.hhmm(getattr(row, "deadline", None))
        if v:
            return v
    return None


# The two ways a proof can be collected. "screenshot" is the floor: a level
# that says nothing, and a platform that never ran the migration, both land
# here, so in-app capture is only ever something an admin switched ON.
PROOF_KINDS = ("screenshot", "camera")

# In-app capture is a PILOT, and a pilot must not be switchable for the whole
# company by one tap in the wrong modal. The global level of the chain is the
# one every unit inherits, so while this flag stands it may only ever hold
# "screenshot": camera is enrolled per SUPERVISOR or per LEADER, and nowhere
# else. That is enforced here rather than only in the admin UI, because the
# endpoint is reachable without it — and it is one constant to flip on the day
# camera becomes the platform default.
CAMERA_IS_PILOT = True


def resolve_proof_kind(*levels) -> str:
    """How this task's proof is collected — first non-blank walking the levels
    narrowest-first (leader row, supervisor row, global def; any may be None).

    A plain first-non-blank walk and not the tri-state boolean dance the date
    rule needs: the values are strings, so "" / None is unambiguously "inherit"
    and there is no falsy value that means something.
    """
    for row in levels:
        if row is None:
            continue
        v = (getattr(row, "proof_kind", None) or "").strip()
        if v in PROOF_KINDS:
            return v
    return "screenshot"


def effective_leader_config(db: Session, prof, shift: int | None = None) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight, names, window, criteria, deadline}
    fully RESOLVED for one leader (RoleProfile): global catalog → supervisor
    override → leader override, field by field. `names` here are the final
    display names per language. This is what the bot's /tasks flow and day
    scoring run on.

    `window` is the (from, to) clock a proof photo for that task must fall in —
    resolved the same way, then defaulted by SHIFT, which is why the caller may
    pass one. Callers that only score a day can leave it out; the bot passes the
    shift it already computed, because that window is printed to the leader.
    `date_check` is whether that window is ENFORCED at all: False and the bot
    must stop printing it, or a leader reads hours nothing measures them by.

    `criteria` (the definition of done) and `deadline` (informational "due by")
    resolve down the same chain and are what the /leaders «Vazifalar» tab shows
    a leader beside each task; the bot and the scorer ignore both.
    """
    defs = ensure_task_defs(db)
    sup = {
        s.task_id: s
        for s in db.query(LeaderTaskSetting)
        .filter_by(manager_id=prof.manager_id).all()
    } if prof.manager_id else {}
    own = {
        r.task_id: r
        for r in db.query(LeaderTaskLeaderSetting)
        .filter_by(leader_id=prof.id).all()
    }
    out = {}
    for td in defs:
        s, r = sup.get(td.id), own.get(td.id)
        enabled = s.enabled if s else True
        min_media = s.min_media if s else 1
        weight = s.weight if s else td.default_weight
        if r:
            enabled = r.enabled if r.enabled is not None else enabled
            min_media = r.min_media if r.min_media is not None else min_media
            weight = r.weight if r.weight is not None else weight
        names = {}
        for l in _LANGS:
            names[l] = (
                (getattr(r, f"name_{l}", None) if r else None)
                or (getattr(s, f"name_{l}", None) if s else None)
                or getattr(td, f"name_{l}")
            )
        criteria = ""
        for level in (r, s, td):
            if level is not None and (level.criteria or "").strip():
                criteria = level.criteria.strip()
                break
        out[td.id] = {
            "enabled": enabled, "min_media": min_media,
            "weight": weight, "names": names,
            "window": leader_ai.resolve_window(shift, r, s, td),
            # The shift the window above was resolved AGAINST, carried with it:
            # a night shift's window hours can sit on the report day's tomorrow
            # (leader_ai.window_offset), so every reader that judges a clock by
            # this window needs the shift in the same hand.
            "shift": shift,
            # Resolved beside the window it governs: with either of these False
            # the window is not enforced, so no surface may present it as a
            # requirement — `date_check` False asks nothing about the day at all,
            # `time_check` False asks about the day but never the hour.
            "date_check": leader_ai.resolve_date_check(r, s, td),
            "time_check": leader_ai.resolve_time_check(r, s, td),
            "criteria": criteria,
            "deadline": resolve_deadline(r, s, td),
            # WHERE the leader answers this task: the bot chat, or the mini-app
            # camera. The bot branches on it, so it is resolved here with
            # everything else the bot reads rather than looked up separately.
            "proof_kind": resolve_proof_kind(r, s, td),
        }
    return out


def requirements_for(db: Session, *, prof=None, manager=None,
                     shift: int | None = None) -> dict:
    """What the /leaders «Vazifalar» tab shows: the ENABLED tasks in force for
    one subject — a leader (`prof`, the fully resolved chain), a supervisor's
    unit (`manager`, its level of the chain: no per-leader rows), or the global
    catalog (neither) — each with its display names, proof-type note, the
    definition of done, weight, min photos, photo window, deadline and example
    photo ids. `shift` decides the window default and the day's filing window;
    a subject with a unit takes the unit's shift, the global catalog the one
    the caller asks for (1 when unstated — the regime the tab was built for).

    Returned as plain dicts keyed for the client, names/notes as per-language
    maps so the page picks its own language.
    """
    defs = ensure_task_defs(db)
    if manager is None and prof is not None and prof.manager_id:
        manager = db.query(Manager).filter_by(id=prof.manager_id).first()
    if manager is not None and manager.shift in (1, 2):
        shift = manager.shift
    if shift not in (1, 2):
        shift = 1

    if prof is not None:
        cfg = effective_leader_config(db, prof, shift)
        level = "leader"
    else:
        cfg = {}
        sup_rows = {
            s.task_id: s
            for s in db.query(LeaderTaskSetting).filter_by(manager_id=manager.id).all()
        } if manager is not None else {}
        for td in defs:
            s = sup_rows.get(td.id)
            names = {
                l: (getattr(s, f"name_{l}", None) if s else None) or getattr(td, f"name_{l}")
                for l in _LANGS
            }
            crit = ""
            for level_row in (s, td):
                if level_row is not None and (level_row.criteria or "").strip():
                    crit = level_row.criteria.strip()
                    break
            cfg[td.id] = {
                "enabled": s.enabled if s else True,
                "min_media": s.min_media if s else 1,
                "weight": s.weight if s else td.default_weight,
                "names": names,
                "window": leader_ai.resolve_window(shift, s, td),
                "date_check": leader_ai.resolve_date_check(s, td),
                "time_check": leader_ai.resolve_time_check(s, td),
                "criteria": crit,
                "deadline": resolve_deadline(s, td),
                "proof_kind": resolve_proof_kind(s, td),
            }
        level = "supervisor" if manager is not None else "global"

    # Does this subject's unit submit task by task? It decides whether the tab
    # prints a per-task closing hour at all: outside that mode nothing closes a
    # task on its own, and an hour on the card would promise an automation the
    # unit does not have. Imported lazily — leader_close imports this module.
    from app.services import leader_close
    per_task = manager is not None and manager.id in per_task_units(db)

    examples: dict[int, list[int]] = {}
    for eid, tid in (db.query(LeaderTaskExample.id, LeaderTaskExample.task_id)
                     .order_by(LeaderTaskExample.id).all()):
        examples.setdefault(tid, []).append(eid)

    tasks = []
    for td in defs:
        c = cfg.get(td.id)
        if not c or not c["enabled"]:
            continue
        tasks.append({
            "id": td.id,
            "names": c["names"],
            "note": {l: getattr(td, f"note_{l}") or "" for l in _LANGS},
            "criteria": c["criteria"] or "",
            "weight": int(c["weight"] or 0),
            "min_media": int(c["min_media"] or 0),
            "window": list(c["window"]),
            # False ⇒ the tab must NOT print the window as a rule: the leader
            # would be reading a requirement nothing enforces, which is the same
            # mistake in reverse as enforcing one nobody stated. `time_check`
            # False is the middle answer — the DAY must be right, the hours are
            # not a rule — so the tab states that instead of the window.
            "date_check": bool(c["date_check"]),
            "time_check": bool(c["time_check"]),
            "deadline": c["deadline"],
            # The hour this task actually stops accepting work in per-task mode,
            # straight from the sweep's own definition so the card and the
            # closer can never name two different times. Null outside that mode.
            "closes_at": leader_close.task_deadline(c, shift) if per_task else None,
            # WHERE this task is answered. The tab says it in words, because a
            # leader who expects to send a file to the chat and finds no upload
            # accepted has been left to guess.
            "proof_kind": c.get("proof_kind") or "screenshot",
            "examples": examples.get(td.id, []),
        })
    total = sum(t["weight"] for t in tasks)

    # The day's filing window — the deadline a task without one of its own
    # falls back to. Imported lazily: routers.leaders imports this module.
    from app.routers.leaders import WINDOW
    opens, closes, overnight = WINDOW[shift]
    return {
        "level": level,
        "shift": shift,
        # The unit closes each task on its own, so the cards carry `closes_at`
        # and the tab may say the closing is automatic.
        "per_task": per_task,
        "subject": {
            "leader": prof.name if prof is not None else None,
            "leader_id": prof.id if prof is not None else None,
            "supervisor": manager.name if manager is not None else None,
            "manager_id": manager.id if manager is not None else None,
        },
        "filing": {"from": opens.strftime("%H:%M"), "to": closes.strftime("%H:%M"),
                   "overnight": overnight},
        "photo_default": list(leader_ai.SHIFT_WINDOW.get(shift) or leader_ai.SHIFT_WINDOW[1]),
        "total_weight": total,
        "tasks": tasks,
    }


def set_criteria(db: Session, *, task_id: int, criteria: str,
                 manager_id: int | None = None, leader_id: int | None = None) -> None:
    """Write the "what makes this task truly done" text at one level of the
    chain. Blank clears the override (and falls back to the level above).

    Deliberately NOT stageable through the "apply from next day" machinery that
    carries enabled/min_media/weight: criteria change nothing a leader sees or
    does in the bot — they only change how already-collected photos are judged
    — so deferring them to a shift boundary would be a delay with no meaning.

    When a level has no row yet, the row is materialised with the values that
    level already resolves to, so writing criteria can never silently change
    what the task requires.
    """
    text = (criteria or "").strip() or None

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if text is None:
                return  # nothing stored, nothing to clear
            # Every field on this table is nullable "inherit", so a fresh row
            # carrying only criteria overrides nothing else.
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
        row.criteria = text
        # Clearing the last override on the row drops the row: a leader row
        # that overrides nothing would still ring "overridden" in the matrix.
        if text is None and _leader_row_bare(row):
            db.delete(row)
    elif manager_id is not None:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if not row:
            if text is None:
                return
            # Absent row = the virtual default; materialise exactly that.
            td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
            row = LeaderTaskSetting(
                manager_id=manager_id, task_id=task_id, enabled=True,
                min_media=1, weight=td.default_weight if td else 0,
            )
            db.add(row)
        row.criteria = text
    else:
        td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not td:
            return
        td.criteria = text
    db.commit()


def target_shifts(db: Session, *, manager_id: int | None = None,
                  leader_id: int | None = None,
                  manager_ids: list[int] | None = None,
                  leader_ids: list[int] | None = None) -> set[int | None]:
    """Which shifts a config write actually LANDS on.

    A window is written at one of three levels and every one of them resolves to
    real people on real shifts: a leader's own row reaches that leader's unit, a
    supervisor's row reaches that unit, and the GLOBAL level reaches every
    active unit on the platform — which is precisely how a window written in
    shift-1 hours reached shift-2 leaders on 26 Aug and cost them the night.
    """
    ids: list[int] = []
    if leader_ids or leader_id is not None:
        want = list(leader_ids or []) + ([leader_id] if leader_id is not None else [])
        ids = [m for (m,) in db.query(RoleProfile.manager_id)
               .filter(RoleProfile.id.in_(want)).all() if m]
    elif manager_ids or manager_id is not None:
        ids = list(manager_ids or []) + ([manager_id] if manager_id is not None else [])
    if ids:
        return {sh for (sh,) in db.query(Manager.shift)
                .filter(Manager.id.in_(ids)).all()}
    # Global: every shift that has somebody on it.
    return {sh for (sh,) in db.query(Manager.shift)
            .filter(Manager.archived.is_(False)).distinct().all()}


def window_shift_problems(db: Session, lo: str | None, hi: str | None,
                          **target) -> list[tuple[int | None, str, str]]:
    """Shifts this window cannot be worked on — `(shift, lo, hi)` each.

    A blank end inherits, and what it inherits is not knowable here, so the
    shift's own default stands in for it: that is the value the chain falls
    through to, and it is the reading that catches the end an admin DID type.
    Empty list means the window is workable everywhere it lands.
    """
    if not lo and not hi:
        return []                                   # clearing a level
    bad = []
    for shift in target_shifts(db, **target):
        d_lo, d_hi = leader_ai.shift_window(shift)
        win = (lo or d_lo, hi or d_hi)
        if not leader_ai.window_fits_shift(shift, win):
            bad.append((shift, win[0], win[1]))
    return bad


def set_window(db: Session, *, task_id: int, win_from: str | None,
               win_to: str | None, manager_id: int | None = None,
               leader_id: int | None = None, rejudge: bool = True) -> None:
    """Write the proof-photo window at one level of the chain. A blank end
    clears that end alone and falls back to the level above (and, at the global
    level, to the shift default) — which is why both inputs are optional.

    Not stageable through the "apply from next day" machinery, for the same
    reason `set_criteria` is not: the window changes how already-collected
    photos are JUDGED, not what the leader is asked to do, so deferring it to a
    shift boundary would be a delay with no meaning. (The bot does show the
    window on the photo prompt now — but it reads the live value, so a mid-shift
    edit and the judgement it causes always agree.)

    When a level has no row yet, the row is materialised with the values that
    level already resolves to, so writing a window can never silently change
    what the task requires.
    """
    lo, hi = leader_ai.hhmm(win_from), leader_ai.hhmm(win_to)

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if lo is None and hi is None:
                return  # nothing stored, nothing to clear
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
    elif manager_id is not None:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if not row:
            if lo is None and hi is None:
                return
            td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
            row = LeaderTaskSetting(
                manager_id=manager_id, task_id=task_id, enabled=True,
                min_media=1, weight=td.default_weight if td else 0,
            )
            db.add(row)
    else:
        row = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not row:
            return
    row.win_from, row.win_to = lo, hi
    # Same rule as set_criteria: a leader row left overriding nothing goes.
    if leader_id is not None and _leader_row_bare(row):
        db.delete(row)
    db.commit()
    # Verdicts already written for this task were judged against the OLD window.
    # Re-deriving them costs nothing (the clock the model read is stored on the
    # row) and is the difference between an edit that fixes the queue and one
    # that only fixes reports filed after it.
    #
    # `rejudge=False` is for a fan-out over many supervisors/leaders: the pass
    # is per TASK, so doing it inside the loop would re-scan the same rows once
    # per row written. The caller runs it once when the loop is done.
    if rejudge:
        leader_ai.sync_date_flags(db, [task_id])


def set_date_check(db: Session, *, task_id: int, date_check: bool | None,
                   manager_id: int | None = None, leader_id: int | None = None,
                   rejudge: bool = True) -> None:
    """Write "is the date checked for this task" at one level of the chain.

    See `_set_chain_flag` for the shape both halves of the date rule share; this
    one answers whether the day is asked about AT ALL, and False makes its twin
    moot (nothing is compared, so there is no hour question either).
    """
    _set_chain_flag(db, task_id=task_id, attr="date_check", value=date_check,
                    manager_id=manager_id, leader_id=leader_id, rejudge=rejudge)


def set_time_check(db: Session, *, task_id: int, time_check: bool | None,
                   manager_id: int | None = None, leader_id: int | None = None,
                   rejudge: bool = True) -> None:
    """Write "is the CLOCK checked, or is the day enough" at one level.

    The other half of the same rule, written through the same helper on purpose:
    the two travel together on every read (`leader_ai.date_rule_for`), and two
    hand-written level-materialisers would eventually disagree about what an
    absent row means — which is a silent change to what a task requires.
    """
    _set_chain_flag(db, task_id=task_id, attr="time_check", value=time_check,
                    manager_id=manager_id, leader_id=leader_id, rejudge=rejudge)


def _sup_row(db: Session, manager_id: int, task_id: int, *,
             create: bool) -> "LeaderTaskSetting | None":
    """This supervisor's row for this task, materialised on demand — and
    surviving a concurrent materialisation of the same row.

    Every side endpoint on this modal (criteria, window, deadline, the date
    rule, the proof kind) writes THIS row, and a brigadir who has never been
    edited has none. Two of them arriving together both INSERT it and one dies
    on `uq_ltask_setting`, which the operator reads as "saved" while one of
    their fields quietly did not. The admin now serialises its writes, but the
    endpoints are reachable without it, so the loser re-reads the winner's row
    and writes into that instead of failing.

    Created with the values the level already resolves to, the same rule the
    rest of the chain follows, so materialising it can never change what the
    task requires.
    """
    row = (db.query(LeaderTaskSetting)
           .filter_by(manager_id=manager_id, task_id=task_id).first())
    if row or not create:
        return row
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    row = LeaderTaskSetting(
        manager_id=manager_id, task_id=task_id, enabled=True,
        min_media=1, weight=td.default_weight if td else 0,
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return (db.query(LeaderTaskSetting)
                .filter_by(manager_id=manager_id, task_id=task_id).first())
    return row


def _set_chain_flag(db: Session, *, task_id: int, attr: str,
                    value: bool | None, manager_id: int | None = None,
                    leader_id: int | None = None, rejudge: bool = True) -> None:
    """Write one tri-state BOOLEAN rule at one level of the global → supervisor →
    leader chain. None clears the level and falls back to the level above; at the
    GLOBAL level None is stored as True, because that level is the chain's floor
    and has nothing left to inherit from.

    Same shape and the same re-judge as `set_window` — for the same reason: these
    change how already-collected photos are JUDGED, not what the leader is asked
    to do, so they apply at once and every verdict already written is re-decided
    from its stored clocks (no Gemini call, no quota). Relaxing a task therefore
    CLEARS the date flags off its existing reports, and tightening it back
    restores them; nothing is destroyed either way.

    A level with no row yet is materialised with the values that level already
    resolves to, so writing this can never silently change what the task
    requires (same rule as criteria/window/deadline).
    """
    v = None if value is None else bool(value)

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if v is None:
                return  # nothing stored, nothing to clear
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
    elif manager_id is not None:
        row = _sup_row(db, manager_id, task_id, create=v is not None)
        if row is None:
            return
    else:
        row = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not row:
            return
        # The floor of the chain is never "inherit".
        v = True if v is None else v
    setattr(row, attr, v)
    # Same rule as set_criteria/set_window: a leader row left overriding nothing
    # goes, so the matrix's "overridden" mark keeps meaning something.
    if leader_id is not None and _leader_row_bare(row):
        db.delete(row)
    db.commit()
    if rejudge:
        leader_ai.sync_date_flags(db, [task_id])


def set_deadline(db: Session, *, task_id: int, deadline: str | None,
                 manager_id: int | None = None, leader_id: int | None = None) -> None:
    """Write the informational submission deadline at one level of the chain.
    Blank clears that level and falls back to the level above (blank
    everywhere ⇒ the tab shows the day's filing deadline instead).

    Not stageable and nothing to re-judge: no verdict, score or flag reads it —
    it is what the «Vazifalar» tab TELLS the leader, so it applies at once, and
    a level with no row yet is materialised with the values that level already
    resolves to (same rule as criteria/window) so setting a deadline can never
    silently change what the task requires."""
    v = leader_ai.hhmm(deadline)

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if v is None:
                return  # nothing stored, nothing to clear
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
    elif manager_id is not None:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if not row:
            if v is None:
                return
            td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
            row = LeaderTaskSetting(
                manager_id=manager_id, task_id=task_id, enabled=True,
                min_media=1, weight=td.default_weight if td else 0,
            )
            db.add(row)
    else:
        row = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not row:
            return
    row.deadline = v
    db.commit()


def set_proof_kind(db: Session, *, task_id: int, proof_kind: str | None,
                   manager_id: int | None = None,
                   leader_id: int | None = None) -> None:
    """Write HOW this task's proof is collected at one level of the chain.
    Blank clears that level and falls back to the level above; at the GLOBAL
    level blank is stored as "screenshot", because that level is the chain's
    floor and has nothing left to inherit from — and while `CAMERA_IS_PILOT`
    stands, "screenshot" is the ONLY thing that level may hold.

    Applies at once and stages nothing, for the opposite reason to the criteria:
    this is the one field that changes what the leader is ASKED TO DO, so a
    staged version would leave the bot offering an upload the reviewer no longer
    accepts — or a camera button for a task the config says is a screenshot —
    for a whole shift. It is also why it is never applied mid-answer: the bot
    reads the live value at the moment it renders the task, and a task already
    answered keeps whatever it was answered with (its photos are stored, not
    re-collected).

    Nothing to re-judge either: switching a task to camera does not change how
    photos ALREADY collected are read — those keep the clocks they were judged
    by. Only new shots get a server clock.

    A level with no row yet is materialised with the values that level already
    resolves to, the same rule as criteria/window/deadline, so writing this can
    never silently change what else the task requires.
    """
    v = (proof_kind or "").strip() or None
    if v is not None and v not in PROOF_KINDS:
        raise ValueError(f"unknown proof kind {proof_kind!r}")
    # The global level is every unit's inheritance. Writing camera there once
    # put five tasks of every leader on the platform into a mode built for one
    # test unit (user, 2026-08-19) — so while `CAMERA_IS_PILOT` stands, the
    # floor of the chain can only be "screenshot" and enrolment has to name a
    # supervisor or a leader.
    if (CAMERA_IS_PILOT and v == "camera"
            and manager_id is None and leader_id is None):
        raise ValueError("camera_needs_a_unit")

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if v is None:
                return  # nothing stored, nothing to clear
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
    elif manager_id is not None:
        row = _sup_row(db, manager_id, task_id, create=v is not None)
        if row is None:
            return
    else:
        row = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not row:
            return
        v = v or "screenshot"  # the floor of the chain is never "inherit"
    row.proof_kind = v
    # Same rule as the other side-endpoint fields: a leader row left overriding
    # nothing goes, so the matrix's "overridden" mark keeps meaning something.
    if leader_id is not None and _leader_row_bare(row):
        db.delete(row)
    db.commit()


# ONE boundary, at the hour the night crew actually starts work: the day a
# moment belongs to turns at 17:00, and the day it belongs to dies at
# `deadline_hhmm` (09:00) — the eight hours between are a day that is over but
# not yet superseded, which is what `expired_through` names.
#
# 17:00 → 21:00 → 17:00 (user, 2026-08-14). It was moved to 21:00 on 2026-08-11
# to stop a leader finishing LAST night's checklist at 18:00 from filing it
# against a night that had not started — but that reasoning was already obsolete
# when it shipped: the 09:00 deadline means last night's checklist is closed
# long before 18:00, so the case it protected against cannot occur. What 21:00
# did instead was lock the real night crew out of the first four hours of their
# own shift — at 18:00 `effective_date` named a night that `expired_through` had
# already buried, so /tasks refused the entry outright.
SHIFT2_START_HOUR = 17

# The changeover: shift 1's own filing window shuts at 20:00 (WINDOW[1] in
# routers/leaders.py — kept as a plain number here so the service does not
# import the router). That hour is why `filed_date` cannot read a timestamp
# alone: 20:43 is either the end of one shift's paperwork or the start of the
# next one's, and only the date the leader wrote says which.
#
# With the boundary back at 17:00 this only bites for SHIFT 1 — `day_of` already
# puts a 20:43 stamp on the night it starts, so the shift-2 clause below agrees
# with it instead of correcting it. Kept as written rather than deleted: it is
# the constants, not the logic, that decide which of the two is doing the work,
# and they have now moved twice.
CHANGEOVER_HOUR = 20


def _next_day(iso: str) -> str:
    return (datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")


def day_of(when: datetime, shift: int | None) -> str:
    """The checklist date a Tashkent WALL-CLOCK moment belongs to.

    * shift 1 (or unknown): the plain calendar day, 00:00 → 23:59.
    * shift 2: the day runs 17:00 → 16:59 next afternoon, so anything before
      17:00 belongs to the previous date (the night shift stays on its
      starting date). Its window shuts at 09:00 — the eight hours between are
      a day that is over but not yet superseded, which is the stretch
      `expired_through` exists to name.

    Takes the moment already in Tashkent terms — naive or aware — because the
    two callers hold it differently: the bot converts `now` from UTC, while a
    Google-Form timestamp is the sheet's own naive Tashkent wall clock. Running
    a naive value through `astimezone()` would read it as the SERVER's local
    time, which on the VPS is UTC — five hours off, i.e. every submission
    between 21:00 and 02:00 attributed to the wrong day.
    """
    if shift == 2 and when.hour < SHIFT2_START_HOUR:
        when -= timedelta(days=1)
    return when.strftime("%Y-%m-%d")


def effective_date(shift: int | None = None, now: datetime | None = None) -> str:
    """ISO date of the checklist day happening RIGHT NOW, per the leader's
    shift. The boundary itself is `day_of`."""
    return day_of((now or datetime.now(timezone.utc)).astimezone(_TASHKENT), shift)


def filed_date(sheet_date: str, shift: int | None,
               submitted_at: datetime | None) -> str:
    """Which checklist day a GOOGLE-FORM row reports on.

    The form's «Дата» cell is almost always the right answer for shift 1 (see the
    handover exception below) and the wrong one for shift 2 in BOTH directions.
    That shift files between 17:00 and 09:00, so its
    night carries two calendar dates and the cell holds whichever one the leader
    had in mind:

    * after midnight the form's own "today" stamps TOMORROW onto the night that
      started yesterday. The row lands on a day whose shift has not begun — at
      14:00 the register showed "2-smena" reports for a shift opening at 17:00 —
      while the night it reports on reads as unfiled, and the bot day for the
      same (leader, date) no longer dedupes against it.
    * before midnight the leader writes tomorrow HIMSELF: a night that runs
      17:00 → 09:00 spends nine of its sixteen hours on the next date and gets
      called by it. A report filed at 22:26 on the 10th arrives dated the 11th —
      a day whose filing window opens at 17:00 on the 11th, eighteen hours
      after it was written — so the submission window (routers/leaders.py) voided
      a checklist that was in fact filed five hours into its own shift.

    `day_of` settles which night a timestamp falls in; it names that night by the
    17:00 it started at. So both spellings above are the SAME night, and this
    accepts either one, returning the date the rest of the app keys on:

    * shift 2 only — shift 1's calendar day is the form's date, full stop;
    * only the stamp's own date, or the morning that night ends on. Any other
      date is one the leader deliberately chose — a backfill filed two days
      later — and it stands. A row is therefore never pulled onto a night its
      own timestamp does not touch.

    Plus the RUN-UP, which `day_of` alone gets wrong: a leader arriving for the
    changeover files at 20:43 — seventeen minutes before their own shift opens,
    so `day_of` reads that moment as still belonging to LAST night. The date they
    wrote says otherwise: tomorrow's date is the coming night, not the one that
    ended this morning. Only after the changeover (shift 1 has gone home) and
    only for a row dated the morning that coming night ends, so the ambiguous
    case — the same 20:43 stamp naming the night that just ENDED — is left
    exactly where `day_of` puts it.

    SHIFT 1 gets that one correction and nothing else: its calendar day is the
    form's date, except for the leader who files as they hand over — after 20:00,
    dated tomorrow. That row is the day they just WORKED, not the one starting
    the next morning, and left uncorrected it was voided against a window twelve
    hours in its future. Same clause as the shift-2 run-up, and the same
    conservatism: a date more than a day off the stamp is one the leader chose.

    With no readable timestamp nothing is derived and the sheet's date stands.
    """
    if submitted_at is None or shift not in (1, 2):
        return sheet_date
    claimed, stamped = str(sheet_date)[:10], submitted_at.strftime("%Y-%m-%d")
    # Filed after the changeover, dated tomorrow: shift 1 means the day it just
    # worked, shift 2 the night it is starting. Both are the stamp's own date.
    handover = (submitted_at.hour >= CHANGEOVER_HOUR
                and claimed == _next_day(stamped))
    if shift == 1:
        return stamped if handover else sheet_date
    night = day_of(submitted_at, 2)
    if claimed in (stamped, _next_day(night)):
        return night
    if handover:
        return stamped               # filed in the run-up to its own night
    return sheet_date                # a date the leader chose — respect it


# ── the submission deadline ──────────────────────────────────────────────────
#
# A day stops accepting entries long BEFORE effective_date rolls over to the
# next one. Shift 2 files 17:00 → 09:00 next morning, so its checklist dies at
# 09:00 while the attribution boundary above turns at 17:00 — eight hours
# later. Anything keyed to that boundary leaves a missed night editable all day.

def deadline_hhmm(shift: int | None) -> str:
    """The clock time a day's checklist stops accepting entries. 24-hour, and
    it stays 24-hour in every language the reason is rendered in."""
    return "09:00" if shift == 2 else "23:59"


def expired_through(shift: int | None = None, now: datetime | None = None) -> str:
    """ISO date of the LATEST checklist day whose submission window has already
    shut. Everything on or before it is final and can only be auto-closed.

    Shift 2's day D is filed until D+1 09:00, so shifting the clock back nine
    hours puts "still open" and "expired" on either side of a plain date
    compare. Shift 1's day D is filed until the end of D itself.
    """
    now = (now or datetime.now(timezone.utc)).astimezone(_TASHKENT)
    if shift == 2:
        now -= timedelta(hours=9)
    return (now.date() - timedelta(days=1)).strftime("%Y-%m-%d")


MISSED_PREFIX = "__missed__|"


def missed_reason(shift: int | None) -> str:
    """Sentinel reason for a task the leader never answered before the window
    shut. Deliberately NOT a sentence: a leader-typed reason is free text in
    that leader's own language, so the column cannot also carry one fixed
    message for every viewer. The register expands `__missed__|HH:MM` per
    VIEWER instead, which is also what keeps the time out of AM/PM.
    """
    return f"{MISSED_PREFIX}{deadline_hhmm(shift)}"


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


# ── per-UNIT settings ────────────────────────────────────────────────────────
# Settings that belong to a supervisor's unit rather than to any one task. Kept
# off the global → supervisor → leader task chain on purpose: none of these is a
# property of a task, and a chain has a level that means "everybody".

def per_task_close(db: Session, manager_id: int | None) -> bool:
    """Does this unit close each task on its own instead of closing a day?

    Absent row = False, so a unit is only ever in this mode because an admin
    switched it on — the same floor rule the proof kind follows, and for the
    same reason.
    """
    if not manager_id:
        return False
    row = db.query(LeaderUnitSetting).filter_by(manager_id=manager_id).first()
    return bool(row and row.per_task_close)


def per_task_units(db: Session) -> set[int]:
    """Every unit in per-task mode, in one query — for readers that answer for
    a whole page of leaders at once."""
    return {m for (m,) in db.query(LeaderUnitSetting.manager_id)
            .filter(LeaderUnitSetting.per_task_close.is_(True)).all()}


def unit_bot_from(db: Session, manager_id: int | None) -> str | None:
    """The day this unit's BOT filings start counting, or None.

    Before it the unit is rehearsing: leaders fill the checklist in the bot to
    learn it and the sheet row stays the record. The merge rule reads the whole
    map in one query (`leader_bot.bot_from_floors`) — this is the single-unit
    reader, for the admin panel and for anything answering about one brigadir.
    """
    if not manager_id:
        return None
    row = db.query(LeaderUnitSetting).filter_by(manager_id=manager_id).first()
    return (row.bot_from or None) if row else None


def unit_bot_from_map(db: Session) -> dict[int, str]:
    """Every open rehearsal window, for readers answering a whole page at once."""
    return {m: f for m, f in db.query(LeaderUnitSetting.manager_id,
                                      LeaderUnitSetting.bot_from).all() if f}


_KEEP = object()   # "this call is not about that field" — see set_unit_settings


def set_unit_settings(db: Session, *, manager_id: int, per_task_close: bool,
                      bot_from: str | None, cell_from=_KEEP) -> None:
    """Write a unit's settings — its fields, in ONE call, on purpose.

    They materialise the same `leader_unit_settings` row, and a unit that has
    never been edited has none: fired as two requests, two of them INSERT it
    concurrently and one dies on the primary key while the modal reports
    success. That is the trap the five ltasks task fields already fell into
    (2026-08-19); this row gets ONE writer instead of a second chance at it.

    `per_task_close` applies at once and stages nothing, exactly like the proof
    kind and for the same reason: it changes what the leader is asked to DO.
    Switching it ON mid-day is safe — tasks already answered stay drafts and can
    still be closed one by one — and switching it OFF returns the unit to «Kunni
    yopish» with those drafts intact. What is never undone is a task the leader
    already closed: that lock is final by design, and no config change may
    reopen it.

    `bot_from` moves only which layer is READ, so it is safe to set, clear or
    move at any time and takes effect on the next page load — including
    backwards, which un-does a rehearsal window opened by mistake.

    `cell_from` is the per-cell filing floor (`services/leader_cells.py`) and is
    the one field a caller may DECLINE to mention: it is written from its own
    admin register, while the «Brigada sozlamalari» modal writes the other two,
    so it defaults to the `_KEEP` sentinel and is left exactly as it is unless
    the caller passes something. `None` CLEARS it — that is the rollback, and it
    has to stay expressible, which is why "not mentioned" and "cleared" cannot
    be the same value.
    """
    bot_from = (bot_from or "").strip() or None
    keep_cell = cell_from is _KEEP
    cell_from = None if keep_cell else ((cell_from or "").strip() or None)
    row = db.query(LeaderUnitSetting).filter_by(manager_id=manager_id).first()
    if not row:
        if not per_task_close and not bot_from and not cell_from:
            return                       # nothing stored, nothing to clear
        row = LeaderUnitSetting(manager_id=manager_id)
        db.add(row)
    row.per_task_close = bool(per_task_close)
    row.bot_from = bot_from
    if not keep_cell:
        row.cell_from = cell_from
    db.commit()


def channel_chat_id(db: Session) -> str | None:
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    return row.value.strip() if row and row.value and row.value.strip() else None


# ── Config writes: shared apply layer ─────────────────────────────────────────
# The live config tables always mean "in effect right now". Both the live admin
# endpoints (apply now) and the promotion of a staged change replay the SAME
# apply_* functions below, so a scheduled edit can never behave differently from
# an immediate one. None of these commit — the caller owns the transaction.

def _clamp_m(v: int) -> int:
    return max(0, min(20, int(v)))


def _clamp_w(v: int) -> int:
    return max(0, min(100, int(v)))


def apply_supervisor_cell(db: Session, manager_id: int, task_id: int, enabled: bool,
                          min_media: int, weight: int, names: dict | None) -> None:
    row = (db.query(LeaderTaskSetting)
           .filter_by(manager_id=manager_id, task_id=task_id).first())
    if not row:
        row = LeaderTaskSetting(manager_id=manager_id, task_id=task_id)
        db.add(row)
    row.enabled, row.min_media, row.weight = bool(enabled), _clamp_m(min_media), _clamp_w(weight)
    if names is not None:
        for l in _LANGS:
            setattr(row, f"name_{l}", (names.get(l) or "").strip() or None)


def apply_supervisor_batch(db: Session, manager_id: int, cells: list[dict]) -> None:
    for c in cells:
        apply_supervisor_cell(db, manager_id, int(c["task_id"]), c["enabled"],
                              c["min_media"], c["weight"], c.get("names"))


def _leader_row_extras(row) -> bool:
    """True when a per-leader row carries an override the CELL write never
    sends — criteria, photo window, deadline, the date-check exemption and the
    date-only mode all live on this same row but arrive through their own
    endpoints — so a cell write must not decide the row's fate on its own fields
    alone. `getattr` because these columns were added one at a time and an older
    row object may predate the newest."""
    if row is None:
        return False
    if any((getattr(row, k, None) or "").strip()
           for k in ("criteria", "win_from", "win_to", "deadline", "proof_kind")):
        return True
    # NOT a blank-string test: these are tri-state booleans whose whole point is
    # being False, and `or ""` would read an active exemption as "unset" — the
    # next cell write would then delete the row and silently re-arm the date
    # check on a task somebody had exempted.
    return any(getattr(row, k, None) is not None
               for k in ("date_check", "time_check"))


def _leader_row_bare(row) -> bool:
    """A per-leader row that overrides NOTHING — every cell field null, no
    name, none of the side-endpoint extras. Such a row is deleted wherever the
    last override on it is cleared, so `hasOv` in the matrix keeps meaning
    "something differs" rather than "someone once saved this modal"."""
    return (row.enabled is None and row.min_media is None and row.weight is None
            and not any(getattr(row, f"name_{l}") for l in _LANGS)
            and not _leader_row_extras(row))


def apply_leader_cell(db: Session, leader_id: int, task_id: int, enabled=None,
                      min_media=None, weight=None, names=None, reset=False) -> None:
    row = (db.query(LeaderTaskLeaderSetting)
           .filter_by(leader_id=leader_id, task_id=task_id).first())
    if names is not None:
        nm = {l: (names.get(l) or "").strip() or None for l in _LANGS}
    elif row:
        nm = {l: getattr(row, f"name_{l}") for l in _LANGS}
    else:
        nm = {l: None for l in _LANGS}
    all_inherit = (enabled is None and min_media is None and weight is None
                   and not any(nm.values()))
    # A row that overrides NOTHING is dropped rather than left as a ghost (the
    # matrix would ring it as "overridden" with nothing differing). But the
    # admin's leader modal opens on the supervisor's values and saves every
    # field it left equal as "inherit" — so a save that only changed the
    # criteria arrives here as all-inherit, right after the criteria endpoint
    # wrote its text onto this very row. Deleting on the cell's own fields
    # alone took that text (and any window / deadline) with it.
    if reset or (all_inherit and not _leader_row_extras(row)):
        if row:
            db.delete(row)
        return
    if not row:
        row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
        db.add(row)
    row.enabled = enabled
    row.min_media = None if min_media is None else _clamp_m(min_media)
    row.weight = None if weight is None else _clamp_w(weight)
    for l in _LANGS:
        setattr(row, f"name_{l}", nm[l])


def apply_global_task(db: Session, task_id: int, names=None, note=None,
                      default_weight=None) -> None:
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        raise KeyError(f"task {task_id}")
    if names:  # global names are NOT NULL — only a non-empty value overwrites
        for l in _LANGS:
            v = (names.get(l) or "").strip()
            if v:
                setattr(td, f"name_{l}", v)
    if note is not None:
        for l in _LANGS:
            setattr(td, f"note_{l}", (note.get(l) or "").strip() or None)
    if default_weight is not None:
        td.default_weight = _clamp_w(default_weight)


def _apply(db: Session, kind: str, payload: dict) -> None:
    if kind == "supervisor":
        apply_supervisor_batch(db, int(payload["manager_id"]), payload["cells"])
    elif kind == "leader":
        apply_leader_cell(
            db, int(payload["leader_id"]), int(payload["task_id"]),
            enabled=payload.get("enabled"), min_media=payload.get("min_media"),
            weight=payload.get("weight"), names=payload.get("names"),
            reset=bool(payload.get("reset")),
        )
    elif kind == "global_task":
        apply_global_task(db, int(payload["task_id"]), payload.get("names"),
                          payload.get("note"), payload.get("default_weight"))
    else:
        raise ValueError(f"unknown change kind {kind!r}")


# ── Snapshots: payload-shaped "before" state (for audit + revert) ──────────────

def _snapshot(db: Session, kind: str, payload: dict) -> dict:
    if kind == "supervisor":
        mid = int(payload["manager_id"])
        eff = effective_settings(db, mid)
        cells = []
        for c in payload["cells"]:
            tid = int(c["task_id"])
            s = eff.get(tid, {})
            cells.append({
                "task_id": tid,
                "enabled": s.get("enabled", True),
                "min_media": s.get("min_media", 1),
                "weight": s.get("weight", 0),
                "names": s.get("names") or {l: None for l in _LANGS},
            })
        return {"manager_id": mid, "cells": cells}
    if kind == "leader":
        lid, tid = int(payload["leader_id"]), int(payload["task_id"])
        row = (db.query(LeaderTaskLeaderSetting)
               .filter_by(leader_id=lid, task_id=tid).first())
        if not row:
            return {"leader_id": lid, "task_id": tid, "enabled": None,
                    "min_media": None, "weight": None, "names": None, "reset": True}
        return {
            "leader_id": lid, "task_id": tid, "enabled": row.enabled,
            "min_media": row.min_media, "weight": row.weight,
            "names": _row_names(row), "reset": False,
        }
    if kind == "global_task":
        tid = int(payload["task_id"])
        td = db.query(LeaderTaskDef).filter_by(id=tid).first()
        if not td:
            return {"task_id": tid}
        return {
            "task_id": tid,
            "names": {l: getattr(td, f"name_{l}") for l in _LANGS},
            "note": {l: getattr(td, f"note_{l}") for l in _LANGS},
            "default_weight": td.default_weight,
        }
    return {}


def _target(kind: str, payload: dict) -> tuple[int | None, int | None, int | None]:
    """(task_id, manager_id, leader_id) identity of a change's target."""
    if kind == "supervisor":
        return None, int(payload["manager_id"]), None
    if kind == "leader":
        return int(payload["task_id"]), None, int(payload["leader_id"])
    return int(payload["task_id"]), None, None  # global_task


def _shift_for(db: Session, kind: str, payload: dict) -> int | None:
    """Which day boundary a change flips at: the target unit's shift (1/2), or
    None for a shift-agnostic global_task edit (cosmetic / rarely-governing)."""
    if kind == "supervisor":
        m = db.query(Manager).filter_by(id=int(payload["manager_id"])).first()
        return m.shift if (m and m.shift in (1, 2)) else 1
    if kind == "leader":
        p = db.query(RoleProfile).filter_by(id=int(payload["leader_id"])).first()
        if p and p.manager_id:
            m = db.query(Manager).filter_by(id=p.manager_id).first()
            return m.shift if (m and m.shift in (1, 2)) else 1
        return 1
    return None  # global_task


def _target_exists(db: Session, kind: str, payload: dict) -> bool:
    if kind == "supervisor":
        return bool(db.query(Manager).filter_by(id=int(payload["manager_id"])).first())
    if kind == "leader":
        return bool(db.query(RoleProfile)
                    .filter_by(id=int(payload["leader_id"]), role="leader").first())
    return bool(db.query(LeaderTaskDef).filter_by(id=int(payload["task_id"])).first())


def _delete_pending_target(db: Session, kind: str, tid, mid, lid) -> int:
    """Drop any pending change already staged for this exact target (one pending
    change per target). Returns how many were removed."""
    q = db.query(LeaderTaskPendingChange).filter_by(kind=kind)
    if kind == "supervisor":
        q = q.filter_by(manager_id=mid)
    elif kind == "leader":
        q = q.filter_by(leader_id=lid, task_id=tid)
    else:
        q = q.filter_by(task_id=tid)
    rows = q.all()
    for r in rows:
        db.delete(r)
    return len(rows)


def _audit(db, action, kind, tid, mid, lid, eff=None, before=None, after=None, actor=None):
    db.add(LeaderTaskConfigAudit(
        action=action, kind=kind, task_id=tid, manager_id=mid, leader_id=lid,
        effective_date=eff, before=before, after=after, actor=actor,
    ))


def next_effective_date(shift: int | None) -> str:
    """The checklist date AFTER the current one for this shift — i.e. what
    "apply from next day" resolves to. Global (shift None) uses the calendar
    next day."""
    cur = effective_date(shift if shift in (1, 2) else 1)
    nxt = datetime.strptime(cur, "%Y-%m-%d") + timedelta(days=1)
    return nxt.strftime("%Y-%m-%d")


# ── Config writes: apply-now / stage / promote / cancel / revert ──────────────

def apply_now(db: Session, kind: str, payload: dict, actor: str | None) -> dict:
    """Write a config change to the live tables immediately. Cancels any pending
    change already staged for the same target (it would otherwise re-apply the
    old edit at the boundary)."""
    tid, mid, lid = _target(kind, payload)
    before = _snapshot(db, kind, payload)
    _apply(db, kind, payload)
    superseded = _delete_pending_target(db, kind, tid, mid, lid)
    if superseded:
        _audit(db, "superseded", kind, tid, mid, lid, actor=actor)
    _audit(db, "applied", kind, tid, mid, lid, before=before, after=payload, actor=actor)
    db.commit()
    return {"ok": True, "applied": "now"}


def stage_change(db: Session, kind: str, payload: dict, actor: str | None) -> dict:
    """Queue a config change to take effect from the next checklist day for its
    target's shift. Replaces any change already staged for the same target."""
    shift = _shift_for(db, kind, payload)
    eff = next_effective_date(shift)
    tid, mid, lid = _target(kind, payload)
    _delete_pending_target(db, kind, tid, mid, lid)
    db.add(LeaderTaskPendingChange(
        kind=kind, task_id=tid, manager_id=mid, leader_id=lid, shift=shift,
        effective_date=eff, payload=payload, created_by=actor,
    ))
    _audit(db, "scheduled", kind, tid, mid, lid, eff=eff, after=payload, actor=actor)
    db.commit()
    return {"ok": True, "applied": "next_day", "effective_date": eff, "shift": shift}


def write_change(db: Session, kind: str, payload: dict, when: str, actor: str | None) -> dict:
    """Entry point for a config write: when='now' | 'next_day'."""
    return (stage_change if when == "next_day" else apply_now)(db, kind, payload, actor)


def promote_due(db: Session, shift: int, today: str) -> int:
    """Apply every staged change now due for a leader on this shift/date. Lazy:
    called by the first bot request that observes the new date (there is no
    scheduler). Row-locked with SKIP LOCKED so concurrent Passenger workers
    promote each change exactly once. A shift-agnostic (global_task) change is
    due for either shift's crossing."""
    rows = (
        db.query(LeaderTaskPendingChange)
        .filter(LeaderTaskPendingChange.effective_date <= today,
                or_(LeaderTaskPendingChange.shift == shift,
                    LeaderTaskPendingChange.shift.is_(None)))
        .order_by(LeaderTaskPendingChange.effective_date,
                  LeaderTaskPendingChange.created_at)
        .with_for_update(skip_locked=True)
        .all()
    )
    if not rows:
        return 0
    done = 0
    for pc in rows:
        tid, mid, lid = pc.task_id, pc.manager_id, pc.leader_id
        if not _target_exists(db, pc.kind, pc.payload):
            _audit(db, "failed", pc.kind, tid, mid, lid,
                   eff=pc.effective_date, after=pc.payload, actor=pc.created_by)
            db.delete(pc)
            continue
        before = _snapshot(db, pc.kind, pc.payload)
        sp = db.begin_nested()
        try:
            _apply(db, pc.kind, pc.payload)
            db.flush()
            sp.commit()
        except Exception:
            sp.rollback()
            _audit(db, "failed", pc.kind, tid, mid, lid,
                   eff=pc.effective_date, after=pc.payload, actor=pc.created_by)
            db.delete(pc)
            continue
        _audit(db, "applied", pc.kind, tid, mid, lid, eff=pc.effective_date,
               before=before, after=pc.payload, actor=pc.created_by)
        db.delete(pc)
        done += 1
    db.commit()
    return done


def promote_all_shifts(db: Session) -> int:
    """Promote everything due across both shifts — used by the admin config GET
    so the matrix never shows an un-promoted-but-due state."""
    return promote_due(db, 1, effective_date(1)) + promote_due(db, 2, effective_date(2))


def cancel_pending(db: Session, pending_id: int, actor: str | None) -> bool:
    pc = db.query(LeaderTaskPendingChange).filter_by(id=pending_id).first()
    if not pc:
        return False
    _audit(db, "cancelled", pc.kind, pc.task_id, pc.manager_id, pc.leader_id,
           eff=pc.effective_date, before=pc.payload, actor=actor)
    db.delete(pc)
    db.commit()
    return True


def revert_audit(db: Session, audit_id: int, actor: str | None) -> bool:
    """Restore the `before` state captured by a prior audited change, applied
    immediately (its `before` is already payload-shaped)."""
    a = db.query(LeaderTaskConfigAudit).filter_by(id=audit_id).first()
    if not a or a.before is None:
        return False
    if not _target_exists(db, a.kind, a.before):
        return False
    tid, mid, lid = _target(a.kind, a.before)
    now_before = _snapshot(db, a.kind, a.before)
    _apply(db, a.kind, a.before)
    _delete_pending_target(db, a.kind, tid, mid, lid)
    _audit(db, "reverted", a.kind, tid, mid, lid, before=now_before, after=a.before, actor=actor)
    db.commit()
    return True


def pending_list(db: Session) -> list[dict]:
    rows = (db.query(LeaderTaskPendingChange)
            .order_by(LeaderTaskPendingChange.effective_date,
                      LeaderTaskPendingChange.created_at).all())
    return [{
        "id": pc.id, "kind": pc.kind, "task_id": pc.task_id,
        "manager_id": pc.manager_id, "leader_id": pc.leader_id, "shift": pc.shift,
        "effective_date": pc.effective_date, "payload": pc.payload,
        "created_by": pc.created_by,
        "created_at": pc.created_at.isoformat() if pc.created_at else None,
    } for pc in rows]


def audit_list(db: Session, limit: int = 200) -> list[dict]:
    rows = (db.query(LeaderTaskConfigAudit)
            .order_by(LeaderTaskConfigAudit.ts.desc(),
                      LeaderTaskConfigAudit.id.desc())
            .limit(limit).all())
    return [{
        "id": a.id, "ts": a.ts.isoformat() if a.ts else None, "actor": a.actor,
        "action": a.action, "kind": a.kind, "task_id": a.task_id,
        "manager_id": a.manager_id, "leader_id": a.leader_id,
        "effective_date": a.effective_date,
        "before": a.before, "after": a.after,
        "revertible": a.before is not None
        and a.action in ("applied", "reverted", "superseded"),
    } for a in rows]
