"""The brigadir's day-close clock (`services/close_window`, 2026-10-22).

The operator's rule: a supervisor closes an S1 day only from 12:00 and an S2
day only from 23:00, on the date the day is filed under; admins are never
held. No database — the two settings readers and the unit lookup are stubbed.

    ./venv/bin/python -m unittest tests.test_close_window
"""
from __future__ import annotations

import unittest
from datetime import date, datetime
from types import SimpleNamespace
from unittest import mock

from app.services import close_window
from app.services.verifix import TZ

D = date(2026, 10, 22)
SUP = {"role": "supervisor", "role_id": 7}
ADMIN = {"role": "admin"}


def at(day: date, hm: str) -> datetime:
    h, m = map(int, hm.split(":"))
    return datetime(day.year, day.month, day.day, h, m, tzinfo=TZ)


class _DB:
    """`db.query(Manager).filter(...).first()` → the unit, nothing else."""

    def __init__(self, shift):
        self.unit = SimpleNamespace(id=7, shift=shift)

    def query(self, _model):
        return self

    def filter(self, *_a, **_k):
        return self

    def first(self):
        return self.unit


class CloseWindowTest(unittest.TestCase):
    def setUp(self):
        self.clocks = {1: "12:00", 2: "23:00"}
        self.hours = {1: ("08:00", "20:00"), 2: ("20:00", "08:00")}
        p1 = mock.patch.object(close_window, "defaults", lambda db: dict(self.clocks))
        p2 = mock.patch.object(close_window.cell_hours, "defaults", lambda db: dict(self.hours))
        p1.start(); p2.start()
        self.addCleanup(p1.stop); self.addCleanup(p2.stop)

    def test_the_operators_two_examples(self):
        self.assertEqual(close_window.opens_at(None, 1, D), at(D, "12:00"))
        self.assertEqual(close_window.opens_at(None, 2, D), at(D, "23:00"))

    def test_a_unit_with_no_shift_is_shift_1(self):
        self.assertEqual(close_window.opens_at(None, None, D), at(D, "12:00"))

    def test_a_clock_before_the_shift_start_is_the_next_morning(self):
        self.clocks[2] = "01:00"
        self.assertEqual(close_window.opens_at(None, 2, D), at(date(2026, 10, 23), "01:00"))

    def test_supervisor_is_locked_until_the_clock(self):
        db = _DB(shift=1)
        lk = close_window.lock(db, SUP, 7, D, now=at(D, "11:59"))
        self.assertEqual(lk["close_from"], "12:00")
        self.assertIsNone(lk["opens_on"])
        self.assertEqual(lk["opens_in_s"], 61)
        self.assertIsNone(close_window.lock(db, SUP, 7, D, now=at(D, "12:00")))

    def test_s2_is_locked_on_its_evening_until_23(self):
        db = _DB(shift=2)
        self.assertIsNotNone(close_window.lock(db, SUP, 7, D, now=at(D, "22:30")))
        self.assertIsNone(close_window.lock(db, SUP, 7, D, now=at(D, "23:00")))
        # The next morning (still shift-day D) it is long open.
        self.assertIsNone(close_window.lock(db, SUP, 7, D, now=at(date(2026, 10, 23), "07:00")))

    def test_a_past_day_is_never_locked(self):
        self.assertIsNone(close_window.lock(_DB(shift=1), SUP, 7, date(2026, 10, 21), now=at(D, "09:00")))

    def test_admins_and_other_roles_are_never_held(self):
        db = _DB(shift=1)
        self.assertIsNone(close_window.lock(db, ADMIN, 7, D, now=at(D, "09:00")))
        self.assertIsNone(close_window.lock(db, {"role": "shift-manager"}, 7, D, now=at(D, "09:00")))

    def test_refusal_text(self):
        self.assertEqual(close_window.refusal({"close_from": "12:00", "opens_on": None}),
                         "Kunni soat 12:00 dan keyin yopish mumkin.")
        self.assertEqual(close_window.refusal({"close_from": "01:00", "opens_on": "2026-10-23"}),
                         "Kunni 23.10.2026 soat 01:00 dan keyin yopish mumkin.")


if __name__ == "__main__":
    unittest.main()
