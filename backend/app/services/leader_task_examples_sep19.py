"""The 19 September 2026 EXAMPLE photos, written once at the GLOBAL level.

The operator picked one correct proof per task against the new criteria (agreed
18—19 Sep 2026) and asked for them to become the platform's example images. This
platform has no shell and the admin modal uploads one file at a time, so the
answer is a boot job like every other one-off in `startup.py`.

**It REPLACES the global level of the nine tasks it carries** (the operator's
call, 19 Sep): every existing global row for those tasks is deleted and the new
photos inserted in its place. That is not tidiness — several of the old globals
contradict the rules that start today, and an example is not merely shown to the
leader, it is handed to the REVIEWER beside the written criteria
(`leader_ai.task_examples`). A task whose global level held a one-person photo
for «show the leader teaching the zam lider», or a shift report with no clock in
it for a rule that turns on two dates, was teaching the model the opposite of
what it is about to judge by.

**What it deliberately does NOT touch:**

* tasks 1, 8 and 9 — the three becoming automatic checks, which have no criteria
  to pick an example against;
* task 7 — no proof in the week's sample passes its criteria (the «Факт» column
  is essentially never filled), and an example that fails the rule is worse than
  an old one;
* every SUPERVISOR- and LEADER-level row, on any task. Those are deliberate
  admin edits and the narrowest level wins WHOLE, so a unit or leader carrying
  its own example keeps it and never sees these. That is also why this pass
  cannot silently change what such a leader is judged against.

**Nothing about it is guessed at write time.** The bytes are committed beside
this module, already re-encoded to the ≤1280px JPEG the upload endpoint would
have produced, so what lands in the DB is byte-for-byte what the admin modal
would have stored — and what Gemini receives, since that is the same size
`services/gemini` shrinks to.

**What it removes is RECOVERABLE and is named in the log**: every deleted row's
id and task is printed and DMed, and the bytes themselves are in the operator's
own «checklist-setup» export of 17 Sep. Nothing else is deleted anywhere.

Delete this module, `startup.write_leader_task_examples`, the call in BOTH
entrypoints and `app/data/task_examples/` once the pass has landed — a call left
behind imports a deleted module at boot, and a failed boot rolls the deploy back.
"""
from __future__ import annotations

import logging
import os

from sqlalchemy.orm import Session

from app.models import LeaderTaskExample

log = logging.getLogger(__name__)

# Where the committed photos live, beside the app rather than in /tmp: a boot
# job cannot depend on anything the deploy did not carry.
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                        "data", "task_examples")

# task_id → the files that become its GLOBAL examples, in the order they should
# be shown. Task 3's three photos are ONE example and must travel together: its
# criteria judges the SET (three different processes), so a single photo there
# would state a rule the reader cannot satisfy.
#
# The cap is `_EXAMPLES_PER_TASK` (3) per (task, level) and every entry here is
# within it — asserted by `check()` rather than trusted.
EXAMPLES: dict[int, tuple[str, ...]] = {
    2:  ("t02_kaskad_doira.jpg",),
    3:  ("t03_uchta_jarayon_toza_yeng_yopiq_1.jpg",
         "t03_uchta_jarayon_toza_yeng_yopiq_2.jpg",
         "t03_uchta_jarayon_toza_yeng_yopiq_3.jpg"),
    4:  ("t04_tasker_obxod_royxati.jpg",),
    5:  ("t05_xodim_hujjat_yacheyka.jpg",),
    6:  ("t06_vagonetka.jpg", "t06_kelgan_mahsulot.jpg"),
    10: ("t10_sap_DEBL_royxat_toliq.jpg",),
    11: ("t11_excel_kod_sana_rang.jpg",),
    12: ("t12_ikki_kishi_birga_organmoqda.jpg",),
    13: ("t13_smena2_jadval_15_09_monoblok_16_09.jpg",),
}

# The same number the upload endpoint enforces. Duplicated as a NUMBER and not
# imported, because importing it would make this one-shot depend on a router.
PER_TASK_CAP = 3


def check() -> list[str]:
    """Everything that would make the pass wrong, found BEFORE it writes.

    A missing file or an over-cap task is a mistake in this module, not in the
    data, and it must surface as a refusal rather than as a task left with no
    example at all — which is what a half-applied pass would produce, since the
    delete comes first.
    """
    problems = []
    for task_id, files in EXAMPLES.items():
        if len(files) > PER_TASK_CAP:
            problems.append(f"task {task_id}: {len(files)} photos, cap is {PER_TASK_CAP}")
        for name in files:
            path = os.path.join(DATA_DIR, name)
            if not os.path.exists(path):
                problems.append(f"task {task_id}: missing {name}")
            elif os.path.getsize(path) == 0:
                problems.append(f"task {task_id}: empty {name}")
    return problems


def apply(db: Session) -> dict:
    """Replace the global examples of every task in `EXAMPLES`.

    One transaction: the delete and the insert of a task must not be separable,
    or a failure between them leaves that task with no example at all — the one
    state worse than a stale one. Returns what happened, for the DM.
    """
    problems = check()
    if problems:
        raise RuntimeError("; ".join(problems))

    removed: list[dict] = []
    added: list[dict] = []
    for task_id, files in sorted(EXAMPLES.items()):
        old = (db.query(LeaderTaskExample)
               .filter(LeaderTaskExample.task_id == task_id,
                       # BOTH must be NULL: `manager_id IS NULL` alone would
                       # sweep up every LEADER-level row of the task, which are
                       # somebody's deliberate edits and are none of this
                       # pass's business.
                       LeaderTaskExample.manager_id.is_(None),
                       LeaderTaskExample.leader_id.is_(None))
               .all())
        for row in old:
            removed.append({"task": task_id, "id": row.id,
                            "bytes": len(row.data or b"")})
            db.delete(row)
        db.flush()
        for name in files:
            with open(os.path.join(DATA_DIR, name), "rb") as fh:
                blob = fh.read()
            row = LeaderTaskExample(task_id=task_id, manager_id=None,
                                    leader_id=None, mime="image/jpeg", data=blob)
            db.add(row)
            db.flush()
            added.append({"task": task_id, "id": row.id, "file": name,
                          "bytes": len(blob)})
    db.commit()

    # What was left standing, so the DM can say whom this did NOT reach.
    kept = (db.query(LeaderTaskExample.task_id, LeaderTaskExample.manager_id,
                     LeaderTaskExample.leader_id)
            .filter(~LeaderTaskExample.task_id.in_(list(EXAMPLES)))
            .all())
    scoped = (db.query(LeaderTaskExample.task_id)
              .filter(LeaderTaskExample.task_id.in_(list(EXAMPLES)),
                      (LeaderTaskExample.manager_id.isnot(None) |
                       LeaderTaskExample.leader_id.isnot(None)))
              .all())
    return {"removed": removed, "added": added,
            "untouched_tasks": sorted({t for t, _, _ in kept}),
            "scoped_rows_left": len(scoped)}
