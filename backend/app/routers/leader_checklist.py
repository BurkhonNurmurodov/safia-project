"""The «Chek-list» tab on /leaders — one leader's checklist, one day at a time.

Built 2026-09-28 on the operator's rulings (asked one by one, with mockups):

  * a LEADER picks a single date. TODAY they file here — the same checklist the
    bot's `/tasks` files, through the same cores (`services/leader_checklist`,
    `leader_close.close_task`), so a task started in one door shows in the
    other. A PAST day shows what was accepted and what was not, and a rejected
    task can be objected to in place.
  * the AI's verdict appears the moment it is written. On a unit that submits
    task by task (every unit, today) a task is reviewed minutes after it is
    submitted, while its DAY runs on until evening — so an objection may be
    filed on an OPEN day too (`build_report_row(allow_open=True)`).
  * a failed AUTOMATIC check (#1, #8, #9) can be argued as well
    (`leader_dispute.auto_entry`), through the same chain.
  * a task whose time ran out while the day is open takes a LATE proof here,
    exactly as in the bot (`leader_late_proof`).
  * a brigadir, shift manager or admin picks the LEADER too and reads their day
    — past, present and in progress — read-only, except the admin's reopen /
    empty, which is the existing `/admin/leader-tasks/task/reopen`.

Nothing here computes a score. A closed day's number is the day report's
(`leader_reports.day_report`), the one every other surface prints; an open day's
running figure is `leader_close.score_line`, the one the bot's menu prints.

Reads are gated on the `/leaders` page and then row-scoped exactly as the day
report is (`report_scope_ok`); writes additionally require the caller to HOLD
the leader profile (`leader_proof._own_leader`, the camera's own rule), because
filing is something only the leader does.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app import identity
from app.models import (
    Cell, LeaderAutoCheck, LeaderChecklist, LeaderLateProof, LeaderTaskDay,
    LeaderTaskEntry, LeaderTaskPhoto, Manager, RoleProfile,
)
from app.permissions import require_page
from app.routers.leader_proof import _own_cell, _own_leader, _relay
from app.routers.leaders import (
    _may_dispute_for, _relabel, _stamp_report_rights, appeal_body,
    report_scope_ok,
)
from app.security import require_auth
from app.services import (
    action_log, leader_ai, leader_auto, leader_bot, leader_cells,
    leader_checklist, leader_close, leader_dispute, leader_late_proof, leader_load,
    leader_proof, leader_reports, leader_shift, leader_tasks,
)
from app.services.name_map import leader_match, supervisor_match

router = APIRouter(prefix="/api/leader-checklist", tags=["leader-checklist"])
log = logging.getLogger(__name__)

_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# One image as it arrives from a phone or a clipboard. The page scales every
# picture down before it leaves the device, so this is a guard against a
# hand-made request, not a limit a leader can reach by taking a screenshot —
# and Telegram's own photo limit is 10 MB, which is what the relay has to pass.
_MAX_IMAGE = 10 * 1024 * 1024
_REASON_MIN = 3
_REASON_MAX = 800


# ── who ──────────────────────────────────────────────────────────────────────

def _subject(db: Session, payload: dict, leader_id: int | None) -> RoleProfile:
    """The leader profile this viewer asked about — or 404.

    A leader asking for nobody reads their OWN checklist (`_own_leader`, the
    same binding the camera and the bot use). Anybody else must name one, and
    reads it only inside the day report's own row scope: a supervisor their
    unit's leaders, a leader themselves, the managers and admins everyone. 404
    and never 403 out of scope, for the reason the report gives — whether a
    profile exists is somebody else's data.
    """
    if leader_id is None:
        if payload.get("role") != "leader":
            raise HTTPException(status_code=404, detail="pick_leader")
        # The ACTIVE profile first — an account may hold several leader
        # profiles, and the one the session is switched to is the one it means.
        leader_id = identity.viewer_leader_profile_id(db, payload)
        if leader_id is None:
            return _own_leader(db, payload, None)
    prof = (db.query(RoleProfile)
            .filter(RoleProfile.id == leader_id, RoleProfile.role == "leader")
            .first())
    if prof is None or not report_scope_ok(db, payload, {
            "manager_id": prof.manager_id, "leader_id": prof.id,
            "leader": prof.name}):
        raise HTTPException(status_code=404, detail="not_found")
    return prof


def _holds(db: Session, payload: dict, prof: RoleProfile) -> bool:
    """Does this session act AS this leader? Only then may it file."""
    try:
        return _own_leader(db, payload, prof.id).id == prof.id
    except HTTPException:
        return False


def _iso(ts) -> str | None:
    if ts is None:
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(leader_proof.TASHKENT).isoformat()


def _clean_date(v: str | None) -> str | None:
    v = (v or "").strip()[:10]
    if not _DATE.match(v):
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        return None


def _day_row(db: Session, leader_id: int, date: str,
             cell_id: int | None) -> LeaderTaskDay | None:
    q = db.query(LeaderTaskDay).filter_by(leader_id=leader_id, date=date)
    q = (q.filter(LeaderTaskDay.cell_id == cell_id) if cell_id
         else q.filter(LeaderTaskDay.cell_id.is_(None)))
    return q.first()


def _sheet_uid(db: Session, prof: RoleProfile, date: str) -> str | None:
    """The Google-Form row this leader filed for `date`, if the form carries one.

    Resolved with the register's OWN matchers (`supervisor_match` +
    `leader_match`), never a looser test here: a row this tab attributed to a
    different person than /api/leaders did would show one leader another
    leader's day. The form's last rows are from late August 2026 — every unit
    files in the bot since — so this only ever answers for the history.
    """
    rows = db.query(LeaderChecklist).filter(LeaderChecklist.date == date).all()
    if not rows:
        return None
    sup = supervisor_match(db.query(Manager).all(),
                           {_relabel(r.supervisor) for r in rows if r.supervisor})
    cands = [r for r in rows if r.leader and
             (sup.get(_relabel(r.supervisor)) or {}).get("id") == prof.manager_id]
    if not cands:
        return None
    lead = leader_match(
        db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
        {(r.leader, prof.manager_id) for r in cands})
    for r in cands:
        if (lead.get((r.leader, prof.manager_id)) or {}).get("id") == prof.id:
            return leader_ai.row_uid(r)
    return None


# ── one task, as the tab shows it ────────────────────────────────────────────

def _kind(c: dict) -> str:
    """HOW this task is answered: `auto` (the platform decides it), `camera`
    (shot in the app, never uploaded), `none` (a yes/no with no proof), or
    `screenshot` (images picked or pasted)."""
    if leader_auto.is_auto(c):
        return "auto"
    if c.get("proof_kind") == "camera":
        return "camera"
    if int(c.get("min_media") or 0) <= 0:
        return "none"
    return "screenshot"


def _ruled_state(state: str, rep_task: dict | None) -> str:
    """The state after the human rulings the register already applies.

    An admin's own done / not-done ruling outranks everything (it is the
    explicit human statement of the task's state, `_apply_overlays`), and a flag
    in the MANUAL regime — before the automatic one, where a flag waits for a
    human and costs nothing until it gets one — is not a rejection.
    """
    if rep_task is None:
        return state
    adm = rep_task.get("admin_done")
    if adm is True:
        return "passed"
    if adm is False:
        return "ruledout"
    if state == "rejected" and not rep_task.get("ai_rejected"):
        return "passed"
    return state


def _late_wire(row: LeaderLateProof | None, drafts: int) -> dict | None:
    if row is None and not drafts:
        return None
    return {
        "draft": drafts,
        "proof": ({
            "id": row.id, "status": row.status, "reason": row.reason,
            "at": _iso(row.created_at), "deadline": row.deadline,
            "lateMin": leader_late_proof.late_minutes(row),
        } if row is not None else None),
    }


def _auto_wire(db: Session, prof: RoleProfile, date: str, tid: int,
               c: dict, cell_id: int | None, shift: int) -> dict:
    """What the tab says about an AUTOMATIC task — which check, at what hour,
    on which page the job is done, and what it found where it has run.

    The LIVE figures (what the check would read right now) are deliberately NOT
    here: they are the production dashboard itself, twice over, and this read
    is polled while the tab is open. The task sheet asks `/auto-live` for them
    when it opens.
    """
    from app.services import leader_auto_rich
    parsed = leader_auto.parse_check(c.get("auto_check")) or (None, None)
    check = parsed[0]
    out = {
        "check": check,
        "hour": leader_auto.check_hour(db, prof.manager_id, shift, tid, c,
                                       leader_id=prof.id, date=date),
        "page": leader_auto_rich.PAGE.get(check or ""),
        "facts": None,
        "measured": None,
    }
    row = (db.query(LeaderAutoCheck)
           .filter(LeaderAutoCheck.leader_id == prof.id,
                   LeaderAutoCheck.date == date,
                   LeaderAutoCheck.task_id == tid,
                   (LeaderAutoCheck.cell_id.is_(None) if cell_id is None
                    else LeaderAutoCheck.cell_id == cell_id))
           .first())
    if row is not None and row.outcome in (leader_auto.PASSED, leader_auto.FAILED):
        out["facts"] = dict(row.facts or {})
    got = leader_auto.measured(db, prof.id, date, tid, cell_id)
    if got is not None:
        out["measured"] = {"outcome": got.outcome, "code": got.code,
                           "facts": dict(got.facts or {})}
    return out


def _view_raw(db: Session, payload: dict, prof: RoleProfile,
          date_q: str | None, cell_q: int | None) -> dict:
    """One leader's checklist for one day — THE payload of the tab."""
    mgr = db.query(Manager).filter_by(id=prof.manager_id).first()
    shift = leader_proof.leader_shift(db, prof)
    today = leader_tasks.effective_date(shift)
    date = _clean_date(date_q) or today
    if date > today:
        # A checklist that does not exist yet has nothing to show and nothing
        # to file: the next day is opened by its own shift, not by a calendar.
        date = today
    # The shift THAT day runs on — a leader whose checklist moved to the other
    # shift (services/leader_shift) has past days on the old one.
    unit_sh = mgr.shift if (mgr and mgr.shift in (1, 2)) else 1
    if date != today and leader_shift.moved(db, prof.id):
        shift = leader_shift.shift_on(db, prof.id, date, unit_sh)
    is_today = date == today
    now = datetime.now(timezone.utc)
    files = _holds(db, payload, prof)

    # ── which checklist: one per cell on a switched unit ─────────────────────
    # A leader with no counted cell who filed nothing since 1 October owes no
    # checklist at all (`leader_load`) — said, like `noCell`, not shown as a
    # list of tasks nobody will ask them for.
    no_load = leader_load.exempt(db, prof, date)
    owed = ([None] if no_load
            else leader_cells.expected_days(db, prof, date))   # [None] | [ids] | []
    per_cell = owed != [None]
    cells: list[dict] = []
    if per_cell:
        have = {c.id: c for c in leader_cells.filing_cells(db, prof)}
        # A cell reassigned since still has its filed days: keep it pickable.
        for d in (db.query(LeaderTaskDay)
                  .filter(LeaderTaskDay.leader_id == prof.id,
                          LeaderTaskDay.date == date,
                          LeaderTaskDay.cell_id.isnot(None)).all()):
            if d.cell_id not in have:
                c = db.query(Cell).filter_by(id=d.cell_id).first()
                if c is not None:
                    have[c.id] = c
        cells = [{"id": c.id, "code": c.verifix_code}
                 for c in sorted(have.values(), key=lambda c: c.verifix_code or "")]
    ids = [c["id"] for c in cells]
    cell_id = (cell_q if cell_q in ids else (ids[0] if ids else None)) if per_cell else None

    day = _day_row(db, prof.id, date, cell_id) if (not per_cell or cell_id) else None
    per_task = leader_tasks.per_task_close(db, prof.manager_id)
    cfg = leader_tasks.effective_leader_config(db, prof, shift, day=date)

    # ── which submission is the record ───────────────────────────────────────
    source, uid, counted, rehearsal = None, None, True, False
    if day is not None:
        source, uid = "bot", leader_bot.day_uid(day.id)
        if day.closed_at is not None:
            # Which collection layer counts is a fact about the UNIT's form
            # (leader_bot.merges), so it is asked with the unit's shift.
            args = (unit_sh, prof.manager_id, date)
            overrides = leader_bot.source_overrides(db)
            counted = leader_bot.merges(
                *args, leader_bot.camera_units(db), leader_bot.bot_from_floors(db),
                leader_id=prof.id, overrides=overrides, per_cell=day.cell_id is not None)
            rehearsal = leader_bot.training(
                *args, leader_bot.bot_from_floors(db), leader_id=prof.id,
                overrides=overrides, per_cell=day.cell_id is not None)
    if not is_today and not per_cell and (day is None or not counted):
        s_uid = _sheet_uid(db, prof, date)
        if s_uid:
            source, uid, counted = "sheet", s_uid, True

    rep = leader_reports.day_report(db, uid, allow_open=True) if uid else None
    if rep is not None:
        rep = _stamp_report_rights(db, payload, rep)
    rep_tasks = {int(t["id"]): t for t in (rep or {}).get("tasks") or []}
    may_object = bool(rep and rep.get("canDispute"))
    appealable = leader_dispute.appealable(date)

    open_day = day is not None and day.closed_at is None
    examples = leader_ai.example_ids_map(db, manager_id=prof.manager_id,
                                         leader_id=prof.id)

    # ── the tasks ────────────────────────────────────────────────────────────
    tasks: list[dict] = []
    if source == "sheet":
        # The Google Form carries only what the leader answered — there is no
        # config behind a form row, no draft, no deadline to show. Its tasks are
        # the report's own, in the order the report lists them.
        for tid, t in sorted(rep_tasks.items()):
            if t.get("answered") is False:
                continue
            if t.get("done"):
                st = "pending" if t.get("queued") else "passed"
                if t.get("ai_rejected"):
                    st = "rejected"
            else:
                st = "notdone"
            st = _ruled_state(st, t)
            tasks.append({
                "id": tid, "name": t.get("name"), "description": "",
                "weight": t.get("weight") or 0, "kind": "screenshot",
                "state": st, "answered": True, "done": bool(t.get("done")),
                "reason": t.get("reason") or "", "media": [],
                "photos": [u.strip() for u in str(t.get("photo") or "").split(",")
                           if "http" in u],
                "cam": [], "review": t.get("review"), "queued": bool(t.get("queued")),
                "aiRejected": bool(t.get("ai_rejected")),
                "admin": ({"done": t.get("admin_done"), "by": t.get("admin_by"),
                           "at": t.get("admin_at")}
                          if t.get("admin_done") is not None else None),
                "dispute": t.get("dispute"),
                "objectable": bool(
                    may_object and appealable and t.get("objectable")
                    and (t.get("dispute") or {}).get("status")
                    not in leader_dispute.OPEN_STATES),
                "locked": True, "examples": [],
            })
    else:
        entries = ({e.task_id: e for e in
                    db.query(LeaderTaskEntry).filter_by(day_id=day.id).all()}
                   if day else {})
        media = leader_bot.media_of(db, [e.id for e in entries.values()])
        revs = leader_ai.verdicts_for(db, day) if day else {}
        rolls: dict[int, list] = {}
        if day is not None:
            for p in (db.query(LeaderTaskPhoto).filter_by(day_id=day.id)
                      .order_by(LeaderTaskPhoto.task_id, LeaderTaskPhoto.slot).all()):
                rolls.setdefault(p.task_id, []).append(p)
        lates = leader_late_proof.by_day(db, day.id) if day else {}
        # An admin's reopen puts a task back on the DAY's own deadline
        # (`leader_close.reopened_tasks`) — its own hour has already fired.
        reopened = leader_close.reopened_tasks(day)
        drafts_by: dict[int, int] = {}
        if day is not None and is_today:
            from sqlalchemy import func
            from app.models import LeaderLateProofShot
            drafts_by = dict(db.query(LeaderLateProofShot.task_id,
                                      func.count(LeaderLateProofShot.id))
                             .filter(LeaderLateProofShot.day_id == day.id)
                             .group_by(LeaderLateProofShot.task_id).all())
        # A CLOSED day is exactly the tasks it recorded — the config is not
        # versioned, so a task enabled since would otherwise read «not filed»
        # on a day that never asked it. An open or unfiled day is the config.
        order = [t for t, c in cfg.items() if c.get("enabled")]
        if day is not None and day.closed_at is not None and entries:
            order = ([t for t in cfg if t in entries]
                     + sorted(t for t in entries if t not in cfg))
        for tid in order:
            c = cfg.get(tid) or {}
            e = entries.get(tid)
            rt = rep_tasks.get(tid)
            if c:
                kind = _kind(c)
            else:
                # A task archived since: read what it was off its own entry.
                kind = ("auto" if str((e.reason if e else "") or "").startswith(
                    leader_tasks.AUTO_PREFIX)
                    else "screenshot" if (e is not None and media.get(e.id)) else "none")
            has_media = bool(e is not None and media.get(e.id))
            st = leader_close.task_state(e, revs.get(tid), has_media, day)
            if e is None and not is_today:
                # Nothing was ever recorded for this task on a day that is over.
                st = "missing"
            st = _ruled_state(st, rt)
            timing = {} if tid in reopened else c
            closes = leader_close.task_deadline(timing, shift)
            due = leader_close.due_at(timing, shift, date)
            starts = leader_close.starts_at(timing, shift, date)
            late_row = lates.get(tid)
            drafts = int(drafts_by.get(tid) or 0)
            late_ok = bool(is_today and files and c and kind != "auto" and leader_late_proof.eligible(
                db, day=day, task_id=tid, cfg_entry=c, shift=shift, per_task=per_task))
            roll = rolls.get(tid) or []
            dispute = rt.get("dispute") if rt else None
            open_dispute = bool(dispute and dispute.get("status") in leader_dispute.OPEN_STATES)
            tasks.append({
                "id": tid,
                "name": (rt or {}).get("name") or c.get("names"),
                "description": c.get("description") or c.get("criteria") or "",
                "weight": int(c.get("weight") or 0),
                "kind": kind,
                "minMedia": int(c.get("min_media") or 0),
                "maxMedia": leader_proof.max_slots(max(1, int(c.get("min_media") or 0))),
                "window": list(c.get("window") or ()) if c.get("date_check", True) else None,
                "dateCheck": bool(c.get("date_check", True)),
                "timeCheck": bool(c.get("time_check", True)),
                "dayCheck": bool(c.get("day_check", True)),
                "closesAt": closes,
                "dueAt": _iso(due),
                "startsAt": _iso(starts),
                "notStarted": bool(is_today and starts is not None and now < starts),
                "pastDue": bool(is_today and due is not None and now >= due),
                "state": st,
                "locked": leader_close.locked(e, day),
                "answered": e is not None,
                "done": bool(e.done) if e is not None else False,
                "reason": (e.reason or "") if e is not None else "",
                "closedAt": _iso(e.closed_at) if e is not None else None,
                "media": media.get(e.id, []) if e is not None else [],
                "cam": (rt or {}).get("cam") or [],
                # The camera roll of a task still short of its minimum — it
                # writes no entry, so it is the only trace of the work so far.
                # Photo ids are served only to the leader, whose own door
                # (`/api/leader-proof/photo`) is the one that can stream them.
                "roll": ({"count": len(roll),
                          "ids": [p.id for p in roll] if files else []}
                         if kind == "camera" and roll else None),
                "review": (rt or {}).get("review"),
                "queued": bool((rt or {}).get("queued")),
                "aiRejected": bool((rt or {}).get("ai_rejected")),
                "admin": ({"done": rt.get("admin_done"), "by": rt.get("admin_by"),
                           "at": rt.get("admin_at")}
                          if rt and rt.get("admin_done") is not None else None),
                "dispute": dispute,
                # A verdict exists only once the task was submitted (the AI's)
                # or decided (the automatic check's), so `objectable` from the
                # report already implies that; what is added here is WHO may
                # argue it and that nothing is being argued yet.
                "objectable": bool(may_object and appealable and rt
                                   and rt.get("objectable") and not open_dispute),
                "late": dict(_late_wire(late_row, drafts) or {}, eligible=late_ok)
                if (late_ok or late_row is not None or drafts) else None,
                "auto": (_auto_wire(db, prof, date, tid, c, cell_id, shift)
                         if kind == "auto" and c else None),
                "examples": examples.get(tid, []),
            })

    running = None
    if per_task and (open_day or (day is None and is_today)):
        earned, out_of, pending = leader_close.score_line(db, day, cfg)
        running = {"earned": earned, "outOf": out_of, "pending": pending,
                   "total": sum(int(c.get("weight") or 0)
                                for c in cfg.values() if c.get("enabled"))}

    missing = (leader_checklist.missing_tasks(db, day, cfg)
               if (is_today and not per_task) else [])
    return {
        "leader": {"id": prof.id, "name": prof.name},
        "unit": {"id": mgr.id if mgr else None, "name": mgr.name if mgr else None},
        "shift": shift,
        "date": date,
        "today": today,
        "isToday": is_today,
        "serverNow": _iso(now),
        "perCell": per_cell,
        "cells": cells,
        "cell": cell_id,
        # A switched unit whose leader owns no cell files NOTHING (the
        # operator's ruling, `leader_cells.expected_days`) — said, not shown
        # as an empty list.
        "noCell": per_cell and not cells,
        "noLoad": no_load,
        "perTask": per_task,
        "filing": {"deadline": leader_tasks.deadline_hhmm(shift)},
        "source": source,
        "uid": uid,
        "counted": counted,
        "rehearsal": rehearsal,
        "day": ({"id": day.id, "open": day.closed_at is None,
                 "closedAt": _iso(day.closed_at)} if day is not None else None),
        "score": ({"score": rep.get("score"), "raw": rep.get("rawScore"),
                   "excluded": rep.get("excluded"), "voided": rep.get("voided"),
                   "counts": rep.get("counts")}
                  if rep is not None and not rep.get("open") else None),
        "running": running,
        "rights": {
            # Filing is the leader's alone, and only on the checklist that is
            # still being filed — today's, and not once it is closed.
            "file": bool(files and is_today and not (day and day.closed_at)
                         and not (per_cell and cell_id is None) and not no_load),
            "object": may_object and appealable,
            "admin": payload.get("role") == "admin",
        },
        "closeDay": ({"ready": not missing, "missing": missing}
                     if (is_today and not per_task and files and not no_load) else None),
        "tasks": tasks,
    }


# ── read ─────────────────────────────────────────────────────────────────────


def _view(db: Session, payload: dict, prof: RoleProfile, *args, **kw) -> dict:
    """`_view_raw`, without an automatic check's pass mark when a LEADER reads
    it (`leader_auto.hides_target`) — every door that returns a view goes
    through here, so none can forget it."""
    view = _view_raw(db, payload, prof, *args, **kw)
    return leader_auto.hide_targets(view) if leader_auto.hides_target(payload) else view


@router.get("/day")
def checklist_day(
    leader: int | None = Query(None),
    date: str | None = Query(None, max_length=10),
    cell: int | None = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """One leader's checklist for one day — see the module docstring."""
    prof = _subject(db, payload, leader)
    return _view(db, payload, prof, date, cell)


@router.get("/auto-live")
def auto_live(
    task: int = Query(...),
    leader: int | None = Query(None),
    cell: int | None = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """What an automatic check would read RIGHT NOW — the same context and
    runner the check itself uses (`leader_auto_rich.snapshot`), never a second
    computation. Asked when the task sheet opens, not on every poll."""
    from app.services import leader_auto_rich
    prof = _subject(db, payload, leader)
    shift = leader_proof.leader_shift(db, prof)
    date = leader_tasks.effective_date(shift)
    c = leader_tasks.effective_leader_config(db, prof, shift).get(task) or {}
    parsed = leader_auto.parse_check(c.get("auto_check")) if c else None
    if not c.get("enabled") or not parsed:
        raise HTTPException(status_code=404, detail="not_auto")
    mgr = db.query(Manager).filter_by(id=prof.manager_id).first()
    if mgr is None:
        raise HTTPException(status_code=404, detail="no_unit")
    hour = leader_auto.check_hour(db, prof.manager_id, shift, task, c,
                                  leader_id=prof.id, date=date)
    due = leader_close.due_at({"deadline": hour}, shift, date) or datetime.now(timezone.utc)
    cell_obj = None
    if cell and leader_cells.is_per_cell(db, prof.manager_id, date):
        cell_obj = db.query(Cell).filter_by(id=cell, leader_id=prof.id).first()
    snap = leader_auto_rich.snapshot(db, prof, mgr, parsed[0], parsed[1], due,
                                     datetime.now(timezone.utc), date, cell_obj)
    return {"check": parsed[0], "hour": hour,
            "target": leader_auto_rich.TARGET_PCT if parsed[0] == "plan_pct" else None,
            **snap}


# ── write: the leader's own checklist, today ─────────────────────────────────

def _filing_ctx(db: Session, payload: dict, leader, cell, task=None):
    """`(prof, cell_id, shift, date, cfg, entry_cfg)` for a write on TODAY's
    checklist — refusing anybody who does not hold the leader profile."""
    try:
        lid = int(leader) if leader not in (None, "") else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="bad_leader")
    prof = _own_leader(db, payload, lid)
    try:
        cid = int(cell) if cell not in (None, "", "null") else None
    except (TypeError, ValueError):
        cid = None
    cid = _own_cell(db, prof, cid)
    shift = leader_proof.leader_shift(db, prof)
    date = leader_tasks.effective_date(shift)
    if leader_load.exempt(db, prof, date):
        raise HTTPException(status_code=409, detail="no_load")
    if leader_cells.is_per_cell(db, prof.manager_id, date) and cid is None:
        # A switched unit files one checklist PER CELL; a write naming none
        # would open the cell-less day that belongs to nothing.
        raise HTTPException(status_code=409, detail="pick_cell")
    cfg = leader_tasks.effective_leader_config(db, prof, shift)
    ce = None
    if task is not None:
        try:
            tid = int(task)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="bad_task")
        ce = cfg.get(tid)
        if not ce or not ce.get("enabled"):
            raise HTTPException(status_code=404, detail="unknown_task")
    return prof, cid, shift, date, cfg, ce


def _images(uploads: list) -> list[bytes]:
    """Every picked image, read, checked and normalised BEFORE any is relayed,
    so one bad file refuses the whole answer rather than half-posting it."""
    out = []
    for up in uploads:
        data = up.file.read(_MAX_IMAGE + 1)
        if not data:
            raise HTTPException(status_code=400, detail="empty_file")
        if len(data) > _MAX_IMAGE:
            raise HTTPException(status_code=413, detail="too_large")
        try:
            out.append(leader_checklist.normalize_image(data))
        except ValueError:
            raise HTTPException(status_code=400, detail="invalid_image")
    return out


def _relay_all(images: list[bytes]) -> list[tuple[str, int]]:
    got = []
    for data in images:
        r = _relay(data)
        if not r:
            # A photo the archive refused is a photo nobody can ever review;
            # saving the answer without it would record a proof that is not
            # there. The copies already relayed stay in the channel — the
            # archive is the audit trail everywhere on this platform.
            raise HTTPException(status_code=502, detail="relay_failed")
        got.append((r[0], r[1]))
    return got


def _task_name(c: dict | None) -> str:
    return leader_tasks.config_name(c or {}, "uz") if c else ""


@router.post("/answer")
def answer_task(
    parsed: dict = Depends(appeal_body),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Answer one of today's tasks — «Bajarildi» with its images, or «Bajarilmadi»
    with a reason — and, when `submit` is set on a unit that closes task by
    task, submit it in the same breath.

    The web door's answer is ONE step behind a confirm (the operator's call):
    a leader on this tab has the photos in hand and means to hand them in. A
    draft started in the bot is still shown here and submitted with `/submit`.
    Camera tasks are refused an upload — the in-app camera is their only door,
    and it is the whole point of them that no file the leader produced is
    accepted.
    """
    f = parsed.get("fields") or {}
    uploads = parsed.get("files") or []
    if f.get("task") in (None, ""):
        raise HTTPException(status_code=400, detail="bad_task")
    prof, cid, shift, date, cfg, c = _filing_ctx(
        db, payload, f.get("leader"), f.get("cell"), f.get("task"))
    tid = int(f.get("task"))
    done = str(f.get("done") or "").lower() in ("1", "true", "yes")
    submit = str(f.get("submit") or "").lower() in ("1", "true", "yes")
    reason = str(f.get("reason") or "").strip()
    kind = _kind(c)
    per_task = leader_tasks.per_task_close(db, prof.manager_id)

    if kind == "auto":
        raise HTTPException(status_code=409, detail="auto_task")
    _date, _shift, day = leader_checklist.current_day(db, prof, cid)
    if (per_task and tid not in leader_close.reopened_tasks(day)
            and leader_close.past_deadline(c, shift, date)):
        # Past its own hour the task takes a LATE proof, which two people rule
        # on — the bot routes the same task to the same door. A task an admin
        # reopened is on the day's own deadline instead, and stays open.
        raise HTTPException(status_code=409, detail="time_up")
    if done and kind == "camera":
        raise HTTPException(status_code=409, detail="camera_task")
    images: list[bytes] = []
    if done:
        need = int(c.get("min_media") or 0)
        cap = leader_proof.max_slots(max(1, need))
        if need > 0 and len(uploads) < need:
            raise HTTPException(status_code=400, detail="need_photos")
        if len(uploads) > cap:
            raise HTTPException(status_code=400, detail="too_many_photos")
        images = _images(uploads)
        reason = ""
    else:
        if len(reason) < _REASON_MIN:
            raise HTTPException(status_code=400, detail="reason_required")
        reason = reason[:_REASON_MAX]

    if day is not None and day.closed_at is not None:
        raise HTTPException(status_code=409, detail="day_closed")
    old = (db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
           if day else None)
    if leader_close.locked(old, day):
        raise HTTPException(status_code=409, detail="locked")

    media = _relay_all(images) if images else []
    entry = leader_checklist.save_answer(db, prof, tid, done, reason or None, media, cid)
    if entry is None:
        raise HTTPException(status_code=409, detail="locked")
    submitted = False
    if submit and per_task:
        _d, _s, day = leader_checklist.current_day(db, prof, cid)
        submitted = leader_close.close_task(db, day=day, entry=entry, cfg=cfg,
                                            actor=prof.name)
        if submitted:
            leader_ai.run_async(discover_first=False)
    action_log.enrich(
        target_kind="task", target_id=tid, target_name=_task_name(c),
        unit_id=prof.manager_id, day=date, reason=(reason or None),
        details=[("leader", prof.name), ("status", "done" if done else "not_done"),
                 ("photos", len(media)), ("submitted", submitted), ("door", "web")],
    )
    return {"ok": True, "submitted": submitted,
            "view": _view(db, payload, prof, date, cid)}


@router.post("/submit")
def submit_task(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Submit a task that is already answered — a draft from the bot, or a
    camera task whose roll reached its minimum. `leader_close.close_task` is the
    one core: the lock is committed first, then the review is queued."""
    prof, cid, shift, date, cfg, c = _filing_ctx(
        db, payload, body.get("leader"), body.get("cell"), body.get("task"))
    tid = int(body.get("task"))
    if not leader_tasks.per_task_close(db, prof.manager_id):
        raise HTTPException(status_code=409, detail="day_mode")
    _d, _s, day = leader_checklist.current_day(db, prof, cid)
    if day is None:
        raise HTTPException(status_code=409, detail="incomplete")
    if day.closed_at is not None:
        raise HTTPException(status_code=409, detail="day_closed")
    e = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
    if e is None:
        raise HTTPException(status_code=409, detail="incomplete")
    if leader_close.locked(e, day):
        raise HTTPException(status_code=409, detail="locked")
    ok = leader_close.close_task(db, day=day, entry=e, cfg=cfg, actor=prof.name)
    if ok:
        leader_ai.run_async(discover_first=False)
    action_log.enrich(
        target_kind="task", target_id=tid, target_name=_task_name(c),
        unit_id=prof.manager_id, day=date,
        details=[("leader", prof.name), ("door", "web")],
        changes=[("status", "draft", "closed")],
    )
    return {"ok": bool(ok), "view": _view(db, payload, prof, date, cid)}


@router.post("/reset")
def reset_task(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Empty one task that is not submitted yet — its answer, its photos and
    its camera roll. `leader_close.reset_task` is THE reset core (the bot's
    «Qayta topshirish» and the admin's «Tozalash» run it too) and it refuses a
    submitted task on its own."""
    prof, cid, shift, date, cfg, c = _filing_ctx(
        db, payload, body.get("leader"), body.get("cell"), body.get("task"))
    tid = int(body.get("task"))
    _d, _s, day = leader_checklist.current_day(db, prof, cid)
    if day is None:
        return {"ok": False, "view": _view(db, payload, prof, date, cid)}
    if day.closed_at is not None:
        raise HTTPException(status_code=409, detail="day_closed")
    e = db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
    if leader_close.locked(e, day):
        raise HTTPException(status_code=409, detail="locked")
    hit = leader_close.reset_task(db, day, tid)
    action_log.enrich(
        target_kind="task", target_id=tid, target_name=_task_name(c),
        unit_id=prof.manager_id, day=date,
        details=[("leader", prof.name), ("door", "web"), ("emptied", bool(hit))],
    )
    return {"ok": bool(hit), "view": _view(db, payload, prof, date, cid)}


@router.post("/close-day")
def close_day(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """«KUNNI YOPISH» for a unit that still closes whole days. Refused while any
    enabled task is unanswered, exactly as the bot refuses it."""
    prof, cid, shift, date, cfg, _c = _filing_ctx(
        db, payload, body.get("leader"), body.get("cell"))
    if leader_tasks.per_task_close(db, prof.manager_id):
        raise HTTPException(status_code=409, detail="per_task")
    _d, _s, day = leader_checklist.current_day(db, prof, cid)
    if day is None:
        raise HTTPException(status_code=409, detail="incomplete")
    if day.closed_at is not None:
        raise HTTPException(status_code=409, detail="day_closed")
    missing = leader_checklist.missing_tasks(db, day, cfg)
    if missing:
        raise HTTPException(status_code=409, detail="incomplete")
    score = leader_checklist.close_day(db, day, cfg, prof.name)
    action_log.enrich(
        target_kind="day", target_id=day.id, target_name=prof.name,
        unit_id=prof.manager_id, day=date,
        details=[("leader", prof.name), ("shift", shift), ("score", round(score)),
                 ("door", "web")],
        changes=[("status", "open", "closed")],
    )
    return {"ok": True, "score": round(score),
            "view": _view(db, payload, prof, date, cid)}


# ── write: a proof after the task's own hour ─────────────────────────────────

def _late_ctx(db: Session, payload: dict, leader, cell, task):
    prof, cid, shift, date, cfg, c = _filing_ctx(db, payload, leader, cell, task)
    tid = int(task)
    day = _day_row(db, prof.id, date, cid)
    if not leader_late_proof.eligible(
            db, day=day, task_id=tid, cfg_entry=c, shift=shift,
            per_task=leader_tasks.per_task_close(db, prof.manager_id)):
        raise HTTPException(status_code=409, detail="late_gone")
    if day is None:
        # Created HERE and nowhere else in this flow, exactly as the bot's late
        # screen creates it: a leader who filed nothing all day has no day row,
        # and the draft roll, the filing and the camera's late door all need
        # one. Never by a sweep — an untouched day must not sprout a row.
        _d, _s, day = leader_checklist.current_day(db, prof, cid, create=True)
        db.commit()
    return prof, cid, shift, date, cfg, c, tid, day


@router.post("/late/start")
def late_start(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Open the late door on one task — the step before the in-app camera, whose
    late mode needs the day row to exist."""
    prof, cid, _shift, date, _cfg, c, tid, day = _late_ctx(
        db, payload, body.get("leader"), body.get("cell"), body.get("task"))
    action_log.enrich(
        target_kind="task", target_id=tid, target_name=_task_name(c),
        unit_id=prof.manager_id, day=date,
        details=[("leader", prof.name), ("door", "web")],
    )
    return {"ok": True, "day": day.id,
            "drafts": leader_late_proof.draft_count(db, day.id, tid)}


@router.post("/late")
def file_late(
    parsed: dict = Depends(appeal_body),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """File one late proof: the picked images join whatever the in-app camera
    already put on the draft roll, the reason is REQUIRED, and the filing goes
    to the unit's brigadir first — exactly the bot's `lsend`. It earns nothing
    on its own; two people decide whether it earns the point."""
    f = parsed.get("fields") or {}
    uploads = parsed.get("files") or []
    reason = str(f.get("reason") or "").strip()
    if len(reason) < _REASON_MIN:
        raise HTTPException(status_code=400, detail="reason_required")
    prof, cid, shift, date, _cfg, c, tid, day = _late_ctx(
        db, payload, f.get("leader"), f.get("cell"), f.get("task"))
    cap = leader_proof.max_slots(int(c.get("min_media") or 1))
    have = leader_late_proof.draft_count(db, day.id, tid)
    if have + len(uploads) > cap:
        raise HTTPException(status_code=400, detail="too_many_photos")
    images = _images(uploads)
    for data, (fid, mid) in zip(images, _relay_all(images)):
        try:
            leader_late_proof.save_shot(
                db, prof=prof, day=day, task_id=tid, cap=cap, data=None,
                captured_at=None, slot=None, skew_s=None, relay=None,
                source="upload", relayed=(fid, mid))
        except leader_late_proof.ShotError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
    db.flush()
    tid_tg = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    try:
        row = leader_late_proof.create(
            db, day=day, task_id=tid, prof=prof, shift=shift, cfg_entry=c,
            reason=reason[:_REASON_MAX], actor_telegram=tid_tg)
    except leader_late_proof.ShotError:
        db.rollback()
        raise HTTPException(status_code=400, detail="need_photos")
    db.commit()
    # Put it in front of whoever rules first, and tell everybody in the chat —
    # the bot's own two calls, in the bot's own order.
    carded: set = set()
    try:
        from app.telegram_bot import _lp_send_to_supervisor
        carded = _lp_send_to_supervisor(db, row) or set()
    except Exception:
        log.warning("late proof %s: card to the brigadir failed", row.id, exc_info=True)
    leader_late_proof.notify_filed(db, row, skip_dm=carded)
    db.commit()
    action_log.enrich(
        target_kind="task", target_id=row.id, target_name=prof.name,
        unit_id=prof.manager_id, day=date, reason=reason[:_REASON_MAX],
        details=[("leader", prof.name), ("task_id", tid), ("door", "web"),
                 ("uploaded", len(images))],
    )
    return {"ok": True, "id": row.id, "view": _view(db, payload, prof, date, cid)}
