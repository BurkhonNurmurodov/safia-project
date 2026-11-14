"""The tasks set from the top, read for one day (services/task_day.py), the
notice such a task goes out with, the tier a top-manager sets for a shift
manager, and the first day all of it waits for (`task_board.OPEN_FROM`)."""
import unittest
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

from app.routers import brigadir_tasks as bt, shift_manager_tasks as smt
from app.routers import staff, tasks as lt
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


class SetFromTheTop(unittest.TestCase):
    def row(self, kind, creator):
        return SimpleNamespace(assignee_kind=kind, created_by_profile=creator)

    def test_a_brigadirs_and_a_shift_managers_task_always_was(self):
        self.assertTrue(tb.set_from_above(self.row("supervisor", None)))
        self.assertTrue(tb.set_from_above(self.row("shift-manager", "admin:1")))

    def test_a_leaders_task_only_when_management_set_it(self):
        self.assertTrue(tb.set_from_above(self.row("leader", "admin:3")))
        self.assertTrue(tb.set_from_above(self.row("leader", "shift-manager:8")))
        self.assertTrue(tb.set_from_above(self.row("leader", "top-manager:6")))
        self.assertFalse(tb.set_from_above(self.row("leader", "supervisor:12")))   # their own brigadir
        self.assertFalse(tb.set_from_above(self.row("leader", None)))
        self.assertFalse(tb.set_from_above(self.row(None, "supervisor:12")))       # legacy NULL kind


class WhoATaskBelongsTo(unittest.TestCase):
    def test_the_creators_role_is_read_off_their_profile_key(self):
        self.assertEqual(tb.creator_role("shift-manager:8"), "shift-manager")
        self.assertEqual(tb.creator_role("top-manager:6"), "top-manager")
        self.assertIsNone(tb.creator_role(None))        # a row from before profile keys
        self.assertIsNone(tb.creator_role("legacy"))

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


BRIG = {"role": "supervisor", "role_id": 12, "sub": "4", "full_name": "Aripova Manzura"}


class TheNoticeOfATaskFromTheTop(unittest.TestCase):
    """«like different, like it is a very crucial task from top» — its own key."""

    def task(self):
        return SimpleNamespace(id=77, due_date=DAY, task_text="Pechni tekshirish")

    def test_an_admins_task_is_from_the_top_today(self):
        self.assertEqual(tb.created_nkey(ADMIN), "task_from_top")

    def test_a_brigadirs_task_is_an_ordinary_one_always(self):
        self.assertEqual(tb.created_nkey(BRIG), "task_created")
        with mock.patch.object(tb, "OPEN_FROM", date(2020, 1, 1)):
            self.assertEqual(tb.created_nkey(BRIG), "task_created")

    def test_a_managers_task_turns_loud_on_the_first_day(self):
        for who in (SM, TOP):
            self.assertEqual(tb.created_nkey(who), "task_created")
        with mock.patch.object(tb, "OPEN_FROM", date(2020, 1, 1)):
            for who in (SM, TOP):
                self.assertEqual(tb.created_nkey(who), "task_from_top")

    def test_the_loud_notice_carries_a_warning_and_an_open_button(self):
        kw = tb.notice_kwargs({**ADMIN, "full_name": "Burxon"}, self.task())
        self.assertEqual((kw["nkey"], kw["type"], kw["subject"]),
                         ("task_from_top", "warning", ("task", 77)))
        kb = kw["markup_fn"]("ru")
        btn = kb.keyboard[0][0]
        self.assertEqual(btn.text, "Открыть задачу")
        self.assertTrue(btn.web_app.url.endswith("/tasks?open=77"))

    def test_the_ordinary_notice_is_left_as_it_was(self):
        kw = tb.notice_kwargs(BRIG, self.task())
        self.assertEqual(kw["nkey"], "task_created")
        self.assertNotIn("type", kw)
        self.assertNotIn("markup_fn", kw)

    def test_it_reads_as_a_card_in_every_language(self):
        params = tb.notice_params({**TOP, "full_name": "Saidov Akmal"}, self.task())
        for lang, word in (("uz", "top menejer"), ("uz_cyrl", "топ менежер"),
                           ("ru", "топ-менеджер"), ("en", "top manager")):
            html = staff._mk_notif_tg("task_from_top", params, lang)
            self.assertTrue(html.startswith("🚨 <b>"), lang)
            self.assertIn("<blockquote>Pechni tekshirish</blockquote>", html)
            self.assertIn(word, html)
            self.assertNotIn("{", html)              # nothing left unfilled
        # The ordinary one stays a plain DM — no card, no icon.
        self.assertIsNone(staff._mk_notif_tg("task_created", params, "uz"))

    def test_it_belongs_to_the_tasks_category(self):
        from app.services import notification_center as nc
        self.assertEqual(nc.category_of("task_from_top"), nc.category_of("task_created"))


class ALeadersTaskFromTheTop(unittest.TestCase):
    def row(self, creator):
        return SimpleNamespace(assignee_kind="leader", created_by_profile=creator,
                               supervisor_manager_id=12, leader_profile_id=5)

    def test_a_manager_sets_a_leaders_task_only_from_the_first_day(self):
        self.assertTrue(lt._may_set(ADMIN))
        self.assertTrue(lt._may_set(BRIG))
        self.assertFalse(lt._may_set(SM))
        self.assertFalse(lt._may_set(TOP))
        with mock.patch.object(tb, "OPEN_FROM", date(2020, 1, 1)):
            self.assertTrue(lt._may_set(SM))
            self.assertTrue(lt._may_set(TOP))
        self.assertFalse(lt._may_set({"role": "leader", "role_id": 12}))

    def test_a_manager_governs_what_was_set_from_the_top_never_a_brigadirs_own(self):
        with mock.patch.object(tb, "OPEN_FROM", date(2020, 1, 1)):
            self.assertTrue(lt._governs_from_top(SM, self.row("admin:1")))
            self.assertTrue(lt._governs_from_top(TOP, self.row("shift-manager:41")))
            self.assertFalse(lt._governs_from_top(SM, self.row("supervisor:12")))
            self.assertFalse(lt._governs_from_top(BRIG, self.row("admin:1")))
        # Before the day a manager has no such hand at all.
        self.assertFalse(lt._governs_from_top(SM, self.row("admin:1")))


class TheVazifalarPageForTopManagers(unittest.TestCase):
    def test_nothing_is_granted_before_the_day(self):
        # No day named → returns before it ever opens a session.
        with mock.patch("app.database.SessionLocal", side_effect=AssertionError("touched the db")):
            tb.open_page_to_top_managers()
        self.assertFalse(tb._top_page_done)


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
