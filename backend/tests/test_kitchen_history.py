"""«Oshxona» history (`services/kitchen_history`) — no database, no Verifix.

    ./venv/bin/python -m unittest tests.test_kitchen_history
"""
from __future__ import annotations

import unittest
from datetime import date, timedelta

from app.services import kitchen_history as kh

D = date(2026, 11, 10)


def day(d: date, kind="W", begin="", end="", came="", left="") -> dict:
    return {"date": f"{d:%d.%m.%Y}", "day_kind": kind, "begin_time": begin, "end_time": end,
            "input_time": came, "output_time": left}


class FoldTest(unittest.TestCase):
    def test_counts_per_shift_window(self):
        rows = [
            {"days": [day(D, begin="10.11.2026 08:00:00", end="10.11.2026 17:00:00",
                          came="10.11.2026 07:52:10", left="10.11.2026 17:08:00")]},
            {"days": [day(D, begin="10.11.2026 08:00:00", end="10.11.2026 17:00:00")]},          # did not come
            {"days": [day(D, begin="10.11.2026 20:00:00", end="11.11.2026 08:00:00",
                          came="10.11.2026 19:47:00", left="11.11.2026 08:12:00")]},              # a night
            {"schedule_name": "08-00 до 20-00", "days": [day(D, came="10.11.2026 08:03:00")]},   # hours from the name
            {"days": [day(D, kind="R", came="10.11.2026 09:15:00", left="10.11.2026 13:00:00")]},  # came on a day off
            {"days": [day(D, kind="R")]},                                                         # off, and off
            {"days": [day(D + timedelta(days=9), begin="19.11.2026 08:00:00", end="19.11.2026 17:00:00")]},
        ]
        acc = kh.fold({}, rows, D, D)
        self.assertEqual(set(acc), {(D, "08:00", "17:00"), (D, "20:00", "08:00"), (D, "08:00", "20:00"), (D, "", "")})
        s = acc[(D, "08:00", "17:00")]
        self.assertEqual((s["planned"], s["came"], s["no_out"]), (2, 1, 0))
        self.assertEqual((dict(s["arr"]), dict(s["dep"])), ({"470": 1}, {"1020": 1}))
        night = acc[(D, "20:00", "08:00")]
        self.assertEqual((dict(night["arr"]), dict(night["dep"])), ({"1180": 1}, {"1930": 1}))
        self.assertEqual(acc[(D, "08:00", "20:00")]["no_out"], 1)
        off = acc[(D, "", "")]
        self.assertEqual((off["planned"], off["came"]), (0, 1))

    def test_missing_walks_back_a_week_at_a_time(self):
        today = date(2026, 11, 12)
        self.assertEqual(kh.missing(set(), today), (date(2026, 11, 4), date(2026, 11, 10)))
        have = {date(2026, 11, 10), date(2026, 11, 9), date(2026, 11, 7)}
        self.assertEqual(kh.missing(have, today), (date(2026, 11, 8), date(2026, 11, 8)))
        year = {today - timedelta(days=i) for i in range(kh.LAG_DAYS, kh.LAG_DAYS + kh.DAYS)}
        self.assertIsNone(kh.missing(year, today))


if __name__ == "__main__":
    unittest.main()
