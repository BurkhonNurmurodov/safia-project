"""A leaver counts against the cell they worked in LONGEST in the month they
left (`turnover.home_cell`, the operator, 2026-11-16 — Norboyev, 9429 → 8611)."""
import unittest
from datetime import date

from app.services.turnover import home_cell

D = date


class HomeCellTest(unittest.TestCase):
    def test_moved_three_days_before_leaving_counts_in_the_old_cell(self):
        moves = [(D(2026, 10, 19), "8611", "8611 Кухня горячая"), (D(2026, 6, 15), "9429", "9429 Цех Выпекания")]
        self.assertEqual(home_cell(moves, D(2026, 10, 22))[0], "9429")

    def test_moved_early_in_the_month_counts_in_the_new_cell(self):
        moves = [(D(2026, 6, 15), "9429", None), (D(2026, 10, 5), "8611", None)]
        self.assertEqual(home_cell(moves, D(2026, 10, 30))[0], "8611")

    def test_never_moved_keeps_the_cell(self):
        self.assertEqual(home_cell([(D(2026, 3, 1), "7222", None)], D(2026, 10, 12))[0], "7222")

    def test_a_tie_goes_to_the_later_cell(self):
        moves = [(D(2026, 9, 1), "1111", None), (D(2026, 10, 11), "2222", None)]
        self.assertEqual(home_cell(moves, D(2026, 10, 21))[0], "2222")

    def test_a_unit_that_is_no_cell_is_skipped(self):
        moves = [(D(2026, 9, 1), "1111", None), (D(2026, 10, 25), None, "Офис")]
        self.assertEqual(home_cell(moves, D(2026, 10, 28))[0], "1111")

    def test_no_journal_lines_answer_none(self):
        self.assertIsNone(home_cell([], D(2026, 10, 22)))
        self.assertIsNone(home_cell([(D(2026, 10, 22), "8611", None)], D(2026, 10, 22)))


if __name__ == "__main__":
    unittest.main()
