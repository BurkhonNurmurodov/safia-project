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
        self.rf = mock.patch.object(kr, "_refreeze_month", return_value=None)
        self.rf.start()
        self.addCleanup(self.rf.stop)
        self.fm = mock.patch.object(kr, "_foreign_month", return_value=None)
        self.fm.start()
        self.addCleanup(self.fm.stop)
        self.ad = mock.patch.object(kr, "_audit_due", return_value=False)
        self.ad.start()
        self.addCleanup(self.ad.stop)

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

    def test_a_second_open_joins_the_run_under_way(self):
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", return_value=False), \
                mock.patch.object(threading, "Thread") as th:
            first = kr.start(None, month=date(2026, 11, 1), by="a", auto=True)
            second = kr.start(None, month=date(2026, 11, 1), by="b", auto=True)
        self.assertTrue(first["started"])
        self.assertFalse(second["started"])
        self.assertEqual(second["reason"], "running")
        self.assertIsNone(kr._queued)
        th.assert_called_once()

    def test_a_press_during_a_run_is_queued_and_runs_after_it(self):
        self.addCleanup(setattr, kr, "_queued", None)
        with mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_all_fresh", return_value=False), \
                mock.patch.object(threading, "Thread") as th:
            kr.start(None, month=date(2026, 10, 1), by="page", auto=True)
            out = kr.start(None, month=date(2026, 10, 1), by="hr", auto=False)
        self.assertEqual(out["reason"], "queued")
        self.assertEqual(kr._queued[:2], (date(2026, 10, 1), "hr"))
        th.assert_called_once()
        with mock.patch.object(kr, "_quality", return_value={"ok": True}), \
                mock.patch.object(kr, "_audit", return_value={"ok": True}), \
                mock.patch.object(kr, "_read", return_value={"ok": True}), \
                mock.patch.object(kr, "_start_queued") as sq:
            kr._work(None, None, "page", True, None)
        sq.assert_called_once()
        self.assertEqual(sq.call_args.args[:2], (date(2026, 10, 1), "hr"))
        self.assertIsNone(kr._queued)


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
                mock.patch.object(kr, "_audit_due", return_value=False), \
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
                mock.patch.object(kr, "_audit", return_value={"ok": True}), \
                mock.patch.object(kr, "_read", side_effect=[{"ok": True}, {"ok": False, "error": "x"}]):
            kr._work(None, None, "hr", False, lambda: forgot.append(1))
        self.assertIsNone(kr._run)
        self.assertEqual(kr._last["steps"], {"quality": {"ok": True}, "audit": {"ok": True},
                                             "turnover": {"ok": True},
                                             "compliance": {"ok": False, "error": "x"}})
        self.assertIsNotNone(kr._last["finished_at"])
        self.assertEqual(forgot, [1])


class ForeignFreezeTest(unittest.TestCase):
    """A closed month's foreign objects are a frozen copy (2026-11-17)."""
    OCT = date(2026, 10, 1)

    def _pick(self, auto, state="closed", copy=None, m=OCT):
        with mock.patch.object(kr.turnover, "month_state", return_value=(state, None)), \
                mock.patch.object(kr.foreign_objects, "frozen", return_value=copy), \
                mock.patch.object(kr.turnover, "now_aware", return_value=kr.turnover.now_aware().replace(2026, 11, 17)):
            return kr._foreign_month(None, m, auto)

    def test_the_button_takes_a_closed_month_again(self):
        self.assertEqual(self._pick(False, copy=object()), self.OCT)

    def test_opening_takes_only_a_month_without_a_copy(self):
        self.assertEqual(self._pick(True), self.OCT)
        self.assertIsNone(self._pick(True, copy=object()))

    def test_a_month_not_closed_stays_live(self):
        self.assertIsNone(self._pick(False, state="closing"))
        self.assertIsNone(self._pick(False, m=date(2026, 11, 1)))

    def _work(self, quality):
        kr._run = {"started_at": kr._now(), "finished_at": None, "auto": True, "month": "2026-10",
                   "by": "hr", "steps": {"quality": None, "turnover": None, "compliance": None}}
        with mock.patch.object(kr, "_quality", return_value=quality), \
                mock.patch.object(kr, "_audit", return_value={"ok": True}), \
                mock.patch.object(kr, "_read", return_value={"ok": True}), \
                mock.patch.object(kr, "_freeze_foreign", return_value={"frozen": "2026-10"}) as fz:
            kr._work(None, None, "hr", True, None, foreign=self.OCT)
        return fz

    def test_the_copy_is_taken_after_a_good_pull(self):
        fz = self._work({"ok": True})
        fz.assert_called_once_with(self.OCT)
        self.assertEqual(kr._last["steps"]["quality"], {"ok": True, "frozen": "2026-10"})

    def test_a_failed_pull_keeps_the_copy(self):
        self._work({"ok": False, "error": "x"}).assert_not_called()


class RefreezeMonthTest(unittest.TestCase):
    """Which month a run closes again (2026-11-16)."""
    OCT, SEP = date(2026, 10, 1), date(2026, 9, 1)

    def _pick(self, m, auto, frozen, live, state="closed", moved=False):
        row = mock.Mock(rule={"exclude_reasons": frozen})
        with mock.patch.object(kr.turnover, "month_state", return_value=(state, row)), \
                mock.patch.object(kr, "_cells_moved", return_value=moved), \
                mock.patch.object(kr.turnover, "rule", return_value={"exclude_reasons": live}), \
                mock.patch.object(kr.turnover, "now_aware", return_value=kr.turnover.now_aware().replace(2026, 11, 16)):
            return kr._refreeze_month(None, m, auto)

    def test_the_button_always_recloses(self):
        self.assertEqual(self._pick(self.OCT, False, ["A"], ["A"]), self.OCT)

    def test_opening_recloses_when_the_list_moved(self):
        self.assertEqual(self._pick(self.OCT, True, ["A"], ["A", "Учёба"]), self.OCT)

    def test_opening_leaves_an_unchanged_month(self):
        self.assertIsNone(self._pick(self.OCT, True, ["A", "Учёба"], [" учёба", "a"]))

    def test_opening_recloses_when_a_leaver_changed_cell(self):
        self.assertEqual(self._pick(self.OCT, True, ["A"], ["A"], moved=True), self.OCT)

    def test_cells_moved_compares_frozen_and_live_cells(self):
        p = {"staff_id": "55976", "employee_id": "e1", "dismissed": date(2026, 10, 22)}
        with mock.patch.object(kr.turnover, "_frozen", return_value=[{**p, "code": "8611"}]), \
                mock.patch.object(kr.turnover, "live_leavers", return_value=[{**p, "code": "9429"}]):
            self.assertTrue(kr._cells_moved(None, self.OCT))
        with mock.patch.object(kr.turnover, "_frozen", return_value=[{**p, "code": "9429"}]), \
                mock.patch.object(kr.turnover, "live_leavers", return_value=[{**p, "code": "9429"}]):
            self.assertFalse(kr._cells_moved(None, self.OCT))

    def test_opening_never_moves_a_month_before_the_kpi(self):
        self.assertIsNone(self._pick(self.SEP, True, [], ["Учёба"]))

    def test_an_open_month_is_never_reclosed(self):
        self.assertIsNone(self._pick(self.OCT, True, ["A"], ["B"], state="closing"))

    def test_a_moved_month_runs_even_when_fresh(self):
        kr._run = None
        self.addCleanup(setattr, kr, "_run", None)
        with mock.patch.object(kr, "status", return_value={}), \
                mock.patch.object(kr, "_past_compute", return_value=None), \
                mock.patch.object(kr, "_refreeze_month", return_value=self.OCT), \
                mock.patch.object(kr, "_foreign_month", return_value=None), \
                mock.patch.object(kr, "_audit_due", return_value=False), \
                mock.patch.object(kr, "_all_fresh", return_value=True), \
                mock.patch.object(threading, "Thread") as th:
            out = kr.start(None, month=self.OCT, by="hr", auto=True)
        self.assertTrue(out["started"])
        self.assertEqual(th.call_args.kwargs["args"][1], self.OCT)


if __name__ == "__main__":
    unittest.main()
