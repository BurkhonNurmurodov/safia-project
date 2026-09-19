from app.db import SessionLocal
from app.models import LeaderTaskDef
from app.services.leader_rules_sep19 import DESCRIPTIONS

db = SessionLocal()
task = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == 10).first()
if task:
    task.description = DESCRIPTIONS[10]
    db.commit()
    print("Updated task 10 description.")
else:
    print("Task 10 not found.")
db.close()
