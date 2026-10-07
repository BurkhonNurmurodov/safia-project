"""A leader whose CHECKLIST runs on another shift than their unit's.

From 2026-10-05 (the operator): Jumaniyazov Sanjarbek leads a cell that works
shift 1 while the brigadir answerable for it is on shift 2. Everything about a
leader's checklist that runs on a clock used to follow the UNIT's shift
(`Manager.shift`) — so his checklist day opened at 17:00 and shut at 09:00, his
photos were judged against night windows and his automatic checks fired at
night. A profile may now name the shift its checklist runs on, from a date on
(`role_profiles.checklist_shift`, set on the admin profile page).

**THE definition.** On a day whose shift differs from the unit's, every one of
these follows the LEADER's shift: which checklist date a moment belongs to
(`leader_tasks.day_of`), when the day closes (`expired_through`,
`deadline_hhmm`), each task's window, deadline and closing hour, the hours the
AI judges a photo against (`leader_ai.window_offset`), and the hour each
automatic check fires. What does NOT follow it, deliberately:

* the unit the leader BELONGS to — the brigadir's day digest, concerns, the
  загрузка, the Monitoring ranking pool;
* which collection LAYER the unit files in (`leader_bot.merges` and
  `training`): that is a fact about the unit's form, never about one person.

**Settings on such a day.** The unit's own level of the chain describes the
unit's shift — its windows are night windows — so it is REPLACED by that
shift's STANDARD (`standard`): per task and field, the value most of that
shift's units resolve to. That is exactly how «Chek-list sozlamalari» derives
its «Smena N» level (`shiftTpl` in LeaderTasksAdmin.jsx), so the leader reads
what the page calls the shift's rule, and follows it when an admin changes it.
The leader's OWN level still applies, except a window or deadline that cannot
be worked on the day's shift (it was written for the old one).

**Dated, so history never moves.** The timeline says from which checklist date
a shift is in force; every day before keeps the unit's shift. A verdict the
boot re-derive walks (`leader_ai.sync_date_flags`) is judged by the shift of
ITS day, so switching a leader re-scores nothing that was filed before.

A leader with no timeline — everybody else — short-circuits on the first line
of every function here and reads exactly what they read before.
"""
from __future__ import annotations

import json
import time
from datetime import date as _date, datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy.orm import Session

from app.models import LeaderTaskDef, Manager, RoleProfile

TZ = timezone(timedelta(hours=5))
SHIFTS = (1, 2)

# Overrides are read once and kept briefly: a switch takes effect from a FUTURE
# date (tomorrow at the earliest), so a 30-second lag is never a wrong answer,
# while a query per resolution would cost every checklist read on the platform
# one round trip for a feature that touches a handful of people.
_TTL_S = 30.0
_OVER: dict = {"at": 0.0, "map": {}}
_TPL: dict[int, tuple[float, dict]] = {}
_TPL_TTL_S = 60.0
_UNITS: dict = {"at": 0.0, "map": {}}


def forget() -> None:
    """Drop the cached timelines, standards and unit shifts — after a profile save."""
    _OVER["at"] = 0.0
    _TPL.clear()
    _UNITS["at"] = 0.0


def _norm(shift) -> int:
    """A unit's shift as a checklist reads it: 1 or 2, unknown → 1 (the
    calendar day — what `_lt_shift` has always fallen back to)."""
    return shift if shift in SHIFTS else 1


def _day(v) -> str | None:
    s = str(v or "")[:10]
    try:
        _date.fromisoformat(s)
    except ValueError:
        return None
    return s


def timeline(value) -> list[dict]:
    """The stored timeline, cleaned and oldest first. An entry whose date does
    not parse is dropped rather than guessed at; `shift` None = the unit's."""
    out = []
    for e in value or []:
        if not isinstance(e, dict):
            continue
        d = _day(e.get("from"))
        if d is None:
            continue
        sh = e.get("shift")
        out.append({**e, "from": d, "shift": sh if sh in SHIFTS else None})
    out.sort(key=lambda e: e["from"])
    return out


def own_shift(entries: list[dict], day) -> int | None:
    """The shift the timeline names for checklist date `day`, or None = the
    unit's. The last entry whose `from` is on or before the day wins."""
    d = str(day or "")[:10]
    got = None
    for e in entries:
        if e["from"] <= d:
            got = e["shift"]
        else:
            break
    return got


def _overrides(db: Session) -> dict[int, list[dict]]:
    """leader profile id → timeline, for the few leaders that carry one."""
    now = time.monotonic()
    if now - _OVER["at"] < _TTL_S:
        return _OVER["map"]
    out: dict[int, list[dict]] = {}
    # Its OWN session: this is asked from inside other writers' transactions
    # (a day being closed, a verdict being written), and neither a flush of
    # their pending rows nor a rollback on a failed read may reach them.
    from app.database import SessionLocal
    own = SessionLocal()
    try:
        for pid, val in (own.query(RoleProfile.id, RoleProfile.checklist_shift)
                         .filter(RoleProfile.checklist_shift.isnot(None)).all()):
            tl = timeline(val)
            if any(e["shift"] is not None for e in tl):
                out[int(pid)] = tl
    except Exception:
        # A box whose migration has not run reads as "nobody moved" — the
        # behaviour every leader had before this existed.
        out = {}
    finally:
        own.close()
    _OVER["map"], _OVER["at"] = out, now
    return out


def has_any(db: Session) -> bool:
    return bool(_overrides(db))


def moved_ids(db: Session) -> list[int]:
    """Every leader profile that carries a timeline."""
    return list(_overrides(db))


def moved(db: Session, leader_id) -> bool:
    """Does this leader carry a timeline at all? False for everybody else, and
    then nothing below needs asking."""
    return bool(leader_id) and int(leader_id) in _overrides(db)


def _unit_shifts(db: Session) -> dict[int, int]:
    """manager id → shift for every unit, read once and kept `_TTL_S` like
    `_overrides` (its own session, for the same reason). `unit_shift` is asked
    once per verdict of a moved leader in every corpus walk (`chain` from
    `leader_ai.sync_date_flags`), and a query per call cost the leaders-sheet
    Refresh ~3 s of its 19 s on 2026-10-07 («Server was slow»). A unit's shift
    is edited on the admin profile page, which calls `forget()`."""
    now = time.monotonic()
    if now - _UNITS["at"] < _TTL_S:
        return _UNITS["map"]
    from app.database import SessionLocal
    own = SessionLocal()
    try:
        out = {int(mid): _norm(sh) for mid, sh in own.query(Manager.id, Manager.shift).all()}
    except Exception:
        return _UNITS["map"]          # keep what is held; the next call reads again
    finally:
        own.close()
    _UNITS["map"], _UNITS["at"] = out, now
    return out


def unit_shift(db: Session, manager_id) -> int:
    if not manager_id:
        return 1
    try:
        mid = int(manager_id)
    except (TypeError, ValueError):
        return _norm(db.query(Manager.shift).filter(Manager.id == manager_id).scalar())
    units = _unit_shifts(db)
    if mid not in units:
        # A unit the map does not hold (created since it was read): one query,
        # exactly as before, and its answer kept for the map's lifetime.
        units[mid] = _norm(db.query(Manager.shift).filter(Manager.id == mid).scalar())
    return units[mid]


def shift_on(db: Session, leader_id, day, unit_sh) -> int:
    """The shift leader `leader_id`'s checklist for date `day` runs on, given
    their unit's shift. Everybody without a timeline: the unit's shift."""
    unit = _norm(unit_sh)
    tl = _overrides(db).get(int(leader_id)) if leader_id else None
    if not tl:
        return unit
    got = own_shift(tl, day)
    return got if got in SHIFTS else unit


def day_shift(db: Session, leader_id, day, unit_sh):
    """The shift to STAMP on something filed for this leader-day (a review row,
    a report): `shift_on` for a moved leader, and the unit's value exactly as
    it was — None included — for everybody else, so no stored row changes."""
    if leader_id and moved(db, leader_id):
        return shift_on(db, leader_id, day, unit_sh)
    return unit_sh


def shifted(db: Session, leader_id, day, unit_sh) -> int | None:
    """The day's shift when it is NOT the unit's, else None — the one test every
    reader that swaps the unit's settings for a shift's standard asks."""
    if not leader_id or not _overrides(db):
        return None
    sh = shift_on(db, leader_id, day, unit_sh)
    return sh if sh != _norm(unit_sh) else None


def _opens(shift: int, day: str) -> datetime:
    """When checklist date `day` of `shift` starts being WORKED, Tashkent."""
    from app.services import leader_ai
    lo = leader_ai.shift_window(shift)[0]
    d = _date.fromisoformat(day)
    return datetime(d.year, d.month, d.day, int(lo[:2]), int(lo[3:5]), tzinfo=TZ)


def current(db: Session, prof, now: datetime | None = None) -> tuple[int, str]:
    """`(shift, date)` of the checklist this leader is filing RIGHT NOW.

    Without a timeline: the unit's shift and its effective date — exactly what
    `_lt_shift` + `effective_date` always answered. With one, each shift's
    current date is a candidate when the timeline puts that date on that shift;
    across a switch both can be (a night still running while the new day
    shift's date has begun), and the one whose WORK started most recently wins
    — so a night is not cut off at midnight and a day shift takes over when
    its hours begin. With no candidate (the gap a switch to the night shift
    leaves) the day is the next one to open.
    """
    from app.services import leader_tasks
    unit = unit_shift(db, getattr(prof, "manager_id", None))
    tl = _overrides(db).get(int(prof.id)) if getattr(prof, "id", None) else None
    if not tl:
        return unit, leader_tasks.effective_date(unit, now)
    now = now or datetime.now(timezone.utc)
    here = now.astimezone(TZ)
    cands = []
    for sh in SHIFTS:
        d = leader_tasks.effective_date(sh, now)
        if shift_on(db, prof.id, d, unit) == sh:
            cands.append((_opens(sh, d), sh, d))
    started = [c for c in cands if c[0] <= here]
    if started:
        _, sh, d = max(started)
        return sh, d
    if cands:
        _, sh, d = min(cands)
        return sh, d
    # The gap: no shift's current date is on that shift. Whatever the calendar
    # day is filed under decides; the pair stays one `effective_date` answers,
    # because every caller derives the date from the shift it is handed.
    sh = shift_on(db, prof.id, leader_tasks.effective_date(1, now), unit)
    return sh, leader_tasks.effective_date(sh, now)


# ── the shift's standard ─────────────────────────────────────────────────────

_NAME_LANGS = ("uz", "uz_cyrl", "ru", "en")


def standard(db: Session, shift: int) -> dict[int, SimpleNamespace]:
    """task_id → the shift's STANDARD as a supervisor-level row: per field, the
    value most of the shift's units resolve to (global ⊕ unit), ties to the
    unit with the lowest id. The admin page's «Smena N» level, server-side.

    Rows carry RESOLVED values, so layered over the global catalog they answer
    exactly those values — the resolvers walk them like any other level."""
    now = time.monotonic()
    hit = _TPL.get(shift)
    if hit and now - hit[0] < _TPL_TTL_S:
        return hit[1]
    from app.services import leader_tasks
    units = (db.query(Manager.id)
             .filter(Manager.shift == shift, Manager.archived.is_(False))
             .order_by(Manager.id).all())
    defs = db.query(LeaderTaskDef).all()
    out: dict[int, SimpleNamespace] = {}
    if units:
        raws = [leader_tasks.effective_settings(db, mid, day=None) for (mid,) in units]
        for td in defs:
            g = leader_tasks.global_level(td)
            res = [leader_tasks.resolve_over(g, raw.get(td.id)) for raw in raws]
            pick = {}
            for f in leader_tasks.OWN_FIELDS:
                counts: dict[str, int] = {}
                for r in res:
                    k = json.dumps(r.get(f), sort_keys=True, ensure_ascii=False)
                    counts[k] = counts.get(k, 0) + 1
                best = max(counts.items(), key=lambda kv: kv[1])[0] if counts else "null"
                pick[f] = json.loads(best)
            names = pick.pop("names", None) or {}
            out[td.id] = SimpleNamespace(
                task_id=td.id, manager_id=None, standard_shift=shift,
                **{f"name_{l}": names.get(l) for l in _NAME_LANGS}, **pick)
    _TPL[shift] = (now, out)
    return out


def _clock_in_shift(shift: int, clock: str) -> bool:
    from app.services import leader_ai
    lo, hi = leader_ai.shift_window(shift)
    return lo <= clock <= hi if lo < hi else (clock >= lo or clock <= hi)


class _Masked:
    """A leader-level row with the clocks that cannot be worked on the day's
    shift read as "inherit"."""
    __slots__ = ("_row", "_drop")

    def __init__(self, row, drop):
        self._row, self._drop = row, frozenset(drop)

    def __getattr__(self, k):
        if k in self._drop:
            return None
        return getattr(self._row, k)


def chain(db: Session, *, leader_id, manager_id, day, task_id, own, sup,
          unit_sh=None):
    """`(own, sup, shift)` — the leader- and supervisor-level rows a resolver
    must walk for this leader's task on checklist date `day`, and the shift.

    Unshifted (everybody without a timeline): handed back untouched, with the
    unit's shift. Shifted: the unit level is the shift's standard, and the
    leader's own clocks are dropped where they do not fit that shift."""
    if unit_sh is None:
        unit_sh = unit_shift(db, manager_id)
    sh = shifted(db, leader_id, day, unit_sh)
    if sh is None:
        return own, sup, _norm(unit_sh)
    tpl = standard(db, sh).get(task_id)
    if own is not None:
        from app.services import leader_ai
        drop = []
        if getattr(own, "win_from", None) or getattr(own, "win_to", None):
            win = leader_ai.resolve_window(sh, own, tpl)
            if not leader_ai.window_fits_shift(sh, win):
                drop += ["win_from", "win_to"]
        dl = leader_ai.hhmm(getattr(own, "deadline", None))
        if dl and not _clock_in_shift(sh, dl):
            drop.append("deadline")
        if drop:
            own = _Masked(own, drop)
    return own, tpl, sh


class AsShift:
    """A unit read as running on `shift` — handed to the code that works a
    moved leader's day the way it works their unit's (the automatic checks),
    so every `.shift` it reads is the leader's and everything else the unit's."""
    __slots__ = ("_unit", "shift")

    def __init__(self, unit, shift):
        self._unit = unit
        self.shift = shift

    def __getattr__(self, k):
        return getattr(self._unit, k)


# ── the switch ───────────────────────────────────────────────────────────────

def info(prof, unit_sh=None, today: str | None = None) -> dict:
    """What the profile page shows: the shift in force today, a switch still
    waiting for its date, and the history."""
    tl = timeline(getattr(prof, "checklist_shift", None))
    today = today or datetime.now(TZ).date().isoformat()
    now_sh = own_shift(tl, today)
    upcoming = next((e for e in tl if e["from"] > today), None)
    return {
        "value": now_sh,                          # None = the unit's shift
        "unit_shift": unit_sh,
        "next": ({"from": upcoming["from"], "shift": upcoming["shift"]}
                 if upcoming else None),
        "history": [{"from": e["from"], "shift": e["shift"],
                     "at": e.get("at"), "by": e.get("by")} for e in tl],
    }


def set_from(prof, shift, start: str, *, by: str | None = None) -> bool:
    """Put `shift` (1 | 2 | None = the unit's) in force from checklist date
    `start` on. Entries dated on or after `start` are replaced — a later
    switch supersedes one still waiting. False when nothing changes."""
    shift = shift if shift in SHIFTS else None
    tl = timeline(getattr(prof, "checklist_shift", None))
    kept = [e for e in tl if e["from"] < start]
    if own_shift(kept, start) == shift:
        if len(kept) == len(tl):
            return False                 # already in force from that date
        new = kept                       # a switch still waiting is withdrawn
    else:
        new = kept + [{"from": start, "shift": shift,
                       "at": datetime.now(TZ).isoformat(timespec="minutes"),
                       "by": by}]
    # A NEW list, never an in-place edit: JSONB is only marked dirty on assignment.
    prof.checklist_shift = new or None
    forget()
    return True


def tomorrow() -> str:
    """The first checklist date a switch made now may reach. Never today: the
    leader may be mid-checklist, and a day's shift is what decides its date,
    its windows and its close."""
    return (datetime.now(TZ).date() + timedelta(days=1)).isoformat()
