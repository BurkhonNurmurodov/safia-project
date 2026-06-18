"""Run once to seed managers and sheet sources from the existing verifix_to_pg.py constants."""
import sys
sys.path.insert(0, ".")

from app.database import engine, Base, SessionLocal
from app.models import Manager, SheetSource

Base.metadata.create_all(bind=engine)

MANAGERS = [
    (1, "Арипова Манзура", 1),
    (2, "Артикова Масуда", 1),
    (3, "Абдукаримов Санжар", 1),
    (4, "Хакимов Руслан", 1),
    (5, "Абдугамитов Мухаммад", 1),
    (6, "Сувонов Элшод", 1),
    (7, "Султонова Умида", 1),
    (8, "Максумов Санжар", 1),
    (9, "Мирмахмудова Мунира", 1),
    (10, "Рахимова Камола", 1),
    (11, "Талипова Мамура", 1),
    (12, "Эргашев Мухриддин", 2),
    (13, "Олишев Ислом", 2),
    (14, "Файзуллаева Малика", 2),
    (15, "Ёгмиров Феруз", 2),
    (16, "Ибрагимова Сайёра", 2),
    (17, "Камолова Наргиза", 2),
    (18, "Акбаров Турсунали", 2),
    (19, "Уразов Аскар", 2),
]

SHEET_SOURCES = [
    ("source", "1q-4PTcnGNNsGzXmXAIa5HE2Ze0f6hQ-7dKagvHSH2eI"),
    ("shift_report", "1qCntFNUhy5GdSHhByK5gtVd9T8hqp6Dn4oPbrCujZQ8"),
]

db = SessionLocal()
try:
    for mgr_id, name, shift in MANAGERS:
        existing = db.query(Manager).filter(Manager.id == mgr_id).first()
        if not existing:
            db.add(Manager(id=mgr_id, name=name, shift=shift))
            print(f"  Added manager {mgr_id}: {name}")
        else:
            print(f"  Skipped (exists): {mgr_id} {name}")

    for name, sheet_id in SHEET_SOURCES:
        existing = db.query(SheetSource).filter(SheetSource.name == name).first()
        if not existing:
            db.add(SheetSource(name=name, sheet_id=sheet_id))
            print(f"  Added sheet source: {name}")
        else:
            print(f"  Skipped (exists): {name}")

    db.commit()
    print("Seed complete.")
finally:
    db.close()
