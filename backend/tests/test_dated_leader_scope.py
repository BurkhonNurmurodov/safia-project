"""A leader's scope and a dashboard's letters are DATED (2026-10-26, WP5 of
docs/plan-catalog-follows-cells.md).

A cell's positions follow it to a new brigadir from its own move day
(`catalog_follow`), so a past day of a leader's /production page must be read
in the unit the cell stood in THAT day, scoped to the cells the leader ran that
day, and a past day's groups must wear the letters the cells carried then:

* T17 — a leader's dashboard for D−1 reads the old unit X with the cell's
  lines; for D it reads the new unit Y;
* a past day's dashboard groups (and its group-pin letters, and `by_sap`'s
  group key) use that day's letters;
* with no letter or link event after the day, every dated reader returns
  exactly what it returns today;
* the automatic checks read the checklist day the same way, and a move not
  followed yet is a `no_data` verdict rather than an empty page;
* the quantity writers take the unit's shared `NS_QTY` lock.

Runs against a scratch Postgres database (`SAFIA_TEST_PG`, see `pg_scratch`):
the dated links are read through `app.database.SessionLocal`, which the tests
point at it. `catalog_follow` (WP2) is stubbed where it is reached.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_dated_leader_scope
"""
from __future__ import annotations

import sys
import unittest
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import ModuleType
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

import app.services as services_pkg
from app.routers import production
from app.services import cell_lookup, leader_auto, pp_catalog

TZ = pp_catalog.TZ
D = date(2026, 10, 10)
CODE = "A2894"
OTHER = "B1111"


def _fake_follow(waiting=()):
    """A stand-in for `services.catalog_follow` (WP2): `unsettled` answers the
    cells given, `CatalogUnsettled` is a plain exception."""
    mod = ModuleType("app.services.catalog_follow")

    class CatalogUnsettled(Exception):
        pass

    mod.CatalogUnsettled = CatalogUnsettled
    mod.unsettled = mock.Mock(return_value=set(waiting))
    return mod


@contextmanager
def _follow(mod):
    with mock.patch.dict(sys.modules, {"app.services.catalog_follow": mod}), \
            mock.patch.object(services_pkg, "catalog_follow", mod, create=True):
        yield mod


@contextmanager
def _undated_letters():
    """The readers as they were before letters were dated: every cell wears its
    current column on every day."""
    from app.services import cell_links
    with mock.patch.object(cell_links, "with_letters_on", lambda cells, day: cells), \
            mock.patch.object(cell_links, "letter_on",
                              lambda cell, day: getattr(cell, "wc_group", None)):
        yield


class _PG(unittest.TestCase):
    """One scratch database per class, `SessionLocal` pointed at it."""
    X, Y = 31, 32

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        cls._patch = mock.patch("app.database.SessionLocal", cls.pg.Session)
        cls._patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._patch.stop()
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()
        cls.pg.drop()

    def setUp(self):
        from app import models as m
        self.db = self.pg.Session()
        for t in (m.PPLineDaily, m.PPDaily, m.PPWorkCenterDaily, m.PPReconciliation,
                  m.PPDaySetting, m.PPCatalogVersion, m.PPProduct, m.PPWorkCenter,
                  m.CellArchiveSpan, m.CellLinkEvent, m.Cell, m.RoleProfile, m.Manager):
            self.db.query(t).delete()
        self.db.commit()
        self._forget()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── fixtures ──────────────────────────────────────────────────────────

    @staticmethod
    def _forget():
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()

    def _commit(self):
        self.db.commit()
        self._forget()

    def _units(self, *ids, shift=1):
        from app.models import Manager
        for i in ids:
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=shift))
        self.db.flush()

    def _leader(self, name, unit):
        from app.models import RoleProfile
        p = RoleProfile(role="leader", name=name, manager_id=unit)
        self.db.add(p)
        self.db.flush()
        return p

    def _cell(self, code, unit, sap=CODE, letter=None, leader=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit, wc_group=letter,
                 leader_id=getattr(leader, "id", leader))
        self.db.add(c)
        self.db.flush()
        return c

    def _event(self, cell, field, frm, to, eff, vfx=None):
        from app.models import CellLinkEvent
        self.db.add(CellLinkEvent(
            cell_id=cell.id, field=field, value=to, prev=frm, effective_from=eff,
            effective_at=datetime.combine(eff, time(8), tzinfo=TZ),
            applied_at=datetime.now(timezone.utc), src="manual", vfx=vfx))
        self.db.flush()

    def _line(self, mid, sap, name, wc=CODE, labor=60, group=None, sort=0):
        from app.models import PPProduct
        p = PPProduct(manager_id=mid, sap_code=sap, name=name, work_center=wc,
                      labor_time=Decimal(str(labor)), sort_order=sort, active=True,
                      wc_group=group)
        self.db.add(p)
        self.db.flush()
        return p

    def _wc_row(self, mid, code=CODE, shtatka=4):
        from app.models import PPWorkCenter
        self.db.add(PPWorkCenter(manager_id=mid, code=code, shtatka=shtatka, sort_order=0,
                                 active=True))
        self.db.flush()

    def _daily(self, mid, day, sap, wc, plan, actual):
        from app.models import PPDaily
        self.db.add(PPDaily(manager_id=mid, date=day, sap_code=sap, work_center=wc,
                            plan_qty=Decimal(str(plan)), actual_qty=Decimal(str(actual))))
        self.db.flush()

    @staticmethod
    def _payload(role, unit):
        return {"role": role, "role_id": unit, "sub": "1", "full_name": "Test"}

    @contextmanager
    def _as_leader(self, leader):
        """The viewer IS this leader profile, and holds no «see all» grant."""
        with mock.patch.object(production, "viewer_leader_profile_id",
                               lambda db, payload: leader.id), \
                mock.patch.object(production, "page_scope_is_all",
                                  lambda db, payload, page: False):
            yield

    def _moved_cell(self):
        """T17's fixture: cell 0101 (leader L) moved X → Y on D, its line F001
        followed it — X's version for the days before D holds the line, Y's
        current rows from D on; Y keeps a line of its own at another code."""
        X, Y = self.X, self.Y
        self._units(X, Y)
        lead = self._leader("Lider Bir", X)
        c = self._cell("0101", Y, leader=lead)
        self._event(c, "manager_id", X, Y, D)
        p = self._line(X, "F001", "Tort")
        self._line(Y, "F002", "Non", wc=OTHER)
        pp_catalog.align(self.db, [X, Y], D, "cell_move")
        p.manager_id = Y                         # what the follow does on the current rows
        self._daily(X, D - timedelta(days=1), "F001", CODE, plan=10, actual=4)
        self._daily(Y, D, "F001", CODE, plan=20, actual=8)
        self._commit()
        return lead, c


def _rows(dash) -> dict:
    return {r["sap_code"]: r for r in dash["rows"]}


def _wc(dash, code=CODE) -> dict:
    return next(w for w in dash["work_centers"] if w["work_center"] == code)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class LeaderPageFollowsTheDay(_PG):
    """T17 — and the resolvers it is built from."""

    def test_dashboard_reads_the_unit_of_its_day(self):
        X, Y = self.X, self.Y
        lead, _c = self._moved_cell()
        pl = self._payload("leader", X)
        with self._as_leader(lead):
            before = production.get_dashboard(date=(D - timedelta(days=1)).isoformat(),
                                              manager_id=None, payload=pl, db=self.db)
            on = production.get_dashboard(date=D.isoformat(), manager_id=None,
                                          payload=pl, db=self.db)
            today = production._resolve_manager_id(pl, None, self.db)
        self.assertEqual(before["manager_id"], X)
        self.assertEqual(set(_rows(before)), {"F001"})
        self.assertEqual(_rows(before)["F001"]["plan_qty"], 10.0)
        self.assertEqual(before["scope"]["cells"], [CODE])
        self.assertEqual(on["manager_id"], Y)
        # Y's own line at another work centre is not the leader's.
        self.assertEqual(set(_rows(on)), {"F001"})
        self.assertEqual(_rows(on)["F001"]["plan_qty"], 20.0)
        self.assertEqual(today, Y)              # no day: where the cell stands now

    def test_undated_read_would_find_nothing(self):
        """Why the day is passed: the cell's unit NOW holds no line for D−1."""
        lead, _c = self._moved_cell()
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, lead.id), self.Y)
        dash = production._build_dashboard(self.db, self.Y, D - timedelta(days=1),
                                           wc_scope={CODE}, payload=None,
                                           group_scope={(CODE, None)})
        self.assertEqual(dash["rows"], [])

    def test_every_dated_door_names_the_old_unit(self):
        from app.models import PPUpload
        X = self.X
        lead, c = self._moved_cell()
        d1 = D - timedelta(days=1)
        self.db.add(PPUpload(manager_id=None, date=d1, file_type="faza", columns=[],
                             rows=[["1", "", CODE, "F001"], ["2", "", OTHER, "F002"]]))
        self._commit()
        pl = self._payload("leader", X)
        with self._as_leader(lead):
            proof = production.staffing_proof(work_center=CODE, group=None,
                                              date=d1.isoformat(), manager_id=None,
                                              payload=pl, db=self.db)
            with mock.patch.object(production, "_build_dashboard",
                                   wraps=production._build_dashboard) as bd, \
                    mock.patch.object(production, "deliver_xlsx", return_value={"ok": True}):
                production.export_positions(
                    request=mock.Mock(), body=production.PositionsExportBody(date=d1.isoformat()),
                    payload=pl, db=self.db)
            with mock.patch.object(pp_catalog, "at", wraps=pp_catalog.at) as at:
                raw = production.get_raw(file_type="faza", date=d1.isoformat(),
                                         manager_id=None, payload=pl, db=self.db)
        self.assertEqual(proof["cells"], [c.verifix_code])     # X's cell on D−1
        self.assertEqual(bd.call_args.args[1], X)
        self.assertEqual(bd.call_args.args[3], {CODE})
        self.assertEqual(at.call_args.args[1:], (X, d1))
        self.assertEqual([r[2] for r in raw["rows"]], [CODE])

    def test_scope_follows_the_leader_of_its_day(self):
        X = self.X
        self._units(X)
        l1 = self._leader("Lider Bir", X)
        l2 = self._leader("Lider Ikki", X)
        d = self._cell("0301", X, sap="C3000", letter="B", leader=l2)
        self._event(d, "leader_id", l1.id, l2.id, D)
        self._commit()
        before, on = D - timedelta(days=1), D
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, l1.id, before), {"C3000"})
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, l1.id, on), set())
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, l1.id), set())
        self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, l2.id, before), set())
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, l2.id, on), {("C3000", "B")})
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, l1.id, before), X)
        self.assertIsNone(cell_lookup.cells_unit_for_leader(self.db, l1.id, on))
        self.assertEqual([c.id for c in cell_lookup.leader_cells_on(self.db, l1.id, before)],
                         [d.id])


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class PastDayLetters(_PG):
    """A past day's groups use that day's letters."""

    def _relettered(self):
        """X held a(A) and s(B) at CODE; on D `a` moved to Y, which already had
        y1(A) and y2(B), and took C there (its A kept on the event). Its A line
        followed it as C."""
        X, Y = self.X, self.Y
        self._units(X, Y)
        a = self._cell("0201", Y, letter="C")
        s = self._cell("0202", X, letter="B")
        y1 = self._cell("0203", Y, letter="A")
        self._cell("0204", Y, letter="B")
        self._event(a, "manager_id", X, Y, D, vfx={"wc_group_was": "A"})
        pa = self._line(X, "F001", "Tort", group="A")
        self._line(X, "F002", "Keks", group="B", sort=1)
        self._line(Y, "F003", "Non", group="A")
        self._line(Y, "F004", "Bulka", group="B", sort=1)
        self._wc_row(X)
        self._wc_row(Y)
        pp_catalog.align(self.db, [X, Y], D, "cell_move")
        pa.manager_id, pa.wc_group, pa.sort_order = Y, "C", 2
        self._commit()
        return a, s, y1

    def test_groups_wear_the_days_letters(self):
        X, Y = self.X, self.Y
        a, s, y1 = self._relettered()
        before = production._build_dashboard(self.db, X, D - timedelta(days=1))
        wc = _wc(before)
        groups = {g["group"]: g for g in wc["groups"]}
        self.assertEqual(wc["cells_n"], 2)
        self.assertEqual(set(groups), {"A", "B"})
        self.assertFalse(groups["A"]["orphan"])
        self.assertEqual(groups["A"]["cell"]["id"], a.id)
        self.assertEqual(groups["A"]["cell"]["wc_group"], "A")
        self.assertEqual(groups["B"]["cell"]["id"], s.id)
        self.assertEqual(production._cell_letters(self.db, X, D - timedelta(days=1)),
                         {CODE: {"A", "B"}})
        tbl = cell_lookup.by_sap(self.db, manager_ids=[X], day=D - timedelta(days=1))
        self.assertEqual(tbl[(X, CODE, "A")]["id"], a.id)
        self.assertNotIn((X, CODE, "C"), tbl)

        on = production._build_dashboard(self.db, Y, D)
        g_on = {g["group"]: g for g in _wc(on)["groups"]}
        self.assertEqual(set(g_on), {"A", "B", "C"})
        self.assertEqual(g_on["C"]["cell"]["id"], a.id)
        self.assertEqual(g_on["A"]["cell"]["id"], y1.id)
        self.assertEqual(production._cell_letters(self.db, Y, D), {CODE: {"A", "B", "C"}})

    def test_undated_letters_would_orphan_the_old_group(self):
        """The defect the dating fixes: read with today's letters, X's D−1
        group A has no cell and a C group appears that X never had."""
        X = self.X
        self._relettered()
        with _undated_letters():
            before = production._build_dashboard(self.db, X, D - timedelta(days=1))
        groups = {g["group"]: g for g in _wc(before)["groups"]}
        self.assertTrue(groups["A"]["orphan"])
        self.assertIn("C", groups)

    def test_leader_groups_on_the_day(self):
        X = self.X
        self._units(X, self.Y)
        lead = self._leader("Lider Bir", X)
        a = self._cell("0201", self.Y, letter="C", leader=lead)
        self._event(a, "manager_id", X, self.Y, D, vfx={"wc_group_was": "A"})
        self._commit()
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, lead.id, D - timedelta(days=1)),
                         {(CODE, "A")})
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, lead.id, D), {(CODE, "C")})
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, lead.id), {(CODE, "C")})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class NothingAfterTheDay(_PG):
    """With no letter or link event after the day, every dated reader returns
    exactly what it returns today."""

    def _fixture(self):
        X, Y = self.X, self.Y
        self._units(X, Y)
        l1 = self._leader("Lider Bir", X)
        l2 = self._leader("Lider Ikki", Y)
        self._cell("0401", X, letter="A", leader=l1)
        self._cell("0402", X, letter="B", leader=l1)
        self._cell("0403", X, sap="C3000", leader=l1)
        old = self._cell("0404", Y, letter="A", leader=l2)
        # Events that are all in force BEFORE the days read: nothing after them.
        self._event(old, "manager_id", X, Y, D - timedelta(days=5), vfx={"wc_group_was": "Z"})
        self._event(old, "leader_id", l1.id, l2.id, D - timedelta(days=5))
        self._line(X, "F001", "Tort", group="A")
        self._line(X, "F002", "Keks", group="B", sort=1)
        self._line(X, "F003", "Non", wc="C3000", sort=2)
        self._line(Y, "F004", "Bulka", group="A")
        self._daily(X, D, "F001", CODE, plan=10, actual=4)
        self._commit()
        return l1, l2

    def test_cell_lookup(self):
        l1, l2 = self._fixture()
        for day in (D, D + timedelta(days=3)):
            for lid in (l1.id, l2.id, 999):
                self.assertEqual(cell_lookup.sap_codes_for_leader(self.db, lid, day),
                                 cell_lookup.sap_codes_for_leader(self.db, lid))
                self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, lid, day),
                                 cell_lookup.sap_groups_for_leader(self.db, lid))
                self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, lid, day),
                                 cell_lookup.cells_unit_for_leader(self.db, lid))
            got = cell_lookup.by_sap(self.db, with_leader=True, day=day)
            with _undated_letters():
                self.assertEqual(got, cell_lookup.by_sap(self.db, with_leader=True, day=day))
        self.assertEqual(cell_lookup.cells_unit_for_leader(self.db, l1.id, D), self.X)
        self.assertEqual(cell_lookup.sap_groups_for_leader(self.db, l1.id, D),
                         {(CODE, "A"), (CODE, "B"), ("C3000", None)})

    def test_production(self):
        l1, _l2 = self._fixture()
        X = self.X
        pl = self._payload("leader", X)
        with self._as_leader(l1):
            for day in (D, D + timedelta(days=3)):
                self.assertEqual(production._resolve_manager_id(pl, None, self.db, day),
                                 production._resolve_manager_id(pl, None, self.db))
                self.assertEqual(production._leader_wc_scope(self.db, pl, day),
                                 production._leader_wc_scope(self.db, pl))
                self.assertEqual(production._leader_group_scope(self.db, pl, day),
                                 production._leader_group_scope(self.db, pl))
        for day in (D, D + timedelta(days=3)):
            got = production._build_dashboard(self.db, X, day)
            letters = production._cell_letters(self.db, X, day)
            with _undated_letters():
                self.assertEqual(got, production._build_dashboard(self.db, X, day))
                self.assertEqual(letters, production._cell_letters(self.db, X, day))
        # Another role is never narrowed, whatever the day.
        sup = self._payload("supervisor", X)
        with mock.patch.object(production, "page_scope_is_all", lambda db, p, page: False):
            self.assertIsNone(production._leader_wc_scope(self.db, sup, D))
            self.assertIsNone(production._leader_group_scope(self.db, sup, D))
            self.assertEqual(production._resolve_manager_id(sup, None, self.db, D), X)

    def test_leader_auto(self):
        l1, _l2 = self._fixture()
        from app.models import Manager
        mgr = self.db.get(Manager, self.X)
        ctx = leader_auto._Ctx(self.db, l1, mgr, 1, D.isoformat(), None, None, None)
        self.assertEqual(ctx.unit_id, cell_lookup.cells_unit_for_leader(self.db, l1.id))
        self.assertEqual(ctx.pairs, cell_lookup.sap_groups_for_leader(self.db, l1.id))
        with _follow(_fake_follow()):
            dash = ctx.dashboard
        ref = production._build_dashboard(self.db, self.X, D, wc_scope={CODE, "C3000"},
                                          payload=None, group_scope=set(ctx.pairs))
        self.assertEqual(dash, ref)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class AutoChecksReadTheDay(_PG):
    def _ctx(self, lead, day, cell=None):
        from app.models import Manager
        return leader_auto._Ctx(self.db, lead, self.db.get(Manager, self.X), 1,
                                day.isoformat(), cell, None, None)

    def test_checks_measure_the_unit_of_their_day(self):
        X, Y = self.X, self.Y
        lead, c = self._moved_cell()
        before, on = D - timedelta(days=1), D
        with _follow(_fake_follow()) as fake:
            ctx = self._ctx(lead, before)
            self.assertEqual(ctx.unit_id, X)
            self.assertEqual(ctx.pairs, {(CODE, None)})
            self.assertEqual(ctx.dashboard["manager_id"], X)
            self.assertEqual(_rows(ctx.dashboard)["F001"]["plan_qty"], 10.0)
            fake.unsettled.assert_called_once_with(self.db, [c.id], before)
            ctx = self._ctx(lead, on)
            self.assertEqual(ctx.unit_id, Y)
            self.assertEqual(_rows(ctx.dashboard)["F001"]["plan_qty"], 20.0)
            # A per-cell checklist reads the cell's own unit and letter on the day.
            self.assertEqual(self._ctx(lead, before, cell=c).unit_id, X)
            self.assertEqual(self._ctx(lead, on, cell=c).unit_id, Y)

    def test_a_move_not_followed_yet_is_no_data(self):
        lead, c = self._moved_cell()
        fake = _fake_follow(waiting={c.id})
        with _follow(fake):
            ctx = self._ctx(lead, D)
            with self.assertRaises(fake.CatalogUnsettled):
                ctx.dashboard
            from app.models import Manager
            with self.assertLogs(leader_auto.logger, "ERROR"):
                v = leader_auto.evaluate(
                    self.db, prof=lead, manager=self.db.get(Manager, self.X), shift=1,
                    date=D.isoformat(), cell=c, check="plan_staffing", target=None,
                    due=None, now=None)
        self.assertEqual((v.outcome, v.code), (leader_auto.SKIPPED, "no_data"))
        fake.unsettled.assert_called_with(self.db, [c.id], D)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class QuantityWritersShareTheLock(_PG):
    """`set_override`, `set_wc_override`, `save_staffing` and
    `save_reconciliation` take the unit's `NS_QTY` lock SHARED — the follow
    takes it exclusive, so the two never interleave."""

    def _calls(self, spy):
        return [c for c in spy.call_args_list
                if c.kwargs.get("ns") == pp_catalog.NS_QTY]

    def test_writers_lock_shared(self):
        X = self.X
        self._units(X)
        p = self._line(X, "F001", "Tort")
        self._commit()
        key = production.line_keys(pp_catalog.at(self.db, X, D).lines)[p.id]
        sup = self._payload("supervisor", X)
        admin = self._payload("admin", None)
        with mock.patch.object(production, "page_scope_is_all", lambda db, pl, page: False), \
                mock.patch.object(pp_catalog, "lock", wraps=pp_catalog.lock) as spy:
            production.set_override(
                body=production.OverrideBody(date=D.isoformat(), sap_code="F001",
                                             work_center=CODE, field="plan", value=5,
                                             line_key=key),
                manager_id=None, payload=sup, db=self.db)
            production.set_wc_override(
                body=production.WcOverrideBody(date=D.isoformat(), work_center=CODE, people=3),
                manager_id=X, payload=admin, db=self.db)
            production.save_staffing(
                body=production.StaffingBody(date=D.isoformat(), rows=[
                    production.StaffingRow(work_center=CODE, people=4)]),
                manager_id=None, payload=sup, db=self.db)
            production.save_reconciliation(
                body=production.ReconciliationBody(date=D.isoformat(), data={"a": 1}),
                manager_id=None, payload=sup, db=self.db)
        calls = self._calls(spy)
        self.assertEqual(len(calls), 4)
        for c in calls:
            self.assertEqual(list(c.args[1]), [X])
            self.assertTrue(c.kwargs.get("shared"))
            self.assertFalse(c.kwargs.get("try_"))
        from app.models import PPLineDaily, PPReconciliation, PPWorkCenterDaily
        self.assertEqual(float(self.db.query(PPLineDaily.plan_override).scalar()), 5.0)
        self.assertEqual(self.db.query(PPWorkCenterDaily.people).scalar(), 4)
        self.assertEqual(self.db.query(PPReconciliation.data).scalar(), {"a": 1})


if __name__ == "__main__":
    unittest.main()
