"""Container issuing: AXO → a logistics person → brigadirs
(docs/containers-flow.md).

AXO sends a REQUEST — the counts per container type and the production hour —
to one logistics person or to all of them; a logistics person splits it
across brigadirs, each within their limit (the hour's figure on
«Konteynerlar», carried over through the day); each brigadir confirms what
reached their line. A brigadir may ask AXO for extra; AXO keeps its stock.

The automatic BATCHES the first design drafted for each enrolled unit and
hour («Partiyalar») were removed on 2026-11-18 — the request flow had
replaced them and no unit used them. Their tables (`container_batches`,
`container_batch_lines`, `container_shares`, `container_events`) and data stay
in the database; «AXO zaxirasi» still counts a batch issued in the past."""
from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import text  # noqa: F401 — the tests run raw SQL through it
from sqlalchemy.orm import Session

from app.models import (AppSetting, ContainerBatch, ContainerBatchLine, ContainerExtra,
                        ContainerRequest, ContainerRequestPart, ContainerSendArea, ContainerStockMove,
                        Manager, ProfilePermission, RoleProfile)
from app.services import hourly_containers

logger = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")
KEYS = hourly_containers.KEYS
# «Jo'natish» (2026-11-19): the packaging a DISPATCH area sends the product
# out in — a container and its lid. They leave the factory with the goods and
# never come back, so they are their own types beside the reusable crates
# (`KEYS`), asked for a dispatch area (`ContainerSendArea`) and added into
# every total (the stock, «Tahlil», «Hisobot»).
SEND_KEYS = ("send", "lid")
ALL_KEYS = tuple(KEYS) + SEND_KEYS
REASONS = ("short", "damaged", "wrong_type", "other")
DRAFT_MIN = 120          # a request made this long before its hour is on time …
LEAD_MIN = 60            # … and is due at the brigadirs this long before it
GRACE_MIN = 10           # slack before a request counts as made late
TICK_MIN = 5
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


class FlowError(ValueError):
    """A step the request's state or the entered numbers do not allow. `code`
    is what the page translates (`cflow.err.<code>`)."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def now() -> datetime:
    return datetime.now(TZ)


def hour_start(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(0), TZ) + timedelta(hours=int(hour))


# The production day opens at 08:00 (the page's `DAY_START_MIN`): 00:00–07:59
# still belongs to the day that started the evening before, as its hours 24–31.
DAY_START_HOUR = 8


def production_day(at: datetime) -> date:
    """The production day running at `at`."""
    t = at.astimezone(TZ)
    return t.date() - timedelta(days=1) if t.hour < DAY_START_HOUR else t.date()


# ── settings ────────────────────────────────────────────────────────────────

def settings(db: Session) -> dict:
    """The «Sozlamalar» switches — each message the page sends has its own."""
    rows = {r.key: r.value for r in db.query(AppSetting).filter(
        AppSetting.key.in_([_NOTIFY_KEY, _NOTIFY_BRIG_KEY, _NOTIFY_AXO_KEY, _NOTIFY_SM_KEY,
                            _NOTIFY_EXTRA_KEY])).all()}
    return {"notify": rows.get(_NOTIFY_KEY) == "1",
            "notify_brigadirs": rows.get(_NOTIFY_BRIG_KEY) == "1",
            "notify_axo": rows.get(_NOTIFY_AXO_KEY, "1") == "1",
            "notify_managers": rows.get(_NOTIFY_SM_KEY) == "1",
            "notify_extra": rows.get(_NOTIFY_EXTRA_KEY, "1") == "1"}


def save_settings(db: Session, notify: Optional[bool] = None,
                  notify_brigadirs: Optional[bool] = None, notify_axo: Optional[bool] = None,
                  notify_managers: Optional[bool] = None, notify_extra: Optional[bool] = None) -> dict:
    """A switch given as None stays as it is (a tab on an older bundle saves
    without it)."""
    vals = {}
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


# ── deadlines and the clock ─────────────────────────────────────────────────

def _due(hs: datetime, at: datetime) -> datetime:
    """Delivery deadline: an hour before H for a request made in time, an hour
    after it was made for one made later — it is judged from when it existed."""
    if at <= hs - timedelta(minutes=DRAFT_MIN - GRACE_MIN):
        return hs - timedelta(minutes=LEAD_MIN)
    return at + timedelta(minutes=LEAD_MIN)


def tick() -> None:
    """The clock's pass (every TICK_MIN minutes): the brigadirs' reminder, the
    overdue alert and the escalation — each on its own, so one failing never
    stops the rest. Never raises."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        for name, fn in (("reminder", remind_unconfirmed),
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
    """Every TICK_MIN minutes (mirrored in passenger_wsgi.py)."""
    from app.scheduler import schedule_interval
    schedule_interval("container-flow", tick, minutes=TICK_MIN)


# ── numbers ─────────────────────────────────────────────────────────────────

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


def split(delivered: int, dues: list) -> list:
    """`delivered` containers between brigadirs by what each may take (`dues`):
    everybody whole when there are enough (the rest stays unsplit), otherwise
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


# ── reading ─────────────────────────────────────────────────────────────────

def _iso(v) -> Optional[str]:
    return v.astimezone(TZ).isoformat(timespec="minutes") if v else None


def readiness(db: Session, day: date) -> list:
    """Per unit with a «Zagruzka fayli»: how much of the day's plan the hours
    can see — the planned lines, those with a container capacity, and those
    with an hour (a capacity AND a labour standard, in a team with people).
    A line with no hour adds nothing to its brigadir's limit, so the brigadir
    asks AXO for extra until the catalog is filled."""
    from fastapi import HTTPException
    from app.routers import production
    out = []
    configured = production._configured_manager_ids(db)
    for m in flow_units(db).all():
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
# A request to EVERY logistics person at once (2026-11-18, the operator: «AXO
# should send one request and this request should go to both, and one of them
# should approve it, and that's all»). Its `logistics_key` stays ALL_KEY while
# it waits; whoever splits it first takes it — `assign_request` writes their
# key and name over it — and the other one finds it taken. A request no
# longer waits on one person who is off shift.
ALL_KEY = "*"


# The flow is ONE plant's (2026-11-20, the operator: «remove Axmedova Munisa
# from the container page — she is in another factory»). Keles has its own AXO
# and its own floor; these containers move inside Uchtepa. Resolved by NAME,
# never by id (ids differ between a checkout and production — the weekly
# deck's `DECK_FACTORY` rule). A unit placed in ANOTHER plant is never offered,
# split to, or counted in a need; a unit no plant was set for yet stays — as
# everywhere in `factory_scope`, an unplaced row is never silently dropped. No
# plant by that name → nothing is narrowed.
FLOW_FACTORY = "Uchtepa"


def flow_factory_id(db: Session) -> Optional[int]:
    from app.models import Factory
    wanted = FLOW_FACTORY.casefold()
    for f in db.query(Factory).filter(Factory.archived.is_(False)).all():
        if any((n or "").strip().casefold() == wanted
               for n in (f.code, f.name_uz, f.name_uz_cyrl, f.name_ru, f.name_en)):
            return f.id
    return None


def flow_units(db: Session):
    """THE brigadirs the flow serves: not archived, and not in another plant
    (a query, ordered by name — callers add `.all()` or read ids)."""
    from sqlalchemy import or_
    q = db.query(Manager).filter(Manager.archived.is_(False))
    fid = flow_factory_id(db)
    if fid is not None:
        q = q.filter(or_(Manager.factory_id == fid, Manager.factory_id.is_(None)))
    return q.order_by(Manager.name)


def flow_unit_ids(db: Session) -> list:
    return [m.id for m in flow_units(db).with_entities(Manager.id).all()]


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


def _clean_counts(counts: dict, keys=KEYS) -> dict:
    return {k: _count(v) for k, v in (counts or {}).items() if k in keys and v}


def _area(db: Session, area_id) -> ContainerSendArea:
    try:
        a = db.get(ContainerSendArea, int(area_id))
    except (TypeError, ValueError):
        a = None
    if a is None or a.archived:
        raise FlowError("area")
    return a


def create_request(db: Session, day: date, hour: int, logistics_key: str, counts: dict,
                   note, actor, actor_key, area_id=None) -> ContainerRequest:
    """A request to a logistics person (or all of them): for the brigadirs —
    crate types, split later — or, with `area_id`, for a dispatch area — its
    container and lid (`SEND_KEYS`), delivered there whole."""
    if not (0 <= int(hour) <= 47):
        raise FlowError("hour")
    people = {p["key"]: p["name"] for p in logistics_people(db)}
    if logistics_key not in people and not (logistics_key == ALL_KEY and people):
        raise FlowError("logistics")
    area = _area(db, area_id) if area_id is not None else None
    # ONE request for the hour (2026-11-19, the operator: «we have to do it all
    # in the same request»): the brigadirs' crates AND the dispatch containers
    # and lids; an area's own request (the first design, kept for those made)
    # carries the dispatch types only
    c = _clean_counts(counts, SEND_KEYS if area else ALL_KEYS)
    if not c:
        raise FlowError("count")
    at = now()
    r = ContainerRequest(day=day, hour=int(hour), lines=c, note=(note or "").strip() or None,
                         area_id=area.id if area else None, area_name=area.name if area else None,
                         logistics_key=logistics_key, logistics_name=people.get(logistics_key),
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
                   actor_key, is_admin: bool, dispatch: Optional[dict] = None) -> ContainerRequest:
    """The logistics person splits the request across brigadirs: `parts` is
    [{manager_id, counts}] — and, from 2026-11-19, gives `dispatch`
    {ctype: n}: what went to the dispatch areas, ONE amount (the operator: «one
    lump to dispatch»), any type the request carries, no limit and nobody
    confirms it — it is stored on the request (`given`). No type may go over
    what was asked in all; fewer needs a reason. Only the addressee (or an
    admin) may do it, once."""
    r = _request(db, request_id)       # row-locked: of two people splitting at once, one wins
    if r.status == "assigned" and r.logistics_key != actor_key:
        raise FlowError("taken")        # somebody else split it first
    if r.status != "requested":
        raise FlowError("state")
    if r.area_id is not None:
        raise FlowError("area_split")   # a dispatch area's request is delivered (`deliver_request`)
    people = {p["key"]: p["name"] for p in logistics_people(db)}
    to_all = r.logistics_key == ALL_KEY
    if not is_admin and not (actor_key == r.logistics_key or (to_all and actor_key in people)):
        raise FlowError("not_yours")
    given: dict = {}
    clean = []
    served = None
    for p in parts or []:
        mid = int(p.get("manager_id") or 0)
        c = _clean_counts(p.get("counts"))
        if not c:
            continue
        if served is None:
            served = set(flow_unit_ids(db))
        if mid not in served:   # no such unit, archived, or another plant's
            raise FlowError("unit")
        for k, n in c.items():
            if k not in r.lines:
                raise FlowError("type")
            given[k] = given.get(k, 0) + n
        clean.append((mid, c))
    lump = _clean_counts(dispatch, ALL_KEYS) if dispatch else {}
    for k, n in lump.items():
        if k not in r.lines:
            raise FlowError("type")
        given[k] = given.get(k, 0) + n
    if not clean and not lump:
        raise FlowError("count")
    if any(given.get(k, 0) > n for k, n in r.lines.items()):
        raise FlowError("over")
    extra = extra_unit_of(db, r.id)
    if extra is not None:
        # a brigadir's EXTRA, approved by AXO: to that unit only, and past its
        # limit by exactly what AXO approved (the request's own counts)
        if lump or any(mid != extra for mid, _c in clean):
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
    # to which cell how many — by the same weights the split dialog showed
    cw = cell_weights(db, r.day, r.hour, r.id) if merged else {}
    for (mid, k), n in merged.items():
        db.add(ContainerRequestPart(request_id=r.id, manager_id=mid, ctype=k, count=n,
                                    cells=cell_split(cw.get(mid), k, n) or None))
    r.given = lump or None
    at = now()
    r.status, r.assigned_at, r.assigned_by, r.late = "assigned", at, actor, at > r.due_at
    if to_all:
        # sent to everybody — it is now the request of whoever took it
        r.logistics_key = actor_key or ALL_KEY
        r.logistics_name = people.get(actor_key) or actor
    return r


def deliver_request(db: Session, request_id: int, counts: dict, reason, comment, actor,
                    actor_key, is_admin: bool) -> ContainerRequest:
    """The logistics person took a dispatch area's request there (2026-11-19):
    what was DELIVERED per type — never more than asked, fewer with a reason.
    Only the addressee (any logistics person on a request to everybody — the
    first takes it) or an admin, once. Nobody confirms it: the packaging leaves
    with the product, and what was delivered is what left AXO."""
    r = _request(db, request_id)
    if r.area_id is None:
        raise FlowError("not_area")
    if r.status == "assigned" and r.logistics_key != actor_key:
        raise FlowError("taken")
    if r.status != "requested":
        raise FlowError("state")
    people = {p["key"]: p["name"] for p in logistics_people(db)}
    to_all = r.logistics_key == ALL_KEY
    if not is_admin and not (actor_key == r.logistics_key or (to_all and actor_key in people)):
        raise FlowError("not_yours")
    c = _clean_counts(counts, SEND_KEYS)
    if not c:
        raise FlowError("count")
    if any(k not in (r.lines or {}) for k in c):
        raise FlowError("type")
    if any(c.get(k, 0) > n for k, n in (r.lines or {}).items()):
        raise FlowError("over")
    if any(c.get(k, 0) < n for k, n in (r.lines or {}).items()):
        r.short_reason, r.short_comment = _why(reason, comment)
    at = now()
    r.given = c
    r.status, r.assigned_at, r.assigned_by, r.late = "assigned", at, actor, at > r.due_at
    if to_all:
        r.logistics_key = actor_key or ALL_KEY
        r.logistics_name = people.get(actor_key) or actor
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


def edit_request(db: Session, request_id: int, hour: int, logistics_key: str, counts: dict,
                 note, area_id=None) -> tuple:
    """AXO changes a request while it still waits (2026-11-18, the operator:
    AXO could only cancel a request and make a new one): the hour, the counts,
    whom it goes to, the note. Once split it is the brigadirs' — cancelling
    stays the tool. A changed request is NEW again for whoever splits it
    (`seen_at` cleared); a new hour moves its deadline (`_due` from now) and
    re-arms the overdue alert. A brigadir's approved extra keeps its hour and
    never goes past what the brigadir asked (`approved` follows the counts).
    Returns (request, [(field, old, new)], the old addressee key)."""
    r = _request(db, request_id)
    if r.status != "requested":
        raise FlowError("state")
    hour = int(hour)
    if not (0 <= hour <= 47):
        raise FlowError("hour")
    people = {p["key"]: p["name"] for p in logistics_people(db)}
    if logistics_key not in people and not (logistics_key == ALL_KEY and people):
        raise FlowError("logistics")
    # a dispatch area's request stays one (its area may change); a brigadirs' one stays theirs
    area = None
    if r.area_id is not None and area_id is not None and int(area_id) != r.area_id:
        area = _area(db, area_id)
    c = _clean_counts(counts, SEND_KEYS if r.area_id is not None else ALL_KEYS)
    if not c:
        raise FlowError("count")
    extra = db.query(ContainerExtra).filter(ContainerExtra.request_id == r.id).first()
    if extra is not None:
        if hour != r.hour:
            raise FlowError("extra_hour")
        if any(k not in (extra.lines or {}) or n > int(extra.lines[k]) for k, n in c.items()):
            raise FlowError("over_ask")
    note = (note or "").strip() or None
    name = lambda key: "*" if key == ALL_KEY else (people.get(key) or key)      # noqa: E731
    changes = []
    if hour != r.hour:
        changes.append(("hour", hour_span(r.hour), hour_span(hour)))
    if c != dict(r.lines or {}):
        changes.append(("counts", counts_text(r.lines or {}), counts_text(c)))
    if logistics_key != r.logistics_key:
        changes.append(("to", name(r.logistics_key), name(logistics_key)))
    if area is not None:
        changes.append(("area", r.area_name or "", area.name))
    if note != r.note:
        changes.append(("note", r.note or "", note or ""))
    old_key = r.logistics_key
    if not changes:
        return r, [], old_key
    if hour != r.hour:
        r.hour, r.due_at, r.overdue_alerted_at = hour, _due(hour_start(r.day, hour), now()), None
    r.lines, r.note = c, note
    r.logistics_key, r.logistics_name = logistics_key, people.get(logistics_key)
    if area is not None:
        r.area_id, r.area_name = area.id, area.name
    r.seen_at = None
    if extra is not None:
        extra.approved = c
    return r, changes, old_key


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
    if r is None or not actor_key or r.seen_at is not None:
        return False
    if r.logistics_key != actor_key and not (
            r.logistics_key == ALL_KEY and actor_key in {p["key"] for p in logistics_people(db)}):
        return False
    r.seen_at = now()       # sent to everybody: the first one who opens it
    return True


def requests_of(db: Session, day: date, logistics_key: Optional[str] = None) -> list:
    """The day's requests (only those addressed to `logistics_key` when given),
    with their parts and each part's brigadir."""
    at = now()
    q = db.query(ContainerRequest).filter(ContainerRequest.day == day)
    if logistics_key is not None:
        # theirs, and those sent to everybody (still waiting, or taken by them)
        q = q.filter(ContainerRequest.logistics_key.in_([logistics_key, ALL_KEY]))
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
                                                  "received_comment": None, "reminded_at": None,
                                                  "cells": {}})
            u["counts"][p.ctype] = p.count
            for c, n in (p.cells or {}).items():
                u["cells"].setdefault(c, {})[p.ctype] = n
            if p.reminded_at is not None:
                u["reminded_at"] = _iso(p.reminded_at)
            if p.received is not None:
                u["received"] = {**(u["received"] or {}), p.ctype: p.received}
                u["received_at"], u["received_by"] = _iso(p.received_at), p.received_by
                u["received_reason"], u["received_comment"] = p.received_reason, p.received_comment
        out.append({
            "id": r.id, "day": r.day.isoformat(), "hour": r.hour,
            "lines": {k: r.lines[k] for k in ALL_KEYS if k in (r.lines or {})}, "note": r.note,
            # a dispatch area's request (2026-11-19): the area, and what was delivered there
            "area_id": r.area_id, "area": r.area_name,
            # an area's request: what was delivered there; a split one: what went to dispatch
            "given": dict(r.given) if r.given is not None else None,
            "logistics_key": r.logistics_key, "logistics_name": r.logistics_name,
            "status": r.status, "due_at": _iso(r.due_at), "created_at": _iso(r.created_at),
            "created_by": r.created_by, "assigned_at": _iso(r.assigned_at), "assigned_by": r.assigned_by,
            "late": r.late, "overdue": r.status == "requested" and at > r.due_at,
            "short_reason": r.short_reason, "short_comment": r.short_comment,
            "cancelled_at": _iso(r.cancelled_at), "cancelled_by": r.cancelled_by, "cancel_note": r.cancel_note,
            "seen_at": _iso(r.seen_at), "parts": list(by_unit.values()),
            "receipt": _receipt(list(by_unit.values())) if r.status == "assigned" and r.area_id is None else None,
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
    # `asked` / `given` are BOTH sides together (2026-11-19, the operator: «we have
    # to add them together»); `in_*` the brigadirs', `send_*` the dispatch areas'
    s = {"requests": 0, "cancelled": 0, "waiting": 0, "overdue": 0, "assigned": 0, "on_time": 0,
         "late": 0, "short": 0, "asked": 0, "given": 0, "units": 0, "confirmed": 0,
         "sent_confirmed": 0, "received": 0, "in_asked": 0, "in_given": 0, "send_asked": 0,
         "send_given": 0, "send_requests": 0}
    reasons = {k: 0 for k in REASONS}
    seen_min, assign_min = [], []
    days: dict = {}
    people: dict = {}
    for r in rows:
        d = days.setdefault(r.day, {"day": r.day.isoformat(), "requests": 0, "asked": 0, "given": 0,
                                    "received": 0, "sent_confirmed": 0, "late": 0, "overdue": 0, "short": 0,
                                    "in_given": 0, "send_given": 0})
        s["requests"] += 1
        d["requests"] += 1
        if r.status == "cancelled":
            s["cancelled"] += 1
            continue
        asked = sum((r.lines or {}).values())
        s["asked"] += asked
        d["asked"] += asked
        # asked: the crates vs the dispatch types; given (below): to the brigadirs vs to dispatch
        snd = sum(int(n or 0) for k, n in (r.lines or {}).items() if k in SEND_KEYS)
        s["send_asked"] += snd
        s["in_asked"] += asked - snd
        if snd:
            s["send_requests"] += 1
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
        # what went to dispatch (a split's amount, or an area's delivery) — nobody confirms it
        g = sum(int(n or 0) for n in (r.given or {}).values())
        for f in ("given", "send_given"):
            s[f] += g
            d[f] += g
        by_unit: dict = {}
        for p in parts.get(r.id, []):
            for f in ("given", "in_given"):
                s[f] += p.count
                d[f] += p.count
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
    ids = flow_unit_ids(db)
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
    types = {k: {"ctype": k, "asked": 0, "given": 0, "received": 0} for k in ALL_KEYS}
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
        for k, n in (r.given or {}).items():          # what went to dispatch
            h["given"] += int(n or 0)
            if k in types:
                types[k]["given"] += int(n or 0)
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
    try:
        sending = sending_report(db, d_from, d_to)
    except Exception:
        logger.warning("container-flow: sending report failed", exc_info=True)
        db.rollback()
        sending = None
    return {"from": d_from.isoformat(), "to": d_to.isoformat(), "summary": s, "days": days,
            "need_vs_got": nvg, "extras": extras, "sending": sending,
            "hours": [hours[h] for h in sorted(hours)],
            "types": [types[k] for k in ALL_KEYS if types[k]["asked"] or types[k]["given"]],
            "units": sorted(out_units, key=lambda u: (-u["given"], u["unit"] or "")),
            "reasons": base["reasons"], "receipt_reasons": receipt_reasons, "people": base["people"]}


# ── Telegram to the addressee (behind the «Sozlamalar» switch) ──────────────
_CT_NAMES = {
    "uz": {"yellow": "To'rtburchak", "round": "Dumaloq", "grey": "Kulrang", "bucket": "Chelak", "box": "Yashik",
           "send": "Jo'natish konteyneri", "lid": "Krishka"},
    "uz_cyrl": {"yellow": "Тўртбурчак", "round": "Думалоқ", "grey": "Кулранг", "bucket": "Челак", "box": "Яшик",
                "send": "Жўнатиш контейнери", "lid": "Крышка"},
    "ru": {"yellow": "Прямоугольный", "round": "Круглый", "grey": "Серый", "bucket": "Челак", "box": "Ящик",
           "send": "Контейнер (отправка)", "lid": "Крышка"},
    "en": {"yellow": "Rectangle", "round": "Round", "grey": "Grey", "bucket": "Bucket", "box": "Crate",
           "send": "Dispatch container", "lid": "Lid"},
}
_TG = {
    "uz": {"new": "Yangi konteyner so'rovi", "cancelled": "Konteyner so'rovi bekor qilindi",
           "edited": "Konteyner so'rovi o'zgartirildi", "moved": "Konteyner so'rovi boshqa logistga o'tkazildi",
           "moved_hint": "Bu so'rovni endi siz taqsimlamaysiz.",
           "hour": "Soat", "due": "Muddat", "by": "Yubordi", "note": "Izoh", "why": "Sabab",
           "hint": "Brigadirlarga taqsimlang.", "btn": "📦 So'rovni ochish",
           "hint_all": "Barcha logistlarga yuborildi — birinchi taqsimlagan oladi.", "all": "Barcha logistlarga",
           "area": "Jo'natish", "hint_area": "Jo'natish joyiga yetkazing.",
           "hint_send": "Brigadirlarga taqsimlang, jo'natish konteyner va krishkalarini jo'natishga bering."},
    "uz_cyrl": {"new": "Янги контейнер сўрови", "cancelled": "Контейнер сўрови бекор қилинди",
                "edited": "Контейнер сўрови ўзгартирилди", "moved": "Контейнер сўрови бошқа логистга ўтказилди",
                "moved_hint": "Бу сўровни энди сиз тақсимламайсиз.",
                "hour": "Соат", "due": "Муддат", "by": "Юборди", "note": "Изоҳ", "why": "Сабаб",
                "hint": "Бригадирларга тақсимланг.", "btn": "📦 Сўровни очиш",
                "hint_all": "Барча логистларга юборилди — биринчи тақсимлаган олади.", "all": "Барча логистларга",
                "area": "Жўнатиш", "hint_area": "Жўнатиш жойига етказинг.",
                "hint_send": "Бригадирларга тақсимланг, жўнатиш контейнер ва крышкаларини жўнатишга беринг."},
    "ru": {"new": "Новая заявка на контейнеры", "cancelled": "Заявка на контейнеры отменена",
           "edited": "Заявка на контейнеры изменена", "moved": "Заявка на контейнеры передана другому логисту",
           "moved_hint": "Эту заявку теперь распределяете не вы.",
           "hour": "Час", "due": "Срок", "by": "Отправил(а)", "note": "Комментарий", "why": "Причина",
           "hint": "Распределите по бригадирам.", "btn": "📦 Открыть заявку",
           "hint_all": "Отправлено всем логистам — берёт тот, кто распределит первым.", "all": "Всем логистам",
           "area": "Отправка", "hint_area": "Доставьте на участок отправки.",
           "hint_send": "Распределите по бригадирам, а контейнеры и крышки для отправки отдайте на отправку."},
    "en": {"new": "New container request", "cancelled": "Container request cancelled",
           "edited": "Container request changed", "moved": "Container request moved to another logistics person",
           "moved_hint": "You no longer split this request.",
           "hour": "Hour", "due": "Due", "by": "Sent by", "note": "Note", "why": "Reason",
           "hint": "Split it across the brigadirs.", "btn": "📦 Open the request",
           "hint_all": "Sent to every logistics person — whoever splits it first takes it.", "all": "Every logistics person",
           "area": "Dispatch", "hint_area": "Take it to the dispatch area.",
           "hint_send": "Split the crates across the brigadirs and give the dispatch containers and lids to dispatch."},
}
NOTIFY_PAGE = "/containers/flow"
# The logistics side is a page of its own since 2026-11-21 («Konteyner
# taqsimlash»): a Telegram card to a logistics person opens it. The in-app
# notice keeps NOTIFY_PAGE — a tab opened before that day knows no other
# address, and the page itself sends a logistics-only viewer across.
LOGISTICS_PAGE = "/containers/split"


def hour_span(h: int) -> str:
    return f"{int(h) % 24:02d}:00–{(int(h) + 1) % 24:02d}:00"


def counts_text(lines: dict, lang: str = "uz") -> str:
    names = _CT_NAMES.get(lang) or _CT_NAMES["uz"]
    return ", ".join(f"{names.get(k, k)} {lines[k]}" for k in ALL_KEYS if lines.get(k))


def area_text(r, lang: str) -> str:
    """«🚚 Jo'natish: Burger» — a dispatch area's request names its area."""
    if getattr(r, "area_id", None) is None:
        return ""
    from app.translit import transliterate_text
    t = _TG.get(lang) or _TG["uz"]
    return f"🚚 {t['area']}: {transliterate_text(r.area_name or '—', lang) or r.area_name or '—'}"


def _tg_body(r: ContainerRequest, kind: str, lang: str) -> str:
    from html import escape as _esc

    def escape(x):
        return _esc(x, quote=False)
    from app.translit import transliterate, transliterate_text
    t = _TG.get(lang) or _TG["uz"]
    name = transliterate(r.created_by or "—", lang) or "—"
    rows = [f"📦 <b>{escape(t[kind])}</b>", "",
            f"{t['hour']}: <b>{hour_span(r.hour)}</b>"]
    if r.area_id is not None:
        rows.append(f"<b>{escape(area_text(r, lang))}</b>")
    rows.append(escape(counts_text(r.lines or {}, lang)))
    if kind == "moved":
        rows += ["", f"<i>{escape(t['moved_hint'])}</i>"]
    elif kind in ("new", "edited"):
        rows += [f"{t['due']}: <b>{r.due_at.astimezone(TZ):%H:%M}</b>", f"{t['by']}: {escape(name)}"]
        if r.note:
            rows.append(f"{t['note']}: {escape(transliterate_text(r.note, lang) or r.note)}")
        hint = (t["hint_area"] if r.area_id is not None
                else t["hint_send"] if any(k in SEND_KEYS for k in (r.lines or {})) else t["hint"])
        rows += ["", f"<i>{escape(hint)}</i>"]
        if r.logistics_key == ALL_KEY:
            rows.append(f"<i>{escape(t['hint_all'])}</i>")
    elif r.cancel_note:
        rows.append(f"{t['why']}: {escape(r.cancel_note)}")
    return "\n".join(rows)


def _tg_markup(lang: str, page: str = NOTIFY_PAGE):
    from telebot import types
    from app.config import settings as cfg
    t = _TG.get(lang) or _TG["uz"]
    kb = types.InlineKeyboardMarkup()
    kb.add(types.InlineKeyboardButton(
        t["btn"], web_app=types.WebAppInfo(url=f"{cfg.webapp_url.rstrip('/')}{page}")))
    return kb


def _logi_markup(lang: str):
    """The button on a card sent to a LOGISTICS person — their own page."""
    return _tg_markup(lang, LOGISTICS_PAGE)


def addressees(db: Session, key: str) -> list:
    """Whom a request's message goes to: its logistics person, or — sent to
    everybody — every logistics person."""
    return [p["key"] for p in logistics_people(db)] if key == ALL_KEY else [key]


def to_text(r: ContainerRequest, lang: str) -> str:
    """The addressee as words: a name, or «every logistics person»."""
    from app.translit import transliterate
    if r.logistics_key == ALL_KEY:
        return (_TG.get(lang) or _TG["uz"])["all"]
    return transliterate(r.logistics_name or "", lang)


def notify_request(request_id: int, kind: str, keys: Optional[list] = None) -> bool:
    """Tell the addressee a request came (`new`), changed (`edited`), went to
    somebody else (`moved` — to `keys`, the people it left) or went
    (`cancelled`): one bell row + a DM with a button to the page. Only while
    the «Sozlamalar» switch is on. Own session; never raises. Returns whether
    it was sent."""
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        if not settings(db)["notify"]:
            return False
        r = db.get(ContainerRequest, request_id)
        if r is None or (kind in ("new", "edited", "moved") and r.status != "requested"):
            return False
        from app.routers.staff import notify_profile
        done: set = set()
        for key in (keys if keys is not None else addressees(db, r.logistics_key)):
            done |= notify_profile(
                db, key, f"container_request_{kind}",
                {"hour": hour_span(r.hour), "counts": counts_text(r.lines or {}),
                 "due": f"{r.due_at.astimezone(TZ):%H:%M}", "by": r.created_by or "—",
                 "note": r.note or r.cancel_note or ""},
                type="warning" if kind == "cancelled" else "info",
                html_fn=lambda lang: _tg_body(r, kind, lang), markup_fn=_logi_markup,
                subject=("page", NOTIFY_PAGE), skip_accounts=done) or set()
        db.commit()
        return True
    except Exception:
        db.rollback()
        logger.warning("container-flow: request notice failed", exc_info=True)
        return False
    finally:
        db.close()


def notify_later(request_id: int, kind: str, keys: Optional[list] = None) -> None:
    """`notify_request` on a thread — a request's save never waits on Telegram."""
    import threading
    threading.Thread(target=notify_request, args=(request_id, kind, keys), daemon=True).start()


# ── the brigadir's card: containers split to their unit (2026-11-15) ─────────
RECEIVE_CAP = "page.view.container-receive"
CALLBACK = "crv"          # crv:<request id>:<manager id> — «Hammasi keldi» in the bot

_TG_BRIG = {
    "uz": {"title": "Sizga konteyner yuborildi", "remind": '⏰ Konteynerlar hali tasdiqlanmagan', "cancel_title": "Konteyner so'rovi bekor qilindi", "cancelled": "Bu so'rov bekor qilingan", "hour": "Soat", "by": "Yubordi", "cells": "Yacheykalar bo'yicha",
           "hint": "Kelganini tasdiqlang: hammasi kelgan bo'lsa — «Hammasi keldi», kam bo'lsa — «Boshqa son».",
           "all": "✅ Hammasi keldi", "other": "✏️ Boshqa son",
           "done": "✅ Qabul qilindi · {at}", "already": "Bu allaqachon tasdiqlangan",
           "not_yours": "Bu konteynerlar sizning bo'limingizga yuborilmagan", "gone": "So'rov topilmadi",
           "failed": "Saqlanmadi — sahifada tasdiqlang"},
    "uz_cyrl": {"title": "Сизга контейнер юборилди", "remind": '⏰ Контейнерлар ҳали тасдиқланмаган', "cancel_title": 'Контейнер сўрови бекор қилинди', "cancelled": 'Бу сўров бекор қилинган', "hour": "Соат", "by": "Юборди", "cells": "Ячейкалар бўйича",
                "hint": "Келганини тасдиқланг: ҳаммаси келган бўлса — «Ҳаммаси келди», кам бўлса — «Бошқа сон».",
                "all": "✅ Ҳаммаси келди", "other": "✏️ Бошқа сон",
                "done": "✅ Қабул қилинди · {at}", "already": "Бу аллақачон тасдиқланган",
                "not_yours": "Бу контейнерлар сизнинг бўлимингизга юборилмаган", "gone": "Сўров топилмади",
                "failed": "Сақланмади — саҳифада тасдиқланг"},
    "ru": {"title": "Вам отправлены контейнеры", "remind": '⏰ Контейнеры ещё не подтверждены', "cancel_title": 'Заявка на контейнеры отменена', "cancelled": 'Эта заявка отменена', "hour": "Час", "by": "Отправил(а)", "cells": "По ячейкам",
           "hint": "Подтвердите приход: всё пришло — «Всё пришло», меньше — «Другое число».",
           "all": "✅ Всё пришло", "other": "✏️ Другое число",
           "done": "✅ Принято · {at}", "already": "Уже подтверждено",
           "not_yours": "Эти контейнеры отправлены не вашему участку", "gone": "Заявка не найдена",
           "failed": "Не сохранилось — подтвердите на странице"},
    "en": {"title": "Containers sent to you", "remind": '⏰ Containers not confirmed yet', "cancel_title": 'Container request cancelled', "cancelled": 'This request was cancelled', "hour": "Hour", "by": "Sent by", "cells": "By cell",
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


def _brig_body(r: ContainerRequest, counts: dict, lang: str, kind: str = "split",
               cells: Optional[dict] = None, workshops: Optional[dict] = None) -> str:
    """The brigadir's card: `split` (containers sent), `remind` (still not
    confirmed) or `cancel` (the request was withdrawn — no buttons). `cells`
    ({cell: {ctype: n}}) adds to which cell how many (2026-11-20), each cell
    with its workshop name from `workshops` ({cell: {lang: name}}, 2026-11-21)."""
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
    if cells:
        rows += ["", f"<b>{_esc(t['cells'], quote=False)}:</b>"]
        for c, cn in cells.items():
            ws = workshop_name((workshops or {}).get(c), lang)
            who = f" · {_esc(ws, quote=False)}" if ws else ""
            rows.append(f"• <b>{_esc(c, quote=False)}</b>{who} — {_esc(counts_text(cn, lang), quote=False)}")
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
        rows = db.query(ContainerRequestPart).filter(ContainerRequestPart.request_id == r.id).all()
        for p in rows:
            units.setdefault(p.manager_id, {})[p.ctype] = p.count
        cls = _cells_of(rows)
        shops = cell_workshops(db, {c for u in cls.values() for c in u})
        for mid, counts in units.items():
            if not receive_open(db, mid):
                continue
            notify_profile(
                db, f"supervisor:{mid}", "container_split",
                {"hour": hour_span(r.hour), "counts": counts_text(counts), "by": r.logistics_name or "—"},
                type="info", html_fn=lambda lang, c=counts, cl=cls.get(mid): _brig_body(r, c, lang, cells=cl, workshops=shops),
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


def _cells_of(parts) -> dict:
    """{manager_id: {cell: {ctype: n}}} of a request's part rows."""
    out: dict = {}
    for p in parts:
        for c, n in (p.cells or {}).items():
            if n:
                out.setdefault(p.manager_id, {}).setdefault(c, {})[p.ctype] = n
    return out


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

def hour_need_all(db: Session, day: date) -> dict:
    """{hour: {ctype: n}} — the brigadirs' crates by «Konteynerlar» AND every
    dispatch area's containers and lids by «Jo'natish jadvali», together."""
    need = {h: dict(c) for h, c in plant_hours(db, day).items()}
    for hm in send_hours(db).values():
        for h, c in hm.items():
            e = need.setdefault(h, {})
            for k, n in c.items():
                e[k] = e.get(k, 0) + n
    return need


def prepared(db: Session, day: date, at: Optional[datetime] = None) -> list:
    """The hours still ahead with what each needs — the brigadirs' and the
    dispatch areas' together (2026-11-19: one request for the hour) — less
    what was already asked for the hour."""
    at = at or now()
    need = hour_need_all(db, day)
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
        counts = {k: need[h][k] - asked.get(h, {}).get(k, 0) for k in ALL_KEYS
                  if need[h].get(k, 0) - asked.get(h, {}).get(k, 0) > 0}
        if not counts:
            continue
        out.append({"hour": h, "need": {k: need[h][k] for k in ALL_KEYS if need[h].get(k)},
                    "asked": asked.get(h, {}), "counts": counts,
                    "due_at": _iso(_due(hs, at)), "late": at > hs - timedelta(minutes=LEAD_MIN)})
    return out


def create_requests(db: Session, day: date, logistics_key: str, items: list, note, actor,
                    actor_key) -> list:
    """Several hours' requests to one logistics person — each as `create_request`
    makes it; one refused item refuses them all (the caller rolls back). An
    item with `area_id` is a dispatch area's — one per area and hour."""
    if not items:
        raise FlowError("count")
    slots = [(int(it.get("hour")), it.get("area_id")) for it in items]
    if len(set(slots)) != len(slots):
        raise FlowError("hour")
    return [create_request(db, day, it["hour"], logistics_key, it.get("counts") or {}, note, actor, actor_key,
                           area_id=it.get("area_id"))
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
            lines += [f"<b>{hour_span(r.hour)}</b> · "
                      + (f"{_esc(area_text(r, lang), quote=False)} · " if r.area_id is not None else "")
                      + f"{_esc(counts_text(r.lines or {}, lang), quote=False)}"
                      f" · {due} {r.due_at.astimezone(TZ):%H:%M}" for r in rows]
            return "\n".join(lines)

        from app.routers.staff import notify_profile
        done: set = set()
        for key in addressees(db, rows[0].logistics_key):
            done |= notify_profile(
                db, key, "container_requests_new",
                {"n": len(rows), "hours": ", ".join(hour_span(r.hour) for r in rows), "by": rows[0].created_by or "—"},
                type="info", html_fn=body, markup_fn=_logi_markup, subject=("page", NOTIFY_PAGE),
                skip_accounts=done) or set()
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
        # what went to dispatch counts as given (2026-11-20: a combined
        # request's lump was left out — «25 given» when 2,400 went to dispatch)
        given: dict = dict(r.given or {})
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
                ("to", to_text(rr, lang)),
                ("due", f"{rr.due_at.astimezone(TZ):%H:%M}")])
        sent += _send_alert(db, keys, "container_request_overdue",
                            {"hour": hour_span(r.hour), "counts": counts_text(r.lines or {}),
                             "by": to_text(r, "uz") or "—"}, body)
        db.commit()
    return sent


def escalate_unconfirmed(db: Session, at: Optional[datetime] = None) -> int:
    """A brigadir still silent ESCALATE_AFTER_MIN after the reminder: the shift
    managers are told once per unit of a request (their switch on).

    Counted from the reminder SENT, else from the moment it was DUE
    (`remind_at`) — 2026-11-20: a brigadir who got no reminder (the brigadirs'
    switch off, or no «Qabul» page) was never escalated, though nobody had
    asked him at all."""
    from sqlalchemy import update as _update
    from app.translit import transliterate
    at = at or now()
    if not settings(db)["notify_managers"]:
        return 0
    lo, hi = at - timedelta(minutes=ESCALATE_AFTER_MIN + ALERT_WINDOW_MIN), at - timedelta(minutes=ESCALATE_AFTER_MIN)
    today = at.astimezone(TZ).date()
    pending: dict = {}
    for p, rq in db.query(ContainerRequestPart, ContainerRequest).join(
            ContainerRequest, ContainerRequest.id == ContainerRequestPart.request_id).filter(
            ContainerRequestPart.received.is_(None), ContainerRequestPart.escalated_at.is_(None),
            ContainerRequest.status == "assigned",
            ContainerRequest.day >= today - timedelta(days=2), ContainerRequest.day <= today).all():
        anchor = p.reminded_at or remind_at(rq)
        if anchor is None or not (lo <= anchor <= hi):
            continue
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
        prow = db.query(ContainerRequestPart).filter(
            ContainerRequestPart.request_id == r.id, ContainerRequestPart.received.is_(None),
            ContainerRequestPart.reminded_at.is_(None)).all()
        for p in prow:
            pending.setdefault(p.manager_id, {})[p.ctype] = p.count
        p_cls = _cells_of(prow)
        p_shops = cell_workshops(db, {c for u in p_cls.values() for c in u})
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
                type="warning", html_fn=lambda lang, c=counts, rr=r, cl=p_cls.get(mid): _brig_body(rr, c, lang, "remind", cl, p_shops),
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
    by_cell: dict = {}
    for mid in flow_unit_ids(db):
        if mid not in configured:
            continue
        try:
            dash = production._build_dashboard(db, mid, day)
            h_map, _u = hourly_containers.unit_hours(dash)
        except HTTPException:
            continue
        hm = {int(h): {k: n for k, n in e.items() if n} for h, e in h_map.items()}
        hm = {h: e for h, e in hm.items() if e}
        if hm:
            out[mid] = hm
            try:                            # a breakdown: it never costs the figure
                cb = _cell_hours(hourly_containers.unit_teams(dash))
            except Exception:
                logger.warning("container-flow: cell hours failed for unit %s", mid, exc_info=True)
                cb = {}
            if cb:
                by_cell[mid] = cb
    _hours_cache[day] = (started, out, by_cell)
    return out


def _team_key(tm: dict) -> str:
    """A team's name in the breakdown: its cell's verifix CODE (how a cell is
    named — `utils/cellName.js`), else its work centre (« · group»)."""
    code = (tm.get("cell") or {}).get("verifix_code")
    if code:
        return str(code)
    wc, g = tm.get("work_center") or "", tm.get("group") or ""
    return f"{wc} · {g}" if g else wc


def _cell_hours(teams: list) -> dict:
    """One unit's teams → {cell: {hour: {ctype: n}}} — each team's hours under
    its cell (`_team_key`); teams sharing a cell add up."""
    out: dict = {}
    for tm in teams:
        key = _team_key(tm)
        for h, e in (tm.get("hours") or {}).items():
            d = out.setdefault(key, {}).setdefault(int(h), {})
            for k, n in e.items():
                if n:
                    d[k] = d.get(k, 0) + n
    return out


def units_cell_hours(db: Session, day: date) -> dict:
    """{manager_id: {cell: {hour: {ctype: n}}}} — `units_hours` kept per cell
    (the same read, the same minute's cache)."""
    units_hours(db, day)
    got = _hours_cache.get(day)
    return got[2] if got and len(got) > 2 else {}


def cell_weights(db: Session, day: date, hour: int, exclude_request_id: Optional[int] = None) -> dict:
    """How a brigadir's part of a request is shared across their cells
    (2026-11-20, the operator: «replace the otdel with the teams' yacheyka —
    for this supervisor he has to send this amount of containers»):
    {manager_id: {"names": [cell…], "w": {ctype: [[cell, weight]…]}}}. The
    weight is what each cell still needs — its «Konteynerlar» figures from the
    day's start through `hour` (the window of the brigadir's limit, see
    `unit_limits`) less what earlier splits already sent it; when that leaves
    nothing, its need alone. Never raises — a failure is no breakdown."""
    try:
        hour = int(hour)
        per = units_cell_hours(db, day)
        q = db.query(ContainerRequestPart.manager_id, ContainerRequestPart.ctype,
                     ContainerRequestPart.cells).join(
            ContainerRequest, ContainerRequest.id == ContainerRequestPart.request_id).filter(
            ContainerRequest.day == day, ContainerRequest.status == "assigned",
            ContainerRequest.hour <= hour, ContainerRequestPart.cells.isnot(None),
            ~ContainerRequest.id.in_(_extra_request_ids(db)))
        if exclude_request_id is not None:
            q = q.filter(ContainerRequest.id != exclude_request_id)
        given: dict = {}
        for mid, k, cd in q.all():
            for c, n in (cd or {}).items():
                e = given.setdefault(mid, {}).setdefault(c, {})
                e[k] = e.get(k, 0) + int(n or 0)
        out: dict = {}
        for mid, cells in per.items():
            names = sorted(c for c in cells if c)
            if not names:
                continue
            cum: dict = {}
            for c, hm in cells.items():
                for h, e in hm.items():
                    if h > hour:
                        continue
                    for k, n in e.items():
                        cum.setdefault(k, {})[c] = cum.get(k, {}).get(c, 0) + n
            g = given.get(mid) or {}
            w: dict = {}
            for k, need in cum.items():
                rows = [[c, max(0, need.get(c, 0) - (g.get(c) or {}).get(k, 0)), need.get(c, 0)] for c in names]
                if not any(x[1] for x in rows):
                    rows = [[c, nd, nd] for c, _l, nd in rows]
                rows = [[c, x] for c, x, _n in rows if x > 0]
                if rows:
                    w[k] = rows
            out[mid] = {"names": names, "w": w}
        # each cell's WORKSHOP name beside its code (2026-11-21, the operator:
        # «write the name of the workshop … remove the names, put just workshop
        # names» — it replaced the leader's name the same day)
        shops = cell_workshops(db, {c for e in out.values() for c in e["names"]})
        for e in out.values():
            e["workshops"] = {c: shops[c] for c in e["names"] if c in shops}
        return out
    except Exception:
        logger.warning("container-flow: cell weights failed", exc_info=True)
        return {}


def cell_workshops(db: Session, codes) -> dict:
    """{verifix code: {lang: the cell's workshop name}} — its «Sex nomi» on
    /cells (`cells.name_workshop_*`, Verifix's name synced live), every
    language that has one. Live cells only; a code with no name is absent. A
    work-centre key («A2894 · A», a team with no cell) matches nothing.
    **The one place outside /cells that prints a workshop name**: the operator
    asked for it on the container split (2026-11-21); everywhere else a cell is
    its code (`utils/cellName.js`)."""
    from app.models import Cell
    codes = {str(c) for c in codes or () if c}
    if not codes:
        return {}
    rows = (db.query(Cell.verifix_code, Cell.name_workshop_uz, Cell.name_workshop_uz_cyrl,
                     Cell.name_workshop_ru, Cell.name_workshop_en)
            .filter(Cell.verifix_code.in_(sorted(codes)), Cell.archived_at.is_(None)).all())
    out: dict = {}
    for code, uz, uz_cyrl, ru, en in rows:
        names = {k: v.strip() for k, v in (("uz", uz), ("uz_cyrl", uz_cyrl), ("ru", ru), ("en", en))
                 if v and v.strip()}
        if names:
            out[str(code)] = names
    return out


def workshop_name(names: Optional[dict], lang: str) -> str:
    """One cell's workshop name for `lang` — its own column, else Russian (the
    one the plant fills in), else any; transliterated like every other DB text
    (`transliterate_text` — never the name convention). The twin of
    `cellName` + `tx` in the browser."""
    from app.translit import transliterate_text
    if not names:
        return ""
    for k in (lang, "ru", "uz", "uz_cyrl", "en"):
        if names.get(k):
            raw = names[k]
            return raw if k == lang else (transliterate_text(raw, lang) or raw)
    return ""


def cell_split(entry: Optional[dict], ctype: str, n: int) -> dict:
    """`n` containers of `ctype` across one brigadir's cells by
    `cell_weights` — {cell: count}, adding up to `n` (largest remainder,
    `share_out`). A type no cell needs goes to the brigadir's only cell, or
    stays unbroken ({}) when they have several. The browser's twin is
    `cellSplit` in `components/containers/flowUtil.jsx` — keep the two in step."""
    if not entry or not n or n <= 0:
        return {}
    ws = (entry.get("w") or {}).get(ctype) or []
    if not ws:
        names = entry.get("names") or []
        return {names[0]: n} if len(names) == 1 else {}
    got = share_out(n, [x for _c, x in ws])
    return {c: x for (c, _w), x in zip(ws, got) if x}


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
    if any(k not in ALL_KEYS for k in counts):
        raise FlowError("type")
    clean = {}
    for k in ALL_KEYS:
        if counts.get(k) is None:
            # a count names every crate type; the dispatch container and lid
            # (2026-11-19) only when counted — a type left out keeps its book figure
            if kind == "count" and k in KEYS:
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
    """What left AXO after `since`: [(at, {ctype: n}, kind)] — a split request
    at its split and an issued batch at its issue (`out`, to the brigadirs);
    what went to dispatch — a request's dispatch amount, or an area's request
    delivered — at that moment (`send`)."""
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
    for rid, at, given in db.query(ContainerRequest.id, ContainerRequest.assigned_at, ContainerRequest.given) \
            .filter(ContainerRequest.status == "assigned",
                    ContainerRequest.given.isnot(None), ContainerRequest.assigned_at > since,
                    ContainerRequest.assigned_at <= until).all():
        out[("s", rid, at)] = {k: int(n or 0) for k, n in (given or {}).items()}
    return [(key[2], counts, "send" if key[0] == "s" else "out") for key, counts in out.items()]


def stock_ahead(db: Session, at: datetime) -> tuple:
    """What still has to leave AXO for the hours not over OF THE PRODUCTION DAY
    RUNNING NOW: (`reserved` — asked of a logistics person, not split yet;
    `ahead` — the hours' need nobody asked for yet, None when the plan could
    not be read).

    The production day, not the calendar (2026-11-20): it read «yesterday and
    today» by the date, so after midnight the whole NEXT production day — and
    any request made ahead for tomorrow — was counted as leaving «today»
    (23,333 dispatch containers at 00:09)."""
    pday = production_day(at)
    reserved: dict = {}
    for r in db.query(ContainerRequest).filter(ContainerRequest.status == "requested",
                                               ContainerRequest.day == pday).all():
        if hour_start(r.day, r.hour) + timedelta(hours=1) <= at:
            continue
        for k, n in (r.lines or {}).items():
            reserved[k] = reserved.get(k, 0) + int(n or 0)
    try:
        ahead: Optional[dict] = {}
        for h in prepared(db, pday, at):
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
    zero = lambda: {k: 0 for k in ALL_KEYS}                            # noqa: E731
    M = ContainerStockMove
    is_count = M.kind == "count"
    first = db.query(M).filter(is_count, M.at <= at).order_by(M.at, M.id).first()
    out = {"types": list(ALL_KEYS), "send_types": list(SEND_KEYS), "counted": first is not None,
           "last_count": None, "now": None,
           "today": None, "days": [], "moves": []}
    if first is None:
        return out
    start = hour_start(d_from, 0)
    base = db.query(M).filter(is_count, M.at <= start).order_by(M.at.desc(), M.id.desc()).first() or first
    last = db.query(M).filter(is_count, M.at <= at).order_by(M.at.desc(), M.id.desc()).first()
    ev = [(m.at, 0, m.id, m.kind, m.counts or {})
          for m in db.query(M).filter(M.at >= base.at, M.at <= at).order_by(M.at, M.id).all()]
    ev += [(t, 1, 0, kind, counts) for t, counts, kind in _stock_out(db, base.at, at)]
    ev.sort(key=lambda e: e[:3])

    today0 = hour_start(at.date(), 0)
    # `given` to the brigadirs, `sent` to the dispatch areas (2026-11-19) — apart, and together in the book
    today = {"given": zero(), "sent": zero(), "returned": zero()}
    bal: Optional[dict] = None

    def apply(e, row=None):
        nonlocal bal
        t, _o, _i, kind, counts = e
        if kind == "count":
            # a type the count left out (the dispatch ones before they were counted) keeps its book figure
            new = {k: int(counts[k]) if k in counts else (bal[k] if bal is not None else 0) for k in ALL_KEYS}
            if bal is not None and row is not None:
                for k in ALL_KEYS:
                    row["adjust"][k] += new[k] - bal[k]
            bal = new
            if row is not None:
                row["counted"] = True
            return
        if bal is None:
            return
        sign, slot = {"in": (1, "returned"), "send": (-1, "sent")}.get(kind, (-1, "given"))
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
               "given": zero(), "sent": zero(), "returned": zero(), "adjust": zero(), "counted": False}
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
    today["reserved"] = {k: reserved.get(k, 0) for k in ALL_KEYS}
    today["ahead"] = None if ahead is None else {k: ahead.get(k, 0) for k in ALL_KEYS}
    out["now"], out["today"] = bal, today
    out["last_count"] = {"at": _iso(last.at), "by": last.by_name, "counts": last.counts or {}}
    lo, hi = start, hour_start(d_to + timedelta(days=1), 0)
    out["moves"] = [{"id": m.id, "at": _iso(m.at), "kind": m.kind, "counts": m.counts or {},
                     "note": m.note, "by": m.by_name}
                    for m in db.query(M).filter(M.at >= lo, M.at < hi)
                    .order_by(M.at.desc(), M.id.desc()).limit(STOCK_MOVES_MAX).all()]
    return out


# ── «Jo'natish jadvali» — the dispatch areas (2026-11-19) ───────────────────
# The operator: «sending containers are not like the inside containers, but we
# have to add them together», with his workbook «Отправка контейнер крышка соат
# бўйича день ва ночь смена»: each dispatch area needs so many containers and
# lids a shift, packed in rounds. The shift's figure is shared over the rounds
# (largest remainder, so they add up to the shift exactly) and a round's share
# is asked for WHOLE at the hour the round starts (2026-11-20 — see
# `round_hours`). Kept on «Sozlamalar» by AXO and the admins.
#
# A round starting before the production day opens (`DAY_START_HOUR`) is past
# midnight, its hour counted on from 24.
# The schedule's first day: a period reaching before it needs nothing on those
# days — the schedule did not exist, so 0% delivered there would be a lie.
SEND_FROM = date(2026, 11, 19)
_NIGHT = [["20:00", "23:00"], ["00:00", "03:00"], ["03:30", "06:30"]]
_DAY = [["06:00", "08:30"], ["09:00", "12:30"], ["12:30", "15:30"]]
SEND_SEED = (
    ("Сдоба Слойка Мясной", 2, 8000, 8000, _NIGHT),
    ("Марьям", 2, 1500, 1500, _NIGHT),
    ("Пирог печенья", 2, 1500, 1500, _NIGHT),
    ("Бургер", 1, 3000, 3000, _DAY),
    ("Сдоба Фасовка", 1, 1500, 1500, _DAY),
    ("Пирог печенья", 1, 500, 500, _DAY),
)


def _hm(v) -> Optional[int]:
    try:
        h, m = str(v or "").strip().split(":")[:2]
        h, m = int(h), int(m)
    except (TypeError, ValueError):
        return None
    return h * 60 + m if 0 <= h <= 23 and 0 <= m <= 59 else None


def round_hours(rounds) -> list:
    """The production hour each round is asked for — the hour its START falls
    in, the round's whole share there (2026-11-20, the operator, shown a
    request for 10:00–11:00 carrying the 09:00 round's second hour: «the
    dispatch containers should show exact time when they need at sending
    time»; he picked «whole round at its start» over an hour earlier or at its
    end). Until then a round was spread over the 3 hours from its start, the
    workbook's «1 соатда керак» column — that column is not used.

    A start before `DAY_START_HOUR` is past midnight: night 20:00 · 00:00
    · 03:30 → hours 20 · 24 · 27, day 06:00 · 09:00 · 12:30 → 30 · 9 · 12 —
    the 06:00 round is the one at the END of the production day, so it no
    longer sits before the day opens, overdue from the start."""
    out = []
    for rd in rounds or []:
        m = _hm(rd[0] if rd else None)
        if m is None:
            continue
        h = m // 60
        out.append(h + 24 if h < DAY_START_HOUR else h)
    return out


def area_hours(a) -> dict:
    """{hour: {"send": n, "lid": n}} — the shift's figure shared over the
    rounds, each round's share whole at the hour it starts (two rounds starting
    in one hour add up there)."""
    hrs = round_hours(a.rounds)
    out: dict = {}
    if not hrs:
        return out
    for k, total in (("send", a.send or 0), ("lid", a.lid or 0)):
        for h, n in zip(hrs, share_out(total, [1] * len(hrs))):
            if n:
                e = out.setdefault(h, {})
                e[k] = e.get(k, 0) + n
    return out


def send_areas(db: Session, archived: bool = False) -> list:
    return db.query(ContainerSendArea).filter(ContainerSendArea.archived.is_(archived)).order_by(
        ContainerSendArea.shift, ContainerSendArea.position, ContainerSendArea.id).all()


def area_out(a) -> dict:
    return {"id": a.id, "name": a.name, "shift": a.shift, "send": a.send, "lid": a.lid,
            "rounds": a.rounds or [], "position": a.position,
            "hours": {str(h): c for h, c in sorted(area_hours(a).items())},
            "updated_at": _iso(a.updated_at), "updated_by": a.updated_by}


def send_hours(db: Session) -> dict:
    """{area_id: {hour: {ctype: n}}} for every area on the schedule."""
    return {a.id: area_hours(a) for a in send_areas(db)}


def _clean_rounds(rounds) -> list:
    out = []
    for rd in rounds or []:
        if not isinstance(rd, (list, tuple)) or len(rd) != 2:
            raise FlowError("rounds")
        a, b = _hm(rd[0]), _hm(rd[1])
        if a is None or b is None:
            raise FlowError("rounds")
        out.append([f"{a // 60:02d}:{a % 60:02d}", f"{b // 60:02d}:{b % 60:02d}"])
    if not 1 <= len(out) <= 8:
        raise FlowError("rounds")
    return out


def save_area(db: Session, area_id: Optional[int], name, shift, send, lid, rounds,
              actor) -> ContainerSendArea:
    """A new dispatch area (`area_id` None) or a change to one."""
    from sqlalchemy import func as _f
    name = (name or "").strip()
    if not name:
        raise FlowError("name")
    if shift not in (1, 2):
        raise FlowError("shift")
    send, lid = _count(send), _count(lid)
    if not (send or lid):
        raise FlowError("count")
    rounds = _clean_rounds(rounds)
    if area_id is None:
        a = ContainerSendArea(position=(db.query(_f.max(ContainerSendArea.position)).scalar() or 0) + 1)
        db.add(a)
    else:
        a = _area(db, area_id)
    a.name, a.shift, a.send, a.lid, a.rounds = name, shift, send, lid, rounds
    a.updated_at, a.updated_by = now(), actor
    db.flush()
    return a


def remove_area(db: Session, area_id: int, actor) -> ContainerSendArea:
    """Off the schedule: archived — its requests keep their name and figures."""
    a = _area(db, area_id)
    a.archived, a.updated_at, a.updated_by = True, now(), actor
    return a


def seed_send_areas(db: Session) -> int:
    """The operator's workbook as the first schedule — only into an empty table."""
    if db.query(ContainerSendArea).first() is not None:
        return 0
    for i, (name, shift, send, lid, rounds) in enumerate(SEND_SEED, start=1):
        db.add(ContainerSendArea(name=name, shift=shift, send=send, lid=lid, rounds=rounds,
                                 position=i, updated_by="system (workbook 2026-11-19)"))
    db.flush()
    return len(SEND_SEED)


def sending_report(db: Session, d_from: date, d_to: date, today: Optional[date] = None) -> dict:
    """«Jo'natish» over a period: per dispatch area what the schedule needs (its
    shift figure for every day of the period from `SEND_FROM` up to today);
    in all, what AXO asked of the dispatch types and what logistics gave to
    dispatch (requests not cancelled). The split gives dispatch ONE amount and
    names no area (2026-11-19), so asked / given exist only in all."""
    today = today or now().date()
    last = min(d_to, today)
    n_days = max(0, (last - max(d_from, SEND_FROM)).days + 1)
    zero = lambda: {k: 0 for k in SEND_KEYS}                        # noqa: E731
    areas = [{"area_id": a.id, "area": a.name, "shift": a.shift,
              "need": {"send": (a.send or 0) * n_days, "lid": (a.lid or 0) * n_days}}
             for a in send_areas(db)]
    total = {"need": zero(), "asked": zero(), "given": zero()}
    for a in areas:
        for k in SEND_KEYS:
            total["need"][k] += a["need"][k]
    for q in db.query(ContainerRequest).filter(ContainerRequest.day >= d_from, ContainerRequest.day <= d_to,
                                               ContainerRequest.status != "cancelled").all():
        for k, n in (q.lines or {}).items():
            if k in SEND_KEYS:
                total["asked"][k] += int(n or 0)
        if q.status == "assigned":
            for k, n in (q.given or {}).items():
                if k in SEND_KEYS:
                    total["given"][k] += int(n or 0)
    need = sum(total["need"].values())
    total["pct"] = round(100 * sum(total["given"].values()) / need) if need else None
    return {"areas": sorted(areas, key=lambda a: (a["shift"] or 9, a["area"] or "")), "total": total, "days": n_days}


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
