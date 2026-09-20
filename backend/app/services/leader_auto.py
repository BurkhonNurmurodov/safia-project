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

* `plan_staffing` (#1) — the leader's own work centres carry a plan above 0
  (from SAP or typed), AND the people are TYPED for every cell they own: the
  cell's own group pin where the cell carries a letter, the whole-centre pin
  where it does not. **A typed 0 passes** — a cell that ran empty is a real
  answer, and `people_overridden` and never the value is what tells typed from
  absent (the `zagruzka_source` rule).
* `concerns` (#8) — one `leader_concerns` row created between 00:00 of the
  checklist day and the check, either written BY the leader or filed by a worker
  against one of their cells. A pass-up of an older concern does not count,
  which is why the test is `created_at` and never `level_since`.
* `plan_pct` (#9) — the «Bajarish %» the leader's own /production page states,
  at or above the target carried in the setting (`plan_pct:30`).

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

It also carries a fact nothing else can: a row with `warned_at` set and outcome
`no_day` says «at the check there was no checklist». A day that appears AFTER
that is recorded `started_late` and scores 0 — the operator's rule, and the
reason this module needs no `created_at` on `LeaderTaskDay`.
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
                 "now", "_dash", "_pins", "_pairs")

    def __init__(self, db, prof, manager, shift, date, cell, due, now):
        self.db, self.prof, self.manager = db, prof, manager
        self.shift, self.date, self.cell = shift, date, cell
        self.due, self.now = due, now
        self._dash = self._pins = self._pairs = None

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

    @property
    def pins(self) -> set[tuple[str, str | None]]:
        """The (work centre, group) pairs the brigadir TYPED people for, through
        the one door for that question."""
        if self._pins is None:
            d = _as_date(self.date)
            raw = zagruzka_source.typed_pins(self.db, [self.manager.id], d, d)
            self._pins = {(cell_lookup.norm_code(wc), g or None)
                          for (_m, _d, wc, g) in raw}
        return self._pins


def _as_date(iso: str) -> _date:
    return datetime.strptime(str(iso)[:10], "%Y-%m-%d").date()


def _check_plan_staffing(ctx: _Ctx, target: float | None) -> Verdict:
    """#1 «Kunlik plan» — a plan above 0 AND the people typed, for every cell."""
    if not ctx.pairs:
        # A leader whose cells carry no SAP code cannot be measured against the
        # production page at all. That is a REGISTER error and not the leader's
        # failure, so it is recorded as such and the admins are told — but it is
        # still not-done, because the plan genuinely cannot be shown to exist.
        return Verdict(FAILED, "no_sap_code", {"cells": 0})

    dash = ctx.dashboard
    rows = dash.get("rows") or []
    planned = [r for r in rows if float(r.get("plan_qty") or 0) > 0]
    if not planned:
        return Verdict(FAILED, "no_plan", {"lines": len(rows), "with_plan": 0})

    pins = ctx.pins
    missing = sorted(
        wc_group.label(code, grp) if grp else code
        for (code, grp) in ctx.pairs if (code, grp) not in pins
    )
    facts = {"lines": len(rows), "with_plan": len(planned),
             "cells": len(ctx.pairs), "untyped": missing}
    if missing:
        return Verdict(FAILED, "no_staffing", facts)
    return Verdict(PASSED, "ok", facts)


def _check_plan_pct(ctx: _Ctx, target: float | None) -> Verdict:
    """#9 — the «Bajarish %» tile at or above the target."""
    want = 30.0 if target is None else float(target)
    if not ctx.pairs:
        return Verdict(FAILED, "no_sap_code", {"target": want})
    totals = (ctx.dashboard.get("totals") or {})
    plan = float(totals.get("total_plan_labor") or 0)
    if plan <= 0:
        # `completion` is 0.0 with no plan, which would read as «0% done» — a
        # verdict about work when the truth is that nothing was asked of them.
        return Verdict(FAILED, "no_plan", {"target": want, "plan_min": 0})
    pct = round(float(totals.get("completion") or 0) * 100, 1)
    facts = {"target": want, "pct": pct,
             "plan_min": round(plan, 1),
             "fact_min": round(float(totals.get("total_actual_labor") or 0), 1)}
    return Verdict(PASSED if pct >= want else FAILED,
                   "ok" if pct >= want else "under_target", facts)


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

def _open_day_dates(db: Session, manager_id: int) -> set[str]:
    """Dates this unit still has an OPEN checklist on — the stale nights a
    verdict must still reach, or their days never close."""
    return {str(d) for (d,) in db.query(LeaderTaskDay.date).filter(
        LeaderTaskDay.manager_id == manager_id,
        LeaderTaskDay.closed_at.is_(None)).distinct().all()}


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


def _warn(db: Session, prof, td, due: datetime, hhmm: str) -> bool:
    """Tell one leader a check is coming. One DM per leader per task per day,
    whatever the cell count: the warning is about a RULE, and three copies of it
    for three cells would teach the leader to stop reading them."""
    from app.routers.staff import notify_profile
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    if notifications_suppressed():
        return False
    notify_profile(db, profile_key("leader", int(prof.id)),
                   "leader_auto_soon",
                   {"task": _task_name(td), "time": hhmm,
                    "date": due.astimezone(TASHKENT).strftime("%d.%m.%Y")},
                   type="warning")
    return True


def _tell(db: Session, prof, td, v: Verdict, hhmm: str, date: str) -> None:
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
    notify_profile(db, profile_key("leader", int(prof.id)), nkey,
                   {"task": _task_name(td), "time": hhmm,
                    "date": str(date)[:10],
                    "why": _WHY.get(v.code, v.code),
                    "facts": _facts_line(v)},
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
    "no_data": "Ma'lumot o'qilmadi",
}


def _facts_line(v: Verdict) -> str:
    f = v.facts or {}
    if "pct" in f:
        return f"{f['pct']}% / {f.get('target')}%"
    if "untyped" in f and f["untyped"]:
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
    tally = {"warned": 0, "checked": 0, "passed": 0, "failed": 0, "skipped": 0}
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
        dates |= _open_day_dates(db, m.id)
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
    cfg = None
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
        cells = leader_cells.expected_days(db, prof, date)
        if not cells:
            continue

        if now < due:
            row = _row_for(db, prof=prof, manager=m, date=date, task_id=tid,
                           cell_id=cells[0], check=check, due=due)
            if row.warned_at is None:
                for cid in cells:
                    r = _row_for(db, prof=prof, manager=m, date=date,
                                 task_id=tid, cell_id=cid, check=check, due=due)
                    r.warned_at = now
                db.commit()
                if _warn(db, prof, td, due, hhmm):
                    tally["warned"] += 1
                    db.commit()
            continue

        for cid in cells:
            if _settle(db, m, prof, date, cid, tid, td, check, target, due,
                       hhmm, now, tally, leader_close):
                db.commit()


def _settle(db, m, prof, date, cell_id, tid, td, check, target, due, hhmm,
            now, tally, leader_close) -> bool:
    """Decide ONE (leader, date, cell, task). True when anything was written."""
    row = _row_for(db, prof=prof, manager=m, date=date, task_id=tid,
                   cell_id=cell_id, check=check, due=due)
    if row.entry_id is not None:
        return False                      # settled for good

    day = (db.query(LeaderTaskDay)
           .filter(LeaderTaskDay.leader_id == prof.id,
                   LeaderTaskDay.date == date,
                   LeaderTaskDay.cell_id.is_(None) if cell_id is None
                   else LeaderTaskDay.cell_id == cell_id).first())
    if day is None:
        # Nothing to judge, and nothing to record on. The row REMEMBERS that,
        # and that memory is the whole mechanism behind «started after the
        # check»: `LeaderTaskDay` carries no created_at, so this absence is the
        # only evidence that the checklist did not exist at the hour.
        if row.outcome is None:
            row.checked_at, row.outcome, row.code = now, SKIPPED, "no_day"
            tally["skipped"] += 1
            return True
        return False

    if day.closed_at is not None:
        row.checked_at, row.outcome, row.code = now, SKIPPED, "day_closed"
        return True

    entry = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
    if entry is not None:
        # The leader answered it before the unit was switched, or an admin did.
        # Their answer stands: this module writes a verdict, never over one.
        row.checked_at, row.outcome, row.code = now, SKIPPED, "already_filed"
        row.entry_id = entry.id
        tally["skipped"] += 1
        return True

    # `no_day` is a CODE and «skipped» is the OUTCOME — testing the outcome
    # against it (as this did first) is never true, and the whole «started
    # after the check» rule silently became an ordinary late evaluation, which
    # passes a leader who entered the plan half an hour after the hour that
    # asked for it. Found by running it, 2026-09-20.
    if row.code == "no_day" and row.checked_at is not None:
        v = Verdict(FAILED, "started_late",
                    {"checked_at": row.checked_at.astimezone(TASHKENT)
                     .strftime("%d.%m %H:%M")})
    else:
        v = evaluate(db, prof=prof, manager=m, shift=m.shift, date=date,
                     cell=_cell(db, cell_id), check=check, target=target,
                     due=due, now=now)
        if v.outcome == SKIPPED:
            # A data failure is NOT recorded as the leader's. Left unsettled so
            # the next pass tries again; `entry_id` stays None, so nothing here
            # is final and the day is not closed on a number nobody could read.
            row.checked_at, row.outcome, row.code = now, SKIPPED, v.code
            row.facts = v.facts
            tally["skipped"] += 1
            return True

    late = max(0, int((now - due).total_seconds() // 60))
    if late > LATE_GRACE.total_seconds() // 60:
        v.facts = dict(v.facts, late_by_min=late)

    entry = LeaderTaskEntry(day_id=day.id, task_id=tid, done=v.done,
                            reason=leader_tasks.auto_reason(hhmm, v.code))
    db.add(entry)
    db.flush()
    row.checked_at, row.outcome, row.code = now, v.outcome, v.code
    row.facts, row.entry_id = v.facts, entry.id
    db.commit()

    cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
    leader_close.close_task(db, day=day, entry=entry, cfg=cfg,
                            actor=f"avtomatik · {prof.name}")
    tally["checked"] += 1
    tally[PASSED if v.done else FAILED] += 1
    _tell(db, prof, td, v, hhmm, date)
    if v.code == "no_sap_code":
        _alert_admins(db, prof, m, td, date)
    return True


def _cell(db: Session, cell_id: int | None) -> Cell | None:
    return db.query(Cell).filter(Cell.id == cell_id).first() if cell_id else None


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
