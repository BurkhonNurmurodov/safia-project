"""Report every leader-task window that falls OUTSIDE its shift's hours.

Read-only. Writes nothing, changes nothing — it answers one question: which
configured task windows can a leader on that shift never actually work?

That question is the 26 Aug incident's root config. «08:00 — 10:00» is an
ordinary shift-1 morning; inherited by a shift-2 unit that works 17:00 → 09:00
it is an hour that never arrives, and the platform recorded the leaders as
having failed the task. `leader_ai.window_fits_shift` is the rule; this walks
all three levels of the chain and names every row that breaks it.

    cd backend && venv/bin/python report_bad_windows.py
    cd backend && venv/bin/python report_bad_windows.py --csv > windows.csv
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal                      # noqa: E402
from app.models import (                                   # noqa: E402
    LeaderTaskDef, LeaderTaskSetting, LeaderTaskLeaderSetting,
    Manager, RoleProfile,
)
from app.services import leader_ai as A                    # noqa: E402


def rows(db):
    """(level, unit, shift, task_id, task, lo, hi, start_min, end_min, fits)."""
    defs = {d.id: d for d in db.query(LeaderTaskDef).all()}
    mgr = {m.id: m for m in db.query(Manager).all()}
    prof = {p.id: p for p in db.query(RoleProfile)
            .filter(RoleProfile.role == "leader").all()}
    shifts = sorted({m.shift for m in mgr.values() if m.shift is not None})
    out = []

    def add(level, who, shift, td, lo, hi):
        d_lo, d_hi = A.shift_window(shift)
        win = (lo or d_lo, hi or d_hi)
        st, en = A.window_span(shift, win)
        out.append((level, who, shift, td.id,
                    (td.name_uz or "")[:44], win[0], win[1], st, en,
                    A.window_fits_shift(shift, win)))

    # global — reaches every unit, so it is judged against every live shift
    for td in defs.values():
        if not (td.win_from or td.win_to):
            continue
        for sh in shifts or [None]:
            add("global", "(hamma)", sh, td, td.win_from, td.win_to)

    for r in db.query(LeaderTaskSetting).all():
        td, m = defs.get(r.task_id), mgr.get(r.manager_id)
        if not td or not m or not (r.win_from or r.win_to):
            continue
        add("brigadir", m.name, m.shift, td, r.win_from, r.win_to)

    for r in db.query(LeaderTaskLeaderSetting).all():
        td, p = defs.get(r.task_id), prof.get(r.leader_id)
        if not td or not p or not (r.win_from or r.win_to):
            continue
        m = mgr.get(p.manager_id)
        add("lider", p.name, m.shift if m else None, td, r.win_from, r.win_to)
    return out


def main():
    csv = "--csv" in sys.argv
    with SessionLocal() as db:
        all_rows = rows(db)
    bad = [r for r in all_rows if not r[-1]]

    if csv:
        print("level,who,shift,task_id,task,from,to,start_min,end_min,fits")
        for r in all_rows:
            print(",".join(f'"{x}"' for x in r))
        return

    print(f"Windows configured : {len(all_rows)}")
    print(f"Outside the shift  : {len(bad)}\n")
    if not bad:
        print("Every configured window is workable on its shift.")
        return
    for sh in sorted({r[2] for r in bad}, key=lambda x: (x is None, x)):
        lo, hi = A.shift_window(sh)
        span = A.shift_span_min(sh)
        hits = [r for r in bad if r[2] == sh]
        print(f"── shift {sh} (works {lo} → {hi}, {span} min) — {len(hits)} broken")
        for lvl, who, _s, tid, name, wlo, whi, st, en, _f in sorted(hits):
            why = ("starts before the shift" if st < 0
                   else f"ends {en - span} min after the shift")
            print(f"   {lvl:9} {who[:26]:26} №{tid:<3} {name[:34]:34} "
                  f"{wlo}–{whi}  ({why})")
        print()


if __name__ == "__main__":
    main()
