"""A cell NOT counted in the загрузка: its people are listed on the unit's
/staff day but count nowhere and hold nothing until the brigadir puts them to
counted work (the operator, 2026-11-24 — `live_staff.load` / `unit_day`).
No database: the day's context is built by hand."""
import unittest
from datetime import date, datetime

from app.services import live_staff, verifix_live

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


class UnitFloor(unittest.TestCase):
    """«Алмата Фабрика» (1761) over the unit's cells, with people on it."""
    DIR = {
        "divs": {"1761": {"code": None, "parent": "3941"},
                 "8681": {"code": "8898", "parent": "1761"},
                 "8684": {"code": "6668", "parent": "1761"},
                 "50": {"code": None, "parent": "3941"},
                 "51": {"code": "4112", "parent": "50"}, "52": {"code": "4113", "parent": "50"}},
        "emps": {"a": {"unit": "1761", "job": "Кондитер"},
                 "boss": {"unit": "1761", "job": "Технолог"},       # tied to the unit
                 "sup": {"unit": "1761", "job": "Бригадир"},
                 "x": {"unit": "50", "job": "Кондитер"},            # two units' workshop
                 "c": {"unit": "8681", "job": "Кондитер"}},
    }
    CELLS = {"8898": {"manager_id": MID}, "6668": {"manager_id": MID},
             "4112": {"manager_id": 1}, "4113": {"manager_id": 2}}

    def test_only_workers_of_one_units_own_division(self):
        self.assertEqual(verifix_live._floor(self.DIR, self.CELLS, {"boss"}), {"a": (MID, None)})

    def test_a_floor_worker_is_listed_with_no_cell(self):
        ctx = live_staff.Ctx(
            day=DAY, now=datetime(2026, 11, 24, 10, 0), store={"a": INSIDE},
            directory={"emps": {"a": {"name": "WORKER A", "job": "Кондитер"}}},
            cells={}, units={MID: {"name": "Unit", "shift": 1}}, homes={"a": (MID, None)},
            formula=None, docs=[], drafts=[], deleted=set(), pending_del={}, placements={},
            windows={1: ("08:00", "20:00")}, off_cells={}, off={"a"})
        r = live_staff.unit_day(ctx, MID)["workers"][0]
        self.assertEqual((r["off_load"], r["verifix_code"]), (True, None))


if __name__ == "__main__":
    unittest.main()
