"""Which catalog lines a CELL owns — THE rule (2026-10-26, «the catalog follows
its cells»; docs/plan-catalog-follows-cells.md §1.3–§1.4).

The operator's ruling: cells own the catalog — when a cell changes brigadir its
positions go with it. A line names no cell, so ownership is read off the very
rule that already hands a line's minutes to cells, `wc_group.share`: a line
whose minutes would go WHOLLY to one cell is that cell's, a line whose minutes
would be split between cells is SHARED and can follow none of them alone, and
everything else belongs to other cells. Spelled here once, for the follow
(`services/catalog_follow`), the door refusal (`services/catalog_refusal`) and
the retroactive one-shot — three readers of one rule, or a move refused on the
form would be followed differently at landing.

Every code comparison goes through `cell_lookup.norm_code` — the normal form
cells, work centres and pins meet on everywhere else (`wc_group.wc_key`), never
`cell_register.norm_code`, which keeps an inner space and the case and would
call «A 2894», «a2894» and «A2894» three work centres.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date
from typing import Iterable, Mapping, Optional

from sqlalchemy.orm import Session

from app.services.cell_lookup import norm_code
from app.services.pp_calc import _field, _line_base, daily_key


@dataclass(frozen=True)
class Handed:
    """One catalog content's lines at a code, split three ways for ONE cell:
    `mine` — the cell's alone, `shared` — the cell's and somebody else's at
    once, `others` — not the cell's at all. Each line is in exactly one list,
    as the caller passed it (an ORM row, a frozen namespace or a dict)."""
    mine: list
    shared: list
    others: list


def _letter(v) -> Optional[str]:
    return v or None


def handed(lines, letters: Mapping[int, Optional[str]], cell_id: int) -> Handed:
    """Split `lines` (one unit's lines at one code) for `cell_id`, given
    `letters` = {cell id: its letter} of every cell that stands at the code —
    the staying cells and the cell asked about (§1.4's `A`).

    `wc_group.share`'s claim rule, line by line: a letter some cell in `A`
    carries is CLAIMED and goes to the cells carrying it; anything else (no
    letter, or an orphan letter nobody carries) is unclaimed and goes evenly to
    every cell. So a line is

    * mine — its letter is carried by this cell and nobody else, or it is
      unclaimed and this is the only cell;
    * shared — its letter is carried by this cell and another too (a register
      break), or it is unclaimed and two or more cells stand there;
    * others — every other case, a cell not in `A` included.

    Pure: no read, no write. A blank letter is no letter, on the lines and on
    the cells alike."""
    lets = {cid: _letter(g) for cid, g in letters.items()}
    count = Counter(g for g in lets.values() if g)
    here = cell_id in lets
    own = lets.get(cell_id)
    mine, shared, others = [], [], []
    for p in lines:
        g = _letter(_field(p, "wc_group"))
        if g is not None and g in count:              # claimed by a letter
            if here and own == g:
                (mine if count[g] == 1 else shared).append(p)
            else:
                others.append(p)
        elif here and len(lets) == 1:                 # unclaimed, one cell
            mine.append(p)
        elif here:                                    # unclaimed, split between cells
            shared.append(p)
        else:
            others.append(p)
    return Handed(mine=mine, shared=shared, others=others)


def join_ident(p) -> tuple[str, str, str]:
    """(quantity key, normalised work centre, content) — two lines with one
    answer are the SAME position to every stored quantity, so a moved line
    meeting its twin in the new unit is joined rather than counted twice
    (ruling 5). `pp_calc.line_ident` with the work centre normalised: a twin
    spelled «a2894» in one unit and «A2894» in the other is still the twin."""
    return (daily_key(_field(p, "sap_code"), _field(p, "name")),
            norm_code(_field(p, "work_center")), _line_base(p))


def lines_at(lines, code: str) -> list:
    """The lines whose work centre IS `code`, compared normalised. A blank code
    names no work centre and answers no line — never every line whose Команда
    was left blank, which a code-less cell would otherwise «own»."""
    c = norm_code(code)
    if not c:
        return []
    return [p for p in lines if norm_code(_field(p, "work_center")) == c]


def cells_standing(db: Session, unit_id: int, code: str, d_before: date, d_on: date,
                   *, exclude: Iterable[int] = ()) -> dict[int, Optional[str]]:
    """{cell id: its letter on `d_before`} of every cell that stands in the unit
    at `code` on BOTH days and exists on `d_on` — the cells a move leaves
    behind (§1.3 «stayers», with `d_before` = h−1 and `d_on` = h), minus
    `exclude` (the cells moving in the same group).

    Read DATED, never off the current columns: a cell that has moved away since
    still stood here on those days, and one that arrived on `d_on` did not
    stand here the day before. The unit comes from `cell_links.map_on` over
    every cell that was or will be in the unit from `d_before` on; the letter
    from `cell_links.letter_on` (a letter a later move took away answers for
    the days before it); existence from `cell_archive.alive`. The code is the
    cell's current SAP code — codes are not dated. Ordered by Verifix code.

    The cell ROWS come through `db`; the link events, letter history and
    archive spans through those modules' caches, which read COMMITTED rows
    (their own session) — an event this transaction has not committed, or one
    another copy committed under `cell_links.TTL_S` ago, is not seen. A caller
    that has just written one calls `cell_links.forget()` after its commit."""
    from app.services import cell_archive, cell_links

    want = norm_code(code)
    unit = int(unit_id)
    skip = {int(c) for c in exclude}
    cells = [c for c in cell_links.cells_of_units(db, [unit], since=d_before)
             if c.id not in skip and want and norm_code(c.sap_code) == want]
    before = cell_links.map_on(cells, "manager_id", d_before)
    on = cell_links.map_on(cells, "manager_id", d_on)
    return {c.id: cell_links.letter_on(c, d_before)
            for c in sorted(cells, key=lambda c: (c.verifix_code or "", c.id))
            if before.get(c.id) == unit and on.get(c.id) == unit
            and cell_archive.alive(c, d_on)}
