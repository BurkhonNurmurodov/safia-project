"""What has MOVED between units' catalogs — the readers of `pp_catalog_moves`
(2026-10-26, «the catalog follows its cells»; docs/plan-catalog-follows-cells.md).

When a cell changes brigadir `services/catalog_follow` writes its positions
into the new unit's catalog and records the transfer (models.PPCatalogMove).
Two writers that rebuild a catalog's day from OUTSIDE the platform must then
know what left and what arrived, or they undo the move:

* the SAP upload (`production._ingest_for_manager`) hands each unit the фаза
  rows of its own work centres — the old unit must not be handed the plan of a
  position that now belongs to another unit (`moved_out_pairs`);
* the ABC import (`production.import_catalog`) re-creates a unit's catalog from
  a sheet — the old unit's sheet must not bring a moved position back
  (`moved_out`, `moved_out_codes`), and the new unit's sheet, which may not
  have caught up yet, must not delete one that arrived (`moved_in_ids`).

Only rows with state `moved` count — `nothing` / `named` / `dry` moved no line,
and `failed` / `busy` rows are not final. A move counts on a day from its own
move day (`home_from`) and only while the cell is not back: a cell that has
since returned to the old unit (read dated, `cell_links.value_on`) brings its
own positions back with it, so its old record no longer says «gone». A cell
whose row was deleted stands in no unit.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Cell, PPCatalogMove
from app.services.pp_calc import LOCAL_PREFIX

MOVED = "moved"


def _unit_of(cells: dict, cell_id: int, day: date) -> Optional[int]:
    from app.services import cell_links
    c = cells.get(cell_id)
    return None if c is None else cell_links.value_on(c, "manager_id", day)


def _rows(db: Session, *, day: date, from_unit: Optional[int] = None,
          to_unit: Optional[int] = None, whole: bool = False) -> list:
    """The `moved` rows from (or to) the unit that count by `day`, oldest
    first, with the cells they name — one read each."""
    q = db.query(PPCatalogMove).filter(PPCatalogMove.state == MOVED,
                                       PPCatalogMove.home_from <= day)
    if from_unit is not None:
        q = q.filter(PPCatalogMove.from_unit == int(from_unit))
    if to_unit is not None:
        q = q.filter(PPCatalogMove.to_unit == int(to_unit))
    if whole:
        q = q.filter(PPCatalogMove.whole_code.is_(True))
    rows = q.order_by(PPCatalogMove.home_from, PPCatalogMove.id).all()
    ids = {r.cell_id for r in rows}
    cells = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(ids)).all()} if ids else {}
    return [(r, cells) for r in rows]


def _gone(db: Session, unit_id: int, day: date, *, whole: bool = False) -> list:
    """The `moved` rows out of the unit whose cell does NOT stand in it on `day`."""
    unit = int(unit_id)
    return [r for r, cells in _rows(db, day=day, from_unit=unit, whole=whole)
            if _unit_of(cells, r.cell_id, day) != unit]


def _ids(r) -> set[int]:
    """Every PPProduct id one record moved — the union over the spans it
    rewrote and the lines it listed."""
    out = {int(i) for i in (r.line_ids or []) if i is not None}
    out.update(int(e["id"]) for e in (r.lines or []) if e.get("id") is not None)
    return out


def _order(r) -> tuple:
    return (r.home_from, r.id)


def moved_out(db: Session, unit_id: int, day: date) -> list[dict]:
    """Every catalog line that has left the unit by `day` and not come back:
    the move record's `lines` entries ({id, qty_key, wc, wc_n, base,
    group_from, group_to, active_after, joined_into, takes_sap}), each with the
    transfer's `cell_id`, `whole_code`, `code`, `to_unit` and `home_from`
    added (the import names where a skipped row went).

    One entry per line, and only a line still away. A cell that went away,
    came back and went away again leaves two records naming the same ids: one
    position that left is one position (the import drops one sheet row per
    entry), so the LATEST departure's entry stands for it. A line a later
    record brought back INTO the unit — with its cell, or with another one —
    is back, even when its cell has since left again without it (the line had
    become shared, or somebody else's)."""
    unit = int(unit_id)
    back: dict[int, tuple] = {}                         # id → latest arrival into the unit
    for r, _cells in _rows(db, day=day, to_unit=unit):
        for i in _ids(r):
            back[i] = max(back.get(i, (date.min, -1)), _order(r))
    by_id: dict = {}
    loose: list[dict] = []
    for r in _gone(db, unit, day):                      # oldest first
        for e in r.lines or []:
            ent = {**e, "cell_id": r.cell_id, "whole_code": bool(r.whole_code),
                   "code": r.code, "to_unit": r.to_unit, "home_from": r.home_from}
            if e.get("id") is None:
                loose.append(ent)
                continue
            i = int(e["id"])
            if back.get(i, (date.min, -1)) > _order(r):
                by_id.pop(i, None)                      # came back after this departure
                continue
            by_id.pop(i, None)                          # re-inserted in its latest place
            by_id[i] = ent
    return [*by_id.values(), *loose]


def moved_out_codes(db: Session, unit_id: int, day: date) -> set[str]:
    """The (normalised) codes that left the unit WHOLE by `day` — no cell of
    the unit stayed at them when the move was made, so its work-centre row went
    too — while the moved cell is still away. A cell's LATEST departure from
    the unit decides: one that left whole, came back and left again with cells
    still standing there did not take the code the second time."""
    latest: dict[int, object] = {}
    for r in _gone(db, unit_id, day):                   # oldest first
        latest[r.cell_id] = r
    return {r.code for r in latest.values() if r.whole_code}


def moved_in_ids(db: Session, unit_id: int, day: date) -> set[int]:
    """PPProduct ids that came INTO the unit by `day` with a cell that stands in
    it on `day` — every id the move changed (`line_ids`, the union over the
    spans it rewrote) and every line it recorded."""
    unit = int(unit_id)
    out: set[int] = set()
    for r, cells in _rows(db, day=day, to_unit=unit):
        if _unit_of(cells, r.cell_id, day) != unit:
            continue
        out.update(_ids(r))
    return out


def moved_out_pairs(db: Session, unit_id: int, day: date) -> set[tuple[str, str]]:
    """(SAP code, work centre as stored) of every line `moved_out` — the фаза
    pairs the old unit must no longer be handed. A code-less line (its quantity
    key is the `~name` token) is never in the file and is left out."""
    return {(e["qty_key"], e.get("wc") or "")
            for e in moved_out(db, unit_id, day)
            if e.get("qty_key") and not str(e["qty_key"]).startswith(LOCAL_PREFIX)}
