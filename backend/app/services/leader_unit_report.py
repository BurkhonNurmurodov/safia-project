"""The brigadir's DAY DIGEST — one message for a unit's whole day.

Until 2026-09-15 a brigadir was DMed once per leader-day: every time the
automatic review finished one leader's checklist, one more «Kun tasdiqlandi —
100%» landed in their chat. A unit of six leaders sent six near-identical
messages spread over an evening, none of which answered the question the
brigadir actually has — *how did my unit's day go, and who needs me?* — and a
leader who filed NOTHING sent nothing, so the one person most worth chasing was
the one the chat never named.

From `DIGEST_FROM` the brigadir's copy is ONE message per (unit, date): a table
of every leader who owed a checklist that day — what each scored, what was
rejected and by name, who is still being checked, who never filed — with one
button onto `/leaders/unit-report/<unit>/<date>`, where each leader's own day
report opens in place. The LEADER's DM is untouched: the person a verdict judged
is still told about their own day, on their own.

Four rules:

* **It computes no score of its own.** Every row is `leader_reports.day_report`
  — the day page's payload, itself `build_report_row` — so the digest, the page
  behind its button and the register cannot print two numbers for one
  leader-day. The one figure it adds, the unit's result, is `_unit_score`: the
  one-day twin of `unitSlots` in pages/Leaders.jsx, never a new rule.

* **It goes out as soon as the last leader's time is up** (`_ready`, the
  operator's ruling of 2026-09-15): every checklist the unit owed is in, or the
  time of every leader still missing has run out (`_time_up_at`) — and nothing
  is still being checked. Never the day's filing deadline for its own sake: on a
  unit that closes each task, that deadline is a ceiling hours after the last
  task has closed, and waiting for it put a shift-1 digest just after midnight.
  A digest sent while half the unit is mid-review is the six messages again,
  only slower.

* **A change after it went out is an UPDATE, and updates are batched.** A later
  ruling, re-review or late filing marks the ledger dirty (`note`, and the sweep
  for a checklist closed after the send); the sweep re-sends the table only after
  `CORRECTION_QUIET_MIN` of quiet, and only when a row actually moved — so an
  admin ruling on five objections in a row sends one update naming all five.

* **Nothing waits forever.** A review stuck behind a quota, or a task an admin
  re-opened on a closed night, would hold the whole unit's message hostage;
  `MAX_WAIT_MIN` after the unit's day became final it goes out with those rows
  marked, and the update follows when they settle — the rule
  `leader_ai.unfinished_reports` already keeps for a single report.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Cell, LeaderAiReview, LeaderTaskDay, LeaderTaskEntry, LeaderUnitReport,
    Manager, RoleProfile,
)
from app.services import (
    action_log, leader_ai, leader_bot, leader_cells, leader_cutoffs,
    leader_exclusions, leader_tasks,
)

log = logging.getLogger(__name__)

# The first checklist day whose brigadir copy travels in the digest. Days before
# it keep the per-leader DMs they were already sent, and their corrections. A
# CONSTANT with no override (the shape `idle_source.CELLS_FROM` has), and it must
# never move LATER, which would hand days already digested back to the per-leader
# flow. The floor day itself may have sent a few per-leader DMs before this
# shipped; its digest still lists every leader — the whole table is the point.
DIGEST_FROM = "2026-09-15"

# Quiet a sent digest needs after its first change before the update goes out.
CORRECTION_QUIET_MIN = 10

# How long a digest may wait on unfinished reviews once the unit's day is final —
# its last checklist closed, or its last missing leader's time run out. Short on
# purpose: the brigadir is told as soon as the leaders' time is up, and a row
# that settles later reaches them as an update.
MAX_WAIT_MIN = 60

# Unit-days one sweep pass may send, per kind — a backstop, not pacing.
SWEEP_CAP = 40

# Row states, in the order the table lists them: what the brigadir has to act on
# first. A rejection and a checklist nobody filed both cost the unit today; a
# clean pass and a day an admin took out of the results cost nothing.
ORDER = ("rejected", "missing", "open", "error", "checking", "noproof",
         "verified", "excluded")

# States whose score is not a verdict, and so is never printed as one: nothing
# was filed, it was never closed, it counts for nobody, or it is still moving.
NO_SCORE = frozenset({"missing", "open", "excluded", "checking"})

# One evaluation at a time. The drain thread (`note`, through the report sender)
# and the scheduler's sweep both reach here; without this they could both find
# one unit-day due and DM it twice. The platform runs a single worker process.
_lock = threading.RLock()


def covers(uid: str | None, date: str | None) -> bool:
    """Does this leader-day's BRIGADIR copy travel inside the digest?

    A bot day on or after the floor. A sheet row keeps its own DM: the Google
    Form is history, and a unit-day stitched from both layers would have to
    re-run the merge rule to decide which submission is the record."""
    return (str(uid or "").startswith("bot-")
            and str(date or "")[:10] >= DIGEST_FROM)


def unit_url(manager_id: int, date: str) -> str:
    """The mini-app URL of one unit-day — quoted, for the reason
    `leader_reports.report_url` gives: one stray character in a web_app URL is
    a button that opens a 404."""
    return (f"{settings.webapp_url.rstrip('/')}/leaders/unit-report/"
            f"{int(manager_id)}/{quote(str(date)[:10], safe='')}")


def _key(leader_id, cell_id) -> str:
    """One row's identity across sends: the leader and the cell, never the
    report uid — a leader who files after the digest went out must be the SAME
    row moving from «not filed» to a score, not a row vanishing beside a new
    one."""
    return f"L{int(leader_id or 0)}C{int(cell_id or 0)}"


def _autoclose_shifts() -> tuple:
    from app.services.leader_close import AUTOCLOSE_SHIFTS
    return AUTOCLOSE_SHIFTS


def _time_up_at(db: Session, prof: RoleProfile, shift: int | None, date: str,
                per_task: bool) -> datetime | None:
    """The instant this leader's checklist for `date` stops accepting work.

    A leader's «time» is whatever the platform already enforces, read from the
    rule that enforces it and never re-derived here:

    * a unit that closes each TASK (`per_task_close`): the LATEST
      `leader_close.due_at` of the leader's enabled tasks — the hour
      `autoclose_due` locks the last of them on. Each is the end of the task's
      own window, an admin's deadline, or the day's filing deadline for a task
      with neither, which is also every task's ceiling — so with the default
      windows 20:00 on shift 1 and 09:00 the next morning on shift 2;
    * a unit that closes the DAY: the day's filing deadline, when its checklist
      stops taking the button.

    Seated on the SHIFT by `due_at`, so a night's «09:00» is the morning after.
    None only when the date cannot be read."""
    from app.services import leader_close
    day_end = leader_close.due_at(None, shift, date)
    if not per_task:
        return day_end
    cfg = leader_tasks.effective_leader_config(db, prof, shift, day=date)
    ends = [e for e in (leader_close.due_at(s, shift, date)
                        for s in cfg.values() if s.get("enabled"))
            if e is not None]
    return max(ends) if ends else day_end


# ── the frame: who owed, who filed, is anything still moving ─────────────────

def _frame(db: Session, manager_id: int, date: str,
           now: datetime | None = None) -> dict | None:
    """Everything the readiness test needs, WITHOUT reading a single report.

    Cheap on purpose: the sweep asks this of every unit-day still waiting on a
    leader's time, every five minutes — one config per leader still missing —
    and only a unit-day that turns out to be ready pays for the per-leader
    reports (`_payload`). None when the unit does not exist."""
    d = str(date or "")[:10]
    unit = (db.query(Manager).filter_by(id=int(manager_id)).first()
            if manager_id else None)
    if unit is None or not d:
        return None
    shift = unit.shift
    now = now or datetime.now(timezone.utc)

    floors = leader_bot.bot_from_floors(db)
    picks = leader_bot.source_overrides(db)
    closed: list[LeaderTaskDay] = []
    have: set[tuple] = set()
    started: set[tuple] = set()
    for x in (db.query(LeaderTaskDay)
              .filter(LeaderTaskDay.manager_id == unit.id,
                      LeaderTaskDay.date == d)
              .order_by(LeaderTaskDay.id).all()):
        pair = (x.leader_id, x.cell_id)
        if x.closed_at is None:
            started.add(pair)
            continue
        have.add(pair)
        # A REHEARSAL day is filed, but it is not the record — the gate
        # `leader_reports.send_for_uid` parks the per-leader DM on. It grows no
        # row here, and its leader is not «not filed» either.
        if not leader_bot.training(shift, unit.id, d, floors,
                                   leader_id=x.leader_id, overrides=picks,
                                   per_cell=x.cell_id is not None):
            closed.append(x)
    started -= have

    # Who OWED a checklist: the unit's registry — the roster `/api/leaders`
    # serves — minus a leader taken out of the results on this day, expanded to
    # one checklist per cell where the unit files per cell. Taken out means a
    # CUTOFF on or before the day, or ANY exclusion on the leader-day: the day
    # report stamps a leader's every row off one exclusion (`wire_for`), and the
    # register's unit day skips the whole leader for it, so a narrower test here
    # would list as «not filed» a cell the page shows as not counted. An
    # archived unit owes nothing, exactly as on the register's roster.
    profs = [] if unit.archived else (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "leader", RoleProfile.manager_id == unit.id)
        .order_by(RoleProfile.name).all())
    skipped: set[int] = set()
    missing: list[tuple[RoleProfile, int | None]] = []
    if profs:
        cuts = leader_cutoffs.load(db)
        excluded_days = {k for (k, _cell) in leader_exclusions.load(db)}
        cell_floors = leader_cells.floors(db)
        for p in profs:
            if (leader_cutoffs.hit(cuts, p.id, p.name, d) is not None
                    or leader_exclusions.key(p.id, p.name, d) in excluded_days):
                skipped.add(p.id)
                continue
            for cid in leader_cells.expected_days(db, p, d,
                                                  shift_floors=cell_floors):
                if (p.id, cid) not in have:
                    missing.append((p, cid))

    expired = d <= leader_tasks.expired_through(shift, now)

    # WHEN the day is final — «as soon as the last leader's time finishes up»
    # (the operator, 2026-09-15). A leader still missing is waited on until THEIR
    # time is up and no longer: the day's filing deadline is a ceiling, hours
    # after the last task of a per-task unit has closed. One config per leader,
    # however many cells they owe a checklist for.
    per_task = leader_tasks.per_task_close(db, unit.id)
    ends: dict[int, datetime | None] = {}
    for p, _cid in missing:
        if p.id not in ends:
            ends[p.id] = _time_up_at(db, p, shift, d, per_task)

    def up(leader_id) -> bool:
        end = ends.get(leader_id)
        return expired if end is None else now >= end

    # The moment nothing is left to wait for but the reviewer — the last close,
    # or the last missing leader's time. The cap on a stuck review runs from it.
    marks = [x.closed_at for x in closed if x.closed_at is not None]
    marks += [e for e in ends.values() if e is not None]
    final_at = max(marks) if marks else None
    return {
        "unit": unit, "shift": shift, "date": d,
        "auto": leader_ai.in_auto_regime(d, shift),
        "closed": closed, "profs": profs, "skipped": skipped,
        "missing": missing, "started": started,
        "expired": expired,
        "waiting": any(not up(p.id) for p, _cid in missing),
        "overdue": (final_at is not None
                    and now >= final_at + timedelta(minutes=MAX_WAIT_MIN)),
        "pending": _pending(db, [x.id for x in closed]),
        # An open checklist whose leader's time is up is one the platform is
        # about to close by itself and send for review — task by task on a
        # per-task unit (`autoclose_due`), whole on a shift the day sweep closes
        # — so the digest waits for it rather than reporting it as unfinished.
        "closing": any(up(lid) and (per_task or (
                           expired and shift in _autoclose_shifts()))
                       for lid, _cid in started),
    }


def _pending(db: Session, day_ids: list[int]) -> bool:
    """Is any proof of these days still waiting on the reviewer?

    `leader_ai.unfinished_reports`' rule — queued, or a technical error with
    retries left — asked of a whole unit-day at once. An error that has burned
    its retries is finished: a photo the platform cannot fetch is never going to
    resolve itself, and it must not hold the unit's message hostage."""
    if not day_ids:
        return False
    refs = [f"bot:{eid}" for (eid,) in
            db.query(LeaderTaskEntry.id)
            .filter(LeaderTaskEntry.day_id.in_(day_ids)).all()]
    if not refs:
        return False
    return (db.query(LeaderAiReview.id)
            .filter(LeaderAiReview.ref.in_(refs),
                    LeaderAiReview.status.in_(("pending", "error")),
                    LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS)
            .first()) is not None


def _ready(f: dict) -> bool:
    """May the FIRST digest of this unit-day go out now?

    Every checklist the unit owed is in, or the time of every leader still
    missing has run out — and nothing is still in review or about to be closed
    by the platform. `MAX_WAIT_MIN` after the day became final the second half
    is dropped: the rows still moving go out marked, and the update follows once
    they settle."""
    if not f["closed"]:
        return False
    if f["waiting"]:
        return False
    return not (f["pending"] or f["closing"]) or f["overdue"]


# ── the payload: one row per checklist ───────────────────────────────────────

def _rows(db: Session, f: dict) -> list[dict]:
    """A row per filed checklist, read through the day report it links to, and
    a row per checklist the unit owed and did not get."""
    from app.services import leader_reports

    rows: list[dict] = []
    for x in f["closed"]:
        rep = leader_reports.day_report(db, leader_bot.day_uid(x.id))
        if rep is None:
            continue                 # the profile is gone — nothing to name it by
        c = rep["counts"]
        state = ("excluded" if rep.get("excluded")
                 else "checking" if c["pending"]
                 else "rejected" if c["rejected"]
                 else "verified" if c["checked"]
                 else "error" if c["errors"]
                 else "noproof")
        rows.append({
            "key": _key(x.leader_id, x.cell_id),
            "uid": rep["uid"],
            "state": state,
            "leader": rep.get("leader") or "—",
            "leaderId": rep.get("leaderId"),
            "cell": rep.get("cell"),
            "cellId": rep.get("cellId"),
            "score": rep["score"],
            "rawScore": rep["rawScore"],
            "completion": rep.get("completion"),
            "counts": c,
            # Id AND name: the DM prints the name in its reader's language, the
            # page and the plain fallback print the number.
            "rejectedTasks": [{"id": t["id"], "name": t["name"]}
                              for t in rep["tasks"] if t["ai_rejected"]],
            "excluded": rep.get("excluded"),
        })

    cids = {cid for _p, cid in f["missing"] if cid}
    codes = ({c.id: c.verifix_code
              for c in db.query(Cell).filter(Cell.id.in_(cids)).all()}
             if cids else {})
    for p, cid in f["missing"]:
        rows.append({
            "key": _key(p.id, cid),
            "uid": None,
            "state": "open" if (p.id, cid) in f["started"] else "missing",
            "leader": p.name,
            "leaderId": p.id,
            "cell": codes.get(cid),
            "cellId": cid,
            "score": None, "rawScore": None, "completion": None,
            "counts": None, "rejectedTasks": [], "excluded": None,
        })
    # Worst first, and the lowest score first inside a state.
    rows.sort(key=lambda r: (ORDER.index(r["state"]),
                             r["score"] if r["score"] is not None else -1,
                             str(r["leader"] or "").casefold(),
                             str(r["cell"] or "")))
    return rows


def _unit_score(f: dict, rows: list[dict]) -> tuple[int | None, int, int]:
    """(the unit's day result, leaders who owed one, leaders who filed).

    **The one-day twin of `unitSlots` in pages/Leaders.jsx** — the composition a
    brigadir's own standings row is scored by; keep the two in step. The mean
    over EVERY leader who owed a checklist: a leader with several rows (a
    per-cell unit) contributes the mean of those rows, a leader who filed
    nothing contributes the 0 they scored. Owed = the registry plus everybody
    seen filing, minus a leader carrying an exclusion on the day or a cutoff on
    or before it. None when nobody owed anything."""
    names: dict[int, str] = {p.id: p.name for p in f["profs"]}
    mine: dict[int, list[dict]] = {}
    for r in rows:
        if r["uid"] and r["leaderId"] is not None:
            names.setdefault(r["leaderId"], r["leader"])
            mine.setdefault(r["leaderId"], []).append(r)
    owed = filed = 0
    total = 0.0
    for lid in names:
        got = mine.get(lid) or []
        if lid in f["skipped"] or any(r["excluded"] for r in got):
            continue
        owed += 1
        if got:
            filed += 1
            total += sum(float(r["completion"] or 0) for r in got) / len(got)
    return (round(total / owed) if owed else None), owed, filed


def _payload(db: Session, f: dict) -> dict:
    rows = _rows(db, f)
    score, owed, filed = _unit_score(f, rows)
    counts = {s: 0 for s in ORDER}
    for r in rows:
        counts[r["state"]] += 1
    submitted = sum(1 for r in rows if r["uid"] and r["state"] != "excluded")
    return {
        "managerId": f["unit"].id,
        "supervisor": f["unit"].name,
        "date": f["date"],
        "shift": f["shift"],
        "auto": f["auto"],
        "expired": f["expired"],
        # The unit's result, and whether it can still move: a row in review
        # carries a score that is not a verdict yet.
        "unitScore": score,
        "unitFinal": counts["checking"] == 0,
        "owedLeaders": owed,
        "filedLeaders": filed,
        # CHECKLISTS, not leaders: a per-cell unit owes one per cell and the
        # table lists them one per row, so the fraction and the rows agree.
        "submitted": submitted,
        "owed": submitted + counts["missing"] + counts["open"],
        "counts": counts,
        "rows": rows,
    }


def build(db: Session, manager_id: int, date: str) -> dict | None:
    """THE unit-day payload — `GET /api/leaders/unit-report/…` serves exactly
    what the digest is built from. None when the unit does not exist."""
    f = _frame(db, manager_id, date)
    return _payload(db, f) if f is not None else None


# ── the ledger ───────────────────────────────────────────────────────────────

def _ledger(db: Session, manager_id: int, date: str) -> LeaderUnitReport | None:
    return (db.query(LeaderUnitReport)
            .filter_by(manager_id=int(manager_id), date=str(date)[:10]).first())


def _state(p: dict) -> dict:
    """What the ledger remembers of a sent table: each row's state and the score
    it PRINTED — None where it printed none, so a score moving under a row still
    in review is not an update — and each row's name, so a row that later leaves
    the table can still be named in one."""
    return {
        "rows": {r["key"]: [r["state"],
                            None if r["state"] in NO_SCORE else r["score"]]
                 for r in p["rows"]},
        "names": {r["key"]: [r["leader"], r["cell"]] for r in p["rows"]},
        "unit": p["unitScore"],
    }


def changes(prev: dict | None, p: dict) -> list[dict]:
    """Every row whose state or printed score differs from the table last sent,
    WITH both sides. An update that only restated the new table would leave the
    brigadir to find the difference between two messages by eye."""
    if not prev:
        return []
    before = prev.get("rows") or {}
    names = prev.get("names") or {}
    now = _state(p)["rows"]
    out = []
    for r in p["rows"]:
        b = before.get(r["key"])
        if b is None or list(b) != now[r["key"]]:
            out.append({"key": r["key"], "leader": r["leader"], "cell": r["cell"],
                        "before": list(b) if b else None,
                        "after": now[r["key"]]})
    for k, b in before.items():
        if k not in now:
            name, cell = (list(names.get(k) or []) + ["—", None])[:2]
            out.append({"key": k, "leader": name, "cell": cell,
                        "before": list(b), "after": None})
    return out


def _park(db: Session, led: LeaderUnitReport | None, f: dict, why: str) -> None:
    """Record that this unit-day will not be digested, so the sweep stops
    asking. Never overwrites a real send (the `leader_reports._park` rule): a
    unit-day already told keeps its ledger, and only its pending update is
    dropped."""
    if led is not None and (led.sends or 0) > 0:
        led.dirty_at = None
        db.commit()
        return
    if led is not None and led.parked == why:
        return
    if led is None:
        led = LeaderUnitReport(manager_id=f["unit"].id, date=f["date"],
                               shift=f["shift"], sends=0)
        db.add(led)
    led.parked = why[:120]
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return
    log.info("unit digest: parked (%s) for unit %s on %s",
             why, f["unit"].id, f["date"])


def _evaluate(db: Session, manager_id: int, date: str,
              led: LeaderUnitReport | None, now: datetime) -> bool:
    """Send this unit-day's digest — the first, or an update — if it is due.
    Callers hold `_lock` and pass the ledger row they just re-read."""
    f = _frame(db, manager_id, date, now)
    if f is None:
        return False
    first = led is None or (led.sends or 0) == 0
    if not f["auto"]:
        _park(db, led, f, "outside the automatic regime")
        return False
    if first:
        if not f["closed"]:
            # Every closed day here is a rehearsal: once the window has shut
            # there never will be a table for this day.
            if f["expired"]:
                _park(db, led, f, "nothing to report")
            return False
        if not _ready(f):
            return False
    elif (f["pending"] or f["closing"]) and not f["overdue"]:
        return False                       # stays dirty — the sweep comes back

    p = _payload(db, f)
    if not any(r["uid"] for r in p["rows"]):
        # Reports whose leader no longer exists: nothing to put in a table.
        if first:
            _park(db, led, f, "nothing to report")
        else:
            led.dirty_at = None
            db.commit()
        return False
    diff = [] if first else changes(led.state_sent or {}, p)
    if not first and not diff:
        led.dirty_at = None
        db.commit()
        return False
    return _send(db, p, led, diff, now)


def _send(db: Session, p: dict, led: LeaderUnitReport | None,
          diff: list[dict], now: datetime) -> bool:
    from app.identity import profile_key
    from app.notify_ctx import notifications_suppressed
    from app.routers.staff import notify_profile
    from app.services import leader_reports, leader_unit_rich

    # Ghost Mode: an admin testing the platform must not DM every brigadir. Back
    # out before anything is written — transient, the sweep returns for it.
    if notifications_suppressed():
        return False

    first = led is None or (led.sends or 0) == 0
    counts = p["counts"]
    unfiled = counts["missing"] + counts["open"]
    trouble = counts["rejected"] + unfiled + counts["error"]
    params = {
        "date": p["date"],
        "shift": p["shift"] if p["shift"] is not None else "—",
        "supervisor": p["supervisor"] or "—",
        "score": f"{p['unitScore']}%" if p["unitScore"] is not None else "—",
        "submitted": p["submitted"],
        "owed": p["owed"],
        "rejected": counts["rejected"],
        "missing": unfiled,
        # The table as plain lines, for the classic DM a client refusing rich
        # messages gets — glyphs, names and numbers only, so one string serves
        # all four languages and the template around it carries the legend.
        "lines": leader_unit_rich.classic_lines(p),
        "changes": leader_unit_rich.classic_changes(diff, "; ") or "—",
        "changes_lines": leader_unit_rich.classic_changes(diff, "\n") or "—",
    }
    notify_profile(
        db, profile_key("supervisor", p["managerId"]),
        "leader_unit_report" if first else "leader_unit_report_corrected",
        params, type="warning" if trouble else "success",
        markup_fn=leader_reports._button_markup(
            unit_url(p["managerId"], p["date"])),
        rich_fn=lambda lang: leader_unit_rich.body(p, lang,
                                                   None if first else diff),
    )

    prev_unit = (led.state_sent or {}).get("unit") if led is not None else None
    if led is None:
        led = LeaderUnitReport(manager_id=p["managerId"], date=p["date"])
        db.add(led)
    led.shift = p["shift"]
    led.parked = None
    led.state_sent = _state(p)
    led.dirty_at = None
    led.sends = (led.sends or 0) + 1
    led.first_sent_at = led.first_sent_at or now
    led.last_sent_at = now
    db.commit()
    log.info("unit digest %s for unit %s on %s: %s row(s), unit result %s",
             "sent" if first else "updated", p["managerId"], p["date"],
             len(p["rows"]), params["score"])
    # One row per digest that actually went out — after the commit, so the
    # register never records a message the ledger does not hold.
    action_log.record_system(
        "leader_review", "report.unit_sent", db=db,
        target_kind="report", target_id=f"unit-{p['managerId']}-{p['date']}",
        target_name=p["supervisor"],
        unit_id=p["managerId"], unit_name=p["supervisor"], day=p["date"],
        details=[("shift", p["shift"]),
                 ("filed", f"{p['submitted']}/{p['owed']}"),
                 ("flagged", counts["rejected"]), ("not_filed", unfiled),
                 ("unit_score", params["score"]),
                 ("mode", "first" if first else "updated")]
                + ([("changed", len(diff))] if diff else []),
        changes=None if first else [("unit_score", prev_unit, p["unitScore"])],
    )
    return True


# ── the two doors ────────────────────────────────────────────────────────────

def note(db: Session, manager_id: int | None, date: str | None) -> bool:
    """A leader-day of this unit just produced its report, or changed it.

    Before the digest has gone out this is the fast path: the unit-day may have
    just become ready, and the brigadir should not wait for the sweep to notice.
    After it has gone out it only marks the ledger dirty; the sweep sends the
    update once the unit has been quiet for `CORRECTION_QUIET_MIN`, so a run of
    rulings arrives as one message naming all of them.

    Returns whether a digest was sent. Never raises: it runs inside the leader's
    own report send, and the leader's DM must not be lost to the brigadir's."""
    d = str(date or "")[:10]
    if not manager_id or d < DIGEST_FROM:
        return False
    try:
        with _lock:
            now = datetime.now(timezone.utc)
            led = _ledger(db, manager_id, d)
            if led is not None and (led.sends or 0) > 0:
                if led.dirty_at is None:
                    led.dirty_at = now
                    db.commit()
                return False
            return _evaluate(db, int(manager_id), d, led, now)
    except Exception:
        log.exception("unit digest: note failed for unit %s on %s",
                      manager_id, d)
        db.rollback()
        return False


def sweep(db: Session, now: datetime | None = None) -> int:
    """The scheduled half — first digests waiting on a deadline, and updates
    waiting on quiet. Rides the 5-minute leader sweep (`leader_close._sweep`).

    Bounded to the rolling review window and to dates on or after the floor, so
    on a day nothing is due the pass is two indexed reads."""
    now = now or datetime.now(timezone.utc)
    lo = max(DIGEST_FROM, leader_ai.auto_window_start())
    latest: dict[tuple[int, str], datetime] = {}
    for mid, d, closed_at in (db.query(LeaderTaskDay.manager_id,
                                        LeaderTaskDay.date,
                                        LeaderTaskDay.closed_at)
                              .filter(LeaderTaskDay.closed_at.isnot(None),
                                      LeaderTaskDay.date >= lo).all()):
        k = (int(mid), str(d))
        if k not in latest or closed_at > latest[k]:
            latest[k] = closed_at
    if not latest:
        return 0
    ledgers = {(r.manager_id, r.date): r for r in
               db.query(LeaderUnitReport)
               .filter(LeaderUnitReport.date >= lo).all()}

    firsts: list[tuple[int, str]] = []
    updates: list[tuple[int, str]] = []
    marked = False
    quiet = timedelta(minutes=CORRECTION_QUIET_MIN)
    for k, last_close in latest.items():
        led = ledgers.get(k)
        if led is None or not led.sends:
            if led is None or not led.parked:
                firsts.append(k)
            continue
        # A checklist closed AFTER the table went out — a late filing, or a day
        # an admin re-opened and closed again — is a row the brigadir has not
        # seen, whether or not it ever produces a verdict to reach `note`.
        if (led.dirty_at is None and led.last_sent_at is not None
                and last_close > led.last_sent_at):
            led.dirty_at = now
            marked = True
        if led.dirty_at is not None and now - led.dirty_at >= quiet:
            updates.append(k)
    if marked:
        db.commit()

    sent = 0
    # Newest first: if the cap ever binds, the day somebody is waiting on is
    # today's, not last week's.
    todo = ([("first", k) for k in sorted(firsts, key=lambda k: k[1],
                                          reverse=True)[:SWEEP_CAP]]
            + [("update", k) for k in updates[:SWEEP_CAP]])
    for kind, (mid, d) in todo:
        try:
            with _lock:
                led = _ledger(db, mid, d)   # re-read: `note` may have got here first
                if kind == "first" and led is not None and led.sends:
                    continue
                if kind == "update" and (led is None or led.dirty_at is None):
                    continue
                if _evaluate(db, mid, d, led, now):
                    sent += 1
        except Exception:
            log.exception("unit digest: sweep failed for unit %s on %s", mid, d)
            db.rollback()
    return sent
