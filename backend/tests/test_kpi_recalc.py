"""«Qayta hisoblash» — the one run that brings «Liderlar KPI»'s sources up to
date (services/kpi_recalc.py, 2026-11-11). No database: the reads and the
freshness check are stood in for."""
import threading
import unittest
from datetime import date
from unittest import mock

from app.services import kpi_recalc as kr


class ReadStepTest(unittest.TestCase):
    def test_a_read_that_runs_reports_its_outcome(self):
        out = kr._read(lambda *a: {"started": True, "ok": False, "error": "timeout"}, None, "recalc:x")
        self.assertEqual(out, {"ok": False, "error": "timeout"})

    def test_not_configured_is_a_failure_not_a_join(self):
        out = kr._read(lambda *a: {"started": False, "reason": "not_configured"}, None, "recalc:x")
        self.assertEqual(out, {"ok": False, "error": "not_configured"})

    def test_a_read_already_running_is_waited_for_not_doubled(self):
        calls = []

        def run(*a):
            calls.append(a)
            return {"started": False, "reason": "busy"}

        with mock.patch.object(kr, "_wait_for") as wait:
            out = kr._read(run, "running_fn", "recalc:x", None, None)
        wait.assert_called_once_with("running_fn")
        self.assertEqual(out, {"ok": True, "joined": True})
        self.assertEqual(len(calls), 1)

    def test_a_past_month_to_compute_runs_after_the_other_read(self):
        answers = iter([{"started": False, "reason": "busy"}, {"started": True, "ok": True}])
        with mock.patch.object(kr, "_wait_for"):
            out = kr._read(lambda *a: next(answers), "running_fn", "compute:2025-03", date(2025, 3, 1), "x")
        self.assertEqual(out, {"ok": True, "error": None})


class StartTest(unittest.TestCase):
    def setUp(self):
        kr._run = None
        self.addCleanup(setattr, kr, "_run", None)
        self.status = mock.patch.object(kr, "status", return_value={"running": False})
        self.status.start()
        self.addCleanup(self.status.stop)

    def test_auto_skips_when_every_source_is_fresh(self):
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", return_value=True), \
                mock.patch.object(threading, "Thread") as th:
            out = kr.start(None, month=date(2026, 11, 1), by="hr", auto=True)
        self.assertFalse(out["started"])
        self.assertEqual(out["reason"], "fresh")
        th.assert_not_called()

    def test_the_button_runs_even_when_fresh(self):
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", return_value=True), \
                mock.patch.object(threading, "Thread") as th:
            out = kr.start(None, month=date(2026, 11, 1), by="hr", auto=False)
        self.assertTrue(out["started"])
        th.assert_called_once()

    def test_auto_runs_for_a_past_month_never_computed(self):
        with mock.patch.object(kr, "_past_compute", return_value=date(2025, 3, 1)), \
                mock.patch.object(kr, "_all_fresh", return_value=True), \
                mock.patch.object(threading, "Thread") as th:
            out = kr.start(None, month=date(2025, 3, 1), by="hr", auto=True)
        self.assertTrue(out["started"])
        th.assert_called_once()

    def test_a_second_start_joins_the_run_under_way(self):
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", return_value=False), \
                mock.patch.object(threading, "Thread") as th:
            first = kr.start(None, month=date(2026, 11, 1), by="a", auto=False)
            second = kr.start(None, month=date(2026, 11, 1), by="b", auto=False)
        self.assertTrue(first["started"])
        self.assertFalse(second["started"])
        self.assertEqual(second["reason"], "running")
        th.assert_called_once()


class RaceTest(unittest.TestCase):
    """Two pages opening at once: the second start finds the first one's run
    only once it holds the lock. It must answer, not wait on itself."""

    def setUp(self):
        kr._run = None
        self.addCleanup(setattr, kr, "_run", None)

    def test_losing_the_race_answers_instead_of_deadlocking(self):
        def other_page_wins(db, now):
            kr._run = {"started_at": kr._now(), "finished_at": None, "auto": True, "month": "2026-11",
                       "by": "other", "steps": {"quality": None, "turnover": None, "compliance": None}}
            return False

        out = {}
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", side_effect=other_page_wins), \
                mock.patch.object(kr.turnover_sync, "running", return_value=False), \
                mock.patch.object(kr.category_sync, "running", return_value=False), \
                mock.patch.object(threading, "Thread", wraps=threading.Thread) as th:
            t = threading.Thread(target=lambda: out.update(kr.start(None, month=date(2026, 11, 1), by="me", auto=True)))
            t.start()
            t.join(timeout=3)
        self.assertFalse(t.is_alive(), "start() deadlocked on its own lock")
        self.assertFalse(out["started"])
        self.assertEqual(out["reason"], "running")
        self.assertTrue(out["running"])
        self.assertEqual(th.call_count, 1)    # only the test's own thread


class WorkTest(unittest.TestCase):
    def test_a_run_records_every_step_and_forgets_the_board(self):
        kr._run = {"started_at": kr._now(), "finished_at": None, "auto": False, "month": "2026-11",
                   "by": "hr", "steps": {"quality": None, "turnover": None, "compliance": None}}
        forgot = []
        with mock.patch.object(kr, "_quality", return_value={"ok": True}), \
                mock.patch.object(kr, "_read", side_effect=[{"ok": True}, {"ok": False, "error": "x"}]):
            kr._work(None, "hr", False, lambda: forgot.append(1))
        self.assertIsNone(kr._run)
        self.assertEqual(kr._last["steps"], {"quality": {"ok": True}, "turnover": {"ok": True},
                                             "compliance": {"ok": False, "error": "x"}})
        self.assertIsNotNone(kr._last["finished_at"])
        self.assertEqual(forgot, [1])


if __name__ == "__main__":
    unittest.main()
