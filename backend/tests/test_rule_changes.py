"""Dated admin edits of a task's hours (`leader_rule_eras.levels`, 2026-11-13).

A window / deadline / date-rule write counts from the day the admin picked; a
day before it reads the value the write replaced. No database — the loaded
history is built by hand.

    ./venv/bin/python -m unittest tests.test_rule_changes
"""
from __future__ import annotations

import unittest
from types import SimpleNamespace

from app.services import leader_rule_eras as lre


def loaded(changes: dict) -> lre.Loaded:
    out = lre.Loaded()
    out.changes = changes
    return out


class RuleChanges(unittest.TestCase):
    def test_leader_window_dated(self):
        own = SimpleNamespace(leader_id=5, win_from="09:00", win_to="11:00", criteria="c")
        td = SimpleNamespace(win_from=None, win_to=None)
        eras = loaded({("leader", 5, 3): {"win_from": [("2026-11-10", "08:00")],
                                          "win_to": [("2026-11-10", "10:00")]}})
        o, _, _ = lre.levels(eras, 3, 1, 1, "2026-11-09", own, None, td, leader_id=5)
        self.assertEqual((o.win_from, o.win_to, o.criteria), ("08:00", "10:00", "c"))
        o, _, _ = lre.levels(eras, 3, 1, 1, "2026-11-10", own, None, td, leader_id=5)
        self.assertIs(o, own)                       # the picked day itself is new

    def test_newest_write_wins_from_its_day(self):
        # A (from 10th, X→Y) written first, then B (from 5th, Y→Z): newest first.
        row = SimpleNamespace(manager_id=1, deadline="Z")
        eras = loaded({("unit", 1, 3): {"deadline": [("2026-11-05", "Y"),
                                                    ("2026-11-10", "X")]}})
        at = lambda d: lre.levels(eras, 3, 1, 1, d, None, row, None)[1].deadline
        self.assertEqual([at("2026-11-03"), at("2026-11-07"), at("2026-11-12")],
                         ["X", "Z", "Z"])

    def test_row_gone_now_but_set_then(self):
        eras = loaded({("leader", 5, 3): {"deadline": [("2026-11-10", "02:00")]}})
        o, _, _ = lre.levels(eras, 3, None, 2, "2026-11-01", None, None, None, leader_id=5)
        self.assertEqual(o.deadline, "02:00")
        self.assertIsNone(o.win_from)

    def test_empty_history_and_no_day_pass_through(self):
        own = SimpleNamespace(leader_id=5, win_from="09:00")
        self.assertIs(lre.levels(loaded({}), 3, 1, 1, "2026-11-01", own, None, None)[0], own)
        eras = loaded({("leader", 5, 3): {"win_from": [("2026-11-10", "08:00")]}})
        self.assertIs(lre.levels(eras, 3, 1, 1, None, own, None, None)[0], own)


if __name__ == "__main__":
    unittest.main()
