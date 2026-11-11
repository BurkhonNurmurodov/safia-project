"""A past period counts a concern resolved only if closed by its last day
(worker_concerns._bucket, 2026-11-11)."""
import unittest
from datetime import timedelta

from sqlalchemy.dialects import postgresql

from app.routers import worker_concerns as wc


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


if __name__ == "__main__":
    unittest.main()
