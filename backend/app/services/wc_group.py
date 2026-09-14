"""A work centre's GROUP — THE definition (2026-09-14, the operator's directive).

**Why this exists.** A SAP work centre is not unique to one cell even inside one
unit: Ibragimova Sayyora's A2894 is named by six cells, Abdukarimov Sanjar's
A2891 by four. `pp_work_center_daily` and `pp_products` were keyed by the work
centre alone, so the typed «Bugungi fakt» and the catalog's trudoyomkost could
only ever be read for the whole line and were SPLIT EVENLY between its cells —
which made every such cell's ojidaniya weight, its ojidaniya COST and its
per-cell загрузка a share rather than a measurement.

A GROUP is one Latin capital letter (A, B, C …) carried by the cell
(`cells.wc_group`), by the catalog line that group produces
(`pp_products.wc_group`) and by the typed pin (`pp_work_center_daily.wc_group`).
Inside ONE unit a (SAP code, group) pair names ONE cell, so the brigadir types
the people per group, a catalog line names the group that makes it, and each
cell reads its own numbers.

The rules, each spelled once, here:

* **`norm_group`** — blank is None; otherwise exactly one letter A–Z. A Cyrillic
  twin typed on the Russian layout («А», «В», «С» …) IS the Latin letter, the
  rule `latin_code` applies to every code. Anything else is refused.
* **The register rule** (`cell_conflicts`, `check_cell`): inside one unit and
  one SAP code there is either exactly ONE cell — lettered or not — or two or
  more cells that are ALL lettered and all DIFFERENT. Per UNIT, never per shift
  (the operator's call): two brigadirs on one shift type their own pins and keep
  their own catalogs, so their cells may reuse a letter.
* **The catalog rule** (`line_conflicts`, `sku_groups`): every line of one unit
  at one work centre with one quantity key (`pp_calc.daily_key` — the SKU, or
  the name of a code-less line) carries the SAME group. The SAP file writes ONE
  quantity per (SKU, work centre), so a SKU split over two groups is a question
  the file cannot answer. Its operation lines always stay together.
* **The split** (`share`): whatever a work centre carries is handed to its
  cells — each cell its own group's value, plus an EVEN share of everything no
  cell's letter CLAIMS (an ungrouped catalog line, a whole-centre pin, a letter
  no cell carries). For a work centre nobody has grouped that is exactly the
  even split the platform applied before groups existed, so nothing moves until
  letters are set — and Σ over the cells is always what the work centre carried.
* **The pin rule** (`share(..., pins=True)`): a whole-centre pin and group pins
  for one (unit, day, work centre) never both answer. The moment any group pin
  exists the whole-centre pin is ignored; the writers delete the other kind, so
  this matters only for a race.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from typing import Any, Iterable, Mapping, Optional, Sequence

from app.services.cell_lookup import norm_code
from app.services.latin_code import _TWINS
from app.services.pp_calc import daily_key

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_ONE = re.compile(r"^[A-Z]$")


class InvalidGroup(ValueError):
    """A group that is not one Latin letter A–Z."""


def _get(obj: Any, key: str, default=None):
    """Read one field off an ORM row or a plain dict alike."""
    if isinstance(obj, Mapping):
        return obj.get(key, default)
    return getattr(obj, key, default)


def norm_group(value) -> Optional[str]:
    """``None`` for blank, else the one Latin capital letter — or `InvalidGroup`.

    Upper-cased BEFORE the twin table, so a lower-case Cyrillic «в» is read as
    the «В» it is typed for and lands on Latin «B»."""
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    s = "".join(_TWINS.get(ch, ch) for ch in s.upper())
    if not _ONE.match(s):
        raise InvalidGroup(f"group must be one Latin letter A-Z, got {value!r}")
    return s


def label(code, group) -> str:
    """«A2894 · A», or the bare code for a cell/line/pin with no group — the one
    plain-text spelling (workbooks, logs, messages)."""
    code = (code or "").strip()
    return f"{code} · {group}" if group else code


def wc_key(manager_id, code) -> tuple[int, str]:
    """(unit, normalised SAP code) — THE key a cell and a work centre meet on.

    Normalised the way the register rule, the one-shot, `uq_cells_wc_group` and
    the Production page compare codes (`cell_lookup.norm_code`: every whitespace
    stripped, upper-cased), so a cell stored as «a2894» and a pin typed under
    «A2894» are one work centre on every reader, never two."""
    return (int(manager_id), norm_code(code))


def cells_by_wc(cells: Iterable) -> dict[tuple[int, str], list]:
    """``{(unit, normalised code): [cells]}`` in the caller's order — THE match of
    cells to their work centre for every per-cell reader. A cell with no unit or
    no SAP code belongs to no work centre and is absent."""
    by: dict[tuple[int, str], list] = defaultdict(list)
    for c in cells:
        mid, code = _get(c, "manager_id"), norm_code(_get(c, "sap_code"))
        if mid is None or not code:
            continue
        by[(int(mid), code)].append(c)
    return dict(by)


def share(cell_groups: Sequence[Optional[str]],
          by_group: Mapping[Optional[str], float],
          *, pins: bool = False) -> list[Optional[float]]:
    """Hand one work centre's value to the cells of ONE unit that name it.

    `cell_groups` — each cell's letter (None for an unlettered one), in the
    caller's cell order; `by_group` — the work centre's value per group key
    (None = the whole-centre / ungrouped part). Returns one entry per cell:

    * a cell whose letter appears in `by_group` gets that value (divided by how
      many cells carry the letter, which the register forbids but must not
      double-count if it ever happens);
    * everything under a key no cell carries — None, or an orphan letter — is
      UNCLAIMED and shared evenly between ALL the cells;
    * an entry is None when the cell has neither: «nothing was typed for this
      cell» is not the same fact as a 0 somebody typed.

    `pins=True` applies the pin rule first: once any lettered key is present
    the None key (a whole-centre pin) is ignored.
    """
    n = len(cell_groups)
    if not n:
        return []
    vals = dict(by_group)
    if pins and any(k is not None for k in vals):
        vals.pop(None, None)
    count = Counter(g for g in cell_groups if g)
    unclaimed_keys = [k for k in vals if k is None or k not in count]
    even = (sum(float(vals[k] or 0.0) for k in unclaimed_keys) / n
            if unclaimed_keys else None)
    out: list[Optional[float]] = []
    for g in cell_groups:
        own = (float(vals[g] or 0.0) / count[g]) if (g and g in vals) else None
        if own is None and even is None:
            out.append(None)
        else:
            out.append((own or 0.0) + (even or 0.0))
    return out


def sku_groups(lines: Iterable) -> dict[tuple[str, str], Optional[str]]:
    """``{(work_centre, qty_key): group}`` over one unit's catalog lines.

    A (work centre, SKU) whose lines disagree — the catalog rule broken, which
    every writer refuses — answers None, i.e. UNCLAIMED: it degrades to the even
    split rather than guessing which of the two groups made it, and the boot
    self-check names it."""
    seen: dict[tuple[str, str], set] = defaultdict(set)
    for p in lines:
        key = (_get(p, "work_center") or "", daily_key(_get(p, "sap_code"), _get(p, "name")))
        seen[key].add(_get(p, "wc_group") or None)
    return {k: (next(iter(v)) if len(v) == 1 else None) for k, v in seen.items()}


def line_conflicts(lines: Iterable) -> list[dict]:
    """Every (work centre, SKU) of ONE unit whose lines carry different groups.

    Lines are compared active or not: an inactive sibling still holds the SKU's
    identity and comes back the day it is re-ticked."""
    seen: dict[tuple[str, str], dict] = {}
    for p in lines:
        wc = _get(p, "work_center") or ""
        key = (wc, daily_key(_get(p, "sap_code"), _get(p, "name")))
        slot = seen.setdefault(key, {"work_center": wc,
                                     "sap_code": (_get(p, "sap_code") or "").strip(),
                                     "name": _get(p, "name") or "",
                                     "groups": set(), "lines": 0})
        slot["groups"].add(_get(p, "wc_group") or None)
        slot["lines"] += 1
    return [{**v, "groups": sorted(g or "" for g in v["groups"])}
            for v in seen.values() if len(v["groups"]) > 1]


def cell_conflicts(cells: Iterable) -> list[dict]:
    """Every (unit, SAP code) whose cells break the register rule: two or more
    cells where one carries no letter, or two carry the same one."""
    out: list[dict] = []
    for (mid, code), cs in sorted(cells_by_wc(cells).items()):
        if len(cs) < 2:
            continue
        unlettered = sorted(_get(c, "verifix_code") or "" for c in cs if not _get(c, "wc_group"))
        seen: dict[str, list] = defaultdict(list)
        for c in cs:
            if _get(c, "wc_group"):
                seen[_get(c, "wc_group")].append(_get(c, "verifix_code") or "")
        dups = {g: sorted(v) for g, v in seen.items() if len(v) > 1}
        if unlettered or dups:
            out.append({"manager_id": mid, "sap_code": code,
                        "cells": sorted(_get(c, "verifix_code") or "" for c in cs),
                        "unlettered": unlettered, "duplicates": dups})
    return out


def check_cell_detail(db, *, cell_id: Optional[int], manager_id: Optional[int],
                      sap_code: Optional[str], group: Optional[str]) -> Optional[dict]:
    """Would the cell `cell_id` (None = a new one) break the register rule if it
    stood at (manager_id, sap_code, group)? None when it would not; otherwise a
    STRUCTURED refusal the form can translate:

        {"code": <kind>, "message": <one English sentence>, "params": {...}}

    kinds — ``wc_group_needs_sap`` · ``wc_group_needs_unit`` ·
    ``wc_group_missing`` (params: code, cells = the siblings already there,
    unlettered = the siblings with no letter) · ``wc_group_duplicate`` (params:
    code, group, cell = the sibling holding it, free = the first free letter or
    None). `message` is the plain-string fallback `utils/api.js` shows when a
    client does not know the kind.

    Only the DESTINATION is checked: the cells a move leaves behind were already
    lettered and distinct (two or more) or are now alone (one), and a lone cell
    may keep its letter."""
    from app.models import Cell  # local: models import nothing from services

    code = norm_code(sap_code)
    if group and not code:
        return {"code": "wc_group_needs_sap", "params": {},
                "message": "A group needs a SAP code on the cell."}
    if group and manager_id is None:
        return {"code": "wc_group_needs_unit", "params": {},
                "message": "A group needs a supervisor unit on the cell."}
    if manager_id is None or not code:
        return None
    siblings = [c for c in db.query(Cell).filter(
        Cell.manager_id == int(manager_id), Cell.sap_code.isnot(None)).all()
        if c.id != cell_id and norm_code(c.sap_code) == code]
    if not siblings:
        return None
    unlettered = sorted(c.verifix_code for c in siblings if not c.wc_group)
    if not group or unlettered:
        who = sorted(c.verifix_code for c in siblings)
        return {"code": "wc_group_missing",
                "params": {"code": code, "cells": who, "unlettered": unlettered},
                "message": (f"Cells {', '.join(who)} already stand at {code} in this unit. Every "
                            f"cell of a shared work centre needs its own group letter (A, B, …) — "
                            + (f"give {', '.join(unlettered)} a letter first, then this cell a different one."
                               if unlettered else "give this cell a letter none of them carries."))}
    taken = next((c for c in siblings if c.wc_group == group), None)
    if taken is not None:
        free = next((l for l in LETTERS if l not in {c.wc_group for c in siblings}), None)
        return {"code": "wc_group_duplicate",
                "params": {"code": code, "group": group, "cell": taken.verifix_code, "free": free},
                "message": (f"Group {group} of {code} is already cell {taken.verifix_code} in this unit"
                            + (f" — use {free}." if free else "."))}
    return None


def check_cell(db, *, cell_id: Optional[int], manager_id: Optional[int],
               sap_code: Optional[str], group: Optional[str]) -> Optional[str]:
    """`check_cell_detail`'s sentence alone — None when the placement is allowed."""
    d = check_cell_detail(db, cell_id=cell_id, manager_id=manager_id,
                          sap_code=sap_code, group=group)
    return d["message"] if d else None


def in_scope(pairs: Optional[set], code, group: Optional[str]) -> bool:
    """May a caller scoped to `pairs` (cell_lookup.sap_groups_for_leader:
    {(normalised code, group|None)}) see this (work centre, group)?

    `pairs=None` is «no scope». A leader sees it when they own an UNLETTERED
    cell at that code (the whole work centre is theirs), or the cell carrying
    `group`, or any cell at that code when `group` is None — an ungrouped line
    or a whole-centre row belongs to every cell of the work centre."""
    if pairs is None:
        return True
    n = norm_code(code)
    if (n, None) in pairs:
        return True
    if not group:
        return any(c == n for c, _g in pairs)
    return (n, group) in pairs


def settle_moved(db, moved_cells: list, manager_id: Optional[int]) -> list[str]:
    """A cascade must never REFUSE, so a moved cell's group letter yields.

    Two writes move a cell into another unit without anybody choosing its letter:
    a leader's unit move dragging their cells (`profiles._set_leader_cells`) and
    the admin «Davomat» «Doimiy qilish» (`attendance_batch.update_cells`). The
    destination may already hold the same letter at the same SAP code. The
    register form refuses that (`check_cell`), but refusing here would block the
    move over a letter, and writing it would raise `uq_cells_wc_group` as a 500.
    So the moved cell loses its letter and is NAMED («7421 A») — the caller puts
    the returned names into the action log as `group_cleared`. An unlettered
    member of a shared code is left alone: the boot self-check reports it.

    `moved_cells` are the cells this write puts INTO `manager_id`. Settled in
    memory: the session runs autoflush=False, so the destination's SELECT sees
    every moved cell's OLD unit and cannot be asked about them."""
    from app.models import Cell  # local: models import nothing from services

    lettered = [c for c in moved_cells if c.wc_group and norm_code(c.sap_code)]
    if not lettered or not manager_id:
        return []
    moved_ids = {c.id for c in moved_cells if c.id is not None}
    taken = {(norm_code(c.sap_code), c.wc_group)
             for c in db.query(Cell).filter(Cell.manager_id == manager_id,
                                            Cell.wc_group.isnot(None),
                                            Cell.sap_code.isnot(None)).all()
             if c.id not in moved_ids and c.manager_id == manager_id}
    cleared: list[str] = []
    for c in sorted(lettered, key=lambda x: (x.verifix_code or "", x.id or 0)):
        key = (norm_code(c.sap_code), c.wc_group)
        if key in taken:
            cleared.append(f"{c.verifix_code} {c.wc_group}")
            c.wc_group = None
        else:
            taken.add(key)
    return cleared
