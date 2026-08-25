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

from app.models import ArcRequest
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
