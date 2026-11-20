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
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Factory, Manager, PPProduct, PPWorkCenter
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


def name_head(db: Session, by: str) -> dict:
    """Give the plant's one live unit its head's name and kind, inside the
    caller's transaction (the caller commits). Raises :class:`Refused`, having
    changed nothing, when the unit is not there to name or carries somebody
    else's name."""
    from app.routers.profiles import _rename_profile   # THE rename, with its cascade
    from app.services import supervisor_kind, verifix_org

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
    unit = live[0]
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
