"""
The ORIGINAL-brigadir basis for attendance charts.

An approved people-exchange REWRITES attendance rows, and all three of its
paths destroy the answer to an attendance question:

  → supervisor  the worker's row is reassigned to the receiving unit, so the
                brigadir whose list they are on loses them and the borrower
                gains someone they never had to get out of bed;
  → task        the row stays put but the day is zeroed (clock «X», hours 0),
                which every «came» filter reads as a no-show;
  split, below-min
                a worker who cleared MIN_MOVED_ZAGRUZKA_HOURS on neither side
                of a transfer time loses their NAME off the row altogether, so
                they vanish from both rosters.

That is correct for the load — the receiving unit really did have those hands,
and hours that went to a task are not the unit's hours. It is wrong for
attendance, which asks one question only: of the people on this brigadir's own
list, how many turned up. Exchanges are decided by supervisors and admins AFTER
the fact, so scoring the brigadir on them makes the metric a record of other
people's paperwork.

Nothing here is a second source of truth: every exchange already stores what it
overwrote — `old_manager_id` per employee, plus a full `snapshot` on the two
paths that touch hours (→ task, and any transfer-time split). This module
replays those backwards in memory. It writes nothing, and it is deliberately
confined to the /workers charts: the attendance record itself — the Staff page,
the загрузка, the exports — keeps showing where a worker actually spent the day.

Usage is a NAME PARTITION, not a patch: `original_rows` returns the names it
reconstructed, the caller EXCLUDES those names from its SQL aggregation and
folds the returned rows in with plain Python counting. The two name sets are
disjoint, so distinct counts merge by addition with nothing double-counted.
"""

from datetime import date as date_t
from typing import List, NamedTuple, Optional, Set, Tuple

from sqlalchemy.orm import Session

from app.models import Attendance, HrDocument


class OriginalRow(NamedTuple):
    """One attendance row as it stood before any exchange touched it."""
    manager_id: int          # the unit the worker STARTED the day on
    date: date_t
    worker_name: str
    job_title: Optional[str]
    hours_worked: Optional[float]
    clock_in_out: Optional[str]
    is_supervisor: bool


def original_rows(
    db: Session, date_from: date_t, date_to: date_t
) -> Tuple[Set[str], List[OriginalRow]]:
    """Every attendance row that an approved exchange touched in the period,
    rewound to its pre-exchange state.

    Returns `(names, rows)`:
      names — the worker names involved in ANY exchange in the period. The
              caller must exclude exactly this set from its own SQL, or the
              rows below are counted twice.
      rows  — those workers' days, on the unit they began on, with the hours
              the exchange overwrote. A name in `names` that also belongs to
              someone the exchange never touched (a namesake in another unit,
              a day outside the exchange's date) is passed through UNCHANGED —
              the set is a partition of the name space, not a list of edits.
    """
    docs = (
        db.query(HrDocument)
        .filter(
            HrDocument.doc_type == "people_exchange",
            HrDocument.status == "approved",
            HrDocument.date >= date_from,
            HrDocument.date <= date_to,
        )
        .order_by(HrDocument.id)
        .all()
    )

    origin:  dict[tuple, int] = {}          # (date, name) → the unit they began on
    restore: dict[tuple, dict] = {}         # (date, name) → pre-exchange snapshot
    seats:   dict[tuple, set] = {}          # (date, name) → units the row may sit on now
    blanked: set = set()                    # (date, name) whose row lost its name

    for doc in docs:
        payload = doc.payload or {}
        target  = payload.get("target_manager_id")
        for emp in payload.get("employees") or []:
            name = (emp or {}).get("worker_name")
            if not name:
                continue
            key    = (doc.date, name)
            sender = emp.get("old_manager_id") or doc.manager_id
            # Documents are replayed in creation order, and one can only be
            # written against a worker who is ON the sending unit — so the FIRST
            # document to move this worker on this day names their real origin.
            # A second hop (A→B→C) must not re-home them on B.
            origin.setdefault(key, sender)
            # Same reason for the snapshot: the earliest one is the untouched day.
            # A plain → supervisor move stores none (it moves the row intact), so
            # a key may legitimately have an origin and no restore state.
            snap = emp.get("snapshot")
            if snap and key not in restore:
                restore[key] = snap
            seats.setdefault(key, set()).update({origin[key], sender})
            if target:
                seats[key].add(target)
            # Both blanking paths (→ task majority, and below-min on either
            # target type) carry this flag; it is popped on revert, and a
            # reverted document is no longer approved.
            if (emp.get("applied") or {}).get("task_blanked"):
                blanked.add(key)

    names = {name for _d, name in origin}
    if not names:
        return set(), []

    rows: List[OriginalRow] = []
    found: set = set()
    q = db.query(
        Attendance.manager_id, Attendance.date, Attendance.worker_name,
        Attendance.job_title, Attendance.hours_worked, Attendance.clock_in_out,
        Attendance.is_supervisor,
    ).filter(
        Attendance.date >= date_from,
        Attendance.date <= date_to,
        Attendance.worker_name.in_(list(names)),
    )
    for mgr, d, name, job, hours, clock, is_sup in q.all():
        key  = (d, name)
        home = origin.get(key)
        # Only a row sitting where the exchange could have left it is rewound.
        # Anything else carrying the same name — another day, another unit — is
        # a different person's row and passes through untouched.
        if home is not None and mgr in seats.get(key, ()):
            found.add(key)
            snap = restore.get(key)
            if snap:
                job   = snap.get("job_title")
                hours = snap.get("hours_worked")
                clock = snap.get("clock_in_out")
            mgr = home
        rows.append(OriginalRow(
            mgr, d, name, job,
            float(hours) if hours is not None else None,
            clock, bool(is_sup),
        ))

    # A blanked worker has no named row left to rewind on either unit, so the
    # snapshot IS the row. Skipped when one was found anyway — a re-upload can
    # bring the named row back while the document still says it blanked it.
    for key in blanked:
        if key in found:
            continue
        d, name = key
        snap = restore.get(key) or {}
        rows.append(OriginalRow(
            origin[key], d, name, snap.get("job_title"),
            snap.get("hours_worked"), snap.get("clock_in_out"), False,
        ))

    return names, rows
