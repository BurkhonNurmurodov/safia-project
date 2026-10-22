"""When a brigadir may CLOSE a unit-day — the clock before which the close is
refused (the operator, 2026-10-22: «S1 only after 12:00, S2 only after 23:00»).
Everything that asks "may this day be closed yet" goes through this module.

**One clock per shift.** Tashkent wall clock, "HH:MM", in ``AppSetting`` under
:data:`KEYS`, edited on «Smena vaqtlari» beside the shift hours. A missing or
unreadable row reads as :data:`FALLBACK` (12:00 / 23:00), so nothing is seeded:
the fallback IS the operator's rule, not a placeholder.

**Which date the clock is on.** Shift-day D opens at its shift's start on D —
`cell_hours.defaults`, the very frame `verifix_live.day_frame` names the day
by. The close opens at the FIRST time the clock comes round at or after that
start: S1 (08:00) at 12:00 → D 12:00, S2 (20:00) at 23:00 → D 23:00, the
operator's two examples. A clock earlier than the start (S2 at 01:00) is the
next morning, D+1 — never a moment before the shift began.

**Whom it binds.** A SUPERVISOR only (the operator's ruling): an admin closing
for a unit is never held by it. It sits ON TOP of the live checks (nobody
inside, on a break or due, every check-out answered, every worker in a cell) —
it never replaces one. A day before `live_day.LIVE_FROM` is long past its clock,
so the file-day close never meets it.
"""
from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, Manager
from app.services import cell_hours
from app.services.leader_ai import hhmm  # THE clock normaliser — never re-spelled
from app.services.verifix import TZ

KEYS = {1: "day_close_after_shift_1", 2: "day_close_after_shift_2"}
FALLBACK = {1: "12:00", 2: "23:00"}

__all__ = ["KEYS", "FALLBACK", "defaults", "set_default", "opens_at", "lock", "refusal"]


def _min(v: str) -> int:
    h, m = v.split(":")
    return int(h) * 60 + int(m)


def defaults(db: Session) -> dict[int, str]:
    """{1: "12:00", 2: "23:00"} — each shift's close clock."""
    rows = {r.key: r.value for r in
            db.query(AppSetting).filter(AppSetting.key.in_(list(KEYS.values()))).all()}
    return {shift: hhmm(rows.get(key)) or FALLBACK[shift] for shift, key in KEYS.items()}


def set_default(db: Session, shift: int, clock: str) -> str:
    """Write one shift's close clock. Does NOT commit: the caller owns the
    transaction (and its audit line)."""
    if shift not in KEYS:
        raise ValueError("shift must be 1 or 2")
    c = hhmm(clock)
    if not c:
        raise ValueError("clock")
    row = db.query(AppSetting).filter_by(key=KEYS[shift]).first()
    if row:
        row.value = c
    else:
        db.add(AppSetting(key=KEYS[shift], value=c))
    return c


def opens_at(db: Session, shift: Optional[int], day: date) -> datetime:
    """The moment shift-day `day` may first be closed (Tashkent, aware). A unit
    with no shift is shift 1 — the `day_frame` rule its day is named by."""
    s = shift if shift in KEYS else 1
    clock = defaults(db)[s]
    start = (cell_hours.defaults(db).get(s) or cell_hours.FALLBACK[s])[0]
    on = day + timedelta(days=1 if _min(clock) < _min(start) else 0)
    return datetime.combine(on, time(*map(int, clock.split(":"))), tzinfo=TZ)


def lock(db: Session, caller: Optional[dict], manager_id: Optional[int], day: Optional[date],
         now: Optional[datetime] = None) -> Optional[dict]:
    """None when this caller may close the day now; otherwise what the page and
    the refusal name. Only a supervisor is ever locked."""
    if (caller or {}).get("role") != "supervisor" or not manager_id or day is None:
        return None
    unit = db.query(Manager).filter(Manager.id == manager_id).first()
    if not unit:
        return None
    at = opens_at(db, unit.shift, day)
    now = now or datetime.now(TZ)
    if now >= at:
        return None
    return {
        "close_from": at.strftime("%H:%M"),
        "opens_at": at.isoformat(),
        # The date is named only when the clock falls on the next morning.
        "opens_on": None if at.date() == day else at.date().isoformat(),
        # +1: a page that re-asks exactly then must not land a second early.
        "opens_in_s": int((at - now).total_seconds()) + 1,
    }


def refusal(lk: dict) -> str:
    """The close's 409 text — Uzbek, like every other close refusal
    (`routers/staff_live.close_day`); the page names the same clock itself."""
    if lk.get("opens_on"):
        d = date.fromisoformat(lk["opens_on"]).strftime("%d.%m.%Y")
        return f"Kunni {d} soat {lk['close_from']} dan keyin yopish mumkin."
    return f"Kunni soat {lk['close_from']} dan keyin yopish mumkin."
