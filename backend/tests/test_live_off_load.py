"""A cell NOT counted in the загрузка: its people are listed on the unit's
/staff day but count nowhere and hold nothing until the brigadir puts them to
counted work (the operator, 2026-11-24 — `live_staff.load` / `unit_day`).
No database: the day's context is built by hand."""
import unittest
from datetime import date, datetime

from app.services import live_staff

DAY = date(2026, 11, 24)
MID = 31
INSIDE = {"at": "2026-11-24T10:00:00", "ts": None, "m": [["2026-11-24T08:00:00", "I"]]}


def _day():
    ctx = live_staff.Ctx(
        day=DAY, now=datetime(2026, 11, 24, 10, 0),
        store={"1": INSIDE, "2": INSIDE, "3": INSIDE},
        directory={"emps": {e: {"name": f"WORKER {e}", "job": "Кондитер"} for e in "123"}},
        cells={"8898": {"id": 1, "code": "8898", "manager_id": MID}},
        units={MID: {"name": "Unit", "shift": 1}},
        # 1 — a counted cell; 2 — the cold room, listed only; 3 — the cold
        # room, put to counted work today (a role change, a move or a placement).
        homes={"1": (MID, "8898"), "2": (MID, "6668"), "3": (MID, "6668")},
        formula=None, docs=[], drafts=[], deleted=set(), pending_del={}, placements={},
        windows={1: ("08:00", "20:00")},
        off_cells={"6668": {"id": 2, "code": "6668", "manager_id": MID}}, off={"2"})
    return live_staff.unit_day(ctx, MID)


class OffLoadRows(unittest.TestCase):
    def test_listed_with_its_cell_and_counted_nowhere(self):
        ud = _day()
        rows = {r["employee_id"]: r for r in ud["workers"]}
        self.assertEqual(set(rows), {"1", "2", "3"})
        self.assertEqual((rows["2"]["off_load"], rows["2"]["verifix_code"]), (True, "6668"))
        self.assertEqual((rows["1"]["off_load"], rows["1"]["verifix_code"]), (False, "8898"))
        # Put to counted work: counted like anybody, placed into a counted cell.
        self.assertEqual((rows["3"]["off_load"], rows["3"]["verifix_code"]), (False, None))
        self.assertEqual((ud["counts"]["total"], ud["counts"]["came"]), (2, 2))

    def test_the_close_never_waits_on_a_listed_only_row(self):
        ud = _day()
        self.assertEqual({r["employee_id"] for r in live_staff.busy(ud)}, {"1", "3"})
        self.assertEqual([r["employee_id"] for r in live_staff.unplaced(ud["workers"])], ["3"])


if __name__ == "__main__":
    unittest.main()
