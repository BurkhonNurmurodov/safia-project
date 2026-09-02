"""ONE checklist per CELL — THE definition of who files what, and when.

From **2026-09-02** (the operator's directive) a supervisor unit can be switched
so that its leaders stop filing ONE checklist a day and start filing a COMPLETE
separate checklist **for each cell they own** — its own day row, its own score,
its own report page and its own DM. This module is the only place that answers
the two questions that follow from that, because the bot menu, the register, the
day sweeps, the roster, the admin panel and the boot self-check all ask them and
three spellings would give one leader three different checklists:

* **is this unit filing per cell on this day** (`per_cell`, off `cell_from`), and
* **which cells does this leader file for** (`filing_cells`).

`expected_days` is the two of them together, and it is what every caller should
reach for: it returns the list of `cell_id`s a leader owes a checklist for on a
date — `[None]` for a single cell-less day, which is exactly what the platform
did before this existed.

Three rules hold it together.

**The switch is a DATE, never a boolean.** `LeaderUnitSetting.cell_from` is the
day a unit's leaders start filing per cell, and days before it are read exactly
as they always were — their rows carry `cell_id NULL` and nothing about them
moves. That is the whole of how "old results never change" is enforced: not by a
migration that leaves history alone, but by a comparison every reader makes. It
also makes the rollback free — clear the floor and the next day is cell-less
again, with the per-cell days already filed still readable and still scored.

**The floor is compared against the SHIFT's effective date, never the calendar
day.** Shift 2's night belongs to the date its 17:00 boundary opened
(`leader_tasks.effective_date`), so a floor of "today" set at 15:00 makes
tonight the first per-cell night and tomorrow morning the first per-cell day for
shift 1. Comparing against `date.today()` would start a night shift one day late
— the same class of bug as the two anchors that closed shift-2 tasks before
their windows opened.

**Nobody is switched by default.** `cell_from` is NULL on every unit until an
admin sets one, per the operator's instruction that units are enrolled by hand.
An absent row therefore means "as before", and a unit is only ever per-cell
because somebody said so — the rule `per_task_close` and `bot_from` already
follow, and for the same reason: a level that means "everybody" is one mis-tap
from switching the whole platform mid-shift.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import Cell, LeaderUnitSetting, RoleProfile

logger = logging.getLogger(__name__)


# ── the switch ───────────────────────────────────────────────────────────────

def unit_floor(db: Session, manager_id: int | None) -> str | None:
    """The day this unit started filing per cell, or None if it never has."""
    if not manager_id:
        return None
    row = (db.query(LeaderUnitSetting)
           .filter_by(manager_id=int(manager_id)).first())
    return (row.cell_from or "").strip() or None if row else None


def floors(db: Session) -> dict[int, str]:
    """unit id → its per-cell floor, in ONE query, for bulk readers.

    Only units an admin actually switched are in the map; everybody else falls
    through to "not per cell", i.e. behaves exactly as before.
    """
    return {int(m): (f or "").strip()
            for m, f in db.query(LeaderUnitSetting.manager_id,
                                 LeaderUnitSetting.cell_from).all()
            if (f or "").strip()}


def per_cell(floor: str | None, date: str | None) -> bool:
    """Is this (unit, day) filed per cell?

    `date` must be the SHIFT's effective date — see the module docstring. A
    blank floor or a blank date is False, so every unknown degrades toward the
    behaviour the platform already had.
    """
    f = (floor or "").strip()
    d = str(date or "")[:10]
    return bool(f and d and d >= f)


def is_per_cell(db: Session, manager_id: int | None, date: str | None) -> bool:
    """`per_cell` for one unit, for callers that hold no preloaded map."""
    return per_cell(unit_floor(db, manager_id), date)


# ── the cells ────────────────────────────────────────────────────────────────

def filing_cells(db: Session, prof: RoleProfile) -> list[Cell]:
    """The cells this leader files a checklist for, ordered by verifix code.

    Plain OWNERSHIP — `cells.leader_id` — and deliberately nothing else. The
    operator's ruling (2026-09-02) is that every assigned cell counts
    automatically, so a cell appears here the moment it is assigned on `/cells`
    and disappears the moment it is released, with no second flag to keep in
    step. `in_load` is not consulted: that flag answers whether a cell counts
    toward the production загрузка, which is a different question about a
    different register, and on the current data it is unticked on all 108 cells
    — reading it would switch every leader to filing nothing.

    An EMPTY list is a real answer, not a missing one: a leader with no cell
    files nothing on a switched unit (see `expected_days`).
    """
    if not prof or not getattr(prof, "id", None):
        return []
    return (db.query(Cell)
            .filter(Cell.leader_id == prof.id)
            .order_by(Cell.verifix_code)
            .all())


def cell_ids(db: Session, prof: RoleProfile) -> list[int]:
    return [c.id for c in filing_cells(db, prof)]


# ── the two together ─────────────────────────────────────────────────────────

def expected_days(db: Session, prof: RoleProfile, date: str | None,
                  *, floor: str | None = None,
                  shift_floors: dict[int, str] | None = None) -> list[int | None]:
    """The `cell_id`s this leader owes a checklist for on `date`.

    THE function every caller should use — the bot menu, the roster, the admin
    panel and the self-check all read the same answer, so what a leader is shown
    and what the platform expects of them can never be two different sets.

        not per-cell            -> [None]      one cell-less day, exactly as before
        per-cell, has cells     -> [ids…]      one complete checklist per cell
        per-cell, has NO cells  -> []          files nothing (the operator's ruling)

    `date` is the SHIFT's effective date. Pass `floor` or `shift_floors` to
    avoid a query per leader when walking many.
    """
    if not prof:
        return []
    mid = getattr(prof, "manager_id", None)
    if floor is None:
        floor = (shift_floors or {}).get(int(mid)) if mid and shift_floors is not None \
            else unit_floor(db, mid)
    if not per_cell(floor, date):
        return [None]
    return cell_ids(db, prof)


def owes_nothing(db: Session, prof: RoleProfile, date: str | None,
                 *, floor: str | None = None) -> bool:
    """True when a switched unit's leader owns no cell, so there is nothing for
    them to file. The one state the bot must explain rather than show an empty
    menu for — and the one the boot self-check names by leader."""
    return expected_days(db, prof, date, floor=floor) == []


# ── the boot self-check ──────────────────────────────────────────────────────

def self_check(db: Session) -> list[str]:
    """Report what per-cell filing would do WRONG on the units switched to it.

    This repo has no test suite and a push to `main` is a deploy, so the app
    saying its own configuration is broken at boot is the earliest anybody can
    find out — the pattern `leader_close.self_check` already follows, and for
    the same scar: twice a checklist has closed at an hour nobody intended and
    both times the only signal was a leader losing points.

    What it looks for, on switched units only:

    1. **A leader with no cell**, who therefore files NOTHING (the operator's
       ruling). That is a correct behaviour and a terrible surprise, so it is
       named rather than silently obeyed.
    2. **A cell whose leader nobody set**, which no checklist covers.
    3. **The volume the switch produces**, so a unit that quietly went from six
       submissions a night to twenty-two says so on the deploy that did it.
    4. **A day filed per cell on a unit that is no longer switched**, which
       means a floor was cleared or moved forward over days already filed —
       those rows are still scored and still shown, and an operator who cleared
       the floor to "undo" needs to know they are there.
    """
    from app.models import Cell, LeaderTaskDay, Manager

    out: list[str] = []
    fl = floors(db)
    if not fl:
        return out

    mgrs = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(fl)).all()}
    for mid, floor in sorted(fl.items()):
        mgr = mgrs.get(mid)
        name = mgr.name if mgr else f"unit {mid}"
        leaders = (db.query(RoleProfile)
                   .filter(RoleProfile.role == "leader",
                           RoleProfile.manager_id == mid).all())
        if not leaders:
            out.append(f"«{name}» files per cell from {floor} but has no leaders")
            continue
        total = 0
        for p in leaders:
            n = len(cell_ids(db, p))
            total += n
            if n == 0:
                out.append(f"«{name}» / {p.name}: no cell assigned — files "
                           f"NOTHING from {floor}")
        orphan = (db.query(Cell)
                  .filter(Cell.manager_id == mid, Cell.leader_id.is_(None))
                  .count())
        if orphan:
            out.append(f"«{name}»: {orphan} cell(s) have no leader — nobody "
                       f"files a checklist for them")
        if total:
            out.append(f"«{name}»: {len(leaders)} leader(s) → {total} "
                       f"checklist(s) per shift from {floor}")

    stray = (db.query(LeaderTaskDay)
             .filter(LeaderTaskDay.cell_id.isnot(None),
                     ~LeaderTaskDay.manager_id.in_(list(fl)))
             .count())
    if stray:
        out.append(f"{stray} per-cell day(s) belong to units that are NOT "
                   f"switched — a floor was cleared or moved after they were filed")
    return out
