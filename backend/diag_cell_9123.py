"""⚠ TEMPORARY (2026-10-06): print why cell 9123's 5 October move did or did
not land, into the deploy job's log (the one window onto production a cloud
session can read). Run by `.gitea/workflows/deploy.yaml` after the health
check. READ-ONLY: the dry run of `cell_day_fix_oct05.apply` is rolled back and
nothing is committed. No worker names are printed — counts, unit names, ids and
reasons only. Delete with the one-shot and its workflow step.
"""
from collections import Counter

from app.database import SessionLocal
from app.models import (
    AppSetting, Attendance, AttendanceBatch, AttendanceBatchCell, Cell, Manager,
)
from app.services import cell_day_fix_oct05 as fx

FLAGS = ("cell_9123_oct05_to_raximova_2026_10_06_v1",
         "cell_9123_oct05_to_raximova_2026_10_06_v2",
         "cell_9123_oct05_to_raximova_2026_10_06_v2_last_dm")


def main() -> None:
    db = SessionLocal()
    try:
        for k in FLAGS:
            row = db.query(AppSetting).filter_by(key=k).first()
            val = (row.value or "")[:300].replace("\n", " | ") if row else None
            print(f"[9123] setting {k} = {val!r}")
        names = {m.id: (m.name, m.shift, m.archived) for m in db.query(Manager).all()}
        for c in db.query(Cell).filter(Cell.verifix_code.like("%9123%")).all():
            print(f"[9123] cell #{c.id} code={c.verifix_code!r} unit={c.manager_id} "
                  f"{names.get(c.manager_id)} archived_at={c.archived_at}")
        for mid, (name, shift, arch) in names.items():
            if fx._norm(name).startswith("RAXIMOVA") or fx._norm(name).startswith("IOGMIROV") \
                    or fx._norm(name).startswith("YOGMIROV"):
                print(f"[9123] unit #{mid} {name!r} norm={fx._norm(name)!r} shift={shift} archived={arch}")
        rows = (db.query(Attendance.manager_id, Attendance.verifix_code, Attendance.split_of)
                .filter(Attendance.date == fx.DAY, Attendance.verifix_code.like("%9123%")).all())
        print("[9123] 05.10 rows by (unit, code):",
              dict(Counter((names.get(m, (m,))[0], v) for m, v, _s in rows)),
              "split halves:", sum(1 for *_x, s in rows if s))
        batch = db.query(AttendanceBatch).filter(AttendanceBatch.date == fx.DAY).first()
        print(f"[9123] batch: {batch and (batch.id, batch.status)}")
        if batch:
            for bc in (db.query(AttendanceBatchCell)
                       .filter(AttendanceBatchCell.batch_id == batch.id,
                               AttendanceBatchCell.verifix_code.like("%9123%")).all()):
                print(f"[9123] batch cell {bc.verifix_code!r} unit={bc.manager_id} "
                      f"prev={bc.prev_manager_id} pending={bc.pending} included={bc.included}")
        try:
            out = fx.apply(db)
            print(f"[9123] DRY RUN problems={out['problems']} waiting={out['waiting']} "
                  f"already={out['already']} from={out['from']!r} to={out['to']!r} "
                  f"would_move={out['rows']} held={len(out['held'])} "
                  f"held_reasons={sorted({w for _n, w in out['held']})} notes={len(out['notes'])}")
        except Exception as exc:  # the exact failure the boot pass would hit
            print(f"[9123] DRY RUN raised {exc!r}")
    finally:
        db.rollback()
        db.close()


if __name__ == "__main__":
    main()
