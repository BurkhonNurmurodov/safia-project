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
                 "now", "_dash", "_pins", "_pairs", "_cells", "_by_code", "_unit",
                 "_settled")

    def __init__(self, db, prof, manager, shift, date, cell, due, now):
        self.db, self.prof, self.manager = db, prof, manager
        self.shift, self.date, self.cell = shift, date, cell
        self.due, self.now = due, now
        self._dash = self._pins = self._pairs = self._cells = self._unit = None
        self._by_code = {}
        self._settled = False

    @property
    def unit_id(self) -> int:
        """The unit whose PRODUCTION the leader's cells stand in — where their
        catalog, plan and typed people are stored. The leader's own unit for
        everybody whose cells sit there; the cells' unit for a leader counted
        under another brigadir (`cell_lookup.cells_unit_for_leader`), who would
        otherwise be measured against a catalog that has never carried their
        cell. `manager` stays the leader's unit for everything else a check
        asks — its hour, its shift, whose checklist the verdict lands on.

        Read ON the checklist day (2026-10-26), the way the leader's page reads
        that day: a cell that changed brigadir counts in its old unit up to its
        move day and in its new one from then (`catalog_follow` moves its
        positions on that day), so a day measured after the move is still
        measured against the unit it was worked in."""
        if self._unit is None:
            from app.services import cell_links
            d = _as_date(self.date)
            owner = (cell_links.value_on(self.cell, "manager_id", d) if self.cell is not None
                     else cell_lookup.cells_unit_for_leader(self.db, self.prof.id, d))
            self._unit = int(owner) if owner else self.manager.id
        return self._unit

    # The leader's (work centre, group letter) pairs — their cells, and the one
    # definition of «what is mine» the /production page itself applies. On the
    # checklist day: the cells they ran then, each with its letter then.
    @property
    def pairs(self) -> set[tuple[str, str | None]]:
        if self._pairs is None:
            from app.services import cell_links
            d = _as_date(self.date)
            self._pairs = cell_lookup.sap_groups_for_leader(self.db, self.prof.id, d)
            if self.cell is not None:
                # A per-cell checklist asks about THAT cell and no other.
                code = cell_lookup.norm_code(getattr(self.cell, "sap_code", None))
                grp = cell_links.letter_on(self.cell, d) or None
                self._pairs = {(code, grp)} if code else set()
        return self._pairs

    def require_settled(self) -> None:
        """Raise `catalog_follow.CatalogUnsettled` while one of the leader's
        cells has changed brigadir and its positions have not followed it yet
        (`catalog_follow.unsettled`, ≤ a minute after the move lands): the cell
        then reads in its new unit with its lines still in the old one, an empty
        page that is nobody's failure. Asked before EVERY production page a
        check — or anything replaying one (`auto_check_timing`,
        `auto_check_restore`) — builds for this day; answered once per context.
        A day before `catalog_follow.FOLLOW_FROM` is never unsettled."""
        if self._settled:
            return
        from app.services import catalog_follow
        d = _as_date(self.date)
        ids = ([self.cell.id] if self.cell is not None
               else [c.id for c in cell_lookup.leader_cells_on(self.db, self.prof.id, d)])
        waiting = catalog_follow.unsettled(self.db, ids, d) if ids else set()
        if waiting:
            raise catalog_follow.CatalogUnsettled(
                f"cells {sorted(waiting)}: a brigadir move not followed yet on {d}")
        self._settled = True

    @property
    def dashboard(self) -> dict:
        """The leader's own /production page for this day — never a second
        computation of it. Imported lazily and from a ROUTER on purpose: that
        function IS the page, and `services/leader_tasks.py` already reaches for
        `routers.leaders.WINDOW` the same way. Re-deriving the plan here would
        give the check and the page two answers about one shift.

        Not while a move of one of the leader's cells is not followed yet
        (`require_settled`): `CatalogUnsettled` makes the check a quiet
        `no_data` verdict (`evaluate`), retried until `GIVE_UP` like any data
        error."""
        if self._dash is None:
            from app.routers.production import _build_dashboard
            self.require_settled()
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
            self.require_settled()
            self._by_code[code] = _build_dashboard(
                self.db, self.unit_id, _as_date(self.date),
                wc_scope={code}, payload=None).get("totals") or {}
        return self._by_code[code]

    @property
    def cells(self) -> list:
        """The leader's own cells ON the checklist day (`cells_run_on`) — or
        the ONE cell a per-cell checklist is about — each wearing the letter it
        carried that day, the letter `pairs` and the day's rows are cut by."""
        if self._cells is None:
            if self.cell is not None:
                from app.services import cell_links
                self._cells = cell_links.with_letters_on([self.cell], _as_date(self.date))
            else:
                self._cells = cells_run_on(self.db, self.prof.id, self.date)
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

        …every cell of the unit ON the checklist day (2026-10-26): a cell that
        has left the unit since is still split there on the days before its
        move, one that arrived since is not yet, and each reads the letter it
        carried that day (`cell_pins` places them by `by_wc_on`). With no cell
        moved after the day it is the unit's cells by the column, as before.
        """
        if self._pins is None:
            from app.services import cell_links
            d = _as_date(self.date)
            raw = zagruzka_source.typed_pins(self.db, [self.unit_id], d, d)
            unit_cells = cell_links.cells_of_units(self.db, [self.unit_id], since=d)
            self._pins = zagruzka_source.cell_pins(unit_cells, raw)
        return self._pins


def cells_run_on(db: Session, leader_id: int, date) -> list:
    """The cells a leader RAN on `date` («Boshqaruvchi» that day,
    `cell_lookup.leader_cells_on`) that exist on it, each wearing the
    work-centre letter it carried that day (`cell_links.with_letters_on`) —
    THE «leader's cells» of every check (#1, #8, #9, #11) and of the objection
    timing built on them (`auto_check_timing`).

    Dated (2026-10-26) like the unit and the pairs: a cell handed to another
    leader since — or moved with its positions to another brigadir, and
    re-lettered by the move (`catalog_follow`) — is still this leader's, under
    its old letter, on the days before, so `cell_planned` cuts that day's rows
    by the group they were planned under. With no link or letter event after
    `date` it is the query this always was: their cells by the column, a cell
    archived before the day dropped."""
    d = _as_date(date)
    cells = cell_lookup.leader_cells_on(db, leader_id, d)
    if not cells:
        return []
    # A cell archived before the day is not checked on it.
    alive = {cid for (cid,) in db.query(Cell.id).filter(
        Cell.id.in_([c.id for c in cells]), cell_archive.alive_clause(date)).all()}
    from app.services import cell_links
    return cell_links.with_letters_on([c for c in cells if c.id in alive], d)


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
    # The cells the leader ran that day — or the one a per-cell checklist is
    # about (`ctx.cells`, the selection every other check reads).
    codes = [c.verifix_code for c in ctx.cells if c.verifix_code]

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
      next one's («tomorrow»). A cell an ADMIN pinned to one of them on «Ish
      grafigi» (`KelishCellKind`, src «manual») is judged on that list alone;
      every other cell passes when EITHER list is full (the operator,
      2026-10-17). The type the check used to fix by itself on a cell's first
      check day (src «auto», 5—7 Oct) guessed wrong for many cells — 27 of the
      66 failed lists of 10—17 Oct had the other list full: a leader who fills
      today's list was judged on tomorrow's every day, and shift 2, which fills
      a night's list when that night starts, was judged at 08:00 on the next
      night's. A guess never costs a point any more, and nothing guesses.
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
                   "checked": ctx.due.astimezone(TASHKENT).isoformat(timespec="minutes"),
                   "no_plan": sorted(cell_label(c) for c in cells
                                     if c not in planned),
                   "empty": []}
    if not planned:
        return Verdict(PASSED, "ok", facts)

    cutoff = ctx.due if (ctx.now - ctx.due) > LATE_GRACE else None
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
        got, done_at = {}, {}
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
            done_at[name] = list_done_at(lst) if (n and m_ == n) else None
        full = {k: (n > 0 and m_ == n) for k, (m_, n) in got.items()}
        kr = kinds.get(c.id)
        kind = kr.kind if kr is not None and kr.kind in kelish.KINDS else None
        item = {"cell": label, "cell_id": c.id, "kind": kind,
                "today": list(got["today"]), "tomorrow": list(got["tomorrow"])}
        if kind is not None:
            if got[kind][1] == 0:
                facts["empty"].append(label)
                continue
            ok = full[kind]
            if ok and done_at.get(kind):
                item["filled_at"] = done_at[kind]
        else:
            if got["today"][1] == 0 and got["tomorrow"][1] == 0:
                facts["empty"].append(label)
                continue
            # Either list passes. Where both are full, the one completed FIRST
            # is named — it is the one that already answered the check.
            full_ones = [k for k in kelish.KINDS if full[k]]
            pick = (min(full_ones, key=lambda k: done_at.get(k) or "~")
                    if full_ones else None)
            ok = pick is not None
            if pick is not None:
                item["filled_kind"] = pick
                if done_at.get(pick):
                    item["filled_at"] = done_at[pick]
        item["ok"] = ok
        all_ok = all_ok and ok
        facts["lists"].append(item)
    if not facts["lists"]:
        return Verdict(PASSED, "ok", facts)
    return Verdict(PASSED if all_ok else FAILED,
                   "ok" if all_ok else "not_filled", facts)


def list_done_at(lst: list) -> str | None:
    """WHEN a «Ish grafigi» list was fully filled — the moment its LAST worker
    was answered, i.e. the latest `set_at` among the marks on it — as an ISO
    string on the plant's wall clock (Tashkent). None for a list with an
    unmarked worker: it is not full, so it has no such moment."""
    best = None
    for r in lst:
        if r.get("mark") not in ("yes", "no"):
            return None
        at = r.get("at")
        if not at:
            continue
        try:
            dt = datetime.fromisoformat(str(at))
        except ValueError:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if best is None or dt > best:
            best = dt
    return best.astimezone(TASHKENT).isoformat(timespec="seconds") if best else None


def late_fills(db: Session, jobs: list, now: datetime | None = None) -> list:
    """For each (facts, due_at) of a FAILED #11 verdict: the same facts with
    every failed list that is full NOW stamped — `filled_at` (the latest mark
    on it, `list_done_at`), `filled_kind` on a cell whose type is not fixed,
    and `filled_late_min`, how many minutes after the check's hour (`due_at`)
    the list was completed. Returns one new dict per job, or None where
    nothing filled. The lists are read AS THEY STAND NOW (the file, «+»/«−»
    and the marks); the count the check read (`today` / `tomorrow`, `ok`) is
    never touched. ONE reader for both doors: the sweep (`stamp_late_fills`)
    and a verdict written after the hour (`_settle`), which may be about a
    list completed since the check and says so in its DM.
    """
    from app.services import kelish
    todo = []   # (job index, item index)
    codes: set[str] = set()
    ids: set[int] = set()
    days: set[_date] = set()
    out: list = [None] * len(jobs)
    for j, (f, _due) in enumerate(jobs):
        if not isinstance(f, dict):
            continue
        lists = f.get("lists") if isinstance(f.get("lists"), list) else []
        try:
            ds = [_as_date(x) for x in (f.get("days") or [])[:2]]
        except Exception:
            continue
        if len(ds) != 2:
            continue
        for i, it in enumerate(lists):
            if not isinstance(it, dict) or it.get("ok") or it.get("filled_at"):
                continue
            todo.append((j, i))
            days.update(ds)
            if it.get("cell_id"):
                ids.add(int(it["cell_id"]))
            elif it.get("cell"):
                codes.add(str(it["cell"]))
    if not todo:
        return out
    # Rows written before the item carried its cell id name the cell by its
    # verifix code; an active cell with that code is the one meant.
    by_code: dict[str, Cell] = {}
    if codes:
        for c in (db.query(Cell).filter(Cell.verifix_code.in_(sorted(codes)))
                  .order_by(Cell.archived_at.isnot(None), Cell.id).all()):
            by_code.setdefault(c.verifix_code, c)
        ids.update(c.id for c in by_code.values())
    cells = {c.id: c for c in db.query(Cell).filter(Cell.id.in_(sorted(ids))).all()}
    files = kelish.file_workers_days(db, sorted(days))
    events = kelish.load_events(db, list(cells))
    marks = kelish.load_marks_days(db, list(cells), sorted(days))

    for j, i in todo:
        f = out[j] or dict(jobs[j][0])
        lists = [dict(x) if isinstance(x, dict) else x for x in f["lists"]]
        it = lists[i]
        c = cells.get(int(it["cell_id"])) if it.get("cell_id") else by_code.get(str(it.get("cell")))
        if c is None or not c.verifix_code:
            continue
        ds = [_as_date(x) for x in f["days"][:2]]
        # The list the VERDICT judged — a pinned cell's one list, else either.
        kind = it.get("kind") if it.get("kind") in kelish.KINDS else None
        names = [kind] if kind else list(kelish.KINDS)
        found = None
        for name in names:
            day = ds[kelish.KINDS.index(name)]
            fw, last = files[day]
            lst = kelish.roster(c.verifix_code, day, fw, last, events.get(c.id, []),
                                marks.get(c.id, {}).get(day, {}))
            at = list_done_at(lst) if lst else None
            if at and (found is None or at < found[0]):
                found = (at, name)
        if found is None:
            continue
        it["filled_at"] = found[0]
        if not it.get("kind"):
            it["filled_kind"] = found[1]
        due = jobs[j][1]
        if due is not None:
            if due.tzinfo is None:
                due = due.replace(tzinfo=timezone.utc)
            late = int((datetime.fromisoformat(found[0]) - due).total_seconds() // 60)
            if late > 0:
                it["filled_late_min"] = late
        lists[i] = it
        f["lists"] = lists
        out[j] = f
    return out


def staff_list_snapshot(db: Session, uid: str, task_id: int | None = None) -> dict | None:
    """The «Ish grafigi» lists a #11 verdict judged, AS THEY STOOD AT THE CHECK
    and as they stand now — one row per worker — for the «how the list looked
    at the check» modal (the operator, 2026-10-12).

    `uid` is the bot day's report id (`leader_bot.day_uid`); the verdict is the
    ledger row whose entry sits on that day. «At the check» is rebuilt the way
    the check itself read: the file as of the cutoff, «+»/«−» made by then,
    marks set by then — the cutoff being the pass instant within `LATE_GRACE`
    of the hour, else the hour (`_check_staff_list`'s own rule). A mark whose
    `set_at` is past the cutoff is `late`: it is what the verdict did not see.
    Nothing is written; None when the uid names no such verdict.
    """
    from app.services import kelish
    s = str(uid or "")
    if not s.startswith("bot-"):
        return None
    try:
        day_id = int(s[4:])
    except ValueError:
        return None
    q = (db.query(LeaderAutoCheck)
         .join(LeaderTaskEntry, LeaderTaskEntry.id == LeaderAutoCheck.entry_id)
         .filter(LeaderTaskEntry.day_id == day_id,
                 LeaderAutoCheck.check == "staff_list",
                 LeaderAutoCheck.outcome.in_((PASSED, FAILED))))
    if task_id:
        q = q.filter(LeaderAutoCheck.task_id == int(task_id))
    row = q.order_by(LeaderAutoCheck.id.desc()).first()
    if row is None:
        return None
    f = row.facts if isinstance(row.facts, dict) else {}
    try:
        ds = [_as_date(x) for x in (f.get("days") or [])[:2]]
    except Exception:
        ds = []
    if len(ds) != 2:
        return None
    due, chk = _aware_dt(row.due_at), _aware_dt(row.checked_at)
    if due is None:
        cutoff = chk
    elif chk is None or chk > due + LATE_GRACE:
        cutoff = due
    else:
        cutoff = chk

    items = [it for it in (f.get("lists") or []) if isinstance(it, dict)]
    ids = {int(it["cell_id"]) for it in items if it.get("cell_id")}
    codes = {str(it["cell"]) for it in items if not it.get("cell_id") and it.get("cell")}
    by_code: dict[str, Cell] = {}
    if codes:
        for c in (db.query(Cell).filter(Cell.verifix_code.in_(sorted(codes)))
                  .order_by(Cell.archived_at.isnot(None), Cell.id).all()):
            by_code.setdefault(c.verifix_code, c)
        ids.update(c.id for c in by_code.values())
    cells = ({c.id: c for c in db.query(Cell).filter(Cell.id.in_(sorted(ids))).all()}
             if ids else {})
    files_at = kelish.file_workers_days(db, ds, as_of=cutoff)
    files_now = kelish.file_workers_days(db, ds)
    events = kelish.load_events(db, list(cells))
    marks = kelish.load_marks_days(db, list(cells), ds)

    lists = []
    for it in items:
        c = cells.get(int(it["cell_id"])) if it.get("cell_id") else by_code.get(str(it.get("cell")))
        if c is None or not c.verifix_code:
            continue
        kind = it.get("kind") if it.get("kind") in kelish.KINDS else None
        for name in ([kind] if kind else list(kelish.KINDS)):
            day = ds[kelish.KINDS.index(name)]
            ev_all = events.get(c.id, [])
            mk_all = marks.get(c.id, {}).get(day, {})
            if cutoff is not None:
                ev_at = [e for e in ev_all
                         if e.created_at is not None and _aware_dt(e.created_at) <= cutoff]
                mk_at = {k: m for k, m in mk_all.items()
                         if m.set_at is not None and _aware_dt(m.set_at) <= cutoff}
            else:
                ev_at, mk_at = ev_all, mk_all
            fw_at, last_at = files_at[day]
            fw_now, last_now = files_now[day]
            at_rows = kelish.roster(c.verifix_code, day, fw_at, last_at, ev_at, mk_at)
            now_rows = kelish.roster(c.verifix_code, day, fw_now, last_now, ev_all, mk_all)
            lists.append({
                "cell": c.verifix_code, "cell_id": c.id, "kind": name,
                "day": day.isoformat(), "ok": bool(it.get("ok")),
                "check": kelish.counts(at_rows), "now": kelish.counts(now_rows),
                "rows": _snapshot_rows(at_rows, now_rows, cutoff),
            })
    return {
        "uid": s, "task_id": int(row.task_id), "outcome": row.outcome,
        "checked": (f.get("checked")
                    or (due.astimezone(TASHKENT).isoformat(timespec="minutes") if due else None)),
        "cutoff": cutoff.astimezone(TASHKENT).isoformat(timespec="seconds") if cutoff else None,
        "days": [d.isoformat() for d in ds],
        "lists": lists,
    }


def _aware_dt(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _snapshot_rows(at_rows: list, now_rows: list, cutoff: datetime | None) -> list[dict]:
    """The two rosters side by side, one row per person (a hand-typed alias is
    the same person): `check` / `now` None where they were not on that list."""
    def slot(r):
        at = None
        if r.get("at"):
            try:
                at = _aware_dt(datetime.fromisoformat(str(r["at"]))).astimezone(TASHKENT)
            except ValueError:
                at = None
        return {"mark": r.get("mark"), "by": r.get("by"),
                "at": at.isoformat(timespec="minutes") if at else None}, at

    rows: dict[str, dict] = {}
    alias: dict[str, str] = {}
    for r in at_rows:
        s, _ = slot(r)
        rows[r["key"]] = {"key": r["key"], "name": r["name"], "job": r.get("job") or "",
                          "check": s, "now": None, "late": False}
        for a in r.get("aliases") or []:
            alias[a] = r["key"]
    for r in now_rows:
        k = alias.get(r["key"], r["key"])
        if k not in rows:
            k = (next((alias[a] for a in (r.get("aliases") or []) if a in alias), None)
                 or next((a for a in (r.get("aliases") or []) if a in rows), None)
                 or r["key"])
        s, at = slot(r)
        u = rows.get(k)
        if u is None:
            u = rows[k] = {"key": k, "name": r["name"], "job": r.get("job") or "",
                           "check": None, "now": None, "late": False}
        u["now"] = s
        u["name"] = r["name"] or u["name"]
        u["late"] = bool(s["mark"] and at is not None and cutoff is not None and at > cutoff)
    return sorted(rows.values(), key=lambda u: str(u["name"] or "").casefold())


# How far back a failed #11 verdict is watched for its list filling up. A list
# for day D can only be marked while D is the cell's today or tomorrow, so a
# check dated D is settled for good once D + 2 has passed; three days covers a
# night shift's frame with a day to spare.
LATE_FILL_DAYS = 3


def stamp_late_fills(db: Session, now: datetime | None = None) -> int:
    """A failed #11 («Ish grafigi») verdict learns WHEN its list was filled
    after the hour (the operator, 2026-10-12: «show when it was fully filled
    alongside» the 12/13 the check read — and why it is still not marked).

    The check stores what it read AT THE HOUR, and a list that was short then
    has no fill moment yet — it comes later, when the leader (or the brigadir)
    answers the last worker. This runs on the 5-minute sweep: every failed
    `staff_list` row of the last `LATE_FILL_DAYS` whose failed lists carry no
    `filled_at` goes through `late_fills`, and a stamped row is COMMITTED here
    and then its leader is sent ONE follow-up DM per task
    (`leader_auto_filled_late`: the list, when it filled, how long after the
    check) — the verdict DM went out at the hour, before there was a fill time
    to print, and a sent message cannot be edited. Every reader prints the
    stamp through `results_for` — the day report, the admin day detail, the
    register, the appeal chat, the bot — so nothing re-measures. Returns how
    many rows were stamped.
    """
    now = (now or datetime.now(timezone.utc)).astimezone(TASHKENT)
    floor = (now.date() - timedelta(days=LATE_FILL_DAYS)).isoformat()
    rows = (db.query(LeaderAutoCheck)
            .filter(LeaderAutoCheck.check == "staff_list",
                    LeaderAutoCheck.outcome == FAILED,
                    LeaderAutoCheck.code == "not_filled",
                    LeaderAutoCheck.date >= floor)
            .order_by(LeaderAutoCheck.id)
            .all())
    if not rows:
        return 0
    got = late_fills(db, [(r.facts, r.due_at) for r in rows], now)
    stamped = [(row, f) for row, f in zip(rows, got) if f is not None]
    # Rows stamped before `checked` / `filled_late_min` existed (4.267.0) get
    # both off their own `due_at` — no list is read for it.
    fixed = 0
    for row, f in zip(rows, got):
        f2 = _complete_facts(f if f is not None else row.facts, row.due_at)
        if f2 is not None:
            if f is None:
                row.facts = f2
                fixed += 1
            else:
                for i, (r2, _) in enumerate(stamped):
                    if r2 is row:
                        stamped[i] = (row, f2)
    for row, f in stamped:
        row.facts = f
    if not stamped and not fixed:
        return 0
    db.commit()
    told: set = set()
    units: set = set()
    for row, f in stamped:
        units.add((int(row.manager_id), str(row.date)[:10]))
        key = (row.leader_id, str(row.date)[:10], row.task_id)
        if key in told:
            continue
        told.add(key)
        try:
            _tell_filled_late(db, row, f)
        except Exception:                              # noqa: BLE001
            logger.exception("late-fill DM failed for row %s", row.id)
            db.rollback()
    # The brigadir's day digest shows the fill time too: a digest already sent
    # is marked dirty and the sweep sends the update naming it
    # (`leader_unit_report.changes`, a fill-only change).
    if units:
        from app.services import leader_unit_report
        for mid, d in sorted(units):
            leader_unit_report.note(db, mid, d)
    return len(stamped)


def _complete_facts(f: dict | None, due: datetime | None) -> dict | None:
    """`f` with `checked` and every stamped list's `filled_late_min` filled in
    from the row's own due instant where missing; None when nothing was."""
    if not isinstance(f, dict) or due is None:
        return None
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    out = None
    if not f.get("checked"):
        out = dict(f, checked=due.astimezone(TASHKENT).isoformat(timespec="minutes"))
    lists = f.get("lists") if isinstance(f.get("lists"), list) else []
    new_lists = None
    for i, it in enumerate(lists):
        if (not isinstance(it, dict) or it.get("ok") or not it.get("filled_at")
                or it.get("filled_late_min") is not None):
            continue
        try:
            late = int((datetime.fromisoformat(str(it["filled_at"])) - due).total_seconds() // 60)
        except (TypeError, ValueError):
            continue
        if late <= 0:
            continue
        if new_lists is None:
            new_lists = [dict(x) if isinstance(x, dict) else x for x in lists]
        new_lists[i]["filled_late_min"] = late
    if new_lists is not None:
        out = dict(out or f, lists=new_lists)
    return out


def _tell_filled_late(db: Session, row: LeaderAutoCheck, f: dict) -> None:
    """The follow-up to a failed #11 verdict DM: the list is full now, filled
    at this time, this long after the check — and the verdict does not move
    by itself (an objection or an admin's ruling is the way)."""
    from app.routers.staff import notify_profile
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return
    td = db.get(LeaderTaskDef, int(row.task_id))
    hhmm = row.due_at.astimezone(TASHKENT).strftime("%H:%M") if row.due_at else "—"
    date = str(row.date)[:10]
    notify_profile(db, profile_key("leader", int(row.leader_id)),
                   "leader_auto_filled_late",
                   {"task": _task_name(td), "time": hhmm, "date": date,
                    "facts": staff_list_cells(f) or "—"},
                   type="info",
                   subject=("checklist", f"{int(row.leader_id)}:{date}:{int(row.task_id)}"))


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
    throws leaves the task open forever and the day with it.

    A move of one of the leader's cells not followed yet
    (`catalog_follow.CatalogUnsettled`, `_Ctx.require_settled`) is the same
    `no_data` — the next pass, a minute later as a rule, reads the page with
    the positions where they belong — but it is no fault: one log line, no
    stack trace."""
    runner = _RUNNERS.get(check)
    if runner is None:
        return Verdict(SKIPPED, "unknown_check", {"check": check})
    ctx = _Ctx(db, prof, manager, shift, date, cell, due, now)
    try:
        return runner(ctx, target)
    except Exception as exc:                       # noqa: BLE001 - see docstring
        from app.services import catalog_follow
        if isinstance(exc, catalog_follow.CatalogUnsettled):
            logger.info("auto check %s for leader %s on %s waits for the catalog "
                        "follow: %s", check, getattr(prof, "id", None), date, exc)
            return Verdict(SKIPPED, "no_data", {"error": str(exc)[:200],
                                                "unsettled": True})
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


def next_staff_list_check(db: Session, manager_id: int | None,
                          leader_id: int | None = None,
                          now: datetime | None = None) -> dict | None:
    """The next #11 check a cell will take — its checklist day, its hour and
    the DATES of the two lists it can read — so «Ish grafigi» names the list by
    its date and never by a bare «bugungi» / «ertangi», which reads two ways:
    shift 2's 08:00 check reads the night that has just ENDED as «today», a
    date that is yesterday's by then (the operator, 2026-10-17). None where the
    unit's #11 is not checked here (not a per-task unit, no hour)."""
    from app.services import leader_close
    if not manager_id:
        return None
    td = (db.query(LeaderTaskDef)
          .filter(LeaderTaskDef.auto_check.like("staff_list%")).first())
    m = db.query(Manager).filter(Manager.id == manager_id).first()
    if td is None or m is None or m.id not in leader_tasks.per_task_units(db):
        return None
    now = (now or datetime.now(timezone.utc)).astimezone(TASHKENT)
    prof = (db.query(RoleProfile).filter(RoleProfile.id == leader_id).first()
            if leader_id else None)
    if prof is not None and leader_shift.moved(db, prof.id):
        shift, d = leader_shift.current(db, prof, now)
    else:
        shift, d = m.shift, leader_tasks.effective_date(m.shift, now)
    d = str(d)[:10]
    for _ in range(3):
        if d >= check_floor("staff_list"):
            hhmm = check_hour(db, m.id, shift, td.id, None,
                              leader_id=leader_id, date=d)
            due = leader_close.due_at({"deadline": hhmm}, shift, d)
            if due is not None and now < due:
                due = due.astimezone(TASHKENT)
                return {"date": d, "at": hhmm,
                        "due": due.isoformat(timespec="minutes"),
                        "today": d,
                        "tomorrow": (_as_date(d) + timedelta(days=1)).isoformat()}
        d = (_as_date(d) + timedelta(days=1)).isoformat()
    return None


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
            from app.telegram_bot import RichTry

            def _rich(lang: str) -> list:
                # The button inside the step that names the page, and nothing
                # under the card; then, if Telegram refuses a button in the
                # body, the card as before with the page button under it.
                return [RichTry(card.body(check, **_args(lang), button=True),
                                None, label="auto-check step button"),
                        RichTry(card.body(check, **_args(lang)))]
            kw = dict(rich_fn=_rich,
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
                "checked", "granted")


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
            out.extend(staff_list_lines(f, lang))
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
    """The #11 result as ONE string — the structured lines joined by newlines,
    for a DM template's `{facts}` slot. See `staff_list_lines`."""
    return "\n".join(staff_list_lines(f, lang))


def staff_list_lines(f: dict, lang: str = "uz") -> list[str]:
    """What #11's check read, as labelled lines that answer every question a
    reader has asked about one of these verdicts (the operator, 2026-10-12):
    WHEN the check ran (date + hour), WHICH day's list of WHICH cell it judged,
    how many were marked AT THAT MOMENT, and when the list was fully filled —
    and how long after the check, when it was after. The client twin is
    `utils/autoResult.js`; keep the two saying the same:

        Tekshiruv vaqti: 10.10, soat 20:00
        Tekshirilgan ro'yxat: 4612 — 11.10 (ertangi)
        Tekshiruv paytida belgilangan: 12 / 13
        To'liq to'ldirildi: 11.10, soat 08:53 — tekshiruvdan 12 soat 53 daqiqa keyin

    A cell whose list type is not fixed yet names both lists; a failed list
    with no fill moment says so («keyin ham to'liq to'ldirilmagan»)."""
    L = _RESULT_TEXT.get(lang) or _RESULT_TEXT["uz"]
    lists = [it for it in (f.get("lists") or []) if isinstance(it, dict)][:8]
    if not lists:
        return []
    days = [str(x or "")[:10] for x in (f.get("days") or [])[:2]] + ["", ""]
    out: list[str] = []
    chk = _dm_text(f.get("checked"))
    if chk:
        out.append(L["chk_at"].format(d=chk[0], t=chk[1]))
    for it in lists:
        kind = it.get("kind") if it.get("kind") in ("today", "tomorrow") else None
        cell = it.get("cell")
        if kind:
            m, n = (it.get(kind) or [0, 0])[:2]
            out.append(L["lst"].format(cell=cell, ld=_ddmm(days[kind == "tomorrow"]),
                                       kind=L["k_" + kind]))
            out.append(L["at_chk"].format(m=m, n=n))
        else:
            t, w = it.get("today") or [0, 0], it.get("tomorrow") or [0, 0]
            out.append(L["lst2"].format(cell=cell, d0=_ddmm(days[0]), d1=_ddmm(days[1])))
            out.append(L["at_chk2"].format(m0=t[0], n0=t[1], m1=w[0], n1=w[1]))
        out.append(_fill_line(L, it, kind, days))
    return out


def fill_summary(f: dict, lang: str = "uz") -> list[str]:
    """One line per list that HAS a fill moment — «4612 — 11.10 (ertangi) ·
    To'liq to'ldirildi: …» — for a digest update that reports only that."""
    L = _RESULT_TEXT.get(lang) or _RESULT_TEXT["uz"]
    days = [str(x or "")[:10] for x in (f.get("days") or [])[:2]] + ["", ""]
    out: list[str] = []
    for it in (f.get("lists") or [])[:8]:
        if not isinstance(it, dict) or not it.get("filled_at"):
            continue
        kind = it.get("kind") if it.get("kind") in ("today", "tomorrow") else None
        fk = kind or (it.get("filled_kind") if it.get("filled_kind") in ("today", "tomorrow") else None)
        head = (f"{it.get('cell')} — {_ddmm(days[fk == 'tomorrow'])} ({L['k_' + fk]})"
                if fk else str(it.get("cell")))
        out.append(f"{head} · {_fill_line(L, it, kind, days)}")
    return out


def _fill_line(L: dict, it: dict, kind: str | None, days: list | None = None) -> str:
    """«To'liq to'ldirildi: 11.10, soat 08:53 — tekshiruvdan 12 soat 53 daqiqa
    keyin» (`filled_at` + `filled_late_min`), the list named when the cell's
    type is not fixed, or «keyin ham to'liq to'ldirilmagan».

    A list filled BEFORE its own day (17.10's list, marked on 16.10 as «ertangi»)
    says «(oldindan)»: without it «To'liq to'ldirildi: 16.10» read as «the
    16.10 list was checked» (the operator, 2026-10-17)."""
    dt = _dm_text(it.get("filled_at"))
    if not dt:
        return L["not_done"] if not it.get("ok") else ""
    try:
        late = int(it.get("filled_late_min") or 0)
    except (TypeError, ValueError):
        late = 0
    fk = it.get("filled_kind") if (kind is None and it.get("filled_kind") in ("today", "tomorrow")) else None
    key = ("done_k" if fk else "done") + ("_late" if late > 0 else "")
    s = L[key].format(d=dt[0], t=dt[1], dur=_dur(L, late), kind=L["k_" + fk] if fk else "")
    lk = kind or fk
    ld = str((days or ["", ""])[lk == "tomorrow"] or "")[:10] if lk else ""
    if late <= 0 and ld and str(it.get("filled_at"))[:10] < ld:
        s += L["early"]
    return s[:1].upper() + s[1:]


def _dur(L: dict, minutes: int) -> str:
    h, m = divmod(max(0, int(minutes)), 60)
    return (L["dur_m"].format(m=m) if not h
            else L["dur_h"].format(h=h) if not m
            else L["dur_hm"].format(h=h, m=m))


def _dm_text(iso) -> tuple[str, str] | None:
    """(«DD.MM», «HH:MM») off an ISO text, never through a clock — so the bot,
    the digest and `utils/autoResult.js` print one moment the same way."""
    s = str(iso or "")
    if len(s) < 16 or s[10] != "T":
        return None
    return _ddmm(s), s[11:16]


def _ddmm(iso: str) -> str:
    s = str(iso or "")
    return f"{s[8:10]}.{s[5:7]}" if len(s) >= 10 else "—"


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
           "kelish_noplan": "Rejasi yo'q, tekshirilmadi: {codes}",
           "kelish_empty": "Ro'yxati bo'sh, tekshirilmadi: {codes}",
           "kelish_none": "Rejasi bor yacheyka yo'q — tekshiriladigan ro'yxat yo'q",
           "k_today": "bugungi", "k_tomorrow": "ertangi",
           "chk_at": "Tekshiruv vaqti: {d}, soat {t}",
           "lst": "Tekshirilgan ro'yxat: {cell} — {ld} ({kind})",
           "lst2": "Tekshirilgan ro'yxatlar: {cell} — bugungi ({d0}) va ertangi ({d1})",
           "at_chk": "Tekshiruv paytida belgilangan: {m} / {n}",
           "at_chk2": "Tekshiruv paytida belgilangan: bugungi {m0} / {n0}, ertangi {m1} / {n1}",
           "done": "To'liq to'ldirildi: {d}, soat {t}",
           "done_late": "To'liq to'ldirildi: {d}, soat {t} — tekshiruvdan {dur} keyin",
           "done_k": "{kind} ro'yxat to'liq to'ldirildi: {d}, soat {t}",
           "done_k_late": "{kind} ro'yxat to'liq to'ldirildi: {d}, soat {t} — tekshiruvdan {dur} keyin",
           "not_done": "Keyin ham to'liq to'ldirilmagan",
           "early": " (oldindan)",
           "dur_h": "{h} soat", "dur_m": "{m} daqiqa", "dur_hm": "{h} soat {m} daqiqa"},
    "uz_cyrl": {"plan": "Режа киритилган позициялар: {a} / {b}",
                "filled": "Режа ва одамлар киритилган ячейкалар: {codes}",
                "untyped": "Одамлар сони киритилмаган: {codes}",
                "pct": "Бажарилиши: {v} (керак: {target}%)",
                "pct_bare": "Бажарилиши: {v}",
                "concerns": "Ёзилган хавотирлар: {n} та ({frm} – {to})",
                "late": "Текширув {n} дақиқа кечикиб ўтказилган",
                "kelish_noplan": "Режаси йўқ, текширилмади: {codes}",
                "kelish_empty": "Рўйхати бўш, текширилмади: {codes}",
                "kelish_none": "Режаси бор ячейка йўқ — текшириладиган рўйхат йўқ",
                "k_today": "бугунги", "k_tomorrow": "эртанги",
                "chk_at": "Текширув вақти: {d}, соат {t}",
                "lst": "Текширилган рўйхат: {cell} — {ld} ({kind})",
                "lst2": "Текширилган рўйхатлар: {cell} — бугунги ({d0}) ва эртанги ({d1})",
                "at_chk": "Текширув пайтида белгиланган: {m} / {n}",
                "at_chk2": "Текширув пайтида белгиланган: бугунги {m0} / {n0}, эртанги {m1} / {n1}",
                "done": "Тўлиқ тўлдирилди: {d}, соат {t}",
                "done_late": "Тўлиқ тўлдирилди: {d}, соат {t} — текширувдан {dur} кейин",
                "done_k": "{kind} рўйхат тўлиқ тўлдирилди: {d}, соат {t}",
                "done_k_late": "{kind} рўйхат тўлиқ тўлдирилди: {d}, соат {t} — текширувдан {dur} кейин",
                "not_done": "Кейин ҳам тўлиқ тўлдирилмаган",
                "early": " (олдиндан)",
                "dur_h": "{h} соат", "dur_m": "{m} дақиқа", "dur_hm": "{h} соат {m} дақиқа"},
    "ru": {"plan": "Позиции с планом: {a} / {b}",
           "filled": "Ячейки с планом и людьми: {codes}",
           "untyped": "Не внесено количество людей: {codes}",
           "pct": "Выполнение: {v} (нужно: {target}%)",
           "pct_bare": "Выполнение: {v}",
           "concerns": "Записано обеспокоенностей: {n} ({frm} – {to})",
           "late": "Проверка прошла с опозданием на {n} мин",
           "kelish_noplan": "Нет плана, не проверялись: {codes}",
           "kelish_empty": "Список пуст, не проверялись: {codes}",
           "kelish_none": "Нет ячеек с планом — проверять было нечего",
           "k_today": "на сегодня", "k_tomorrow": "на завтра",
           "chk_at": "Время проверки: {d}, {t}",
           "lst": "Проверенный список: {cell} — {ld} ({kind})",
           "lst2": "Проверенные списки: {cell} — на сегодня ({d0}) и на завтра ({d1})",
           "at_chk": "Отмечено на момент проверки: {m} / {n}",
           "at_chk2": "Отмечено на момент проверки: на сегодня {m0} / {n0}, на завтра {m1} / {n1}",
           "done": "Заполнен полностью: {d}, {t}",
           "done_late": "Заполнен полностью: {d}, {t} — через {dur} после проверки",
           "done_k": "Список {kind} заполнен полностью: {d}, {t}",
           "done_k_late": "Список {kind} заполнен полностью: {d}, {t} — через {dur} после проверки",
           "not_done": "Позже тоже не был заполнен полностью",
           "early": " (заранее)",
           "dur_h": "{h} ч", "dur_m": "{m} мин", "dur_hm": "{h} ч {m} мин"},
    "en": {"plan": "Positions with a plan: {a} / {b}",
           "filled": "Cells with plan and people: {codes}",
           "untyped": "Headcount missing: {codes}",
           "pct": "Fulfilment: {v} (needed: {target}%)",
           "pct_bare": "Fulfilment: {v}",
           "concerns": "Concerns written: {n} ({frm} – {to})",
           "late": "The check ran {n} min late",
           "kelish_noplan": "No plan, not checked: {codes}",
           "kelish_empty": "Empty list, not checked: {codes}",
           "kelish_none": "No cell had a plan — there was no list to check",
           "k_today": "today's", "k_tomorrow": "tomorrow's",
           "chk_at": "Checked: {d} at {t}",
           "lst": "List checked: {cell} — {ld} ({kind})",
           "lst2": "Lists checked: {cell} — today's ({d0}) and tomorrow's ({d1})",
           "at_chk": "Marked at the check: {m} / {n}",
           "at_chk2": "Marked at the check: today's {m0} / {n0}, tomorrow's {m1} / {n1}",
           "done": "Fully filled: {d} at {t}",
           "done_late": "Fully filled: {d} at {t} — {dur} after the check",
           "done_k": "{kind} list fully filled: {d} at {t}",
           "done_k_late": "{kind} list fully filled: {d} at {t} — {dur} after the check",
           "not_done": "Not fully filled afterwards either",
           "early": " (in advance)",
           "dur_h": "{h} h", "dur_m": "{m} min", "dur_hm": "{h} h {m} min"},
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
        # The record of the unit the page above was read in — the one the
        # leader's cells stood in that day (`_Ctx.unit_id`), where the saves
        # being replayed were made.
        unit = (manager if ctx.unit_id == manager.id
                else (db.get(Manager, ctx.unit_id) or manager))
        u = acr._Unit(db, unit, str(date)[:10])
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
    # A failed #11 written AFTER the hour — a checklist that appeared later, a
    # late pass — may be about a list completed since the check: the ledger
    # row and the verdict DM then say when, and how long after (`late_fills`).
    if v.code == "not_filled" and (now - due) > LATE_GRACE:
        try:
            got = late_fills(db, [(v.facts, due)], now)
            if got and got[0] is not None:
                v.facts = got[0]
        except Exception:                              # noqa: BLE001
            logger.exception("late-fill read failed for leader %s", prof.id)

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
