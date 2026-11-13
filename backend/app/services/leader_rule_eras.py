"""A task's DATE RULE as it stood before a dated change — so the change is dated.

Every verdict's date flags are DERIVED: `leader_ai.sync_date_flags` re-reads the
stored clocks against the rule in force NOW, at every boot and after every
window or date-rule edit, and it takes no date bound. That is right for a
correction — a window set wrong is fixed for every day at once — and wrong for a
NEW RULE. Turning the date question on for a task would re-judge every proof
ever filed for it against a requirement nobody was given: a screenshot sent in
August with no clock in it, under a rule that said «the date is not checked»,
would turn into a `no_date` rejection and cost its leader the task, weeks later,
with no report DMed about it.

So a change that must count FROM a day is written as an ERA:

* before the first write, the task's rule is FROZEN — the global row and every
  unit row, the fields `date_rule_for` reads (window, the three date questions,
  the tolerance) plus the deadline — into one `AppSetting` row;
* each shift records the first checklist day the new rule applies to (`from`),
  written by that shift's pass BEFORE it writes, and only ever moved LATER;
* every reader that resolves the rule FOR A DAY reads the frozen unit and global
  rows in place of the live ones for a day before its shift's `from`.

Leader-level rows are never frozen: an era's pass does not write them, so the
live row IS the row as it stood. The readers: `leader_ai.date_rule_for` (the
reviewer, every per-row card), `leader_ai.sync_date_flags` (the boot re-derive),
`routers/leader_ai._levels` (the queues, objections, day reports) and
`leader_tasks.effective_leader_config` (the bot, the checklist, every closing
sweep, for the day it is asked about). Nothing is stored on a verdict.

NOT a one-shot: an era is history every boot re-derives against. Never delete
one from `ERAS`, nor its frozen row — without it every day before the change is
judged by the new rule. A new dated change is one more `Era` with a NEW key.

ADMIN EDITS are dated too (2026-11-13, the operator: «we changed some leaders'
task time and it affected their historical scores»). Every write of a FIELDS
value on /panel/ltasks names the first day it counts from (inclusive, today by
default); `record` keeps the value it replaced as a `LeaderTaskRuleChange` row,
and `levels` reads that old value back — at ALL three levels, the leader's
included — for a day before it. A write with no day (a code pass) is not
recorded and, as before, counts for every day.
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import NamedTuple

from sqlalchemy.orm import Session

from app.models import AppSetting, LeaderTaskDef, LeaderTaskRuleChange, LeaderTaskSetting


class Era(NamedTuple):
    key: str          # the AppSetting row holding the frozen rule
    task_id: int


#: The dated changes, oldest first. One task may carry several eras later; a
#: day reads the earliest era whose `from` it falls before.
ERAS: tuple[Era, ...] = (
    # Task 4 (obxod / Tasker): from «date not checked» to date + time over the
    # whole shift, every inspection at 100% (operator, 07.10.2026).
    Era("leader_rule_era_t4_2026_10_07", 4),
)

#: What is frozen: every field a day's date rule — and its closing hour — is
#: resolved from.
FIELDS = ("win_from", "win_to", "date_check", "day_check", "time_check",
          "date_plus", "deadline")


def _fields(row) -> dict:
    return {f: getattr(row, f, None) for f in FIELDS}


def freeze(db: Session, era: Era) -> bool:
    """Write the task's rule as it stands NOW, once. True when written.

    Insert-only: a re-run after a pass that died half-way must never freeze a
    rule that pass has already begun to change. Commits."""
    if db.query(AppSetting).filter_by(key=era.key).first():
        return False
    td = db.query(LeaderTaskDef).filter_by(id=era.task_id).first()
    units = {str(r.manager_id): _fields(r) for r in
             db.query(LeaderTaskSetting).filter_by(task_id=era.task_id).all()}
    val = {"task": era.task_id,
           "frozen_at": datetime.now(timezone.utc).isoformat(),
           "from": {},
           "global": _fields(td) if td is not None else {},
           "units": units}
    db.add(AppSetting(key=era.key, value=json.dumps(val, ensure_ascii=False)))
    db.commit()
    _forget()
    return True


def mark_from(db: Session, era: Era, shift: int, day: str) -> str:
    """Record the first checklist day of `shift` that runs on the new rule.
    Only ever moves LATER: a pass re-run after a failure writes the day it is
    actually running for, and the days in between then read the OLD rule — the
    lenient side, since a day can only lose a flag that way, never gain one.
    Returns the day in force. Commits."""
    row = db.query(AppSetting).filter_by(key=era.key).first()
    if row is None:
        raise RuntimeError(f"{era.key}: not frozen")
    val = json.loads(row.value)
    cur = (val.get("from") or {}).get(str(shift))
    keep = max(cur, day) if cur else day
    if keep != cur:
        val.setdefault("from", {})[str(shift)] = keep
        row.value = json.dumps(val, ensure_ascii=False)
        db.commit()
        _forget()
    return keep


_CACHE: dict = {"at": 0.0, "val": None}
_TTL_S = 60.0


def _forget() -> None:
    _CACHE["val"] = None


def load_cached(db: Session) -> dict[int, list[dict]]:
    """`load`, kept a minute — for `effective_leader_config`, which the closing
    sweeps call per leader every five minutes. An era only changes when its own
    pass writes it, in the process that runs the jobs, which forgets the copy at
    once (`freeze`, `mark_from`)."""
    now = time.monotonic()
    if _CACHE["val"] is None or now - _CACHE["at"] > _TTL_S:
        _CACHE["val"], _CACHE["at"] = load(db), now
    return _CACHE["val"]


class Loaded(dict):
    """task_id → frozen eras, plus `changes`: the dated admin edits,
    `{(level, scope_id, task_id): {field: [(from_day, before), …]}}`, newest
    write first."""
    changes: dict = {}


def record(db: Session, row, values: dict, *, task_id: int, from_day,
           manager_id: int | None = None, leader_id: int | None = None,
           by: str | None = None) -> None:
    """Before a DATED write: one `LeaderTaskRuleChange` per field whose value
    changes. `row` is the level's row as it stands (None, or a fresh one, when
    the level has none). No day = not recorded. Does not commit — the setter's
    own commit carries it."""
    if not from_day:
        return
    level, scope = (("leader", leader_id) if leader_id is not None
                    else ("unit", manager_id) if manager_id is not None
                    else ("global", None))
    for f, new in values.items():
        old = getattr(row, f, None) if row is not None else None
        if old != new:
            db.add(LeaderTaskRuleChange(
                task_id=task_id, level=level, scope_id=scope, field=f,
                before=old, after=new, from_day=str(from_day)[:10], by=by))
    _forget()


class _Over:
    """`row` with some fields read as they stood on an earlier day; every other
    attribute is the live row's (None when the level has no row now)."""

    def __init__(self, row, over: dict):
        self._row, self._over = row, over

    def __getattr__(self, name):
        if name in self._over:
            return self._over[name]
        return getattr(self._row, name, None)


def _as_of(fields: dict | None, row, day: str):
    """`row` as it stood on `day`: walking the writes newest first, each one
    that starts AFTER the day is undone (its `before`); the first that already
    counts on the day stops the walk — what it wrote, or anything written over
    it since without a day, is the value."""
    if not fields:
        return row
    over = {}
    for f, hist in fields.items():
        for start, before in hist:
            if day >= start:
                break
            over[f] = before
    return _Over(row, over) if over else row


def load(db: Session) -> dict[int, list[dict]]:
    """task_id → its frozen eras, in `ERAS` order, and `.changes` (see
    `Loaded`). Two queries. A key with no row yet (an era whose pass has not
    run) is simply absent — the live rule IS the rule as it stands, so nothing
    needs freezing for it."""
    keys = [e.key for e in ERAS]
    rows = {r.key: r.value for r in
            db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()}
    out = Loaded()
    changes: dict = {}
    for c in (db.query(LeaderTaskRuleChange)
              .order_by(LeaderTaskRuleChange.id.desc()).all()):
        changes.setdefault((c.level, c.scope_id, c.task_id), {}) \
            .setdefault(c.field, []).append((c.from_day, c.before))
    out.changes = changes
    for e in ERAS:
        raw = rows.get(e.key)
        if not raw:
            continue
        try:
            out.setdefault(e.task_id, []).append(json.loads(raw))
        except (TypeError, ValueError):
            continue
    return out


def _from(era: dict, shift: int | None) -> str | None:
    """The day the new rule starts for this shift. A row whose shift is unknown
    reads the LATER of the shifts' days — the side that keeps more days on the
    old rule, which is the side that can only take a flag away."""
    froms = era.get("from") or {}
    if shift in (1, 2):
        return froms.get(str(shift))
    vals = [v for v in froms.values() if v]
    return max(vals) if vals else None


def levels(eras: dict | None, task_id: int, manager_id: int | None,
           shift: int | None, day, own, sup, td, leader_id: int | None = None):
    """(own, sup, td) for one row on one day — each level with its dated admin
    edits undone for a day before them (`record`), then the frozen unit and
    global rows in place of the live ones when the day falls before an era's
    `from` for its shift.

    An era never touches `own` (the leader's row): its pass never writes it. A
    unit that had no row when the rule was frozen gets None, which is what it
    had."""
    ch = getattr(eras, "changes", None)
    eras = eras or {}
    if ch and day:
        d = str(day)[:10]
        lid = leader_id if leader_id is not None else getattr(own, "leader_id", None)
        if lid:
            own = _as_of(ch.get(("leader", lid, task_id)), own, d)
        # A leader on the other shift walks that shift's STANDARD in place of
        # the unit's row (services/leader_shift) — not this unit's history.
        if manager_id and (sup is None or getattr(sup, "manager_id", None) == manager_id):
            sup = _as_of(ch.get(("unit", manager_id, task_id)), sup, d)
        td = _as_of(ch.get(("global", None, task_id)), td, d)
    for era in eras.get(task_id) or ():
        start = _from(era, shift)
        if not start or not day or str(day)[:10] >= start:
            continue
        unit = (era.get("units") or {}).get(str(manager_id)) if manager_id else None
        return (own,
                SimpleNamespace(**unit) if unit is not None else None,
                SimpleNamespace(**(era.get("global") or {})))
    return own, sup, td
