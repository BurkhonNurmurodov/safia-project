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
cell column and the by-cell tab start disagreeing about the same ticket.

Exactly four digits, and the number must start where the match starts: a name
ending «73215» names NO cell, because taking its last four digits would invent
one. A name with no digits, a three-digit tail, or a code buried mid-string
resolves to nothing — and «no cell» is an answer the page SHOWS (its own row on
the by-cell tab, its own filter value :data:`NO_CELL`), never a ticket quietly
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
    workshop name in all four languages and the owning leader — so the page
    picks the viewer's language itself, as every other cell-naming payload on
    the platform does."""
    table = by_verifix(db, with_leader=True)
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


def org_index(db: Session, codes: Iterable[str]) -> dict:
    """{code → org} over the codes given, plus the units and leaders they reach.

    ``by_code`` maps each ARC code to ``{manager_id, shift, leader_id}``;
    ``managers`` and ``leaders`` hold only those a code in the list actually
    reaches, so every name the filter offers is a narrowing that has tickets
    behind it. Codes the registry does not recognise are simply absent — they
    belong to no unit, and the page shows them as unregistered rather than
    filing them under somebody."""
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
    return {"by_code": by_code, "managers": managers, "leaders": leaders}


def org_codes(db: Session, shifts: list[int], managers: list[int],
              leaders: list[int]) -> set[str]:
    """The codes an org pick narrows the register to — the picks AND-ed.

    An EMPTY set is a real answer («no cell answers to this scope»), never «no
    filter»: a supervisor whose cells the register has never named must show an
    empty register, not the whole plant."""
    idx = org_index(db, register_codes(db))
    out: set[str] = set()
    for code, org in idx["by_code"].items():
        if shifts and org["shift"] not in shifts:
            continue
        if managers and org["manager_id"] not in managers:
            continue
        if leaders and org["leader_id"] not in leaders:
            continue
        out.add(code)
    return out
