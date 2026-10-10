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
    action_log, cell_archive, cell_lookup, leader_cells, leader_exclusions, leader_proof,
    leader_shift, leader_tasks, wc_group, zagruzka_source,
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
CHECKS = ("plan_staffing", "concerns", "plan_pct", "staff_list")

# A check that joined after `AUTO_FROM` judges nothing before its own first day.
# Same reasoning as the floor itself: the config chain is not versioned, so an
# OPEN day from before the switch resolves the task as automatic too — and must
# be closed the way it was filed, by the ordinary per-task close, never handed a
# verdict under a rule it was not filed under. `owns` is the one test for it.
#
# `staff_list` (#11, «Ish grafigi») — the operator's hard switch: shift 1's day
# of 5 Oct 2026 and shift 2's night of 5→6 Oct (whose checklist day is the 5th).
CHECK_FROM = {"staff_list": "2026-10-05"}

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


def check_floor(check: str | None) -> str:
    """The first checklist day `check` judges (`CHECK_FROM`, else `AUTO_FROM`)."""
    return max(AUTO_FROM, CHECK_FROM.get(str(check or ""), AUTO_FROM))


def owns(cfg_entry: dict | None, date) -> bool:
    """Does this module decide this task on this checklist day? `is_auto` AND
    the day is on or after the check's own floor. Everything that would
    otherwise close an automatic task (the per-task and day-level closes) asks
    this, so a task this module will not judge is never left without a closer."""
    if not is_auto(cfg_entry):
        return False
    parsed = parse_check((cfg_entry or {}).get("auto_check"))
    return str(date)[:10] >= check_floor(parsed[0] if parsed else None)


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
                 "now", "_dash", "_pins", "_pairs", "_cells", "_by_code", "_unit")

    def __init__(self, db, prof, manager, shift, date, cell, due, now):
        self.db, self.prof, self.manager = db, prof, manager
        self.shift, self.date, self.cell = shift, date, cell
        self.due, self.now = due, now
        self._dash = self._pins = self._pairs = self._cells = self._unit = None
        self._by_code = {}

    @property
    def unit_id(self) -> int:
        """The unit whose PRODUCTION the leader's cells stand in — where their
        catalog, plan and typed people are stored. The leader's own unit for
        everybody whose cells sit there; the cells' unit for a leader counted
        under another brigadir (`cell_lookup.cells_unit_for_leader`), who would
        otherwise be measured against a catalog that has never carried their
        cell. `manager` stays the leader's unit for everything else a check
        asks — its hour, its shift, whose checklist the verdict lands on."""
        if self._unit is None:
            owner = (getattr(self.cell, "manager_id", None) if self.cell is not None
                     else cell_lookup.cells_unit_for_leader(self.db, self.prof.id))
            self._unit = int(owner) if owner else self.manager.id
        return self._unit

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
                self.db, self.unit_id, _as_date(self.date),
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
                self.db, self.unit_id, _as_date(self.date),
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
                # A cell archived before the day is not checked on it.
                self._cells = (self.db.query(Cell)
                               .filter(Cell.leader_id == self.prof.id,
                                       cell_archive.alive_clause(self.date))
                               .all())
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
            raw = zagruzka_source.typed_pins(self.db, [self.unit_id], d, d)
            unit_cells = (self.db.query(Cell)
                          .filter(Cell.manager_id == self.unit_id).all())
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
                     Cell.verifix_code.isnot(None),
                     cell_archive.alive_clause(ctx.date)).all()]
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


def _check_staff_list(ctx: _Ctx, target: float | None) -> Verdict:
    """#11 «Ish grafigi» — every worker on the staff list of EVERY one of the
    leader's cells that has a plan today is marked «Keladi» or «Kelmaydi»
    (the operator's rules, 4—5 Oct 2026).

    * Only cells with a plan that day — #1's own reading (`cell_planned`) — are
      checked; a cell with a plan and nobody on its list is skipped too. No
      checked cell at all is a PASS: there was no list to fill.
    * Which list: the check day's («today», the shift-day being checked) or the
      next one's («tomorrow») — per CELL, fixed on its first check day with a
      plan: tomorrow's filled (whatever today's) → «tomorrow»; only today's →
      «today»; neither → the task fails and the type is fixed on a later day.
      Until it is fixed either list passes (`KelishCellKind`).
    * Who marked a worker does not matter — only whether the list is filled.

    Read AT THE HOUR: a pass within `LATE_GRACE` reads the lists as they are;
    a later one (an outage, a transition grant) reads them as they stood at the
    hour — marks set by then, «+»/«−» made by then, the file as read by then.
    """
    from app.services import kelish
    d = _as_date(ctx.date)
    days = (d, d + timedelta(days=1))
    rows = (ctx.dashboard.get("rows") or []) if ctx.pairs else []
    cells = sorted(ctx.cells, key=lambda c: (c.verifix_code or "", c.id))
    planned = [c for c in cells if cell_planned(rows, c)]
    facts: dict = {"days": [x.isoformat() for x in days], "lists": [],
                   "no_plan": sorted(cell_label(c) for c in cells
                                     if c not in planned),
                   "empty": []}
    if not planned:
        return Verdict(PASSED, "ok", facts)

    cutoff = ctx.due if (ctx.now - ctx.due) > LATE_GRACE else None
    # The check fixes a cell's type only when it is the real verdict at (or
    # after) the hour of a day under this rule — never from the warning card.
    decide = ctx.now >= ctx.due and str(ctx.date)[:10] >= check_floor("staff_list")
    files = kelish.file_workers_days(ctx.db, list(days), as_of=cutoff)
    ids = [c.id for c in planned]
    events = kelish.load_events(ctx.db, ids)
    marks = kelish.load_marks_days(ctx.db, ids, list(days))
    kinds = kelish.load_kinds(ctx.db, ids)

    all_ok = True
    for c in planned:
        label = cell_label(c)
        ev = [e for e in events.get(c.id, [])
              if cutoff is None or (e.created_at is not None and e.created_at <= cutoff)]
        got = {}
        for name, day in zip(kelish.KINDS, days):
            fw, last = files[day]
            mk = marks.get(c.id, {}).get(day, {})
            if cutoff is not None:
                mk = {k: m for k, m in mk.items()
                      if m.set_at is not None and m.set_at <= cutoff}
            lst = (kelish.roster(c.verifix_code, day, fw, last, ev, mk)
                   if c.verifix_code else [])
            n = len(lst)
            m_ = sum(1 for r in lst if r["mark"] in kelish.STATUSES)
            got[name] = (m_, n)
        full = {k: (n > 0 and m_ == n) for k, (m_, n) in got.items()}
        kr = kinds.get(c.id)
        kind = kr.kind if kr is not None and kr.kind in kelish.KINDS else None
        item = {"cell": label, "kind": kind,
                "today": list(got["today"]), "tomorrow": list(got["tomorrow"])}
        if kind is not None:
            if got[kind][1] == 0:
                facts["empty"].append(label)
                continue
            ok = full[kind]
        else:
            if got["today"][1] == 0 and got["tomorrow"][1] == 0:
                facts["empty"].append(label)
                continue
            pick = ("tomorrow" if full["tomorrow"]
                    else "today" if full["today"] else None)
            ok = pick is not None
            if pick is not None:
                if decide and kelish.decide_kind(ctx.db, c.id, pick, d):
                    item["kind"], item["decided"] = pick, True
                else:
                    item["would_be"] = pick
        item["ok"] = ok
        all_ok = all_ok and ok
        facts["lists"].append(item)
    if not facts["lists"]:
        return Verdict(PASSED, "ok", facts)
    return Verdict(PASSED if all_ok else FAILED,
                   "ok" if all_ok else "not_filled", facts)


_RUNNERS = {
    "plan_staffing": _check_plan_staffing,
    "plan_pct": _check_plan_pct,
    "concerns": _check_concerns,
    "staff_list": _check_staff_list,
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
              date: str, rows: dict | None = None) -> dict[int, tuple[datetime, str]]:
    """`{task_id: (due, "HH:MM")}` at the UNIT level, in one query.

    The pass's own cheap gate: with nothing due it must cost a query per unit
    and never a walk of every leader's resolved config. It reads the unit and
    global levels only — **an auto task's hour is a UNIT decision and a
    per-LEADER `deadline` override on one is deliberately not honoured**, because
    a check is a statement about a shift and two leaders of one brigade asked the
    same question at two different hours could not be compared. `self_check`
    names any that exist rather than letting them sit unread.

    `rows` replaces the unit's level — the shift's standard, for a leader whose
    checklist runs on the other shift that day (services/leader_shift), with
    `manager` read as running on that shift (`leader_shift.AsShift`).
    """
    from app.models import LeaderTaskSetting
    from app.services import leader_ai, leader_close
    if rows is None:
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
               task_id: int, cfg_entry: dict | None, *,
               leader_id: int | None = None, date: str | None = None) -> str:
    """The clock this task's check fires at, "HH:MM" — the UNIT's answer.

    What a leader is SHOWN has to be what actually fires. `_unit_due` reads the
    unit and global levels only (see its docstring), so a leader-level
    `deadline` or window would otherwise make the task screen and the warning
    DM name one hour while the check took another. Falls back to the resolved
    entry when the unit cannot be read, which is still better than nothing.

    Pass the leader and the night and a night whose hours were moved
    (services/leader_temp_hours) is answered with the moved hour — the one
    `_run_leader` checks at. The fallback needs no move: the resolved entry
    already carries it.
    """
    from app.services import leader_close, leader_temp_hours
    if manager_id is not None:
        m = db.query(Manager).filter(Manager.id == manager_id).first()
        td = db.query(LeaderTaskDef).filter(LeaderTaskDef.id == task_id).first()
        if m is not None and td is not None:
            rows = None
            if leader_id and leader_shift.moved(db, leader_id):
                # A leader whose checklist runs on the other shift that day is
                # checked at that shift's standard hour (`run` does the same).
                night = date
                if not night:
                    prof = db.query(RoleProfile).filter_by(id=leader_id).first()
                    night = (leader_shift.current(db, prof)[1] if prof
                             else leader_tasks.effective_date(m.shift))
                sh = leader_shift.shifted(db, leader_id, night, m.shift)
                if sh:
                    m, rows = leader_shift.AsShift(m, sh), leader_shift.standard(db, sh)
            else:
                night = date or leader_tasks.effective_date(m.shift)
            got = _unit_due(db, m, {task_id: td}, night, rows=rows)
            if task_id in got:
                moved = leader_temp_hours.for_leader(db, leader_id, night)
                if moved:
                    return leader_temp_hours.move_clock(
                        m.shift, got[task_id][1], moved.minutes)
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
    # The bell row opens the page the check reads — the button's own target.
    page = card.PAGE.get(check) if known else None
    notify_profile(db, profile_key("leader", int(prof.id)), nkey,
                   {"task": _task_name(td), "time": hhmm,
                    "date": due.astimezone(TASHKENT).strftime("%d.%m.%Y")},
                   type="warning", subject=("page", page) if page else None, **kw)
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
                   type="success" if v.done else "warning",
                   # The verdict sits on the leader's checklist for that day.
                   subject=("checklist", f"{int(prof.id)}:{str(date)[:10]}:{td.id}"))


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
    "not_filled": "«Ish grafigi»da hamma xodim belgilanmagan",
}


def _facts_line(v: Verdict) -> str:
    f = v.facts or {}
    if "pct" in f:
        # Several work centres: the one that decided, named — the combined
        # figure is not what a one-cell verdict was taken on.
        # The LEADER reads this DM: their figure only, never the pass mark
        # (`hides_target`).
        if len(f.get("by_cell") or []) > 1 and f.get("best"):
            return f"{f['best']}: {f.get('best_pct')}%"
        return f"{f['pct']}%"
    if "lists" in f:
        return staff_list_cells(f) or "—"
    if v.code == "no_staffing" and f.get("untyped"):
        return ", ".join(str(x) for x in f["untyped"][:6])
    if "found" in f:
        return f"{f['found']} ta"
    if "with_plan" in f:
        return f"{f['with_plan']} / {f.get('lines', 0)}"
    return "—"


def run(db: Session, now: datetime | None = None,
        leader_ids: set[int] | None = None) -> dict:
    """One pass: warn what is about to be checked, then check what is due.

    Returns a small tally for the caller to log. Never raises for one leader's
    sake — a check that throws is a verdict (`no_data`), because a task left
    open holds its whole day open behind it.

    `leader_ids` narrows the pass to those leader profiles (and their units):
    the bot's `/tasks` settles the CALLER's own checks before it shows the
    menu, and walked the whole plant to do it — 3.3 s a command with the DB
    pool full (the 9 Oct «Server was slow» DM). Everybody else is the 5-minute
    sweep's, which passes nothing.
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
    if leader_ids is not None:
        mine = {mid for (mid,) in db.query(RoleProfile.manager_id).filter(
            RoleProfile.id.in_(leader_ids)).all() if mid}
        units = [u for u in units if u in mine]
        if not units:
            return tally
    managers = db.query(Manager).filter(Manager.id.in_(units)).all()
    moved = set(leader_shift.moved_ids(db))
    if leader_ids is not None:
        moved &= set(leader_ids)

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
                if leader_ids is not None and prof.id not in leader_ids:
                    continue
                # A leader whose checklist runs on the other shift that day is
                # answered on their own shift below, never on the unit's hours.
                if prof.id in moved and leader_shift.shifted(db, prof.id, date, m.shift):
                    continue
                _run_leader(db, m, prof, date, live, defs, now, tally,
                            leader_close)
    if moved:
        _run_moved(db, managers, moved, defs, now, tally, leader_close)
    return tally


def _open_leader_dates(db: Session, leader_id: int, now: datetime) -> set[str]:
    """`_open_day_dates` for one leader — the stale days of a moved leader."""
    floor = max(AUTO_FROM,
                (now - timedelta(days=OPEN_DAY_LOOKBACK)).strftime("%Y-%m-%d"))
    return {str(d) for (d,) in db.query(LeaderTaskDay.date).filter(
        LeaderTaskDay.leader_id == leader_id,
        LeaderTaskDay.closed_at.is_(None),
        LeaderTaskDay.date >= floor).distinct().all()}


def _run_moved(db, managers, moved, defs, now, tally, leader_close) -> None:
    """The checks of leaders whose checklist runs on the OTHER shift than their
    unit's (services/leader_shift): their days, at that shift's standard hours,
    with their unit read as running on that shift. Days still on the unit's
    shift were answered by the unit's pass."""
    by_id = {m.id: m for m in managers if not getattr(m, "archived", False)}
    for prof in (db.query(RoleProfile)
                 .filter(RoleProfile.role == "leader",
                         RoleProfile.id.in_(moved)).all()):
        m = by_id.get(prof.manager_id)
        if m is None:
            continue
        dates = {leader_shift.current(db, prof, now)[1]}
        dates |= _open_leader_dates(db, prof.id, now)
        for date in sorted(d for d in dates if str(d)[:10] >= AUTO_FROM):
            sh = leader_shift.shifted(db, prof.id, date, m.shift)
            if sh is None:
                continue
            mm = leader_shift.AsShift(m, sh)
            due_by_task = _unit_due(db, mm, defs, date,
                                    rows=leader_shift.standard(db, sh))
            live = {tid: dt for tid, dt in due_by_task.items()
                    if now >= dt[0] - WARN_BEFORE}
            if live:
                _run_leader(db, mm, prof, date, live, defs, now, tally,
                            leader_close)


def _run_leader(db, m, prof, date, live, defs, now, tally, leader_close) -> None:
    # A day nobody is scored on is a day nobody is checked on — the same carve-
    # out every AI queue door already makes, and for the same reason: a cutoff
    # or an exclusion says this leader-day costs nobody anything.
    if leader_exclusions.excluded(db, prof.id, date, leader_name=prof.name):
        return
    # A night whose hours were moved for this leader (services/leader_temp_hours)
    # is checked — and warned about — at the moved hour. The operator's call for
    # those nights, against `_unit_due`'s one-hour-per-unit rule: the unit's
    # clock only says the task has become LIVE; this leader's own clock says
    # when it is due.
    from app.services import leader_temp_hours
    moved = leader_temp_hours.for_leader(db, prof.id, date)
    cfg = cells = None
    for tid, (due, hhmm) in live.items():
        td = defs.get(tid)
        parsed = parse_check(td.auto_check if td else None)
        if parsed is None:
            continue
        check, target = parsed
        if str(date)[:10] < check_floor(check):
            continue          # an older day keeps the rule it was filed under
        if moved:
            hhmm = leader_temp_hours.move_clock(m.shift, hhmm, moved.minutes)
            due = leader_close.due_at({"deadline": hhmm}, m.shift, date) or due
            if now < due - WARN_BEFORE:
                continue
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


# What a reader is shown beside an automatic verdict's reason: the numbers the
# check was TAKEN ON, read off the ledger row and never re-measured — a figure
# recomputed now would pass work typed after the hour. Named keys only, so a
# diagnostic the ledger grows later does not ride every register row.
_RESULT_KEYS = ("lines", "with_plan", "cells", "untyped", "filled", "target",
                "pct", "by_cell", "best", "best_pct", "found", "from", "to",
                "checked_at", "late_by_min", "days", "lists", "no_plan", "empty",
                "granted")


def results_for(db: Session, entry_ids) -> dict[int, dict]:
    """entry id → the facts its automatic verdict was taken on.

    THE door every surface that prints an auto task's reason reads the result
    through (the register, the day report, the admin day detail, the appeal
    chat, the bot), so one verdict is never described two ways. Keyed by the
    ENTRY because that is what every one of them already holds: on a per-cell
    unit the one verdict is written onto each cell's entry, and each carries
    its own ledger row. An entry the ledger does not know (a day-sweep
    `not_checked`, a verdict before the ledger kept facts) is simply absent."""
    ids = sorted({int(i) for i in entry_ids if i})
    out: dict[int, dict] = {}
    for k in range(0, len(ids), 1000):
        for eid, facts in (db.query(LeaderAutoCheck.entry_id, LeaderAutoCheck.facts)
                           .filter(LeaderAutoCheck.entry_id.in_(ids[k:k + 1000]),
                                   LeaderAutoCheck.outcome.in_((PASSED, FAILED)))
                           .all()):
            f = facts if isinstance(facts, dict) else {}
            got = {key: f[key] for key in _RESULT_KEYS if key in f}
            if got:
                out[int(eid)] = got
    return out


_FACT_KEYS = ("facts", "auto_facts", "autoFacts")


def hides_target(payload: dict | None) -> bool:
    """A LEADER is never told a check's pass mark (the operator, 2026-10-02 —
    the standing rule: a minimum printed as the instruction becomes the
    target). Every other reader rules on it and keeps it."""
    return (payload or {}).get("role") == "leader"


def hide_targets(obj):
    """`obj` with the pass mark taken out of every stored check result in it —
    the `facts` / `auto_facts` / `autoFacts` dicts any payload carries, at any
    depth. In place, and returned, so a router can wrap its whole answer in
    one call."""
    if isinstance(obj, list):
        for x in obj:
            hide_targets(x)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            if k in _FACT_KEYS and isinstance(v, dict):
                v.pop("target", None)
            hide_targets(v)
    return obj


def result_lines(facts: dict | None, lang: str = "uz",
                 show_target: bool = True) -> list[str]:
    """The result as plain lines in one language — for the bot and its cards.
    The client twin is `utils/autoResult.js`; keep the two saying the same.
    `show_target=False` on a leader's own screen (`hides_target`)."""
    f = facts or {}
    L = _RESULT_TEXT.get(lang) or _RESULT_TEXT["uz"]
    out: list[str] = []
    if f.get("with_plan") is not None and f.get("lines") is not None:
        out.append(L["plan"].format(a=f["with_plan"], b=f["lines"]))
    if f.get("filled"):
        out.append(L["filled"].format(codes=", ".join(map(str, f["filled"][:8]))))
    if f.get("untyped"):
        out.append(L["untyped"].format(codes=", ".join(map(str, f["untyped"][:8]))))
    cells = [c for c in (f.get("by_cell") or []) if isinstance(c, dict)]
    if cells:
        parts = " · ".join(f"{c.get('cell')} — {_pct(c.get('pct'))}%" for c in cells[:6])
        out.append(_pct_line(L, parts, f, show_target))
    elif f.get("pct") is not None:
        out.append(_pct_line(L, f"{_pct(f['pct'])}%", f, show_target))
    if f.get("found") is not None:
        out.append(L["concerns"].format(n=f["found"], frm=f.get("from") or "—",
                                        to=f.get("to") or "—"))
    if isinstance(f.get("lists"), list):
        if f["lists"]:
            out.append(L["kelish"].format(cells=staff_list_cells(f, lang)))
        if f.get("no_plan"):
            out.append(L["kelish_noplan"].format(codes=", ".join(map(str, f["no_plan"][:8]))))
        if f.get("empty"):
            out.append(L["kelish_empty"].format(codes=", ".join(map(str, f["empty"][:8]))))
        if not f["lists"] and not f.get("no_plan") and not f.get("empty"):
            out.append(L["kelish_none"])
    if f.get("late_by_min"):
        out.append(L["late"].format(n=f["late_by_min"]))
    return out


def staff_list_cells(f: dict, lang: str = "uz") -> str:
    """«4321 (ertangi): 12/12 · 4322: bugungi 3/11, ertangi 0/11» — what #11's
    check read on each list it judged. The client twin is `utils/autoResult.js`."""
    L = _RESULT_TEXT.get(lang) or _RESULT_TEXT["uz"]
    parts = []
    for it in (f.get("lists") or [])[:8]:
        if not isinstance(it, dict):
            continue
        kind = it.get("kind")
        if kind in ("today", "tomorrow"):
            m, n = (it.get(kind) or [0, 0])[:2]
            parts.append(f"{it.get('cell')} ({L['k_' + kind]}): {m}/{n}")
        else:
            t, w = it.get("today") or [0, 0], it.get("tomorrow") or [0, 0]
            parts.append(f"{it.get('cell')}: {L['k_today']} {t[0]}/{t[1]}, "
                         f"{L['k_tomorrow']} {w[0]}/{w[1]}")
    return " · ".join(parts)


def _pct_line(L: dict, v: str, f: dict, show_target: bool) -> str:
    if show_target and f.get("target") is not None:
        return L["pct"].format(v=v, target=_pct(f.get("target")))
    return L["pct_bare"].format(v=v)


def _pct(v) -> str:
    try:
        x = float(v)
    except (TypeError, ValueError):
        return "—"
    return str(int(x)) if x == int(x) else f"{x:.1f}"


_RESULT_TEXT = {
    "uz": {"plan": "Reja kiritilgan pozitsiyalar: {a} / {b}",
           "filled": "Reja va odamlar kiritilgan yacheykalar: {codes}",
           "untyped": "Odamlar soni kiritilmagan: {codes}",
           "pct": "Bajarilishi: {v} (kerak: {target}%)",
           "pct_bare": "Bajarilishi: {v}",
           "concerns": "Yozilgan xavotirlar: {n} ta ({frm} – {to})",
           "late": "Tekshiruv {n} daqiqa kechikib o'tkazilgan",
           "kelish": "Ish grafigi: {cells}",
           "kelish_noplan": "Rejasi yo'q, tekshirilmadi: {codes}",
           "kelish_empty": "Ro'yxati bo'sh, tekshirilmadi: {codes}",
           "kelish_none": "Rejasi bor yacheyka yo'q — tekshiriladigan ro'yxat yo'q",
           "k_today": "bugungi", "k_tomorrow": "ertangi"},
    "uz_cyrl": {"plan": "Режа киритилган позициялар: {a} / {b}",
                "filled": "Режа ва одамлар киритилган ячейкалар: {codes}",
                "untyped": "Одамлар сони киритилмаган: {codes}",
                "pct": "Бажарилиши: {v} (керак: {target}%)",
                "pct_bare": "Бажарилиши: {v}",
                "concerns": "Ёзилган хавотирлар: {n} та ({frm} – {to})",
                "late": "Текширув {n} дақиқа кечикиб ўтказилган",
                "kelish": "Иш графиги: {cells}",
                "kelish_noplan": "Режаси йўқ, текширилмади: {codes}",
                "kelish_empty": "Рўйхати бўш, текширилмади: {codes}",
                "kelish_none": "Режаси бор ячейка йўқ — текшириладиган рўйхат йўқ",
                "k_today": "бугунги", "k_tomorrow": "эртанги"},
    "ru": {"plan": "Позиции с планом: {a} / {b}",
           "filled": "Ячейки с планом и людьми: {codes}",
           "untyped": "Не внесено количество людей: {codes}",
           "pct": "Выполнение: {v} (нужно: {target}%)",
           "pct_bare": "Выполнение: {v}",
           "concerns": "Записано обеспокоенностей: {n} ({frm} – {to})",
           "late": "Проверка прошла с опозданием на {n} мин",
           "kelish": "График работы: {cells}",
           "kelish_noplan": "Нет плана, не проверялись: {codes}",
           "kelish_empty": "Список пуст, не проверялись: {codes}",
           "kelish_none": "Нет ячеек с планом — проверять было нечего",
           "k_today": "на сегодня", "k_tomorrow": "на завтра"},
    "en": {"plan": "Positions with a plan: {a} / {b}",
           "filled": "Cells with plan and people: {codes}",
           "untyped": "Headcount missing: {codes}",
           "pct": "Fulfilment: {v} (needed: {target}%)",
           "pct_bare": "Fulfilment: {v}",
           "concerns": "Concerns written: {n} ({frm} – {to})",
           "late": "The check ran {n} min late",
           "kelish": "Work schedule: {cells}",
           "kelish_noplan": "No plan, not checked: {codes}",
           "kelish_empty": "Empty list, not checked: {codes}",
           "kelish_none": "No cell had a plan — there was no list to check",
           "k_today": "today's", "k_tomorrow": "tomorrow's"},
}


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

    if check == "staff_list":
        filed = (db.query(LeaderTaskEntry)
                 .filter_by(day_id=day.id, task_id=tid).first())
        if filed is not None and not str(filed.reason or "").startswith(
                leader_tasks.AUTO_PREFIX):
            return _staff_list_filed(db, row, m, prof, date, day, filed, td,
                                     check, target, due, hhmm, now, tally,
                                     leader_close, shared)

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


def _grant(db: Session, day: LeaderTaskDay, task_id: int, prof,
           by: str) -> str | None:
    """Give one checklist task its full weight through the ordinary admin
    overlay (`LeaderTaskOverride`, done) — reversible on the day report like any
    ruling. Returns the report uid when a grant was written; None when an
    override already stands there (a person's ruling is the newer statement)."""
    from app.models import LeaderTaskOverride
    from app.services import leader_bot
    uid = leader_bot.day_uid(day.id)
    if db.query(LeaderTaskOverride.id).filter_by(uid=uid, task_id=task_id).first():
        return None
    db.add(LeaderTaskOverride(
        uid=uid, task_id=task_id, date=str(day.date)[:10],
        leader=(getattr(prof, "name", "") or "")[:160] or None, done=True,
        set_by=by[:160], set_at=datetime.now(timezone.utc)))
    return uid


def _staff_list_filed(db, row, m, prof, date, day, entry, td, check, target,
                      due, hhmm, now, tally, leader_close,
                      shared: Verdict | None) -> tuple[bool, Verdict | None]:
    """#11 on the day the switch landed: the leader answered it by SCREENSHOT
    before the task became automatic (the switch reached shift 1 mid-day on
    5 Oct 2026). Their answer STANDS — this module never writes over one — and
    the «Ish grafigi» check still runs at the hour: a filled table grants the
    task its full weight (the operator's transition rule — either counts), so
    nobody loses a point to the switch landing late. A table not filled leaves
    the screenshot to be judged as it always was."""
    if shared is not None:
        v, fresh = Verdict(shared.outcome, shared.code, dict(shared.facts)), None
    else:
        v = fresh = evaluate(db, prof=prof, manager=m, shift=m.shift, date=date,
                             cell=None, check=check, target=target, due=due,
                             now=now)
    if v.outcome == SKIPPED and now < due + GIVE_UP:
        row.checked_at, row.outcome, row.code = now, SKIPPED, v.code
        row.facts = v.facts
        tally["skipped"] += 1
        return True, fresh
    uid = (_grant(db, day, entry.task_id, prof, "Ish grafigi to'ldirilgan")
           if v.done else None)
    row.checked_at = now
    row.outcome, row.code = (PASSED, "ok") if v.done else (SKIPPED, "already_filed")
    row.facts = dict(v.facts, filed=True, granted=bool(uid))
    row.entry_id = entry.id
    db.commit()
    if entry.closed_at is None and day.closed_at is None:
        cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
        leader_close.close_task(db, day=day, entry=entry, cfg=cfg,
                                actor=f"avtomatik · {prof.name}")
    tally["skipped" if not v.done else PASSED] += 1
    if v.done and not _already_told(db, row):
        _tell(db, prof, td, v, hhmm, date)
    if uid:
        try:
            from app.services import leader_reports
            leader_reports.resend_if_changed(db, uid)
        except Exception:                              # noqa: BLE001
            db.rollback()
            logger.exception("auto check: corrected report for %s failed", uid)
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
