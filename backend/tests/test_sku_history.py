"""«SKU tarixi» rules (`services/sku_history.build`) — no database.

    ./venv/bin/python -m unittest tests.test_sku_history
"""
from __future__ import annotations

import unittest
from datetime import date
from types import SimpleNamespace

from app.services import sku_history

D = lambda d: date(2026, 10, d)  # noqa: E731


def L(id, code="", name="", active=True, wc="A1"):
    return SimpleNamespace(id=id, sap_code=code, name=name, work_center=wc, active=active)


class BuildTest(unittest.TestCase):
    def kinds(self, out, day):
        return sorted((e["kind"], e["key"], e["how"]) for e in out["events"] if e["date"] == day.isoformat())

    def test_every_kind(self):
        a0 = [L(1, "S1"), L(2, "S2"), L(3, "S3"), L(4, "S4", active=False), L(5, "", "Dough mix"),
              L(6, "", "Cream base"), L(7, "S7")]
        a1 = [L(1, "S1"), L(2, "S2", active=False),          # S2 archived
              L(4, "S4"),                                    # S4 restored
              L(5, "F9"), L(6, "F9"),                        # two code-less → ONE code
              L(8, "S8")]                                    # S8 new; S3 deleted; S7 moved
        b0 = [L(20, "S20")]
        b1 = [L(20, "S20"), L(7, "S7")]
        segs = {1: [(D(1), a0), (D(5), a1)], 2: [(D(1), b0), (D(5), b1)]}
        out = sku_history.build(segs, {1}, D(3), D(9))

        self.assertEqual(out["start"], {"total": 6, "coded": 4})
        self.assertEqual(self.kinds(out, D(5)), sorted([
            ("new", "S8", None), ("restored", "S4", None),
            ("removed", "S2", "archived"), ("removed", "S3", "deleted"),
            ("moved_out", "S7", None),
            ("recoded", "F9", None), ("recoded", "F9", None)]))
        t = out["totals"]
        self.assertEqual((t["new"], t["restored"], t["removed"], t["archived"], t["deleted"]), (1, 1, 2, 1, 1))
        self.assertEqual((t["moved_out"], t["recoded_in"], t["recoded_out"]), (1, 1, 2))
        # the bridge adds up
        net = (t["new"] + t["restored"] + t["moved_in"] + t["recoded_in"]
               - t["removed"] - t["moved_out"] - t["recoded_out"])
        self.assertEqual(out["start"]["total"] + net, out["end"]["total"])
        self.assertEqual(out["end"], {"total": 4, "coded": 4})
        # the day series carries the size forward
        self.assertEqual(out["days"][0]["total"], 6)
        self.assertEqual(out["days"][-1]["total"], 4)
        self.assertEqual(len(out["days"]), 7)
        # lifelines: S3 lived until the day before it left, S8 from its day on
        self.assertEqual(out["lives"]["S3"], [["2026-10-03", "2026-10-04"]])
        self.assertEqual(out["lives"]["S8"], [["2026-10-05", "2026-10-09"]])

    def test_whole_plant_sees_no_move(self):
        segs = {1: [(D(1), [L(7, "S7")]), (D(5), [])],
                2: [(D(1), []), (D(5), [L(7, "S7")])]}
        out = sku_history.build(segs, {1, 2}, D(3), D(9))
        self.assertEqual(out["events"], [])
        one = sku_history.build(segs, {2}, D(3), D(9))
        self.assertEqual([e["kind"] for e in one["events"]], ["moved_in"])

    def test_change_on_the_first_day_counts(self):
        segs = {1: [(D(1), [L(1, "S1")]), (D(3), [L(1, "S1"), L(2, "S2")])]}
        out = sku_history.build(segs, {1}, D(3), D(4))
        self.assertEqual([e["key"] for e in out["events"]], ["S2"])
        self.assertEqual(out["start"]["total"], 1)

    def test_late_first_catalog_arrives_as_new(self):
        segs = sku_history._blank_before([(D(1), [L(1, "S1"), L(2, "S2")])], D(6))
        out = sku_history.build({1: segs}, {1}, D(3), D(9))
        self.assertEqual(out["start"]["total"], 0)
        self.assertEqual(sorted(e["kind"] for e in out["events"]), ["new", "new"])
        self.assertEqual(out["events"][0]["date"], "2026-10-06")


if __name__ == "__main__":
    unittest.main()
