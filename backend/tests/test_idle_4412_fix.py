"""`startup.idle_4412_not_stopped` (22 Nov): the one wait filed as a stop by
mistake is flipped only when the screen's facts name exactly ONE row."""
import unittest
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from sqlalchemy import text

from app.models import Cell, CellOjidaniyaInterval as Iv


@unittest.skipUnless(SERVER, "needs SAFIA_TEST_PG")
class Idle4412Test(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        self.db = self.pg.Session()
        for t in ("cell_ojidaniya_intervals", "cells", "app_settings"):
            self.db.execute(text(f"DELETE FROM {t}"))
        self.db.add_all([Cell(id=1, verifix_code="4412"), Cell(id=2, verifix_code="4413")])
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def row(self, id, cell=1, date="2026-11-21", cat="Cat A", start="08:10", end="15:50",
            stopped=True, status="approved"):
        self.db.add(Iv(id=id, cell_id=cell, date=date, category=cat, start=start, end=end,
                       stopped=stopped, note="MALINA 3", status=status))
        self.db.commit()

    def run_step(self):
        from app import startup
        with mock.patch.object(startup, "SessionLocal", self.pg.Session), \
             mock.patch.object(startup, "_dm_admins_plain") as dm, \
             mock.patch("app.services.action_log.record_system") as log:
            startup.idle_4412_not_stopped()
        self.db.expire_all()
        return dm, log

    def stopped(self):
        return {r.id: r.stopped for r in self.db.query(Iv).all()}

    def test_flips_the_one_row_and_nothing_else(self):
        self.row(1)
        self.row(2, start="16:00", end="16:45")           # 4412's other wait that day
        self.row(3, cell=2)                               # the same clocks on another cell
        self.row(4, cat="Cat B")                          # another cause
        self.row(5, date="2026-10-21")                    # outside November
        self.row(6, status="rejected")                    # never an ojidaniya
        dm, log = self.run_step()
        self.assertEqual(self.stopped(), {1: False, 2: True, 3: True, 4: True, 5: True, 6: True})
        self.assertEqual(dm.call_count, 1)
        self.assertIn("✅", dm.call_args[0][0])
        self.assertEqual(log.call_args.kwargs["changes"], [("stopped", True, False)])
        self.assertEqual(log.call_args.kwargs["target_id"], 1)
        dm, log = self.run_step()                         # the flag: once
        self.assertEqual((dm.call_count, log.call_count), (0, 0))

    def test_two_candidates_change_nothing(self):
        self.row(1)
        self.row(2, date="2026-11-20")
        dm, log = self.run_step()
        self.assertEqual(self.stopped(), {1: True, 2: True})
        self.assertIn("⚠️", dm.call_args[0][0])
        self.assertIn("2026-11-20", dm.call_args[0][0])
        self.assertEqual(log.call_count, 0)

    def test_already_fixed_by_hand(self):
        self.row(1, stopped=False)
        dm, log = self.run_step()
        self.assertEqual(self.stopped(), {1: False})
        self.assertIn("Allaqachon", dm.call_args[0][0])
        self.assertEqual(log.call_count, 0)

    def test_nothing_found(self):
        dm, log = self.run_step()
        self.assertIn("topilmadi", dm.call_args[0][0])
        self.assertEqual(log.call_count, 0)


if __name__ == "__main__":
    unittest.main()
