"""«Kutish yechimlari» (routers/idle_solutions.py): everybody answers the stops
they can see and nobody one they cannot, a solution is its author's own, the
Tahlil tab's five answers about a stop — and, from 2026-11-14, a plan's date,
what waits on a reader and the daily reminder that names it."""
import unittest
from datetime import date, datetime, time, timedelta, timezone
from types import SimpleNamespace
from unittest import mock

from fastapi import HTTPException

from app.routers import idle_solutions as ims

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

TODAY = datetime.now(ims.TZ).date()


def ago(k: int):
    return TODAY - timedelta(days=k)


def at(d):
    """Noon of a day, Tashkent — a timestamp that reads back as that day."""
    return datetime(d.year, d.month, d.day, 12, tzinfo=ims.TZ)


def sol(status="done", done=None, created=None):
    return SimpleNamespace(status=status, done_at=at(done) if done else None,
                           updated_at=None, created_at=at(created or done or TODAY))


class Outcome(unittest.TestCase):
    """One stop, five plain answers."""

    def test_nobody_wrote(self):
        self.assertEqual(ims.outcome(ago(20), [], [], TODAY)["state"], "unanswered")

    def test_written_but_not_done(self):
        got = ims.outcome(ago(20), [sol("open", created=ago(20)), sol("doing", created=ago(19))],
                          [ago(10)], TODAY)
        self.assertEqual(got["state"], "promised")

    def test_came_back_inside_the_window(self):
        got = ims.outcome(ago(20), [sol(done=ago(20))], [ago(17)], TODAY)
        self.assertEqual((got["state"], got["back"]), ("back", ago(17)))

    def test_the_last_day_of_the_window_still_counts(self):
        got = ims.outcome(ago(20), [sol(done=ago(20))], [ago(20 - ims.HOLD_DAYS)], TODAY)
        self.assertEqual(got["state"], "back")

    def test_held_once_the_window_passed_quiet(self):
        got = ims.outcome(ago(20), [sol(done=ago(20))], [ago(20 - ims.HOLD_DAYS - 1)], TODAY)
        self.assertEqual(got["state"], "held")

    def test_watch_counts_the_days_left(self):
        got = ims.outcome(ago(4), [sol(done=ago(4))], [], TODAY)
        self.assertEqual((got["state"], got["left"]), ("watch", ims.HOLD_DAYS - 4))

    def test_the_clock_starts_when_it_was_done_not_when_it_stopped(self):
        # stopped 20 days ago, came back 17 days ago, marked done only 10 days
        # ago: the repeat before the solution is not held against it
        got = ims.outcome(ago(20), [sol(done=ago(10))], [ago(17)], TODAY)
        self.assertEqual(got["state"], "watch")

    def test_a_repeat_on_the_day_it_was_done_is_not_counted(self):
        got = ims.outcome(ago(20), [sol(done=ago(20))], [ago(20)], TODAY)
        self.assertEqual(got["state"], "held")

    def test_the_first_done_solution_starts_the_clock(self):
        got = ims.outcome(ago(20), [sol(done=ago(5)), sol(done=ago(20))], [ago(18)], TODAY)
        self.assertEqual(got["state"], "back")


class Hours(unittest.TestCase):
    def test_a_stop_is_split_over_the_hours_it_covers(self):
        h = ims.stop_hours([{"start": "09:40", "end": "11:10"}])
        self.assertEqual((h[9], h[10], h[11]), (20, 60, 10))
        self.assertEqual(sum(h), 90)

    def test_a_stop_past_midnight_wraps(self):
        h = ims.stop_hours([{"start": "23:30", "end": "00:30"}])
        self.assertEqual((h[23], h[0], sum(h)), (30, 30, 60))

    def test_an_unreadable_clock_is_skipped(self):
        self.assertEqual(sum(ims.stop_hours([{"start": None, "end": "10:00"}])), 0)

    def test_the_peak_is_the_busiest_window(self):
        h = [0.0] * 24
        h[14], h[15], h[9] = 40, 30, 30
        self.assertEqual(ims.peak_window(h), {"from": 14, "to": 16, "share": 70})

    def test_the_peak_may_wrap_past_midnight(self):
        h = [0.0] * 24
        h[23], h[0] = 30, 30
        self.assertEqual(ims.peak_window(h), {"from": 23, "to": 1, "share": 100})

    def test_no_stops_no_peak(self):
        self.assertIsNone(ims.peak_window([0.0] * 24))


class FirstDay(unittest.TestCase):
    """`OPEN_FROM` — None until the operator names the day."""

    def test_closed_until_the_day_comes(self):
        for day, want in ((None, False), (TODAY + timedelta(days=1), False),
                          (TODAY, True), (ago(30), True)):
            with mock.patch.object(ims, "OPEN_FROM", day):
                self.assertIs(ims.is_open(), want, day)
        with mock.patch.object(ims, "OPEN_FROM", TODAY):
            self.assertFalse(ims.is_open(ago(1)))

    def test_only_an_admin_passes_the_gate_before_it(self):
        with mock.patch.object(ims, "OPEN_FROM", None):
            ims._reader_only({"role": "admin"})
            for role in ("supervisor", "idle-owner", "shift-manager", "top-manager"):
                with self.assertRaises(HTTPException) as cm:
                    ims._reader_only({"role": role})
                self.assertEqual((cm.exception.status_code, cm.exception.detail), (403, "not_open_yet"))
        with mock.patch.object(ims, "OPEN_FROM", TODAY):
            for role in ims.READER_ROLES:
                ims._reader_only({"role": role})
            with self.assertRaises(HTTPException):
                ims._reader_only({"role": "leader"})


ADMIN = {"role": "admin", "sub": "1"}
SUP1 = {"role": "supervisor", "role_id": 1, "sub": "101"}
SUP2 = {"role": "supervisor", "role_id": 2, "sub": "102"}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class Page(unittest.TestCase):
    """Two units, three cells, five stops:

        s1  9101  unit 1  Cat B  20 days ago
        s2  9101  unit 1  Cat B  17 days ago   (s1's problem again)
        s3  9101  unit 1  Cat B   2 days ago
        s4  9102  unit 1  Cat C   5 days ago   23:30 → 00:30
        s5  9201  unit 2  Cat B   4 days ago

    «Owner B» answers for Cat B; nobody for Cat C.
    """

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()
        cls._patch = mock.patch("app.database.SessionLocal", cls.pg.Session)
        cls._patch.start()

    @classmethod
    def tearDownClass(cls):
        cls._patch.stop()
        cls.forget()
        cls.pg.drop()

    @staticmethod
    def forget():
        from app.services import cell_archive, cell_links
        cell_links.forget()
        cell_archive.forget()

    def setUp(self):
        from app import models as m
        self.db = db = self.pg.Session()
        for name in ("IdleSolutionReminder", "Notification", "TelegramUserRole", "TelegramUser",
                     "IdleCategorySolution", "IdleCategoryOwner", "CellOjidaniyaInterval",
                     "PPWorkCenterDaily", "Cell", "RoleProfile", "Manager"):
            db.query(getattr(m, name)).delete()
        db.commit()
        self.forget()
        # The page's first day is the operator's to name (None until then, and the
        # page the admins' alone). The stops here are dated from today backwards,
        # so every test but the ones about that day runs with it long past.
        floor = mock.patch.object(ims, "OPEN_FROM", date(2020, 1, 1))
        floor.start()
        self.addCleanup(floor.stop)

        for i in (1, 2):
            db.add(m.Manager(id=i, name=f"Unit {i}", shift=1, zagruzka_on=True))
        db.flush()
        self.cells = {}
        for code, unit, wc in (("9101", 1, "A1"), ("9102", 1, "A2"), ("9201", 2, "B1")):
            c = m.Cell(verifix_code=code, sap_code=wc, manager_id=unit, in_load=True)
            db.add(c)
            db.flush()
            self.cells[code] = c
            for k in range(0, 31):
                db.add(m.PPWorkCenterDaily(manager_id=unit, date=ago(k), work_center=wc, people=10))
        owner = m.RoleProfile(role="idle-owner", name="Owner B")
        other = m.RoleProfile(role="idle-owner", name="Owner of nothing")
        chief = m.RoleProfile(role="shift-manager", name="Shift chief", shift=1)
        top = m.RoleProfile(role="top-manager", name="Top")
        db.add_all([owner, other, chief, top])
        db.flush()
        db.add(m.IdleCategoryOwner(category="Cat B", profile_key=f"idle-owner:{owner.id}"))
        self.OWNER = {"role": "idle-owner", "role_id": owner.id, "sub": "103"}
        self.STRANGER = {"role": "idle-owner", "role_id": other.id, "sub": "106"}
        self.SM = {"role": "shift-manager", "role_id": chief.id, "sub": "104"}
        self.TOP = {"role": "top-manager", "role_id": top.id, "sub": "105"}

        self.stop = {}
        for key, code, k, cat, a, b in (
            ("s1", "9101", 20, "Cat B", "10:00", "10:30"),
            ("s2", "9101", 17, "Cat B", "14:00", "14:45"),
            ("s3", "9101", 2, "Cat B", "09:00", "09:20"),
            ("s4", "9102", 5, "Cat C", "23:30", "00:30"),
            ("s5", "9201", 4, "Cat B", "15:00", "16:00"),
        ):
            iv = m.CellOjidaniyaInterval(cell_id=self.cells[code].id, date=ago(k).isoformat(),
                                         category=cat, start=a, end=b, stopped=True,
                                         note=f"note {key}", status="approved")
            db.add(iv)
            db.flush()
            self.stop[key] = iv.id
        db.commit()
        self.forget()

    def tearDown(self):
        self.db.rollback()
        self.db.close()

    # ── doors ────────────────────────────────────────────────────────────────

    def read(self, payload, days=30):
        return ims.analysis(date_from=ago(days), date_to=TODAY, shift=None, factory=None,
                            manager_id=[], db=self.db, payload=payload)

    def listed(self, payload, days=30):
        return ims.stops(date_from=ago(days), date_to=TODAY, shift=None, factory=None,
                         manager_id=[], db=self.db, payload=payload)

    def bare_stop(self):
        """A stop in a cell nobody typed a headcount for: no waiting MINUTES
        come of it, and it is a problem all the same."""
        from app import models as m
        cell = m.Cell(verifix_code="9103", sap_code="A3", manager_id=1, in_load=True)
        self.db.add(cell)
        self.db.flush()
        iv = m.CellOjidaniyaInterval(cell_id=cell.id, date=ago(1).isoformat(), category="Cat E",
                                     start="11:00", end="11:20", stopped=True,
                                     note="note bare", status="approved")
        self.db.add(iv)
        self.db.commit()
        self.forget()
        self.stop["bare"] = iv.id
        return iv.id

    def tahlil(self, payload, days=30):
        return ims.analytics(date_from=ago(days), date_to=TODAY, shift=None, factory=None,
                             manager_id=[], db=self.db, payload=payload)

    def write(self, payload, stop, status="done", text="what I did", **kw):
        body = ims.SolutionBody(event_id=self.stop[stop] if stop else None, text=text,
                                status=status, **kw)
        return ims.add_solution(body=body, db=self.db, payload=payload)

    def edit(self, payload, sid, **kw):
        return ims.edit_solution(solution_id=sid, body=ims.SolutionEdit(**kw),
                                 db=self.db, payload=payload)

    def refused(self, code, fn, *a, **kw):
        with self.assertRaises(HTTPException) as cm:
            fn(*a, **kw)
        self.assertEqual(cm.exception.status_code, code)
        self.db.rollback()

    def backdate(self, sid, day):
        from app.models import IdleCategorySolution as S
        self.db.query(S).filter(S.id == sid).update(
            {"created_at": at(day), "done_at": at(day)}, synchronize_session=False)
        self.db.commit()

    @staticmethod
    def events(payload_out):
        return {e["id"]: e for c in payload_out["categories"]
                for p in c["problems"] for e in p["events"]}

    # ── reading ──────────────────────────────────────────────────────────────

    def test_everybody_who_reads_may_write(self):
        for who in (ADMIN, SUP1, self.OWNER, self.SM, self.TOP):
            self.assertTrue(self.read(who)["can_write"], who["role"])
        self.assertTrue(self.read(SUP1)["expects_me"])
        self.assertTrue(self.read(self.OWNER)["expects_me"])
        self.assertFalse(self.read(self.SM)["expects_me"])
        self.refused(403, self.read, {"role": "leader", "role_id": 1, "sub": "9"})

    def test_a_brigadir_reads_their_own_unit(self):
        self.assertEqual(set(self.events(self.read(SUP1))),
                         {self.stop[k] for k in ("s1", "s2", "s3", "s4")})
        self.assertEqual(set(self.events(self.read(SUP2))), {self.stop["s5"]})

    def test_an_owner_reads_their_own_causes(self):
        self.assertEqual(set(self.events(self.read(self.OWNER))),
                         {self.stop[k] for k in ("s1", "s2", "s3", "s5")})

    # ── the flat list («Muammolar») ──────────────────────────────────────────

    def test_the_list_is_flat_and_newest_first(self):
        got = self.listed(ADMIN)
        self.assertEqual([s["id"] for s in got["stops"]],
                         [self.stop[k] for k in ("s3", "s5", "s4", "s2", "s1")])
        first = got["stops"][0]
        self.assertEqual((first["cell"], first["category"], first["manager_id"], first["note"],
                          first["state"], first["mine"], first["solutions"]),
                         ("9101", "Cat B", 1, "note s3", "none", False, []))
        self.assertTrue(got["can_write"])
        self.assertGreater(got["total_minutes"], 0)

    def test_the_list_names_units_and_owners_once(self):
        got = self.listed(ADMIN)
        self.assertEqual(got["units"], {"1": {"manager_name": "Unit 1", "shift": 1},
                                        "2": {"manager_name": "Unit 2", "shift": 1}})
        self.assertEqual(list(got["owners"]), ["Cat B"])
        self.assertEqual(got["owners"]["Cat B"]["name"], "Owner B")
        self.assertEqual(got["no_owner"], ["Cat C"])

    def test_each_reader_lists_their_own_reach(self):
        ids = lambda who: {s["id"] for s in self.listed(who)["stops"]}       # noqa: E731
        self.assertEqual(ids(SUP1), {self.stop[k] for k in ("s1", "s2", "s3", "s4")})
        self.assertEqual(ids(SUP2), {self.stop["s5"]})
        self.assertEqual(ids(self.OWNER), {self.stop[k] for k in ("s1", "s2", "s3", "s5")})
        self.assertEqual(ids(self.STRANGER), set())
        self.assertEqual(len(ids(self.SM)), 5)
        self.assertTrue(self.listed(SUP1)["expects_me"])
        self.assertFalse(self.listed(self.TOP)["expects_me"])
        self.refused(403, self.listed, {"role": "leader", "role_id": 1, "sub": "9"})

    def test_the_list_says_which_stops_wait_for_the_reader(self):
        self.write(SUP1, "s1", status="open")
        self.write(self.OWNER, "s2")
        mine = {s["id"]: s for s in self.listed(SUP1)["stops"]}
        self.assertEqual((mine[self.stop["s1"]]["mine"], mine[self.stop["s1"]]["state"]), (True, "open"))
        self.assertEqual((mine[self.stop["s2"]]["mine"], mine[self.stop["s2"]]["state"]), (False, "done"))
        row = mine[self.stop["s1"]]["solutions"][0]
        self.assertEqual((row["mine"], row["can_edit"], row["author_role"]), (True, True, "supervisor"))
        theirs = {s["id"]: s for s in self.listed(self.OWNER)["stops"]}
        self.assertFalse(theirs[self.stop["s1"]]["solutions"][0]["can_edit"])

    def test_a_stop_without_minutes_is_still_a_problem(self):
        bare = self.bare_stop()
        self.assertIn(bare, {s["id"] for s in self.listed(SUP1)["stops"]})
        self.assertIn(bare, {s["id"] for s in self.listed(ADMIN)["stops"]})
        # the cause accordion listed a stop only under a cause with minutes
        self.assertNotIn(bare, self.events(self.read(ADMIN)))
        self.assertEqual(self.write(SUP1, "bare")["category"], "Cat E")
        self.assertEqual(self.tahlil(ADMIN)["funnel"]["stops"], 6)  # Tahlil counts what the list shows

    def test_the_older_stopless_rows_ride_along(self):
        self.write(self.OWNER, None, category="Cat B", text="for the whole cause")
        body = ims.SolutionBody(category="Cat C", manager_id=2, text="for unit 2", status="open")
        ims.add_solution(body=body, db=self.db, payload=ADMIN)
        got = {r["text"]: r for r in self.listed(ADMIN)["legacy"]}
        self.assertEqual((got["for the whole cause"]["manager_id"], got["for the whole cause"]["manager_name"]),
                         (None, None))
        self.assertEqual(got["for unit 2"]["manager_name"], "Unit 2")
        self.assertEqual({r["text"] for r in self.listed(SUP1)["legacy"]}, {"for the whole cause"})
        self.assertEqual({r["text"] for r in self.listed(self.OWNER)["legacy"]}, {"for the whole cause"})

    # ── writing ──────────────────────────────────────────────────────────────

    def test_everybody_answers_a_stop_they_can_see(self):
        self.assertEqual(self.write(SUP1, "s1")["author_role"], "supervisor")
        self.assertEqual(self.write(self.OWNER, "s1")["author_role"], "idle-owner")
        self.assertEqual(self.write(self.SM, "s4")["author_role"], "shift-manager")
        self.assertEqual(self.write(self.TOP, "s5")["author_role"], "top-manager")
        self.write(ADMIN, "s4")
        seen = self.events(self.read(ADMIN))
        self.assertEqual(len(seen[self.stop["s1"]]["solutions"]), 2)
        self.assertEqual(len(seen[self.stop["s4"]]["solutions"]), 2)

    def test_the_stop_names_its_own_cause_and_unit(self):
        got = self.write(SUP1, "s1")
        self.assertEqual((got["category"], got["manager_id"]), ("Cat B", 1))
        self.assertEqual(got["author_name"], "Unit 1")
        self.refused(400, self.write, SUP1, "s1", category="Cat C")

    def test_nobody_answers_a_stop_they_cannot_see(self):
        self.refused(403, self.write, SUP1, "s5")                  # another unit's
        self.refused(403, self.write, SUP1, "s5", manager_id=2)    # …named outright
        self.refused(404, self.write, SUP1, "s5", manager_id=1)    # …claimed as their own
        self.refused(403, self.write, self.OWNER, "s4")            # another cause
        self.refused(403, self.write, self.STRANGER, "s1")         # an owner of nothing
        self.refused(403, self.write, {"role": "leader", "role_id": 1, "sub": "9"}, "s1")

    def test_a_stop_that_is_not_on_the_page_is_refused(self):
        from app.models import CellOjidaniyaInterval as Iv
        self.db.query(Iv).filter(Iv.id == self.stop["s3"]).update({"stopped": False})
        self.db.commit()
        self.refused(404, self.write, SUP1, "s3")                  # the not-stopped half
        body = ims.SolutionBody(event_id=10 ** 9, text="x", status="done")
        self.refused(404, ims.add_solution, body=body, db=self.db, payload=ADMIN)

    def test_cleaning_takes_no_solution(self):
        from app.models import CellOjidaniyaInterval as Iv
        self.db.query(Iv).filter(Iv.id == self.stop["s4"]).update({"category": "Cat H"})
        self.db.commit()
        self.refused(400, self.write, ADMIN, "s4")

    def test_a_cause_wide_solution_stays_the_owners(self):
        self.refused(403, self.write, SUP1, None, category="Cat B")
        self.refused(403, self.write, self.SM, None, category="Cat B")
        self.refused(403, self.write, self.OWNER, None, category="Cat C")
        self.assertIsNone(self.write(self.OWNER, None, category="Cat B")["event_id"])
        self.assertIsNone(self.write(ADMIN, None, category="Cat C")["event_id"])

    def test_text_and_status_are_checked(self):
        self.refused(400, self.write, SUP1, "s1", text="   ")
        self.refused(400, self.write, SUP1, "s1", status="finished")
        self.refused(400, self.write, SUP1, "s1", text="x" * (ims.MAX_TEXT + 1))

    # ── a solution is its author's own ───────────────────────────────────────

    def test_only_the_author_and_an_admin_edit_it(self):
        sid = self.write(SUP1, "s1", status="open")["id"]
        self.refused(403, self.edit, self.OWNER, sid, status="done")
        self.refused(403, self.edit, self.SM, sid, text="mine now")
        self.refused(403, self.edit, SUP2, sid, status="done")
        self.assertEqual(self.edit(SUP1, sid, text="better words")["text"], "better words")
        self.assertEqual(self.edit(ADMIN, sid, status="doing")["status"], "doing")
        self.refused(404, self.edit, ADMIN, 10 ** 9, status="done")

    def test_the_page_says_whose_each_row_is(self):
        sid = self.write(SUP1, "s1")["id"]
        self.write(self.OWNER, "s2")
        mine = self.events(self.read(SUP1))
        row = mine[self.stop["s1"]]["solutions"][0]
        self.assertEqual((row["id"], row["mine"], row["can_edit"]), (sid, True, True))
        self.assertTrue(mine[self.stop["s1"]]["mine"])
        self.assertFalse(mine[self.stop["s2"]]["mine"])            # the owner's answer, not theirs
        theirs = self.events(self.read(self.OWNER))[self.stop["s1"]]["solutions"][0]
        self.assertEqual((theirs["mine"], theirs["can_edit"]), (False, False))
        self.assertTrue(self.events(self.read(ADMIN))[self.stop["s1"]]["solutions"][0]["can_edit"])

    def test_the_counts_tell_any_answer_from_my_own(self):
        self.write(SUP1, "s1")
        self.write(self.OWNER, "s2")
        got = self.read(SUP1)
        self.assertEqual((got["stops_n"], got["mine_n"], got["no_solution_n"]), (4, 1, 2))
        got = self.read(self.OWNER)
        self.assertEqual((got["stops_n"], got["mine_n"], got["no_solution_n"]), (4, 1, 2))

    def test_done_at_follows_the_status(self):
        got = self.write(SUP1, "s1", status="open")
        self.assertIsNone(got["done_at"])
        self.assertIsNotNone(self.edit(SUP1, got["id"], status="done")["done_at"])
        self.assertIsNone(self.edit(SUP1, got["id"], status="doing")["done_at"])
        self.assertIsNotNone(self.write(SUP1, "s2", status="done")["done_at"])

    # ── Tahlil ───────────────────────────────────────────────────────────────

    def answered_world(self):
        """s1 done 20 days ago (s2 is it coming back), s2 done 17 days ago and
        quiet since, s3 only promised, s4 nobody, s5 done 4 days ago."""
        self.backdate(self.write(SUP1, "s1")["id"], ago(20))
        self.backdate(self.write(SUP1, "s2")["id"], ago(17))
        self.write(SUP1, "s3", status="open")
        self.backdate(self.write(SUP2, "s5")["id"], ago(4))
        self.write(self.OWNER, "s1")

    def test_every_stop_is_in_one_of_five_states(self):
        self.answered_world()
        got = self.tahlil(ADMIN)
        self.assertEqual(got["funnel"], {"back": 1, "unanswered": 1, "promised": 1,
                                         "watch": 1, "held": 1, "stops": 5, "overdue": 0})
        self.assertEqual(got["total"]["stops"], 5)
        self.assertEqual((got["speed"]["answered"], got["speed"]["median_days"]), (4, 0))

    def test_who_wrote_their_own_answer(self):
        self.answered_world()
        got = self.tahlil(ADMIN)
        units = {u["manager_id"]: u for u in got["by_unit"]}
        self.assertEqual((units[1]["stops"], units[1]["answered"], units[1]["own"]), (4, 3, 3))
        self.assertEqual((units[2]["stops"], units[2]["answered"], units[2]["own"]), (1, 1, 1))
        owner = got["owners"][0]
        self.assertEqual((owner["name"], owner["categories"], owner["stops"], owner["own"]),
                         ("Owner B", ["Cat B"], 4, 1))
        # every unit that had a stop, the one furthest behind first
        self.assertEqual([(r["manager_name"], r["stops"], r["answered"], r["own"]) for r in got["responders"]],
                         [("Unit 1", 4, 3, 3), ("Unit 2", 1, 1, 1)])

    def test_the_repeating_place_is_named(self):
        self.answered_world()
        got = self.tahlil(ADMIN)
        self.assertEqual(got["repeats_n"], 1)
        r = got["repeats"][0]
        self.assertEqual((r["cell"], r["category"], r["days"], r["stops"], r["back_n"], r["state"]),
                         ("9101", "Cat B", 3, 3, 1, "back"))
        # the newest thing anybody wrote about that cell and cause
        self.assertEqual((r["solution"]["author_role"], r["solution"]["status"]),
                         ("idle-owner", "done"))

    def test_where_and_when(self):
        got = self.tahlil(ADMIN)
        self.assertEqual([c["category"] for c in got["by_cause"]], ["Cat B", "Cat C"])
        self.assertEqual({c["category"]: c["stops"] for c in got["by_cause"]},
                         {"Cat B": 4, "Cat C": 1})
        self.assertEqual(got["by_cell"][0]["cell"], "9101")
        self.assertEqual((got["hours"][23], got["hours"][0]), (30, 30))
        self.assertEqual(sum(w["stops"] for w in got["weekdays"]), 5)
        self.assertEqual(sum(w["days"] for w in got["weekdays"]), 31)
        self.assertEqual(len(got["daily"]), 31)
        self.assertAlmostEqual(sum(d["minutes"] for d in got["daily"]), got["total"]["minutes"], 1)

    def test_the_period_before_is_the_comparison(self):
        now = self.tahlil(ADMIN, days=9)                            # s3, s4, s5
        self.assertEqual(now["total"]["stops"], 3)
        self.assertGreater(now["total"]["prev_minutes"], 0)         # s2, 17 days ago
        self.assertEqual((now["prev_from"], now["prev_to"]),
                         (ago(19).isoformat(), ago(10).isoformat()))

    def test_a_short_period_still_shows_a_week(self):
        got = self.tahlil(ADMIN, days=1)
        self.assertEqual(len(got["daily"]), ims.MIN_CHART_DAYS)
        self.assertEqual([d["in_period"] for d in got["daily"]], [False] * 5 + [True] * 2)

    def test_an_owner_reads_tahlil_through_their_causes(self):
        self.answered_world()
        got = self.tahlil(self.OWNER)
        self.assertEqual([c["category"] for c in got["by_cause"]], ["Cat B"])
        self.assertEqual(got["funnel"]["stops"], 4)
        self.assertEqual(got["cat_locked"], ["Cat B"])

    def test_tahlil_is_not_a_brigadirs(self):
        self.refused(403, self.tahlil, SUP1)

    # ── a plan's date ────────────────────────────────────────────────────────

    def overdue_plan(self, payload, stop, days=2):
        """A plan whose date passed `days` ago. Nobody can WRITE one that way,
        so the date is moved back underneath a plan written for today."""
        from app.models import IdleCategorySolution as S
        got = self.write(payload, stop, status="open", due_date=TODAY)
        self.db.query(S).filter(S.id == got["id"]).update(
            {"due_date": ago(days)}, synchronize_session=False)
        self.db.commit()
        return got["id"]

    def test_a_plan_carries_its_date(self):
        ahead = TODAY + timedelta(days=3)
        got = self.write(SUP1, "s3", status="open", due_date=ahead)
        self.assertEqual((got["due_date"], got["due_in"], got["overdue"]), (ahead.isoformat(), 3, False))
        # a done row promises nothing
        done = self.write(SUP1, "s2", status="done", due_date=ahead)
        self.assertEqual((done["due_date"], done["due_in"], done["overdue"]), (None, None, False))
        # a tab from before the field still saves a plan — it just has no date
        old = self.write(SUP1, "s1", status="doing")
        self.assertEqual((old["due_date"], old["due_in"], old["overdue"]), (None, None, False))

    def test_a_plans_date_lies_ahead(self):
        self.refused(400, self.write, SUP1, "s3", status="open", due_date=ago(1))
        self.refused(400, self.write, SUP1, "s3", status="open",
                     due_date=TODAY + timedelta(days=ims.MAX_PLAN_DAYS + 1))
        self.assertEqual(self.write(SUP1, "s3", status="open", due_date=TODAY)["due_in"], 0)

    def test_past_its_date_a_plan_is_overdue_until_done_or_moved(self):
        sid = self.overdue_plan(SUP1, "s3")
        row = {s["id"]: s for s in self.listed(SUP1)["stops"]}[self.stop["s3"]]["solutions"][0]
        self.assertEqual((row["overdue"], row["due_in"]), (True, -2))
        # the words alone leave the date alone
        self.assertTrue(self.edit(SUP1, sid, text="still on it")["overdue"])
        self.refused(400, self.edit, SUP1, sid, due_date=ago(1))
        moved = self.edit(SUP1, sid, due_date=TODAY + timedelta(days=5))
        self.assertEqual((moved["overdue"], moved["due_in"]), (False, 5))
        # done: nothing is owed any more, and what was promised stays on the row
        done = self.edit(SUP1, sid, status="done")
        self.assertEqual((done["overdue"], done["due_in"]), (False, None))
        self.assertEqual(done["due_date"], (TODAY + timedelta(days=5)).isoformat())
        self.assertIsNone(self.edit(SUP1, sid, due_date=None)["due_date"])

    def test_tahlil_counts_the_promises_past_their_date(self):
        self.overdue_plan(SUP1, "s3")
        self.write(SUP2, "s5", status="open", due_date=TODAY + timedelta(days=1))
        f = self.tahlil(ADMIN)["funnel"]
        self.assertEqual((f["promised"], f["overdue"]), (2, 1))

    # ── what waits on a reader ───────────────────────────────────────────────

    def waits(self, payload, **kw):
        w = ims.waiting(self.db, payload, **kw)
        return None if w is None else {s["id"]: why for s, why in w["stops"]}

    def counts(self, payload):
        w = ims.waiting(self.db, payload)
        return w["unanswered"], w["overdue"], w["written"]

    def test_what_waits_on_a_reader(self):
        s = self.stop
        # the last REMIND_DAYS days hold s3 and s4 (unit 1) and s5 (unit 2)
        self.assertEqual(self.waits(SUP1), {s["s3"]: "unanswered", s["s4"]: "unanswered"})
        self.assertEqual(self.waits(SUP2), {s["s5"]: "unanswered"})
        # an owner: their own causes, in every unit
        self.assertEqual(self.waits(self.OWNER), {s["s3"]: "unanswered", s["s5"]: "unanswered"})
        self.assertEqual(self.waits(self.STRANGER), {})
        # newest first, like the list
        self.assertEqual(list(self.waits(SUP1)), [s["s3"], s["s4"]])
        # nothing waits on a role the page does not ask
        for who in (ADMIN, self.SM, self.TOP):
            self.assertIsNone(self.waits(who), who["role"])

    def test_only_the_readers_own_answer_takes_a_stop_off(self):
        self.write(self.OWNER, "s3")                      # somebody else's answer
        self.assertIn(self.stop["s3"], self.waits(SUP1))
        self.assertEqual(self.counts(SUP1), (2, 0, 0))
        # a plan is an answer — until its date passes
        self.write(SUP1, "s3", status="open", due_date=TODAY + timedelta(days=2))
        self.assertNotIn(self.stop["s3"], self.waits(SUP1))
        self.assertEqual(self.counts(SUP1), (1, 0, 1))
        self.assertEqual(ims.waiting(self.db, SUP1)["written_rows"], [["Cat B", "9101"]])

    def test_an_overdue_plan_waits_again(self):
        s = self.stop
        sid = self.overdue_plan(SUP1, "s3")
        self.assertEqual(self.waits(SUP1)[s["s3"]], "overdue")
        self.assertEqual(self.counts(SUP1), (1, 1, 0))
        # an old stop comes back with its plan: s1 is outside the look-back
        old = self.overdue_plan(SUP1, "s1")
        self.assertEqual(self.waits(SUP1)[s["s1"]], "overdue")
        # somebody else's overdue plan is theirs to answer for
        self.assertNotIn(s["s1"], self.waits(self.OWNER))
        self.assertEqual(self.waits(self.OWNER)[s["s3"]], "unanswered")
        # done, or moved ahead → it waits no more
        self.edit(SUP1, sid, status="done")
        self.edit(SUP1, old, due_date=TODAY + timedelta(days=1))
        self.assertEqual(self.waits(SUP1), {s["s4"]: "unanswered"})

    def test_a_plan_overdue_longer_than_the_look_back_is_no_longer_named(self):
        self.overdue_plan(SUP1, "s2", days=ims.REMIND_DAYS)
        self.assertEqual(self.waits(SUP1)[self.stop["s2"]], "overdue")
        self.overdue_plan(SUP1, "s1", days=ims.REMIND_DAYS + 1)
        self.assertNotIn(self.stop["s1"], self.waits(SUP1))

    def test_nothing_from_before_the_first_day_waits(self):
        with mock.patch.object(ims, "OPEN_FROM", ago(3)):
            self.assertEqual(self.waits(SUP1), {self.stop["s3"]: "unanswered"})   # s4 is 5 days old
        with mock.patch.object(ims, "OPEN_FROM", TODAY):
            self.assertEqual(self.waits(SUP1), {})                                # open, nothing filed yet

    # ── the admins' alone until its first day ────────────────────────────────

    def test_only_admins_until_the_first_day(self):
        for day in (None, TODAY + timedelta(days=1)):
            with mock.patch.object(ims, "OPEN_FROM", day):
                for who in (SUP1, self.OWNER, self.SM, self.TOP):
                    for door in (self.read, self.listed, self.tahlil):
                        self.refused(403, door, who)
                    self.refused(403, self.write, who, "s3")
                    self.refused(403, ims.waiting_count, db=self.db, payload=who)
                    self.assertIsNone(ims.waiting(self.db, who), who["role"])
                # an admin reads, writes and analyses as ever
                self.assertEqual(len(self.listed(ADMIN)["stops"]), 5)
                self.assertEqual(self.tahlil(ADMIN)["total"]["stops"], 5)
                self.assertEqual(self.write(ADMIN, "s3", text=f"admin, {day}")["status"], "done")
                self.assertEqual(ims.waiting_count(db=self.db, payload=ADMIN)["total"], 0)
        # the day itself: the page is its roles' again
        with mock.patch.object(ims, "OPEN_FROM", TODAY):
            self.assertEqual(len(self.listed(SUP1)["stops"]), 4)
            self.assertEqual(self.write(SUP1, "s3")["author_role"], "supervisor")

    def test_no_reminder_before_the_first_day(self):
        self.holder("supervisor:1", 501)
        for day in (None, TODAY + timedelta(days=1)):
            with mock.patch.object(ims, "OPEN_FROM", day):
                out, dm = self.remind(shifts=[1])
            self.assertEqual((out["asked"], out["sent"]), (0, 0))
            dm.assert_not_called()
        self.assertEqual(self.ledger(), {})       # nothing recorded: the first day asks afresh

    def test_the_page_carries_the_same_list(self):
        s = self.stop
        self.overdue_plan(SUP1, "s1")
        got = self.listed(SUP1, days=3)                   # the period on screen holds s3 alone
        self.assertEqual([x["id"] for x in got["stops"]], [s["s3"]])
        todo = got["todo"]
        self.assertEqual([(x["id"], x["why"]) for x in todo["stops"]],
                         [(s["s3"], "unanswered"), (s["s4"], "unanswered"), (s["s1"], "overdue")])
        self.assertEqual((todo["unanswered"], todo["overdue"], todo["written"]), (2, 1, 0))
        self.assertEqual((todo["from"], todo["to"]),
                         (ago(ims.REMIND_DAYS - 1).isoformat(), TODAY.isoformat()))
        # a stop from outside the period arrives whole: its words, its solutions, its unit
        old = todo["stops"][2]
        self.assertEqual((old["note"], old["cell"], old["category"]), ("note s1", "9101", "Cat B"))
        self.assertTrue(old["solutions"][0]["overdue"])
        self.assertIn("1", got["units"])
        self.assertEqual(got["today"], TODAY.isoformat())
        # the menu number is that list's length
        self.assertEqual(ims.waiting_count(db=self.db, payload=SUP1),
                         {"unanswered": 2, "overdue": 1, "total": 3})
        # nobody else is asked
        self.assertIsNone(self.listed(ADMIN)["todo"])
        self.assertEqual(ims.waiting_count(db=self.db, payload=ADMIN),
                         {"unanswered": 0, "overdue": 0, "total": 0})

    def test_the_pages_filters_narrow_the_list_too(self):
        got = ims.stops(date_from=ago(30), date_to=TODAY, shift=None, factory=None,
                        manager_id=[2], db=self.db, payload=self.OWNER)
        self.assertEqual([x["id"] for x in got["todo"]["stops"]], [self.stop["s5"]])
        self.assertEqual(self.waits(self.OWNER, manager_id=[2]), {self.stop["s5"]: "unanswered"})

    # ── the daily reminder ───────────────────────────────────────────────────

    def holder(self, profile, tid, lang="uz"):
        """Somebody holds this profile — a reminder has an account to reach."""
        from app import models as m
        role, _, ref = profile.partition(":")
        self.db.add(m.TelegramUser(telegram_id=tid, full_name=f"User {tid}", role=role,
                                   role_id=int(ref), language=lang, status="approved"))
        self.db.add(m.TelegramUserRole(telegram_id=tid, role=role, role_id=int(ref),
                                       full_name=f"User {tid}", profile_key=profile,
                                       status="approved"))
        self.db.commit()

    def remind(self, **kw):
        from app.services import idle_solution_reminder as rem
        with mock.patch("app.telegram_bot.send_tg_notification", return_value=True) as dm:
            out = rem.run(**kw)
        return out, dm

    def ledger(self):
        from app.models import IdleSolutionReminder as R
        self.db.expire_all()
        return {r.profile_key: (r.sent, r.unanswered, r.overdue) for r in self.db.query(R).all()}

    def test_the_reminder_tells_each_person_once_a_day(self):
        from app.models import Notification
        owner = f"idle-owner:{self.OWNER['role_id']}"
        self.holder("supervisor:1", 501)
        self.holder(owner, 503, lang="ru")
        self.overdue_plan(SUP1, "s3")
        out, dm = self.remind(shifts=[1])
        # unit 2: nobody holds it, nobody to tell; an owner of no cause is not asked at all
        self.assertEqual((out["asked"], out["sent"], out["nobody"]), (3, 2, 1))
        self.assertEqual(self.ledger(), {
            "supervisor:1": (True, 1, 1), owner: (True, 2, 0), "supervisor:2": (False, 0, 0),
            # the shift-manager nobody holds: asked about the digest once, nobody to tell
            f"shift-manager:{self.SM['role_id']}": (False, 0, 0)})
        self.assertEqual(sorted(c.args[0] for c in dm.call_args_list), [501, 503])
        sent = {c.args[0]: c.kwargs for c in dm.call_args_list}
        self.assertIn("<b>2 ta</b>", sent[501]["html"])                 # in the holder's language
        self.assertIn("Rejangiz muddati o'tgan — 1 ta", sent[501]["html"])
        self.assertIn("<code>9101</code>", sent[501]["html"])
        self.assertIn("Решение не написано — 2", sent[503]["html"])
        self.assertNotIn("⏰", sent[503]["html"])                        # nothing of theirs is overdue
        self.assertTrue(sent[501]["markup"].keyboard[0][0].web_app.url.endswith("/idle-solutions"))
        # one bell row each, opening the page
        rows = {n.recipient_profile: n for n in self.db.query(Notification).all()}
        self.assertEqual(sorted(rows), sorted(["supervisor:1", owner]))
        self.assertEqual((rows["supervisor:1"].nkey, rows["supervisor:1"].subject_kind,
                          rows["supervisor:1"].subject_id),
                         ("idle_solution_reminder", "page", "/idle-solutions"))
        # the same day again — a deploy, a caught-up job — tells nobody twice
        out, dm = self.remind(shifts=[1])
        self.assertEqual((out["asked"], out["sent"]), (0, 0))
        dm.assert_not_called()

    def test_nothing_waiting_sends_nothing(self):
        self.holder("supervisor:2", 502)
        self.write(SUP2, "s5")
        out, dm = self.remind(shifts=[1])
        self.assertEqual((out["sent"], out["quiet"]), (0, 1))
        dm.assert_not_called()
        self.assertEqual(self.ledger()["supervisor:2"], (False, 0, 0))

    def test_each_shift_is_told_in_its_own_hours(self):
        from app import models as m
        from app.services import idle_solution_reminder as rem
        self.db.query(m.Manager).filter(m.Manager.id == 2).update({"shift": 2})
        self.db.commit()
        self.holder("supervisor:1", 501)
        self.holder("supervisor:2", 502)

        def clock(h, mi=0):
            return datetime.combine(TODAY, time(h, mi), tzinfo=ims.TZ)

        self.assertEqual(rem.open_shifts(clock(9, 59)), [])
        self.assertEqual(rem.open_shifts(clock(10)), [1])
        self.assertEqual(rem.open_shifts(clock(11, 59)), [1])
        self.assertEqual(rem.open_shifts(clock(12)), [])
        self.assertEqual(rem.open_shifts(clock(22, 20)), [2])
        out, dm = self.remind(now=clock(8))
        self.assertEqual((out["slots"], out["asked"]), ([], 0))
        out, dm = self.remind(now=clock(10, 20))
        self.assertEqual([c.args[0] for c in dm.call_args_list], [501])
        out, dm = self.remind(now=clock(22))
        self.assertEqual([c.args[0] for c in dm.call_args_list], [502])

    # ── the shift-managers' digest ───────────────────────────────────────────

    def test_a_brigadir_left_behind_is_named_to_the_shift_managers(self):
        from app.services import idle_solution_reminder as rem
        sm = f"shift-manager:{self.SM['role_id']}"
        self.holder(sm, 504)
        self.holder("supervisor:1", 501)
        # s4 has waited 5 days and s5 four; s3 only two — not yet
        rows = rem.behind(self.db, TODAY)
        self.assertEqual([(r["manager_id"], r["stops"], r["overdue"], r["since"], r["held"]) for r in rows],
                         [(1, 1, 0, ago(5).isoformat(), True), (2, 1, 0, ago(4).isoformat(), False)])
        # a plan three days past its date has waited as long
        self.overdue_plan(SUP1, "s3", days=rem.ESCALATE_DAYS)
        first = rem.behind(self.db, TODAY)[0]
        self.assertEqual((first["manager_id"], first["stops"], first["overdue"]), (1, 2, 1))

        out, dm = self.remind(shifts=[1])
        self.assertEqual(out["managers"], 1)
        sent = {c.args[0]: c.kwargs for c in dm.call_args_list}
        self.assertEqual(sorted(sent), [501, 504])                      # the brigadir's own reminder too
        text = sent[504]["html"]
        self.assertIn("<b>2 nafar</b>", text)
        self.assertIn("Unit 1 — <b>2 ta</b>", text)
        self.assertIn("Unit 2 — <b>1 ta</b>", text)
        self.assertEqual(text.count("botga ulanmagan"), 1)              # unit 2: nobody holds it
        url = sent[504]["markup"].keyboard[0][0].web_app.url
        self.assertIn("/idle-solutions?date_from=", url)
        self.assertIn("manager_id=1&manager_id=2", url)
        self.assertEqual(self.ledger()[sm], (True, 3, 1))
        # once a day, like the reminder
        out, dm = self.remind(shifts=[1])
        self.assertEqual(out["managers"], 0)
        dm.assert_not_called()

    def test_nobody_behind_no_digest(self):
        from app.services import idle_solution_reminder as rem
        sm = f"shift-manager:{self.SM['role_id']}"
        self.holder(sm, 504)
        self.write(SUP1, "s4")
        self.write(SUP2, "s5", status="open", due_date=TODAY)           # a plan in time is an answer
        self.assertEqual(rem.behind(self.db, TODAY), [])
        out, dm = self.remind(shifts=[1])
        self.assertEqual(out["managers"], 0)
        dm.assert_not_called()
        self.assertEqual(self.ledger()[sm], (False, 0, 0))              # asked once, nothing to say
        # and before the page's first day nobody can be behind
        with mock.patch.object(ims, "OPEN_FROM", None):
            self.assertEqual(rem.behind(self.db, TODAY), [])

    def test_a_shift_manager_is_told_in_their_own_shifts_hours(self):
        from app import models as m
        night = m.RoleProfile(role="shift-manager", name="Night chief", shift=2)
        self.db.add(night)
        self.db.commit()
        self.holder(f"shift-manager:{night.id}", 505)
        self.holder(f"shift-manager:{self.SM['role_id']}", 504)
        out, dm = self.remind(shifts=[1])
        self.assertEqual([c.args[0] for c in dm.call_args_list], [504])
        out, dm = self.remind(shifts=[2])
        self.assertEqual([c.args[0] for c in dm.call_args_list], [505])

    def test_the_digest_reads_in_four_languages(self):
        from app.routers.staff import _NOTIF_STRINGS, _mk_notif
        from app.services import idle_solution_reminder as rem
        from app.services import notification_center as nc
        rows = rem.behind(self.db, TODAY)
        for lang in ("uz", "uz_cyrl", "ru", "en"):
            text = rem.behind_body(lang, rows)
            self.assertIn("Unit 1", text, lang)
            self.assertIn(ago(5).strftime("%d.%m"), text, lang)
            self.assertNotIn("{", text, lang)
            self.assertIn(lang, _NOTIF_STRINGS[rem.NKEY_BEHIND])
        title, text = _mk_notif(rem.NKEY_BEHIND, {"n": 2, "stops": 3, "days": 3, "lines": "Unit 1 — 2; Unit 2 — 1"}, "uz")
        self.assertEqual(title, "Kutish yechimlari: 2 nafar brigadir javob yozmayapti")
        self.assertEqual(text, "3 kundan beri javobsiz to'xtashlar: 3\nUnit 1 — 2; Unit 2 — 1")
        self.assertEqual(nc.category_of(rem.NKEY_BEHIND), "idle")

    def test_the_reminder_reads_in_four_languages(self):
        from app.routers.staff import _NOTIF_STRINGS, _mk_notif
        from app.services import idle_solution_reminder as rem
        from app.services import notification_center as nc
        self.overdue_plan(SUP1, "s3")
        w = ims.waiting(self.db, SUP1)
        plans = rem._plan_dates(self.db, "supervisor:1", w)
        self.assertEqual(plans, {self.stop["s3"]: ago(2).isoformat()})
        for lang in ("uz", "uz_cyrl", "ru", "en"):
            text = rem.body(lang, w, plans)
            self.assertIn("<code>9102</code>", text, lang)
            self.assertIn(ago(2).strftime("%d.%m"), text, lang)
            self.assertNotIn("{", text, lang)
            self.assertIn(lang, _NOTIF_STRINGS[rem.NKEY])
        # a kind with nothing in it leaves the bell text
        title, text = _mk_notif(rem.NKEY, {"n": 2, "unanswered": 2, "overdue": ""}, "uz")
        self.assertEqual((title, text), ("Kutish yechimlari: 2 ta to'xtash sizni kutmoqda",
                                         "Yechim yozilmagan: 2"))
        self.assertEqual(nc.category_of(rem.NKEY), "idle")
        self.assertEqual(nc.link_for("page", rem.PAGE), "/idle-solutions")


if __name__ == "__main__":
    unittest.main()
