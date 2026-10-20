"""Two copies of one live unit-day at once must leave ONE copy (2026-10-20).

`live_projection.write` deletes the unit-day's `attendance` and inserts the
copy. Two writers in flight together each delete only the rows their own
snapshot sees and both insert, so Yog'mirov Feruz's 18.10 held 130 rows for 65
people. These tests run two real transactions against a scratch Postgres
database (`SAFIA_TEST_PG`, see `pg_scratch`) and hold the first one open
while the second starts.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_live_projection_lock
"""
from __future__ import annotations

import threading
import time
import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

DAY = date(2026, 10, 18)
MID = 7
HOLD_S = 1.0          # how long the first writer sits on its open transaction


def _rows(n: int, tag: str) -> list[dict]:
    """`rows_for`'s shape: n workers, the last two a split pair."""
    out = []
    for i in range(n):
        out.append({"worker_name": f"Worker {i}", "job_title": "Укладчик", "schedule": "2",
                    "clock_in_out": f"07:5{i % 10} - 17:00 ({tag})", "hours_worked": 9.0,
                    "early_arrival_min": 2.0, "effective_hours": 8.97,
                    "verifix_code": "A1", "hc_weight": None, "split_ix": None})
    out[-2]["hc_weight"] = 0.6
    out[-1].update(worker_name=out[-2]["worker_name"], hc_weight=0.4, split_ix=n - 2)
    return out


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class ConcurrentCopies(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.models import Attendance, LiveProjection, Manager
        db = self.pg.Session()
        db.query(Attendance).delete()
        db.query(LiveProjection).delete()
        if db.get(Manager, MID) is None:
            db.add(Manager(id=MID, name="Yog'mirov Feruz", shift=2))
        db.flush()
        # The day as the close left it: an older copy of 5 rows.
        for r in _rows(5, "old"):
            db.add(Attendance(manager_id=MID, date=DAY, worker_name=r["worker_name"],
                              clock_in_out=r["clock_in_out"], hours_worked=r["hours_worked"]))
        db.add(LiveProjection(manager_id=MID, day=DAY, digest="old", rows=5, original=[],
                              roster=[], copied_at=datetime.now(timezone.utc)))
        db.commit()
        db.close()

    def _counts(self):
        from app.models import Attendance, LiveProjection
        db = self.pg.Session()
        try:
            n = db.query(Attendance).filter_by(manager_id=MID, date=DAY).count()
            lp = db.query(LiveProjection.rows).filter_by(manager_id=MID, day=DAY).scalar()
            halves = db.query(Attendance).filter(Attendance.manager_id == MID,
                                                 Attendance.date == DAY,
                                                 Attendance.split_of.isnot(None)).count()
            return n, lp, halves
        finally:
            db.close()

    def _race(self, rows_a, rows_b, force_b=False):
        """Writer A writes and holds its transaction open; writer B starts while
        it is open. Returns B's answer and how long B's write took."""
        from app.services import live_projection
        ctx = SimpleNamespace(day=DAY)
        a_wrote, b_started = threading.Event(), threading.Event()
        out: dict = {}
        errors: list = []

        def a():
            db = self.pg.Session()
            try:
                with mock.patch.object(live_projection, "rows_for", return_value=rows_a):
                    out["a"] = live_projection.write(db, MID, ctx)
                a_wrote.set()
                b_started.wait(5)
                time.sleep(HOLD_S)
                db.commit()
            except Exception as exc:  # pragma: no cover — reported below
                errors.append(exc)
                a_wrote.set()
            finally:
                db.close()

        def b():
            db = self.pg.Session()
            try:
                a_wrote.wait(5)
                b_started.set()
                t0 = time.monotonic()
                with mock.patch.object(live_projection, "rows_for", return_value=rows_b):
                    out["b"] = live_projection.write(db, MID, ctx, force=force_b)
                out["b_s"] = time.monotonic() - t0
                db.commit()
            except Exception as exc:  # pragma: no cover
                errors.append(exc)
            finally:
                db.close()

        # `rows_for` is patched per thread through the module, so the two
        # threads must not overlap their patches: A patches, writes, unpatches
        # before B starts; B's patch lives while A only sleeps.
        with mock.patch.object(live_projection, "_original", return_value=[]), \
             mock.patch.object(live_projection, "_roster", return_value=[]):
            ta = threading.Thread(target=a)
            ta.start()
            a_wrote.wait(5)
            tb = threading.Thread(target=b)
            tb.start()
            ta.join(15)
            tb.join(15)
        self.assertFalse(errors, errors)
        return out

    def test_a_close_racing_a_recopy_leaves_one_copy(self):
        """B forces (a close): it waits for A, then replaces A's copy."""
        out = self._race(_rows(6, "a"), _rows(6, "b"), force_b=True)
        self.assertEqual(out["a"], 6)
        self.assertEqual(out["b"], 6)
        self.assertGreaterEqual(out["b_s"], HOLD_S * 0.7, "B did not wait for A's commit")
        self.assertEqual(self._counts(), (6, 6, 1))

    def test_two_recopies_of_the_same_read_write_once(self):
        """B copies what A already copied: after the lock it finds A's digest."""
        rows = _rows(6, "same")
        out = self._race(rows, rows)
        self.assertEqual(out["a"], 6)
        self.assertIsNone(out["b"])
        self.assertGreaterEqual(out["b_s"], HOLD_S * 0.7, "B did not wait for A's commit")
        self.assertEqual(self._counts(), (6, 6, 1))

    def test_without_the_lock_the_race_doubles_the_copy(self):
        """The production bug, reproduced: no lock → every row twice while
        `live_projections.rows` says one copy's worth."""
        from app.services import live_projection
        with mock.patch.object(live_projection, "lock"):
            self._race(_rows(6, "a"), _rows(6, "b"))
        self.assertEqual(self._counts(), (12, 6, 2))

    def test_a_reopen_waits_for_a_running_copy(self):
        """`unproject` takes the same lock: it removes the copy A committed."""
        from app.services import live_projection
        ctx = SimpleNamespace(day=DAY)
        a_wrote = threading.Event()

        def a():
            db = self.pg.Session()
            with mock.patch.object(live_projection, "rows_for", return_value=_rows(6, "a")):
                live_projection.write(db, MID, ctx)
            a_wrote.set()
            time.sleep(HOLD_S)
            db.commit()
            db.close()

        with mock.patch.object(live_projection, "_original", return_value=[]), \
             mock.patch.object(live_projection, "_roster", return_value=[]):
            ta = threading.Thread(target=a)
            ta.start()
            a_wrote.wait(5)
            db = self.pg.Session()
            t0 = time.monotonic()
            removed = live_projection.unproject(db, MID, DAY)
            waited = time.monotonic() - t0
            db.commit()
            db.close()
            ta.join(15)
        self.assertGreaterEqual(waited, HOLD_S * 0.7)
        self.assertEqual(removed, 6)
        self.assertEqual(self._counts(), (0, None, 0))


if __name__ == "__main__":
    unittest.main()
