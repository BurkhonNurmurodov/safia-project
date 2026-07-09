"""Diagnostic: why is the Murodali Ochilov row broken in the comparison table.
Run from the backend/ dir:  python3 diag_ochilov.py
Reads the same DB the app uses (settings.database_url)."""
import re
from app.database import SessionLocal
from app.models import Manager, ProductionData, HeadcountData, Attendance, Translation
from app.services.name_map import sheet_name_map

db = SessionLocal()

# 0) which DB are we hitting (host masked-ish)
from app.config import settings
host = re.sub(r"//[^@]*@", "//<user>@", settings.database_url)
print(f"DB: {host}\n")

# 1) Manager rows that look like this brigadir
mgrs = db.query(Manager).filter(
    (Manager.name.ilike("%ochilov%")) | (Manager.name.ilike("%murod%"))
).all()
print("=== Manager rows (canonical name) ===")
for m in mgrs:
    print(f"  id={m.id}  shift={m.shift}  archived={m.archived}  name={m.name!r}")

# 2) Translation overrides for each candidate (all langs)
print("\n=== name.* overrides for those managers ===")
for m in mgrs:
    rows = db.query(Translation).filter(Translation.key == f"name.{m.name}").all()
    if not rows:
        print(f"  {m.name!r}: (no overrides at all)")
    for t in rows:
        print(f"  {m.name!r}  [{t.lang}] -> {t.value!r}")

# 3) resolved sheet name (ru override, else canonical)
print("\n=== resolved sheet name (what we match sheet rows against) ===")
sheet_of = sheet_name_map(db, [m.name for m in mgrs])
for m in mgrs:
    print(f"  {m.name!r} -> {sheet_of.get(m.name)!r}")

# 4) what the SHEET actually stored (production + headcount distinct names that look similar)
print("\n=== production_data.manager_name values that look like this person ===")
for (n,) in db.query(ProductionData.manager_name).distinct().all():
    if re.search(r"ochilov|murod|очил|мурод", n or "", re.I):
        print(f"  PROD  {n!r}")
print("=== headcount_data.manager_name values that look like this person ===")
for (n,) in db.query(HeadcountData.manager_name).distinct().all():
    if re.search(r"ochilov|murod|очил|мурод", n or "", re.I):
        print(f"  HC    {n!r}")

# 5) actual matched rows for the resolved sheet name (last ~5 dated rows each)
for m in mgrs:
    sn = sheet_of.get(m.name)
    pd = db.query(ProductionData).filter(ProductionData.manager_name == sn).all()
    hc = db.query(HeadcountData).filter(HeadcountData.manager_name == sn).all()
    att = db.query(Attendance).filter(Attendance.manager_id == m.id).count()
    print(f"\n=== rows matched for {m.name!r} via sheet_name={sn!r} ===")
    print(f"  production_data rows: {len(pd)}   headcount_data rows: {len(hc)}   attendance rows: {att}")
    for r in pd[:5]:
        print(f"    PROD {r.date}  plan={r.prod_plan}  actual={r.prod_actual}")
    for r in hc[:5]:
        print(f"    HC   {r.date}  official_hc={r.official_hc}")

db.close()
