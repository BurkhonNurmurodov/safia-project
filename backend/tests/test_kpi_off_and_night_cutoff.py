"""HR's rulings of 2026-11-16: a cell switched out of the KPI (`cells.kpi`)
counts nowhere in turnover, and a night cell's month of concerns ends when the
shift that began on its last day ends (worker_concerns._night_cutoff)."""
import unittest
from datetime import date, datetime, timezone
from unittest import mock

from sqlalchemy import select

from app.models import Cell, ConcernEscalation, LeaderConcern
from app.routers import worker_concerns as wc
from app.services import turnover

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


def _leaver(code, eid, reason=None):
    return {"code": code, "employee_id": eid, "staff_id": None, "name": eid, "unit": None, "job": None,
            "hired": date(2026, 1, 1), "dismissed": date(2026, 10, 5), "reason": reason, "note": None}


class KpiOffTurnoverTest(unittest.TestCase):
    def test_off_cell_counts_nowhere_and_is_listed(self):
        on, off = turnover.code_key("0010"), turnover.code_key("0020")
        cmap = {on: {"id": 1, "code": "0010", "owner_id": 5, "owner": "A", "kpi": True},
                off: {"id": 2, "code": "0020", "owner_id": 6, "owner": "B", "kpi": False}}
        roster = [{"code": "0010"}] * 10 + [{"code": "0020"}] * 10
        leavers = [_leaver("0010", "a"), _leaver("0020", "b"), _leaver("0020", "c", "Учёба")]
        out = turnover.aggregate(roster, leavers, cmap, turnover.DEFAULT_RULE)
        self.assertEqual((out["totals"]["working"], out["totals"]["left"]), (10, 1))
        self.assertEqual([x["key"] for x in out["ranking"]], [on])
        self.assertEqual([c["key"] for c in out["cells"]], [on])      # «Brigadirlar KPI» reads these
        self.assertEqual({x["name"]: x["counted"] for x in out["leavers"]},
                         {"a": "owner", "b": "kpi_off", "c": "kpi_off"})
        self.assertEqual(out["totals"]["kpi_off_left"], 2)
        self.assertEqual(out["unregistered"], [])

    def test_frozen_map_without_the_switch_still_counts(self):
        self.assertTrue(turnover.ranked({"code": "0010"}))
        self.assertFalse(turnover.ranked({"code": "0010", "kpi": False}))


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class NightShiftCutoffTest(unittest.TestCase):
    END = date(2026, 10, 31)

    def setUp(self):
        self.pg = ScratchDB()
        self.db = self.pg.Session()
        night = Cell(verifix_code="4721", shift_start="19:00", shift_end="07:00")
        day = Cell(verifix_code="0101", shift_start="08:00", shift_end="17:00")
        self.db.add_all([night, day])
        self.db.flush()
        cells = {"4721": {"id": night.id, "shift": 2}, "0101": {"id": day.id, "shift": 1}}
        self.patch = mock.patch.object(wc, "_cells_on", lambda db, end: cells)
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.db.close()
        self.pg.drop()

    def _concern(self, code, level="leader", status="done", done_at=None, moves=()):
        c = LeaderConcern(leader_name="L", concern_owner="w", worker_name="w", concern_text="x",
                          status=status, level=level, entry_date=date(2026, 10, 20),
                          cell_code=code, done_at=done_at)
        self.db.add(c)
        self.db.flush()
        for at, frm, to in moves:
            self.db.add(ConcernEscalation(concern_id=c.id, from_level=frm, to_level=to, reason="r",
                                          created_at=at))
        self.db.flush()
        return c.id

    def _bucket(self, cid):
        return self.db.execute(select(wc._bucket(self.END, self.db)).where(LeaderConcern.id == cid)).scalar()

    # Tashkent is UTC+5: 1 Nov 06:30 there = 01:30 UTC.
    def test_night_cell_closed_before_its_shift_ends_counts(self):
        cid = self._concern("4721", done_at=datetime(2026, 11, 1, 1, 30, tzinfo=timezone.utc))
        self.assertEqual(self._bucket(cid), "done")

    def test_night_cell_closed_after_its_shift_ends_does_not(self):
        cid = self._concern("4721", done_at=datetime(2026, 11, 1, 2, 30, tzinfo=timezone.utc))
        self.assertEqual(self._bucket(cid), "doing")

    def test_day_cell_has_no_grace(self):
        cid = self._concern("0101", done_at=datetime(2026, 11, 1, 1, 30, tzinfo=timezone.utc))
        self.assertEqual(self._bucket(cid), "doing")

    def test_night_escalation_before_the_shift_end_is_uplifted(self):
        cid = self._concern("4721", level="supervisor", status="todo", moves=[
            (datetime(2026, 11, 1, 0, 0, tzinfo=timezone.utc), "leader", "supervisor")])
        self.assertEqual(self._bucket(cid), "uplifted")

    def test_night_escalation_after_the_shift_end_stays_the_leaders(self):
        cid = self._concern("4721", level="supervisor", status="todo", moves=[
            (datetime(2026, 11, 1, 3, 0, tzinfo=timezone.utc), "leader", "supervisor")])
        self.assertEqual(self._bucket(cid), "todo")

    def test_only_a_months_last_day(self):
        self.assertIsNone(wc._night_cutoff(self.db, date(2026, 10, 30)))


if __name__ == "__main__":
    unittest.main()
