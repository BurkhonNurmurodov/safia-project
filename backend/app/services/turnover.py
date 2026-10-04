"""«Kadrlar qo'nimsizligi» — the leaders' turnover KPI (`/turnover`). THE rule.

From 2026-10-04 (the operator: "ignore the past — from October HR calculates
the KPIs on the IMS; this is the 2nd of 5") the platform computes HR's
«Текучесть» month by month from Verifix. HR's own July file was:

    Текучесть (cell) = people who LEFT the cell in the month
                       ÷ people WORKING in it on the month's last day × 12

scored 1–5 and weighted 0.2. This module keeps that arithmetic and fixes the
places the file was ambiguous, so every figure can be explained:

* **Left («Ketganlar»)** — every employment whose Verifix dismissal date falls
  in the month, whatever the reason. It counts in the cell the person was in
  when they left (a dismissed person's directory row keeps that unit).
* **Working («Ishlayotganlar»)** — everyone employed on the month's last day
  (hired on or before it, not dismissed by it), in the cell they were in that
  day. A person who left during the month is never in this count — also when
  their order is typed in after the list was taken.
* **Cell** — the Verifix org unit's code (its `code`, else the digits its name
  starts with: 15 units carry the code only in the name), matched to /cells.
  A code /cells does not have counts toward nobody and is listed so.
* **Leader** — the cell's leader on /cells at the month's end. A leader with
  several cells gets ONE figure over all of them: Σ left ÷ Σ working × 12 (HR's
  file averaged the cells and then overwrote the average by hand).
* **× 12** — one month as a yearly rate.
* **Score** — the rate is rounded to one decimal (what the page prints) and
  judged by HR's bands: ≤ 50 → 5, ≤ 60 → 4, ≤ 70 → 3, ≤ 85 → 2, above → 1.
  KPI points = score × 0.2. No people working → no rate and no score.

**Verifix forgets the past** (it knows where a person works TODAY, and a
re-hire erases the earlier dismissal from its directory), so the platform keeps
its own history — `services/turnover_sync.py` reads the directory every night:

* the current month is computed from the last read («so far», provisional);
* the read at or after 23:00 on a month's last day TAKES that month's list of
  working people (`turnover_month_people`, kind roster) and the cell → leader
  map — the month's denominator, exact;
* the month stays open for late dismissal orders until the 5th of the next
  month at 09:00, then CLOSES (the leavers are frozen too) and never moves
  again; dismissals typed in later are shown as late, not counted. An admin
  may close earlier, or reopen — a month reopened by hand is closed by hand.

Nothing before `START_MONTH` is computed (the operator's ruling).
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import (
    AppSetting, Cell, Manager, RoleProfile, TurnoverLeaver, TurnoverMonth,
    TurnoverMonthPerson, TurnoverPerson, TurnoverRead,
)
from app.services import verifix

START_MONTH = date(2026, 10, 1)
CLOSE_DAY = 5
CLOSE_HOUR = 9
CAPTURE_FROM = time(23, 0)      # a read at or after this on a month's last day takes its list
NIGHT_READ = (23, 40)
READ_STALE = timedelta(minutes=20)

RULE_KEY = "turnover_rule"
DEFAULT_RULE = {
    "multiplier": 12,
    "weight": 0.2,
    "bands": [{"max": 50, "score": 5}, {"max": 60, "score": 4},
              {"max": 70, "score": 3}, {"max": 85, "score": 2}],
    "worst": 1,
}

_PREFIX = re.compile(r"^\s*(\d{3,5})(?!\d)")


# ── time ──────────────────────────────────────────────────────────────────────

def now_aware() -> datetime:
    return datetime.now(verifix.TZ)


def local(dt: Optional[datetime]) -> Optional[datetime]:
    """An aware instant as the plant's naive wall clock."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(verifix.TZ).replace(tzinfo=None)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=verifix.TZ)
    return dt.astimezone(verifix.TZ).isoformat(timespec="minutes")


def month_start(d: date) -> date:
    return d.replace(day=1)


def next_month(m: date) -> date:
    return date(m.year + (m.month // 12), m.month % 12 + 1, 1)


def last_day(m: date) -> date:
    return next_month(m) - timedelta(days=1)


def close_at(m: date) -> datetime:
    """When an ended month closes by itself — naive Tashkent wall clock."""
    return datetime.combine(next_month(m).replace(day=CLOSE_DAY), time(CLOSE_HOUR, 0))


def parse_month(raw: Optional[str]) -> Optional[date]:
    s = (raw or "").strip()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})(?:-\d{1,2})?", s)
    if not m:
        return None
    y, mo = int(m.group(1)), int(m.group(2))
    if not (2000 <= y <= 2100 and 1 <= mo <= 12):
        return None
    return date(y, mo, 1)


def ym(m: date) -> str:
    return f"{m.year:04d}-{m.month:02d}"


# ── codes ─────────────────────────────────────────────────────────────────────

def unit_code(raw_code: Optional[str], unit_name: Optional[str]) -> Optional[str]:
    """A Verifix unit's cell code: its `code` field, else the digits its NAME
    starts with («4722 Зона отправки…» carries no code field)."""
    s = (raw_code or "").strip()
    if s:
        return s
    m = _PREFIX.match(unit_name or "")
    return m.group(1) if m else None


def code_key(code: Optional[str]) -> Optional[str]:
    """'0028' and '28' are one cell — `cell_lookup`'s rule."""
    return verifix._code_key(code) if code else None


def event_key(staff_id: Optional[str], employee_id: str, dismissed: Optional[date]) -> str:
    """One ended employment: its cycle id, else the person + the date."""
    if staff_id:
        return f"s{staff_id}"
    return f"e{employee_id}:{dismissed.isoformat() if dismissed else ''}"


# ── the rule ──────────────────────────────────────────────────────────────────

def rule(db: Session) -> dict:
    """The rule in force: the admin override in app_settings when it is
    well-formed, else HR's. A malformed override can never blank a score."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if row and row.value:
        try:
            r = json.loads(row.value)
            bands = sorted(({"max": float(b["max"]), "score": int(b["score"])} for b in r["bands"]),
                           key=lambda b: b["max"])
            if bands and all(1 <= b["score"] <= 5 for b in bands):
                return {"multiplier": float(r.get("multiplier", 12)) or 12,
                        "weight": float(r.get("weight", 0.2)),
                        "bands": bands, "worst": int(r.get("worst", 1))}
        except (ValueError, TypeError, KeyError):
            pass
    return json.loads(json.dumps(DEFAULT_RULE))


def round1(x: float) -> float:
    return float(Decimal(str(x)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def rate_of(left: int, working: int, r: dict) -> Optional[float]:
    """Percent a year, rounded to the decimal the page prints. None when
    nobody was working — there is nothing to divide by."""
    if working <= 0:
        return None
    return round1(left / working * float(r["multiplier"]) * 100)


def score_of(rate: Optional[float], r: dict) -> Optional[int]:
    if rate is None:
        return None
    for b in sorted(r["bands"], key=lambda b: b["max"]):
        if rate <= float(b["max"]):
            return int(b["score"])
    return int(r["worst"])


def points_of(score: Optional[int], r: dict) -> Optional[float]:
    if score is None:
        return None
    return round(score * float(r["weight"]), 2)


# ── who leads what ────────────────────────────────────────────────────────────

def cell_map(db: Session) -> dict[str, dict]:
    """Every /cells cell by code key, with its brigadir and leader — the map a
    month is attributed by (frozen into the month when its list is taken)."""
    cells = db.query(Cell).order_by(Cell.verifix_code).all()
    mids = {c.manager_id for c in cells if c.manager_id}
    lids = {c.leader_id for c in cells if c.leader_id}
    mans = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    leads = {p.id: p for p in db.query(RoleProfile).filter(RoleProfile.id.in_(lids)).all()} if lids else {}
    out: dict[str, dict] = {}
    for c in cells:
        k = code_key(c.verifix_code)
        if not k or k in out:
            continue
        m = mans.get(c.manager_id)
        p = leads.get(c.leader_id)
        out[k] = {
            "id": c.id, "code": c.verifix_code, "archived": bool(c.archived_at),
            "manager_id": c.manager_id, "brigadir": m.name if m else None,
            "shift": m.shift if m else None, "factory_id": m.factory_id if m else None,
            "leader_id": p.id if p else None, "leader": p.name if p else None,
            "leader_kind": p.leader_kind if p else None,
        }
    return out


# ── people ────────────────────────────────────────────────────────────────────

def employed_on(hired: Optional[date], dismissed: Optional[date], status: Optional[str], d: date) -> bool:
    """Working on day `d`: hired by it and not dismissed by it (a person whose
    dismissal date IS `d` has left — HR's July file counted them as left only)."""
    if hired is None:
        return status == "W" and (dismissed is None or dismissed > d)
    return hired <= d and (dismissed is None or dismissed > d)


def _p(row, kind: str) -> dict:
    return {
        "kind": kind, "employee_id": row.employee_id, "staff_id": row.staff_id,
        "name": row.name, "code": row.code, "unit": row.unit_name, "job": row.job,
        "hired": row.hired, "dismissed": getattr(row, "dismissed", None),
        "reason": getattr(row, "reason", None), "note": getattr(row, "note", None),
    }


def mirror_roster(db: Session, d: date) -> list[dict]:
    """Working on `d` by the last read of the directory (their unit as read)."""
    return [_p(r, "roster") for r in db.query(TurnoverPerson).filter(TurnoverPerson.code.isnot(None)).all()
            if employed_on(r.hired, r.dismissed, r.status, d)]


def live_leavers(db: Session, a: date, b: date) -> list[dict]:
    rows = (db.query(TurnoverLeaver)
            .filter(TurnoverLeaver.dismissed >= a, TurnoverLeaver.dismissed <= b,
                    TurnoverLeaver.cancelled_at.is_(None))
            .all())
    out = []
    for r in rows:
        p = _p(r, "leaver")
        p["first_seen"] = r.first_seen
        out.append(p)
    return out


def _frozen(db: Session, m: date, kind: str) -> list[dict]:
    return [_p(r, kind) for r in db.query(TurnoverMonthPerson)
            .filter(TurnoverMonthPerson.month == m, TurnoverMonthPerson.kind == kind).all()]


def _drop_leavers(roster: list[dict], leavers: list[dict]) -> tuple[list[dict], int]:
    """The working list minus anyone whose SAME employment ended in the month —
    a dismissal typed in after the list was taken must not count the person
    twice. A person re-hired within the month is a new employment (a new
    staff id) and stays: they did leave, and they are working at its end."""
    staff = {q["staff_id"] for q in leavers if q.get("staff_id")}
    emp_any = {q["employee_id"] for q in leavers}
    emp_nostaff = {q["employee_id"] for q in leavers if not q.get("staff_id")}
    kept, dropped = [], 0
    for p in roster:
        sid = p.get("staff_id")
        hit = (sid in staff or p["employee_id"] in emp_nostaff) if sid else p["employee_id"] in emp_any
        if hit:
            dropped += 1
            continue
        kept.append(p)
    return kept, dropped


# ── the reads ─────────────────────────────────────────────────────────────────

def last_read(db: Session, ok_only: bool = False) -> Optional[TurnoverRead]:
    q = db.query(TurnoverRead)
    if ok_only:
        q = q.filter(TurnoverRead.ok.is_(True))
    return q.order_by(TurnoverRead.id.desc()).first()


def read_info(db: Session) -> dict:
    last = last_read(db)
    ok = last_read(db, ok_only=True)
    running = bool(last and last.finished_at is None
                   and last.started_at and now_aware() - last.started_at < READ_STALE)
    return {
        "running": running,
        # A night was missed: the figures are older than the page suggests.
        "stale": bool(ok is None or ok.finished_at is None
                      or now_aware() - ok.finished_at > timedelta(hours=30)),
        "last": None if not last else {
            "at": iso(last.finished_at or last.started_at), "ok": last.ok, "error": last.error,
            "trigger": last.trigger,
        },
        "ok": None if not ok else {
            "at": iso(ok.finished_at), "employees": ok.employees, "in_cells": ok.in_cells,
            "reasons": ok.reasons,
        },
    }


# ── a month's state ───────────────────────────────────────────────────────────

def month_state(db: Session, m: date, now: Optional[datetime] = None) -> tuple[str, Optional[TurnoverMonth]]:
    """before · future · open · closing · closed."""
    now = now or local(now_aware())
    cur = month_start(now.date())
    if m < START_MONTH:
        return "before", None
    if m > cur:
        return "future", None
    row = db.get(TurnoverMonth, m)
    if row and row.status == "closed":
        return "closed", row
    if row and row.roster_at:
        return "closing", row
    if m == cur:
        return "open", row
    return "closing", row       # ended, but no read took its list — approximate


def capture(db: Session, m: date, at: datetime, source: str = "read") -> int:
    """Take month `m`'s list of people working on its last day from the
    directory as last read, and freeze the cell → leader map beside it."""
    d = last_day(m)
    people = mirror_roster(db, d)
    row = db.get(TurnoverMonth, m)
    if row is None:
        row = TurnoverMonth(month=m, status="captured")
        db.add(row)
    db.query(TurnoverMonthPerson).filter(TurnoverMonthPerson.month == m,
                                         TurnoverMonthPerson.kind == "roster").delete()
    db.bulk_insert_mappings(TurnoverMonthPerson, [{
        "month": m, "kind": "roster", "employee_id": p["employee_id"], "staff_id": p["staff_id"],
        "name": p["name"], "code": p["code"], "unit_name": p["unit"], "job": p["job"],
        "hired": p["hired"],
    } for p in people])
    row.roster_at = at
    row.roster_source = source
    row.cell_map = cell_map(db)
    db.flush()
    return len(people)


def capture_due(db: Session, at: datetime) -> list[str]:
    """Every month from START whose last day has reached 23:00 and whose list
    nobody took yet — called by each complete read, after the directory."""
    now = local(at)
    out: list[str] = []
    m = START_MONTH
    cur = month_start(now.date())
    while m <= cur:
        if now >= datetime.combine(last_day(m), CAPTURE_FROM):
            row = db.get(TurnoverMonth, m)
            if not row or not row.roster_at:
                capture(db, m, at, "read")
                out.append(ym(m))
        m = next_month(m)
    return out


class Refused(Exception):
    def __init__(self, code: str, message: str = ""):
        super().__init__(message or code)
        self.code = code
        self.message = message or code


def close(db: Session, m: date, by: str, at: Optional[datetime] = None) -> dict:
    """Freeze an ended month: its leavers are written beside its list and the
    rule in force is stored with it. Never for a month still running."""
    at = at or now_aware()
    state, row = month_state(db, m, local(at))
    if state == "closed":
        raise Refused("already_closed")
    if state != "closing":
        raise Refused("not_ended")
    if row is None or not row.roster_at:
        capture(db, m, at, "approx")
        row = db.get(TurnoverMonth, m)
    leavers = live_leavers(db, m, last_day(m))
    db.query(TurnoverMonthPerson).filter(TurnoverMonthPerson.month == m,
                                         TurnoverMonthPerson.kind == "leaver").delete()
    db.bulk_insert_mappings(TurnoverMonthPerson, [{
        "month": m, "kind": "leaver", "employee_id": p["employee_id"], "staff_id": p["staff_id"],
        "name": p["name"], "code": p["code"], "unit_name": p["unit"], "job": p["job"],
        "hired": p["hired"], "dismissed": p["dismissed"], "reason": p["reason"], "note": p["note"],
    } for p in leavers])
    row.status = "closed"
    row.closed_at = at
    row.closed_by = by
    row.rule = rule(db)
    db.flush()
    return {"month": ym(m), "leavers": len(leavers)}


def reopen(db: Session, m: date, by: str, at: Optional[datetime] = None) -> dict:
    """Take a closed month back to «closing»: its leavers are read live again.
    The list of working people stays the one taken at the month's end."""
    at = at or now_aware()
    state, row = month_state(db, m, local(at))
    if state != "closed" or row is None:
        raise Refused("not_closed")
    db.query(TurnoverMonthPerson).filter(TurnoverMonthPerson.month == m,
                                         TurnoverMonthPerson.kind == "leaver").delete()
    row.status = "captured"
    row.closed_at = None
    row.closed_by = None
    row.rule = None
    row.reopened_at = at
    row.reopened_by = by
    db.flush()
    return {"month": ym(m)}


def auto_close(db: Session, at: Optional[datetime] = None) -> list[str]:
    """Close every ended month whose closing hour has passed — except one an
    admin reopened by hand, which an admin closes again."""
    at = at or now_aware()
    now = local(at)
    out: list[str] = []
    m = START_MONTH
    cur = month_start(now.date())
    while m < cur:
        if now >= close_at(m):
            state, row = month_state(db, m, now)
            if state == "closing" and not (row and row.reopened_at):
                close(db, m, "system", at)
                out.append(ym(m))
        m = next_month(m)
    return out


# ── the figures ───────────────────────────────────────────────────────────────

def _scope_ok(cell: dict, scope: dict) -> bool:
    if scope.get("factory") is not None and cell.get("factory_id") != scope["factory"]:
        return False
    if scope.get("shift") is not None and cell.get("shift") != scope["shift"]:
        return False
    if scope.get("managers") and cell.get("manager_id") not in scope["managers"]:
        return False
    return True


def _tenure(hired: Optional[date], left: Optional[date]) -> Optional[int]:
    if not hired or not left:
        return None
    return max(0, (left - hired).days)


def aggregate(roster: list[dict], leavers: list[dict], cmap: dict[str, dict], r: dict,
              scope: Optional[dict] = None) -> dict:
    """The month's figures from its people. ONE function for the open month,
    a month waiting to close and a closed one — so the page, the explain
    dialog and the workbook can never state two answers."""
    scope = scope or {}
    any_scope = bool(scope.get("factory") is not None or scope.get("shift") is not None or scope.get("managers"))

    cells: dict[str, dict] = {}

    def cell(k: str) -> dict:
        if k not in cells:
            c = cmap[k]
            cells[k] = {"key": k, **c, "working": 0, "left": 0}
        return cells[k]

    unreg: dict[str, dict] = {}

    def miss(k: str, p: dict) -> dict:
        if k not in unreg:
            unreg[k] = {"key": k, "code": p.get("code"), "unit": p.get("unit"), "working": 0, "left": 0}
        return unreg[k]

    other_left = 0
    for p in roster:
        k = code_key(p.get("code"))
        if not k:
            continue
        if k in cmap:
            cell(k)["working"] += 1
        else:
            miss(k, p)["working"] += 1

    out_leavers: list[dict] = []
    for p in leavers:
        k = code_key(p.get("code"))
        if not k:
            other_left += 1
            continue
        c = cmap.get(k)
        if c is None:
            miss(k, p)["left"] += 1
            counted = "no_cell"
        else:
            cell(k)["left"] += 1
            counted = "leader" if c.get("leader_id") else "no_leader"
            if any_scope and not _scope_ok(c, scope):
                continue
        if counted == "no_cell" and any_scope:
            continue
        out_leavers.append({
            "key": event_key(p.get("staff_id"), p["employee_id"], p.get("dismissed")),
            "name": p["name"], "code": (c or {}).get("code") or p.get("code"), "unit": p.get("unit"),
            "cell_id": (c or {}).get("id"), "job": p.get("job"),
            "hired": p["hired"].isoformat() if p.get("hired") else None,
            "left": p["dismissed"].isoformat() if p.get("dismissed") else None,
            "days": _tenure(p.get("hired"), p.get("dismissed")),
            "reason": p.get("reason"), "note": p.get("note"), "counted": counted,
            "leader_id": (c or {}).get("leader_id"), "leader": (c or {}).get("leader"),
            "brigadir": (c or {}).get("brigadir"), "manager_id": (c or {}).get("manager_id"),
        })
    out_leavers.sort(key=lambda x: (x["left"] or "", x["name"]), reverse=True)

    # Cells: every cell anybody stands in, plus every leader's cell (an empty
    # one says a code does not match — the reader must see it as 0, not miss it).
    for k, c in cmap.items():
        if c.get("leader_id"):
            cell(k)
    out_cells = []
    for k, c in cells.items():
        if any_scope and not _scope_ok(c, scope):
            continue
        if c["working"] == 0 and c["left"] == 0 and not c.get("leader_id"):
            continue
        rt = rate_of(c["left"], c["working"], r)
        out_cells.append({**c, "rate": rt, "score": score_of(rt, r)})
    out_cells.sort(key=lambda c: (c["code"] or ""))

    by_leader: dict[int, list[str]] = defaultdict(list)
    for k, c in cmap.items():
        if c.get("leader_id"):
            by_leader[c["leader_id"]].append(k)
    out_leaders = []
    for lid, keys in by_leader.items():
        cs = [cells[k] for k in sorted(keys, key=lambda k: cmap[k].get("code") or "")]
        if any_scope and not any(_scope_ok(c, scope) for c in cs):
            continue
        working = sum(c["working"] for c in cs)
        left = sum(c["left"] for c in cs)
        rt = rate_of(left, working, r)
        sc = score_of(rt, r)
        first = cs[0]
        brig, seen = [], set()
        for c in cs:
            if c.get("manager_id") and c["manager_id"] not in seen:
                seen.add(c["manager_id"])
                brig.append({"id": c["manager_id"], "name": c.get("brigadir"), "shift": c.get("shift")})
        out_leaders.append({
            "id": lid, "name": first.get("leader"), "kind": first.get("leader_kind"),
            "brigadirs": brig,
            "cells": [{"key": c["key"], "id": c["id"], "code": c["code"], "working": c["working"],
                       "left": c["left"], "archived": c.get("archived")} for c in cs],
            "working": working, "left": left, "rate": rt, "score": sc, "points": points_of(sc, r),
        })
    out_leaders.sort(key=lambda x: (x["rate"] is None, -(x["rate"] or 0), x["name"] or ""))

    scoped = out_cells
    working = sum(c["working"] for c in scoped)
    left = sum(c["left"] for c in scoped)
    left_leader = sum(c["left"] for c in scoped if c.get("leader_id"))
    by_score: dict[str, int] = {str(s): 0 for s in range(1, 6)}
    for x in out_leaders:
        if x["score"] is not None:
            by_score[str(x["score"])] = by_score.get(str(x["score"]), 0) + 1
    unregistered = [] if any_scope else sorted(unreg.values(), key=lambda u: -(u["working"] + u["left"]))
    rt = rate_of(left, working, r)
    return {
        "totals": {
            "working": working, "left": left, "rate": rt,
            "left_leader": left_leader, "left_no_leader": left - left_leader,
            "cells": sum(1 for c in scoped if c["working"] or c["left"]),
            "leaders": len(out_leaders),
            "scored": sum(1 for x in out_leaders if x["score"] is not None),
            "no_people": sum(1 for x in out_leaders if x["working"] == 0),
            "by_score": by_score,
            "unregistered_left": sum(u["left"] for u in unregistered),
            "unregistered_working": sum(u["working"] for u in unregistered),
            "other_left": 0 if any_scope else other_left,
        },
        "leaders": out_leaders, "cells": out_cells, "leavers": out_leavers,
        "unregistered": unregistered,
    }


def _inputs(db: Session, m: date, state: str, row: Optional[TurnoverMonth], now: datetime) -> dict:
    """The people of month `m` and the map that attributes them."""
    ok = last_read(db, ok_only=True)
    if state == "open":
        # The month as the last complete read saw it — never past that read,
        # never before the month began (a read from the previous month's last
        # night still says who works where on the 1st).
        as_of = min(now.date(), local(ok.finished_at).date()) if ok and ok.finished_at else now.date()
        as_of = max(as_of, m)
        return {"roster": mirror_roster(db, as_of), "leavers": live_leavers(db, m, as_of),
                "cmap": cell_map(db), "rule": rule(db), "as_of": as_of, "source": "live",
                "dropped": 0, "late": []}
    d = last_day(m)
    if state == "closing":
        leavers = live_leavers(db, m, d)
        if row and row.roster_at:
            roster, dropped = _drop_leavers(_frozen(db, m, "roster"), leavers)
            return {"roster": roster, "leavers": leavers, "cmap": row.cell_map or cell_map(db),
                    "rule": rule(db), "as_of": d, "source": row.roster_source or "read",
                    "dropped": dropped, "late": []}
        return {"roster": mirror_roster(db, d), "leavers": leavers, "cmap": cell_map(db),
                "rule": rule(db), "as_of": d, "source": "approx", "dropped": 0, "late": []}
    # closed — everything from the frozen rows; what Verifix says SINCE the
    # close is listed beside them (added = a dismissal typed in later, gone = a
    # counted dismissal Verifix no longer has), never counted.
    frozen = _frozen(db, m, "leaver")
    roster, dropped = _drop_leavers(_frozen(db, m, "roster"), frozen)
    keys = {event_key(p.get("staff_id"), p["employee_id"], p.get("dismissed")) for p in frozen}
    live = live_leavers(db, m, d)
    late = []
    for p in live:
        k = event_key(p.get("staff_id"), p["employee_id"], p.get("dismissed"))
        if k not in keys:
            late.append({"kind": "added", "name": p["name"], "code": p.get("code"),
                         "left": p["dismissed"].isoformat() if p.get("dismissed") else None,
                         "seen": iso(p.get("first_seen"))})
    live_keys = {event_key(p.get("staff_id"), p["employee_id"], p.get("dismissed")) for p in live}
    for p in frozen:
        k = event_key(p.get("staff_id"), p["employee_id"], p.get("dismissed"))
        if k not in live_keys:
            late.append({"kind": "gone", "name": p["name"], "code": p.get("code"),
                         "left": p["dismissed"].isoformat() if p.get("dismissed") else None, "seen": None})
    return {"roster": roster, "leavers": frozen, "cmap": (row.cell_map if row else None) or cell_map(db),
            "rule": (row.rule if row and row.rule else rule(db)), "as_of": d,
            "source": (row.roster_source if row else None) or "read", "dropped": dropped, "late": late}


def options(cmap: dict[str, dict]) -> dict:
    shifts = sorted({c["shift"] for c in cmap.values() if c.get("shift") in (1, 2)})
    brig: dict[int, dict] = {}
    for c in cmap.values():
        if c.get("manager_id") and c["manager_id"] not in brig:
            brig[c["manager_id"]] = {"id": c["manager_id"], "name": c.get("brigadir"),
                                     "shift": c.get("shift"), "factory_id": c.get("factory_id")}
    return {"shifts": shifts, "brigadirs": sorted(brig.values(), key=lambda b: b["name"] or "")}


def month_payload(db: Session, m: date, scope: Optional[dict] = None,
                  at: Optional[datetime] = None) -> dict:
    """Everything the page shows for month `m`, within `scope`."""
    at = at or now_aware()
    now = local(at)
    state, row = month_state(db, m, now)
    cfg = verifix.config(db)
    base = {
        "month": ym(m), "start": ym(START_MONTH), "state": state,
        "configured": bool(cfg.get("login") and cfg.get("password_set")
                           and cfg.get("password_readable") is not False and cfg.get("filial_id")),
        "read": read_info(db),
        "period": {"from": m.isoformat(), "to": last_day(m).isoformat()},
        "close_at": close_at(m).isoformat(timespec="minutes"),
        "now": now.isoformat(timespec="minutes"),
    }
    if state in ("before", "future"):
        return {**base, "rule": rule(db)}
    inp = _inputs(db, m, state, row, now)
    agg = aggregate(inp["roster"], inp["leavers"], inp["cmap"], inp["rule"], scope)
    roster_at = row.roster_at if row and row.roster_at else None
    late_days = None
    if roster_at:
        late_days = max(0, (local(roster_at).date() - last_day(m)).days)
    return {
        **base, **agg,
        "rule": inp["rule"], "as_of": inp["as_of"].isoformat(),
        "roster_source": inp["source"], "roster_at": iso(roster_at), "roster_late_days": late_days,
        "dropped": inp["dropped"], "late": inp["late"],
        "closed": None if not (row and row.status == "closed") else {"at": iso(row.closed_at), "by": row.closed_by},
        "reopened": None if not (row and row.reopened_at) else {"at": iso(row.reopened_at), "by": row.reopened_by},
        "options": options(inp["cmap"]),
    }


def people_of(db: Session, m: date, keys: Iterable[str], at: Optional[datetime] = None) -> dict:
    """Who was counted as WORKING in these cells (the explain dialog's list)."""
    at = at or now_aware()
    now = local(at)
    state, row = month_state(db, m, now)
    if state in ("before", "future"):
        return {"working": {}}
    inp = _inputs(db, m, state, row, now)
    want = {k for k in keys if k}
    out: dict[str, list] = defaultdict(list)
    for p in inp["roster"]:
        k = code_key(p.get("code"))
        if k in want:
            out[k].append({"name": p["name"], "job": p.get("job"),
                           "hired": p["hired"].isoformat() if p.get("hired") else None})
    for k in out:
        out[k].sort(key=lambda x: x["name"])
    return {"working": dict(out)}
