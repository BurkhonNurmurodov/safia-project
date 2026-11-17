"""A CLOSED month's foreign objects read a frozen copy of the register
(docs/kpi.md «Yot jismlar», 2026-11-17). Scratch Postgres (`SAFIA_TEST_PG`,
see `pg_scratch`)."""
from __future__ import annotations

import unittest
from datetime import date

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG not set")
class ForeignFreeze(unittest.TestCase):
    OCT = date(2026, 10, 1)

    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def _add(self, db, day, code):
        from app.models import QualityComplaint
        db.add(QualityComplaint(date=day, ctype="foreign", fault=True, fault_code=code, source="guest"))
        db.flush()

    def _codes(self, db):
        from app.services import foreign_objects as fo
        return sorted(x["code"] or "" for x in fo.month_payload(db, self.OCT)["complaints"])

    def test_a_frozen_month_ignores_later_register_edits(self):
        from app.models import QualityComplaint
        from app.services import foreign_objects as fo
        db = self.pg.Session()
        try:
            self._add(db, "2026-10-05", "7417")
            self._add(db, "2026-10-28", "")
            self.assertEqual(self._codes(db), ["", "7417"])           # live before the close
            fo.freeze(db, self.OCT, keep=True)
            db.query(QualityComplaint).filter(QualityComplaint.fault_code == "").update({"fault_code": "2531"})
            self._add(db, "2026-10-30", "9122")
            self.assertEqual(self._codes(db), ["", "7417"])           # the copy, not the sheet
            self.assertIsNotNone(fo.month_payload(db, self.OCT)["frozen_at"])
            fo.freeze(db, self.OCT, keep=True)                       # a re-close keeps it
            self.assertEqual(self._codes(db), ["", "7417"])
            fo.freeze(db, self.OCT)                                  # the button takes it again
            self.assertEqual(self._codes(db), ["2531", "7417", "9122"])
        finally:
            db.rollback()
            db.close()


if __name__ == "__main__":
    unittest.main()
