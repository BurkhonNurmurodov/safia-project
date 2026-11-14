"""The tasks set from above, read for one day (services/task_day.py), the tier
a top-manager sets for a shift manager, and the first day all of it waits for
(`task_board.OPEN_FROM`)."""
import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

from app.routers import brigadir_tasks as bt, shift_manager_tasks as smt
from app.services import task_board as tb, task_day

DAY = date(2026, 11, 14)


def d(k: int) -> date:
    return DAY + timedelta(days=k)


def noon(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, 12, tzinfo=tb.TZ)


def task(status="todo", created=-3, due=2, done=None, **kw):
    """A task as the fold reads it; offsets are days from DAY."""
    return SimpleNamespace(
        status=status, created_at=noon(d(created)), due_date=d(due),
        completed_at=noon(d(done)) if done is not None else None, **kw)


class StateOnADay(unittest.TestCase):
    def state(self, t, day=DAY):
        got = task_day.state_on(t, day)
        return got and got["state"]

    def test_a_task_set_later_has_not_arrived(self):
        self.assertIsNone(task_day.state_on(task(created=1), DAY))

    def test_a_task_finished_earlier_has_left(self):
        self.assertIsNone(task_day.state_on(task("done", done=-1), DAY))

    def test_finished_that_day_in_time(self):
        got = task_day.state_on(task("done", done=0, due=0), DAY)
        self.assertEqual((got["state"], got["late"], got["days_late"]), ("done", False, 0))

    def test_finished_that_day_after_the_deadline_is_done_late(self):
        got = task_day.state_on(task("done", done=0, due=-2), DAY)
        self.assertEqual((got["state"], got["late"], got["days_late"]), ("done", True, 2))

    def test_open_past_its_date_is_overdue_by_the_days_between(self):
        got = task_day.state_on(task("doing", due=-4), DAY)
        self.assertEqual((got["state"], got["days_late"]), ("overdue", 4))

    def test_due_that_very_day_is_still_in_time(self):
        self.assertEqual(self.state(task("todo", due=0)), "todo")
        self.assertEqual(self.state(task("doing", due=0)), "doing")

    def test_a_task_finished_on_a_later_day_was_open_and_under_way(self):
        # Looking back at DAY: closed two days after it, deadline still ahead.
        self.assertEqual(self.state(task("done", done=2, due=3)), "doing")
        # …and overdue on DAY when its date had already passed.
        self.assertEqual(self.state(task("done", done=2, due=-1)), "overdue")

    def test_a_done_task_with_no_completion_day_belongs_to_no_day(self):
        self.assertIsNone(task_day.state_on(task("done"), DAY))

    def test_the_day_is_tashkents(self):
        # 20:30 UTC on the 13th is 01:30 on the 14th in Tashkent.
        late_utc = datetime(2026, 11, 13, 20, 30, tzinfo=timezone.utc)
        self.assertEqual(task_day.local_day(late_utc), DAY)
        self.assertEqual(task_day.local_day(late_utc.replace(tzinfo=None)), DAY)
        t = task("done", due=0)
        t.completed_at = late_utc
        self.assertEqual(self.state(t), "done")
        self.assertIsNone(task_day.state_on(t, d(1)))


def entry(kind, pid, name, state, days_late=0, tid=1, **kw):
    return ({"kind": kind, "id": pid, "name": name},
            {"id": tid, "state": state, "days_late": days_late, **kw})


class Fold(unittest.TestCase):
    def test_people_are_listed_worst_first(self):
        out = task_day.fold([
            entry("supervisor", 1, "Done", "done", tid=1),
            entry("supervisor", 2, "Going", "doing", tid=2),
            entry("supervisor", 3, "Late once", "overdue", 2, tid=3),
            entry("supervisor", 4, "Late twice", "overdue", 1, tid=4),
            entry("supervisor", 4, "Late twice", "overdue", 1, tid=5),
            entry("supervisor", 5, "Late longest", "overdue", 9, tid=6),
        ])
        self.assertEqual([p["name"] for p in out["people"]],
                         ["Late twice", "Late longest", "Late once", "Going", "Done"])
        self.assertEqual([p["tone"] for p in out["people"]],
                         ["late", "late", "late", "going", "done"])

    def test_the_four_states_add_up_to_the_total(self):
        out = task_day.fold([
            entry("supervisor", 1, "A", "done", tid=1),
            entry("supervisor", 1, "A", "todo", tid=2),
            entry("supervisor", 1, "A", "doing", tid=3),
            entry("leader", 1, "B", "overdue", 3, tid=4),
        ])
        t = out["totals"]
        self.assertEqual((t["done"], t["todo"], t["doing"], t["overdue"], t["total"]),
                         (1, 1, 1, 1, 4))
        self.assertEqual((t["people"], t["people_late"]), (2, 1))
        a = next(p for p in out["people"] if p["name"] == "A")
        self.assertEqual(sum(a[s] for s in task_day.STATES), a["total"])

    def test_a_brigadir_and_a_leader_with_one_id_are_two_people(self):
        out = task_day.fold([
            entry("supervisor", 7, "Unit", "todo", tid=1),
            entry("leader", 7, "Leader", "todo", tid=2),
        ])
        self.assertEqual({p["key"] for p in out["people"]}, {"supervisor:7", "leader:7"})

    def test_a_persons_tasks_put_the_longest_late_on_top(self):
        out = task_day.fold([
            entry("supervisor", 1, "A", "done", tid=1),
            entry("supervisor", 1, "A", "overdue", 1, tid=2),
            entry("supervisor", 1, "A", "todo", tid=3),
            entry("supervisor", 1, "A", "overdue", 6, tid=4),
        ])
        self.assertEqual([t["id"] for t in out["people"][0]["tasks"]], [4, 2, 3, 1])

    def test_all_done_reads_done_and_open_in_time_reads_going(self):
        self.assertEqual(task_day.tone({"overdue": 0, "done": 2, "total": 2}), "done")
        self.assertEqual(task_day.tone({"overdue": 0, "done": 1, "total": 2}), "going")
        self.assertEqual(task_day.tone({"overdue": 1, "done": 1, "total": 2}), "late")


class SetFromAbove(unittest.TestCase):
    def row(self, kind, creator):
        return SimpleNamespace(assignee_kind=kind, created_by_profile=creator)

    def test_a_brigadirs_and_a_shift_managers_task_always_was(self):
        self.assertTrue(tb.set_from_above(self.row("supervisor", None)))
        self.assertTrue(tb.set_from_above(self.row("shift-manager", "admin:1")))

    def test_a_leaders_task_only_when_management_set_it(self):
        self.assertTrue(tb.set_from_above(self.row("leader", "admin:3")))
        self.assertTrue(tb.set_from_above(self.row("leader", "shift-manager:8")))
        self.assertFalse(tb.set_from_above(self.row("leader", "supervisor:12")))
        self.assertFalse(tb.set_from_above(self.row("leader", None)))
        self.assertFalse(tb.set_from_above(self.row(None, "supervisor:12")))   # legacy NULL kind

    def test_a_shift_managers_task_is_keyed_by_their_profile(self):
        t = SimpleNamespace(assignee_kind="shift-manager", leader_profile_id=41,
                            supervisor_manager_id=None)
        self.assertEqual(tb.assignee_key(t), "shift-manager:41")


TOP = {"role": "top-manager", "role_id": 5, "sub": "1"}
ADMIN = {"role": "admin", "sub": "2"}
SM = {"role": "shift-manager", "role_id": 41, "sub": "3"}


class TheFirstDay(unittest.TestCase):
    """`OPEN_FROM` is None until the operator names the day."""

    def test_no_day_is_named_yet(self):
        # The shipped rule itself — remove this test in the commit that names it.
        self.assertIsNone(tb.OPEN_FROM)
        self.assertFalse(tb.is_open())
        self.assertFalse(tb.top_sets(TOP))

    def test_closed_before_the_day_open_on_it_and_after(self):
        with mock.patch.object(tb, "OPEN_FROM", DAY):
            self.assertFalse(tb.is_open(d(-1)))
            self.assertTrue(tb.is_open(DAY))
            self.assertTrue(tb.is_open(d(30)))

    def test_a_top_manager_sets_tasks_only_from_the_day(self):
        self.assertFalse(smt.can_manage(TOP))
        self.assertFalse(bt._may_set(TOP))
        self.assertFalse(bt._can_manage(None, TOP, 7))
        with mock.patch.object(tb, "OPEN_FROM", date(2020, 1, 1)):
            self.assertTrue(smt.can_manage(TOP))
            self.assertTrue(bt._may_set(TOP))
            self.assertTrue(bt._can_manage(None, TOP, 7))
            # …and it opens nothing for anybody who is not one.
            self.assertFalse(tb.top_sets(SM))
            self.assertFalse(smt.can_manage(SM))

    def test_an_admin_never_waits(self):
        self.assertTrue(smt.can_manage(ADMIN))
        self.assertTrue(bt._may_set(ADMIN))


class ShiftManagerTier(unittest.TestCase):
    def row(self, pid=41):
        return SimpleNamespace(assignee_kind="shift-manager", leader_profile_id=pid)

    def test_the_assignee_is_the_profile_not_the_account(self):
        self.assertTrue(smt.is_assignee(SM, self.row(41)))
        self.assertTrue(smt.is_assignee({**SM, "sub": "999"}, self.row(41)))   # a co-holder
        self.assertFalse(smt.is_assignee(SM, self.row(42)))                    # a colleague's

    def test_a_brigadir_whose_unit_id_matches_is_not_the_assignee(self):
        self.assertFalse(smt.is_assignee({"role": "supervisor", "role_id": 41}, self.row(41)))

    def test_a_shift_manager_does_not_govern_their_own_tier(self):
        self.assertFalse(smt.can_manage(SM))


if __name__ == "__main__":
    unittest.main()
