"""Container issuing: AXO → Logistics → Leader (docs/containers-flow.md; the
design is docs/plan-axo-containers.md).

Every container a team works with comes from AXO. For each unit and each
production hour H the platform DRAFTS a batch two hours ahead, with the hour's
need FROZEN on it; AXO issues it, Logistics confirms it at the unit (the
delivery — due an hour before H), the platform splits it between the unit's
teams by each team's frozen need, and each team's leader accepts its share.
Nothing passes by itself; a lower number at any step carries a reason.

The need is `hourly_containers.unit_teams` off the unit's own «Zagruzka
fayli» dashboard — the «Soatlik» view's figure, per TEAM (a work centre, one
group of it, or its unlettered lines). It is an estimate that moves with every
edit of the plan, which is why it is copied onto the batch at the draft and
never read again: AXO is judged against the stored number. A plan that grows
after the draft gets a TOP-UP batch for the difference.

Only the units an admin enrolled (`settings`) get batches — none by default,
so the engine does nothing until somebody turns a unit on. While the app is
admin-only every step is pressed by an admin; no message goes to the floor."""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import (AppSetting, ContainerBatch, ContainerBatchLine, ContainerEvent,
                        ContainerRequest, ContainerRequestPart, ContainerShare, Manager,
                        ProfilePermission, RoleProfile)
from app.services import hourly_containers

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
KEYS = hourly_containers.KEYS
REASONS = ("short", "damaged", "wrong_type", "other")
DRAFT_MIN = 120          # a batch is drafted this long before its hour …
LEAD_MIN = 60            # … and is due at the unit this long before it
GRACE_MIN = 10           # the tick's own slack before a draft counts as late
TICK_MIN = 5
TOPUP_MIN_DEFAULT = 2
_UNITS_KEY = "container_flow.units"
_TOPUP_KEY = "container_flow.topup_min"
_LOCK_KEY = 8_140_573_112_014_001   # distinct from every other advisory key


class FlowError(ValueError):
    """A step the batch's state or the entered numbers do not allow. `code`
    is what the page translates (`cflow.err.<code>`)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def now() -> datetime:
    return datetime.now(TZ)


def hour_start(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(0), TZ) + timedelta(hours=int(hour))


def team_key(work_center, group, rest) -> str:
    return f"{work_center}|{group or ''}|{1 if rest else 0}"


# ── settings ────────────────────────────────────────────────────────────────

def settings(db: Session) -> dict:
    rows = {r.key: r.value for r in db.query(AppSetting).filter(
        AppSetting.key.in_([_UNITS_KEY, _TOPUP_KEY])).all()}
    try:
        units = [int(x) for x in json.loads(rows.get(_UNITS_KEY) or "[]")]
    except (ValueError, TypeError):
        units = []
    try:
        topup = max(1, int(rows.get(_TOPUP_KEY) or TOPUP_MIN_DEFAULT))
    except (ValueError, TypeError):
        topup = TOPUP_MIN_DEFAULT
    return {"units": units, "topup_min": topup}


def save_settings(db: Session, units: list, topup_min: int) -> dict:
    vals = {_UNITS_KEY: json.dumps(sorted({int(x) for x in units})),
            _TOPUP_KEY: str(max(1, int(topup_min)))}
    for k, v in vals.items():
        row = db.get(AppSetting, k)
        if row is None:
            db.add(AppSetting(key=k, value=v))
        else:
            row.value = v
    db.commit()
    return settings(db)


# ── the need ────────────────────────────────────────────────────────────────

def unit_teams(db: Session, manager_id: int, day: date) -> list:
    """The unit's teams with their hours for `day` (`hourly_containers
    .unit_teams`), [] for a unit with no «Zagruzka fayli»."""
    from fastapi import HTTPException
    from app.routers import production
    try:
        return hourly_containers.unit_teams(production._build_dashboard(db, manager_id, day))
    except HTTPException:
        return []


def _meta(team: dict) -> dict:
    cell = team.get("cell") or {}
    return {"work_center": team["work_center"], "group": team.get("group") or "",
            "rest": bool(team.get("rest")), "cell_id": cell.get("id"),
            "cell_code": cell.get("verifix_code"), "leader": cell.get("leader")}


def need_by_hour(teams: list) -> dict:
    """{hour: [(meta, {ctype: n})]} — each team's containers in each hour."""
    out: dict = {}
    for t in teams:
        for h, counts in (t.get("hours") or {}).items():
            c = {k: int(n) for k, n in counts.items() if n and n > 0}
            if c:
                out.setdefault(int(h), []).append((_meta(t), c))
    return out


# ── drafting ────────────────────────────────────────────────────────────────

def _due(hs: datetime, at: datetime) -> datetime:
    """Delivery deadline: an hour before H for a batch drafted on time, an hour
    after the draft for one that could only be drafted later (a plan typed
    late, a top-up, a manual request) — it is judged from when it existed."""
    if at <= hs - timedelta(minutes=DRAFT_MIN - GRACE_MIN):
        return hs - timedelta(minutes=LEAD_MIN)
    return at + timedelta(minutes=LEAD_MIN)


def _event(db: Session, batch_id: int, action: str, actor: Optional[str], **detail) -> None:
    db.add(ContainerEvent(batch_id=batch_id, action=action, actor=actor,
                          detail={k: v for k, v in detail.items() if v not in (None, "", {}, [])} or None))


def _create(db: Session, manager_id: int, day: date, hour: int, kind: str, teams: list,
            at: datetime, actor: Optional[str] = None, note: Optional[str] = None) -> ContainerBatch:
    b = ContainerBatch(manager_id=manager_id, day=day, hour=hour, kind=kind, status="requested",
                       drafted_at=at, due_at=_due(hour_start(day, hour), at), note=note,
                       created_by=actor)
    db.add(b)
    db.flush()
    totals: dict = {}
    for meta, counts in teams:
        for k, n in counts.items():
            if n <= 0 or k not in KEYS:
                continue
            totals[k] = totals.get(k, 0) + n
            db.add(ContainerShare(batch_id=b.id, work_center=meta["work_center"],
                                  wc_group=meta.get("group") or "", rest=bool(meta.get("rest")),
                                  cell_id=meta.get("cell_id"), cell_code=meta.get("cell_code"),
                                  leader=meta.get("leader"), ctype=k, due=n))
    for k in KEYS:
        if totals.get(k):
            db.add(ContainerBatchLine(batch_id=b.id, ctype=k, need=totals[k]))
    _event(db, b.id, "drafted", actor, kind=kind, need=totals, note=note)
    return b


def _lock(db: Session) -> None:
    """One drafter at a time (the clock's tick and a board read may race)."""
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _LOCK_KEY})
    except Exception:
        db.rollback()


def draft_due(db: Session, at: Optional[datetime] = None) -> int:
    """Draft every batch whose time has come, for the enrolled units: the
    regular batch of each hour from H − 120 min until the hour ends, and a
    top-up where the live need of an hour has outgrown what its batches froze
    by `topup_min` or more of a container type. Returns how many were made."""
    at = at or now()
    cfg = settings(db)
    if not cfg["units"]:
        return 0
    _lock(db)
    made = 0
    for day in (at.date() - timedelta(days=1), at.date()):
        for mid in cfg["units"]:
            need = need_by_hour(unit_teams(db, mid, day))
            if not need:
                continue
            prior = db.query(ContainerBatch).filter(
                ContainerBatch.manager_id == mid, ContainerBatch.day == day,
                ContainerBatch.kind.in_(("regular", "topup"))).all()
            frozen: dict = {}
            if prior:
                hour_of = {b.id: b.hour for b in prior}
                for s in db.query(ContainerShare).filter(ContainerShare.batch_id.in_(list(hour_of))).all():
                    key = (hour_of[s.batch_id], team_key(s.work_center, s.wc_group, s.rest), s.ctype)
                    frozen[key] = frozen.get(key, 0) + s.due
            drafted_hours = {b.hour for b in prior}
            for hour, teams in sorted(need.items()):
                hs = hour_start(day, hour)
                if not (hs - timedelta(minutes=DRAFT_MIN) <= at < hs + timedelta(hours=1)):
                    continue
                if hour not in drafted_hours:
                    _create(db, mid, day, hour, "regular", teams, at)
                    made += 1
                    continue
                grown = []
                growth: dict = {}
                for meta, counts in teams:
                    tk = team_key(meta["work_center"], meta["group"], meta["rest"])
                    more = {k: n - frozen.get((hour, tk, k), 0) for k, n in counts.items()}
                    more = {k: n for k, n in more.items() if n > 0}
                    if more:
                        grown.append((meta, more))
                        for k, n in more.items():
                            growth[k] = growth.get(k, 0) + n
                big = {k for k, n in growth.items() if n >= cfg["topup_min"]}
                if big:
                    _create(db, mid, day, hour, "topup",
                            [(m, {k: n for k, n in c.items() if k in big}) for m, c in grown], at)
                    made += 1
    db.commit()
    return made


def tick() -> None:
    """The clock's pass (every TICK_MIN minutes). Never raises."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        n = draft_due(db)
        if n:
            logger.info("container flow: drafted %s batch(es)", n)
    except Exception:
        db.rollback()
        logger.warning("container flow tick failed", exc_info=True)
    finally:
        db.close()


def register_jobs() -> None:
    """Every TICK_MIN minutes (mirrored in passenger_wsgi.py). With no unit
    enrolled a tick is one settings read."""
    from app.scheduler import schedule_interval
    schedule_interval("container-flow", tick, minutes=TICK_MIN)


# ── the steps ───────────────────────────────────────────────────────────────

def _batch(db: Session, batch_id: int) -> ContainerBatch:
    b = db.query(ContainerBatch).filter(ContainerBatch.id == batch_id).with_for_update().first()
    if b is None:
        raise FlowError("gone")
    return b


def _lines(db: Session, batch_id: int) -> list:
    return db.query(ContainerBatchLine).filter(ContainerBatchLine.batch_id == batch_id).all()


def _shares(db: Session, batch_id: int) -> list:
    return db.query(ContainerShare).filter(ContainerShare.batch_id == batch_id).order_by(ContainerShare.id).all()


def _count(v) -> int:
    if isinstance(v, bool) or not isinstance(v, int) or v < 0 or v > 100000:
        raise FlowError("count")
    return v


def _why(reason, comment) -> tuple:
    """A lower number's reason, checked: one of REASONS, «other» with words."""
    comment = (comment or "").strip() or None
    if reason not in REASONS:
        raise FlowError("reason")
    if reason == "other" and not comment:
        raise FlowError("comment")
    return reason, comment


def issue(db: Session, batch_id: int, counts: Optional[dict], reason, comment, actor) -> ContainerBatch:
    """AXO hands the batch out: a count per container type, the frozen need
    where none is given. Fewer than the need of any type needs a reason."""
    b = _batch(db, batch_id)
    if b.status != "requested":
        raise FlowError("state")
    counts = counts or {}
    given = {}
    for ln in _lines(db, b.id):
        n = _count(counts.get(ln.ctype, ln.need))
        if n < ln.need:
            ln.issue_reason, ln.issue_comment = _why(reason, comment)
        else:
            ln.issue_reason = ln.issue_comment = None
        ln.issued = n
        given[ln.ctype] = n
    b.status, b.issued_at, b.issued_by = "issued", now(), actor
    _event(db, b.id, "issued", actor, counts=given, reason=reason, comment=comment)
    return b


def split(delivered: int, dues: list) -> list:
    """`delivered` containers between teams by their frozen `dues`: everybody
    whole when there are enough (a surplus stays with the batch), otherwise
    cut in proportion by LARGEST REMAINDER, so the parts add up to `delivered`
    exactly."""
    total = sum(dues)
    if total <= 0 or delivered >= total:
        return list(dues)
    quota = [delivered * d / total for d in dues]
    out = [int(q) for q in quota]
    left = delivered - sum(out)
    order = sorted(range(len(dues)), key=lambda i: (-(quota[i] - out[i]), i))
    for i in order[:left]:
        out[i] += 1
    return out


def _refresh(b: ContainerBatch, shares: list, actor, note=None) -> None:
    """The batch's status off its shares: disputed while any team's lower
    number is unsettled, closed once every team has answered."""
    if any(s.status == "disputed" for s in shares):
        b.status = "disputed"
    elif any(s.status == "pending" for s in shares):
        b.status = "delivered"
    else:
        b.status, b.closed_at, b.closed_by = "closed", now(), actor
        if note:
            b.close_note = note


def deliver(db: Session, batch_id: int, counts: Optional[dict], reason, comment, actor) -> ContainerBatch:
    """Logistics confirms the batch AT THE UNIT — this is the delivery, and
    what on-time is read from. A count may be corrected; fewer than AXO issued
    needs a reason. The split between the unit's teams is made here."""
    b = _batch(db, batch_id)
    if b.status != "issued":
        raise FlowError("state")
    counts = counts or {}
    got = {}
    lines = _lines(db, b.id)
    for ln in lines:
        n = _count(counts.get(ln.ctype, ln.issued or 0))
        if n < (ln.issued or 0):
            ln.deliver_reason, ln.deliver_comment = _why(reason, comment)
        ln.delivered = n
        got[ln.ctype] = n
    at = now()
    b.delivered_at, b.delivered_by, b.late = at, actor, at > b.due_at
    shares = _shares(db, b.id)
    for ln in lines:
        mine = [s for s in shares if s.ctype == ln.ctype]
        for s, n in zip(mine, split(ln.delivered, [s.due for s in mine])):
            s.sent = n
    _refresh(b, shares, actor)
    _event(db, b.id, "delivered", actor, counts=got, reason=reason, comment=comment, late=b.late)
    return b


def send_back(db: Session, batch_id: int, comment, actor) -> ContainerBatch:
    """Logistics returns an issued batch to AXO (wrong unit, wrong load). The
    deadline does not move."""
    b = _batch(db, batch_id)
    if b.status != "issued":
        raise FlowError("state")
    comment = (comment or "").strip()
    if not comment:
        raise FlowError("comment")
    for ln in _lines(db, b.id):
        ln.issued = ln.issue_reason = ln.issue_comment = None
    b.status, b.issued_at, b.issued_by = "requested", None, None
    b.returned = (b.returned or 0) + 1
    _event(db, b.id, "returned", actor, comment=comment)
    return b


def answer(db: Session, batch_id: int, team: str, mode: str, counts: Optional[dict],
           reason, comment, actor) -> ContainerBatch:
    """A team's leader answers its share: `all` (took what was sent), `actual`
    (a count per type) or `refuse`. Fewer than was sent needs a reason and
    opens a dispute."""
    b = _batch(db, batch_id)
    if b.status not in ("delivered", "disputed"):
        raise FlowError("state")
    shares = _shares(db, b.id)
    mine = [s for s in shares if team_key(s.work_center, s.wc_group, s.rest) == team and s.status == "pending"]
    if not mine or mode not in ("all", "actual", "refuse"):
        raise FlowError("state")
    counts = counts or {}
    at = now()
    took = {}
    for s in mine:
        sent = s.sent or 0
        n = sent if mode == "all" else 0 if mode == "refuse" else _count(counts.get(s.ctype, sent))
        if n > sent:
            raise FlowError("over")
        if n < sent:
            s.reason, s.comment = _why(reason, comment)
            s.status = "disputed"
        else:
            s.status = "accepted"
        s.accepted, s.answered_at, s.answered_by = n, at, actor
        took[s.ctype] = n
    _refresh(b, shares, actor)
    _event(db, b.id, "refused" if mode == "refuse" else "accepted", actor,
           team=team, counts=took, reason=reason, comment=comment)
    return b


def settle(db: Session, batch_id: int, note, actor) -> ContainerBatch:
    """AXO or an admin settles a dispute, with a note."""
    b = _batch(db, batch_id)
    if b.status != "disputed":
        raise FlowError("state")
    note = (note or "").strip()
    if not note:
        raise FlowError("note")
    shares = _shares(db, b.id)
    for s in shares:
        if s.status == "disputed":
            s.status = "settled"
    _refresh(b, shares, actor, note)
    _event(db, b.id, "settled", actor, note=note)
    return b


def force_close(db: Session, batch_id: int, note, actor) -> ContainerBatch:
    """An admin closes a stuck batch — the only way one closes without its
    steps — with a note."""
    b = _batch(db, batch_id)
    if b.status == "closed":
        raise FlowError("state")
    note = (note or "").strip()
    if not note:
        raise FlowError("note")
    was = b.status
    b.status, b.closed_at, b.closed_by, b.close_note, b.forced = "closed", now(), actor, note, True
    _event(db, b.id, "forced", actor, note=note, was=was)
    return b


# ── reading ─────────────────────────────────────────────────────────────────

def _iso(v) -> Optional[str]:
    return v.astimezone(TZ).isoformat(timespec="minutes") if v else None


def _serialize(b: ContainerBatch, lines: list, shares: list, units: dict, at: datetime) -> dict:
    u = units.get(b.manager_id)
    teams: dict = {}
    for s in shares:
        k = team_key(s.work_center, s.wc_group, s.rest)
        t = teams.setdefault(k, {"key": k, "work_center": s.work_center, "group": s.wc_group or "",
                                 "rest": bool(s.rest), "cell_id": s.cell_id, "cell_code": s.cell_code,
                                 "leader": s.leader, "status": "accepted", "due": {}, "sent": {},
                                 "accepted": {}, "reason": None, "comment": None,
                                 "answered_at": None, "answered_by": None})
        t["due"][s.ctype] = s.due
        if s.sent is not None:
            t["sent"][s.ctype] = s.sent
        if s.accepted is not None:
            t["accepted"][s.ctype] = s.accepted
        # the team's state is its least settled share's
        rank = {"pending": 0, "disputed": 1, "settled": 2, "accepted": 3}
        if rank.get(s.status, 3) < rank[t["status"]]:
            t["status"] = s.status
        if s.reason:
            t["reason"], t["comment"] = s.reason, s.comment
        if s.answered_at:
            t["answered_at"], t["answered_by"] = _iso(s.answered_at), s.answered_by
    order = {k: i for i, k in enumerate(KEYS)}
    return {
        "id": b.id, "manager_id": b.manager_id, "unit": getattr(u, "name", None),
        "shift": getattr(u, "shift", None), "day": b.day.isoformat(), "hour": b.hour,
        "kind": b.kind, "status": b.status, "drafted_at": _iso(b.drafted_at), "due_at": _iso(b.due_at),
        "issued_at": _iso(b.issued_at), "issued_by": b.issued_by,
        "delivered_at": _iso(b.delivered_at), "delivered_by": b.delivered_by,
        "closed_at": _iso(b.closed_at), "closed_by": b.closed_by, "close_note": b.close_note,
        "forced": bool(b.forced), "late": b.late, "returned": b.returned or 0, "note": b.note,
        "overdue": b.status in ("requested", "issued") and at > b.due_at,
        "lines": sorted(({"ctype": ln.ctype, "need": ln.need, "issued": ln.issued,
                          "delivered": ln.delivered, "issue_reason": ln.issue_reason,
                          "issue_comment": ln.issue_comment, "deliver_reason": ln.deliver_reason,
                          "deliver_comment": ln.deliver_comment} for ln in lines),
                        key=lambda x: order.get(x["ctype"], 9)),
        "teams": list(teams.values()),
    }


def _load(db: Session, batches: list) -> tuple:
    ids = [b.id for b in batches]
    lines: dict = {}
    shares: dict = {}
    if ids:
        for ln in db.query(ContainerBatchLine).filter(ContainerBatchLine.batch_id.in_(ids)).all():
            lines.setdefault(ln.batch_id, []).append(ln)
        for s in db.query(ContainerShare).filter(ContainerShare.batch_id.in_(ids)).order_by(ContainerShare.id).all():
            shares.setdefault(s.batch_id, []).append(s)
    mids = {b.manager_id for b in batches}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    return lines, shares, units


def board(db: Session, day: date) -> dict:
    """Every batch of one production day, with its lines and teams."""
    at = now()
    batches = db.query(ContainerBatch).filter(ContainerBatch.day == day).order_by(
        ContainerBatch.hour, ContainerBatch.manager_id, ContainerBatch.id).all()
    lines, shares, units = _load(db, batches)
    return {"day": day.isoformat(), "now": _iso(at), "keys": KEYS,
            "batches": [_serialize(b, lines.get(b.id, []), shares.get(b.id, []), units, at)
                        for b in batches]}


def one(db: Session, b: ContainerBatch) -> dict:
    lines, shares, units = _load(db, [b])
    return _serialize(b, lines.get(b.id, []), shares.get(b.id, []), units, now())


def history(db: Session, batch_id: int) -> list:
    return [{"at": _iso(e.at), "actor": e.actor, "action": e.action, "detail": e.detail or {}}
            for e in db.query(ContainerEvent).filter(ContainerEvent.batch_id == batch_id)
            .order_by(ContainerEvent.at, ContainerEvent.id).all()]


def report(db: Session, d_from: date, d_to: date) -> dict:
    """«Konteynerlar oqimi» for a period: per day × unit × container type the
    need → issued → delivered → accepted, and the three gaps with their owner —
    need − issued is AXO's, issued − delivered is Logistics', sent − accepted a
    dispute. A batch nobody issued counts its whole need against AXO once its
    deadline has passed. On-time is read from the DELIVERY."""
    at = now()
    batches = db.query(ContainerBatch).filter(
        ContainerBatch.day >= d_from, ContainerBatch.day <= d_to).order_by(
        ContainerBatch.day, ContainerBatch.manager_id, ContainerBatch.hour).all()
    lines, shares, units = _load(db, batches)
    rows: dict = {}
    summary = {"batches": 0, "regular": 0, "topup": 0, "manual": 0, "delivered": 0, "on_time": 0,
               "late": 0, "overdue": 0, "issued": 0, "issued_on_time": 0, "forced": 0, "open": 0}
    for b in batches:
        summary["batches"] += 1
        summary[b.kind] = summary.get(b.kind, 0) + 1
        overdue = b.status in ("requested", "issued") and at > b.due_at
        if b.forced:
            summary["forced"] += 1
        if b.status != "closed":
            summary["open"] += 1
        if b.delivered_at is not None:
            summary["delivered"] += 1
            summary["late" if b.late else "on_time"] += 1
        elif overdue or (b.forced and b.delivered_at is None):
            summary["overdue"] += 1
        if b.issued_at is not None:
            summary["issued"] += 1
            if b.issued_at <= b.due_at:
                summary["issued_on_time"] += 1
        acc: dict = {}
        sent: dict = {}
        for s in shares.get(b.id, []):
            if s.accepted is not None:
                acc[s.ctype] = acc.get(s.ctype, 0) + s.accepted
                sent[s.ctype] = sent.get(s.ctype, 0) + (s.sent or 0)
        for ln in lines.get(b.id, []):
            u = units.get(b.manager_id)
            r = rows.setdefault((b.day, b.manager_id, ln.ctype), {
                "day": b.day.isoformat(), "manager_id": b.manager_id,
                "unit": getattr(u, "name", None), "ctype": ln.ctype, "need": 0, "issued": 0,
                "delivered": 0, "accepted": 0, "gap_axo": 0, "gap_logistics": 0,
                "gap_dispute": 0, "surplus": 0})
            r["need"] += ln.need
            r["issued"] += ln.issued or 0
            r["delivered"] += ln.delivered or 0
            r["accepted"] += acc.get(ln.ctype, 0)
            if ln.issued is not None:
                r["gap_axo"] += max(0, ln.need - ln.issued)
                r["surplus"] += max(0, ln.issued - ln.need)
            elif overdue or b.status == "closed":
                r["gap_axo"] += ln.need
            if ln.delivered is not None:
                r["gap_logistics"] += max(0, (ln.issued or 0) - ln.delivered)
            r["gap_dispute"] += max(0, sent.get(ln.ctype, 0) - acc.get(ln.ctype, 0))
    judged = summary["delivered"] + summary["overdue"]
    summary["on_time_pct"] = round(100 * summary["on_time"] / judged) if judged else None
    summary["issued_on_time_pct"] = (round(100 * summary["issued_on_time"] / (summary["issued"] + summary["overdue"]))
                                     if summary["issued"] + summary["overdue"] else None)
    out = sorted(rows.values(), key=lambda r: (r["day"], r["unit"] or "", KEYS.index(r["ctype"]) if r["ctype"] in KEYS else 9))
    totals = {k: sum(r[k] for r in out) for k in
              ("need", "issued", "delivered", "accepted", "gap_axo", "gap_logistics", "gap_dispute", "surplus")}
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "rows": out,
            "summary": summary, "totals": totals}


def readiness(db: Session, day: date) -> list:
    """Per unit with a «Zagruzka fayli»: how much of the day's plan the hours
    can see — the planned lines, those with a container capacity, and those
    with an hour (a capacity AND a labour standard, in a team with people).
    A unit with gaps runs on manual requests until its catalog is filled."""
    from fastapi import HTTPException
    from app.routers import production
    out = []
    configured = production._configured_manager_ids(db)
    for m in db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all():
        if m.id not in configured:
            continue
        try:
            dash = production._build_dashboard(db, m.id, day)
        except HTTPException:
            continue
        planned = [r for r in dash.get("rows") or [] if hourly_containers._num(r.get("plan_qty")) > 0]
        if not planned:
            continue
        with_cap = [r for r in planned if any(hourly_containers._num(r.get(f)) > 0 for f in hourly_containers.FIELDS)]
        timed = sum(sum(sum(c.values()) for c in t["hours"].values()) for t in hourly_containers.unit_teams(dash))
        untimed = sum(sum(t["untimed"].values()) for t in hourly_containers.unit_teams(dash))
        out.append({"id": m.id, "name": m.name, "shift": m.shift, "lines": len(planned),
                    "with_cap": len(with_cap), "timed": timed, "untimed": untimed})
    return out


# ── requests: AXO → a logistics person → brigadirs ──────────────────────────
# 2026-11-14, the operator: AXO «should not choose the brigadirs, she has to
# choose Nuriddin aka, he is the guy from logistics, and Nuriddin aka has to
# choose the brigadirs». A request names the counts, the hour and ONE logistics
# person; that person splits it across brigadirs, which closes it.

LOGISTICS_CAP = "page.view.container-logistics"


def profile_name(db: Session, key: str) -> Optional[str]:
    role, _, ref = (key or "").partition(":")
    if not ref.isdigit():
        return None
    if role == "supervisor":
        m = db.get(Manager, int(ref))
        return m.name if m else None
    if role == "admin":
        from app.models import Admin
        a = db.query(Admin).filter_by(profile_id=int(ref)).first()
        ref = str(a.profile_id) if a else ref
    p = db.get(RoleProfile, int(ref))
    return p.name if p else None


def logistics_people(db: Session) -> list:
    """Who a request can be addressed to: every PROFILE holding a personal
    grant of the Logistics page (`page.view.container-logistics`; one row per
    profile and capability, so a deny replaces the grant). Opening the page to a whole role on the Access tab does not make
    its members addressees — a request goes to a person."""
    rows = db.query(ProfilePermission).filter(ProfilePermission.capability == LOGISTICS_CAP,
                                              ProfilePermission.mode == "grant").all()
    keys = sorted({r.profile_key for r in rows})
    out = [{"key": k, "name": profile_name(db, k) or k} for k in keys]
    return sorted(out, key=lambda x: x["name"])


def _clean_counts(counts: dict) -> dict:
    return {k: _count(v) for k, v in (counts or {}).items() if k in KEYS and v}


def create_request(db: Session, day: date, hour: int, logistics_key: str, counts: dict,
                   note, actor, actor_key) -> ContainerRequest:
    if not (0 <= int(hour) <= 47):
        raise FlowError("hour")
    people = {p["key"]: p["name"] for p in logistics_people(db)}
    if logistics_key not in people:
        raise FlowError("logistics")
    c = _clean_counts(counts)
    if not c:
        raise FlowError("count")
    at = now()
    r = ContainerRequest(day=day, hour=int(hour), lines=c, note=(note or "").strip() or None,
                         logistics_key=logistics_key, logistics_name=people[logistics_key],
                         status="requested", due_at=_due(hour_start(day, int(hour)), at),
                         created_at=at, created_by=actor, created_key=actor_key)
    db.add(r)
    db.flush()
    return r


def _request(db: Session, request_id: int) -> ContainerRequest:
    r = db.query(ContainerRequest).filter(ContainerRequest.id == request_id).with_for_update().first()
    if r is None:
        raise FlowError("gone")
    return r


def assign_request(db: Session, request_id: int, parts: list, reason, comment, actor,
                   actor_key, is_admin: bool) -> ContainerRequest:
    """The logistics person splits the request across brigadirs: `parts` is
    [{manager_id, counts}]. No type may go over what was asked; fewer needs a
    reason. Only the addressee (or an admin) may do it, once."""
    r = _request(db, request_id)
    if r.status != "requested":
        raise FlowError("state")
    if not is_admin and actor_key != r.logistics_key:
        raise FlowError("not_yours")
    given: dict = {}
    clean = []
    for p in parts or []:
        mid = int(p.get("manager_id") or 0)
        c = _clean_counts(p.get("counts"))
        if not c:
            continue
        if db.get(Manager, mid) is None:
            raise FlowError("unit")
        for k, n in c.items():
            if k not in r.lines:
                raise FlowError("type")
            given[k] = given.get(k, 0) + n
        clean.append((mid, c))
    if not clean:
        raise FlowError("count")
    if any(given.get(k, 0) > n for k, n in r.lines.items()):
        raise FlowError("over")
    if any(given.get(k, 0) < n for k, n in r.lines.items()):
        r.short_reason, r.short_comment = _why(reason, comment)
    merged: dict = {}
    for mid, c in clean:
        for k, n in c.items():
            merged[(mid, k)] = merged.get((mid, k), 0) + n
    for (mid, k), n in merged.items():
        db.add(ContainerRequestPart(request_id=r.id, manager_id=mid, ctype=k, count=n))
    at = now()
    r.status, r.assigned_at, r.assigned_by, r.late = "assigned", at, actor, at > r.due_at
    return r


def cancel_request(db: Session, request_id: int, note, actor) -> ContainerRequest:
    r = _request(db, request_id)
    if r.status != "requested":
        raise FlowError("state")
    note = (note or "").strip()
    if not note:
        raise FlowError("note")
    r.status, r.cancelled_at, r.cancelled_by, r.cancel_note = "cancelled", now(), actor, note
    return r


def requests_of(db: Session, day: date, logistics_key: Optional[str] = None) -> list:
    """The day's requests (only those addressed to `logistics_key` when given),
    with their parts and each part's brigadir."""
    at = now()
    q = db.query(ContainerRequest).filter(ContainerRequest.day == day)
    if logistics_key is not None:
        q = q.filter(ContainerRequest.logistics_key == logistics_key)
    rows = q.order_by(ContainerRequest.hour, ContainerRequest.id).all()
    parts: dict = {}
    if rows:
        for p in db.query(ContainerRequestPart).filter(
                ContainerRequestPart.request_id.in_([r.id for r in rows])).order_by(ContainerRequestPart.id).all():
            parts.setdefault(p.request_id, []).append(p)
    mids = {p.manager_id for ps in parts.values() for p in ps}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    out = []
    for r in rows:
        by_unit: dict = {}
        for p in parts.get(r.id, []):
            u = by_unit.setdefault(p.manager_id, {"manager_id": p.manager_id,
                                                  "unit": getattr(units.get(p.manager_id), "name", None),
                                                  "counts": {}})
            u["counts"][p.ctype] = p.count
        out.append({
            "id": r.id, "day": r.day.isoformat(), "hour": r.hour,
            "lines": {k: r.lines[k] for k in KEYS if k in (r.lines or {})}, "note": r.note,
            "logistics_key": r.logistics_key, "logistics_name": r.logistics_name,
            "status": r.status, "due_at": _iso(r.due_at), "created_at": _iso(r.created_at),
            "created_by": r.created_by, "assigned_at": _iso(r.assigned_at), "assigned_by": r.assigned_by,
            "late": r.late, "overdue": r.status == "requested" and at > r.due_at,
            "short_reason": r.short_reason, "short_comment": r.short_comment,
            "cancelled_at": _iso(r.cancelled_at), "cancelled_by": r.cancelled_by, "cancel_note": r.cancel_note,
            "parts": list(by_unit.values()),
        })
    return out
