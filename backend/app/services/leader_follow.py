"""A leader follows the cells they run to a new brigadir — DATED (2026-10-29).

The report from the floor: Maksumov Sanjar's and Xakimov Ruslan's units
exchanged cells on 25 October (7213 · A and 7214 · B among them), and on
«Lider nazorati» the leaders who run those cells stayed under their OLD
brigadir for every day since. The cause is two facts that each looked right on
their own:

* a checklist day is stamped with the leader PROFILE's unit when it is created
  (`leader_task_days.manager_id`, «the supervisor unit at save time») — the
  register, the brigadir's digest, the objection chain and the AI queue all
  read that stamp;
* since 2026-10-12 a cell changes brigadir by a DATED link event
  (`cell_links`) and nothing moves the leader who runs it — «a leader's cells
  never follow the leader's unit» was the ruling, and its mirror (the leader
  never follows the cells) was simply never written down.

The operator's answer (2026-10-29): «Yes, automatically» — when EVERY cell a
leader runs changes brigadir together, the leader moves with them, from the
move day. This module is that rule, and THE writer of a leader's unit:

* `move` — the one way a leader profile changes unit: the profile and its
  registrations re-pointed (`profiles._bound_role_rows`, the editor's own
  rule), the leader's days from the move day re-stamped (`restamp`) with
  everything that hangs off them, and the move RECORDED (`LeaderUnitMove`), so
  the days before it stay with the old brigadir for every reader that asks
  `unit_on`. The profile editor and the Verifix «leader_moved» tap call it too.
* `follow` — the detection: an applied brigadir change of a cell whose
  «Boshqaruvchi» ran it on both sides of the move, after which every live cell
  that leader runs stands in ONE unit, while the day before they were counted
  in a unit one of their cells stood in. The minute job after a landing
  (`run_sweep`, kicked by `cell_links.run_apply_due`) and the boot repair
  (`startup.repair_leader_units`) run the same function.

Never touched: a leader counted under another brigadir ON PURPOSE (0811 —
`verifix_sync.KEPT_APART`; any leader whose days were stamped somewhere none
of their cells stood), a leader whose cells end up in two units (they keep
their unit — `cell_lookup.cells_units_for_leader` lets their page read both),
and a profile a person has since put in a third unit. Each is NAMED in the
result rather than guessed at.
"""
from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import (CellLinkEvent, LeaderAiDispute, LeaderAiReview, LeaderAutoCheck,
                        LeaderDayReport, LeaderLateProof, LeaderTaskDay, LeaderTaskEntry,
                        LeaderUnitMove, Manager, RoleProfile)

log = logging.getLogger(__name__)

# The dated cell links are authoritative from here (`cell_links`: every cell
# got its grandfather event on 12 Oct). A move before it cannot be read.
FLOOR = date(2026, 10, 12)
# The live sweep looks at brigadir changes LANDED this recently — every
# outcome is idempotent (a recorded move is skipped), so the window only bounds
# the work of a minute job, never what it can still repair.
LOOKBACK_DAYS = 3
LOCK_KEY = 0x5AF1_1EAD       # one follow at a time, across both app copies


def _d(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError:
        return None


def _iso(v) -> Optional[str]:
    d = _d(v)
    return d.isoformat() if d else None


# ── the dated history (readers) ───────────────────────────────────────────────

def moves_by_leader(db: Session, leader_ids: Optional[Iterable[int]] = None) -> dict[int, list]:
    """leader profile id → its recorded moves, oldest first. One query."""
    q = db.query(LeaderUnitMove)
    if leader_ids is not None:
        ids = sorted({int(i) for i in leader_ids if i})
        if not ids:
            return {}
        q = q.filter(LeaderUnitMove.leader_id.in_(ids))
    out: dict[int, list] = defaultdict(list)
    try:
        for m in q.order_by(LeaderUnitMove.effective_from, LeaderUnitMove.id).all():
            out[m.leader_id].append(m)
    except Exception:  # noqa: BLE001 — a box before the table: no history
        db.rollback()
        return {}
    return dict(out)


def unit_on(current_unit: Optional[int], moves: list, day) -> Optional[int]:
    """The unit a leader belonged to on `day`: the `from_unit` of the first
    move dated after it, else their current unit."""
    d = _iso(day)
    if not d:
        return current_unit
    for m in moves or []:
        if d < m.effective_from:
            return m.from_unit
    return current_unit


def segments(current_unit: Optional[int], moves: list) -> list[dict]:
    """[{unit, from, to}] — the leader's units over time (`from` inclusive,
    `to` exclusive, None = open), adjacent spans of one unit merged. Empty for
    a leader who never moved: every reader then keeps its undated rule."""
    if not moves:
        return []
    out: list[dict] = []
    start = None
    for m in moves:
        out.append({"unit": m.from_unit, "from": start, "to": m.effective_from})
        start = m.effective_from
    out.append({"unit": current_unit, "from": start, "to": None})
    merged: list[dict] = []
    for s in out:
        if s["unit"] is None or (s["from"] and s["to"] and s["from"] >= s["to"]):
            continue
        if merged and merged[-1]["unit"] == s["unit"] and merged[-1]["to"] == s["from"]:
            merged[-1]["to"] = s["to"]
            continue
        merged.append(dict(s))
    return merged if len(merged) > 1 else []


def unit_members_on(db: Session, unit_id: int, day) -> list[RoleProfile]:
    """The leader profiles a unit counted on `day`, by the dated history: the
    unit's current leaders who had not arrived yet are dropped, the ones who
    have left since are added back (the brigadir's day digest, its page)."""
    d = _iso(day)
    cur = (db.query(RoleProfile)
           .filter(RoleProfile.role == "leader", RoleProfile.manager_id == unit_id).all())
    moves = moves_by_leader(db)
    if not moves:
        return sorted(cur, key=lambda p: p.name or "")
    out = {p.id: p for p in cur if unit_on(p.manager_id, moves.get(p.id), d) == unit_id}
    gone = [lid for lid, ms in moves.items()
            if lid not in out and any(m.from_unit == unit_id for m in ms)]
    if gone:
        for p in (db.query(RoleProfile)
                  .filter(RoleProfile.role == "leader", RoleProfile.id.in_(gone)).all()):
            if unit_on(p.manager_id, moves.get(p.id), d) == unit_id:
                out[p.id] = p
    return sorted(out.values(), key=lambda p: p.name or "")


# ── the writer ────────────────────────────────────────────────────────────────

def restamp(db: Session, leader_id: int, a: int, b: int, start, end=None) -> dict:
    """Every record of this leader's days in [start, end) that names unit `a`
    → `b`: the days themselves and what hangs off them (the AI verdicts and
    objections on their tasks, their late proofs, the automatic checks, the
    report ledger). Only rows naming `a` move — a day a person already put
    elsewhere stays. Caller commits."""
    s, e = _iso(start), _iso(end)
    q = db.query(LeaderTaskDay).filter(LeaderTaskDay.leader_id == leader_id,
                                       LeaderTaskDay.date >= s,
                                       LeaderTaskDay.manager_id == a)
    if e:
        q = q.filter(LeaderTaskDay.date < e)
    days = q.all()
    ids = [x.id for x in days]
    for x in days:
        x.manager_id = b
    out = {"days": len(ids)}
    if ids:
        from app.services.leader_ai import bot_ref
        refs = [bot_ref(eid) for (eid,) in
                db.query(LeaderTaskEntry.id).filter(LeaderTaskEntry.day_id.in_(ids)).all()]
        if refs:
            out["reviews"] = (db.query(LeaderAiReview)
                              .filter(LeaderAiReview.ref.in_(refs), LeaderAiReview.manager_id == a)
                              .update({LeaderAiReview.manager_id: b}, synchronize_session=False))
            out["disputes"] = (db.query(LeaderAiDispute)
                               .filter(LeaderAiDispute.ref.in_(refs),
                                       LeaderAiDispute.manager_id == a)
                               .update({LeaderAiDispute.manager_id: b},
                                       synchronize_session=False))
        out["late_proofs"] = (db.query(LeaderLateProof)
                              .filter(LeaderLateProof.day_id.in_(ids),
                                      LeaderLateProof.manager_id == a)
                              .update({LeaderLateProof.manager_id: b},
                                      synchronize_session=False))
        out["reports"] = (db.query(LeaderDayReport)
                          .filter(LeaderDayReport.report_key.in_([f"bot:{i}" for i in ids]),
                                  LeaderDayReport.manager_id == a)
                          .update({LeaderDayReport.manager_id: b}, synchronize_session=False))
    aq = db.query(LeaderAutoCheck).filter(LeaderAutoCheck.leader_id == leader_id,
                                          LeaderAutoCheck.date >= s,
                                          LeaderAutoCheck.manager_id == a)
    if e:
        aq = aq.filter(LeaderAutoCheck.date < e)
    out["auto_checks"] = aq.update({LeaderAutoCheck.manager_id: b}, synchronize_session=False)
    return {k: v for k, v in out.items() if v}


def _repoint_profile(db: Session, prof: RoleProfile, new_mid: int) -> None:
    """The profile's unit, moved the way the profile editor moves it — its
    registrations re-pointed (they are found by the OLD unit, so first) — and
    no cell dragged along (the 12 Oct ruling 3)."""
    from app.models import TelegramUserRole
    from app.routers import profiles as _p
    if prof.manager_id == new_mid:
        return
    for r in _p._bound_role_rows(db, "leader", prof.id):
        if isinstance(r, TelegramUserRole):
            r.role_id = new_mid
    prof.manager_id = new_mid


def move(db: Session, prof: RoleProfile, to_unit: int, effective, *, src: str,
         by: Optional[str] = None, cells: Optional[list] = None,
         from_unit: Optional[int] = None, note: Optional[str] = None) -> Optional[LeaderUnitMove]:
    """Move a leader to `to_unit` from the shift-day `effective` on.

    `from_unit` is the unit the leader's days were counted in before (default:
    the profile's unit now) — the follow passes the stamp it read, because a
    person may have moved the profile already while the days stayed behind.
    Re-stamps [effective, the leader's next recorded move) and records the
    move. Returns the record, or None when there was nothing to do. Caller
    commits, then calls `after_commit()`."""
    eff = _iso(effective)
    if not eff or not to_unit or prof is None:
        return None
    a = from_unit if from_unit is not None else prof.manager_id
    if a == to_unit or a is None:
        # Nothing to date: no unit before (a profile being connected), or no
        # change at all.
        _repoint_profile(db, prof, to_unit)
        return None
    later = (db.query(LeaderUnitMove.effective_from)
             .filter(LeaderUnitMove.leader_id == prof.id, LeaderUnitMove.effective_from > eff)
             .order_by(LeaderUnitMove.effective_from).first())
    end = later[0] if later else None
    profile_was = prof.manager_id
    _repoint_profile(db, prof, to_unit)
    counts = restamp(db, prof.id, a, to_unit, eff, end)
    rec = (db.query(LeaderUnitMove)
           .filter_by(leader_id=prof.id, effective_from=eff, to_unit=to_unit).first())
    if rec is None:
        rec = LeaderUnitMove(leader_id=prof.id, leader_name=prof.name, from_unit=a,
                             to_unit=to_unit, effective_from=eff, src=src,
                             cells=cells or None, restamped=counts or None,
                             note=note if profile_was in (a, None) else
                             ((note + " · " if note else "") + f"profile was already in {profile_was}"),
                             by=by)
        db.add(rec)
    else:
        merged = dict(rec.restamped or {})
        for k, v in counts.items():
            merged[k] = merged.get(k, 0) + v
        rec.restamped = merged or None
    db.flush()
    return rec


def after_commit() -> None:
    """The caches a leader's unit feeds, dropped once the move is committed."""
    try:
        from app.services import leader_load, leader_shift
        leader_load.forget()
        leader_shift.forget()
    except Exception:  # noqa: BLE001
        log.debug("leader follow: cache forget failed", exc_info=True)


# ── the detection ─────────────────────────────────────────────────────────────

def _live_cells(cells: list, day: date) -> list:
    from app.services import cell_archive
    return [c for c in cells if cell_archive.alive(c, day)]


def _kept_apart(cells: list) -> bool:
    try:
        from app.services import verifix_sync
        return any(verifix_sync.kept_apart(c.verifix_code) for c in cells)
    except Exception:  # noqa: BLE001
        return False


def _counted_unit(db: Session, prof: RoleProfile, e: date) -> Optional[int]:
    """The unit this leader's days were counted in just before `e`: their last
    day before it, else their first on or after it, else the profile's unit."""
    last = (db.query(LeaderTaskDay.manager_id)
            .filter(LeaderTaskDay.leader_id == prof.id, LeaderTaskDay.date < e.isoformat())
            .order_by(LeaderTaskDay.date.desc(), LeaderTaskDay.id.desc()).first())
    if last:
        return last[0]
    first = (db.query(LeaderTaskDay.manager_id)
             .filter(LeaderTaskDay.leader_id == prof.id, LeaderTaskDay.date >= e.isoformat())
             .order_by(LeaderTaskDay.date, LeaderTaskDay.id).first())
    return first[0] if first else prof.manager_id


def plan(db: Session, *, since: Optional[date] = None,
         landed_since: Optional[datetime] = None) -> tuple[list[dict], list[dict]]:
    """(moves to make, cases named) for the brigadir changes in force from
    `since` on (and landed after `landed_since`, when given) — read only."""
    from sqlalchemy import or_
    from app.models import Cell
    from app.services import cell_links
    from app.services.cell_lookup import leader_cells_on
    since = max(since or FLOOR, FLOOR)
    E = CellLinkEvent
    # A real change only: a void event or a catalog mark carries value = prev.
    q = (db.query(E.cell_id, E.effective_from)
         .filter(E.field == "manager_id", E.applied_at.isnot(None),
                 E.effective_from >= since, E.value.isnot(None),
                 or_(E.prev.is_(None), E.value != E.prev)))
    if landed_since is not None:
        q = q.filter(E.applied_at >= landed_since)
    by_day: dict[date, set] = defaultdict(set)
    for cid, eff in q.all():
        by_day[eff].add(cid)
    if not by_day:
        return [], []
    cell_links.forget()
    cells = {c.id: c for c in db.query(Cell).filter(
        Cell.id.in_({c for s in by_day.values() for c in s})).all()}
    done = {(m.leader_id, m.effective_from) for m in db.query(
        LeaderUnitMove.leader_id, LeaderUnitMove.effective_from).all()}
    units = {m.id: m for m in db.query(Manager).all()}
    moves: list[dict] = []
    named: list[dict] = []
    seen: set = set()
    for e in sorted(by_day):
        prev = e - timedelta(days=1)
        leaders = set()
        for cid in by_day[e]:
            c = cells.get(cid)
            if c is None:
                continue
            lid = cell_links.value_on(c, "leader_id", e)
            # The leader who ran it on both sides of the move — a cell handed to
            # a new «Boshqaruvchi» with the move takes nobody along.
            if lid and lid == cell_links.value_on(c, "leader_id", prev):
                leaders.add(lid)
        for lid in sorted(leaders):
            if (lid, e.isoformat()) in done or (lid, e) in seen:
                continue
            seen.add((lid, e))
            prof = db.query(RoleProfile).filter_by(id=lid, role="leader").first()
            if prof is None:
                continue
            before = _live_cells(leader_cells_on(db, lid, prev), prev)
            after = _live_cells(leader_cells_on(db, lid, e), e)
            ub = {cell_links.value_on(c, "manager_id", prev) for c in before}
            ua = {cell_links.value_on(c, "manager_id", e) for c in after}
            base = {"leader_id": lid, "leader": prof.name, "day": e.isoformat(),
                    "cells": sorted(c.verifix_code for c in after)}
            if not after or None in ua:
                named.append({**base, "kind": "no_unit"})
                continue
            if len(ua) != 1:
                named.append({**base, "kind": "split", "units": sorted(ua)})
                continue
            b = next(iter(ua))
            if _kept_apart(before + after):
                named.append({**base, "kind": "kept_apart"})
                continue
            a = _counted_unit(db, prof, e)
            if a == b:
                continue                   # already counted where the cells went
            if a not in ub:
                # Counted where none of their cells stood: on purpose (the
                # 26 Sep reading), never moved by a cell.
                named.append({**base, "kind": "counted_elsewhere", "counted": a, "to": b})
                continue
            unit = units.get(b)
            if unit is None or unit.archived:
                named.append({**base, "kind": "unit_gone", "to": b})
                continue
            if prof.manager_id not in (a, b):
                named.append({**base, "kind": "profile_elsewhere", "profile_unit": prof.manager_id,
                              "from": a, "to": b})
                continue
            moves.append({**base, "from": a, "to": b, "profile_unit": prof.manager_id})
    return moves, named


def follow(db: Session, *, since: Optional[date] = None,
           landed_since: Optional[datetime] = None, apply: bool = True,
           by: str = "Avtomatik") -> dict:
    """Plan, and (with `apply`) make, every move the rule calls for — one
    transaction, under the follow's lock. Caller commits."""
    if apply and db.bind is not None and db.bind.dialect.name == "postgresql":
        got = db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY}).scalar()
        if not got:
            return {"moves": [], "named": [], "busy": True}
    moves, named = plan(db, since=since, landed_since=landed_since)
    made = []
    if apply:
        for mv in moves:
            prof = db.query(RoleProfile).filter_by(id=mv["leader_id"], role="leader").first()
            rec = move(db, prof, mv["to"], mv["day"], src="cell_follow", by=by,
                       cells=mv["cells"], from_unit=mv["from"],
                       note="every cell this leader runs changed brigadir")
            if rec is not None:
                made.append({**mv, "restamped": rec.restamped or {}, "id": rec.id})
    return {"moves": made if apply else moves, "named": named}


def _names(db: Session, ids: Iterable) -> dict:
    ids = {int(i) for i in ids if i}
    return {m.id: m.name for m in db.query(Manager).filter(Manager.id.in_(ids)).all()} if ids else {}


def log_moves(db: Session, made: list[dict]) -> None:
    """One Jurnal row per move («org.leader_followed_cells»)."""
    if not made:
        return
    from app.services import action_log
    names = _names(db, {m["from"] for m in made} | {m["to"] for m in made})
    for m in made:
        action_log.record_system(
            "org", "org.leader_followed_cells", db,
            target_kind="profile", target_id=str(m["leader_id"]), target_name=m["leader"],
            unit_id=m["to"], unit_name=names.get(m["to"]), day=m["day"],
            changes=[("unit", names.get(m["from"]) or m["from"], names.get(m["to"]) or m["to"])],
            details=[("cells", " · ".join(m["cells"])), ("from", m["day"])]
            + [(k, v) for k, v in sorted((m.get("restamped") or {}).items())])


# ── the minute job ────────────────────────────────────────────────────────────

_SWEEP = threading.Lock()


def run_sweep() -> None:
    """Follow every brigadir change landed in the last `LOOKBACK_DAYS` — the
    minute job and `kick`. Idempotent: a recorded move is skipped."""
    if not _SWEEP.acquire(blocking=False):
        return
    try:
        from app.database import SessionLocal
        with SessionLocal() as db:
            res = follow(db, landed_since=datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS))
            if res.get("moves"):
                db.commit()
                after_commit()
                log_moves(db, res["moves"])
                try:
                    from app.services import leader_register
                    leader_register.forget()
                except Exception:  # noqa: BLE001
                    pass
            else:
                db.rollback()
    except Exception:  # noqa: BLE001 — the next minute tries again
        log.exception("leader follow: sweep failed")
    finally:
        _SWEEP.release()


def kick() -> None:
    """Run a sweep now, on a thread — right after a brigadir change lands."""
    try:
        threading.Thread(target=run_sweep, name="leader-follow-kick", daemon=True).start()
    except Exception:  # noqa: BLE001
        log.exception("leader follow: kick failed")
