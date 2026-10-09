"""The LIVE «Verifix to'g'irlash» day — /staff's rows, built from Verifix.

From `live_day.LIVE_FROM` (2026-10-06) /staff reads every shift-day LIVE: a
unit's day is the STORED live read (`live_verifix_reads`, a job reads Verifix
every minute — `verifix_live`) folded into /staff's row shape: worker, role,
cell, schedule, clock in · clock out, hours, early arrival, effective hours,
plus what only a live source can say (status, late, early leave, a missing
check-out). The documents live in their own tables (`LiveDocument`,
`LiveDeletion`, `LivePlacement`); the brigadir's close copies the day into
`attendance` + `DayApproval` (`live_projection`), which is how the загрузка
reaches it. Built first as the lab page /staff-live (2026-10-04), which was
retired once /staff read live days itself (2026-10-06).

**Nothing is applied — every document is READ on every request.** /staff
applies an approved document to `attendance` once and reverts it on cancel.
The live day cannot be written: it is re-read every minute and a worker still
inside keeps working. So this module takes the day as Verifix tells it and
lays every approved document over it, from scratch, each time — which is what
lets the people-exchange rule below follow the clock.

**A people-exchange splits the day at its time, /staff's own rule
(`staff._compute_split`), recomputed every minute.** Before the transfer time
the hours are the sender's, after it the receiver's; the NAME goes to the side
with more hours, a tie keeps it on the sender. Right after the move the sender
has the hours worked so far and the receiver none, so the name stays on the
sender and the receiver gets nameless «additional hours»; once the receiver's
side passes the sender's, the name moves to the receiver and the sender keeps
its hours as nameless additional hours — the operator's words. Early arrival
belongs to the worker's first unit, the /staff rule (the sender keeps it on a
named row; once the name leaves, the sender's leftover is its EFFECTIVE hours).

Two live rules of their own. The day's hours are shared between the stints IN
PROPORTION to their clock time: while the worker is inside the hours ARE the
clock, and at check-out «Отработано» (the lunch deducted) replaces it — /staff
lets the LAST stint absorb that difference, which live would flip the name
back to the sender at the moment of the check-out (B ahead 5.8 h to 5.2 h all
afternoon, then behind 5.3 h to 5.2 h once the lunch lands on B); shared in
proportion, the order the page showed all day is the order the day ends with.
And the 2-hour floor — under 2 h on every side counts for nobody — is judged
only once the worker has LEFT, since live every move starts at 1 h vs 0 h.

**The unit where the worker IS files the next move** (the operator,
2026-10-04): once a move puts Ali in B at 10:00, B moves Ali on — from its
named rows or from the nameless hours it carries — and A cannot, though it may
still hold Ali's name. `where_at` is THE answer to «where is this worker at
T», read at creation, at approval (a document approved since may have moved the
worker) and before an un-post (one that a later move depends on is refused).

A worker moved more than once — or moved and brought back (`return_time`) — is
a timeline of stints; each unit's hours are summed and the name goes to the
unit with the most, ties to the one reached first. For one move that IS the
rule above.

**Arrivals come cell-less** (the /staff rule): the receiving brigadir places
them on «Yacheykalar» (`LivePlacement`), and their day close is refused until
they have. **A role change re-titles the worker for the whole day** (the
/staff rule). **A deletion takes the worker off one unit's day** — named row
and nameless hours both.
"""
from __future__ import annotations

import logging
import zlib
from collections import Counter, defaultdict
from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    Cell, LiveAllLeftNotice, LiveClockFix, LiveDayClose, LiveDeletion, LiveDocument,
    LivePlacement, RoleProfile,
)
from app.services import cell_hours, verifix_live

log = logging.getLogger(__name__)

# The page a live day is read and decided on (from `live_day.LIVE_FROM`).
PAGE = "staff"

# /staff's minimum (routers/staff.MIN_MOVED_ZAGRUZKA_HOURS) — keep the two in
# step. Judged here only once the worker has left (see the module docstring).
MIN_MOVED_HOURS = 2.0

# The statuses a row may carry. The first seven are the worker's own (Verifix);
# `moved_out` is unit-relative: this unit holds the row while the worker is
# (or ended the day) somewhere else; `on_task` = sent to a task for the day.
STATUSES = ("inside", "break", "left", "absent", "not_yet", "off", "no_out",
            "moved_out", "on_task")


def row_id(eid: str) -> int:
    """A numeric row id for an employee — Verifix ids are digits. The page's
    placement editor keys rows by number, and the SECOND half of a split is the
    negative of the first."""
    return int(eid) if eid.isdigit() else zlib.crc32(eid.encode()) & 0x7FFFFFFF


def _hm(dt: Optional[datetime]) -> Optional[str]:
    return dt.strftime("%H:%M") if dt else None


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat(timespec="minutes") if dt else None


def _h(a: datetime, b: datetime) -> float:
    return max(0.0, (b - a).total_seconds() / 3600.0)


def _r(v: Optional[float], n: int = 2) -> Optional[float]:
    return round(v, n) if v is not None else None


# ── who may hear about it ────────────────────────────────────────────────────
# Bell + Telegram: only people who can open /staff — the page a live day is
# read and decided on (`live_day.LIVE_FROM` on). A notice must never open onto
# «no access». The /staff-live lab page that carried these notices before is
# gone (2026-10-06); its page key went with it.

def can_open(db: Session, key: Optional[str], access: Optional[dict] = None) -> bool:
    """This PROFILE can open /staff: an admin always; anybody else by their
    role on the Access tab, the page grant, or a capability that carries the
    page (approving documents or requests, editing or deleting attendance,
    reopening a day — `require_page("staff")` admits all of them), and no
    personal deny. A profile key has no session, so this is `require_page`
    asked of the person rather than of a request."""
    from app import identity
    from app.capabilities import CAPABILITIES, caps_for_profile, denied_pages_for_profile, page_cap
    from app.permissions import get_page_access
    if not key:
        return False
    role, _ = identity.parse_profile_key(key)
    if role == "admin":
        return True
    if PAGE in denied_pages_for_profile(db, key):
        return False
    access = access if access is not None else get_page_access(db)
    if role in access.get(PAGE, []):
        return True
    caps = caps_for_profile(db, key)
    if page_cap(PAGE) in caps:
        return True
    return any(PAGE in (c.get("pages") or []) for c in CAPABILITIES if c["key"] in caps)


# ── the day's context ────────────────────────────────────────────────────────

@dataclass
class Ctx:
    """Everything one shift-day's rows are built from — read once per request."""
    day: date
    now: datetime                      # Tashkent wall clock, naive
    store: dict                        # employee id → stored read entry
    directory: dict
    cells: dict                        # code key → {id, code, manager_id}
    units: dict                        # manager id → {name, shift}
    homes: dict                        # employee id → (manager id, code key)
    formula: Optional[dict]
    docs: list                         # approved LiveDocument rows of the day
    drafts: list                       # draft LiveDocument rows of the day
    deleted: set                       # {(manager id, employee id)} approved deletions
    pending_del: dict                  # (manager id, employee id) → LiveDeletion (pending)
    placements: dict                   # (manager id, employee id) → LivePlacement
    windows: dict                      # shift → ("HH:MM", "HH:MM")
    fixes: dict = field(default_factory=dict)   # employee id → LiveClockFix (the close's answers)
    _persons: dict = field(default_factory=dict)


def load(db: Session, day: date, directory: dict, store: dict,
         now: Optional[datetime] = None) -> Ctx:
    cells, units = verifix_live._registry(db)
    homes = verifix_live._homes(directory, cells)
    docs = (db.query(LiveDocument).filter(LiveDocument.day == day)
            .order_by(LiveDocument.approved_at.nullslast(), LiveDocument.id).all())
    dels = db.query(LiveDeletion).filter(LiveDeletion.day == day).all()
    return Ctx(
        day=day, now=now or verifix_live.now_local(), store=store, directory=directory,
        cells=cells, units=units, homes=homes, formula=verifix_live._formula(db),
        docs=[d for d in docs if d.status == "approved"],
        drafts=[d for d in docs if d.status == "draft"],
        deleted={(d.manager_id, d.employee_id) for d in dels if d.status == "approved"},
        pending_del={(d.manager_id, d.employee_id): d for d in dels if d.status == "pending"},
        placements={(p.manager_id, p.employee_id): p
                    for p in db.query(LivePlacement).filter(LivePlacement.day == day).all()},
        windows=cell_hours.defaults(db),
        fixes={f.employee_id: f for f in db.query(LiveClockFix).filter(LiveClockFix.day == day).all()},
    )


def _at(ctx: Ctx, shift: Optional[int], hhmm: Optional[str]) -> Optional[datetime]:
    """«14:30» on the shift-day → the wall-clock moment (a night shift's small
    hours sit on the morning after) — `verifix_live.event_at`'s rule, without a
    query per call."""
    if not hhmm:
        return None
    try:
        h, m = (int(x) for x in str(hhmm).split(":")[:2])
    except ValueError:
        return None
    at = datetime.combine(ctx.day, datetime.min.time()).replace(hour=h % 24, minute=m % 60)
    win = ctx.windows.get(shift or 1) or ("08:00", "20:00")
    s, e = (cell_hours._to_min(win[0]) or 0), (cell_hours._to_min(win[1]) or 0)
    if e <= s and h * 60 + m < s:
        at += timedelta(days=1)
    return at


# ── one worker ───────────────────────────────────────────────────────────────

@dataclass
class Stint:
    start: datetime
    unit: Optional[int]                # a unit, or None for a task
    task: Optional[str]
    end: Optional[datetime] = None
    hours: Optional[float] = None


@dataclass
class Worker:
    """One worker's live day with every approved document laid over it."""
    eid: str
    name: str
    role: str
    role0: str
    schedule: str
    home_unit: Optional[int]
    home_cell: Optional[str]           # code key
    p: dict                            # verifix_live._person
    early_min: float
    stints: list
    unit_hours: dict                   # unit → hours (None when unknown)
    task_hours: dict                   # task → hours
    first_unit: Optional[int]          # whose stint the day opened in (early belongs there)
    winner: Optional[int]              # the unit holding the NAME, or None
    reason: Optional[str]              # why nobody holds it: "task" · "below_min" · "deleted"
    moved: bool                        # a timed move applies
    whole_task: Optional[str]          # sent to a task for the whole day
    current: Optional[Stint]           # where the worker is now / ended the day
    planned: Optional[dict] = None     # the next move still ahead of now: {at, unit, task, back}


def _role_for(ctx: Ctx, eid: str, role0: str) -> str:
    role = role0
    for d in ctx.docs:                                  # ordered by approval
        if d.doc_type != "role_change":
            continue
        pl = d.payload or {}
        if any(str(e.get("employee_id")) == eid for e in pl.get("employees") or []):
            role = pl.get("new_role") or role
    return role


def _moves_for(ctx: Ctx, eid: str) -> list:
    out = []
    for d in ctx.docs:
        if d.doc_type != "people_exchange":
            continue
        pl = d.payload or {}
        if not any(str(e.get("employee_id")) == eid for e in pl.get("employees") or []):
            continue
        shift = (ctx.units.get(d.manager_id) or {}).get("shift")
        out.append({
            "doc": d,
            "sender": d.manager_id,
            "target": pl.get("target_manager_id") if pl.get("target_type") == "supervisor" else None,
            "task": pl.get("task_name") if pl.get("target_type") == "task" else None,
            "T": _at(ctx, shift, pl.get("transfer_time")),
            # A return without a transfer time (2026-10-09): the worker is at the
            # receiver from their own clock-in and back at the sender at R.
            "R": _at(ctx, shift, pl.get("return_time")),
        })
    return out


def _fixed(ctx: Ctx, p: dict, fix) -> dict:
    """A worker's live day with the brigadir's answer for a MISSING check-out
    laid over it (`LiveClockFix`, ruling 6 of 2026-10-06). «Exit at HH:MM» ends
    the day there — the hours are the clock span, since Verifix's «Отработано»
    needs the check-out it never got; «did not come» makes the day an absence
    (no hours, counted nowhere). Verifix's own answer is untouched underneath:
    deleting the fix puts it back."""
    if fix is None or p["in"] is None:
        return p
    p = dict(p)
    if fix.action == "absent":
        p.update({"status": "absent", "in": None, "out": None, "hours": None, "so_far": False,
                  "late": None, "early_in": None, "early_out": None, "missing": False,
                  "in_src": "manual", "out_src": None, "held": None})
        return p
    shift = (ctx.units.get(fix.manager_id) or {}).get("shift")
    t = _at(ctx, shift, fix.out_time)
    if t is None or t <= p["in"]:
        return p
    early_out = None
    if p["end"] is not None:
        delta = (p["end"].replace(second=0, microsecond=0) - t).total_seconds() / 60.0
        if delta > verifix_live.EARLY_GRACE_MIN:
            early_out = round(delta)
    p.update({"status": "left", "out": t, "hours": _h(p["in"], t), "so_far": False,
              "early_out": early_out, "missing": False, "out_src": "manual", "held": None})
    return p


def person(ctx: Ctx, eid: str) -> Worker:
    """THE worker's live day — memoised per request."""
    if eid in ctx._persons:
        return ctx._persons[eid]
    entry = ctx.store.get(eid) or {}
    rec = entry.get("ts")
    marks = [(datetime.fromisoformat(x[0]), x[1]) for x in entry.get("m") or []]
    p = _fixed(ctx, verifix_live._person(ctx.day, ctx.now, rec, marks, ctx.formula),
               ctx.fixes.get(eid))
    emp = (ctx.directory.get("emps") or {}).get(eid) or {}
    home_unit, home_cell = ctx.homes.get(eid, (None, None))
    role0 = (rec or {}).get("job") or emp.get("job") or ""
    name = (rec or {}).get("name") or emp.get("name") or f"#{eid}"

    C, out = p["in"], p["out"]
    # Early arrival as /staff counts it (attendance_sheet.clock_metrics): the
    # minutes clocked before the schedule's start.
    early = 0.0
    if C is not None and p["begin"] is not None and C < p["begin"]:
        early = round((p["begin"] - C).total_seconds() / 60.0)

    moves = _moves_for(ctx, eid)
    whole = [m for m in moves if m["T"] is None]
    timed = [m for m in moves if m["T"] is not None]
    timed.sort(key=lambda m: (m["T"], m["doc"].approved_at or datetime.min, m["doc"].id))
    start_unit, start_task = home_unit, None
    whole_task = None
    whole_back = None                  # (R, sender) of the whole-day move, if it carries one
    if whole:
        w = whole[-1]
        if w["target"]:
            start_unit = w["target"]
        else:
            start_unit, start_task, whole_task = None, w["task"], w["task"]
        if w["R"] is not None:
            whole_back = (w["R"], w["sender"])

    stints: list[Stint] = []
    unit_hours: dict = {}
    task_hours: dict = {}
    current = None
    planned = None
    whole_returned = False
    status = p["status"]
    total = p["hours"]
    if C is not None:
        # Where the day ENDS for the split: the exit when there is one (a
        # break's exit too — that is as far as the hours go), else now.
        E = out or max(ctx.now, C)
        # A move timed at or after the end of the worker's day never happened —
        # they had gone (a check-out Verifix filled in earlier than the
        # document's time). It is no stint of zero hours on the target. Read to
        # the MINUTE once the worker has left: a document's time carries no
        # seconds, so «17:01» against a check-out at 17:01:40 is the minute the
        # worker went home, not forty seconds on the target (the 6–7 Oct
        # exit-minute moves, 2026-10-08). While they are still inside the cut
        # is now itself, so a move at the current minute stands.
        cut = out.replace(second=0, microsecond=0) if out is not None else E
        # A time still AHEAD of the cut — a planned move or return (the
        # operator, 2026-10-09) — is the same case for now: it enters the
        # timeline the minute it comes, and `planned` names the next one so
        # the row can say it is coming (while the worker is inside, or out
        # on a break and expected back).
        ahead = []
        for m in timed:
            if m["T"] >= cut:
                ahead.append((m["T"], m["target"], m["task"], False))
            elif m["R"] is not None and m["R"] >= cut:
                ahead.append((m["R"], m["sender"], None, True))
        if whole_back is not None and whole_back[0] >= cut:
            ahead.append((whole_back[0], whole_back[1], None, True))
        if ahead and (out is None or status == "break"):
            at, u, tk, back = min(ahead, key=lambda x: x[0])
            planned = {"at": at, "unit": u, "task": tk, "back": back}
        timed = [m for m in timed if m["T"] < cut]
        # A move timed BEFORE the clock-in lands AT it: a worker given away
        # before they arrived was given from their arrival (until 2026-10-08
        # the move's point sorted ahead of the clock-in's, its stint was empty
        # and the sender kept the whole day — 14 worker-moves on 6–7 Oct).
        # Points are ordered by time, then by the order they were listed in,
        # and at one instant only the LAST point stands: the others would be
        # stints of no length. A whole-day move's return (2026-10-09) is the
        # point that brings the worker back to the sender — only once it has
        # come, and only when they came before it.
        points = [(C, 0, start_unit, start_task)]
        if whole_back is not None and C < whole_back[0] < cut:
            points.append((whole_back[0], 1, whole_back[1], None))
            whole_returned = True
        for i, m in enumerate(timed, 1):
            points.append((max(m["T"], C), 2 * i, m["target"], m["task"]))
            if m["R"] is not None and m["R"] < cut:
                points.append((max(m["R"], C), 2 * i + 1, m["sender"], None))
        points.sort(key=lambda x: (x[0], x[1]))
        for j, (at, _, u, tk) in enumerate(points):
            if j + 1 < len(points) and points[j + 1][0] == at:
                continue
            stints.append(Stint(start=min(at, E), unit=u, task=tk))
        for i, s in enumerate(stints):
            s.end = stints[i + 1].start if i + 1 < len(stints) else E
        # The day's hours shared in proportion to each stint's clock time (see
        # the module docstring: the check-out must not flip the name back).
        if total is not None:
            durs = [_h(s.start, s.end) for s in stints]
            span = sum(durs)
            for i, s in enumerate(stints):
                s.hours = (total * durs[i] / span if span > 0
                           else (total if i == len(stints) - 1 else 0.0))
        for s in stints:
            if s.unit is not None:
                unit_hours[s.unit] = (unit_hours.get(s.unit) or 0.0) + (s.hours or 0.0) \
                    if total is not None else None
            elif s.task:
                task_hours[s.task] = (task_hours.get(s.task) or 0.0) + (s.hours or 0.0)
        # Where the worker is NOW (or where they ended the day).
        cur = [s for s in stints if s.start <= ctx.now] or stints[:1]
        current = cur[-1]
        if total is None and current.unit is not None:
            unit_hours.setdefault(current.unit, None)

    first_unit = stints[0].unit if stints else start_unit
    # The name — the bigger side, ties to the side reached first.
    winner, reason = start_unit, None
    moved = (bool(timed) or whole_returned) and C is not None
    if C is None:
        winner = start_unit if not whole_task else home_unit
    elif whole_task and not timed and not whole_returned:
        winner = home_unit                    # /staff: kept on the roster, 0 h, task pill
    elif total is None:
        # No check-out → no hours to compare (/staff's "cannot split" case):
        # the name follows the last stint, a task keeps it at home.
        winner = current.unit if current and current.unit is not None else home_unit
    else:
        order = []
        for s in stints:
            key = ("u", s.unit) if s.unit is not None else ("t", s.task)
            if key not in order:
                order.append(key)
        best = max(order, key=lambda k: (
            (unit_hours.get(k[1]) or 0.0) if k[0] == "u" else (task_hours.get(k[1]) or 0.0),
            -order.index(k)))
        if best[0] == "u":
            winner = best[1]
        else:
            winner, reason = None, "task"
        if moved and status == "left":
            top = max([v or 0.0 for v in unit_hours.values()] + list(task_hours.values()) + [0.0])
            if top < MIN_MOVED_HOURS:
                winner, reason = None, "below_min"
    if winner is not None and (winner, eid) in ctx.deleted:
        winner, reason = None, "deleted"

    w = Worker(eid=eid, name=name, role=_role_for(ctx, eid, role0), role0=role0,
               schedule=p["schedule"], home_unit=home_unit, home_cell=home_cell, p=p,
               early_min=early, stints=stints, unit_hours=unit_hours, task_hours=task_hours,
               first_unit=first_unit, winner=winner, reason=reason, moved=moved,
               whole_task=whole_task, current=current, planned=planned)
    ctx._persons[eid] = w
    return w


def stint_at(w: Worker, T: Optional[datetime]) -> Optional[Stint]:
    """The stint the worker stands in at T — None = the start of the day."""
    if not w.stints:
        return None
    if T is None:
        return w.stints[0]
    cur = w.stints[0]
    for s in w.stints:
        if s.start <= T:
            cur = s
    return cur


def where_at(ctx: Ctx, eid: str, T: Optional[datetime], without: tuple = ()) -> Optional[Stint]:
    """Where the worker stands at T, with the approved documents `without`
    left out — THE «who may move this worker» answer: the unit of the stint at
    T files the move. A move timed exactly at T is not counted (it is the move
    being asked about, or one at the same minute), so T is read a second early."""
    sub = replace(ctx, docs=[d for d in ctx.docs if d.id not in without], _persons={})
    if T is not None and T > sub.now:
        # A planned time (2026-10-09): every move before it has applied by then.
        sub = replace(sub, now=T)
    w = person(sub, eid)
    if not w.stints:
        # Not clocked in (yet): due where their day opens — a whole-day
        # document's receiver (or task), else the home unit. A document may
        # name them before they come (the operator, 2026-10-09).
        if w.first_unit is None and not w.whole_task:
            return None
        return Stint(start=T or sub.now, unit=w.first_unit, task=w.whole_task)
    if T is None:
        return stint_at(w, None)
    return stint_at(w, T - timedelta(seconds=1)) if w.stints and T > w.stints[0].start \
        else stint_at(w, None)


def _doc_eids(d) -> set:
    return {str(e.get("employee_id")) for e in (d.payload or {}).get("employees") or []}


def broken_moves(ctx: Ctx, eids: set, add=None, drop: tuple = ()) -> set:
    """The approved people-exchanges (of these workers) whose sender does NOT
    hold the worker at the move's time — with `add` counted as approved and
    `drop` left out. The doors compare it before and after a change: a change
    that newly breaks a move (an approval that takes the worker away from the
    unit a later move sends them from; an un-post a later move depends on) is
    refused, so the approved set always reads as one walk through the day."""
    docs = [d for d in ctx.docs if d.id not in drop] + ([add] if add is not None else [])
    sub = replace(ctx, docs=docs, _persons={})
    bad = set()
    for o in docs:
        if o.doc_type != "people_exchange":
            continue
        shared = eids & _doc_eids(o)
        if not shared:
            continue
        T = _at(sub, (sub.units.get(o.manager_id) or {}).get("shift"), (o.payload or {}).get("transfer_time"))
        for eid in shared:
            if eid not in sub.store and eid not in sub.homes:
                continue
            at = where_at(sub, eid, T, without=(o.id,))
            if at is not None and at.unit != o.manager_id:
                bad.add(o.id)
                break
    return bad


def stint_name(ctx: Ctx, s: Optional[Stint]) -> str:
    if s is None:
        return "—"
    return s.task or (ctx.units.get(s.unit) or {}).get("name") or f"#{s.unit}"


def is_here(w: Worker, unit: int) -> bool:
    """The worker stands in this unit now — or ended the day here."""
    if w.current is not None:
        return w.current.unit == unit
    return (w.home_unit == unit) if not w.whole_task else False


# ── one unit's day ───────────────────────────────────────────────────────────

def unit_ids(ctx: Ctx, manager_id: int, include_drafts: bool = True) -> list[str]:
    """Everybody whose day can touch this unit: its own people (the org unit),
    anybody a document moves in or out, anybody it deleted or placed."""
    ids = {eid for eid, (mid, _) in ctx.homes.items() if mid == manager_id}
    for d in ctx.docs + (ctx.drafts if include_drafts else []):
        pl = d.payload or {}
        if manager_id in (d.manager_id, pl.get("target_manager_id")):
            ids.update(str(e.get("employee_id")) for e in pl.get("employees") or [])
    # An arrival moved on by a document the TARGET filed: follow the chain.
    for d in ctx.docs:
        pl = d.payload or {}
        for e in pl.get("employees") or []:
            eid = str(e.get("employee_id"))
            if eid in ids:
                continue
            ws = [s for s in (person(ctx, eid).stints if eid in ctx.store or eid in ctx.homes else [])]
            if any(s.unit == manager_id for s in ws):
                ids.add(eid)
    ids |= {eid for (mid, eid) in ctx.deleted if mid == manager_id}
    ids |= {eid for (mid, eid) in ctx.placements if mid == manager_id}
    return sorted(i for i in ids if i and i != "None")


def _stints_at(w: Worker, unit: int) -> list:
    return [s for s in w.stints if s.unit == unit]


def _cell_of(ctx: Ctx, key: Optional[str]) -> Optional[str]:
    """A code key → the cell's stored code (as /cells spells it)."""
    if not key:
        return None
    c = ctx.cells.get(key)
    return c["code"] if c else (key.zfill(4) if key.isdigit() else key)


def day_mark(ctx: Ctx, eid: str) -> str:
    """The day cell for a day nobody clocked — the «Davomat» read's own rule
    (`verifix_attendance._mark`), so /staff prints what the file printed: the
    absence kind's letter («О» = «Отгул», «Б», «В», «ОТ» …), «X» for a plain
    absence or a working day nobody came to, «—» for a day off. The close's
    copy (`live_projection`) writes this very mark into `attendance`."""
    from app.services import verifix_attendance
    ts = (ctx.store.get(eid) or {}).get("ts") or {}
    days = ts.get("days") or []
    d = days[0] if days else None
    if not d:
        return "X"
    facts: dict = {}
    for f in d.get("facts") or []:
        k = str(f.get("time_kind_id") or "")
        try:
            facts[k] = facts.get(k, 0.0) + float(f.get("fact_value") or 0)
        except (TypeError, ValueError):
            continue
    return verifix_attendance._mark(facts, d)


def _pending_for(ctx: Ctx, eid: str, unit: int) -> list:
    out = []
    for d in ctx.drafts:
        pl = d.payload or {}
        if unit not in (d.manager_id, pl.get("target_manager_id")):
            continue
        if any(str(e.get("employee_id")) == eid for e in pl.get("employees") or []):
            out.append({"id": d.id, "doc_type": d.doc_type})
    if (unit, eid) in ctx.pending_del:
        out.append({"id": ctx.pending_del[(unit, eid)].id, "doc_type": "deletion"})
    return out


def _planned_info(ctx: Ctx, w: Worker) -> Optional[dict]:
    """The worker's next move still ahead of now, for the row: where to (a unit
    or a task), at what time, and whether it is a return."""
    pl = w.planned
    if not pl:
        return None
    dest = pl["task"] or (ctx.units.get(pl["unit"]) or {}).get("name")
    return {"at": _hm(pl["at"]), "unit": dest, "task": bool(pl["task"]), "back": bool(pl["back"])}


def _named_row(ctx: Ctx, w: Worker, unit: int) -> list:
    """The worker's row(s) on the unit holding their NAME — two when the
    brigadir split them across two of the unit's cells."""
    p = w.p
    here = _stints_at(w, unit)
    hours = w.unit_hours.get(unit) if w.stints else p["hours"]
    if w.whole_task and not w.moved:
        hours = 0.0
    is_first = w.first_unit == unit
    early = w.early_min if (is_first and p["in"] is not None) else 0.0
    eff = (round(hours - early / 60.0, 4) if hours is not None else None)

    clock_in = here[0].start if here else p["in"]
    last_here = here[-1] if here else None
    ended_here = (last_here is not None and last_here is w.stints[-1]) if w.stints else True
    if not w.stints:
        clock_out = p["out"]
    elif ended_here:
        clock_out = p["out"]                          # left the plant from here (or still inside)
    else:
        clock_out = last_here.end if last_here else None   # moved on at this moment

    status = p["status"]
    moved_info = None
    cur = w.current
    if w.whole_task and not w.moved:
        status = "on_task"
    elif w.stints and cur is not None and cur.unit != unit:
        status = "moved_out"
        dest = cur.task or (ctx.units.get(cur.unit) or {}).get("name")
        moved_info = {"dir": "out", "unit": dest, "task": bool(cur.task), "at": _hm(cur.start)}
    if moved_info is None and here and here[0].start > (p["in"] or here[0].start):
        prev = [s for s in w.stints if s.end and s.end <= here[0].start]
        src = prev[-1] if prev else None
        if src is not None:
            moved_info = {"dir": "in", "unit": src.task or (ctx.units.get(src.unit) or {}).get("name"),
                          "task": bool(src.task), "at": _hm(here[0].start)}
    planned_info = _planned_info(ctx, w)

    pl = ctx.placements.get((unit, w.eid))
    if pl is not None:
        code = pl.verifix_code
    elif unit == w.home_unit and is_first:
        code = _cell_of(ctx, w.home_cell)
    else:
        code = None                                   # an arrival — placed by its brigadir

    late = p["late"] if is_first else None
    # Nobody clocked: the day cell is Verifix's mark, as the file printed it —
    # except a plain «X» for somebody whose shift has not begun or still runs
    # (they may yet come; a leave letter is shown at once).
    still_due = p["status"] == "absent" and p["end"] is not None and ctx.now < p["end"]
    mark = None
    if not clock_in:
        mark = day_mark(ctx, w.eid)
        if mark == "X" and (p["status"] == "not_yet" or still_due):
            mark = None
    base = {
        "id": row_id(w.eid),
        "employee_id": w.eid,
        "worker_name": w.name,
        "job_title": w.role,
        "role0": w.role0,
        "schedule": w.schedule,
        "begin": _hm(p["begin"]), "end": _hm(p["end"]),
        "clock_in": _hm(clock_in),
        "clock_out": _hm(clock_out),
        "in_at": _iso(clock_in), "out_at": _iso(clock_out),
        "clock_in_out": (f"{_hm(clock_in)}-{_hm(clock_out)}" if clock_in and clock_out
                         else (f"{_hm(clock_in)}-" if clock_in else mark)),
        "hours_worked": _r(hours, 4),
        "early_arrival_min": float(early) if p["in"] is not None else None,
        "effective_hours": _r(eff, 4),
        # Not checked in while the shift still runs: «absent» from its first
        # minute, but on a day nobody came to `busy` keeps them due.
        "still_due": still_due,
        "verifix_code": code,
        "hc_weight": None,
        "split_of": None,
        "is_supervisor": False,
        "on_task": (cur.task if (cur is not None and cur.task and status == "moved_out")
                    else w.whole_task),
        "status": status,
        "so_far": p["so_far"] and ended_here,
        "late": late,
        "early_in": p["early_in"] if is_first else None,
        "early_out": p["early_out"] if ended_here else None,
        "missing": p["missing"] and (cur is None or cur.unit == unit),
        "in_src": p["in_src"] if is_first else None,
        "out_src": p["out_src"] if ended_here else None,
        "held": p.get("held") if ended_here else None,
        "moved": moved_info,
        # A move or a return still ahead of now (a planned time) — said on the
        # row, since nothing else about it moves until the time comes.
        "planned": planned_info,
        # Standing in this unit now (or ended the day here) — who this unit may
        # move on (`where_at`).
        "here": is_here(w, unit),
        "pending": _pending_for(ctx, w.eid, unit),
        "raw": p["raw"],
    }

    # A split across two of the unit's cells (/staff `_split_hours`): the clock
    # gives the RATIO and the two halves sum to exactly the row's hours.
    if pl is not None and pl.second_code and pl.split_at and clock_in and hours:
        end = clock_out or ctx.now
        t = _at(ctx, (ctx.units.get(unit) or {}).get("shift"), pl.split_at)
        if t is not None and clock_in < t < end:
            frac = (t - clock_in).total_seconds() / max((end - clock_in).total_seconds(), 1)
            h1 = round(hours * frac, 4)
            h2 = round(hours - h1, 4)
            if h1 > 0 and h2 > 0:
                first = dict(base)
                first.update({
                    "hours_worked": h1, "hc_weight": round(frac, 6),
                    "effective_hours": _r(eff * frac, 4) if eff is not None else None,
                    "clock_out": pl.split_at, "clock_in_out": f"{_hm(clock_in)}-{pl.split_at}",
                    "early_out": None, "out_src": None, "so_far": False,
                })
                second = dict(base)
                second.update({
                    "id": -row_id(w.eid), "split_of": row_id(w.eid),
                    "verifix_code": pl.second_code,
                    "hours_worked": h2, "hc_weight": round(1 - round(frac, 6), 6),
                    "early_arrival_min": 0.0,
                    "effective_hours": _r(eff - first["effective_hours"], 4) if eff is not None else None,
                    "clock_in": pl.split_at,
                    "clock_in_out": f"{pl.split_at}-{_hm(clock_out)}" if clock_out else f"{pl.split_at}-",
                    "late": None, "early_in": None, "in_src": None,
                })
                return [first, second]
    return [base]


def unit_day(ctx: Ctx, manager_id: int) -> dict:
    """One unit's live day: the named rows, the nameless hours others' names
    took with them, and the counts the page reads."""
    rows: list[dict] = []
    extras: list[dict] = []
    for eid in unit_ids(ctx, manager_id):
        if (manager_id, eid) in ctx.deleted:
            continue
        if eid not in ctx.store and eid not in ctx.homes:
            continue
        w = person(ctx, eid)
        if w.winner == manager_id:
            rows.extend(_named_row(ctx, w, manager_id))
            continue
        h = w.unit_hours.get(manager_id) if w.stints else None
        if h is None or h <= 0:
            continue
        raw_h = h
        early = w.early_min if (w.first_unit == manager_id and w.p["in"] is not None) else 0.0
        if w.first_unit == manager_id:
            h = max(0.0, h - w.early_min / 60.0)      # part1_eff: the first unit's hours lose the early minutes
        holder = (ctx.units.get(w.winner) or {}).get("name") if w.winner else None
        here = is_here(w, manager_id)
        mine = _stints_at(w, manager_id)
        extras.append({
            "employee_id": eid, "id": row_id(eid), "worker_name": w.name, "hours": round(h, 2),
            # what the table's filters read, as on a named row: the clocked
            # hours, the early minutes counted here (the first unit's), and
            # the hours that remain once they are taken off
            "hours_worked": round(raw_h, 4), "early_arrival_min": float(early), "effective_hours": round(h, 4),
            "named_at": holder, "named_at_id": w.winner,
            "reason": w.reason or "moved", "so_far": w.p["so_far"],
            # Standing here now: this unit files the worker's next move, and a
            # worker still inside keeps the day open.
            "here": here, "status": w.p["status"] if here else "moved_out",
            "planned": _planned_info(ctx, w) if here else None,
            "job_title": w.role, "schedule": w.schedule,
            "verifix_code": (ctx.placements[(manager_id, eid)].verifix_code
                                                  if (manager_id, eid) in ctx.placements else None),
            "clock_in": _hm(mine[0].start) if mine else None,
            "clock_out": (_hm(w.p["out"]) if here else _hm(mine[-1].end)) if mine else None,
            "in_at": _iso(mine[0].start) if mine else None,
            "out_at": (_iso(w.p["out"]) if here else _iso(mine[-1].end)) if mine else None,
        })

    counts = Counter(r["status"] for r in rows if r.get("split_of") is None)
    came = sum(1 for r in rows if r["clock_in"] and r.get("split_of") is None)
    inside = counts["inside"] + counts["break"]
    return {
        "workers": sorted(rows, key=lambda r: (r["worker_name"] or "", r.get("split_of") or 0)),
        "extras": sorted(extras, key=lambda x: x["worker_name"] or ""),
        "extra_hours": round(sum(x["hours"] for x in extras), 2),
        "counts": {
            "total": sum(1 for r in rows if r.get("split_of") is None),
            "came": came, "inside": inside, "left": counts["left"],
            "absent": counts["absent"], "not_yet": counts["not_yet"], "off": counts["off"],
            "no_out": counts["no_out"], "moved_out": counts["moved_out"],
            "on_task": counts["on_task"],
            "late": sum(1 for r in rows if r.get("late")),
            "early_out": sum(1 for r in rows if r.get("early_out")),
            "missing": sum(1 for r in rows if r.get("missing")),
            "moved_in": sum(1 for r in rows if (r.get("moved") or {}).get("dir") == "in"),
            "hours": round(sum(r["hours_worked"] or 0 for r in rows), 2),
            # People standing here whose NAME is on another unit's day — the
            # close and «everybody left» wait on them too.
            "extra_inside": sum(1 for x in extras if x["here"] and x["status"] in ("inside", "break")),
            "extra_came": len(extras),
        },
    }


def diag(ctx: Ctx, manager_id: int, rows: list) -> dict:
    """What the read behind the unit's rows held — the admin's Diagnostics
    line: people, report rows, marks by type, where each clock came from, and
    why an «inside» row has no check-out (`held`)."""
    ids = unit_ids(ctx, manager_id, include_drafts=False)
    types: Counter = Counter()
    n_report = 0
    for eid in ids:
        entry = ctx.store.get(eid) or {}
        n_report += 1 if entry.get("ts") else 0
        types.update(m[1] for m in entry.get("m") or [])
    first = [r for r in rows if r.get("split_of") is None]
    return {"employees": len(ids), "report_rows": n_report,
            "marks": sum(types.values()), "mark_types": dict(types),
            "directed": any(t in verifix_live.DIRECTED for t in types),
            "in_sources": dict(Counter(r["in_src"] for r in first if r.get("in_src"))),
            "out_sources": dict(Counter(r["out_src"] for r in first if r.get("out_src"))),
            "held": dict(Counter(r["held"] for r in first if r.get("held")))}


def cells_catalog(db: Session, ctx: Ctx, manager_id: int, rows: list) -> list:
    """The cells the day's rows name, and the unit's own workload cells, with
    each cell's leader — what the Yacheyka column and its filter print."""
    codes = {r["verifix_code"] for r in rows if r.get("verifix_code")}
    own = [c for c in ctx.cells.values() if c["manager_id"] == manager_id]
    codes |= {c["code"] for c in own}
    if not codes:
        return []
    by_code = {c.verifix_code: c for c in db.query(Cell).filter(Cell.verifix_code.in_(codes)).all()}
    lids = {c.leader_id for c in by_code.values() if c.leader_id}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name).filter(RoleProfile.id.in_(lids)).all()) if lids else {}
    out = []
    for code in sorted(codes):
        c = by_code.get(code)
        out.append({"cell_id": c.id if c else None, "verifix_code": code,
                    "leader_name": leaders.get(c.leader_id) if c else None,
                    "in_load": bool(c.in_load) if c else False})
    return out


def pending_count(db: Session, manager_id: int, day: date) -> int:
    """The unit's draft documents and pending deletion requests for the day —
    what keeps a closed day «closed» instead of «confirmed» (/staff's
    `day_state`: pending requests + draft documents, the sender's own)."""
    docs = db.query(LiveDocument).filter(
        LiveDocument.manager_id == manager_id, LiveDocument.day == day,
        LiveDocument.status == "draft").count()
    dels = db.query(LiveDeletion).filter(
        LiveDeletion.manager_id == manager_id, LiveDeletion.day == day,
        LiveDeletion.status == "pending").count()
    return docs + dels


def unplaced(rows: list) -> list:
    """Named, counted workers with no cell — what the day close refuses on
    (/staff `_unplaced_workers`: counted role, hours > 0, never the brigadir)."""
    from app.services.kpi_calculator import is_direct_role
    return [r for r in rows
            if not r.get("verifix_code") and r.get("clock_in")
            and is_direct_role(r.get("job_title"), r.get("hours_worked"), bool(r.get("is_supervisor")))]


def close_state(day_rows: dict, day: date, close_rec: Optional[LiveDayClose],
                notice: Optional[LiveAllLeftNotice], pending: int) -> dict:
    """Where the day stands — the bar above the table. A day closes only BY
    HAND (the operator, 2026-10-04); «everybody left» is what the brigadir is
    told: somebody came, nobody is inside or on a break, nobody is still due."""
    c = day_rows["counts"]
    if close_rec:
        out = {"state": "closed", "at": _iso(verifix_live._local(close_rec.closed_at)),
               "by": close_rec.closed_by_name}
    elif not (c["came"] or c.get("extra_came")):
        out = {"state": "waiting"}
    elif c["inside"] + c.get("extra_inside", 0) == 0 and c["not_yet"] == 0:
        out = {"state": "all_left", "last_out": _iso(last_exit(day_rows, day))}
    else:
        out = {"state": "open", "n": c["inside"] + c.get("extra_inside", 0),
               "expected": c["not_yet"]}
    # What `close_day` refuses on (besides people with no cell, which its
    # refusal names): the page offers the close exactly where this is true —
    # «everybody left», and a day nobody came to with nobody still due.
    out["closable"] = not close_rec and not busy(day_rows)
    out["missing"] = c["missing"]
    out["pending"] = pending
    out["notified_at"] = (_iso(verifix_live._local(notice.sent_at))
                          if notice and notice.sent_at else None)
    return out


def last_exit(day_rows: dict, day: date) -> Optional[datetime]:
    """The latest moment one of the unit's people left it — a check-out, or a
    move to another unit — what the «everybody left» notice is measured from."""
    best = None
    for r in day_rows["workers"]:
        if r["status"] not in ("left", "moved_out") or not r.get("out_at"):
            continue
        t = datetime.fromisoformat(r["out_at"])
        if best is None or t > best:
            best = t
    for x in day_rows.get("extras") or []:
        if not x.get("out_at") or x.get("status") in ("inside", "break"):
            continue
        t = datetime.fromisoformat(x["out_at"])
        if best is None or t > best:
            best = t
    return best


def busy(day_rows: dict) -> list:
    """Who keeps the day open: inside, out on a break, or still due — and the
    people standing here whose name is elsewhere. The close is refused on them
    (`close_state.closable` is its negation). On a day nobody has come to yet,
    anybody whose shift is still running is due: a worker reads «absent» from
    the shift's first minute, and late check-ins (a terminal syncing late, a
    stalled read) must not leave a day closable three minutes into its shift."""
    out = [r for r in day_rows["workers"]
           if r.get("split_of") is None and r["status"] in ("inside", "break", "not_yet")]
    out += [x for x in day_rows.get("extras") or []
            if x.get("here") and x.get("status") in ("inside", "break")]
    c = day_rows["counts"]
    if not (c["came"] or c.get("extra_came")):
        out += [r for r in day_rows["workers"] if r.get("split_of") is None and r.get("still_due")]
    return out
