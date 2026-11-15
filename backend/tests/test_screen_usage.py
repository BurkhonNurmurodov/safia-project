"""A ping's screen tally is the client's word: clamped, merged, capped."""
import unittest

from app.routers.activity import (
    SCREEN_MAX_OPENS, SCREEN_MAX_SECONDS, SCREEN_MAX_TOTAL, ScreenTally, screen_rows,
)


def T(s, sec=0, n=0):
    return ScreenTally(s=s, sec=sec, n=n)


class ScreenRows(unittest.TestCase):
    def test_nothing(self):
        self.assertEqual(screen_rows(None), {})
        self.assertEqual(screen_rows([]), {})

    def test_paths_only(self):
        self.assertEqual(screen_rows([T("zagruzka", 30, 1), T("/" + "x" * 200, 5, 1), T(" /tasks ", 12.7, 1)]),
                         {"/tasks": (12, 1)})

    def test_empty_rows_dropped(self):
        self.assertEqual(screen_rows([T("/a", 0, 0), T("/b", -5, -1)]), {})

    def test_clamped_and_merged(self):
        rows = screen_rows([T("/a", 10_000, 999), T("/a", 10, 1)])
        self.assertEqual(rows["/a"][1], SCREEN_MAX_OPENS)
        self.assertEqual(rows["/a"][0], SCREEN_MAX_SECONDS + 10)

    def test_total_capped(self):
        rows = screen_rows([T(f"/p{i}", SCREEN_MAX_SECONDS) for i in range(10)])
        self.assertEqual(sum(sec for sec, _ in rows.values()), SCREEN_MAX_TOTAL)

    def test_open_without_time_counts(self):
        self.assertEqual(screen_rows([T("/a", 0, 1)]), {"/a": (0, 1)})


if __name__ == "__main__":
    unittest.main()
