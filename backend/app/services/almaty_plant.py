"""The Almaty plant (Kazakhstan): the plant, its one unit and that unit's catalogue.

The operator, 2026-11-20: «We have add our factory which is in Kazakstan. Here I
have the catalogue for the supervisor in there, please add this catalogue» —
with the supervisor's own form («Almata zagruzka»: SKU · Трудоемкость · Команда,
83 positions over the teams A · B · C). Production held two plants that day,
Uchtepa and Keles, and no unit for Kazakhstan (a one-shot report said so, read
by Abbos and since removed), so the operator ruled, asked one question at a
time:

  * «Claude creates them» — the plant, the unit and the catalogue, in one go;
  * the plant is «Almaty» (ru Алматы · uz Olmaota);
  * nobody is named as its supervisor yet, so the unit carries the PLANT's name
    on shift 1 and is renamed on its profile page once somebody is.

`apply` is the whole change and writes only what is absent:

  * the plant, found by its code, else added after the last tab;
  * the unit: the plant's one live unit when a person made one by hand in the
    meantime, else a new one — the next id, shift 1, «Zagruzka hisoblanadi» OFF
    like every unit created after 2026-10-04 (it has no cells and no Verifix
    people, so an ON unit would read blank on every загрузка table);
  * the catalogue, ONLY into a unit that holds none (`pp_catalog.is_empty` — no
    line, no work centre, no dated version): a first catalogue has no older one
    to keep, which is the import's own rule for a unit's first sheet.

The form has NO SAP codes — its «SKU» column holds names — so every line is
keyed by its name (`pp_calc.daily_key`), as code-less lines always are, and no
SAP upload can reach it (`pp_calc.takes_sap`). Команда is the team as the form
writes it: A, B, C. Their штатка is the form's own team block (2 · 2 · 1 = its
«kelishi kerak edi» 5); the slots it lists with no people and no position
(A1–A4, B1–B4, C1) are not registered. The ПЛАН column is one day's
quantities, not catalogue, and is not read. Names are the form's, with stray
spaces dropped and the spelling left alone.

Run once by `startup.add_almaty_plant` (docs/data-fixes.md).

THE UNIT'S HEAD (the same day): «We dont have supervisor in Almaty, but we have
lider who is in place of supervisor, her name is AKRAMOVA MUNISA AKMAL QIZI».
`name_head` gives the unit her name, spelt the way the register spells a
Verifix person (`verifix_org.profile_name`), through the profile page's own
rename, and sets «Lavozim» to «Brigadir o'rnida» (`supervisor_kind` "acting":
she runs the unit under a leader's job) as a person's answer, which no Verifix
check overwrites. Only the placeholder name is replaced: a unit somebody has
already given another person's name is left alone. Run once by
`startup.name_almaty_unit`.

THE SECOND FORM (2026-11-21): «Put this Almata Catalog instead of current one»
— the same form, sent again: 84 positions, and Команда written as a NUMBER
(8898 · 6866 · 9888) where the first one wrote A · B · C. `replace_catalog`
puts it in the unit's catalogue as the platform's own edits would: dated from
the shift in progress (`pp_catalog.freeze`), a line that keeps its name edited
IN PLACE — so what a person set on it, and typed for it from that day on,
stays with it — and the teams' rows renamed rather than re-made. Run once by
`startup.replace_almaty_catalog`.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models import Cell, Factory, Manager, PPProduct, PPWorkCenter
from app.services import pp_catalog

# One boot at a time takes the step (`pg_advisory_xact_lock`); arbitrary, and
# distinct from the scheduler's and the AI drain's keys.
LOCK_KEY = 8_140_573_112_004_377

PLANT = {"code": "Almaty", "name_uz": "Olmaota", "name_uz_cyrl": "Олмаота",
         "name_ru": "Алматы", "name_en": "Almaty"}
UNIT_NAME = "Almaty"
UNIT_SHIFT = 1

# Who runs the unit, as the operator wrote her (Verifix's own spelling), and
# what she is to it: a leader in place of a supervisor.
HEAD = "AKRAMOVA MUNISA AKMAL QIZI"
HEAD_KIND = "acting"

# (Команда, штатка) — the form's team block, in its order.
TEAMS = (("A", 2), ("B", 2), ("C", 1))

# (name, Трудоемкость in seconds per piece, Команда) — the form's rows, in its
# order. Generated from the workbook, never retyped.
LINES = (
    ('Круасан Класс Замарозка', 3.5, 'A'),
    ('Сомса Курица Котта Замарозка', 2.7, 'A'),
    ('Косичка Булочка Замарозка', 3.1, 'A'),
    ('Сомса Товук мини Замароз', 48, 'A'),
    ('Сомса Мини мясо Замарозка', 52.4, 'A'),
    ('Шок Паин Замарозка', 3.7, 'A'),
    ('Хачапурий Калбаса СЫРОМЗамарозка', 4.1, 'A'),
    ('Сосиска Булочка Замарозка', 3, 'A'),
    ('Пицца закрытый Замарозка', 3, 'A'),
    ('Сомса мясо котта Замарозка', 2.5, 'A'),
    ('Булочка абрикос оформ', 5, 'A'),
    ('Булочка орех оформление', 4.7, 'A'),
    ('Косичка Булочка Офор', 3.4, 'A'),
    ('Блинчик Творг Офор', 21.4, 'A'),
    ('Шок Паин Гп', 6.2, 'A'),
    ('Булочка творок банан Гп', 4.1, 'A'),
    ('Булочка Вишня Гп', 6.1, 'A'),
    ('Калка кесиш Гп', 2.2, 'A'),
    ('Киш овошной с мясным фаршем Гп', 3.4, 'A'),
    ('Киш с курицей, грибами и сыром Гп', 3.4, 'A'),
    ('Бисквит Когоз кесиш Гп', 0.3, 'A'),
    ('Сомса Большое Курица Гп', 7, 'A'),
    ('Сомса Большое Мясо Гп', 7, 'A'),
    ('Пицца Гп', 6.1, 'A'),
    ('Куйом Таерлаш Гп', 48, 'A'),
    ('Булочка Малина Гп', 10.1, 'A'),
    ('Булочка Сгушенка Гп', 5.4, 'A'),
    ('Ватрушка Булочка Гп', 5.8, 'A'),
    ('Булочка Мак Офор', 5.9, 'A'),
    ('Булчка Кунжут Пастой Гп', 5.2, 'A'),
    ('Булочка Классический Гп', 5.8, 'A'),
    ('Булочка оливка Пастой гп', 5.8, 'A'),
    ('Булочка Смит Гп', 5.7, 'A'),
    ('Хачапурий колбаса Гп', 2.7, 'A'),
    ('Круасан Гп Миндаль', 4, 'A'),
    ('Круасан Гп Фисташковый', 3.3, 'A'),
    ('Растегай капуста Гп', 2.3, 'A'),
    ('Растегай Мясо Гп', 2.3, 'A'),
    ('Растегай Картошка Гп', 2.3, 'A'),
    ('Растегай яйцо Гп', 2.3, 'A'),
    ('Балиш Гп', 3.4, 'A'),
    ('Булочка СочникГп', 2.4, 'A'),
    ('Булочка Конверт Гп', 3.8, 'A'),
    ('Булочка ПлюшкаГп', 5.6, 'A'),
    ('Открытый Пицца Гп', 4.4, 'A'),
    ('Мясной Лепешка Гп', 3.9, 'A'),
    ('Пицца Картошка с таматомГп', 4.4, 'A'),
    ('Булочка Яблока Гп', 2.8, 'A'),
    ('Пицца с сыром и шпинатом Гп', 5, 'A'),
    ('Пирок Отпрафка', 15.5, 'A'),
    ('Пирок Мишка Гп', 15.5, 'A'),
    ('Пирок Багинский Пахлава Гп', 15.5, 'A'),
    ('Круассан Ягодный Офор', 42.1, 'B'),
    ('Круассан Шоколадный Офор', 42.1, 'B'),
    ('Фисташковый Круассан оформ', 30, 'B'),
    ('Миндальный Круассан оформ', 30, 'B'),
    ('Сомса Мини Мясо Гп', 198.4, 'B'),
    ('Сомса Мини Курица Гп', 240, 'B'),
    ('Сендвич Круассан Передзагатовка', 58.9, 'B'),
    ('Курыный Сендвич Передзагатовка', 59.1, 'B'),
    ('Наклейкага дата Пер Цезрь', 4.5, 'B'),
    ('Наклейкага дата Перед', 1.6, 'B'),
    ('Цезарь Салат оформление', 51.5, 'B'),
    ('Классический Круассан', 15.5, 'B'),
    ('Айзберг Передзагатовка', 173.3, 'C'),
    ('Блинчик Передзагатовка Пишириш', 61, 'C'),
    ('Блинчик Начинка МясоПередзагатовка', 1238, 'C'),
    ('Блинчик Творг начинка передзагатовка', 82, 'C'),
    ('Бедана тухум Передзагатовка', 10.7, 'C'),
    ('Желток Передзагатовка', 334.6, 'C'),
    ('Меланж Передзагатовка', 66, 'C'),
    ('Сухарик Тограш Передзагатовка', 437.5, 'C'),
    ('Виаленый Помидор Передзагатовка', 278, 'C'),
    ('Цезарь Соус Передзагатовка', 113.5, 'C'),
    ('Индейка Слайс Передзагатовка', 71, 'C'),
    ('Бодринг Слайс Передзагатовка', 90, 'C'),
    ('Цезарь Соус идиш Передзаг', 11.3, 'C'),
    ('Блинчик Хамир передзагатовка', 93, 'C'),
    ('Имбирный Соус Передзагатовка', 140, 'C'),
    ('Сыр Пармезан Перед', 112, 'C'),
    ('Товук Филе', 325.4, 'C'),
    ('Товук Кесиш', 271.5, 'C'),
    ('Сосиска Булочка Гп', 4.2, 'A'),
)

# ── 21 Nov: the second form ─────────────────────────────────────────────────
# (Команда as the second form writes it, штатка, the letter the first form —
# and this one's own team block, which was not retyped — calls that team.)
# Every line that was A is 8898, every B 6866, every C 9888, and the form's
# legend says the same: «A-Замарозка гп», «B Сендвич Круассан»,
# «С Передзагатовка».
FORM_NOV21_TEAMS = (("8898", 2, "A"), ("6866", 2, "B"), ("9888", 1, "C"))

# (name, Трудоемкость in seconds per piece, Команда) — the second form's rows,
# in its order. Generated from the workbook, never retyped. Against the first:
# «Сосиска Булочка Замарозка» is written «СосискаСлойка Булочка Замарозка»,
# «СосискаСлойка Булочка Гп» is new, «Балиш Гп» is 3.7 (was 3.4) and «Сосиска
# Булочка Гп» 3.1 (was 4.2).
FORM_NOV21 = (
    ('Круасан Класс Замарозка', 3.5, '8898'),
    ('Сомса Курица Котта Замарозка', 2.7, '8898'),
    ('Косичка Булочка Замарозка', 3.1, '8898'),
    ('Сомса Товук мини Замароз', 48, '8898'),
    ('Сомса Мини мясо Замарозка', 52.4, '8898'),
    ('Шок Паин Замарозка', 3.7, '8898'),
    ('Хачапурий Калбаса СЫРОМЗамарозка', 4.1, '8898'),
    ('СосискаСлойка Булочка Замарозка', 3, '8898'),
    ('Пицца закрытый Замарозка', 3, '8898'),
    ('Сомса мясо котта Замарозка', 2.5, '8898'),
    ('Булочка абрикос оформ', 5, '8898'),
    ('Булочка орех оформление', 4.7, '8898'),
    ('Косичка Булочка Офор', 3.4, '8898'),
    ('Блинчик Творг Офор', 21.4, '8898'),
    ('Шок Паин Гп', 6.2, '8898'),
    ('Булочка творок банан Гп', 4.1, '8898'),
    ('Булочка Вишня Гп', 6.1, '8898'),
    ('Калка кесиш Гп', 2.2, '8898'),
    ('Киш овошной с мясным фаршем Гп', 3.4, '8898'),
    ('Киш с курицей, грибами и сыром Гп', 3.4, '8898'),
    ('Бисквит Когоз кесиш Гп', 0.3, '8898'),
    ('Сомса Большое Курица Гп', 7, '8898'),
    ('Сомса Большое Мясо Гп', 7, '8898'),
    ('Пицца Гп', 6.1, '8898'),
    ('Куйом Таерлаш Гп', 48, '8898'),
    ('Булочка Малина Гп', 10.1, '8898'),
    ('Булочка Сгушенка Гп', 5.4, '8898'),
    ('Ватрушка Булочка Гп', 5.8, '8898'),
    ('Булочка Мак Офор', 5.9, '8898'),
    ('Булчка Кунжут Пастой Гп', 5.2, '8898'),
    ('Булочка Классический Гп', 5.8, '8898'),
    ('Булочка оливка Пастой гп', 5.8, '8898'),
    ('Булочка Смит Гп', 5.7, '8898'),
    ('Хачапурий колбаса Гп', 2.7, '8898'),
    ('Круасан Гп Миндаль', 4, '8898'),
    ('Круасан Гп Фисташковый', 3.3, '8898'),
    ('Растегай капуста Гп', 2.3, '8898'),
    ('Растегай Мясо Гп', 2.3, '8898'),
    ('Растегай Картошка Гп', 2.3, '8898'),
    ('Растегай яйцо Гп', 2.3, '8898'),
    ('Балиш Гп', 3.7, '8898'),
    ('Булочка СочникГп', 2.4, '8898'),
    ('Булочка Конверт Гп', 3.8, '8898'),
    ('Булочка ПлюшкаГп', 5.6, '8898'),
    ('Открытый Пицца Гп', 4.4, '8898'),
    ('Мясной Лепешка Гп', 3.9, '8898'),
    ('Пицца Картошка с таматомГп', 4.4, '8898'),
    ('Булочка Яблока Гп', 2.8, '8898'),
    ('Пицца с сыром и шпинатом Гп', 5, '8898'),
    ('Пирок Отпрафка', 15.5, '8898'),
    ('Пирок Мишка Гп', 15.5, '8898'),
    ('Пирок Багинский Пахлава Гп', 15.5, '8898'),
    ('Круассан Ягодный Офор', 42.1, '6866'),
    ('Круассан Шоколадный Офор', 42.1, '6866'),
    ('Фисташковый Круассан оформ', 30, '6866'),
    ('Миндальный Круассан оформ', 30, '6866'),
    ('Сомса Мини Мясо Гп', 198.4, '6866'),
    ('Сомса Мини Курица Гп', 240, '6866'),
    ('Сендвич Круассан Передзагатовка', 58.9, '6866'),
    ('Курыный Сендвич Передзагатовка', 59.1, '6866'),
    ('Наклейкага дата Пер Цезрь', 4.5, '6866'),
    ('Наклейкага дата Перед', 1.6, '6866'),
    ('Цезарь Салат оформление', 51.5, '6866'),
    ('Классический Круассан', 15.5, '6866'),
    ('Айзберг Передзагатовка', 173.3, '9888'),
    ('Блинчик Передзагатовка Пишириш', 61, '9888'),
    ('Блинчик Начинка МясоПередзагатовка', 1238, '9888'),
    ('Блинчик Творг начинка передзагатовка', 82, '9888'),
    ('Бедана тухум Передзагатовка', 10.7, '9888'),
    ('Желток Передзагатовка', 334.6, '9888'),
    ('Меланж Передзагатовка', 66, '9888'),
    ('Сухарик Тограш Передзагатовка', 437.5, '9888'),
    ('Виаленый Помидор Передзагатовка', 278, '9888'),
    ('Цезарь Соус Передзагатовка', 113.5, '9888'),
    ('Индейка Слайс Передзагатовка', 71, '9888'),
    ('Бодринг Слайс Передзагатовка', 90, '9888'),
    ('Цезарь Соус идиш Передзаг', 11.3, '9888'),
    ('Блинчик Хамир передзагатовка', 93, '9888'),
    ('Имбирный Соус Передзагатовка', 140, '9888'),
    ('Сыр Пармезан Перед', 112, '9888'),
    ('Товук Филе', 325.4, '9888'),
    ('Товук Кесиш', 271.5, '9888'),
    ('Сосиска Булочка Гп', 3.1, '8898'),
    ('СосискаСлойка Булочка Гп', 4.2, '8898'),
)


class Refused(Exception):
    """Production is not in a state this can write into without a guess."""


def _unit(db: Session, plant: Factory) -> tuple[Manager, bool]:
    """(the plant's unit, whether it was just created)."""
    live = (db.query(Manager).filter(Manager.factory_id == plant.id,
                                     Manager.archived.is_(False))
            .order_by(Manager.id).all())
    if len(live) == 1:
        return live[0], False
    if live:
        raise Refused(f"{len(live)} units stand on the plant already: "
                      + ", ".join(f"{m.name} (№{m.id})" for m in live))
    twin = db.query(Manager).filter(func.lower(Manager.name) == UNIT_NAME.lower(),
                                    Manager.archived.is_(False)).first()
    if twin:
        raise Refused(f"a unit named {twin.name} (№{twin.id}) exists on another plant")
    next_id = int(db.query(func.coalesce(func.max(Manager.id), 0)).scalar() or 0) + 1
    unit = Manager(id=next_id, name=UNIT_NAME, shift=UNIT_SHIFT, archived=False,
                   zagruzka_on=False, factory_id=plant.id)
    db.add(unit)
    db.flush()
    return unit, True


def apply(db: Session) -> dict:
    """Add what is absent — plant, unit, catalogue — inside the caller's
    transaction (the caller commits). Returns what it found and did; raises
    :class:`Refused`, having written nothing the caller should keep, when a
    person must choose."""
    plant = db.query(Factory).filter(
        func.lower(Factory.code) == PLANT["code"].lower()).first()
    plant_created = plant is None
    if plant is None:
        last = db.query(func.max(Factory.sort_order)).scalar()
        plant = Factory(sort_order=(last + 1) if last is not None else 0, **PLANT)
        db.add(plant)
        db.flush()

    unit, unit_created = _unit(db, plant)

    # The unit's catalogue lock first, as the import takes it: a cell's
    # positions following it here must land wholly before or wholly after.
    pp_catalog.lock(db, [unit.id])
    written = pp_catalog.is_empty(db, unit.id)
    if written:
        for i, (name, labor, team) in enumerate(LINES):
            db.add(PPProduct(manager_id=unit.id, sap_code="", name=name,
                             work_center=team, labor_time=labor, sort_order=i))
        for i, (code, shtatka) in enumerate(TEAMS):
            db.add(PPWorkCenter(manager_id=unit.id, code=code, shtatka=shtatka,
                                sort_order=i))
        db.flush()

    return {
        "plant_id": plant.id, "plant_created": plant_created,
        "unit_id": unit.id, "unit_name": unit.name, "unit_shift": unit.shift,
        "unit_created": unit_created,
        "written": written,
        "lines": db.query(PPProduct).filter(PPProduct.manager_id == unit.id).count(),
        "work_centers": db.query(PPWorkCenter).filter(
            PPWorkCenter.manager_id == unit.id).count(),
    }


def _the_unit(db: Session) -> Manager:
    """The plant's ONE live unit, or :class:`Refused` — no plant, no unit or
    several are states a person must settle."""
    plant = db.query(Factory).filter(
        func.lower(Factory.code) == PLANT["code"].lower()).first()
    if plant is None:
        raise Refused("the plant «Almaty» is not on the platform")
    live = (db.query(Manager).filter(Manager.factory_id == plant.id,
                                     Manager.archived.is_(False))
            .order_by(Manager.id).all())
    if len(live) != 1:
        raise Refused(f"{len(live)} live units stand on the plant"
                      + (": " + ", ".join(f"{m.name} (№{m.id})" for m in live) if live else ""))
    return live[0]


def name_head(db: Session, by: str) -> dict:
    """Give the plant's one live unit its head's name and kind, inside the
    caller's transaction (the caller commits). Raises :class:`Refused`, having
    changed nothing, when the unit is not there to name or carries somebody
    else's name."""
    from app.routers.profiles import _rename_profile   # THE rename, with its cascade
    from app.services import supervisor_kind, verifix_org

    unit = _the_unit(db)
    name = verifix_org.profile_name(HEAD)
    was = unit.name
    fold = lambda v: " ".join((v or "").split()).lower()      # noqa: E731
    if fold(was) not in (fold(UNIT_NAME), fold(name)):
        raise Refused(f"the unit is named {was} (№{unit.id}) already")
    twin = db.query(Manager).filter(func.lower(Manager.name) == name.lower(),
                                    Manager.archived.is_(False),
                                    Manager.id != unit.id).first()
    if twin:
        raise Refused(f"a unit named {twin.name} (№{twin.id}) exists already")

    renamed = was != name
    if renamed:
        _rename_profile(db, "supervisor", unit.id, name)
    kind_was = unit.supervisor_kind
    if kind_was != HEAD_KIND:
        supervisor_kind.set_manual(unit, HEAD_KIND, by)
    db.flush()
    return {"unit_id": unit.id, "unit_shift": unit.shift, "name": unit.name,
            "was": was, "renamed": renamed,
            "kind": unit.supervisor_kind, "kind_was": kind_was}


def _fold(v) -> str:
    return " ".join((v or "").split()).lower()


def replace_catalog(db: Session, now: Optional[datetime] = None) -> dict:
    """Put the second form (`FORM_NOV21`) in place of the unit's catalogue,
    inside the caller's transaction (the caller commits). Raises
    :class:`Refused`, having written nothing, when a person must choose.

    It is an EDIT of the catalogue, made the way the page's own edits are
    (services/pp_catalog.py), and never a wipe:

      * **Dated.** `pp_catalog.freeze` first: every day before the shift in
        progress keeps the catalogue it had, A · B · C and all, and every
        number on it. Only a unit that holds no catalogue at all takes the
        form for every day (`is_empty`, the import's own rule).
      * **A line that keeps its NAME is edited in place** — Команда,
        Трудоемкость, its place in the list — so its id stays, and with it
        whatever a person set on it since (the measure, the container
        capacities, a SAP code). The name is the whole of what the form says
        about a line that has no code, so it is the one match that is not a
        guess; position never is (`pp_calc.line_keys`). A line the form names
        that sits in the archive comes back live, as an import brings it back.
      * **A line the form does not name goes** — a live one deleted, an
        archived one kept in the archive under its team's new Команда. A line
        the form names that the unit lacks is added, code-less.
      * **The teams are RENAMED**, A → 8898 · B → 6866 · C → 9888: the row
        keeps its id and a capacity somebody tuned, and takes the form's
        штатка. A work centre no line names any more is removed.
      * **What a person TYPED from the start day on follows its line**
        (`production._carry_manual_quantities`, the page's own carry): the
        line's Команда is part of the key its ПЛАН / ФАКТ are stored under,
        and every line's changes here. The day's «Odam soni» and штатка pins
        follow their team's new Команда the same way.

    Positions that came to the unit with a cell, or left it with one
    (`pp_catalog_moves`), are a state the import itself treats line by line;
    this refuses it rather than re-spell those rules — the plant has no cell
    another unit ever held.
    """
    from app.models import PPCatalogMove, PPWorkCenterDaily
    from app.routers.production import (_carry_manual_quantities, _catalog_snapshot,
                                        _rejoin_lines, _sap_pairs)
    from app.services import cell_lookup, pp_catalog_moves

    unit = _the_unit(db)
    mid = unit.id
    # The unit's catalogue lock first, as the import takes it: a cell's
    # positions following it here must land wholly before or wholly after.
    pp_catalog.lock(db, [mid])
    if db.query(PPCatalogMove.id).filter(
            or_(PPCatalogMove.from_unit == mid, PPCatalogMove.to_unit == mid),
            PPCatalogMove.state == pp_catalog_moves.MOVED).first():
        raise Refused(f"positions have moved with a cell into or out of {unit.name} (№{mid})")

    first = pp_catalog.is_empty(db, mid)
    # BEFORE a row is touched: the session does not autoflush, so a row already
    # changed in memory would be kept with its new values.
    eff = None if first else pp_catalog.freeze(db, mid, "form_nov21", now)
    before = _catalog_snapshot(db, mid)

    renamed = {letter: code for code, _n, letter in FORM_NOV21_TEAMS}
    rows = db.query(PPProduct).filter(PPProduct.manager_id == mid).all()
    pool: dict[str, list] = {}
    for p in sorted(rows, key=lambda r: (not r.active, r.sort_order or 0, r.id)):
        pool.setdefault(_fold(p.name), []).append(p)

    added, retimed, moved_team, restored = [], [], [], 0
    for i, (name, labor, team) in enumerate(FORM_NOV21):
        same = pool.get(_fold(name))
        if not same:
            db.add(PPProduct(manager_id=mid, sap_code="", name=name, work_center=team,
                             labor_time=labor, sort_order=i))
            added.append(name)
            continue
        p = same.pop(0)
        if (p.work_center or "") != team:
            p.work_center = team
            p.wc_group = None           # a letter names a cell AT a work centre
            moved_team.append(p)
        if p.labor_time is None or float(p.labor_time) != float(labor):
            retimed.append((name, None if p.labor_time is None else float(p.labor_time),
                            float(labor)))
            p.labor_time = labor
        p.name = name
        p.sort_order = i
        if not p.active:
            p.active = True
            p.archived_at = p.archived_by = p.archived_from = None
            restored += 1

    # What the form did not take: a live line goes, and so does a spare copy
    # of a name it did take (two lines of one identity would leave which of
    # them reads the stored numbers to their order — `pp_calc.line_ident`).
    form_names = {_fold(n) for n, _l, _t in FORM_NOV21}
    removed, archive = [], []
    for key, left in pool.items():
        for p in left:
            if p.active or key in form_names:
                removed.append(p.name or p.sap_code or "")
                db.delete(p)
            else:
                archive.append(p)
    archive.sort(key=lambda r: (r.sort_order or 0, r.id))
    for k, p in enumerate(archive):
        p.sort_order = len(FORM_NOV21) + k
        if p.work_center in renamed:
            p.work_center = renamed[p.work_center]
            p.wc_group = None

    wcs = {w.code: w for w in db.query(PPWorkCenter).filter(
        PPWorkCenter.manager_id == mid).all()}
    for i, (code, shtatka, letter) in enumerate(FORM_NOV21_TEAMS):
        w = wcs.get(code)
        if w is None and letter in wcs:
            w = wcs[code] = wcs.pop(letter)
            w.code = code
        if w is None:
            w = wcs[code] = PPWorkCenter(manager_id=mid, code=code)
            db.add(w)
        w.shtatka, w.sort_order, w.active = shtatka, i, True
    named = {code for code, _n, _l in FORM_NOV21_TEAMS} | {p.work_center for p in archive}
    wc_removed = sorted(code for code in wcs if code not in named)
    for code in wc_removed:
        db.delete(wcs[code])
    db.flush()

    carried = pins = 0
    filled = {"days": 0, "rows": 0, "skipped": False}
    if eff is not None:
        carried = _carry_manual_quantities(db, mid, before, _catalog_snapshot(db, mid),
                                           since=eff)
        for r in (db.query(PPWorkCenterDaily)
                  .filter(PPWorkCenterDaily.manager_id == mid,
                          PPWorkCenterDaily.date >= eff,
                          PPWorkCenterDaily.work_center.in_(list(renamed))).all()):
            code = renamed[r.work_center]
            if db.query(PPWorkCenterDaily.id).filter(
                    PPWorkCenterDaily.manager_id == mid, PPWorkCenterDaily.date == r.date,
                    PPWorkCenterDaily.work_center == code,
                    func.coalesce(PPWorkCenterDaily.wc_group, "") == (r.wc_group or "")).first():
                continue                # a pin already typed under the new Команда wins
            r.work_center = code
            pins += 1
        # A line somebody gave a SAP code reads the file under its new Команда
        # from the start day on (the page's own re-join; code-less lines: none).
        pairs = _sap_pairs(moved_team)
        if pairs:
            filled = _rejoin_lines(db, mid, pairs, since=eff, commit=False)
        db.flush()

    # Which of the three a cell of the unit answers for (`cells.sap_code` is
    # what a Команда is joined on) — read only, for the admins' card.
    cells = cell_lookup.by_sap(db, manager_ids=[mid])
    live = db.query(PPProduct).filter(PPProduct.manager_id == mid,
                                      PPProduct.active.is_(True)).count()
    return {
        "unit_id": mid, "unit_name": unit.name, "unit_shift": unit.shift,
        "first": first, "from": eff,
        "lines": live, "added": added, "removed": removed, "retimed": retimed,
        "restored": restored, "archived_kept": len(archive),
        "teams": [(code, n) for code, n, _l in FORM_NOV21_TEAMS],
        "wc_removed": wc_removed,
        "carried": carried, "pins": pins, "filled": filled,
        "unjoined": [code for code, _n, _l in FORM_NOV21_TEAMS
                     if cell_lookup.resolve_sap(cells, code, mid) is None],
    }


# The four Verifix subdivisions under «Алмата Фабрика» (division 1761), as
# production's stored org read on 2026-11-21: (division id, code, Verifix's name,
# SAP code). The first three ARE the catalogue's teams, so their SAP code is
# their own code — that joins a Команда to its cell (`cell_lookup.by_sap`); the
# cold room is no team and carries none.
PLANT_DIVISION = "1761"
CELLS = (
    ("8681", "8898", "8898 Комплектация", "8898"),
    ("8682", "6866", "6866 Сборка сэндвичей-круассанов", "6866"),
    ("8683", "9888", "9888 Предзаготовка", "9888"),
    ("8684", "6668", "6668 Холодильная и морозильная камера", None),
)


def add_cells(db: Session) -> dict:
    """Create the plant's cells on its one unit, inside the caller's
    transaction (the caller commits). «Zagruzka hisoblanadi» is OFF on each, so
    no загрузка is counted and a leader of them owes no checklist
    (`leader_load`); each is tied to its Verifix division, so the live sync
    follows it from the first pass. A code that is already a cell is left as it
    is and reported — whose it is, is a person's call. Raises :class:`Refused`
    when the plant has no single unit."""
    from app.services import cell_register, verifix_org

    unit = _the_unit(db)
    made: list[str] = []
    kept: list[tuple[str, Optional[int]]] = []
    for div, code, vname, sap in CELLS:
        have = db.query(Cell).filter(Cell.verifix_code == cell_register.norm_code(code)).first()
        if have is not None:
            kept.append((code, have.manager_id))
            continue
        cell = cell_register.create_cell(
            db, code, name_ru=verifix_org.vx_name(vname, code), manager_id=unit.id,
            in_load=False, vfx_division_id=div,
            vfx_meta={"name": vname, "raw": code, "code": code, "src": "code", "state": "A",
                      "parent": PLANT_DIVISION, "opened": None, "closed": None})
        cell.sap_code = sap
        made.append(code)
    db.flush()
    return {"unit_id": unit.id, "unit_name": unit.name, "made": made, "kept": kept}
