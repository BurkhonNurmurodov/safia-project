"""May this cell change brigadir? — THE door rule for positions several cells
share (2026-10-26, «the catalog follows its cells»;
docs/plan-catalog-follows-cells.md §1.9).

The operator's ruling 2: while positions several cells of one unit share exist
— a line with no letter, or with a letter no cell carries, at a work centre
other cells of the unit keep — the cell's move is REFUSED on every door,
naming what to letter. A cell's positions follow it to its new brigadir
(`services/catalog_follow`), and a shared line can follow none of the cells
sharing it: left behind, the moving cell would arrive in its new unit without
its share of the minutes; taken along, the cells staying would lose theirs.
Only a person can say which cell makes which line, by lettering it.

`shared_positions` is asked by `cell_register.set_unit` — the one writer every
door goes through (the /cells form, «Doimiy qilish» on the admin «Davomat»
tab, a «Verifix sinxron» tap) — whenever the unit asked for is not the one in
force. A WITHDRAWAL (sending the unit in force) is never refused, and nothing
is refused when the move lands: lines shared after the request stay where
they are and the follow names them.

Ownership is `catalog_ownership.handed`, the rule the follow itself splits
lines by — a move allowed here is a move the follow can carry out whole.

A whole TEAM may leave together: `leaving` names every cell of the same
request (the batch doors, the form's «Birga ko'chirish») and where each goes.
Cells leaving are not «staying», so a work centre whose every cell moves to one
unit takes its shared lines along (Whole(X), §1.3); the same team split
between two units is refused (`kind="split"`).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Mapping, Optional

from sqlalchemy.orm import Session

from app.models import Cell, Manager
from app.services import catalog_ownership, pp_catalog
from app.services.cell_lookup import norm_code
from app.services.cell_register import Refused

SHOWN = 10      # lines named in `params.lines`; `count` is the whole number


def _line(p) -> dict:
    return {"id": p.id, "name": p.name or "", "sap_code": p.sap_code or "",
            "group": p.wc_group or None}


def _names(lines) -> str:
    out = ", ".join(f"«{p.name or p.sap_code or p.id}»" for p in lines[:5])
    return out + (f" +{len(lines) - 5}" if len(lines) > 5 else "")


def _cells_text(staying: list) -> str:
    return ", ".join(f"{s['code']} · {s['letter']}" if s["letter"] else s["code"]
                     for s in staying)


def shared_positions(db: Session, cell, to_unit: Optional[int], *, day: date,
                     leaving: Optional[Mapping[int, Optional[int]]] = None) -> Optional[Refused]:
    """The refusal for moving `cell` to `to_unit` (None = no brigadir) from
    the landing day `day` (`cell_links.opening_for_move`), or None when the
    move may be recorded. `leaving` = {cell id: its destination} of the other
    cells the same request moves; `cell` itself is always among them.

    Read off the unit the cell stands in NOW (its column, X) and that unit's
    CURRENT catalog — the one the follow will hand out from the landing day.
    The cells staying are the ones standing in X at the cell's work centre on
    the day before the landing and on it (`catalog_ownership.cells_standing`),
    minus every cell leaving; their letters, and the cell's own, are the
    columns as THIS save leaves them (a letter typed in the same save counts —
    the form applies the letter before the brigadir). Only ACTIVE lines block:
    an archived position follows nobody's figure.

    Refused (409, `params` below), in this order:

    * `positions_need_unit` — the brigadir is cleared while the cell owns
      positions: a position must stand in some unit's catalog;
    * `shared_positions`, kind `unlettered_cell` — the cell has no letter
      while every cell staying has one, so each unlettered line is shared;
    * `shared_positions`, kind `shared` — cells stay and lines are shared
      between them and the cell (no letter, an orphan letter, or a letter two
      cells carry);
    * `shared_positions`, kind `split` — nobody stays, but the cells leaving
      share lines and go to two or more units.

    `params` = {kind, code (the work centre), cell (the cell's code), cell_id,
    cell_letter, unit, unit_name, to_unit, count, lines (the first ten
    [{id, name, sap_code, group}]), staying [{id, code, letter}], dests
    (destination unit ids, null = no brigadir)}. `message` is a whole English
    sentence — the assistant relays it word for word."""
    x = cell.manager_id
    to = to_unit or None
    if x is None or to == x:
        return None
    code = norm_code(cell.sap_code)
    if not code:
        return None
    lines = catalog_ownership.lines_at(pp_catalog.current(db, x).active_lines, code)
    if not lines:
        return None

    going = {int(k): (v or None) for k, v in (leaving or {}).items()}
    going[cell.id] = to
    standing = catalog_ownership.cells_standing(db, x, code, day - timedelta(days=1), day)
    rows = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(set(standing) | {cell.id})).all()}
    rows[cell.id] = cell
    # A member of the request whose destination IS this unit is not leaving.
    departers = [cell.id] + [cid for cid in standing
                             if cid != cell.id and cid in going and going[cid] != x]
    stay_ids = [cid for cid in standing if cid not in departers]
    letters = {cid: (rows[cid].wc_group or None) for cid in stay_ids + departers}
    own = letters[cell.id]
    handed = catalog_ownership.handed(lines, letters, cell.id)

    staying = [{"id": cid, "code": rows[cid].verifix_code, "letter": letters[cid]}
               for cid in stay_ids]
    dests = sorted({going[cid] for cid in departers}, key=lambda v: (v is None, v or 0))

    def refuse(rcode: str, kind: str, blocking: list, message: str) -> Refused:
        unit_name = db.query(Manager.name).filter(Manager.id == x).scalar()
        return Refused(rcode, message, 409, {
            "kind": kind, "code": code, "cell": cell.verifix_code, "cell_id": cell.id,
            "cell_letter": own, "unit": x, "unit_name": unit_name, "to_unit": to,
            "count": len(blocking), "lines": [_line(p) for p in blocking[:SHOWN]],
            "staying": staying, "dests": dests})

    c = cell.verifix_code
    if to is None and handed.mine:
        return refuse("positions_need_unit", "need_unit", handed.mine,
                      f"Cell {c} cannot be left without a supervisor: it has "
                      f"{len(handed.mine)} position(s) at work centre {code} — "
                      f"{_names(handed.mine)}. Move it to another supervisor or archive "
                      "those positions first.")
    if not handed.shared:
        return None
    if staying:
        if own is None and all(s["letter"] for s in staying):
            return refuse("shared_positions", "unlettered_cell", handed.shared,
                          f"Cell {c} cannot change supervisor: it has no group letter while "
                          f"the other cells at work centre {code} have one "
                          f"({_cells_text(staying)}), so {len(handed.shared)} unlettered "
                          f"position(s) are shared by all of them — {_names(handed.shared)}. "
                          f"Give {c} a letter and put it on the positions {c} makes first.")
        return refuse("shared_positions", "shared", handed.shared,
                      f"Cell {c} cannot change supervisor: {len(handed.shared)} position(s) "
                      f"at work centre {code} are shared with the cells staying "
                      f"({_cells_text(staying)}) — {_names(handed.shared)}. Put on each "
                      "position the letter of the cell that makes it first.")
    if len(dests) >= 2:
        return refuse("shared_positions", "split", handed.shared,
                      f"Cell {c} cannot change supervisor: the cells at work centre {code} "
                      f"are going to different supervisors and {len(handed.shared)} "
                      f"position(s) are shared between them — {_names(handed.shared)}. "
                      "Put on each position the letter of the cell that makes it, or move "
                      "the cells to one supervisor.")
    return None
