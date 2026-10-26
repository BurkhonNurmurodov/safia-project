"""
Resolve the raw cell / work-center code strings that other tables store against
the canonical `cells` registry (models.Cell), so pages can show the platform's
workshop name and owning leader next to (or instead of) a bare code.

Two disjoint code namespaces live in the plant's data:
  * Verifix codes    — 4-digit strings ("0822")  → cells.verifix_code
  * SAP work centers — letter+4-digit ("A1431")   → cells.sap_code
Never cross them: a work center will not match verifix_code and vice-versa.

Matching is whitespace/case-insensitive because cells.sap_code is hand-entered
free text (only .strip()ed) and the quality register mixes zero-padded and bare
spellings of verifix codes ("0111" vs "113"). Any unmatched code resolves to
None and the caller keeps the raw string.

**The two namespaces do not have the same cardinality, and the tables differ
because of it.** A verifix code identifies ONE cell, so `by_verifix` is keyed by
the code. A SAP work centre does not: two shifts stand at one work centre, so
`by_sap` is keyed by (owning unit, code) and every caller names the unit it is
asking about. Within one unit the first row per key still wins (cells ordered by
verifix_code).

sap_code is currently populated only by hand via the admin Cells tab (the bulk
seed fills verifix_code only), so the SAP-side maps are empty until admins fill
those codes — the enrichment is correct plumbing that lights up as data lands.
"""
from __future__ import annotations

import re
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import Cell, Manager, RoleProfile

# UI language code → the Cell column holding that language's workshop name.
_WS_COL = {
    "uz": "name_workshop_uz",
    "uz_cyrl": "name_workshop_uz_cyrl",
    "ru": "name_workshop_ru",
    "en": "name_workshop_en",
}
# Fallback order when the viewer language has no name filled in.
_LANGS = ("ru", "uz", "uz_cyrl", "en")


def _norm(code) -> str:
    """Common normal form for matching: whitespace stripped, upper-cased."""
    return re.sub(r"\s+", "", str(code or "")).upper()


def _leader_names(db: Session) -> dict[int, str]:
    rows = (
        db.query(RoleProfile.id, RoleProfile.name)
        .filter(RoleProfile.role == "leader")
        .all()
    )
    return {r.id: r.name for r in rows}


def _sup_names(db: Session) -> dict[int, str]:
    """{manager id → the brigadir's name}, the twin of :func:`_leader_names`.

    A cell's owning SUPERVISOR is `cells.manager_id` — the one place the plant
    dimension is attached — so this is the only correct source for «whose unit
    is this cell», and it is read the same way the leader name is."""
    return {r.id: r.name for r in db.query(Manager.id, Manager.name).all()}


def _cell_dict(c: Cell, leader: str | None, sup: str | None = None) -> dict:
    """Compact, JSON-ready projection of a cell row for API enrichment. Short
    per-language keys keep it light when embedded in large payloads.

    `leader` and `sup` follow the same convention: the key is always present,
    and None means either «not asked for» or «this cell has none» — a caller
    that did not ask cannot tell them apart, and does not need to."""
    return {
        "id": c.id,
        "verifix_code": c.verifix_code,
        "sap_code": c.sap_code,
        # The cell's group of its work centre (services/wc_group.py), None for
        # a cell that has none — the letter a label prints beside the code.
        "wc_group": getattr(c, "wc_group", None),
        "uz": c.name_workshop_uz,
        "uz_cyrl": c.name_workshop_uz_cyrl,
        "ru": c.name_workshop_ru,
        "en": c.name_workshop_en,
        "leader": leader,
        "sup": sup,
    }


def by_verifix(db: Session, with_leader: bool = False,
               with_sup: bool = False) -> dict[str, dict]:
    """{normalized verifix code → cell dict}. Codes are keyed both zero-padded
    (authoritative) and zero-stripped (alias) so '0822' and '822' both resolve.

    `with_sup` adds the owning brigadir's name the same way `with_leader` adds
    the leader's: one extra query for the whole registry, never one per cell."""
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    leaders = _leader_names(db) if with_leader else {}
    sups = _sup_names(db) if with_sup else {}
    out: dict[str, dict] = {}
    for c in cells:                       # pass 1 — exact, zero-padded keys win
        key = _norm(c.verifix_code)
        if key:
            out.setdefault(key, _cell_dict(c, leaders.get(c.leader_id),
                                           sups.get(c.manager_id)))
    for c in cells:                       # pass 2 — zero-stripped aliases fill gaps
        key = _norm(c.verifix_code)
        alias = key.lstrip("0")
        if key and alias:
            out.setdefault(alias, out[key])
    return out


def by_sap(db: Session, with_leader: bool = False,
           manager_ids: Iterable[int] | None = None,
           day=None) -> dict[tuple[int, str], dict]:
    """``{(manager_id, normalized SAP work-center code) → cell dict}`` over cells
    that carry one.

    **The unit is part of the key, and that is the whole point.** A verifix code
    is unique per cell; a SAP work centre is NOT. Two shifts routinely stand at
    one work centre — B2942 is cell 9411 on Raximova Kamola's shift 1 and 9423
    on Olishev Islom's shift 2 — and four codes are shared across units on the
    platform today. Keyed by the code alone this table answered with whichever
    cell sorted first by verifix code, so a work centre on one brigadir's page
    was named after, and linked to, ANOTHER SHIFT's cell and leader: on
    Raximova's production page B2911 resolved to Yogmirov Feruz's night-shift
    cell 9121. A first-wins map cannot express a code two units both own, so the
    key carries the owner and every caller has to name the unit it is asking
    about — an invariant a call site would otherwise have to remember.

    A cell with no ``manager_id`` belongs to no unit's production and is
    therefore absent: it can never be the answer to "which of THIS brigadir's
    cells is this work centre".

    Within ONE unit the code may still name several cells (10 groups today).
    Keyed by (unit, code) the first by verifix code still wins; from 2026-09-14
    each LETTERED cell is also keyed by (unit, code, group), the key that names
    exactly one cell of a shared work centre (services/wc_group.py) — pass
    `group` to `resolve_sap` to read it.

    `day` leaves out a cell archived before it (`cell_archive`), so a work
    centre is never named after a cell that no longer exists on that day — and
    keys every cell by its unit ON that day, its leader label by its
    «Boshqaruvchi» on that day (`cell_links`, 2026-10-12): a cell moved to
    another brigadir since still answers for its old unit's past days. With no
    cell's link changed after `day` it is the current columns, as before.

    …and its LETTER on that day (`cell_links.letter_on`, 2026-10-26): a cell
    whose letter a move took away (or a sibling's letter a move gave) still
    names its old group on the days before, so a past day's group chip links to
    the cell that carried that letter then. No letter event after `day` = the
    column, as before.
    """
    moved_m: set = set()
    moved_l: set = set()
    if day is not None:
        from app.services import cell_links
        moved_m = cell_links.changed_since("manager_id", day)
        if with_leader:
            moved_l = cell_links.changed_since("leader_id", day)
    has_unit = Cell.manager_id.isnot(None)
    if moved_m:
        from sqlalchemy import or_
        has_unit = or_(has_unit, Cell.id.in_(moved_m))
    q = (
        db.query(Cell)
        .filter(Cell.sap_code.isnot(None), has_unit)
        .order_by(Cell.verifix_code)
    )
    if day is not None:
        from app.services import cell_archive
        q = q.filter(cell_archive.alive_clause(day))
    ids = None
    if manager_ids is not None:
        ids = sorted({int(m) for m in manager_ids})
        if not ids:
            return {}
        in_ids = Cell.manager_id.in_(ids)
        if moved_m:
            from sqlalchemy import or_
            in_ids = or_(in_ids, Cell.id.in_(moved_m))
        q = q.filter(in_ids)
    cells = q.all()
    # Only a cell whose link changed after `day` is resolved; every other cell
    # answers by its column — the fast path's own answer.
    units_on: dict = {}
    if moved_m:
        from app.services import cell_links
        units_on = cell_links.map_on([c for c in cells if c.id in moved_m], "manager_id", day)
        if units_on:
            want = set(ids) if ids is not None else None
            cells = [c for c in cells
                     if (u := units_on.get(c.id, c.manager_id)) is not None
                     and (want is None or int(u) in want)]
    leaders_on: dict = {}
    if moved_l:
        from app.services import cell_links
        leaders_on = cell_links.map_on([c for c in cells if c.id in moved_l], "leader_id", day)
    if day is not None:
        # The letter each cell carried ON `day` — the cells whose letter did not
        # change since come back as themselves.
        from app.services import cell_links
        cells = cell_links.with_letters_on(cells, day)
    leaders = _leader_names(db) if with_leader else {}
    out: dict[tuple[int, str], dict] = {}
    for c in cells:
        key = _norm(c.sap_code)
        if key:
            mid = units_on.get(c.id, c.manager_id)
            lid = leaders_on.get(c.id, c.leader_id)
            d = _cell_dict(c, leaders.get(lid))
            out.setdefault((int(mid), key), d)
            # …and, for a LETTERED cell, under (unit, code, group) as well — the
            # one key that names exactly this cell of a shared work centre
            # (services/wc_group.py). `resolve_sap(..., group=)` reads it.
            if getattr(c, "wc_group", None):
                out.setdefault((int(mid), key, c.wc_group), d)
    return out


def norm_code(code) -> str:
    """The matching normal form (whitespace stripped, upper-cased) — public so
    callers that compare codes THEMSELVES (rather than through a lookup table)
    apply the same rule the tables above are built with."""
    return _norm(code)


def leader_cells_on(db: Session, leader_id: int | None, day) -> list:
    """The cells this leader runs ON `day` — their «Boshqaruvchi» that day
    (`cell_links`, 2026-10-12) — the one selection the three dated leader
    readers below share, so a leader's codes, groups and unit on a past day are
    read off one list. A cell handed to another leader since is still this
    one's on the days before; one handed to them since is not yet. With no
    `leader_id` event after `day` it is exactly `Cell.leader_id == leader_id`."""
    if not leader_id:
        return []
    from app.services import cell_links
    moved = cell_links.changed_since("leader_id", day)
    cond = Cell.leader_id == leader_id
    if moved:
        from sqlalchemy import or_
        cond = or_(cond, Cell.id.in_(moved))
    cells = db.query(Cell).filter(cond).order_by(Cell.verifix_code, Cell.id).all()
    if moved:
        # Only a cell whose leader changed after `day` is resolved; every other
        # cell answers by its column — the fast path's own answer.
        on = cell_links.map_on([c for c in cells if c.id in moved], "leader_id", day)
        cells = [c for c in cells if on.get(c.id, c.leader_id) == leader_id]
    return cells


def leader_cells_in(db: Session, leader_id: int | None, unit: int, day=None) -> list:
    """The cells this leader runs that stand in `unit` — ON `day` when one is
    given (:func:`leader_cells_on`, each in the unit it stood in that day,
    `cell_links`), else by the current columns. The selection a leader's scope
    is cut to when their cells stand in more than one unit
    (:func:`cells_units_for_leader`, 2026-10-26): their page and their checks
    read ONE unit at a time, and in that unit only the cells standing there are
    theirs to read."""
    if not leader_id or unit is None:
        return []
    unit = int(unit)
    if day is not None:
        from app.services import cell_links
        cells = leader_cells_on(db, leader_id, day)
        on = cell_links.map_on(cells, "manager_id", day)
        return [c for c in cells if on.get(c.id) is not None and int(on[c.id]) == unit]
    return (db.query(Cell).filter(Cell.leader_id == leader_id, Cell.manager_id == unit)
            .order_by(Cell.verifix_code, Cell.id).all())


def sap_codes_for_leader(db: Session, leader_id: int, day=None,
                         unit: int | None = None) -> set[str]:
    """Normalised SAP work-center codes of every cell this leader owns.

    THE scope of a leader: they own cells, not a unit, so any page that shows a
    brigadir's production narrows to this set. An EMPTY set is a real answer —
    a leader with no cells (or whose cells have no SAP code filled in yet) owns
    no work centers, which is not the same as "no filter".

    `day` reads the cells the leader ran ON that day (:func:`leader_cells_on`,
    2026-10-26), so a past day of their /production page is scoped to what was
    theirs then. Omitted, the current column — as before.

    `unit` cuts the set to the cells standing in that unit (that day, or now —
    :func:`leader_cells_in`): a leader whose cells stand in two units reads
    each unit's page with that unit's cells only. Omitted, every cell — as
    before.
    """
    if unit is not None:
        return {n for c in leader_cells_in(db, leader_id, unit, day) if (n := _norm(c.sap_code))}
    if day is not None:
        return {n for c in leader_cells_on(db, leader_id, day) if (n := _norm(c.sap_code))}
    rows = (
        db.query(Cell.sap_code)
        .filter(Cell.leader_id == leader_id, Cell.sap_code.isnot(None))
        .all()
    )
    return {n for (code,) in rows if (n := _norm(code))}


def sap_groups_for_leader(db: Session, leader_id: int, day=None,
                          unit: int | None = None) -> set[tuple[str, str | None]]:
    """{(normalised SAP code, group|None)} of every cell this leader owns — the
    group-aware twin of :func:`sap_codes_for_leader`, read through
    `wc_group.in_scope`. A cell with no letter answers (code, None), which
    `in_scope` reads as the whole work centre. Same empty-set rule.

    `day` takes the cells the leader ran that day and each one's letter ON that
    day (`cell_links.letter_on`): a move that re-lettered a cell — or gave its
    lone sibling a letter — counts from the move, so a day before it is still
    the old group's. `unit` cuts to the cells standing in that unit, as
    :func:`sap_codes_for_leader` does."""
    if unit is not None:
        cells = leader_cells_in(db, leader_id, unit, day)
        if day is None:
            return {(n, c.wc_group or None) for c in cells if (n := _norm(c.sap_code))}
        from app.services import cell_links
        return {(n, cell_links.letter_on(c, day) or None)
                for c in cells if (n := _norm(c.sap_code))}
    if day is not None:
        from app.services import cell_links
        return {(n, cell_links.letter_on(c, day) or None)
                for c in leader_cells_on(db, leader_id, day) if (n := _norm(c.sap_code))}
    rows = (
        db.query(Cell.sap_code, Cell.wc_group)
        .filter(Cell.leader_id == leader_id, Cell.sap_code.isnot(None))
        .all()
    )
    return {(n, g or None) for (code, g) in rows if (n := _norm(code))}


def cells_unit_for_leader(db: Session, leader_id: int | None, day=None) -> int | None:
    """The ONE unit a leader's cells stand in — None when they own no cell, or
    own cells in more than one unit.

    Normally that is the leader's own unit: moving a leader drags their cells.
    The exception is a leader COUNTED under one brigadir while their cell's
    загрузка is kept in a unit of its own — Turdimurodov Nodirjon from
    2026-09-26: Aripova Manzura's leader, his cell 0811 in the unit made to
    measure its load. A leader's PRODUCTION readers — their /production page and
    the automatic checks #1 and #9 — read this unit, because the cell's catalog,
    plan and typed people are stored there and nowhere else; read in the
    leader's own unit they find nothing and fail every day. The Verifix sync
    leaves such a cell where it is (`verifix_sync.KEPT_APART`) — a move to
    Verifix's brigadir applied on 13 Oct 2026 emptied his page for a day.

    `day` answers for that day (2026-10-26): the cells the leader ran then, each
    in the unit it stood in then (`cell_links`). A cell moved to another
    brigadir since takes its positions with it from its move day
    (`catalog_follow`), so a day before the move is still read in the OLD unit —
    where that day's catalog and plan still carry the cell's lines.

    A leader whose cells stand in SEVERAL units is answered by
    :func:`cells_units_for_leader`; this one still says None for them."""
    units = cells_units_for_leader(db, leader_id, day)
    return units[0] if len(units) == 1 else None


def cells_units_for_leader(db: Session, leader_id: int | None, day=None) -> list[int]:
    """EVERY unit a leader's cells stand in — ON `day` when one is given (the
    cells they ran then, :func:`leader_cells_on`, each in the unit it stood in
    then), else by the current columns — the unit holding most of their cells
    first, ties by unit id. Empty for a leader with no cell in any unit.

    Why a list (2026-10-26): a cell's positions follow it to its new brigadir
    (`catalog_follow`), so a leader whose cells went two ways — one moved, one
    stayed — has a catalog in BOTH units from the move day. Read in either one
    alone they lose the other cell's plan, and read in their own profile unit
    (what :func:`cells_unit_for_leader`'s None sent them to) the moved cell's
    plan is nowhere. Their /production page opens on the first of these units
    and switches between them (`routers.production._resolve_manager_id`); the
    automatic checks #1, #9 and #11 read every one of them
    (`leader_auto._Ctx.by_unit`). With one unit this is
    ``[cells_unit_for_leader(...)]``, by construction."""
    if not leader_id:
        return []
    from collections import Counter
    if day is not None:
        from app.services import cell_links
        cells = leader_cells_on(db, leader_id, day)
        on = cell_links.map_on(cells, "manager_id", day)
        counts = Counter(int(u) for c in cells if (u := on.get(c.id)) is not None)
    else:
        from sqlalchemy import func
        counts = Counter({int(m): int(n) for (m, n) in
                          db.query(Cell.manager_id, func.count(Cell.id))
                          .filter(Cell.leader_id == leader_id, Cell.manager_id.isnot(None))
                          .group_by(Cell.manager_id).all()})
    return [u for u, _n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))]


def resolve_verifix(table: dict[str, dict], code) -> dict | None:
    """Look a verifix-family code up in a by_verifix() table (raw then zero-stripped)."""
    n = _norm(code)
    if not n:
        return None
    return table.get(n) or table.get(n.lstrip("0"))


def resolve_sap(table: dict[tuple, dict], code,
                manager_id, group: str | None = None) -> dict | None:
    """Look a SAP work-center code up in a by_sap() table, INSIDE one unit.

    ``manager_id`` is required because the code alone does not identify a cell —
    see :func:`by_sap`. A unit that does not own the code answers None and the
    caller keeps the raw string, which is what an unmatched code has always
    done.
    """
    n = _norm(code)
    if not n or manager_id is None:
        return None
    if group:
        # A GROUP names one cell, or none: an orphan letter must not borrow the
        # first cell of the work centre, which is somebody else's.
        return table.get((int(manager_id), n, group))
    return table.get((int(manager_id), n))


def workshop_name(cell: dict | None, lang: str = "ru") -> str | None:
    """Pick the workshop name for the viewer language, falling back across the
    other languages — RUSSIAN FIRST — so a partially-filled cell still shows
    something. Every language column is nullable and Russian is the one the
    plant actually fills in, so it is the fallback the UI promises.

    NOT A LABEL. A cell is identified by its verifix CODE everywhere it is
    shown (frontend `utils/cellName.js`), and the second fact beside a code is
    the LEADER's name, never the workshop. This survives for search and for the
    register's own editor; no payload or export should write it out.
    """
    if not cell:
        return None
    for l in (lang, *_LANGS):
        v = cell.get(l)
        if v:
            return v
    return None
