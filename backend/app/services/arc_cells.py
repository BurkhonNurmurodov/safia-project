"""
«Bo'linma» → the production cell it names.

An ARC division name that ENDS in a four-digit number carries that cell's
Verifix code: «Большая мойка 1 смена 0028» is cell 0028, «Бургер булочка 7321»
is cell 7321. That trailing number is the ONLY link between IT's ticket
register and this platform's own cell registry — the internal API ships no
cell id, no work centre and nothing else that could be matched — so the rule
lives here and every reader takes it from here.

It has two spellings and they must stay ONE rule: :func:`cell_code` for a name
already in memory, :func:`code_expr` as the SQL that filters, groups and
selects it. A second spelling of «which four digits» is how the register's
cell column and the «by cells» view start disagreeing about the same ticket.

Exactly four digits, and the number must start where the match starts: a name
ending «73215» names NO cell, because taking its last four digits would invent
one. A name with no digits, a three-digit tail, or a code buried mid-string
resolves to nothing — and «no cell» is an answer the page SHOWS (its own filter
value :data:`NO_CELL`, and a ticket listed and counted like any other, with the
owner columns blank because it reaches no unit), never a ticket quietly
dropped.

Turning a code into a cell stays `cell_lookup`'s job: it already keys the
registry both zero-padded and zero-stripped, so «0028» and «28» are one cell.
A code no registered cell answers to keeps its digits and is reported
unregistered — the ticket register is IT's, the cell list is ours, and the two
are allowed to disagree in public.
"""
from __future__ import annotations

import re
from typing import Iterable, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import ArcRequest, Cell, Manager, RoleProfile
from app.services.cell_lookup import by_verifix, resolve_verifix

# The trailing four-digit group, in both dialects. Verified to agree on the
# same names: «… 0028» → 0028, «… 73215» → nothing, «0028» → 0028.
_RE = re.compile(r"(?:^|\D)(\d{4})\s*$")
_SQL = r"(?:^|[^0-9])([0-9]{4})$"

# The filter value standing for «this division names no cell». Every real code
# is four digits, so a word can never collide with one.
NO_CELL = "none"

# The same word, in the OWNER dimension: «this ticket reaches no brigadir» /
# «…no leader». Deliberately the same spelling as :data:`NO_CELL` and
# deliberately its own name — every real owner pick is a numeric id, so a word
# cannot collide with one, and the two sentinels answer about two different
# dimensions. It is the value the «Biriktirilmagan» row of the brigadir and
# leader lists carries.
NO_OWNER = "none"


def cell_code(division_name: Optional[str]) -> Optional[str]:
    """The Verifix code a division name carries, or None."""
    m = _RE.search((division_name or "").strip())
    return m.group(1) if m else None


def code_expr():
    """The same rule as a SQL expression over ``ArcRequest.division_name``.

    NULL for every ticket whose division names no cell — which is what makes
    ``code_expr().is_(None)`` the honest spelling of the «no cell» bucket."""
    return func.substring(func.btrim(ArcRequest.division_name), _SQL)


def cells_for(db: Session, codes: Iterable[str]) -> dict[str, dict]:
    """{code → cell dict} over the codes the registry recognises.

    A code it does not recognise is simply absent from the map; the caller
    keeps the digits and renders them as unregistered rather than as nothing.
    The dict is `cell_lookup`'s compact projection — id, both codes, the
    workshop name in all four languages and the cell's OWNERS (brigadir and
    leader) — so the page picks the viewer's language itself, as every other
    cell-naming payload on the platform does.

    The two owner names ride here rather than on each ticket because the map is
    keyed by CODE: a thousand-row page names each unit once instead of once per
    row, and the register's «Brigadir»/«Lider» columns read the same projection
    the cell column already reads — one answer to «whose cell is this», never
    two."""
    table = by_verifix(db, with_leader=True, with_sup=True)
    out: dict[str, dict] = {}
    for code in codes:
        if not code or code == NO_CELL:
            continue
        cell = resolve_verifix(table, code)
        if cell:
            out[code] = cell
    return out


# ── the org chain behind a code ──────────────────────────────────────────────
# A ticket reaches THIS platform's org chart only through the cell its division
# names: that cell belongs to a supervisor, inherits that supervisor's shift,
# and — where one is assigned — to a leader. The walk lives here, once, because
# the filter's option lists and the WHERE clause behind them must read the same
# map: a brigadir the panel offers and a brigadir the query cannot find would
# be the same page disagreeing with itself.


def register_codes(db: Session) -> list[str]:
    """Every four-digit code the register's division names carry, once each.

    Deliberately unbounded by ``missing_since``: this is the DOMAIN a code is
    looked up in, not a row filter — the ticket filters are applied separately,
    and narrowing the domain would drop a code that only a hidden ticket
    carries."""
    code = code_expr()
    rows = db.query(code).filter(code.isnot(None)).distinct().all()
    return [r[0] for r in rows if r[0]]


def org_index(db: Session, codes: Iterable[str], keep_managers: Iterable[int] = (),
              keep_leaders: Iterable[int] = ()) -> dict:
    """{code → org} over the codes given, plus the units and leaders they reach.

    ``by_code`` maps each ARC code to ``{manager_id, shift, leader_id}``;
    ``managers`` and ``leaders`` hold only those a code in the list actually
    reaches, so every name the filter offers is a narrowing that has tickets
    behind it. Codes the registry does not recognise are simply absent — they
    belong to no unit, and the page shows them as unregistered rather than
    filing them under somebody.

    ``keep_*`` add names the codes do not reach — the unit the reader has
    ALREADY picked, whose tickets the rest of the view may hold none of. A
    pick missing from its own list is un-picked by the page's chain guards, so
    dropping it here would silently widen the register instead of answering
    with the empty table the reader asked for."""
    table = by_verifix(db)
    rows = (
        db.query(
            Cell.id.label("cell_id"),
            Cell.manager_id,
            Cell.leader_id,
            Manager.name.label("mgr_name"),
            Manager.shift.label("shift"),
            RoleProfile.name.label("lead_name"),
            RoleProfile.manager_id.label("lead_mgr"),
        )
        .outerjoin(Manager, Manager.id == Cell.manager_id)
        .outerjoin(RoleProfile, RoleProfile.id == Cell.leader_id)
        .all()
    )
    per_cell: dict[int, dict] = {}
    mgr_all: dict[int, dict] = {}
    lead_all: dict[int, dict] = {}
    for r in rows:
        per_cell[r.cell_id] = {"manager_id": r.manager_id, "shift": r.shift,
                               "leader_id": r.leader_id}
        if r.manager_id and r.manager_id not in mgr_all:
            mgr_all[r.manager_id] = {"id": r.manager_id,
                                     "name": r.mgr_name or f"#{r.manager_id}",
                                     "shift": r.shift}
        if r.leader_id and r.leader_id not in lead_all:
            lead_all[r.leader_id] = {"id": r.leader_id,
                                     "name": r.lead_name or f"#{r.leader_id}",
                                     # A leader's unit is their own profile's;
                                     # the cell's owner is the fallback for a
                                     # profile that never got one filled in.
                                     "manager_id": r.lead_mgr or r.manager_id,
                                     "shift": r.shift}

    by_code: dict[str, dict] = {}
    managers: dict[int, dict] = {}
    leaders: dict[int, dict] = {}
    for code in codes:
        if not code or code == NO_CELL:
            continue
        cell = resolve_verifix(table, code)
        org = per_cell.get(cell["id"]) if cell else None
        if not org:
            continue
        by_code[code] = org
        if org["manager_id"] in mgr_all:
            managers[org["manager_id"]] = mgr_all[org["manager_id"]]
        if org["leader_id"] in lead_all:
            leaders[org["leader_id"]] = lead_all[org["leader_id"]]
    for mid in keep_managers:
        if mid in mgr_all:
            managers.setdefault(mid, mgr_all[mid])
    for lid in keep_leaders:
        if lid in lead_all:
            leaders.setdefault(lid, lead_all[lid])
    return {"by_code": by_code, "managers": managers, "leaders": leaders}


def owner_picks(values: Iterable[str]) -> tuple[set[int], bool]:
    """A brigadir/leader pick list → (ids, «unassigned» asked for).

    The two are separated here, once, because every reader of an owner pick
    needs both halves and neither is derivable from the other: an id narrows
    to a unit, :data:`NO_OWNER` narrows to the tickets that reach NO unit, and
    picking both means «these people, or nobody»."""
    ids: set[int] = set()
    none = False
    for v in values or ():
        s = str(v).strip()
        if not s:
            continue
        if s == NO_OWNER:
            none = True
            continue
        try:
            ids.add(int(s))
        except ValueError:
            continue
    return ids, none


def _owner_ok(value: Optional[int], ids: set[int], none: bool) -> bool:
    """Does one code's owner satisfy one level's picks?

    No pick at all on a level is no narrowing — every code passes. Otherwise
    the picks are OR-ed: a named id matches its own unit, :data:`NO_OWNER`
    matches an owner this platform cannot name (an unregistered cell, or a
    registered one nobody is assigned to)."""
    if not ids and not none:
        return True
    return none if value is None else value in ids


def org_codes(db: Session, shifts: list[int], managers: list[str],
              leaders: list[str]) -> tuple[set[str], bool]:
    """The codes an org pick narrows the register to, and whether tickets that
    name NO cell are in that scope.

    The picks are AND-ed across levels and OR-ed within one, and the brigadir /
    leader lists carry raw picks — ids as strings, plus :data:`NO_OWNER`. That
    sentinel is why the walk is over EVERY code the register carries rather
    than over the resolved ones: a code the cell registry has never heard of
    reaches no brigadir either, and it is one of the three ways a ticket ends
    up with a blank owner column. All three are what «Biriktirilmagan» means,
    which is what makes the pick and the column agree about the same row.

    The second half of the answer is the third of those ways: a division that
    names no cell at all. It cannot be expressed as a code, so it rides back
    as a flag — and it is in scope only while no level NAMES anything, because
    such a ticket reaches no unit, no shift and no leader.

    An EMPTY answer is a real one («no cell answers to this scope»): it must
    show an empty register, never the whole plant."""
    mgrs, mgr_none = owner_picks(managers)
    leads, lead_none = owner_picks(leaders)
    want_shifts = set(shifts or ())
    codes = register_codes(db)
    idx = org_index(db, codes)
    by_code = idx["by_code"]
    out: set[str] = set()
    for code in codes:
        org = by_code.get(code) or {}
        if want_shifts and org.get("shift") not in want_shifts:
            continue
        if not _owner_ok(org.get("manager_id"), mgrs, mgr_none):
            continue
        if not _owner_ok(org.get("leader_id"), leads, lead_none):
            continue
        out.add(code)
    with_null = (not want_shifts
                 and _owner_ok(None, mgrs, mgr_none)
                 and _owner_ok(None, leads, lead_none))
    return out, with_null


def assigned_codes(db: Session) -> set[str]:
    """The codes whose cell this platform's registry gives an OWNER.

    «Assigned» means a SUPERVISOR and only that: ``cells.manager_id`` is the
    one attachment point of the whole org dimension, so a cell without a
    brigadir reaches no unit, no shift and no leader — the three columns
    «Yacheykalar bo'yicha» exists to answer, blank on every one of its rows. A
    leader is deliberately NOT required (plenty of cells legitimately have
    none), and a code the registry has never heard of is not assigned either:
    it names a cell nobody here can resolve to a person.

    An EMPTY set is a real answer, exactly as in :func:`org_codes` — an empty
    register, never the whole plant."""
    idx = org_index(db, register_codes(db))
    return {code for code, org in idx["by_code"].items() if org.get("manager_id")}
