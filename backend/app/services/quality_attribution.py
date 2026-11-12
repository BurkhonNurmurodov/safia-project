"""Who answers for a Quality-register record — THE rule (2026-11-02).

The operator's rulings, asked one by one: a record of the Quality register
(«Сифат ва шикоятлар») counts for the cell its «Номер виновного цеха» code
names, and the cell's people answer for it.

  BRIGADIR  the unit the cell stood in ON THE RECORD'S DATE
            (`cell_links.value_on`, exact from 12 Oct 2026, the cell's first
            known value before that). A unit ARCHIVED since hands its records to
            the unit the cell stands in today (unit «Turdimurodov Nodirjon» was
            merged into Aripova Manzura's on 2 Nov — its cell 0811's history is
            hers). When the code names no cell on /cells, the code is blank, or
            the cell had no brigadir that day, the record falls back to the unit
            «Отв. бригадир» names (`name_map.supervisor_match` over every live
            unit, `register_brigadir`'s per-site blanking; dated before a
            brigadir change, the unit that person ran THEN — `name_map.era_unit`,
            2026-11-12) — and to nobody when that names no unit either
            (technologists, IT, stores).
  LEADER    the cell's «Egasi» (`cells.owner_id`) on the record's date; a cell
            nobody owned that day gives the record no leader. A record with no
            cell has no leader.

The «Есть ли вина цеха» flag is NOT consulted: the code decides, whatever the
flag says. Nothing is stored — every reader resolves per request, so a cell
moved, a unit renamed or an owner changed re-reads every record at once.

Readers (one rule, four pages): the Quality page (`routers/quality.py`), the
shift dashboard's «Sifat nazorati %» (`routers/shift_report.py`), «Brigadirlar
reytingi» and «Hisobotlar» (`brigadir_board.quality`, fed by
`routers/leaderboard.py` / `routers/reports.py`), and «Brigadirlar KPI»'s OKK
criterion (`services/brigadirs_kpi.py`). Never re-spell it at a call site.
"""
from __future__ import annotations

from typing import Iterable, NamedTuple, Optional

from sqlalchemy.orm import Session

from app.models import Cell, Manager, RoleProfile
from app.services import cell_links
from app.services.cell_lookup import by_verifix, resolve_verifix
from app.services.name_map import era_unit, register_brigadir, supervisor_match


class Who(NamedTuple):
    unit: Optional[dict]        # {"id", "name", "shift"} — the answering unit, or None
    cell_id: Optional[int]      # cells.id the code resolved to, or None
    leader_id: Optional[int]    # role_profiles.id — the cell's Egasi that day, or None
    how: str                    # "cell" | "name" | "none"


class Resolver:
    """Built once per request, called once per record (or per grouped row).

    `names` is every «Отв. бригадир» spelling the caller will ask about (the
    name half resolves them in one `supervisor_match`, the way every page always
    has). `extra` adds name candidates that are not units — «Brigadirlar KPI»'s
    Verifix brigadirs tied to no unit — to the NAME half only; a cell always
    answers with a real unit."""

    def __init__(self, db: Session, names: Iterable[Optional[str]] = (),
                 extra: Iterable = ()):
        mgrs = db.query(Manager.id, Manager.name, Manager.shift, Manager.archived).all()
        self.live = {m.id: {"id": m.id, "name": m.name, "shift": m.shift}
                     for m in mgrs if not m.archived}
        spellings = {n for n in names if n}
        self.match = supervisor_match([m for m in mgrs if not m.archived] + list(extra),
                                      spellings)
        self.table = by_verifix(db)
        self.cells = {c.id: c for c in db.query(Cell.id, Cell.manager_id, Cell.owner_id).all()}
        self._owner_names: Optional[dict] = None
        self._db = db

    def __call__(self, place: Optional[str], brigadir: Optional[str],
                 fault_code: Optional[str], day) -> Who:
        code = (fault_code or "").strip() if isinstance(fault_code, str) else fault_code
        cell = resolve_verifix(self.table, code) if code else None
        cid = cell["id"] if cell else None
        leader = None
        if cid is not None:
            c = self.cells.get(cid)
            if c is not None:
                mid = cell_links.value_on(c, "manager_id", day)
                if mid is not None and mid not in self.live:
                    # The unit that held the cell then is archived (or gone):
                    # its records belong to the unit the cell stands in now.
                    mid = c.manager_id
                leader = cell_links.value_on(c, "owner_id", day)
                unit = self.live.get(mid) if mid is not None else None
                if unit is not None:
                    return Who(unit, cid, leader, "cell")
        name = register_brigadir(place, brigadir)
        hit = self.match.get(name) if name else None
        # Before a brigadir change the name meant the unit its person ran THEN.
        hit = self.live.get(era_unit(name, day)) or hit
        if hit:
            return Who(hit, cid, leader, "name")
        return Who(None, cid, leader, "none")

    def leader_name(self, pid: Optional[int]) -> str:
        if pid is None:
            return ""
        if self._owner_names is None:
            self._owner_names = {p.id: p.name for p in
                                 self._db.query(RoleProfile.id, RoleProfile.name).all()}
        return self._owner_names.get(pid) or ""


def owner_names(db: Session) -> dict[int, str]:
    """{cells.id: the cell's CURRENT «Egasi» name} — the leader the cells
    registry names on the Quality page (its roster and its leader picker)."""
    pairs = db.query(Cell.id, Cell.owner_id).filter(Cell.owner_id.isnot(None)).all()
    if not pairs:
        return {}
    names = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name)
             .filter(RoleProfile.id.in_({o for _c, o in pairs})).all()}
    return {cid: names.get(oid) or "" for cid, oid in pairs}


def unit_rows(db: Session, d_from: str, d_to: str,
              skip_category: Optional[str] = None) -> list[tuple]:
    """``(unit id, status, date, records)`` for the register's records dated
    ``d_from <= date < d_to`` (ISO strings — `date` is one, and an exclusive
    upper bound keeps a row that ever carries a time), each attributed by this
    module's rule. A record no unit answers for is left out, as every reader
    always left out a name that matched nobody.

    `skip_category` drops one category (the shift dashboard's and the board's
    «hair aside»). A record with NO category is kept: in SQL `category != x` is
    NULL there, i.e. false, and «uncategorised» is not that category."""
    from collections import defaultdict

    from sqlalchemy import func, or_

    from app.models import QualityComplaint as QC

    q = (db.query(QC.brigadir, QC.place, QC.fault_code, QC.date, QC.status, func.count(QC.id))
         .filter(QC.date >= d_from, QC.date < d_to))
    if skip_category:
        q = q.filter(or_(QC.category.is_(None), QC.category != skip_category))
    groups = q.group_by(QC.brigadir, QC.place, QC.fault_code, QC.date, QC.status).all()
    who = Resolver(db, {g[0] for g in groups})
    acc: dict[tuple, int] = defaultdict(int)
    for brig, place, code, day, status, n in groups:
        w = who(place, brig, code, day)
        if w.unit is not None:
            acc[(w.unit["id"], status, day)] += int(n)
    return [(uid, st, day, n) for (uid, st, day), n in acc.items()]


def unit_rows_both(db: Session, d_from: str, d_to: str,
                   skip_category: str) -> tuple[list[tuple], list[tuple]]:
    """`unit_rows` twice — every record, and every record but `skip_category`
    — from ONE read and ONE `Resolver` («Hisobotlar» counts complaints with
    hair and closes them without, 2026-11-05). Each name is matched on its own
    (`supervisor_match`), so a resolver built over every spelling attributes a
    record exactly as one built over the narrower set does: the two lists are
    the two `unit_rows` answers."""
    from collections import defaultdict

    from sqlalchemy import case, func

    from app.models import QualityComplaint as QC

    skip = case((QC.category == skip_category, 1), else_=0)
    groups = (db.query(QC.brigadir, QC.place, QC.fault_code, QC.date, QC.status, skip,
                       func.count(QC.id))
              .filter(QC.date >= d_from, QC.date < d_to)
              .group_by(QC.brigadir, QC.place, QC.fault_code, QC.date, QC.status, skip)
              .all())
    who = Resolver(db, {g[0] for g in groups})
    every: dict[tuple, int] = defaultdict(int)
    kept: dict[tuple, int] = defaultdict(int)
    for brig, place, code, day, status, skipped, n in groups:
        w = who(place, brig, code, day)
        if w.unit is None:
            continue
        k = (w.unit["id"], status, day)
        every[k] += int(n)
        if not skipped:
            kept[k] += int(n)
    return ([(u, st, d, n) for (u, st, d), n in every.items()],
            [(u, st, d, n) for (u, st, d), n in kept.items()])
