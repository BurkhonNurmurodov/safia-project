"""Bo'lims — the rooms of the plant where teams work (2026-11-23).

The operator: «we have to add bo'lim instead of teams … one supervisor has 5
teams, and all of them are located in different bo'lims like in different
buildings and floors» — and the point of it: «we have to give logistics that
kind of information … where it is located». So a cell carries ONE bo'lim
(`cells.bolim_id`) and the container split prints it under the cell.

`SEED` is the «Ichki logistika» simulator's floor plans as read on 2026-11-23:
every room that lists teams, its block and floor, its names, and the cells its
codes resolve to on the platform (the simulator lists some rooms by SAP code;
those were resolved to the cells carrying them). `TWINS` are the cells the plans
do not list that share a SAP code or a workshop name with exactly one placed
cell — nearly all the 2nd-shift twins of a 1st-shift team, which work in the
same room. Everything else (Keles, Almaty, the cells no rule placed) stays
unplaced until somebody picks its bo'lim on /cells.

Two rooms the plans leave unnamed are named after their teams («Somsa va yupqa
xonasi» — 8225, 8321; «Issiq oshxona» — 8611); rename them on /cells.
"""
from __future__ import annotations

from typing import Iterable

from sqlalchemy.orm import Session

# (sim room, block, floor, code, uz, ru, en, cells)
SEED = (
    ("r9",   "A", 2, "2.07", "Pirog tayyorlash sexi", "Цех гот. пирогов", "Pie Prep Workshop",
     "7411 7412 7413 7414 7415 7416 7417 7418"),
    ("r10",  "A", 2, "2.06", "Qandolat mahsulotlari sexi", "Цех гот. сдоб. изд", "Pastry Goods Workshop",
     "7311 7312 7313 7314"),
    ("r11",  "A", 2, "2.05", "Xamir bo'limi", "Отдел теста", "Dough Department", "8811 8812"),
    ("r13",  "A", 2, "2.03", "Qatlama xamir sexi", "Цех слоен. издел.", "Puff Pastry Workshop",
     "7211 7222 7223"),
    ("r14",  "A", 2, "2.03", "Pirog va pechene qadoqlash", "Фасовка пирогов и печенья",
     "Pie & Cookie Packaging", "6712 7111"),
    ("r15",  "A", 2, "2.01", "Biskvit tayyorlash sexi", "Цех приготов бисквитов", "Biscuit Prep Workshop",
     "6811 6812 7213"),
    ("r8",   "A", 2, None, "Keks bo'limi", "Отдел кексов", "Muffin Department", "7511"),
    ("r108", "A", 1, None, "Tortlarni bezash sexi", "Цех оформления тортов", "Cake Finishing Workshop",
     "4311 4312 4313 4314 4315 4316 4321 4322 4323 4325"),
    ("r115", "A", 1, None, "Krem tayyorlash sexi", "Цех заг. кремов", "Cream Preparation Workshop", "4211"),
    ("r116", "A", 1, None, "Tort tayyorlash sexi", "Цех заг. тортов", "Cake Preparation Workshop",
     "4111 4112 4113"),
    ("r123", "A", 1, None, "Muzlatish kamerasi (TM/YaT)", "Морозильная камера ГП/ПФ",
     "Freezer Chamber (Finished / Semi-Finished)", "4611 4612 4613 4614"),
    ("r125", "A", 1, None, "Glazur sexi", "Цех глазури", "Glaze Workshop", "4511 4521"),
    ("r126", "A", 1, None, "Yarim tayyor uchun muzlatish xonasi", "Морозильная комната для ПФ",
     "Freezer Room for Semi-Finished", "4411 4412 4413 4414"),
    ("r59",  "A", -1, None, "Mastika sexi", "Мастика", "Mastic Room", "6912 6913"),
    ("r60",  "A", -1, None, "Dekor bo'limi", "Отдел декора", "Decoration Department",
     "6911 7011 7012 7013 7014"),
    ("r64",  "A", -1, None, "Qadoqlash", "Фасовка", "Packing", "2811 2812"),
    ("r67",  "A", -1, None, "Sex «офр. мелк.шт.»", "Цех офр. мелк.шт.", "Workshop «офр. мелк.шт.»",
     "2312 2321 2323"),
    ("r72",  "A", -1, None, "Issiq sex", "Гор Цех", "Hot Workshop", "0811"),
    ("r171", "B", -1, None, "Go'sht bo'limi", "Мясной отдел", "Meat Department",
     "8121 8210 8213 8217 8222 8311 8322 8610 8622 8623 8624"),
    ("r177", "B", -1, None, "Somsa va yupqa xonasi", "Заготовка самсы и юпки", "Samsa & Yupka Room",
     "8225 8321"),
    ("r183", "B", 1, None, "Issiq oshxona", "Кухня горячая", "Hot Kitchen", "8611"),
    ("r185", "B", 1, None, "Blinxona", "Блинная", "Pancake Workshop", "8614"),
    ("r195", "B", 2, None, "Xamir bo'limi", "Отдел теста", "Dough Department", "9121 9122 9123"),
    ("r201", "B", 2, None, "Pishirish bo'limi", "Выпечка", "Baking", "9422"),
    ("r211", "B", 3, None, "Qatlamali pishiriqlar bo'limi", "Отдел слоек", "Puff Pastry Department",
     "9411 9423"),
    ("r212", "B", 3, None, "Sdoba (shirin pishiriqlar)", "Сдоба", "Sweet Pastry (Sdoba)", "9413 9414"),
)

# cell → sim room, for the cells the plans do not list (see the module doc).
TWINS = {
    # the same SAP code as a placed cell
    "6722": "r14", "7214": "r15", "7315": "r10", "7427": "r9",
    "9412": "r212", "9425": "r212", "9426": "r212", "9427": "r212",
    # the same workshop name as a placed cell (the other shift's team)
    "4121": "r116", "4122": "r116", "4123": "r116", "4221": "r115", "4324": "r108",
    "4422": "r126", "6732": "r14", "6821": "r15", "6822": "r15", "7121": "r14",
    "7131": "r14", "7221": "r15", "7323": "r10", "7421": "r9", "7422": "r9",
    "7423": "r9", "7424": "r9", "7425": "r9", "7426": "r9", "7521": "r8",
}

SEED_FLAG = "oneshot:bolims_seed_nov23"


def seed_placement() -> dict:
    """{verifix code: sim room} — the plans plus the twins."""
    out = {c: room for room, *_x, cells in SEED for c in cells.split()}
    for c, room in TWINS.items():
        out.setdefault(c, room)
    return out


def seed(db: Session) -> tuple[int, int]:
    """Create the seeded bo'lims (by `sim_room`, never twice) and place every
    cell that has NO bo'lim yet. Returns (bo'lims created, cells placed). A
    cell somebody already placed by hand is never moved."""
    from app.models import Bolim, Cell
    have = {b.sim_room: b for b in db.query(Bolim).filter(Bolim.sim_room.isnot(None))}
    made = 0
    for room, block, floor, code, uz, ru, en, _cells in SEED:
        if room in have:
            continue
        b = Bolim(sim_room=room, block=block, floor=floor, code=code,
                  name_uz=uz, name_ru=ru, name_en=en)
        db.add(b)
        have[room] = b
        made += 1
    db.flush()
    placed = 0
    want = seed_placement()
    for c in db.query(Cell).filter(Cell.verifix_code.in_(sorted(want)), Cell.bolim_id.is_(None)):
        b = have.get(want[c.verifix_code])
        if b is not None:
            c.bolim_id = b.id
            placed += 1
    return made, placed


def bolim_out(b, cells: int = 0) -> dict:
    return {"id": b.id, "name_uz": b.name_uz, "name_uz_cyrl": b.name_uz_cyrl,
            "name_ru": b.name_ru, "name_en": b.name_en, "code": b.code,
            "block": b.block, "floor": b.floor, "cells": cells}


def cell_places(db: Session, codes: Iterable) -> dict:
    """{verifix code: {names: {lang: name}, code, block, floor}} — the bo'lim
    each LIVE cell works in; a cell with no bo'lim is absent. The container
    split prints it under the cell's workshop name."""
    from app.models import Bolim, Cell
    codes = {str(c) for c in codes or () if c}
    if not codes:
        return {}
    rows = (db.query(Cell.verifix_code, Bolim)
            .join(Bolim, Bolim.id == Cell.bolim_id)
            .filter(Cell.verifix_code.in_(sorted(codes)), Cell.archived_at.is_(None)).all())
    out: dict = {}
    for code, b in rows:
        names = {k: v.strip() for k, v in (("uz", b.name_uz), ("uz_cyrl", b.name_uz_cyrl),
                                           ("ru", b.name_ru), ("en", b.name_en)) if v and v.strip()}
        out[str(code)] = {"names": names, "code": b.code, "block": b.block, "floor": b.floor}
    return out
