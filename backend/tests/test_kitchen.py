"""«Oshxona» counts (`services/kitchen.tally`) — no database, no Verifix.

    ./venv/bin/python -m unittest tests.test_kitchen
"""
from __future__ import annotations

import unittest
from datetime import date, datetime, timedelta

from app.services import kitchen, kitchen_forecast

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

    def test_a_past_day_is_all_clocks(self):
        """Yesterday picked: every hour from the clocks, nothing forecast."""
        before = YDAY - timedelta(days=1)
        report = {"1": {YDAY: row(YDAY, "08:00", "17:00", came="07:55", left="17:05")},
                  "2": {YDAY: row(YDAY, "08:00", "17:00")}}
        report["2"][YDAY]["div"] = "d9"                    # gone from the directory: the report's own division
        out = kitchen.tally(NOW, [before, YDAY], report, {}, {"divs": {"d9": {"name": "Ombor"}}})
        self.assertEqual((out["came"], out["left"], out["absent"], out["inside"]), (1, 1, 1, 0))
        self.assertEqual({r["name"] for r in out["departments"]}, {"", "Ombor"})
        self.assertFalse(any(h["plan"] for h in out["hours"]))
        hours = {h["t"]: h["n"] for h in out["hours"]}
        self.assertEqual((hours["07:00"], hours["08:00"], hours["17:00"], hours["18:00"]), (0, 1, 1, 0))

    def test_tomorrow_is_all_forecast(self):
        """Tomorrow picked: 24 forecast hours; tonight's shift fills its morning,
        and nobody in the building today counts as «inside»."""
        tmrw = TODAY + timedelta(days=1)
        report = {"1": {TODAY: row(TODAY, "08:00", "17:00", came="07:55")},              # in now, not tomorrow
                  "2": {TODAY: row(TODAY, "20:00", "08:00", next_day=True)},             # tonight
                  "3": {tmrw: row(tmrw, "08:00", "17:00")}}                              # tomorrow's day shift
        out = kitchen.tally(NOW, [TODAY, tmrw], report, {}, {})
        self.assertEqual((out["inside"], out["night"], out["not_yet"]), (0, 0, 1))
        self.assertTrue(all(h["plan"] for h in out["hours"]))
        hours = {h["t"]: h["n"] for h in out["hours"]}
        self.assertEqual((hours["00:00"], hours["07:00"], hours["08:00"], hours["16:00"], hours["17:00"]),
                         (1, 1, 1, 1, 0))

    def test_stored_read_wins(self):
        """The minute job's entry (with a door mark out) replaces the report's row."""
        report = {"1": {TODAY: row(TODAY, "06:00", "10:00", came="06:00")}}
        stored = {TODAY: {"1": {"ts": report["1"][TODAY], "m": [["2026-11-12T10:10:00", "O"]]}}}
        out = kitchen.tally(NOW, [TODAY], report, stored, {})
        self.assertEqual((out["inside"], out["left"]), (0, 1))


class _NoRows:
    """A session whose database keeps nothing (`kitchen._kept` asks it)."""
    def query(self, *a): return self
    def filter(self, *a): return self
    def __iter__(self): return iter(())
    def rollback(self): pass


class OtherDayTest(unittest.TestCase):
    def test_a_week_read_counts_each_day_as_its_own_read(self):
        """One wide read sliced per day = what a two-day read of that day counts."""
        span = [TODAY - timedelta(days=i) for i in range(8, -1, -1)]
        wide = {str(i): {d: row(d, "20:00", "08:00", came="19:50" if (i + d.day) % 3 else "",
                                left="08:05" if i % 2 else "", next_day=True)
                         for d in span if (i * d.day) % 4} for i in range(40)}
        for t in span[1:]:
            days = [t - timedelta(days=1), t]
            narrow = {e: {d: r for d, r in rows.items() if d in days} for e, rows in wide.items()}
            narrow = {e: r for e, r in narrow.items() if r}
            self.assertEqual(kitchen.tally(NOW, days, kitchen._slice(wide, days), {}, {}),
                             kitchen.tally(NOW, days, narrow, {}, {}))

    def test_stepping_back_reads_verifix_once_a_week(self):
        reads = []

        def build(db, cfg, targets):
            reads.append(sorted(targets))
            return {d: {"configured": True, "came": d.day} for d in targets}, 1
        saved = (kitchen._build_days, kitchen._store, kitchen.verifix.config,
                 kitchen.verifix_live._configured, kitchen.verifix_live.now_local)
        kitchen._build_days, kitchen._store = build, lambda *a: None
        kitchen.verifix.config = lambda *a, **k: {}
        kitchen.verifix_live._configured = lambda cfg: True
        kitchen.verifix_live.now_local = lambda: NOW
        kitchen._days.clear()
        try:
            day = TODAY - timedelta(days=3)
            got = [kitchen.other_day(_NoRows(), day - timedelta(days=i))["came"] for i in range(7)]
        finally:
            (kitchen._build_days, kitchen._store, kitchen.verifix.config,
             kitchen.verifix_live._configured, kitchen.verifix_live.now_local) = saved
            kitchen._days.clear()
        self.assertEqual(got, [(day - timedelta(days=i)).day for i in range(7)])
        self.assertEqual(reads, [[day - timedelta(days=i) for i in range(6, -1, -1)]])


class ForecastTest(unittest.TestCase):
    """The hours ahead learned from `kitchen_history` (`services/kitchen_forecast`)."""

    def test_learned_turnout_timing_and_the_day(self):
        rows = []
        for i in range(2, 2 + kitchen_forecast.LOOKBACK):
            d = TODAY - timedelta(days=i)
            # Evenings: half the 100 come at 17:00 and leave an hour past 02:00. Mornings: all come.
            rows += [(d, "17:00", "02:00", 100, 50, 0, {"1020": 50}, {"1620": 50}),
                     (d, "06:00", "15:00", 100, 100, 0, {"360": 100}, {"900": 100}),
                     (d, "", "", 0, 0, 0, {}, {})]
        model = kitchen_forecast.learn(rows, TODAY)
        evening = {(TODAY, "17:00", "02:00"): [100, 0, 0]}
        ahead = kitchen_forecast.expect(NOW, evening, model)
        self.assertEqual((round(ahead[16]), round(ahead[17]), round(ahead[18]), round(ahead[23])), (0, 0, 50, 50))
        # Only 50 of the morning's usual 100 came today: the evening is expected lower too.
        ahead = kitchen_forecast.expect(NOW, {**evening, (TODAY, "06:00", "15:00"): [100, 50, 50]}, model)
        self.assertAlmostEqual(ahead[18], 40, delta=1)
        self.assertEqual((round(ahead[15]), round(ahead[16])), (50, 0))   # the morning's 50 leave at 15:00–15:10

    def test_eids_calculated_as_decreed(self):
        """Every decree of 2024–2026 (president.uz), Qurbon hayit 2025 on the 6th."""
        self.assertEqual(kitchen_forecast.calculated(range(2024, 2027)), {
            "ramazon": [date(2024, 4, 10), date(2025, 3, 30), date(2026, 3, 20)],
            "qurbon": [date(2024, 6, 16), date(2025, 6, 6), date(2026, 5, 27)]})

    def test_the_decree_names_the_day(self):
        read = kitchen_forecast.parse_decree
        y2025 = "<p>1. 2025-yilda muborak Qurbon hayitining birinchi kuni 6-iyun – juma kuniga to‘g‘ri</p>"
        y2026 = "<p>1. Joriy yilda Ramazon hayitining birinchi kuni 20-mart - juma kuniga to‘g‘ri</p>"
        self.assertEqual(read(y2025, "qurbon", date(2025, 6, 7)), date(2025, 6, 6))
        self.assertEqual(read(y2026, "ramazon", date(2026, 3, 20)), date(2026, 3, 20))
        self.assertIsNone(read(y2026, "ramazon", date(2026, 4, 10)))    # too far from the calculation
        self.assertIsNone(read(y2026, "qurbon", date(2026, 3, 20)))     # the other Eid's decree

    def test_a_holiday_comes_in_as_it_did_last_year(self):
        eid_then = date(2025, 11, 2)                 # 20 of the usual 80 came
        rows, d = [], eid_then - timedelta(days=120)
        while d <= TODAY - timedelta(days=2):
            n = 20 if d == eid_then else 80
            rows.append((d, "08:00", "17:00", 100, n, 0, {"470": n}, {"1020": n}))
            d += timedelta(days=1)
        model = kitchen_forecast.learn(rows, TODAY)
        # The calendar lists last year's Eid a day late; the plant says when it was.
        eids = {"qurbon": [eid_then + timedelta(days=1), TODAY]}
        model["hol"] = kitchen_forecast.holidays(lambda a, b: [r for r in rows if a <= r[0] <= b], TODAY, eids)
        self.assertAlmostEqual(model["hol"][TODAY][0], 0.25, places=2)
        morning = {(TODAY, "08:00", "17:00"): [100, 0, 0]}
        six = datetime(2026, 11, 12, 6, 0)
        self.assertAlmostEqual(kitchen_forecast.expect(six, morning, model)[12], 20, delta=1)
        model["hol"] = kitchen_forecast.holidays(lambda a, b: [r for r in rows if a <= r[0] <= b], TODAY, {})
        self.assertAlmostEqual(kitchen_forecast.expect(six, morning, model)[12], 80, delta=1)


if __name__ == "__main__":
    unittest.main()
