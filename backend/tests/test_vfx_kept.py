"""«Show old» for the «Verifix (test)» pages (2026-11-23): an answer kept in a
store is served AT ONCE by a cache that does not hold it (a restarted worker)
and read again behind the reader; what is written is always scrubbed and comes
back exactly. No database: the store here is an in-memory twin of
`kept_store.DbStore` that runs the real codec."""
import threading
import unittest
from datetime import date, datetime, timedelta
from unittest import mock

from app.services import kept_store, verifix, verifix_explore as vx, verifix_live


class FakeStore:
    def __init__(self, name="t"):
        self.name = name
        self.rows = {}
        self.saves = 0
        self.saved = threading.Event()

    def load(self, key):
        return self.rows.get(key)

    def save(self, key, built_at, value):
        text = kept_store.encode(value)
        assert kept_store.decode(text) == value, "the codec must give it back exactly"
        self.rows[key] = (built_at, value)
        self.saves += 1
        self.saved.set()
        return True

    def prune(self):
        return 0


ANSWER = {
    "rows": [{"employee_id": "7", "name": "A", "npin": "12345678901234", "salary": 9_000_000,
              "passport_number": "AA1234567", "card_number": "8600123412341234",
              "in": datetime(2026, 11, 23, 8, 1), "day": date(2026, 11, 23)}],
    "divisions": {"5": "Bo'lim"},
    "pair": ("a", 1),
}


class KeptVerifixAnswers(unittest.TestCase):
    def setUp(self):
        vx._kept_at.clear()

    def test_a_restarted_cache_serves_the_kept_answer_at_once_and_renews_it(self):
        store = FakeStore()
        built = datetime.now(verifix.TZ) - timedelta(minutes=30)
        store.rows[("k",)] = (built, {"v": 1})
        release = threading.Event()

        def load():
            release.wait(5)
            return {"v": 2}

        c = vx._Cache(store=store)
        c.begin()
        val, stamp = c.get(("k",), 600, load)
        self.assertEqual(val, {"v": 1})                       # not waiting on Verifix
        self.assertEqual(stamp, built.replace(tzinfo=None))   # its own time on the stamp
        self.assertTrue(c.renewing())                         # the page is told to ask again
        release.set()
        self.assertTrue(store.saved.wait(5))
        self.assertEqual(store.rows[("k",)][1], {"v": 2})     # the new read replaced it

    def test_a_forced_read_never_takes_the_kept_answer(self):
        store = FakeStore()
        store.rows[("k",)] = (datetime.now(verifix.TZ), {"v": 1})
        val, _ = vx._Cache(store=store).get(("k",), 0, lambda: {"v": 3})
        self.assertEqual(val, {"v": 3})

    def test_what_is_kept_is_scrubbed_and_exact(self):
        store = FakeStore()
        vx.keep(store, ("e",), datetime.now(verifix.TZ), ANSWER)
        self.assertTrue(store.saved.wait(5))
        row = store.rows[("e",)][1]["rows"][0]
        for private in ("npin", "salary", "passport_number"):
            self.assertNotIn(private, row)
        self.assertEqual(row["card_number"], "•••• 1234")
        self.assertEqual(row["in"], datetime(2026, 11, 23, 8, 1))
        self.assertEqual(store.rows[("e",)][1]["pair"], ("a", 1))
        self.assertIn("npin", ANSWER["rows"][0])                # the served answer is untouched

    def test_a_key_is_written_at_most_once_per_gap(self):
        store = FakeStore()
        vx.keep(store, ("g",), datetime.now(verifix.TZ), {"v": 1})
        self.assertTrue(store.saved.wait(5))
        vx.keep(store, ("g",), datetime.now(verifix.TZ), {"v": 2})
        self.assertEqual(store.saves, 1)
        self.assertEqual(store.rows[("g",)][1], {"v": 1})

    def _warm(self, trigger, kept_days=()):
        """`warm_timesheet` with the days it reads recorded, the store holding `kept_days`."""
        store, read = FakeStore(), []
        c = {"host": "h", "filial_id": 1}
        for day in kept_days:
            store.rows[vx._key(c, "ts", day.isoformat())] = (datetime.now(verifix.TZ), {})
        with mock.patch.object(vx, "_CACHE", vx._Cache(store=store)), \
                mock.patch.object(vx, "config", return_value=c), \
                mock.patch.object(vx, "timesheet", side_effect=lambda db, day: read.append(day)), \
                mock.patch("app.database.SessionLocal", return_value=mock.MagicMock()):
            vx.warm_timesheet(trigger)
        return read

    def test_the_warm_up_reads_yesterday_and_today(self):
        today = verifix_live.now_local().date()
        yesterday = today - timedelta(days=1)
        self.assertEqual(self._warm("schedule", kept_days=[yesterday]), [yesterday, today])
        # after a boot, a day the store already holds is not read again
        self.assertEqual(self._warm("boot", kept_days=[yesterday]), [today])


if __name__ == "__main__":
    unittest.main()
