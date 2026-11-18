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
                        ContainerExtra, ContainerRequest, ContainerRequestPart, ContainerShare,
                        ContainerStockMove, Manager, ProfilePermission, RoleProfile)
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
# Telegram to the addressed logistics person on a new / cancelled request —
# OFF until an admin switches it on in «Sozlamalar» (nothing on this page
# messages anybody before the operator says so).
_NOTIFY_KEY = "container_flow.notify_logistics"
# …and to each brigadir a request was split to (2026-11-15) — «Hammasi keldi»
# confirms from Telegram, «Boshqa son» opens the card. Its own switch.
_NOTIFY_BRIG_KEY = "container_flow.notify_brigadirs"
# Alerts (2026-11-17): to the request's AXO author — a short split, a short
# receipt, a request past its deadline — ON unless switched off (they are
# answers to her own requests); and to the shift managers — a request past its
# deadline, a brigadir still unconfirmed after the reminder — OFF until an
# admin switches it on (nobody has told them yet).
_NOTIFY_AXO_KEY = "container_flow.notify_axo"
_NOTIFY_SM_KEY = "container_flow.notify_managers"
# A brigadir's EXTRA request, to AXO (2026-11-18) — ON unless switched off.
# Nothing reaches AXO before brigadirs can ask: an admin's own test ask is
# never sent (the router decides), and the page key `container-extra` is
# admin-only until the operator opens it.
_NOTIFY_EXTRA_KEY = "container_flow.notify_extra"
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
        AppSetting.key.in_([_UNITS_KEY, _TOPUP_KEY, _NOTIFY_KEY, _NOTIFY_BRIG_KEY,
                            _NOTIFY_AXO_KEY, _NOTIFY_SM_KEY, _NOTIFY_EXTRA_KEY])).all()}
    try:
        units = [int(x) for x in json.loads(rows.get(_UNITS_KEY) or "[]")]
    except (ValueError, TypeError):
        units = []
    try:
        topup = max(1, int(rows.get(_TOPUP_KEY) or TOPUP_MIN_DEFAULT))
    except (ValueError, TypeError):
        topup = TOPUP_MIN_DEFAULT
    return {"units": units, "topup_min": topup, "notify": rows.get(_NOTIFY_KEY) == "1",
            "notify_brigadirs": rows.get(_NOTIFY_BRIG_KEY) == "1",
            "notify_axo": rows.get(_NOTIFY_AXO_KEY, "1") == "1",
            "notify_managers": rows.get(_NOTIFY_SM_KEY) == "1",
            "notify_extra": rows.get(_NOTIFY_EXTRA_KEY, "1") == "1"}


def save_settings(db: Session, units: list, topup_min: int, notify: Optional[bool] = None,
                  notify_brigadirs: Optional[bool] = None, notify_axo: Optional[bool] = None,
                  notify_managers: Optional[bool] = None, notify_extra: Optional[bool] = None) -> dict:
    """A switch given as None stays as it is (a tab on an older bundle saves
    without it)."""
    vals = {_UNITS_KEY: json.dumps(sorted({int(x) for x in units})),
            _TOPUP_KEY: str(max(1, int(topup_min)))}
    if notify is not None:
        vals[_NOTIFY_KEY] = "1" if notify else "0"
    if notify_brigadirs is not None:
        vals[_NOTIFY_BRIG_KEY] = "1" if notify_brigadirs else "0"
    if notify_axo is not None:
        vals[_NOTIFY_AXO_KEY] = "1" if notify_axo else "0"
    if notify_managers is not None:
        vals[_NOTIFY_SM_KEY] = "1" if notify_managers else "0"
    if notify_extra is not None:
        vals[_NOTIFY_EXTRA_KEY] = "1" if notify_extra else "0"
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
    """The clock's pass (every TICK_MIN minutes): drafts, the brigadirs'
    reminder, the overdue alert and the escalation — each on its own, so one
    failing never stops the rest. Never raises."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        for name, fn in (("draft", draft_due), ("reminder", remind_unconfirmed),
                         ("overdue alert", alert_overdue), ("escalation", escalate_unconfirmed)):
            try:
                n = fn(db)
                if n:
                    logger.info("container flow: %s — %s", name, n)
            except Exception:
                db.rollback()
                logger.warning("container flow %s failed", name, exc_info=True)
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


def share_out(total: int, weights: list) -> list:
    """`total` across `weights` in proportion, by LARGEST REMAINDER — unlike
    `split` it scales UP as well as down, so the parts always add up to
    `total` exactly (ties go to the earlier weight)."""
    w = sum(weights)
    if total <= 0 or w <= 0:
        return [0] * len(weights)
    quota = [total * x / w for x in weights]
    out = [int(q) for q in quota]
    left = total - sum(out)
    order = sorted(range(len(weights)), key=lambda i: (-(quota[i] - out[i]), i))
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
    extra = extra_unit_of(db, r.id)
    if extra is not None:
        # a brigadir's EXTRA, approved by AXO: to that unit only, and past its
        # limit by exactly what AXO approved (the request's own counts)
        if any(mid != extra for mid, _c in clean):
            raise FlowError("extra_unit")
    else:
        # no brigadir past their limit for the hour (`unit_limits`)
        lim = unit_limits(db, r.day, r.hour, r.id)
        per_unit: dict = {}
        for mid, c in clean:
            for k, n in c.items():
                per_unit.setdefault(mid, {})[k] = per_unit.get(mid, {}).get(k, 0) + n
        for mid, c in per_unit.items():
            left = (lim.get(mid) or {}).get("left", {})
            if any(n > left.get(k, 0) for k, n in c.items()):
                raise FlowError("limit")
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
    """AXO / an admin withdraws a request — while it waits, or after it was
    split (2026-11-15, the operator: «open an option to cancel the request
    after all») as long as no brigadir has confirmed containers arriving:
    what reached a line is a fact a cancel would erase from the report."""
    r = _request(db, request_id)
    if r.status not in ("requested", "assigned"):
        raise FlowError("state")
    if r.status == "assigned" and db.query(ContainerRequestPart).filter(
            ContainerRequestPart.request_id == r.id, ContainerRequestPart.received.isnot(None)).first():
        raise FlowError("received")
    note = (note or "").strip()
    if not note:
        raise FlowError("note")
    r.status, r.cancelled_at, r.cancelled_by, r.cancel_note = "cancelled", now(), actor, note
    return r


def delete_request(db: Session, request_id: int) -> ContainerRequest:
    """An ADMIN removes a request outright, in any state (2026-11-15, the
    operator: «put access for admins to delete the requests») — a test, a
    duplicate, a mistake no cancel may touch (a confirmed split). Its parts go
    with it, and it leaves «Hisobot» and «Tahlil» as if it never existed;
    the action register keeps what it was. A card already in Telegram then
    answers «So'rov topilmadi». Nobody is told."""
    r = _request(db, request_id)
    db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == r.id).delete(
        synchronize_session=False)
    db.delete(r)
    return r


def mark_seen(db: Session, request_id: int, actor_key) -> bool:
    """The addressee opened the request: it stops looking new. Only the
    person it is addressed to clears it — an admin or AXO opening it does
    not. Returns whether anything changed."""
    r = db.get(ContainerRequest, request_id)
    if r is None or not actor_key or r.logistics_key != actor_key or r.seen_at is not None:
        return False
    r.seen_at = now()
    return True


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
    extras = {e.request_id: e for e in db.query(ContainerExtra).filter(
        ContainerExtra.request_id.in_([r.id for r in rows])).all()} if rows else {}
    mids = {p.manager_id for ps in parts.values() for p in ps} | {e.manager_id for e in extras.values()}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    out = []
    for r in rows:
        by_unit: dict = {}
        for p in parts.get(r.id, []):
            u = by_unit.setdefault(p.manager_id, {"manager_id": p.manager_id,
                                                  "unit": getattr(units.get(p.manager_id), "name", None),
                                                  "shift": getattr(units.get(p.manager_id), "shift", None),
                                                  "counts": {}, "received": None, "received_at": None,
                                                  "received_by": None, "received_reason": None,
                                                  "received_comment": None, "reminded_at": None})
            u["counts"][p.ctype] = p.count
            if p.reminded_at is not None:
                u["reminded_at"] = _iso(p.reminded_at)
            if p.received is not None:
                u["received"] = {**(u["received"] or {}), p.ctype: p.received}
                u["received_at"], u["received_by"] = _iso(p.received_at), p.received_by
                u["received_reason"], u["received_comment"] = p.received_reason, p.received_comment
        out.append({
            "id": r.id, "day": r.day.isoformat(), "hour": r.hour,
            "lines": {k: r.lines[k] for k in KEYS if k in (r.lines or {})}, "note": r.note,
            "logistics_key": r.logistics_key, "logistics_name": r.logistics_name,
            "status": r.status, "due_at": _iso(r.due_at), "created_at": _iso(r.created_at),
            "created_by": r.created_by, "assigned_at": _iso(r.assigned_at), "assigned_by": r.assigned_by,
            "late": r.late, "overdue": r.status == "requested" and at > r.due_at,
            "short_reason": r.short_reason, "short_comment": r.short_comment,
            "cancelled_at": _iso(r.cancelled_at), "cancelled_by": r.cancelled_by, "cancel_note": r.cancel_note,
            "seen_at": _iso(r.seen_at), "parts": list(by_unit.values()),
            "receipt": _receipt(list(by_unit.values())) if r.status == "assigned" else None,
            "extra": None if r.id not in extras else {
                "id": extras[r.id].id, "manager_id": extras[r.id].manager_id,
                "unit": getattr(units.get(extras[r.id].manager_id), "name", None),
                "lines": extras[r.id].lines or {}, "reason": extras[r.id].reason,
                "comment": extras[r.id].comment, "asked_by": extras[r.id].asked_by},
        })
    return out


def _receipt(parts: list) -> dict:
    """How far the brigadirs confirmed a split request: how many of its units
    answered, and whether any of them got fewer than sent."""
    done = [p for p in parts if p["received"] is not None]
    short = any(p["received"].get(k, 0) < n for p in done for k, n in p["counts"].items())
    return {"units": len(parts), "confirmed": len(done), "short": short}


def receive(db: Session, request_id: int, manager_id: int, counts: Optional[dict], reason, comment,
            actor) -> ContainerRequest:
    """A brigadir confirms what reached the line from a split request: every
    type as sent when `counts` is None, else the counts given. More than was
    sent is refused (`over`); fewer needs a reason. Once per unit."""
    r = _request(db, request_id)
    if r.status != "assigned":
        raise FlowError("state")
    parts = db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == r.id,
                                                  ContainerRequestPart.manager_id == int(manager_id)).all()
    if not parts:
        raise FlowError("unit")
    if any(p.received is not None for p in parts):
        raise FlowError("state")
    counts = counts or {}
    got = {}
    for p in parts:
        n = _count(counts.get(p.ctype, p.count))
        if n > p.count:
            raise FlowError("over")
        got[p.ctype] = n
    why = (None, None)
    if any(got[p.ctype] < p.count for p in parts):
        why = _why(reason, comment)
    at = now()
    for p in parts:
        p.received, p.received_at, p.received_by = got[p.ctype], at, actor
        p.received_reason, p.received_comment = why
    return r


def receipts_of(db: Session, day: date, manager_id: Optional[int] = None) -> list:
    """The day's split requests as each brigadir sees them: one row per
    request × unit (only `manager_id`'s when given), newest hour last."""
    out = []
    for r in requests_of(db, day):
        if r["status"] != "assigned":
            continue
        for p in r["parts"]:
            if manager_id is not None and p["manager_id"] != manager_id:
                continue
            out.append({"request_id": r["id"], "day": r["day"], "hour": r["hour"],
                        "due_at": r["due_at"], "assigned_at": r["assigned_at"],
                        "from": r["logistics_name"], **p})
    return out


def requests_report(db: Session, d_from: date, d_to: date) -> dict:
    """The requests side of «Hisobot»: how many, how fast the logistics
    person opened and split them, on time against the deadline, short splits
    by reason, and what the brigadirs confirmed against what was sent."""
    at = now()
    rows = db.query(ContainerRequest).filter(ContainerRequest.day >= d_from,
                                             ContainerRequest.day <= d_to).all()
    parts: dict = {}
    if rows:
        for p in db.query(ContainerRequestPart).filter(
                ContainerRequestPart.request_id.in_([r.id for r in rows])).all():
            parts.setdefault(p.request_id, []).append(p)
    s = {"requests": 0, "cancelled": 0, "waiting": 0, "overdue": 0, "assigned": 0, "on_time": 0,
         "late": 0, "short": 0, "asked": 0, "given": 0, "units": 0, "confirmed": 0,
         "sent_confirmed": 0, "received": 0}
    reasons = {k: 0 for k in REASONS}
    seen_min, assign_min = [], []
    days: dict = {}
    people: dict = {}
    for r in rows:
        d = days.setdefault(r.day, {"day": r.day.isoformat(), "requests": 0, "asked": 0, "given": 0,
                                    "received": 0, "sent_confirmed": 0, "late": 0, "overdue": 0, "short": 0})
        s["requests"] += 1
        d["requests"] += 1
        if r.status == "cancelled":
            s["cancelled"] += 1
            continue
        asked = sum((r.lines or {}).values())
        s["asked"] += asked
        d["asked"] += asked
        who = people.setdefault(r.logistics_key, {"key": r.logistics_key, "name": r.logistics_name,
                                                  "requests": 0, "assigned": 0, "on_time": 0,
                                                  "overdue": 0, "_min": []})
        who["requests"] += 1
        if r.seen_at is not None:
            seen_min.append((r.seen_at - r.created_at).total_seconds() / 60)
        if r.status == "requested":
            if at > r.due_at:
                s["overdue"] += 1
                d["overdue"] += 1
                who["overdue"] += 1
            else:
                s["waiting"] += 1
            continue
        s["assigned"] += 1
        who["assigned"] += 1
        m = (r.assigned_at - r.created_at).total_seconds() / 60
        assign_min.append(m)
        who["_min"].append(m)
        if r.late:
            s["late"] += 1
            d["late"] += 1
        else:
            s["on_time"] += 1
            who["on_time"] += 1
        if r.short_reason:
            s["short"] += 1
            d["short"] += 1
            reasons[r.short_reason] = reasons.get(r.short_reason, 0) + 1
        by_unit: dict = {}
        for p in parts.get(r.id, []):
            s["given"] += p.count
            d["given"] += p.count
            by_unit.setdefault(p.manager_id, []).append(p)
        for ps in by_unit.values():
            s["units"] += 1
            if all(p.received is not None for p in ps):
                s["confirmed"] += 1
                for p in ps:
                    s["sent_confirmed"] += p.count
                    s["received"] += p.received
                    d["sent_confirmed"] += p.count
                    d["received"] += p.received
    judged = s["assigned"] + s["overdue"]
    s["on_time_pct"] = round(100 * s["on_time"] / judged) if judged else None
    s["avg_seen_min"] = round(sum(seen_min) / len(seen_min)) if seen_min else None
    s["avg_assign_min"] = round(sum(assign_min) / len(assign_min)) if assign_min else None
    s["missing"] = s["sent_confirmed"] - s["received"]
    out_people = []
    for p in people.values():
        mins = p.pop("_min")
        j = p["assigned"] + p["overdue"]
        p["on_time_pct"] = round(100 * p["on_time"] / j) if j else None
        p["avg_assign_min"] = round(sum(mins) / len(mins)) if mins else None
        out_people.append(p)
    return {"summary": s, "reasons": reasons,
            "days": [days[k] for k in sorted(days)],
            "people": sorted(out_people, key=lambda p: p["name"] or "")}


def day_need(db: Session, d_from: date, d_to: date) -> dict:
    """{(day, manager_id): {ctype: n}} — what each brigadir's unit NEEDS for a
    day, per container type: the «Konteynerlar» page's own per-brigadir figure
    (`/api/shift-report/containers` `by_unit` — `pp_containers.count` over every
    catalog line's plan, through `zagruzka_source.line_facts`), for every
    non-archived unit, the whole period in one read. The day's total, not only
    the part the hours can place."""
    from app.services import pp_containers, zagruzka_source
    keys = pp_containers.keys()
    ids = [mid for (mid,) in db.query(Manager.id).filter(Manager.archived.is_(False)).all()]
    out: dict = {}
    if not ids:
        return out

    def emit(mid, line, wc, qkey, lk, d, qp, qa, pv, av):
        if line is None or not qp:
            return
        day = d if isinstance(d, date) else date.fromisoformat(str(d)[:10])
        for col, k in zip(pp_containers.CONTAINERS, keys):
            n = pp_containers.count(qp, getattr(line, "uom", None), getattr(line, col, None))
            if n:
                u = out.setdefault((day, mid), {})
                u[k] = u.get(k, 0) + n

    zagruzka_source.line_facts(db, ids, d_from, d_to, emit)
    return out


def need_vs_got(db: Session, d_from: date, d_to: date, need: Optional[dict] = None) -> list:
    """«Kerak va olingan» (2026-11-17, the operator: «a table — for a day, how
    many they have to get and how many they actually got»): one row per
    brigadir per day — what the day's plan needs (`day_need`), what logistics
    split to them (requests not cancelled), and what they CONFIRMED receiving
    on «Qabul»; `unconfirmed` is what was split and not yet confirmed, so a row
    still waiting is never read as a shortfall. Every unit that needed or got
    anything that day; per type under `types`."""
    need = day_need(db, d_from, d_to) if need is None else need
    rows: dict = {}

    def row(day, mid):
        return rows.setdefault((day, mid), {"day": day.isoformat(), "manager_id": mid,
                                            "need": 0, "given": 0, "received": 0, "unconfirmed": 0,
                                            "types": {}})

    def typ(r, k):
        return r["types"].setdefault(k, {"need": 0, "given": 0, "received": 0})

    for (day, mid), counts in need.items():
        r = row(day, mid)
        for k, n in counts.items():
            r["need"] += n
            typ(r, k)["need"] += n
    q = db.query(ContainerRequest.day, ContainerRequestPart).join(
        ContainerRequest, ContainerRequest.id == ContainerRequestPart.request_id).filter(
        ContainerRequest.day >= d_from, ContainerRequest.day <= d_to,
        ContainerRequest.status == "assigned")
    for day, p in q.all():
        r = row(day, p.manager_id)
        r["given"] += p.count
        typ(r, p.ctype)["given"] += p.count
        if p.received is None:
            r["unconfirmed"] += p.count
        else:
            r["received"] += p.received
            typ(r, p.ctype)["received"] += p.received
    mids = {mid for (_, mid) in rows}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    out = []
    for (day, mid), r in rows.items():
        m = units.get(mid)
        r["unit"], r["shift"] = getattr(m, "name", None), getattr(m, "shift", None)
        r["diff"] = r["received"] - r["need"]
        r["pct"] = round(100 * r["received"] / r["need"]) if r["need"] else None
        out.append(r)
    out.sort(key=lambda r: (r["day"], -r["need"], r["unit"] or ""), reverse=False)
    out.sort(key=lambda r: r["day"], reverse=True)     # newest day first, the biggest need first within it
    return out


def analytics(db: Session, d_from: date, d_to: date) -> dict:
    """«Tahlil» (2026-11-15, the operator: «add more analytics with graphs»):
    the requests of a period cut the ways a chart needs — per day (the trend),
    per production hour (the peak), per container type, per brigadir (given →
    received, how fast they confirm, reminders), and the reasons. Everything
    `requests_report` answers rides along (`summary`, `reasons`, `people`), so
    the cards above the charts and the report's own agree by construction.
    Cancelled requests count nowhere but in `summary.cancelled`."""
    base = requests_report(db, d_from, d_to)
    rows = db.query(ContainerRequest).filter(ContainerRequest.day >= d_from, ContainerRequest.day <= d_to,
                                             ContainerRequest.status != "cancelled").all()
    parts: dict = {}
    if rows:
        for p in db.query(ContainerRequestPart).filter(
                ContainerRequestPart.request_id.in_([r.id for r in rows])).all():
            parts.setdefault(p.request_id, []).append(p)
    mids = {p.manager_id for ps in parts.values() for p in ps}
    names = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    hours: dict = {}
    types = {k: {"ctype": k, "asked": 0, "given": 0, "received": 0} for k in KEYS}
    units: dict = {}
    receipt_reasons = {k: 0 for k in REASONS}
    day_x: dict = {}
    confirm_min: list = []
    reminded = 0
    for r in rows:
        h = hours.setdefault(r.hour, {"hour": r.hour, "requests": 0, "asked": 0, "given": 0})
        h["requests"] += 1
        for k, n in (r.lines or {}).items():
            h["asked"] += n
            if k in types:
                types[k]["asked"] += n
        dx = day_x.setdefault(r.day, {"assigned": 0, "on_time": 0, "_assign": [], "_seen": []})
        if r.seen_at is not None:
            dx["_seen"].append((r.seen_at - r.created_at).total_seconds() / 60)
        if r.status != "assigned":
            continue
        dx["assigned"] += 1
        dx["on_time"] += 0 if r.late else 1
        dx["_assign"].append((r.assigned_at - r.created_at).total_seconds() / 60)
        by_unit: dict = {}
        for p in parts.get(r.id, []):
            h["given"] += p.count
            if p.ctype in types:
                types[p.ctype]["given"] += p.count
            by_unit.setdefault(p.manager_id, []).append(p)
        for mid, ps in by_unit.items():
            m = names.get(mid)
            u = units.setdefault(mid, {"manager_id": mid, "unit": getattr(m, "name", None),
                                       "shift": getattr(m, "shift", None), "splits": 0, "given": 0,
                                       "confirmed": 0, "sent_confirmed": 0, "received": 0,
                                       "missing": 0, "reminded": 0, "_min": []})
            u["splits"] += 1
            u["given"] += sum(p.count for p in ps)
            if any(p.reminded_at is not None for p in ps):
                u["reminded"] += 1
                reminded += 1
            if all(p.received is not None for p in ps):
                sent, got = sum(p.count for p in ps), sum(p.received for p in ps)
                u["confirmed"] += 1
                u["sent_confirmed"] += sent
                u["received"] += got
                u["missing"] += sent - got
                for p in ps:
                    if p.ctype in types:
                        types[p.ctype]["received"] += p.received
                why = next((p.received_reason for p in ps if p.received_reason), None)
                if why:
                    receipt_reasons[why] = receipt_reasons.get(why, 0) + 1
                took = (max(p.received_at for p in ps) - r.assigned_at).total_seconds() / 60
                u["_min"].append(took)
                confirm_min.append(took)
    avg = lambda xs: round(sum(xs) / len(xs)) if xs else None      # noqa: E731
    days = []
    for d in base["days"]:
        dx = day_x.get(date.fromisoformat(d["day"]), {"assigned": 0, "on_time": 0, "_assign": [], "_seen": []})
        judged = dx["assigned"] + d["overdue"]
        days.append({**d, "assigned": dx["assigned"], "on_time": dx["on_time"],
                     "on_time_pct": round(100 * dx["on_time"] / judged) if judged else None,
                     "avg_assign_min": avg(dx["_assign"]), "avg_seen_min": avg(dx["_seen"])})
    out_units = []
    for u in units.values():
        mins = u.pop("_min")
        u["avg_confirm_min"] = avg(mins)
        u["confirm_pct"] = round(100 * u["confirmed"] / u["splits"]) if u["splits"] else None
        out_units.append(u)
    s = dict(base["summary"])
    s["avg_confirm_min"] = avg(confirm_min)
    s["reminded"] = reminded
    s["confirm_pct"] = round(100 * s["confirmed"] / s["units"]) if s["units"] else None
    s["received_pct"] = round(100 * s["received"] / s["sent_confirmed"]) if s["sent_confirmed"] else None
    try:
        nvg = need_vs_got(db, d_from, d_to)
    except Exception:
        logger.warning("container-flow: need vs got failed", exc_info=True)
        db.rollback()
        nvg = None      # the table says it could not be read; the rest of «Tahlil» stands
    try:
        extras = extras_report(db, d_from, d_to)
    except Exception:
        logger.warning("container-flow: extras report failed", exc_info=True)
        db.rollback()
        extras = None
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "summary": s, "days": days,
            "need_vs_got": nvg, "extras": extras,
            "hours": [hours[h] for h in sorted(hours)],
            "types": [types[k] for k in KEYS if types[k]["asked"] or types[k]["given"]],
            "units": sorted(out_units, key=lambda u: (-u["given"], u["unit"] or "")),
            "reasons": base["reasons"], "receipt_reasons": receipt_reasons, "people": base["people"]}


# ── Telegram to the addressee (behind the «Sozlamalar» switch) ──────────────
_CT_NAMES = {
    "uz": {"yellow": "To'rtburchak", "round": "Dumaloq", "grey": "Kulrang", "bucket": "Chelak", "box": "Yashik"},
    "uz_cyrl": {"yellow": "Тўртбурчак", "round": "Думалоқ", "grey": "Кулранг", "bucket": "Челак", "box": "Яшик"},
    "ru": {"yellow": "Прямоугольный", "round": "Круглый", "grey": "Серый", "bucket": "Челак", "box": "Ящик"},
    "en": {"yellow": "Rectangle", "round": "Round", "grey": "Grey", "bucket": "Bucket", "box": "Crate"},
}
_TG = {
    "uz": {"new": "Yangi konteyner so'rovi", "cancelled": "Konteyner so'rovi bekor qilindi",
           "hour": "Soat", "due": "Muddat", "by": "Yubordi", "note": "Izoh", "why": "Sabab",
           "hint": "Brigadirlarga taqsimlang.", "btn": "📦 So'rovni ochish"},
    "uz_cyrl": {"new": "Янги контейнер сўрови", "cancelled": "Контейнер сўрови бекор қилинди",
                "hour": "Соат", "due": "Муддат", "by": "Юборди", "note": "Изоҳ", "why": "Сабаб",
                "hint": "Бригадирларга тақсимланг.", "btn": "📦 Сўровни очиш"},
    "ru": {"new": "Новая заявка на контейнеры", "cancelled": "Заявка на контейнеры отменена",
           "hour": "Час", "due": "Срок", "by": "Отправил(а)", "note": "Комментарий", "why": "Причина",
           "hint": "Распределите по бригадирам.", "btn": "📦 Открыть заявку"},
    "en": {"new": "New container request", "cancelled": "Container request cancelled",
           "hour": "Hour", "due": "Due", "by": "Sent by", "note": "Note", "why": "Reason",
           "hint": "Split it across the brigadirs.", "btn": "📦 Open the request"},
}
NOTIFY_PAGE = "/containers/flow"


def hour_span(h: int) -> str:
    return f"{int(h) % 24:02d}:00–{(int(h) + 1) % 24:02d}:00"


def counts_text(lines: dict, lang: str = "uz") -> str:
    names = _CT_NAMES.get(lang) or _CT_NAMES["uz"]
    return ", ".join(f"{names.get(k, k)} {lines[k]}" for k in KEYS if lines.get(k))


def _tg_body(r: ContainerRequest, kind: str, lang: str) -> str:
    from html import escape as _esc

    def escape(x):
        return _esc(x, quote=False)
    from app.translit import transliterate, transliterate_text
    t = _TG.get(lang) or _TG["uz"]
    name = transliterate(r.created_by or "—", lang) or "—"
    rows = [f"📦 <b>{escape(t[kind])}</b>", "",
            f"{t['hour']}: <b>{hour_span(r.hour)}</b>",
            escape(counts_text(r.lines or {}, lang))]
    if kind == "new":
        rows += [f"{t['due']}: <b>{r.due_at.astimezone(TZ):%H:%M}</b>", f"{t['by']}: {escape(name)}"]
        if r.note:
            rows.append(f"{t['note']}: {escape(transliterate_text(r.note, lang) or r.note)}")
        rows += ["", f"<i>{escape(t['hint'])}</i>"]
    elif r.cancel_note:
        rows.append(f"{t['why']}: {escape(r.cancel_note)}")
    return "\n".join(rows)


def _tg_markup(lang: str):
    from telebot import types
    from app.config import settings as cfg
    t = _TG.get(lang) or _TG["uz"]
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        t["btn"], web_app=types.WebAppInfo(url=f"{cfg.webapp_url.rstrip('/')}{NOTIFY_PAGE}")))
    return kb


def notify_request(request_id: int, kind: str) -> bool:
    """Tell the addressee a request came (`new`) or went (`cancelled`): one
    bell row + a DM with a button to the page. Only while the «Sozlamalar»
    switch is on. Own session; never raises. Returns whether it was sent."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        if not settings(db)["notify"]:
            return False
        r = db.get(ContainerRequest, request_id)
        if r is None or (kind == "new" and r.status != "requested"):
            return False
        from app.routers.staff import notify_profile
        notify_profile(
            db, r.logistics_key, f"container_request_{kind}",
            {"hour": hour_span(r.hour), "counts": counts_text(r.lines or {}),
             "due": f"{r.due_at.astimezone(TZ):%H:%M}", "by": r.created_by or "—",
             "note": r.note or r.cancel_note or ""},
            type="warning" if kind == "cancelled" else "info",
            html_fn=lambda lang: _tg_body(r, kind, lang), markup_fn=_tg_markup,
            subject=("page", NOTIFY_PAGE))
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.warning("container-flow: request notice failed", exc_info=True)
        return False
    finally:
        db.close()


def notify_later(request_id: int, kind: str) -> None:
    """`notify_request` on a thread — a request's save never waits on Telegram."""
    import threading
    threading.Thread(target=notify_request, args=(request_id, kind), daemon=True).start()


# ── the brigadir's card: containers split to their unit (2026-11-15) ─────────
RECEIVE_CAP = "page.view.container-receive"
CALLBACK = "crv"          # crv:<request id>:<manager id> — «Hammasi keldi» in the bot

_TG_BRIG = {
    "uz": {"title": "Sizga konteyner yuborildi", "remind": '⏰ Konteynerlar hali tasdiqlanmagan', "cancel_title": "Konteyner so'rovi bekor qilindi", "cancelled": "Bu so'rov bekor qilingan", "hour": "Soat", "by": "Yubordi",
           "hint": "Kelganini tasdiqlang: hammasi kelgan bo'lsa — «Hammasi keldi», kam bo'lsa — «Boshqa son».",
           "all": "✅ Hammasi keldi", "other": "✏️ Boshqa son",
           "done": "✅ Qabul qilindi · {at}", "already": "Bu allaqachon tasdiqlangan",
           "not_yours": "Bu konteynerlar sizning bo'limingizga yuborilmagan", "gone": "So'rov topilmadi",
           "failed": "Saqlanmadi — sahifada tasdiqlang"},
    "uz_cyrl": {"title": "Сизга контейнер юборилди", "remind": '⏰ Контейнерлар ҳали тасдиқланмаган', "cancel_title": 'Контейнер сўрови бекор қилинди', "cancelled": 'Бу сўров бекор қилинган', "hour": "Соат", "by": "Юборди",
                "hint": "Келганини тасдиқланг: ҳаммаси келган бўлса — «Ҳаммаси келди», кам бўлса — «Бошқа сон».",
                "all": "✅ Ҳаммаси келди", "other": "✏️ Бошқа сон",
                "done": "✅ Қабул қилинди · {at}", "already": "Бу аллақачон тасдиқланган",
                "not_yours": "Бу контейнерлар сизнинг бўлимингизга юборилмаган", "gone": "Сўров топилмади",
                "failed": "Сақланмади — саҳифада тасдиқланг"},
    "ru": {"title": "Вам отправлены контейнеры", "remind": '⏰ Контейнеры ещё не подтверждены', "cancel_title": 'Заявка на контейнеры отменена', "cancelled": 'Эта заявка отменена', "hour": "Час", "by": "Отправил(а)",
           "hint": "Подтвердите приход: всё пришло — «Всё пришло», меньше — «Другое число».",
           "all": "✅ Всё пришло", "other": "✏️ Другое число",
           "done": "✅ Принято · {at}", "already": "Уже подтверждено",
           "not_yours": "Эти контейнеры отправлены не вашему участку", "gone": "Заявка не найдена",
           "failed": "Не сохранилось — подтвердите на странице"},
    "en": {"title": "Containers sent to you", "remind": '⏰ Containers not confirmed yet', "cancel_title": 'Container request cancelled', "cancelled": 'This request was cancelled', "hour": "Hour", "by": "Sent by",
           "hint": "Confirm what arrived: everything — «All arrived», fewer — «Different count».",
           "all": "✅ All arrived", "other": "✏️ Different count",
           "done": "✅ Received · {at}", "already": "Already confirmed",
           "not_yours": "These containers were not sent to your unit", "gone": "Request not found",
           "failed": "Not saved — confirm on the page"},
}


def brig_text(lang: str, key: str, **kw) -> str:
    return (_TG_BRIG.get(lang) or _TG_BRIG["uz"])[key].format(**kw)


def receive_open(db: Session, manager_id: int) -> bool:
    """May this unit's brigadir open «Qabul»? — the role's page access, or a
    personal grant on their profile (and no personal deny). A card whose
    buttons lead to «no access» is worse than none."""
    from app.permissions import get_page_access
    key = f"supervisor:{int(manager_id)}"
    own = db.query(ProfilePermission).filter(ProfilePermission.profile_key == key,
                                             ProfilePermission.capability == RECEIVE_CAP).first()
    if own is not None:
        return own.mode == "grant"
    return "supervisor" in get_page_access(db).get("container-receive", [])


def _brig_body(r: ContainerRequest, counts: dict, lang: str, kind: str = "split") -> str:
    """The brigadir's card: `split` (containers sent), `remind` (still not
    confirmed) or `cancel` (the request was withdrawn — no buttons)."""
    from html import escape as _esc
    from app.translit import transliterate, transliterate_text
    t = _TG_BRIG.get(lang) or _TG_BRIG["uz"]
    by = transliterate(r.logistics_name or "—", lang) or "—"
    at = r.assigned_at.astimezone(TZ).strftime("%H:%M") if r.assigned_at else ""
    head = {"split": f"📦 <b>{_esc(t['title'], quote=False)}</b>",
            "remind": f"<b>{_esc(t['remind'], quote=False)}</b>",
            "cancel": f"🚫 <b>{_esc(t['cancel_title'], quote=False)}</b>"}[kind]
    rows = [head, "", f"{t['hour']}: <b>{hour_span(r.hour)}</b>",
            _esc(counts_text(counts, lang), quote=False)]
    if kind == "cancel":
        if r.cancel_note:
            note = transliterate_text(r.cancel_note, lang) or r.cancel_note
            rows.append(f"{(_TG.get(lang) or _TG['uz'])['why']}: {_esc(note, quote=False)}")
        return "\n".join(rows)
    rows += [f"{t['by']}: {_esc(by, quote=False)}{f' · {at}' if at else ''}", "",
             f"<i>{_esc(t['hint'], quote=False)}</i>"]
    return "\n".join(rows)


def _brig_markup(request_id: int, manager_id: int):
    def _markup(lang: str):
        from telebot import types
        from app import tg_buttons
        from app.config import settings as cfg
        t = _TG_BRIG.get(lang) or _TG_BRIG["uz"]
        kb = types.InlineKeyboardMarkup()
        # green: it DECIDES — the receipt is written by the tap
        kb.add(tg_buttons.approve(t["all"], f"{CALLBACK}:{request_id}:{manager_id}"))
        kb.add(types.InlineKeyboardButton(t["other"], web_app=types.WebAppInfo(
            url=f"{cfg.webapp_url.rstrip('/')}{NOTIFY_PAGE}?tab=receive&rcv={request_id}")))
        return kb
    return _markup


def notify_split(request_id: int) -> int:
    """Tell each brigadir of a split request what is coming to their unit —
    one card each, only while «Sozlamalar» → brigadirs is on and only to a
    brigadir who may open «Qabul». Own session; never raises. Returns how
    many units were told."""
    from app.database import SessionLocal
    db = SessionLocal()
    told = 0
    try:
        if not settings(db)["notify_brigadirs"]:
            return 0
        r = db.get(ContainerRequest, request_id)
        if r is None or r.status != "assigned":
            return 0
        from app.routers.staff import notify_profile
        units: dict = {}
        for p in db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == r.id).all():
            units.setdefault(p.manager_id, {})[p.ctype] = p.count
        for mid, counts in units.items():
            if not receive_open(db, mid):
                continue
            notify_profile(
                db, f"supervisor:{mid}", "container_split",
                {"hour": hour_span(r.hour), "counts": counts_text(counts), "by": r.logistics_name or "—"},
                type="info", html_fn=lambda lang, c=counts: _brig_body(r, c, lang),
                markup_fn=_brig_markup(r.id, mid), subject=("page", NOTIFY_PAGE))
            told += 1
        db.commit()
        return told
    except Exception:
        db.rollback()
        logger.warning("container-flow: split notice failed", exc_info=True)
        return told
    finally:
        db.close()


def notify_split_later(request_id: int) -> None:
    import threading
    threading.Thread(target=notify_split, args=(request_id,), daemon=True).start()


def _units_of(db: Session, request_id: int) -> dict:
    units: dict = {}
    for p in db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == request_id).all():
        units.setdefault(p.manager_id, {})[p.ctype] = p.count
    return units


def notify_split_cancelled(request_id: int) -> int:
    """A request withdrawn AFTER its split: each of its brigadirs who was told
    it is coming hears it is not (no buttons). Same switch and access rule as
    the split card. Own session; never raises."""
    from app.database import SessionLocal
    db = SessionLocal()
    told = 0
    try:
        if not settings(db)["notify_brigadirs"]:
            return 0
        r = db.get(ContainerRequest, request_id)
        if r is None or r.status != "cancelled":
            return 0
        from app.routers.staff import notify_profile
        for mid, counts in _units_of(db, r.id).items():
            if not receive_open(db, mid):
                continue
            notify_profile(
                db, f"supervisor:{mid}", "container_split_cancelled",
                {"hour": hour_span(r.hour), "counts": counts_text(counts), "note": r.cancel_note or ""},
                type="warning", html_fn=lambda lang, c=counts: _brig_body(r, c, lang, "cancel"),
                subject=("page", NOTIFY_PAGE))
            told += 1
        db.commit()
        return told
    except Exception:
        db.rollback()
        logger.warning("container-flow: cancel notice to brigadirs failed", exc_info=True)
        return told
    finally:
        db.close()


def notify_split_cancelled_later(request_id: int) -> None:
    import threading
    threading.Thread(target=notify_split_cancelled, args=(request_id,), daemon=True).start()


# ── prepared requests (2026-11-17) ───────────────────────────────────────────
# AXO made every hour's request by hand, and a forgotten hour only turned red
# on the strip. `prepared` is the day's hours still ahead with what each needs
# on «Konteynerlar» less what was already asked for it; `create_requests` makes
# the picked ones in one go — all or nothing — and the addressee hears ONE
# message for the lot (`notify_requests`).

def prepared(db: Session, day: date, at: Optional[datetime] = None) -> list:
    at = at or now()
    need = plant_hours(db, day)
    asked: dict = {}
    for r in db.query(ContainerRequest).filter(ContainerRequest.day == day,
                                               ContainerRequest.status != "cancelled",
                                               ~ContainerRequest.id.in_(_extra_request_ids(db))).all():
        e = asked.setdefault(int(r.hour), {})
        for k, n in (r.lines or {}).items():
            e[k] = e.get(k, 0) + n
    out = []
    for h in sorted(need):
        hs = hour_start(day, h)
        if hs + timedelta(hours=1) <= at:
            continue                                    # the hour is over
        counts = {k: need[h][k] - asked.get(h, {}).get(k, 0) for k in KEYS
                  if need[h].get(k, 0) - asked.get(h, {}).get(k, 0) > 0}
        if not counts:
            continue
        out.append({"hour": h, "need": {k: need[h][k] for k in KEYS if need[h].get(k)},
                    "asked": asked.get(h, {}), "counts": counts,
                    "due_at": _iso(_due(hs, at)), "late": at > hs - timedelta(minutes=LEAD_MIN)})
    return out


def create_requests(db: Session, day: date, logistics_key: str, items: list, note, actor,
                    actor_key) -> list:
    """Several hours' requests to one logistics person — each as `create_request`
    makes it; one refused item refuses them all (the caller rolls back)."""
    if not items:
        raise FlowError("count")
    hours = [int(it.get("hour")) for it in items]
    if len(set(hours)) != len(hours):
        raise FlowError("hour")
    return [create_request(db, day, it["hour"], logistics_key, it.get("counts") or {}, note, actor, actor_key)
            for it in items]


_TG_MANY = {
    "uz": ("Yangi konteyner so'rovlari: {n} ta", "Muddat"),
    "uz_cyrl": ("Янги контейнер сўровлари: {n} та", "Муддат"),
    "ru": ("Новые заявки на контейнеры: {n}", "Срок"),
    "en": ("New container requests: {n}", "Due"),
}


def notify_requests(request_ids: list) -> bool:
    """One message to the addressee for several new requests (a prepared day
    sent in one go) — never one per hour. One id is `notify_request`."""
    ids = [int(i) for i in request_ids or []]
    if len(ids) == 1:
        return notify_request(ids[0], "new")
    if not ids:
        return False
    from html import escape as _esc
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        if not settings(db)["notify"]:
            return False
        rows = db.query(ContainerRequest).filter(ContainerRequest.id.in_(ids),
                                                 ContainerRequest.status == "requested").order_by(
            ContainerRequest.hour).all()
        if not rows:
            return False

        def body(lang):
            title, due = _TG_MANY.get(lang) or _TG_MANY["uz"]
            lines = [f"📦 <b>{_esc(title.format(n=len(rows)), quote=False)}</b>", ""]
            lines += [f"<b>{hour_span(r.hour)}</b> · {_esc(counts_text(r.lines or {}, lang), quote=False)}"
                      f" · {due} {r.due_at.astimezone(TZ):%H:%M}" for r in rows]
            return "\n".join(lines)

        from app.routers.staff import notify_profile
        notify_profile(
            db, rows[0].logistics_key, "container_requests_new",
            {"n": len(rows), "hours": ", ".join(hour_span(r.hour) for r in rows), "by": rows[0].created_by or "—"},
            type="info", html_fn=body, markup_fn=_tg_markup, subject=("page", NOTIFY_PAGE))
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.warning("container-flow: bulk request notice failed", exc_info=True)
        return False
    finally:
        db.close()


def notify_requests_later(request_ids: list) -> None:
    import threading
    threading.Thread(target=notify_requests, args=(list(request_ids),), daemon=True).start()


# ── alerts: AXO and the shift managers (2026-11-17) ──────────────────────────
# Nobody was told when things went wrong: AXO never heard that logistics split
# fewer than she asked or that a brigadir got fewer than sent; nobody heard
# that a request passed its deadline unsplit, or that a brigadir stayed silent
# after the reminder. Each alert is ONE message with the page's button; the
# two clock-driven ones are claimed (a timestamp, committed) before sending,
# and only inside ALERT_WINDOW_MIN of their moment — never a burst about the
# past. Switches: `notify_axo` (ON unless switched off), `notify_managers`
# (OFF until an admin turns it on).
ALERT_WINDOW_MIN = 120
ESCALATE_AFTER_MIN = 30        # after the brigadir's reminder
_ALERT_L = {
    "uz": {"short_split": "Kam taqsimlandi", "short_receipt": "Brigadirga kam keldi",
           "overdue": "So'rov muddati o'tdi — hali taqsimlanmagan", "unconfirmed": "Brigadir konteynerlarni tasdiqlamadi",
           "hour": "Soat", "asked": "So'ralgan", "given": "Taqsimlangan", "sent": "Yuborilgan", "got": "Keldi",
           "why": "Sabab", "to": "Logistika", "due": "Muddat", "unit": "Brigadir",
           "reason": {"short": "Yetishmadi", "damaged": "Shikastlangan", "wrong_type": "Boshqa turdagi", "other": "Boshqa"}},
    "uz_cyrl": {"short_split": "Кам тақсимланди", "short_receipt": "Бригадирга кам келди",
                "overdue": "Сўров муддати ўтди — ҳали тақсимланмаган", "unconfirmed": "Бригадир контейнерларни тасдиқламади",
                "hour": "Соат", "asked": "Сўралган", "given": "Тақсимланган", "sent": "Юборилган", "got": "Келди",
                "why": "Сабаб", "to": "Логистика", "due": "Муддат", "unit": "Бригадир",
                "reason": {"short": "Етишмади", "damaged": "Шикастланган", "wrong_type": "Бошқа турдаги", "other": "Бошқа"}},
    "ru": {"short_split": "Распределено меньше заявленного", "short_receipt": "Бригадиру пришло меньше",
           "overdue": "Срок заявки прошёл — ещё не распределена", "unconfirmed": "Бригадир не подтвердил контейнеры",
           "hour": "Час", "asked": "Заявлено", "given": "Распределено", "sent": "Отправлено", "got": "Пришло",
           "why": "Причина", "to": "Логистика", "due": "Срок", "unit": "Бригадир",
           "reason": {"short": "Не хватило", "damaged": "Повреждены", "wrong_type": "Другой вид", "other": "Другое"}},
    "en": {"short_split": "Split short of the request", "short_receipt": "A brigadir received fewer",
           "overdue": "Request past its deadline — still not split", "unconfirmed": "A brigadir has not confirmed containers",
           "hour": "Hour", "asked": "Asked", "given": "Split", "sent": "Sent", "got": "Arrived",
           "why": "Reason", "to": "Logistics", "due": "Due", "unit": "Brigadir",
           "reason": {"short": "Short", "damaged": "Damaged", "wrong_type": "Wrong type", "other": "Other"}},
}


def _alert_body(kind: str, lang: str, rows: list) -> str:
    """`rows` are (label key, value) pairs; a name is transliterated by the caller."""
    from html import escape as _esc
    t = _ALERT_L.get(lang) or _ALERT_L["uz"]
    out = [f"⚠️ <b>{_esc(t[kind], quote=False)}</b>", ""]
    out += [f"{t[k]}: <b>{_esc(str(v), quote=False)}</b>" for k, v in rows if v not in (None, "")]
    return "\n".join(out)


def _why_text(lang: str, reason, comment) -> str:
    t = _ALERT_L.get(lang) or _ALERT_L["uz"]
    return " — ".join(x for x in (t["reason"].get(reason, reason or ""), (comment or "").strip()) if x)


def _sm_keys(db: Session) -> list:
    """Every shift-manager profile — who a unit's notices fan out to
    (`shift_scope.role_ids_for_unit`)."""
    return [f"shift-manager:{pid}" for (pid,) in db.query(RoleProfile.id).filter(
        RoleProfile.role == "shift-manager").order_by(RoleProfile.id).all()]


def _send_alert(db: Session, keys: list, nkey: str, params: dict, html_fn) -> int:
    from app.routers.staff import notify_profile
    for key in keys:
        notify_profile(db, key, nkey, params, type="warning", html_fn=html_fn,
                       markup_fn=_tg_markup, subject=("page", NOTIFY_PAGE))
    return len(keys)


def alert_short_split(request_id: int) -> int:
    """Logistics split fewer than AXO asked: its author hears how many and why."""
    from app.database import SessionLocal
    from app.translit import transliterate
    db = SessionLocal()
    try:
        r = db.get(ContainerRequest, request_id)
        if r is None or r.status != "assigned" or not r.short_reason or not r.created_key \
                or not settings(db)["notify_axo"]:
            return 0
        given: dict = {}
        for u in _units_of(db, r.id).values():
            for k, n in u.items():
                given[k] = given.get(k, 0) + n

        def body(lang):
            return _alert_body("short_split", lang, [
                ("hour", hour_span(r.hour)), ("asked", counts_text(r.lines or {}, lang)),
                ("given", counts_text(given, lang) or "0"),
                ("to", transliterate(r.logistics_name or "", lang)),
                ("why", _why_text(lang, r.short_reason, r.short_comment))])
        n = _send_alert(db, [r.created_key], "container_short_split",
                        {"hour": hour_span(r.hour), "counts": counts_text(given) or "0",
                         "by": r.logistics_name or "—"}, body)
        db.commit()
        return n
    except Exception:
        db.rollback()
        logger.warning("container-flow: short-split alert failed", exc_info=True)
        return 0
    finally:
        db.close()


def alert_short_receipt(request_id: int, manager_id: int) -> int:
    """A brigadir confirmed fewer than were sent: the request's author hears it."""
    from app.database import SessionLocal
    from app.translit import transliterate
    db = SessionLocal()
    try:
        r = db.get(ContainerRequest, request_id)
        if r is None or not r.created_key or not settings(db)["notify_axo"]:
            return 0
        parts = db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == r.id,
                                                      ContainerRequestPart.manager_id == int(manager_id)).all()
        if not parts or any(p.received is None for p in parts) \
                or not any(p.received < p.count for p in parts):
            return 0
        sent = {p.ctype: p.count for p in parts}
        got = {p.ctype: p.received for p in parts}
        unit = profile_name(db, f"supervisor:{int(manager_id)}") or "—"
        why = (parts[0].received_reason, parts[0].received_comment)

        def body(lang):
            return _alert_body("short_receipt", lang, [
                ("hour", hour_span(r.hour)), ("unit", transliterate(unit, lang)),
                ("sent", counts_text(sent, lang)), ("got", counts_text(got, lang) or "0"),
                ("why", _why_text(lang, *why))])
        n = _send_alert(db, [r.created_key], "container_short_receipt",
                        {"hour": hour_span(r.hour), "counts": counts_text(got) or "0", "name": unit}, body)
        db.commit()
        return n
    except Exception:
        db.rollback()
        logger.warning("container-flow: short-receipt alert failed", exc_info=True)
        return 0
    finally:
        db.close()


def alert_later(kind: str, *args) -> None:
    """An event's alert on a thread — a save never waits on Telegram."""
    import threading
    fn = {"short_split": alert_short_split, "short_receipt": alert_short_receipt}[kind]
    threading.Thread(target=fn, args=args, daemon=True).start()


def alert_overdue(db: Session, at: Optional[datetime] = None) -> int:
    """A request still not split at its deadline: its AXO author and the shift
    managers are told once (each behind their switch)."""
    from sqlalchemy import update as _update
    from app.translit import transliterate
    at = at or now()
    cfg = settings(db)
    if not (cfg["notify_axo"] or cfg["notify_managers"]):
        return 0
    sent = 0
    rows = db.query(ContainerRequest).filter(
        ContainerRequest.status == "requested", ContainerRequest.overdue_alerted_at.is_(None),
        ContainerRequest.due_at < at,
        ContainerRequest.due_at >= at - timedelta(minutes=ALERT_WINDOW_MIN)).all()
    for r in rows:
        claimed = db.execute(_update(ContainerRequest).where(
            ContainerRequest.id == r.id, ContainerRequest.overdue_alerted_at.is_(None),
        ).values(overdue_alerted_at=at)).rowcount
        db.commit()
        if not claimed:
            continue
        keys = ([r.created_key] if cfg["notify_axo"] and r.created_key else []) \
            + (_sm_keys(db) if cfg["notify_managers"] else [])
        keys = list(dict.fromkeys(keys))

        def body(lang, rr=r):
            return _alert_body("overdue", lang, [
                ("hour", hour_span(rr.hour)), ("asked", counts_text(rr.lines or {}, lang)),
                ("to", transliterate(rr.logistics_name or "", lang)),
                ("due", f"{rr.due_at.astimezone(TZ):%H:%M}")])
        sent += _send_alert(db, keys, "container_request_overdue",
                            {"hour": hour_span(r.hour), "counts": counts_text(r.lines or {}),
                             "by": r.logistics_name or "—"}, body)
        db.commit()
    return sent


def escalate_unconfirmed(db: Session, at: Optional[datetime] = None) -> int:
    """A brigadir still silent ESCALATE_AFTER_MIN after the reminder: the shift
    managers are told once per unit of a request (their switch on)."""
    from sqlalchemy import update as _update
    from app.translit import transliterate
    at = at or now()
    if not settings(db)["notify_managers"]:
        return 0
    lo, hi = at - timedelta(minutes=ESCALATE_AFTER_MIN + ALERT_WINDOW_MIN), at - timedelta(minutes=ESCALATE_AFTER_MIN)
    pending: dict = {}
    for p in db.query(ContainerRequestPart).filter(
            ContainerRequestPart.received.is_(None), ContainerRequestPart.escalated_at.is_(None),
            ContainerRequestPart.reminded_at.isnot(None), ContainerRequestPart.reminded_at <= hi,
            ContainerRequestPart.reminded_at >= lo).all():
        pending.setdefault((p.request_id, p.manager_id), {})[p.ctype] = p.count
    sent = 0
    for (rid, mid), counts in pending.items():
        r = db.get(ContainerRequest, rid)
        if r is None or r.status != "assigned":
            continue
        claimed = db.execute(_update(ContainerRequestPart).where(
            ContainerRequestPart.request_id == rid, ContainerRequestPart.manager_id == mid,
            ContainerRequestPart.received.is_(None), ContainerRequestPart.escalated_at.is_(None),
        ).values(escalated_at=at)).rowcount
        db.commit()
        if not claimed:
            continue
        unit = profile_name(db, f"supervisor:{mid}") or "—"

        def body(lang, rr=r, c=counts, u=unit):
            return _alert_body("unconfirmed", lang, [
                ("unit", transliterate(u, lang)), ("hour", hour_span(rr.hour)), ("sent", counts_text(c, lang))])
        sent += _send_alert(db, _sm_keys(db), "container_unconfirmed",
                            {"hour": hour_span(r.hour), "counts": counts_text(counts), "name": unit}, body)
        db.commit()
    return sent


# ── the reminder (2026-11-15, the operator: «add a reminder for brigadirs who
# don't confirm») ─────────────────────────────────────────────────────────────
# ONE reminder per unit of a split request, while its containers are still not
# confirmed: when the hour they are for BEGINS — by then they are on the line —
# or REMIND_AFTER_MIN after the split if the split came later than that. Only
# inside REMIND_WINDOW_MIN of that moment, so a clock that was down (a deploy,
# the first run of this code) never sends a burst about hours long gone. The
# part is claimed (`reminded_at`) and committed BEFORE the card goes out, so
# two workers never send it twice.
REMIND_AFTER_MIN = 30
REMIND_WINDOW_MIN = 120


def remind_at(r: ContainerRequest) -> Optional[datetime]:
    if r.assigned_at is None:
        return None
    return max(hour_start(r.day, r.hour), r.assigned_at + timedelta(minutes=REMIND_AFTER_MIN))


def remind_unconfirmed(db: Session, at: Optional[datetime] = None) -> int:
    """Remind each brigadir whose part of a split request is due a reminder
    (above). Returns how many were reminded."""
    at = at or now()
    if not settings(db)["notify_brigadirs"]:
        return 0
    from sqlalchemy import update as _update
    from app.routers.staff import notify_profile
    today = at.astimezone(TZ).date()
    sent = 0
    rows = db.query(ContainerRequest).filter(
        ContainerRequest.status == "assigned",
        ContainerRequest.day >= today - timedelta(days=1), ContainerRequest.day <= today).all()
    for r in rows:
        when = remind_at(r)
        if when is None or not (when <= at < when + timedelta(minutes=REMIND_WINDOW_MIN)):
            continue
        pending: dict = {}
        for p in db.query(ContainerRequestPart).filter(
                ContainerRequestPart.request_id == r.id, ContainerRequestPart.received.is_(None),
                ContainerRequestPart.reminded_at.is_(None)).all():
            pending.setdefault(p.manager_id, {})[p.ctype] = p.count
        for mid, counts in pending.items():
            if not receive_open(db, mid):
                continue
            claimed = db.execute(_update(ContainerRequestPart).where(
                ContainerRequestPart.request_id == r.id, ContainerRequestPart.manager_id == mid,
                ContainerRequestPart.received.is_(None), ContainerRequestPart.reminded_at.is_(None),
            ).values(reminded_at=at)).rowcount
            db.commit()
            if not claimed:
                continue
            notify_profile(
                db, f"supervisor:{mid}", "container_split_remind",
                {"hour": hour_span(r.hour), "counts": counts_text(counts), "by": r.logistics_name or "—"},
                type="warning", html_fn=lambda lang, c=counts, rr=r: _brig_body(rr, c, lang, "remind"),
                markup_fn=_brig_markup(r.id, mid), subject=("page", NOTIFY_PAGE))
            db.commit()
            sent += 1
    return sent


def receive_from_bot(db: Session, request_id: int, manager_id: int, telegram_id: int) -> tuple:
    """«Hammasi keldi» tapped in the bot: the tapper must hold the unit's
    brigadir profile (callback data is typeable and a card can be forwarded).
    Returns (code, request): code is "done", "already", "not_yours", "gone"."""
    from app.identity import profile_holders
    key = f"supervisor:{int(manager_id)}"
    if int(telegram_id) not in profile_holders(db, key):
        return "not_yours", None
    req = db.get(ContainerRequest, int(request_id))
    if req is not None and req.status == "cancelled":
        return "cancelled", None
    try:
        r = receive(db, request_id, manager_id, None, None, None, profile_name(db, key) or key)
    except FlowError as e:
        db.rollback()
        return ("already" if e.code == "state" else "gone" if e.code in ("gone", "unit") else e.code), None
    return "done", r


# ── the hour's figure for a request ─────────────────────────────────────────
# 2026-11-14, the operator, on «Yangi so'rov»: «when we choose the hours the
# number of containers should appear by default, then if it is incorrect they
# will correct it by hand». The figure is the «Konteynerlar» page's own —
# every non-archived unit with a «Zagruzka fayli», `hourly_containers
# .unit_hours` summed per clock hour (what `/api/shift-report/containers-hourly`
# answers without a filter) — kept a minute, like that endpoint.
_HOURS_TTL_S = 60
_hours_cache: dict = {}


def plant_hours(db: Session, day: date) -> dict:
    """{hour: {ctype: n}} for the whole plant on `day` (hours past 23 belong
    to the production day that started them)."""
    out: dict = {}
    for h_map in units_hours(db, day).values():
        for h, e in h_map.items():
            o = out.setdefault(h, {})
            for k, n in e.items():
                o[k] = o.get(k, 0) + n
    return out


def unit_limits(db: Session, day: date, hour: int, exclude_request_id: Optional[int] = None) -> dict:
    """Each brigadir's LIMIT at one production hour (2026-11-15, the operator:
    «they have a limit for containers after the calculation, and they do not
    have to take the extra») — **carried over** (2026-11-17): everything the
    unit's «Konteynerlar» figures need FROM THE DAY'S START THROUGH this hour,
    less everything split to it for hours up to this one. An hour that got
    nothing is no longer lost: what it needed can still be sent with a later
    hour's request.

    The day's total is never passed either way: a request for hour H may take
    only what leaves every hour from H on within ITS cumulative need — a later
    hour's split that already used the carry-over is counted against it.

    {manager_id: {"limit", "given", "left"}} per container type — `limit` the
    need through the hour, `given` what was split through it, `left` what may
    still go. A unit with no figure by this hour has no limit: 0."""
    hour = int(hour)
    per = units_hours(db, day)
    q = db.query(ContainerRequestPart.manager_id, ContainerRequestPart.ctype, ContainerRequestPart.count,
                 ContainerRequest.hour).join(
        ContainerRequest, ContainerRequest.id == ContainerRequestPart.request_id).filter(
        ContainerRequest.day == day, ContainerRequest.status == "assigned",
        # an approved EXTRA was given past the limit — it never uses the plan's room up
        ~ContainerRequest.id.in_(_extra_request_ids(db)))
    if exclude_request_id is not None:
        q = q.filter(ContainerRequest.id != exclude_request_id)
    given: dict = {}
    for mid, k, n, h in q.all():
        e = given.setdefault(mid, {}).setdefault(int(h), {})
        e[k] = e.get(k, 0) + n
    out: dict = {}
    for mid in set(per) | set(given):
        hm, gm = per.get(mid) or {}, given.get(mid) or {}
        types = {k for e in hm.values() for k, n in e.items() if n} | {k for e in gm.values() for k in e}
        hours = sorted(set(hm) | set(gm) | {hour})
        limit, giv, left = {}, {}, {}
        for k in types:
            need_sum = given_sum = 0
            slack = None
            for h in hours:
                need_sum += (hm.get(h) or {}).get(k, 0)
                given_sum += (gm.get(h) or {}).get(k, 0)
                if h == hour:
                    if need_sum:
                        limit[k] = need_sum
                    if given_sum:
                        giv[k] = given_sum
                if h >= hour:
                    room = need_sum - given_sum
                    slack = room if slack is None else min(slack, room)
            if k in limit:
                left[k] = max(0, slack or 0)
        if limit or giv:
            out[mid] = {"limit": limit, "given": giv, "left": left}
    return out


def split_hint(db: Session, r: ContainerRequest, limits: Optional[dict] = None) -> list:
    """Where a request's containers would go by the «Konteynerlar» figures:
    for each requested type, each unit up to what is LEFT of its limit for the
    hour (`unit_limits`) — everybody whole when the request covers them, cut
    in proportion by largest remainder when it does not (`split`). What no
    limit can take stays unsplit, a short split with a reason."""
    limits = unit_limits(db, r.day, r.hour, r.id) if limits is None else limits
    mids = [m for m, u in limits.items() if any(u["left"].get(k) for k in (r.lines or {}))]
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    mids.sort(key=lambda m: (getattr(units.get(m), "name", "") or "", m))
    rows: dict = {}
    for k, asked in (r.lines or {}).items():
        have = [m for m in mids if limits[m]["left"].get(k)]
        lefts = [limits[m]["left"][k] for m in have]
        for m, n in zip(have, split(asked, lefts)):
            if not n:
                continue
            row = rows.setdefault(m, {"manager_id": m, "unit": getattr(units.get(m), "name", None),
                                      "shift": getattr(units.get(m), "shift", None),
                                      "counts": {}, "need": {}})
            row["counts"][k] = n
            row["need"][k] = limits[m]["limit"].get(k, 0)
    return [rows[m] for m in mids if m in rows]


def units_hours(db: Session, day: date) -> dict:
    """{manager_id: {hour: {ctype: n}}} — each configured, non-archived unit's
    `hourly_containers.unit_hours`, kept a minute."""
    import time as _time
    from fastapi import HTTPException
    from app.routers import production
    got = _hours_cache.get(day)
    if got and _time.monotonic() - got[0] < _HOURS_TTL_S:
        return got[1]
    started = _time.monotonic()
    configured = production._configured_manager_ids(db)
    out: dict = {}
    for (mid,) in db.query(Manager.id).filter(Manager.archived.is_(False)).all():
        if mid not in configured:
            continue
        try:
            h_map, _u = hourly_containers.unit_hours(production._build_dashboard(db, mid, day))
        except HTTPException:
            continue
        hm = {int(h): {k: n for k, n in e.items() if n} for h, e in h_map.items()}
        hm = {h: e for h, e in hm.items() if e}
        if hm:
            out[mid] = hm
    _hours_cache[day] = (started, out)
    return out


# ── AXO's stock (2026-11-17, the operator: «add for AXO how many containers
# they have … it will be very crucial information for them») ─────────────────
# Nothing on the platform knew how many containers AXO holds, so AXO states it
# (`ContainerStockMove`): a COUNT sets the stock of every type, an IN adds what
# came back or was bought. From the latest count on the platform keeps the
# figure itself: every container a logistics person SPLIT to a brigadir (a
# request, at `assigned_at`) and every one AXO ISSUED in a batch (`issued_at`)
# has left. What left is read, never stored — a cancelled or deleted request
# gives its containers back, and the figure cannot drift from the requests.
# Returns are only what AXO records, so the figure is a BOOK value: it sinks
# below zero when returns go unrecorded, which the page says («count again»)
# instead of hiding.
STOCK_KINDS = ("count", "in")
STOCK_MOVES_MAX = 200


def record_stock(db: Session, kind: str, counts: dict, note, actor, actor_key,
                 at: Optional[datetime] = None) -> ContainerStockMove:
    """A count (every type named, 0 allowed) or an addition (at least one)."""
    if kind not in STOCK_KINDS:
        raise FlowError("kind")
    counts = counts or {}
    if any(k not in KEYS for k in counts):
        raise FlowError("type")
    clean = {}
    for k in KEYS:
        if counts.get(k) is None:
            if kind == "count":
                raise FlowError("count")
            continue
        n = _count(counts[k])
        if kind == "count" or n > 0:
            clean[k] = n
    if not clean:
        raise FlowError("count")
    m = ContainerStockMove(kind=kind, counts=clean, note=(note or "").strip() or None,
                           by_name=actor, by_key=actor_key, at=at or now())
    db.add(m)
    db.flush()
    return m


def _stock_out(db: Session, since: datetime, until: datetime) -> list:
    """What left AXO after `since`: [(at, {ctype: n})] — a split request at its
    split, an issued batch at its issue."""
    from sqlalchemy import func as _f
    out: dict = {}
    for rid, at, k, n in db.query(ContainerRequest.id, ContainerRequest.assigned_at,
                                  ContainerRequestPart.ctype, _f.sum(ContainerRequestPart.count)) \
            .join(ContainerRequestPart, ContainerRequestPart.request_id == ContainerRequest.id) \
            .filter(ContainerRequest.status == "assigned", ContainerRequest.assigned_at > since,
                    ContainerRequest.assigned_at <= until) \
            .group_by(ContainerRequest.id, ContainerRequest.assigned_at, ContainerRequestPart.ctype).all():
        out.setdefault(("r", rid, at), {})[k] = int(n or 0)
    for bid, at, k, n in db.query(ContainerBatch.id, ContainerBatch.issued_at,
                                  ContainerBatchLine.ctype, ContainerBatchLine.issued) \
            .join(ContainerBatchLine, ContainerBatchLine.batch_id == ContainerBatch.id) \
            .filter(ContainerBatch.status != "requested", ContainerBatch.issued_at > since,
                    ContainerBatch.issued_at <= until, ContainerBatchLine.issued.isnot(None)).all():
        out.setdefault(("b", bid, at), {})[k] = int(n or 0)
    return [(key[2], counts) for key, counts in out.items()]


def stock_ahead(db: Session, at: datetime) -> tuple:
    """What still has to leave AXO for the hours not over: (`reserved` — asked
    of a logistics person, not split yet; `ahead` — the hours' need nobody
    asked for yet, None when the plan could not be read)."""
    reserved: dict = {}
    for r in db.query(ContainerRequest).filter(ContainerRequest.status == "requested",
                                               ContainerRequest.day >= at.date() - timedelta(days=1)).all():
        if hour_start(r.day, r.hour) + timedelta(hours=1) <= at:
            continue
        for k, n in (r.lines or {}).items():
            reserved[k] = reserved.get(k, 0) + int(n or 0)
    try:
        ahead: Optional[dict] = {}
        # yesterday's production day too: a night shift's hours run past midnight
        for d in (at.date() - timedelta(days=1), at.date()):
            for h in prepared(db, d, at):
                for k, n in h["counts"].items():
                    ahead[k] = ahead.get(k, 0) + n
    except Exception:
        logger.warning("container-flow: the hours ahead could not be read for the stock", exc_info=True)
        db.rollback()
        ahead = None
    return reserved, ahead


def stock(db: Session, d_from: date, d_to: date, at: Optional[datetime] = None) -> dict:
    """AXO's stock now, what today still takes from it, and the period day by
    day: opening → given → returned → correction → closing (a correction is a
    count that differed from the book). Days before the first count are not
    listed — there was no figure."""
    at = at or now()
    zero = lambda: {k: 0 for k in KEYS}                                # noqa: E731
    M = ContainerStockMove
    is_count = M.kind == "count"
    first = db.query(M).filter(is_count, M.at <= at).order_by(M.at, M.id).first()
    out = {"types": list(KEYS), "counted": first is not None, "last_count": None, "now": None,
           "today": None, "days": [], "moves": []}
    if first is None:
        return out
    start = hour_start(d_from, 0)
    base = db.query(M).filter(is_count, M.at <= start).order_by(M.at.desc(), M.id.desc()).first() or first
    last = db.query(M).filter(is_count, M.at <= at).order_by(M.at.desc(), M.id.desc()).first()
    ev = [(m.at, 0, m.id, m.kind, m.counts or {})
          for m in db.query(M).filter(M.at >= base.at, M.at <= at).order_by(M.at, M.id).all()]
    ev += [(t, 1, 0, "out", counts) for t, counts in _stock_out(db, base.at, at)]
    ev.sort(key=lambda e: e[:3])

    today0 = hour_start(at.date(), 0)
    today = {"given": zero(), "returned": zero()}
    bal: Optional[dict] = None

    def apply(e, row=None):
        nonlocal bal
        t, _o, _i, kind, counts = e
        if kind == "count":
            if bal is not None and row is not None:
                for k in KEYS:
                    row["adjust"][k] += int(counts.get(k, 0)) - bal[k]
            bal = {k: int(counts.get(k, 0)) for k in KEYS}
            if row is not None:
                row["counted"] = True
            return
        if bal is None:
            return
        sign, slot = (1, "returned") if kind == "in" else (-1, "given")
        for k, n in counts.items():
            if k not in bal:
                continue
            bal[k] += sign * int(n or 0)
            if row is not None:
                row[slot][k] += int(n or 0)
            if t >= today0:
                today[slot][k] += int(n or 0)

    i = 0
    d = max(d_from, base.at.astimezone(TZ).date())
    end = min(d_to, at.date())
    while i < len(ev) and ev[i][0] < hour_start(d, 0):
        apply(ev[i])
        i += 1
    while d <= end:
        row = {"day": d.isoformat(), "open": dict(bal) if bal is not None else None,
               "given": zero(), "returned": zero(), "adjust": zero(), "counted": False}
        nxt = hour_start(d + timedelta(days=1), 0)
        while i < len(ev) and ev[i][0] < nxt:
            apply(ev[i], row)
            i += 1
        row["close"] = dict(bal) if bal is not None else None
        out["days"].append(row)
        d += timedelta(days=1)
    while i < len(ev):
        apply(ev[i])
        i += 1

    reserved, ahead = stock_ahead(db, at)
    today["reserved"] = {k: reserved.get(k, 0) for k in KEYS}
    today["ahead"] = None if ahead is None else {k: ahead.get(k, 0) for k in KEYS}
    out["now"], out["today"] = bal, today
    out["last_count"] = {"at": _iso(last.at), "by": last.by_name, "counts": last.counts or {}}
    lo, hi = start, hour_start(d_to + timedelta(days=1), 0)
    out["moves"] = [{"id": m.id, "at": _iso(m.at), "kind": m.kind, "counts": m.counts or {},
                     "note": m.note, "by": m.by_name}
                    for m in db.query(M).filter(M.at >= lo, M.at < hi)
                    .order_by(M.at.desc(), M.id.desc()).limit(STOCK_MOVES_MAX).all()]
    return out


# ── a brigadir's EXTRA request (2026-11-18, the operator: «add the request
# page for supervisors if they need extra containers, and this request goes
# through AXO») ───────────────────────────────────────────────────────────────
# A brigadir's limit keeps logistics from giving more than the plan's figure,
# so a line that runs short (the plan grew, containers broke, a delivery came
# short) had no way in but the phone — and the report looked clean while it
# was wrong. Now the brigadir ASKS (`ask_extra`, page key `container-extra`,
# their own unit only); AXO approves — all or fewer, to a logistics person of
# her choice — or rejects with a note. An approved extra becomes an ordinary
# request (`create_request`) that logistics splits to THAT unit only, past the
# limit by exactly what AXO approved (`assign_request`), and that never uses
# the plan's limit up (`unit_limits`) nor counts as the hour's own request
# (`prepared`). The brigadir confirms it on «Qabul» like any other.
EXTRA_REASONS = ("plan", "damaged", "short", "other")
EXTRA_CAP = "page.view.container-extra"


def _extra_request_ids(db: Session):
    """The requests that are approved extras — a subquery, NULLs left out so a
    NOT IN over it stays a plain filter."""
    return db.query(ContainerExtra.request_id).filter(ContainerExtra.request_id.isnot(None))


def extra_unit_of(db: Session, request_id: int) -> Optional[int]:
    """The unit a request was approved for as an extra; None for a plain one."""
    row = db.query(ContainerExtra.manager_id).filter(ContainerExtra.request_id == request_id).first()
    return int(row[0]) if row else None


def extra_open(db: Session, manager_id: int) -> bool:
    """May this unit's brigadir ask for extras? — the role's page access, or a
    personal grant on their profile (and no personal deny)."""
    from app.permissions import get_page_access
    key = f"supervisor:{int(manager_id)}"
    own = db.query(ProfilePermission).filter(ProfilePermission.profile_key == key,
                                             ProfilePermission.capability == EXTRA_CAP).first()
    if own is not None:
        return own.mode == "grant"
    return "supervisor" in get_page_access(db).get("container-extra", [])


def _extra(db: Session, extra_id: int) -> ContainerExtra:
    e = db.query(ContainerExtra).filter(ContainerExtra.id == extra_id).with_for_update().first()
    if e is None:
        raise FlowError("gone")
    return e


def ask_extra(db: Session, day: date, hour: int, manager_id: int, counts: dict, reason, comment,
              actor, actor_key, at: Optional[datetime] = None) -> ContainerExtra:
    """A brigadir asks AXO for containers past their limit. The hour may not be
    over; one waiting ask per unit and hour (a second one is the same ask)."""
    at = at or now()
    hour = int(hour)
    if not (0 <= hour <= 47) or hour_start(day, hour) + timedelta(hours=1) <= at:
        raise FlowError("hour")
    if db.get(Manager, int(manager_id)) is None:
        raise FlowError("unit")
    c = _clean_counts(counts)
    if not c:
        raise FlowError("count")
    comment = (comment or "").strip() or None
    if reason not in EXTRA_REASONS:
        raise FlowError("reason")
    if reason == "other" and not comment:
        raise FlowError("comment")
    if db.query(ContainerExtra.id).filter(ContainerExtra.manager_id == int(manager_id),
                                          ContainerExtra.day == day, ContainerExtra.hour == hour,
                                          ContainerExtra.status == "asked").first():
        raise FlowError("extra_dup")
    e = ContainerExtra(day=day, hour=hour, manager_id=int(manager_id), lines=c, reason=reason,
                       comment=comment, status="asked", asked_at=at, asked_by=actor, asked_key=actor_key)
    db.add(e)
    db.flush()
    return e


def cancel_extra(db: Session, extra_id: int, manager_id: Optional[int], actor) -> ContainerExtra:
    """The brigadir withdraws their ask while AXO has not answered it.
    `manager_id` None = an admin (any unit)."""
    e = _extra(db, extra_id)
    if manager_id is not None and e.manager_id != int(manager_id):
        raise FlowError("not_yours")
    if e.status != "asked":
        raise FlowError("state")
    e.status, e.decided_at, e.decided_by = "cancelled", now(), actor
    return e


def approve_extra(db: Session, extra_id: int, counts: dict, logistics_key: str, note, actor,
                  actor_key) -> tuple:
    """AXO allows the ask — all of it or fewer of each type, never more — and
    sends it to a logistics person as a request for that hour. Returns
    (extra, request)."""
    e = _extra(db, extra_id)
    if e.status != "asked":
        raise FlowError("state")
    c = _clean_counts(counts)
    if not c:
        raise FlowError("count")
    if any(k not in (e.lines or {}) or n > int(e.lines[k]) for k, n in c.items()):
        raise FlowError("over_ask")
    r = create_request(db, e.day, e.hour, logistics_key, c, note, actor, actor_key)
    e.status, e.approved, e.request_id = "approved", c, r.id
    e.decided_at, e.decided_by, e.decided_key = now(), actor, actor_key
    e.decision_note = (note or "").strip() or None
    return e, r


def reject_extra(db: Session, extra_id: int, note, actor, actor_key) -> ContainerExtra:
    """AXO says no — always with the reason, which the brigadir reads."""
    e = _extra(db, extra_id)
    if e.status != "asked":
        raise FlowError("state")
    note = (note or "").strip()
    if not note:
        raise FlowError("note")
    e.status, e.decided_at, e.decided_by, e.decided_key, e.decision_note = "rejected", now(), actor, actor_key, note
    return e


def _extra_stage(e: ContainerExtra, r: Optional[ContainerRequest], parts: list) -> str:
    """Where an ask stands, in one word: asked · rejected · cancelled ·
    logistics (approved, waiting to be split) · split · received · withdrawn
    (approved, then its request was cancelled or deleted)."""
    if e.status != "approved":
        return e.status
    if r is None or r.status == "cancelled":
        return "withdrawn"
    if r.status == "requested":
        return "logistics"
    mine = [p for p in parts if p.manager_id == e.manager_id]
    return "received" if mine and all(p.received is not None for p in mine) else "split"


def extras_of(db: Session, day: date, manager_id: Optional[int] = None) -> list:
    """The day's asks (one unit's when given), each with its stage and — once
    approved — the request it became."""
    q = db.query(ContainerExtra).filter(ContainerExtra.day == day)
    if manager_id is not None:
        q = q.filter(ContainerExtra.manager_id == int(manager_id))
    rows = q.order_by(ContainerExtra.hour, ContainerExtra.id).all()
    rids = [e.request_id for e in rows if e.request_id]
    reqs = {r.id: r for r in db.query(ContainerRequest).filter(ContainerRequest.id.in_(rids)).all()} if rids else {}
    parts: dict = {}
    if rids:
        for p in db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id.in_(rids)).all():
            parts.setdefault(p.request_id, []).append(p)
    mids = {e.manager_id for e in rows}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    out = []
    for e in rows:
        r = reqs.get(e.request_id)
        ps = parts.get(e.request_id, [])
        got = {p.ctype: p.received for p in ps if p.manager_id == e.manager_id and p.received is not None}
        out.append({
            "id": e.id, "day": e.day.isoformat(), "hour": e.hour, "manager_id": e.manager_id,
            "unit": getattr(units.get(e.manager_id), "name", None),
            "shift": getattr(units.get(e.manager_id), "shift", None),
            "lines": {k: e.lines[k] for k in KEYS if k in (e.lines or {})},
            "reason": e.reason, "comment": e.comment, "status": e.status,
            "stage": _extra_stage(e, r, ps),
            "asked_at": _iso(e.asked_at), "asked_by": e.asked_by,
            "decided_at": _iso(e.decided_at), "decided_by": e.decided_by, "decision_note": e.decision_note,
            "approved": {k: e.approved[k] for k in KEYS if k in (e.approved or {})} if e.approved else None,
            "received": got or None,
            "request": None if r is None else {"id": r.id, "status": r.status,
                                               "logistics_name": r.logistics_name,
                                               "cancel_note": r.cancel_note},
        })
    return out


def axo_people(db: Session) -> list:
    """Who hears of a brigadir's ask: every PROFILE holding a personal grant of
    AXO's page (`page.view.container-flow`) — Fozilova Dilafruz today."""
    rows = db.query(ProfilePermission).filter(ProfilePermission.capability == "page.view.container-flow",
                                              ProfilePermission.mode == "grant").all()
    return sorted({r.profile_key for r in rows})


_TG_EXTRA = {
    "uz": {"new": "Brigadirdan qo'shimcha konteyner so'rovi", "approved": "Qo'shimcha so'rovingiz tasdiqlandi",
           "rejected": "Qo'shimcha so'rovingiz rad etildi", "unit": "Brigadir", "hour": "Soat",
           "asked": "So'radi", "ok": "Tasdiqlandi", "to": "Logistika", "why": "Sabab", "note": "Izoh",
           "btn": "📦 Konteyner berish",
           "reason": {"plan": "Reja oshdi", "damaged": "Konteyner yaroqsiz", "short": "Kam keldi", "other": "Boshqa"}},
    "uz_cyrl": {"new": "Бригадирдан қўшимча контейнер сўрови", "approved": "Қўшимча сўровингиз тасдиқланди",
                "rejected": "Қўшимча сўровингиз рад этилди", "unit": "Бригадир", "hour": "Соат",
                "asked": "Сўради", "ok": "Тасдиқланди", "to": "Логистика", "why": "Сабаб", "note": "Изоҳ",
                "btn": "📦 Контейнер бериш",
                "reason": {"plan": "Режа ошди", "damaged": "Контейнер яроқсиз", "short": "Кам келди", "other": "Бошқа"}},
    "ru": {"new": "Бригадир просит дополнительные контейнеры", "approved": "Ваша доп. заявка одобрена",
           "rejected": "Ваша доп. заявка отклонена", "unit": "Бригадир", "hour": "Час",
           "asked": "Просит", "ok": "Одобрено", "to": "Логистика", "why": "Причина", "note": "Комментарий",
           "btn": "📦 Выдача контейнеров",
           "reason": {"plan": "План вырос", "damaged": "Контейнеры негодны", "short": "Пришло меньше", "other": "Другое"}},
    "en": {"new": "A brigadir asks for extra containers", "approved": "Your extra request was approved",
           "rejected": "Your extra request was refused", "unit": "Brigadir", "hour": "Hour",
           "asked": "Asked", "ok": "Approved", "to": "Logistics", "why": "Reason", "note": "Note",
           "btn": "📦 Container issuing",
           "reason": {"plan": "Plan grew", "damaged": "Containers unusable", "short": "Arrived short", "other": "Other"}},
}


def _extra_body(kind: str, lang: str, rows: list) -> str:
    from html import escape as _esc
    t = _TG_EXTRA.get(lang) or _TG_EXTRA["uz"]
    icon = {"new": "🆕", "approved": "✅", "rejected": "⛔"}[kind]
    out = [f"{icon} <b>{_esc(t[kind], quote=False)}</b>", ""]
    out += [f"{t[k]}: <b>{_esc(str(v), quote=False)}</b>" for k, v in rows if v not in (None, "")]
    return "\n".join(out)


def _extra_markup(tab: str):
    def _markup(lang: str):
        from telebot import types
        from app.config import settings as cfg
        t = _TG_EXTRA.get(lang) or _TG_EXTRA["uz"]
        kb = types.InlineKeyboardMarkup()
        kb.add(types.InlineKeyboardButton(t["btn"], web_app=types.WebAppInfo(
            url=f"{cfg.webapp_url.rstrip('/')}{NOTIFY_PAGE}?tab={tab}")))
        return kb
    return _markup


def _extra_why(lang: str, e: ContainerExtra) -> str:
    t = _TG_EXTRA.get(lang) or _TG_EXTRA["uz"]
    return " — ".join(x for x in (t["reason"].get(e.reason, e.reason), e.comment or "") if x)


def notify_extra_new(extra_id: int) -> int:
    """Tell AXO a brigadir asked (switch `notify_extra`). Own session; never
    raises. Returns how many AXO profiles were told."""
    from app.database import SessionLocal
    from app.translit import transliterate
    db = SessionLocal()
    try:
        if not settings(db)["notify_extra"]:
            return 0
        e = db.get(ContainerExtra, extra_id)
        if e is None or e.status != "asked":
            return 0
        unit = profile_name(db, f"supervisor:{e.manager_id}") or "—"
        keys = axo_people(db)
        from app.routers.staff import notify_profile

        def body(lang):
            return _extra_body("new", lang, [
                ("unit", transliterate(unit, lang)), ("hour", hour_span(e.hour)),
                ("asked", counts_text(e.lines or {}, lang)), ("why", _extra_why(lang, e))])
        for key in keys:
            notify_profile(db, key, "container_extra_new",
                           {"hour": hour_span(e.hour), "counts": counts_text(e.lines or {}), "name": unit},
                           type="warning", html_fn=body, markup_fn=_extra_markup("requests"),
                           subject=("page", NOTIFY_PAGE))
        db.commit()
        return len(keys)
    except Exception:
        db.rollback()
        logger.warning("container-flow: extra notice failed", exc_info=True)
        return 0
    finally:
        db.close()


def notify_extra_decided(extra_id: int) -> bool:
    """Tell the brigadir AXO's answer — only while «Sozlamalar» → brigadirs is
    on and only to a brigadir who may open the extra request (a card that
    leads to «no access» is worse than none). Own session; never raises."""
    from app.database import SessionLocal
    from app.translit import transliterate
    db = SessionLocal()
    try:
        if not settings(db)["notify_brigadirs"]:
            return False
        e = db.get(ContainerExtra, extra_id)
        if e is None or e.status not in ("approved", "rejected") or not extra_open(db, e.manager_id):
            return False
        r = db.get(ContainerRequest, e.request_id) if e.request_id else None
        ok = e.status == "approved"
        from app.routers.staff import notify_profile

        def body(lang):
            rows = [("hour", hour_span(e.hour)), ("asked", counts_text(e.lines or {}, lang))]
            if ok:
                rows += [("ok", counts_text(e.approved or {}, lang)),
                         ("to", transliterate((r.logistics_name if r else "") or "", lang))]
            rows += [("note" if ok else "why", e.decision_note or "")]
            return _extra_body(e.status, lang, rows)
        notify_profile(db, f"supervisor:{e.manager_id}", f"container_extra_{e.status}",
                       {"hour": hour_span(e.hour),
                        "counts": counts_text((e.approved if ok else e.lines) or {}),
                        "note": e.decision_note or ""},
                       type="success" if ok else "warning", html_fn=body,
                       markup_fn=_extra_markup("receive"), subject=("page", NOTIFY_PAGE))
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.warning("container-flow: extra decision notice failed", exc_info=True)
        return False
    finally:
        db.close()


def extra_later(kind: str, extra_id: int) -> None:
    import threading
    fn = notify_extra_new if kind == "new" else notify_extra_decided
    threading.Thread(target=fn, args=(extra_id,), daemon=True).start()


def extras_report(db: Session, d_from: date, d_to: date) -> dict:
    """«Tahlil»: the period's asks — how many, how many containers asked and
    approved, AXO's answers, per brigadir and per reason. A brigadir who keeps
    asking is the sign that the plan's figures for their lines are wrong.
    Asks the brigadir withdrew count only in `cancelled`."""
    rows = db.query(ContainerExtra).filter(ContainerExtra.day >= d_from, ContainerExtra.day <= d_to).all()
    live = [e for e in rows if e.status != "cancelled"]
    tot = lambda o: sum(int(v or 0) for v in (o or {}).values())        # noqa: E731
    s = {"asks": len(live), "approved": sum(e.status == "approved" for e in live),
         "rejected": sum(e.status == "rejected" for e in live), "waiting": sum(e.status == "asked" for e in live),
         "cancelled": len(rows) - len(live), "asked_n": sum(tot(e.lines) for e in live),
         "approved_n": sum(tot(e.approved) for e in live if e.status == "approved")}
    mids = {e.manager_id for e in live}
    units = {m.id: m for m in db.query(Manager).filter(Manager.id.in_(mids)).all()} if mids else {}
    per: dict = {}
    reasons = {k: 0 for k in EXTRA_REASONS}
    for e in live:
        u = per.setdefault(e.manager_id, {"manager_id": e.manager_id,
                                          "unit": getattr(units.get(e.manager_id), "name", None),
                                          "shift": getattr(units.get(e.manager_id), "shift", None),
                                          "asks": 0, "asked_n": 0, "approved_n": 0, "approved": 0,
                                          "rejected": 0, "waiting": 0, "reasons": {}})
        u["asks"] += 1
        u["asked_n"] += tot(e.lines)
        if e.status == "approved":
            u["approved"] += 1
            u["approved_n"] += tot(e.approved)
        elif e.status == "rejected":
            u["rejected"] += 1
        else:
            u["waiting"] += 1
        u["reasons"][e.reason] = u["reasons"].get(e.reason, 0) + 1
        reasons[e.reason] = reasons.get(e.reason, 0) + 1
    out_units = []
    for u in per.values():
        u["top_reason"] = sorted(u["reasons"], key=lambda k: (
            -u["reasons"][k], EXTRA_REASONS.index(k) if k in EXTRA_REASONS else 99))[0]
        out_units.append(u)
    out_units.sort(key=lambda u: (-u["asks"], -u["asked_n"], u["unit"] or ""))
    return {"summary": s, "units": out_units, "reasons": reasons}
