"""A bulk decision re-copies only the days it MOVED (2026-10-20).

On 20.10 at 17:51 seven `POST /api/staff-live/documents/bulk` calls in 3 s
asked to approve one document: one approved it, six skipped it — and all seven
re-copied 18.10 at once, which is what doubled four units' `attendance`. Run on
a scratch Postgres database (`SAFIA_TEST_PG`, see `pg_scratch`); the
decision cores and the re-copy itself are stubbed, the door's own bookkeeping
is what is under test.

    SAFIA_TEST_PG=postgresql://me@localhost:5432/postgres \\
        ./venv/bin/python -m unittest tests.test_live_bulk_recopy
"""
from __future__ import annotations

import unittest
from datetime import date
from unittest import mock

try:
    from tests.pg_scratch import SERVER, ScratchDB
except ImportError:  # run from inside tests/
    from pg_scratch import SERVER, ScratchDB

D18, D19 = date(2026, 10, 18), date(2026, 10, 19)
ADMIN = {"role": "admin", "sub": 1, "full_name": "Abbos"}


@unittest.skipUnless(SERVER, "SAFIA_TEST_PG is not set")
class BulkRecopy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = ScratchDB()

    @classmethod
    def tearDownClass(cls):
        cls.pg.drop()

    def setUp(self):
        from app.models import LiveDocument
        db = self.pg.Session()
        db.query(LiveDocument).delete()
        self.approved = LiveDocument(doc_type="role_change", manager_id=7, day=D18,
                                     payload={"employees": []}, status="approved")
        self.draft = LiveDocument(doc_type="role_change", manager_id=7, day=D19,
                                  payload={"employees": []}, status="draft")
        db.add_all([self.approved, self.draft])
        db.commit()
        self.ids = {"approved": self.approved.id, "draft": self.draft.id}
        db.close()

    def _bulk(self, action, *which):
        from app.routers import staff_live

        def approve(doc, *_a, **_k):
            doc.status = "approved"

        def cancel(doc, *_a, **_k):
            doc.status = "draft"

        def reject(doc, *_a, **_k):
            doc.status = "rejected"

        db = self.pg.Session()
        try:
            with mock.patch.multiple(
                    staff_live, _approve=approve, _cancel=cancel, _reject=reject,
                    _can_approve=lambda *a: True, _may_reject=lambda *a: True,
                    _dependents=lambda *a: [], _notify_doc=mock.DEFAULT,
                    _tell_rejected=mock.DEFAULT, _retire=mock.DEFAULT, _forget=mock.DEFAULT,
                    _recopy=mock.DEFAULT) as m:
                out = staff_live.bulk_documents(
                    staff_live.DocBulkBody(ids=[self.ids[w] for w in which], action=action),
                    db=db, caller=ADMIN)
            return out, [c.args[1] for c in m["_recopy"].call_args_list]
        finally:
            db.close()

    def test_a_fully_skipped_call_recopies_nothing(self):
        out, days = self._bulk("approve", "approved")
        self.assertEqual(out["affected"], 0)
        self.assertEqual(days, [])

    def test_only_the_approved_documents_day_is_recopied(self):
        out, days = self._bulk("approve", "approved", "draft")
        self.assertEqual(out["affected"], 1)
        self.assertEqual(days, [D19])

    def test_a_rejection_moves_no_copy(self):
        self.assertEqual(self._bulk("reject", "draft")[1], [])
        self.assertEqual(self._bulk("delete", "draft")[1], [], "a draft's delete is its rejection")

    def test_unposting_and_deleting_an_approved_document_recopy_its_day(self):
        self.assertEqual(self._bulk("cancel", "approved", "draft")[1], [D18])
        self.setUp()
        self.assertEqual(self._bulk("delete", "approved")[1], [D18])


if __name__ == "__main__":
    unittest.main()
