"""One-process cells (`cells.one_process`) — THE rule behind task 3's «3
different processes» (2026-10-10, the operator's rulings, asked one by one).

A cell either works through several processes (kneading, shaping, packing…) —
«Ko'p jarayon», the default — or is specialised for ONE («Bitta jarayon»:
crêpes, cream-coating, sponge slicing, boxing…). Task 3 asks for photos of 3
DIFFERENT processes, which a leader whose cells only ever do one process cannot
give. For them the AI reviewer is handed `CRITERIA` instead: still 3 separate
photos, the clean-table and sleeve rules unchanged, but all three may show the
same process. It is the 26 Sep text (services/leader_rules_sep26), blind-tested
on the 19–20 Sep photos, which judged the five leaders the operator named by a
LEADER-level row until this flag replaced the names.

WHO it applies to — `applies`, and nothing else may re-spell it:

* a PER-CELL checklist day (`leader_task_days.cell_id`, services/leader_cells)
  is judged by ITS OWN cell — that checklist is about that cell alone;
* every other day (a whole-leader day, a Google-Form row) by the leader's
  cells — `cells.leader_id`, the «Boshqaruvchi» who files the checklist — that
  exist on that day (`cell_archive`): ALL of them one-process, and at least
  one. A leader with no cell, or with one multi-process cell among several,
  keeps the 3-process rule.

WHAT it changes — the AI text of task 3, and nothing else:

* the chain becomes: the leader's OWN text → `CRITERIA` → the unit's → the
  global one. A text an admin writes for one leader still wins; a unit's own
  task-3 text does not reach a one-process leader (the operator's pick: the
  tested text over an untested combination).
* the photo count, windows, the date rule, the weight and the leader's Uzbek
  instruction (`description` — the operator: «leave it unchanged») do not move.
* it is read when a proof is REVIEWED and stored nowhere: ticking a cell moves
  the next verdicts only, nothing already judged is re-judged (the platform's
  rule for every criteria change); «Qayta tekshirish» re-reads a past day.

Readers: `leader_ai.criteria_for` (the reviewer), `leader_tasks
.effective_leader_config` («Vazifalar», the camera page), and the admin config
payload (`leader_ids` → the «Chek-list sozlamalari» sheet and «Istisnolar»).
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Cell, LeaderTaskDay, LeaderTaskEntry

#: The one task this rule speaks about.
TASK = 3

#: Task 3 for a leader whose cells perform only one process — the 26 Sep text
#: as amended for the sleeve rule (5 cm), byte for byte what the five named
#: leaders were judged by. Kept HERE because services/leader_rules_sep26 is a
#: temporary one-shot; edit it only with a new blind test behind the change.
CRITERIA = (
    "The proof for this task is a set of photos taken during the day of the process in this leader's cell: the workplace is clean and any worker visible is in standard work clothing. This leader's cell performs only one process, so all the photos may show that same process.\n"
    '\n'
    'PASSES if all of the following hold:\n'
    "- There are at least 3 photos and they are 3 separate photos of the production work, not the same shot sent twice. They may all show the same process, the same product and the same station. The process may be in the leader's own cell or in a neighbouring one.\n"
    '- In every photo the workplace is clean: nothing unrelated to the work on the table (phone, personal belongings, tea or water cup, bottle, towel, rag, loose paper), and no waste on the table or the floor. Things the process itself needs — flour, dough, product, trays, tools — do not count as clutter.\n'
    '- Every worker visible in a photo is in work clothing (uniform).\n'
    '- No visible worker has bare forearms: sleeves are down, or, if rolled up, the forearm is fully covered by an inner sleeve or an arm cover.\n'
    '\n'
    'FAILS if:\n'
    '- There are fewer than 3 photos, or the same shot is sent twice to make up the 3.\n'
    '- In at least one photo there is clutter or waste on the table, or waste on the floor.\n'
    '- At least one visible worker is without work clothing or has bare forearms.\n'
    '\n'
    'IMPORTANT:\n'
    "- This leader's cell performs only one process (for example making pancakes (crepes), cream-coating cakes, packing into boxes, slicing sponge, or boxing). Do not fail the proof because the photos show the same process, the same product or the same station.\n"
    '- Two photos are the same shot only when they show exactly the same picture. Photos of the same work taken at different moments are separate photos, even if they look alike.\n'
    '- A cleaning cloth, rag or towel lying on the work table is clutter, even if it is used to wipe the table or the scale. It is not a tool of the process. A cloth is soft, matte fabric with a woven or towel-like surface. It counts even when only part of it is in the photo — for example cut off by the bottom edge of the photo or partly hidden under the date and time stamp — so look along the edges of every photo too. A cloth hanging down over the side of the table, below the table top, is not on the table and is not judged.\n'
    '- Supplies for the work and their packaging are not clutter: piping bags and plastic film, also used or crumpled ones lying by the worker; gloves; and a bag, box, crate or container that holds product, ingredients or supplies, also when it is open or crumpled. Thin, shiny, partly see-through plastic is not a cloth. A recipe, technology card or work sheet used for this work is not loose paper either. Loose paper means scrap paper, or papers that have nothing to do with the work.\n'
    "- A bare forearm is more than 5 cm of bare skin above the wrist, because the sleeve is rolled up, pushed up or too short and no inner sleeve or arm cover covers that skin. 5 cm is about the width of three fingers held together, or a little more than half the width of the worker's hand across the palm — compare with the worker's own hand in the photo. Bare hands, gloved hands and a sleeve that reaches down to the wrist are NOT bare forearms. A hand and wrist seen without their sleeve, because the sleeve is outside the frame, are not a bare forearm either.\n"
    '- A little bare wrist is NOT a bare forearm and never fails a photo: a sleeve that ends at the wrist or up to 5 cm above it is a sleeve that is down — also when the cuff has slid up because the worker is reaching forward or lifting something. Only a sleeve rolled or pushed up further, so that more than 5 cm of the forearm is bare, fails — also when the hand wears a glove: a glove covers only the hand, not the forearm.\n'
    '- Fail a photo for a bare forearm only when you can clearly see where that sleeve ends and that more than 5 cm of the forearm above the wrist is bare. If the arm is too small, blurred, turned away or partly hidden to tell, do not fail the photo for it.\n'
    '- Check the arms of every worker in every photo, also workers in the background and at the edges of the photo.\n'
    '- A photo may show no worker at all — that is not a fault: such a photo is judged only on the process and the cleanliness of the workplace.\n'
    '- For a worker only partly in frame, judge only the visible part.\n'
    '- If there are more than 3 photos, the cleanliness and clothing rules apply to all of them.\n'
    '\n'
    'NOT JUDGED: the time between photos; who the workers are; the apron, head covering and gloves; which cell a process belongs to; whether the photos show different processes.'
)


def _day(day) -> str | None:
    return str(day)[:10] if day else None


def cell_applies(db: Session, cell_id: int | None) -> bool:
    """Is this one cell specialised for one process?"""
    if not cell_id:
        return False
    return bool(db.query(Cell.one_process).filter(Cell.id == int(cell_id)).scalar())


def leader_applies(db: Session, leader_id: int | None, day=None) -> bool:
    """Are ALL the cells this leader runs on `day` (today when omitted)
    one-process — and is there at least one?"""
    if not leader_id:
        return False
    from app.services import cell_archive
    flags = [bool(f) for (f,) in db.query(Cell.one_process).filter(
        Cell.leader_id == int(leader_id),
        cell_archive.alive_clause(_day(day))).all()]
    return bool(flags) and all(flags)


def applies(db: Session, *, task_id: int, leader_id: int | None,
            day=None, cell_id: int | None = None) -> bool:
    """THE test: is this leader's task-`task_id` proof on `day` judged by
    `CRITERIA`? `cell_id` names a per-cell checklist's own cell, which then
    decides alone."""
    if task_id != TASK or not leader_id:
        return False
    if cell_id:
        return cell_applies(db, cell_id)
    return leader_applies(db, leader_id, day)


def day_cell(db: Session, ref: str | None) -> int | None:
    """The cell of the checklist day behind an AI review ref: a per-cell day's
    `cell_id`, None for a whole-leader day or a Google-Form row (`sheet:`)."""
    if not ref or not ref.startswith("bot:") or not ref[4:].isdigit():
        return None
    return (db.query(LeaderTaskDay.cell_id)
            .join(LeaderTaskEntry, LeaderTaskEntry.day_id == LeaderTaskDay.id)
            .filter(LeaderTaskEntry.id == int(ref[4:]))
            .scalar())


def leader_ids(db: Session, day=None) -> set[int]:
    """Every leader whose cells on `day` (today when omitted) are ALL
    one-process — `leader_applies` for the whole platform in one query, for the
    admin sheet."""
    from app.services import cell_archive
    rows = (db.query(Cell.leader_id, func.bool_and(Cell.one_process))
            .filter(Cell.leader_id.isnot(None), cell_archive.alive_clause(_day(day)))
            .group_by(Cell.leader_id).all())
    return {int(lid) for lid, ok in rows if ok}
