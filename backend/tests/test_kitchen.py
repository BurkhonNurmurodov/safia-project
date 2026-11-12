"""«Oshxona» counts (`services/kitchen.tally`) — no database, no Verifix.

    ./venv/bin/python -m unittest tests.test_kitchen
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta

from app.services import kitchen

TODAY = date(2026, 11, 12)
YDAY = TODAY - timedelta(days=1)
NOW = datetime(2026, 11, 12, 10, 30)


def row(day: date, begin: str, end: str, came: str = "", left: str = "", next_day: bool = False) -> dict:
    """A report row in `verifix_live._person`'s shape (Verifix's own clock spelling)."""
    def at(hm: str, d: date = day) -> str:
        return f"{d:%d.%m.%Y} {hm}:00" if hm else ""
    return {"schedule": "", "days": [{
        "date": f"{day:%d.%m.%Y}", "day_kind": "W", "begin_time": at(begin),
        "end_time": at(end, day + timedelta(days=1) if next_day else day),
        "input_time": at(came), "output_time": at(left)}]}


class TallyTest(unittest.TestCase):
    def test_counts(self):
        report = {
            "1": {TODAY: row(TODAY, "08:00", "17:00", came="07:55")},                  # inside
            "2": {TODAY: row(TODAY, "06:00", "10:00", came="06:01", left="10:05")},    # came and left
            "3": {TODAY: row(TODAY, "20:00", "08:00", next_day=True)},                 # tonight's shift
            "4": {TODAY: row(TODAY, "08:00", "17:00")},                                # did not come
            "5": {YDAY: row(YDAY, "20:00", "11:00", came="19:50", next_day=True)},     # night shift, still in
        }
        directory = {"divs": {"d1": {"name": "Sex"}}, "emps": {"1": {"div": "d1"}, "5": {"div": "d1"}}}
        out = kitchen.tally(NOW, [YDAY, TODAY], report, {}, directory)
        self.assertEqual({k: out[k] for k in ("inside", "night", "came", "left", "not_yet", "absent")},
                         {"inside": 2, "night": 1, "came": 2, "left": 1, "not_yet": 1, "absent": 1})
        self.assertEqual(out["departments"][0], {"name": "Sex", "inside": 2, "night": 1, "came": 1,
                                                 "left": 0, "not_yet": 0, "absent": 0})
        hours = {h["t"]: h["n"] for h in out["hours"]}
        self.assertEqual((hours["00:00"], hours["07:00"], hours["08:00"], hours["10:00"]), (1, 2, 3, 3))
        # The hours ahead follow the schedules: 1 stays to 17:00, 5 goes at 11:00, 3 comes at 20:00.
        self.assertEqual((hours["11:00"], hours["16:00"], hours["17:00"], hours["19:00"], hours["20:00"],
                          hours["23:00"]), (1, 1, 0, 0, 1, 1))
        self.assertEqual([h["plan"] for h in out["hours"]], [False] * 11 + [True] * 13)

    def test_stored_read_wins(self):
        """The minute job's entry (with a door mark out) replaces the report's row."""
        report = {"1": {TODAY: row(TODAY, "06:00", "10:00", came="06:00")}}
        stored = {TODAY: {"1": {"ts": report["1"][TODAY], "m": [["2026-11-12T10:10:00", "O"]]}}}
        out = kitchen.tally(NOW, [TODAY], report, stored, {})
        self.assertEqual((out["inside"], out["left"]), (0, 1))


if __name__ == "__main__":
    unittest.main()
