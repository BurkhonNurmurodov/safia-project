"""The leader auto-checks read their checklist day WHOLE (2026-10-26, WP8 of
docs/plan-catalog-follows-cells.md).

WP5 dated a check's unit and pairs; this dates the rest of what a verdict is
taken from, and the readers that replay one:

* `_Ctx.cells` (`leader_auto.cells_run_on`) — the cells the leader ran ON the
  day, each wearing its letter of that day; with nothing moved, the old query;
* `_Ctx.pins` — split over every cell standing in the unit that day;
* a move not followed yet (`catalog_follow.CatalogUnsettled`) is a QUIET
  `no_data` — and `auto_check_timing` answers nothing, `auto_check_restore`
  refuses to read the page — while a followed move, and every day before it,
  is read in the unit of its day;
* a catalog MARK (`catalog_follow._mark_event`) never resolves a unit and never
  counts as a change, whether it reaches `cell_links` filtered or not.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_leader_auto_dated
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

try:
    from tests.pg_scratch import SERVER
    from tests.test_dated_leader_scope import CODE, D, TZ, _PG
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER
    from test_dated_leader_scope import CODE, D, TZ, _PG

from app.services import cell_links, leader_auto, zagruzka_source

BEFORE = D - timedelta(days=1)


class _Base(_PG):
    def setUp(self):
        from app import models as m
        db = self.pg.Session()
        # Rows the shared fixture does not clear, before the tables they point at.
        for t in (m.LeaderAutoCheck, m.LeaderConcern, m.PPCatalogMove, m.AppSetting):
            db.query(t).delete()
        db.commit()
        db.close()
        super().setUp()

    def _ctx(self, lead, day, cell=None, unit=None):
        from app.models import Manager
        due = datetime.combine(day, time(14), tzinfo=TZ)
        return leader_auto._Ctx(self.db, lead, self.db.get(Manager, unit or self.X), 1,
                                day.isoformat(), cell, due, due + timedelta(minutes=1))

    def _move(self, cell, frm, to, eff, letter_was=None):
        """A landed brigadir move, as `apply_due` leaves it."""
        from app.models import CellLinkEvent
        vfx = {"letter_before": letter_was}
        if letter_was:
            vfx["wc_group_was"] = letter_was
        ev = CellLinkEvent(cell_id=cell.id, field="manager_id", value=to, prev=frm,
                           effective_from=eff,
                           effective_at=datetime.combine(eff, time(8), tzinfo=TZ),
                           applied_at=datetime.now(timezone.utc), src="manual", vfx=vfx)
        self.db.add(ev)
        self.db.flush()
        return ev

    def _pin(self, mid, day, people, group=None, wc=CODE):
        from app.models import PPWorkCenterDaily
        self.db.add(PPWorkCenterDaily(manager_id=mid, date=day, work_center=wc,
                                      wc_group=group, people=people))
        self.db.flush()

    def _follow_on(self):
        """The follow switched on — the retro flag reads `done`."""
        from app.models import AppSetting
        from app.services import catalog_follow
        self.db.add(AppSetting(key=catalog_follow.RETRO_FLAG, value="done:0/0"))
        self.db.flush()

    def _followed(self, ev, cell):
        from app.models import PPCatalogMove
        self.db.add(PPCatalogMove(kind="live", state="moved", event_id=ev.id, cell_id=cell.id,
                                  code=CODE, from_unit=ev.prev, to_unit=ev.value,
                                  home_from=ev.effective_from))
        self.db.flush()


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class CellsOfTheDay(_Base):
    def test_cells_follow_the_leader_of_the_day(self):
        X = self.X
        self._units(X)
        l1 = self._leader("Lider Bir", X)
        l2 = self._leader("Lider Ikki", X)
        c1 = self._cell("0101", X, letter="A", leader=l1)
        c2 = self._cell("0102", X, letter="B", leader=l2)
        # c2 was l1's until D; its column already names l2.
        self._event(c2, "leader_id", l1.id, l2.id, D)
        self._commit()

        def ids(lead, day):
            return sorted(c.id for c in self._ctx(lead, day).cells)

        self.assertEqual(ids(l1, BEFORE), sorted([c1.id, c2.id]))
        self.assertEqual(ids(l1, D), [c1.id])
        self.assertEqual(ids(l2, BEFORE), [])
        self.assertEqual(ids(l2, D), [c2.id])

    def test_cells_wear_the_letter_of_the_day(self):
        X, Y = self.X, self.Y
        self._units(X, Y)
        lead = self._leader("Lider Bir", X)
        c = self._cell("0101", Y, letter=None, leader=lead)
        self._move(c, X, Y, D, letter_was="B")       # a «B» in X, unlettered in Y
        self._commit()
        self.assertEqual([x.wc_group for x in self._ctx(lead, BEFORE).cells], ["B"])
        self.assertEqual([x.wc_group for x in self._ctx(lead, D).cells], [None])
        # A per-cell checklist reads its own cell with that day's letter too.
        self.assertEqual([x.wc_group for x in self._ctx(lead, BEFORE, cell=c).cells], ["B"])
        self.assertEqual([x.id for x in self._ctx(lead, BEFORE, cell=c).cells], [c.id])
        # …and #1 cuts the day's rows by it (`cell_planned`): another group's
        # plan was not the «B» cell's that day, though the unlettered column
        # would read the whole work centre as its own.
        other = [{"plan_qty": 5, "work_center": CODE, "wc_group": "C"}]
        own = [{"plan_qty": 5, "work_center": CODE, "wc_group": "B"}]
        dated = self._ctx(lead, BEFORE).cells[0]
        self.assertFalse(leader_auto.cell_planned(other, dated))
        self.assertTrue(leader_auto.cell_planned(own, dated))
        self.assertTrue(leader_auto.cell_planned(other, c))

    def test_nothing_moved_is_the_old_query(self):
        from app.models import Cell
        from app.services import cell_archive
        X = self.X
        self._units(X)
        lead = self._leader("Lider Bir", X)
        self._cell("0101", X, letter="A", leader=lead)
        self._cell("0102", X, letter="B", leader=lead)
        gone = self._cell("0103", X, leader=lead)
        gone.archived_at = datetime.combine(D - timedelta(days=3), time(12), tzinfo=TZ)
        self._cell("0104", X, leader=self._leader("Lider Ikki", X))
        self._commit()
        for day in (BEFORE, D):
            old = (self.db.query(Cell).filter(Cell.leader_id == lead.id,
                                              cell_archive.alive_clause(day.isoformat()))
                   .all())
            got = self._ctx(lead, day).cells
            self.assertEqual(sorted(c.id for c in got), sorted(c.id for c in old))
            # The rows themselves, not stand-ins: no letter of theirs moved.
            self.assertTrue(all(type(c) is Cell for c in got))

    def test_concerns_count_the_cells_of_the_day(self):
        from app.models import LeaderConcern
        X = self.X
        self._units(X)
        l1 = self._leader("Lider Bir", X)
        l2 = self._leader("Lider Ikki", X)
        c2 = self._cell("0102", X, leader=l2)
        self._event(c2, "leader_id", l1.id, l2.id, D)
        start = datetime.combine(BEFORE, time(10), tzinfo=TZ)
        self.db.add(LeaderConcern(entry_date=BEFORE, concern_text="Sovuq", leader_name="Lider Ikki",
                                  concern_owner="Lider Ikki", worker_name="Ishchi",
                                  cell_code="0102", brigadir_manager_id=X, created_at=start))
        self._commit()
        v = leader_auto._RUNNERS["concerns"](self._ctx(l1, BEFORE), None)
        self.assertEqual((v.done, v.facts["found"], v.facts["cells"]), (True, 1, 1))
        v = leader_auto._RUNNERS["concerns"](self._ctx(l2, BEFORE), None)
        self.assertEqual((v.done, v.facts["cells"]), (False, 0))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class PinsOfTheDay(_Base):
    def _fixture(self):
        X, Y = self.X, self.Y
        self._units(X, Y)
        lead = self._leader("Lider Bir", X)
        a = self._cell("0101", X, letter="A", leader=lead)
        c = self._cell("0102", Y, letter=None)
        self._move(c, X, Y, D, letter_was="B")
        # The day before the move X typed its two groups.
        self._pin(X, BEFORE, 3, group="A")
        self._pin(X, BEFORE, 2, group="B")
        self._commit()
        return lead, a, c

    def test_pins_split_over_the_cells_of_the_day(self):
        lead, a, c = self._fixture()
        day = BEFORE.isoformat()
        pins = self._ctx(lead, BEFORE).pins
        self.assertEqual(pins[(a.id, day)][0], 3.0)
        self.assertEqual(pins[(c.id, day)][0], 2.0)
        # Read over today's cells, «B» named nobody and its 2 people were a's.
        from app.models import Cell
        raw = zagruzka_source.typed_pins(self.db, [self.X], BEFORE, BEFORE)
        undated = zagruzka_source.cell_pins(
            self.db.query(Cell).filter(Cell.manager_id == self.X).all(), raw)
        self.assertEqual(undated[(a.id, day)][0], 5.0)

    def test_nothing_moved_reads_as_before(self):
        from app.models import Cell
        X = self.X
        self._units(X)
        lead = self._leader("Lider Bir", X)
        a = self._cell("0101", X, letter="A", leader=lead)
        self._cell("0102", X, letter="B")
        self._pin(X, D, 3, group="A")
        self._pin(X, D, 4)
        self._commit()
        raw = zagruzka_source.typed_pins(self.db, [X], D, D)
        old = zagruzka_source.cell_pins(self.db.query(Cell).filter(Cell.manager_id == X).all(),
                                        raw)
        self.assertEqual(self._ctx(lead, D).pins, old)
        self.assertIn((a.id, D.isoformat()), old)


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class AMoveNotFollowedYet(_Base):
    """The REAL `catalog_follow.unsettled`: a landed move with no final record,
    while the follow is on."""

    def _fixture(self):
        from app.models import CellLinkEvent
        lead, c = self._moved_cell()
        ev = self.db.query(CellLinkEvent).filter_by(cell_id=c.id, field="manager_id").one()
        self._follow_on()
        self._commit()
        return lead, c, ev

    def _evaluate(self, lead, day, check="plan_pct"):
        from app.models import Manager
        due = datetime.combine(day, time(14), tzinfo=TZ)
        return leader_auto.evaluate(
            self.db, prof=lead, manager=self.db.get(Manager, self.X), shift=1,
            date=day.isoformat(), cell=None, check=check, target=30.0,
            due=due, now=due)

    def test_quiet_no_data_then_the_verdict(self):
        lead, c, ev = self._fixture()
        with self.assertLogs(leader_auto.logger, "INFO") as logs:
            v = self._evaluate(lead, D)
        self.assertEqual((v.outcome, v.code), (leader_auto.SKIPPED, "no_data"))
        self.assertTrue(v.facts["unsettled"])
        self.assertEqual([r.levelname for r in logs.records], ["INFO"])
        self.assertIsNone(logs.records[0].exc_info)
        # The day before the move is never waiting on it.
        self.assertNotEqual(self._evaluate(lead, BEFORE).code, "no_data")
        # Followed: the page is read.
        self._followed(ev, c)
        self._commit()
        v = self._evaluate(lead, D)
        self.assertNotEqual(v.code, "no_data")
        self.assertEqual(v.facts["plan_min"], 20.0)

    def test_code_totals_wait_as_well(self):
        lead, _c, _ev = self._fixture()
        from app.services import catalog_follow
        ctx = self._ctx(lead, D)
        with self.assertRaises(catalog_follow.CatalogUnsettled):
            ctx.code_totals("Z9999")          # never the dashboard's own code

    def _dispute_row(self, lead, day):
        from app.models import LeaderAutoCheck
        due = datetime.combine(day, time(14), tzinfo=TZ)
        self.db.add(LeaderAutoCheck(leader_id=lead.id, date=day.isoformat(), task_id=9,
                                    manager_id=self.X, check="plan_pct", due_at=due,
                                    checked_at=due, outcome=leader_auto.FAILED,
                                    code="under_target", facts={"target": 30},
                                    entry_id=7000 + day.day))
        self._commit()
        return SimpleNamespace(id=7000 + day.day)

    def test_objection_timing(self):
        from app.services import auto_check_timing, leader_dispute
        lead, c, ev = self._fixture()
        for day in (BEFORE, D):
            entry = self._dispute_row(lead, day)
            with mock.patch.object(leader_dispute, "auto_entry", lambda db, d, e=entry: e):
                got = auto_check_timing.for_dispute(self.db, SimpleNamespace(ref="bot:1"))
            if day == D:
                # Waiting on the follow: nothing drawn, never «no plan».
                self.assertIsNone(got)
            else:
                # Read in X, where the day's catalog and plan stood.
                self.assertEqual(got["check"], "plan_pct")
                self.assertNotEqual(got["verdict"], "no_plan")
                self.assertEqual(got["now_pct"], 40.0)
        self._followed(ev, c)
        self._commit()
        entry = SimpleNamespace(id=7000 + D.day)
        with mock.patch.object(leader_dispute, "auto_entry", lambda db, d: entry):
            got = auto_check_timing.for_dispute(self.db, SimpleNamespace(ref="bot:1"))
        self.assertEqual(got["now_pct"], 40.0)          # Y's 8 of 20 on D

    def test_restore_reads_the_unit_of_the_day(self):
        from app.models import Manager
        from app.services import auto_check_restore as acr, catalog_follow
        lead, c, ev = self._fixture()
        mx = self.db.get(Manager, self.X)
        w = acr._Walk(self.db, datetime.now(timezone.utc))
        due0 = datetime.combine(BEFORE, time(14), tzinfo=TZ)
        due1 = datetime.combine(D, time(14), tzinfo=TZ)
        self.assertEqual(w.prod_unit(lead, mx, BEFORE.isoformat(), due0).id, self.X)
        with self.assertRaises(catalog_follow.CatalogUnsettled):
            w.prod_unit(lead, mx, D.isoformat(), due1)
        self._followed(ev, c)
        self._commit()
        w = acr._Walk(self.db, datetime.now(timezone.utc))
        self.assertEqual(w.prod_unit(lead, mx, D.isoformat(), due1).id, self.Y)
        # The replay's cells are the unit's cells of the day: c was X's before D.
        self.assertIn(c.id, {x.id for x in acr._Unit(self.db, mx, BEFORE.isoformat()).cells})
        self.assertNotIn(c.id, {x.id for x in acr._Unit(self.db, mx, D.isoformat()).cells})
        self.assertEqual([x.id for x in w.cells(lead.id, BEFORE.isoformat())], [c.id])


class MarksNeverResolve(unittest.TestCase):
    """A catalog mark (value = prev, src «catalog_follow») carries letter
    history and nothing else."""

    def _ev(self, i, eff, prev, value, src="manual"):
        return cell_links._Ev(i, eff, value, prev, True, src, None)

    def test_resolve_skips_a_mark(self):
        Y, Z = 2, 3
        real = self._ev(2, D, Y, Z)                         # Y → Z on D
        mark = self._ev(1, D - timedelta(days=4), Z, Z, src="catalog_follow")
        for evs in ([mark, real], [real]):
            self.assertEqual(cell_links._resolve(evs, Z, D - timedelta(days=6)), Y)
            self.assertEqual(cell_links._resolve(evs, Z, D - timedelta(days=2)), Y)
            self.assertEqual(cell_links._resolve(evs, Z, D), Z)
        self.assertEqual(cell_links._resolve([mark], Z, D - timedelta(days=9)), Z)
        # Any other value = prev event (a void, a «who decides» mark) is untouched.
        void = self._ev(1, D - timedelta(days=4), Z, Z)
        self.assertEqual(cell_links._resolve([void, real], Z, D - timedelta(days=2)), Z)

    def test_changed_since_ignores_a_mark(self):
        mark = self._ev(1, D + timedelta(days=3), 5, 5, src="catalog_follow")
        with mock.patch.object(cell_links, "events", lambda fresh=False: {"manager_id": {9: [mark]}}):
            self.assertEqual(cell_links.changed_since("manager_id", D), set())


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class MarksInTheTable(_Base):
    def test_record_reads_past_a_mark(self):
        """`record` resolves over the table itself (`_fresh`), marks included."""
        from app.models import CellLinkEvent
        X, Y = self.X, self.Y
        self._units(X, Y)
        c = self._cell("0101", Y)
        self._move(c, X, Y, D)
        # A mark written AFTER that move, dated before it, beside the column (Y).
        self.db.add(CellLinkEvent(cell_id=c.id, field="manager_id", value=Y, prev=Y,
                                  effective_from=D - timedelta(days=3),
                                  effective_at=datetime.combine(D - timedelta(days=3), time(0),
                                                                tzinfo=TZ),
                                  applied_at=datetime.now(timezone.utc), src="catalog_follow",
                                  vfx={"catalog_mark": True}))
        self._commit()
        # In force on D−2 is X: asking for X then changes nothing.
        self.assertIsNone(cell_links.record(self.db, c, "manager_id", X, src="manual",
                                            effective_from=D - timedelta(days=2)))
        self.assertEqual(c.manager_id, Y)
        self.assertEqual(cell_links.value_on(c, "manager_id", D - timedelta(days=2)), X)
        self.assertEqual(cell_links.changed_since("manager_id", D - timedelta(days=5)), {c.id})
        self.assertEqual(cell_links.changed_since("manager_id", D), set())


if __name__ == "__main__":
    unittest.main()
