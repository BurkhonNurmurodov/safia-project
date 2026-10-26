"""The world the end-to-end catalog-follow scenarios run in (WP7 of
docs/plan-catalog-follows-cells.md): a scratch Postgres database
(`pg_scratch`, `SAFIA_TEST_PG`) with `app.database.SessionLocal` pointed at it,
a fixture builder for units, cells, catalogs and per-day data, the platform's
own DOORS for a brigadir change (`cell_register.set_unit`, the /cells PUT, a
«Verifix sinxron» tap — and the register's «Arxivlash», a catalog row edit, a
SAP upload and an ABC import around one), the landing
(`cell_links.apply_due`), the follow
(`catalog_follow.run_sweep`), and a READ of every figure through the
platform's own readers:

* `pp_catalog.at` — each unit's catalog on each day;
* `zagruzka_source` — `wc_labor`, `unit_labor`, `wc_group_labor`, `cell_labor`
  (every cell), `typed_pins`, `typed_people`, `cell_pins`;
* `routers.production._build_dashboard` — the «Zagruzka fayli» page;
* `routers.zagruzka_cell.cell_zagruzka` — the «Yacheyka zagruzkasi» page;
* `routers.live_overview._plan_inputs` — the /live plan per unit and cell;
* `services.plan_fulfillment.build` — «Plan Bajarish».

No tests of its own: `test_catalog_follow_e2e` holds the scenarios.

The CLOCK. A brigadir change lands at the unit's next shift opening, which is
read off the wall clock (`cell_links.opening`), and a catalog edit counts from
the shift running at the moment it is made (`pp_catalog.effective_day`). Both
read `now`; `World.clock(at)` pins it for the doors — `cell_links.opening`,
`cell_links.record` and `pp_catalog.now_local` answer `at` — so a move asked
on D−1 at 14:00 lands on D at 08:00 whatever day the suite runs on. Nothing
else of the platform is replaced.
"""
from __future__ import annotations

import io
import json
import unittest
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

from app.services import pp_catalog

TZ = pp_catalog.TZ
D = date(2026, 10, 13)          # the move day: a Tuesday, after FOLLOW_FROM
C = "A2894"                     # the moving cell's work centre
B = "B100"                      # a work centre that stays in X
E = "E200"                      # Y's own work centre
X, Y, Z = 1, 2, 3
ADMIN = {"role": "admin", "sub": "1", "telegram_id": 1, "full_name": "Admin"}


def days(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range((b - a).days + 1)]


def at_(day: date, hh: int = 14, mm: int = 0) -> datetime:
    """`day` at hh:mm on the plant's wall clock."""
    return datetime.combine(day, time(hh, mm), tzinfo=TZ)


def content(cat) -> tuple:
    """A catalog's whole content, field for field and in order."""
    return ([pp_catalog._dump(p, pp_catalog.LINE_FIELDS) for p in cat.lines],
            [pp_catalog._dump(w, pp_catalog.WC_FIELDS) for w in cat.work_centers])


def rounded(obj):
    """Floats to 6 places, keys to strings, tuples to lists — two reads of
    one figure compare equal whatever the summation order inside them."""
    if isinstance(obj, dict):
        return {str(k): rounded(v) for k, v in sorted(obj.items(), key=lambda kv: str(kv[0]))}
    if isinstance(obj, (list, tuple, set, frozenset)):
        items = [rounded(v) for v in obj]
        if isinstance(obj, (set, frozenset)):
            items.sort(key=lambda v: json.dumps(v, sort_keys=True, default=str))
        return items
    if isinstance(obj, float):
        return round(obj, 6)
    if isinstance(obj, Decimal):
        return round(float(obj), 6)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    return obj


def _iso(day) -> str:
    """A day as "YYYY-MM-DD", whether it came as a date, ISO or «dd.mm.yyyy»."""
    if isinstance(day, date):
        return day.isoformat()
    s = str(day)
    return datetime.strptime(s, "%d.%m.%Y").date().isoformat() if "." in s else s[:10]


def dumps(obj) -> str:
    return json.dumps(rounded(obj), sort_keys=True, default=str)


# The dashboard keys that describe the PAGE rather than the day's figures:
# `day` is the close ladder's lock, `catalog` whether an edit made NOW reaches
# the day (it moves with the wall clock and with every freeze). Everything else
# — rows, totals, work centres, groups, unknown SKUs, the archive — is compared.
DASH_PAGE_KEYS = ("day", "catalog")


def dash_figures(dash: dict) -> dict:
    return {k: v for k, v in dash.items() if k not in DASH_PAGE_KEYS}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class World(unittest.TestCase):
    """One scratch database per test class; every test builds its own world
    from empty tables. No tests of its own."""

    TABLES = ("PPUpload", "PPLineDaily", "PPDaily", "PPWorkCenterDaily", "PPReconciliation",
              "PPDaySetting", "PPCatalogVersion", "PPProduct", "PPWorkCenter", "PPCatalogMove",
              "PPManagerSetting", "VerifixSyncItem", "AttendanceBatchCell", "AttendanceBatch",
              "Attendance", "CellArchiveSpan", "CellLinkEvent", "Cell", "RoleProfile",
              "AppSetting", "Manager")

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        cls._patch = mock.patch("app.database.SessionLocal", cls.pg.Session)
        cls._patch.start()
        with cls.pg.engine.begin() as c:
            # The backstop `startup.add_wc_groups` builds on a real box.
            c.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_cells_wc_group ON cells "
                "(manager_id, upper(regexp_replace(sap_code, '\\s', '', 'g')), wc_group) "
                "WHERE wc_group IS NOT NULL AND sap_code IS NOT NULL AND manager_id IS NOT NULL"))

    @classmethod
    def tearDownClass(cls):
        cls._patch.stop()
        cls.forget_caches(kept=True)
        cls.pg.drop()

    def setUp(self):
        from app import models as m
        self.db = self.pg.Session()
        for name in self.TABLES:
            self.db.query(getattr(m, name)).delete()
        self.db.commit()
        self.forget_caches(kept=True)
        self.jurnal = []

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── caches ───────────────────────────────────────────────────────────────

    @staticmethod
    def forget_caches(kept: bool = False):
        """Drop the caches of dated links, archive spans and owing. The KEPT
        page answers (`kept_answer`, /api/heatmap's) only with `kept` — between
        two tests; inside one, dropping them is the follow's own job, and a
        test must be able to see it does."""
        from app.services import cell_archive, cell_links, kept_answer, leader_load
        cell_links.forget()
        cell_archive.forget()
        leader_load.forget()
        if kept:
            kept_answer.forget_all()

    def settle(self):
        """Commit what the test wrote and drop every cache that read it."""
        self.db.commit()
        self.db.expire_all()
        self.forget_caches()

    # ── the builder ──────────────────────────────────────────────────────────

    def unit(self, *ids, shift=1):
        from app.models import Manager
        for i in ids:
            self.db.add(Manager(id=i, name=f"Unit {i}", shift=shift, zagruzka_on=True))
        self.db.flush()

    def cell(self, code, unit, sap=C, letter=None, leader=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit, wc_group=letter,
                 leader_id=getattr(leader, "id", leader), in_load=True)
        self.db.add(c)
        self.db.flush()
        return c

    def leader(self, name, unit):
        from app.models import RoleProfile
        p = RoleProfile(role="leader", name=name, manager_id=unit)
        self.db.add(p)
        self.db.flush()
        return p

    def line(self, unit, sap, name, wc=C, labor=60, letter=None, sort=0, active=True,
             auto_fill=True):
        from app.models import PPProduct
        p = PPProduct(manager_id=unit, sap_code=sap, name=name, work_center=wc,
                      labor_time=Decimal(str(labor)), sort_order=sort, active=active,
                      auto_fill=auto_fill, wc_group=letter)
        self.db.add(p)
        self.db.flush()
        return p

    def wc_row(self, unit, code=C, shtatka=0):
        from app.models import PPWorkCenter
        w = PPWorkCenter(manager_id=unit, code=code, shtatka=shtatka)
        self.db.add(w)
        self.db.flush()
        return w

    def daily(self, unit, d, sap, wc=C, plan=0, actual=0, po=None, ao=None):
        from app.models import PPDaily
        self.db.add(PPDaily(manager_id=unit, date=d, sap_code=sap, work_center=wc,
                            plan_qty=Decimal(str(plan)), actual_qty=Decimal(str(actual)),
                            plan_override=po, actual_override=ao))

    def line_daily(self, line, d, plan=None, actual=None, cap=None):
        """A per-line typed value, keyed as the Positions table keys it."""
        from app.models import PPLineDaily
        from app.services.pp_calc import daily_key, line_keys
        self.db.flush()
        keys = line_keys(pp_catalog.at(self.db, line.manager_id, d).lines)
        self.db.add(PPLineDaily(manager_id=line.manager_id, date=d,
                                qty_key=daily_key(line.sap_code, line.name),
                                work_center=line.work_center, line_key=keys[line.id],
                                plan_override=plan, actual_override=actual, container_cap=cap))

    def pin(self, unit, d, wc=C, group=None, people=None, shtatka=None):
        from app.models import PPWorkCenterDaily
        self.db.add(PPWorkCenterDaily(manager_id=unit, date=d, work_center=wc, wc_group=group,
                                      people=people, shtatka=shtatka))

    def att(self, cell, d, unit, n=1, hours=8):
        """`n` workers of `cell` on `d`, on `unit`'s list — what «Davomat»
        saves; /zagruzka-cell weighs a cell only on a day it has some."""
        from app.models import Attendance
        for i in range(n):
            self.db.add(Attendance(manager_id=unit, date=d, worker_name=f"W{cell.verifix_code}-{i}",
                                   job_title="Кондитер", hours_worked=Decimal(str(hours)),
                                   verifix_code=cell.verifix_code))

    def idle(self, cell, d, start="10:00", end="10:30", category="Cat A"):
        """A stop the cell's leader filed on /idle-cell — counted the moment
        it is saved."""
        from app.models import CellOjidaniyaInterval
        self.db.add(CellOjidaniyaInterval(cell_id=cell.id, date=d.isoformat(), category=category,
                                          start=start, end=end, stopped=True, note="test",
                                          status="approved"))

    # ── the worlds the scenarios share ───────────────────────────────────────

    SPAN = (D - timedelta(days=3), D + timedelta(days=9))

    def world_lone(self, *, c_unit=lambda _d: X, leader=False, y_shift=1):
        """X: cell c (0101) ALONE at C with two lines and the work centre's
        row (штатка 5); cell d (0102) at B with one line. Y: cell y (0201) at
        E with a line of its own — nothing at C. Figures, typed people and
        attendance on every day of `SPAN`; a typed per-line value and the
        day's штатка pin at C on D. `c_unit(day)` = the unit c's people are
        on «Davomat»'s list that day (they follow the cell). `leader`: c is
        run by «Lider Bir», a leader profile of X. `y_shift`: Y's shift."""
        self.unit(X)
        self.unit(Y, shift=y_shift)
        lead = self.leader("Lider Bir", X) if leader else None
        c = self.cell("0101", X, leader=lead)
        d_ = self.cell("0102", X, sap=B)
        y = self.cell("0201", Y, sap=E)
        l1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        l2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        l3 = self.line(X, "F003", "Non", wc=B, labor=12, sort=2)
        ly = self.line(Y, "F005", "Pirog", wc=E, labor=20, sort=0)
        w_c = self.wc_row(X, C, shtatka=5)
        w_b = self.wc_row(X, B, shtatka=3)
        w_y = self.wc_row(Y, E, shtatka=2)
        for i, day in enumerate(days(*self.SPAN)):
            self.daily(X, day, "F001", plan=100 + i, actual=90 + i)
            self.daily(X, day, "F002", plan=40, actual=33)
            self.daily(X, day, "F003", wc=B, plan=10, actual=10)
            self.daily(Y, day, "F005", wc=E, plan=30, actual=25)
            self.pin(X, day, wc=C, people=4, shtatka=6 if day == D else None)
            self.pin(X, day, wc=B, people=2)
            self.pin(Y, day, wc=E, people=3)
            self.att(c, day, c_unit(day), n=4)
            self.att(d_, day, X, n=2)
            self.att(y, day, Y, n=3)
            self.idle(c, day)                               # 30 minutes
            self.idle(d_, day, "11:00", "11:12")
        self.line_daily(l1, D, plan=Decimal("77"))
        self.line_daily(l1, D - timedelta(days=1), plan=Decimal("55"))
        self.settle()
        return SimpleNamespace(c=c, d=d_, y=y, l1=l1, l2=l2, l3=l3, ly=ly,
                               w_c=w_c, w_b=w_b, w_y=w_y, lead=lead)

    def world_lettered(self, *, c_unit=lambda d: Y if d >= D else X, twin=False,
                       side=False, empty_unit=False):
        """X: c (0301, A) and d (0302, B) at C — c makes «Tort» and «Keks»
        (A), d makes «Non» (B); the work centre's row (штатка 4) and a group
        pin per letter. Y: y1 (0303, A) at C with «Pirog» (A), its own row and
        pin. `twin`: d also makes an identical «Tort» (B) — a twin of c's line
        that stays. `side`: X's e (0304) makes «Tort» at another work centre
        (A2895) — c's SKU outside the move. `empty_unit`: Z, a unit with no
        line left, only an old figure (still «configured» for an upload)."""
        self.unit(X, Y)
        c = self.cell("0301", X, letter="A")
        d_ = self.cell("0302", X, letter="B")
        y1 = self.cell("0303", Y, letter="A")
        la1 = self.line(X, "F001", "Tort", labor=60, letter="A", sort=0)
        la2 = self.line(X, "F002", "Keks", labor=30, letter="A", sort=1)
        lb = self.line(X, "F003", "Non", labor=12, letter="B", sort=2)
        tw = self.line(X, "F001", "Tort", labor=60, letter="B", sort=3) if twin else None
        ly = self.line(Y, "F005", "Pirog", labor=20, letter="A", sort=0)
        e = le = None
        if side:
            e = self.cell("0304", X, sap="A2895")
            le = self.line(X, "F001", "Tort", wc="A2895", labor=60, sort=4)
            self.wc_row(X, "A2895", shtatka=1)
        w_x = self.wc_row(X, C, shtatka=4)
        w_y = self.wc_row(Y, C, shtatka=3)
        if empty_unit:
            self.unit(Z)
            self.daily(Z, D - timedelta(days=9), "F001", plan=1, actual=1)
        for day in days(*self.SPAN):
            for sap in ("F001", "F002", "F003"):
                self.daily(X, day, sap, plan=20, actual=18)
            self.daily(Y, day, "F005", plan=7, actual=7)
            if side:
                self.daily(X, day, "F001", wc="A2895", plan=5, actual=5)
                self.pin(X, day, wc="A2895", people=1)
                self.att(e, day, X, n=1)
            self.pin(X, day, group="A", people=3)
            self.pin(X, day, group="B", people=2)
            self.pin(Y, day, group="A", people=5)
            self.att(c, day, c_unit(day), n=3)
            self.att(d_, day, X, n=2)
            self.att(y1, day, Y, n=5)
            self.idle(c, day)
            self.idle(y1, day, "12:00", "12:20")
        self.settle()
        return SimpleNamespace(c=c, d=d_, y1=y1, e=e, la1=la1, la2=la2, lb=lb, tw=tw, ly=ly,
                               le=le, w_x=w_x, w_y=w_y)

    # ── the clock ────────────────────────────────────────────────────────────

    @contextmanager
    def clock(self, at: datetime):
        """The platform's `now` is `at` for the doors: the opening a brigadir
        change lands at, the instant it is recorded at (so it is not applied
        on the spot), and the shift a catalog edit counts from."""
        from app.services import cell_links
        real_open, real_rec = cell_links.opening, cell_links.record

        def opening(db, manager_id, now=None):
            return real_open(db, manager_id, now or at)

        def record(db, cell, field, value, *, now=None, **kw):
            return real_rec(db, cell, field, value, now=now or at.astimezone(timezone.utc), **kw)

        with mock.patch.object(cell_links, "opening", opening), \
                mock.patch.object(cell_links, "record", record), \
                mock.patch.object(pp_catalog, "now_local", lambda: at):
            yield

    # ── the doors ────────────────────────────────────────────────────────────

    def move(self, cell, to, *, at, leaving=None):
        """`cell_register.set_unit` — the one writer every door goes through."""
        from app.services import cell_register
        with self.clock(at):
            ev = cell_register.set_unit(self.db, cell, to, src="manual", by="test",
                                        leaving=leaving)
        self.settle()
        return ev

    def put_cell(self, cell, *, at, **payload):
        """The /cells form's PUT, as an admin. Raises the HTTPException the
        router raises; a refusal leaves the transaction rolled back."""
        from fastapi import HTTPException
        from app.routers import profiles
        with self.clock(at):
            try:
                out = profiles.admin_update_cell(cell.id, profiles.CellPayload(**payload),
                                                 db=self.db, caller=ADMIN)
            except HTTPException:
                self.db.rollback()
                self.forget_caches()
                raise
        self.settle()
        return out

    def verifix_tap(self, cell, to, *, at, choice=None):
        """A «Verifix sinxron» `brigadir_differs` suggestion, tapped."""
        from app.models import VerifixSyncItem
        from app.services import verifix_sync
        it = VerifixSyncItem(kind="brigadir_differs", key=f"cell:{cell.id}", status="open",
                             payload={"cell": cell.id, "code": cell.verifix_code,
                                      "from_unit": cell.manager_id, "to_unit": to,
                                      "brigadir": "Brigadir"})
        self.db.add(it)
        self.db.commit()
        with self.clock(at):
            out = verifix_sync.apply_item(self.db, it.id, by="test", choice=choice)
        self.settle()
        return it, out

    def archive_cell(self, cell, *, at):
        """The /cells register's «Arxivlash» (`admin_archive_cell`), as an
        admin, at `at`: the cell exists on that day and is gone from the next.
        The archive stamps the wall clock it is pressed at, so `at` stands in
        for it there."""
        from app.routers import profiles
        from app.services import cell_archive

        class _At(datetime):
            @classmethod
            def now(cls, tz=None):
                return at.astimezone(tz) if tz else at.replace(tzinfo=None)

        with mock.patch.object(cell_archive, "datetime", _At):
            out = profiles.admin_archive_cell(cell.id, profiles.CellArchiveBody(archived=True),
                                              db=self.db, caller=ADMIN)
        self.settle()
        return out

    def edit_line(self, line, *, at, **fields):
        """The «Pozitsiyalar» row edit (`admin_update_catalog`) — dated by the
        shift running at `at`."""
        from app.routers import production as prod
        with self.clock(at):
            out = prod.admin_update_catalog(line.id, prod.CatalogBody(**fields), _={}, db=self.db)
        self.settle()
        return out

    def land(self, day: date, hh: int = 9, mm: int = 0):
        """The minute job's landing at `day` hh:mm, committed."""
        from app.services import cell_links, cell_register
        landed = cell_links.apply_due(self.db, now=at_(day, hh, mm))
        self.db.commit()
        cell_register.after_commit()
        self.settle()
        return landed

    def enable(self):
        """The retroactive one-shot has run: the sweep is on."""
        from app.models import AppSetting
        from app.services import catalog_follow as cf
        if self.db.get(AppSetting, cf.RETRO_FLAG) is None:
            self.db.add(AppSetting(key=cf.RETRO_FLAG, value="done:0/0"))
            self.settle()

    def sweep(self):
        """`catalog_follow.run_sweep` — the minute job — on, with its Jurnal
        row captured and its admin DM held back."""
        from app.services import catalog_follow as cf
        self.enable()
        with mock.patch("app.services.action_log.record_system") as jurnal, \
                mock.patch.object(cf, "_dm") as dm:
            cf.run_sweep()
        self.jurnal.extend(jurnal.call_args_list)
        self.settle()
        return jurnal, dm

    def upload(self, day: date, faza, zaga, targets, *, at):
        """A SAP фаза + заголовок upload of one day (`upload_phase`), the
        workbook's parsed slices handed in: `faza` = [(order, wc, plan)],
        `zaga` = {order: (sku, delivered)}."""
        from app.routers import production as prod
        raw = [{"order": o, "op": "0010", "wc": wc, "name": "", "plan": pl, "status": "",
                "date": day.isoformat(), "conf": 0} for o, wc, pl in faza]
        slices = {
            "faza": {"raw": raw, "dates": [day]},
            "zaga": {"order_sku": {o: s for o, (s, _d) in zaga.items()},
                     "order_deliv": {o: d for o, (_s, d) in zaga.items()},
                     "order_due": {o: day for o in zaga},
                     "rows": [[o, s, "", 0, d, 0, day.isoformat(), "", ""]
                              for o, (s, d) in zaga.items()],
                     "columns": ["order", "sku"]},
        }
        f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="sap.xlsx")
        with self.clock(at), mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "read_workbook_slices", return_value=slices):
            out = prod.upload_phase(files=[f], manager_id=None, manager_ids=list(targets),
                                    date=day.isoformat(), mode="both", file_type=None,
                                    _={}, db=self.db)
        self.settle()
        return out

    def import_abc(self, unit, rows, *, at, groups=False, work_centers=()):
        """An ABC catalog import (`import_catalog`), the sheet's parsed rows
        handed in: rows = [(sap, name, wc, labor, letter)]."""
        from app.routers import production as prod
        parsed = {"products": [{"sap_code": s, "name": n, "work_center": w,
                                "labor_time": float(lab), "sort_order": i, "wc_group": g}
                               for i, (s, n, w, lab, g) in enumerate(rows)],
                  "work_centers": [dict(w) for w in work_centers],
                  "sheet": "Sheet1", "has_group_column": groups}
        f = SimpleNamespace(file=io.BytesIO(b"PK"), filename="abc.xlsx")
        with self.clock(at), mock.patch.object(prod, "validate_spreadsheet"), \
                mock.patch.object(prod, "parse_catalog_workbook", return_value=parsed):
            out = prod.import_catalog(file=f, manager_id=unit, sheet_name=None, _={}, db=self.db)
        self.settle()
        return out

    # ── what the platform reads ──────────────────────────────────────────────

    def cells(self):
        from app.models import Cell
        return self.db.query(Cell).order_by(Cell.id).all()

    def managers(self, units):
        from app.models import Manager
        return self.db.query(Manager).filter(Manager.id.in_(list(units))).order_by(Manager.id).all()

    def zagruzka_cell(self, unit, a, b) -> dict:
        from app.routers import zagruzka_cell as zc
        return zc.cell_zagruzka(date_from=a, date_to=b, manager_id=unit, factory=None,
                                db=self.db, payload=ADMIN)

    def plan(self, units, a, b) -> dict:
        from app.services import plan_fulfillment as pf
        cells, names = pf.registry(self.db, units, since=a, until=b)
        return pf.build(self.db, self.managers(units), a, b, cells=cells, leader_names=names,
                        compare=False)

    def fleet(self, units, a, b) -> dict:
        """The fleet загрузка — `build_metrics_list`, what /zagruzka, Overview
        and /summary draw — per (unit, day), every day closed or not."""
        from dataclasses import asdict
        from app.routers.brigadirs import build_metrics_list
        return {(m.manager_id, _iso(m.date)): asdict(m)
                for m in build_metrics_list(self.db, a, b, None, list(units),
                                            require_closed=False)}

    def live(self, units, d):
        """/live's plan inputs: the alive cells of the units, as its router
        selects them, and the per-unit / per-cell minutes it reads."""
        from app.models import Cell
        from app.routers import live_overview as lo
        from app.services import cell_archive
        rows = [c for c in self.db.query(Cell).filter(Cell.manager_id.in_(list(units)))
                .order_by(Cell.id).all() if cell_archive.alive(c, d.isoformat())]
        by_unit, by_cell = lo._plan_inputs(self.db, list(units), d, rows)
        return {"units": {u: {k: v for k, v in r.items() if k != "updated_at"}
                          for u, r in by_unit.items()},
                "cells": by_cell}

    def reads(self, units, a, b) -> dict:
        """EVERY reader over [a, b], as the platform answers — what it shows
        for those days. Compare two of them with `dumps` (rounded)."""
        from app.routers import production as prod
        from app.services import idle_source, zagruzka_source as zs
        db = self.db
        units = list(units)
        cells = self.cells()
        wgl = zs.wc_group_labor(db, units, a, b)
        pins = zs.typed_pins(db, units, a, b)
        return {
            "at": {(u, d.isoformat()): content(pp_catalog.at(db, u, d))
                   for u in units for d in days(a, b)},
            "wc_labor": zs.wc_labor(db, units, a, b),
            "unit_labor": zs.unit_labor(db, units, a, b),
            "wc_group_labor": wgl,
            "cell_labor": zs.cell_labor(cells, wgl),
            "typed_pins": pins,
            "typed_people": zs.typed_people(db, units, a, b),
            "cell_pins": zs.cell_pins(cells, pins),
            "dashboard": {(u, d.isoformat()): dash_figures(prod._build_dashboard(db, u, d))
                          for u in units for d in days(a, b)},
            "zagruzka_cell": {u: self.zagruzka_cell(u, a, b) for u in units},
            "live": {d.isoformat(): self.live(units, d) for d in days(a, b)},
            "plan": self.plan(units, a, b),
            "fleet": self.fleet(units, a, b),
            "idle": idle_source.unit_downtime(db, units, a, b),
        }

    @staticmethod
    def sums(r: dict) -> dict:
        """Per day, Σ over every unit read of each reader's (plan, actual)
        minutes and its typed people — what a cell's move must conserve."""
        out: dict = {}

        def add(reader, day, p, a=0.0):
            slot = out.setdefault(reader, {}).setdefault(day, [0.0, 0.0])
            slot[0] += float(p or 0)
            slot[1] += float(a or 0)

        for (_m, day, _wc), (p, a) in r["wc_labor"].items():
            add("wc_labor", day, p, a)
        for (_m, day), (p, a) in r["unit_labor"].items():
            add("unit_labor", day, p, a)
        for (_m, day, _wc), n in r["typed_people"].items():
            add("people", day, n)
        for (_m, day), dash in r["dashboard"].items():
            t = dash.get("totals") or {}
            add("dashboard", day, t.get("total_plan_labor"), t.get("total_actual_labor"))
            add("dashboard_people", day, t.get("total_people"))
        for day, lv in r["live"].items():
            for u in lv["units"].values():
                add("live", day, u["plan_min"], u["actual_min"])
        plan = r["plan"]
        for u in plan.get("units") or []:
            for day, pa in zip(plan.get("days") or [], u.get("daily") or []):
                if pa:
                    add("plan", day, pa[0], pa[1])
        for (_m, day), f in r["idle"].items():
            # The unit figure is a headcount-weighted MEAN: what a move must
            # conserve is Σ N·T and Σ N, never Σ of the means.
            add("idle", day, f["total"] * f["n_sum"], f["n_sum"])
        for (_m, day), m in r["fleet"].items():
            add("fleet", day, m.get("prod_plan"), m.get("prod_actual"))
            add("fleet_people", day, m.get("official_hc"), m.get("verifix_hc"))
        for page in r["zagruzka_cell"].values():
            keys = dict(zip(page.get("dates") or [], [None] * len(page.get("dates") or [])))
            for by_day in (page.get("inputs") or {}).values():
                for key, inp in by_day.items():
                    if key in keys:
                        add("zagruzka_cell", _iso(key), inp.get("trud_plan"), inp.get("trud_actual"))
        return {k: {d: (round(v[0], 4), round(v[1], 4)) for d, v in by.items()}
                for k, by in out.items()}

    @staticmethod
    def cut(r: dict, a: date, b: date) -> dict:
        """The day-keyed readers of `r` cut to [a, b] — a range reader read
        over a wider range answers each day the same."""
        lo, hi = a.isoformat(), b.isoformat()

        def keep(day) -> bool:
            return lo <= str(day)[:10] <= hi

        out = {}
        for name in ("at", "dashboard"):
            out[name] = {k: v for k, v in r[name].items() if keep(k[1])}
        for name in ("wc_labor", "unit_labor", "wc_group_labor", "cell_labor", "typed_pins",
                     "typed_people", "cell_pins"):
            out[name] = {k: v for k, v in r[name].items() if keep(k[1])}
        out["live"] = {k: v for k, v in r["live"].items() if keep(k)}
        out["fleet"] = {k: v for k, v in r["fleet"].items() if keep(k[1])}
        out["idle"] = {k: v for k, v in r["idle"].items() if keep(k[1])}
        return out

    def rows(self) -> list:
        """Every stored quantity row, column for column."""
        from app import models as m
        out = []
        for model, cols in ((m.PPLineDaily, ("manager_id", "date", "qty_key", "work_center",
                                             "line_key", "plan_override", "actual_override",
                                             "container_cap")),
                            (m.PPDaily, ("manager_id", "date", "sap_code", "work_center",
                                         "plan_qty", "actual_qty", "plan_override",
                                         "actual_override")),
                            (m.PPWorkCenterDaily, ("manager_id", "date", "work_center",
                                                   "wc_group", "people", "shtatka"))):
            for r in self.db.query(model).all():
                out.append([model.__tablename__] + [str(getattr(r, c)) for c in cols])
        return sorted(out)

    def table_fingerprint(self) -> list:
        """Every row of every table a follow could touch."""
        from app import models as m
        out = []
        for model in (m.PPLineDaily, m.PPDaily, m.PPWorkCenterDaily, m.PPCatalogVersion,
                      m.PPProduct, m.PPWorkCenter, m.PPCatalogMove, m.Cell, m.CellLinkEvent,
                      m.CellArchiveSpan):
            cols = [c.name for c in model.__table__.columns
                    if c.name not in ("updated_at", "created_at")]
            for r in self.db.query(model).all():
                out.append([model.__tablename__] + [json.dumps(getattr(r, c), default=str,
                                                               sort_keys=True) for c in cols])
        return sorted(out)

    # ── assertions every scenario uses ───────────────────────────────────────

    def assert_unique(self, units, a, b):
        """§1.2: no catalog id in two units' catalogs on one day."""
        for d in days(a, b):
            seen: dict = {}
            for u in units:
                cat = pp_catalog.at(self.db, u, d)
                for kind, items in (("line", cat.lines), ("wc", cat.work_centers)):
                    for r in items:
                        key = (kind, r.id)
                        self.assertNotIn(key, seen, f"{key} in units {seen.get(key)} and {u} on {d}")
                        seen[key] = u

    def ids_on(self, unit, d) -> set:
        return {p.id for p in pp_catalog.at(self.db, unit, d).lines}

    def active_ids_on(self, unit, d) -> set:
        return {p.id for p in pp_catalog.at(self.db, unit, d).lines if p.active}

    def move_rows(self):
        from app.models import PPCatalogMove
        return self.db.query(PPCatalogMove).order_by(PPCatalogMove.id).all()
