"""
THE definition of "the idle-cell day is shut" — one answer, read by every
writer on `/idle-cell` and by the page that renders it.

The lock is NOT a second closing. A brigadir already closes their day on the
Daily page, and that `DayApproval` row is what stops attendance being edited
behind everyone's back; an ojidaniya filed against a closed day would change a
number the unit has already signed off. So this module reads the EXISTING
ladder — `services/day_state.day_state` — instead of inventing an idle-cell
closing of its own. A second switch would let the two disagree, and there is no
way to render "the day is closed but also open".

Two rules follow from that, and both are load-bearing:

* **Only `open` may be written.** `closed` (signed off, requests still in
  review) and `confirmed` (signed off and settled) are equally final here —
  the difference between them is about attendance paperwork, not about whether
  the day's downtime may still be rewritten.
* **An unassigned cell is always writable.** Its `manager_id` is None, so there
  is no unit whose day could be closed and nothing to re-open; refusing there
  would strand rows nobody could ever fix. Same early return as
  `routers/attendance_batch._require_open_day`, whose 409 shape this reuses so
  the frontend maps ONE `day_closed` code.

`pending_requests_for` points the other way: it is what lets `POST
/api/staff/daily/close` refuse a day that still holds undecided idle-cell
requests, so closing can never bury a leader's request unanswered.
"""
from datetime import date as date_t
from typing import Optional, Union

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app import identity
from app.capabilities import CAP_DAY_REOPEN, cap_scope, profile_unit_ids
from app.models import Cell, CellOjidaniyaInterval, Manager
from app.services.day_state import day_state


def _as_date(d: Union[str, date_t]) -> date_t:
    """Callers hand us whatever they hold — the router has the ISO string it was
    given, `staff.close_day` has already parsed one."""
    return d if isinstance(d, date_t) else date_t.fromisoformat(d)


def _as_iso(d: Union[str, date_t]) -> str:
    """`cell_ojidaniya_intervals.date` is stored as ISO text, so the count below
    compares strings — never a date object, which would match nothing."""
    return d if isinstance(d, str) else d.isoformat()


def _can_reopen(db: Session, payload: Optional[dict], manager_id: Optional[int]) -> bool:
    """Mirror of `routers/staff.py::_cap_covers_unit` for `CAP_DAY_REOPEN`.

    Deliberately re-implemented rather than imported: staff.py is a router that
    pulls in half the app, and a service imported by that same router cannot
    import it back at module load without a cycle. The rule is the one the
    capability defines — admin always, an "all" grant always, an "own" grant
    only for the units the grantee's own row scoping already covers — so the
    two stay in step for the same reason two callers of `cap_scope` do.
    """
    if not payload:
        return False
    if payload.get("role") == "admin":
        return True
    scope = cap_scope(db, payload, CAP_DAY_REOPEN)
    if scope is None:
        return False
    if scope == "all":
        return True
    units = profile_unit_ids(db, identity.viewer_profile_key(db, payload))
    return units is None or manager_id in units


def day_info(db: Session, manager_id: Optional[int], d_str: Union[str, date_t],
             payload: Optional[dict] = None) -> dict:
    """The day's lock as the page needs it: what state it is in, who shut it,
    whether this caller may still write, and whether they could re-open it.

    `can_reopen` travels WITH the closed state on purpose — a read-only banner
    that cannot say who may lift the lock leaves the brigadir guessing which
    admin to ask.
    """
    if not manager_id:
        return {
            "state": "open", "closed": False, "closed_by": None, "closed_at": None,
            "can_reopen": False, "can_write": True,
        }
    state, closure, _counts = day_state(db, manager_id, _as_date(d_str))
    return {
        "state":      state,          # open | closed | confirmed
        "closed":     closure is not None,
        "closed_by":  closure.approved_by_name if closure else None,
        "closed_at":  closure.approved_at.isoformat() if closure and closure.approved_at else None,
        "can_reopen": _can_reopen(db, payload, manager_id),
        "can_write":  state == "open",
    }


def require_open(db: Session, manager_id: Optional[int], d_str: Union[str, date_t]) -> None:
    """Guard for every idle-cell write. A closed day is immutable — an admin
    re-opens it first. Unassigned cells have no day to close."""
    if not manager_id:
        return
    state, _closure, _counts = day_state(db, manager_id, _as_date(d_str))
    if state == "open":
        return
    mgr = db.query(Manager).filter(Manager.id == manager_id).first()
    raise HTTPException(
        status_code=409,
        detail={
            "code": "day_closed",
            "manager_id": manager_id,
            "manager_name": mgr.name if mgr else str(manager_id),
            "state": state,
        },
    )


def pending_requests_for(db: Session, manager_id: Optional[int], d: Union[str, date_t]) -> int:
    """Undecided idle-cell requests on this unit-day.

    The unit is the CELL's (`Cell.manager_id`) — the same single place the plant
    dimension hangs off — so a request follows whichever brigadir actually owns
    the cell, not whoever filed it.
    """
    if not manager_id:
        return 0
    return db.query(CellOjidaniyaInterval).join(
        Cell, Cell.id == CellOjidaniyaInterval.cell_id
    ).filter(
        Cell.manager_id == manager_id,
        CellOjidaniyaInterval.date == _as_iso(d),
        CellOjidaniyaInterval.status == "pending",
    ).count()
