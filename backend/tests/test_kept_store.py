"""Kept answers that outlive the process (services/kept_store.py): the codec,
the store's rows, what a `KeptAnswers` does with an answer another process
built, and «Hisobotlar» reading and keeping its months through both.

The store is dialect-neutral, so everything here runs on a throwaway SQLite
file wherever the suite runs; with `SAFIA_TEST_PG` set the store's own cases
run on Postgres too — the database production keeps the rows in.
"""
import json
import shutil
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

from app.models import KeptAnswerRow
from app.services import kept_store
from app.services.kept_answer import KeptAnswers

KEY = (1, "2026-10", "2026-10-31", None, None, (), None, None, True)
OTHER = (1, "2026-09", "2026-09-30", None, None, (), None, None, True)

# The shape of one «Hisobotlar» month: unit ids as keys, a tuple key, None
# beside zero, an ordered category map.
PART = {
    "ym": "2026-10",
    "eff": {3: {"v": [101.5], "days": [22]}, 17: {"v": [None], "days": [0]}},
    "idle": {"2026-10": {"by_cat": {"Cat D3": 12.0, "Cat A": 3.25}, "flagged": None}},
    "pairs": {(3, "2026-10-01"): (1.5, 2, None)},
    "rows": [1, 2.0, "x", None, True],
    "day": date(2026, 10, 31),
    "at": datetime(2026, 10, 31, 23, 59, 58, tzinfo=timezone.utc),
    "sum": Decimal("12.50"),
    "ids": {1, 2},
    "names": frozenset({"a"}),
    "looks_tagged": {"~#t": [1, 2]},
    "flag": True,
    "none": None,
    "empty": {},
}


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _until(cond, timeout: float = 5.0) -> None:
    end = time.monotonic() + timeout
    while not cond():
        if time.monotonic() > end:
            raise AssertionError("timed out waiting")
        time.sleep(0.01)


def _idle(kept: KeptAnswers) -> None:
    """Wait until no build is running behind a reader."""
    _until(lambda: not kept._refreshing)


class _Db:
    """What `lookup` asks of a request's session when the build needs none."""

    def __init__(self):
        self.info = {}

    def rollback(self):
        pass


class _Build:
    def __init__(self, value, gate=None, fail=False):
        self.value, self.gate, self.fail, self.calls = value, gate, fail, 0

    def __call__(self, _session):
        self.calls += 1
        if self.gate is not None:
            self.gate.wait(5)
        if self.fail:
            raise RuntimeError("the build failed")
        return self.value


class _SqliteFile:
    """A throwaway SQLite FILE (a connection per session, like production's
    pool) holding only `kept_answers`."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="safia-kept-")
        self.engine = create_engine(f"sqlite:///{self.dir}/kept.db", connect_args={"timeout": 10})
        KeptAnswerRow.__table__.create(self.engine)
        self.Session = sessionmaker(bind=self.engine, autocommit=False, autoflush=False)

    def tearDown(self):
        self.engine.dispose()
        shutil.rmtree(self.dir, ignore_errors=True)


# ── the codec ───────────────────────────────────────────────────────────────
class Codec(unittest.TestCase):
    def test_a_months_part_comes_back_exactly(self):
        back = kept_store.decode(kept_store.encode(PART))
        self.assertEqual(back, PART)
        # …with the TYPES JSON alone would have changed.
        self.assertEqual({type(k) for k in back["eff"]}, {int})
        self.assertIsInstance(back["pairs"][(3, "2026-10-01")], tuple)
        self.assertIsInstance(back["rows"], list)
        self.assertIs(back["rows"][4], True)
        self.assertIsInstance(back["rows"][1], float)
        self.assertIsInstance(back["day"], date)
        self.assertNotIsInstance(back["day"], datetime)
        self.assertEqual(back["at"].utcoffset(), timedelta(0))
        self.assertIsInstance(back["ids"], set)
        self.assertIsInstance(back["names"], frozenset)
        # …and the order a fold may read a map in.
        self.assertEqual(list(back["idle"]["2026-10"]["by_cat"]), ["Cat D3", "Cat A"])
        self.assertEqual(list(back), list(PART))

    def test_json_alone_loses_the_unit_ids(self):
        # Why there is a codec: this is the report printing «—» in every row.
        self.assertNotEqual(json.loads(json.dumps({3: 1})), {3: 1})
        self.assertEqual(kept_store.decode(kept_store.encode({3: 1})), {3: 1})

    def test_a_type_it_does_not_know_is_refused(self):
        with self.assertRaises(TypeError):
            kept_store.encode({"row": object()})


# ── the store's rows ────────────────────────────────────────────────────────
class _StoreCases:
    def _store(self, name="t", **kw):
        return kept_store.DbStore(name, session_factory=self.Session, **kw)

    def _rows(self) -> int:
        with self.engine.connect() as c:
            return c.execute(text("SELECT count(*) FROM kept_answers")).scalar()

    def test_saved_then_read(self):
        st, at = self._store(), _now() - timedelta(minutes=5)
        self.assertTrue(st.save(KEY, at, PART))
        self.assertEqual(st.load(KEY), (at, PART))
        self.assertIsNone(st.load(OTHER))
        self.assertEqual(st.counts(), {"saved": 1, "read": 1, "errors": 0})

    def test_the_later_build_wins_whatever_order_they_land_in(self):
        st, at = self._store(), _now() - timedelta(minutes=5)
        st.save(KEY, at, "new")
        st.save(KEY, at - timedelta(minutes=1), "older, landing late")
        self.assertEqual(st.load(KEY), (at, "new"))
        st.save(KEY, at + timedelta(minutes=1), "newer")
        self.assertEqual(st.load(KEY), (at + timedelta(minutes=1), "newer"))
        self.assertEqual(self._rows(), 1)

    def test_a_row_past_its_age_is_not_read_and_prune_deletes_it(self):
        st = self._store(max_age_days=1)
        st.save("old", _now() - timedelta(days=2), 1)
        st.save("young", _now() - timedelta(hours=1), 2)
        self.assertIsNone(st.load("old"))
        self.assertEqual(st.load("young")[1], 2)
        self.assertEqual(st.prune(), 1)
        self.assertEqual(self._rows(), 1)

    def test_delete_and_clear_touch_only_their_own(self):
        a, b, at = self._store("a"), self._store("b"), _now()
        a.save(1, at, "a1")
        a.save(2, at, "a2")
        b.save(1, at, "b1")
        a.delete(1)
        self.assertIsNone(a.load(1))
        self.assertEqual(a.load(2)[1], "a2")
        a.clear()
        self.assertIsNone(a.load(2))
        self.assertEqual(b.load(1)[1], "b1")

    def test_keys_that_differ_only_in_type_do_not_meet(self):
        st, at = self._store(), _now()
        for key in ((1,), ("1",), (True,), (None,)):
            st.save(key, at, repr(key))
        self.assertEqual([st.load(k)[1] for k in ((1,), ("1",), (True,), (None,))],
                         ["(1,)", "('1',)", "(True,)", "(None,)"])

    def test_an_answer_that_cannot_be_spelled_is_not_stored(self):
        st = self._store()
        with self.assertLogs("app.services.kept_store", level="ERROR"):
            self.assertFalse(st.save(KEY, _now(), {"row": object()}))
            self.assertFalse(st.save(KEY, _now(), {"v": float("nan")}))   # does not come back equal
        self.assertIsNone(st.load(KEY))
        self.assertEqual(self._rows(), 0)
        self.assertEqual(st.counts()["errors"], 2)
        # The fault names WHERE: it is read off the page, with no log at hand.
        self.assertEqual(st.counts()["last_error"], "encode: ValueError: answer['v'] is NaN")
        self.assertFalse(st.save(KEY, _now(), {"eff": {3: [1, object()]}}))
        self.assertEqual(st.counts()["last_error"],
                         "encode: ValueError: answer['eff'][3][1] is a object")

    def test_a_row_that_cannot_be_read_back_is_deleted(self):
        st = self._store()
        st.save(KEY, _now(), PART)
        with self.engine.begin() as c:
            c.execute(text("UPDATE kept_answers SET value = :v"), {"v": '{"~#zz":1}'})
        with self.assertLogs("app.services.kept_store", level="ERROR"):
            self.assertIsNone(st.load(KEY))
        self.assertEqual(self._rows(), 0)


class StoreOnSqlite(_SqliteFile, _StoreCases, unittest.TestCase):
    pass


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class StoreOnPostgres(_StoreCases, unittest.TestCase):
    def setUp(self):
        self.pg = ScratchDB()
        self.engine, self.Session = self.pg.engine, self.pg.Session

    def tearDown(self):
        self.pg.drop()


class StoreAway(unittest.TestCase):
    def test_a_database_that_is_away_is_a_miss_never_an_error(self):
        def away():
            raise RuntimeError("database away")

        st = kept_store.DbStore("away", session_factory=away)
        with self.assertLogs("app.services.kept_store", level="ERROR"):
            self.assertIsNone(st.load(KEY))
            self.assertFalse(st.save(KEY, _now(), PART))
            st.delete(KEY)
            st.clear()
            self.assertEqual(st.prune(), 0)
        self.assertEqual(st.counts()["errors"], 5)
        self.assertIn("database away", st.counts()["last_error"])
        self.assertEqual(kept_store.health()["away"]["errors"], 5)


# ── a KeptAnswers with a store ──────────────────────────────────────────────
class KeptWithAStore(_SqliteFile, unittest.TestCase):
    def setUp(self):
        super().setUp()
        self.store = kept_store.DbStore("t", session_factory=self.Session)   # to look in

    def _process(self, **kw):
        """One process's KeptAnswers over the shared rows."""
        return KeptAnswers("t", store=kept_store.DbStore("t", session_factory=self.Session), **kw)

    def test_what_one_process_built_the_next_serves_at_once_and_rebuilds_behind(self):
        a = self._process()
        self.assertEqual(a.lookup(_Db(), {}, KEY, _Build({"n": 1})), ({"n": 1}, "built"))
        self.assertFalse(a.seeded(KEY))

        b = self._process()                          # the worker after a deploy
        gate = threading.Event()
        second = _Build({"n": 2}, gate)
        self.assertEqual(b.lookup(_Db(), {}, KEY, second), ({"n": 1}, "refreshing"))
        self.assertTrue(b.seeded(KEY))
        # Still the stored answer while that build runs — and no second build.
        self.assertEqual(b.lookup(_Db(), {}, KEY, second), ({"n": 1}, "refreshing"))
        gate.set()
        _idle(b)
        self.assertFalse(b.seeded(KEY))
        self.assertEqual(b.lookup(_Db(), {}, KEY, second), ({"n": 2}, "kept"))
        self.assertEqual(second.calls, 1)

        c = self._process()                          # …and the one after that
        self.assertEqual(c.lookup(_Db(), {}, KEY, _Build({"n": 3})), ({"n": 2}, "refreshing"))
        _idle(c)

    def test_a_stored_answer_is_served_however_old_up_to_the_stores_own_age(self):
        self.store.save(KEY, _now() - timedelta(days=10), "ten days old")
        self.store.save(OTHER, _now() - timedelta(days=50), "past the store's 45")
        k = self._process(ttl=60, stale=300)         # `stale` is for answers built HERE
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build("new")), ("ten days old", "refreshing"))
        _idle(k)
        self.assertEqual(k.lookup(_Db(), {}, OTHER, _Build("fresh")), ("fresh", "built"))

    def test_a_rebuild_that_fails_leaves_the_stored_answer_being_served(self):
        self.store.save(KEY, _now() - timedelta(hours=1), "stored")
        k, bad = self._process(), _Build(None, fail=True)
        with self.assertLogs("app.services.kept_answer", level="ERROR"):
            self.assertEqual(k.lookup(_Db(), {}, KEY, bad), ("stored", "refreshing"))
            _idle(k)
        # Not tried again on every poll: once a minute.
        self.assertEqual(k.lookup(_Db(), {}, KEY, bad), ("stored", "kept"))
        self.assertEqual(bad.calls, 1)
        self.assertEqual(self.store.load(KEY)[1], "stored")

    def test_forget_empties_the_store_too(self):
        a = self._process()
        a.lookup(_Db(), {}, KEY, _Build(1))
        self.assertEqual(self.store.load(KEY)[1], 1)
        a.forget()
        self.assertIsNone(self.store.load(KEY))
        self.assertEqual(self._process().lookup(_Db(), {}, KEY, _Build(2)), (2, "built"))

    def test_a_build_running_when_forget_is_called_is_not_stored(self):
        k, gate = self._process(), threading.Event()
        slow = _Build("read before the forget", gate)
        t = threading.Thread(target=lambda: k.lookup(_Db(), {}, KEY, slow))
        t.start()
        _until(lambda: slow.calls == 1)
        time.sleep(0.02)
        k.forget()
        gate.set()
        t.join(5)
        self.assertIsNone(self.store.load(KEY))
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build("fresh")), ("fresh", "built"))

    def test_rows_from_before_a_forget_are_not_read_even_if_the_store_kept_them(self):
        class NoClear(kept_store.DbStore):
            def clear(self):                         # the database was away for the DELETE
                pass

        k = KeptAnswers("t", store=NoClear("t", session_factory=self.Session))
        k.lookup(_Db(), {}, KEY, _Build(1))
        time.sleep(0.02)
        k.forget()
        self.assertEqual(self.store.load(KEY)[1], 1)             # the row survived…
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(2)), (2, "built"))   # …and is not served
        self.assertEqual(self.store.load(KEY)[1], 2)

    def test_ensure_builds_what_is_missing_or_due_and_nothing_else(self):
        a, first = self._process(), _Build("v1")
        self.assertEqual(a.ensure(KEY, first, 3600), "built")
        self.assertEqual(a.ensure(KEY, first, 3600), "kept")
        self.assertEqual(first.calls, 1)
        self.assertEqual(a.ensure(KEY, _Build("v2"), 0), "built")             # due
        self.assertEqual(self.store.load(KEY)[1], "v2")

        # The next process: what the store holds is young enough, so nothing is
        # built — and its first READER still has it rebuilt behind them.
        b, never = self._process(), _Build("never")
        self.assertEqual(b.ensure(KEY, never, 3600), "kept")
        self.assertEqual(never.calls, 0)
        self.assertTrue(b.seeded(KEY))
        self.assertEqual(b.lookup(_Db(), {}, KEY, _Build("v3")), ("v2", "refreshing"))
        _idle(b)
        self.assertEqual(b.lookup(_Db(), {}, KEY, never), ("v3", "kept"))

    def test_drop_lets_go_of_one_answer_here_and_in_the_store(self):
        k = self._process()
        k.lookup(_Db(), {}, KEY, _Build(1))
        k.lookup(_Db(), {}, OTHER, _Build(2))
        k.drop(KEY)
        self.assertIsNone(self.store.load(KEY))
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(3)), (3, "built"))
        self.assertEqual(k.lookup(_Db(), {}, OTHER, _Build(4)), (2, "kept"))

    def test_a_store_that_is_away_is_never_in_the_way(self):
        def away():
            raise RuntimeError("database away")

        st = kept_store.DbStore("t-away", session_factory=away)
        k = KeptAnswers("t-away", store=st)
        with self.assertLogs("app.services.kept_store", level="ERROR"):
            self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(1)), (1, "built"))
            self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(2)), (1, "kept"))
            self.assertEqual(k.ensure(KEY, _Build(3), 3600), "kept")
            k.drop(KEY)
            k.forget()
            self.assertEqual(k.prune(), 0)
        self.assertGreaterEqual(st.counts()["errors"], 4)


class KeptWithoutAStore(unittest.TestCase):
    def test_it_is_as_it_was(self):
        k, b = KeptAnswers("plain", ttl=60, stale=300), _Build(1)
        self.assertEqual(k.lookup(_Db(), {}, KEY, b), (1, "built"))
        self.assertEqual(k.lookup(_Db(), {}, KEY, b), (1, "kept"))
        self.assertFalse(k.seeded(KEY))
        self.assertEqual(k.ensure(KEY, b, 3600), "kept")
        self.assertEqual(k.prune(), 0)
        k.forget()
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(2)), (2, "built"))
        self.assertEqual(b.calls, 1)

    def test_an_answer_of_this_process_past_stale_is_still_built_in_the_request(self):
        k = KeptAnswers("plain-old", ttl=0, stale=0)
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(1)), (1, "built"))
        self.assertEqual(k.lookup(_Db(), {}, KEY, _Build(2)), (2, "built"))


# ── «Hisobotlar» over both ──────────────────────────────────────────────────
class ReportMonths(_SqliteFile, unittest.TestCase):
    """`routers/reports` with its figures faked: what is tested is WHICH
    build's month a reader is handed, never a figure."""

    SCOPE = (None, None, (), None, None, True)

    def setUp(self):
        super().setUp()
        from app.routers import reports as rr
        self.rr = rr
        self.builds: list[str] = []
        self.shape = "good"
        self.behind = threading.Event()      # cleared: builds behind a reader wait
        self.behind.set()
        self._stack = []
        self._patch(rr, "_scope", lambda *_a, **_k: (
            [SimpleNamespace(id=1, name="A", shift=1, factory_id=1)], None, self.SCOPE))
        self._patch(rr.bb, "data_floor", lambda _db: date(2026, 1, 1))
        self._patch(rr, "_month_part", self._month_part)
        self._new_process()

    def tearDown(self):
        # Let a build still running behind a reader finish on the FAKED month
        # before the patches go — after them it would run the real one.
        self.behind.set()
        for kept in (self.rr._FINISHED, self.rr._RUNNING):
            try:
                _idle(kept)
            except AssertionError:
                pass
        for p in reversed(self._stack):
            p.stop()
        super().tearDown()

    def _patch(self, obj, name, value):
        p = mock.patch.object(obj, name, value)
        p.start()
        self._stack.append(p)

    def _new_process(self):
        """A worker that has just started: empty memory, the same rows."""
        rr = self.rr
        for attr, name, days in (("_FINISHED", "reports-month", 45), ("_RUNNING", "reports-running", 3)):
            self._patch(rr, attr, KeptAnswers(
                name, ttl=1800, stale=days * 86400, writer_waits=True, writers_refresh=True,
                store=kept_store.DbStore(name, session_factory=self.Session, max_age_days=days)))

    def _month_part(self, _s, _payload, mo, _factory, _shift, _mids):
        """One month's part in `_month_part`'s shape for a scope with nothing
        to report; `timings.total_ms` numbers the build."""
        if threading.current_thread() is not threading.main_thread():
            self.behind.wait(5)
        self.builds.append(mo["ym"])
        ym = mo["ym"]
        return {
            "ym": ym, "built_at": f"2026-11-13T10:00:{len(self.builds):02d}",
            "timings": {"total_ms": len(self.builds), "parts": {}},
            "plan": {ym: {}}, "eff": {} if self.shape == "good" else "not a map",
            "sload": {}, "att": {}, "vkinds": {}, "ontime": {}, "turnover": {ym: None},
            "idle": {ym: {}}, "idle_share": {ym: None}, "cost": {ym: {}},
            "qual": {}, "qual_n": {}, "xav": {}, "vfx_scope": None,
        }

    def _report(self, m=date(2026, 9, 1)):
        return self.rr._report(_Db(), {"role": "admin"}, m, None, None, [])

    def _settle(self):
        _idle(self.rr._FINISHED)
        _idle(self.rr._RUNNING)

    def test_the_first_open_builds_and_a_restart_serves_the_stored_months(self):
        out = self._report()
        self.assertEqual(self.builds, ["2026-08", "2026-09"])
        self.assertEqual(out["state"], "built")
        self.assertEqual(out["kept"]["from"], {"2026-08": "built", "2026-09": "built"})
        self.assertIn("reports-month", out["kept"]["store"])
        self.assertEqual(self.rr._FINISHED._store.counts(), {"saved": 2, "read": 0, "errors": 0})
        self.assertEqual([m["ym"] for m in out["months"]], ["2026-08", "2026-09"])

        out = self._report()                                    # the same worker
        self.assertEqual(out["state"], "kept")
        self.assertEqual(out["kept"]["from"], {"2026-08": "memory", "2026-09": "memory"})
        self.assertEqual(len(self.builds), 2)

        self._new_process()                                     # …a deploy
        out = self._report()
        # Served at once from the store — the first build's months, with one
        # build of each running behind the reader.
        self.assertEqual(out["state"], "refreshing")
        self.assertEqual(out["kept"]["from"], {"2026-08": "store", "2026-09": "store"})
        self.assertEqual({ym: t["total_ms"] for ym, t in out["timings"].items()},
                         {"2026-08": 1, "2026-09": 2})
        self._settle()
        self.assertEqual(sorted(self.builds[2:]), ["2026-08", "2026-09"])
        out = self._report()
        self.assertEqual(out["state"], "kept")
        self.assertEqual(sorted(t["total_ms"] for t in out["timings"].values()), [3, 4])

    def test_the_october_report_and_the_november_one_share_stored_october(self):
        self._report(date(2026, 10, 1))                         # Sep + Oct
        self._new_process()
        out = self._report(date(2026, 11, 1))                   # Oct + Nov
        self.assertEqual(out["kept"]["from"]["2026-10"], "store")
        self._settle()

    def test_a_stored_month_this_code_cannot_read_is_dropped_and_built(self):
        self.shape = "moved"                                    # an older release's part
        key = self.rr._part_key(
            {"ym": "2026-09", "to": date(2026, 9, 30)}, self.SCOPE)
        self.rr._FINISHED._store.save(key, _now() - timedelta(hours=3),
                                      self._month_part(None, None, {"ym": "2026-09"}, None, None, []))
        self.shape, self.builds = "good", []
        self.behind.clear()                  # the build behind the reader has not landed yet
        with self.assertLogs("app.routers.reports", level="ERROR"):
            out = self._report()
        self.assertEqual(out["kept"]["from"], {"2026-08": "built", "2026-09": "built"})
        self.assertEqual(out["state"], "built")
        self.assertTrue(out["sections"])
        self.behind.set()
        self._settle()
        # …and the row is this code's now.
        self.assertEqual(self.rr._FINISHED._store.load(key)[1]["eff"], {})

    def test_a_fault_with_no_stored_month_in_it_is_still_a_fault(self):
        self.shape = "moved"
        with self.assertRaises(Exception):
            self._report()

    def test_the_format_rides_the_key(self):
        mo = {"ym": "2026-09", "to": date(2026, 9, 30)}
        with mock.patch.object(self.rr, "FORMAT", self.rr.FORMAT + 1):
            later = self.rr._part_key(mo, self.SCOPE)
        self.assertNotEqual(self.rr._part_key(mo, self.SCOPE), later)

    # ── the clock ───────────────────────────────────────────────────────────
    @contextmanager
    def _at(self, when: datetime):
        with mock.patch.object(self.rr.turnover, "now_aware", lambda: when):
            yield

    def test_keep_fresh_builds_three_months_once_and_a_restart_builds_none(self):
        noon = datetime(2026, 11, 13, 12, 10, tzinfo=timezone(timedelta(hours=5)))
        with self._at(noon):
            self.assertEqual(self.rr.keep_fresh("test"),
                             {"2026-09": "built", "2026-10": "built", "2026-11": "built"})
            self.assertEqual(self.rr.keep_fresh("test"),
                             {"2026-09": "kept", "2026-10": "kept", "2026-11": "kept"})
            self.assertEqual(self.builds, ["2026-09", "2026-10", "2026-11"])

            # Both reports a reader opens are ready, with nothing built for them.
            self.assertEqual(self._report(date(2026, 11, 1))["state"], "kept")
            self.assertEqual(self._report(date(2026, 10, 1))["state"], "kept")
            self.assertEqual(len(self.builds), 3)

            self._new_process()                                 # a deploy: nothing is rebuilt
            self.assertEqual(self.rr.keep_fresh("boot"),
                             {"2026-09": "kept", "2026-10": "kept", "2026-11": "kept"})
            self.assertEqual(len(self.builds), 3)
            out = self._report(date(2026, 10, 1))
            self.assertEqual(out["state"], "refreshing")
            self.assertEqual(out["kept"]["from"], {"2026-09": "store", "2026-10": "store"})
            self._settle()

    def test_keep_fresh_builds_the_running_month_hourly_and_finished_ones_at_night(self):
        tz = timezone(timedelta(hours=5))
        with self._at(datetime(2026, 11, 13, 12, 10, tzinfo=tz)):
            self.rr.keep_fresh("test")
        self.builds = []

        def age(kept, by: timedelta):
            """Make every answer `kept` holds look `by` older."""
            with kept._lock:
                for k, (t, v) in list(kept._kept.items()):
                    kept._kept[k] = (t - by.total_seconds(), v)

        age(self.rr._RUNNING, timedelta(minutes=55))
        age(self.rr._FINISHED, timedelta(hours=7))
        with self._at(datetime(2026, 11, 13, 13, 10, tzinfo=tz)):       # by day
            self.assertEqual(self.rr.keep_fresh("test"),
                             {"2026-09": "kept", "2026-10": "kept", "2026-11": "built"})
        with self._at(datetime(2026, 11, 13, 2, 10, tzinfo=tz)):        # the night tick
            self.assertEqual(self.rr.keep_fresh("test"),
                             {"2026-09": "built", "2026-10": "built", "2026-11": "kept"})
        self.assertEqual(self.builds, ["2026-11", "2026-09", "2026-10"])

        age(self.rr._FINISHED, timedelta(hours=37))                     # a night was missed
        with self._at(datetime(2026, 11, 13, 15, 10, tzinfo=tz)):
            self.assertEqual(self.rr.keep_fresh("test")["2026-10"], "built")

    def test_one_month_failing_costs_that_month_only(self):
        good = self._month_part

        def flaky(s, payload, mo, *rest):
            if mo["ym"] == "2026-10":
                raise RuntimeError("October would not build")
            return good(s, payload, mo, *rest)

        self._patch(self.rr, "_month_part", flaky)
        with self._at(datetime(2026, 11, 13, 12, 10, tzinfo=timezone(timedelta(hours=5)))), \
                self.assertLogs("app.routers.reports", level="ERROR"):
            self.assertEqual(self.rr.keep_fresh("test"),
                             {"2026-09": "built", "2026-10": "failed", "2026-11": "built"})


if __name__ == "__main__":
    unittest.main()
