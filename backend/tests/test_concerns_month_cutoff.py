"""A past period counts a concern resolved only if closed by its last day
(worker_concerns._bucket, 2026-11-11)."""
import unittest
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from sqlalchemy.dialects import postgresql

from app.models import ConcernEscalation, LeaderConcern
from app.routers import worker_concerns as wc

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


def _sql(expr) -> str:
    return str(expr.compile(dialect=postgresql.dialect(),
                            compile_kwargs={"literal_binds": True}))


class BucketCutoffTest(unittest.TestCase):
    def test_running_period_is_the_plain_rule(self):
        self.assertIs(wc._bucket(wc._today()), wc.BUCKET)
        self.assertIs(wc._bucket(wc._today() + timedelta(days=20)), wc.BUCKET)

    def test_ended_period_cuts_at_its_last_day(self):
        end = wc._today() - timedelta(days=1)
        sql = _sql(wc._bucket(end))
        self.assertIn(f"<= '{end.isoformat()}'", sql)
        self.assertIn("done_at", sql)
        # closed later → still open at the period's end
        self.assertIn("IN ('done', 'doing')) THEN 'doing'", sql)



@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class EscalatedAfterTheEndTest(unittest.TestCase):
    """An escalation counts only if made by the period's end (2026-11-16):
    escalated after it, the concern was still the leader's."""
    END = date(2026, 10, 31)

    def setUp(self):
        self.pg = ScratchDB()
        self.db = self.pg.Session()

    def tearDown(self):
        self.db.close()
        self.pg.drop()

    def _concern(self, level, status="todo", moves=()):
        c = LeaderConcern(leader_name="L", concern_owner="w", worker_name="w", concern_text="x",
                          status=status, level=level, entry_date=date(2026, 10, 20))
        self.db.add(c); self.db.flush()
        for at, frm, to in moves:
            self.db.add(ConcernEscalation(concern_id=c.id, from_level=frm, to_level=to, reason="r", created_at=at))
        self.db.flush()
        return c.id

    def _bucket(self, cid):
        return self.db.execute(select(wc._bucket(self.END)).where(LeaderConcern.id == cid)).scalar()

    def test_escalated_in_the_month_is_uplifted(self):
        cid = self._concern("supervisor", moves=[(datetime(2026, 10, 30, 8, tzinfo=timezone.utc), "leader", "supervisor")])
        self.assertEqual(self._bucket(cid), "uplifted")

    def test_escalated_after_the_month_stays_the_leaders(self):
        # 1 Nov 00:30 Tashkent = 31 Oct 19:30 UTC — already November on the plant clock
        cid = self._concern("supervisor", moves=[(datetime(2026, 10, 31, 19, 30, tzinfo=timezone.utc), "leader", "supervisor")])
        self.assertEqual(self._bucket(cid), "todo")

    def test_escalated_in_the_month_then_further_after_it_is_uplifted(self):
        cid = self._concern("shift-manager", moves=[
            (datetime(2026, 10, 25, tzinfo=timezone.utc), "leader", "supervisor"),
            (datetime(2026, 11, 3, tzinfo=timezone.utc), "supervisor", "shift-manager")])
        self.assertEqual(self._bucket(cid), "uplifted")

    def test_returned_to_the_leader_after_the_month_was_uplifted_then(self):
        cid = self._concern("leader", moves=[
            (datetime(2026, 10, 25, tzinfo=timezone.utc), "leader", "supervisor"),
            (datetime(2026, 11, 3, tzinfo=timezone.utc), "supervisor", "leader")])
        self.assertEqual(self._bucket(cid), "uplifted")

    def test_never_moved_is_its_level_now(self):
        self.assertEqual(self._bucket(self._concern("leader", status="doing")), "doing")


if __name__ == "__main__":
    unittest.main()
