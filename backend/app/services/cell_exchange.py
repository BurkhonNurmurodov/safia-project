"""
The cell-level exchange SANDBOX — what a test document is, and what it WOULD
have done.

**Why a sandbox at all.** /staff-cells moves people between production CELLS,
and a move is not a display: an applied ``people_exchange`` rewrites attendance
rows, and every загрузка, KPI, chart and export downstream is computed from
those rows. There is no staging environment here and a push to `main` is a
production deploy, so the only honest way to run this page beside the live
/staff page is to let it do everything EXCEPT touch attendance — file, notify,
approve, record history — and to write down, on the document itself, exactly
which rows it would have changed and how. An operator can then read the
register and say «yes, that is the move I meant» before anything is at stake.

**Why a distinct doc_type rather than a payload flag.** Five of the six
semantic ``HrDocument`` readers already narrow to ``doc_type ==
"people_exchange"`` and therefore exclude a new type for free —
``services/exchange_rewind``, ``services/attendance_reconcile``,
``routers/exchange_audit``, ``routers/workers`` and ``startup``. A
``payload["test"]`` flag would have needed every one of them edited, and a
reader somebody forgot would quietly fold sandbox documents into the real
attendance history — the one class of mistake this whole module exists to make
impossible. Only ``services/day_state`` filters on STATUS alone, which is why
it is the one existing file that gains :func:`real_clause`: a draft test
document must not be able to hold a day out of every dashboard on the platform.

**The one invariant.** No attendance row is written on any path a test document
can reach. :func:`dry_run` READS — the payload snapshot the document already
carries, and the live row when it carries none — and returns a plain dict. It
must NEVER call ``staff._apply_split_exchange``: that function is not a
calculator, it writes rows, mutates ``doc.payload`` (stamping ``emp["applied"]``,
the handle the restore path later reverts by) and calls ``flag_modified``. The
projection below is built from the PURE ``staff._compute_split`` instead —
already proven separable, since ``routers/exchange_audit._restore_split``
re-runs it outside staff.py for exactly this reason: one formula, so a
predicted split and a real one can never disagree.

**The flip is ONE constant.** :data:`SANDBOX` decides which doc_type a new
document is filed under and nothing else; every reader keys off the type. See
the CUT-OVER notes for what changes on the day it goes False.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import Attendance, HrDocument
from app.services import cell_lookup

# CUT-OVER: flip to False and cell-level documents are filed under the REAL doc
# types and applied for real. Nothing else in this module changes — the test
# types stay defined so the documents already written go on rendering, and
# purging them must call `approvals.forget_notices("hr_document", id)` for each
# or Telegram keeps live ✅/❌ buttons over rows that no longer exist.
SANDBOX = True

TEST_EXCHANGE = "people_exchange_test"
TEST_ROLE = "role_change_test"
TEST_DOC_TYPES = frozenset({TEST_EXCHANGE, TEST_ROLE})

# test type → the real type it stands in for. ONE mapping, read in both
# directions, so «which real document is this pretending to be» and «which
# sandbox type does this kind file under» can never drift apart.
REAL_OF = {TEST_EXCHANGE: "people_exchange", TEST_ROLE: "role_change"}
TEST_OF = {real: test for test, real in REAL_OF.items()}
REAL_DOC_TYPES = (REAL_OF[TEST_EXCHANGE], REAL_OF[TEST_ROLE])


def doc_type_for(kind: str) -> str:
    """The ``doc_type`` to FILE a new cell-level document under.

    ``kind`` is the semantic type the caller means — ``"people_exchange"`` or
    ``"role_change"``, the two values the request body carries. While
    :data:`SANDBOX` stands the answer is the matching test type; after the
    CUT-OVER it is the kind itself, and every path in the router keeps working
    unchanged because the router never spells a doc_type out.

    Passing a test type back in is accepted and idempotent, so a caller
    re-filing from an existing document cannot double-wrap it. An unknown kind
    raises: the router validates the body, and a typo that silently produced a
    third doc_type would be invisible to every reader on the platform.
    """
    if kind in TEST_DOC_TYPES:
        kind = REAL_OF[kind]
    if kind not in TEST_OF:
        raise ValueError(f"unknown cell-exchange document kind: {kind!r}")
    # CUT-OVER: this ternary is the whole flip.
    return TEST_OF[kind] if SANDBOX else kind


def is_test(doc_type: Optional[str]) -> bool:
    """Is this document a sandbox one — i.e. did it change no attendance row?

    THE predicate behind the «TEST» chip and behind every «take the dry-run
    path» branch. Asked of the doc_type and never of :data:`SANDBOX`: after the
    flip the constant says what NEW documents are, while the documents already
    written stay what they were, and a chip that disappeared on deploy day
    would relabel history."""
    return doc_type in TEST_DOC_TYPES


def test_clause(col):
    """SQL twin of :func:`is_test` — «this row is a sandbox document»."""
    return col.in_(sorted(TEST_DOC_TYPES))


def real_clause(col):
    """SQL twin of «this row is a document that actually moves attendance».

    The complement of :func:`test_clause` over the four types that exist, and
    the reason it is spelled as an explicit IN rather than a NOT-IN: a fifth
    doc_type added later must default to being IGNORED by the day-state
    queries, not to blocking every dashboard until somebody notices. Used by
    ``services/day_state`` — the one existing reader that filters on status
    alone — so a draft or approved TEST document can neither hold a day at
    «closed» nor drop it out of ``confirmed_pairs``.
    """
    return col.in_(REAL_DOC_TYPES)


# ── the dry run ──────────────────────────────────────────────────────────────

def _semantic(doc_type: Optional[str]) -> Optional[str]:
    """The real type a document stands for — itself, or what its test type
    mirrors. Lets the projection below branch on MEANING once instead of
    listing four type names at every fork."""
    return REAL_OF.get(doc_type, doc_type)


def _hours_before(db: Session, doc: HrDocument, name: Optional[str],
                  snap: dict) -> Optional[float]:
    """The worker's worked hours as the day stands BEFORE the document.

    The payload's own snapshot is authoritative when it exists — a task move
    and every transfer-time split store one at filing time, and it is what the
    real apply path computes against, so reading anything else here would
    predict a split from numbers the apply would not use. A plain unit move
    stores no snapshot, so the live row is read with EXACTLY the predicate
    ``_apply_people_exchange`` uses to find it.

    ``None`` is a real answer: the row was re-uploaded away between filing and
    approval, and the real apply would skip that worker entirely.
    """
    if "hours_worked" in snap:
        v = snap.get("hours_worked")
        return float(v) if v is not None else None
    att = db.query(Attendance).filter(
        Attendance.manager_id == doc.manager_id,
        Attendance.date == doc.date,
        Attendance.worker_name == name,
    ).first()
    if att is None or att.hours_worked is None:
        return None
    return float(att.hours_worked)


def _row(worker_name, from_unit, from_cell, to_unit, to_cell, part1, part2,
         side, hours_before, hours_after, leftover_on) -> dict:
    """One projected worker-day, in the frozen key order. Built through one
    function so no branch below can omit a key — a register whose rows carry
    different shapes is one the page has to defend against on every cell."""
    return {
        "worker_name": worker_name,
        "from_unit": from_unit,
        "from_cell": from_cell,
        "to_unit": to_unit,
        "to_cell": to_cell,
        "part1": part1,
        "part2": part2,
        "side": side,
        "hours_before": hours_before,
        "hours_after": hours_after,
        "leftover_on": leftover_on,
    }


def _exchange_rows(db: Session, doc: HrDocument, payload: dict,
                   compute_split, min_moved: float) -> list[dict]:
    """Project every employee of a people_exchange, branch for branch.

    The forks mirror ``staff._apply_people_exchange`` and
    ``staff._apply_split_exchange`` in the same order they take them, because
    that is the only way this can stay a PREDICTION rather than a second
    opinion:

      * the split gate — a transfer time only splits when the move actually has
        somewhere to go (`→ supervisor` with a target, or `→ task`); anything
        else falls through to the plain path exactly as the apply does;
      * an un-splittable worker (no clock, no hours) falls back to a plain full
        move, again exactly as the apply does;
      * ``below_min`` — neither side cleared ``MIN_MOVED_ZAGRUZKA_HOURS``, so
        the NAME leaves the roster and both sides become nameless hours;
      * ``stay`` / not-stay — the name follows the bigger half.

    Field meanings, stated once because two of them are read wrong easily:

    ``side`` says where the worker's NAME ends up — ``"moved"`` off the sending
    roster, ``"stayed"`` still named on the sending unit, ``"below_min"`` gone
    from both. It is deliberately close to, but not identical with, the
    ``emp["applied"]["side"]`` the real apply stamps for its own restore path:
    that field calls the un-splittable `→ task` fallback a "move" although the
    worker keeps their name and merely goes to zero hours, and a reader of this
    page would be told a person left a roster they are still on.

    ``hours_after`` is the number that travels WITH the name — the receiving
    half for a moved worker, the home half for one who stayed, zero for a
    worker marked absent by a `→ task` move or dropped by ``below_min``.
    ``hours_before`` is the whole day as it stands now, so the two together say
    what the sending unit loses.

    ``part1`` / ``part2`` are the split's own two halves and are ``None``
    whenever the document carries no transfer time: there is no split, and
    inventing a 0/total pair would read as one.

    ``leftover_on`` names the side that gains the NAMELESS hours-only row a
    split leaves behind. Its three values cannot express the one case that
    creates TWO — a ``below_min`` worker on a `→ supervisor` move leaves a
    leftover on the sender (their own row, repurposed) AND, when the after-T
    half is non-zero, one on the receiver. It reports ``"sender"`` there,
    because the sender's is the one that always exists.
    """
    ttype = payload.get("target_type")
    target = payload.get("target_manager_id")
    is_task = ttype == "task"
    ttime = payload.get("transfer_time")
    rtime = payload.get("return_time")
    # Whether the worker's own named row changes UNITS at all. `→ task` keeps
    # the row where it is and marks it absent; a `→ supervisor` document with
    # no target is malformed and the apply path treats it the same way.
    moves_unit = ttype == "supervisor" and bool(target)
    # The exact gate `_apply_people_exchange` routes on before delegating to
    # the split path.
    splits = bool(ttime) and (moves_unit or is_task)

    to_unit = target if moves_unit else None
    to_cell = (cell_lookup.norm_code(payload.get("target_cell")) or None) if moves_unit else None

    out: list[dict] = []
    for emp in payload.get("employees") or []:
        emp = emp or {}
        name = emp.get("worker_name")
        snap = emp.get("snapshot") or {}
        # The worker's own cell is the truth; the document's `sender_cell` is
        # the group it was filed under and only stands in when the row carried
        # no code of its own.
        from_cell = cell_lookup.norm_code(
            emp.get("old_verifix_code") or payload.get("sender_cell")) or None
        from_unit = emp.get("old_manager_id") or doc.manager_id
        before = _hours_before(db, doc, name, snap)

        plan = compute_split(snap, ttime, rtime) if splits else None

        if plan is None:
            # Plain full move, or the apply path's own un-splittable fallback.
            side = "moved" if moves_unit else "stayed"
            part1 = part2 = None
            after = before if moves_unit else 0.0
            leftover_on = "none"
        else:
            part1 = plan["part1"]
            part2 = plan["part2"]
            if max(part1, part2) < min_moved:
                side, after, leftover_on = "below_min", 0.0, "sender"
            elif plan["stay"]:
                side, after = "stayed", part1
                # `→ task` drops the after-T hours instead of handing them on.
                leftover_on = "receiver" if (moves_unit and part2 > 0) else "none"
            elif is_task:
                # The name leaves the roster and their own row is repurposed
                # into the sending unit's nameless before-T leftover.
                side, after, leftover_on = "moved", 0.0, "sender"
            else:
                side, after = "moved", part2
                leftover_on = "sender" if plan["part1_eff"] > 0 else "none"

        out.append(_row(name, from_unit, from_cell, to_unit, to_cell,
                        part1, part2, side, before, after, leftover_on))
    return out


def _role_change_rows(db: Session, doc: HrDocument, payload: dict) -> list[dict]:
    """Project a role_change into the same row shape.

    A role change moves nobody: it rewrites ``job_title`` on rows that stay
    exactly where they are, so every side of the projection is the side the
    worker is already on and no hour changes hands. The rows are still emitted
    — a dry run that returned nothing would be indistinguishable from one that
    failed — but the shape has no column for the title itself, which is the
    only thing such a document actually changes; the page reads the new role
    off ``payload["new_role"]`` beside this.
    """
    out: list[dict] = []
    for emp in payload.get("employees") or []:
        emp = emp or {}
        name = emp.get("worker_name")
        unit = emp.get("old_manager_id") or doc.manager_id
        cell = cell_lookup.norm_code(emp.get("old_verifix_code")) or None
        before = _hours_before(db, doc, name, emp.get("snapshot") or {})
        out.append(_row(name, unit, cell, unit, cell, None, None,
                        "stayed", before, before, "none"))
    return out


def dry_run(db: Session, doc: HrDocument) -> dict:
    """What this document WOULD have done — computed, never applied.

    Returned for the caller to store at ``payload["dry_run"]`` on a test
    document that was approved through the normal flow (status, history,
    notifications) with ``_apply_doc_effects`` deliberately skipped. It is a
    pure read: the only queries it issues are the snapshot top-up in
    :func:`_hours_before`, and nothing on any path below writes, flushes or
    flags an object as modified. That is the property a reviewer has to be able
    to establish from the diff alone, so keep it true.

    ``staff._compute_split`` and ``MIN_MOVED_ZAGRUZKA_HOURS`` are imported HERE
    rather than at module scope: ``routers/staff`` imports this module, so a
    top-level import would close the cycle at boot. The split formula is
    deliberately borrowed rather than restated — a second spelling of it would
    predict one number and apply another, which is precisely the disagreement
    a dry run exists to rule out.
    """
    from app.routers.staff import (MIN_MOVED_ZAGRUZKA_HOURS,  # deferred: cycle
                                   _compute_split)

    payload = doc.payload or {}
    kind = _semantic(doc.doc_type)
    if kind == "people_exchange":
        rows = _exchange_rows(db, doc, payload, _compute_split,
                              MIN_MOVED_ZAGRUZKA_HOURS)
    elif kind == "role_change":
        rows = _role_change_rows(db, doc, payload)
    else:
        rows = []
    # UTC with an explicit offset: a JSON string carries no column type to say
    # which clock it is on, and the renderer localises it like any other
    # timestamp on the platform.
    return {"computed_at": datetime.now(timezone.utc).isoformat(), "rows": rows}
