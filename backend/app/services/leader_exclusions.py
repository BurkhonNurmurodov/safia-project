"""A leader-day taken OUT of the results — neither a plus nor a minus.

THE definition of "this day does not count", and it is a different thing from
every other not-counting on this platform. The filing-window void scores a day
**0** and leaves it in the denominator; `LeaderDaySource` and `bot_from` switch
which LAYER supplies the number. Both were the only tools an operator had when
the platform itself was at fault, and both punish the leader for it — a night
the system got wrong still drags the month's mean down exactly as a night
nobody filed.

An exclusion removes the day from BOTH sides of the average: the leader's mean
is taken over the days that remain, their consistency counts neither a filing
nor a miss, and the unit mean loses that leader's contribution to it. The day is
still SHOWN — blank in the heatmap, greyed in the register, carrying the reason
— because a day that silently disappeared could not be told from one that was
never collected.

Two rules hold this together:

* **The key is the leader-DAY, not the row** (`key()`), keyed exactly as
  `LeaderLateRequest` is: the profile id when the sheet name resolved to a
  person, else the folded raw name. `leader_checklists` is wiped and reloaded on
  every sheet Refresh, so a row-id key would not survive the next sync; and
  ~18% of sheet names never resolve to a profile, so a profile-only key could
  never reach an unlinked leader's day.
* **Nothing is stored on the score itself.** Every consumer asks this module,
  so lifting an exclusion restores the day everywhere at once with no migration
  and no re-sync — the same property that makes the window edits free.

Lifting DELETES the row: "counts again" is the absence of a record, never a
third state every reader has to spell out.

**`excluded()` is THE door for both this and the open-ended cutoff** (a leader
who stopped counting from a date — `services/leader_cutoffs.py`). The two are
different decisions about different things, one about a named night and one
about a person, but they have one arithmetic consequence, and every consumer on
the platform already asks this module. Folding the cutoff in here is what took
it to the four AI queue doors and the report sender's park without wiring it to
each of them separately — and what stops the two ever disagreeing about whether
a day counts.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import LeaderAiReview, LeaderDayExclusion, Manager, RoleProfile
from app.services import leader_cutoffs

logger = logging.getLogger(__name__)


# ── identity ─────────────────────────────────────────────────────────────────

def key(leader_id: int | None, leader_name: str | None, date_iso: str) -> str:
    """Identity of one leader-day.

    A deliberate twin of `routers.leaders._late_key` — the two answer the same
    question about the same rows, and a leader-day that is one record to the
    late-open flow and two records to this one is a day whose two admin
    decisions cannot be read together.

    The half in front of the date is `leader_cutoffs.person_key`, the same
    function the open-ended cutoff keys itself by, so a leader who is one person
    to one tool cannot be two people to the other.
    """
    return f"{leader_cutoffs.person_key(leader_id, leader_name)}|{str(date_iso)[:10]}"


# ── reading ──────────────────────────────────────────────────────────────────

def load(db: Session) -> dict[tuple[str, int | None], LeaderDayExclusion]:
    """Every live exclusion, by (leader-day key, cell). One query for a register.

    From 2026-09-02 the map is keyed by the CELL as well, because a leader on a
    per-cell unit files a separate checklist per cell and an incident that cost
    one of them says nothing about the others.

    **`cell_id is None` means the whole leader-day** — every cell of it — and
    that is not a special case bolted on: it is what every exclusion recorded
    before per-cell filing existed already means, and it is exactly the «all
    this leader's cells» shortcut the tab offers, stored as one row rather than
    as N. `for_row()` is the lookup that honours both.
    """
    return {(e.leader_key, e.cell_id): e
            for e in db.query(LeaderDayExclusion).all()}


def for_row(excl: dict, leader_key: str, cell_id: int | None):
    """The exclusion covering ONE filed row, or None.

    A per-cell exclusion covers its own cell; a cell-less one covers the whole
    leader-day, so it is the fallback for every cell. Checked in that order —
    the narrower record is the more deliberate one.
    """
    return excl.get((leader_key, cell_id)) or excl.get((leader_key, None))


def profile_days(db: Session) -> set[tuple[int, str]]:
    """Excluded `(profile_id, date)` pairs — the shape an id-keyed caller wants.

    The AI queue doors and the report sender know a leader by profile id and
    never by sheet spelling, so they ask in that currency. Name-keyed rows are
    deliberately absent: they belong to sheet rows the register could not resolve
    to a person, and neither a bot day nor a report DM can exist for one.
    """
    return {(int(e.leader_profile_id), str(e.date))
            for e in db.query(LeaderDayExclusion)
            .filter(LeaderDayExclusion.leader_profile_id.isnot(None),
                    # WHOLE-day exclusions only. The AI queue and the report
                    # sender act on a leader-DAY, and a per-cell exclusion
                    # silences one checklist, not the day — treating it as the
                    # day would stop reviewing and reporting the cells that
                    # were never excluded.
                    LeaderDayExclusion.cell_id.is_(None)).all()}


def preload(db: Session) -> tuple[set[tuple[int, str]], dict[str, "object"]]:
    """`(day pairs, cutoffs by person key)` — both halves for a many-row caller.

    THE preload door. `excluded()` answers two questions that happen to have one
    answer, and a caller that loaded only the first would silently keep queueing
    and reporting a leader the platform has stopped counting. Handing both back
    from one call is what makes forgetting the second impossible.
    """
    return profile_days(db), leader_cutoffs.load(db)


def excluded(db: Session, leader_id: int | None, date: str | None, *,
             leader_name: str | None = None,
             pairs: set[tuple[int, str]] | None = None,
             cuts: dict | None = None) -> bool:
    """Is this leader-day out of the results?

    TWO ways it can be, and this is THE door both answer through — every
    consumer already asks here, so the open-ended cutoff reached all of them
    (the four AI queue doors, the report sender's park) by being folded in here
    rather than by being wired to each:

      * an admin took THAT DAY out (`LeaderDayExclusion`), or
      * the leader stopped counting on or before it (`LeaderCutoff`).

    `pairs` / `cuts` are the preloaded answers for a caller already walking many
    rows — see `preload()`, which returns exactly this pair. Without them this
    asks the DB for the single row, which is what the per-row doors want.

    **`leader_name` is not optional decoration on the sheet layer.** A cutoff
    can be keyed by a folded NAME, for a leader whose sheet spelling never
    resolved to a profile, and a caller that passes only the id would answer
    "counts" for exactly those rows — while `queue_report`, which has the name,
    answers "does not". The cutoff is asked BEFORE the `leader_id` guard for the
    same reason: a name-keyed cutoff is a real answer about a row that has no
    profile id at all.
    """
    if not date:
        return False
    d = str(date)[:10]
    if cuts is not None:
        if leader_cutoffs.hit(cuts, leader_id, leader_name, d) is not None:
            return True
    elif leader_cutoffs.active(db, leader_id, leader_name, d) is not None:
        return True
    if not leader_id:
        return False
    lid = int(leader_id)
    if pairs is not None:
        return (lid, d) in pairs
    return db.query(LeaderDayExclusion).filter(
        LeaderDayExclusion.leader_profile_id == lid,
        LeaderDayExclusion.date == d).first() is not None


def row_for(db: Session, leader_id: int | None, leader_name: str | None,
            date: str) -> LeaderDayExclusion | None:
    """The exclusion on one leader-day, reached by whichever key it holds."""
    return (db.query(LeaderDayExclusion)
            .filter_by(leader_key=key(leader_id, leader_name, date)).first())


def wire_for(db: Session, leader_id: int | None, leader_name: str | None,
             date: str) -> dict | None:
    """What ONE leader-day carries about not counting — either reason, one shape.

    The day's own exclusion wins where both apply: it is a person's explicit
    answer about this exact day, while the cutoff is a rule about all the days
    after a date — the same precedence an exclusion already has over the filing
    window void. Lifting the cutoff therefore leaves the day exclusion standing.
    """
    own = wire(row_for(db, leader_id, leader_name, date))
    if own is not None:
        return own
    return leader_cutoffs.wire(
        leader_cutoffs.active(db, leader_id, leader_name, date))


def wire_in(excl: dict, cuts: dict,
            leader_id: int | None, leader_name: str | None,
            date: str, cell_id: int | None = None) -> dict | None:
    """`wire_for` off two preloaded maps — what the register builds every row with.

    A deliberate twin, and the precedence lives here ONCE for both: the register
    (this) and the day-report page (`wire_for`) must never disagree about which
    of the two decisions a day is carrying, or a leader reads one story on the
    list and another on the report the list links to.
    """
    own = wire(for_row(excl, key(leader_id, leader_name, date), cell_id))
    if own is not None:
        return own
    return leader_cutoffs.wire(
        leader_cutoffs.hit(cuts, leader_id, leader_name, date))


def wire(e: LeaderDayExclusion | None) -> dict | None:
    """What a register row carries about its own exclusion. None when it counts.

    The reason travels with the flag on purpose: the people whose number moved
    are shown this, and «does not count» without a why is the unexplainable
    score change the whole feature exists to avoid.
    """
    if e is None:
        return None
    return {
        "reason": e.reason or "",
        "by": e.set_by or None,
        "at": e.set_at.isoformat() if e.set_at else None,
        "score": float(e.score_at) if e.score_at is not None else None,
    }


def orphan_rows(db: Session, excl: dict[str, LeaderDayExclusion],
                covered: set[str], *,
                sup_display: dict[int, str] | None = None,
                manager_ids: set[int] | None = None,
                leader_ids: set[int] | None = None) -> list[dict]:
    """Register rows for excluded days that NOTHING was ever filed on.

    The register is built from what was submitted — sheet rows and closed bot
    days — so a day a leader never filed has no row anywhere, and until this
    existed an exclusion on one was a record no reader could see. That mattered
    arithmetically, not just cosmetically: the score is Σ of filed-day means ÷
    the CALENDAR days of the period, so an unfiled day already costs its leader
    a full slot, and the client drops a day from that denominator only when it
    is handed a row carrying `excluded`. Writing the decision without the row
    left the number exactly where it was.

    **The register still does not invent days.** One row appears here per
    exclusion an admin explicitly recorded, and not one more: this is the
    materialisation of a human decision about a named day, never a projection of
    "every day nobody filed". Lift the exclusion and the row goes with it.

    `covered` is every leader-day key the real rows already carry, so a day that
    WAS filed keeps its own row and can never be shown twice.

    Scoped exactly as the two filed layers are — `manager_ids` for a supervisor,
    `leader_ids` for a leader — and for the same reason the bot rows are: these
    rows move the denominator, so a viewer who is not handed them would read a
    different mean for themselves than everyone else reads for them. A
    name-keyed exclusion (an unlinked leader, whose sheet row a later Refresh
    dropped) resolves to no profile and therefore no unit, so it reaches only
    the viewers who are not narrowed at all.
    """
    pending = [e for k, e in excl.items() if k not in covered]
    if not pending:
        return []

    pids = {int(e.leader_profile_id) for e in pending if e.leader_profile_id}
    profs = ({p.id: p for p in db.query(RoleProfile)
              .filter(RoleProfile.id.in_(pids)).all()} if pids else {})
    units = {int(e.manager_id) for e in pending if e.manager_id}
    units |= {int(p.manager_id) for p in profs.values() if p.manager_id}
    mgrs = ({m.id: m for m in db.query(Manager)
             .filter(Manager.id.in_(units)).all()} if units else {})

    out: list[dict] = []
    for e in pending:
        pid = int(e.leader_profile_id) if e.leader_profile_id else None
        prof = profs.get(pid) if pid else None
        # The unit as the DECISION recorded it, falling back to the leader's own
        # profile. `manager_id` is snapshotted on the exclusion precisely so a
        # later transfer cannot move a day that has already left the results.
        unit = e.manager_id or (prof.manager_id if prof else None)
        unit = int(unit) if unit else None
        mgr = mgrs.get(unit) if unit else None
        if manager_ids is not None and (unit is None or unit not in manager_ids):
            continue
        if leader_ids is not None and (pid is None or pid not in leader_ids):
            continue
        out.append({
            "uid": f"excl-{e.id}",
            # Neither layer filed it. `missing` is what every reader tests —
            # inferring it from an empty task list would make a report whose
            # questions were all unasked look like a day nobody worked.
            "source": "none",
            "missing": True,
            "date": str(e.date)[:10],
            "submitted_at": None,
            # The SHEET's spelling of the unit, like every other row: a unit
            # that reached the standings under two names splits its own row.
            "supervisor": ((sup_display or {}).get(unit)
                           or (mgr.name if mgr else None)),
            "shift": mgr.shift if mgr else None,
            # The filing window has nothing to say about a day with no filing,
            # and an exclusion outranks it in any case.
            "rejected": False,
            "late_state": None,
            "late_by": None,
            "late_at": None,
            "late_reason": None,
            "excluded": wire(e),
            "leader_id": pid,
            # The profile's canonical name where there is one — the same key the
            # filed rows group by, so this day joins that person's history
            # instead of opening a second one beside it.
            "leader": (prof.name if prof else None) or e.leader_name or "",
            "manager_id": unit,
            # Nothing was filed, so there is no score. Zero is the arithmetic
            # floor and NOT the fact: the row is excluded, so no consumer scores
            # it, and the register prints «—» rather than a 0% nobody earned.
            "completion": 0.0,
            "tasks": [],
        })
    out.sort(key=lambda r: (str(r["date"]), str(r["leader"])), reverse=True)
    return out


# ── writing ──────────────────────────────────────────────────────────────────

def exclude(db: Session, *, leader_id: int | None, leader_name: str | None,
            date: str, manager_id: int | None, reason: str,
            score: float | None, actor: str | None) -> tuple[LeaderDayExclusion, bool]:
    """Take one leader-day out of the results. `(row, created)`.

    Re-excluding an already-excluded day UPDATES its reason rather than failing:
    the operator is correcting what they wrote, and a unique-key error on the
    second attempt would read as "the day is not excluded".
    """
    k = key(leader_id, leader_name, date)
    row = db.query(LeaderDayExclusion).filter_by(leader_key=k).first()
    created = row is None
    if row is None:
        row = LeaderDayExclusion(leader_key=k, date=str(date)[:10])
        db.add(row)
    row.leader_profile_id = int(leader_id) if leader_id else None
    row.leader_name = (leader_name or "")[:160] or None
    row.manager_id = int(manager_id) if manager_id else None
    row.reason = (reason or "").strip()[:2000]
    row.score_at = float(score) if score is not None else row.score_at
    row.set_by = (actor or "")[:160] or None
    row.set_at = datetime.now(timezone.utc)
    return row, created


def lift(db: Session, *, leader_id: int | None, leader_name: str | None,
         date: str) -> LeaderDayExclusion | None:
    """Put one leader-day back into the results. The row it removed, or None."""
    row = row_for(db, leader_id, leader_name, date)
    if row is not None:
        db.delete(row)
    return row


def drop_pending_reviews(db: Session, leader_id: int | None, date: str) -> int:
    """Take an excluded day's work back OUT of the AI queue.

    Closing the doors stops NEW rows; it does nothing about what was queued
    before the admin excluded the day — and on an incident night those are
    exactly the rows in flight. Left alone they are spent on Gemini and then
    displayed on a day whose number counts nowhere.

    **Only never-judged rows go** — `reviewed_at IS NULL AND resolution IS NULL`,
    the same rule as the rehearsal purge and the paused-shift purge. A verdict
    already written is an answer somebody may have acted on, and a human ruling
    is that row's terminal state. Nothing is lost: `discover()` re-finds every
    ref the moment the exclusion is lifted.
    """
    if not leader_id:
        return 0
    n = (db.query(LeaderAiReview)
         .filter(LeaderAiReview.leader_id == int(leader_id),
                 LeaderAiReview.date == str(date)[:10],
                 LeaderAiReview.reviewed_at.is_(None),
                 LeaderAiReview.resolution.is_(None))
         .delete(synchronize_session=False))
    if n:
        logger.info("leader-exclusion: dropped %s queued review(s) for leader "
                    "%s on %s", n, leader_id, date)
    return int(n or 0)
