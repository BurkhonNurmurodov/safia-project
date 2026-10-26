"""The catalog follow's ENGINE (2026-10-26, WP2 of
docs/plan-catalog-follows-cells.md): `catalog_follow.follow_group` and
`run_sweep` driven directly against a scratch Postgres (`SAFIA_TEST_PG`, see
`pg_scratch`), with `app.database.SessionLocal` pointed at it — the dated cell
links, the archive spans and the sweep's own sessions all read it.

What every scenario proves, beside its own assertions (spec §4):

* history before the move day `h` is deep-equal — every unit's `pp_catalog.at`
  dump, `zagruzka_source.wc_labor` / `wc_group_labor` / `cell_labor`, the typed
  pins, and every quantity row dated before `h`;
* every catalog id is in at most ONE unit's catalog on any day (§1.2);
* Σ minutes over the units of the move are conserved per day (a join excepted:
  it may only lower them).

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_catalog_follow_engine
"""
from __future__ import annotations

import json
import unittest
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

from app.services import catalog_follow as cf
from app.services import pp_catalog

TZ = pp_catalog.TZ
D = date(2026, 10, 20)
C = "A2894"
X, Y, Z = 1, 2, 3


def _days(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range((b - a).days + 1)]


def _content(cat) -> tuple:
    return ([pp_catalog._dump(p, pp_catalog.LINE_FIELDS) for p in cat.lines],
            [pp_catalog._dump(w, pp_catalog.WC_FIELDS) for w in cat.work_centers])


def _round(obj):
    """Floats to 6 places, keys to strings — two reads of one figure compare
    equal whatever the summation order inside a span."""
    if isinstance(obj, dict):
        return {str(k): _round(v) for k, v in sorted(obj.items(), key=lambda kv: str(kv[0]))}
    if isinstance(obj, (list, tuple)):
        return [_round(v) for v in obj]
    if isinstance(obj, float):
        return round(obj, 6)
    if isinstance(obj, Decimal):
        return round(float(obj), 6)
    return obj


class _World(unittest.TestCase):
    """One scratch database per test class; every test starts from empty
    tables and builds its own world. No tests of its own."""

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
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()
        cls.pg.drop()

    def setUp(self):
        from app import models as m
        from app.services import cell_archive, cell_links
        self.db = self.pg.Session()
        # The evidence tables too: the sweep's retry of a retroactive transfer
        # reads them again (`catalog_follow_retro.recheck`).
        for t in (m.PPLineDaily, m.PPDaily, m.PPWorkCenterDaily, m.PPCatalogVersion,
                  m.PPProduct, m.PPWorkCenter, m.PPCatalogMove, m.PPManagerSetting,
                  m.Attendance, m.LiveProjection, m.ActionLog,
                  m.CellArchiveSpan, m.CellLinkEvent, m.Cell, m.AppSetting, m.Manager):
            self.db.query(t).delete()
        self.db.commit()
        cell_links.forget()
        cell_archive.forget()
        self.others = []

    def tearDown(self):
        for s in self.others:
            s.rollback()
            s.close()
        self.db.rollback()
        self.db.close()

    # ── the world ────────────────────────────────────────────────────────────

    def enable(self):
        from app.models import AppSetting
        self.db.add(AppSetting(key=cf.RETRO_FLAG, value="done:0/0"))

    def units(self, *ids, shift=1):
        from app.models import Manager
        for i in ids:
            self.db.add(Manager(id=i, name=f"Unit {i}", shift=shift))
        self.db.flush()

    def cell(self, code, unit, sap=C, letter=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit, wc_group=letter)
        self.db.add(c)
        self.db.flush()
        return c

    def line(self, unit, sap, name, wc=C, labor=60, letter=None, sort=0, active=True,
             auto_fill=True):
        from app.models import PPProduct
        p = PPProduct(manager_id=unit, sap_code=sap, name=name, work_center=wc,
                      labor_time=Decimal(str(labor)), sort_order=sort, active=active,
                      auto_fill=auto_fill, wc_group=letter)
        self.db.add(p)
        self.db.flush()
        return p

    def wc(self, unit, code=C, shtatka=0):
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
        from app.models import PPLineDaily
        from app.services.pp_calc import daily_key, line_keys
        keys = line_keys(pp_catalog.at(self.db, line.manager_id, d).lines)
        self.db.add(PPLineDaily(manager_id=line.manager_id, date=d,
                                qty_key=daily_key(line.sap_code, line.name),
                                work_center=line.work_center, line_key=keys[line.id],
                                plan_override=plan, actual_override=actual, container_cap=cap))

    def pin(self, unit, d, wc=C, group=None, people=None, shtatka=None):
        from app.models import PPWorkCenterDaily
        self.db.add(PPWorkCenterDaily(manager_id=unit, date=d, work_center=wc, wc_group=group,
                                      people=people, shtatka=shtatka))

    def att(self, cell, unit, a, b, n=3):
        """`n` named workers with hours at the cell's code, filed under `unit`
        every day of [a, b] — the evidence the retroactive one-shot (and the
        sweep's recheck of its transfers) reads a move day off."""
        from app.models import Attendance
        for d in _days(a, b):
            for i in range(n):
                self.db.add(Attendance(manager_id=unit, date=d, worker_name=f"W{cell.verifix_code}-{i}",
                                       hours_worked=8, verifix_code=cell.verifix_code))

    def event(self, cell, to, eff=D):
        from app.models import CellLinkEvent
        ev = CellLinkEvent(cell_id=cell.id, field="manager_id", value=to, prev=cell.manager_id,
                           effective_from=eff,
                           effective_at=datetime.combine(eff, time(8), tzinfo=TZ), src="manual")
        self.db.add(ev)
        self.db.flush()
        return ev

    def land(self, eff=D):
        """`cell_links.apply_due` at the opening, committed — the landing."""
        from app.services import cell_archive, cell_links
        cell_links.apply_due(self.db, now=datetime.combine(eff, time(9), tzinfo=TZ))
        self.db.commit()
        cell_links.forget()
        cell_archive.forget()

    def groups(self):
        return cf._candidates(self.db, datetime.combine(D + timedelta(days=30), time(9), tzinfo=TZ))

    def follow(self, **kw):
        groups = self.groups()
        self.assertEqual(len(groups), 1, groups)
        res = cf.follow_group(self.db, groups[0], kind=kw.pop("kind", "live"), **kw)
        if kw.get("dry"):
            self.db.rollback()
        else:
            self.db.commit()
        self.forget()
        return res

    def forget(self):
        from app.services import cell_archive, cell_links
        self.db.expire_all()
        cell_links.forget()
        cell_archive.forget()

    # ── what a day reads ─────────────────────────────────────────────────────

    def history(self, units, a, b):
        """Everything a day in [a, b] reads — the catalog dumps, the minutes
        at every grain, the typed pins and the stored quantity rows."""
        from app.models import Cell, PPDaily, PPLineDaily, PPWorkCenterDaily
        from app.services import zagruzka_source as zs
        db = self.db
        dumps = {f"{u}|{d}": _content(pp_catalog.at(db, u, d)) for u in units for d in _days(a, b)}
        wgl = zs.wc_group_labor(db, units, a, b)
        cells = db.query(Cell).order_by(Cell.id).all()
        rows = []
        for model, cols in ((PPLineDaily, ("manager_id", "date", "qty_key", "work_center", "line_key",
                                           "plan_override", "actual_override", "container_cap")),
                            (PPDaily, ("manager_id", "date", "sap_code", "work_center", "plan_qty",
                                       "actual_qty", "plan_override", "actual_override")),
                            (PPWorkCenterDaily, ("manager_id", "date", "work_center", "wc_group",
                                                 "people", "shtatka"))):
            for r in db.query(model).filter(model.manager_id.in_(units), model.date >= a,
                                            model.date <= b).all():
                rows.append([model.__tablename__] + [str(getattr(r, c)) for c in cols])
        return _round({"dumps": dumps, "wc_labor": zs.wc_labor(db, units, a, b),
                       "wc_group_labor": wgl, "cell_labor": zs.cell_labor(cells, wgl),
                       "pins": zs.typed_pins(db, units, a, b), "rows": sorted(rows)})

    def fingerprint(self):
        """Every row of every table the follow can touch — `dry` must leave it."""
        from app import models as m
        out = []
        for model in (m.PPLineDaily, m.PPDaily, m.PPWorkCenterDaily, m.PPCatalogVersion,
                      m.PPProduct, m.PPWorkCenter, m.PPCatalogMove, m.Cell, m.CellLinkEvent):
            cols = [c.name for c in model.__table__.columns
                    if c.name not in ("updated_at", "created_at")]
            for r in self.db.query(model).all():
                out.append([model.__tablename__] + [json.dumps(getattr(r, c), default=str,
                                                               sort_keys=True) for c in cols])
        return sorted(out)

    def assert_unique(self, units, a, b):
        """§1.2: no catalog id in two units' catalogs on one day."""
        for d in _days(a, b):
            seen: dict = {}
            for u in units:
                cat = pp_catalog.at(self.db, u, d)
                for kind, rows in (("line", cat.lines), ("wc", cat.work_centers)):
                    for r in rows:
                        key = (kind, r.id)
                        self.assertNotIn(key, seen, f"{key} in units {seen.get(key)} and {u} on {d}")
                        seen[key] = u

    def minutes(self, units, a, b):
        from app.services import zagruzka_source as zs
        out: dict = {}
        for (_m, day, _wc), (p, ac) in zs.wc_labor(self.db, units, a, b).items():
            row = out.setdefault(day, [0.0, 0.0])
            row[0] += p
            row[1] += ac
        return {k: (round(v[0], 6), round(v[1], 6)) for k, v in out.items()}

    def ids_on(self, unit, d):
        return {p.id for p in pp_catalog.at(self.db, unit, d).lines}

    def move_rows(self):
        from app.models import PPCatalogMove
        return self.db.query(PPCatalogMove).order_by(PPCatalogMove.id).all()

    def _t2_world(self):
        """X: a lone cell c at the code with two lines, a second cell at
        another code; Y empty. Quantities D−3…D+2, a typed per-line value, a
        whole-centre pin with its штатка."""
        self.units(X, Y)
        c = self.cell("0101", X)
        d_ = self.cell("0102", X, sap="B100")
        l1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        l2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        l3 = self.line(X, "F003", "Non", wc="B100", labor=12, sort=2)
        w_c = self.wc(X, C, shtatka=5)
        w_b = self.wc(X, "B100", shtatka=3)
        for i, day in enumerate(_days(D - timedelta(days=3), D + timedelta(days=2))):
            self.daily(X, day, "F001", plan=100 + i, actual=90 + i)
            self.daily(X, day, "F002", plan=40, actual=33)
            self.daily(X, day, "F003", wc="B100", plan=10, actual=10)
        self.db.flush()
        self.line_daily(l1, D, plan=Decimal("77"))
        self.line_daily(l1, D - timedelta(days=1), plan=Decimal("55"))
        self.pin(X, D, people=4, shtatka=6)
        self.pin(X, D - timedelta(days=1), people=3)
        self.pin(X, D, wc="B100", people=2)
        ev = self.event(c, Y)
        self.db.commit()
        return c, d_, (l1, l2, l3), (w_c, w_b), ev


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class FollowEngine(_World):
    """The spec's scenarios, at the engine."""

    # ── T2: a lone cell moves, its whole code with it ────────────────────────

    def test_t2_live_move_lone_cell(self):
        c, _d, (l1, l2, l3), (w_c, w_b), ev = self._t2_world()
        self.land()
        lo, hi = D - timedelta(days=3), D + timedelta(days=2)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(res.S, D)
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], D, hi), mins0)
        self.assert_unique([X, Y], D - timedelta(days=3), D + timedelta(days=3))
        for day in _days(D, hi):
            self.assertEqual(self.ids_on(Y, day), {l1.id, l2.id})
            self.assertEqual(self.ids_on(X, day), {l3.id})
        for day in _days(lo, D - timedelta(days=1)):
            self.assertEqual(self.ids_on(X, day), {l1.id, l2.id, l3.id})
            self.assertEqual(self.ids_on(Y, day), set())
        # The work-centre row went with the code, штатка and all; B100 stayed.
        from app.models import PPDaily, PPLineDaily, PPWorkCenterDaily
        self.assertEqual([(w.id, w.shtatka) for w in pp_catalog.at(self.db, Y, D).work_centers],
                         [(w_c.id, 5)])
        self.assertEqual([w.id for w in pp_catalog.at(self.db, X, D).work_centers], [w_b.id])
        # The typed per-line value moved from D on, the one before D stayed.
        ld = {(r.manager_id, r.date): float(r.plan_override) for r in self.db.query(PPLineDaily).all()}
        self.assertEqual(ld, {(Y, D): 77.0, (X, D - timedelta(days=1)): 55.0})
        # X lists no unknown SKU on D: its rows at the code left with the lines.
        xd = {(r.sap_code, r.date) for r in self.db.query(PPDaily).filter(PPDaily.manager_id == X)}
        self.assertFalse({k for k in xd if k[0] in ("F001", "F002") and k[1] >= D})
        yd = {(r.sap_code, r.date): (float(r.plan_qty), float(r.actual_qty))
              for r in self.db.query(PPDaily).filter(PPDaily.manager_id == Y)}
        self.assertEqual(yd[("F001", D)], (103.0, 93.0))
        self.assertNotIn(("F001", D - timedelta(days=1)), yd)
        pins = {(r.manager_id, r.date, r.work_center, r.wc_group): (r.people, r.shtatka)
                for r in self.db.query(PPWorkCenterDaily).all()}
        self.assertEqual(pins, {(Y, D, C, None): (4, 6), (X, D - timedelta(days=1), C, None): (3, None),
                                (X, D, "B100", None): (2, None)})
        # The record.
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.event_id, row.from_unit, row.to_unit),
                         ("moved", "live", ev.id, X, Y))
        self.assertEqual((row.home_from, row.storage_from, row.whole_code), (D, D, True))
        self.assertEqual(sorted(row.line_ids), sorted([l1.id, l2.id]))
        self.assertEqual(row.wc_ids, [w_c.id])
        self.assertEqual({e["id"] for e in row.lines}, {l1.id, l2.id})
        self.assertEqual(row.versions, [])
        from app.models import CellLinkEvent
        vfx = self.db.get(CellLinkEvent, ev.id).vfx
        self.assertEqual(vfx["catalog_follow"]["state"], "moved")
        self.assertIn("letter_before", vfx)

    def test_dry_leaves_the_database(self):
        self._t2_world()
        self.land()
        before = self.fingerprint()
        res = self.follow(dry=True)
        self.assertEqual(res.state, "dry")
        self.assertTrue(res.rows and all(r.state == "dry" for r in res.rows))
        self.assertEqual(self.fingerprint(), before)

    # ── T3: lettered cells ───────────────────────────────────────────────────

    def test_t3_lettered(self):
        from app.services import cell_links
        self.units(X, Y)
        c = self.cell("0201", X, letter="A")
        d_ = self.cell("0202", X, letter="B")
        y1 = self.cell("0203", Y, letter="A")
        la1 = self.line(X, "F001", "Tort", letter="A", sort=0)
        la2 = self.line(X, "F002", "Keks", letter="A", sort=1)
        lb = self.line(X, "F003", "Non", letter="B", sort=2)
        ly = self.line(Y, "F005", "Pirog", letter="A", sort=0)
        self.wc(X, C, shtatka=4)
        for day in _days(D - timedelta(days=2), D + timedelta(days=1)):
            for sap in ("F001", "F002", "F003"):
                self.daily(X, day, sap, plan=20, actual=18)
            self.daily(Y, day, "F005", plan=7, actual=7)
        self.pin(X, D, group="A", people=3)
        self.pin(X, D, group="B", people=2)
        self.event(c, Y)
        self.db.commit()
        self.land()
        lo, hi = D - timedelta(days=2), D + timedelta(days=1)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], D, hi), mins0)
        self.assert_unique([X, Y], lo, hi)
        self.db.refresh(c)
        self.assertEqual(c.wc_group, "B")
        self.assertEqual(cell_links.letter_on(c, D - timedelta(days=1)), "A")
        cat_y = {p.id: p.wc_group for p in pp_catalog.at(self.db, Y, D).lines}
        self.assertEqual(cat_y, {la1.id: "B", la2.id: "B", ly.id: "A"})
        cat_x = {p.id: p.wc_group for p in pp_catalog.at(self.db, X, D).lines}
        self.assertEqual(cat_x, {lb.id: "B"})
        self.db.refresh(d_)
        self.db.refresh(y1)
        self.assertEqual((d_.wc_group, y1.wc_group), ("B", "A"))
        # Stayers at the code: no whole move, the work-centre row stays.
        [row] = self.move_rows()
        self.assertFalse(row.whole_code)
        self.assertEqual(row.wc_ids, [])
        self.assertEqual((row.letter_from, row.letter_to), ("A", "B"))
        self.assertEqual(len(pp_catalog.at(self.db, X, D).work_centers), 1)
        # c's own group pin went under its new letter; d's stayed.
        from app.models import PPWorkCenterDaily
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "B"): 3, (X, "B"): 2})

    # ── T5: the lone unlettered sibling ──────────────────────────────────────

    def _t5_world(self):
        self.units(X, Y)
        c = self.cell("0301", X)
        y1 = self.cell("0302", Y)
        lc = self.line(X, "F001", "Tort", labor=60)
        ly = self.line(Y, "F005", "Pirog", labor=30)
        self.wc(Y, C, shtatka=2)
        for day in _days(D - timedelta(days=2), D + timedelta(days=1)):
            self.daily(X, day, "F001", plan=50, actual=40)
            self.daily(Y, day, "F005", plan=20, actual=20)
            self.pin(Y, day, people=6, shtatka=8)
        self.pin(X, D, people=3)
        self.event(c, Y)
        self.db.commit()
        return c, y1, lc, ly

    def test_t5_sibling(self):
        from app.models import Cell, PPWorkCenterDaily
        from app.services import cell_links, zagruzka_source as zs
        c, y1, lc, ly = self._t5_world()
        self.land()
        lo, hi = D - timedelta(days=2), D + timedelta(days=1)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], D, hi), mins0)
        self.assert_unique([X, Y], lo, hi)
        self.db.refresh(c)
        self.db.refresh(y1)
        self.assertEqual((c.wc_group, y1.wc_group), ("A", "B"))
        self.assertIsNone(cell_links.letter_on(y1, D - timedelta(days=1)))
        self.assertIsNone(cell_links.letter_on(c, D - timedelta(days=1)))
        self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, D).lines},
                         {lc.id: "A", ly.id: "B"})
        self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, D - timedelta(days=1)).lines},
                         {ly.id: None})
        pins = {(r.wc_group): (r.people, r.shtatka) for r in self.db.query(PPWorkCenterDaily).filter(
            PPWorkCenterDaily.manager_id == Y, PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {"B": (6, None), "A": (3, None), None: (None, 8)})
        # Each cell reads its own minutes from D.
        cells = self.db.query(Cell).all()
        lab = zs.cell_labor(cells, zs.wc_group_labor(self.db, [X, Y], D, D))
        self.assertAlmostEqual(lab[(y1.id, D.isoformat())][0], 30 * 20 / 60)
        self.assertAlmostEqual(lab[(c.id, D.isoformat())][0], 60 * 50 / 60)
        self.assertEqual(res.rows[0].letters, {str(y1.id): [None, "B"], str(c.id): [None, "A"]})

    def test_t18_letter_neutrality(self):
        """With `with_letters_on` the identity — a reader that dates units but
        not letters — the days before the move still read the same: a new
        letter is one nothing of the destination's past carries."""
        self._t5_world()
        self.land()
        lo = D - timedelta(days=2)
        with mock.patch("app.services.cell_links.with_letters_on", lambda cells, _d: cells):
            hist0 = self.history([X, Y], lo, D - timedelta(days=1))
            self.follow()
            self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)

    # ── T6: the join ─────────────────────────────────────────────────────────

    def test_t6_join(self):
        from app.models import Cell, PPProduct
        from app.services import zagruzka_source as zs
        from app.services.pp_calc import line_keys
        self.units(X, Y)
        c = self.cell("0401", X)
        y1 = self.cell("0402", Y, letter="A")
        p = self.line(X, "F001", "Tort", labor=60, sort=3)
        m = self.line(Y, "F001", "Tort", labor=60, letter="A", sort=0)
        ly2 = self.line(Y, "F009", "Rulet", labor=30, letter="A", sort=1)
        for day in _days(D - timedelta(days=1), D + timedelta(days=1)):
            self.daily(X, day, "F001", plan=100, actual=80)
            self.daily(Y, day, "F001", plan=100, actual=80)
            self.daily(Y, day, "F009", plan=10, actual=10)
        self.event(c, Y)
        self.db.commit()
        self.land()
        keys_y0 = line_keys(pp_catalog.at(self.db, Y, D).lines)
        lo = D - timedelta(days=1)
        hist0 = self.history([X, Y], lo, lo)
        mins_y0 = self.minutes([Y], D, D)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.history([X, Y], lo, lo), hist0)
        self.assert_unique([X, Y], lo, D + timedelta(days=1))
        self.db.expire_all()
        cp = self.db.get(PPProduct, p.id)
        self.assertEqual((cp.manager_id, cp.active, cp.archived_by, cp.archived_from),
                         (Y, False, cf.ARCHIVED_BY, D))
        self.assertIsNotNone(cp.archived_at)
        cat = pp_catalog.at(self.db, Y, D)
        self.assertEqual([q.id for q in cat.lines][-1], p.id)          # sorted last
        self.assertIsNone(self.db.get(PPProduct, m.id).wc_group)       # m unlettered (ruling 5)
        keys_y1 = line_keys(cat.lines)
        self.assertEqual({k: v for k, v in keys_y1.items() if k in keys_y0}, keys_y0)
        self.assertEqual(self.minutes([Y], D, D), mins_y0)             # Y's unit minutes unchanged
        self.assertEqual(self.minutes([X], D, D), {})                  # X lost c's minutes
        cells = self.db.query(Cell).all()
        lab = zs.cell_labor(cells, zs.wc_group_labor(self.db, [X, Y], D, D))
        self.assertAlmostEqual(lab[(c.id, D.isoformat())][0], 50.0)
        self.assertAlmostEqual(lab[(y1.id, D.isoformat())][0], 50.0 + 30 * 10 / 60)
        [row] = self.move_rows()
        self.assertEqual(row.lines[0]["joined_into"], m.id)
        self.assertEqual(row.letter_to, "B")
        self.assertFalse(any(n["kind"] == "conservation" for n in row.named))

    # ── T7: a manual twin is not joined ──────────────────────────────────────

    def test_t7_manual_twin(self):
        from app.models import PPDaily, PPLineDaily, PPProduct
        self.units(X, Y)
        c = self.cell("0501", X)
        self.cell("0502", Y, letter="A")
        p = self.line(X, "F001", "Tort", labor=60, sort=0, auto_fill=False)
        m = self.line(Y, "F001", "Tort", labor=60, letter="A", sort=0)
        self.daily(X, D, "F001", plan=0, actual=0, po=Decimal("30"))
        self.daily(Y, D, "F001", plan=0, actual=0, po=Decimal("50"))
        self.event(c, Y)
        self.db.commit()
        self.land()
        mins0 = self.minutes([X, Y], D, D)
        self.follow()
        self.assertEqual(self.minutes([X, Y], D, D), mins0)           # both typed values counted
        self.assertEqual(mins0[D.isoformat()][0], 80.0)
        self.assert_unique([X, Y], D - timedelta(days=1), D + timedelta(days=1))
        self.db.expire_all()
        self.assertTrue(self.db.get(PPProduct, p.id).active)
        self.assertEqual(self.db.get(PPProduct, p.id).manager_id, Y)
        yrow = self.db.query(PPDaily).filter_by(manager_id=Y, date=D, sap_code="F001").one()
        self.assertIsNone(yrow.plan_override)                        # exploded, then cleared
        self.assertIsNone(self.db.query(PPDaily).filter_by(manager_id=X, date=D).first())
        got = sorted((r.line_key, float(r.plan_override)) for r in
                     self.db.query(PPLineDaily).filter_by(manager_id=Y, date=D).all())
        # m keeps its rank (#0); the arrival sorts after it (#1).
        self.assertEqual(got, [("tort|60#0", 50.0), ("tort|60#1", 30.0)])

    # ── T8: a swap ───────────────────────────────────────────────────────────

    def test_t8_swap(self):
        from app.models import PPWorkCenterDaily
        self.units(X, Y)
        a = self.cell("0601", X, letter="A")
        b = self.cell("0602", Y, letter="A")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(Y, "F001", "Tort", letter="A")
        wx, wy = self.wc(X, C, shtatka=3), self.wc(Y, C, shtatka=4)
        for day in _days(D - timedelta(days=1), D + timedelta(days=1)):
            # One plant file: both units' rows of one work centre hold its figures.
            self.daily(X, day, "F001", plan=10, actual=9)
            self.daily(Y, day, "F001", plan=10, actual=9)
        self.pin(X, D, group="A", people=2)
        self.pin(Y, D, group="A", people=3)
        self.event(a, Y)
        self.event(b, X)
        self.db.commit()
        self.land()
        lo = D - timedelta(days=1)
        hist0 = self.history([X, Y], lo, lo)
        mins0 = self.minutes([X, Y], D, D + timedelta(days=1))
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.history([X, Y], lo, lo), hist0)
        self.assertEqual(self.minutes([X, Y], D, D + timedelta(days=1)), mins0)
        self.assert_unique([X, Y], lo, D + timedelta(days=1))
        self.assertEqual(self.ids_on(Y, D), {la.id})
        self.assertEqual(self.ids_on(X, D), {lb.id})
        self.assertTrue(all(q.active for u in (X, Y) for q in pp_catalog.at(self.db, u, D).lines))
        self.assertEqual([w.id for w in pp_catalog.at(self.db, X, D).work_centers], [wx.id])
        self.assertEqual([w.id for w in pp_catalog.at(self.db, Y, D).work_centers], [wy.id])
        self.db.refresh(a)
        self.db.refresh(b)
        self.assertEqual((a.manager_id, a.wc_group, b.manager_id, b.wc_group), (Y, "A", X, "A"))
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "A"): 2, (X, "A"): 3})
        self.assertFalse([r for r in self.move_rows() if r.lines and r.lines[0]["joined_into"]])
        self.assertEqual(sorted(r.state for r in self.move_rows()), ["moved", "moved"])

    # ── T9: followed late — the window [h, S) rewritten ──────────────────────

    def test_t9_late(self):
        from app.models import PPDaily
        c, _d, (l1, l2, l3), _w, _ev = self._t2_world()
        pp_catalog.freeze(self.db, Y, "edit", day=D + timedelta(days=1))
        self.db.commit()
        self.land()
        lo, hi = D - timedelta(days=3), D + timedelta(days=2)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual((res.state, res.S), ("moved", D + timedelta(days=1)))
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], D, hi), mins0)
        self.assert_unique([X, Y], lo, D + timedelta(days=3))
        for day in (D, D + timedelta(days=1)):
            self.assertEqual(self.ids_on(Y, day), {l1.id, l2.id})
            self.assertEqual(self.ids_on(X, day), {l3.id})
        vy = pp_catalog.versions_between(self.db, Y, D, D)
        self.assertEqual([(v.valid_from, v.valid_to) for v in vy], [(D, D)])
        self.assertEqual({d["id"] for d in vy[0].lines}, {l1.id, l2.id})
        vx = pp_catalog.versions_between(self.db, X, D, D)
        self.assertEqual({d["id"] for d in vx[0].lines}, {l3.id})
        self.assertEqual(self.db.query(PPDaily).filter_by(manager_id=Y, date=D, sap_code="F001").count(), 1)
        [row] = self.move_rows()
        self.assertEqual((row.kind, row.storage_from), ("late", D + timedelta(days=1)))
        self.assertEqual({v["unit"] for v in row.versions}, {X, Y})

    # ── T10: retro, an import inside the window ──────────────────────────────

    def test_t10_retro_with_import(self):
        from app.models import PPProduct
        h = date(2026, 10, 8)
        imp = date(2026, 10, 12)
        last = date(2026, 10, 14)
        self.units(X, Y)
        c = self.cell("0701", Y)                       # moved before link history: no event
        old1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        old2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        other = self.line(X, "F003", "Non", wc="B100", labor=12, sort=2)
        self.cell("0702", X, sap="B100")
        for day in _days(date(2026, 10, 5), last):
            self.daily(X, day, "F001", plan=10, actual=10)
            self.daily(X, day, "F002", plan=20, actual=15)
            self.daily(X, day, "F003", wc="B100", plan=5, actual=5)
        self.db.flush()
        # An ABC import on 12 Oct: frozen, every line re-created with a new id.
        pp_catalog.freeze(self.db, X, "import", day=imp)
        for q in (old1, old2, other):
            self.db.delete(q)
        self.db.flush()
        new1 = self.line(X, "F001", "Tort", labor=60, sort=0)
        new2 = self.line(X, "F002", "Keks", labor=30, sort=1)
        new3 = self.line(X, "F003", "Non", wc="B100", labor=12, sort=2)
        self.db.commit()
        lo = date(2026, 10, 5)
        hist0 = self.history([X, Y], lo, h - timedelta(days=1))
        mins0 = self.minutes([X, Y], h, last)
        t = cf.Transfer(cell_id=c.id, event_id=None, src=X, dst=Y, home_from=h, letter_src=None)
        res = cf.follow_group(self.db, [t], kind="retro", strict=True)
        self.db.commit()
        self.forget()
        self.assertEqual((res.state, res.S), ("moved", imp))
        self.assertEqual(self.history([X, Y], lo, h - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], h, last), mins0)
        self.assert_unique([X, Y], lo, last)
        for day in _days(h, imp - timedelta(days=1)):
            self.assertEqual(self.ids_on(Y, day), {old1.id, old2.id})
            self.assertEqual(self.ids_on(X, day), {other.id})
        for day in _days(imp, last):
            self.assertEqual(self.ids_on(Y, day), {new1.id, new2.id})
            self.assertEqual(self.ids_on(X, day), {new3.id})
        [row] = self.move_rows()
        self.assertEqual((row.kind, row.state, row.event_id), ("retro", "moved", None))
        self.assertEqual(set(row.line_ids), {old1.id, old2.id, new1.id, new2.id})
        # Impact: X kept only «Non» (12 s × 5), Y took Tort and Keks.
        self.assertEqual(row.impact[str(X)][h.isoformat()]["plan"], [21.0, 1.0])
        self.assertEqual(row.impact[str(Y)][h.isoformat()]["plan"], [0.0, 20.0])
        self.assertEqual(self.db.query(PPProduct).filter_by(manager_id=Y).count(), 2)

    # ── a whole team, and a team split over two units ────────────────────────

    def test_team_moves_whole(self):
        """Both cells of X's code go to one Y: the shared line goes with them
        (group-shared, unlettered), the whole-centre pin stays whole."""
        from app.models import PPWorkCenterDaily
        self.units(X, Y)
        c1 = self.cell("1101", X, letter="A")
        c2 = self.cell("1102", X, letter="B")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        ls = self.line(X, "F003", "Non", sort=2)
        w = self.wc(X, C, shtatka=9)
        for day in _days(D - timedelta(days=1), D):
            for sap in ("F001", "F002", "F003"):
                self.daily(X, day, sap, plan=12, actual=12)
            self.pin(X, day, people=7, shtatka=9)
        self.event(c1, Y)
        self.event(c2, Y)
        self.db.commit()
        self.land()
        lo = D - timedelta(days=1)
        hist0 = self.history([X, Y], lo, lo)
        mins0 = self.minutes([X, Y], D, D)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.history([X, Y], lo, lo), hist0)
        self.assertEqual(self.minutes([X, Y], D, D), mins0)
        self.assert_unique([X, Y], lo, D + timedelta(days=1))
        self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, D).lines},
                         {la.id: "A", lb.id: "B", ls.id: None})
        self.assertEqual([x.id for x in pp_catalog.at(self.db, Y, D).work_centers], [w.id])
        pins = {(r.manager_id, r.wc_group): (r.people, r.shtatka)
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, None): (7, 9)})
        rows = {r.cell_id: r for r in self.move_rows()}
        self.assertEqual(set(rows[c1.id].line_ids), {la.id, ls.id})
        self.assertEqual(set(rows[c2.id].line_ids), {lb.id, ls.id})
        self.assertTrue(rows[c1.id].whole_code and rows[c2.id].whole_code)

    def test_team_split_over_two_units(self):
        """c1 → Y, c2 → Z, nobody stays: each takes its own lines, the shared
        one stays and is named; the pins are handed out by `share`."""
        from app.models import PPWorkCenterDaily
        self.units(X, Y, Z)
        c1 = self.cell("1201", X, letter="A")
        c2 = self.cell("1202", X, letter="B")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        ls = self.line(X, "F003", "Non", sort=2)
        self.daily(X, D, "F001", plan=6, actual=6)
        self.daily(X, D, "F002", plan=6, actual=6)
        self.pin(X, D, group="A", people=3)
        self.pin(X, D, group="B", people=4)
        self.event(c1, Y)
        self.event(c2, Z)
        self.db.commit()
        self.land()
        mins0 = self.minutes([X, Y, Z], D, D)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.minutes([X, Y, Z], D, D), mins0)
        self.assert_unique([X, Y, Z], D - timedelta(days=1), D + timedelta(days=1))
        self.assertEqual(self.ids_on(Y, D), {la.id})
        self.assertEqual(self.ids_on(Z, D), {lb.id})
        self.assertEqual(self.ids_on(X, D), {ls.id})
        self.assertIn("shared_left_split", {n["kind"] for n in res.report["named"]})
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "A"): 3, (Z, "B"): 4})

    # ── letter history without a landing event (the retro's case) ───────────

    def test_mark_event_carries_the_letter(self):
        from app.models import CellLinkEvent
        from app.services import cell_links
        h = date(2026, 10, 8)
        self.units(X, Y)
        c = self.cell("1301", Y)                       # moved before link history
        self.cell("1302", Y, letter="A")
        self.line(X, "F001", "Tort", letter="Q")      # an orphan letter in X: c's
        self.db.commit()
        t = cf.Transfer(cell_id=c.id, event_id=None, src=X, dst=Y, home_from=h, letter_src="A")
        res = cf.follow_group(self.db, [t], kind="retro")
        self.db.commit()
        self.forget()
        self.assertEqual(res.state, "moved")
        self.db.refresh(c)
        self.assertEqual(c.wc_group, "B")
        [mark] = self.db.query(CellLinkEvent).filter_by(cell_id=c.id).all()
        self.assertTrue(mark.vfx["catalog_mark"])
        self.assertEqual((mark.value, mark.prev, mark.effective_from), (Y, Y, h))
        self.assertIsNone(cell_links.letter_on(c, h - timedelta(days=1)))
        self.assertEqual(cell_links.letter_on(c, h), "B")
        self.assertEqual(cell_links.history(self.db, c.id), [])        # hidden
        self.assertNotIn(c.id, cell_links.events().get("manager_id", {}))
        self.assertEqual(cell_links.value_on(c, "manager_id", h - timedelta(days=30)), Y)
        self.assertEqual(self.groups(), [])                               # never followed itself

    # ── the landing kicks the follow ─────────────────────────────────────────

    def test_run_apply_due_kicks(self):
        """The minute job lands the change (its opening, D 08:00, is long past)
        and kicks the follow; the event remembers the letter it left with."""
        from app.models import CellLinkEvent
        from app.services import cell_links
        self._t2_world()
        with mock.patch.object(cf, "kick") as kick, \
                mock.patch("app.services.action_log.record_system"):
            cell_links.run_apply_due()
        kick.assert_called_once()
        self.forget()
        [g] = self.groups()
        self.assertIn("letter_before", self.db.get(CellLinkEvent, g[0].event_id).vfx)

    def test_kept_answers_forgotten(self):
        from app.services import kept_answer
        k = kept_answer.KeptAnswers("t")
        k._kept["a"] = (0.0, 1)
        cf._forget_caches()
        self.assertEqual(k._kept, {})

    # ── the named conditions ─────────────────────────────────────────────────

    def test_archived_twin_dropped(self):
        """Y keeps an ARCHIVED twin of the arriving line and no live one: on the
        current rows the archived twin goes (a live line and an archived one
        must not share an identity); the version before h keeps it."""
        from app.models import PPProduct
        self.units(X, Y)
        c = self.cell("1401", X)
        p = self.line(X, "F001", "Tort")
        q = self.line(Y, "F001", "Tort", active=False)
        self.daily(X, D, "F001", plan=5, actual=5)
        self.event(c, Y)
        self.db.commit()
        self.land()
        mins0 = self.minutes([X, Y], D, D)
        res = self.follow()
        self.assertEqual(self.minutes([X, Y], D, D), mins0)
        self.assertIsNone(self.db.get(PPProduct, q.id))
        self.assertEqual(self.ids_on(Y, D), {p.id})
        self.assertEqual(self.ids_on(Y, D - timedelta(days=1)), {q.id})
        self.assertIn("archived_twin_dropped", {n["kind"] for n in res.report["named"]})

    def test_join_spread_and_unpaired_twin(self):
        """Y: y1(A) owns m, y2(B) beside it; c brings TWO identical lines. One
        joins m (m loses its letter, so y2 shares it — said), the other has no
        partner and moves live (said)."""
        from app.models import PPProduct
        self.units(X, Y)
        c = self.cell("1501", X)
        self.cell("1502", Y, letter="A")
        self.cell("1503", Y, letter="B")
        p1 = self.line(X, "F001", "Tort", sort=0)
        p2 = self.line(X, "F001", "Tort", sort=1)
        m = self.line(Y, "F001", "Tort", letter="A")
        self.event(c, Y)
        self.db.commit()
        self.land()
        res = self.follow()
        kinds = {n["kind"] for n in res.report["named"]}
        self.assertTrue({"join_spread", "unpaired_twin"} <= kinds, kinds)
        self.db.expire_all()
        self.assertIsNone(self.db.get(PPProduct, m.id).wc_group)
        self.assertEqual((self.db.get(PPProduct, p1.id).active, self.db.get(PPProduct, p2.id).active),
                         (False, True))
        self.assert_unique([X, Y], D - timedelta(days=1), D + timedelta(days=1))

    def test_pins_with_stayers(self):
        """X: c(A), d(B), a whole-centre pin beside c's group pin; Y: y1(A) and
        y2(C) under a whole-centre people pin. c (→ B in Y) takes its own pin;
        Y has no group pin, so it is added to Y's whole pin; X keeps its whole
        pin."""
        from app.models import PPWorkCenterDaily
        self.units(X, Y)
        c = self.cell("1601", X, letter="A")
        self.cell("1602", X, letter="B")
        self.cell("1603", Y, letter="A")
        self.cell("1604", Y, letter="C")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B")
        self.pin(X, D, group="A", people=2)
        self.pin(X, D, people=9)                      # ignored beside group pins
        self.pin(Y, D, people=5)
        self.event(c, Y)
        self.db.commit()
        self.land()
        res = self.follow()
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, None): 7, (X, None): 9})
        kinds = {n["kind"] for n in res.report["named"]}
        self.assertTrue({"pin_added_to_whole", "x_whole_pin_kept"} <= kinds, kinds)

    def test_rejoin_from_a_manual_unit(self):
        """X kept by hand, Y filled by the file: the moved pairs are re-joined
        in Y from h, never committing; the switches differing is said."""
        from app.models import PPManagerSetting
        self._t2_world()
        self.db.add(PPManagerSetting(manager_id=X, auto_fill=False))
        self.db.commit()
        self.land()
        calls = []

        def fake(db, mid, pairs, since=None, commit=True):
            calls.append((mid, sorted(pairs), since, commit))
            return {"days": 1, "rows": 2, "skipped": False}

        with mock.patch("app.routers.production._rejoin_lines", fake):
            res = self.follow()
        self.assertEqual(calls, [(Y, [("F001", C), ("F002", C)], D, False)])
        self.assertIn("autofill_differs", {n["kind"] for n in res.report["named"]})
        self.assertEqual(res.report["rekey"].get("rejoined"), 2)

    def test_edges_from_and_to_no_unit(self):
        """A brigadir-less cell gaining a unit moves nothing; a cell whose
        brigadir was cleared is named and its lines stay."""
        self.units(X, Y)
        a = self.cell("1701", None)
        b = self.cell("1702", X)
        lb = self.line(X, "F001", "Tort")
        self.event(a, Y)
        ev = self.event(b, None)
        ev.vfx = {"sap_code_at_request": "A2895"}
        self.db.commit()
        self.land()
        groups = self.groups()
        self.assertEqual(len(groups), 1)
        res = cf.follow_group(self.db, groups[0], kind="live")
        self.db.commit()
        self.forget()
        rows = {r.cell_id: r for r in self.move_rows()}
        self.assertEqual(rows[a.id].state, "nothing")
        self.assertIn("from_no_unit", {n["kind"] for n in rows[a.id].named})
        self.assertEqual(rows[b.id].state, "named")
        self.assertTrue({"to_no_unit", "code_changed"} <= {n["kind"] for n in rows[b.id].named})
        self.assertEqual(self.ids_on(X, D), {lb.id})
        self.assertEqual(res.state, "nothing")

    # ── T15 / T16: the sweep — busy, retried, then idempotent ────────────────

    def test_t15_t16_sweep_busy_retry_idempotent(self):
        from app.models import PPCatalogMove
        _c, _d, (l1, l2, _l3), _w, ev = self._t2_world()
        self.enable()
        self.db.commit()
        self.land()
        self.assertEqual(cf.unsettled(self.db, [_c.id], D), {_c.id})
        other = self.pg.Session()
        self.others.append(other)
        self.assertTrue(pp_catalog.lock(other, [X]))                  # an edit holding X's catalog
        with mock.patch("app.services.action_log.record_system") as jurnal, \
                mock.patch.object(cf, "_dm") as dm:
            cf.run_sweep()
            self.forget()
            [row] = self.move_rows()
            self.assertEqual((row.state, row.tries, row.event_id), ("busy", 1, ev.id))
            self.assertIsNotNone(row.next_try_at)
            self.assertEqual(cf.unsettled(self.db, [_c.id], D), {_c.id})
            # Not yet due: a second pass leaves it waiting.
            cf.run_sweep()
            self.forget()
            self.assertEqual(self.move_rows()[0].tries, 1)
            other.rollback()                                            # the edit commits
            self.db.query(PPCatalogMove).update(
                {"next_try_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
            self.db.commit()
            cf.run_sweep()
            self.forget()
            [row] = self.move_rows()
            self.assertEqual(row.state, "moved")
            self.assertEqual(sorted(row.line_ids), sorted([l1.id, l2.id]))
            self.assertEqual(cf.unsettled(self.db, [_c.id], D), set())
            self.assertTrue(jurnal.called)
            self.assertEqual(jurnal.call_args.args[:2], ("org", "org.catalog_moved"))
            dm.assert_not_called()
            # T16: once more — nothing to follow, nothing written.
            fp = self.fingerprint()
            jurnal.reset_mock()
            cf.run_sweep()
            self.forget()
            self.assertEqual(self.fingerprint(), fp)
            self.assertEqual(len(self.move_rows()), 1)
            jurnal.assert_not_called()

    def test_sweep_off_until_retro_done(self):
        self._t2_world()
        self.land()
        cf.run_sweep()
        self.forget()
        self.assertEqual(self.move_rows(), [])
        self.assertEqual(cf.unsettled(self.db, [1, 2, 3], D), set())

    def test_retry_gives_up(self):
        """Past the last back-off a failing group is given up and said."""
        from app.models import PPCatalogMove
        self._t2_world()
        self.enable()
        self.db.commit()
        self.land()
        with mock.patch.object(cf, "follow_group", side_effect=RuntimeError("boom")), \
                mock.patch.object(cf.log, "exception"), \
                mock.patch("app.services.action_log.record_system"), \
                mock.patch.object(cf, "_dm") as dm:
            for _ in range(len(cf.BACKOFF_MIN) + 1):
                cf.run_sweep()
                self.forget()
                self.db.query(PPCatalogMove).filter(PPCatalogMove.next_try_at.isnot(None)).update(
                    {"next_try_at": datetime.now(timezone.utc) - timedelta(minutes=1)})
                self.db.commit()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.tries), ("gave_up", len(cf.BACKOFF_MIN) + 1))
        self.assertIn("boom", row.error)
        self.assertTrue(dm.called)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class FollowEdges(_World):
    """Strict mode (the retroactive one-shot), a move that leaves a shared
    line behind, and a cell that owns nothing."""

    def test_strict_shared_left_writes_nothing(self):
        """Two cells of X share an unlettered line and only one leaves: strict
        (the retro) refuses the whole transfer and writes nothing of it."""
        self.units(X, Y)
        c = self.cell("0801", X, letter="A")
        self.cell("0802", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks")                    # shared by both
        self.daily(X, D, "F001", plan=1, actual=1)
        self.event(c, Y)
        self.db.commit()
        self.land()
        before = [r for r in self.fingerprint() if not r[0].startswith("pp_catalog_moves")
                  and not r[0].startswith("cell")]
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "named")
        after = [r for r in self.fingerprint() if not r[0].startswith("pp_catalog_moves")
                 and not r[0].startswith("cell")]
        self.assertEqual(after, before)
        [row] = self.move_rows()
        self.assertEqual(row.state, "named")
        self.assertIn("shared_left", {n["kind"] for n in row.named})

    def test_live_shared_left_moves_the_own_lines(self):
        """The same live: c's own line moves, the shared one stays and is named."""
        self.units(X, Y)
        c = self.cell("0901", X, letter="A")
        self.cell("0902", X, letter="B")
        own = self.line(X, "F001", "Tort", letter="A")
        shared = self.line(X, "F002", "Keks")
        self.event(c, Y)
        self.db.commit()
        self.land()
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.ids_on(Y, D), {own.id})
        self.assertEqual(self.ids_on(X, D), {shared.id})
        [row] = self.move_rows()
        self.assertIn("shared_left", {n["kind"] for n in row.named})

    def test_strict_archived_shared_line_does_not_stop(self):
        """§1.9: archived lines never block. The two cells of X share an
        ARCHIVED unlettered line and only one leaves: strict (the retro) still
        moves c's own line. The archived one stays in X — owned by nobody —
        and is said as `shared_left_archived`, never `shared_left`."""
        self.units(X, Y)
        c = self.cell("0811", X, letter="A")
        self.cell("0812", X, letter="B")
        own = self.line(X, "F001", "Tort", letter="A")
        gone = self.line(X, "F002", "Keks", active=False, sort=1)
        self.daily(X, D, "F001", plan=1, actual=1)
        self.event(c, Y)
        self.db.commit()
        self.land()
        mins0 = self.minutes([X, Y], D, D)
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.ids_on(Y, D), {own.id})
        self.assertEqual(self.ids_on(X, D), {gone.id})
        self.assertEqual(self.minutes([X, Y], D, D), mins0)
        [row] = self.move_rows()
        self.assertEqual((row.state, row.line_ids), ("moved", [own.id]))
        kinds = {n["kind"] for n in row.named}
        self.assertIn("shared_left_archived", kinds)
        self.assertFalse(kinds & {"shared_left", "shared_left_split"})
        [n] = [n for n in row.named if n["kind"] == "shared_left_archived"]
        self.assertEqual((n["unit"], n["count"], n["lines"]), (X, 1, ["Keks"]))
        self.assertNotIn("shared_left_archived", cf.STRICT_STOP)

    def test_strict_active_shared_line_still_stops_beside_an_archived_one(self):
        """The same with an ACTIVE shared line beside the archived one: the
        active one is a position somebody still makes, and it stops a strict
        follow — named, nothing written; each kind counts its own lines."""
        self.units(X, Y)
        c = self.cell("0821", X, letter="A")
        self.cell("0822", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", sort=1)                       # shared, active
        self.line(X, "F003", "Non", active=False, sort=2)          # shared, archived
        self.event(c, Y)
        self.db.commit()
        self.land()
        before = [r for r in self.fingerprint() if not r[0].startswith("pp_catalog_moves")
                  and not r[0].startswith("cell")]
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "named")
        self.assertEqual([r for r in self.fingerprint() if not r[0].startswith("pp_catalog_moves")
                          and not r[0].startswith("cell")], before)
        [row] = self.move_rows()
        got = {n["kind"]: (n["count"], n["lines"]) for n in row.named
               if n["kind"].startswith("shared_left")}
        self.assertEqual(got, {"shared_left": (1, ["Keks"]), "shared_left_archived": (1, ["Non"])})

    def test_split_team_leaves_an_archived_shared_line_quietly(self):
        """Nobody stays and the team goes to two units: the archived line two
        of them shared stays in X as well, said with `split`; with no ACTIVE
        shared line there is nothing to stop — strict moves each own line."""
        self.units(X, Y, Z)
        c1 = self.cell("0831", X, letter="A")
        c2 = self.cell("0832", X, letter="B")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        ls = self.line(X, "F003", "Non", active=False, sort=2)
        self.event(c1, Y)
        self.event(c2, Z)
        self.db.commit()
        self.land()
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "moved")
        self.assertEqual((self.ids_on(Y, D), self.ids_on(Z, D), self.ids_on(X, D)),
                         ({la.id}, {lb.id}, {ls.id}))
        [n] = [n for n in res.report["named"] if n["kind"].startswith("shared_left")]
        self.assertEqual((n["kind"], n.get("split")), ("shared_left_archived", True))

    def test_owned_nothing(self):
        """An unlettered cell among lettered ones owns nothing: no lock, no
        freeze, a `nothing` row."""
        self.units(X, Y)
        c = self.cell("1001", X)
        self.cell("1002", X, letter="B")
        self.line(X, "F001", "Tort", letter="B")
        self.event(c, Y)
        self.db.commit()
        self.land()
        res = self.follow()
        self.assertEqual(res.state, "nothing")
        self.assertIsNone(pp_catalog.current_from(self.db, Y))       # nothing frozen
        [row] = self.move_rows()
        self.assertEqual(row.state, "nothing")
        self.assertIn("owned_nothing", {n["kind"] for n in row.named})



@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class FollowReview(_World):
    """The independent review's scenarios: strict mode stopping INSIDE the
    writes, typed people conserved while cells stay, an earlier move at the
    code followed first, the sweep retrying what it does not own (event-less
    retro transfers), a busy group keeping its settled rows, windows with
    several boundaries, two spellings of one work centre."""

    def catalog_fingerprint(self):
        """`fingerprint` without the move records and the events' summary —
        what a strict stop must leave exactly as it was."""
        return [r for r in self.fingerprint()
                if not r[0].startswith(("pp_catalog_moves", "cell_link_events"))]

    def people(self, units, a, b):
        from app.services import zagruzka_source as zs
        return {k: v for k, v in zs.unit_people(zs.typed_pins(self.db, units, a, b)).items() if v}

    def test_strict_stop_inside_the_writes_rolls_back(self):
        """A pin conflict is found only while the per-day rows are written:
        strict mode rolls the whole follow back — the boundary `align` drew
        included — and records the transfer `named`."""
        self.units(X, Y)
        c = self.cell("2001", X)
        l1 = self.line(X, "F001", "Tort")
        self.daily(X, D, "F001", plan=10, actual=10)
        self.pin(X, D, people=3)
        self.pin(Y, D, people=5)                    # an orphan whole pin, no cell of Y there
        self.event(c, Y)
        self.db.commit()
        self.land()
        before = self.catalog_fingerprint()
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "named")
        self.assertIn("pin_conflict", {n["kind"] for n in res.report["named"]})
        self.assertEqual(self.catalog_fingerprint(), before)
        self.assertIsNone(pp_catalog.current_from(self.db, X))
        self.assertIsNone(pp_catalog.current_from(self.db, Y))
        self.assertEqual(self.ids_on(X, D), {l1.id})
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind), ("named", "retro"))

    def test_strict_conservation_rolls_back(self):
        """Y's own line at the pair read a 0/0 snapshot that the arrival's
        figures overwrite — minutes appear from nowhere: strict stops."""
        self.units(X, Y)
        c = self.cell("2101", X)
        self.line(X, "F001", "Tort", labor=60)
        self.line(Y, "F001", "Keks", labor=30)
        self.daily(X, D, "F001", plan=100, actual=90)
        self.daily(Y, D, "F001", plan=0, actual=0)
        self.event(c, Y)
        self.db.commit()
        self.land()
        before = self.catalog_fingerprint()
        res = self.follow(kind="retro", strict=True)
        self.assertEqual(res.state, "named")
        self.assertIn("conservation", {n["kind"] for n in res.report["named"]})
        self.assertEqual(self.catalog_fingerprint(), before)

    def test_people_conserved_when_cells_stay(self):
        """X: c(A), d(B) under ONE whole-centre pin of 10 (the common state of
        a lettered work centre). c leaves, d stays: the whole pin is shared, so
        it stays with d like a shared line — c takes none of it into Y, or the
        same people would count in both units."""
        self.units(X, Y)
        c = self.cell("2201", X, letter="A")
        self.cell("2202", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B")
        self.pin(X, D, people=10)
        self.event(c, Y)
        self.db.commit()
        self.land()
        p0 = self.people([X, Y], D, D)
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(sum(self.people([X, Y], D, D).values()), sum(p0.values()))
        self.assertIn("x_whole_pin_kept", {n["kind"] for n in res.report["named"]})

    def test_people_conserved_with_an_orphan_pin(self):
        """c takes its own group pin; an orphan-letter pin stays with d."""
        from app.models import PPWorkCenterDaily
        self.units(X, Y)
        c = self.cell("2211", X, letter="A")
        self.cell("2212", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B")
        self.pin(X, D, group="A", people=3)
        self.pin(X, D, group="B", people=2)
        self.pin(X, D, group="Q", people=4)          # nobody carries Q
        self.event(c, Y)
        self.db.commit()
        self.land()
        p0 = self.people([X, Y], D, D)
        self.follow()
        pins = {(r.manager_id, r.wc_group): r.people
                for r in self.db.query(PPWorkCenterDaily).filter(PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {(Y, "A"): 3, (X, "B"): 2, (X, "Q"): 4})
        self.assertEqual(sum(self.people([X, Y], D, D).values()), sum(p0.values()))

    def test_earlier_move_at_the_code_goes_first(self):
        """e(A) leaves X on D, c(B) leaves X on D+3. While e's follow waits
        (busy), c's must wait too: otherwise c — alone in X at the code —
        would own e's orphaned line and take it away."""
        from app.models import PPCatalogMove
        self.units(X, Y, Z)
        e = self.cell("2301", X, letter="A")
        c = self.cell("2302", X, letter="B")
        le = self.line(X, "F001", "Tort", letter="A")
        lc = self.line(X, "F002", "Keks", letter="B", sort=1)
        ev_e = self.event(e, Y, eff=D)
        self.event(c, Z, eff=D + timedelta(days=3))
        self.db.commit()
        self.land(D + timedelta(days=3))
        later = datetime.combine(D + timedelta(days=30), time(9), tzinfo=TZ)
        self.assertEqual([[t.cell_id for t in g] for g in cf._candidates(self.db, later)],
                         [[e.id]])                              # c waits for e
        self.db.add(PPCatalogMove(kind="live", state="busy", event_id=ev_e.id, cell_id=e.id,
                                  code=C, from_unit=X, to_unit=Y, home_from=D, tries=1,
                                  next_try_at=later + timedelta(hours=1)))
        self.db.commit()
        self.assertEqual(cf._candidates(self.db, later), [])     # e not due, c still waits
        self.db.query(PPCatalogMove).update({"next_try_at": later - timedelta(minutes=1)})
        self.db.commit()
        [g] = cf._candidates(self.db, later)
        cf.follow_group(self.db, g, kind="live")
        self.db.commit()
        self.forget()
        [g] = cf._candidates(self.db, later)
        self.assertEqual([t.cell_id for t in g], [c.id])
        cf.follow_group(self.db, g, kind="live")
        self.db.commit()
        self.forget()
        self.assertEqual(self.ids_on(Y, D + timedelta(days=3)), {le.id})
        self.assertEqual(self.ids_on(Z, D + timedelta(days=3)), {lc.id})
        self.assert_unique([X, Y, Z], D - timedelta(days=1), D + timedelta(days=4))

    def test_a_group_waits_whole(self):
        """Two cells move to one unit on one day at one code — one group, its
        letters settled together. While one member waits for its retry the
        other is not followed alone."""
        from app.models import PPCatalogMove
        self.units(X, Y)
        c1 = self.cell("2601", X, letter="A")
        c2 = self.cell("2602", X, letter="B")
        self.line(X, "F001", "Tort", letter="A")
        self.line(X, "F002", "Keks", letter="B")
        ev1 = self.event(c1, Y)
        self.event(c2, Y)
        self.db.commit()
        self.land()
        later = datetime.combine(D + timedelta(days=30), time(9), tzinfo=TZ)
        self.db.add(PPCatalogMove(kind="live", state="busy", event_id=ev1.id, cell_id=c1.id,
                                  code=C, from_unit=X, to_unit=Y, home_from=D, tries=1,
                                  next_try_at=later + timedelta(minutes=5)))
        self.db.commit()
        self.assertEqual(cf._candidates(self.db, later), [])
        self.assertEqual([sorted(t.cell_id for t in g)
                          for g in cf._candidates(self.db, later + timedelta(minutes=6))],
                         [sorted([c1.id, c2.id])])

    def test_a_change_still_to_land_at_the_code_holds_the_group(self):
        """c2 → Z has landed (08:00) and c1 → Y — the same day, the same code —
        lands at 20:00. The sweep hands the group over only once both have
        landed; a caller that asks for c2 alone meanwhile is TOLD, never
        guessed for: a live follow and a strict one both wait (`busy`, named
        `pending_move`), and nothing is written. Once c1 lands the two are one
        group and each takes its own line."""
        from app.models import CellLinkEvent
        from app.services import cell_links
        self.units(X, Y, Z)
        c1 = self.cell("2701", X, letter="A")
        c2 = self.cell("2702", X, letter="B")
        la = self.line(X, "F001", "Tort", letter="A")
        lb = self.line(X, "F002", "Keks", letter="B", sort=1)
        self.daily(X, D, "F001", plan=6, actual=6)
        self.daily(X, D, "F002", plan=6, actual=6)
        self.pin(X, D, group="A", people=3)
        self.pin(X, D, group="B", people=4)
        ev2 = self.event(c2, Z)
        ev1 = self.event(c1, Y)
        ev1.effective_at = datetime.combine(D, time(20), tzinfo=TZ)
        self.db.commit()
        self.land()                                            # D 09:00: c2 alone
        self.assertIsNone(self.db.get(CellLinkEvent, ev1.id).applied_at)
        self.assertEqual(self.groups(), [])
        self.assertNotIn("pending_move", cf.STRICT_STOP)
        t2 = cf.Transfer(cell_id=c2.id, event_id=ev2.id, src=X, dst=Z, home_from=D,
                         letter_src="B")
        before = self.catalog_fingerprint()
        res = cf.follow_group(self.db, [t2], kind="live")
        self.assertEqual(res.state, "busy")
        [n] = res.report["named"]
        self.assertEqual((n["kind"], n["cells"], n["events"]), ("pending_move", [c1.id], [ev1.id]))
        res = cf.follow_group(self.db, [t2], kind="retro", strict=True, dry=True)
        self.assertEqual(res.state, "busy")
        self.assertIn("pending_move", {n["kind"] for n in res.report["named"]})
        self.db.rollback()
        self.forget()
        self.assertEqual(self.catalog_fingerprint(), before)
        self.assertEqual(self.move_rows(), [])
        cell_links.apply_due(self.db, now=datetime.combine(D, time(20, 1), tzinfo=TZ))
        self.db.commit()
        self.forget()
        res = self.follow()
        self.assertEqual(res.state, "moved")
        self.assertEqual(self.ids_on(Y, D), {la.id})
        self.assertEqual(self.ids_on(Z, D), {lb.id})
        self.assert_unique([X, Y, Z], D - timedelta(days=1), D + timedelta(days=1))

    def test_sweep_retries_an_eventless_retro_transfer(self):
        """The retroactive one-shot recorded a transfer of a cell with no
        landing event `busy`: the sweep retries it — strict, as a retro, on the
        SAME record — although no event points at it. The evidence that made
        the one-shot read the hop is still there, so its recheck passes."""
        from app.models import PPCatalogMove
        h = date(2026, 10, 8)
        self.units(X, Y)
        c = self.cell("2401", Y)                    # moved before link history
        p = self.line(X, "F001", "Tort")
        self.daily(X, h, "F001", plan=4, actual=4)
        self.att(c, X, date(2026, 9, 29), h - timedelta(days=1))
        self.att(c, Y, h, date(2026, 10, 11))
        self.enable()
        self.db.add(PPCatalogMove(kind="retro", state="busy", event_id=None, cell_id=c.id,
                                  code=C, from_unit=X, to_unit=Y, home_from=h, tries=1,
                                  next_try_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        self.db.commit()
        with mock.patch("app.services.action_log.record_system"), mock.patch.object(cf, "_dm"):
            cf.run_sweep()
        self.forget()
        [row] = self.move_rows()
        self.assertEqual((row.state, row.kind, row.event_id), ("moved", "retro", None))
        self.assertEqual(self.ids_on(Y, h), {p.id})
        with mock.patch("app.services.action_log.record_system"), mock.patch.object(cf, "_dm"):
            cf.run_sweep()                              # final now: never again
        self.forget()
        self.assertEqual(len(self.move_rows()), 1)

    def test_busy_group_keeps_its_settled_rows(self):
        """One cell of the group is archived (settled `nothing` without a lock),
        the other meets a held lock: the first is final at once, only the
        second waits."""
        self.units(X, Y)
        gone = self.cell("2501", X)
        gone.archived_at = datetime.combine(D - timedelta(days=2), time(12), tzinfo=TZ)
        c = self.cell("2502", X)
        self.line(X, "F001", "Tort")
        self.event(gone, Y)
        self.event(c, Y)
        self.enable()
        self.db.commit()
        self.land()
        other = self.pg.Session()
        self.others.append(other)
        self.assertTrue(pp_catalog.lock(other, [X]))
        with mock.patch("app.services.action_log.record_system"), mock.patch.object(cf, "_dm"):
            cf.run_sweep()
        self.forget()
        rows = {r.cell_id: r for r in self.move_rows()}
        self.assertEqual(rows[gone.id].state, "nothing")
        self.assertIn("archived", {n["kind"] for n in rows[gone.id].named})
        self.assertEqual((rows[c.id].state, rows[c.id].tries), ("busy", 1))

    def test_window_boundaries_and_join_per_span(self):
        """h = D; Y gains an identical twin m from D+1, X is edited from D+2
        (S = D+2). On D the arrival is live in Y; from D+1 it is joined to m."""
        from app.models import PPProduct
        self.units(X, Y)
        c = self.cell("3001", X)
        self.cell("3002", Y, letter="A")
        p = self.line(X, "F001", "Tort", labor=60)
        q = self.line(X, "F009", "Other", wc="B100", labor=10)
        self.cell("3003", X, sap="B100")
        yl = self.line(Y, "F005", "Pirog", labor=30, letter="A")
        for day in _days(D - timedelta(days=1), D + timedelta(days=3)):
            self.daily(X, day, "F001", plan=60, actual=60)
            self.daily(X, day, "F009", wc="B100", plan=6, actual=6)
            self.daily(Y, day, "F005", plan=2, actual=2)
        self.db.flush()
        pp_catalog.freeze(self.db, Y, "edit", day=D + timedelta(days=1))
        m = self.line(Y, "F001", "Tort", labor=60, letter="A", sort=5)
        for day in _days(D + timedelta(days=1), D + timedelta(days=3)):
            self.daily(Y, day, "F001", plan=60, actual=60)
        pp_catalog.freeze(self.db, X, "edit", day=D + timedelta(days=2))
        self.db.query(PPProduct).filter_by(id=q.id).update({"labor_time": Decimal("11")})
        self.event(c, Y)
        self.db.commit()
        self.land()
        lo, hi = D - timedelta(days=1), D + timedelta(days=3)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual((res.state, res.S), ("moved", D + timedelta(days=2)))
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assert_unique([X, Y], lo, hi)
        self.assertEqual(self.ids_on(Y, D), {p.id, yl.id})
        self.assertEqual(self.minutes([X, Y], D, D), {D.isoformat(): mins0[D.isoformat()]})
        for day in _days(D + timedelta(days=1), hi):
            act = {r.id: r.active for r in pp_catalog.at(self.db, Y, day).lines}
            self.assertEqual((act.get(p.id), act.get(m.id)), (False, True), day)
            # The join only lowers: X no longer counts p, Y counts m once.
            self.assertLess(self.minutes([X, Y], day, day)[day.isoformat()][0],
                            mins0[day.isoformat()][0])

    def test_two_spellings_of_one_work_centre(self):
        """X stores the work centre as «A2894» and «a2894»: one row and one
        pin arrive in Y (the other spelling's row dropped and recorded)."""
        from app.models import PPWorkCenterDaily
        self.units(X, Y)
        c = self.cell("3101", X)
        l1 = self.line(X, "F001", "Tort", wc="A2894")
        l2 = self.line(X, "F002", "Keks", wc="a2894")
        w1 = self.wc(X, "A2894", shtatka=3)
        w2 = self.wc(X, "a2894", shtatka=4)
        self.daily(X, D, "F001", wc="A2894", plan=10, actual=10)
        self.daily(X, D, "F002", wc="a2894", plan=10, actual=10)
        self.pin(X, D, wc="A2894", people=2)
        self.pin(X, D, wc="a2894", people=3)
        self.event(c, Y)
        self.db.commit()
        self.land()
        mins0 = self.minutes([X, Y], D, D)
        self.follow()
        self.assertEqual(self.minutes([X, Y], D, D), mins0)
        self.assertEqual(self.ids_on(Y, D), {l1.id, l2.id})
        self.assertEqual([w.id for w in pp_catalog.at(self.db, Y, D).work_centers], [w1.id])
        self.assertEqual(pp_catalog.at(self.db, X, D).work_centers, [])
        [row] = self.move_rows()
        self.assertEqual([w["id"] for w in row.wc_dropped], [w2.id])
        pins = [(r.manager_id, r.people) for r in self.db.query(PPWorkCenterDaily).all()]
        self.assertEqual(pins, [(Y, 5)])

    def test_sibling_in_a_late_window(self):
        """The lone unlettered sibling's letter reaches every span of [h, S)."""
        self.units(X, Y)
        c = self.cell("3301", X)
        self.cell("3302", Y)
        lc = self.line(X, "F001", "Tort", labor=60)
        ly = self.line(Y, "F005", "Pirog", labor=30)
        for day in _days(D - timedelta(days=1), D + timedelta(days=2)):
            self.daily(X, day, "F001", plan=50, actual=40)
            self.daily(Y, day, "F005", plan=20, actual=20)
            self.pin(Y, day, people=6)
        self.db.flush()
        pp_catalog.freeze(self.db, X, "edit", day=D + timedelta(days=1))
        self.event(c, Y)
        self.db.commit()
        self.land()
        lo, hi = D - timedelta(days=1), D + timedelta(days=2)
        hist0 = self.history([X, Y], lo, D - timedelta(days=1))
        mins0 = self.minutes([X, Y], D, hi)
        res = self.follow()
        self.assertEqual((res.state, res.S), ("moved", D + timedelta(days=1)))
        self.assertEqual(self.history([X, Y], lo, D - timedelta(days=1)), hist0)
        self.assertEqual(self.minutes([X, Y], D, hi), mins0)
        self.assert_unique([X, Y], lo, hi)
        for day in _days(D, hi):
            self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, day).lines},
                             {lc.id: "A", ly.id: "B"}, day)

    def test_lone_lettered_stayer_keeps_its_own(self):
        """Y: y1(A) alone at the code with an UNLETTERED line and a whole-centre
        pin — both its alone. c arrives (→ B): they take y1's letter from `h`,
        so y1 keeps its minutes and people instead of halving them with c."""
        from app.models import Cell, PPWorkCenterDaily
        from app.services import zagruzka_source as zs
        self.units(X, Y)
        c = self.cell("4001", X)
        y1 = self.cell("4002", Y, letter="A")
        lc = self.line(X, "F001", "Tort", labor=60)
        ly = self.line(Y, "F005", "Pirog", labor=30)
        for day in _days(D - timedelta(days=1), D):
            self.daily(X, day, "F001", plan=50, actual=40)
            self.daily(Y, day, "F005", plan=20, actual=20)
            self.pin(Y, day, people=6, shtatka=8)
        self.pin(X, D, people=3)
        self.event(c, Y)
        self.db.commit()
        self.land()
        lo = D - timedelta(days=1)
        hist0 = self.history([X, Y], lo, lo)
        mins0 = self.minutes([X, Y], D, D)
        self.follow()
        self.assertEqual(self.history([X, Y], lo, lo), hist0)
        self.assertEqual(self.minutes([X, Y], D, D), mins0)
        self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, D).lines},
                         {lc.id: "B", ly.id: "A"})
        self.assertEqual({p.id: p.wc_group for p in pp_catalog.at(self.db, Y, lo).lines},
                         {ly.id: None})
        cells = self.db.query(Cell).all()
        lab = zs.cell_labor(cells, zs.wc_group_labor(self.db, [X, Y], D, D))
        self.assertAlmostEqual(lab[(y1.id, D.isoformat())][0], 30 * 20 / 60)
        self.assertAlmostEqual(lab[(c.id, D.isoformat())][0], 60 * 50 / 60)
        pins = {r.wc_group: (r.people, r.shtatka) for r in self.db.query(PPWorkCenterDaily).filter(
            PPWorkCenterDaily.manager_id == Y, PPWorkCenterDaily.date == D)}
        self.assertEqual(pins, {"A": (6, None), "B": (3, None), None: (None, 8)})
        self.db.refresh(y1)
        self.assertEqual(y1.wc_group, "A")

    def test_kept_answer_built_before_a_forget_is_not_kept(self):
        """A build that started before `forget_all` read the old catalog: its
        answer goes to its caller and is not kept for the next one."""
        import time as _t
        from app.services import kept_answer
        k = kept_answer.KeptAnswers("t-forget")
        started = _t.monotonic()
        kept_answer.forget_all()
        k._put("a", started, 1)
        self.assertEqual(k._kept, {})
        k._put("a", _t.monotonic(), 2)
        self.assertEqual(k._kept["a"][1], 2)


if __name__ == "__main__":
    unittest.main()
