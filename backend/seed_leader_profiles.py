"""One-off seed: bulk-create pre-created leader profiles under their supervisors.

Usage (from the backend/ directory, same as seed_managers.py):
    python seed_leader_profiles.py --dry-run   # report only, nothing written
    python seed_leader_profiles.py             # insert + commit

Supervisor keys in LEADERS may use ANY known spelling — the canonical Latin
Manager.name or its ru/uz_cyrl display override (sheet_alias_map). Leader
names are stored canonically in Uzbek Latin (Cyrillic input is transliterated);
`cell` is left NULL like legacy rows — assign it later via Profiles → edit.
Data-only insert: no Passenger restart needed, registration pickers see the
new profiles immediately.
"""
import sys
sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models import Manager, RoleProfile
from app.services.name_map import sheet_alias_map
from app.translit import transliterate

# ── Paste the list here: {"Supervisor name": ["Leader 1", "Leader 2", ...]} ──
LEADERS: dict[str, list[str]] = {
    # "Арипова Манзура": ["Leader One", "Leader Two"],
}

EXPECTED_SUPERVISORS = 19
EXPECTED_LEADERS = 120


def norm(s: str) -> str:
    return " ".join((s or "").split()).casefold()


dry_run = "--dry-run" in sys.argv[1:]

if not LEADERS:
    print("LEADERS is empty — paste the supervisor→leaders list into the dict first.")
    sys.exit(1)

db = SessionLocal()
try:
    managers = db.query(Manager).all()
    alias = sheet_alias_map(db, [m.name for m in managers])   # any spelling → canonical
    by_canon = {m.name: m for m in managers}
    lookup = {norm(spelling): by_canon[canon] for spelling, canon in alias.items()}

    # Resolve every supervisor before touching anything — abort wholesale on a miss.
    unresolved = [s for s in LEADERS if norm(s) not in lookup]
    if unresolved:
        print("Unresolved supervisor names (no manager matches any known spelling):")
        for s in unresolved:
            print(f"  ✗ {s}")
        print("\nKnown managers:")
        for m in sorted(managers, key=lambda m: m.id):
            print(f"  {m.id}: {m.name} (shift {m.shift})")
        sys.exit(1)

    total_leaders = sum(len(v) for v in LEADERS.values())
    if len(LEADERS) != EXPECTED_SUPERVISORS or total_leaders != EXPECTED_LEADERS:
        print(f"NOTE: list has {len(LEADERS)} supervisors / {total_leaders} leaders "
              f"(expected {EXPECTED_SUPERVISORS} / {EXPECTED_LEADERS}) — continuing.")

    created = skipped = 0
    for sup_name, leader_names in LEADERS.items():
        mgr = lookup[norm(sup_name)]
        print(f"\n{mgr.name} (manager {mgr.id}, shift {mgr.shift}):")
        for raw in leader_names:
            name = " ".join((raw or "").split())
            if not name:
                continue
            canonical = transliterate(name, "uz")  # no-op for Latin input
            dup = db.query(RoleProfile).filter_by(
                role="leader", name=canonical, manager_id=mgr.id).first()
            if dup:
                print(f"  = exists, skipped: {canonical}")
                skipped += 1
                continue
            db.add(RoleProfile(role="leader", name=canonical, manager_id=mgr.id, cell=None))
            suffix = f"  (from «{name}»)" if canonical != name else ""
            print(f"  + {canonical}{suffix}")
            created += 1

    print(f"\n{created} to create, {skipped} already existed.")
    if dry_run:
        db.rollback()
        print("Dry run — rolled back, nothing written.")
    else:
        db.commit()
        print("Committed.")
finally:
    db.close()
