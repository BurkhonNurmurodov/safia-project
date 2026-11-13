"""«Solved since the month's start» (services/quality_baseline.py) — the pure
half: which records make the starting list, how a record is found again after
the register's wipe-and-reload, and the count per unit."""
import unittest

from app.services import quality_baseline as qb
from app.services.quality_baseline import Rec


def rec(ref, status, desc="hair in the bun", day="2026-11-03", place="Sex 1",
        product="Bun", brigadir="A"):
    return Rec(ref, day, place, product, desc, status, brigadir, None)


class PickOpen(unittest.TestCase):
    def test_only_what_is_still_owed(self):
        rows = [rec("1", "open"), rec("2", "waiting"), rec("3", "repeat"),
                rec("4", "done"), rec("5", "not_required"), rec("6", None)]
        self.assertEqual([r for r, _fp in qb.pick_open(rows)], ["1", "2", "3"])

    def test_blank_number_is_no_number(self):
        (ref, fp), = qb.pick_open([rec("  ", "open")])
        self.assertIsNone(ref)
        self.assertEqual(len(fp), 40)


class Fingerprint(unittest.TestCase):
    def test_spacing_and_case_are_not_a_new_record(self):
        a = qb.fingerprint("2026-11-03", "Sex 1", "Bun", "Hair in  the bun")
        b = qb.fingerprint("2026-11-03", " sex 1 ", "bun", "hair in the bun")
        self.assertEqual(a, b)

    def test_another_record_is_another_print(self):
        self.assertNotEqual(qb.fingerprint("2026-11-03", "Sex 1", "Bun", "x"),
                            qb.fingerprint("2026-11-04", "Sex 1", "Bun", "x"))


class Match(unittest.TestCase):
    def test_found_by_number_after_a_status_flip_and_an_edit(self):
        base = qb.pick_open([rec("7", "open")])
        now = [rec("7", "done", desc="hair in the bun (fixed wording)")]
        self.assertEqual([r.status for r in qb.match(base, now)], ["done"])

    def test_found_by_fingerprint_without_a_number(self):
        base = qb.pick_open([rec(None, "open")])
        self.assertEqual([r.status for r in qb.match(base, [rec(None, "done")])], ["done"])

    def test_a_repeated_number_identifies_nobody(self):
        base = qb.pick_open([rec("7", "open", desc="first")])
        now = [rec("7", "done", desc="second"), rec("7", "open", desc="first")]
        self.assertEqual([r.description for r in qb.match(base, now)], ["first"])

    def test_a_deleted_record_leaves_the_count(self):
        base = qb.pick_open([rec("7", "open"), rec("8", "open", desc="other")])
        self.assertEqual(len(qb.match(base, [rec("8", "open", desc="other")])), 1)

    def test_twins_take_two_records_never_one_twice(self):
        base = qb.pick_open([rec(None, "open"), rec(None, "open")])
        self.assertEqual(len(qb.match(base, [rec(None, "done")])), 1)
        self.assertEqual(len(qb.match(base, [rec(None, "done"), rec(None, "open")])), 2)

    def test_a_record_filed_later_is_not_counted(self):
        base = qb.pick_open([rec("7", "open")])
        now = [rec("7", "open"), rec("9", "done", desc="filed after the list")]
        self.assertEqual([r.ref_no for r in qb.match(base, now)], ["7"])

    def test_a_number_wins_over_a_fingerprint_twin(self):
        # Two identical texts; the numbered entry must take the numbered record.
        base = qb.pick_open([rec(None, "open"), rec("7", "open")])
        now = [rec("7", "done"), rec(None, "open")]
        got = qb.match(base, now)
        self.assertEqual(sorted(str(r.ref_no) for r in got), ["7", "None"])


class Fold(unittest.TestCase):
    def test_solved_of_open_at_the_start_per_unit(self):
        rows = [rec("1", "done"), rec("2", "open"), rec("3", "repeat"),
                rec("4", "done", brigadir="B"), rec("5", "not_required"),
                rec("6", "done", brigadir="nobody")]
        unit = {"A": 10, "B": 20}
        got = qb.fold(rows, lambda r: unit.get(r.brigadir))
        self.assertEqual(got, {10: {"done": 1, "total": 3}, 20: {"done": 1, "total": 1}})

    def test_the_day_it_ships_reads_zero_of_all(self):
        rows = [rec(str(i), "open", desc=f"p{i}") for i in range(24)]
        got = qb.fold(qb.match(qb.pick_open(rows), rows), lambda r: 1)
        self.assertEqual(got, {1: {"done": 0, "total": 24}})


class WorkCell(unittest.TestCase):
    """`shift_report.work_cell` — the board's quality figure, solved ÷ had to
    solve. Skipped where the module's own imports are not installed."""

    def setUp(self):
        try:
            from app.services import shift_report
        except Exception as exc:  # noqa: BLE001 — a bare python without the deps
            self.skipTest(f"shift_report not importable: {exc}")
        self.cell = shift_report.work_cell

    def test_solved_since_over_unsolved_plus_solved(self):
        # 183 records all time, 128 solved (70%) → 55 unsolved; 21 solved since.
        got = self.cell({"done": 128, "actionable": 183}, {"done": 21, "actionable": 30})
        self.assertEqual((got["done"], got["total"], got["value"]), (21, 76, 0.2763))
        self.assertIsNone(got["reason"])

    def test_nothing_left_is_a_hundred(self):
        got = self.cell({"done": 40, "actionable": 40}, {"done": 7, "actionable": 7})
        self.assertEqual((got["done"], got["total"], got["value"]), (7, 7, 1.0))

    def test_solving_an_old_record_raises_it(self):
        before = self.cell({"done": 10, "actionable": 20}, {"done": 5, "actionable": 9})
        after = self.cell({"done": 11, "actionable": 20}, {"done": 5, "actionable": 9})
        self.assertGreater(after["value"], before["value"])

    def test_nothing_to_judge_is_blank(self):
        for a, s in ((None, None), ({"done": 12, "actionable": 12}, None),
                     ({"done": 0, "actionable": 0}, {"done": 0, "actionable": 0})):
            got = self.cell(a, s)
            self.assertIsNone(got["value"])
            self.assertEqual(got["reason"], "no_records")


if __name__ == "__main__":
    unittest.main()
