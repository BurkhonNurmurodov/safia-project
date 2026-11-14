"""«Brigadirlar reytingi» is KEPT (routers/leaderboard.py, 2026-11-13): one
answer per period, encoded once, served at once and rebuilt behind — and cut
to each viewer instead of built per plant and shift.

No database: the build is stubbed, the keeping is the real `KeptAnswers`, and
the store's own rows are `test_kept_store`'s business.
"""
import json
import shutil
import tempfile
import time
import unittest
from datetime import date
from types import SimpleNamespace
from unittest import mock

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import KeptAnswerRow
from app.routers import leaderboard as lb
from app.services import kept_store
from app.services.kept_answer import KeptAnswers

TODAY = date(2026, 11, 13)          # a Friday; its week starts on the 9th

# The standing pool as `leaders._standing_pool` hands it over: units 1–3, one
# leader each, and Karim — on unit 2 today, on unit 1 until 31 October.
POOL = {
    "units": {1: ("Alpha", 1), 2: ("Beta", 2), 3: ("Gamma", 1)},
    "rows": [
        ("2026-11-10", "Ali", 1, "Alpha", 1, 100.0, 0, 0, 0),
        ("2026-11-10", "Karim", 1, "Beta", 2, 80.0, 0, 0, 0),
        ("2026-10-20", "Karim", 1, "Alpha", 1, 60.0, 0, 0, 0),
        ("2026-11-11", "Vali", 1, "Gamma", 1, 50.0, 1, 0, 0),
        ("2026-11-11", "Ali", 1, "Alpha", 1, 0.0, 0, 0, 1),
    ],
    "filed": {"Ali", "Karim"},
    "roster": [
        (11, "Ali", "Alpha", 1, None, "2026-09-01", 2, None, None, None, None),
        (12, "Karim", "Beta", 2, None, "2026-09-01", 1, None, None, None,
         [("Alpha", 1, "2026-09-01", "2026-10-31"), ("Beta", 2, "2026-11-01", None)]),
        (13, "Vali", "Gamma", 1, "2026-11-12", "2026-09-01", 1, None, None, None, None),
    ],
    "cutoffs": {"Vali": "2026-11-12"},
    "cutUnits": {"Gamma": "2026-11-05"},
}
NAMES = {1: "Alpha", 2: "Beta", 3: "Gamma"}


def _pool(ids):
    """The checklist pool of a build scoped to `ids` — the old rule, per scope
    — with every leader under their own name instead of a fresh code."""
    from app.routers import leaders as lr
    plain = lambda names, _units: ({n: n for n in names if n}, {})  # noqa: E731
    with mock.patch.object(lr, "_standing_pool", return_value=POOL), \
            mock.patch.object(lr, "_pool_codes", side_effect=plain):
        return lb.checklist_pool(None, {i: NAMES[i] for i in ids}, date(2026, 9, 1), TODAY)


def _board(ids=(1, 2, 3)):
    """A board's payload over `ids`, as `_build` shapes it and JSON carries it."""
    shift = {1: 1, 2: 2, 3: 1}
    plant = {1: 10, 2: 10, 3: 20}
    pay = {
        "grain": "week", "today": "2026-11-13",
        "periods": [{"from": "2026-11-09", "to": "2026-11-13", "end": "2026-11-15", "partial": True}],
        "units": [{"id": i, "name": NAMES[i], "shift": shift[i], "factory_id": plant[i],
                   "factory": None, "profile_key": f"supervisor:{i}", "photo_ver": None} for i in ids],
        "figures": {str(i): {"eff": {"v": [90 + i], "days": [4]}, "plan": None, "att": None,
                             "xav": None, "qual": None} for i in ids},
        "checklist": _pool(ids),
        "kaizen": {"live": False},
        "built_at": "2026-11-13T11:53:11+05:00",
    }
    return json.loads(lb._encode(pay))


class Cut(unittest.TestCase):
    """The whole board cut to a viewer is the board a scoped build gave."""

    def test_a_plant_is_the_board_its_own_build_gave(self):
        for ids in ({1}, {2}, {3}, {1, 3}, {2, 3}, {1, 2, 3}):
            self.assertEqual(lb.cut(_board(), ids, None), _board(sorted(ids)), ids)

    def test_a_shift_is_the_board_its_own_build_gave(self):
        self.assertEqual(lb.cut(_board(), None, 1), _board([1, 3]))
        self.assertEqual(lb.cut(_board(), None, 2), _board([2]))
        self.assertEqual(lb.cut(_board(), {1, 2}, 2), _board([2]))

    def test_a_leader_who_moved_stays_with_the_span_inside_the_cut(self):
        got = lb.cut(_board(), {1}, None)["checklist"]
        karim = [p for p in got["roster"] if p[0] == "Karim"]
        self.assertEqual(len(karim), 1)
        self.assertEqual(karim[0][1], "")                       # his unit today is outside
        self.assertEqual(karim[0][10], [["1", 1, "2026-09-01", "2026-10-31"]])
        self.assertEqual([r[1] for r in got["rows"]], ["Ali", "Karim", "Ali"])

    def test_nothing_in_reach_is_an_empty_board_with_its_periods(self):
        got = lb.cut(_board(), set(), None)
        self.assertEqual((got["units"], got["figures"], got["checklist"]["rows"]), ([], {}, []))
        self.assertEqual(got["periods"], _board()["periods"])

    def test_the_kept_board_is_never_changed(self):
        whole = _board()
        before = json.dumps(whole, sort_keys=True)
        lb.cut(whole, {1}, 2)
        self.assertEqual(json.dumps(whole, sort_keys=True), before)


class Encoding(unittest.TestCase):
    def test_the_kept_text_is_the_bytes_fastapi_sent(self):
        out = {"grain": "week", "units": [{"id": 1, "name": "Ўринбоев \"A\" O'ktam"}],
               "rows": [("2026-11-10", "w1 p0", 1, "1", 1, 87.5, 0, 0, 0)],
               "day": date(2026, 11, 13), "none": None, "figures": {"1": {"v": [None, 96]}}}
        self.assertEqual(lb._encode(out).encode("utf-8"),
                         JSONResponse(content=jsonable_encoder(out)).body)

    def test_an_unfiltered_viewer_is_sent_the_kept_text_itself(self):
        body = lb._encode(_board())
        res = lb._answer(body, None, None, False)
        self.assertEqual(res.body, body.encode("utf-8"))
        self.assertEqual(res.media_type, "application/json")

    def test_refreshing_rides_in_front_and_changes_nothing_else(self):
        body = lb._encode(_board())
        got = json.loads(lb._answer(body, None, None, True).body)
        self.assertIs(got.pop("refreshing"), True)
        self.assertEqual(got, _board())
        cut = json.loads(lb._answer(body, [2], None, True).body)
        self.assertIs(cut.pop("refreshing"), True)
        self.assertEqual(cut, _board([2]))

    def test_a_narrower_viewer_is_sent_the_cut(self):
        body = lb._encode(_board())
        self.assertEqual(json.loads(lb._answer(body, [1, 3], None, False).body), _board([1, 3]))
        self.assertEqual(json.loads(lb._answer(body, None, 2, False).body), _board([2]))
        self.assertEqual(json.loads(lb._answer(body, [], None, False).body)["units"], [])


class _Session:
    """What a build is handed: the request's session, or a rebuild's own."""
    def rollback(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _until(cond, timeout: float = 5.0) -> None:
    end = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > end:
            raise AssertionError("timed out waiting")
        time.sleep(0.01)


class Keeping(unittest.TestCase):
    """The door: what is built, what is kept, and who is served what."""

    def setUp(self):
        self.builds = []                    # (grain, period start) of every build

        def build(db, grain, anchor, today):
            self.builds.append((grain, anchor.isoformat()))
            pay = _board()
            pay["grain"], pay["n"] = grain, len(self.builds)
            return pay

        self.reach = {}                     # factory asked for → the unit ids it resolves to
        self.kept = KeptAnswers("leaderboard-test", ttl=600, stale=3600, writers_refresh=True)
        for p in (
            mock.patch.object(lb, "_KEPT", self.kept),
            mock.patch.object(lb, "_build", side_effect=build),
            mock.patch.object(lb, "today_local", return_value=TODAY),
            mock.patch.object(lb, "scoped_manager_ids",
                              side_effect=lambda db, payload, factory, picked: self.reach.get(factory)),
            mock.patch("app.database.SessionLocal", _Session),
        ):
            p.start()
            self.addCleanup(p.stop)

    def ask(self, **q):
        q = {"grain": "week", "anchor": None, "factory": None, "shift": None, **q}
        res = lb.get_leaderboard(db=_Session(), payload={"role": "admin"}, **q)
        return json.loads(res.body)

    def idle(self):
        _until(lambda: not self.kept._refreshing)

    def test_one_build_serves_every_open_of_the_period(self):
        first = self.ask()
        self.assertEqual(self.builds, [("week", "2026-11-09")])
        self.assertNotIn("refreshing", first)
        for anchor in (None, date(2026, 11, 9), date(2026, 11, 13), date(2026, 12, 1)):
            self.assertEqual(self.ask(anchor=anchor), first)        # any day of it, never a later one
        self.assertEqual(len(self.builds), 1)

    def test_a_plant_and_a_shift_cost_no_build(self):
        self.reach = {10: [1, 2], 20: [3], 30: []}
        self.ask()
        self.assertEqual([u["id"] for u in self.ask(factory=10)["units"]], [1, 2])
        self.assertEqual([u["id"] for u in self.ask(factory=20)["units"]], [3])
        self.assertEqual([u["id"] for u in self.ask(shift=1)["units"]], [1, 3])
        self.assertEqual([u["id"] for u in self.ask(factory=10, shift=2)["units"]], [2])
        self.assertEqual(self.ask(factory=30)["units"], [])
        self.assertEqual(len(self.builds), 1)

    def test_a_narrow_viewer_first_never_narrows_what_is_kept(self):
        self.reach = {10: [1, 2]}
        self.assertEqual([u["id"] for u in self.ask(factory=10)["units"]], [1, 2])
        self.assertEqual([u["id"] for u in self.ask()["units"]], [1, 2, 3])
        self.assertEqual(len(self.builds), 1)

    def test_each_period_is_an_answer_of_its_own(self):
        self.ask()
        self.ask(anchor=date(2026, 11, 2))
        self.ask(grain="month")
        self.ask(grain="year")
        self.ask(anchor=date(2026, 11, 4))                          # the week of the 2nd again
        self.assertEqual(self.builds, [("week", "2026-11-09"), ("week", "2026-11-02"),
                                       ("month", "2026-11-01"), ("year", "2026-01-01")])

    def test_past_its_ten_minutes_it_is_served_at_once_and_rebuilt_behind(self):
        self.kept.ttl = 0
        self.assertEqual(self.ask()["n"], 1)                        # nothing kept: built in the request
        gate = mock.patch.object(lb, "_ONE_BUILD")                  # hold the rebuild at its turn
        held = gate.start()
        release = []
        held.acquire.side_effect = lambda timeout=None: (_until(lambda: release, 10), True)[1]
        try:
            got = self.ask()
            self.assertEqual(got["n"], 1)                           # the kept board, at once…
            self.assertIs(got["refreshing"], True)                  # …saying a newer one is coming
            self.assertIs(self.ask()["refreshing"], True)           # asked again meanwhile: still one build
        finally:
            release.append(1)
            self.idle()
            gate.stop()
        self.assertEqual(len(self.builds), 2)
        self.kept.ttl = 600
        after = self.ask()
        self.assertEqual(after["n"], 2)
        self.assertNotIn("refreshing", after)

    def test_a_rebuild_that_fails_leaves_the_kept_board_and_stops_the_asking(self):
        self.kept.ttl = 0
        self.ask()
        with mock.patch.object(lb, "_build", side_effect=RuntimeError("boom")), self.assertLogs(level="ERROR"):
            self.assertIs(self.ask()["refreshing"], True)
            self.idle()
            again = self.ask()                                      # under a minute since it failed
        self.assertEqual(again["n"], 1)
        self.assertNotIn("refreshing", again)

    def test_the_format_rides_the_key(self):
        self.ask()
        with mock.patch.object(lb, "FORMAT", lb.FORMAT + 1):
            self.ask()
        self.assertEqual(len(self.builds), 2)


class AcrossADeploy(unittest.TestCase):
    """A board the worker before a deploy built is served at once by the next."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="safia-board-")
        self.engine = create_engine(f"sqlite:///{self.dir}/kept.db", connect_args={"timeout": 10})
        KeptAnswerRow.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)
        self.builds = 0

        def build(db, grain, anchor, today):
            self.builds += 1
            pay = _board()
            pay["n"] = self.builds
            return pay

        for p in (
            mock.patch.object(lb, "_build", side_effect=build),
            mock.patch.object(lb, "today_local", return_value=TODAY),
            mock.patch.object(lb, "scoped_manager_ids", return_value=None),
            mock.patch("app.database.SessionLocal", _Session),
        ):
            p.start()
            self.addCleanup(p.stop)

    def tearDown(self):
        self.engine.dispose()
        shutil.rmtree(self.dir, ignore_errors=True)

    def process(self):
        """A worker's `_KEPT`, as the module makes it — on this test's rows."""
        return KeptAnswers("leaderboard", ttl=600, stale=lb._KEEP_DAYS * 86400, max_keys=12,
                           writers_refresh=True,
                           store=kept_store.DbStore("leaderboard", max_age_days=lb._KEEP_DAYS,
                                                    session_factory=self.Session))

    def ask(self, kept):
        with mock.patch.object(lb, "_KEPT", kept):
            res = lb.get_leaderboard(grain="week", anchor=None, factory=None, shift=None,
                                     db=_Session(), payload={"role": "admin"})
        return json.loads(res.body)

    def test_the_next_worker_answers_from_the_store_and_rebuilds_behind(self):
        old = self.process()
        self.assertEqual(self.ask(old)["n"], 1)
        with self.Session() as s:
            row = s.query(KeptAnswerRow).one()
            self.assertEqual((row.name, row.label), ("leaderboard", "(1, 'week', '2026-11-09')"))

        new = self.process()                                        # the deploy
        got = self.ask(new)
        self.assertEqual(got["n"], 1)                               # the stored board, no wait
        self.assertIs(got["refreshing"], True)
        _until(lambda: not new._refreshing)
        self.assertEqual(self.builds, 2)                            # …and one build behind it
        after = self.ask(new)
        self.assertEqual(after["n"], 2)
        self.assertNotIn("refreshing", after)


class WholeBoard(unittest.TestCase):
    def test_a_build_reads_every_unit_as_nobody(self):
        units = [SimpleNamespace(id=1, name="Alpha", shift=1, factory_id=10),
                 SimpleNamespace(id=2, name="Beta", shift=2, factory_id=None)]
        empty = {"rows": [], "roster": [], "cutoffs": {}, "cutUnits": {}}
        with mock.patch.object(lb.bb, "data_floor", return_value=None), \
                mock.patch.object(lb.bb, "board_units", return_value=units) as board_units, \
                mock.patch.object(lb, "build_metrics_list", return_value=[]), \
                mock.patch("app.routers.workers.headcount", return_value=[]) as headcount, \
                mock.patch.object(lb.bb, "concerns", return_value={}), \
                mock.patch.object(lb, "_quality_rows", return_value=[]), \
                mock.patch.object(lb, "checklist_pool", return_value=empty), \
                mock.patch.object(lb.identity, "photo_versions", return_value={}), \
                mock.patch.object(lb.bb, "factory_names", return_value={}):
            out = lb._build("db", "week", date(2026, 11, 9), TODAY)
        board_units.assert_called_once_with("db", None, None)       # no viewer's scope, no shift
        self.assertEqual(headcount.call_args.args[1], {"role": None})
        self.assertEqual([u["id"] for u in out["units"]], [1, 2])
        self.assertEqual(next(iter(out)), "grain")                  # `_REFRESHING` goes in front of it
        self.assertTrue(lb._encode(out).startswith('{"grain":'))


if __name__ == "__main__":
    unittest.main()
