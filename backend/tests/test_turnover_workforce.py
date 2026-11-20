"""The workforce MOVEMENT (2026-11-20) — «Hisobotlar»'s TopSim table:
initial + hires − dismissals − attrition = final.

`turnover.aggregate` counts all five off one set of people, so the identity
holds whatever the scope, the cells out of the KPI or HR's «Sabablar» list;
`left_kind` tells a dismissal (the company ended it) from attrition (the
person left) by Verifix's reason; `services/reports` lays the block out.
"""
import unittest
from datetime import date

from app.services import reports, turnover

M = date(2026, 11, 1)
OLD = date(2025, 3, 14)        # hired long before the month
NEW = date(2026, 11, 9)        # hired inside it


def _p(code, eid, hired=OLD):
    return {"code": code, "employee_id": eid, "staff_id": f"s-{eid}", "name": eid,
            "unit": None, "job": None, "hired": hired}


def _l(code, eid, reason=None, hired=OLD, left=date(2026, 11, 12)):
    return {**_p(code, eid, hired), "dismissed": left, "reason": reason, "note": None}


def _cmap():
    k = turnover.code_key
    return {
        k("0010"): {"id": 1, "code": "0010", "owner_id": 5, "owner": "A", "kpi": True,
                    "manager_id": 7, "shift": 1, "factory_id": 1},
        k("0011"): {"id": 2, "code": "0011", "owner_id": 6, "owner": "B", "kpi": True,
                    "manager_id": 8, "shift": 2, "factory_id": 1},
        k("0020"): {"id": 3, "code": "0020", "owner_id": 9, "owner": "C", "kpi": False,
                    "manager_id": 7, "shift": 1, "factory_id": 1},
    }


def _people():
    roster = (
        [_p("0010", f"a{i}") for i in range(8)]                 # there all along
        + [_p("0010", f"n{i}", NEW) for i in range(3)]          # hired this month, still working
        + [_p("0011", f"b{i}") for i in range(5)]
        + [_p("0011", "bn", NEW)]
        + [_p("0020", f"k{i}") for i in range(4)]               # a cell out of the KPI
        + [_p("7777", "u1")]                                    # a code /cells does not have
    )
    leavers = [
        _l("0010", "x1", "По собственному желанию"),
        _l("0010", "x2", "Дисциплинарные нарушения"),           # the company ended it
        _l("0010", "x3", "Учёба"),                              # HR keeps it out of turnover
        _l("0010", "x4", None, hired=NEW),                      # hired and gone in one month
        _l("0011", "y1", "  черное   СПИСКА "),                 # the journal's other spelling
        _l("0011", "y2", "Переезд"),
        _l("0020", "z1", "Дисциплинарные нарушения"),           # KPI off: counts nowhere
        _l("7777", "z2", "Переезд"),                            # not on /cells: nowhere either
    ]
    return roster, leavers


RULE = {**turnover.DEFAULT_RULE, "exclude_reasons": ["Учёба", "Дисциплинарные нарушения"]}


class LeftKindTest(unittest.TestCase):
    def test_the_company_ended_it(self):
        for reason in ("Дисциплинарные нарушения", "дисциплинарные  нарушения ", "Черное списка"):
            self.assertEqual(turnover.left_kind(reason), "dismissal", reason)

    def test_everything_else_is_attrition(self):
        for reason in ("По собственному желанию", "Учёба", "Увольнение со смертью",
                       "Стажёр (работал менее 3 дней)", "", None):
            self.assertEqual(turnover.left_kind(reason), "attrition", reason)


class MovementTest(unittest.TestCase):
    def _totals(self, scope=None, rule=RULE):
        roster, leavers = _people()
        return turnover.aggregate(roster, leavers, _cmap(), rule, scope, month=M)["totals"]

    def assertAddsUp(self, t):
        self.assertEqual(t["initial"] + t["hired"] - t["dismissed"] - t["attrition"], t["working"], t)

    def test_the_rows_add_up(self):
        t = self._totals()
        self.assertEqual(t["working"], 17)          # 11 + 6 in the two counted cells
        self.assertEqual(t["hired"], 5)             # 3 + 1 still working, 1 already gone
        self.assertEqual(t["dismissed"], 2)         # x2, y1
        self.assertEqual(t["attrition"], 4)         # x1, x3, x4, y2
        self.assertEqual(t["initial"], 18)          # 13 still working + 5 who left
        self.assertAddsUp(t)

    def test_a_reason_hr_does_not_count_still_left(self):
        # «Left» — the rate's — drops the two excluded reasons; the movement
        # keeps every leaver, or the workforce would not add up.
        t = self._totals()
        self.assertEqual(t["left"], 4)
        self.assertEqual(t["dismissed"] + t["attrition"], 6)
        self.assertEqual(t["rate"], turnover.rate_of(4, 17, RULE))

    def test_no_exclusions_changes_no_movement(self):
        a, b = self._totals(), self._totals(rule=turnover.DEFAULT_RULE)
        for k in ("initial", "hired", "dismissed", "attrition", "working"):
            self.assertEqual(a[k], b[k], k)
        self.assertEqual(b["left"], 6)

    def test_every_scope_adds_up(self):
        for scope in ({"shift": 1}, {"shift": 2}, {"managers": {8}}, {"factory": 1}, {"factory": 2}):
            self.assertAddsUp(self._totals(scope))
        t = self._totals({"shift": 2})
        self.assertEqual((t["initial"], t["hired"], t["dismissed"], t["attrition"], t["working"]),
                         (7, 1, 1, 1, 6))

    def test_a_cell_left_empty_keeps_its_leavers(self):
        # Nobody working and no COUNTED leaver: the cell is on no list, but the
        # person who left it under an excluded reason was there when the month began.
        cmap = {turnover.code_key("0030"): {"id": 4, "code": "0030", "kpi": True}}
        t = turnover.aggregate([], [_l("0030", "q", "Учёба")], cmap, RULE, month=M)["totals"]
        self.assertEqual((t["initial"], t["hired"], t["dismissed"], t["attrition"], t["working"]),
                         (1, 0, 0, 1, 0))

    def test_a_person_with_no_hire_date_was_there(self):
        cmap = {turnover.code_key("0030"): {"id": 4, "code": "0030", "kpi": True}}
        t = turnover.aggregate([{"code": "0030"}, _p("0030", "h", None)], [], cmap, RULE, month=M)["totals"]
        self.assertEqual((t["initial"], t["hired"], t["working"]), (2, 0, 2))

    def test_without_a_month_there_is_no_movement(self):
        roster, leavers = _people()
        t = turnover.aggregate(roster, leavers, _cmap(), RULE)["totals"]
        self.assertNotIn("initial", t)
        self.assertEqual((t["working"], t["left"]), (17, 4))


def _months(partial: bool) -> list[dict]:
    return [
        {"from": date(2026, 10, 1), "to": date(2026, 10, 31), "end": date(2026, 10, 31),
         "partial": False, "ym": "2026-10"},
        {"from": M, "to": date(2026, 11, 20 if partial else 30), "end": date(2026, 11, 30),
         "partial": partial, "ym": "2026-11"},
    ]


class ReportBlockTest(unittest.TestCase):
    TURN = {
        "2026-10": {"initial": 1590, "hired": 110, "dismissed": 6, "attrition": 85,
                    "working": 1609, "left": 83, "rate": 61.9},
        "2026-11": {"initial": 1612, "hired": 75, "dismissed": 4, "attrition": 39,
                    "working": 1644, "left": 39, "rate": 28.5},
    }

    def _block(self, partial=True, turn=None) -> dict:
        out = reports.compose({
            "months": _months(partial), "unit_ids": {1},
            "plan": {}, "eff": {}, "sload": {}, "att": {}, "vkinds": {}, "ontime": {},
            "turnover": self.TURN if turn is None else turn, "idle": {}, "idle_share": {},
            "cost": None, "qual": {}, "qual_n": {}, "xav": {}, "vfx_scope": None,
            "scope": {"units": 1},
        })
        sec = next(s for s in out["sections"] if s["key"] == "personnel")
        blk = next(b for b in sec["blocks"] if b["key"] == "turnover")
        return {r["key"]: r for r in blk["rows"]} | {"_order": [r["key"] for r in blk["rows"]]}

    def test_topsims_rows_in_topsims_order(self):
        b = self._block()
        self.assertEqual(b["_order"], ["wfInitial", "wfHires", "wfDismissals", "wfAttrition",
                                       "working", "turnRate"])
        self.assertEqual(b["wfInitial"]["values"], [1590, 1612])
        self.assertEqual(b["wfHires"]["values"], [110, 75])
        self.assertEqual(b["wfDismissals"]["values"], [6, 4])
        self.assertEqual(b["wfAttrition"]["values"], [85, 39])
        self.assertEqual(b["working"]["values"], [1609, 1644])
        self.assertEqual(b["turnRate"]["values"], [61.9, 28.5])

    def test_a_running_month_compares_stocks_and_the_rate_only(self):
        b = self._block(partial=True)
        for key in ("wfHires", "wfDismissals", "wfAttrition"):
            self.assertIsNone(b[key]["delta"], key)
            self.assertEqual(b[key].get("no_delta"), "partial", key)
        self.assertEqual(b["wfInitial"]["delta"], 22)
        self.assertEqual(b["working"]["delta"], 35)
        self.assertEqual(b["turnRate"]["delta"], -33.4)

    def test_a_finished_month_compares_every_row(self):
        b = self._block(partial=False)
        self.assertEqual(b["wfHires"]["delta"], -35)
        self.assertEqual(b["wfAttrition"]["delta"], -46)

    def test_a_month_read_before_the_movement_prints_no_answer(self):
        old = {"2026-10": {"working": 1609, "left": 83, "rate": 61.9}, "2026-11": None}
        b = self._block(turn=old)
        self.assertEqual(b["wfInitial"]["values"], [None, None])
        self.assertEqual(b["working"]["values"], [1609, None])


if __name__ == "__main__":
    unittest.main()
