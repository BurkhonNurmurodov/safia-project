"""A unit's catalog is DATED (2026-09-24, the operator's directive).

Editing a catalog line on the «Zagruzka fayli» page — its Трудоемкость, its
Команда or group letter, its SAP code or name, whether the SAP file fills it,
adding or deleting it — and editing a work centre's штатка or capacity, or
importing an ABC workbook, takes effect FROM NOW ON. A day that has already
happened keeps the catalog it had. Until this date every reader took the
catalog as it stands today, so one edit re-wrote the minutes, ЛЮДИ and
загрузка of every past day at once.

How it is stored: `pp_products` / `pp_work_centers` stay the unit's catalog
from its latest boundary on, and every writer calls :func:`freeze` BEFORE it
mutates them. That copies the unit's whole catalog — every line, every work
centre — into a `pp_catalog_versions` row covering the days up to the one the
edit starts on. A day before the boundary reads the first version whose
`valid_to` is on or after it. The whole UNIT is the grain, never one line: a
line has no durable identity (an import re-creates every row, `pp_calc.line_keys`
is content), so "the catalog as it stood" is only answerable whole.

Readers go through :func:`at` (one day) or :func:`spans` (a range, cut at the
boundaries so each run of days is computed with its own catalog). With no
version rows a unit reads exactly what it always read — nothing moved when
this shipped, and every day before the first dated edit reads the catalog as
it stood on release day (the operator's ruling).

WHEN an edit starts is :func:`effective_day`: the shift running at that moment
takes it, a shift already over does not (the operator's ruling, fixed 08:00 and
20:00 — deliberately NOT the «Smena vaqtlari» register). From 08:00 to 20:00
that is today's date for both shifts; a closed day in progress takes it too.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Manager, PPCatalogVersion, PPProduct, PPWorkCenter

TZ = ZoneInfo("Asia/Tashkent")
# Fixed shift clock for "which shift-day does an edit start on" — the operator
# chose these over the «Smena vaqtlari» register, which stays a register.
SHIFT_START = time(8, 0)
SHIFT_END = time(20, 0)

LINE_FIELDS = ("id", "sap_code", "name", "work_center", "op", "labor_time",
               "sort_order", "active", "auto_fill", "wc_group")
WC_FIELDS = ("id", "code", "shtatka", "capacity", "sort_order", "active")
_LINE_DEFAULTS = {"sap_code": "", "name": "", "work_center": "", "op": None,
                  "labor_time": None, "sort_order": 0, "active": True,
                  "auto_fill": True, "wc_group": None}
_WC_DEFAULTS = {"code": "", "shtatka": 0, "capacity": None, "sort_order": 0,
                "active": True}


# ── when an edit starts ─────────────────────────────────────────────────────

def now_local() -> datetime:
    return datetime.now(TZ)


def effective_day(shift, now: Optional[datetime] = None) -> date:
    """The shift-day an edit made at `now` starts on: the shift running at that
    moment, else the next one to start.

    Shift 1 (08:00–20:00) → today until 20:00, tomorrow after it.
    Shift 2 (20:00–08:00, dated by the evening it opens) → yesterday's night
    until 08:00, today from then on. A unit with no shift → the calendar date.
    """
    now = now or now_local()
    if now.tzinfo is not None:
        now = now.astimezone(TZ)
    today, t = now.date(), now.time()
    if shift == 1:
        return today if t < SHIFT_END else today + timedelta(days=1)
    if shift == 2:
        return today - timedelta(days=1) if t < SHIFT_START else today
    return today


def unit_effective_day(db: Session, manager_id: int,
                       now: Optional[datetime] = None) -> date:
    """:func:`effective_day` for one unit, clamped to its latest boundary — an
    edit can never start before the catalog it replaces did (a unit moved from
    shift 1 to shift 2 in the evening would otherwise point back a day)."""
    shift = db.query(Manager.shift).filter(Manager.id == manager_id).scalar()
    eff = effective_day(shift, now)
    cf = current_from(db, manager_id)
    return max(eff, cf) if cf is not None else eff


# ── what a day reads ────────────────────────────────────────────────────────

@dataclass
class Catalog:
    """One unit's catalog as it stood over [valid_from, valid_to].

    `lines` / `work_centers` hold EVERY row, active or not, ordered by
    (sort_order, id) — `pp_calc.line_keys` ranks over the whole catalog, so a
    reader must be able to see the inactive rows too. A current catalog holds
    the ORM rows themselves (read them, never write through them); a frozen one
    holds plain objects with the same attributes. `valid_to` None = current."""
    manager_id: int
    lines: list = field(default_factory=list)
    work_centers: list = field(default_factory=list)
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @property
    def frozen(self) -> bool:
        return self.valid_to is not None

    @property
    def active_lines(self) -> list:
        return [p for p in self.lines if p.active]

    @property
    def active_work_centers(self) -> list:
        return [w for w in self.work_centers if w.active]


def _num(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def _dump(obj, fields) -> dict:
    return {k: _num(getattr(obj, k, None)) for k in fields}


def _load(d: dict, defaults: dict) -> SimpleNamespace:
    out = dict(defaults)
    out.update({k: v for k, v in (d or {}).items()})
    return SimpleNamespace(**out)


def _ordered(rows) -> list:
    return sorted(rows, key=lambda r: (float(r.sort_order or 0), r.id or 0))


def _frozen(row: PPCatalogVersion) -> Catalog:
    return Catalog(
        manager_id=int(row.manager_id),
        lines=_ordered(_load(d, _LINE_DEFAULTS) for d in (row.lines or [])),
        work_centers=_ordered(_load(d, _WC_DEFAULTS) for d in (row.work_centers or [])),
        valid_from=row.valid_from, valid_to=row.valid_to)


def _current_many(db: Session, manager_ids: Iterable[int]) -> dict[int, Catalog]:
    ids = sorted({int(m) for m in manager_ids})
    out = {m: Catalog(manager_id=m) for m in ids}
    if not ids:
        return out
    for p in db.query(PPProduct).filter(PPProduct.manager_id.in_(ids)).all():
        out[int(p.manager_id)].lines.append(p)
    for w in db.query(PPWorkCenter).filter(PPWorkCenter.manager_id.in_(ids)).all():
        out[int(w.manager_id)].work_centers.append(w)
    bounds = _current_from_many(db, ids)
    for m, c in out.items():
        c.lines = _ordered(c.lines)
        c.work_centers = _ordered(c.work_centers)
        c.valid_from = bounds.get(m)
    return out


def current(db: Session, manager_id: int) -> Catalog:
    """The unit's catalog from its latest boundary on — the one the edit forms
    change."""
    return _current_many(db, [manager_id])[int(manager_id)]


def _current_from_many(db: Session, manager_ids: Iterable[int]) -> dict[int, date]:
    ids = sorted({int(m) for m in manager_ids})
    if not ids:
        return {}
    return {int(m): vt + timedelta(days=1) for m, vt in db.query(
        PPCatalogVersion.manager_id, func.max(PPCatalogVersion.valid_to)).filter(
        PPCatalogVersion.manager_id.in_(ids)).group_by(PPCatalogVersion.manager_id).all()
        if vt is not None}


def current_from(db: Session, manager_id: int) -> Optional[date]:
    """The first day the current catalog answers for; None = every day (no
    edit has been dated yet)."""
    return _current_from_many(db, [manager_id]).get(int(manager_id))


def at(db: Session, manager_id: int, day: date) -> Catalog:
    """The unit's catalog as it stood on `day`."""
    row = (db.query(PPCatalogVersion)
           .filter(PPCatalogVersion.manager_id == manager_id,
                   PPCatalogVersion.valid_to >= day)
           .order_by(PPCatalogVersion.valid_to).first())
    return _frozen(row) if row is not None else current(db, manager_id)


def at_many(db: Session, manager_ids: Iterable[int], day: date) -> dict[int, Catalog]:
    """{unit: its catalog as it stood on `day`} for several units in two reads."""
    ids = sorted({int(m) for m in manager_ids})
    got = {m: cats[0][0] for m, cats in spans(db, ids, day, day).items() if cats}
    return {m: got.get(m) or Catalog(manager_id=m) for m in ids}


def spans(db: Session, manager_ids: Iterable[int], date_from: date,
          date_to: date) -> dict[int, list[tuple[Catalog, date, date]]]:
    """{unit: [(catalog, first day, last day), …]} covering [date_from, date_to]
    — the range cut at each boundary, oldest first, so a reader computes each
    run of days with the catalog those days had. A unit with no dated edit is
    one span with its current catalog, i.e. exactly what it always read."""
    ids = sorted({int(m) for m in manager_ids})
    if not ids or date_from > date_to:
        return {m: [] for m in ids}
    rows: dict[int, list] = {m: [] for m in ids}
    for r in (db.query(PPCatalogVersion)
              .filter(PPCatalogVersion.manager_id.in_(ids),
                      PPCatalogVersion.valid_to >= date_from)
              .order_by(PPCatalogVersion.manager_id, PPCatalogVersion.valid_to).all()):
        rows[int(r.manager_id)].append(r)
    out: dict[int, list] = {m: [] for m in ids}
    need_current: list[int] = []
    tails: dict[int, date] = {}
    for m in ids:
        cursor = date_from
        for r in rows[m]:
            if cursor > date_to:
                break
            end = min(r.valid_to, date_to)
            if end >= cursor:
                out[m].append((_frozen(r), cursor, end))
                cursor = end + timedelta(days=1)
        if cursor <= date_to:
            need_current.append(m)
            tails[m] = cursor
    if need_current:
        cur = _current_many(db, need_current)
        for m in need_current:
            out[m].append((cur[m], tails[m], date_to))
    return out


def catalog_for(day_spans: list[tuple[Catalog, date, date]], day: date) -> Optional[Catalog]:
    """The span of `spans(...)[unit]` that covers `day`."""
    for cat, lo, hi in day_spans:
        if lo <= day <= hi:
            return cat
    return None


# ── the one writer ──────────────────────────────────────────────────────────

def has_history(db: Session, manager_id: int) -> bool:
    return db.query(PPCatalogVersion.id).filter(
        PPCatalogVersion.manager_id == manager_id).first() is not None


def is_empty(db: Session, manager_id: int) -> bool:
    """Nothing to keep: no line, no work centre and no dated version. The ONE
    case a catalog write reaches the past — a unit importing its first catalog
    has no older one for those days to have read (the operator's ruling)."""
    return (db.query(PPProduct.id).filter(PPProduct.manager_id == manager_id).first() is None
            and db.query(PPWorkCenter.id).filter(
                PPWorkCenter.manager_id == manager_id).first() is None
            and not has_history(db, manager_id))


def freeze(db: Session, manager_id: int, reason: str = "",
           now: Optional[datetime] = None) -> date:
    """Keep the unit's catalog as it stands for every day before the edit about
    to be made starts, and return the day it starts on.

    Call it BEFORE touching a single attribute of the unit's `pp_products` /
    `pp_work_centers` rows: the session does not autoflush, so a row already
    mutated in memory would be copied with its NEW value and the past would
    read the edit after all. A second edit on the same shift-day finds the
    boundary already drawn and freezes nothing — within one day the last edit
    wins. Two writers racing to draw one boundary meet on
    `uq_pp_catalog_version_to`; the loser's copy is discarded, and the winner's
    is the older of the two. The caller commits.
    """
    eff = effective_day(db.query(Manager.shift).filter(
        Manager.id == manager_id).scalar(), now)
    cf = current_from(db, manager_id)
    if cf is not None and eff <= cf:
        return cf
    cur = current(db, manager_id)
    row = PPCatalogVersion(
        manager_id=manager_id, valid_from=cf, valid_to=eff - timedelta(days=1),
        lines=[_dump(p, LINE_FIELDS) for p in cur.lines],
        work_centers=[_dump(w, WC_FIELDS) for w in cur.work_centers],
        reason=(reason or None))
    try:
        with db.begin_nested():
            db.add(row)
    except IntegrityError:
        pass
    return eff
