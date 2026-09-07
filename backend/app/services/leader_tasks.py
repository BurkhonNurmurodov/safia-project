"""Shared logic for the in-bot leader daily checklist.

Used by both the bot flow (app/telegram_bot.py) and the API routers
(routers/leader_tasks.py, routers/leaders.py). The task catalog mirrors the
dashboard's historic 13 questions (Leaders.jsx TASK_DETAILS) and is seeded
lazily — no startup-mirror migration needed, the tables themselves come from
Base.metadata.create_all in both boot paths.
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    LeaderUnitSetting,
    AppSetting, LeaderTaskConfigAudit, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskLeaderSetting, LeaderTaskPendingChange,
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

# "which DAY is this call about" — a SENTINEL, because None is a real answer
# here and means something else entirely. Unstated ⇒ the day happening right
# now on the shift being asked about, which is what every live reader wants and
# what keeps every existing call site byte-identical. An explicit None ⇒ no day,
# so no floor applies and the whole catalog answers, which is what the ADMIN
# layers need: they MARK an archived task, they do not drop it.
_NOW = object()

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


# The catalog's reading order. `sort_order` is what an admin rearranges; `id`
# is the tiebreaker that keeps the sequence total — two rows handed the same
# position must still come out in ONE order, or a reorder that half-lands
# leaves the sheet shuffling under the reader. A box that never ran
# `startup.add_leader_task_catalog` holds NULL there and Postgres sorts NULLs
# last, which for a table where they are ALL null is the plain id order the
# platform has always had.
_ORDER = (LeaderTaskDef.sort_order, LeaderTaskDef.id)


def ensure_task_defs(db: Session) -> list[LeaderTaskDef]:
    """Return the catalog — EVERY task, archived ones included — seeding it on
    first touch.

    Deliberately unfiltered, and it must stay that way. This is what the
    HISTORY readers walk: `leader_reports`, `leader_ai.task_label` /
    `task_note` / `criteria_for` / `task_weights`, `routers/leader_ai._task_cfg`
    and `sync_date_flags`, the AiRecheck task picker. Drop an archived task here
    and a past day's report loses its task names, while `task_weights` silently
    rewrites completions that were scored when the task was still asked.

    The ACTIVE set — what a leader is asked TODAY — is `active_defs` below.
    """
    defs = db.query(LeaderTaskDef).order_by(*_ORDER).all()
    if defs:
        return defs
    for i, row in enumerate(_SEED, start=1):
        db.add(LeaderTaskDef(
            id=i,
            name_uz=row[0], name_uz_cyrl=row[1], name_ru=row[2], name_en=row[3],
            note_uz=row[4], note_uz_cyrl=row[5], note_ru=row[6], note_en=row[7],
            default_weight=row[8],
            # The seed states the catalog columns rather than leaning on the
            # Python-side defaults, so a freshly created database and one that
            # ran the migration come out identical row for row.
            sort_order=i, default_enabled=True, default_min_media=1,
        ))
    db.commit()
    return db.query(LeaderTaskDef).order_by(*_ORDER).all()


# ── the ACTIVE set ────────────────────────────────────────────────────────────
# Which of the catalog's tasks a leader is actually asked on a given DAY. Two
# rules hold it together and both are bought from scars already in this file:
#
# * the day is the SHIFT's effective date, never `date.today()` — shift 2's
#   night belongs to the date its 17:00 boundary opened, so a floor read off the
#   calendar starts a night a day late (`leader_cells` states the same rule for
#   `cell_from`, and 26 Aug is what happens when two anchors disagree);
# * NOTHING is deleted. An archived task leaves this set and stays in the
#   catalog, so every history reader goes on naming it.

def is_active(td, day: str | None) -> bool:
    """Is this task asked on `day` ("YYYY-MM-DD", the SHIFT's effective date)?

    A blank day means "no date to judge against", and the answer is then the
    catalog as it stands — TRUE. That degradation is deliberate: every unknown
    here must fall toward the behaviour the platform already had, never toward
    hiding a task from a leader who is standing in front of the bot.
    """
    d = str(day or "")[:10]
    if not d:
        return True
    lo = (getattr(td, "active_from", None) or "").strip()
    if lo and d < lo:
        return False
    hi = (getattr(td, "archived_from", None) or "").strip()
    if hi and d >= hi:
        return False
    return True


def active_defs(db: Session, shift: int | None = None,
                day=_NOW) -> list[LeaderTaskDef]:
    """The tasks in force on a day, in catalog order.

    `day` unstated = the day happening RIGHT NOW on `shift`, which is what every
    live reader (the bot menu, the day close, the score, the tab) means. An
    explicit None asks for the whole catalog and is how the ADMIN layers say
    "show me every task, archived ones marked" rather than dropping rows the
    sheet still has to render.
    """
    if day is _NOW:
        day = effective_date(shift)
    return [td for td in ensure_task_defs(db) if is_active(td, day)]


def def_enabled(td) -> bool:
    """The global floor for `enabled`.

    `is not False` and not `bool(...)`: the column is added NULLABLE by the
    migration and is NULL on a box that never ran it, and the answer there must
    be the TRUE every resolver used to hard-code — not the False that `bool(None)`
    would hand a leader mid-shift.
    """
    return getattr(td, "default_enabled", None) is not False


def def_min_media(td) -> int:
    """The global floor for the photo count — 1 wherever nobody has said
    otherwise, which is the number the resolvers used to hard-code."""
    v = getattr(td, "default_min_media", None)
    return 1 if v is None else int(v)


# ── the catalog: WRITING it ──────────────────────────────────────────────────

def catalog_floor() -> str:
    """The earliest day a catalog change may take effect.

    The LATER of the two shifts' next effective dates, and it has to be the
    later one because a task's floor is ONE string compared against each
    shift's OWN effective date. At 10:00 shift 1's day is today and shift 2's
    is yesterday, so shift 2's "tomorrow" is shift 1's TODAY — a floor set to
    it would add or remove a task on shift 1 in the middle of the shift, which
    is precisely what a floor exists to prevent. One night of extra delay for
    the night shift is the price, and it is the right way round: nobody's
    checklist ever changes under their hands.
    """
    return max(next_effective_date(1), next_effective_date(2))


def clean_day(value: str | None) -> str | None:
    """THE shape check for a catalog floor. `"YYYY-MM-DD"` or None; anything
    else raises ``ValueError("bad_date")``.

    One function because BOTH doors write the same two columns and both compare
    them the same way. `is_active` tests the floor with a plain STRING
    comparison (`d < lo`), which is only an ordering while every value is a
    zero-padded ISO date — so the test is not "does this parse" but "does it
    parse AND print back byte-identical". `date.fromisoformat` accepts the basic
    form and the week form on this Python ("20260908", "2026-W36-1"): both are
    real dates and neither compares correctly against `effective_date`'s output,
    so a floor stored in one of them is a floor that silently never fires — or
    fires on every day at once.

    It replaces a `len == 10 and d[4] == "-" and d[7] == "-"` test that accepted
    "2026-13-45", and a `day < floor` string compare that was the ONLY check the
    create endpoint made — under which "tomorrow" was a perfectly good floor.
    """
    d = (value or "").strip()
    if not d:
        return None
    try:
        if date.fromisoformat(d).isoformat() != d:
            raise ValueError
    except (ValueError, TypeError):
        raise ValueError("bad_date")
    return d


def _fill_names(names: dict | None) -> dict[str, str]:
    """The four name columns are NOT NULL, so a blank language is filled from
    the Russian one — the language the register is actually maintained in, and
    the one every other fallback on this platform lands on. With no Russian
    either, the first language that carries anything stands in: a task named in
    one language is a task somebody can read, a task named in none is not a
    task."""
    src = {l: (str((names or {}).get(l) or "")).strip() for l in _LANGS}
    fallback = src.get("ru") or next((v for v in src.values() if v), "")
    if not fallback:
        raise ValueError("no_name")
    return {l: (src[l] or fallback) for l in _LANGS}


def create_task(db: Session, *, names: dict, note: dict | None = None,
                criteria: str | None = None, description: str | None = None,
                default_weight: int = 0, default_min_media: int = 1,
                active_from: str | None = None,
                manager_ids: list[int] | None = None,
                leader_ids: list[int] | None = None) -> LeaderTaskDef:
    """Add a task to the catalog, in ONE transaction.

    Three things here are not obvious and every one of them is load-bearing.

    **The id is chosen explicitly and the sequence is then moved to match.**
    `leader_task_defs` was SEEDED with explicit ids 1..13 (`ensure_task_defs`),
    so its sequence never advanced and still answers 1 — a plain INSERT would
    collide with row 1 on a live platform. `max(id) + 1` is picked here and
    `setval` follows it, so the next writer through any door is safe too.

    **A task NAMED for some units is created switched OFF for everybody else.**
    `default_enabled=False` on the definition plus an explicit `enabled=True`
    row per named unit or leader — which is the only shape the chain can
    express, since the level that means "everybody" is the definition itself.
    Naming nobody creates it enabled for the whole platform, which is what an
    unfiltered create means.

    **`active_from` defaults to `catalog_floor()`**, so the task appears at a
    shift boundary and never in the middle of somebody's night. Passing a date
    explicitly is allowed — an admin may deliberately schedule one further out —
    but the caller is responsible for saying so on screen.
    """
    filled = _fill_names(names)
    scoped = bool(manager_ids or leader_ids)

    top_id = db.query(func.coalesce(func.max(LeaderTaskDef.id), 0)).scalar() or 0
    top_ord = db.query(func.coalesce(func.max(LeaderTaskDef.sort_order), 0)).scalar() or 0
    td = LeaderTaskDef(
        id=int(top_id) + 1,
        note_uz=None, note_uz_cyrl=None, note_ru=None, note_en=None,
        criteria=(criteria or "").strip() or None,
        description=(description or "").strip() or None,
        default_weight=_clamp_w(default_weight),
        default_min_media=_clamp_m(default_min_media),
        # OFF for the platform when the create names its targets; the explicit
        # rows below are what switch it on for them.
        default_enabled=not scoped,
        sort_order=int(top_ord) + 1,
        # Shape-checked here too, not only at the endpoint: this is the column
        # every reader compares as a STRING, so a floor that is not a
        # zero-padded ISO date is one nothing can order (`clean_day`).
        active_from=(clean_day(active_from) or catalog_floor()),
        archived_from=None,
        # Every task ships judged the way the platform has always judged one;
        # the definition's own floors are what an admin edits afterwards.
        date_check=True, day_check=True, time_check=True, date_plus=0,
        proof_kind="screenshot",
        **{f"name_{l}": filled[l] for l in _LANGS},
    )
    for l in _LANGS:
        v = (str((note or {}).get(l) or "")).strip()
        if v:
            setattr(td, f"note_{l}", v)
    db.add(td)
    db.flush()

    # The catalog is written with explicit ids, so the sequence has to be told
    # where the table actually is — otherwise the next plain INSERT (from any
    # door, now or later) collides with an existing row. `setval` is NOT
    # transactional, so a failure after this point leaves the sequence advanced
    # and the row unwritten — a gap, which is the harmless direction: the next
    # id is still free.
    db.execute(text(
        "SELECT setval(pg_get_serial_sequence('leader_task_defs', 'id'), :v, TRUE)"
    ), {"v": td.id})

    for mid in sorted({int(i) for i in (manager_ids or []) if i}):
        db.add(LeaderTaskSetting(
            manager_id=mid, task_id=td.id, enabled=True,
            min_media=def_min_media(td), weight=td.default_weight,
        ))
    for lid in sorted({int(i) for i in (leader_ids or []) if i}):
        # Every column on the leader table is a nullable "inherit", so a row
        # carrying only `enabled` overrides nothing else about the task.
        db.add(LeaderTaskLeaderSetting(leader_id=lid, task_id=td.id, enabled=True))
    db.commit()
    return td


def set_archived(db: Session, task_id: int, archived_from: str | None) -> LeaderTaskDef:
    """Retire a task from a day on, or put it back (`archived_from=None`).

    NEVER a DELETE. Three foreign keys point at this row and nine more tables
    carry a plain-integer `task_id` — entries, photos, AI reviews, disputes,
    late proofs, admin overrides, bot captures, pending changes and the config
    audit — so removing it would dangle every one of them and take the task's
    NAME off every report ever filed. The row stays; only whether the task is
    ASKED changes, and `ensure_task_defs` goes on returning it.

    The floor is `catalog_floor()`: a date earlier than that would take a task
    away from a night already in progress, which turns a checklist somebody is
    halfway through into a different checklist.

    **A RESTORE is floored too, and it has to be.** Clearing `archived_from`
    puts the task back into every day from the archive date on — including the
    night that is running right now. On a per-task unit that night's deadline
    for it has already gone by, so `leader_close.autoclose_due` reaches it
    within five minutes and records it not-done: a deduction for a task nobody
    was asked, arriving out of an admin pressing «restore» at 22:00. So the
    restore states WHEN the task is asked again — `active_from` raised to
    `catalog_floor()` — which is the same boundary a create and an archive
    already land on, and the reason every catalog write behaves the same way:
    nobody's checklist ever changes under their hands.

    `active_from` is «WHEN this task is asked» (see the model), so restating it
    is the column doing its job rather than a second meaning bolted onto it —
    and it is only ever RAISED, so a task scheduled further out keeps its date.
    The one piece of collateral, stated plainly: a still-OPEN day from BEFORE
    the archive date genuinely was asked this task and, after the restore,
    reads as though it was not. It is the lenient direction (such a day loses a
    task, never gains one), it can only touch days somebody abandoned, and the
    alternative — refusing the restore while any affected day is open — is a
    control that an abandoned day from months ago could block for good, on a
    platform with no shell to unblock it with.
    """
    td = db.query(LeaderTaskDef).filter_by(id=int(task_id)).first()
    if not td:
        raise KeyError(f"task {task_id}")
    day = clean_day(archived_from)
    if day is not None:
        if day < catalog_floor():
            raise ValueError("too_early")
    elif (td.archived_from or "").strip():
        # Restoring a task that really was archived. Raised, never lowered:
        # `max` keeps a task whose activation was deliberately scheduled
        # further out on its own date.
        floor = catalog_floor()
        td.active_from = max((td.active_from or "").strip() or floor, floor)
    td.archived_from = day
    db.commit()
    return td


def reorder_tasks(db: Session, ids: list[int]) -> int:
    """Rewrite `sort_order` from the order the ids arrive in.

    Only the ids NAMED are moved, and they take positions 1..N; anything the
    caller left out keeps a position after them, so a partial list can never
    silently drop a task off the end of the sheet. Reordering is pure
    presentation — no score, no window and no day boundary reads `sort_order` —
    which is why it applies at once and carries no floor.
    """
    want = [int(i) for i in (ids or [])]
    if not want:
        return 0
    rows = {td.id: td for td in db.query(LeaderTaskDef)
            .filter(LeaderTaskDef.id.in_(want)).all()}
    missing = [i for i in want if i not in rows]
    if missing:
        raise KeyError(f"task {missing[0]}")
    seen: set[int] = set()
    pos = 0
    for i in want:
        if i in seen:
            continue                      # a repeated id is one position
        seen.add(i)
        pos += 1
        rows[i].sort_order = pos
    # Everything the caller did not name keeps its relative order AFTER the
    # named block, so an old tab sending a short list cannot bury a task.
    tail = (db.query(LeaderTaskDef)
            .filter(~LeaderTaskDef.id.in_(seen))
            .order_by(*_ORDER).all())
    for td in tail:
        pos += 1
        td.sort_order = pos
    db.commit()
    return len(seen)


def catalog_self_check(db: Session) -> list[str]:
    """What the CATALOG would do wrong, named at boot.

    This repo has no test suite and a push to `main` is a deploy, so the app
    saying its own configuration is broken is the earliest anybody finds out —
    the pattern `leader_close.self_check` and `leader_cells.self_check` already
    follow, and for the same scar: twice a checklist has behaved in a way
    nobody intended and both times the only signal was a leader losing points.

    Three questions, each one a state that is silent by construction:

    1. **An archived task that units still switch ON.** Archiving takes the task
       out of the ACTIVE set, so those `enabled = true` rows are settings for a
       question nobody is asked any more — they change nothing today and they
       change everything the moment somebody clears the archive date. Named
       rather than deleted: they are an admin's own decisions.
    2. **A task whose `active_from` has come and gone and which is asked
       NOWHERE.** The floor is compared against the SHIFT's effective date, so
       a date can be behind today's calendar and still be ahead of a night that
       has not turned — but a floor behind BOTH shifts' current days is spent,
       and a task that started and reaches nobody is one somebody meant to
       switch on for a unit and never did. It costs nothing and it looks
       exactly like a task that is working.
    3. **Σ default_weight ≠ 100 over the tasks every unit inherits.** The seeded
       weights sum to exactly 100 and every score on the platform is a share of
       that total, so a catalog that adds up to anything else silently re-bases
       every leader's percentage. Counted over the ACTIVE tasks that are ON at
       the GLOBAL level — an archived task is not part of anybody's day, and a
       task created FOR two units is deliberately off for everyone else, so
       neither belongs in the total an untouched unit is scored against.
    """
    out: list[str] = []
    try:
        defs = ensure_task_defs(db)
    except Exception as exc:                      # a broken CHECK must not boot-loop
        return [f"catalog unreadable: {exc}"]
    if not defs:
        return out

    today = {s: effective_date(s) for s in (1, 2)}

    archived = [td for td in defs if (td.archived_from or "").strip()]
    if archived:
        ids = [td.id for td in archived]
        on = dict(db.query(LeaderTaskSetting.task_id,
                           func.count(LeaderTaskSetting.id))
                  .filter(LeaderTaskSetting.task_id.in_(ids),
                          LeaderTaskSetting.enabled.is_(True))
                  .group_by(LeaderTaskSetting.task_id).all())
        on_l = dict(db.query(LeaderTaskLeaderSetting.task_id,
                             func.count(LeaderTaskLeaderSetting.id))
                    .filter(LeaderTaskLeaderSetting.task_id.in_(ids),
                            LeaderTaskLeaderSetting.enabled.is_(True))
                    .group_by(LeaderTaskLeaderSetting.task_id).all())
        for td in archived:
            n, nl = int(on.get(td.id, 0)), int(on_l.get(td.id, 0))
            if n or nl:
                out.append(
                    f"task {td.id} «{td.name_uz}» archived from "
                    f"{td.archived_from} but still switched ON by {n} unit(s) "
                    f"and {nl} leader(s)")

    started = [td for td in defs
               if (td.active_from or "").strip()
               and all((td.active_from or "").strip() <= d for d in today.values())
               and (is_active(td, today[1]) or is_active(td, today[2]))
               and not def_enabled(td)]
    if started:
        ids = [td.id for td in started]
        # Only the levels that switch it ON count — a row that exists but says
        # False is a unit that decided AGAINST the task, not one that has it.
        reach = {t for (t,) in db.query(LeaderTaskSetting.task_id)
                 .filter(LeaderTaskSetting.task_id.in_(ids),
                         LeaderTaskSetting.enabled.is_(True)).distinct().all()}
        reach |= {t for (t,) in db.query(LeaderTaskLeaderSetting.task_id)
                  .filter(LeaderTaskLeaderSetting.task_id.in_(ids),
                          LeaderTaskLeaderSetting.enabled.is_(True)).distinct().all()}
        for td in started:
            if td.id not in reach:
                out.append(f"task {td.id} «{td.name_uz}» started on "
                           f"{td.active_from} and is switched on NOWHERE — "
                           f"no unit and no leader is asked it")

    live = [td for td in defs
            if def_enabled(td) and (is_active(td, today[1]) or is_active(td, today[2]))]
    total = sum(int(td.default_weight or 0) for td in live)
    if live and total != 100:
        out.append(f"Σ default_weight = {total} over {len(live)} task(s) every "
                   f"unit inherits — a score is a share of 100")
    return out


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


def effective_settings(db: Session, manager_id: int, day=_NOW) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight, names} for one supervisor:
    explicit rows over virtual defaults (`default_enabled`, `default_min_media`,
    the seeded weight). `names` are the RAW per-supervisor rename overrides
    (None = the global LeaderTaskDef name) — the admin matrix needs the raw
    layer to show divergence, so resolution stays with the caller.

    `day` unstated = the tasks in force RIGHT NOW; an explicit None = every
    task in the catalog, which is what the admin config payload and the change
    SNAPSHOTS ask for. A snapshot in particular must not depend on the calendar:
    it records what a write is about, and a task that fell out of the active set
    between the write and the revert would otherwise be restored to the virtual
    defaults instead of to what it actually held."""
    if day is _NOW:
        # The unit's OWN shift decides which day is happening now — a night
        # shift's day turns at 17:00, not at midnight. One extra column read,
        # and only on the path that did not state a day.
        shift = db.query(Manager.shift).filter_by(id=manager_id).scalar()
        day = effective_date(shift if shift in (1, 2) else None)
    defs = active_defs(db, day=day)
    rows = {
        s.task_id: s
        for s in db.query(LeaderTaskSetting).filter_by(manager_id=manager_id).all()
    }
    out = {}
    for td in defs:
        s = rows.get(td.id)
        out[td.id] = {
            "enabled": s.enabled if s else def_enabled(td),
            "min_media": s.min_media if s else def_min_media(td),
            "weight": s.weight if s else td.default_weight,
            "names": _row_names(s) if s else {l: None for l in _LANGS},
            # RAW like `names`: None = inherit the global definition-of-done.
            # The AI reviewer reads this chain (services/leader_ai.criteria_for).
            "criteria": (s.criteria if s else None) or None,
            # RAW too: None = inherit the global instruction. Deliberately NOT
            # folded onto `criteria` here the way the RESOLVERS fold it — the
            # matrix must show an unwritten description as unwritten, or every
            # cell would read "own" the moment a criteria existed.
            "description": (s.description if s else None) or None,
            # RAW too, and each end on its own: None = inherit, and at the
            # global level that lands on the shift default.
            "win_from": (s.win_from if s else None) or None,
            "win_to": (s.win_to if s else None) or None,
            # RAW: None = inherit the global submission deadline (informational).
            "deadline": (s.deadline if s else None) or None,
            # RAW tri-state, and `or None` would destroy it: None = inherit,
            # False = this unit's filings are exempt from the date question.
            "date_check": s.date_check if s else None,
            # Same tri-state, same trap: None = inherit, False = this unit's
            # hours are not compared to the window.
            "time_check": s.time_check if s else None,
            # Same tri-state again: None = inherit, False = this unit's DAY is
            # not compared. Read with `time_check` — the pair names the mode.
            "day_check": s.day_check if s else None,
            # RAW: None = inherit the global collection mode. "camera" here is
            # what enrols a whole unit in in-app capture.
            "proof_kind": (s.proof_kind if s else None) or None,
        }
    return out


def _resolve_description(levels, criteria: str) -> str:
    """THE definition of "what is this leader told to do", narrowest level
    first, falling back to the AI's `criteria` when nobody has written one.

    Both halves matter and both are why this is one function rather than an
    expression at each call site:

    * the WALK is `criteria`'s own — first non-blank of leader → supervisor →
      global — so a supervisor who rewords a task for their unit rewords its
      instruction the same way they already reword its definition of done;
    * the FALLBACK is what makes the split invisible on the day it ships. Until
      2026-09-06 the criteria WAS the description every leader read, so a task
      with no description of its own must keep showing it rather than going
      blank. Writing one replaces it; clearing it goes back.

    Never apply this to the raw admin layers (`effective_settings`,
    `leader_overrides`): there an unwritten description must read as unwritten,
    or the matrix would mark every cell as overridden.
    """
    for level in levels:
        if level is not None and (getattr(level, "description", None) or "").strip():
            return level.description.strip()
    return criteria


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
            "description": r.description or None,
            "win_from": r.win_from or None,
            "win_to": r.win_to or None,
            "deadline": r.deadline or None,
            "date_check": r.date_check,
            "time_check": r.time_check,
            "day_check": r.day_check,
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


# ──────────────────────────────────────────────────────────────────────────
# What a LEVEL owns, and what merely reaches it
#
# The admin config page reads ONE inheritance level at a time and tags every
# cell with the level that defined it, so it needs the answer to a question the
# raw layers cannot give on their own: does this level DECIDE this field, or is
# it only passing the level above through? The three functions below are that
# answer, and they are shared by the unit level and the leader level precisely
# so the two cannot drift — the only difference between them is which resolved
# dict is handed in as the parent.

# The fields one level of the chain can define, named exactly as
# `effective_settings` / `leader_overrides` key them. The admin payload ships
# these strings, so a rename here is a rename on the wire.
OWN_FIELDS = (
    "enabled", "min_media", "weight", "names", "criteria", "description",
    "win_from", "win_to", "deadline", "date_check", "time_check", "day_check",
    "proof_kind",
)

# The three clocks compare NORMALISED — "9:00" and "09:00" are one value, and a
# level that retyped its parent's hour in another spelling has decided nothing.
_CLOCK_FIELDS = ("win_from", "win_to", "deadline")
# The two TRI-STATE flags. `bool(None)` here would read "inherit" as "off",
# which is the one mistake that makes a whole column look overridden.
_FLAG_FIELDS = ("date_check", "time_check", "day_check")


def _clean(field: str, v):
    """One raw stored value in comparable form, or None when it says "inherit".

    Blank text is inherit everywhere in this chain (`set_criteria` and its
    siblings store "" to clear a level), a clock that is not a clock is not a
    value, and the two flags keep their three states.
    """
    if v is None:
        return None
    if field in _FLAG_FIELDS:
        return bool(v)
    if field in _CLOCK_FIELDS:
        return leader_ai.hhmm(v)
    if isinstance(v, str):
        return v.strip() or None
    return v


def global_level(td: LeaderTaskDef) -> dict:
    """The values in force at the GLOBAL level — the floor every unit inherits.

    `enabled` / `min_media` read their floor through `def_enabled` /
    `def_min_media` — the one spelling of "what does a level with no row fall
    through to", which also answers correctly on a box whose catalog migration
    has not run. Spelling it a second time here is how this map and the
    resolvers would come to disagree about the very value they are compared
    against.

    `description` is resolved down the chain ALONE, with no fall-back to
    `criteria` — that fall-back (`_resolve_description`) is a rule about what a
    READER is shown, and folding it in here would report a unit that wrote its
    own description as inheriting one the moment its text matched the global
    definition of done.
    """
    return {
        "enabled": def_enabled(td),
        "min_media": def_min_media(td),
        "weight": td.default_weight,
        "names": {l: getattr(td, f"name_{l}") for l in _LANGS},
        "criteria": _clean("criteria", td.criteria),
        "description": _clean("description", td.description),
        "win_from": _clean("win_from", td.win_from),
        "win_to": _clean("win_to", td.win_to),
        "deadline": _clean("deadline", td.deadline),
        # NOT NULL at this level — it is the floor of the tri-state, and the
        # payload already publishes them with exactly this reading.
        "date_check": td.date_check is not False,
        "time_check": td.time_check is not False,
        "day_check": td.day_check is not False,
        "proof_kind": (td.proof_kind or "screenshot"),
    }


def resolve_over(parent: dict, raw: dict | None) -> dict:
    """The values in force AT a level, given its parent's resolved values and
    this level's own raw entry (None = no row at all).

    Field by field, narrowest wins — the same walk `effective_leader_config`
    makes over ORM rows, expressed over the dicts the admin payload already
    carries so the config page's parent chain is computed once, not per cell.
    """
    out = dict(parent)
    names = (raw or {}).get("names") or {}
    out["names"] = {
        l: ((names.get(l) or "").strip() or (parent.get("names") or {}).get(l))
        for l in _LANGS
    }
    for f in OWN_FIELDS:
        if f == "names":
            continue
        v = _clean(f, (raw or {}).get(f))
        if v is not None:
            out[f] = v
    return out


def own_fields(raw: dict | None, parent: dict) -> list[str]:
    """Which of `OWN_FIELDS` this level DECIDES for itself — the fields whose
    value differs from what it would otherwise inherit.

    **The test is the VALUE, never the existence of a row**, and that
    distinction is the whole reason this function exists.
    `leader_task_settings` is DENSE: every side-field write materialises a full
    row (`_sup_row`, `set_window`, `set_deadline` all fill `enabled` /
    `min_media` / `weight` from what the unit already resolved, because those
    three columns are NOT NULL), so 265 of the 286 possible supervisor rows
    exist while most of them carry nothing that differs from the global
    catalog. Reading "a row exists" as "this unit overrides it" paints the whole
    sheet as overridden and leaves the reader unable to find the handful of
    cells somebody actually decided.

    `enabled` / `min_media` / `weight` are therefore compared, not tested for
    presence; the eight raw fields must ALSO be non-null (null there is a real
    "inherit"); and the two date flags are compared with `is not None`, because
    False is a decision and `or` would silently drop it.

    `names` is a per-language map and is owned when ANY language differs from
    the parent's resolved name for that language — a unit that renamed a task
    in Russian alone has renamed it.
    """
    raw = raw or {}
    out: list[str] = []
    for f in OWN_FIELDS:
        if f == "names":
            mine = raw.get("names") or {}
            theirs = parent.get("names") or {}
            if any((mine.get(l) or "").strip()
                   and (mine[l] or "").strip() != (theirs.get(l) or "")
                   for l in _LANGS):
                out.append(f)
            continue
        v = _clean(f, raw.get(f))
        if v is None:
            continue                      # nothing stored here: inherited
        if v != parent.get(f):
            out.append(f)
    return out


def _resolved_window(resolved: dict, shift: int | None) -> tuple[str, str]:
    """A level's resolved window with the shift default standing in for a blank
    end — the same two-step `leader_ai.resolve_window` makes, over the dict this
    module resolves rather than over ORM rows."""
    d_lo, d_hi = leader_ai.shift_window(shift)
    return (resolved.get("win_from") or d_lo, resolved.get("win_to") or d_hi)


def config_ownership(defs, managers, leaders, settings: dict, overrides: dict) -> dict:
    """The three DERIVED maps the admin config payload carries: `own`,
    `own_leader` and `problems`.

    Pure — it queries nothing and is handed what the endpoint already loaded:
    the catalog, the live units, their leaders, `effective_settings` per unit
    and `leader_overrides` for the leaders. Which is also what keeps the two
    levels honest: the unit's parent is the global level, the leader's parent is
    the unit's RESOLVED value, and both are compared by the one `own_fields`.

    `problems` is the 26-Aug incident class — a photo window that does not fit
    the shift the level lands on, i.e. hours nobody on that shift can work,
    which the platform then records against them as not-done. The fit test is
    `leader_ai.window_fits_shift` and is never re-derived (least of all in the
    browser, where the copy on screen would be the wrong half of a
    disagreement). A LEADER is listed only where its own row MOVES the window:
    a leader inheriting its unit's bad hours is the unit's problem, already
    named once, and listing all 93 of them per bad task would bury it.
    """
    own: dict[str, dict[str, list[str]]] = {}
    own_leader: dict[str, dict[str, list[str]]] = {}
    problems: list[dict] = []

    glob = {td.id: global_level(td) for td in defs}
    # (manager_id, task_id) → the unit's resolved values: the leaders' parent,
    # and the window the fit test is run against.
    unit_res: dict[tuple[int, int], dict] = {}
    shift_of = {m.id: m.shift for m in managers}

    for m in managers:
        by_task = settings.get(m.id) or {}
        for tid, parent in glob.items():
            raw = by_task.get(tid)
            res = resolve_over(parent, raw)
            unit_res[(m.id, tid)] = res
            fields = own_fields(raw, parent)
            if fields:
                own.setdefault(str(m.id), {})[str(tid)] = fields
            win = _resolved_window(res, m.shift)
            if not leader_ai.window_fits_shift(m.shift, win):
                problems.append({
                    "kind": "window_outside_shift",
                    "level": "unit",
                    "manager_id": m.id,
                    "leader_id": None,
                    "task_id": tid,
                    "win": [win[0], win[1]],
                    "shift": m.shift,
                    "hours": list(leader_ai.shift_window(m.shift)),
                    # Carried so the banner can say whether anybody is being
                    # judged by these hours today — a disabled task's window is
                    # wrong the day it is switched on, not before.
                    "enabled": bool(res.get("enabled")),
                })

    for p in leaders:
        by_task = overrides.get(p.id) or {}
        if not by_task:
            continue
        shift = shift_of.get(p.manager_id)
        for tid, raw in by_task.items():
            parent = unit_res.get((p.manager_id, tid)) or glob.get(tid)
            if parent is None:
                continue                  # a row for a task the catalog lost
            fields = own_fields(raw, parent)
            if fields:
                own_leader.setdefault(str(p.id), {})[str(tid)] = fields
            if not ("win_from" in fields or "win_to" in fields):
                continue                  # inherits the unit's hours entirely
            res = resolve_over(parent, raw)
            win = _resolved_window(res, shift)
            if not leader_ai.window_fits_shift(shift, win):
                problems.append({
                    "kind": "window_outside_shift",
                    "level": "leader",
                    "manager_id": p.manager_id,
                    "leader_id": p.id,
                    "task_id": tid,
                    "win": [win[0], win[1]],
                    "shift": shift,
                    "hours": list(leader_ai.shift_window(shift)),
                    "enabled": bool(res.get("enabled")),
                })

    return {"own": own, "own_leader": own_leader, "problems": problems}


def effective_leader_config(db: Session, prof, shift: int | None = None,
                            day=_NOW) -> dict[int, dict]:
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

    `day` decides WHICH tasks are in the answer — a task not yet active, or
    archived, is simply not in it. Unstated = the day happening right now on
    `shift`, which is what the bot menu, both day closes and `compute_completion`
    all mean, and which is byte-identical for every task carrying no floor. It
    is the SHIFT's effective date and never `date.today()`: a night belongs to
    the date its 17:00 boundary opened.
    """
    if day is _NOW:
        day = effective_date(shift)
    defs = active_defs(db, day=day)
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
        enabled = s.enabled if s else def_enabled(td)
        min_media = s.min_media if s else def_min_media(td)
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
        description = _resolve_description((r, s, td), criteria)
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
            "day_check": leader_ai.resolve_day_check(r, s, td),
            "criteria": criteria,
            # What the leader is told to DO. Resolved beside the criteria it
            # used to be, and falling back to it when nobody has written one.
            "description": description,
            "deadline": resolve_deadline(r, s, td),
            # WHERE the leader answers this task: the bot chat, or the mini-app
            # camera. The bot branches on it, so it is resolved here with
            # everything else the bot reads rather than looked up separately.
            "proof_kind": resolve_proof_kind(r, s, td),
        }
    return out


def requirements_for(db: Session, *, prof=None, manager=None,
                     shift: int | None = None, day=_NOW) -> dict:
    """What the /leaders «Vazifalar» tab shows: the ENABLED tasks in force for
    one subject — a leader (`prof`, the fully resolved chain), a supervisor's
    unit (`manager`, its level of the chain: no per-leader rows), or the global
    catalog (neither) — each with its display names, proof-type note, the
    definition of done, weight, min photos, photo window, deadline and example
    photo ids (resolved down the chain like the criteria, so each subject is
    shown the examples in force for it and not the level above). `shift` decides the window default and the day's filing window;
    a subject with a unit takes the unit's shift, the global catalog the one
    the caller asks for (1 when unstated — the regime the tab was built for).

    Returned as plain dicts keyed for the client, names/notes as per-language
    maps so the page picks its own language.

    `day` picks the ACTIVE set — a task not yet asked, or archived, is not on
    the card. Unstated = the day happening now on the resolved shift, which is
    resolved AFTER the shift is, or a night shift would be told about its
    tasks a day late.
    """
    if manager is None and prof is not None and prof.manager_id:
        manager = db.query(Manager).filter_by(id=prof.manager_id).first()
    if manager is not None and manager.shift in (1, 2):
        shift = manager.shift
    if shift not in (1, 2):
        shift = 1
    if day is _NOW:
        day = effective_date(shift)
    defs = active_defs(db, day=day)

    if prof is not None:
        cfg = effective_leader_config(db, prof, shift, day=day)
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
            desc = _resolve_description((s, td), crit)
            cfg[td.id] = {
                "enabled": s.enabled if s else def_enabled(td),
                "min_media": s.min_media if s else def_min_media(td),
                "weight": s.weight if s else td.default_weight,
                "names": names,
                "window": leader_ai.resolve_window(shift, s, td),
                "date_check": leader_ai.resolve_date_check(s, td),
                "time_check": leader_ai.resolve_time_check(s, td),
                "day_check": leader_ai.resolve_day_check(s, td),
                "criteria": crit,
                "description": desc,
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

    # The examples in force FOR THIS SUBJECT, down the same chain as the
    # criteria they sit beside — a leader reading "what a correct proof looks
    # like" must be shown the picture that was uploaded for them, not the one
    # it replaced. A subject with neither level (the global catalog view) gets
    # the global set, which is what that view is asking for.
    examples = leader_ai.example_ids_map(
        db,
        manager_id=manager.id if manager is not None else None,
        leader_id=prof.id if prof is not None else None,
    )

    tasks = []
    for td in defs:
        c = cfg.get(td.id)
        if not c or not c["enabled"]:
            continue
        tasks.append({
            "id": td.id,
            "names": c["names"],
            "note": {l: getattr(td, f"note_{l}") or "" for l in _LANGS},
            # Two texts, two readers: `description` is what this leader is told
            # to do, `criteria` is what the AI grades the photo against. The tab
            # leads with the description and prints the criteria under it — a
            # leader still gets to read the rule they are judged by, which is
            # why the criteria became visible in the first place.
            "description": c.get("description") or c["criteria"] or "",
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
            "day_check": bool(c.get("day_check", True)),
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
                manager_id=manager_id, task_id=task_id,
                # The virtual defaults this level ALREADY resolves to — read
                # off the definition, never hard-coded, or a task created
                # switched off for everybody would come back on the first side
                # write that materialised a row for it.
                enabled=def_enabled(td) if td else True,
                min_media=def_min_media(td) if td else 1,
                weight=td.default_weight if td else 0,
            )
            db.add(row)
        row.criteria = text
    else:
        td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not td:
            return
        td.criteria = text
    db.commit()


def set_description(db: Session, *, task_id: int, description: str,
                    manager_id: int | None = None,
                    leader_id: int | None = None) -> None:
    """Write the leader-facing instruction at one level of the chain. Blank
    clears the override and falls back to the level above — and, when no level
    holds one, to the AI's `criteria` (see `_resolve_description`).

    A deliberate twin of `set_criteria`, down to materialising the row with the
    values that level already resolves to, so writing an instruction can never
    silently change what the task requires. It stages for the same reason
    `set_criteria` does not stage: the bot reads the description on the next
    open, so a deferred edit would be a delay with nothing behind it.

    Unlike the criteria this text reaches NO scoring path — `leader_ai._prompt`
    never sees it — so an edit here cannot move a verdict, past or future.
    """
    text_ = (description or "").strip() or None

    if leader_id is not None:
        row = db.query(LeaderTaskLeaderSetting).filter_by(
            leader_id=leader_id, task_id=task_id).first()
        if not row:
            if text_ is None:
                return  # nothing stored, nothing to clear
            row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
            db.add(row)
        row.description = text_
        # Same rule as set_criteria: a leader row left overriding nothing goes,
        # or the matrix would ring "overridden" over an empty row.
        if text_ is None and _leader_row_bare(row):
            db.delete(row)
    elif manager_id is not None:
        row = db.query(LeaderTaskSetting).filter_by(
            manager_id=manager_id, task_id=task_id).first()
        if not row:
            if text_ is None:
                return
            td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
            row = LeaderTaskSetting(
                manager_id=manager_id, task_id=task_id,
                # The virtual defaults this level ALREADY resolves to — read
                # off the definition, never hard-coded, or a task created
                # switched off for everybody would come back on the first side
                # write that materialised a row for it.
                enabled=def_enabled(td) if td else True,
                min_media=def_min_media(td) if td else 1,
                weight=td.default_weight if td else 0,
            )
            db.add(row)
        row.description = text_
    else:
        td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
        if not td:
            return
        td.description = text_
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
                manager_id=manager_id, task_id=task_id,
                # The virtual defaults this level ALREADY resolves to — read
                # off the definition, never hard-coded, or a task created
                # switched off for everybody would come back on the first side
                # write that materialised a row for it.
                enabled=def_enabled(td) if td else True,
                min_media=def_min_media(td) if td else 1,
                weight=td.default_weight if td else 0,
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


def set_day_check(db: Session, *, task_id: int, day_check: bool | None,
                  manager_id: int | None = None, leader_id: int | None = None,
                  rejudge: bool = True) -> None:
    """Write "is the DAY checked" at one level of the chain.

    The third of the rule's three flags, through the same helper for the same
    reason as its siblings: they travel together on every read
    (`leader_ai.date_rule_for`), and three hand-written level-materialisers
    would eventually disagree about what an absent row means — which is a silent
    change to what a task requires.
    """
    _set_chain_flag(db, task_id=task_id, attr="day_check", value=day_check,
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
        manager_id=manager_id, task_id=task_id,
        # The virtual defaults this level ALREADY resolves to (see the twins
        # above) — a materialised row must never change what the task requires.
        enabled=def_enabled(td) if td else True,
        min_media=def_min_media(td) if td else 1,
        weight=td.default_weight if td else 0,
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
                manager_id=manager_id, task_id=task_id,
                # The virtual defaults this level ALREADY resolves to — read
                # off the definition, never hard-coded, or a task created
                # switched off for everybody would come back on the first side
                # write that materialised a row for it.
                enabled=def_enabled(td) if td else True,
                min_media=def_min_media(td) if td else 1,
                weight=td.default_weight if td else 0,
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
           for k in ("criteria", "description", "win_from", "win_to",
                     "deadline", "proof_kind")):
        return True
    # NOT a blank-string test: these are tri-state booleans whose whole point is
    # being False, and `or ""` would read an active exemption as "unset" — the
    # next cell write would then delete the row and silently re-arm the date
    # check on a task somebody had exempted.
    return any(getattr(row, k, None) is not None
               for k in ("date_check", "time_check", "day_check"))


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
        # The WHOLE catalog (`day=None`), not the active set: a snapshot records
        # what a write was about so a revert can put it back, and that fact must
        # not depend on the calendar. A task archived between the write and the
        # revert would otherwise be snapshotted as the virtual defaults and
        # restored to them.
        eff = effective_settings(db, mid, day=None)
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
