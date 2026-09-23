"""Checklist tasks the PLATFORM answers — «avtomatik tekshiruv».

Three of the thirteen leader-checklist tasks ask about something this platform
already holds: the day's plan and staffing (#1), the concerns register (#8) and
how much of the plan has been made (#9). Until now a leader proved each of them
by screenshotting one of our own pages and sending it to Telegram, where Gemini
read a date off the image to confirm a row that was sitting in our own database
the whole time. The proof was a photograph of the truth.

From **20 September 2026** those tasks are decided here instead. At a fixed
hour — one this module does not choose, see «WHEN» below — the check reads the
data, writes the leader's `LeaderTaskEntry` itself and closes the task. There is
no photo, no upload, no camera and no Gemini call, and the bot refuses «Ha» and
«Yo'q» on such a task: nobody can answer it, including the leader.

WHAT IS DECIDED, and where each rule comes from
-----------------------------------------------
Every threshold below is the operator's, agreed task by task (14—18 Sep 2026).

**ONE CELL IS ENOUGH** (the operator's ruling, 2026-09-22). A leader who owns
several cells passes a task when ANY ONE of them meets it — before that date #1
demanded every cell and #9 read the leader's combined percentage, so one cell
the leader could never type (no SAP code, a work centre missing from the
unit's catalog, a work centre with no plan that day and so not on the «Odamlar
soni» tab at all) cost the point every day however well the other cell was
kept. A leader with one cell reads exactly what they read before.

* `plan_staffing` (#1) — at least one of the leader's cells carries a plan
  above 0 on its OWN positions (from SAP or typed; its group's lines and the
  ungrouped lines of its work centre, `wc_group.in_scope`) AND its people
  TYPED: the cell's own group pin where the cell carries a letter, the
  whole-centre pin where it does not. Plan and people on the SAME cell — a plan
  on one cell and people on another is not a cell anybody filled. **A typed 0
  passes** — a cell that ran empty is a real answer, and `people_overridden`
  and never the value is what tells typed from absent (the `zagruzka_source`
  rule).
* `concerns` (#8) — one `leader_concerns` row created between 00:00 of the
  checklist day and the check, either written BY the leader or filed by a worker
  against any one of their cells. A pass-up of an older concern does not count,
  which is why the test is `created_at` and never `level_since`.
* `plan_pct` (#9) — the «Bajarish %» of any one of the leader's work centres,
  as the /production page states it for a leader of that cell, at or above the
  target carried in the setting (`plan_pct:30`, unchanged). The warning card
  and the facts still carry the leader's combined figure — that is the JOB
  («50% of your plan»), and the pass mark is never printed as the instruction.

**A per-cell unit judges the LEADER once** (same ruling). Its leaders file one
checklist per cell, but the three checks ask about the leader: the verdict is
taken once, over all of their cells, and the same verdict is written onto every
cell checklist — including a cell checklist opened after the hour, which is
handed the verdict taken AT the hour (below). One verdict DM per task, not one
per cell (`_already_told`).

WHAT IS DELIBERATELY NOT DECIDED HERE
--------------------------------------
Nothing is re-measured. Every figure comes from the page the leader would have
screenshotted — `_build_dashboard` for the plan and the percentage, the very
function `GET /api/production/dashboard` calls, narrowed by the leader's own
`sap_codes_for_leader` / `sap_groups_for_leader` scope; the typed pins through
`zagruzka_source.typed_pins`, the one door for that question. A second spelling
of any of them is how the check and the page come to disagree about one shift,
and the check is the one nobody can argue with.

WHEN
----
The hour is the chain `deadline` — per task, per unit — read through
`leader_close.due_at`, which seats it on the right DAY of the right shift. So
the hour is an ordinary admin setting on «Chek-list sozlamalari», editable
without a deploy, and a night shift can be asked at 23:00 what a day shift is
asked at 10:00. This module chooses no clock of its own, and must not start:
two anchors for one hour is how a task closes before it opens (2026-08-26).

Every leader of the unit is warned `WARN_BEFORE` ahead of it, whether or not
they have started a checklist — the warning is the whole fairness argument for
a deadline nobody can file against.

THE LEDGER
----------
`leader_auto_checks`, one row per (leader, date, cell, task). It is what makes
the pass idempotent and, more importantly, answerable: a score moved by a
machine has to be explainable months later, and the entry carries only a
verdict. `facts` holds the numbers the verdict was taken on.

It also carries a fact nothing else can: a row with code `no_day` says «at the
check there was no checklist». A leader's bot checklist exists only from the
first task they ANSWER (`telegram_bot._lt_save_entry`, or a camera shot), so
this is the ordinary state of a leader who filled the page and simply had not
touched the bot yet — which is why this module needs no `created_at` on
`LeaderTaskDay`.

MEASURED AT THE HOUR, WHETHER OR NOT A CHECKLIST EXISTS
-------------------------------------------------------
The operator's ruling of 2026-09-23: a check asks whether the leader did the
job BY THE HOUR, never whether they had opened the bot by then. So at the hour
the page is read for EVERY leader who owes the task; where no checklist exists
yet the verdict is kept on the `no_day` row (`facts.at_hour`) and written onto
the checklist the moment it appears — passed if the job was done at the hour,
failed with the real reason if not. Nothing typed after the hour can pass,
which is all the rule it replaced was ever for.

That rule recorded a checklist that appeared after the hour as `started_late`
and scored it 0 without reading the page at all, so a leader who filled
everything at 09:00 and answered their first bot task at 11:00 lost the task's
points (a leader's complaint, 23 Sep). `started_late` now survives only for a
row written BEFORE this measurement existed, and only where the Jurnal cannot
say what stood at the hour either (`_from_record`).
"""
from __future__ import annotations

import logging
from datetime import date as _date, datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models import (
    Cell, LeaderAutoCheck, LeaderConcern, LeaderTaskDay, LeaderTaskDef,
    LeaderTaskEntry, Manager, RoleProfile,
)
from app.services import (
    action_log, cell_lookup, leader_cells, leader_exclusions, leader_proof,
    leader_tasks, wc_group, zagruzka_source,
)

logger = logging.getLogger(__name__)

TASHKENT = leader_proof.TASHKENT

# The first checklist day these checks may judge. A FLOOR, not a switch, and it
# has no override — the shape `idle_source.CELLS_FROM`, `zagruzka_source.ZAGRUZKA_FROM`
# and `leader_ai.AUTO_FROM` all take, for the reason they take it: a rule a
# per-unit setting can quietly undo is a rule nobody can read off the platform.
#
# It is also load-bearing rather than tidy. Units carry OPEN checklist days from
# earlier dates — a night nobody came back to sits open for as long as it stays
# open — and every one of those has an auto task whose hour went by long ago.
# Without the floor the first pass settles all of them at once, writing failures
# into days that were never under this regime: measured on the 11 Sep
# production copy, one pass at 09:00 on the 20th wrote **103 verdicts, 96 of
# them failures**, into days going back weeks. The floor must never be moved
# EARLIER, which would hand those days to a rule they were not filed under.
AUTO_FROM = "2026-09-20"

# How long before the check every leader of the unit is told it is coming.
WARN_BEFORE = timedelta(minutes=30)

# How long a check that cannot read its data is retried before it gives up and
# records itself as unchecked. Unbounded, it is not merely noisy: an auto task
# with no entry holds its checklist day open, `autoclose_due` skips auto tasks,
# and shift 1 has no day-level sweep at all — so one leader-day would stay open
# for good, which every read surface here reads as «this leader filed nothing».
# Long enough to ride out an outage, short enough to end inside the shift.
GIVE_UP = timedelta(hours=6)

# How late a pass may still take a check before it says so. A sweep runs every
# minute, so anything beyond this is an outage or a restart — and a verdict
# taken an hour late read data entered after the hour it asked about, which the
# ledger must state rather than quietly absorb.
LATE_GRACE = timedelta(minutes=5)

# The checks this module knows how to run, and nothing else may be stored in
# `LeaderTaskDef.auto_check`. A value not in here is a misconfiguration and
# `is_auto` answers False for it, so the task stays an ordinary proof task
# instead of becoming one nobody on earth can answer.
CHECKS = ("plan_staffing", "concerns", "plan_pct")

# Outcomes. `passed` / `failed` move the score; `skipped` never does — it means
# this module declined to answer, and something else owns the day.
PASSED, FAILED, SKIPPED = "passed", "failed", "skipped"


class Verdict:
    """One answer, with the numbers behind it."""

    __slots__ = ("outcome", "code", "facts")

    def __init__(self, outcome: str, code: str, facts: dict | None = None):
        self.outcome, self.code, self.facts = outcome, code, (facts or {})

    @property
    def done(self) -> bool:
        return self.outcome == PASSED

    def __repr__(self) -> str:      # pragma: no cover - debugging only
        return f"<Verdict {self.outcome}/{self.code} {self.facts}>"


# ── the vocabulary ───────────────────────────────────────────────────────────

def parse_check(value: str | None) -> tuple[str, float | None] | None:
    """`("plan_pct", 30.0)` off the stored setting, or None when it names no
    check this module knows.

    The argument after the colon is the check's own threshold. It lives in the
    SETTING and not in the code because it is the one part of these rules the
    operator may want to move without a deploy — and it is deliberately NOT in
    the leader-facing instruction, per the standing rule that a minimum exists
    so nobody fails on a technicality and becomes the target the moment it is
    printed (task 9 says 50% and passes at 30%, on purpose).
    """
    s = str(value or "").strip()
    if not s:
        return None
    name, _, arg = s.partition(":")
    name = name.strip()
    if name not in CHECKS:
        return None
    if not arg.strip():
        return (name, None)
    try:
        return (name, float(arg.strip()))
    except ValueError:
        return (name, None)


def is_auto(cfg_entry: dict | None) -> bool:
    """Is this task decided by the platform?

    BOTH halves, always: the task must be switched to "auto" AND name a check
    this module can run. A task that says "auto" and names nothing would be
    unanswerable — no leader may file it and no sweep would ever close it, so
    its day would hang open forever — which is precisely the state a single-half
    test would create the first time somebody mistypes a setting.
    """
    e = cfg_entry or {}
    return (e.get("proof_kind") == "auto"
            and parse_check(e.get("auto_check")) is not None)


def auto_tasks(cfg: dict) -> dict[int, dict]:
    """The ENABLED automatic tasks of one resolved checklist config."""
    return {tid: s for tid, s in (cfg or {}).items()
            if s.get("enabled") and is_auto(s)}


def any_auto(db: Session) -> bool:
    """Is any task on the platform configured as an automatic check at all?

    The sweep's own cheap guard: with nothing switched on it must cost one
    query per pass and not a walk of every unit's config.
    """
    return bool(db.query(LeaderTaskDef.id)
                .filter(LeaderTaskDef.auto_check.isnot(None)).first())


# ── the three checks ─────────────────────────────────────────────────────────

class _Ctx:
    """Everything one verdict is taken from, resolved once per leader-day."""

    __slots__ = ("db", "prof", "manager", "shift", "date", "cell", "due",
                 "now", "_dash", "_pins", "_pairs", "_cells", "_by_code")

    def __init__(self, db, prof, manager, shift, date, cell, due, now):
        self.db, self.prof, self.manager = db, prof, manager
        self.shift, self.date, self.cell = shift, date, cell
        self.due, self.now = due, now
        self._dash = self._pins = self._pairs = self._cells = None
        self._by_code = {}

    # The leader's (work centre, group letter) pairs — their cells, and the one
    # definition of «what is mine» the /production page itself applies.
    @property
    def pairs(self) -> set[tuple[str, str | None]]:
        if self._pairs is None:
            self._pairs = cell_lookup.sap_groups_for_leader(self.db, self.prof.id)
            if self.cell is not None:
                # A per-cell checklist asks about THAT cell and no other.
                code = cell_lookup.norm_code(getattr(self.cell, "sap_code", None))
                grp = getattr(self.cell, "wc_group", None) or None
                self._pairs = {(code, grp)} if code else set()
        return self._pairs

    @property
    def dashboard(self) -> dict:
        """The leader's own /production page for this day — never a second
        computation of it. Imported lazily and from a ROUTER on purpose: that
        function IS the page, and `services/leader_tasks.py` already reaches for
        `routers.leaders.WINDOW` the same way. Re-deriving the plan here would
        give the check and the page two answers about one shift."""
        if self._dash is None:
            from app.routers.production import _build_dashboard
            codes = {c for c, _g in self.pairs}
            self._dash = _build_dashboard(
                self.db, self.manager.id, _as_date(self.date),
                wc_scope=codes, payload=None, group_scope=set(self.pairs))
        return self._dash

    def code_totals(self, code: str) -> dict:
        """The «Bajarish %» tile of ONE work centre, as the page states it for a
        leader who owns a cell there — `_build_dashboard` scoped to that code.

        Its totals are the work centre's whole (the page never cuts the totals
        by group, see `_build_dashboard`), which is why this is keyed by the
        CODE: two lettered cells of one work centre read one figure. A leader
        with a single work centre already has it in `dashboard`, so they cost
        no second computation and read byte for byte what they always did."""
        codes = {c for c, _g in self.pairs}
        if codes == {code}:
            return self.dashboard.get("totals") or {}
        if code not in self._by_code:
            from app.routers.production import _build_dashboard
            self._by_code[code] = _build_dashboard(
                self.db, self.manager.id, _as_date(self.date),
                wc_scope={code}, payload=None).get("totals") or {}
        return self._by_code[code]

    @property
    def cells(self) -> list:
        """The leader's own cells — or the ONE cell a per-cell checklist is
        about."""
        if self._cells is None:
            if self.cell is not None:
                self._cells = [self.cell]
            else:
                self._cells = (self.db.query(Cell)
                               .filter(Cell.leader_id == self.prof.id).all())
        return self._cells

    @property
    def pins(self) -> dict:
        """What each of the UNIT's cells reads of the typed «Bugungi fakt», as
        `zagruzka_source.cell_pins` answers it — `{(cell_id, day): (value, …)}`,
        `value` None when nothing reaches that cell.

        THE one door, and going through it is the whole point. Asking instead
        whether the exact `(code, letter)` pair carries a pin — which is what
        this did first — fails a lettered cell whose brigadir typed ONE
        whole-centre number, because the two pin kinds are mutually exclusive by
        design. CLAUDE.md records the fleet as being in exactly that state («A
        grouped work centre whose brigadir keeps typing one whole-centre number
        still splits it evenly», ten such work centres, the largest six cells
        wide), so the check would have deducted task #1's ten points every day
        from leaders whose /production page plainly shows the number filled in,
        for a brigadir behaviour change nobody has asked for.

        It is handed EVERY cell of the unit, never the leader's alone: the split
        is over the cells passed, so a short list reads every other group's
        people as unclaimed and takes them — the mistake the «Xarajat» entries
        modal made until it was fixed.
        """
        if self._pins is None:
            d = _as_date(self.date)
            raw = zagruzka_source.typed_pins(self.db, [self.manager.id], d, d)
            unit_cells = (self.db.query(Cell)
                          .filter(Cell.manager_id == self.manager.id).all())
            self._pins = zagruzka_source.cell_pins(unit_cells, raw)
        return self._pins


def _as_date(iso: str) -> _date:
    return datetime.strptime(str(iso)[:10], "%Y-%m-%d").date()


def cell_label(c: Cell) -> str:
    """How a cell is named in a verdict's facts — its verifix CODE (CLAUDE.md
    «A cell is its CODE»), the work centre only for a cell that has none."""
    return c.verifix_code or wc_group.label(c.sap_code, c.wc_group) or "?"


def cell_planned(rows: list, c: Cell) -> bool:
    """Does this cell carry a plan above 0 on its OWN positions — its group's
    lines and the ungrouped lines of its work centre, the scope the page itself
    cuts a leader's rows to (`wc_group.in_scope`)?"""
    code = cell_lookup.norm_code(getattr(c, "sap_code", None))
    if not code:
        return False
    pair = {(code, getattr(c, "wc_group", None) or None)}
    return any(float(r.get("plan_qty") or 0) > 0
               and wc_group.in_scope(pair, r.get("work_center"), r.get("wc_group"))
               for r in rows)


def _check_plan_staffing(ctx: _Ctx, target: float | None) -> Verdict:
    """#1 «Kunlik plan» — ONE cell with a plan above 0 AND its people typed."""
    if not ctx.pairs:
        # A leader whose cells carry no SAP code cannot be measured against the
        # production page at all. That is a REGISTER error and not the leader's
        # failure, so it is recorded as such and the admins are told — but it is
        # still not-done, because the plan genuinely cannot be shown to exist.
        return Verdict(FAILED, "no_sap_code", {"cells": 0})

    dash = ctx.dashboard
    rows = dash.get("rows") or []
    planned = [r for r in rows if float(r.get("plan_qty") or 0) > 0]

    pins, day = ctx.pins, str(ctx.date)[:10]
    untyped, filled = [], []
    for c in ctx.cells:
        if (pins.get((c.id, day)) or (None,))[0] is None:
            untyped.append(cell_label(c))
        elif cell_planned(rows, c):
            filled.append(cell_label(c))
    # `untyped` keeps naming every cell with no people — it is what the warning
    # card lists as the work still to do, and the job is still every cell. What
    # decides is `filled`: one cell with both halves is the pass.
    facts = {"lines": len(rows), "with_plan": len(planned),
             "cells": len(ctx.cells), "untyped": sorted(untyped),
             "filled": sorted(filled)}
    if filled:
        return Verdict(PASSED, "ok", facts)
    if not planned:
        return Verdict(FAILED, "no_plan", facts)
    return Verdict(FAILED, "no_staffing", facts)


def _check_plan_pct(ctx: _Ctx, target: float | None) -> Verdict:
    """#9 — the «Bajarish %» of ANY one of the leader's work centres at or
    above the target."""
    want = 30.0 if target is None else float(target)
    if not ctx.pairs:
        return Verdict(FAILED, "no_sap_code", {"target": want})
    totals = (ctx.dashboard.get("totals") or {})
    plan = float(totals.get("total_plan_labor") or 0)
    if plan <= 0:
        # `completion` is 0.0 with no plan, which would read as «0% done» — a
        # verdict about work when the truth is that nothing was asked of them.
        return Verdict(FAILED, "no_plan", {"target": want, "plan_min": 0})
    # The combined figure stays in the facts: it is what the warning card shows
    # as the job, and what every verdict before 2026-09-22 was taken on.
    facts = {"target": want,
             "pct": round(float(totals.get("completion") or 0) * 100, 1),
             "plan_min": round(plan, 1),
             "fact_min": round(float(totals.get("total_actual_labor") or 0), 1)}
    names: dict[str, list[str]] = {}
    for c in ctx.cells:
        code = cell_lookup.norm_code(c.sap_code)
        if code:
            names.setdefault(code, []).append(cell_label(c))
    by_cell = []
    for code in sorted({c for c, _g in ctx.pairs}):
        t = ctx.code_totals(code)
        p = float(t.get("total_plan_labor") or 0)
        if p <= 0:
            continue                    # nothing asked of this cell today
        by_cell.append({"cell": ", ".join(sorted(names.get(code) or [code])),
                        "pct": round(float(t.get("completion") or 0) * 100, 1),
                        "plan_min": round(p, 1),
                        "fact_min": round(float(t.get("total_actual_labor") or 0), 1)})
    best = max(by_cell, key=lambda b: b["pct"]) if by_cell else None
    if best is None or best["pct"] < want:
        facts.update(by_cell=by_cell)
        if best is not None:
            facts.update(best=best["cell"], best_pct=best["pct"])
        return Verdict(FAILED, "under_target", facts)
    facts.update(by_cell=by_cell, best=best["cell"], best_pct=best["pct"])
    return Verdict(PASSED, "ok", facts)


def _check_concerns(ctx: _Ctx, target: float | None) -> Verdict:
    """#8 «Xavotirlar» — one concern raised today, by the check."""
    q = ctx.db.query(LeaderConcern.id).filter(
        LeaderConcern.created_at >= _day_start(ctx.date),
        LeaderConcern.created_at < ctx.due,
    )
    codes = [c for (c,) in ctx.db.query(Cell.verifix_code)
             .filter(Cell.leader_id == ctx.prof.id,
                     Cell.verifix_code.isnot(None)).all()]
    if ctx.cell is not None:
        own = getattr(ctx.cell, "verifix_code", None)
        codes = [own] if own else []

    from sqlalchemy import and_, or_
    mine = and_(LeaderConcern.worker_name.is_(None),
                LeaderConcern.owner_role == "leader",
                LeaderConcern.owner_profile_id == ctx.prof.id)
    by_worker = and_(LeaderConcern.worker_name.isnot(None),
                     LeaderConcern.cell_code.in_(codes)) if codes else None
    q = q.filter(mine if by_worker is None else or_(mine, by_worker))

    n = q.count()
    facts = {"found": n, "cells": len(codes),
             "from": _day_start(ctx.date).strftime("%d.%m %H:%M"),
             "to": ctx.due.astimezone(TASHKENT).strftime("%d.%m %H:%M")}
    return Verdict(PASSED if n else FAILED, "ok" if n else "no_concern", facts)


_RUNNERS = {
    "plan_staffing": _check_plan_staffing,
    "plan_pct": _check_plan_pct,
    "concerns": _check_concerns,
}


def _day_start(date_iso: str) -> datetime:
    """00:00 of the CHECKLIST day, Tashkent.

    The concerns window opens here on both shifts, which is the operator's own
    shift-1 rule («a row created 00:00—17:00») applied unchanged to a night. It
    is generous on shift 2 — a night's day starts in the evening, so the hours
    before it are counted too — and generous in the one direction that can only
    ever pass somebody, never fail them.
    """
    return datetime.strptime(str(date_iso)[:10], "%Y-%m-%d").replace(
        tzinfo=TASHKENT)


def evaluate(db: Session, *, prof: RoleProfile, manager: Manager,
             shift: int | None, date: str, cell: Cell | None,
             check: str, target: float | None,
             due: datetime, now: datetime) -> Verdict:
    """Run ONE check for one leader-cell-day. Never raises: a data error is a
    verdict (`no_data`) with the exception on the row, because a check that
    throws leaves the task open forever and the day with it."""
    runner = _RUNNERS.get(check)
    if runner is None:
        return Verdict(SKIPPED, "unknown_check", {"check": check})
    ctx = _Ctx(db, prof, manager, shift, date, cell, due, now)
    try:
        return runner(ctx, target)
    except Exception as exc:                       # noqa: BLE001 - see docstring
        logger.exception("auto check %s failed for leader %s on %s",
                         check, getattr(prof, "id", None), date)
        return Verdict(SKIPPED, "no_data", {"error": str(exc)[:200]})


# ── the sweep ────────────────────────────────────────────────────────────────
#
# Runs on the SAME 5-minute job as the per-task and day-level closes
# (`leader_close._sweep`), and BEFORE both of them: the day close writes
# `__missed__` over any task with no entry, so a pass that ran after it would
# find the platform had already recorded its own checks as the leader's failure.

# How far back an OPEN day is still swept. Bounded on purpose: shift 1 has no
# day-level auto-close at all (`leader_close.AUTOCLOSE_SHIFTS = (2,)`), so an
# abandoned shift-1 day stays open for the life of the platform — and every one
# of those dates would otherwise be walked, per leader, per task, every five
# minutes, forever. A day nobody touched for a fortnight is not one a check is
# going to rescue.
OPEN_DAY_LOOKBACK = 14


def _open_day_dates(db: Session, manager_id: int, now: datetime) -> set[str]:
    """Dates this unit still has an OPEN checklist on — the stale nights a
    verdict must still reach, or their days never close."""
    floor = max(AUTO_FROM,
                (now - timedelta(days=OPEN_DAY_LOOKBACK)).strftime("%Y-%m-%d"))
    return {str(d) for (d,) in db.query(LeaderTaskDay.date).filter(
        LeaderTaskDay.manager_id == manager_id,
        LeaderTaskDay.closed_at.is_(None),
        LeaderTaskDay.date >= floor).distinct().all()}


def _unit_due(db: Session, manager: Manager, defs: dict[int, LeaderTaskDef],
              date: str) -> dict[int, tuple[datetime, str]]:
    """`{task_id: (due, "HH:MM")}` at the UNIT level, in one query.

    The pass's own cheap gate: with nothing due it must cost a query per unit
    and never a walk of every leader's resolved config. It reads the unit and
    global levels only — **an auto task's hour is a UNIT decision and a
    per-LEADER `deadline` override on one is deliberately not honoured**, because
    a check is a statement about a shift and two leaders of one brigade asked the
    same question at two different hours could not be compared. `self_check`
    names any that exist rather than letting them sit unread.
    """
    from app.models import LeaderTaskSetting
    from app.services import leader_ai, leader_close
    rows = {r.task_id: r for r in db.query(LeaderTaskSetting).filter(
        LeaderTaskSetting.manager_id == manager.id,
        LeaderTaskSetting.task_id.in_(list(defs))).all()}
    out: dict[int, tuple[datetime, str]] = {}
    for tid, td in defs.items():
        s = rows.get(tid)
        entry = {"deadline": leader_tasks.resolve_deadline(s, td),
                 "window": leader_ai.resolve_window(manager.shift, s, td)}
        due = leader_close.due_at(entry, manager.shift, date)
        if due is not None:
            out[tid] = (due, leader_close.task_deadline(entry, manager.shift))
    return out


def check_hour(db: Session, manager_id: int | None, shift: int | None,
               task_id: int, cfg_entry: dict | None) -> str:
    """The clock this task's check fires at, "HH:MM" — the UNIT's answer.

    What a leader is SHOWN has to be what actually fires. `_unit_due` reads the
    unit and global levels only (see its docstring), so a leader-level
    `deadline` or window would otherwise make the task screen and the warning
    DM name one hour while the check took another. Falls back to the resolved
    entry when the unit cannot be read, which is still better than nothing.
    """
    from app.services import leader_close
    if manager_id is not None:
        m = db.query(Manager).filter(Manager.id == manager_id).first()
        td = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == task_id).first()
        if m is not None and td is not None:
            got = _unit_due(db, m, {task_id: td},
                            leader_tasks.effective_date(m.shift))
            if task_id in got:
                return got[task_id][1]
    return leader_close.task_deadline(cfg_entry or {}, shift)


def _ledger(db: Session, leader_id: int, date: str, task_id: int,
            cell_id: int | None) -> LeaderAutoCheck | None:
    q = db.query(LeaderAutoCheck).filter(
        LeaderAutoCheck.leader_id == leader_id,
        LeaderAutoCheck.date == date,
        LeaderAutoCheck.task_id == task_id)
    q = q.filter(LeaderAutoCheck.cell_id.is_(None) if cell_id is None
                 else LeaderAutoCheck.cell_id == cell_id)
    return q.first()


def _row_for(db: Session, *, prof, manager, date, task_id, cell_id, check,
             due) -> LeaderAutoCheck:
    row = _ledger(db, prof.id, date, task_id, cell_id)
    if row is None:
        row = LeaderAutoCheck(
            leader_id=prof.id, date=date, cell_id=cell_id, task_id=task_id,
            manager_id=manager.id, check=check, due_at=due)
        db.add(row)
        db.flush()
    return row


def _task_name(td: LeaderTaskDef | None, lang: str = "uz") -> str:
    if td is None:
        return "—"
    return (getattr(td, f"name_{lang}", None) or td.name_uz or "").strip() or "—"


def _warn(db: Session, prof, td, due: datetime, hhmm: str, *,
          manager: Manager | None = None, check: str | None = None,
          target: float | None = None, date: str | None = None,
          now: datetime | None = None, weight=None) -> bool:
    """Tell one leader a check is coming. One DM per leader per task per day,
    whatever the cell count: the warning is about a RULE, and three copies of it
    for three cells would teach the leader to stop reading them.

    From 2026-09-21 the DM is the card in `leader_auto_rich` — where to go, what
    to type, the leader's LIVE figures, the rule — built once off one snapshot
    and rendered per recipient language, with a web_app button onto the page.
    The bell row is the per-check template (`leader_auto_soon_<check>`), which
    says what to do and carries no figures. A card that cannot be built costs
    the card, never the warning: the bell template goes out as before."""
    from app.routers.staff import notify_profile
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return False
    from app.services import leader_auto_rich as card
    known = check in card.PAGE
    nkey = f"leader_auto_soon_{check}" if known else "leader_auto_soon"
    kw: dict = {}
    if known and manager is not None:
        try:
            at = (now or datetime.now(timezone.utc)).astimezone(TASHKENT)
            snap = card.snapshot(db, prof, manager, check, target, due, at,
                                 date=date)

            def _args(lang: str) -> dict:
                return dict(task_id=td.id, task_name=_task_name(td, lang),
                            due=due, hhmm=hhmm, now=at, snap=snap, lang=lang,
                            weight=weight)
            kw = dict(rich_fn=lambda lang: card.body(check, **_args(lang)),
                      html_fn=lambda lang: card.classic(check, **_args(lang)),
                      markup_fn=lambda lang: card.markup(check, lang))
        except Exception:                          # noqa: BLE001 - see doc
            logger.exception("auto-soon card failed for leader %s task %s",
                             getattr(prof, "id", None), getattr(td, "id", None))
            kw = {}
    notify_profile(db, profile_key("leader", int(prof.id)), nkey,
                   {"task": _task_name(td), "time": hhmm,
                    "date": due.astimezone(TASHKENT).strftime("%d.%m.%Y")},
                   type="warning", **kw)
    return True


def _tell(db: Session, prof, td, v: Verdict, hhmm: str, date: str,
          cell_id: int | None = None) -> None:
    """Tell one leader how their check went — always, pass or fail.

    The same reasoning the day report's own DM rests on: points now come off
    without anybody pressing anything, and a deduction discovered at the end of
    the month is how trust in the platform dies. A pass is a receipt, and it is
    what makes the failure readable as a verdict rather than an accusation out
    of nowhere.
    """
    from app.routers.staff import notify_profile
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    nkey = "leader_auto_passed" if v.done else "leader_auto_failed"
    # A verdict is about the LEADER and goes out once per task, however many
    # cell checklists it was written onto. The one cell-specific verdict —
    # «started late», a single cell checklist opened after the hour — names its
    # cell, or a leader of two cells cannot tell which checklist it was about.
    facts = _facts_line(v)
    if cell_id is not None:
        from app.services import cell_lookup as _cl
        code = (db.query(Cell.verifix_code)
                .filter(Cell.id == cell_id).scalar())
        if code:
            facts = f"{code} · {facts}"
        _ = _cl
    notify_profile(db, profile_key("leader", int(prof.id)), nkey,
                   {"task": _task_name(td), "time": hhmm,
                    "date": str(date)[:10],
                    "why": _WHY.get(v.code, v.code),
                    "facts": facts},
                   type="success" if v.done else "warning")


# The codes, in the leader's own language. Deliberately a flat map in ONE
# language and not a four-way template block: these are the WHY of a verdict,
# and the four-language rendering that matters is the one on the day report and
# in «Jurnal», where the code itself is what travels.
_WHY = {
    "ok": "Bajarildi",
    "no_plan": "Bugunga reja kiritilmagan",
    "no_staffing": "Odamlar soni kiritilmagan",
    "no_concern": "Belgilangan vaqtgacha xavotir yozilmagan",
    "under_target": "Reja belgilangan foizga yetmagan",
    "no_sap_code": "Yacheykangizda SAP kodi yo'q — adminlarga xabar berildi",
    "started_late": "Chek-list tekshiruv vaqtidan keyin boshlangan",
    # The give-up verdict (`GIVE_UP`). It is the PLATFORM's failure, not the
    # leader's, and the wording says so — the code was missing from this map,
    # so such a DM would have arrived reading «not_checked» at a leader.
    "not_checked": "Tekshiruv o'tkazilmadi — tizimda nosozlik",
    "no_data": "Ma'lumot o'qilmadi",
}


def _facts_line(v: Verdict) -> str:
    f = v.facts or {}
    if "pct" in f:
        # Several work centres: the one that decided, named — the combined
        # figure is not what a one-cell verdict was taken on.
        if len(f.get("by_cell") or []) > 1 and f.get("best"):
            return f"{f['best']}: {f.get('best_pct')}% / {f.get('target')}%"
        return f"{f['pct']}% / {f.get('target')}%"
    if v.code == "no_staffing" and f.get("untyped"):
        return ", ".join(str(x) for x in f["untyped"][:6])
    if "found" in f:
        return f"{f['found']} ta"
    if "with_plan" in f:
        return f"{f['with_plan']} / {f.get('lines', 0)}"
    return "—"


def run(db: Session, now: datetime | None = None) -> dict:
    """One pass: warn what is about to be checked, then check what is due.

    Returns a small tally for the caller to log. Never raises for one leader's
    sake — a check that throws is a verdict (`no_data`), because a task left
    open holds its whole day open behind it.
    """
    from app.services import leader_close
    tally = {"warned": 0, "checked": 0, "passed": 0, "failed": 0, "skipped": 0,
             "measured": 0}
    if not any_auto(db):
        return tally
    now = (now or datetime.now(timezone.utc)).astimezone(TASHKENT)

    defs = {td.id: td for td in db.query(LeaderTaskDef)
            .filter(LeaderTaskDef.auto_check.isnot(None)).all()}
    units = leader_tasks.per_task_units(db)
    if not units or not defs:
        return tally
    managers = db.query(Manager).filter(Manager.id.in_(units)).all()

    for m in managers:
        if getattr(m, "archived", False):
            continue
        dates = {leader_tasks.effective_date(m.shift, now)}
        dates |= _open_day_dates(db, m.id, now)
        dates = {d for d in dates if str(d)[:10] >= AUTO_FROM}
        leaders = None
        for date in sorted(dates):
            due_by_task = _unit_due(db, m, defs, date)
            live = {tid: dt for tid, dt in due_by_task.items()
                    if now >= dt[0] - WARN_BEFORE}
            if not live:
                continue
            if leaders is None:
                # The unit's roster, spelled exactly as the brigadir's day
                # digest spells it (`leader_unit_report`): a leader profile has
                # no archived flag of its own — an archived UNIT owes nothing,
                # and that is checked above.
                leaders = (db.query(RoleProfile)
                           .filter(RoleProfile.role == "leader",
                                   RoleProfile.manager_id == m.id)
                           .order_by(RoleProfile.name).all())
            for prof in leaders:
                _run_leader(db, m, prof, date, live, defs, now, tally,
                            leader_close)
    return tally


def _run_leader(db, m, prof, date, live, defs, now, tally, leader_close) -> None:
    # A day nobody is scored on is a day nobody is checked on — the same carve-
    # out every AI queue door already makes, and for the same reason: a cutoff
    # or an exclusion says this leader-day costs nobody anything.
    if leader_exclusions.excluded(db, prof.id, date, leader_name=prof.name):
        return
    cfg = cells = None
    for tid, (due, hhmm) in live.items():
        td = defs.get(tid)
        parsed = parse_check(td.auto_check if td else None)
        if parsed is None:
            continue
        check, target = parsed
        if cfg is None:
            cfg = leader_tasks.effective_leader_config(
                db, prof, m.shift, day=date)
        s = cfg.get(tid)
        # The unit's clock said this is due; the LEADER's resolved config is
        # what says the task is theirs at all, and whether it is automatic.
        if not s or not s.get("enabled") or not is_auto(s):
            continue
        if cells is None:
            # Once per leader-day, never once per task: each call costs a
            # `unit_floor` query plus a `filing_cells` query, and the answer
            # cannot differ between two tasks of one checklist.
            cells = leader_cells.expected_days(db, prof, date)
        if not cells:
            continue

        if now < due:
            # «Have I warned?» is a question about the LEADER-day, so it is
            # asked of every row and not of `cells[0]`: `filing_cells` orders
            # by verifix code, so a cell assigned inside the 30-minute window
            # changes which row that is, and the branch would re-enter and send
            # a second DM — the one double-message this ledger exists to stop.
            warned = (db.query(LeaderAutoCheck.id).filter(
                LeaderAutoCheck.leader_id == prof.id,
                LeaderAutoCheck.date == date,
                LeaderAutoCheck.task_id == tid,
                LeaderAutoCheck.warned_at.isnot(None)).first())
            if warned is None:
                for cid in cells:
                    r = _row_for(db, prof=prof, manager=m, date=date,
                                 task_id=tid, cell_id=cid, check=check, due=due)
                    r.warned_at = now
                db.commit()
                if _warn(db, prof, td, due, hhmm, manager=m, check=check,
                         target=target, date=date, now=now,
                         weight=s.get("weight")):
                    tally["warned"] += 1
                    db.commit()
            continue

        # A per-cell unit judges the LEADER once (module doc): the first cell
        # that takes a fresh verdict in this pass hands it to the rest — a cell
        # with no checklist yet keeps it as its at-the-hour measurement. Cells
        # whose checklist did not exist at the hour go LAST, so that one of
        # them opened late never re-reads the page after the hour.
        if len(cells) > 1:
            late = {cid for (cid,) in db.query(LeaderAutoCheck.cell_id).filter(
                LeaderAutoCheck.leader_id == prof.id,
                LeaderAutoCheck.date == date,
                LeaderAutoCheck.task_id == tid,
                LeaderAutoCheck.code == "no_day").all()}
            cells = sorted(cells, key=lambda cid: cid in late)
        shared = None
        for cid in cells:
            wrote, fresh = _settle(db, m, prof, date, cid, tid, td, check,
                                   target, due, hhmm, now, tally, leader_close,
                                   shared=shared)
            if shared is None and fresh is not None:
                shared = fresh
            if wrote:
                db.commit()


def _sibling_verdict(db: Session, leader_id: int, date: str, task_id: int,
                     cell_id: int) -> Verdict | None:
    """The verdict another of this leader's cell checklists took AT THE HOUR —
    what a cell checklist opened after the check inherits on a per-cell unit,
    because the check is about the leader and the leader had a checklist then.
    A sibling that was itself «started late» carries nothing to inherit."""
    row = (db.query(LeaderAutoCheck)
           .filter(LeaderAutoCheck.leader_id == leader_id,
                   LeaderAutoCheck.date == date,
                   LeaderAutoCheck.task_id == task_id,
                   LeaderAutoCheck.cell_id.isnot(None),
                   LeaderAutoCheck.cell_id != cell_id,
                   LeaderAutoCheck.outcome.in_((PASSED, FAILED)),
                   LeaderAutoCheck.code != "started_late",
                   LeaderAutoCheck.entry_id.isnot(None))
           .order_by(LeaderAutoCheck.checked_at).first())
    if row is None:
        return None
    return Verdict(row.outcome, row.code, dict(row.facts or {}))


def _at_hour(row: LeaderAutoCheck | None) -> Verdict | None:
    """The verdict read off the page AT THE HOUR for a leader who had no
    checklist then — kept on the `no_day` row until the checklist appears
    (module doc, «MEASURED AT THE HOUR»). None when nothing was measured."""
    at = (row.facts or {}).get("at_hour") if row is not None else None
    if not isinstance(at, dict) or at.get("outcome") not in (PASSED, FAILED):
        return None
    return Verdict(at["outcome"], str(at.get("code") or ""),
                   dict(at.get("facts") or {}))


def measured(db: Session, leader_id: int, date: str, task_id: int,
             cell_id: int | None) -> Verdict | None:
    """What the check found at its hour for a leader whose checklist did not
    exist yet — what the task's own screen in the bot shows until the next pass
    writes it onto the checklist."""
    return _at_hour(_ledger(db, leader_id, str(date)[:10], task_id, cell_id))


def _already_told(db: Session, row: LeaderAutoCheck) -> bool:
    """Has this leader already been sent this task's verdict for the day?

    One verdict DM per task, however many cell checklists it lands on and in
    whatever order they appear: on a per-cell unit the verdict may be measured
    on a cell with no checklist yet and written first onto a sibling, or written
    onto this cell hours after a sibling carried it. «Does another row of this
    leader-day already carry a written verdict» answers both. A row the leader
    answered themselves (`already_filed`, outcome «skipped») is not one.
    """
    return bool(db.query(LeaderAutoCheck.id).filter(
        LeaderAutoCheck.leader_id == row.leader_id,
        LeaderAutoCheck.date == row.date,
        LeaderAutoCheck.task_id == row.task_id,
        LeaderAutoCheck.id != row.id,
        LeaderAutoCheck.entry_id.isnot(None),
        LeaderAutoCheck.outcome.in_((PASSED, FAILED))).first())


def _from_record(db: Session, *, prof, manager, date: str, check: str,
                 target: float | None, due: datetime,
                 now: datetime) -> Verdict | None:
    """What stood at the hour, for a `no_day` row written BEFORE the page was
    measured there — read off the record, never off the page as it is now,
    which would pass work done after the deadline.

    TRANSITIONAL. Such a row can only ever reach a checklist on its own day (a
    checklist is created for the current day and no other), so this path goes
    quiet once 23 Sep 2026 is over. The concerns check needs no record: its
    window already ends at the hour. #1 replays the Jurnal's time-stamped saves
    the way the 22 Sep restore list did (`auto_check_restore`, imported lazily,
    so deleting that module can never break a boot — this then answers None).
    None = the record cannot place it, and the rule in force at the hour stands.
    """
    if check == "concerns":
        v = evaluate(db, prof=prof, manager=manager, shift=manager.shift,
                     date=date, cell=None, check=check, target=target,
                     due=due, now=now)
        return None if v.outcome == SKIPPED else v
    if check != "plan_staffing":
        return None
    try:
        from app.services import auto_check_restore as acr
        ctx = _Ctx(db, prof, manager, manager.shift, date, None, due, now)
        if not ctx.pairs:
            return Verdict(FAILED, "no_sap_code", {"cells": 0})
        rows = ctx.dashboard.get("rows") or []
        u = acr._Unit(db, manager, str(date)[:10])
        # A replay that does not end on the pins stored now missed a write, and
        # then nothing it says about the people at the hour can be trusted.
        pins = u.pins_at(due) if u.replay_ok() else None
        filled, untyped, maybe_plan, unsure = [], [], 0, False
        for c in ctx.cells:
            typed = None if pins is None else (u.cell_value(pins, c) is not None)
            plan, _why = acr._plan_at_hour(u, rows, c, due)
            maybe_plan += plan is not False
            if typed is False:
                untyped.append(cell_label(c))
            if typed and plan:
                filled.append(cell_label(c))
            elif typed is not False and plan is not False:
                unsure = True           # it may have been filled — not proven
        facts = {"cells": len(ctx.cells), "untyped": sorted(untyped),
                 "filled": sorted(filled), "from_record": True}
        if filled:
            return Verdict(PASSED, "ok", facts)
        if unsure:
            return None
        return Verdict(FAILED, "no_staffing" if maybe_plan else "no_plan", facts)
    except Exception:                               # noqa: BLE001 - see docstring
        logger.exception("auto check: record replay failed for leader %s on %s",
                         getattr(prof, "id", None), date)
        return None


def _measure_without_day(db, row, m, prof, date, check, target, due, now,
                         tally, shared: Verdict | None
                         ) -> tuple[bool, Verdict | None]:
    """The hour has come and this leader has no checklist yet: read the page
    NOW — at the hour — and keep the verdict on the row (module doc, «MEASURED
    AT THE HOUR»). No score moves and nobody is told: there is no checklist to
    write it on, and the verdict goes out with the entry once there is one.

    Measured ONCE. A row carrying a measurement is left alone, and so is a
    `no_day` row from before this existed (neither `at_hour` nor
    `measure_error`): its hour went by unmeasured, and a reading taken now would
    be a reading of the page after the deadline — `_from_record` answers for it
    when its checklist appears."""
    f = row.facts or {}
    if "at_hour" in f:
        return False, None
    if row.outcome is not None and "measure_error" not in f:
        return False, None
    if shared is not None:
        v, fresh = Verdict(shared.outcome, shared.code, dict(shared.facts)), None
    else:
        v = fresh = evaluate(db, prof=prof, manager=m, shift=m.shift, date=date,
                             cell=None, check=check, target=target, due=due,
                             now=now)
    if v.outcome == SKIPPED:
        if now < due + GIVE_UP:
            # The data could not be read — not the leader's failure. Tried
            # again on the next pass, exactly as with a checklist that exists.
            row.checked_at, row.outcome, row.code = now, SKIPPED, "no_day"
            row.facts = dict(v.facts, measure_error=v.code)
            tally["skipped"] += 1
            return True, fresh
        v = Verdict(FAILED, "not_checked", dict(v.facts, gave_up=True))
    facts = dict(v.facts)
    late = max(0, int((now - due).total_seconds() // 60))
    if late > LATE_GRACE.total_seconds() // 60:
        facts["late_by_min"] = late
    row.checked_at, row.outcome, row.code = now, SKIPPED, "no_day"
    row.facts = {"at_hour": {"outcome": v.outcome, "code": v.code,
                             "facts": facts}}
    tally["measured"] += 1
    return True, fresh


def _settle(db, m, prof, date, cell_id, tid, td, check, target, due, hhmm,
            now, tally, leader_close, shared: Verdict | None = None
            ) -> tuple[bool, Verdict | None]:
    """Decide ONE (leader, date, cell, task).

    Returns `(wrote, fresh)`: whether anything was written, and the verdict
    when THIS call took one off the data — the one its siblings on a per-cell
    unit are handed as `shared` instead of re-reading the page."""
    row = _row_for(db, prof=prof, manager=m, date=date, task_id=tid,
                   cell_id=cell_id, check=check, due=due)
    # TERMINAL means the task is CLOSED, never merely that an entry exists.
    # `entry_id` alone was the first spelling and it stranded days: nothing
    # else writes `closed_at` for an auto task any more (`autoclose_due` skips
    # them, the bot refuses every button, `close_expired_days` drops a day
    # holding a reopened task), so an entry left unlocked had no writer left
    # at all and its day stayed open forever — which every read surface on
    # this platform reads as «this leader filed nothing». Three ways to reach
    # it: the process dying between the commit below and `close_task`, a
    # pre-existing DRAFT recorded `already_filed`, and an admin reopening the
    # task. The third is now refused outright; the first two heal here,
    # because this test sends them round again.
    if row.entry_id is not None:
        done = (db.query(LeaderTaskEntry)
                .filter(LeaderTaskEntry.id == row.entry_id,
                        LeaderTaskEntry.closed_at.isnot(None)).first())
        if done is not None:
            return False, None            # settled for good
    if row.code == "day_closed":
        # The day ended without this check; nothing can be written to it now
        # and nothing may keep re-stating that every five minutes.
        return False, None

    day = (db.query(LeaderTaskDay)
           .filter(LeaderTaskDay.leader_id == prof.id,
                   LeaderTaskDay.date == date,
                   LeaderTaskDay.cell_id.is_(None) if cell_id is None
                   else LeaderTaskDay.cell_id == cell_id).first())
    if day is None:
        # Nothing to write a verdict ON — but the hour is what the check asks
        # about, so the page is read now all the same and the answer is kept
        # on the row. `LeaderTaskDay` carries no created_at, so this row is
        # also the only evidence that the checklist did not exist at the hour.
        return _measure_without_day(db, row, m, prof, date, check, target,
                                    due, now, tally, shared)

    if day.closed_at is not None:
        if row.code == "day_closed":
            return False, None
        row.checked_at, row.outcome, row.code = now, SKIPPED, "day_closed"
        return True, None

    entry = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
    if entry is not None:
        # The leader answered it before the unit was switched, or an admin did.
        # Their answer STANDS: this module writes a verdict, never over one.
        #
        # But it must still be CLOSED. A leader mid-checklist holds a DRAFT —
        # answered, not submitted — and that is exactly what the rollout's own
        # mid-shift exception produces: the switch lands, the leader can no
        # longer press «Vazifani yopish» (the bot refuses every button on an
        # auto task) and nothing else closes it, so the day hangs open behind
        # one task nobody on earth can submit. Closing it here hands the photos
        # they took to the AI exactly as their own press would have.
        row.checked_at, row.outcome, row.code = now, SKIPPED, "already_filed"
        row.entry_id = entry.id
        db.commit()
        if entry.closed_at is None:
            cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
            leader_close.close_task(db, day=day, entry=entry, cfg=cfg,
                                    actor=f"avtomatik · {prof.name}")
        tally["skipped"] += 1
        return True, None

    # `no_day` is a CODE and «skipped» is the OUTCOME — testing the outcome
    # against it (as this did first) is never true, and the branch below then
    # silently became an ordinary late evaluation, which passes a leader who
    # entered the plan half an hour after the hour that asked for it. Found by
    # running it, 2026-09-20.
    #
    # `stamp` is the instant the verdict was taken, `late_from` the one its
    # lateness is counted from — None where the verdict is a statement about
    # the hour itself and carries its own.
    fresh, stamp, late_from = None, now, now
    if row.code == "no_day" and row.checked_at is not None:
        # The checklist appeared AFTER the hour. What counts is what stood on
        # the page AT the hour (module doc, «MEASURED AT THE HOUR»).
        v = _at_hour(row)
        if v is not None:
            stamp, late_from = row.checked_at, None
        elif "measure_error" in (row.facts or {}):
            # The page could not be read at the hour: this pass is simply the
            # next try, as it is for a checklist that existed then.
            v = fresh = evaluate(db, prof=prof, manager=m, shift=m.shift,
                                 date=date, cell=None, check=check,
                                 target=target, due=due, now=now)
        else:
            # Written before the hour was measured: another cell checklist's
            # verdict at the hour, else the record, else the old rule.
            v = (_sibling_verdict(db, prof.id, date, tid, cell_id)
                 if cell_id is not None else None)
            if v is None:
                v = _from_record(db, prof=prof, manager=m, date=date,
                                 check=check, target=target, due=due, now=now)
            if v is not None:
                late_from = None
            else:
                v = Verdict(FAILED, "started_late",
                            {"checked_at": row.checked_at.astimezone(TASHKENT)
                             .strftime("%d.%m %H:%M")})
        # When the checklist turned up — the other half of «why did this
        # verdict land hours after its hour», answerable months later.
        v.facts = dict(v.facts, checklist_seen=now.astimezone(TASHKENT)
                       .strftime("%d.%m %H:%M"))
    elif shared is not None:
        v = Verdict(shared.outcome, shared.code, dict(shared.facts))
    else:
        # Always over ALL of the leader's cells — `cell=None` — whether the
        # unit files one checklist per leader or one per cell (module doc).
        v = fresh = evaluate(db, prof=prof, manager=m, shift=m.shift,
                             date=date, cell=None, check=check, target=target,
                             due=due, now=now)
    if v.outcome == SKIPPED:
        if now < due + GIVE_UP:
            # A data failure is NOT recorded as the leader's. Left unsettled
            # so the next pass tries again; `entry_id` stays None, so nothing
            # here is final and the day is not closed on a number nobody could
            # read.
            row.checked_at, row.outcome, row.code = now, SKIPPED, v.code
            row.facts = v.facts
            tally["skipped"] += 1
            return True, fresh
        # …but not forever. Past the window the entry is written as UNCHECKED
        # so the task closes and its day can end: a day held open by a platform
        # fault costs the leader every other task on it.
        v = Verdict(FAILED, "not_checked", dict(v.facts, gave_up=True))

    if late_from is not None:
        late = max(0, int((late_from - due).total_seconds() // 60))
        if late > LATE_GRACE.total_seconds() // 60:
            v.facts = dict(v.facts, late_by_min=late)

    entry = LeaderTaskEntry(day_id=day.id, task_id=tid, done=v.done,
                            reason=leader_tasks.auto_reason(hhmm, v.code))
    db.add(entry)
    db.flush()
    row.checked_at, row.outcome, row.code = stamp, v.outcome, v.code
    row.facts, row.entry_id = v.facts, entry.id
    db.commit()

    cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
    leader_close.close_task(db, day=day, entry=entry, cfg=cfg,
                            actor=f"avtomatik · {prof.name}")
    tally["checked"] += 1
    tally[PASSED if v.done else FAILED] += 1
    # ONE message per task (`_already_told`) — a copy is a verdict the leader
    # has already been sent. Only «started late» is about one cell checklist,
    # so only it is always sent, and only it names the cell.
    if v.code == "started_late" or not _already_told(db, row):
        _tell(db, prof, td, v, hhmm, date,
              cell_id if v.code == "started_late" else None)
        if v.code == "no_sap_code" and not _already_alerted(db, prof.id, date, tid):
            _alert_admins(db, prof, m, td, date)
    return True, fresh


def _already_alerted(db: Session, leader_id: int, date: str,
                     task_id: int) -> bool:
    """Has this leader's missing SAP code already been reported today?

    Two of the three checks answer `no_sap_code` for the same leader on the
    same day, and `_alert_admins` broadcasts to EVERY admin. Without this a
    register error nobody has got round to fixing yet costs every admin two
    DMs per affected leader, every single day — which is how people learn to
    ignore the alerts that matter. One per leader-day; the condition is a
    standing fact about /cells, not news that repeats.
    """
    return bool(db.query(LeaderAutoCheck.id).filter(
        LeaderAutoCheck.leader_id == leader_id,
        LeaderAutoCheck.date == date,
        LeaderAutoCheck.task_id != task_id,
        LeaderAutoCheck.code == "no_sap_code").first())


def _alert_admins(db: Session, prof, m, td, date: str) -> None:
    """A leader with no SAP code on their cells cannot be measured against the
    production page at all, and that is a REGISTER error somebody has to fix —
    so it is named rather than absorbed as the leader's failure.

    Same door and same reasoning as `startup.report_leader_deadline_rules`:
    this platform has no shell, so a log nobody can open is not a warning.
    """
    try:
        import html
        from app.routers.boot import _recipients
        from app.telegram_bot import bot
        esc = lambda v: html.escape(str(v), quote=False)     # noqa: E731
        text = ("⚠️ <b>Avtomatik tekshiruv: SAP kodi yo'q</b>\n"
                f"Lider: {esc(prof.name)}\n"
                f"Brigada: {esc(getattr(m, 'name', m.id))}\n"
                f"Vazifa: {esc(_task_name(td))} · {esc(str(date)[:10])}\n"
                "Yacheykalarida SAP kodi yo'q — vazifa bajarilmagan deb "
                "yozildi. /cells sahifasida to'g'irlang.")
        for chat_id in _recipients():
            try:
                bot.send_message(chat_id, text, parse_mode="HTML")
            except Exception:                                 # noqa: BLE001
                pass
    except Exception:                                         # noqa: BLE001
        logger.exception("auto check: could not alert admins about %s",
                         getattr(prof, "id", None))
