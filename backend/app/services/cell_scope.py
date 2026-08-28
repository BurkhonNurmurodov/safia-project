"""
THE definition of «which production cells does this caller own» — the row scope
every /staff-cells read and every /staff-cells write is measured against.

**Why this is a module and not a helper inside the router.** The cell-level
exchange page asks the same question in two places that must never disagree:
in MEMORY, when it decides whether a worker (or a sender cell) named in a
request body is one this caller may move, and in SQL, when it narrows a day's
attendance rows to the cells the caller may see. Two spellings of «whose cell
is this» is how a page ends up listing rows the viewer cannot act on — or, far
worse, accepting a body that names a cell the viewer was never shown. So both
spellings live here, side by side: :func:`caller_cells` answers the question
once per request and :func:`code_clause` is its SQL twin, with
:func:`allows` as the in-memory membership test that goes with it.

**It fails CLOSED, and that is the difference from the two scopers that came
before it.** ``routers/idle_cell._scoped_cells`` and
``routers/cell_attendance._scope`` both end in an unrestricted-by-unit
fallback — ``profile_unit_ids(...) is None`` → every cell — which exists so a
role nobody listed cannot be locked out of a page they were granted. That is a
WIDENING, and this page moves people between units: a role nobody thought
about must get NOTHING here, never the whole plant. So the ladder below is
exhaustive by role and its last rung is an empty scope. `top-manager` and
`guest` are in that rung deliberately — reading the fleet is not the same
privilege as moving a worker off somebody's roster.

**A leader is resolved through their PROFILE ids, never through the JWT's
``role_id``.** A leader's ``role_id`` is the UNIT they belong to
(``managers.id``), not their ``role_profiles.id`` — scoping on it would hand a
leader every cell in their brigadir's unit, which is the whole page. And it is
the PLURAL :func:`identity.viewer_leader_profile_ids`, because one human here
is commonly several leader profile ROWS (a passport-form seed, a short
admin-created one, a re-claimed unit): the singular helper the two older
scopers use hides a leader's own cells whenever the register attached them to
their other record. `capabilities.profile_unit_ids` must NEVER be reached for
a leader either — it answers ``None`` for that role, meaning «no restriction»,
so a scoper that forgets the leader branch hands a leader the whole factory.

**A cell has no shift and no factory of its own.** Both are reached through
``Cell.manager_id → Manager``, which is the one place the plant dimension is
attached; ``RoleProfile.shift`` is filled for shift-managers only and is NULL
for every leader. That is why the shift-manager rung below walks
``Manager.shift`` rather than asking the cell anything.

**Codes are normalised, always.** The plant's data holds a cell code both
zero-padded and zero-stripped («0028» and «28» are one cell), so every code
that enters or leaves this module goes through ``cell_lookup.norm_code`` and
the SQL twin matches both spellings — see :func:`_variants`. A comparison
written by hand somewhere else is a cell that silently drops out of a scope.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Iterable, Optional

from sqlalchemy import false, true
from sqlalchemy.orm import Session

from app import identity
from app.models import Cell, Manager
from app.services import cell_lookup


@dataclass(frozen=True)
class CellScope:
    """One caller's answer to «which cells», computed once per request.

    ``all`` is the whole answer for an admin, and when it is True ``codes`` and
    ``units`` are EMPTY and mean NOTHING — exactly the way
    ``cell_attendance._scope`` returns a ``sees_everything`` flag beside its
    list. Enumerating the registry for an admin would be both wasteful and
    WRONG: it would silently exclude every attendance row carrying a code the
    cell register has never heard of, and those rows are real work. So every
    consumer branches on the flag first; :func:`code_clause` and
    :func:`allows` do it for you, and nothing else should have to.

    ``codes`` are NORMALISED verifix codes (``cell_lookup.norm_code``), never
    the raw column values. ``units`` are the ``managers.id`` those codes belong
    to — derived FROM the cells, not from the caller: a supervisor whose unit
    owns no registered cell gets an empty scope, because there is nothing on
    this page for them to see. Their own cell-less attendance row (the
    brigadir's, ``verifix_code IS NULL``) is a separate question the router
    answers off ``caller["role_id"]`` — do not try to derive it from here.

    ``role`` is the caller's role as it was resolved, kept so a caller that
    refuses an action can say WHY it refused without re-reading the token.
    """

    all: bool
    codes: frozenset[str]
    units: frozenset[int]
    role: str


def _empty(role: str) -> CellScope:
    """The fail-closed answer: this caller owns no cell at all.

    An empty scope is a REAL answer and not an error — a leader whose cells
    were all reassigned, a supervisor whose unit has no cell in the register
    yet — so callers must render «nothing here», never fall back to a wider
    read."""
    return CellScope(all=False, codes=frozenset(), units=frozenset(), role=role)


def _from_cells(role: str, cells: Iterable[Cell]) -> CellScope:
    """Project the cell rows a branch resolved into the scope's two sets.

    A cell with a blank ``verifix_code`` cannot be named in a scope that is
    expressed in codes, so it is dropped; a cell with no ``manager_id`` still
    contributes its code but no unit, because an unassigned cell belongs to
    nobody and padding it onto a unit is how a plant gets a roster it never
    had."""
    codes: set[str] = set()
    units: set[int] = set()
    for c in cells:
        code = cell_lookup.norm_code(c.verifix_code)
        if code:
            codes.add(code)
        if c.manager_id:
            units.add(c.manager_id)
    if not codes:
        return _empty(role)
    return CellScope(all=False, codes=frozenset(codes),
                     units=frozenset(units), role=role)


def _shift_units(db: Session, caller: dict) -> list[int]:
    """The unit ids a shift-manager's shift covers.

    ``staff._sm_shift`` is THE reading of «which shift is this shift-manager
    on» — it knows about the pre-profile JWTs still carrying the old fixed slot
    numbers, which a plain ``RoleProfile.shift`` read would answer None for,
    silently emptying the scope of a session that is perfectly valid. Imported
    lazily because ``routers/staff`` is a router and this is a service: the
    dependency only ever points that way at call time, so nothing here can
    close a cycle at import time.

    Archived units are excluded, matching ``capabilities.profile_unit_ids`` —
    an archived brigadir's day is not a day anyone is still moving people
    around on.
    """
    from app.routers.staff import _sm_shift          # deferred: service → router

    shift = _sm_shift(db, (caller or {}).get("role_id"))
    if shift not in (1, 2):
        return []
    return [
        mid for (mid,) in db.query(Manager.id).filter(
            Manager.shift == shift,
            Manager.archived.is_(False),
        ).all()
    ]


def caller_cells(db: Session, caller: dict) -> CellScope:
    """THE cell scope of one caller. Exhaustive by role, empty by default.

    The ladder, widest first:

      * ``admin``          → every cell (the flag; see :class:`CellScope`).
      * ``leader``         → the cells owned by any leader profile RECORD that
                             is this human. Never ``caller["role_id"]``: that
                             is their unit, not their profile.
      * ``supervisor``     → the cells of their own unit.
      * ``shift-manager``  → the cells of every live unit on their shift.
      * anything else      → NOTHING, `top-manager` and `guest` included.

    Deliberately NOT consulted: a ``page.view.staff-cell`` grant at "all". Page
    grants widen what a person may READ on the pages that carry a fleet view;
    this scope also decides what they may MOVE, and a read grant must not
    quietly become the authority to take a worker off another brigadir's day.
    Widening it is a decision to take on its own, not a side effect of granting
    a page.
    """
    role = (caller or {}).get("role") or ""

    if role == "admin":
        return CellScope(all=True, codes=frozenset(), units=frozenset(), role=role)

    if role == "leader":
        # PLURAL, and through identity — see the module docstring. An empty list
        # is a leader whose session resolves to no profile at all, which is
        # exactly the case that must see nothing rather than everything.
        profile_ids = identity.viewer_leader_profile_ids(db, caller)
        if not profile_ids:
            return _empty(role)
        return _from_cells(role, db.query(Cell).filter(
            Cell.leader_id.in_(profile_ids)).all())

    if role == "supervisor":
        # A supervisor's role_id IS managers.id — the one role where the token's
        # id is the unit and that is the right thing to scope by.
        unit = (caller or {}).get("role_id")
        if not unit:
            return _empty(role)
        return _from_cells(role, db.query(Cell).filter(
            Cell.manager_id == unit).all())

    if role == "shift-manager":
        units = _shift_units(db, caller)
        if not units:
            return _empty(role)
        return _from_cells(role, db.query(Cell).filter(
            Cell.manager_id.in_(units)).all())

    return _empty(role)


def _variants(code: str) -> set[str]:
    """Every spelling of one cell code that the raw columns may hold.

    ``cells.verifix_code`` is the canonical 4-digit form, but the code stored
    ON an attendance row came out of an upload and the plant writes it both
    ways — this is the same fact ``cell_lookup.by_verifix`` keys its table
    twice for. Expanding the wanted set is deliberate rather than normalising
    the COLUMN in SQL: ``upper(replace(col,' ',''))`` would answer identically
    and throw away the index on ``attendance.verifix_code``, on a table with a
    row per worker per day.
    """
    n = cell_lookup.norm_code(code)
    if not n:
        return set()
    out = {n}
    bare = n.lstrip("0")
    if bare:
        out.add(bare)
        if bare.isdigit() and len(bare) < 4:
            out.add(bare.zfill(4))
    return out


@lru_cache(maxsize=512)
def _wanted(codes: frozenset[str]) -> frozenset[str]:
    """THE in-scope code set, every spelling of it — read by BOTH twins.

    This exists because the two spellings of the rule stopped agreeing about
    the same cell. :func:`code_clause` expanded each scope code through
    :func:`_variants` and matched the column against the expansion, while
    :func:`allows` tested raw membership in ``scope.codes``: a scope holding
    the canonical «0028» therefore READ an attendance row stamped «28» through
    the SQL clause and then REFUSED every action on it in memory — and a scope
    that happened to hold the bare «28» failed the other way round. Two
    spellings of one rule that do not match is precisely what this module
    exists to prevent, so neither of them expands anything on its own any more;
    both ask here.

    Cached on the frozen code set — ``CellScope`` is frozen and its ``codes``
    are a ``frozenset``, so the same caller's scope is expanded once per
    process rather than once per worker row on a roster.
    """
    return frozenset(v for c in codes for v in _variants(c))


def same_code(a, b) -> bool:
    """«do these two raw spellings name ONE cell?» — the code-equality rule.

    The scope twins above answer «is this cell in scope»; this answers the
    other comparison the cell dimension needs, and it is the same rule: the
    plant writes one cell both zero-padded and zero-stripped, so «0028» and
    «28» are one cell and ``norm_code(a) == norm_code(b)`` is not equality
    here. Every hand-written ``==`` between two codes is a place where the
    sender cell fails to be recognised as the target cell, or a document's own
    cell fails to match the attendance row it was filed from — the same class
    of silent miss :func:`_wanted` exists to close, one level down.

    A blank on either side is never equal to anything: a row that names no
    cell is not «the same cell» as one that does.
    """
    va, vb = _variants(a), _variants(b)
    return bool(va and vb and (va & vb))


def in_codes(code, codes: Iterable[str]) -> bool:
    """«is this raw code one of these?» — :func:`same_code` over a set.

    For the comparisons that are NOT about a caller's scope: a body's target
    cell against the codes a receiving unit's attendance actually carries, a
    document's own sender cell against the cells a selection resolved to. Both
    sides are expanded, so a unit whose attendance spells the cell «28» accepts
    a body naming «0028» and vice-versa.
    """
    v = _variants(code)
    if not v:
        return False
    return any(v & _variants(c) for c in codes)


def code_clause(scope: CellScope, col):
    """SQL twin of :func:`caller_cells` — «this row's cell code is in scope».

    ``true()`` for an admin, ``false()`` for an EMPTY scope. The false is the
    load-bearing half: a filter that is simply omitted when the scope is empty
    reads as «no narrowing» and answers with the whole plant, which is the one
    mistake this module exists to make impossible. It is the same rule
    ``factory_scope.empty_scope()`` states for the manager-id dimension.

    A NULL code never matches, which is correct here — a cell-less row belongs
    to no cell and therefore to no cell scope. The brigadir's own cell-less row
    is added by the router, on purpose and by a different rule.
    """
    if scope.all:
        return true()
    if not scope.codes:
        return false()
    return col.in_(sorted(_wanted(scope.codes)))


def allows(scope: CellScope, code: Optional[str]) -> bool:
    """In-memory twin of :func:`code_clause` — may this caller act on this cell?

    Exists so no call site has to remember that an admin's ``codes`` are empty:
    ``norm_code(x) in scope.codes`` is False for an admin and would refuse
    every action they take. Anything arriving in a request BODY — a sender
    cell, a target cell, a worker's own code — is checked through here before
    it is trusted, because a body is typeable and the page that produced it is
    not the authority on what its author may touch.

    It answers off exactly the set :func:`code_clause` matches the column
    against (:func:`_wanted`), never off ``scope.codes`` directly: a bare
    membership test refused every action on a row the SQL twin had already
    shown the caller, which is a page that lists rows nobody may act on — the
    one failure this module was written to make impossible.
    """
    if scope.all:
        return True
    n = cell_lookup.norm_code(code)
    return bool(n) and n in _wanted(scope.codes)
