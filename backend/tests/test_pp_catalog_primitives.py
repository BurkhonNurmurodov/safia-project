"""The foundation of «the catalog follows its cells» (2026-10-26, WP1 of
docs/plan-catalog-follows-cells.md): the dated catalog's new writers
(`pp_catalog.lock` / `freeze(day=)` / `align` / `split_at` /
`versions_between` / `rewrite_version`), the ownership rule
(`catalog_ownership`) and the move-record readers (`pp_catalog_moves`).

The rule tests are pure. The rest run against a scratch Postgres database
(`SAFIA_TEST_PG`, see `pg_scratch`) — the locks are Postgres advisory locks
and the dated cell links are read through `app.database.SessionLocal`, which
these tests point at the scratch database.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_pp_catalog_primitives
"""
from __future__ import annotations

import itertools
import threading
import time as _time
import unittest
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.services import catalog_ownership as own
from app.services import pp_catalog
from app.services.wc_group import share

TZ = pp_catalog.TZ
D = date(2026, 10, 10)
CODE = "A2894"


def _days(a: date, b: date) -> list[date]:
    return [a + timedelta(days=i) for i in range((b - a).days + 1)]


def _content(cat) -> tuple:
    """A catalog's CONTENT — what a day reads — never its span bounds."""
    if cat is None:
        return None
    return ([pp_catalog._dump(p, pp_catalog.LINE_FIELDS) for p in cat.lines],
            [pp_catalog._dump(w, pp_catalog.WC_FIELDS) for w in cat.work_centers])


# ── pure: the off-Postgres lock and the ownership rule ──────────────────────

class LockOffPostgres(unittest.TestCase):
    def test_no_lock_and_true(self):
        db = mock.Mock()
        db.get_bind.return_value = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))
        self.assertTrue(pp_catalog.lock(db, [3, 1], try_=True))
        self.assertTrue(pp_catalog.lock(db, [3], ns=pp_catalog.NS_QTY, shared=True))
        db.execute.assert_not_called()

    def test_nothing_to_lock(self):
        db = mock.Mock()
        self.assertTrue(pp_catalog.lock(db, []))
        self.assertTrue(pp_catalog.lock(db, [None]))
        db.execute.assert_not_called()


def _ln(g, **kw):
    return {"wc_group": g, **kw}


class HandedRule(unittest.TestCase):
    def _split(self, lines, letters, cid):
        h = own.handed(lines, letters, cid)
        return ([p["n"] for p in h.mine], [p["n"] for p in h.shared], [p["n"] for p in h.others])

    def test_sole_cell_takes_everything(self):
        lines = [_ln(None, n="none"), _ln("Z", n="orphan")]
        self.assertEqual(self._split(lines, {1: None}, 1), (["none", "orphan"], [], []))
        lines = [_ln("A", n="own"), _ln(None, n="none"), _ln("Z", n="orphan")]
        self.assertEqual(self._split(lines, {1: "A"}, 1), (["own", "none", "orphan"], [], []))

    def test_lettered(self):
        lines = [_ln("A", n="a"), _ln("B", n="b"), _ln(None, n="none"), _ln("Z", n="orphan")]
        self.assertEqual(self._split(lines, {1: "A", 2: "B"}, 1), (["a"], ["none", "orphan"], ["b"]))
        self.assertEqual(self._split(lines, {1: "A", 2: "B"}, 2), (["b"], ["none", "orphan"], ["a"]))

    def test_unlettered_shared(self):
        lines = [_ln(None, n="none"), _ln("A", n="orphan")]
        self.assertEqual(self._split(lines, {1: None, 2: None}, 1), ([], ["none", "orphan"], []))

    def test_register_break(self):
        lines = [_ln("A", n="a"), _ln("B", n="b"), _ln(None, n="none")]
        self.assertEqual(self._split(lines, {1: "A", 2: "A", 3: "B"}, 1), ([], ["a", "none"], ["b"]))

    def test_unlettered_cell_among_lettered_owns_nothing(self):
        lines = [_ln("B", n="b"), _ln(None, n="none")]
        self.assertEqual(self._split(lines, {1: None, 2: "B"}, 1), ([], ["none"], ["b"]))

    def test_cell_not_standing_there(self):
        lines = [_ln("B", n="b"), _ln(None, n="none")]
        self.assertEqual(self._split(lines, {2: "B"}, 1), ([], [], ["b", "none"]))

    def test_blank_letters_are_no_letter(self):
        lines = [_ln("", n="blank"), SimpleNamespace(wc_group="", n="ns")]
        h = own.handed(lines, {1: ""}, 1)
        self.assertEqual(len(h.mine), 2)
        h = own.handed(lines, {1: "", 2: "B"}, 1)
        self.assertEqual(len(h.shared), 2)

    def test_mirrors_share(self):
        """Mine = `share` hands the line wholly to the cell, shared = to it and
        another, others = not to it — on every combination of letters."""
        opts = (None, "A", "B")
        for n in (1, 2, 3):
            for cells in itertools.product(opts, repeat=n):
                letters = {i + 1: g for i, g in enumerate(cells)}
                for g in (None, "A", "B", "Z"):
                    got = own.handed([_ln(g, n="x")], letters, 1)
                    part = share(list(cells), {g: 1.0})[0]
                    want = ("mine" if part == 1.0 else "shared" if part else "others")
                    have = ("mine" if got.mine else "shared" if got.shared else "others")
                    self.assertEqual(have, want, (letters, g))

    def test_join_ident_and_lines_at(self):
        p = {"sap_code": " F001 ", "name": "Tort  Napoleon", "work_center": "a 2894",
             "labor_time": Decimal("12.5000")}
        self.assertEqual(own.join_ident(p), ("F001", "A2894", "tort napoleon|12.5"))
        q = SimpleNamespace(sap_code="", name="Dough Mix", work_center="A2894", labor_time=None)
        self.assertEqual(own.join_ident(q), ("~dough mix", "A2894", "dough mix|"))
        lines = [{"work_center": "A2894", "n": 1}, {"work_center": " a2894", "n": 2},
                 {"work_center": "A2895", "n": 3}, {"work_center": None, "n": 4}]
        self.assertEqual([p["n"] for p in own.lines_at(lines, "a2894 ")], [1, 2])


# ── against Postgres ────────────────────────────────────────────────────────

class _PG(unittest.TestCase):
    """One scratch database per class, with `SessionLocal` pointed at it so the
    cell-link and archive caches read it."""

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
        from app.services import cell_archive, cell_links
        self.db = self.pg.Session()
        for t in (m.PPDaily, m.PPCatalogVersion, m.PPProduct, m.PPWorkCenter, m.PPCatalogMove,
                  m.CellArchiveSpan, m.CellLinkEvent, m.Cell, m.Manager):
            self.db.query(t).delete()
        self.db.commit()
        cell_links.forget()
        cell_archive.forget()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    def _units(self, *ids, shift=1):
        from app.models import Manager
        for i in ids:
            if self.db.get(Manager, i) is None:
                self.db.add(Manager(id=i, name=f"Unit {i}", shift=shift))
        self.db.flush()

    def _line(self, mid, sap, name, wc=CODE, labor=10, group=None, sort=0, active=True):
        from app.models import PPProduct
        p = PPProduct(manager_id=mid, sap_code=sap, name=name, work_center=wc,
                      labor_time=Decimal(str(labor)), sort_order=sort, active=active,
                      wc_group=group)
        self.db.add(p)
        self.db.flush()
        return p


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class FreezeAndAlign(_PG):
    def test_freeze_day_boundaries(self):
        db = self.db
        self._units(1)
        l1 = self._line(1, "F001", "Tort", labor=10)
        self._line(1, "F002", "Keks", labor=20, sort=1)
        self.assertIsNone(pp_catalog.current_from(db, 1))
        self.assertEqual(pp_catalog.freeze(db, 1, "t", day=D), D)
        self.assertEqual(pp_catalog.current_from(db, 1), D)
        vs = pp_catalog.versions_between(db, 1, D - timedelta(days=99), D)
        self.assertEqual([(v.valid_from, v.valid_to) for v in vs], [(None, D - timedelta(days=1))])
        # The same day, or an earlier one, draws nothing and answers the boundary.
        self.assertEqual(pp_catalog.freeze(db, 1, "t", day=D), D)
        self.assertEqual(pp_catalog.freeze(db, 1, "t", day=D - timedelta(days=3)), D)
        self.assertEqual(len(pp_catalog.versions_between(db, 1, date(2000, 1, 1), D + timedelta(days=99))), 1)
        # A later day freezes what the rows say NOW, then the edit counts from it.
        self.assertEqual(pp_catalog.freeze(db, 1, "edit", day=D + timedelta(days=2)), D + timedelta(days=2))
        l1.labor_time = Decimal("30")
        db.commit()
        self.assertEqual(pp_catalog.at(db, 1, D - timedelta(days=5)).lines[0].labor_time, 10)
        self.assertEqual(pp_catalog.at(db, 1, D + timedelta(days=1)).lines[0].labor_time, 10)
        self.assertEqual(float(pp_catalog.at(db, 1, D + timedelta(days=2)).lines[0].labor_time), 30)
        # Without `day` it is the shift's own day, exactly as before.
        now = datetime(2026, 10, 20, 10, 0, tzinfo=TZ)
        self.assertEqual(pp_catalog.freeze(db, 1, "t", now), date(2026, 10, 20))
        now = datetime(2026, 10, 22, 21, 0, tzinfo=TZ)
        self.assertEqual(pp_catalog.freeze(db, 1, "t", now), date(2026, 10, 23))
        self.assertEqual(pp_catalog.current_from(db, 1), date(2026, 10, 23))

    def test_align(self):
        db = self.db
        self._units(2)
        self._units(3, shift=2)
        self._units(4)
        self._line(2, "F001", "Tort")
        self._line(3, "F002", "Keks")
        pp_catalog.freeze(db, 3, "t", day=D + timedelta(days=3))
        # Unit 4 has no catalog at all: it is frozen like any other.
        s = pp_catalog.align(db, [2, 3, 4], D, "cell_move")
        self.assertEqual(s, D + timedelta(days=3))
        for u in (2, 3, 4):
            self.assertEqual(pp_catalog.current_from(db, u), s)
        empty = pp_catalog.versions_between(db, 4, D, D)
        self.assertEqual([(v.valid_from, v.lines, v.work_centers) for v in empty], [(None, [], [])])
        s2 = pp_catalog.align(db, [4, 3, 2], D + timedelta(days=5), "cell_move")
        self.assertEqual(s2, D + timedelta(days=5))
        for u in (2, 3, 4):
            self.assertEqual(pp_catalog.current_from(db, u), s2)
        before = {u: len(pp_catalog.versions_between(db, u, date(2000, 1, 1), s2)) for u in (2, 3)}
        self.assertEqual(pp_catalog.align(db, [2, 3], D + timedelta(days=1), "cell_move"), s2)
        self.assertEqual({u: len(pp_catalog.versions_between(db, u, date(2000, 1, 1), s2))
                          for u in (2, 3)}, before)
        self.assertEqual(pp_catalog.align(db, [], D, "x"), D)
        db.commit()
        for u in (2, 3, 4):
            self.assertEqual(pp_catalog.current_from(db, u), s2)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class SplitAndRewrite(_PG):
    MID = 5
    LO, HI = D - timedelta(days=10), D + timedelta(days=8)

    def _catalog(self):
        """Unit 5: v1 [None, D−1], v2 [D, D+4], current from D+5 — each with
        different content, plus quantities on every day."""
        from app.models import PPDaily, PPWorkCenter
        db = self.db
        self._units(self.MID)
        a = self._line(self.MID, "F001", "Tort", labor=12.5, group="A")
        b = self._line(self.MID, "F002", "Keks", labor=7, sort=1)
        db.add(PPWorkCenter(manager_id=self.MID, code=CODE, shtatka=4))
        for i, d in enumerate(_days(self.LO, self.HI)):
            db.add(PPDaily(manager_id=self.MID, date=d, sap_code="F001", work_center=CODE,
                           plan_qty=Decimal(100 + i), actual_qty=Decimal(90 + i)))
            db.add(PPDaily(manager_id=self.MID, date=d, sap_code="F002", work_center=CODE,
                           plan_qty=Decimal(40 + i), actual_qty=Decimal(33 + i)))
        db.flush()
        pp_catalog.freeze(db, self.MID, "edit", day=D)
        a.labor_time = Decimal("13.25")
        db.flush()
        pp_catalog.freeze(db, self.MID, "edit", day=D + timedelta(days=5))
        b.wc_group = "B"
        b.labor_time = Decimal("8")
        db.commit()

    def _per_day(self):
        from app.services import zagruzka_source
        db = self.db
        sp = pp_catalog.spans(db, [self.MID], self.LO, self.HI)[self.MID]
        return ({d: _content(pp_catalog.at(db, self.MID, d)) for d in _days(self.LO, self.HI)},
                {d: _content(pp_catalog.catalog_for(sp, d)) for d in _days(self.LO, self.HI)},
                {d: _content(pp_catalog.at_many(db, [self.MID], d)[self.MID])
                 for d in _days(self.LO, self.HI)},
                zagruzka_source.wc_labor(db, [self.MID], self.LO, self.HI),
                zagruzka_source.wc_group_labor(db, [self.MID], self.LO, self.HI))

    def _bounds(self):
        return [(v.valid_from, v.valid_to)
                for v in pp_catalog.versions_between(self.db, self.MID, date(2000, 1, 1), self.HI)]

    def test_split_keeps_every_day(self):
        self._catalog()
        db = self.db
        before = self._per_day()
        self.assertEqual(before[0][D - timedelta(days=1)][0][0]["labor_time"], 12.5)
        self.assertEqual(before[0][D][0][0]["labor_time"], 13.25)
        pp_catalog.split_at(db, self.MID, D + timedelta(days=2))
        pp_catalog.split_at(db, self.MID, D - timedelta(days=4))     # the first, valid_from NULL
        self.assertEqual(self._bounds(), [
            (None, D - timedelta(days=5)), (D - timedelta(days=4), D - timedelta(days=1)),
            (D, D + timedelta(days=1)), (D + timedelta(days=2), D + timedelta(days=4))])
        # Already a boundary — a version's first day, or current_from — moves nothing.
        pp_catalog.split_at(db, self.MID, D)
        pp_catalog.split_at(db, self.MID, D - timedelta(days=4))
        pp_catalog.split_at(db, self.MID, D + timedelta(days=5))
        self.assertEqual(len(self._bounds()), 4)
        with self.assertRaises(ValueError):
            pp_catalog.split_at(db, self.MID, D + timedelta(days=6))
        db.commit()
        after = self._per_day()
        for i, name in enumerate(("at", "spans", "at_many", "wc_labor", "wc_group_labor")):
            self.assertEqual(after[i], before[i], name)
        self.assertTrue(after[3])
        # The copies are the same reason, and independent rows.
        vs = pp_catalog.versions_between(db, self.MID, date(2000, 1, 1), self.HI)
        self.assertEqual({v.reason for v in vs}, {"edit"})
        self.assertEqual(len({v.id for v in vs}), 4)

    def test_split_without_history_refuses(self):
        self._units(6)
        self._line(6, "F001", "Tort")
        with self.assertRaises(ValueError):
            pp_catalog.split_at(self.db, 6, D)

    def test_versions_between(self):
        self._catalog()
        db = self.db
        pp_catalog.split_at(db, self.MID, D - timedelta(days=4))
        got = lambda a, b: [(v.valid_from, v.valid_to)
                            for v in pp_catalog.versions_between(db, self.MID, a, b)]
        self.assertEqual(got(D - timedelta(days=1), D + timedelta(days=2)), [
            (D - timedelta(days=4), D - timedelta(days=1)), (D, D + timedelta(days=4))])
        self.assertEqual(got(D - timedelta(days=30), D - timedelta(days=30)),
                         [(None, D - timedelta(days=5))])
        self.assertEqual(got(D + timedelta(days=5), D + timedelta(days=8)), [])
        self.assertEqual(got(D + timedelta(days=2), D), [])

    def test_rewrite_persists(self):
        self._catalog()
        db = self.db
        v = pp_catalog.versions_between(db, self.MID, D, D)[0]
        vid, bounds, reason = v.id, (v.valid_from, v.valid_to), v.reason
        # Edited IN PLACE and handed back: still written.
        lines = v.lines
        lines[0]["wc_group"] = "Q"
        lines[0]["labor_time"] = Decimal("99.5")
        pp_catalog.rewrite_version(db, v, lines, v.work_centers)
        db.commit()
        other = self.pg.Session()
        try:
            from app.models import PPCatalogVersion
            r = other.get(PPCatalogVersion, vid)
            self.assertEqual(r.lines[0]["wc_group"], "Q")
            self.assertEqual(r.lines[0]["labor_time"], 99.5)
            self.assertEqual(((r.valid_from, r.valid_to), r.reason), (bounds, reason))
        finally:
            other.close()
        # New lists: a line taken out, the work centres emptied.
        pp_catalog.rewrite_version(db, v, [dict(x) for x in v.lines[1:]], [])
        db.commit()
        self.db.expire_all()
        cat = pp_catalog.at(db, self.MID, D)
        self.assertEqual([p.name for p in cat.lines], ["Keks"])
        self.assertEqual(cat.work_centers, [])
        self.assertEqual(_content(pp_catalog.at(db, self.MID, D - timedelta(days=1)))[0][0]["name"],
                         "Tort")


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Locks(_PG):
    def setUp(self):
        super().setUp()
        self.others = []

    def tearDown(self):
        for s in self.others:
            s.rollback()
            s.close()
        super().tearDown()

    def _other(self):
        s = self.pg.Session()
        self.others.append(s)
        return s

    def test_reentrant_and_exclusive(self):
        a, b, c = self.db, self._other(), self._other()
        Q = pp_catalog.NS_QTY
        self.assertTrue(pp_catalog.lock(a, [7]))
        self.assertTrue(pp_catalog.lock(a, [7]))
        self.assertTrue(pp_catalog.lock(a, [7], try_=True))
        self.assertTrue(pp_catalog.lock(a, [7], shared=True, try_=True))
        self.assertFalse(pp_catalog.lock(b, [7], try_=True))
        self.assertFalse(pp_catalog.lock(b, [7], shared=True, try_=True))
        self.assertTrue(pp_catalog.lock(b, [8], try_=True))
        # The namespaces are apart.
        self.assertTrue(pp_catalog.lock(b, [7], ns=Q, shared=True, try_=True))
        # Shared with shared, never exclusive with shared — the holder's own
        # shared lock does not let it past another's.
        self.assertTrue(pp_catalog.lock(a, [7], ns=Q, shared=True, try_=True))
        self.assertFalse(pp_catalog.lock(a, [7], ns=Q, try_=True))
        # A refused try may leave the ids before the busy one held.
        self.assertFalse(pp_catalog.lock(c, [6, 7], try_=True))
        self.assertFalse(pp_catalog.lock(b, [6], try_=True))
        c.rollback()
        self.assertTrue(pp_catalog.lock(b, [6], try_=True))
        # Ending the transaction releases them.
        a.rollback()
        self.assertTrue(pp_catalog.lock(b, [7], try_=True))

    def test_freeze_takes_the_lock_and_writers_queue(self):
        a = self.db
        self._units(9)
        self._line(9, "F001", "Tort")
        a.commit()
        self.assertEqual(pp_catalog.freeze(a, 9, "t", day=D), D)
        b = self._other()
        self.assertFalse(pp_catalog.lock(b, [9], try_=True))
        out = {}

        def second():
            s = self.pg.Session()
            try:
                out["eff"] = pp_catalog.freeze(s, 9, "t", day=D)
                s.commit()
            except Exception as e:  # noqa: BLE001
                out["err"] = e
            finally:
                s.close()
        t = threading.Thread(target=second)
        t.start()
        _time.sleep(0.6)
        self.assertNotIn("eff", out)          # waiting on a's lock
        a.commit()
        t.join(10)
        self.assertEqual(out, {"eff": D})     # read a's boundary, drew none
        self.assertEqual(len(pp_catalog.versions_between(a, 9, date(2000, 1, 1), D)), 1)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class CellsStanding(_PG):
    X, Y = 11, 12

    def _cell(self, code, unit, sap=CODE, letter=None, archived=None):
        from app.models import Cell
        c = Cell(verifix_code=code, sap_code=sap, manager_id=unit, wc_group=letter,
                 archived_at=archived)
        self.db.add(c)
        self.db.flush()
        return c

    def _moved(self, cell, frm, to, eff, vfx=None):
        from app.models import CellLinkEvent
        self.db.add(CellLinkEvent(
            cell_id=cell.id, field="manager_id", value=to, prev=frm, effective_from=eff,
            effective_at=datetime.combine(eff, time(8), tzinfo=TZ),
            applied_at=datetime.now(timezone.utc), src="manual", vfx=vfx))

    def test_dated_links_and_archive(self):
        from app.models import CellArchiveSpan
        from app.services import cell_archive, cell_links
        db, X, Y = self.db, self.X, self.Y
        self._units(X, Y)
        c1 = self._cell("0101", X, letter="A")
        c2 = self._cell("0102", X, sap=" a2894 ", letter="B")
        c3 = self._cell("0103", Y)                                  # arrived from X on D
        self._moved(c3, X, Y, D)
        self._cell("0104", X, sap="A2895", letter="C")              # another code
        gone = self._cell("0105", X, letter="G",
                          archived=datetime.combine(D - timedelta(days=3), time(12), tzinfo=TZ))
        db.add(CellArchiveSpan(cell_id=gone.id, from_day=D - timedelta(days=2), src="manual"))
        c6 = self._cell("0106", Y, letter="D")                      # left X on D+3, lost C
        self._moved(c6, X, Y, D + timedelta(days=3), vfx={"wc_group_was": "C"})
        c7 = self._cell("0107", X, letter="E")                      # archived, restored on D−1
        db.add(CellArchiveSpan(cell_id=c7.id, from_day=D - timedelta(days=5),
                               to_day=D - timedelta(days=1), src="manual"))
        c8 = self._cell("0108", X, letter="F")                      # stood in Y until D+1
        self._moved(c8, Y, X, D + timedelta(days=1))
        db.commit()
        cell_links.forget()
        cell_archive.forget()

        h = D
        got = own.cells_standing(db, X, CODE, h - timedelta(days=1), h)
        self.assertEqual(got, {c1.id: "A", c2.id: "B", c6.id: "C", c7.id: "E"})
        self.assertEqual(list(got), [c1.id, c2.id, c6.id, c7.id])
        self.assertEqual(own.cells_standing(db, X, "a 2894", h - timedelta(days=1), h,
                                            exclude=[c1.id, c6.id]),
                         {c2.id: "B", c7.id: "E"})
        self.assertEqual(own.cells_standing(db, Y, CODE, h - timedelta(days=1), h), {c8.id: "F"})
        self.assertEqual(own.cells_standing(db, Y, CODE, h, h + timedelta(days=1)), {c3.id: None})
        self.assertEqual(own.cells_standing(db, X, CODE, h + timedelta(days=3), h + timedelta(days=4)),
                         {c1.id: "A", c2.id: "B", c7.id: "E", c8.id: "F"})
        self.assertEqual(own.cells_standing(db, X, "", h - timedelta(days=1), h), {})


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class MoveReaders(_PG):
    X, Y, Z = 21, 22, 23

    def test_moved_rows(self):
        from app.models import Cell, CellLinkEvent, PPCatalogMove
        from app.services import cell_links, pp_catalog_moves as mv
        db, X, Y, Z = self.db, self.X, self.Y, self.Z
        self._units(X, Y, Z)

        def cell(code, unit):
            c = Cell(verifix_code=code, sap_code=CODE, manager_id=unit)
            db.add(c)
            db.flush()
            return c

        def ev(c, frm, to, eff):
            db.add(CellLinkEvent(cell_id=c.id, field="manager_id", value=to, prev=frm,
                                 effective_from=eff,
                                 effective_at=datetime.combine(eff, time(8), tzinfo=TZ),
                                 applied_at=datetime.now(timezone.utc), src="manual"))

        def e(i, key, wc):
            return {"id": i, "qty_key": key, "wc": wc, "wc_n": wc.upper(), "base": "x|1",
                    "group_from": None, "group_to": None, "active_after": True,
                    "joined_into": None, "takes_sap": not key.startswith("~")}

        def row(cell_id, frm, to, home, lines, ids, state="moved", code=CODE, whole=False):
            db.add(PPCatalogMove(kind="live", state=state, cell_id=cell_id, code=code,
                                 from_unit=frm, to_unit=to, home_from=home, whole_code=whole,
                                 lines=lines, line_ids=ids))

        m1 = cell("0201", Y)
        ev(m1, X, Y, D)
        m2 = cell("0202", X)                                     # X→Y on D, back on D+4
        ev(m2, X, Y, D)
        ev(m2, Y, X, D + timedelta(days=4))
        m3 = cell("0203", Y)
        ev(m3, X, Y, D + timedelta(days=2))
        row(m1.id, X, Y, D, [e(11, "F001", "A2894"), e(12, "~dough", "A2894")], [11, 12, 13])
        row(m2.id, X, Y, D, [e(21, "F002", "A2894")], [21])
        row(m3.id, X, Y, D + timedelta(days=2), [e(31, "F003", "b100")], [31],
            code="B100", whole=True)
        row(m1.id, X, Y, D, [e(41, "F004", "A2894")], [41], state="named")
        row(9999, X, Z, D, [e(51, "F005", "A2894")], [51])            # the cell row is gone
        row(m2.id, Y, X, D + timedelta(days=4), [e(21, "F002", "A2894")], [21, 22])
        db.commit()
        cell_links.forget()

        ids = lambda unit, day: sorted(x["id"] for x in mv.moved_out(db, unit, day))
        self.assertEqual(ids(X, D - timedelta(days=1)), [])
        self.assertEqual(ids(X, D), [11, 12, 21, 51])
        self.assertEqual(ids(X, D + timedelta(days=2)), [11, 12, 21, 31, 51])
        self.assertEqual(ids(X, D + timedelta(days=5)), [11, 12, 31, 51])
        one = next(x for x in mv.moved_out(db, X, D) if x["id"] == 11)
        self.assertEqual((one["cell_id"], one["whole_code"], one["code"], one["to_unit"],
                          one["home_from"], one["qty_key"]),
                         (m1.id, False, CODE, Y, D, "F001"))

        self.assertEqual(mv.moved_out_codes(db, X, D + timedelta(days=1)), set())
        self.assertEqual(mv.moved_out_codes(db, X, D + timedelta(days=2)), {"B100"})
        self.assertEqual(mv.moved_out_codes(db, Y, D + timedelta(days=5)), set())

        self.assertEqual(mv.moved_in_ids(db, Y, D - timedelta(days=1)), set())
        self.assertEqual(mv.moved_in_ids(db, Y, D), {11, 12, 13, 21})
        self.assertEqual(mv.moved_in_ids(db, Y, D + timedelta(days=5)), {11, 12, 13, 31})
        self.assertEqual(mv.moved_in_ids(db, X, D + timedelta(days=3)), set())
        self.assertEqual(mv.moved_in_ids(db, X, D + timedelta(days=5)), {21, 22})
        self.assertEqual(mv.moved_in_ids(db, Z, D), set())

        self.assertEqual(mv.moved_out_pairs(db, X, D),
                         {("F001", "A2894"), ("F002", "A2894"), ("F005", "A2894")})
        self.assertEqual(mv.moved_out_pairs(db, Y, D + timedelta(days=5)), {("F002", "A2894")})


if __name__ == "__main__":
    unittest.main()
