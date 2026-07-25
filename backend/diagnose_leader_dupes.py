"""Read-only diagnosis: why the /tasks leader picker shows the same leader twice.

The picker (`/api/tasks/leaders`) lists one option per APPROVED row in
telegram_user_roles with role='leader', labelled «leader name · supervisor
name». It is keyed by registration, not by leader profile, so identical labels
can come from three different places — this script tells them apart:

  A) one leader profile claimed by SEVERAL Telegram accounts
     (no claim guard exists for leaders, unlike guests/admins)
  B) one account holding leader rows under SEVERAL managers rows that share a
     name (managers.name is not unique; managers.id is the Verifix file id)
  C) duplicate role_profiles rows for the same person under the same unit
     (does not duplicate the picker today, but would once it is profile-keyed)

It also reports how many leader_tasks hang off each duplicate role row, so you
can see which registration actually carries the work before cleaning up.

Nothing is written: no INSERT/UPDATE/DELETE, no commit, no Passenger restart.

Usage (from the backend/ directory):
    python3 diagnose_leader_dupes.py
    python3 diagnose_leader_dupes.py --out logs/leader_dupes.txt

On cPanel without terminal access: add it as a one-off Cron Job with the
--out form, then read the file in File Manager. Use the interpreter of the
Python App (Setup Python App → the "source" command shows its path), e.g.
    /home/USER/virtualenv/PATH/3.x/bin/python /home/USER/.../backend/diagnose_leader_dupes.py --out /home/USER/.../backend/logs/leader_dupes.txt
"""
import sys
from collections import defaultdict

sys.path.insert(0, ".")

from app.database import SessionLocal                       # noqa: E402
from app.models import (                                    # noqa: E402
    Cell, LeaderTask, Manager, RoleProfile, TelegramUser, TelegramUserRole,
)

_out = []


def say(line=""):
    _out.append(line)
    print(line)


def _acct(u, tid):
    if not u:
        return f"tg:{tid} (no telegram_users row!)"
    bits = [f"tg:{tid}"]
    if u.username:
        bits.append("@" + u.username)
    if u.tg_name:
        bits.append(f'tg name "{u.tg_name}"')
    if u.phone:
        bits.append(u.phone)
    bits.append(f"lang={u.language}")
    return "  ".join(bits)


def main():
    db = SessionLocal()
    try:
        mgrs = {m.id: m for m in db.query(Manager).all()}
        users = {u.telegram_id: u for u in db.query(TelegramUser).all()}

        rows = (
            db.query(TelegramUserRole)
            .filter(TelegramUserRole.role == "leader",
                    TelegramUserRole.status == "approved")
            .order_by(TelegramUserRole.full_name, TelegramUserRole.id)
            .all()
        )

        # leader_tasks per role row (all statuses + the active queue)
        tasks_all, tasks_active = defaultdict(int), defaultdict(int)
        for t in db.query(LeaderTask).all():
            tasks_all[t.leader_role_ref] += 1
            if t.status in ("todo", "doing"):
                tasks_active[t.leader_role_ref] += 1

        def label(r):
            m = mgrs.get(r.role_id)
            sup = m.name if m else f"<no managers row id={r.role_id}>"
            return f"{r.full_name} · {sup}"

        say("=" * 78)
        say(f"APPROVED leader registrations: {len(rows)}   "
            f"→ that many options in the /tasks picker")
        say("=" * 78)

        # ── what the picker actually shows twice ──────────────────────────────
        by_label = defaultdict(list)
        for r in rows:
            by_label[label(r)].append(r)
        dupes = {k: v for k, v in by_label.items() if len(v) > 1}

        say()
        say(f"[1] IDENTICAL PICKER LABELS: {len(dupes)} "
            f"(extra options: {sum(len(v) - 1 for v in dupes.values())})")
        if not dupes:
            say("    none — the picker has no visual duplicates right now.")
        for lbl, rs in sorted(dupes.items()):
            same_tid = len({r.telegram_id for r in rs}) == 1
            same_unit = len({r.role_id for r in rs}) == 1
            cause = ("B) one account, several managers rows sharing a name"
                     if same_tid and not same_unit else
                     "A) same unit, SEVERAL Telegram accounts" if same_unit and not same_tid else
                     "A+B) several accounts AND several units")
            say()
            say(f"  «{lbl}» ×{len(rs)}   → {cause}")
            for r in rs:
                m = mgrs.get(r.role_id)
                shift = f"shift {m.shift}" if m and m.shift else "shift ?"
                arch = " ARCHIVED" if m and m.archived else ""
                when = f"{r.approved_at:%Y-%m-%d}" if r.approved_at else "?"
                say(f"    role_ref={r.id:<6} manager_id={r.role_id} ({shift}{arch})"
                    f"  tasks={tasks_all[r.id]} (active {tasks_active[r.id]})"
                    f"  approved={when}")
                say(f"           {_acct(users.get(r.telegram_id), r.telegram_id)}")

        # ── A) one profile, several accounts ─────────────────────────────────
        say()
        say("[2] CAUSE A — same (name, unit) claimed by several accounts")
        by_pair = defaultdict(list)
        for r in rows:
            by_pair[(r.full_name, r.role_id)].append(r)
        a = {k: v for k, v in by_pair.items() if len({x.telegram_id for x in v}) > 1}
        if not a:
            say("    none.")
        for (name, mid), rs in sorted(a.items()):
            m = mgrs.get(mid)
            say(f"    {name} · {m.name if m else mid}: "
                + ", ".join(f"role_ref={r.id}/tg:{r.telegram_id}" for r in rs))

        # ── B) duplicate managers rows sharing a name ────────────────────────
        say()
        say("[3] CAUSE B — managers rows sharing a name (name is not unique)")
        by_mname = defaultdict(list)
        for m in mgrs.values():
            by_mname[m.name].append(m)
        mdupes = {k: v for k, v in by_mname.items() if len(v) > 1}
        if not mdupes:
            say("    none.")
        for name, ms in sorted(mdupes.items()):
            say(f"    «{name}»: " + ", ".join(
                f"id={m.id} shift={m.shift}{' ARCHIVED' if m.archived else ''}"
                f" leaders={db.query(RoleProfile).filter_by(role='leader', manager_id=m.id).count()}"
                for m in sorted(ms, key=lambda x: x.id)))

        # ── C) duplicate leader profiles ─────────────────────────────────────
        say()
        say("[4] CAUSE C — duplicate leader role_profiles (same unit + name)")
        profs = db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
        by_prof = defaultdict(list)
        for p in profs:
            by_prof[(p.manager_id, p.name)].append(p)
        pdupes = {k: v for k, v in by_prof.items() if len(v) > 1}
        say(f"    leader profiles total: {len(profs)}")
        if not pdupes:
            say("    no exact duplicates.")
        for (mid, name), ps in sorted(pdupes.items(), key=lambda kv: kv[0][1]):
            m = mgrs.get(mid)
            say(f"    {name} · {m.name if m else mid}: ids "
                + ", ".join(f"{p.id}(cells={db.query(Cell).filter_by(leader_id=p.id).count()})"
                            for p in ps))
        # near-duplicates: one name is a prefix of another in the same unit
        near = []
        for mid in {p.manager_id for p in profs}:
            names = sorted({p.name for p in profs if p.manager_id == mid})
            for i, x in enumerate(names):
                for y in names[i + 1:]:
                    if y.startswith(x) or x.startswith(y):
                        near.append((mid, x, y))
        if near:
            say("    short-form vs full-FIO pairs (same unit):")
            for mid, x, y in near:
                m = mgrs.get(mid)
                say(f"      «{x}» ~ «{y}»  · {m.name if m else mid}")

        # ── registrations with no matching profile ───────────────────────────
        say()
        say("[5] ORPHANS — approved leader registrations with no profile "
            "at (unit, name)")
        pset = {(p.manager_id, p.name) for p in profs}
        orphans = [r for r in rows if (r.role_id, r.full_name) not in pset]
        if not orphans:
            say("    none.")
        for r in orphans:
            m = mgrs.get(r.role_id)
            say(f"    role_ref={r.id} «{r.full_name}» · {m.name if m else r.role_id}"
                f"  tasks={tasks_all[r.id]}  tg:{r.telegram_id}")

        # ── tasks pointing at a role row that no longer exists ───────────────
        say()
        say("[6] DANGLING TASKS — leader_tasks whose leader_role_ref is gone")
        live = {r.id for r in db.query(TelegramUserRole).all()}
        dangling = defaultdict(int)
        for ref, n in tasks_all.items():
            if ref not in live:
                dangling[ref] = n
        if not dangling:
            say("    none.")
        for ref, n in sorted(dangling.items()):
            say(f"    leader_role_ref={ref}: {n} task(s)")

        say()
        say("=" * 78)
        say("Read-only: nothing was written.")
    finally:
        db.close()

    for i, a in enumerate(sys.argv):
        if a == "--out" and i + 1 < len(sys.argv):
            with open(sys.argv[i + 1], "w", encoding="utf-8") as fh:
                fh.write("\n".join(_out) + "\n")
            print(f"\n→ written to {sys.argv[i + 1]}")


if __name__ == "__main__":
    main()
